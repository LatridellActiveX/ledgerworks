// ============================================================================
// Farms (Orchards): the hands-on side of growing crops.
//
// A crop job still makes its goods over time, but now:
//  - Soil: each plot rolls a soil value when it first plants (bell curve around
//    1). Richer soil grows faster. Harvests tire the soil, and idle days let it
//    recover, so rotating plots pays.
//  - Tending: while a crop grows you can tend it (water, weed, prune). Each
//    tend pulls the ripening time in by TEND_SPEED of what is left. Three or
//    more tends during a crop's life lift its quality by one step at harvest.
//  - Ripening: a crop does not pay out by itself when its timer ends. It ripens
//    and waits on the plot. Harvest it, or it slowly loses units, drops a
//    quality step after LATE_H hours, and is lost completely after SPOIL_H.
//  - Weather: each game day is clear, rainy, frosty or hot. Rain speeds growth.
//    Heat slows it unless the plot is irrigated. Frost destroys part of a crop
//    unless the plot was tended in the last day.
//  - Irrigation: a drip line per plot cuts water use by a third.
//  - Grafting: a graft attempt may give the next crop from that plot +1 quality.
//
// Everything here is pure. engine.ts calls these functions and keeps the
// accrual and payment rules in one place.
// ============================================================================
import type { GameState, Building } from './engine'

// ----------------------------------------------------------------------------
// Extra fields (Oct 2026, Parker's "Option B"). Farms no longer level up.
// Instead a farm buys up to 3 extra fields beside it. Each field:
//  - is its own small growing unit (a Building-shaped object kept in
//    bd.fields) with its own crop, soil, timer, tending, drip line and graft,
//    so every existing crop rule (ripening, weather, Turbo Week...) just works,
//  - grows at FIELD_OUT (0.6x) of the base level-1 rate. We get that by giving
//    the field `level: FIELD_OUT`: production time divides by level and wages
//    multiply by it, so output AND wages are both 0.6x, the same unit cost.
// Fields are addressed by a "plot ref" number so every engine action that
// takes a plot index also accepts a field: ref = plot + FIELD_REF * (f + 1).
// Plain plot indexes (< FIELD_REF) keep meaning the farm's own main field.
// ----------------------------------------------------------------------------
/** Price of the 1st, 2nd and 3rd extra field. The array length is the cap. */
export const FIELD_COSTS = [9000, 14000, 20000]
export const MAX_FIELDS = FIELD_COSTS.length
/** Output (and wages) of one extra field, relative to a level-1 farm. */
export const FIELD_OUT = 0.6
/** Multiplier used to pack (plot, field) into one number. Far above any plot count. */
export const FIELD_REF = 1000
/** Plot ref for extra field `f` (0-based) of the farm on `plot`. */
export const fieldRef = (plot: number, f: number) => plot + FIELD_REF * (f + 1)
/** Split a plot ref back into its plot index and field (-1 = the farm itself). */
export const splitRef = (ref: number) => ({ plot: ref % FIELD_REF, field: Math.floor(ref / FIELD_REF) - 1 })
/** Total paid for the first `n` extra fields (valuation and scrap refund). */
export const fieldsPaid = (n: number) => FIELD_COSTS.slice(0, n).reduce((t, c) => t + c, 0)
/** Every farm growing unit: each farm's main field followed by its extra fields. */
export const farmUnits = (s: GameState): Building[] =>
  s.plots.flatMap(bd => (bd && isFarm(bd.type) ? [bd, ...(bd.fields ?? [])] : []))

export const FARM_TYPES = ['orchard']
export const isFarm = (type: string) => FARM_TYPES.includes(type)

export const TEND_GAP_H = 0.05 // game hours between tends on one plot
export const TEND_SPEED = 0.08 // each tend pulls the ripening in by this share of what is left
export const TEND_QUALITY_AT = 3 // tends during a crop's life for +1 quality at harvest
export const LATE_H = 6 // hours after ripening before the quality drops
export const SPOIL_H = 72 // hours after ripening before a crop is lost
export const LATE_DECAY = 0.99 // units kept per hour after ripening
export const FROST_LOSS = 0.1 // share of unharvested growth lost to frost
export const IRRIGATION_WATER = 0.67 // water use with a drip line
export const GRAFT_CHANCE = 0.4
export const SOIL_MIN = 0.5
export const SOIL_MAX = 1.2

