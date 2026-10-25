// ============================================================================
// Detailed 2D (SVG) building models for the 2D campus view.
//
// Mirrors the iso 3D models (src/scene3d/models.ts) type-for-type so the 2D
// fallback has the same level of detail: framed windows, cornices, parapets,
// rooftop HVAC / vents / pipes, loading docks, named signs, striped awnings,
// type props (crop rows, tanks, cranes, pumpjacks, car lots…), per-level
// growth (floors, wings, rooftop gear), shading and soft shadows, sidewalks
// with planters and lamps, and lit windows at night.
//
// Geometry: every model is drawn in "plot space": u runs toward the lower
// right, v toward the lower left, z is height in px. P() projects to screen.
// A Pen collects shapes with a depth key (u+v) and draws back-to-front, so
// props in front of a building correctly overlap it.
//
// Lightweight by design: plain polygons, a few shared <defs> (gradients and
// one blur filter, see Defs2D), and CSS animations (.spin/.nod/.belt/.sway/
// .smoke/.shopper/.spark) that the reduced-motion media query switches off.
// ============================================================================
import type { JSX } from 'react'
import { BLD } from '../game/data'
import { shade } from './icons'

const HW = 64, HH = 32 // half tile width / height (matches campus.tsx)
const FLOOR = 11 // px per floor

/** Shared gradients and the soft-shadow filter; render once per <svg>. */
export const Defs2D = () => (
  <>
    <linearGradient id="g2-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9ecfb" /><stop offset="1" stopColor="#7fa6c6" /></linearGradient>
    <linearGradient id="g2-lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff2b8" /><stop offset="1" stopColor="#ffc35a" /></linearGradient>
    <linearGradient id="g2-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></linearGradient>
    <linearGradient id="g2-metal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8d96a0" /><stop offset=".45" stopColor="#e3e8ec" /><stop offset="1" stopColor="#7b838d" /></linearGradient>
    <linearGradient id="g2-solar" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3b5b9a" /><stop offset="1" stopColor="#1d2f57" /></linearGradient>
    <filter id="g2-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" /></filter>
    <filter id="g2-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6" /></filter>
  </>
)

type Pt = [number, number]

