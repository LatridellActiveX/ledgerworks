// Shared art exports. Building and good art now live in campus.tsx and
// icons.tsx; this file keeps the old names working and holds the logo.
export { ResIcon } from './icons'
export { BuildingThumb as BuildingArt } from './campus'

/** Logo: a stacked-ledger mark. */
export function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 34 34" className="logo">
      <rect x="4" y="18" width="26" height="9" rx="3" fill="#7fb3d5" />
      <rect x="7" y="10" width="20" height="9" rx="3" fill="#f5a65b" />
      <rect x="10" y="3" width="14" height="8" rx="3" fill="#9fd49a" />
    </svg>
  )
}
