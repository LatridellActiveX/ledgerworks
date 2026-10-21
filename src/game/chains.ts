// ============================================================================
// Production chains: pure logic behind the "Production chains" explorer.
//
// The idea (not the art or text) comes from Anno 1800's production-chain
// overview and Factorio's recipe browser: pick a good and see the whole tree
// of what it takes to make it, with a "how many supplier buildings keep this
// one busy" ratio at every step (Anno's famous perfect ratios).
//
// Everything here is plain data in / plain data out (no React, no audio),
// so it is unit-tested in tests/chains.test.ts. The UI lives in
// src/ui/Chains.tsx.
//
// Numbers are for ONE level-1 building running flat out, the same base rate
// the game data uses (REC[good].perHour is "units per hour at level 1").
// Prices come from a function you pass in, so the UI can use live market
// reference prices and tests can use fixed prices.
// ============================================================================
import { BUILDINGS, REC, RECIPES, RES, type BuildingType } from './data'

/** Deepest tree we ever build. Real chains top out around 6-7 steps. */
export const MAX_DEPTH = 8

/** What the tree builder needs to know about the player's company. */
export interface ChainCtx {
  /** Market price for one unit of a good (e.g. the exchange reference price). */
  price: (res: string) => number
  /** How many of this building type the player owns (0 = none). */
  owned?: (buildingId: string) => number
  /** Units of this good in the warehouse right now. */
  inStock?: (res: string) => number
}

/** Money figures for one production step, all per hour of one level-1 building. */
export interface StepMath {
  /** Units made per hour. */
  perHour: number
  /** What the inputs would cost per hour if bought at market prices. */
  inputCost: number
  /** Building wages per hour (level 1, before company overhead). */
  wages: number
  /** What the output is worth per hour at the market price. */
  outputValue: number
  /** outputValue - inputCost - wages. Can be negative. */
  profit: number
}

/** One node of the chain tree: a good, the building that makes it, and its inputs. */
export interface ChainNode {
  res: string
  /** Building that produces this good (undefined if nothing in the game makes it). */
  building?: BuildingType
  /** How many units per ONE unit of the parent this step supplies (1 for the root). */
  perParent: number
  /** Units per hour the parent needs from this step to keep one parent building busy. */
  needPerHour: number
  /** Level-1 buildings of this kind needed to keep one parent building busy (Anno-style ratio). */
  ratio: number
  math: StepMath
  /** Buildings of this type the player owns. */
  owned: number
  /** Units of this good in the warehouse. */
  stock: number
  /** The children (inputs). Empty for raw goods or when cut off. */
  inputs: ChainNode[]
  /** Why the children were not expanded: a loop back to an ancestor, or too deep. */
  cut?: 'cycle' | 'depth'
}

/** The first building whose recipe list contains this good. */
export const makerOf = (res: string): BuildingType | undefined =>
  BUILDINGS.find(b => b.kind === 'production' && b.recipes?.includes(res))

/**
 * Profit math for one step: one level-1 building making `res` for an hour.
 * Inputs are valued at market price (what you'd pay, or what you give up by
 * not selling them), which is how Sim-style games usually judge a recipe.
 */
export function stepMath(res: string, price: (r: string) => number): StepMath {
  const rc = REC[res]
  if (!rc) return { perHour: 0, inputCost: 0, wages: 0, outputValue: 0, profit: 0 }
  const perHour = rc.perHour
  // Sum of (units of input per output) x (outputs per hour) x (price per input unit).
  const inputCost = Object.entries(rc.inputs).reduce((t, [inp, n]) => t + n * perHour * price(inp), 0)
  const wages = makerOf(res)?.wage ?? 0
  const outputValue = perHour * price(res)
  return { perHour, inputCost, wages, outputValue, profit: outputValue - inputCost - wages }
}

/**
 * Build the full chain tree for `res`.
 * - `path` holds the goods above this node, so a recipe that eventually needs
 *   its own output (e.g. crates need boards, boards need power...) stops with
 *   cut: 'cycle' instead of recursing forever.
 * - Depth is capped at MAX_DEPTH (cut: 'depth').
 */
export function buildChain(res: string, ctx: ChainCtx, perParent = 1, parentPerHour = 0, path: string[] = []): ChainNode {
  const math = stepMath(res, ctx.price)
  // Units/hour the parent consumes of this good; for the root it's the root's own output.
  const needPerHour = path.length ? perParent * parentPerHour : math.perHour
  const building = makerOf(res)
  const node: ChainNode = {
    res, building, perParent, needPerHour,
    ratio: math.perHour > 0 ? needPerHour / math.perHour : 0,
    math,
    owned: building && ctx.owned ? ctx.owned(building.id) : 0,
    stock: ctx.inStock ? ctx.inStock(res) : 0,
    inputs: [],
  }
  const rc = REC[res]
  if (!rc) return node
  const ins = Object.entries(rc.inputs)
  if (!ins.length) return node // raw good: nothing feeds it
  if (path.includes(res)) { node.cut = 'cycle'; return node }
  if (path.length >= MAX_DEPTH) { node.cut = 'depth'; return node }
  const below = [...path, res]
  node.inputs = ins.map(([inp, n]) => buildChain(inp, ctx, n, math.perHour, below))
  return node
}

/** Every good whose recipe uses `res` as an input ("Used in"), with how much per unit. */
export function usedIn(res: string): { res: string; amount: number }[] {
  return RECIPES.filter(rc => rc.inputs[res] !== undefined)
    .map(rc => ({ res: rc.output, amount: rc.inputs[res] }))
    .sort((a, b) => RES[a.res].name.localeCompare(RES[b.res].name))
}

/** Count of nodes in a tree (handy for tests and for "N steps" labels). */
export const countNodes = (n: ChainNode): number => 1 + n.inputs.reduce((t, c) => t + countNodes(c), 0)

/** Stable key for a node's position in the tree, e.g. "bread>flour>wheat". */
export const nodeKey = (path: string[], res: string) => [...path, res].join('>')
