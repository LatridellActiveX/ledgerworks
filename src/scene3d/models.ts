// ============================================================================
// Very-high-detail procedural building models for the isometric campus.
//
// Every one of the 40 building types gets its own composition, built from
// architectural parts: plinths, bevelled volumes, windows with frames,
// mullions and sills, floor ledges, cornices, parapets, entrances with steps
// and canopies, roll-up doors on loading docks, HVAC units, vents, pipes,
// ladders, catwalks, banded and riveted tanks, chimneys, fences, pallets and
// signage with the building's (original) name, plus type-specific props.
//
// Levels grow the model: more floors or taller halls, an annex wing from
// level 5, and rooftop gear (HVAC at 3, antenna and water tank at 6, solar
// panels at 9, a second wing at 12).
//
// The model faces +Z (its front, with the door and sign). Its footprint stays
// inside about +-4.4 units, so it fits the plot's sidewalk ring. Everything is
// merged by the Kit into a few meshes; animated parts (windmill blades,
// pumpjack beams, crane jibs) are returned as separate small groups.
// ============================================================================
import * as THREE from 'three'
import { Kit, M, glassM, signM, bulbM } from './kit'

export type Emitter = { x: number; y: number; z: number; steam?: boolean }
export interface Built { g: THREE.Group; emit: Emitter[]; spin?: THREE.Object3D; nod?: THREE.Object3D; swing?: THREE.Object3D }

// ---- palette ----
const C = {
  trim: '#f3efe7', dark: '#3d4148', steel: '#9aa3ad', rail: '#e3b23c', red: '#c8553d', concrete: '#d8d4cc',
  roof: '#bdb7ab', wood: '#b9855a', door: '#5b6470', glassFrame: '#2f3640', white: '#f7f5f0', green: '#5fae5a',
}
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

/** Run `fn` with the kit's origin moved (and turned) to a local frame. */
function at(k: Kit, x: number, y: number, z: number, ry: number, fn: () => void) {
  const o = [k.ox, k.oy, k.oz, k.ory]
  // Compose: rotate the new offset by the current frame's rotation.
  const c = Math.cos(k.ory), s = Math.sin(k.ory)
  k.ox += x * c + z * s; k.oy += y; k.oz += -x * s + z * c; k.ory += ry
  fn()
  ;[k.ox, k.oy, k.oz, k.ory] = o
}

// --------------------------------------------------------------------------
// Facade parts. Helpers draw on the plane z=0, facing +z, x along the wall.
// --------------------------------------------------------------------------
/** One window: recessed glass, frame, cross mullions, sill. */
function windowUnit(k: Kit, x: number, y: number, w: number, h: number, lit: boolean, frame = C.glassFrame, mullions = true) {
  const fm = M(frame, 'plain', { rough: 0.5, metal: 0.3 })
  k.box(w + 0.16, h + 0.16, 0.06, fm, x, y - 0.08, 0.01)
  k.plane(w, h, glassM(lit), { x, y: y + h / 2, z: 0.05 })
  if (mullions) {
    k.box(0.05, h, 0.05, fm, x, y, 0.07)
    if (h > 0.9) k.box(w, 0.05, 0.05, fm, x, y + h * 0.62, 0.07)
  }
  k.box(w + 0.3, 0.07, 0.2, M(C.trim, 'concrete'), x, y - 0.12, 0.08) // sill
}
/** A grid of windows across a wall of width `W`, `floors` rows from y0. */
function windowGrid(k: Kit, W: number, floors: number, fh: number, y0: number, seed: number, o: { ww?: number; wh?: number; gap?: number; skipDoor?: boolean; frame?: string; band?: boolean } = {}) {
  const ww = o.ww ?? 0.9, wh = o.wh ?? fh * 0.52, gap = o.gap ?? 1.5
  const cols = Math.max(1, Math.floor((W - 0.6) / gap))
  const r = rnd(seed + 7)
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const x = -((cols - 1) * gap) / 2 + c * gap
    if (o.skipDoor && f === 0 && Math.abs(x) < 1.2) continue
    if (o.band) { k.plane(gap - 0.08, wh, glassM(r() < 0.55), { x, y: y0 + f * fh + fh * 0.28 + wh / 2, z: 0.04 }); continue }
    windowUnit(k, x, y0 + f * fh + fh * 0.28, ww, wh, r() < 0.55, o.frame)
  }
}
/** Front door with frame, glass panel, two steps and a canopy. */
function entrance(k: Kit, x: number, w = 1.5, h = 2.1, color = C.door) {
  k.box(w + 0.3, h + 0.2, 0.1, M(C.trim, 'concrete'), x, 0, 0.02)
  k.box(w, h, 0.08, M(color, 'plain', { rough: 0.5, metal: 0.2 }), x, 0, 0.06)
  k.plane(w * 0.36, h * 0.6, glassM(true), { x: x - w * 0.22, y: h * 0.55, z: 0.11 })
  k.plane(w * 0.36, h * 0.6, glassM(true), { x: x + w * 0.22, y: h * 0.55, z: 0.11 })
  k.box(0.06, 0.4, 0.06, M('#d9b45a', 'plain', { metal: 0.9, rough: 0.3 }), x - 0.1, h * 0.45, 0.14, { detail: true })
  k.box(w + 0.9, 0.16, 0.6, M(C.concrete, 'concrete'), x, -0.32, 0.38)
  k.box(w + 1.3, 0.16, 0.95, M(C.concrete, 'concrete'), x, -0.16 - 0.32 + 0.16, 0.55)
  k.box(w + 0.9, 0.08, 1.0, M(C.dark, 'metal'), x, h + 0.25, 0.5) // canopy
  for (const s of [-1, 1]) k.cyl(0.03, 0.03, 0.5, M(C.steel, 'metal'), x + s * (w / 2 + 0.3), h + 0.3, 0.95, 6, { rx: -0.9, detail: true })
}
/** Roll-up door with ribbed cladding, dock platform, bumpers and a light. */
function rollDoor(k: Kit, x: number, w = 2.2, h = 2.4, dock = true) {
  const dy = dock ? 0.9 : 0
  k.box(w + 0.3, h + 0.25, 0.08, M(C.dark, 'plain'), x, dy, 0.01)
  k.box(w, h, 0.06, M('#d6dade', 'metal'), x, dy, 0.06, { rz: Math.PI / 2 }) // rotated so ribs run horizontally
  k.box(w + 0.2, 0.12, 0.1, M(C.rail, 'plain'), x, dy + h, 0.1)
  if (dock) {
    k.box(w + 1.2, 0.9, 1.4, M(C.concrete, 'concrete'), x, 0, 0.7)
    for (const s of [-1, 1]) k.box(0.22, 0.5, 0.16, M('#26282c'), x + s * (w / 2 - 0.1), 0.25, 1.45, { detail: true })
    k.box(w * 0.9, 0.04, 0.5, M('#7c8189', 'metal'), x, 0.9, 1.55, { detail: true }) // leveller plate
  }
  k.sphere(0.12, bulbM(), x, dy + h + 0.45, 0.2, { detail: true }, 8)
}
/** Floor ledges, cornice and parapet around a block of size w x d with top at h. */
function trimBlock(k: Kit, w: number, d: number, h: number, floors: number, fh: number, y0: number, trim = C.trim) {
  const tm = M(trim, 'concrete')
  for (let f = 1; f < floors; f++) k.box(w + 0.12, 0.1, d + 0.12, tm, 0, y0 + f * fh - 0.05, 0)
  k.rbox(w + 0.36, 0.3, d + 0.36, tm, 0, h, 0, 0.06) // cornice
  // Parapet walls with a coping strip.
  const pm = M(trim, 'concrete'), t = 0.16, ph = 0.45
  k.box(w + 0.2, ph, t, pm, 0, h + 0.3, d / 2 + 0.02); k.box(w + 0.2, ph, t, pm, 0, h + 0.3, -d / 2 - 0.02)
  k.box(t, ph, d, pm, w / 2 + 0.02, h + 0.3, 0); k.box(t, ph, d, pm, -w / 2 - 0.02, h + 0.3, 0)
  k.box(w - 0.1, 0.06, d - 0.1, M(C.roof, 'roof'), 0, h + 0.3, 0) // roof membrane
}

