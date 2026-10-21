// Number/time formatting helpers for the UI.
/** Dollars with cents below $10,000 (prices, unit costs); whole dollars above
 *  (cash balances), so "$2.40" never shows as "$2". */
export const money = (n: number) =>
  Math.abs(n) < 0.005 ? '$0' : // a plain zero reads better than "$0.00"
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', Math.abs(n) < 10000 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })
export const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString('en-US')
/** Game hours -> "2d 3h" / "3h 20m" / "45m". */
export function dur(h: number) {
  // Work in whole minutes first so we never show "4h 60m".
  const m = Math.max(1, Math.round(h * 60))
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}m`
}
/** Game clock -> "Day 3, 14:05". */
export function clock(hour: number) {
  const d = Math.floor(hour / 24) + 1, hh = Math.floor(hour % 24), mm = Math.floor((hour % 1) * 60)
  return `Day ${d}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
