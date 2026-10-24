// ============================================================================
// Market news (headlines that move demand).
//
// Idea borrowed from Offworld Trading Company, where random world events
// (a solar flare, a strike, a pirate raid) suddenly push one market up or
// down and the players who notice first profit. Capitalism Lab does the
// same with its news reports. All headlines and numbers here are our own.
//
// How it works:
//  - Each game day (24 game hours, counted from founding) may start ONE news
//    story. A story picks a template below and lasts 2 or 3 days.
//  - While a story runs, shops sell its goods faster (mult > 1) or slower
//    (mult < 1). sellRate() in engine.ts multiplies by newsRetail().
//  - Offline, the Exchange's going price also drifts toward the story:
//    marketDay() in market.ts multiplies its target by newsPrice().
//  - Everything is a pure function of the day number (a small hash), so
//    there is NOTHING to save, old saves just work, and the same company
//    always sees the same stories on the same day. Day 0 (your first day)
//    is always quiet so a brand-new company starts from normal markets.
// ============================================================================

/** One kind of story. `goods` are resource ids from data.ts. */
import * as OV from './overrides'

export interface NewsTemplate {
  id: string
  /** Emoji shown as the story's picture on the news card. */
  icon: string
  headline: string
  blurb: string
  goods: string[]
  /** Retail speed multiplier while the story runs (1.4 = sells 40% faster). */
  mult: number
}

/** A story that is (or was) running: which template, and its day range. */
export interface NewsStory { t: NewsTemplate; startDay: number; endDay: number /* exclusive */ }

export const NEWS: NewsTemplate[] = [
  { id: 'heatwave', icon: '☀️', headline: 'Heatwave grips the region', blurb: 'Cold treats and drinks are flying off the shelves.', goods: ['icecream', 'soda', 'juice', 'yogurt', 'orangej', 'applej', 'gingerbeer'], mult: 1.5 },
  { id: 'coldsnap', icon: '❄️', headline: 'Early cold snap', blurb: 'Shoppers rush for warm clothes and fuel.', goods: ['sweater', 'scarf', 'jacket', 'boots', 'fuel'], mult: 1.4 },
  { id: 'harvest', icon: '🧺', headline: 'Harvest fair weekend', blurb: 'Bakes, preserves and wine are in demand.', goods: ['pie', 'cake', 'jam', 'wine', 'cheese', 'honey'], mult: 1.35 },
  { id: 'buildboom', icon: '🏗️', headline: 'Housing permits approved', blurb: 'Builders are stocking up on materials.', goods: ['bricks', 'cement', 'steel', 'blocks', 'boards', 'tiles', 'frame'], mult: 1.35 },
  { id: 'techlaunch', icon: '📱', headline: 'Gadget week sales event', blurb: 'Electronics stores see long lines.', goods: ['phone', 'laptop', 'tablet', 'headset', 'watch', 'speaker'], mult: 1.4 },
  { id: 'gameday', icon: '🏟️', headline: 'Championship final tonight', blurb: 'Snacks, fizzy drinks and big screens sell fast.', goods: ['pizza', 'crisps', 'soda', 'tv', 'sandwich'], mult: 1.4 },
  { id: 'moving', icon: '📦', headline: 'Moving season begins', blurb: 'New homes need furniture and paint.', goods: ['sofa', 'table', 'bed', 'door', 'paint', 'lamp'], mult: 1.35 },
  { id: 'fitness', icon: '🥗', headline: 'Healthy-eating trend', blurb: 'Fresh produce is up; sugary snacks are down.', goods: ['greens', 'berries', 'apples', 'tomatoes', 'yogurt', 'oranges'], mult: 1.35 },
  { id: 'sugarfree', icon: '🍬', headline: 'Sugar tax debate', blurb: 'Shoppers cut back on sweets for now.', goods: ['choc', 'soda', 'cake', 'icecream'], mult: 0.75 },
  { id: 'commute', icon: '🛴', headline: 'Fuel prices in the headlines', blurb: 'Commuters switch to e-bikes and scooters.', goods: ['ebike', 'scooter', 'skyfuel', 'solar'], mult: 1.4 },
  { id: 'dealers', icon: '🚗', headline: 'Low-interest car loans', blurb: 'Car and van sales pick up.', goods: ['car', 'van', 'fuel'], mult: 1.3 },
  { id: 'coffee', icon: '☕', headline: 'Coffee shop chain opens', blurb: 'Coffee, cake and sandwiches are popular.', goods: ['roast', 'cake', 'sandwich', 'milk'], mult: 1.35 },
  { id: 'glut', icon: '🌾', headline: 'Bumper crop of grains', blurb: 'Plenty of breakfast foods; shops buy slowly.', goods: ['bread', 'flakes', 'corn', 'potatoes', 'ricebowl'], mult: 0.8 },
  { id: 'fashion', icon: '👗', headline: 'Fashion week buzz', blurb: 'Dresses, bags and sneakers are trending.', goods: ['dress', 'handbag', 'sneakers', 'jeans', 'tshirt'], mult: 1.4 },
  // Grocery line (Oct 2026): a sunny-weekend grill event for the new meats and drinks.
  { id: 'bbq', icon: '🍖', headline: 'Barbecue weekend forecast', blurb: 'Steaks, sausages and cold drinks are selling out.', goods: ['steak', 'sausages', 'cider', 'gingerbeer', 'orangej'], mult: 1.4 },
  { id: 'dairyscare', icon: '🥛', headline: 'Dairy recall rumor', blurb: 'Shoppers avoid dairy until it is cleared.', goods: ['milk', 'butter', 'cheese', 'eggs'], mult: 0.75 },
]

