// Small seeded random generator (mulberry32) so the NPC market is
// reproducible from the save and testable.
export function rand(seed: number): [number, number] {
  let t = (seed + 0x6d2b79f5) | 0
  const next = t
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}
