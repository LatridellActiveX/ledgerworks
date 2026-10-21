// ============================================================================
// Isometric 2.5D company campus.
//
//  - 24 plots laid out as diamond tiles on a 6×4 grid, drawn back-to-front.
//  - Each building type has its own model built from iso boxes, roofs and
//    props (windmill blades, water tower, barn, sawtooth factory, tanks,
//    pumpjack, quarry pit, research dome, shop with awning).
//  - Buildings grow with level: taller, more window rows, extra props.
//  - Busy buildings animate (smoke, spinning blades, conveyor, nodding
//    pumpjack); trucks drive the ring road; the sky and windows follow the
//    game clock (day / dusk / night).
// All animation is CSS or SVG <animate>, so it costs almost no JS.
// ============================================================================
import type { JSX } from 'react'
import { BLD } from '../game/data'
import type { GameState } from '../game/engine'
import { shade } from './icons'

const TW = 64, TH = 32 // half tile width / height in px
const COLS = 6, ROWS = 4
const OX = ROWS * TW + 40, OY = 120 // origin so the grid is centred

/** Screen position of a tile's centre. */
export const tilePos = (i: number) => {
  const c = i % COLS, r = Math.floor(i / COLS)
  return { x: OX + (c - r) * TW, y: OY + (c + r) * TH }
}

/** An isometric box: footprint half sizes a (x) and b (y), height h. */
function Box({ x, y, a, b, h, color, win = 0, night = false }: { x: number; y: number; a: number; b: number; h: number; color: string; win?: number; night?: boolean }) {
  const top = `${x},${y - b - h} ${x + a},${y - h} ${x},${y + b - h} ${x - a},${y - h}`
  const left = `${x - a},${y - h} ${x},${y + b - h} ${x},${y + b} ${x - a},${y}`
  const right = `${x},${y + b - h} ${x + a},${y - h} ${x + a},${y} ${x},${y + b}`
  // Window rows on both faces, one row per ~10px of height.
  const rows = Math.min(win, Math.floor((h - 6) / 10))
  const wins: JSX.Element[] = []
  const glow = night ? '#ffe08a' : '#eaf4ff'
  for (let r = 0; r < rows; r++) {
    const yy = y - 8 - r * 10
    for (let k = 1; k <= 3; k++) {
      const t = k / 4
      // left face: from W (x-a,y) to S (x,y+b)
      const lx = x - a + a * t, ly = yy + b * t
      wins.push(<path key={`l${r}${k}`} d={`M${lx - 3},${ly - 1.5 - 3} l5,2.5 v4 l-5,-2.5z`} fill={glow} opacity=".9" />)
      const rx = x + a * t, ry = yy + b - b * t
      wins.push(<path key={`r${r}${k}`} d={`M${rx - 2},${ry - 3 + 1.5} l5,-2.5 v4 l-5,2.5z`} fill={glow} opacity=".75" />)
    }
  }
  return (
    <g>
      <polygon points={left} fill={shade(color, 0.78)} />
      <polygon points={right} fill={shade(color, 0.62)} />
      <polygon points={top} fill={shade(color, 1.08)} />
      {wins}
    </g>
  )
}

/** Puffs of smoke rising from (x,y). */
const Smoke = ({ x, y }: { x: number; y: number }) => (
  <g className="smoke">{[0, 1, 2].map(i => <circle key={i} cx={x} cy={y} r={4 + i} style={{ animationDelay: `${i * 0.9}s` }} />)}</g>
)

