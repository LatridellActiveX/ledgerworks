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
import { BLD } from '../game/data'

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------
export interface PlotSnap { type: string; level: number; busy: boolean; building: boolean }
export interface Snapshot { plots: (PlotSnap | null)[]; slots: number; hour: number; sel: number | null }
export interface SceneHandle { update(s: Snapshot): void; dispose(): void; snapshot(): string }

const COLS = 6, ROWS = 4, TILE = 12 // plot spacing in world units
const GW = COLS * TILE, GD = ROWS * TILE
/** World position of a plot centre. */
// Row 0 (your first plots) sits nearest the camera.
const plotXZ = (i: number) => ({ x: (i % COLS) * TILE - GW / 2 + TILE / 2, z: GD / 2 - TILE / 2 - Math.floor(i / COLS) * TILE })

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

/** Canvas texture of a facade: wall color with a grid of windows. */
function facadeTextures() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128)
  g.fillStyle = '#9fb6c8'
  for (let x = 0; x < 3; x++) g.fillRect(14 + x * 38, 34, 24, 48)
  g.fillStyle = '#e6e0d6'; g.fillRect(0, 118, 128, 10)
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace
  // Emissive map: only the windows glow.
  const e = document.createElement('canvas'); e.width = 128; e.height = 128
  const ge = e.getContext('2d')!
  ge.fillStyle = '#000'; ge.fillRect(0, 0, 128, 128); ge.fillStyle = '#ffd27a'
  for (let x = 0; x < 3; x++) ge.fillRect(14 + x * 38, 34, 24, 48)
  const emi = new THREE.CanvasTexture(e); emi.colorSpace = THREE.SRGBColorSpace
  for (const t of [map, emi]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4 }
  return { map, emi }
}

/** Canvas texture with a shop's name, for signage. */
function signTexture(text: string, color: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#fffaf0'; g.beginPath(); g.roundRect(2, 2, 252, 60, 14); g.fill()
  g.strokeStyle = color; g.lineWidth = 6; g.stroke()
  g.fillStyle = '#2d2a32'; g.font = '700 30px Fredoka, system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, 128, 34)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Striped awning texture. */
function stripeTexture(color: string) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8
  const g = c.getContext('2d')!
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fffaf0' : color; g.fillRect(i * 8, 0, 8, 8) }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  return t
}

