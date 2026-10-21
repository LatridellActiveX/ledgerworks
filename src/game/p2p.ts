// ============================================================================
// Player-to-player trading ledger (stage 11, extended for contracts and bonds).
//
// This module is PURE: it only changes a plain `Ledger` object. The Durable
// Object (worker/market-do.ts) loads the ledger, calls one of these
// functions, and saves it, so every trade happens in order, with no
// double-spending between players.
//
// Model:
//  - An account is a username plus a secret cloud key (only its hash is stored).
//  - Each account has a server-held wallet (cash), a depot (goods by quality)
//    and a bond box (bonds it has deposited or bought). Players move cash,
//    goods and bonds between their local company and the server.
//  - Sell orders on the goods board lock goods out of the depot. A buyer pays
//    from their wallet, the seller gets the price minus a 3% board fee, and the
//    goods land in the buyer's depot.
//  - Bond listings work the same way: a bond sits in the seller's bond box
//    until bought, the buyer pays the list price minus the 3% fee and the bond
//    lands in their bond box to move into their company.
//  - Contracts are PRIVATE offers to one named player with 1 to 5 item lines,
//    one total price, a note and a 7-day expiry. Contracts have NO service fee
//    and need NO shipping crates. The goods are locked until the receiver
//    accepts (pays the total) or declines, the sender withdraws, or the offer
//    expires (goods come back).
//  - Rating: a letter grade from company value plus trade history.
// ============================================================================

export const FEE = 0.03
export const MAX_DEPOSIT = 50_000_000 // per call; sanity cap on client-reported transfers
export const MAX_ORDERS_PER_PLAYER = 30
export const MAX_BOND_LISTINGS = 10
export const CONTRACT_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MAX_CONTRACT_LINES = 5
export const MAX_NOTE = 140
export const MAX_CONTRACT_TOTAL = 1e9

export interface Account {
  name: string; hash: string; company: string
  wallet: number
  depot: Record<string, number> // "res|q" -> units
  bonds?: BondCert[]            // bonds in the bond box (not yet in a company)
  value: number   // company value last reported by the client
  traded: number  // lifetime cash volume through the board, bonds and contracts
  trades: number
  joined: number
  /** Game account (username) this trade-floor account belongs to, once linked via the game session. */
  owner?: string
}
export interface Order { id: number; seller: string; res: string; q: number; qty: number; price: number; ts: number }
export interface Line { res: string; q: number; qty: number }
export interface Contract {
  id: number; from: string; to: string
  lines: Line[]
  total: number     // what the receiver pays for everything, no fee
  note: string
  ts: number
  expires: number
}
/** A bond the player owns on the server side. Issued by an NPC firm, like company holdings. */
export interface BondCert { id: number; issuer: string; rating: string; amount: number; rate: number }
export interface BondListing extends BondCert { seller: string; price: number; ts: number }
export interface Ledger { seq: number; accounts: Record<string, Account>; orders: Order[]; contracts: Contract[]; bondOrders?: BondListing[] }

export const emptyLedger = (): Ledger => ({ seq: 1, accounts: {}, orders: [], contracts: [], bondOrders: [] })
export const NAME_RE = /^[a-z0-9_]{3,20}$/
const k = (res: string, q: number) => `${res}|${q}`
const cents = (x: number) => Math.round(x * 100) / 100

type R<T = true> = T | string // a string is an error message

export function register(L: Ledger, name: string, hash: string, company: string, now: number): R {
  name = name.toLowerCase()
  if (!NAME_RE.test(name)) return 'Usernames are 3-20 letters, digits or _'
  if (L.accounts[name]) return 'That username is taken'
  L.accounts[name] = { name, hash, company: company.slice(0, 40), wallet: 0, depot: {}, bonds: [], value: 0, traded: 0, trades: 0, joined: now }
  return true
}

/**
 * Trade floor sign-in with the GAME session (stage 13). `user` is the signed-in
 * game username, set by the Worker from the session cookie (never by the
 * client). Order:
 *  1. an account already linked to this user (owner === user);
 *  2. a legacy key account the browser still holds (name + key hash match,
 *     not linked to anyone): it gets linked to the user now (auto-link);
 *  3. otherwise a new trading account is created for the user, named after
 *     the username (or username_2, _3... if a legacy trader already has it).
 * Linked accounts are reached only through the session; the random hash just
 * fills the old key slot so a key can't be guessed.
 */
