// ============================================================================
// New-player tutorial logic (pure, no React, so it is unit-tested).
//
// Three parts:
//  1. GUIDED START: STEPS below. Each step has a `done(ctx)` check that
//     reads the game state (and which screen is open). The tutorial only
//     moves on when the player has actually DONE the thing, never on "Next".
//  2. GOALS: a short list that unlocks by company level, each with a small
//     cash reward the player claims. Hiring an executive is the last one.
//  3. TIPS: a one-time "Got it" note the first time some screens open.
//
// Progress lives in localStorage (TUT_KEY) so closing the app halfway
// resumes on the same step. Players who already have a company when this
// version first loads are marked done, so they never see it automatically.
// ============================================================================
import type { GameState } from './engine'
import { addStock, companyLevel, haveQty, xpForLevel } from './engine'

export const TUT_KEY = 'ledgerworks-tutorial-v2'
/** Older tour (pre Oct 2026). Only read to tell old players from new ones. */
export const OLD_TUT_KEY = 'ledgerworks-tutorial'

export interface TutState {
  step: number // index into STEPS
  done: boolean // guided start finished (or skipped)
  off: boolean // Settings: tutorial turned off (no guide, no tips)
  exBase?: number // stats.exRev when the Exchange step began
  crates?: boolean // starter crates already handed out
  tips: string[] // tip ids already dismissed
  goals: string[] // goal ids already claimed
  report?: boolean // player has opened a financial statement
}
export const blankTut = (): TutState => ({ step: 0, done: false, off: false, tips: [], goals: [] })

/** Minimal storage so tests can pass a fake. */
interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

/**
 * Load progress. First run of this version: a company that has already
 * built something (or an old-tour record) counts as an existing player,
 * so the guided start is marked done and never pops up for them.
 */
export function loadTut(s: GameState, store: KV = localStorage): TutState {
  try {
    const raw = store.getItem(TUT_KEY)
    if (raw) return { ...blankTut(), ...JSON.parse(raw) }
  } catch { /* corrupt: fall through to a fresh record */ }
  const existing = s.stats.built > 0 || s.plots.some(Boolean) || !!store.getItem(OLD_TUT_KEY)
  const t = { ...blankTut(), done: existing }
  store.setItem(TUT_KEY, JSON.stringify(t))
  return t
}
export const saveTut = (t: TutState, store: KV = localStorage) => store.setItem(TUT_KEY, JSON.stringify(t))

/** What a step's check can look at. */
export interface TutCtx { s: GameState; screen: string; t: TutState }

const has = (s: GameState, type: string) => s.plots.some(b => b?.type === type)
const built = (s: GameState, type: string) => s.plots.some(b => b?.type === type && b.job?.kind !== 'build')
/** A Corner market selling apples right now, or that has sold some. */
const sellingApples = (s: GameState) => s.plots.some(b => b?.type === 'market' && b.job?.kind === 'sell' && b.job.res === 'apples') || s.stats.retailRev > 0

export interface Step {
  id: string
  title: string
  text: string
  /** CSS selector of the button to spotlight (first visible match), if any. */
  sel?: (c: TutCtx) => string | undefined
  done: (c: TutCtx) => boolean
}

export const STEPS: Step[] = [
  { id: 'orchard', title: 'Build an orchard',
    text: 'Tap a free plot (marked +) on the map, then pick Orchard. Your first one is boosted, so it goes up in seconds.',
    sel: c => (c.screen === 'building' ? '[data-b="orchard"]' : undefined),
    done: c => has(c.s, 'orchard') },
  { id: 'plant', title: 'Grow some apples',
    text: 'Open your orchard once it is built, choose Apples and start growing. This first crop is boosted too.',
    done: c => haveQty(c.s, 'apples') > 0 || c.s.plots.some(b => b?.type === 'orchard' && b.job?.kind === 'make') },
  { id: 'apples', title: 'Collect your apples',
    text: 'When the crop is ripe, tap Harvest in the orchard (or the bubble on the map). The apples go to your Warehouse.',
    done: c => haveQty(c.s, 'apples') > 0 },
  { id: 'market', title: 'Build a Corner market',
    text: 'Tap another free plot and pick Corner market. Shops sell your goods to the public.',
    sel: c => (c.screen === 'building' ? '[data-b="market"]' : undefined),
    done: c => built(c.s, 'market') },
  { id: 'sell', title: 'Start selling apples',
    text: 'Open the Corner market, choose Apples, keep a few back for later, and tap Start selling.',
    done: c => sellingApples(c.s) },
  { id: 'cash', title: 'Collect the cash',
    text: 'Money builds up while the shop sells. Tap the $ bubble over the shop (or Collect in its panel).',
    done: c => c.s.stats.retailRev > 0 },
  { id: 'value', title: 'See your company value',
    text: 'Tap the cash pill at the top to see what your company is worth.',
    sel: () => '.pill.cash',
    done: c => c.screen === 'value' },
  { id: 'warehouse', title: 'Open the Warehouse',
    text: 'Tap Warehouse at the bottom. Everything you make or buy is stored here. We added 20 shipping crates for your first trade.',
    sel: c => (c.screen === 'warehouse' ? undefined : '[aria-label="Warehouse"]'),
    done: c => c.screen === 'warehouse' },
  { id: 'exchange', title: 'Sell a few crates on the Exchange',
    text: 'Open Apples and tap Sell on exchange. Traders buy instantly at today\'s price. (Need more apples? Grow another crop.)',
    done: c => c.s.stats.exRev > (c.t.exBase ?? 0) },
]