/** Collects shapes with a depth key and renders them back-to-front. */
class Pen {
  items: { d: number; el: JSX.Element }[] = []
  n = 0
  x: number; y: number; night: boolean; busy: boolean
  constructor(x: number, y: number, night: boolean, busy: boolean) { this.x = x; this.y = y; this.night = night; this.busy = busy }
  /** Plot-space to screen. */
  P(u: number, v: number, z = 0): Pt { return [this.x + ((u - v) * HW) / 2, this.y + ((u + v) * HH) / 2 - z] } // u,v = ±1 at the tile corners
  pts(a: Pt[]) { return a.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ') }
  add(d: number, el: (k: string) => JSX.Element) { this.items.push({ d: d + this.n * 1e-5, el: el(`k${this.n++}`) }) }
  poly(d: number, a: Pt[], fill: string, extra: Record<string, unknown> = {}) { this.add(d, k => <polygon key={k} points={this.pts(a)} fill={fill} {...extra} />) }
  render() { return this.items.sort((a, b) => a.d - b.d).map(i => i.el) }
}

interface BoxOpt {
  u: number; v: number; a: number; b: number; z?: number; h: number; color: string
  floors?: number // window rows
  cols?: number // windows per row on the long face
  cornice?: boolean; parapet?: boolean; door?: boolean; dock?: number // number of dock doors (right face)
  roof?: 'flat' | 'gable' | 'saw' | 'none'; roofColor?: string
  gear?: number // rooftop HVAC units
  sign?: string; signColor?: string
  awning?: string; display?: boolean // shop front: awning stripes + big display windows
  glassy?: boolean // curtain-wall glass (labs, fabs)
}

/** A detailed iso building box: faces, windows with frames, roof and trims. */
function box(p: Pen, o: BoxOpt) {
  const { u, v, a, b, h } = o, z = o.z ?? 0, d = u + v
  // At night, surfaces darken (lit windows don't), so windows read as glowing.
  const color = p.night ? shade(o.color, 0.6) : o.color
  const L: Pt[] = [p.P(u - a, v + b, z), p.P(u + a, v + b, z), p.P(u + a, v + b, z + h), p.P(u - a, v + b, z + h)] // front-left face (v = +b)
  const R: Pt[] = [p.P(u + a, v + b, z), p.P(u + a, v - b, z), p.P(u + a, v - b, z + h), p.P(u + a, v + b, z + h)] // front-right face (u = +a)
  const T: Pt[] = [p.P(u - a, v - b, z + h), p.P(u + a, v - b, z + h), p.P(u + a, v + b, z + h), p.P(u - a, v + b, z + h)]
  // Soft ground shadow (one blurred polygon, offset to the right like the 3D sun).
  if (z === 0) p.poly(d - 5, [p.P(u - a, v + b), p.P(u + a + 0.12, v + b + 0.02), p.P(u + a + 0.25, v - b - 0.1), p.P(u - a + 0.1, v - b)], '#2b3a1e', { opacity: 0.28, filter: 'url(#g2-blur)' })
  p.poly(d, L, o.glassy ? shade(color, 0.85) : shade(color, 0.82), { stroke: shade(color, 0.55), strokeWidth: 0.5 })
  p.poly(d, R, o.glassy ? shade(color, 0.7) : shade(color, 0.66), { stroke: shade(color, 0.5), strokeWidth: 0.5 })
  // Subtle vertical sheen on the lit face.
  p.poly(d + 0.001, L, 'url(#g2-sheen)')
  // Point on a face: s along width 0..1, t up 0..1.
  const fL = (s: number, t: number) => p.P(u - a + 2 * a * s, v + b, z + h * t)
  const fR = (s: number, t: number) => p.P(u + a, v + b - 2 * b * s, z + h * t)
  const lit = p.night ? 'url(#g2-lit)' : 'url(#g2-glass)'
  const frame = shade(color, 0.45)
  /** One framed window on a face at (s,t) of size (ws,wt), as fractions. */
  const win = (f: typeof fL, s: number, t: number, ws: number, wt: number, on = true) => {
    const q = [f(s, t), f(s + ws, t), f(s + ws, t + wt), f(s, t + wt)]
    p.poly(d + 0.002, q, on ? lit : 'url(#g2-glass)', { stroke: frame, strokeWidth: 0.7 })
    // Mullion + sill.
    const m1 = f(s + ws / 2, t), m2 = f(s + ws / 2, t + wt), s1 = f(s - 0.01, t), s2 = f(s + ws + 0.01, t)
    p.add(d + 0.003, k => <g key={k} stroke={frame} strokeWidth=".6"><line x1={m1[0]} y1={m1[1]} x2={m2[0]} y2={m2[1]} /><line x1={s1[0]} y1={s1[1] + 0.6} x2={s2[0]} y2={s2[1] + 0.6} strokeWidth="1.3" stroke={shade(color, 1.15)} /></g>)
  }
  const rows = o.floors ?? 0, cols = o.cols ?? 3
  if (o.glassy && rows) {
    // Curtain wall: horizontal glass bands with thin spandrels.
    for (let r = 0; r < rows; r++) { const t0 = (r + 0.22) / (rows + 0.3), th = 0.62 / (rows + 0.3); for (const f of [fL, fR]) { const q = [f(0.04, t0), f(0.96, t0), f(0.96, t0 + th), f(0.04, t0 + th)]; p.poly(d + 0.002, q, lit, { stroke: frame, strokeWidth: 0.5 }) } }
  } else for (let r = 0; r < rows; r++) {
    const t0 = (r + 0.3) / (rows + 0.45), wt = 0.5 / (rows + 0.45)
    const shopRow = o.display && r === 0
    if (shopRow) { win(fL, 0.08, 0.06, 0.38, 0.42); win(fL, 0.56, 0.06, 0.36, 0.42) }
    else for (let c = 0; c < cols; c++) win(fL, (c + 0.22) / cols, t0, 0.56 / cols, wt, p.night ? (r * 7 + c * 3) % 5 !== 0 : true)
    if (!(o.dock && r === 0)) for (let c = 0; c < Math.max(1, cols - 1); c++) win(fR, (c + 0.25) / Math.max(1, cols - 1), t0, 0.5 / Math.max(1, cols - 1), wt, p.night ? (r + c) % 4 !== 1 : true)
  }
  // Door on the front-left face.
  if (o.door !== false && !o.display) { const q = [fL(0.45, 0), fL(0.57, 0), fL(0.57, Math.min(0.5, 14 / h)), fL(0.45, Math.min(0.5, 14 / h))]; p.poly(d + 0.004, q, shade(color, 0.4), { stroke: shade(color, 0.3), strokeWidth: 0.6 }) }
  // Loading docks: roll-up doors with stripes + bumpers on the right face.
  for (let k = 0; k < (o.dock ?? 0); k++) {
    const s = (k + 0.18) / o.dock!, w = 0.6 / o.dock!, ht = Math.min(0.55, 16 / h)
    p.poly(d + 0.004, [fR(s, 0), fR(s + w, 0), fR(s + w, ht), fR(s, ht)], '#9aa1a8', { stroke: '#5d636a', strokeWidth: 0.6 })
    for (let l = 1; l < 4; l++) { const y1 = fR(s, (ht * l) / 4), y2 = fR(s + w, (ht * l) / 4); p.add(d + 0.005, kk => <line key={kk} x1={y1[0]} y1={y1[1]} x2={y2[0]} y2={y2[1]} stroke="#7b828a" strokeWidth=".6" />) }
    const b1 = fR(s - 0.03, 0.02), b2 = fR(s + w + 0.03, 0.02); p.add(d + 0.005, kk => <line key={kk} x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} stroke="#e3b23c" strokeWidth="2" strokeDasharray="2 2" />)
  }
  // Canopy: a flat, solid-colour modern canopy over the shop front (was a
  // striped fabric awning). Same footprint, so layout doesn't move.
  if (o.awning) {
    const N = 8, t = Math.min(0.62, 20 / h)
    for (let i = 0; i < N; i++) {
      const s0 = i / N, s1 = (i + 1) / N
      const A = fL(s0, t), B = fL(s1, t), C2 = p.P(u - a + 2 * a * s1, v + b + 0.12, z + h * t - 6), D = p.P(u - a + 2 * a * s0, v + b + 0.12, z + h * t - 6)
      p.poly(d + 0.006, [A, B, C2, D], i % 2 ? shade(o.awning, 1.06) : o.awning, { stroke: shade(o.awning, 0.9), strokeWidth: 0.2 })
    }
    // LED strip along the canopy edge (was a scalloped valance).
    const v0 = p.P(u - a, v + b + 0.12, z + h * t - 6), v1 = p.P(u + a, v + b + 0.12, z + h * t - 6)
    p.add(d + 0.007, k => <line key={k} x1={v0[0]} y1={v0[1]} x2={v1[0]} y2={v1[1]} stroke="#e8fbff" strokeWidth="1.6" strokeLinecap="round" />)
  }
  // Sign board with the business name, skewed onto the front-left face.
  if (o.sign) {
    const t = o.awning ? Math.min(0.9, 26 / h) : 0.86
    const [sx, sy] = fL(0.5, t), wpx = Math.min(a * HW * 0.85, o.sign.length * 4.6 + 10)
    const sc = o.signColor ?? shade(color, 0.45)
    p.add(d + 0.008, k => <g key={k} transform={`matrix(1,0.5,0,1,${sx},${sy})`}>
      <rect x={-wpx / 2} y={-6} width={wpx} height={10} rx="1.6" fill={sc} stroke="#fff" strokeWidth=".6" />
      <text x="0" y="1.6" textAnchor="middle" fontSize={Math.min(6.2, (wpx - 4) / (o.sign!.length * 0.58))} fontWeight="800" fill="#fffaf0" style={{ letterSpacing: '.2px' }}>{o.sign}</text>
      {p.night && <rect x={-wpx / 2} y={-6} width={wpx} height={10} rx="1.6" fill="#ffe8a0" opacity=".25" filter="url(#g2-glow)" />}
    </g>)
  }
  // Roof.
  const rc = p.night ? shade(o.roofColor ?? shade(o.color, 0.5), 0.6) : o.roofColor ?? shade(color, 0.5)
  // Modern look: pitched 'gable' (tiled) roofs draw as flat roofs with a row
  // of solar panels, so every building reads as glass-and-steel.
  const solar = o.roof === 'gable'
  const roof = (o.roof === 'gable' ? 'flat' : o.roof ?? 'flat') as BoxOpt['roof']
  if (roof === 'flat' || roof === 'none') {
    p.poly(d + 0.01, T, roof === 'none' ? shade(color, 1.08) : '#a7a39b', { stroke: shade(color, 0.6), strokeWidth: 0.6 })
    if (o.parapet !== false && roof === 'flat') {
      // Parapet rim (inner top inset) and cornice band under it.
      const i2 = 0.05, T2: Pt[] = [p.P(u - a + i2, v - b + i2, z + h), p.P(u + a - i2, v - b + i2, z + h), p.P(u + a - i2, v + b - i2, z + h), p.P(u - a + i2, v + b - i2, z + h)]
      p.poly(d + 0.011, T2, '#8f8b84')
    }
    if (o.cornice !== false) {
      const c1 = p.P(u - a, v + b, z + h - 2), c2 = p.P(u + a, v + b, z + h - 2), c3 = p.P(u + a, v - b, z + h - 2)
      p.add(d + 0.012, k => <polyline key={k} points={p.pts([c1, c2, c3])} fill="none" stroke={shade(color, 1.2)} strokeWidth="2.4" strokeLinejoin="round" />)
    }
    // Solar array (on what used to be pitched roofs): dark blue panels with
    // a light frame, in two rows across the roof.
    if (solar) for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const u0 = u - a * 0.8 + (c * 1.6 * a) / 3, u1 = u0 + (1.6 * a) / 3 - 0.03
      const v0 = v - b * 0.7 + r * b * 0.75, v1 = v0 + b * 0.6
      p.poly(d + 0.02 + (r * 3 + c) * 1e-4, [p.P(u0, v0, z + h + 2), p.P(u1, v0, z + h + 2), p.P(u1, v1, z + h + 4), p.P(u0, v1, z + h + 4)], '#2a4a7a', { stroke: '#cfe0f5', strokeWidth: 0.5 })
    }
    // Rooftop gear: HVAC boxes with fan grilles, vent stacks and a pipe run.
    for (let g = 0; g < (o.gear ?? 0); g++) {
      const gu = u - a * 0.5 + ((g * 0.37) % 1) * a, gv = v - b * 0.4 + ((g * 0.61) % 1) * b * 0.8
      unit(p, gu, gv, z + h, g)
    }
    if ((o.gear ?? 0) >= 2) {
      const q1 = p.P(u - a * 0.7, v - b * 0.6, z + h + 2), q2 = p.P(u + a * 0.6, v - b * 0.6, z + h + 2)
      p.add(d + 0.05, k => <line key={k} x1={q1[0]} y1={q1[1]} x2={q2[0]} y2={q2[1]} stroke="url(#g2-metal)" strokeWidth="2" strokeLinecap="round" />)
    }
  } else if (roof === 'gable') {
    const rh = Math.min(16, a * 18)
    const A = p.P(u - a, v - b, z + h), B = p.P(u + a, v - b, z + h), C2 = p.P(u + a, v + b, z + h), D = p.P(u - a, v + b, z + h)
    const r1 = p.P(u - a, v, z + h + rh), r2 = p.P(u + a, v, z + h + rh)
    p.poly(d + 0.01, [A, B, r2, r1], shade(rc, 0.8))
    p.poly(d + 0.011, [D, C2, r2, r1], rc, { stroke: shade(rc, 0.6), strokeWidth: 0.6 })
    p.poly(d + 0.012, [B, C2, r2], shade(color, 0.6), { stroke: shade(color, 0.45), strokeWidth: 0.5 })
    // Shingle lines.
    for (let l = 1; l < 4; l++) { const e1 = p.P(u - a, v + b * (1 - l / 4), z + h + rh * (l / 4)), e2 = p.P(u + a, v + b * (1 - l / 4), z + h + rh * (l / 4)); p.add(d + 0.013, k => <line key={k} x1={e1[0]} y1={e1[1]} x2={e2[0]} y2={e2[1]} stroke={shade(rc, 0.65)} strokeWidth=".6" />) }
  } else if (roof === 'saw') {
    p.poly(d + 0.01, T, '#a7a39b')
    const N = Math.max(3, Math.round(a * 6))
    for (let i = 0; i < N; i++) {
      const u0 = u - a + (2 * a * i) / N, u1 = u - a + (2 * a * (i + 1)) / N
      const A = p.P(u0, v + b, z + h), B = p.P(u0, v - b, z + h), C2 = p.P(u1, v - b, z + h + 8), D = p.P(u1, v + b, z + h + 8)
      p.poly(d + 0.011 + i * 1e-4, [A, B, C2, D], shade(rc, 0.95), { stroke: shade(rc, 0.6), strokeWidth: 0.5 })
      const E1 = p.P(u1, v + b, z + h), F1 = p.P(u1, v - b, z + h)
      p.poly(d + 0.0111 + i * 1e-4, [D, C2, F1, E1], p.night ? 'url(#g2-lit)' : 'url(#g2-glass)', { stroke: shade(rc, 0.5), strokeWidth: 0.5 })
    }
  }
}