export function sessionAccount(L: Ledger, user: string, legacy: { name?: unknown; hash?: string } | null, company: string, now: number, randomHash: string): { a: Account; linked?: boolean; created?: boolean } {
  const own = Object.values(L.accounts).find(a => a.owner === user)
  if (own) return { a: own }
  if (legacy && typeof legacy.name === 'string' && legacy.hash) {
    const old = L.accounts[legacy.name.toLowerCase()]
    if (old && !old.owner && old.hash === legacy.hash) { old.owner = user; return { a: old, linked: true } }
  }
  let name = user, n = 2
  while (L.accounts[name]) name = `${user.slice(0, 17)}_${n++}`
  L.accounts[name] = { name, hash: randomHash, company: company.slice(0, 40), wallet: 0, depot: {}, bonds: [], value: 0, traded: 0, trades: 0, joined: now, owner: user }
  return { a: L.accounts[name], created: true }
}

/** Check credentials; returns the account or an error. */
export function auth(L: Ledger, name: string, hash: string): R<Account> {
  const a = L.accounts[String(name).toLowerCase()]
  return a && a.hash === hash ? a : 'Wrong username or key'
}

// ---- wallet and depot transfers (the client debits/credits its local state) ----
export function deposit(a: Account, cash: number, goods: { res: string; q: number; qty: number }[] = []): R {
  if (!(cash >= 0) || cash > MAX_DEPOSIT) return 'Bad amount'
  for (const g of goods) if (!Number.isInteger(g.qty) || g.qty < 1 || g.qty > 1e7 || !(g.q >= 0 && g.q <= 12)) return 'Pick a whole amount of at least 1'
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
  if (!Number.isInteger(qty) || qty < 1) return 'Pick a whole amount of at least 1'
  if (qty > have) return 'Not enough in your depot'
  take(a, res, q, qty); return true
}
function take(a: Account, res: string, q: number, qty: number) {
  const left = (a.depot[k(res, q)] ?? 0) - qty
  if (left > 0) a.depot[k(res, q)] = left; else delete a.depot[k(res, q)]
}
function give(a: Account, res: string, q: number, qty: number) {
  a.depot[k(res, q)] = (a.depot[k(res, q)] ?? 0) + qty
}

// ---- the shared goods board ----
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
  give(a, o.res, o.q, o.qty)
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
  settle(b, s, paid, true)
  give(b, o.res, o.q, qty)
  o.qty -= qty
  if (o.qty <= 0) L.orders = L.orders.filter(x => x !== o)
  return { qty, paid }
}
/** Move money between two trading wallets. `fee` keeps the 3% board cut; contracts pay in full. */
function settle(buyer: Account, seller: Account | undefined, paid: number, fee: boolean) {
  buyer.wallet = cents(buyer.wallet - paid)
  if (seller) { seller.wallet = cents(seller.wallet + (fee ? paid * (1 - FEE) : paid)); seller.traded += paid; seller.trades++ }
  buyer.traded += paid; buyer.trades++
}

// ---- bonds: a bond box per account and a bond board ----
const bondsOf = (a: Account): BondCert[] => (a.bonds ??= [])
export const bondBoard = (L: Ledger) => (L.bondOrders ??= []).slice().sort((x, y) => x.price / x.amount - y.price / y.amount || x.ts - y.ts)