// --------------------------------------------------------------------------
// Rooftop gear and props
// --------------------------------------------------------------------------
function hvac(k: Kit, x: number, y: number, z: number, big = false) {
  const s = big ? 1.4 : 1
  k.rbox(1.3 * s, 0.75 * s, 1.0 * s, M('#dfe3e7', 'metal'), x, y, z, 0.06)
  k.cyl(0.36 * s, 0.36 * s, 0.05, M('#3a3f46'), x, y + 0.75 * s, z, 16)
  k.cyl(0.07, 0.07, 0.06, M(C.steel, 'metal'), x, y + 0.77 * s, z, 8, { detail: true })
  for (let i = -2; i <= 2; i++) k.box(0.03, 0.5 * s, 0.1, M('#7b828c'), x + 0.66 * s, y + 0.1, z + i * 0.17 * s, { detail: true })
  k.pipeH(x - 0.65 * s, z, x - 1.2 * s, z, y + 0.3, 0.08, M(C.steel, 'metal'), true)
}
function vent(k: Kit, x: number, y: number, z: number) {
  k.cyl(0.14, 0.14, 0.6, M(C.steel, 'metal'), x, y, z, 10)
  k.cyl(0.26, 0.2, 0.12, M(C.steel, 'metal'), x, y + 0.6, z, 10)
}
function antenna(k: Kit, x: number, y: number, z: number, h = 3.2) {
  k.cyl(0.05, 0.07, h, M('#8b9097', 'metal'), x, y, z, 6)
  for (let i = 1; i <= 3; i++) k.box(0.7 - i * 0.12, 0.03, 0.03, M('#8b9097', 'metal'), x, y + h * (0.4 + i * 0.15), z, { detail: true })
  k.sphere(0.14, M('#ff5a4a', 'plain', { glow: '#ff3b2b' }), x, y + h + 0.1, z, {}, 8)
}
function waterTank(k: Kit, x: number, y: number, z: number) {
  const wm = M('#9c7a58', 'wood')
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.05, 0.05, 1.1, M(C.dark, 'metal'), x + a * 0.5, y, z + b * 0.5, 6)
  k.cyl(0.75, 0.75, 1.3, wm, x, y + 1.1, z, 18)
  for (const t of [0.2, 0.7, 1.15]) k.cyl(0.77, 0.77, 0.05, M(C.dark, 'metal'), x, y + 1.1 + t, z, 18, { detail: true })
  k.cyl(0.05, 0.8, 0.45, M('#6f5a45', 'wood'), x, y + 2.4, z, 18)
}
function solarPanel(k: Kit, x: number, y: number, z: number, w = 1.6, d = 1, tilt = 0.45) {
  const pm = new THREE.Group()
  k.box(w, 0.05, d, M('#20335e', 'plain', { rough: 0.25, metal: 0.6 }), x, y + 0.45, z, { rx: -tilt })
  k.box(w + 0.06, 0.03, d + 0.06, M('#c9ced4', 'metal'), x, y + 0.43, z, { rx: -tilt, detail: true })
  for (let i = 1; i < 4; i++) k.box(0.015, 0.06, d, M('#9fb4d9'), x - w / 2 + (i * w) / 4, y + 0.46, z, { rx: -tilt, detail: true })
  k.box(0.05, 0.45, 0.05, M(C.steel, 'metal'), x, y, z + d * 0.25, { detail: true })
  void pm
}
/** Rooftop extras by level, spread over a roof of size w x d at height y. */
function roofGear(k: Kit, w: number, d: number, y: number, L: number, seed: number) {
  const r = rnd(seed)
  if (L >= 1) { vent(k, -w / 2 + 0.7, y, d / 2 - 0.8); vent(k, w / 2 - 0.9, y, -d / 2 + 0.7) }
  if (L >= 3) { hvac(k, -w / 4, y, -d / 6, L >= 8); hvac(k, w / 5, y, d / 6) }
  if (L >= 6) { antenna(k, w / 2 - 0.6, y, d / 2 - 0.6); waterTank(k, -w / 2 + 1.2, y, -d / 2 + 1.2) }
  if (L >= 9) for (let i = 0; i < Math.min(4, Math.floor(w / 1.9)); i++) solarPanel(k, -w / 2 + 1.1 + i * 1.8, y, d / 2 - 1.4 - r() * 0.1)
  // Roof hatch + ladder stub.
  k.box(0.8, 0.35, 0.8, M('#c7c2b8', 'metal'), w / 2 - 1.2, y, -0.2)
}
/** Vertical ladder with side rails, rungs and a safety cage. */
function ladder(k: Kit, x: number, z: number, y0: number, h: number, ry = 0) {
  at(k, x, y0, z, ry, () => {
    const lm = M(C.rail, 'plain', { metal: 0.4 })
    for (const s of [-0.22, 0.22]) k.box(0.05, h, 0.05, lm, s, 0, 0.25, { detail: true })
    for (let y = 0.3; y < h; y += 0.35) k.box(0.44, 0.03, 0.03, lm, 0, y, 0.25, { detail: true })
    for (let y = 2; y < h; y += 0.8) k.box(0.6, 0.03, 0.5, M(C.rail), 0, y, 0.5, { detail: true })
  })
}
/** Railing along X from x1 to x2 at height y (posts + two rails). */
function railing(k: Kit, x1: number, x2: number, y: number, z: number, color = C.rail) {
  const m = M(color, 'plain', { metal: 0.3 })
  for (let x = x1; x <= x2 + 1e-6; x += 0.6) k.box(0.04, 0.9, 0.04, m, x, y, z, { detail: true })
  k.box(x2 - x1, 0.05, 0.05, m, (x1 + x2) / 2, y + 0.9, z, { detail: true })
  k.box(x2 - x1, 0.04, 0.04, m, (x1 + x2) / 2, y + 0.45, z, { detail: true })
}
/** Steel tank with bands, rivets, domed top, ladder and a top railing. */
function tank(k: Kit, x: number, z: number, r: number, h: number, color: string, y = 0, dome = true) {
  const tm = M(color, 'metal', { metal: 0.35, rough: 0.4 })
  k.cyl(r + 0.08, r + 0.12, 0.25, M(C.concrete, 'concrete'), x, y, z, 24) // footing
  k.cyl(r, r, h, tm, x, y + 0.25, z, 28)
  for (let b = 1; b <= Math.floor(h / 1.2); b++) {
    const yy = y + 0.25 + b * 1.2 - 0.03
    k.cyl(r + 0.03, r + 0.03, 0.07, M(C.steel, 'metal'), x, yy, z, 28)
    for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; k.box(0.05, 0.05, 0.05, M('#6b737d', 'metal'), x + Math.cos(t) * (r + 0.05), yy + 0.12, z + Math.sin(t) * (r + 0.05), { detail: true }) }
  }
  if (dome) k.sphere(r, tm, x, y + h + 0.25, z, { sy: 0.35 }, 24, true)
  else k.cyl(r + 0.05, r + 0.05, 0.12, M(C.steel, 'metal'), x, y + h + 0.25, z, 28)
  ladder(k, x + r + 0.02, z, y + 0.25, h + 0.3, Math.PI / 2)
  // Railing ring on top.
  for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; k.box(0.04, 0.6, 0.04, M(C.rail), x + Math.cos(t) * (r - 0.1), y + h + 0.3, z + Math.sin(t) * (r - 0.1), { detail: true }) }
  k.add(new THREE.TorusGeometry(r - 0.1, 0.03, 4, 24), M(C.rail), { x, y: y + h + 0.9, z, rx: Math.PI / 2, detail: true })
}
/** Chimney with bands and a striped cap. Returns its smoke emitter. */
function chimney(k: Kit, x: number, z: number, h: number, r = 0.45, _brick = false): Emitter {
  k.cyl(r * 0.8, r, h, M('#b9bcc1', 'concrete') /* modern: all stacks are concrete now */, x, 0, z, 16)
  for (let i = 1; i <= 2; i++) k.cyl(r * 0.85 + 0.03, r * 0.85 + 0.03, 0.3, M(i % 2 ? C.red : C.white), x, h - i * 0.6, z, 16)
  k.cyl(r * 0.85, r * 0.8 + 0.05, 0.2, M(C.dark, 'metal'), x, h, z, 16)
  ladder(k, x, z + r * 0.85, 0.2, h - 0.6)
  return { x, y: h + 0.3, z }
}
function pallet(k: Kit, x: number, z: number, n = 2, color = '#c8a46e', ry = 0) {
  at(k, x, 0, z, ry, () => {
    const wm = M('#b48a5a', 'wood')
    for (const s of [-0.4, 0, 0.4]) k.box(1.1, 0.12, 0.16, wm, 0, 0, s, { detail: true })
    k.box(1.2, 0.05, 1.0, wm, 0, 0.12, 0)
    for (let i = 0; i < n; i++) k.rbox(1.0, 0.45, 0.85, M(color, 'wood'), 0, 0.17 + i * 0.47, 0, 0.03)
  })
}
function fence(k: Kit, x1: number, z1: number, x2: number, z2: number, color = '#f4efe6', h = 0.8) {
  const len = Math.hypot(x2 - x1, z2 - z1), ry = -Math.atan2(z2 - z1, x2 - x1)
  at(k, (x1 + x2) / 2, 0, (z1 + z2) / 2, ry, () => {
    const m = M(color, 'wood')
    for (let x = -len / 2; x <= len / 2 + 1e-6; x += 0.7) k.box(0.09, h, 0.09, m, x, 0, 0, { detail: true })
    k.box(len, 0.07, 0.05, m, 0, h * 0.8, 0); k.box(len, 0.07, 0.05, m, 0, h * 0.4, 0)
  })
}
function chainFence(k: Kit, x1: number, z1: number, x2: number, z2: number) {
  const len = Math.hypot(x2 - x1, z2 - z1), ry = -Math.atan2(z2 - z1, x2 - x1)
  at(k, (x1 + x2) / 2, 0, (z1 + z2) / 2, ry, () => {
    for (let x = -len / 2; x <= len / 2 + 1e-6; x += 1.2) k.cyl(0.03, 0.03, 1.3, M(C.steel, 'metal'), x, 0, 0, 6, { detail: true })
    const mesh = new THREE.MeshStandardMaterial({ color: '#9aa3ad', transparent: true, opacity: 0.35, metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide })
    k.plane(len, 1.2, mesh, { y: 0.65 })
    k.cyl(0.025, 0.025, len, M(C.steel, 'metal'), 0, 1.3, 0, 6, { rz: Math.PI / 2, detail: true })
  })
}
function tree(k: Kit, x: number, z: number, s = 1, color = '#5fae5a') {
  k.cyl(0.08 * s, 0.13 * s, 1.1 * s, M('#7a5a3c', 'wood'), x, 0, z, 6)
  const lm = M(color, 'plain', { rough: 0.9 })
  k.add(new THREE.IcosahedronGeometry(0.75 * s, 1), lm, { x, y: 1.5 * s, z })
  k.add(new THREE.IcosahedronGeometry(0.55 * s, 1), M(shade(color, 1.12)), { x: x + 0.3 * s, y: 1.9 * s, z: z + 0.15 * s })
}
function bush(k: Kit, x: number, z: number, s = 0.4, color = '#4f9a4c') { k.add(new THREE.IcosahedronGeometry(s, 1), M(color, 'plain', { rough: 0.9 }), { x, y: s * 0.8, z }) }
function car(k: Kit, x: number, z: number, ry: number, color: string, van = false) {
  at(k, x, 0, z, ry, () => {
    const L = van ? 2.4 : 2.0, H = van ? 0.9 : 0.55
    k.rbox(L, H, 0.95, M(color, 'plain', { rough: 0.25, metal: 0.5 }), 0, 0.2, 0, 0.12)
    k.rbox(van ? L * 0.7 : L * 0.55, 0.45, 0.85, glassM(false), van ? 0.2 : -0.05, 0.2 + H - 0.05, 0, 0.12)
    for (const [a, b] of [[-0.65, 0.45], [0.65, 0.45], [-0.65, -0.45], [0.65, -0.45]]) k.cyl(0.2, 0.2, 0.14, M('#1f2024'), a * (L / 2), 0.2, b, 12, { rx: Math.PI / 2 })
    k.box(0.04, 0.12, 0.2, bulbM(), L / 2, 0.45, 0.32, { detail: true }); k.box(0.04, 0.12, 0.2, bulbM(), L / 2, 0.45, -0.32, { detail: true })
  })
}
/** Conveyor belt from x1 to x2 at height y along z. */
function conveyor(k: Kit, x1: number, x2: number, y: number, z: number, cargo = '#c8a46e') {
  const len = x2 - x1
  k.box(len, 0.12, 0.7, M('#2d3036'), (x1 + x2) / 2, y, z)
  for (const s of [-0.38, 0.38]) k.box(len, 0.2, 0.06, M(C.rail), (x1 + x2) / 2, y - 0.04, z + s)
  for (let x = x1 + 0.3; x < x2; x += 1.2) { k.box(0.08, y, 0.08, M(C.steel, 'metal'), x, 0, z - 0.3, { detail: true }); k.box(0.08, y, 0.08, M(C.steel, 'metal'), x, 0, z + 0.3, { detail: true }) }
  for (let x = x1 + 0.5; x < x2 - 0.3; x += 0.9) k.rbox(0.45, 0.32, 0.45, M(cargo, 'wood'), x, y + 0.12, z, 0.03)
}
/** Crop field of rows (soil + plants), size w x d. */
function field(k: Kit, x: number, z: number, w: number, d: number, color: string, kind: 'row' | 'bush' | 'tall' = 'row') {
  k.box(w, 0.1, d, M('#7d5d3e', 'soil'), x, 0, z)
  const rows = Math.max(2, Math.floor(d / 0.7))
  for (let r = 0; r < rows; r++) {
    const zz = z - d / 2 + 0.35 + r * (d - 0.7) / Math.max(1, rows - 1)
    k.box(w - 0.2, 0.08, 0.3, M('#6b4e33', 'soil'), x, 0.1, zz)
    for (let c = 0; c < Math.floor(w / 0.45); c++) {
      const xx = x - w / 2 + 0.3 + c * 0.45
      if (kind === 'tall') k.cyl(0.04, 0.06, 0.9, M('#c9b45a'), xx, 0.15, zz, 5), k.add(new THREE.ConeGeometry(0.16, 0.4, 5), M(color), { x: xx, y: 1.1, z: zz })
      else k.add(new THREE.IcosahedronGeometry(kind === 'bush' ? 0.24 : 0.17, 0), M(color, 'plain', { rough: 0.9 }), { x: xx, y: 0.3, z: zz, detail: kind === 'row' && c % 2 === 1 })
    }
  }
}
function animal(k: Kit, x: number, z: number, color: string, s = 1, ry = 0) {
  at(k, x, 0, z, ry, () => {
    k.add(new THREE.CapsuleGeometry(0.22 * s, 0.4 * s, 3, 8), M(color), { y: 0.42 * s, rz: Math.PI / 2 })
    k.sphere(0.17 * s, M(color), 0.42 * s, 0.6 * s, 0, {}, 8)
    for (const [a, b] of [[-0.18, 0.12], [0.18, 0.12], [-0.18, -0.12], [0.18, -0.12]]) k.box(0.06 * s, 0.25 * s, 0.06 * s, M('#3d332c'), a * s, 0, b * s, { detail: true })
  })
}
function shade(hex: string, f: number) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString() }
/** Wall sign with readable name, on two posts or flat on a facade. */
function sign(k: Kit, text: string, color: string, x: number, y: number, z: number, w = 3.6, ry = 0) {
  at(k, x, y, z, ry, () => {
    k.box(w + 0.15, w * 0.25 + 0.15, 0.1, M(C.dark, 'metal'), 0, 0, 0)
    k.plane(w, w * 0.25, signM(text, color), { y: (w * 0.25 + 0.15) / 2, z: 0.06 })
  })
}
/** Street lamp: pole, arm and a glowing head. */
export function lamp(k: Kit, x: number, z: number, ry = 0) {
  at(k, x, 0, z, ry, () => {
    k.cyl(0.12, 0.16, 0.3, M(C.dark, 'metal'), 0, 0, 0, 8)
    k.cyl(0.05, 0.07, 3.2, M(C.dark, 'metal'), 0, 0.3, 0, 8)
    k.box(0.06, 0.06, 0.8, M(C.dark, 'metal'), 0, 3.4, 0.35)
    k.box(0.3, 0.12, 0.4, M(C.dark, 'metal'), 0, 3.3, 0.75)
    k.box(0.24, 0.05, 0.32, bulbM(), 0, 3.27, 0.75)
  })
}

