// Original flat pastel SVG art. Everything is drawn from simple shapes so it
// stays tiny and needs no image files.
import { BLD, RES } from '../game/data'

/** Darken a hex color by a factor (0..1) for shading sides and roofs. */
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.round(v * f).toString(16).padStart(2, '0')
  return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`
}

/**
 * A little building on a grass plot, seen from slightly above.
 * Production buildings get a sawtooth factory roof and chimney;
 * shops get an awning. Taller with more levels.
 */
export function BuildingArt({ type, level = 1, busy = false }: { type: string; level?: number; busy?: boolean }) {
  const b = BLD[type], col = b.color
  const h = 26 + Math.min(level, 10) * 3 // grows a little each level
  const top = 78 - h
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse cx="50" cy="84" rx="44" ry="11" fill="#cfe6b8" />
      <rect x="22" y={top} width="56" height={h} rx="3" fill={col} />
      <rect x="64" y={top} width="14" height={h} rx="2" fill={shade(col, 0.85)} />
      {b.kind === 'production' ? (
        <>
          <path d={`M22 ${top} l9 -10 l0 10 l9 -10 l0 10 l9 -10 l0 10 l9 -10 l0 10 l9 -10 l0 10 l11 0 z`} fill={shade(col, 0.7)} />
          <rect x="68" y={top - 22} width="7" height="16" fill="#8d8a93" />
          {busy && <circle className="puff" cx="71" cy={top - 28} r="5" fill="#ffffffcc" />}
        </>
      ) : (
        <>
          <rect x="18" y={top - 6} width="64" height="8" rx="2" fill="#fffaf0" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <rect key={i} x={18 + i * 8} y={top + 2} width="8" height="7" fill={i % 2 ? '#fffaf0' : shade(col, 0.8)} />)}
        </>
      )}
      <rect x="30" y={top + h - 16} width="10" height="16" rx="1" fill={shade(col, 0.55)} />
      <rect x="46" y={top + 10} width="12" height="9" rx="1" fill="#fff8e6" opacity=".85" />
    </svg>
  )
}

/** Round icon for a good: colored disc with its first letter. */
export function ResIcon({ id, size = 22 }: { id: string; size?: number }) {
  const r = RES[id]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
      <circle cx="12" cy="12" r="11" fill={r.color} stroke={shade(r.color, 0.7)} strokeWidth="1.5" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill={shade(r.color, 0.4)} fontFamily="system-ui">{r.name[0]}</text>
    </svg>
  )
}

/** Empty plot with a dashed "build here" outline. */
export function EmptyPlot({ locked }: { locked?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse cx="50" cy="70" rx="44" ry="14" fill={locked ? '#e3dccd' : '#dbecc8'} stroke={locked ? '#c9bfae' : '#a9cf8f'} strokeDasharray="5 4" strokeWidth="2" />
      <text x="50" y="76" textAnchor="middle" fontSize="20" fill={locked ? '#b5aa96' : '#7fae63'} fontFamily="system-ui">{locked ? '🔒' : '+'}</text>
    </svg>
  )
}

/** Logo: a stacked-ledger mark. */
export function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34">
      <rect x="4" y="18" width="26" height="9" rx="3" fill="#7fb3d5" />
      <rect x="7" y="10" width="20" height="9" rx="3" fill="#f5a65b" />
      <rect x="10" y="3" width="14" height="8" rx="3" fill="#9fd49a" />
    </svg>
  )
}