/** Validate the public terms of one bond certificate before it enters the server. */
function bondTerms(b: Partial<BondCert>): R<BondCert> {
  const amount = Number(b.amount), rate = Number(b.rate)
  if (typeof b.issuer !== 'string' || !b.issuer.trim()) return 'Missing issuer'
  if (typeof b.rating !== 'string' || b.rating.length > 3) return 'Bad rating'
  if (!Number.isInteger(amount) || amount < 1 || amount > 1e9) return 'Bad bond amount'
  if (!(rate > 0 && rate <= 0.05)) return 'Bad bond rate'
  return { id: 0, issuer: b.issuer.slice(0, 40), rating: b.rating, amount, rate }
}
/** Put a bond from your company into your bond box on the server. The client removes it from the company only after this succeeds. */
export function depositBond(L: Ledger, a: Account, bond: Partial<BondCert>): R<BondCert> {
  const t = bondTerms(bond); if (typeof t === 'string') return t
  const c = { ...t, id: L.seq++ }
  bondsOf(a).push(c)
  return c
}
/** Put a bond from your bond box on the board at a price. */
export function listBond(L: Ledger, a: Account, id: number, price: number, now: number): R<BondListing> {
  const box = bondsOf(a), c = box.find(x => x.id === id)
  if (!c) return 'Not in your bond box'
  if (!(price > 0) || price > MAX_CONTRACT_TOTAL) return 'Set a price'
  if ((L.bondOrders ??= []).filter(o => o.seller === a.name).length >= MAX_BOND_LISTINGS) return 'Too many bond listings'
  a.bonds = box.filter(x => x !== c)
  const o: BondListing = { ...c, seller: a.name, price: cents(price), ts: now }
  L.bondOrders!.push(o)
  return o
}
/** Take a bond you listed back into your bond box. */
export function cancelBond(L: Ledger, a: Account, id: number): R {
  const i = (L.bondOrders ?? []).findIndex(o => o.id === id && o.seller === a.name)
  if (i < 0) return 'No such bond listing'
  const [o] = L.bondOrders!.splice(i, 1)
  const { seller, price, ts, ...cert } = o
  void seller; void price; void ts
  bondsOf(a).push(cert)
  return true
}
/** Buy a listed bond. It lands in your bond box; move it into your company from there. */
export function buyBond(L: Ledger, b: Account, id: number): R<BondCert> {
  const i = (L.bondOrders ?? []).findIndex(o => o.id === id)
  if (i < 0) return 'That bond is gone'
  const o = L.bondOrders![i]
  if (o.seller === b.name) return 'That is your own listing'
  if (o.price > b.wallet + 1e-9) return 'Not enough in your trading wallet'
  settle(b, L.accounts[o.seller], o.price, true)
  L.bondOrders!.splice(i, 1)
  const { seller, price, ts, ...cert } = o
  void seller; void price; void ts
  bondsOf(b).push(cert)
  return cert
}
/** Move a bond from your bond box into your company. The client adds it to holdings after this succeeds. */
export function withdrawBond(a: Account, id: number): R<BondCert> {
  const box = bondsOf(a), c = box.find(x => x.id === id)
  if (!c) return 'Not in your bond box'
  a.bonds = box.filter(x => x !== c)
  return c
}

// ---- contracts: private offers to one named player ----
/** Keep lines tidy and the note short. Used for every contract we store. */
const cleanNote = (t: unknown) => String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE)

/** Bring any contract stored by an older version into the current shape. */
function normalizeContracts(L: Ledger) {
  for (const c of L.contracts as any[]) {
    if (c.lines) continue
    c.lines = [{ res: c.res, q: c.q, qty: c.qty }]
    c.total = cents(c.qty * c.price)
    c.note = ''
    c.expires = (c.ts ?? 0) + CONTRACT_TTL_MS
    delete c.res; delete c.q; delete c.qty; delete c.price
  }
}

/** Return goods from contracts that have run out, so nothing stays locked forever. */
export function sweepContracts(L: Ledger, now: number) {
  normalizeContracts(L)
  const dead = L.contracts.filter(c => c.expires <= now)
  for (const c of dead) {
    const from = L.accounts[c.from]
    if (from) for (const l of c.lines) give(from, l.res, l.q, l.qty)
  }
  if (dead.length) L.contracts = L.contracts.filter(c => c.expires > now)
}

/**
 * Send a contract: `lines` are goods taken from your depot now, `total` is
 * what the receiver pays to accept (no fee, no crates).
 */
