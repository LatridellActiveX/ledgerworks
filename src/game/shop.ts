// ============================================================================
// Shop fittings, registers, staff. Pure data and small rules: no engine import,
// so the engine (and the UI) can both use it without a cycle.
//
//  - Fittings are one-off purchases, one of each per shop. Each one changes how
//    a shop sells: demand, speed, price tolerance, storage limits or wages.
//  - Tills are stackable: each adds 10% to the shop's sales speed (max 5).
//  - A shift clerk doubles the sales speed between 09:00 and 17:00 game time,
//    and is paid an hourly wage for the hours they work on a sale.
// ============================================================================

export interface Fitting {
  id: string
  name: string
  /** Price as a share of the shop's base cost. */
  share: number
  /** Short line the UI shows under the name. */
  desc: string
}

export const FITTINGS: Fitting[] = [
  { id: 'display', name: 'Display case', share: 0.2, desc: '+10% customers' },
  { id: 'register', name: 'Extra register lane', share: 0.3, desc: '+25% sales speed' },
  { id: 'pricebd', name: 'Price board', share: 0.15, desc: 'Customers put up with higher prices (price sensitivity eased)' },
  { id: 'cold', name: 'Cold storage', share: 0.25, desc: 'Sales may run up to 5 days instead of 3' },
  { id: 'adboard', name: 'Advertising board', share: 0.35, desc: '+8% customers' },
  { id: 'bay', name: 'Delivery bay', share: 0.4, desc: 'Sale wages 15% lower' },
  { id: 'loyalty', name: 'Loyalty counter', share: 0.45, desc: '+6% customers; regulars count 25% extra toward market recovery' },
]

export const FITTING_IDS = FITTINGS.map(f => f.id)
export const fittingOf = (id: string) => FITTINGS.find(f => f.id === id)

export const TILL_MAX = 5
/** Cost of the next till, as a share of the shop's base cost, growing per till. */
export const tillShare = (have: number) => 0.1 * (have + 1)
export const TILL_SPEED = 0.1

export const CLERK_WAGE = 40 // per shift hour
export const SHIFT_START = 9
export const SHIFT_END = 17
export const CLERK_SPEED = 2

export const BAY_WAGE_MULT = 0.85
export const LOYAL_SOLD_WEIGHT = 1.25
export const PRICE_ELASTICITY = 2.2
export const PRICE_BOARD_ELASTICITY = 1.9

/** Hours of sales a shop may hold a single job for. */
export const maxSellHours = (mods: string[] | undefined) => (mods?.includes('cold') ? 120 : 72)

/** Shift window test on game hour (day starts at hour 0). */
export const onShift = (hour: number) => {
  const hod = ((hour % 24) + 24) % 24
  return hod >= SHIFT_START && hod < SHIFT_END
}

/** Customer draw from each fitting (multiplies a shop's demand). */
export const DEMAND_FIT: Record<string, number> = { display: 1.10, adboard: 1.08, loyalty: 1.06 }
export const REGISTER_SPEED = 1.25