/** Integer hash of a number (a small xorshift-multiply mix). Same input, same output. */
function hash(n: number) {
  let x = (n * 2654435761) >>> 0
  x ^= x >>> 16; x = Math.imul(x, 2246822507) >>> 0
  x ^= x >>> 13; x = Math.imul(x, 3266489909) >>> 0
  return (x ^ (x >>> 16)) >>> 0
}

/** The story that starts on `day`, or null for a quiet day (about 1 day in 4, and always day 0). */
export function storyStarting(day: number): NewsStory | null {
  if (day <= 0) return null
  const h = hash(day)
  if (h % 4 === 0) return null // quiet day
  const t = NEWS[(h >>> 4) % NEWS.length]
  return { t, startDay: day, endDay: day + 2 + ((h >>> 12) % 2) }
}

/** Stories running on `day` (a story lasts at most 3 days, so look back 2). */
export function activeStories(day: number): NewsStory[] {
  const out: NewsStory[] = []
  for (let d = day - 2; d <= day; d++) {
    const st = storyStarting(d)
    // The same template can't stack with itself; the newer one wins.
    if (st && st.endDay > day) { const i = out.findIndex(o => o.t.id === st.t.id); if (i >= 0) out.splice(i, 1); out.push(st) }
  }
  // Trade Spire override (overrides.ts): a custom story on top while it runs.
  const ov = OV.econ().news
  if (ov && Date.parse(ov.until) > Date.now()) out.push({ t: { id: 'admin-news', icon: ov.icon, headline: ov.headline, blurb: ov.blurb, goods: ov.goods, mult: ov.mult }, startDay: day, endDay: day + 1 })
  return out.reverse() // newest first
}

/** Stories from the last `n` days that have already ended (for the "Earlier" list). */
export function pastStories(day: number, n = 7): NewsStory[] {
  const out: NewsStory[] = []
  for (let d = day - 1; d >= Math.max(1, day - n); d--) { const st = storyStarting(d); if (st && st.endDay <= day) out.push(st) }
  return out
}

/** Stories that start tomorrow are announced as "Rumor" so you can prepare a day ahead. */
export const rumor = (day: number) => storyStarting(day + 1)

/** Game day number for a game hour. */
export const dayOf = (hour: number) => Math.floor(hour / 24)

/** Retail speed multiplier for a good right now (product of running stories). */
export function newsRetail(res: string, hour: number) {
  let m = 1
  for (const st of activeStories(dayOf(hour))) if (st.t.goods.includes(res)) m *= st.t.mult
  return m
}

/**
 * Exchange price pull for a good (offline only). Half as strong as the retail
 * effect: a +40% demand story nudges the going price toward +20%.
 */
export const newsPrice = (res: string, hour: number) => 1 + (newsRetail(res, hour) - 1) * 0.5
