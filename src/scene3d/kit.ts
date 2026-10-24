// ============================================================================
// Model kit for the isometric campus: shared PBR materials with procedural
// canvas textures, and a geometry "Kit" that collects every piece of a
// building and MERGES them into one mesh per material. A detailed building
// with hundreds of parts still costs only a handful of draw calls.
//
// Pieces can be flagged `detail` (rivets, railings, small vents, pallets...).
// Those go in a separate mesh that is hidden when the camera is zoomed out
// (a simple LOD).
//
// UVs are re-projected in model space (box mapping by face normal), so brick
// courses, concrete panels and metal seams have the same scale on every
// surface, whatever its size.
// ============================================================================
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

// --------------------------------------------------------------------------
// Procedural textures (drawn once on canvases)
// --------------------------------------------------------------------------
function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, srgb = true) {
  // BLACK-BUILDING FIX (Oct 2026): this used to hand the <canvas> straight to
  // THREE.CanvasTexture. On some Android GPUs (Chrome, GPU-accelerated 2D
  // canvas) the WebGL upload of a freshly drawn canvas comes through as all
  // black pixels, so every textured surface (façade panels, concrete, paving
  // kerbs, metal cladding) rendered solid black while untextured parts looked
  // fine. Now we:
  //   1. ask for a CPU-backed canvas (willReadFrequently), so drawing happens
  //      in main memory and never waits on the GPU, and
  //   2. copy the finished pixels out with getImageData() and upload THOSE
  //      bytes as a DataTexture. Raw bytes upload the same way on every GPU,
  //      so there is nothing left for the driver to get wrong.
  const c = document.createElement('canvas'); c.width = c.height = size
  const g = c.getContext('2d', { willReadFrequently: true })!
  draw(g, size)
  const px = g.getImageData(0, 0, size, size).data // RGBA bytes, row by row
  // CanvasTexture flipped rows on upload (flipY); DataTexture can't, so flip
  // here to keep every texture the same way up as before (e.g. the window
  // glass gradient stays light at the top).
  const bytes = new Uint8Array(px.length), row = size * 4
  for (let y = 0; y < size; y++) bytes.set(px.subarray(y * row, y * row + row), (size - 1 - y) * row)
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  // DataTexture defaults to Nearest/no mipmaps; restore the smooth, mipmapped
  // sampling CanvasTexture had so tiled surfaces don't shimmer at a distance.
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 4
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true // upload on first use
  return t
}
/** Sprinkle light/dark speckles for a subtle grain. */
function noise(g: CanvasRenderingContext2D, s: number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2)
  }
}
const TEX: Record<string, THREE.Texture> = {}
/** Solar panel: dark blue, slightly glossy (used by the flat-roof gable()). */
const SOLAR_M = new THREE.MeshStandardMaterial({ color: '#23406e', roughness: 0.35, metalness: 0.4 })
function tex(name: string): THREE.Texture {
  if (TEX[name]) return TEX[name]
  const draw: Record<string, (g: CanvasRenderingContext2D, s: number) => void> = {
    // Modern façade cladding (was running-bond brick; the 'brick' surface
    // name is kept so models don't change): large rectangular metal/composite
    // panels with thin dark seams and a faint per-panel tint.
    brick: (g, s) => {
      g.fillStyle = '#b9bcc2'; g.fillRect(0, 0, s, s)
      const rows = 4, cols = 2, ph = s / rows, pw = s / cols
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const l = 222 + Math.random() * 22
        g.fillStyle = `rgb(${l},${l},${l + 4})`
        g.fillRect(c * pw + 1.5, r * ph + 1.5, pw - 3, ph - 3)
      }
      noise(g, s, 600, 0.05)
    },
    // Cast concrete: soft blotches, panel joints and form-tie dots.
    concrete: (g, s) => {
      g.fillStyle = '#e6e4df'; g.fillRect(0, 0, s, s)
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 30, 0, 7); g.fill() }
      g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2)
      g.fillStyle = 'rgba(0,0,0,0.18)'; for (const x of [0.25, 0.75]) for (const y of [0.25, 0.75]) { g.beginPath(); g.arc(x * s, y * s, 2.5, 0, 7); g.fill() }
      noise(g, s, 2500, 0.1)
    },
    // Corrugated metal cladding: vertical ribs with highlights.
    metal: (g, s) => {
      const n = 16
      for (let i = 0; i < n; i++) {
        const gr = g.createLinearGradient(i * s / n, 0, (i + 1) * s / n, 0)
        gr.addColorStop(0, '#c9ccd1'); gr.addColorStop(0.5, '#f4f5f7'); gr.addColorStop(1, '#aeb3ba')
        g.fillStyle = gr; g.fillRect(i * s / n, 0, s / n, s)
      }
      noise(g, s, 900, 0.06)
    },
    // Flat roof membrane / gravel.
    roof: (g, s) => { g.fillStyle = '#cfcac0'; g.fillRect(0, 0, s, s); noise(g, s, 6000, 0.22) },
    // Wood planks.
    wood: (g, s) => {
      for (let i = 0; i < 6; i++) { const l = 170 + Math.random() * 40; g.fillStyle = `rgb(${l},${l * 0.72},${l * 0.48})`; g.fillRect(0, i * s / 6, s, s / 6 - 2) }
      g.strokeStyle = 'rgba(60,30,10,0.15)'; for (let i = 0; i < 40; i++) { g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.bezierCurveTo(s / 3, y + 4, s / 2, y - 4, s, y + 2); g.stroke() }
    },
    // Square sidewalk pavers.
    paver: (g, s) => {
      g.fillStyle = '#bdb6aa'; g.fillRect(0, 0, s, s)
      for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) { const l = 214 + Math.random() * 22; g.fillStyle = `rgb(${l},${l - 4},${l - 10})`; g.fillRect(x * s / 4 + 2, y * s / 4 + 2, s / 4 - 4, s / 4 - 4) }
      noise(g, s, 1500, 0.1)
    },
    // Glass: vertical sky-reflection gradient with a diagonal sheen.
    glass: (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#dcefff'); gr.addColorStop(0.55, '#7fa8c9'); gr.addColorStop(1, '#3d5f7e')
      g.fillStyle = gr; g.fillRect(0, 0, s, s)
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.moveTo(s * 0.1, s); g.lineTo(s * 0.45, 0); g.lineTo(s * 0.6, 0); g.lineTo(s * 0.25, s); g.fill()
    },
    // Lit-window interior for night glow: warm with blinds and silhouettes.
    lit: (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#fff3c9'); gr.addColorStop(1, '#ffb75e')
      g.fillStyle = gr; g.fillRect(0, 0, s, s)
      g.fillStyle = 'rgba(120,70,20,0.25)'; for (let i = 0; i < 6; i++) g.fillRect(0, i * s / 6, s, 2)
    },
    grass: (g, s) => { g.fillStyle = '#8cc46c'; g.fillRect(0, 0, s, s); for (let i = 0; i < 3000; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(60,110,40,0.25)' : 'rgba(190,230,140,0.25)'; g.fillRect(Math.random() * s, Math.random() * s, 1, 3) } },
    soil: (g, s) => { g.fillStyle = '#8a6a48'; g.fillRect(0, 0, s, s); noise(g, s, 4000, 0.25) },
    asphalt: (g, s) => { g.fillStyle = '#6a6d73'; g.fillRect(0, 0, s, s); noise(g, s, 5000, 0.18) },
  }
  TEX[name] = canvasTex(name === 'glass' || name === 'lit' ? 64 : 256, draw[name])
  return TEX[name]
}