/** Rooftop HVAC unit with a fan grille. */
function unit(p: Pen, u: number, v: number, z: number, i: number) {
  const s = 0.09
  box(p, { u, v, a: s, b: s * 0.8, z, h: 5, color: '#c9cdd2', roof: 'none', cornice: false, door: false })
  const [cx, cy] = p.P(u, v, z + 5)
  p.add(u + v + 0.02, k => <g key={k}><ellipse cx={cx} cy={cy} rx="3.2" ry="1.6" fill="#6f767e" /><line x1={cx - 2.6} y1={cy} x2={cx + 2.6} y2={cy} stroke="#9aa1a8" strokeWidth=".5" className={i % 2 ? 'spin' : ''} style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: 'view-box' } as any} /></g>)
}

/** Vertical cylinder (tank, silo, chimney). */
function cyl(p: Pen, u: number, v: number, r: number, h: number, color: string, opt: { z?: number; bands?: number; cap?: 'flat' | 'dome'; ladder?: boolean } = {}) {
  const z = opt.z ?? 0, [cx, cy] = p.P(u, v, z), rx = r * HW * 0.6, ry = rx / 2, d = u + v
  if (z === 0) p.add(d - 5, k => <ellipse key={k} cx={cx + rx * 0.4} cy={cy + 2} rx={rx * 1.15} ry={ry * 1.1} fill="#2b3a1e" opacity=".25" filter="url(#g2-blur)" />)
  p.add(d, k => <g key={k}>
    <path d={`M${cx - rx},${cy - h} L${cx - rx},${cy} A${rx},${ry} 0 0 0 ${cx + rx},${cy} L${cx + rx},${cy - h}Z`} fill={color} />
    <path d={`M${cx - rx},${cy - h} L${cx - rx},${cy} A${rx},${ry} 0 0 0 ${cx + rx},${cy} L${cx + rx},${cy - h}Z`} fill="url(#g2-metal)" opacity=".45" />
    {Array.from({ length: opt.bands ?? 0 }, (_, i) => { const yy = cy - (h * (i + 1)) / ((opt.bands ?? 0) + 1); return <path key={i} d={`M${cx - rx},${yy} A${rx},${ry} 0 0 0 ${cx + rx},${yy}`} fill="none" stroke={shade(color, 0.6)} strokeWidth=".8" /> })}
    {opt.ladder && <g stroke="#5d636a" strokeWidth=".6"><line x1={cx + rx * 0.3} y1={cy + ry - 1} x2={cx + rx * 0.3} y2={cy - h + ry} /><line x1={cx + rx * 0.5} y1={cy + ry * 0.8} x2={cx + rx * 0.5} y2={cy - h + ry * 0.8} />{Array.from({ length: Math.floor(h / 4) }, (_, i) => <line key={i} x1={cx + rx * 0.3} y1={cy + ry - 2 - i * 4} x2={cx + rx * 0.5} y2={cy + ry * 0.8 - 2 - i * 4} />)}</g>}
    {opt.cap === 'dome' ? <path d={`M${cx - rx},${cy - h} A${rx},${rx * 0.8} 0 0 1 ${cx + rx},${cy - h} A${rx},${ry} 0 0 1 ${cx - rx},${cy - h}`} fill={shade(color, 1.15)} />
      : <ellipse cx={cx} cy={cy - h} rx={rx} ry={ry} fill={shade(color, 1.18)} stroke={shade(color, 0.7)} strokeWidth=".6" />}
  </g>)
  return [cx, cy - h] as Pt
}

/** Smoke puffs (CSS-animated) rising from a screen point; only while busy. */
function smoke(p: Pen, at: Pt, d: number, steam = false) {
  if (!p.busy) return
  p.add(d + 1, k => <g key={k} className={`smoke2 ${steam ? 'steam' : ''}`}>{[0, 1, 2, 3].map(i => <circle key={i} cx={at[0]} cy={at[1]} r={3 + i} style={{ animationDelay: `${i * 0.7}s` }} />)}</g>)
}

/** Chimney stack with a cap and red/white bands; returns its top. */
function chimney(p: Pen, u: number, v: number, h: number) {
  const top = cyl(p, u, v, 0.05, h, '#b9b3aa', { bands: 2 })
  smoke(p, [top[0], top[1] - 2], u + v)
  return top
}

