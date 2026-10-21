// ============================================================================
// Company crest: a layered SVG emblem generated from the company name.
// Layers: shaped badge with a gradient and diagonal stripes, a glassy sheen,
// a gold dashed ring with 24 engraved ticks, a star medallion, and the
// company's initials on a dark disc. Renaming the company redraws it.
// ============================================================================
import { crestParts, outlinePath, starPoints } from '../game/company'

export function Crest({ name, size = 64 }: { name: string; size?: number }) {
  const p = crestParts(name)
  const id = 'crest-' + p.key
  const outline = outlinePath(p.shape)
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 24
    const r1 = i % 6 === 0 ? 29 : 33, r2 = 37
    return <line key={i} x1={50 + r1 * Math.cos(a)} y1={50 + r1 * Math.sin(a)} x2={50 + r2 * Math.cos(a)} y2={50 + r2 * Math.sin(a)}
      stroke={`url(#${id}-gold)`} strokeWidth={i % 6 === 0 ? 1.6 : 0.9} />
  })
  return (
    <svg className="crest" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${name} crest`}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={`hsl(${p.hue} 72% 54%)`} />
          <stop offset="0.55" stopColor={`hsl(${p.hue} 60% 30%)`} />
          <stop offset="1" stopColor={`hsl(${p.hue2} 65% 16%)`} />
        </linearGradient>
        <radialGradient id={`${id}-gold`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.5" stopColor="#f0c060" />
          <stop offset="1" stopColor="#8a5a14" />
        </radialGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}><path d={outline} /></clipPath>
        <filter id={`${id}-shadow`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.6" stdDeviation="1.4" floodColor="#000" floodOpacity="0.5" />
        </filter>
      </defs>
      <path d={outline} fill={`url(#${id}-bg)`} filter={`url(#${id}-shadow)`} />
      <g clipPath={`url(#${id}-clip)`}>
        {p.stripes && Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x={-40 + i * 22} y={-20} width={9} height={150} fill="#fff" opacity={0.08} transform="rotate(30 50 50)" />
        ))}
        <path d="M0 0 H100 V44 Q50 30 0 44 Z" fill={`url(#${id}-sheen)`} />
      </g>
      <path d={outline} fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="3" />
      <circle cx="50" cy="50" r="31" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="2" strokeDasharray="3 2.5" />
      {ticks}
      <polygon points={starPoints(p.points)} fill={`url(#${id}-gold)`} stroke="#5a3a0a" strokeWidth="0.8" strokeOpacity="0.6" filter={`url(#${id}-shadow)`} />
      <circle cx="50" cy="50" r="16" fill={`hsl(${p.hue} 55% 14%)`} stroke={`url(#${id}-gold)`} strokeWidth="1.6" />
      <text x="50" y="55.5" textAnchor="middle" fontSize={p.initials.length > 1 ? 14 : 18} fontWeight="800" fill="#fff8e0" fontFamily="system-ui, sans-serif">
        {p.initials}
      </text>
    </svg>
  )
}