// --------------------------------------------------------------------------
// The scene
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
  scene.fog = new THREE.Fog('#cfe5f2', 230, 560)
  const camera = new THREE.PerspectiveCamera(34, 1, 1, 900)
  camera.position.set(48, 50, 66)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 2, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 28; controls.maxDistance = 190
  controls.maxPolarAngle = 1.3; controls.minPolarAngle = 0.25
  controls.screenSpacePanning = false

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

  // ---- Shared textures for facades.
  const fac = facadeTextures()

  /** A building body with windowed facade (floors × window columns) and a flat roof. */
  function body(w: number, h: number, d: number, color: string, floors: number, roof = '#cfc8bb') {
    const side = (rep: number) => {
      const map = fac.map.clone(); map.repeat.set(rep, floors); map.needsUpdate = true
      const emi = fac.emi.clone(); emi.repeat.set(rep, floors); emi.needsUpdate = true
      const m = new THREE.MeshStandardMaterial({ color, map, emissive: '#ffcf6a', emissiveMap: emi, emissiveIntensity: 0, roughness: 0.8 })
      m.userData.window = true
      return m
    }
    const sx = side(Math.max(1, Math.round(d / 3.2))), sz = side(Math.max(1, Math.round(w / 3.2)))
    const r = mat(roof)
    return box(w, h, d, [sx, sx, r, r, sz, sz])
  }

  /** Little rooftop extras that appear as a building levels up. */
  function rooftop(g: THREE.Group, w: number, d: number, top: number, level: number) {
    if (level >= 3) { g.add(box(1.6, 1, 1.2, mat('#d5d9de'), -w / 4, top, d / 5), box(1.2, 0.8, 1.2, mat('#c3c8cf'), -w / 4 + 2, top, d / 5)) }
    if (level >= 6) { g.add(cyl(0.08, 0.08, 4, mat('#8d8a93'), w / 3, top, -d / 3, 4)); g.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshStandardMaterial({ color: '#ff6b5b', emissive: '#ff3b2b', emissiveIntensity: 2 }), w / 3, top + 4.1, -d / 3, false)) }
    if (level >= 9) { for (let i = 0; i < 3; i++) { const p = box(2.2, 0.15, 1.4, mat('#2f4a7a', { metalness: 0.4, roughness: 0.3 }), -w / 3 + i * 2.5, top + 0.6, -d / 4); p.rotation.x = -0.4; g.add(p) } }
  }

  /** Sawtooth factory roof made of prisms. */
  function sawtooth(g: THREE.Group, w: number, d: number, top: number, color: string) {
    const n = Math.max(2, Math.round(w / 2.6)), sw = w / n
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(sw, 0); shape.lineTo(sw, 1.8); shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false })
    for (let i = 0; i < n; i++) g.add(mesh(geo, mat(color), -w / 2 + i * sw, top, -d / 2))
  }

  type Emitter = { x: number; y: number; z: number; steam?: boolean }
  /** Build one building model. Returns the group plus smoke emitter points. */
  function model(p: PlotSnap, i: number): { g: THREE.Group; emit: Emitter[]; spin?: THREE.Object3D; nod?: THREE.Object3D } {
    const b = BLD[p.type], col = b.color, g = new THREE.Group()
    const L = Math.min(p.level, 20)
    const floors = Math.min(9, 1 + Math.floor(L / 2))
    const emit: Emitter[] = []
    let spin: THREE.Object3D | undefined, nod: THREE.Object3D | undefined
    // Contact shadow: soft dark disc on the pad.
    const cs = mesh(new THREE.CircleGeometry(5.2, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.16, depthWrite: false }), 0, 0.24, 0, false)
    cs.rotation.x = -Math.PI / 2; g.add(cs)
    switch (p.type) {
      case 'generator': {
        g.add(box(3, 2, 2.6, mat('#e8e1d4'), 3, 0.2, 2.5))
        const h = 9 + L * 0.6
        g.add(cyl(0.45, 0.9, h, mat('#f7f4ee'), 0, 0.2, 0, 12))
        const hub = new THREE.Group(); hub.position.set(0, h + 0.2, 0.9)
        hub.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), mat('#8d8a93')))
        for (let k = 0; k < 3; k++) { const bl = mesh(new THREE.BoxGeometry(0.5, 5.5, 0.12), mat(col)); bl.position.y = 2.8; const arm = new THREE.Group(); arm.rotation.z = (k * Math.PI * 2) / 3; arm.add(bl); hub.add(arm) }
        g.add(box(1, 0.9, 2, mat('#e8e1d4'), 0, h - 0.2, 0.3))
        g.add(hub); spin = hub
        break
      }
      case 'pump': {
        g.add(body(5, 3 + L * 0.3, 4, col, 1, '#7aa6c2').translateX(-2))
        const tower = new THREE.Group(); tower.position.set(3, 0, 0)
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) tower.add(cyl(0.12, 0.12, 7 + L * 0.3, mat('#7d8796'), dx * 1.1, 0.2, dz * 1.1, 5))
        tower.add(cyl(2, 2, 3, mat(col), 0, 7 + L * 0.3, 0, 20), cyl(0.2, 2.1, 1, mat('#5d8fb0'), 0, 10 + L * 0.3, 0, 20))
        g.add(tower)
        break
      }
      case 'orchard': {
        const tr = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mat('#6fbf5f', { flatShading: true }), 12)
        const tk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 5), mat('#8a6a4a'), 12)
        tr.castShadow = true
        const o = new THREE.Object3D()
        let n = 0
        for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
          const s = 0.9 + Math.min(L, 8) * 0.06
          o.position.set(-4 + c * 2.4, 0.7, -3 + r * 2.4); o.scale.set(1, 1, 1); o.updateMatrix(); tk.setMatrixAt(n, o.matrix)
          o.position.y = 1.8 * s; o.scale.setScalar(s); o.updateMatrix(); tr.setMatrixAt(n, o.matrix); n++
        }
        g.add(tk, tr)
        for (let k = 0; k < 6; k++) g.add(mesh(new THREE.SphereGeometry(0.18, 6, 4), mat('#e8574f'), -4 + (k % 4) * 2.4 + 0.5, 2.2, -3 + Math.floor(k / 2) * 2.4 + 0.6, false))
        g.add(box(2.6, 2, 2, mat('#e9c9a3'), 3.6, 0.2, 3.2))
        break
      }
      case 'barnyard': {
        const h = 4 + L * 0.4
        g.add(box(6, h, 4.4, mat('#d0604f'), -1, 0.2, 0))
        const roof = new THREE.Shape(); roof.moveTo(-3.3, 0); roof.lineTo(3.3, 0); roof.lineTo(0, 2.6); roof.closePath()
        const rf = mesh(new THREE.ExtrudeGeometry(roof, { depth: 4.8, bevelEnabled: false }), mat('#8d3b32'), -1, h + 0.2, -2.4)
        g.add(rf)
        g.add(box(1.6, 2.4, 0.1, mat('#fffaf0'), -1, 0.2, 2.25))
        g.add(cyl(1.3, 1.3, h + 3, mat('#dcd6cc'), 3.8, 0.2, -0.5, 16), mesh(new THREE.SphereGeometry(1.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#b9b2a5'), 3.8, h + 3.2, -0.5))
        for (let k = 0; k < 8; k++) g.add(box(0.15, 0.8, 0.15, mat('#fffaf0'), -4.6 + k * 1.3, 0.2, 4.4))
        break
      }
      case 'well': {
        g.add(box(3, 1, 2, mat('#8d8a93'), 3, 0.2, 2.5))
        g.add(box(0.6, 4.4, 0.6, mat('#6b6b75'), 0, 0.2, 0))
        const beam = new THREE.Group(); beam.position.set(0, 4.7, 0)
        beam.add(box(7, 0.5, 0.6, mat(col), 0, -0.25, 0), box(0.9, 1.8, 0.8, mat('#4a4a52'), -3.5, -1.6, 0))
        g.add(beam); nod = beam
        g.add(cyl(0.5, 0.5, 1.2, mat('#4a4a52'), -3.5, 0.2, 0, 10))
        break
      }
      case 'pit': {
        g.add(mesh(new THREE.CylinderGeometry(4.6, 3.2, 0.6, 18), mat('#a88d5f'), 0, 0.05, 0, false))
        for (const [dx, dz, s] of [[-3, 3, 1.2], [3.5, -3, 1], [3.6, 3.2, 0.8]] as number[][]) g.add(mesh(new THREE.ConeGeometry(s * 1.4, s * 1.6, 9), mat('#c9ae7e', { flatShading: true }), dx, s * 0.8 + 0.2, dz))
        const crane = new THREE.Group(); crane.position.set(-3.5, 0.2, -3.5)
        crane.add(box(0.5, 8, 0.5, mat('#e3b23c')), box(7, 0.4, 0.4, mat('#e3b23c'), 3, 8, 0))
        crane.add(box(0.08, 3, 0.08, mat('#555'), 5.8, 5, 0))
        g.add(crane); if (p.busy) spin = crane
        emit.push({ x: 0, y: 1, z: 0, steam: true }) // dust
        break
      }
      case 'refinery': {
        g.add(body(4, 3, 4, '#d9d2c4', 1).translateX(-3).translateZ(2.5))
        for (const [dx, dz] of [[2.5, -2.5], [-1, -3], [2.6, 1.4]]) g.add(cyl(1.6, 1.6, 3 + L * 0.2, mat(col), dx, 0.2, dz, 20), cyl(1.65, 1.65, 0.2, mat('#fff4d6'), dx, 3.2 + L * 0.2, dz, 20))
        const th = 8 + L * 0.5
        g.add(cyl(0.5, 0.6, th, mat('#9b9aa3'), -3.6, 0.2, -2.5, 10))
        emit.push({ x: -3.6, y: th + 0.4, z: -2.5 })
        break
      }
      case 'lab': {
        const h = 3 + floors * 2.6
        g.add(body(7, h, 6, '#eef3f6', floors, '#c7d5dc'))
        g.add(mesh(new THREE.SphereGeometry(2.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(col, { roughness: 0.3, metalness: 0.3 }), 0, h + 0.2, 0))
        g.add(cyl(0.07, 0.07, 3, mat('#7d8796'), 2.6, h, 2.2, 4))
        rooftop(g, 7, 6, h + 0.2, L)
        emit.push({ x: -2.4, y: h + 1, z: 2.2, steam: true })
        break
      }
      default: {
        if (b.kind === 'retail') {
          const h = 3 + floors * 2.6
          g.add(body(8, h, 6.4, col, floors))
          const aw = new THREE.MeshStandardMaterial({ map: stripeTexture(col), roughness: 0.9 })
          const a = box(8.4, 0.25, 1.6, aw, 0, 3, 3.9); a.rotation.x = 0.35; g.add(a)
          const sign = mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: signTexture(b.name, col), emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.6 }), 0, h + 1.2, 1.2, false)
          ;(sign.material as THREE.Material).userData.window = true
          g.add(sign, box(0.2, 1.4, 0.2, mat('#8d8a93'), -2.5, h + 0.2, 1.2), box(0.2, 1.4, 0.2, mat('#8d8a93'), 2.5, h + 0.2, 1.2))
          rooftop(g, 8, 6.4, h + 0.2, L)
          // Display window
          g.add(box(5, 1.6, 0.1, new THREE.MeshStandardMaterial({ color: '#cfe7ff', emissive: '#ffe2a6', emissiveIntensity: 0, roughness: 0.15, metalness: 0.2 }), 0, 0.6, 3.22))
        } else {
          // Generic factory: windowed hall, sawtooth roof, chimney, loading dock.
          const h = 2.6 + floors * 1.9
          g.add(body(8.6, h, 6.6, col, Math.max(1, floors - 1)))
          sawtooth(g, 8.6, 6.6, h + 0.2, '#c8c2b6')
          const ch = h + 5 + L * 0.3
          g.add(cyl(0.55, 0.7, ch, mat('#8d8a93'), 3, 0.2, -2.2, 12), cyl(0.62, 0.62, 0.5, mat('#d0584a'), 3, ch - 0.4, -2.2, 12))
          emit.push({ x: 3, y: ch + 0.5, z: -2.2 })
          g.add(box(3, 1.2, 1.6, mat('#d9d2c4'), -2.4, 0.2, 4.1))
          g.add(box(2.4, 2.2, 0.1, mat('#6f6a75'), -2.4, 0.2, 3.32))
          rooftop(g, 8.6, 6.6, h + 2, L)
        }
      }
    }
    // Scaffolding while under construction.
    if (p.building) {
      const sc = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(9, 8, 7)), new THREE.LineBasicMaterial({ color: '#e3b23c' }))
      sc.position.y = 4.2; g.add(sc)
      g.add(box(1, 1, 1, mat('#e3b23c'), 4.5, 0.2, 4))
    }
    g.traverse(o => (o.userData.plot = i))
    return { g, emit, spin, nod }
  }

  // ---- Building bookkeeping: rebuild a plot only when its look changes.
  const built: ({ key: string; g: THREE.Group; emit: Emitter[]; spin?: THREE.Object3D; nod?: THREE.Object3D } | null)[] = Array(COLS * ROWS).fill(null)

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
    camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize); ro.observe(el); resize()

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

  // ---- State from React
  let snap: Snapshot = { plots: [], slots: 0, hour: 12, sel: null }
  function update(s: Snapshot) {
    snap = s
    for (let i = 0; i < COLS * ROWS; i++) {
      const p = s.plots[i]
      const key = p ? `${p.type}|${Math.min(p.level, 20)}|${p.building}|${p.busy && p.type === 'pit'}` : ''
      if ((built[i]?.key ?? '') !== key) {
        if (built[i]) { scene.remove(built[i]!.g); built[i] = null }
        if (p) {
          const m = model(p, i), { x, z } = plotXZ(i)
          m.g.position.set(x, 0.22, z)
          // Face the nearest road edge for variety.
          m.g.rotation.y = Math.floor(i / COLS) < ROWS / 2 ? 0 : Math.PI
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
    controls.update()
    // Keep panning near the campus.
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -60, 60)
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -50, 50)

    // Sky, sun, moon, lights.
    const td = timeOfDay(snap.hour)
    const sx = Math.cos(td.sunAng) * 200, sy = Math.sin(td.sunAng) * 160, sz = -80
    sunDisc.position.set(sx, sy, sz); moonDisc.position.set(-sx, -sy, -sz)
    const up = td.elev > -0.05
    sun.position.copy(up ? sunDisc.position : moonDisc.position).multiplyScalar(0.5)
    sun.intensity = up ? 2.6 * Math.max(0.15, td.elev) + 0.3 : 0.55
    sun.color.copy(up ? C('#fff1d6').lerp(C('#ffb27a'), td.dusk) : C('#9fb4ff'))
    hemi.intensity = 0.35 + 0.65 * (1 - td.night)
    hemi.color.copy(C('#dff1ff').lerp(C('#5a6a9a'), td.night))
    skyU.top.value.copy(C('#5aa7e6').lerp(C('#0d1738'), td.night)).lerp(C('#7d6fb5'), td.dusk * 0.4)
    skyU.bottom.value.copy(C('#e9f3f7').lerp(C('#26305a'), td.night)).lerp(C('#ffb48a'), td.dusk * 0.7)
    ;(scene.fog as THREE.Fog).color.copy(skyU.bottom.value)
    ;(stars.material as THREE.PointsMaterial).opacity = td.night
    renderer.toneMappingExposure = 1.05 - td.night * 0.25
    bloom.strength = 0.18 + td.night * 0.9
    bulbM.emissiveIntensity = td.night * 3
    const glow = td.night * 2.2 + td.dusk * 0.4
    scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && !Array.isArray(m) && m.userData?.window) m.emissiveIntensity = glow })
    for (const b of built) if (b) for (const m of b.g.children) { const mm = (m as THREE.Mesh).material; if (Array.isArray(mm)) for (const x of mm) if ((x as any).userData?.window) (x as THREE.MeshStandardMaterial).emissiveIntensity = glow }
    pMat.uniforms.night.value = td.night

    // Building animations: pop-in, windmill blades, pumpjack nod, crane swing.
    built.forEach((b, i) => {
      if (!b) return
      if (b.g.userData.grow < 1) { b.g.userData.grow = Math.min(1, b.g.userData.grow + dt * 3); const k = b.g.userData.grow; b.g.scale.setScalar(1 - Math.pow(1 - k, 3) * 0.99 + Math.sin(k * Math.PI) * 0.06) }
      const busy = snap.plots[i]?.busy
      if (b.spin && busy) { if (snap.plots[i]?.type === 'pit') b.spin.rotation.y = Math.sin(t * 0.6) * 0.8; else b.spin.rotation.z -= dt * 3 }
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
    snapshot: () => renderer.domElement.toDataURL('image/png'),
    dispose() {
      renderer.setAnimationLoop(null); ro.disconnect(); controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', onDown); renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.dispose(); el.removeChild(renderer.domElement)
    },
  }
}

/** True if this browser can make a WebGL2 or WebGL context. */
export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}