/** Tree (round crown with highlight and a trunk). */
function tree(p: Pen, u: number, v: number, s = 1, col = '#78b35e') {
  const [x, y] = p.P(u, v)
  p.add(u + v, k => <g key={k} className="sway" style={{ transformOrigin: `${x}px ${y}px` }}>
    <ellipse cx={x + 3} cy={y + 1} rx={7 * s} ry={3 * s} fill="#2b3a1e" opacity=".22" />
    <rect x={x - 1} y={y - 7 * s} width="2" height={7 * s} fill="#7a5a3c" />
    <circle cx={x} cy={y - 11 * s} r={7 * s} fill={col} /><circle cx={x - 2 * s} cy={y - 13 * s} r={3.5 * s} fill={shade(col, 1.2)} />
  </g>)
}

/** Parked / driving car seen from the iso angle. */
function car(p: Pen, u: number, v: number, col: string, along: 'u' | 'v' = 'u') {
  const l = 0.11, w = 0.06, [du, dv] = along === 'u' ? [l, w] : [w, l]
  box(p, { u, v, a: du, b: dv, h: 3.5, color: col, roof: 'none', cornice: false, door: false })
  box(p, { u: u - (along === 'u' ? 0.015 : 0), v: v - (along === 'v' ? 0.015 : 0), a: du * 0.55, b: dv * 0.85, z: 3.5, h: 3, color: '#cfe3f3', roof: 'none', cornice: false, door: false })
}

/** Rows of crops; sways gently. */
function crops(p: Pen, u0: number, v0: number, a: number, b: number, col: string, rows = 5) {
  p.poly(u0 + v0 - 0.5, [p.P(u0 - a, v0 - b), p.P(u0 + a, v0 - b), p.P(u0 + a, v0 + b), p.P(u0 - a, v0 + b)], '#9b7650')
  for (let r = 0; r < rows; r++) {
    const vv = v0 - b + ((r + 0.5) * 2 * b) / rows, A = p.P(u0 - a + 0.03, vv), B = p.P(u0 + a - 0.03, vv)
    p.add(u0 + vv - 0.4, k => <line key={k} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke={col} strokeWidth="4.5" strokeLinecap="round" strokeDasharray="1 3.2" className="sway" style={{ transformOrigin: `${(A[0] + B[0]) / 2}px ${(A[1] + B[1]) / 2}px` }} />)
  }
}

/** Fence along u (front edge). */
function fence(p: Pen, u0: number, u1: number, v: number, col = '#e9dcc4') {
  const A = p.P(u0, v, 0), B = p.P(u1, v, 0)
  p.add(u1 + v, k => <g key={k} stroke={col} strokeWidth="1.2"><line x1={A[0]} y1={A[1] - 5} x2={B[0]} y2={B[1] - 5} /><line x1={A[0]} y1={A[1] - 2} x2={B[0]} y2={B[1] - 2} />{Array.from({ length: 9 }, (_, i) => { const q = p.P(u0 + ((u1 - u0) * i) / 8, v); return <line key={i} x1={q[0]} y1={q[1]} x2={q[0]} y2={q[1] - 7} /> })}</g>)
}

/** Pallet stack with crates. */
function pallet(p: Pen, u: number, v: number, col = '#c79a62', n = 2) {
  box(p, { u, v, a: 0.07, b: 0.07, h: 2, color: '#9c6b45', roof: 'none', cornice: false, door: false })
  for (let i = 0; i < n; i++) box(p, { u, v, a: 0.06, b: 0.06, z: 2 + i * 5, h: 5, color: col, roof: 'none', cornice: false, door: false })
}

/** Shoppers walking to/from a shop door (only while selling); CSS animated. */
function shoppers(p: Pen, u: number, v: number) {
  if (!p.busy) return
  const cols = ['#e07a5f', '#3d85c6', '#81b29a', '#9b5de5']
  for (let i = 0; i < 3; i++) {
    const [x, y] = p.P(u - 0.15 + i * 0.15, v + 0.05)
    p.add(u + v + 0.5, k => <g key={k} className="shopper" style={{ animationDelay: `${i * -1.3}s` }}>
      <circle cx={x} cy={y - 9} r="2" fill="#f1c7a3" /><rect x={x - 2} y={y - 7} width="4" height="6" rx="1.5" fill={cols[i]} /><rect x={x + 1.5} y={y - 4} width="3" height="3" fill="#fffaf0" stroke="#999" strokeWidth=".3" />
    </g>)
  }
}

/** Coin sparkles above a selling shop. */
function sparkles(p: Pen, at: Pt, d: number) {
  if (!p.busy) return
  p.add(d + 2, k => <g key={k} className="spark2">{[0, 1, 2, 3, 4].map(i => <circle key={i} cx={at[0] - 16 + i * 8} cy={at[1]} r="1.8" fill="#ffd34d" style={{ animationDelay: `${i * 0.35}s` }} />)}</g>)
}

/** Modern LED street light: slim pole with a flat head on a short arm. */
function lamp(p: Pen, u: number, v: number) {
  const [x, y] = p.P(u, v)
  p.add(u + v, k => <g key={k}>
    <line x1={x} y1={y} x2={x} y2={y - 20} stroke="#4a515c" strokeWidth="1.3" />
    <line x1={x} y1={y - 20} x2={x + 5} y2={y - 21} stroke="#4a515c" strokeWidth="1.1" />
    <rect x={x + 3} y={y - 22.2} width="5" height="1.8" rx=".6" fill="#2b3038" />
    <rect x={x + 3.4} y={y - 20.6} width="4.2" height=".7" fill="#e8fbff" />
  </g>)
}

/** Plot ground: sidewalk border with curb, planters at the corners, a lamp. */
function ground(p: Pen) {
  const e = 0.94, i = 0.8
  p.poly(-10, [p.P(-e, -e), p.P(e, -e), p.P(e, e), p.P(-e, e)], '#dcd6cb', { stroke: '#bdb6aa', strokeWidth: 1 })
  p.poly(-9.9, [p.P(-i, -i), p.P(i, -i), p.P(i, i), p.P(-i, i)], '#c6dfae')
  // Paver joints on the sidewalk front edges.
  for (let k = 1; k < 8; k++) { const s = -e + (2 * e * k) / 8, a1 = p.P(s, e), a2 = p.P(s, i), b1 = p.P(e, s), b2 = p.P(i, s); p.add(-9.8, kk => <g key={kk} stroke="#c3bcb0" strokeWidth=".5"><line x1={a1[0]} y1={a1[1]} x2={a2[0]} y2={a2[1]} /><line x1={b1[0]} y1={b1[1]} x2={b2[0]} y2={b2[1]} /></g>) }
  for (const [u, v] of [[-0.87, 0.87], [0.87, -0.87]]) { box(p, { u, v, a: 0.06, b: 0.06, h: 3, color: '#a8865f', roof: 'none', cornice: false, door: false }); const [x, y] = p.P(u, v, 3); p.add(u + v + 0.01, k => <circle key={k} cx={x} cy={y - 2} r="3.4" fill="#6fae58" />) }
  lamp(p, 0.87, 0.87)
}

const fl = (L: number, base: number, max: number) => Math.min(max, base + Math.floor(L / 2))