// --------------------------------------------------------------------------
// Archetypes
// --------------------------------------------------------------------------
interface BlockOpt { w: number; d: number; floors: number; fh?: number; surf?: 'brick' | 'concrete' | 'metal'; color: string; trim?: string; x?: number; z?: number; door?: boolean; glassy?: boolean; frame?: string }
/** Multi-storey block: plinth, walls, windows on all faces, ledges, cornice, parapet, roof gear. Returns roof height. */
function block(k: Kit, o: BlockOpt, L: number, seed: number) {
  const fh = o.fh ?? 1.9, h = 0.4 + o.floors * fh
  let top = 0
  at(k, o.x ?? 0, 0, o.z ?? 0, 0, () => {
    k.rbox(o.w + 0.25, 0.45, o.d + 0.25, M('#8f8a82', 'concrete'), 0, 0, 0, 0.05) // plinth
    k.rbox(o.w, h - 0.4, o.d, M(o.color, o.glassy ? 'plain' : o.surf ?? 'brick', o.glassy ? { rough: 0.3, metal: 0.3 } : {}), 0, 0.4, 0, 0.1)
    // Corner pilasters for depth.
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.28, h - 0.4, 0.28, M(o.trim ?? C.trim, 'concrete'), a * (o.w / 2), 0.4, b * (o.d / 2))
    const faces: [number, number, number, number][] = [[0, o.d / 2, 0, o.w], [0, -o.d / 2, Math.PI, o.w], [o.w / 2, 0, Math.PI / 2, o.d], [-o.w / 2, 0, -Math.PI / 2, o.d]]
    faces.forEach(([fx, fz, ry, W], i) => at(k, fx, 0, fz, ry, () => {
      windowGrid(k, W, o.floors, fh, 0.4, seed + i * 13, { skipDoor: i === 0 && o.door !== false, band: o.glassy, frame: o.frame })
    }))
    if (o.door !== false) at(k, 0, 0.45, o.d / 2, 0, () => entrance(k, 0))
    trimBlock(k, o.w, o.d, h, o.floors, fh, 0.4, o.trim)
    roofGear(k, o.w, o.d, h + 0.36, L, seed)
    top = h + 0.36
  })
  return top
}
interface HallOpt { w: number; d: number; h: number; color: string; roof?: 'saw' | 'gable' | 'flat'; surf?: 'metal' | 'brick' | 'wood' | 'concrete'; x?: number; z?: number; doors?: number; dock?: boolean }
/** Industrial hall: concrete base strip, clad walls, clerestory band, roll-up doors, downspouts, roof. */
function hall(k: Kit, o: HallOpt, L: number, seed: number) {
  let top = 0
  at(k, o.x ?? 0, 0, o.z ?? 0, 0, () => {
    const surf = o.surf ?? 'metal'
    k.rbox(o.w + 0.1, 0.8, o.d + 0.1, M('#a9a59d', 'concrete'), 0, 0, 0, 0.05)
    k.rbox(o.w, o.h - 0.8, o.d, M(o.color, surf), 0, 0.8, 0, 0.08)
    // Clerestory window bands on the long sides.
    for (const [z, ry] of [[o.d / 2, 0], [-o.d / 2, Math.PI]] as const) at(k, 0, 0, z, ry, () => {
      const n = Math.floor(o.w / 1.3)
      for (let i = 0; i < n; i++) windowUnit(k, -((n - 1) * 1.3) / 2 + i * 1.3, o.h - 1.3, 1.0, 0.7, (i + seed) % 3 !== 0, C.glassFrame, false)
    })
    for (const [x, ry] of [[o.w / 2, Math.PI / 2], [-o.w / 2, -Math.PI / 2]] as const) at(k, x, 0, 0, ry, () => {
      const n = Math.floor(o.d / 1.3)
      for (let i = 0; i < n; i++) windowUnit(k, -((n - 1) * 1.3) / 2 + i * 1.3, o.h - 1.3, 1.0, 0.7, (i + seed) % 2 === 0, C.glassFrame, false)
    })
    // Corner trims and downspouts.
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      k.box(0.16, o.h - 0.8, 0.16, M(C.dark, 'metal'), a * o.w / 2, 0.8, b * o.d / 2)
      k.cyl(0.07, 0.07, o.h - 0.2, M('#7b828c', 'metal'), a * (o.w / 2 - 0.4), 0.1, b * (o.d / 2 + 0.08), 6, { detail: true })
    }
    // Front: roll-up doors with docks, plus a personnel door.
    const n = o.doors ?? 1
    at(k, 0, 0, o.d / 2, 0, () => {
      for (let i = 0; i < n; i++) rollDoor(k, -o.w / 2 + (o.w / (n + 1)) * (i + 1) - (n === 1 ? 0.8 : 0), 2.0, Math.min(2.4, o.h - 2.2), o.dock !== false)
      k.box(0.9, 2.0, 0.08, M(C.door), o.w / 2 - 0.9, 0.8, 0.04)
      k.box(1.2, 0.06, 0.6, M(C.dark, 'metal'), o.w / 2 - 0.9, 2.9, 0.3)
      k.box(1.2, 0.8, 0.9, M(C.concrete, 'concrete'), o.w / 2 - 0.9, 0, 0.45)
    })
    // Roof.
    const roof = o.roof ?? 'saw'
    if (roof === 'gable') { k.gable(o.w, 1.6, o.d, M('#8d929a', 'metal'), 0, o.h, 0); top = o.h + 0.4 }
    else if (roof === 'saw') {
      const t = Math.max(2, Math.round(o.w / 2.4)), sw = o.w / t
      for (let i = 0; i < t; i++) {
        const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(sw, 0); s.lineTo(sw, 1.3); s.closePath()
        const g = new THREE.ExtrudeGeometry(s, { depth: o.d, bevelEnabled: false }); g.translate(-o.w / 2 + i * sw, 0, -o.d / 2)
        k.add(g, M('#c4c0b6', 'metal'), { y: o.h })
        k.plane(o.d, 1.25, glassM((i + seed) % 2 === 0), { x: -o.w / 2 + (i + 1) * sw - 0.01, y: o.h + 0.62, ry: -Math.PI / 2 })
      }
      top = o.h + 0.2
    } else { trimBlock(k, o.w, o.d, o.h, 1, o.h, 0, '#cfcbc3'); top = o.h + 0.36 }
    // Roof vents along the ridge, ladder on the side.
    for (let i = 0; i < Math.min(4, 1 + Math.floor(L / 3)); i++) vent(k, -o.w / 2 + 1 + i * (o.w - 2) / 3, roof === 'flat' ? top : o.h + (roof === 'gable' ? 1.0 : 0.6), roof === 'gable' ? 0 : -o.d / 4)
    if (roof === 'flat' && L >= 3) hvac(k, o.w / 4, top, 0, L >= 8)
    ladder(k, o.w / 2 + 0.02, -o.d / 4, 0.8, o.h - 0.6, Math.PI / 2)
    // Wall-pack lights.
    for (const x of [-o.w / 3, o.w / 3]) k.box(0.3, 0.2, 0.15, bulbM(), x, o.h - 0.35, o.d / 2 + 0.08, { detail: true })
  })
  return top
}
interface ShopOpt { w: number; d: number; floors: number; color: string; name: string; awning: string; surf?: 'brick' | 'concrete' }
/** Storefront: display windows with mullions, striped awning, lit sign, upper floors. */
function shop(k: Kit, o: ShopOpt, L: number, seed: number) {
  const gh = 2.8, fh = 1.9, h = 0.3 + gh + (o.floors - 1) * fh
  k.rbox(o.w + 0.2, 0.3, o.d + 0.2, M('#8f8a82', 'concrete'), 0, 0, 0, 0.05)
  k.rbox(o.w, h - 0.3, o.d, M(o.color, o.surf ?? 'brick'), 0, 0.3, 0, 0.1)
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.3, h - 0.3, 0.3, M(C.trim, 'concrete'), a * o.w / 2, 0.3, b * o.d / 2)
  at(k, 0, 0, o.d / 2, 0, () => {
    // Ground floor: big display windows each side of the door.
    for (const s of [-1, 1]) {
      const x = s * (o.w / 4 + 0.35), ww = o.w / 2 - 1.6
      k.box(ww + 0.2, 2.0, 0.08, M(C.glassFrame), x, 0.55, 0.02)
      k.plane(ww, 1.8, glassM(true), { x, y: 1.55, z: 0.08 })
      for (let i = 1; i < 3; i++) k.box(0.05, 1.8, 0.05, M(C.glassFrame), x - ww / 2 + (ww * i) / 3, 0.65, 0.1)
      k.box(ww + 0.3, 0.55, 0.15, M(C.trim, 'concrete'), x, 0.3, 0.06) // stallriser
      // Planter boxes under the windows.
      k.box(ww * 0.8, 0.35, 0.4, M('#6f5a45', 'wood'), x, 0.3, 0.45)
      for (let i = 0; i < 4; i++) bush(k, x - ww * 0.3 + i * ww * 0.2, 0.45 + 0.3, 0.2, i % 2 ? '#e86a8a' : '#4f9a4c')
    }
    entrance(k, 0, 1.4, 2.2)
    // Flat steel-and-glass canopy in the brand colour with an LED edge strip
    // (was a striped fabric awning with a valance).
    const aw = o.w - 0.3
    k.box(aw, 0.12, 1.3, M(o.awning, 'plain', { rough: 0.4, metal: 0.3 }), 0, gh + 0.1, 0.65)
    k.box(aw, 0.06, 0.04, M('#e8fbff', 'plain', { rough: 0.2 }), 0, gh + 0.1, 1.31)
    // Sign band above the awning.
    sign(k, o.name, shade(o.awning, 0.8), 0, gh + 0.55, 0.08, Math.min(o.w - 1, 4.6))
    // Upper floors.
    windowGrid(k, o.w, o.floors - 1, fh, 0.3 + gh, seed, { ww: 0.8 })
    for (const x of [-o.w / 2 + 0.6, o.w / 2 - 0.6]) k.sphere(0.12, bulbM(), x, gh - 0.1, 0.2, { detail: true }, 8)
  })
  for (const [x, ry] of [[o.w / 2, Math.PI / 2], [-o.w / 2, -Math.PI / 2]] as const) at(k, x, 0, 0, ry, () => windowGrid(k, o.d, o.floors, fh, 0.6, seed + 3, { ww: 0.7 }))
  trimBlock(k, o.w, o.d, h, o.floors, fh, 0.3)
  roofGear(k, o.w, o.d, h + 0.36, L, seed)
  return h + 0.36
}

