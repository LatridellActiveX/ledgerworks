// ============================================================================
// Player-to-player trading ledger (stage 11).
//
// This module is PURE: it only changes a plain `Ledger` object. The Durable
// Object (worker/market-do.ts) loads the ledger, calls one of these
// functions, and saves it, so every trade happens in order, with no
// double-spending between players.
//
// Model:
//  - An account is a username plus a secret cloud key (only its hash is stored).
//  - Each account has a server-held wallet (cash) and depot (goods by quality).
//    Players move cash and goods between their local company and the depot.
//  - Sell orders live on the shared board. Listing locks goods out of the
//    depot. A buyer pays from their wallet, the seller gets the price minus a
//    3% fee, and the goods land in the buyer's depot.
//  - Contracts are private offers to one named player. The goods are locked
//    until the receiver accepts (pays) or declines, or the sender cancels
//    (goods come back).
//  - Rating: a letter grade from company value plus trade history.
// ============================================================================

export const FEE = 0.03
export const MAX_DEPOSIT = 50_000_000 // per call; sanity cap on client-reported transfers
export const MAX_ORDERS_PER_PLAYER = 30

export interface Account {
  name: string; hash: string; company: string
  wallet: number
  depot: Record<string, number> // "res|q" -> units
  value: number   // company value last reported by the client
  traded: number  // lifetime cash volume through the board and contracts
  trades: number
  joined: number
}
export interface Order { id: number; seller: string; res: string; q: number; qty: number; price: number; ts: number }
export interface Contract { id: number; from: string; to: string; res: string; q: number; qty: number; price: number; ts: number }
export interface Ledger { seq: number; accounts: Record<string, Account>; orders: Order[]; contracts: Contract[] }

export const emptyLedger = (): Ledger => ({ seq: 1, accounts: {}, orders: [], contracts: [] })
export const NAME_RE = /^[a-z0-9_]{3,20}$/
const k = (res: string, q: number) => `${res}|${q}`
const cents = (x: number) => Math.round(x * 100) / 100

type R<T = true> = T | string // a string is an error message

export function register(L: Ledger, name: string, hash: string, company: string, now: number): R {
  name = name.toLowerCase()
  if (!NAME_RE.test(name)) return 'Usernames are 3-20 letters, digits or _'
  if (L.accounts[name]) return 'That username is taken'
  L.accounts[name] = { name, hash, company: company.slice(0, 40), wallet: 0, depot: {}, value: 0, traded: 0, trades: 0, joined: now }
  return true
}

/** Check credentials; returns the account or an error. */
export function auth(L: Ledger, name: string, hash: string): R<Account> {
  const a = L.accounts[String(name).toLowerCase()]
  return a && a.hash === hash ? a : 'Wrong username or key'
}

// ---- wallet and depot transfers (the client debits/credits its local state) ----
export function deposit(a: Account, cash: number, goods: { res: string; q: number; qty: number }[] = []): R {
  if (!(cash >= 0) || cash > MAX_DEPOSIT) return 'Bad amount'
  for (const g of goods) if (!(g.qty > 0) || g.qty > 1e7 || !(g.q >= 0 && g.q <= 12)) return 'Bad goods'
  a.wallet = cents(a.wallet + cash)
  for (const g of goods) a.depot[k(g.res, g.q)] = (a.depot[k(g.res, g.q)] ?? 0) + Math.floor(g.qty)
  return true
}
export function withdrawCash(a: Account, cash: number): R {
  if (!(cash > 0) || cash > a.wallet + 1e-9) return 'Not enough in your trading wallet'
  a.wallet = cents(a.wallet - cash); return true
}
export function withdrawGoods(a: Account, res: string, q: number, qty: number): R {
  const have = a.depot[k(res, q)] ?? 0
  if (!(qty > 0) || qty > have) return 'Not enough in your depot'
  take(a, res, q, qty); return true
}
function take(a: Account, res: string, q: number, qty: number) {
  const left = (a.depot[k(res, q)] ?? 0) - qty
  if (left > 0) a.depot[k(res, q)] = left; else delete a.depot[k(res, q)]
}

// ---- the shared order board ----
export function list(L: Ledger, a: Account, res: string, q: number, qty: number, price: number, now: number): R<Order> {
  qty = Math.floor(qty)
  if (!(price > 0) || price > 1e6) return 'Bad price'
  if ((a.depot[k(res, q)] ?? 0) < qty || qty <= 0) return 'Not enough in your depot'
  if (L.orders.filter(o => o.seller === a.name).length >= MAX_ORDERS_PER_PLAYER) return 'Too many open orders'
  take(a, res, q, qty)
  const o = { id: L.seq++, seller: a.name, res, q, qty, price: cents(price), ts: now }
  L.orders.push(o); return o
}
export function cancel(L: Ledger, a: Account, id: number): R {
  const i = L.orders.findIndex(o => o.id === id && o.seller === a.name)
  if (i < 0) return 'No such order'
  const [o] = L.orders.splice(i, 1)
  a.depot[k(o.res, o.q)] = (a.depot[k(o.res, o.q)] ?? 0) + o.qty
  return true
}
/** Cheapest first, then oldest (same priority as the NPC exchange). */
export const board = (L: Ledger, res?: string) =>
  L.orders.filter(o => !res || o.res === res).sort((x, y) => x.price - y.price || x.ts - y.ts)