/** Draw one building type at level L into the pen. Mirrors models.ts. */
function model(p: Pen, type: string, level: number, kit = '') {
  const bt = BLD[type], col = bt.color, L = Math.max(1, Math.min(level, 20)), name = bt.name
  const gear = Math.min(4, 1 + Math.floor(L / 4))
  /** Annex wings that grow in at levels 5 and 12. */
  const wings = () => {
    if (L >= 5) box(p, { u: -0.45, v: -0.4, a: 0.25, b: 0.25, h: FLOOR * (1 + Math.floor(L / 6)), color: shade(col, 0.92), floors: 1 + Math.floor(L / 6), cols: 2, door: false, gear: 1 })
    if (L >= 12) box(p, { u: 0.45, v: -0.5, a: 0.22, b: 0.22, h: FLOOR * (2 + Math.floor(L / 8)), color: '#dcd7cf', floors: 2 + Math.floor(L / 8), cols: 2, door: false })
  }
  const hall = (o: Partial<BoxOpt> = {}) => box(p, { u: 0, v: -0.05, a: 0.6, b: 0.42, h: 26 + L * 1.5, color: col, floors: 1, cols: 4, roof: 'saw', dock: 2, sign: name, roofColor: '#8b8f96', ...o })
  const block = (o: Partial<BoxOpt> = {}) => { const f = fl(L, 2, 9); box(p, { u: 0, v: 0, a: 0.5, b: 0.42, h: f * FLOOR + 6, color: col, floors: f, cols: 3, gear, sign: name, ...o }) }
  switch (type) {
    case 'generator': {
      box(p, { u: 0.45, v: 0.35, a: 0.2, b: 0.16, h: 10, color: '#d9cfc0', roof: 'flat', door: true })
      fence(p, 0.2, 0.7, 0.55, '#9aa1a8')
      const n = Math.min(3, 1 + Math.floor(L / 5))
      for (let i = 0; i < n; i++) {
        const u = -0.4 + i * 0.35, v = -0.3 + i * 0.12, hh = 52 + L * 2, [bx, by] = p.P(u, v)
        p.add(u + v, k => <g key={k}>
          <ellipse cx={bx + 6} cy={by + 1} rx="8" ry="3" fill="#2b3a1e" opacity=".25" />
          <polygon points={`${bx - 3},${by} ${bx + 3},${by} ${bx + 1.2},${by - hh} ${bx - 1.2},${by - hh}`} fill="#f4efe6" stroke="#c9bfae" strokeWidth=".6" />
          <rect x={bx - 4} y={by - hh - 3} width="9" height="5" rx="2" fill="#e8e4dc" stroke="#b8b0a0" strokeWidth=".5" />
          <g className={p.busy ? 'spin' : ''} style={{ transformOrigin: `${bx}px ${by - hh}px` }}>{[0, 120, 240].map(a => <path key={a} d={`M${bx},${by - hh} l-2.2,-30 l2.2,-3 l2.2,3z`} fill="#fbf8f2" stroke="#c9bfae" strokeWidth=".5" transform={`rotate(${a} ${bx} ${by - hh})`} />)}</g>
          <circle cx={bx} cy={by - hh} r="2.2" fill={col} />
        </g>)
      }
      break
    }
    case 'pump': {
      box(p, { u: -0.2, v: 0.1, a: 0.4, b: 0.32, h: 16 + L * 2, color: '#8a96a3', floors: 1, cols: 3, roof: 'gable', roofColor: '#5d6670', sign: name })
      const [tx, ty] = p.P(0.5, -0.35), th = 40 + L * 2
      p.add(0.15, k => <g key={k} stroke="#6b7480" strokeWidth="1.6">{[-9, 9].map(dx => <line key={dx} x1={tx + dx} y1={ty} x2={tx + dx * 0.6} y2={ty - th} />)}<line x1={tx - 8} y1={ty - th * 0.4} x2={tx + 8} y2={ty - th * 0.7} strokeWidth=".8" /><line x1={tx + 8} y1={ty - th * 0.4} x2={tx - 8} y2={ty - th * 0.7} strokeWidth=".8" /></g>)
      cyl(p, 0.5, -0.35, 0.13, 16, col, { z: th, bands: 2, cap: 'dome' })
      break
    }
    case 'orchard': {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3 + Math.min(2, Math.floor(L / 5)); c++) tree(p, -0.65 + c * 0.3, -0.6 + r * 0.38, 0.9 + Math.min(L, 8) * 0.03, c % 2 ? '#8fcf7a' : '#6fb35a')
      box(p, { u: 0.55, v: 0.5, a: 0.18, b: 0.14, h: 12, color: '#e9c9a3', roof: 'gable', roofColor: '#9c6b45', door: true })
      pallet(p, 0.3, 0.65, '#ef6f6c', 2)
      // Farm add-ons (farmKit in farm.ts): a glass greenhouse when any field has
      // one, and a little green tractor when the farm owns one. Cheap boxes only.
      if (kit.includes('g')) box(p, { u: -0.5, v: 0.55, a: 0.2, b: 0.14, h: 9, color: '#cfe8ee', glassy: true, floors: 1, roof: 'gable', roofColor: '#e2f3f8', door: false, cornice: false })
      if (kit.includes('T')) { car(p, 0.0, 0.7, '#3f9a3a'); box(p, { u: 0.05, v: 0.7, a: 0.03, b: 0.03, z: 3.5, h: 4, color: '#2f2f2f', roof: 'none', cornice: false, door: false }) }
      break
    }
    case 'barnyard': case 'ranch': {
      box(p, { u: -0.15, v: -0.2, a: 0.42, b: 0.3, h: 22 + L * 1.5, color: type === 'ranch' ? '#a8784f' : '#9aa6b2', floors: 1, cols: 2, roof: 'gable', roofColor: '#5d6670', sign: name, signColor: '#fffaf0' })
      cyl(p, 0.48, -0.45, 0.1, 40 + L * 2, '#dcd6cc', { bands: 3, cap: 'dome', ladder: true })
      fence(p, -0.7, 0.6, 0.62)
      for (let i = 0; i < 4; i++) { const [x, y] = p.P(-0.5 + i * 0.3, 0.42 + (i % 2) * 0.1); p.add(1, k => <g key={k} className="bob2" style={{ animationDelay: `${i * 0.4}s` }}><ellipse cx={x} cy={y - 4} rx="5" ry="3" fill={type === 'ranch' ? '#f4f1ea' : i % 2 ? '#fff' : '#6b4f3a'} /><circle cx={x + 4.5} cy={y - 6} r="1.8" fill="#3d3030" /><line x1={x - 3} y1={y - 2} x2={x - 3} y2={y} stroke="#3d3030" /><line x1={x + 3} y1={y - 2} x2={x + 3} y2={y} stroke="#3d3030" /></g>) }
      if (type === 'ranch') for (let i = 0; i < 3; i++) box(p, { u: 0.6, v: 0.1 + i * 0.12, a: 0.04, b: 0.04, h: 5, color: '#f2cc8f', roof: 'none', cornice: false, door: false })
      break
    }
    case 'plantation': {
      crops(p, -0.35, -0.3, 0.35, 0.4, '#7cc36a', 6); crops(p, 0.35, -0.3, 0.25, 0.4, '#e3c35a', 5)
      box(p, { u: 0.1, v: 0.5, a: 0.5, b: 0.18, h: 16, color: '#cfe8ee', glassy: true, floors: 1, roof: 'gable', roofColor: '#d6eef5', door: true })
      break
    }
    case 'kitchen': case 'confect': case 'deli': case 'dairy': {
      hall({ roof: 'flat', gear: gear + 1, floors: fl(L, 1, 4), h: fl(L, 1, 4) * FLOOR + 8, awning: type === 'deli' || type === 'confect' ? '#e07a5f' : undefined })
      chimney(p, -0.4, -0.35, 44 + L * 1.5)
      if (type === 'dairy') { cyl(p, 0.75, -0.3, 0.1, 30, '#eef1f4', { bands: 2 }); cyl(p, 0.75, 0.05, 0.1, 30, '#eef1f4', { bands: 2 }) }
      car(p, 0.75, 0.55, '#f2f2f2', 'v'); wings()
      break
    }
    case 'bottler': {
      hall({ roof: 'saw' })
      for (let i = 0; i < 3; i++) cyl(p, -0.65 + i * 0.2, 0.55, 0.07, 20 + i * 2, '#9ad0e0', { bands: 1 })
      conveyor(p, 0.1, 0.62, 0.45); wings()
      break
    }
    case 'loom': case 'knit': case 'fashion': {
      block({ cols: 4, sign: name, awning: type === 'fashion' ? '#c86b98' : undefined, display: type === 'fashion' })
      chimney(p, -0.4, -0.35, fl(L, 2, 9) * FLOOR + 30)
      wings()
      break
    }
    case 'well': case 'gasrig': {
      // Pumpjacks (nodding) + storage tanks + pipe rack.
      const n = Math.min(3, 1 + Math.floor(L / 4))
      for (let i = 0; i < n; i++) pumpjack(p, -0.5 + i * 0.35, -0.2 + i * 0.2, col)
      cyl(p, 0.5, -0.5, 0.14, 20, type === 'gasrig' ? '#e8e8ea' : '#d9d2c4', { bands: 2, ladder: true })
      if (type === 'gasrig') { const top = cyl(p, 0.6, 0.35, 0.03, 60, '#c8553d', { bands: 4 }); if (p.busy) p.add(5, k => <ellipse key={k} className="flare" cx={top[0]} cy={top[1] - 5} rx="3" ry="6" fill="#ffb347" />) }
      pipe(p, -0.6, 0.6, 0.62)
      break
    }
    case 'refinery': case 'polymer': {
      box(p, { u: -0.35, v: 0.3, a: 0.3, b: 0.22, h: 22, color: '#d9d2c4', floors: 1, cols: 2, dock: 1, sign: name })
      cyl(p, -0.45, -0.45, 0.17, 26, col, { bands: 2, ladder: true }); cyl(p, 0.05, -0.55, 0.14, 22, shade(col, 1.1), { bands: 2 }); cyl(p, 0.5, -0.2, 0.15, 24, col, { bands: 2 })
      const t = cyl(p, 0.35, 0.3, 0.05, 70 + L * 2, '#9b9aa3', { bands: 5 })
      smoke(p, [t[0], t[1] - 3], 0.65, type === 'polymer')
      pipe(p, -0.6, 0.55, 0.0)
      break
    }
    case 'solarworks': {
      hall({ roof: 'flat', gear: 0, h: 20 })
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const u = -0.65 + c * 0.38, v = 0.45 + r * 0.14; const q = [p.P(u, v, 6), p.P(u + 0.3, v, 6), p.P(u + 0.3, v + 0.1, 2), p.P(u, v + 0.1, 2)]; p.poly(u + v + 0.3, q, 'url(#g2-solar)', { stroke: '#c9d3e0', strokeWidth: 0.6 }) }
      break
    }
    case 'pit': {
      // Terraced quarry pit with a swinging crane and a dump truck.
      for (let s = 0; s < 3; s++) { const e = 0.7 - s * 0.18; p.poly(-8 + s * 0.01, [p.P(-e, -e, -s * 4), p.P(e, -e, -s * 4), p.P(e, e, -s * 4), p.P(-e, e, -s * 4)], shade('#c9ae7e', 1 - s * 0.1), { stroke: shade('#c9ae7e', 0.7), strokeWidth: 0.6 }) }
      crane(p, 0.5, -0.5, 60 + L * 2)
      for (let i = 0; i < 3; i++) { const [x, y] = p.P(-0.3 + i * 0.2, 0.2); p.add(0.0, k => <path key={k} d={`M${x - 8},${y} q8,-9 16,0z`} fill="#b8a07a" />) }
      box(p, { u: 0.25, v: 0.55, a: 0.16, b: 0.08, h: 7, color: '#e3b23c', roof: 'none', cornice: false, door: false })
      break
    }
    case 'sawmill': case 'joinery': {
      hall({ roof: 'gable', roofColor: '#7a5a3c', color: '#b98a5c' })
      for (let i = 0; i < 3; i++) { const [x, y] = p.P(-0.55 + i * 0.12, 0.62); p.add(1, k => <g key={k}>{[0, 1, 2].map(j => <ellipse key={j} cx={x + j * 4} cy={y - 3 - (j % 2) * 3} rx="2.5" ry="2.5" fill="#d9b27c" stroke="#8a6a4a" strokeWidth=".6" />)}<rect x={x - 2} y={y - 6} width="14" height="5" fill="#a87d52" opacity=".6" /></g>) }
      conveyor(p, 0.35, 0.62, 0.4); chimney(p, 0.45, -0.45, 46); wings()
      break
    }
    case 'kiln': case 'brickworks': {
      hall({ roof: 'flat', color: '#8a96a3', gear: 1 })
      chimney(p, -0.45, -0.4, 70 + L * 2); chimney(p, 0.4, -0.45, 54)
      for (let i = 0; i < 3; i++) pallet(p, -0.5 + i * 0.22, 0.62, '#c0583d', 2)
      break
    }
    case 'foundry': case 'steelmill': {
      hall({ roof: 'saw', color: shade(col, 0.95), roofColor: '#5d636a' })
      const t1 = chimney(p, -0.45, -0.45, 80 + L * 2); chimney(p, -0.25, -0.5, 64)
      // Glowing furnace mouth + sparks while busy.
      const [fx, fy] = p.P(0.6, 0.25, 6)
      p.add(1, k => <g key={k}><rect x={fx - 5} y={fy - 6} width="10" height="7" fill={p.busy ? '#ff8a2a' : '#5d3a2a'} />{p.busy && <g className="spark2 hot">{[0, 1, 2, 3, 4, 5].map(i => <circle key={i} cx={fx - 6 + i * 2.5} cy={fy - 6} r="1.2" fill="#ffb347" style={{ animationDelay: `${i * 0.2}s` }} />)}</g>}</g>)
      void t1
      crane(p, 0.55, -0.5, 54)
      break
    }
    case 'crateyard': {
      box(p, { u: -0.3, v: -0.3, a: 0.35, b: 0.3, h: 22, color: col, floors: 1, cols: 2, dock: 2, roof: 'gable', roofColor: '#7b828a', sign: name })
      for (let i = 0; i < 2 + Math.min(4, Math.floor(L / 3)); i++) pallet(p, 0.1 + (i % 3) * 0.2, 0.25 + Math.floor(i / 3) * 0.22, '#c79a62', 1 + (i % 3))
      box(p, { u: 0.55, v: -0.35, a: 0.08, b: 0.12, h: 8, color: '#e3b23c', roof: 'none', cornice: false, door: false }) // forklift
      break
    }
    case 'lab': {
      box(p, { u: 0, v: 0.05, a: 0.55, b: 0.4, h: fl(L, 2, 7) * FLOOR + 6, color: '#eef3f6', glassy: true, floors: fl(L, 2, 7), gear, sign: name, signColor: col })
      const [dx, dy] = p.P(0, -0.05, fl(L, 2, 7) * FLOOR + 6)
      p.add(0.1, k => <g key={k}><path d={`M${dx - 14},${dy} a14,11 0 0 1 28,0z`} fill={col} stroke={shade(col, 0.7)} /><path d={`M${dx - 2},${dy - 11} v-6`} stroke="#7d8796" strokeWidth="1.5" /><circle cx={dx} cy={dy - 18} r="1.8" fill="#ff5a5a" className={p.busy ? 'blink2' : ''} /></g>)
      tree(p, -0.65, 0.6, 0.8); tree(p, 0.65, 0.6, 0.8)
      break
    }
    case 'fab': case 'displayfab': case 'assembly': case 'devices': case 'motorworks': {
      const glass = type === 'fab' || type === 'displayfab'
      box(p, { u: 0, v: -0.05, a: 0.6, b: 0.42, h: fl(L, 2, 6) * FLOOR + 6, color: glass ? '#e6edf3' : col, glassy: glass, floors: fl(L, 2, 6), cols: 4, dock: glass ? 0 : 2, gear: gear + 1, sign: name, signColor: shade(col, 0.5) })
      if (glass) { cyl(p, 0.7, -0.4, 0.07, 26, '#d8dde3', { bands: 2 }); cyl(p, 0.7, -0.15, 0.07, 26, '#d8dde3', { bands: 2 }) }
      else conveyor(p, -0.2, 0.62, 0.5)
      if (type === 'motorworks') car(p, 0.65, 0.6, '#2eaf7d', 'v')
      wings()
      break
    }
    case 'fuelstop': {
      // Canopy over pumps + small kiosk shop.
      box(p, { u: -0.4, v: -0.35, a: 0.32, b: 0.26, h: 16, color: '#f2f4f6', floors: 1, display: true, awning: col, sign: name })
      const ch = 24
      for (const [u, v] of [[0, 0.1], [0.5, 0.1], [0, 0.5], [0.5, 0.5]]) { const [x, y] = p.P(u, v); p.add(u + v, k => <line key={k} x1={x} y1={y} x2={x} y2={y - ch} stroke="#d8dde3" strokeWidth="2" />) }
      for (const u of [0.1, 0.4]) box(p, { u, v: 0.3, a: 0.04, b: 0.06, h: 9, color: '#d64545', roof: 'none', cornice: false, door: false })
      box(p, { u: 0.25, v: 0.3, a: 0.35, b: 0.3, z: ch, h: 4, color: col, roof: 'none', cornice: false, door: false })
      car(p, 0.25, 0.7, '#334c7a'); shoppers(p, -0.4, -0.05)
      sparkles(p, p.P(-0.4, -0.35, 34), 1)
      break
    }
    case 'carlot': {
      box(p, { u: -0.25, v: -0.45, a: 0.5, b: 0.2, h: FLOOR * (1 + Math.floor(L / 6)) + 6, color: '#f2f4f6', floors: 1 + Math.floor(L / 6), display: true, awning: '#d64545', sign: name })
      p.poly(-0.2, [p.P(-0.75, -0.15), p.P(0.75, -0.15), p.P(0.75, 0.75), p.P(-0.75, 0.75)], '#6a6d73')
      const cols = ['#d64545', '#2eaf7d', '#f2f2f2', '#334c7a', '#e3b23c', '#7e57c2']
      for (let i = 0; i < 6; i++) { const u = -0.5 + (i % 3) * 0.45, v = 0.05 + Math.floor(i / 3) * 0.4; const A = p.P(u + 0.2, v - 0.12), B = p.P(u + 0.2, v + 0.12); p.add(-0.1, k => <line key={k} x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#fff" strokeWidth=".8" />); car(p, u, v, cols[i]) }
      // Bunting flags.
      const f1 = p.P(-0.75, 0.75, 22), f2 = p.P(0.75, 0.75, 22)
      p.add(2, k => <g key={k}><path d={`M${f1[0]},${f1[1]} Q${(f1[0] + f2[0]) / 2},${(f1[1] + f2[1]) / 2 + 8} ${f2[0]},${f2[1]}`} fill="none" stroke="#555" strokeWidth=".5" />{Array.from({ length: 9 }, (_, i) => { const t = (i + 0.5) / 9, x = f1[0] + (f2[0] - f1[0]) * t, y = f1[1] + (f2[1] - f1[1]) * t + 8 * 4 * t * (1 - t) / 2; return <path key={i} d={`M${x - 2},${y} l4,0 l-2,4z`} fill={cols[i % 6]} className="sway" style={{ transformOrigin: `${x}px ${y}px` }} /> })}</g>)
      shoppers(p, 0, 0.3); sparkles(p, p.P(-0.25, -0.45, 40), 1)
      break
    }
    default: {
      if (bt.kind === 'retail') {
        const look: Record<string, [string, string]> = { market: ['#e9d9c2', '#e07a5f'], outfitter: ['#c9d9ea', '#5c7c99'], buildmart: ['#e8d8bd', '#d07a3a'], gadget: ['#dfe3f5', '#5d6bd4'], homestore: ['#ece3f5', '#8e7cc3'] }
        const [wall, aw] = look[type] ?? ['#efe6d6', col]
        const f = fl(L, 1, 6)
        box(p, { u: 0, v: -0.05, a: 0.58, b: 0.4, h: f * FLOOR + 10, color: wall, floors: f, cols: 3, display: true, awning: aw, sign: name, signColor: shade(aw, 0.8), gear: Math.min(3, f) })
        // Sidewalk furniture: bench, sandwich board, bike rack.
        box(p, { u: -0.45, v: 0.55, a: 0.12, b: 0.03, h: 3, color: '#9c6b45', roof: 'none', cornice: false, door: false })
        box(p, { u: 0.45, v: 0.55, a: 0.04, b: 0.02, h: 7, color: aw, roof: 'none', cornice: false, door: false })
        if (type === 'buildmart') { pallet(p, 0.6, 0.1, '#d7b48a', 2); pallet(p, 0.6, -0.15, '#d7b48a', 3) }
        tree(p, -0.7, 0.6, 0.7)
        shoppers(p, 0, 0.45)
        sparkles(p, p.P(0, -0.05, f * FLOOR + 24), 1)
      } else {
        hall()
        chimney(p, 0.4, -0.4, 50 + L * 1.5)
        conveyor(p, -0.3, 0.62, 0.45)
        wings()
      }
    }
  }
}