/** Reward for finishing the guided start: $1,000 and the first star (level 2). */
export const FINISH_CASH = 1000
export function giveFinishReward(s: GameState) {
  s.cash += FINISH_CASH
  if (companyLevel(s.xp) < 2) s.xp = xpForLevel(2) // "first star" = company level ★2
  s.log.unshift('Tutorial complete! +$1,000 and your first star.')
}

/**
 * Advance through every step whose check now passes. Returns the new state
 * (same object if nothing changed) and whether the guided start just ended.
 * Side effects on the game (starter crates) go through `s` in `onGame`.
 */
export function advance(t: TutState, s: GameState, screen: string): { t: TutState; finished: boolean; needCrates: boolean } {
  if (t.done || t.off) return { t, finished: false, needCrates: false }
  let n = { ...t }, moved = false
  while (n.step < STEPS.length && STEPS[n.step].done({ s, screen, t: n })) { n.step++; moved = true; if (STEPS[n.step]?.id === 'exchange') n.exBase = s.stats.exRev }
  // Hand out starter crates once, when the Warehouse step starts.
  const needCrates = n.step >= STEPS.findIndex(x => x.id === 'warehouse') && !n.crates && n.step < STEPS.length
  if (needCrates) { n.crates = true; moved = true }
  const finished = n.step >= STEPS.length
  if (finished) { n.done = true; n.step = 0 }
  return { t: moved ? n : t, finished, needCrates }
}
export const giveCrates = (s: GameState) => addStock(s, 'crates', 0, 20)

/**
 * Starter boost: while the guided start runs, the first orchard and Corner
 * market build in seconds, the first apple crop ripens in seconds, and the
 * first apple sale runs about half a minute. Returns true if it changed s.
 * (At 1x one game hour is one real hour, so 0.003 h is about 11 s.)
 */
export function boost(s: GameState): boolean {
  let ch = false
  const cap = (j: any, k: 'endH', h: number) => { if (j[k] > s.hour + h) { j[k] = s.hour + h; ch = true } }
  for (const b of s.plots) {
    const j: any = b?.job
    if (!b || !j || (b.type !== 'orchard' && b.type !== 'market')) continue
    if (j.kind === 'build') cap(j, 'endH', 0.003)
    else if (j.kind === 'make' && j.res === 'apples') cap(j, 'endH', 0.003) // ripeH is set by the engine when it ripens
    else if (j.kind === 'sell' && j.res === 'apples') cap(j, 'endH', 0.01)
  }
  return ch
}

// ---------------------------------------------------------------------------
// Goals: unlock by company level, claim for a small cash reward.
// Order matters: juice first ... hiring an executive (level 12) last.
// ---------------------------------------------------------------------------
export interface Goal { id: string; level: number; title: string; reward: number; done: (s: GameState, t: TutState) => boolean }
export const GOALS: Goal[] = [
  { id: 'juice', level: 3, title: 'Make your first fruit juice (Food works)', reward: 1500, done: s => haveQty(s, 'juice') > 0 || (s.madeToday?.juice ?? 0) > 0 },
  { id: 'report', level: 4, title: "Read today's financial report (Finance → Cash flow)", reward: 1000, done: (_s, t) => !!t.report },
  { id: 'route', level: 5, title: 'Set up a trade route', reward: 2500, done: s => (s.routes?.length ?? 0) > 0 },
  { id: 'patent', level: 6, title: 'Earn your first patent in Research', reward: 3000, done: s => Object.values(s.patents).some(n => n > 0) },
  { id: 'eight', level: 8, title: 'Run 8 buildings at once', reward: 5000, done: s => s.plots.filter(Boolean).length >= 8 },
  { id: 'store-10k', level: 10, title: 'Earn $10,000 from your shops', reward: 6000, done: s => s.stats.retailRev >= 10000 },
  { id: 'exec', level: 12, title: 'Hire an executive', reward: 10000, done: s => Object.keys(s.execs).length > 0 },
]
export type GoalState = 'locked' | 'open' | 'ready' | 'claimed'
export function goalState(g: Goal, s: GameState, t: TutState): GoalState {
  if (t.goals.includes(g.id)) return 'claimed'
  if (companyLevel(s.xp) < g.level) return 'locked'
  return g.done(s, t) ? 'ready' : 'open'
}
/** Claim a finished goal's reward. Returns an error or null. */
export function claimGoal(s: GameState, t: TutState, id: string): string | null {
  const g = GOALS.find(x => x.id === id)
  if (!g) return 'Unknown goal'
  if (goalState(g, s, t) !== 'ready') return 'Not done yet'
  s.cash += g.reward
  t.goals = [...t.goals, id]
  return null
}

// ---------------------------------------------------------------------------
// One-time tips (shown on first visit, unless the tutorial is turned off).
// ---------------------------------------------------------------------------
export const TIPS: Record<string, string> = {
  exchange: 'The Market is where you buy inputs and sell goods. The Exchange buys instantly; the Trade floor is for deals with other players.',
  research: 'Research turns goods into patents. Patents raise the quality, and the price, of what you make.',
  finance: 'Finance has bonds and government orders, plus your daily cash flow, balance sheet and ratios.',
  execs: 'Executives each run a part of your company and give it a lasting bonus. Better ones cost more.',
  routes: 'Trade routes send trucks of your goods to other cities on a schedule, for prices you cannot get at home.',
}
export const tipFor = (t: TutState, screen: string) => (!t.off && TIPS[screen] && !t.tips.includes(screen) ? TIPS[screen] : null)