// --------------------------------------------------------------------------
// Shared materials, cached by key. Night-glowing ones are kept in GLOW so the
// scene can raise their emissive intensity after dark.
// --------------------------------------------------------------------------
export const GLOW = new Set<THREE.MeshStandardMaterial>()
/** Reflection map for shiny materials (metal, glass). Set once by the scene. */
let ENV: THREE.Texture | null = null
const SHINY = new Set<THREE.MeshStandardMaterial>()
const shiny = (m: THREE.MeshStandardMaterial, k = 1) => { SHINY.add(m); m.envMap = ENV; m.envMapIntensity = k; return m }
export function setEnv(t: THREE.Texture | null) { ENV = t; for (const m of SHINY) { m.envMap = t; m.needsUpdate = true } }
const MATS = new Map<string, THREE.Material>()
type Surf = 'plain' | 'brick' | 'concrete' | 'metal' | 'roof' | 'wood' | 'paver' | 'grass' | 'soil' | 'asphalt'
/** World units covered by one repeat of each texture. */
const TEX_SCALE: Record<Surf, number> = { plain: 1, brick: 2.4, concrete: 3, metal: 2.5, roof: 4, wood: 1.6, paver: 2.4, grass: 4, soil: 3, asphalt: 5 }

export function M(color: string, surf: Surf = 'plain', o: { rough?: number; metal?: number; glow?: string } = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${surf}|${o.rough}|${o.metal}|${o.glow}`
  let m = MATS.get(key) as THREE.MeshStandardMaterial | undefined
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, map: surf === 'plain' ? null : tex(surf),
      roughness: o.rough ?? (surf === 'metal' ? 0.45 : 0.85), metalness: o.metal ?? (surf === 'metal' ? 0.55 : 0),
    })
    m.userData.texScale = TEX_SCALE[surf]
    if (o.glow) { m.emissive.set(o.glow); m.emissiveIntensity = 0; GLOW.add(m) }
    if (m.metalness > 0.2) shiny(m, 0.8)
    MATS.set(key, m)
  }
  return m
}
/** Window glass. `lit` panes glow warm at night (each building mixes lit and dark panes). */
export function glassM(lit: boolean) {
  const key = 'glass|' + lit
  let m = MATS.get(key) as THREE.MeshStandardMaterial | undefined
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex('glass'), roughness: 0.08, metalness: 0.6, envMapIntensity: 1.4 })
    m.userData.texScale = 0 // keep per-pane UVs, so every pane shows the whole gradient
    if (lit) { m.emissive.set('#ffc46b'); m.emissiveMap = tex('lit'); m.emissiveIntensity = 0; GLOW.add(m) }
    shiny(m, 1.2)
    MATS.set(key, m)
  }
  return m
}
/** Street-lamp and beacon bulbs. */
export const bulbM = () => M('#fff4d0', 'plain', { glow: '#ffcf6a', rough: 0.3 })

// Sign textures with readable names (cached per text).
const SIGNS = new Map<string, THREE.MeshStandardMaterial>()
export function signM(text: string, bg: string, fg = '#ffffff') {
  const key = text + bg + fg
  if (SIGNS.has(key)) return SIGNS.get(key)!
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128)
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116)
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'
  let fs = 72; g.font = `700 ${fs}px Fredoka, "Trebuchet MS", sans-serif`
  while (g.measureText(text).width > 470 && fs > 30) { fs -= 4; g.font = `700 ${fs}px Fredoka, "Trebuchet MS", sans-serif` }
  g.fillText(text, 256, 68)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0 })
  m.userData.texScale = 0
  GLOW.add(m); SIGNS.set(key, m)
  return m
}

// --------------------------------------------------------------------------
// The Kit: collect transformed geometry per material, merge at the end.
// --------------------------------------------------------------------------
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3()

export interface Place { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; detail?: boolean }

/** Box-project UVs from model-space positions so textures keep a constant world scale. */
function projectUV(geo: THREE.BufferGeometry, scale: number) {
  const p = geo.attributes.position, n = geo.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i))
    let u: number, v: number
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i) } else if (ax >= az) { u = p.getZ(i); v = p.getY(i) } else { u = p.getX(i); v = p.getY(i) }
    uv[i * 2] = u / scale; uv[i * 2 + 1] = v / scale
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private detail = new Map<THREE.Material, THREE.BufferGeometry[]>()
  /** Origin offset applied to everything added (lets helpers work in local coords). */
  ox = 0; oy = 0; oz = 0; ory = 0

  add(geo: THREE.BufferGeometry, m: THREE.Material, p: Place = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    // Local placement, then the kit's origin (with an optional Y rotation).
    tmpE.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0); tmpQ.setFromEuler(tmpE)
    tmpS.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1); tmpP.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
    g.applyMatrix4(tmpM.compose(tmpP, tmpQ, tmpS))
    if (this.ory) g.applyMatrix4(tmpM.makeRotationY(this.ory))
    g.applyMatrix4(tmpM.makeTranslation(this.ox, this.oy, this.oz))
    const sc = m.userData.texScale
    if (sc) projectUV(g, sc)
    // Keep only the attributes every piece has, so merging works.
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    const bucket = p.detail ? this.detail : this.parts
    if (!bucket.has(m)) bucket.set(m, [])
    bucket.get(m)!.push(g)
    return this
  }
  // ---- primitive helpers (y is the BOTTOM of the piece) ----
  box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, p: Place = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), m, { ...p, x, y: y + h / 2, z })
  }
  /** Box with rounded (bevelled) edges, for main building volumes. */
  rbox(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, r = 0.12, p: Place = {}) {
    return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 4, h / 4, d / 4)), m, { ...p, x, y: y + h / 2, z })
  }
  cyl(rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 16, p: Place = {}) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, { ...p, x, y: y + h / 2, z })
  }
  sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, p: Place = {}, seg = 12, half = false) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(4, seg / 2), 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI), m, { ...p, x, y, z })
  }
  /** A horizontal pipe from (x1,y,z1) to (x2,y,z2). */
  pipeH(x1: number, z1: number, x2: number, z2: number, y: number, r: number, m: THREE.Material, detail = false) {
    const len = Math.hypot(x2 - x1, z2 - z1)
    return this.add(new THREE.CylinderGeometry(r, r, len, 10), m, { x: (x1 + x2) / 2, y, z: (z1 + z2) / 2, rz: Math.PI / 2, ry: -Math.atan2(z2 - z1, x2 - x1), detail })
  }
  /**
   * Was a pitched gable roof; now a modern flat roof (thin slab with a small
   * overhang) carrying a tilted solar array. Same signature so every caller
   * keeps working; `rise` only sets how high the panels tilt.
   */
  gable(w: number, rise: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, over = 0.3) {
    this.box(w + over * 2, 0.22, d + over * 2, m, x, y, z)
    const tilt = Math.min(0.35, rise * 0.15), rows = Math.max(1, Math.floor(d / 1.4)), cols = Math.max(1, Math.floor(w / 1.3))
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      this.box(w / cols - 0.15, 0.06, d / rows - 0.25, SOLAR_M, x - w / 2 + (c + 0.5) * (w / cols), y + 0.3, z - d / 2 + (r + 0.5) * (d / rows), { rx: -tilt })
    return this
  }
  plane(w: number, h: number, m: THREE.Material, p: Place) { return this.add(new THREE.PlaneGeometry(w, h), m, p) }

  /** Merge into a Group: one mesh per material (+ a detail group for LOD). */
  build(): THREE.Group {
    const g = new THREE.Group()
    const det = new THREE.Group(); det.userData.lod = true
    for (const [bucket, into] of [[this.parts, g], [this.detail, det]] as const) {
      for (const [m, geos] of bucket) {
        const merged = mergeGeometries(geos, false)
        if (!merged) continue
        const mesh = new THREE.Mesh(merged, m)
        const transparent = (m as THREE.MeshStandardMaterial).transparent
        mesh.castShadow = !transparent; mesh.receiveShadow = true
        into.add(mesh)
        for (const x of geos) x.dispose()
      }
    }
    if (det.children.length) g.add(det)
    return g
  }
}