/** Nodding pumpjack (CSS .nod on the beam). */
function pumpjack(p: Pen, u: number, v: number, col: string) {
  const [x, y] = p.P(u, v)
  p.add(u + v, k => <g key={k}>
    <ellipse cx={x + 4} cy={y + 1} rx="16" ry="4" fill="#2b3a1e" opacity=".22" />
    <rect x={x - 14} y={y - 3} width="30" height="4" fill="#7b828a" />
    <polygon points={`${x - 5},${y - 2} ${x + 5},${y - 2} ${x},${y - 22}`} fill="none" stroke="#5d636a" strokeWidth="2" />
    <g className={p.busy ? 'nod' : ''} style={{ transformOrigin: `${x}px ${y - 22}px` }}>
      <rect x={x - 20} y={y - 25} width="34" height="4.5" rx="1.5" fill={col} stroke={shade(col, 0.6)} strokeWidth=".6" />
      <path d={`M${x - 21},${y - 28} q-6,6 0,12`} fill="none" stroke="#3d4148" strokeWidth="4.5" />
      <line x1={x - 24} y1={y - 16} x2={x - 24} y2={y - 2} stroke="#3d4148" strokeWidth=".8" />
    </g>
    <circle cx={x + 10} cy={y - 8} r="4" fill="#5d636a" />
  </g>)
}