// --------------------------------------------------------------------------
// The plot ground: sidewalk ring, curbs, planters, lamp post, lawn.
// Built once for ALL plots (merged), so it costs a few draw calls total.
// --------------------------------------------------------------------------
export function plotGround(k: Kit, px: number, pz: number, size: number, idx: number) {
  at(k, px, 0, pz, 0, () => {
    const s = size / 2, sw = 0.8
    const pm = M('#e2dccf', 'paver'), cm = M('#bcb6aa', 'concrete')
    k.box(size, 0.1, sw, pm, 0, 0, s - sw / 2); k.box(size, 0.1, sw, pm, 0, 0, -s + sw / 2)
    k.box(sw, 0.1, size - sw * 2, pm, s - sw / 2, 0, 0); k.box(sw, 0.1, size - sw * 2, pm, -s + sw / 2, 0, 0)
    // Curb lip on the outer edge.
    k.box(size + 0.1, 0.16, 0.12, cm, 0, 0, s); k.box(size + 0.1, 0.16, 0.12, cm, 0, 0, -s)
    k.box(0.12, 0.16, size, cm, s, 0, 0); k.box(0.12, 0.16, size, cm, -s, 0, 0)
    // Corner planters with shrubs.
    for (const [a, b] of [[-1, 1], [1, -1]]) {
      const x = a * (s - 0.45), z = b * (s - 0.45)
      k.rbox(0.75, 0.4, 0.75, M('#b9b2a5', 'concrete'), x, 0.1, z, 0.06)
      k.box(0.6, 0.05, 0.6, M('#6b4e33', 'soil'), x, 0.5, z)
      bush(k, x, z, 0.32, idx % 2 ? '#4f9a4c' : '#5aa65a'); k.add(new THREE.IcosahedronGeometry(0.18, 1), M('#e86a8a'), { x: x + 0.15, y: 0.85, z: z + 0.1, detail: true })
    }
    lamp(k, s - 0.4, s - 0.4, Math.PI * 0.25)
  })
}

