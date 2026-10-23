// ============================================================================
// Company logo (was a heraldic crest; modernised Oct 2026). Still generated
// from the company name via crestParts(), so the same name always gives the
// same logo and old saves need nothing. The component keeps the name Crest so
// callers don't change.
//
// Look: a flat, modern app-icon style mark.
//   - Badge shape: 'shield' now draws as a rounded square (squircle), 'hex'
//     stays a hexagon, 'circle' stays a circle. No heraldic shield any more.
//   - Fill: a clean two-hue diagonal gradient, with an optional faint grid
//     (replaces the old diagonal "heraldic" stripes).
//   - Mark: a small rising bar chart with a trend line; bar count comes from
//     `points` (3 or 4 bars), replacing the gold star and engraved tick ring.
//   - Initials in a bold geometric sans, bottom-left like a tech wordmark.
// ============================================================================
import { crestParts, outlinePath } from '../game/company'

/** Squircle used for the 'shield' shape: a modern rounded-square tile. */
const TILE = 'M30 6 H70 C86 6 94 14 94 30 V70 C94 86 86 94 70 94 H30 C14 94 6 86 6 70 V30 C6 14 14 6 30 6 Z'

export function Crest({ name, size = 64 }: { name: string; size?: number }) {
  const p = crestParts(name)
  const id = 'crest-' + p.key
  const outline = p.shape === 'shield' ? TILE : outlinePath(p.shape)
  // Bar-chart mark: 3 or 4 bars rising left to right, upper right of the badge.
  const n = p.points > 6 ? 4 : 3
  const bars = Array.from({ length: n }, (_, i) => {
    const h = 10 + (i + 1) * (26 / n)
    return <rect key={i} x={50 + i * 8} y={58 - h} width={5.5} height={h} rx={1.6} fill="#fff" opacity={0.55 + 0.45 * ((i + 1) / n)} />
  })
  return (
    <svg className="crest" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${name} logo`}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${p.hue} 78% 58%)`} />
          <stop offset="1" stopColor={`hsl(${p.hue2} 70% 34%)`} />
        </linearGradient>
        <clipPath id={`${id}-clip`}><path d={outline} /></clipPath>
      </defs>
      {/* badge */}
      <path d={outline} fill={`url(#${id}-bg)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {/* optional faint grid, like a dashboard background */}
        {p.stripes && Array.from({ length: 5 }, (_, i) => (
          <g key={i} stroke="#fff" strokeOpacity="0.09" strokeWidth="1">
            <line x1={i * 20 + 10} y1="0" x2={i * 20 + 10} y2="100" />
            <line x1="0" y1={i * 20 + 10} x2="100" y2={i * 20 + 10} />
          </g>
        ))}
        {/* soft top highlight for a glassy finish */}
        <path d="M0 0 H100 V38 Q50 26 0 38 Z" fill="#fff" opacity="0.12" />
      </g>
      {bars}
      {/* trend line over the bars */}
      <path d={`M48 ${n === 4 ? 44 : 46} L${50 + (n - 1) * 8 + 5} 22`} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <text x="16" y="82" textAnchor="start" fontSize={p.initials.length > 1 ? 24 : 28} fontWeight="700" fill="#fff"
        fontFamily="Inter, 'Segoe UI', system-ui, sans-serif" letterSpacing="-1">
        {p.initials}
      </text>
    </svg>
  )
}
