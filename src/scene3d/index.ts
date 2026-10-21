// ============================================================================
// Ledgerworks 3D campus (Three.js). Built as its own file (dist/scene3d.js)
// and loaded on demand, so the first paint of the game stays fast.
//
//   mount(el, { onPick }) -> { update(snapshot), dispose() }
//
// Look: stylized low-poly, ACES tone mapping, soft PCF shadows, contact
// shadows under buildings (cheap "ambient occlusion" feel), sky gradient
// with a moving sun and moon, stars at night, bloom on lit windows and
// street lamps, fog for depth. Terrain with grass, trees and a pond, a ring
// road with trucks, and workers walking the sidewalks.
//
// Each building type has its own model; levels add floors, rooftop units,
// antennas and solar panels. Busy factories puff particle smoke or steam.
// Click a plot to select it (outline highlight); drag to orbit, wheel or
// pinch to zoom, right-drag / two fingers to pan.
// ============================================================================
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { BLD } from '../game/data'
import { Kit, GLOW, setEnv } from './kit'
import { buildModel, plotGround, type Emitter } from './models'

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------
export interface PlotSnap { type: string; level: number; busy: boolean; building: boolean }
export interface Snapshot { plots: (PlotSnap | null)[]; slots: number; hour: number; sel: number | null }
export interface SceneHandle { update(s: Snapshot): void; dispose(): void; snapshot(): string; rotate(dir: 1 | -1): void }

const COLS = 6, ROWS = 4, TILE = 12 // plot spacing in world units
const GW = COLS * TILE, GD = ROWS * TILE
/** World position of a plot centre. */
// Row 0 (your first plots) sits nearest the camera.
const plotXZ = (i: number) => ({ x: (i % COLS) * TILE - GW / 2 + TILE / 2, z: GD / 2 - TILE / 2 - Math.floor(i / COLS) * TILE })

// --------------------------------------------------------------------------
// Small helpers

// --------------------------------------------------------------------------
// Small helpers
// --------------------------------------------------------------------------
const mats = new Map<string, THREE.MeshStandardMaterial>()
/** Shared standard material per color (stylized: rough, no metal). */
function mat(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const k = color + JSON.stringify(opts)
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...opts }))
  return mats.get(k)!
}
function mesh(geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z)
  o.castShadow = shadow; o.receiveShadow = true
  return o
}
const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z)
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z)