/** Buy up to `qty` from one order. The goods go to the buyer's depot. */
export function buy(L: Ledger, b: Account, id: number, qty: number): R<{ qty: number; paid: number }> {
  const o = L.orders.find(x => x.id === id)
  if (!o) return 'That order is gone'
  if (o.seller === b.name) return 'That is your own order'
  qty = Math.min(Math.floor(qty), o.qty)
  if (!(qty > 0)) return 'Bad amount'
  const paid = cents(qty * o.price)
  if (paid > b.wallet + 1e-9) return 'Not enough in your trading wallet'
  const s = L.accounts[o.seller]
  settle(b, s, o.res, o.q, qty, paid)
  o.qty -= qty
  if (o.qty <= 0) L.orders = L.orders.filter(x => x !== o)
  return { qty, paid }
}
function settle(buyer: Account, seller: Account | undefined, res: string, q: number, qty: number, paid: number) {
  buyer.wallet = cents(buyer.wallet - paid)
  buyer.depot[k(res, q)] = (buyer.depot[k(res, q)] ?? 0) + qty
  if (seller) { seller.wallet = cents(seller.wallet + paid * (1 - FEE)); seller.traded += paid; seller.trades++ }
  buyer.traded += paid; buyer.trades++
}

// ---- contracts: private offers to one named player ----
export function offer(L: Ledger, a: Account, to: string, res: string, q: number, qty: number, price: number, now: number): R<Contract> {
  to = String(to).toLowerCase()
  if (!L.accounts[to] || to === a.name) return 'Unknown player'
  qty = Math.floor(qty)
  if (!(price >= 0) || price > 1e6) return 'Bad price'
  if ((a.depot[k(res, q)] ?? 0) < qty || qty <= 0) return 'Not enough in your depot'
  take(a, res, q, qty)
  const c = { id: L.seq++, from: a.name, to, res, q, qty, price: cents(price), ts: now }
  L.contracts.push(c); return c
}
/** accept: receiver pays. decline: receiver refuses. cancel: sender withdraws. Goods go back on decline/cancel. */
export function answer(L: Ledger, a: Account, id: number, how: 'accept' | 'decline' | 'cancel'): R {
  const c = L.contracts.find(x => x.id === id)
  if (!c) return 'No such contract'
  if (how === 'cancel' ? c.from !== a.name : c.to !== a.name) return 'Not your contract'
  const from = L.accounts[c.from]
  if (how === 'accept') {
    const paid = cents(c.qty * c.price)
    if (paid > a.wallet + 1e-9) return 'Not enough in your trading wallet'
    settle(a, from, c.res, c.q, c.qty, paid) // contracts carry the same 3% fee
  } else if (from) from.depot[k(c.res, c.q)] = (from.depot[k(c.res, c.q)] ?? 0) + c.qty
  L.contracts = L.contracts.filter(x => x !== c)
  return true
}

// ---- rating and leaderboard ----
/** Score = log10 of company value plus a bonus for trading. Mapped to a letter grade. */
export function score(a: Pick<Account, 'value' | 'traded' | 'trades'>) {
  return Math.log10(1 + Math.max(0, a.value)) * 10 + Math.log10(1 + a.traded) * 3 + Math.min(20, a.trades * 0.5)
}
const GRADES: [number, string][] = [[100, 'AAA'], [92, 'AA'], [84, 'A'], [76, 'BBB'], [68, 'BB'], [60, 'B'], [0, 'C']]
export const grade = (sc: number) => GRADES.find(([m]) => sc >= m)![1]
export function leaderboard(L: Ledger, n = 20) {
  return Object.values(L.accounts).map(a => ({ name: a.name, company: a.company, value: a.value, score: Math.round(score(a)), grade: grade(score(a)) }))
    .sort((x, y) => y.score - x.score).slice(0, n)
}
/** Public, secret-free view of one account (for the client). */
export const view = (L: Ledger, a: Account) => ({
  name: a.name, company: a.company, wallet: a.wallet, depot: a.depot, grade: grade(score(a)), score: Math.round(score(a)),
  orders: L.orders.filter(o => o.seller === a.name),
  inbox: L.contracts.filter(c => c.to === a.name), outbox: L.contracts.filter(c => c.from === a.name),
})

/**
 * Delete your own account (needs your key; no admin). Your open orders and
 * the offers you sent are removed with it. Offers other players sent you go
 * back to their depots. Wallet and depot contents are discarded, so the UI
 * asks you to take them home first.
 */
export function deleteAccount(L: Ledger, a: Account): R {
  L.orders = L.orders.filter(o => o.seller !== a.name)
  for (const c of L.contracts) if (c.to === a.name) { const f = L.accounts[c.from]; if (f) f.depot[k(c.res, c.q)] = (f.depot[k(c.res, c.q)] ?? 0) + c.qty }
  L.contracts = L.contracts.filter(c => c.to !== a.name && c.from !== a.name)
  delete L.accounts[a.name]
  return true
}
