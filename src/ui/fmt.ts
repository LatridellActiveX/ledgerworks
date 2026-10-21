// Number/time formatting helpers for the UI.
export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
export const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US')
/** Game hours -> "2d 3h" / "3h 20m" / "45m". */
export function dur(h: number) {
  if (h >= 24) return `${Math.floor(h / 24)}d ${Math.floor(h % 24)}h`
  if (h >= 1) return `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`
  return `${Math.max(1, Math.round(h * 60))}m`
}
/** Game clock -> "Day 3, 14:05". */
export function clock(hour: number) {
  const d = Math.floor(hour / 24) + 1, hh = Math.floor(hour % 24), mm = Math.floor((hour % 1) * 60)
  return `Day ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