/** One building model, standing on the tile centre (x,y). */
function Model({ type, level, busy, night, x, y }: { type: string; level: number; busy: boolean; night: boolean; x: number; y: number }) {
  const col = BLD[type].color
  const L = Math.min(level, 12)
  const h = 18 + L * 4 // grows with level
  const w = Math.min(L, 8) // window rows
  switch (type) {
    case 'generator': // windmill tower with spinning blades
      return (
        <g>
          <Box x={x + 14} y={y + 6} a={14} b={7} h={10} color="#d9cfc0" />
          <polygon points={`${x - 5},${y + 4} ${x + 5},${y + 4} ${x + 2},${y - h - 18} ${x - 2},${y - h - 18}`} fill="#f4efe6" stroke="#c9bfae" />
          <g className={busy ? 'spin' : ''} style={{ transformOrigin: `${x}px ${y - h - 18}px` }}>
            {[0, 120, 240].map(a => <path key={a} d={`M${x},${y - h - 18} l-3,-26 l6,0z`} fill={col} stroke={shade(col, 0.6)} transform={`rotate(${a} ${x} ${y - h - 18})`} />)}
          </g>
          <circle cx={x} cy={y - h - 18} r="3" fill="#8d8a93" />
        </g>
      )
    case 'pump': // pump house + water tower
      return (
        <g>
          <Box x={x - 10} y={y + 4} a={22} b={11} h={14 + L * 2} color={col} win={1} night={night} />
          <rect x={x + 16} y={y - 18 - h} width="3" height={h + 14} fill="#7d8796" />
          <rect x={x + 30} y={y - 12 - h} width="3" height={h + 14} fill="#7d8796" />
          <ellipse cx={x + 24} cy={y - 18 - h} rx="15" ry="6" fill={shade(col, 0.8)} />
          <rect x={x + 9} y={y - 34 - h} width="30" height="16" fill={col} />
          <ellipse cx={x + 24} cy={y - 34 - h} rx="15" ry="6" fill={shade(col, 1.2)} />
        </g>
      )
    case 'orchard': // tree rows + small shed
      return (
        <g>
          {[0, 1, 2].map(r => [0, 1, 2].map(c => {
            const tx = x - 30 + c * 18 + r * 10, ty = y - 6 + r * 9 - c * 5
            return <g key={`${r}${c}`}><rect x={tx - 1} y={ty - 6} width="2" height="7" fill="#8a6a4a" /><circle cx={tx} cy={ty - 10} r={6 + Math.min(L, 6) * 0.5} fill={c % 2 ? '#8fcf7a' : '#79bf6a'} /><circle cx={tx + 2} cy={ty - 11} r="1.6" fill="#ef6f6c" /></g>
          }))}
          <Box x={x + 30} y={y + 2} a={12} b={6} h={12} color="#e9c9a3" />
        </g>
      )
    case 'barnyard': // red barn with gable roof + silo
      return (
        <g>
          <Box x={x - 4} y={y + 4} a={26} b={13} h={18 + L * 2} color="#d86f5f" />
          <polygon points={`${x - 30},${y + 4 - 18 - L * 2} ${x - 4},${y + 17 - 18 - L * 2} ${x - 4},${y + 17 - 34 - L * 2} ${x - 30},${y + 4 - 34 - L * 2}`} fill="#a9483d" />
          <polygon points={`${x - 4},${y + 17 - 34 - L * 2} ${x + 22},${y + 4 - 18 - L * 2} ${x + 22},${y + 4 - 18 - L * 2} ${x - 4},${y + 17 - 18 - L * 2}`} fill="#8d3b32" />
          <rect x={x + 22} y={y - 30 - L * 3} width="12" height={34 + L * 3} fill="#dcd6cc" />
          <ellipse cx={x + 28} cy={y - 30 - L * 3} rx="6" ry="3" fill="#b9b2a5" />
        </g>
      )
    case 'well': // nodding pumpjack
      return (
        <g>
          <Box x={x + 18} y={y + 6} a={12} b={6} h={8} color="#8d8a93" />
          <polygon points={`${x - 6},${y + 6} ${x + 6},${y + 6} ${x},${y - 22}`} fill="#6b6b75" />
          <g className={busy ? 'nod' : ''} style={{ transformOrigin: `${x}px ${y - 22}px` }}>
            <rect x={x - 26} y={y - 25} width="44" height="5" rx="2" fill={col} />
            <path d={`M${x - 28},${y - 28} q-6,6 0,12`} fill="none" stroke="#4a4a52" strokeWidth="5" />
          </g>
        </g>
      )
    case 'pit': // excavated quarry + crane
      return (
        <g>
          <polygon points={`${x},${y - 22} ${x + 44},${y} ${x},${y + 22} ${x - 44},${y}`} fill="#c9ae7e" />
          <polygon points={`${x},${y - 12} ${x + 26},${y} ${x},${y + 12} ${x - 26},${y}`} fill="#a88d5f" />
          <rect x={x + 20} y={y - 40} width="3" height="38" fill="#e3b23c" />
          <path d={`M${x + 21},${y - 40} L${x - 6},${y - 30}`} stroke="#e3b23c" strokeWidth="3" />
          <path d={`M${x - 6},${y - 30} v14`} stroke="#555" className={busy ? 'bob' : ''} />
          {[0, 1].map(i => <circle key={i} cx={x - 10 + i * 14} cy={y + 2} r="4" fill="#b8a07a" />)}
        </g>
      )
    case 'refinery': // tanks + tower
      return (
        <g>
          <Box x={x - 14} y={y + 6} a={16} b={8} h={14} color="#d9d2c4" />
          {[[-26, 0], [0, -10], [22, 2]].map(([dx, dy], i) => (
            <g key={i}><rect x={x + dx - 9} y={y + dy - 16} width="18" height="16" fill={shade(col, 1.1)} /><ellipse cx={x + dx} cy={y + dy} rx="9" ry="4" fill={shade(col, 0.8)} /><ellipse cx={x + dx} cy={y + dy - 16} rx="9" ry="4" fill={shade(col, 1.3)} /></g>
          ))}
          <rect x={x + 8} y={y - h - 16} width="7" height={h + 6} fill="#9b9aa3" />
          {busy && <Smoke x={x + 11} y={y - h - 20} />}
        </g>
      )
    case 'lab': // block with research dome
      return (
        <g>
          <Box x={x} y={y + 4} a={30} b={15} h={h} color="#eef3f6" win={w} night={night} />
          <path d={`M${x - 14},${y - h - 2} a14,10 0 0 1 28,0z`} fill={col} stroke={shade(col, 0.7)} />
          <rect x={x - 2} y={y - h - 14} width="4" height="10" fill="#7d8796" className={busy ? 'blink' : ''} />
        </g>
      )
    default: {
      if (BLD[type].kind === 'retail') {
        // Shop: storefront box, striped awning, sign
        return (
          <g>
            <Box x={x} y={y + 4} a={30} b={15} h={h} color={col} win={w} night={night} />
            {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${x - 30 + i * 5},${y + 4 - 14 + i * 2.5} l5,2.5 l0,6 l-5,-2.5z`} fill={i % 2 ? '#fffaf0' : shade(col, 0.7)} />)}
            {[0, 1, 2, 3, 4, 5].map(i => <path key={`r${i}`} d={`M${x + i * 5},${y + 19 - 14 - i * 2.5} l5,-2.5 l0,6 l-5,2.5z`} fill={i % 2 ? '#fffaf0' : shade(col, 0.7)} />)}
            <rect x={x - 12} y={y - h - 10} width="24" height="9" rx="2" fill="#fffaf0" stroke={shade(col, 0.6)} />
            <circle cx={x} cy={y - h - 5.5} r="2.5" fill={col} />
          </g>
        )
      }
      // Generic factory: sawtooth roof, chimney, conveyor out front
      const top = y + 4 - h
      return (
        <g>
          <Box x={x} y={y + 4} a={32} b={16} h={h} color={col} win={w} night={night} />
          {[0, 1, 2, 3].map(i => {
            const sx = x - 32 + i * 8, sy = top + i * 4
            return <polygon key={i} points={`${sx},${sy} ${sx + 8},${sy + 4} ${sx + 8},${sy - 6}`} fill={shade(col, 0.55)} />
          })}
          <rect x={x + 14} y={top - 26} width="7" height="22" fill="#8d8a93" />
          {busy && <Smoke x={x + 17.5} y={top - 30} />}
          <path d={`M${x - 34},${y + 12} L${x - 10},${y + 24}`} stroke="#6f6a75" strokeWidth="4" />
          <path d={`M${x - 34},${y + 12} L${x - 10},${y + 24}`} stroke="#f2e6c8" strokeWidth="2" strokeDasharray="3 4" className={busy ? 'belt' : ''} />
        </g>
      )
    }
  }
}

/** Sky tint for the hour: 0 at midday, up to ~0.45 at night, warm at dusk. */
export function skyTint(hour: number) {
  const h = hour % 24
  if (h >= 7 && h < 18) return { fill: '#fff6d6', op: 0 }
  if (h >= 18 && h < 20) return { fill: '#f0956b', op: 0.18 }
  if (h >= 5 && h < 7) return { fill: '#f6b48b', op: 0.15 }
  return { fill: '#1d2a5a', op: 0.42 }
}

export function Campus({ s, slots, sel, onPick }: { s: GameState; slots: number; sel: number | null; onPick: (i: number) => void }) {
  const tint = skyTint(s.hour)
  const night = tint.op > 0.3
  const W = OX * 2 + (COLS - ROWS) * TW, H = OY + (COLS + ROWS - 2) * TH + 90
  // Ring road path around the grid (for trucks).
  const c0 = tilePos(0), c5 = tilePos(COLS - 1), c18 = tilePos((ROWS - 1) * COLS), c23 = tilePos(COLS * ROWS - 1)
  const pad = 48
  const road = `M${c0.x},${c0.y - pad} L${c5.x + pad * 2},${c5.y} L${c23.x},${c23.y + pad} L${c18.x - pad * 2},${c18.y} Z`
  const order = Array.from({ length: 24 }, (_, i) => i)
  const busyCount = s.plots.filter(p => p?.job).length
  return (
    <svg className="campus" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Company campus">
      <defs>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d7ecc0" /><stop offset="1" stopColor="#bcdca3" /></linearGradient>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#4b5b3a" floodOpacity=".25" /></filter>
      </defs>
      {/* Island of grass under everything */}
      <path d={road} fill="url(#grass)" stroke="#a8c98f" strokeWidth="60" strokeLinejoin="round" filter="url(#soft)" />
      <path d={road} fill="none" stroke="#9aa0a8" strokeWidth="14" strokeLinejoin="round" />
      <path d={road} fill="none" stroke="#f7f3e8" strokeWidth="1.5" strokeDasharray="8 8" />
      {/* Trucks: more of them when more buildings are busy */}
      {[0, 1, 2].slice(0, 1 + Math.min(2, Math.floor(busyCount / 3))).map(i => (
        <g key={i}>
          <rect x="-7" y="-4" width="14" height="8" rx="2" fill={['#e07a5f', '#5d6bd4', '#e3b23c'][i]} />
          <rect x="3" y="-3" width="4" height="6" rx="1" fill="#eaf4ff" />
          <animateMotion dur={`${26 + i * 7}s`} begin={`${-i * 9}s`} repeatCount="indefinite" path={road} rotate="auto" />
        </g>
      ))}
      {order.map(i => {
        const { x, y } = tilePos(i)
        const bd = s.plots[i], locked = i >= slots
        const dia = `${x},${y - TH + 2} ${x + TW - 2},${y} ${x},${y + TH - 2} ${x - TW + 2},${y}`
        const j = bd?.job
        const pct = j && 'startH' in j ? Math.min(1, Math.max(0, (s.hour - j.startH) / (j.endH - j.startH))) : j ? 0.5 : 0
        return (
          <g key={i} className={`tile ${locked ? 'locked' : ''} ${sel === i ? 'sel' : ''}`} onClick={() => !locked && onPick(i)}>
            <polygon points={dia} className="pad" />
            {!bd && !locked && <text x={x} y={y + 5} textAnchor="middle" className="plus">+</text>}
            {locked && <text x={x} y={y + 5} textAnchor="middle" className="lock">🔒</text>}
            {bd && <Model type={bd.type} level={bd.level} busy={!!j && j.kind !== 'build'} night={night} x={x} y={y} />}
            {bd && j?.kind === 'build' && <g className="scaffold"><rect x={x - 20} y={y - 40} width="40" height="36" fill="none" stroke="#e3b23c" strokeDasharray="4 3" /></g>}
            {bd && (
              <g transform={`translate(${x + 30},${y - 40})`}>
                <circle r="11" fill="#fffaf0" stroke="#e3d9c6" />
                {j && <circle r="8" fill="none" stroke="#e07a5f" strokeWidth="3" strokeDasharray={`${pct * 50.3} 50.3`} transform="rotate(-90)" />}
                <text y="3.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#2d2a32">{bd.level}</text>
              </g>
            )}
          </g>
        )
      })}
      {/* Day / night tint over the whole scene */}
      <rect x="0" y="0" width={W} height={H} fill={tint.fill} opacity={tint.op} pointerEvents="none" style={{ transition: 'opacity 2s, fill 2s' }} />
    </svg>
  )
}

/** Small standalone render of one building (build menu, side panel). */
export function BuildingThumb({ type, level = 1, busy = false }: { type: string; level?: number; busy?: boolean }) {
  return (
    <svg viewBox="-60 -90 120 120" width="100%" height="100%">
      <polygon points="0,-30 62,0 0,30 -62,0" fill="#cfe6b8" />
      <Model type={type} level={level} busy={busy} night={false} x={0} y={0} />
    </svg>
  )
}