// --------------------------------------------------------------------------
// Per-type models
// --------------------------------------------------------------------------
/** Plant colour per crop on a farm field patch (unknown crops: generic green). */
const FIELD_CROP: Record<string, string> = new Proxy({ seeds: '#c9b37e', wheat: '#e6c15a', apples: '#d9483b', berries: '#7b2fa3', greens: '#5fae4c', cotton: '#f4f1ea', oranges: '#f39a2b' } as Record<string, string>, { get: (t, k: string) => (k === '' ? undefined : t[k] ?? '#6cb35a') })
export function buildModel(type: string, level: number, name: string, color: string, kind: 'production' | 'retail', seed: number, fields: string[] = []): Built {
  const k = new Kit()
  const L = Math.max(1, Math.min(level, 20))
  const fl = (base: number, max: number) => Math.min(max, base + Math.floor(L / 2))
  const emit: Emitter[] = []
  let spin: THREE.Object3D | undefined, nod: THREE.Object3D | undefined, swing: THREE.Object3D | undefined
  const extra = new THREE.Group()
  const sub = (fn: (kk: Kit) => void) => { const kk = new Kit(); fn(kk); return kk.build() }
  /** Annex wing that appears from level 5 (and a second at 12). */
  const wings = (side: 1 | -1 = -1) => {
    if (L >= 5) block(k, { w: 2.6, d: 3, floors: 1 + Math.floor(L / 6), color: shade(color, 0.92), surf: 'concrete', x: side * 2.9, z: -2.4, door: false }, 1, seed + 5)
    if (L >= 12) block(k, { w: 2.4, d: 2.4, floors: 2 + Math.floor(L / 8), color: '#dcd7cf', surf: 'concrete', x: -side * 3.1, z: -2.8, door: false }, L, seed + 9)
  }

  switch (type) {
    // ---------------- utilities ----------------
    case 'generator': { // Windmill park: lattice-free tapered tower, nacelle, blades + substation
      const h = 9 + L * 0.5
      k.cyl(1.3, 1.5, 0.5, M(C.concrete, 'concrete'), -1, 0, -1, 20)
      k.cyl(0.32, 0.62, h, M('#f4f2ee', 'plain', { rough: 0.4 }), -1, 0.5, -1, 20)
      for (let y = 2; y < h; y += 3) k.cyl(0.6 - (y / h) * 0.27, 0.6 - (y / h) * 0.27, 0.06, M('#d9d6cf'), -1, y, -1, 20, { detail: true })
      k.rbox(1.2, 0.9, 2.2, M('#f4f2ee', 'plain', { rough: 0.4 }), -1, h + 0.3, -1.2, 0.3)
      k.box(0.2, 0.1, 1.4, M(C.red), -1, h + 1.2, -1.4, { detail: true })
      const hub = new THREE.Group(); hub.position.set(-1, h + 0.75, 0.05)
      hub.add(sub(kk => {
        kk.sphere(0.42, M('#f4f2ee', 'plain', { rough: 0.4 }), 0, 0, 0.1, { sz: 1.4 }, 14)
        for (let i = 0; i < 3; i++) at(kk, 0, 0, 0, 0, () => {
          const a = (i * Math.PI * 2) / 3
          const g = new THREE.BoxGeometry(0.55, 5.2, 0.1); g.translate(0, 2.9, 0)
          kk.add(g, M('#f4f2ee', 'plain', { rough: 0.4 }), { rz: a })
          const tip = new THREE.BoxGeometry(0.56, 0.6, 0.11); tip.translate(0, 5.2, 0)
          kk.add(tip, M(C.red), { rz: a })
        })
      }))
      extra.add(hub); spin = hub
      // Substation: transformer boxes, insulators, chain fence.
      k.box(3.6, 0.15, 2.6, M(C.concrete, 'concrete'), 2.2, 0, 2.3)
      for (const x of [1.3, 3.0]) { k.rbox(1.1, 1.2, 1.0, M('#8f9aa5', 'metal'), x, 0.15, 2.3, 0.05); for (let i = -1; i <= 1; i++) k.cyl(0.06, 0.08, 0.5, M('#c9a46a'), x + i * 0.3, 1.35, 2.3, 8, { detail: true }) }
      for (let i = 0; i < 5; i++) k.box(0.06, 0.9, 0.12, M('#5d6470', 'metal'), 1.88, 0.2, 2.3 - 0.4 + i * 0.2, { detail: true })
      chainFence(k, 0.2, 1.0, 4.2, 1.0); chainFence(k, 4.2, 1.0, 4.2, 3.6); chainFence(k, 0.2, 1.0, 0.2, 3.6)
      sign(k, name, '#3a7d5a', 2.2, 0.2, 3.7, 2.4)
      if (L >= 5) { k.rbox(3.0, 1.3, 1.3, M('#e9edf0', 'metal'), 2.4, 0, -2.8, 0.06); for (let i = 0; i < 5; i++) k.box(0.04, 1.0, 0.04, M('#9aa3ad'), 1.2 + i * 0.6, 0.15, -2.14, { detail: true }) }
      if (L >= 10) for (let i = 0; i < 3; i++) solarPanel(k, -3.2 + i * 1.8, 0, 3.1)
      break
    }
    case 'pump': { // Pump house: brick block + water tower with bands + pipes and valves
      block(k, { w: 4.6, d: 3.8, floors: fl(1, 3), color: '#8a96a3', surf: 'brick', x: -1.8, z: 1 }, L, seed)
      const th = 5 + L * 0.3
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        k.cyl(0.1, 0.14, th, M('#6f7a88', 'metal'), 2.6 + a * 1.1, 0, -1.6 + b * 1.1, 8)
        k.box(0.06, 0.06, 2.3, M('#6f7a88', 'metal'), 2.6 + a * 1.1, th * 0.5, -1.6, { detail: true })
      }
      for (const y of [th * 0.33, th * 0.66]) { k.box(2.3, 0.06, 0.06, M('#6f7a88', 'metal'), 2.6, y, -0.5, { detail: true }); k.box(2.3, 0.06, 0.06, M('#6f7a88', 'metal'), 2.6, y, -2.7, { detail: true }) }
      tank(k, 2.6, -1.6, 1.5, 2.4, '#7fb1d1', th)
      k.cyl(0.18, 0.18, th, M('#5d8fb0', 'metal'), 2.6, 0, -1.6, 10)
      k.pipeH(0.5, 0.5, 2.6, 0.5, 0.5, 0.18, M('#5d8fb0', 'metal')); k.pipeH(2.6, 0.5, 2.6, -1.6, 0.5, 0.18, M('#5d8fb0', 'metal'))
      for (const x of [1.2, 2.0]) k.add(new THREE.TorusGeometry(0.25, 0.04, 6, 14), M(C.red), { x, y: 0.85, z: 0.5, detail: true })
      sign(k, name, '#3d6f94', -1.8, 2.2, 2.95, 2.8)
      break
    }
    // ---------------- farms ----------------
    case 'orchard': {
      const rows = Math.min(4, 2 + Math.floor(L / 4))
      k.box(9, 0.08, 6.2, M('#7fb85e', 'grass'), 0, 0, -1.2)
      for (let r = 0; r < rows; r++) for (let c = 0; c < 5; c++) {
        const x = -3.6 + c * 1.6, z = -3.6 + r * 1.5, s = 0.75 + Math.min(L, 10) * 0.03
        tree(k, x, z, s, r % 2 ? '#62b058' : '#56a352')
        for (let f = 0; f < 4; f++) k.sphere(0.1, M('#e8473f', 'plain', { rough: 0.4 }), x + Math.cos(f * 1.7) * 0.55 * s, 1.35 * s + (f % 2) * 0.4, z + Math.sin(f * 1.7) * 0.5 * s, { detail: true }, 6)
      }
      // Packing shed with gable roof and apple crates.
      k.rbox(3, 2, 2.2, M('#d8c3a0', 'wood'), 2.6, 0, 2.6, 0.05); k.gable(3, 1, 2.2, M('#8d3b32', 'metal'), 2.6, 2, 2.6)
      at(k, 2.6, 0, 3.7, 0, () => { k.box(1.2, 1.6, 0.06, M('#7a4a30', 'wood'), 0, 0, 0.02); windowUnit(k, 1, 1, 0.5, 0.5, true) })
      // Extra fields (farm.ts FIELD_*): one crop patch each along the front
      // edge, left of the packing shed. Bare tilled soil while empty; rows of
      // little plants in the crop's colour while something grows. Without
      // fields the old crate pallets and fence fill this strip as before.
      if (fields.length === 0) {
        for (let i = 0; i < 3; i++) pallet(k, -1.5 + i * 1.3, 3.2, 1 + (i % 2), '#d9534f')
        fence(k, -4.4, 1.2, 0.6, 1.2)
      } else fields.forEach((crop, i) => {
        const px = -4.0 + i * 1.75, pz = 3.0 // patch centre (1.6 x 2.0 units), clear of the shed at x >= 1.1
        k.box(1.6, 0.12, 2.0, M('#7a5638', 'soil'), px, 0, pz) // tilled bed
        k.box(1.7, 0.16, 0.08, M('#8a6a4a', 'wood'), px, 0, pz - 1.04) // low timber edging, back
        k.box(1.7, 0.16, 0.08, M('#8a6a4a', 'wood'), px, 0, pz + 1.04) // front
        const col = FIELD_CROP[crop]
        for (let r = 0; r < 3; r++) {
          k.box(1.4, 0.04, 0.16, M('#5e4029'), px, 0.12, pz - 0.6 + r * 0.6, { detail: true }) // furrow
          if (col) for (let c = 0; c < 4; c++) { // plants on the row, coloured by crop
            const x = px - 0.52 + c * 0.35, z = pz - 0.6 + r * 0.6
            k.cyl(0.03, 0.03, 0.22, M('#4f8a3a'), x, 0.12, z, 5, { detail: true })
            k.sphere(0.13, M(col), x, 0.42, z, {}, 6)
          }
        }
      })
      sign(k, name, '#4f8a3c', -3.2, 0.2, 3.6, 2.2)
      break
    }
    case 'barnyard': {
      const h = 3 + Math.min(L, 10) * 0.2
      k.rbox(5, h, 3.8, M('#c0473a', 'wood'), -1.4, 0, -1.2, 0.06)
      k.gable(5, 1.9, 3.8, M('#6f3029', 'metal'), -1.4, h, -1.2, 0.35)
      at(k, -1.4, 0, 0.7, 0, () => {
        k.box(2, 2.4, 0.08, M('#a33a30', 'wood'), 0, 0, 0.03)
        for (const s of [-1, 1]) k.box(0.12, 2.9, 0.06, M(C.white), 0, 0.1, 0.09, { rz: s * 0.68, x: 0, y: 1.2 })
        k.box(2.2, 0.12, 0.06, M(C.white), 0, 2.4, 0.08); k.box(0.12, 2.5, 0.06, M(C.white), -1.05, 0, 0.08); k.box(0.12, 2.5, 0.06, M(C.white), 1.05, 0, 0.08)
        windowUnit(k, 0, h + 0.6, 0.6, 0.6, true, C.white)
      })
      // Silo with dome and bands.
      k.cyl(1.05, 1.05, h + 2.6, M('#d8d3ca', 'concrete'), 2.7, 0, -2.2, 22)
      for (let y = 1; y < h + 2.6; y += 1) k.cyl(1.08, 1.08, 0.05, M('#9aa3ad', 'metal'), 2.7, y, -2.2, 22, { detail: true })
      k.sphere(1.05, M('#8d929a', 'metal'), 2.7, h + 2.6, -2.2, {}, 22, true)
      ladder(k, 2.7, -1.15, 0, h + 2.6)
      // Pen with hens and cows, feed trough.
      fence(k, -4.4, 1.4, 4.2, 1.4); fence(k, -4.4, 1.4, -4.4, 4.2); fence(k, 4.2, 1.4, 4.2, 4.2); fence(k, -4.4, 4.2, 4.2, 4.2)
      k.box(8.4, 0.05, 2.6, M('#a58a5f', 'soil'), -0.1, 0, 2.8)
      for (let i = 0; i < 5; i++) animal(k, -3.2 + i * 1.6, 2.4 + (i % 2) * 1, i % 2 ? '#f4f0e8' : '#6b4a35', 1, i)
      for (let i = 0; i < 6; i++) animal(k, -3.5 + i * 0.6, 3.7, '#fff6e6', 0.45, i * 2)
      k.box(2, 0.4, 0.5, M('#8a6a4a', 'wood'), 2.4, 0, 3.6)
      sign(k, name, '#8d3b32', 2.7, 0.3, -1.1, 1.8)
      break
    }
    case 'plantation': { // fields of mixed crops + glass greenhouse
      field(k, -2.4, -2.4, 4, 3.4, '#4f9a3c', 'tall'); field(k, 2.2, -2.4, 4.2, 3.4, '#d9473f', 'bush')
      field(k, -2.6, 1.8, 3.6, 2.6, '#7d4f9e', 'bush')
      // Greenhouse: frame and glass gable.
      at(k, 2.2, 0, 2, 0, () => {
        k.box(4, 0.25, 2.8, M(C.concrete, 'concrete'), 0, 0, 0)
        const gm = new THREE.MeshStandardMaterial({ color: '#e8f6ff', transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.3 })
        k.box(3.8, 1.6, 2.6, gm, 0, 0.25, 0); k.gable(3.8, 1.0, 2.6, gm, 0, 1.85, 0, 0)
        for (let x = -1.9; x <= 1.9; x += 0.63) { k.box(0.05, 1.6, 2.62, M(C.white), x, 0.25, 0); k.add(new THREE.BoxGeometry(0.05, 0.05, 1.6), M(C.white), { x, y: 2.3, z: 0.65, rx: -0.65 }); k.add(new THREE.BoxGeometry(0.05, 0.05, 1.6), M(C.white), { x, y: 2.3, z: -0.65, rx: 0.65 }) }
        for (let i = 0; i < 6; i++) bush(k, -1.5 + i * 0.6, 0.6, 0.25, '#3f8f3c')
      })
      k.box(0.5, 1.4, 0.5, M('#8a6a4a', 'wood'), -4.2, 0, 3.6); sign(k, name, '#5e8f2f', -2.8, 0.2, 3.9, 2.6)
      if (L >= 6) tank(k, 4.0, -4.0, 0.5, 1.4, '#7fb1d1')
      break
    }
    case 'ranch': { // wooden barn, sheep pen, beehives
      k.rbox(4.4, 2.6, 3.2, M('#9c6b45', 'wood'), -1.8, 0, -2.2, 0.05); k.gable(4.4, 1.6, 3.2, M('#5a4a3a', 'metal'), -1.8, 2.6, -2.2)
      at(k, -1.8, 0, -0.6, 0, () => { k.box(1.6, 2, 0.06, M('#6b4a30', 'wood'), 0, 0, 0.02); windowUnit(k, 1.4, 1.2, 0.5, 0.5, true, C.white) })
      fence(k, -4.4, 0.6, 1, 0.6, '#8a6a4a'); fence(k, -4.4, 0.6, -4.4, 4.2, '#8a6a4a'); fence(k, 1, 0.6, 1, 4.2, '#8a6a4a'); fence(k, -4.4, 4.2, 1, 4.2, '#8a6a4a')
      for (let i = 0; i < 7; i++) animal(k, -3.6 + (i % 4) * 1.2, 1.5 + Math.floor(i / 4) * 1.4, '#f3efe6', 0.8, i)
      for (let i = 0; i < 4; i++) at(k, 2.4 + (i % 2) * 1.2, 0, 1.2 + Math.floor(i / 2) * 1.6, 0, () => {
        k.box(0.5, 0.3, 0.5, M('#7a5a3c', 'wood'), 0, 0, 0); for (let j = 0; j < 3; j++) k.rbox(0.7, 0.32, 0.6, M(j % 2 ? '#f2c14e' : '#f7f2e2', 'wood'), 0, 0.3 + j * 0.33, 0, 0.03)
        k.box(0.8, 0.08, 0.7, M('#7a5a3c', 'wood'), 0, 1.3, 0)
      })
      tree(k, 3.4, -2.4, 1.1); tree(k, 2.4, -3.6, 0.9)
      sign(k, name, '#7a5a3c', 3.0, 0.2, 3.9, 2.2)
      break
    }
    // ---------------- food ----------------
    case 'kitchen': case 'confect': case 'deli': case 'dairy': {
      const look = { kitchen: ['#c9a27a', 'brick'], confect: ['#e9a3b8', 'brick'], deli: ['#e6b880', 'brick'], dairy: ['#eef0f2', 'concrete'] }[type] as [string, 'brick' | 'concrete']
      const top = block(k, { w: 6.2, d: 4.6, floors: fl(1, 5), color: look[0], surf: look[1], x: -0.8, z: -0.6 }, L, seed)
      sign(k, name, shade(color, 0.7), -0.8, top - 1.0, 1.75 + 0.02, 3.8)
      // Kitchen extract stacks with steam.
      for (const x of [-2.6, 0.8]) { k.cyl(0.18, 0.18, 1.6, M(C.steel, 'metal'), x, top, -1.6, 10); k.cyl(0.32, 0.32, 0.12, M(C.steel, 'metal'), x, top + 1.6, -1.6, 10); emit.push({ x, y: top + 1.8, z: -1.6, steam: true }) }
      // Side dock with a delivery van.
      at(k, 3.6, 0, 0, Math.PI / 2, () => rollDoor(k, -0.6, 1.6, 2.0, true))
      if (type === 'dairy') { tank(k, 3.4, -3.0, 0.7, 2.4, '#e9eef2'); tank(k, 3.4, 2.6, 0.6, 2.0, '#e9eef2') }
      else { car(k, 3.6, 3.2, 0, type === 'confect' ? '#e86a9a' : '#f2f2f2', true); pallet(k, 3.6, -2.8, 2, '#d9b48a') }
      wings(-1)
      break
    }
    case 'bottler': {
      const top = hall(k, { w: 6.6, d: 5, h: 4 + L * 0.15, color: '#cfe6ea', roof: 'flat', x: -0.8, z: -0.8, doors: 1 }, L, seed)
      sign(k, name, '#2f8f9a', -0.8, top - 1.3, 1.75, 3.6)
      for (let i = 0; i < 3; i++) tank(k, 3.3, -3.4 + i * 1.6, 0.6, 2.6 + (i % 2) * 0.6, i === 1 ? '#7b2140' : '#d9e2e8')
      k.pipeH(2.5, -3.4, 2.5, 0.2, 2.8, 0.1, M(C.steel, 'metal'))
      conveyor(k, -4.2, 1.8, 0.9, 3.0, '#58c4c6')
      emit.push({ x: -2.0, y: top + 0.8, z: -1, steam: true })
      break
    }
    // ---------------- textiles ----------------
    case 'loom': case 'knit': {
      const top = hall(k, { w: 8, d: 5.4, h: 4 + L * 0.2, color: type === 'knit' ? '#8a96a3' : '#a7c4d9', surf: type === 'knit' ? 'brick' : 'metal', roof: 'saw', z: -1, doors: 2 }, L, seed)
      sign(k, name, shade(color, 0.65), 0, 2.9, 1.82, 3.4)
      if (type === 'knit') { k.cyl(0.6, 0.6, 1.6, M('#9c7a58', 'wood'), 3.0, top + 1.6, -2.6, 16); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(0.05, 0.05, 1.6, M(C.dark, 'metal'), 3.0 + a * 0.4, top, -2.6 + b * 0.4, 6) }
      emit.push(chimney(k, -3.4, -3.4, 7 + L * 0.3, 0.42, true))
      for (let i = 0; i < 3; i++) pallet(k, -3 + i * 1.4, 3.4, 2, i % 2 ? '#a7c4d9' : '#f4f0ea')
      break
    }
    case 'fashion': {
      const top = block(k, { w: 5.6, d: 4.4, floors: fl(2, 8), fh: 2, color: '#2c3e57', glassy: true, frame: '#d9b45a', trim: '#e9e2d0' }, L, seed)
      sign(k, name, '#1f2a3a', 0, 2.75, 2.25, 3.2)
      // Boutique canopy + topiaries.
      k.box(5.2, 0.1, 1.2, M('#d9b45a', 'metal', { metal: 0.9, rough: 0.3 }), 0, 2.55, 2.75)
      for (const x of [-2.2, 2.2]) { k.cyl(0.3, 0.25, 0.5, M('#2f3640'), x, 0, 3.3, 12); bush(k, x, 3.3, 0.38) ; k.sphere(0.3, M('#3f8f3c'), x, 1.4, 3.3, {}, 10) }
      void top
      wings(1)
      break
    }
    // ---------------- energy ----------------
    case 'well': case 'gasrig': {
      // Pumpjack (animated beam) on a pad.
      k.box(4.4, 0.25, 2.2, M(C.concrete, 'concrete'), -1.4, 0, 1.6)
      k.rbox(1.0, 0.8, 1.0, M('#4a4a52', 'metal'), -3.0, 0.25, 1.6, 0.05)
      for (const s of [-0.4, 0.4]) k.box(0.18, 3.0, 0.18, M(color, 'metal'), -1.0, 0.25, 1.6 + s, { rz: s > 0 ? 0.12 : -0.12 })
      const beam = new THREE.Group(); beam.position.set(-1.0, 3.3, 1.6)
      beam.add(sub(kk => {
        kk.box(5, 0.35, 0.35, M(type === 'gasrig' ? '#c8553d' : '#e3b23c', 'metal'), 0.2, -0.17, 0)
        kk.add(new THREE.CylinderGeometry(0.75, 0.75, 0.4, 16, 1, false, 0, Math.PI), M('#4a4a52', 'metal'), { x: -2.4, y: -0.3, rx: Math.PI / 2, rz: Math.PI / 2 })
        kk.box(0.3, 1.2, 0.5, M('#4a4a52', 'metal'), 2.75, -1.0, 0)
      }))
      extra.add(beam); nod = beam
      k.cyl(0.12, 0.12, 1.4, M('#3a3a40', 'metal'), 1.75, 0.25, 1.6, 8)
      k.cyl(0.35, 0.35, 0.3, M('#3a3a40', 'metal'), 1.75, 0.25, 1.6, 12)
      // Storage tanks + pipes.
      tank(k, 2.6, -2.4, 1.1, 2.6 + Math.min(L, 10) * 0.12, type === 'gasrig' ? '#e6e9ec' : '#5a5a62')
      if (L >= 4) tank(k, 0.0, -3.0, 0.8, 2.0, type === 'gasrig' ? '#e6e9ec' : '#5a5a62')
      k.pipeH(1.75, 1.6, 2.6, 1.6, 0.6, 0.1, M('#3a3a40', 'metal')); k.pipeH(2.6, 1.6, 2.6, -1.3, 0.6, 0.1, M('#3a3a40', 'metal'))
      if (type === 'gasrig') {
        // Derrick lattice tower with flare.
        const th = 7 + L * 0.3
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(0.12, th, 0.12, M('#c8553d', 'metal'), -3 + a * 0.7 * 0.6, 0, -2.4 + b * 0.7 * 0.6, { rz: -a * 0.05, rx: b * 0.05 })
        for (let y = 1; y < th; y += 1.1) for (const r of [0, Math.PI / 2]) k.box(1.0 - y * 0.04, 0.05, 0.05, M('#c8553d', 'metal'), -3, y, -2.4, { ry: r, detail: true })
        emit.push({ x: -3, y: th + 0.4, z: -2.4 })
      }
      chainFence(k, -4.3, 3.6, 4.3, 3.6)
      sign(k, name, type === 'gasrig' ? '#5d7a94' : '#4a4a52', 2.4, 0.3, 3.4, 2.2)
      break
    }
    case 'refinery': case 'polymer': {
      // Control building, distillation columns with catwalks, tank farm, flare stack, pipe rack.
      block(k, { w: 3.4, d: 2.6, floors: fl(1, 3), color: '#e4ded2', surf: 'concrete', x: -2.6, z: 2.2 }, L, seed)
      const ch = 6 + L * 0.35
      for (const [x, z, r] of [[-2.8, -2.2, 0.6], [-1.4, -2.6, 0.45]] as const) {
        k.cyl(r, r, ch - (r < 0.5 ? 1.5 : 0), M('#e8e6e1', 'metal'), x, 0, z, 18)
        for (let y = 1.6; y < ch - 1.5; y += 1.6) { k.add(new THREE.CylinderGeometry(r + 0.45, r + 0.45, 0.06, 18), M(C.rail, 'metal'), { x, y, z }); for (let a = 0; a < 10; a++) { const t = (a / 10) * Math.PI * 2; k.box(0.03, 0.6, 0.03, M(C.rail), x + Math.cos(t) * (r + 0.42), y, z + Math.sin(t) * (r + 0.42), { detail: true }) } }
        ladder(k, x, z + r, 0, ch - (r < 0.5 ? 1.5 : 0))
      }
      if (type === 'polymer') { for (const [x, z] of [[1.6, -2.4], [3.3, -0.6]]) { k.sphere(1.0, M('#f2f4f6', 'metal'), x, 1.6, z, {}, 20); for (let a = 0; a < 6; a++) { const t = (a / 6) * Math.PI * 2; k.cyl(0.07, 0.07, 1.6, M(C.steel, 'metal'), x + Math.cos(t) * 0.75, 0, z + Math.sin(t) * 0.75, 6) } } }
      else { tank(k, 1.6, -2.4, 1.2, 2.0, color, 0, false); tank(k, 3.4, -0.4, 0.9, 1.8, '#e8e6e1') }
      // Pipe rack.
      for (let x = -3; x <= 3; x += 1.5) { k.box(0.12, 2.2, 0.12, M(C.steel, 'metal'), x, 0, 0.2); k.box(0.12, 2.2, 0.12, M(C.steel, 'metal'), x, 0, 0.9) ; k.box(0.12, 0.12, 0.82, M(C.steel, 'metal'), x, 2.2, 0.55) }
      for (const [z, c] of [[0.35, '#c8553d'], [0.55, '#e3b23c'], [0.75, '#6f7a88']] as const) k.pipeH(-3.2, z, 3.4, z, 2.42, 0.08, M(c, 'metal'))
      emit.push(chimney(k, 3.4, 2.8, ch + 2, 0.3))
      sign(k, name, shade(color, 0.6), 0.6, 0.2, 3.7, 2.6)
      break
    }
    case 'solarworks': {
      const top = hall(k, { w: 6, d: 3.8, h: 3.6 + L * 0.12, color: '#e9edf2', roof: 'flat', x: -1.2, z: -2.3, doors: 1, dock: false }, L, seed)
      for (let i = 0; i < 3; i++) solarPanel(k, -3.2 + i * 2, top, -2.3, 1.7, 1.1)
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) solarPanel(k, -3.4 + c * 2.1, 0, 1.4 + r * 1.6, 1.9, 1.2, 0.5)
      sign(k, name, '#3c5ea8', 3.2, 0.2, -0.2, 1.8)
      break
    }
    // ---------------- construction ----------------
    case 'pit': {
      // Terraced excavation, aggregate piles, swinging crane, conveyor.
      for (let i = 0; i < 3; i++) k.cyl(4.2 - i * 0.9, 4.2 - i * 0.9, 0.05, M(i % 2 ? '#b8996a' : '#a88d5f', 'soil'), -0.6, -0.01 + i * 0.001, -0.6, 28)
      for (const [x, z, s, c] of [[-3, 2.8, 1.2, '#d8c79a'], [2.8, -2.8, 1.1, '#a7a29a'], [3.2, 2.4, 0.9, '#c98b6b']] as const) k.add(new THREE.ConeGeometry(s * 1.4, s * 1.5, 14), M(c, 'soil'), { x, y: s * 0.75, z })
      conveyor(k, -1.0, 2.6, 1.6, 1.6, '#a7a29a')
      const crane = new THREE.Group(); crane.position.set(-3.2, 0, -3.0)
      crane.add(sub(kk => {
        kk.rbox(1.6, 0.8, 1.2, M(C.rail, 'metal'), 0, 0, 0, 0.08)
        for (const [a, b] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) kk.box(0.08, 7, 0.08, M(C.rail, 'metal'), a, 0.8, b)
        for (let y = 1.2; y < 7.6; y += 0.7) kk.box(0.5, 0.04, 0.04, M(C.rail), 0, y, 0.25, { detail: true })
        kk.box(6.5, 0.3, 0.3, M(C.rail, 'metal'), 2.5, 7.8, 0); kk.box(1.6, 0.8, 0.8, M('#4a4a52', 'metal'), -1.2, 7.5, 0)
        kk.cyl(0.02, 0.02, 3.6, M('#333'), 4.8, 4.2, 0, 4); kk.box(0.6, 0.4, 0.6, M('#4a4a52', 'metal'), 4.8, 3.9, 0)
        kk.rbox(0.9, 0.7, 0.8, glassM(true), 0.6, 7.2, 0.45, 0.06)
      }))
      extra.add(crane); swing = crane
      // Dump truck.
      at(k, 1.4, 0, 3.4, 0, () => { k.rbox(2.6, 0.9, 1.3, M('#e3b23c', 'metal'), 0, 0.45, 0, 0.08); k.rbox(0.9, 0.9, 1.2, glassM(false), 1.4, 0.7, 0, 0.08); for (const x of [-0.9, 0.9]) for (const z of [-0.65, 0.65]) k.cyl(0.4, 0.4, 0.3, M('#1f2024'), x, 0.4, z, 12, { rx: Math.PI / 2 }) })
      sign(k, name, '#a88d5f', -3, 0.2, 3.9, 2.2)
      emit.push({ x: 0, y: 1, z: 0, steam: true })
      break
    }
    case 'sawmill': case 'joinery': {
      hall(k, { w: 7, d: 4.6, h: 3.6 + L * 0.15, color: type === 'joinery' ? '#b98652' : '#a8744a', surf: 'wood', roof: 'gable', x: -0.6, z: -1.2, doors: 1 }, L, seed)
      sign(k, name, '#6b4a30', -0.6, 3.0, 1.15, 3.2)
      // Log piles (stacked cylinders) and board stacks.
      for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) k.cyl(0.32, 0.32, 2.6, M('#8a5a36', 'wood'), 2.0 + i * 0.66 + r * 0.33, r * 0.56, 2.8, 12, { rx: Math.PI / 2 })
      for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) k.box(2.2, 0.1, 0.9, M('#d7b48a', 'wood'), -2.6 + i * 1.1, 0.12 + j * 0.12, 3.4, { ry: i * 0.05 })
      conveyor(k, -4.2, -0.8, 0.8, 2.2, '#8a5a36')
      if (type === 'sawmill') emit.push({ x: 2.6, y: 4.5, z: -1, steam: true })
      break
    }
    case 'kiln': case 'brickworks': {
      const top = hall(k, { w: 7, d: 4.4, h: 3.8 + L * 0.15, color: '#7f8b98', surf: 'brick', roof: 'flat', x: -0.8, z: -1.3, doors: 1 }, L, seed)
      sign(k, name, '#7a2f22', -0.8, top - 1.5, 0.95, 3.2)
      // Beehive kilns.
      for (const x of [2.5, 3.8]) { k.sphere(0.9, M('#a8503c', 'brick'), x, 0, 2.6, {}, 16, true); k.box(0.5, 0.7, 0.2, M(C.dark), x, 0, 3.45) }
      emit.push(chimney(k, -3.6, -3.3, 8 + L * 0.3, 0.5, true))
      for (let i = 0; i < 3; i++) pallet(k, -3.4 + i * 1.3, 3.3, 2, type === 'kiln' ? '#d0705a' : '#7f8b98')
      break
    }
    case 'foundry': case 'steelmill': {
      const h = 5 + L * 0.25
      const top = hall(k, { w: 6.4, d: 4.8, h, color: '#7d8794', roof: 'gable', x: -1, z: -1.4, doors: 1 }, L, seed)
      void top
      sign(k, name, '#3d4148', -1, h - 1.6, 1.05, 3.2)
      // Blast furnace / converter with banding, skip hoist.
      k.cyl(0.9, 1.3, h + 1.5, M('#5a5f66', 'metal'), 3.2, 0, -2.6, 20)
      for (let y = 1; y < h + 1.5; y += 1) k.cyl(1.32 - y * 0.03, 1.32 - y * 0.03, 0.08, M('#3a3f46', 'metal'), 3.2, y, -2.6, 20, { detail: true })
      k.add(new THREE.BoxGeometry(0.4, h + 2.6, 0.4), M(C.rail, 'metal'), { x: 2.0, y: (h + 2.6) / 2, z: -0.4, rx: 0.45 })
      emit.push(chimney(k, 3.6, 1.0, h + 4 + L * 0.2, 0.45))
      if (type === 'steelmill') emit.push(chimney(k, 2.4, 2.4, h + 3, 0.38))
      // Catwalk between hall and furnace.
      k.box(1.8, 0.08, 0.8, M('#6f7a88', 'metal'), 2.0, h - 0.6, -2.6); railing(k, 1.1, 2.9, h - 0.52, -2.2)
      // Ingot stacks.
      for (let i = 0; i < 3; i++) at(k, -3.2 + i * 1.2, 0, 3.3, 0, () => { for (let j = 0; j < 3; j++) k.rbox(0.9, 0.25, 0.35, M('#b9c0c9', 'metal', { metal: 0.8, rough: 0.3 }), 0, j * 0.26, (j % 2) * 0.2 - 0.1, 0.04) })
      break
    }
    case 'crateyard': {
      k.box(9, 0.06, 6, M('#8e8a84', 'asphalt'), 0, 0, 0.5)
      // Office shed and stacked crates in rows, forklift.
      block(k, { w: 3, d: 2.4, floors: 1, color: '#c8a46e', surf: 'concrete', x: -2.6, z: -2.6 }, L, seed)
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) pallet(k, -0.2 + c * 1.3, -2.6 + r * 1.4, 1 + ((r + c + L) % 3), '#c8a46e')
      for (let c = 0; c < 4; c++) pallet(k, -3.4 + c * 1.3, 1.6, 2, '#b48a5a')
      at(k, 2.0, 0, 2.8, 0.6, () => { k.rbox(1.4, 0.7, 0.9, M('#e3b23c', 'metal'), 0, 0.2, 0, 0.08); k.box(0.08, 2, 0.08, M(C.dark, 'metal'), 0.75, 0.2, 0.3); k.box(0.08, 2, 0.08, M(C.dark, 'metal'), 0.75, 0.2, -0.3); k.box(0.9, 0.05, 0.6, M(C.dark, 'metal'), 1.15, 0.3, 0); for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) k.cyl(0.2, 0.2, 0.18, M('#1f2024'), x, 0.2, z, 10, { rx: Math.PI / 2 }); k.box(0.9, 0.05, 0.8, M(C.dark, 'metal'), -0.1, 1.5, 0) })
      chainFence(k, -4.4, 3.6, 4.4, 3.6)
      sign(k, name, '#8a6a3c', -2.6, 2.1, -1.35, 2.4)
      break
    }
    // ---------------- tech ----------------
    case 'lab': {
      const top = block(k, { w: 6.4, d: 5, floors: fl(2, 6), color: '#eef3f6', surf: 'concrete', trim: '#c7d5dc' }, L, seed)
      k.sphere(1.6, M('#bfe3d5', 'plain', { rough: 0.25, metal: 0.4 }), -1, top, -0.6, {}, 24, true)
      k.box(0.3, 1.0, 3.2, M('#2f3640'), -1, top + 0.8, -0.6, { detail: true }) // dome slit
      antenna(k, 2.2, top, -1.6, 4)
      sign(k, name, '#2f8f7a', 0, 2.7, 2.55, 3)
      emit.push({ x: 2.2, y: top + 0.6, z: 1.4, steam: true })
      break
    }
    case 'fab': case 'displayfab': {
      const top = block(k, { w: 7.2, d: 5, floors: fl(1, 4), fh: 2.3, color: '#f2f4f6', surf: 'concrete', trim: '#c9d3dc', frame: '#6dbf9e' }, L, seed)
      for (let i = 0; i < 3; i++) hvac(k, -2.4 + i * 2.2, top, 1.2, true)
      // Gas bottle bank and bulk tanks.
      for (let i = 0; i < 6; i++) k.cyl(0.14, 0.14, 1.2, M(['#6dbf9e', '#e8e6e1', '#5d6bd4'][i % 3], 'metal'), 4.0, 0, -2 + i * 0.32, 10)
      tank(k, -3.6, -3.4, 0.5, 1.6, '#e8e6e1')
      sign(k, name, '#2f8f7a', 0, 2.8, 2.55, 3.2)
      break
    }
    case 'assembly': case 'devices': case 'motorworks': {
      const long = type === 'motorworks'
      const top = hall(k, { w: 8.4, d: long ? 4 : 4.8, h: 4 + L * 0.18, color: type === 'devices' ? '#4a5568' : type === 'motorworks' ? '#c8c2b6' : '#5d6bd4', roof: type === 'devices' ? 'flat' : 'saw', z: long ? -2 : -1.4, doors: 2 }, L, seed)
      sign(k, name, shade(color, 0.6), 0, (type === 'devices' ? top : 4) - 1.2, long ? 0.05 : 1.05, 3.4)
      if (type === 'devices' && L >= 4) block(k, { w: 2.8, d: 2.4, floors: fl(2, 7), color: '#334c7a', glassy: true, frame: '#c9d3dc', x: 2.6, z: -3.0, door: false }, L, seed + 2)
      if (long) {
        // Test track loop with cars.
        k.box(8.6, 0.05, 2.8, M('#6a6d73', 'asphalt'), 0, 0, 2.6)
        for (let i = 0; i < 9; i++) k.box(0.5, 0.06, 0.08, M(C.white), -3.6 + i * 0.9, 0.01, 2.6, { detail: true })
        car(k, -2.2, 2.0, 0, '#d64545'); car(k, 1.4, 3.2, Math.PI, '#2eaf7d'); car(k, 3.4, 2.0, 0, '#f2f2f2', true)
      } else { for (let i = 0; i < 3; i++) pallet(k, -3 + i * 1.3, 3.3, 2, '#5d6bd4') ; conveyor(k, 1.2, 4.3, 0.9, 3.2, '#e9eef2') }
      break
    }
    // ---------------- retail ----------------
    case 'fuelstop': {
      // Canopy on columns over pump islands + small shop.
      shop(k, { w: 4.4, d: 3, floors: 1, color: '#efe6d6', name, awning: '#e3b23c' }, L, seed)
      at(k, 0, 0, 0, 0, () => { void 0 })
      for (const x of [-3.2, 3.2]) k.box(0.3, 3.6, 0.3, M('#f2f2f2'), x, 0, 3.2)
      k.rbox(8, 0.5, 2.8, M('#e3b23c', 'metal'), 0, 3.6, 3.2, 0.08)
      k.box(8, 0.06, 2.8, bulbM(), 0, 3.56, 3.2, { detail: true })
      for (const x of [-1.6, 1.6]) { k.box(1.8, 0.2, 0.6, M(C.concrete, 'concrete'), x, 0, 3.2); for (const s of [-0.4, 0.4]) { k.rbox(0.5, 1.3, 0.35, M('#d64545', 'metal'), x + s, 0.2, 3.2, 0.05); k.plane(0.35, 0.25, glassM(true), { x: x + s, y: 1.2, z: 3.38 }) } }
      car(k, 0, 4.1, 0, '#5d6bd4')
      break
    }
    case 'carlot': {
      shop(k, { w: 5.4, d: 3, floors: 1 + Math.floor(L / 6), color: '#f2f4f6', name, awning: '#d64545', surf: 'concrete' }, L, seed)
      k.box(9, 0.05, 4.6, M('#6a6d73', 'asphalt'), 0, 0, 1.8)
      const cols = ['#d64545', '#2eaf7d', '#f2f2f2', '#334c7a', '#e3b23c', '#7e57c2']
      for (let i = 0; i < 6; i++) { car(k, -3.4 + (i % 3) * 3.4, 1.4 + Math.floor(i / 3) * 1.8, Math.PI / 2, cols[i], i === 5); k.box(0.06, 0.02, 1.7, M(C.white), -1.7 + (i % 3) * 3.4, 0.06, 1.4 + Math.floor(i / 3) * 1.8, { detail: true }) }
      for (const x of [-4.2, 4.2]) { k.cyl(0.05, 0.05, 3.4, M(C.steel, 'metal'), x, 0, 3.8, 6); for (let i = 0; i < 3; i++) k.box(0.3, 0.4, 0.02, M(cols[i]), x, 2.4 + i * 0.4, 3.84, { detail: true }) }
      break
    }
    default: {
      if (kind === 'retail') {
        const look: Record<string, [string, string, 'brick' | 'concrete']> = {
          market: ['#e9d9c2', '#e07a5f', 'brick'], outfitter: ['#c9d9ea', '#5c7c99', 'brick'], buildmart: ['#e8d8bd', '#d07a3a', 'concrete'],
          gadget: ['#dfe3f5', '#5d6bd4', 'concrete'], homestore: ['#ece3f5', '#8e7cc3', 'brick'],
        }
        const [wall, aw, surf] = look[type] ?? ['#efe6d6', color, 'brick']
        shop(k, { w: 7.6, d: 5.2, floors: fl(1, 6), color: wall, name, awning: aw, surf }, L, seed)
        // Sidewalk furniture: bench, bike rack, sandwich board.
        k.box(1.4, 0.08, 0.4, M('#9c6b45', 'wood'), -3, 0.45, 3.6); for (const x of [-3.5, -2.5]) k.box(0.08, 0.45, 0.35, M(C.dark, 'metal'), x, 0, 3.6)
        for (let i = 0; i < 3; i++) k.add(new THREE.TorusGeometry(0.3, 0.03, 4, 12, Math.PI), M(C.steel, 'metal'), { x: 2.2 + i * 0.4, y: 0, z: 3.6, ry: Math.PI / 2, detail: true })
        k.box(0.6, 0.8, 0.05, signM('OPEN', aw), 3.6, 0, 3.4, { rx: -0.2 })
        if (type === 'buildmart') for (let i = 0; i < 2; i++) pallet(k, 3.2, -3.2 + i * 1.3, 2, '#d7b48a')
      } else {
        const top = hall(k, { w: 7.6, d: 5, h: 4 + L * 0.2, color, roof: 'saw', z: -1, doors: 2 }, L, seed)
        sign(k, name, shade(color, 0.6), 0, 2.8, 1.62, 3.2)
        emit.push(chimney(k, 3.2, -3.4, top + 3, 0.4))
      }
    }
  }
  const g = k.build()
  g.add(extra)
  return { g, emit, spin, nod, swing }
}