export type Weather = 'clear' | 'rain' | 'frost' | 'heat'
export const WEATHER: Record<Weather, { label: string; icon: string; note: string }> = {
  clear: { label: 'Clear', icon: '☀', note: 'Steady growing weather.' },
  rain: { label: 'Rain', icon: '🌧', note: 'Crops grow 10% faster.' },
  frost: { label: 'Frost', icon: '❄', note: 'Frost takes 10% of unripe crops unless you tended them in the last day.' },
  heat: { label: 'Heat', icon: '🔥', note: 'Crops grow 8% slower unless irrigated.' },
}
/** Today's weather from one seeded draw in [0, 1). */
export const rollWeather = (r: number): Weather => (r < 0.55 ? 'clear' : r < 0.8 ? 'rain' : r < 0.92 ? 'frost' : 'heat')

/** Share of a job finished at `hour`, 0 to 1. */
export const growFrac = (j: { startH: number; endH: number }, hour: number) => (j.endH <= j.startH ? 1 : Math.min(1, Math.max(0, (hour - j.startH) / (j.endH - j.startH))))

/**
 * Change how long a crop still takes without changing what has grown so far.
 * `pct` > 0 speeds it up (share of the time left that goes away), `pct` < 0
 * slows it down. The growth fraction at `now` stays exactly the same.
 */
export function speedUp(j: { startH: number; endH: number }, now: number, pct: number) {
  const f0 = growFrac(j, now)
  if (f0 >= 1 || !(f0 >= 0)) return
  const p = Math.min(0.9, pct) // never more than 90% in one go
  const newEnd = now + Math.max(0, j.endH - now) * (1 - p)
  j.startH = (now - f0 * newEnd) / (1 - f0)
  j.endH = newEnd
}

/** Soil quality for a new plot: a bell curve around 1, clamped. `rnd` gives uniforms in [0, 1). */
export function rollSoil(rnd: () => number): number {
  const u = Math.max(1e-9, rnd()), v = rnd()
  const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.min(SOIL_MAX, Math.max(SOIL_MIN, 1 + 0.15 * g))
}

/** Units still on the plot after ripening, `hours` late. Never more than the planted amount. */
export const ripeUnits = (j: { qty: number }, ripeH: number, hour: number) => {
  const late = Math.max(0, hour - ripeH)
  return late >= SPOIL_H ? 0 : Math.min(j.qty, Math.floor(j.qty * Math.pow(LATE_DECAY, late) + 1e-9))
}
/** Quality of the crop at `hour`: one step lost once it is more than LATE_H late. */
export const ripeQuality = (q: number, ripeH: number, hour: number) => (hour - ripeH >= LATE_H ? Math.max(0, q - 1) : q)

/** Water need of one unit of a crop, with the drip line if the plot has one. */
export const waterFactor = (irrigated?: boolean) => (irrigated ? IRRIGATION_WATER : 1)

/** Soil after a harvest: each harvest tires the plot a little. */
export const soilAfterHarvest = (soil: number) => Math.max(SOIL_MIN, soil * 0.97)
/** Soil recovery per idle day. */
export const soilRecover = (soil: number) => Math.min(SOIL_MAX, soil + 0.01)

/** Daily weather effects on unripe crops, applied at midnight. Returns the lines to tell the player. */
export function farmDay(s: GameState, r: number): string[] {
  const out: string[] = []
  const w = rollWeather(r)
  s.weather = w
  const notes: string[] = []
  for (const bd of farmUnits(s)) { // main fields and extra fields alike
    const j = bd.job
    if (!j || j.kind !== 'make') { bd.soil = soilRecover(bd.soil ?? 1); continue }
    if (j.ripeH !== undefined) continue
    if (bd.greenhouse) continue // under glass: no rain boost, no heat, no frost
    if (w === 'rain') speedUp(j, s.hour, 0.1)
    if (w === 'heat' && !bd.irrigated) speedUp(j, s.hour, -0.08)
    if (w === 'frost' && s.hour - (j.tendH ?? -Infinity) > 24) {
      const lost = Math.min(j.qty - (j.got ?? 0), Math.ceil(j.qty * FROST_LOSS))
      j.qty -= lost
      notes.push(`Frost hit the orchard and took ${lost} unripe units. Tend your crops daily to protect them.`)
    }
  }
  out.push(`Weather: ${WEATHER[w].label}. ${WEATHER[w].note}`)
  return [...out, ...notes]
}