export function offer(L: Ledger, a: Account, to: string, lines: Line[], total: number, note: string, now: number): R<Contract> {
  to = String(to).toLowerCase()
  if (!L.accounts[to] || to === a.name) return 'Unknown player'
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_CONTRACT_LINES) return `Add 1 to ${MAX_CONTRACT_LINES} items`
  if (!(total >= 0) || total > MAX_CONTRACT_TOTAL) return 'Bad price'
  const need: Record<string, number> = {}
  const clean: Line[] = []
  for (const l of lines) {
    const res = String(l?.res ?? ''), q = Number(l?.q), qty = Number(l?.qty)
    if (!res || !Number.isInteger(q) || q < 0 || q > 12) return 'Bad item'
    if (!Number.isInteger(qty) || qty < 1 || qty > 1e7) return 'Pick a whole amount of at least 1'
    need[k(res, q)] = (need[k(res, q)] ?? 0) + qty
    clean.push({ res, q, qty })
  }
  for (const [key, qty] of Object.entries(need)) {
    if ((a.depot[key] ?? 0) < qty) return `Not enough in your depot: ${key.split('|')[0]} Q${key.split('|')[1]}`
  }
  for (const [key, qty] of Object.entries(need)) { const [res, q] = key.split('|'); take(a, res, Number(q), qty) }
  const c: Contract = { id: L.seq++, from: a.name, to, lines: clean, total: cents(total), note: cleanNote(note), ts: now, expires: now + CONTRACT_TTL_MS }
  L.contracts.push(c); return c
}
/** accept: receiver pays the total and takes the goods. decline: receiver refuses. cancel: sender withdraws. Goods go back on decline/cancel. */
export function answer(L: Ledger, a: Account, id: number, how: 'accept' | 'decline' | 'cancel', now = Date.now()): R {
  sweepContracts(L, now)
  const c = L.contracts.find(x => x.id === id)
  if (!c) return 'No such contract'
  if (how === 'cancel' ? c.from !== a.name : c.to !== a.name) return 'Not your contract'
  const from = L.accounts[c.from]
  if (how === 'accept') {
    if (c.total > a.wallet + 1e-9) return 'Not enough in your trading wallet'
    settle(a, from, c.total, false) // contracts pay the full total: no fee
    for (const l of c.lines) give(a, l.res, l.q, l.qty)
  } else if (from) for (const l of c.lines) give(from, l.res, l.q, l.qty)
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
// ---- Player search and public profiles (only public fields) ---------------
/** Public card for search results: trader name, game username if linked, company, value, grade. */
export const publicCard = (a: Account) => ({ name: a.name, owner: a.owner, company: a.company, value: a.value, grade: grade(score(a)) })
/** Case-insensitive match on trader name, linked username or company name. */
export function searchAccounts(L: Ledger, q: string, n = 10) {
  const t = q.trim().toLowerCase(); if (t.length < 2) return []
  return Object.values(L.accounts).filter(a => a.name.includes(t) || (a.owner ?? '').includes(t) || a.company.toLowerCase().includes(t))
    .sort((x, y) => Number(y.name.startsWith(t)) - Number(x.name.startsWith(t)) || y.value - x.value).slice(0, n).map(publicCard)
}
/** Account for a trader name or a linked game username. */
export const findAccount = (L: Ledger, who: string) => L.accounts[who] ?? Object.values(L.accounts).find(a => a.owner === who)
/** Public profile: rank among all traders by score, plus their active board listings. */
export function publicProfile(L: Ledger, who: string) {
  const a = findAccount(L, who.toLowerCase()); if (!a) return null
  const all = Object.values(L.accounts).sort((x, y) => score(y) - score(x))
  return {
    ...publicCard(a), rank: all.indexOf(a) + 1, of: all.length, trades: a.trades, joined: a.joined,
    listings: L.orders.filter(o => o.seller === a.name).slice(0, 30),
    bondListings: (L.bondOrders ?? []).filter(o => o.seller === a.name).slice(0, 10),
  }
}

/** Public, secret-free view of one account (for the client). */
export const view = (L: Ledger, a: Account) => ({
  name: a.name, company: a.company, wallet: a.wallet, depot: a.depot, bonds: a.bonds ?? [], grade: grade(score(a)), score: Math.round(score(a)),
  orders: L.orders.filter(o => o.seller === a.name),
  bondListings: (L.bondOrders ?? []).filter(o => o.seller === a.name),
  inbox: L.contracts.filter(c => c.to === a.name), outbox: L.contracts.filter(c => c.from === a.name),
})

/**
 * Delete your own account (needs your key; no admin). Your open orders, bond
 * listings and the offers you sent are removed with it. Offers other players
 * sent you go back to their depots. Wallet, depot and bond box are discarded,
 * so the UI asks you to take them home first.
 */
export function deleteAccount(L: Ledger, a: Account): R {
  normalizeContracts(L)
  L.orders = L.orders.filter(o => o.seller !== a.name)
  L.bondOrders = (L.bondOrders ?? []).filter(o => o.seller !== a.name)
  for (const c of L.contracts) if (c.to === a.name) { const f = L.accounts[c.from]; if (f) for (const l of c.lines) give(f, l.res, l.q, l.qty) }
  L.contracts = L.contracts.filter(c => c.to !== a.name && c.from !== a.name)
  delete L.accounts[a.name]
  return true
}