// --------------------------------------------------------------------------
export function mount(el: HTMLElement, opts: { onPick: (i: number) => void }): SceneHandle {
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance', preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  
  // ---- 2.5D isometric camera: orthographic, fixed classic iso angle
  // (45 degrees around, ~35.26 degrees down). Pan and zoom only; the view
  // turns in 90-degree steps with rotate() or the Q / E keys.
  const VIEW = 40 // half the visible height in world units at zoom 1
  const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 1, 2000)
  const ISO_EL = Math.atan(1 / Math.SQRT2), DIST = 320
  let az = Math.PI / 4, azGoal = az
  const placeCam = () => {
    camera.position.set(controls.target.x + Math.sin(az) * Math.cos(ISO_EL) * DIST, controls.target.y + Math.sin(ISO_EL) * DIST, controls.target.z + Math.cos(az) * Math.cos(ISO_EL) * DIST)
    camera.lookAt(controls.target)
  }
  camera.zoom = 1.6

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableRotate = false
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.minZoom = 0.7; controls.maxZoom = 5
  controls.screenSpacePanning = false // pan across the ground plane
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
  placeCam()
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return
    if (e.key === 'q' || e.key === 'Q') azGoal -= Math.PI / 2
    if (e.key === 'e' || e.key === 'E') azGoal += Math.PI / 2
  }
  addEventListener('keydown', onKey)

  // Image-based lighting: a neutral studio environment gives metals and glass real reflections.
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.background = new THREE.Color('#cfe5f2')
  scene.fog = new THREE.Fog('#cfe5f2', DIST + 90, DIST + 460) // ortho: measured from the camera plane

  // ---- Sky dome: vertical gradient whose colors follow the time of day.
  const skyU = { top: { value: new THREE.Color('#6fb4e8') }, bottom: { value: new THREE.Color('#e9f3f7') } }
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.4+0.15,0.,1.); gl_FragColor = vec4(mix(bottom, top, pow(h,0.8)),1.); }',
  }))
  scene.add(sky)
  // Stars, visible at night.
  const starGeo = new THREE.BufferGeometry()
  const sp = new Float32Array(900)
  for (let i = 0; i < 300; i++) { const t = Math.random() * Math.PI * 2, p = Math.random() * 1.2 + 0.15; sp.set([Math.cos(t) * Math.cos(p) * 500, Math.sin(p) * 500, Math.sin(t) * Math.cos(p) * 500], i * 3) }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }))
  scene.add(stars)
  // Sun and moon discs.
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 8), new THREE.MeshBasicMaterial({ color: '#fff2c4', fog: false }))
  const moonDisc = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 8), new THREE.MeshBasicMaterial({ color: '#dfe8ff', fog: false }))
  scene.add(sunDisc, moonDisc)

  // ---- Lights
  const hemi = new THREE.HemisphereLight('#dff1ff', '#7f9b62', 0.9)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4)
  sun.castShadow = true
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048)
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 300 })
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; sun.shadow.radius = 4
  scene.add(sun, sun.target)
  // The iso view never sees the horizon: the flat background color follows the sky instead.
  sky.visible = sunDisc.visible = moonDisc.visible = stars.visible = false

  // ---- Terrain: large grass plane with gentle color noise, campus pad, pond.
  const groundGeo = new THREE.PlaneGeometry(520, 520, 64, 64)
  groundGeo.rotateX(-Math.PI / 2)
  const gcol = new Float32Array(groundGeo.attributes.position.count * 3)
  const pos = groundGeo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const far = Math.hypot(x, z) > 70
    if (far) pos.setY(i, Math.sin(x * 0.05) * Math.cos(z * 0.04) * 2.2 - 0.6) // rolling hills outside
    const n = 0.5 + 0.5 * Math.sin(x * 0.11 + Math.cos(z * 0.07) * 2)
    const c = new THREE.Color('#8cc66b').lerp(new THREE.Color('#a8d27a'), n)
    gcol.set([c.r, c.g, c.b], i * 3)
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3))
  groundGeo.computeVertexNormals()
  const ground = mesh(groundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 0, -0.05, 0, false)
  scene.add(ground)
  const pond = mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshStandardMaterial({ color: '#5fb2d9', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.92 }), -GW / 2 - 34, 0.05, GD / 2 + 10, false)
  pond.rotation.x = -Math.PI / 2; scene.add(pond)
  const shore = mesh(new THREE.RingGeometry(16, 18.5, 40), mat('#e6d3a3'), pond.position.x, 0.04, pond.position.z, false)
  shore.rotation.x = -Math.PI / 2; scene.add(shore)

  // ---- Road ring + sidewalk around the campus.
  const R = { x: GW / 2 + 6, z: GD / 2 + 6 }
  const ring = (w: number, color: string, y: number) => {
    const s = new THREE.Shape()
    s.moveTo(-R.x - w, -R.z - w); s.lineTo(R.x + w, -R.z - w); s.lineTo(R.x + w, R.z + w); s.lineTo(-R.x - w, R.z + w); s.closePath()
    const hole = new THREE.Path()
    hole.moveTo(-R.x + w, -R.z + w); hole.lineTo(-R.x + w, R.z - w); hole.lineTo(R.x - w, R.z - w); hole.lineTo(R.x - w, -R.z + w); hole.closePath()
    s.holes.push(hole)
    const m = mesh(new THREE.ShapeGeometry(s), mat(color), 0, y, 0, false)
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true
    return m
  }
  scene.add(ring(5.6, '#d9d2c2', 0.02), ring(3.6, '#6f747c', 0.04))
  // Dashed center line.
  const dashes = new THREE.Group()
  const dashM = mat('#f7f3e8')
  for (let x = -R.x; x < R.x; x += 4) { dashes.add(mesh(new THREE.PlaneGeometry(2, 0.3), dashM, x, 0.06, -R.z, false), mesh(new THREE.PlaneGeometry(2, 0.3), dashM, x, 0.06, R.z, false)) }
  for (let z = -R.z; z < R.z; z += 4) { const a = mesh(new THREE.PlaneGeometry(0.3, 2), dashM, -R.x, 0.06, z, false), b = mesh(new THREE.PlaneGeometry(0.3, 2), dashM, R.x, 0.06, z, false); dashes.add(a, b) }
  dashes.children.forEach(d => (d.rotation.x = -Math.PI / 2))
  scene.add(dashes)
  // Campus lawn pad.
  scene.add(box(GW + 3, 0.4, GD + 3, mat('#9fd07a'), 0, -0.3, 0))

  // ---- Street lamps (bulbs glow at night -> bloom).
  const bulbM = new THREE.MeshStandardMaterial({ color: '#fff1c2', emissive: '#ffcf6a', emissiveIntensity: 0 })
  const poleM = mat('#5d6470')
  const lampSpots: [number, number][] = []
  for (let x = -R.x; x <= R.x; x += 18) lampSpots.push([x, -R.z - 4.6], [x, R.z + 4.6])
  for (let z = -R.z + 9; z < R.z; z += 18) lampSpots.push([-R.x - 4.6, z], [R.x + 4.6, z])
  for (const [x, z] of lampSpots) { scene.add(cyl(0.15, 0.2, 5, poleM, x, 0, z, 6)); const b = mesh(new THREE.SphereGeometry(0.55, 10, 8), bulbM, x, 5.2, z, false); scene.add(b) }

  // ---- Trees outside the campus (instanced trunks + two canopy sizes).
  const treeN = 140
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), mat('#8a6a4a'), treeN)
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 0), mat('#5fae5a', { flatShading: true }), treeN)
  trunks.castShadow = crowns.castShadow = true
  const dm = new THREE.Object3D(), tc = new THREE.Color()
  let placed = 0
  for (let k = 0; placed < treeN && k < 2000; k++) {
    const x = (Math.random() - 0.5) * 300, z = (Math.random() - 0.5) * 240
    if (Math.abs(x) < R.x + 10 && Math.abs(z) < R.z + 10) continue
    if (Math.hypot(x - pond.position.x, z - pond.position.z) < 21) continue
    const s = 0.8 + Math.random() * 0.9
    const y = Math.sin(x * 0.05) * Math.cos(z * 0.04) * 2.2 - 0.6
    dm.position.set(x, y + s, z); dm.scale.setScalar(s); dm.rotation.set(0, Math.random() * 6, 0); dm.updateMatrix(); trunks.setMatrixAt(placed, dm.matrix)
    dm.position.y = y + s * 3.2; dm.scale.set(s, s * (1.1 + Math.random() * 0.5), s); dm.updateMatrix(); crowns.setMatrixAt(placed, dm.matrix)
    crowns.setColorAt(placed, tc.set(['#5fae5a', '#73bd5f', '#4f9d55', '#86c36a'][placed % 4]))
    placed++
  }
  scene.add(trunks, crowns)

  // ---- Plot pads (clickable).
  const padGeo = new THREE.BoxGeometry(TILE - 1.4, 0.35, TILE - 1.4)
  const padFree = mat('#b7dc96'), padLocked = mat('#cfc6b4'), padSel = mat('#ffd9b8')
  const pads: THREE.Mesh[] = []
  for (let i = 0; i < COLS * ROWS; i++) {
    const { x, z } = plotXZ(i)
    const p = mesh(padGeo, padFree, x, 0.05, z, false)
    p.userData.plot = i; pads.push(p); scene.add(p)
  }

  // ---- Sidewalks, curbs, planters and lamp posts for every plot, merged into one kit.
  const gk = new Kit()
  for (let i = 0; i < COLS * ROWS; i++) { const { x, z } = plotXZ(i); plotGround(gk, x, z, TILE - 1.4, i) }
  const groundKit = gk.build(); groundKit.position.y = 0.22; scene.add(groundKit)

  /** Build one plot's model: high-detail building + contact shadow + scaffolding while building. */
  function model(p: PlotSnap, i: number) {
    const b = BLD[p.type]
    const m = buildModel(p.type, p.level, b.name, b.color, b.kind, i * 31 + 7)
    // Soft contact shadow (cheap ambient-occlusion look).
    const cs = mesh(new THREE.PlaneGeometry(9.6, 9.6), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.12, depthWrite: false }), 0, 0.12, 0, false)
    cs.rotation.x = -Math.PI / 2; m.g.add(cs)
    if (p.building) {
      // Scaffolding: tube frame with planks and a site crane hook.
      const sk = new Kit(), sm = new THREE.MeshStandardMaterial({ color: '#e3b23c', metalness: 0.4, roughness: 0.5 })
      for (const x of [-4.4, -1.5, 1.5, 4.4]) for (const z of [-3.6, 3.6]) sk.cyl(0.06, 0.06, 7, sm, x, 0, z, 6)
      for (let y = 1.6; y < 7; y += 1.8) { sk.box(8.9, 0.08, 0.08, sm, 0, y, 3.6); sk.box(8.9, 0.08, 0.08, sm, 0, y, -3.6); sk.box(8.8, 0.06, 0.6, new THREE.MeshStandardMaterial({ color: '#b48a5a' }), 0, y, 3.9) }
      m.g.add(sk.build())
    }
    m.g.traverse(o => (o.userData.plot = i))
    // Collect LOD detail groups so zooming out can hide them.
    const lod: THREE.Object3D[] = []; m.g.traverse(o => { if (o.userData.lod) lod.push(o) })
    return { ...m, lod }
  }

  // ---- Building bookkeeping: rebuild a plot only when its look changes.
  const built: ({ key: string; g: THREE.Group; emit: Emitter[]; spin?: THREE.Object3D; nod?: THREE.Object3D; swing?: THREE.Object3D; lod: THREE.Object3D[] } | null)[] = Array(COLS * ROWS).fill(null)

  // ---- Smoke / steam particles: one Points cloud shared by all emitters.
  const PN = mobile ? 160 : 360
  const pGeo = new THREE.BufferGeometry()
  const pPos = new Float32Array(PN * 3), pLife = new Float32Array(PN), pSize = new Float32Array(PN)
  const pOwn: (Emitter & { ox: number; oz: number } | null)[] = Array(PN).fill(null)
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  pGeo.setAttribute('life', new THREE.BufferAttribute(pLife, 1))
  pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1))
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { night: { value: 0 } },
    vertexShader: 'attribute float life; attribute float size; varying float vL; void main(){ vL = life; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*(300./-mv.z); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform float night; varying float vL; void main(){ float d = length(gl_PointCoord-.5); if(d>.5) discard; float a = smoothstep(.5,.1,d)*vL*.55; vec3 c = mix(vec3(.93,.93,.95), vec3(.35,.38,.48), night); gl_FragColor = vec4(c,a); }',
  })
  const particles = new THREE.Points(pGeo, pMat)
  particles.frustumCulled = false
  scene.add(particles)

  // ---- Trucks along the ring road, workers on the sidewalk.
  const loop = (t: number, inset: number) => {
    // Rectangle loop parametrised by t in [0,1).
    const W = (R.x - inset) * 2, D = (R.z - inset) * 2, P = 2 * (W + D)
    let d = ((t % 1) + 1) % 1 * P
    if (d < W) return { x: -W / 2 + d, z: -D / 2, a: 0 }
    d -= W; if (d < D) return { x: W / 2, z: -D / 2 + d, a: -Math.PI / 2 }
    d -= D; if (d < W) return { x: W / 2 - d, z: D / 2, a: Math.PI }
    d -= W; return { x: -W / 2, z: D / 2 - d, a: Math.PI / 2 }
  }
  const trucks: THREE.Group[] = []
  for (let k = 0; k < 6; k++) {
    const t = new THREE.Group()
    t.add(box(3.2, 1.8, 1.6, mat(['#fffaf0', '#f2e6c8', '#e9eef5'][k % 3]), -0.5, 0.45, 0), box(1.3, 1.4, 1.5, mat(['#e07a5f', '#5d6bd4', '#e3b23c', '#3c9a5f'][k % 4]), 1.7, 0.45, 0))
    for (const [dx, dz] of [[-1.4, 0.8], [1.6, 0.8], [-1.4, -0.8], [1.6, -0.8]]) { const w = cyl(0.4, 0.4, 0.3, mat('#2d2a32'), dx, 0, dz, 10); w.rotation.x = Math.PI / 2; w.position.y = 0.45; t.add(w) }
    t.add(mesh(new THREE.SphereGeometry(0.15, 6, 4), bulbM, 2.4, 1, 0.5, false), mesh(new THREE.SphereGeometry(0.15, 6, 4), bulbM, 2.4, 1, -0.5, false))
    scene.add(t); trucks.push(t)
  }
  const workers: THREE.Group[] = []
  for (let k = 0; k < (mobile ? 8 : 16); k++) {
    const w = new THREE.Group()
    w.add(mesh(new THREE.CapsuleGeometry(0.32, 0.7, 3, 8), mat(['#5d6bd4', '#e07a5f', '#3c9a5f', '#e3b23c', '#8a6fb5'][k % 5]), 0, 0.8, 0))
    w.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), mat('#f2c9a5'), 0, 1.65, 0))
    w.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 10), mat('#f5c94c'), 0, 1.86, 0)) // hard hat
    scene.add(w); workers.push(w)
  }

  // ---- Post-processing: render, selection outline, bloom, output.
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera)
  outline.edgeStrength = 4; outline.edgeGlow = 0.6; outline.edgeThickness = 1.5
  outline.visibleEdgeColor.set('#ff8a5c'); outline.hiddenEdgeColor.set('#7a3a20')
  composer.addPass(outline)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.6, 0.82)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  // ---- Sizing
  const resize = () => {
    const w = el.clientWidth, h = el.clientHeight || 1
    renderer.setSize(w, h, false); composer.setSize(w, h)
    camera.left = -VIEW * w / h; camera.right = VIEW * w / h; camera.top = VIEW; camera.bottom = -VIEW; camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize); ro.observe(el); resize()
  // Environment lighting is baked AFTER the first size is set: PMREM rendering
  // changes the renderer's viewport, so restore the target and size afterwards.
  setEnv(pmrem.fromScene(new RoomEnvironment(), 0.04).texture) // reflections on metal and glass only
  renderer.setRenderTarget(null); resize()

  // ---- Picking: a click that isn't a drag selects the plot under it.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  let down: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return }
    down = null
    const r = renderer.domElement.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const objs: THREE.Object3D[] = [...pads]
    for (const b of built) if (b) objs.push(b.g)
    const hit = ray.intersectObjects(objs, true).find(h => h.object.userData.plot !== undefined)
    if (hit && hit.object.userData.plot < snap.slots) opts.onPick(hit.object.userData.plot)
  }
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointerup', onUp)

  // Focus the camera on one plot (used by the screenshot tool, and handy for debugging).
  ;(globalThis as any).__lwFocus = (i: number, zoom = 3, turn = 0) => {
    const { x, z } = plotXZ(i); controls.target.set(x, 0, z); camera.zoom = zoom; camera.updateProjectionMatrix(); azGoal = az = Math.PI / 4 + turn * Math.PI / 2
  }

  // ---- State from React
  let snap: Snapshot = { plots: [], slots: 0, hour: 12, sel: null }
  function update(s: Snapshot) {
    snap = s
    for (let i = 0; i < COLS * ROWS; i++) {
      const p = s.plots[i]
      const key = p ? `${p.type}|${Math.min(p.level, 20)}|${p.building}` : ''
      if ((built[i]?.key ?? '') !== key) {
        if (built[i]) { scene.remove(built[i]!.g); built[i]!.g.traverse(o => (o as THREE.Mesh).geometry?.dispose()); built[i] = null }
        if (p) {
          const m = model(p, i), { x, z } = plotXZ(i)
          m.g.position.set(x, 0.22, z)
          // Face the nearest road edge for variety.
          m.g.rotation.y = 0 // every front faces the default iso view
          scene.add(m.g); built[i] = { key, ...m }
          // Pop-in animation
          m.g.scale.setScalar(0.01); m.g.userData.grow = 0
        }
      }
      pads[i].material = i >= s.slots ? padLocked : s.sel === i ? padSel : padFree
    }
    outline.selectedObjects = s.sel !== null && built[s.sel] ? [built[s.sel]!.g] : s.sel !== null ? [pads[s.sel]] : []
  }

  // ---- Time of day
  const C = (h: string) => new THREE.Color(h)
  /** 0 = noon … 1 = midnight darkness, plus warm dusk factor. */
  function timeOfDay(hour: number) {
    const h = ((hour % 24) + 24) % 24
    const sunAng = ((h - 6) / 12) * Math.PI // 0 at 6:00, PI at 18:00
    const elev = Math.sin(sunAng) // >0 while the sun is up
    const night = THREE.MathUtils.clamp(-elev * 2.2 + 0.15, 0, 1)
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(elev) * 3.5, 0, 1)
    return { sunAng, elev, night, dusk }
  }

  // ---- Animation loop
  const clock = new THREE.Clock()
  let pi = 0, emitAcc = 0
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime
    // Turn toward the goal angle (90-degree steps), keep the iso offset, then let controls damp pan/zoom.
    az += (azGoal - az) * Math.min(1, dt * 8); placeCam()
    controls.update()
    const showDetail = camera.zoom > 1.05 // LOD: hide tiny parts when zoomed out
    // Keep panning near the campus.
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -60, 60)
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -50, 50)

    // Sky, sun, moon, lights.
    const td = timeOfDay(snap.hour)
    const sx = Math.cos(td.sunAng) * 200, sy = Math.sin(td.sunAng) * 160, sz = -80
    sunDisc.position.set(sx, sy, sz); moonDisc.position.set(-sx, -sy, -sz)
    const up = td.elev > -0.05
    sun.position.copy(up ? sunDisc.position : moonDisc.position).multiplyScalar(0.5)
    sun.intensity = up ? 2.2 * Math.max(0.15, td.elev) + 0.3 : 0.5
    sun.color.copy(up ? C('#fff1d6').lerp(C('#ffb27a'), td.dusk) : C('#9fb4ff'))
    hemi.intensity = 0.35 + 0.6 * (1 - td.night)
    hemi.color.copy(C('#dff1ff').lerp(C('#5a6a9a'), td.night))
    skyU.top.value.copy(C('#5aa7e6').lerp(C('#0d1738'), td.night)).lerp(C('#7d6fb5'), td.dusk * 0.4)
    skyU.bottom.value.copy(C('#e9f3f7').lerp(C('#26305a'), td.night)).lerp(C('#ffb48a'), td.dusk * 0.7)
    ;(scene.fog as THREE.Fog).color.copy(skyU.bottom.value)
    ;(scene.background as THREE.Color).copy(skyU.bottom.value)
    ;(stars.material as THREE.PointsMaterial).opacity = td.night
    renderer.toneMappingExposure = 0.9 - td.night * 0.2
    bloom.strength = 0.18 + td.night * 0.9
    bulbM.emissiveIntensity = td.night * 3
    const glow = td.night * 2.2 + td.dusk * 0.4
    for (const m of GLOW) m.emissiveIntensity = glow
    pMat.uniforms.night.value = td.night

    // Building animations: pop-in, windmill blades, pumpjack nod, crane swing.
    built.forEach((b, i) => {
      if (!b) return
      if (b.g.userData.grow < 1) { b.g.userData.grow = Math.min(1, b.g.userData.grow + dt * 3); const k = b.g.userData.grow; b.g.scale.setScalar(1 - Math.pow(1 - k, 3) * 0.99 + Math.sin(k * Math.PI) * 0.06) }
      const busy = snap.plots[i]?.busy
      if (b.spin && busy) b.spin.rotation.z -= dt * 3
      if (b.swing && busy) b.swing.rotation.y = Math.sin(t * 0.6) * 0.8
      for (const o of b.lod) o.visible = showDetail
      if (b.nod && busy) b.nod.rotation.z = Math.sin(t * 2.2) * 0.22
      if (snap.sel === i) b.g.position.y = 0.22 + Math.sin(t * 4) * 0.08
      else b.g.position.y = 0.22
    })

    // Particles: spawn from busy emitters, rise and fade.
    const ems: (Emitter & { ox: number; oz: number })[] = []
    built.forEach((b, i) => { if (b && snap.plots[i]?.busy) for (const e of b.emit) { const ang = b.g.rotation.y, c = Math.cos(ang), s = Math.sin(ang); ems.push({ ...e, ox: b.g.position.x + e.x * c + e.z * s, oz: b.g.position.z - e.x * s + e.z * c }) } })
    emitAcc += dt * ems.length * 14
    while (emitAcc > 1 && ems.length) {
      emitAcc -= 1
      const e = ems[Math.floor(Math.random() * ems.length)]
      pi = (pi + 1) % PN
      pOwn[pi] = e; pLife[pi] = 1; pSize[pi] = e.steam ? 1.2 : 1.6
      pPos.set([e.ox + (Math.random() - 0.5) * 0.4, e.y + 0.22, e.oz + (Math.random() - 0.5) * 0.4], pi * 3)
    }
    for (let k = 0; k < PN; k++) {
      if (pLife[k] <= 0) continue
      pLife[k] -= dt * (pOwn[k]?.steam ? 0.9 : 0.45)
      pPos[k * 3] += dt * 0.9; pPos[k * 3 + 1] += dt * (pOwn[k]?.steam ? 1.6 : 2.4); pPos[k * 3 + 2] += dt * 0.3
      pSize[k] += dt * 1.5
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.life.needsUpdate = true; pGeo.attributes.size.needsUpdate = true

    // Traffic: more trucks when more buildings are busy.
    const busyN = snap.plots.filter(p => p?.busy).length
    trucks.forEach((tr, k) => {
      tr.visible = k < 1 + Math.min(5, Math.ceil(busyN / 2))
      const p = loop(t * 0.018 + k / 6, k % 2 ? 1 : -1)
      tr.position.set(p.x, 0.05, p.z); tr.rotation.y = p.a
    })
    workers.forEach((w, k) => {
      const dir = k % 2 ? 1 : -1
      const p = loop(dir * t * 0.006 + k / workers.length, -4.6 + (k % 2) * 0.8)
      w.position.set(p.x, Math.abs(Math.sin(t * 7 + k)) * 0.12, p.z); w.rotation.y = p.a + (dir < 0 ? Math.PI : 0)
    })

    composer.render(dt)
  })

  return {
    update,
    rotate(dir: 1 | -1) { azGoal += (dir * Math.PI) / 2 },
    snapshot: () => renderer.domElement.toDataURL('image/png'),
    dispose() {
      renderer.setAnimationLoop(null); ro.disconnect(); controls.dispose(); removeEventListener('keydown', onKey); pmrem.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.dispose(); el.removeChild(renderer.domElement)
    },
  }
}

/** True if this browser can make a WebGL2 or WebGL context. */
export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}
