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
//    game clock (day / dusk / night). [Removed Oct 2026: always daylight now.]
// All animation is CSS or SVG <animate>, so it costs almost no JS.
// ============================================================================
import type { GameState } from '../game/engine'
import { Defs2D, Ground2D, Model2D , SpireArt } from './campus2d'

const TW = 64, TH = 32 // half tile width / height in px
const COLS = 6, ROWS = 4
const OX = ROWS * TW + 40, OY = 120 // origin so the grid is centred

/** Screen position of a tile's centre. */
export const tilePos = (i: number) => {
  const c = i % COLS, r = Math.floor(i / COLS)
  return { x: OX + (c - r) * TW, y: OY + (c + r) * TH }
}

// Building drawings live in ./campus2d (detailed models matching the iso view).

// (Day/night sky tint removed: the map is always in daylight. The game clock
// still runs; it just no longer changes how the map looks.)

/** `spire`: plot index of the admin-only Trade Spire, only passed for admins (see App). */
export function Campus({ s, slots, sel, onPick, spire }: { s: GameState; slots: number; sel: number | null; onPick: (i: number) => void; spire?: number | null }) {
  // Always daytime: buildings and ground are drawn with night=false (no dark
  // surfaces, lit windows or glowing lamps).
  const night = false
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
        <Defs2D />
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
      {/* (The day/night tint overlay was removed: always daylight.) */}
      {order.map(i => {
        const { x, y } = tilePos(i)
        const bd = s.plots[i], locked = i >= slots
        const dia = `${x},${y - TH + 2} ${x + TW - 2},${y} ${x},${y + TH - 2} ${x - TW + 2},${y}`
        const j = bd?.job
        return (
          <g key={i} className={`tile ${locked ? 'locked' : ''} ${sel === i ? 'sel' : ''}`} onClick={() => !locked && onPick(i)}>
            <polygon points={dia} className="pad" />
            {!locked && !bd && i !== spire && <Ground2D x={x} y={y} night={night} />}
            {!bd && !locked && i === spire && <SpireArt x={x} y={y} />}
            {!bd && !locked && i !== spire && <text x={x} y={y + 5} textAnchor="middle" className="plus">+</text>}
            {locked && <text x={x} y={y + 5} textAnchor="middle" className="lock">🔒</text>}
            {bd && <Model2D type={bd.type} level={bd.level} busy={!!j && j.kind !== 'build'} night={night} x={x} y={y} />}
            {bd && j?.kind === 'build' && <g className="scaffold"><rect x={x - 20} y={y - 40} width="40" height="36" fill="none" stroke="#e3b23c" strokeDasharray="4 3" /></g>}
            {bd && (
              <g transform={`translate(${x - 52},${y - 4})`}>
                <circle r="11" fill="#fffaf0" stroke="#e3d9c6" />
                <text y="3.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#2d2a32">{bd.level}</text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Small standalone render of one building (build menu, side panel). */
export function BuildingThumb({ type, level = 1, busy = false }: { type: string; level?: number; busy?: boolean }) {
  return (
    <svg viewBox="-70 -100 140 135" width="100%" height="100%">
      <polygon points="0,-30 62,0 0,30 -62,0" fill="#cfe6b8" />
      <defs><Defs2D /></defs><Model2D type={type} level={level} busy={busy} night={false} x={0} y={0} withGround={false} />
    </svg>
  )
}
