// ============================================================================
// Company identity: name validation and renaming, plus the procedural crest.
// Pure functions only (no DOM, no storage). The crest is derived from the
// company name, so it changes when the company is renamed and looks the same
// on every device.
// ============================================================================
import type { GameState } from './engine'

export const NAME_MIN = 2
export const NAME_MAX = 40
const ALLOWED = /^[\p{L}\p{N} .,'&-]+$/u

/** Trim, collapse spaces, and check the length and characters of a company name. */
export function cleanCompanyName(raw: string): { name: string } | { error: string } {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (Array.from(name).length < NAME_MIN) return { error: `Use at least ${NAME_MIN} characters.` }
  if (Array.from(name).length > NAME_MAX) return { error: `Keep it to ${NAME_MAX} characters or fewer.` }
  if (!ALLOWED.test(name)) return { error: "Letters, numbers, spaces and . , ' & - only." }
  return { name }
}

/** A copy of the game state under a new company name, or a message to show the player. */
export function renameCompany(s: GameState, raw: string): { state: GameState } | { error: string } {
  const c = cleanCompanyName(raw)
  if ('error' in c) return c
  if (c.name === s.company) return { error: 'That is already your company name.' }
  return { state: { ...s, company: c.name } }
}

export type CrestShape = 'shield' | 'hex' | 'circle'

export interface CrestParts {
  key: string        // stable id for SVG gradients
  hue: number
  hue2: number
  shape: CrestShape
  points: number     // star points in the centre (5 to 8)
  stripes: boolean
  initials: string
}

function hash(str: string): number {
  let h = 2166136261
  for (const ch of str) { h ^= ch.codePointAt(0) ?? 0; h = Math.imul(h, 16777619) >>> 0 }
  return h >>> 0
}

/** Deterministic design choices for a name: same name, same crest. */
export function crestParts(name: string): CrestParts {
  const clean = name.trim() || '?'
  const h = hash(clean)
  const rnd = (k: number) => {
    let x = (h + Math.imul(k, 0x9e3779b1)) >>> 0
    x = (x ^ (x >>> 16)) >>> 0
    x = Math.imul(x, 0x7feb352d) >>> 0
    x = (x ^ (x >>> 15)) >>> 0
    return x / 4294967296
  }
  const hue = Math.floor(rnd(1) * 360)
  const hue2 = (hue + 35 + Math.floor(rnd(2) * 70)) % 360
  const shape: CrestShape = (['shield', 'hex', 'circle'] as const)[Math.floor(rnd(3) * 3)]
  const points = 5 + Math.floor(rnd(4) * 4)
  const stripes = rnd(5) > 0.4
  const words = clean.split(/\s+/).filter(Boolean)
  const initials = (words.slice(0, 2).map(w => Array.from(w)[0] ?? '').join('') || '?').toUpperCase()
  return { key: h.toString(36), hue, hue2, shape, points, stripes, initials }
}

const SHIELD = 'M50 6 L88 18 L88 52 C88 76 70 90 50 96 C30 90 12 76 12 52 L12 18 Z'
const CIRCLE = 'M50 6 A44 44 0 1 1 50 94 A44 44 0 1 1 50 6 Z'

function hexPath(r = 44): string {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2
    return `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`
  })
  return 'M' + pts.join(' L') + ' Z'
}

/** Outline path for the crest shape, in a 100 by 100 box. */
export function outlinePath(shape: CrestShape): string {
  return shape === 'shield' ? SHIELD : shape === 'hex' ? hexPath() : CIRCLE
}

/** Points for an n-point star centred in the 100 by 100 box. */
export function starPoints(n: number, ro = 36, ri = 22): string {
  const out: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro
    const a = (Math.PI * i) / n - Math.PI / 2
    out.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`)
  }
  return out.join(' ')
}