/** Tower crane with a swinging jib. */
function crane(p: Pen, u: number, v: number, h: number) {
  const [x, y] = p.P(u, v)
  p.add(u + v + 0.2, k => <g key={k}>
    <rect x={x - 2} y={y - h} width="4" height={h} fill="none" stroke="#e3b23c" strokeWidth="1.4" />
    {Array.from({ length: Math.floor(h / 6) }, (_, i) => <line key={i} x1={x - 2} y1={y - i * 6} x2={x + 2} y2={y - i * 6 - 6} stroke="#e3b23c" strokeWidth=".7" />)}
    <g className={p.busy ? 'swing2' : ''} style={{ transformOrigin: `${x}px ${y - h}px` }}>
      <line x1={x - 34} y1={y - h} x2={x + 14} y2={y - h} stroke="#e3b23c" strokeWidth="2.4" />
      <rect x={x + 8} y={y - h - 2} width="7" height="5" fill="#7b828a" />
      <line x1={x - 26} y1={y - h} x2={x - 26} y2={y - h + 22} stroke="#555" strokeWidth=".7" className={p.busy ? 'bob' : ''} />
      <rect x={x - 29} y={y - h + 22} width="6" height="4" fill="#c79a62" />
    </g>
  </g>)
}

/** Conveyor belt along u with animated rollers. */
function conveyor(p: Pen, u: number, v: number, len: number) {
  const A = p.P(u - len / 2, v, 5), B = p.P(u + len / 2, v, 5)
  p.add(u + v + 0.3, k => <g key={k}>
    <line x1={A[0]} y1={A[1] + 4} x2={B[0]} y2={B[1] + 4} stroke="#5d636a" strokeWidth="1" />
    <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#3d4148" strokeWidth="4.5" strokeLinecap="round" />
    <line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="#c9b98f" strokeWidth="2.4" strokeDasharray="3 4" className={p.busy ? 'belt' : ''} />
  </g>)
}

