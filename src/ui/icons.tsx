// ============================================================================
// Crafted SVG icons for every good. Each good maps to a glyph (drawn in a
// 24×24 box) and uses its own color from data.ts, with a darker outline and
// a soft highlight so the set feels cohesive. No image files, so the
// single-file build stays small.
// ============================================================================
import type { JSX } from 'react'
import { RES } from '../game/data'

/** Darken (f<1) or lighten (f>1) a hex color. */
export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(f > 1 ? v + (255 - v) * (f - 1) : v * f))).toString(16).padStart(2, '0')
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`
}

type Glyph = (c: string, d: string) => JSX.Element

// Each glyph gets the fill color `c` and the outline color `d`.
const G: Record<string, Glyph> = {
  bolt: (c, d) => <path d="M13 2 5 13h6l-1 9 8-12h-6z" fill={c} stroke={d} strokeWidth="1.3" strokeLinejoin="round" />,
  drop: (c, d) => <path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill={c} stroke={d} strokeWidth="1.3" />,
  crate: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="4" y="6" width="16" height="13" rx="1.5" fill={c} /><path d="M4 10h16M4 15h16M9 6v13M15 6v13" fill="none" /></g>,
  seed: (c, d) => <g fill={c} stroke={d} strokeWidth="1.2">{[[8, 9], [15, 8], [11, 15], [17, 15], [6, 16]].map(([x, y], i) => <ellipse key={i} cx={x} cy={y} rx="2.6" ry="3.6" transform={`rotate(${i * 35} ${x} ${y})`} />)}</g>,
  grain: (c, d) => <g stroke={d} strokeWidth="1.2"><path d="M12 21V6" fill="none" />{[7, 10, 13, 16].map(y => <g key={y}><ellipse cx="9.5" cy={y} rx="2.4" ry="1.4" fill={c} transform={`rotate(-30 9.5 ${y})`} /><ellipse cx="14.5" cy={y} rx="2.4" ry="1.4" fill={c} transform={`rotate(30 14.5 ${y})`} /></g>)}</g>,
  fruit: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M12 7c-5-3-9 1-8 6 1 6 5 9 8 7 3 2 7-1 8-7 1-5-3-9-8-6z" fill={c} /><path d="M12 7c0-2 1-4 3-5" fill="none" /><path d="M12 6c2-2 5-2 6 0-2 1-4 1-6 0z" fill="#8fcf7a" /></g>,
  berry: (c, d) => <g fill={c} stroke={d} strokeWidth="1.1">{[[9, 10], [15, 10], [12, 14], [8, 16], [16, 16], [12, 19]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3" />)}<path d="M12 7l-3-3m3 3 3-3" fill="none" /></g>,
  leaf: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M4 20C4 9 10 4 20 4c0 10-5 16-16 16z" fill={c} /><path d="M4 20 15 9" fill="none" /></g>,
  sack: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M8 6h8l-1 3c4 2 5 6 5 9 0 2-2 3-4 3H8c-2 0-4-1-4-3 0-3 1-7 5-9z" fill={c} /><path d="M8 6c1-2 7-2 8 0" fill="none" /></g>,
  hen: (c, d) => <g stroke={d} strokeWidth="1.2"><path d="M6 13c0-4 3-7 7-7 2 0 3 1 3 3l3 1-3 1c0 6-3 9-7 9s-3-3-3-7z" fill={c} /><path d="M13 6c0-2 1-3 2-3 0 1 1 1 1 3" fill="#ef6f6c" /><circle cx="14" cy="9" r=".9" fill={d} /></g>,
  egg: (c, d) => <path d="M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0C5 9 8 3 12 3z" fill={c} stroke={d} strokeWidth="1.3" />,
  bottle: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M10 3h4v4l2 3v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10l2-3z" fill={c} /><path d="M8 13h8" fill="none" /></g>,
  loaf: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M4 12c0-4 4-6 8-6s8 2 8 6v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill={c} /><path d="M8 9l1 3m3-4v4m3-3-1 3" fill="none" /></g>,
  cheese: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M3 15 15 6l6 5v8H3z" fill={c} /><circle cx="9" cy="16" r="1.3" fill={shade(c, 0.8)} /><circle cx="15" cy="14" r="1.6" fill={shade(c, 0.8)} /></g>,
  jar: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="7" y="4" width="10" height="3" rx="1" fill="#e9d6b4" /><path d="M6 8h12v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill={c} /></g>,
  boll: (c, d) => <g stroke={d} strokeWidth="1.1">{[[9, 9], [15, 9], [12, 13], [8, 14], [16, 14]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.4" fill={c} />)}<path d="M12 17v4" fill="none" /></g>,
  roll: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="5" y="5" width="14" height="14" rx="2" fill={c} /><path d="M5 9h14M5 13h14M5 17h14" fill="none" opacity=".5" /></g>,
  shirt: (c, d) => <path d="M8 4 3 7l2 4 3-1v10h8V10l3 1 2-4-5-3c-1 2-2 2-4 2s-3 0-4-2z" fill={c} stroke={d} strokeWidth="1.3" strokeLinejoin="round" />,
  jacket: (c, d) => <g stroke={d} strokeWidth="1.3" strokeLinejoin="round"><path d="M8 3 3 7v13h7V9l2 3 2-3v11h7V7l-5-4-4 4z" fill={c} /><path d="M12 12v8" fill="none" /></g>,
  hide: (c, d) => <path d="M6 4c2 1 4 1 6 0s4-1 6 0c0 3 2 4 2 7s-2 3-2 6c-2 2-4 2-6 1-2 1-4 1-6-1 0-3-2-3-2-6s2-4 2-7z" fill={c} stroke={d} strokeWidth="1.3" />,
  boot: (c, d) => <path d="M7 3h7v10l5 3c1 1 1 4 0 4H5V8c0-3 1-5 2-5z" fill={c} stroke={d} strokeWidth="1.3" strokeLinejoin="round" />,
  barrel: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M6 4h12c1 3 1 13 0 16H6c-1-3-1-13 0-16z" fill={c} /><path d="M5.5 9h13M5.5 15h13" fill="none" /></g>,
  pump: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="5" y="6" width="9" height="15" rx="1.5" fill={c} /><rect x="7" y="8" width="5" height="4" fill="#fff" /><path d="M14 10h3l2 2v6a1 1 0 0 1-2 0v-4" fill="none" /></g>,
  pellets: (c, d) => <g fill={c} stroke={d} strokeWidth="1.1">{[[7, 15], [12, 17], [17, 15], [9, 10], [15, 10], [12, 6]].map(([x, y], i) => <rect key={i} x={x - 2.5} y={y - 2.5} width="5" height="5" rx="1.5" />)}</g>,
  pile: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M3 19c2-6 5-11 9-11s7 5 9 11z" fill={c} /><path d="M8 15h1m4-3h1m2 5h1" stroke={shade(c, 0.7)} /></g>,
  log: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="3" y="8" width="16" height="8" rx="4" fill={c} /><ellipse cx="19" cy="12" rx="2.5" ry="4" fill={shade(c, 1.3)} /></g>,
  planks: (c, d) => <g stroke={d} strokeWidth="1.2">{[5, 10, 15].map(y => <rect key={y} x="3" y={y} width="18" height="4" rx="1" fill={c} />)}</g>,
  tile: (c, d) => <g stroke={d} strokeWidth="1.2"><path d="M3 12c3-3 6-3 9 0 3-3 6-3 9 0v7H3z" fill={c} /><path d="M3 16c3-3 6-3 9 0 3-3 6-3 9 0" fill="none" /></g>,
  bag: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M5 7h14l-1 13H6z" fill={c} /><path d="M5 7l2-3h10l2 3M9 12h6" fill="none" /></g>,
  pane: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="4" y="4" width="16" height="16" rx="1.5" fill={c} /><path d="M7 14l5-5m-2 8 7-7" stroke="#fff" /></g>,
  rock: (c, d) => <path d="M4 15 7 7l6-3 6 4 2 7-4 5H8z" fill={c} stroke={d} strokeWidth="1.3" strokeLinejoin="round" />,
  ingot: (c, d) => <g stroke={d} strokeWidth="1.3" strokeLinejoin="round"><path d="M3 16 7 9h10l4 7z" fill={c} /><path d="M7 9l-1 3h12l-1-3" fill={shade(c, 1.25)} /></g>,
  crystal: (c, d) => <path d="M12 3 18 9l-6 12L6 9z M6 9h12" fill={c} stroke={d} strokeWidth="1.3" strokeLinejoin="round" />,
  chip: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="6" y="6" width="12" height="12" rx="1.5" fill={c} /><rect x="9.5" y="9.5" width="5" height="5" fill={shade(c, 0.75)} />{[8, 12, 16].map(v => <path key={v} d={`M${v} 3v3M${v} 18v3M3 ${v}h3M18 ${v}h3`} />)}</g>,
  battery: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="7" y="5" width="10" height="16" rx="2" fill={c} /><rect x="10" y="3" width="4" height="2" fill={d} /><path d="M12 9l-2 4h4l-2 4" fill="none" /></g>,
  phone: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="7" y="2.5" width="10" height="19" rx="2.5" fill={c} /><rect x="8.5" y="5" width="7" height="12" rx="1" fill="#e8f1ff" /><circle cx="12" cy="19" r=".8" fill={d} /></g>,
  lamp: (c, d) => <g stroke={d} strokeWidth="1.3" strokeLinejoin="round"><path d="M9 3h6l3 7H6z" fill={c} /><path d="M12 10v8M8 21h8" fill="none" /><path d="M10 18h4v3h-4z" fill={shade(c, 0.8)} /></g>,
  speaker: (c, d) => <g stroke={d} strokeWidth="1.3"><rect x="6" y="3" width="12" height="18" rx="2" fill={c} /><circle cx="12" cy="14" r="3.5" fill={shade(c, 0.7)} /><circle cx="12" cy="7.5" r="1.5" fill={shade(c, 0.7)} /></g>,
  notes: (c, d) => <g stroke={d} strokeWidth="1.3"><path d="M6 3h9l3 3v15H6z" fill={c} /><path d="M9 9h6M9 12h6M9 15h4" fill="none" /></g>,
}

/** Which glyph each good uses. */
const GLYPH: Record<string, string> = {
  power: 'bolt', water: 'drop', crates: 'crate', seeds: 'seed', wheat: 'grain', apples: 'fruit', berries: 'berry', greens: 'leaf',
  feed: 'sack', hens: 'hen', eggs: 'egg', milk: 'bottle', flour: 'sack', bread: 'loaf', cheese: 'cheese', juice: 'bottle', jam: 'jar',
  cotton: 'boll', cloth: 'roll', tshirt: 'shirt', jacket: 'jacket', hide: 'hide', boots: 'boot', crude: 'barrel', fuel: 'pump', resin: 'pellets',
  sand: 'pile', clay: 'pile', timber: 'log', boards: 'planks', tiles: 'tile', cement: 'bag', glass: 'pane', ore: 'rock', metal: 'ingot',
  silica: 'crystal', chip: 'chip', cell: 'battery', phone: 'phone', lamp: 'lamp', speaker: 'speaker',
}

/** Icon for a good, sized in px. Notes (research) share the "notes" glyph. */
export function ResIcon({ id, size = 22 }: { id: string; size?: number }) {
  const r = RES[id]
  if (!r) return null
  const g = G[GLYPH[id] ?? (id.startsWith('rn_') ? 'notes' : 'crate')]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="ricon" aria-label={r.name}>
      <title>{r.name}</title>
      {g(r.color, shade(r.color, 0.5))}
    </svg>
  )
}