// --------------------------------------------------------------------------
// Farm add-ons (soil stars, crop rotation, greenhouse, tractor, sprinkler).
//
//  - Soil stars: every field carries a 1-5 star rating (`Building.stars`),
//    starting at 3. Each harvest wears it down a little (STAR_WEAR). Output
//    at harvest moves STAR_OUT (10%) per star, measured against 3 stars, so
//    5 stars = +20% and 1 star = -20%. This sits on top of the older hidden
//    `soil` pace value, which still sets how fast a crop grows.
//  - Compost (+1 star) and fertilizer (+2 stars) are consumables: cash spent,
//    nothing kept on the books (like grafts).
//  - Crop rotation: after ROTATE_AFTER harvests of the same crop in a row,
//    planting a different crop restores +1 star for free.
//  - Greenhouse (per field): weather and economy/season slumps can't touch
//    the field, and crops grow GH_SPEED faster.
//  - Tractor (per farm, stored on the main farm building): every crop on
//    the farm needs TRACTOR_CUT less time to be ready for harvest.
//  - Sprinkler (irrigation tier 2, per field, needs the drip line): +15%
//    output at harvest.
// Greenhouse, tractor and sprinkler are durable kit: they count at cost
// toward book value, Company Value and the balance sheet (engine.upgradesValue).
// --------------------------------------------------------------------------
export const STAR_START = 3
export const STAR_MIN = 1
export const STAR_MAX = 5
export const STAR_WEAR = 0.2 // stars lost per harvest (five harvests = one star)
export const STAR_OUT = 0.1 // output change per star away from 3
export const COMPOST_COST = 2000
export const FERTILIZER_COST = 4000
export const ROTATE_AFTER = 3 // same-crop harvests in a row before rotating pays off
export const GREENHOUSE_COST = 12000
export const GH_SPEED = 0.15 // +15% growth speed
export const TRACTOR_COST = 8000
export const TRACTOR_CUT = 0.2 // -20% time to harvest
export const SPRINKLER_OUT = 0.15 // +15% output
/** Sprinkler price: like the drip line it scales with the field's size (0.6x fields pay 0.6x). */
export const sprinklerCost = (level: number) => Math.round(3000 * level)

/** A field's stars (old saves without a rating read as the starting 3). */
export const starsOf = (bd: { stars?: number }) => bd.stars ?? STAR_START
/** Clamp a star value into 1..5. */
export const clampStars = (v: number) => Math.min(STAR_MAX, Math.max(STAR_MIN, v))
/** Harvest output multiplier from soil stars and the sprinkler. */
export const outMult = (bd: { stars?: number; sprinkler?: boolean }) =>
  (1 + STAR_OUT * (starsOf(bd) - STAR_START)) * (bd.sprinkler ? 1 + SPRINKLER_OUT : 1)
/** Grow-time multiplier from the greenhouse (faster) and the farm's tractor (shorter). */
export const timeMult = (bd: { greenhouse?: boolean }, tractor?: boolean) =>
  (bd.greenhouse ? 1 / (1 + GH_SPEED) : 1) * (tractor ? 1 - TRACTOR_CUT : 1)

/**
 * Short string of a farm's visible add-ons for the map art and the 3D redraw
 * key: 'T' if it owns a tractor, then one char per unit (main field first)
 * - 'g' greenhouse, '-' none. Non-farms get ''.
 */
export const farmKit = (bd: { type: string; tractor?: boolean; greenhouse?: boolean; fields?: { greenhouse?: boolean }[] }) =>
  isFarm(bd.type) ? (bd.tractor ? 'T' : '') + [bd, ...(bd.fields ?? [])].map(u => (u.greenhouse ? 'g' : '-')).join('') : ''