/** Pipe run along u at v, with flanges. */
function pipe(p: Pen, u0: number, u1: number, v: number) {
  const A = p.P(u0, v, 4), B = p.P(u1, v, 4)
  p.add(u1 + v, k => <g key={k}><line x1={A[0]} y1={A[1]} x2={B[0]} y2={B[1]} stroke="url(#g2-metal)" strokeWidth="3" strokeLinecap="round" />{[0.25, 0.5, 0.75].map(t => <circle key={t} cx={A[0] + (B[0] - A[0]) * t} cy={A[1] + (B[1] - A[1]) * t} r="2" fill="#8d96a0" />)}</g>)
}

/**
 * One detailed building (plus its plot ground) at screen (x,y).
 * `ground` false for thumbnails that draw their own base.
 */
export function Model2D({ type, level, busy, night, x, y, withGround = true, kit = '' }: { type: string; level: number; busy: boolean; night: boolean; x: number; y: number; withGround?: boolean; kit?: string /* farm add-ons, see farm.ts farmKit */ }) {
  const p = new Pen(x, y, night, busy)
  if (withGround) ground(p)
  if (BLD[type]) model(p, type, level, kit)
  return <g className={busy ? 'm2 busy' : 'm2 idle'}>{p.render()}</g>
}

/** Empty plot sidewalk/planters/lamp, for unbuilt plots. */
export function Ground2D({ x, y, night }: { x: number; y: number; night: boolean }) {
  const p = new Pen(x, y, night, false); ground(p)
  return <g pointerEvents="none">{p.render()}</g>
}

// ---------------------------------------------------------------------------
// Trade Spire (admin-only, see GameState.adminSpire). Not a BuildingType on
// purpose, so it never shows up in build lists, chains, codex or search.
// A tall faceted glass spire: two lit faces with a vertical gradient, floor
// bands, a gold crown ring and an antenna with a beacon. (x, y) = tile centre.
// ---------------------------------------------------------------------------
export function SpireArt({ x, y }: { x: number; y: number }) {
  const h = 150, w = 22 // height above the pad, half-width at the base
  const L = `${x - w},${y} ${x - 4},${y - h} ${x},${y - h - 6} ${x},${y + 11}`
  const R = `${x + w},${y} ${x + 4},${y - h} ${x},${y - h - 6} ${x},${y + 11}`
  // Floor bands: shorter towards the top as the spire tapers.
  const bands = Array.from({ length: 9 }, (_, i) => { const t = (i + 1) / 10, hw = w - (w - 4) * t, yy = y - h * t; return { hw, yy } })
  return (
    <g className="spire" pointerEvents="none">
      <defs>
        <linearGradient id="spireL" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#3f7fae" /><stop offset=".6" stopColor="#7cc3ea" /><stop offset="1" stopColor="#d9f2ff" /></linearGradient>
        <linearGradient id="spireR" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#6fb1db" /><stop offset=".6" stopColor="#b5e3fb" /><stop offset="1" stopColor="#ffffff" /></linearGradient>
      </defs>
      {/* Plinth */}
      <polygon points={`${x},${y - 14} ${x + 34},${y + 3} ${x},${y + 20} ${x - 34},${y + 3}`} fill="#d8dde3" stroke="#aab4bf" />
      <polygon points={`${x - 34},${y + 3} ${x},${y + 20} ${x},${y + 25} ${x - 34},${y + 8}`} fill="#b9c2cc" />
      <polygon points={`${x + 34},${y + 3} ${x},${y + 20} ${x},${y + 25} ${x + 34},${y + 8}`} fill="#c9d1d9" />
      <polygon points={L} fill="url(#spireL)" stroke="#2f6a93" strokeWidth=".8" />
      <polygon points={R} fill="url(#spireR)" stroke="#2f6a93" strokeWidth=".8" />
      {bands.map((b, i) => <g key={i} stroke="#ffffff" strokeOpacity=".55" strokeWidth=".8"><line x1={x - b.hw} y1={b.yy} x2={x} y2={b.yy + 9 * (1 - (i + 1) / 10)} /><line x1={x + b.hw} y1={b.yy} x2={x} y2={b.yy + 9 * (1 - (i + 1) / 10)} /></g>)}
      {/* Glint down the left face */}
      <line x1={x - 12} y1={y - 20} x2={x - 3} y2={y - h + 20} stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
      {/* Gold crown ring + antenna + beacon */}
      <ellipse cx={x} cy={y - h * 0.72} rx="9" ry="3.5" fill="none" stroke="#e8b93c" strokeWidth="2" />
      <line x1={x} y1={y - h - 6} x2={x} y2={y - h - 30} stroke="#5b6570" strokeWidth="1.6" />
      <circle cx={x} cy={y - h - 31} r="3" fill="#ff6b5b"><animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite" /></circle>
    </g>
  )
}

/** Small icon of the spire (build menu entry, panel header). */
export function SpireIcon({ size = 56 }: { size?: number }) {
  return <svg viewBox="-45 -195 90 225" width={size} height={size} aria-hidden="true"><SpireArt x={0} y={0} /></svg>
}
