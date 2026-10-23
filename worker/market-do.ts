// ============================================================================
// MarketDO: the shared world economy, one Durable Object instance.
//
// It keeps a shared game clock (4 game hours per real hour, like the client)
// and, for each game day that passes, random-walks every good's reference
// price toward its base and pushes it down by how much players dumped on the
// exchange that day. Clients pull these prices instead of rolling their own,
// so every player sees the same market.
// ============================================================================
import { RESOURCES } from '../src/game/data'
import { rand } from '../src/game/rng'
import { depth } from '../src/game/market'
import * as P from '../src/game/p2p'
import { currentBases, rebaseFactors, rebaseRef } from '../src/game/rebase'
import { isPhaseDay, nextPhase, priceTrend, type Phase } from '../src/game/economy'

// The shared world clock lives in src/game/seasons.ts (the client uses it too).
import { worldHour } from '../src/game/seasons'

interface World { phase?: Phase; day: number; seed: number; ref: Record<string, number>; sold: Record<string, number>; refBase?: Record<string, number> }

export class MarketDO {
  constructor(private state: DurableObjectState) {}

  private async load(): Promise<World> {
    const w = await this.state.storage.get<World>('world')
    if (w) {
      // Shared market re-base: if a good's basePrice changed since this world
      // was saved, scale its price once (new/old) so every client sees the new
      // level at once instead of a slow daily crawl. Saved straight away so it
      // only ever happens once per change. Player listings live in the ledger
      // and are not touched.
      const f = rebaseFactors(w.refBase)
      if (Object.keys(f).length || !w.refBase) {
        rebaseRef(w.ref, f); w.refBase = currentBases()
        await this.state.storage.put('world', w)
      }
      return w
    }
    const ref = Object.fromEntries(RESOURCES.map(r => [r.id, r.basePrice]))
    return { day: Math.floor(worldHour() / 24), seed: 777, ref, sold: {}, refBase: currentBases() }
  }

  /** Apply every game day that has passed since the last step. */
  private async step(): Promise<World> {
    const w = await this.load()
    const today = Math.floor(worldHour() / 24)
    let guard = 0
    while (w.day < today && guard++ < 60) {
      for (const r of RESOURCES) {
        const [x, n] = rand(w.seed); w.seed = n
        const ref = w.ref[r.id] ?? r.basePrice
        const target = r.basePrice * priceTrend(w.phase)
        let next = ref + 0.1 * (target - ref) + ref * 0.06 * (x - 0.5)
        next *= 1 - Math.min(0.08, ((w.sold[r.id] ?? 0) / (depth(r.id) * 5)) * 0.04)
        w.ref[r.id] = Math.min(r.basePrice * 1.8, Math.max(r.basePrice * 0.6, next))
      }
      w.sold = {}
      w.day++
      // Weekly economy roll, shared by every player.
      if (isPhaseDay(w.day)) { const [x, n] = rand(w.seed); w.seed = n; w.phase = nextPhase(w.phase ?? 'normal', x) }
    }
    w.day = Math.max(w.day, today)
    await this.state.storage.put('world', w)
    return w
  }

  // ---- stage 11: player-to-player ledger (accounts, wallet, depot, board, contracts) ----
  private async ledger(): Promise<P.Ledger> { return (await this.state.storage.get<P.Ledger>('ledger')) ?? P.emptyLedger() }

  /** One /p2p/<op> call. Runs inside the object, so calls never interleave. */
  private async p2p(op: string, b: any): Promise<Response> {
    const L = await this.ledger()
    const now = Date.now()
    const err = (e: string, st = 400) => Response.json({ error: e }, { status: st })
    // Contracts that ran out give their goods back before anything else happens.
    P.sweepContracts(L, now)
    if (op === 'board') return Response.json({ orders: P.board(L, b.res).slice(0, 50), bonds: P.bondBoard(L).slice(0, 50), leaders: P.leaderboard(L) })
    // Public, no key needed: player search and profiles (public fields only).
    if (op === 'search') return Response.json({ players: P.searchAccounts(L, String(b.q ?? '')) })
    if (op === 'profile') return Response.json({ profile: P.publicProfile(L, String(b.who ?? '')) })
    if (op === 'register') {
      // The server makes the key; only its hash is kept. Shown to the player once.
      const key = [...crypto.getRandomValues(new Uint8Array(18))].map(x => x.toString(16).padStart(2, '0')).join('')
      const r = P.register(L, String(b.name ?? ''), await sha(key), String(b.company ?? ''), now)
      if (r !== true) return err(r)
      await this.state.storage.put('ledger', L)
      return Response.json({ name: String(b.name).toLowerCase(), key, me: P.view(L, L.accounts[String(b.name).toLowerCase()]) })
    }
    // Signed-in game players: the Worker put their username in b.sess (from
    // the session cookie; it strips any client-sent value), so no key needed.
    let a: P.Account | string, link: { linked?: boolean; created?: boolean } = {}
    if (typeof b.sess === 'string' && b.sess) {
      const rnd = [...crypto.getRandomValues(new Uint8Array(18))].map(x => x.toString(16).padStart(2, '0')).join('')
      const r = P.sessionAccount(L, b.sess, b.name ? { name: b.name, hash: await sha(String(b.key ?? '')) } : null, String(b.company ?? ''), now, await sha(rnd))
      a = r.a; link = { linked: r.linked, created: r.created }
      if (r.linked || r.created) await this.state.storage.put('ledger', L)
    } else a = P.auth(L, b.name, await sha(String(b.key ?? '')))
    if (typeof a === 'string') return err(a, 403)
    let r: any = true
    const n = (x: any) => Number(x)
    switch (op) {
      case 'me': break
      case 'value': a.value = Math.max(0, Math.min(1e12, n(b.value) || 0)); a.company = String(b.company ?? a.company).slice(0, 40); break
      case 'deposit': r = P.deposit(a, n(b.cash) || 0, Array.isArray(b.goods) ? b.goods.map((g: any) => ({ res: String(g.res), q: n(g.q), qty: n(g.qty) })) : []); break
      case 'withdrawCash': r = P.withdrawCash(a, n(b.cash)); break
      case 'withdrawGoods': r = P.withdrawGoods(a, String(b.res), n(b.q), n(b.qty)); break
      case 'list': r = P.list(L, a, String(b.res), n(b.q), n(b.qty), n(b.price), now); break
      case 'cancel': r = P.cancel(L, a, n(b.id)); break
      case 'buy': r = P.buy(L, a, n(b.id), n(b.qty)); break
      case 'offer': r = P.offer(L, a, String(b.to), Array.isArray(b.lines) ? b.lines.map((l: any) => ({ res: String(l?.res), q: n(l?.q), qty: n(l?.qty) })) : [], n(b.total), String(b.note ?? ''), now); break
      case 'answer': r = P.answer(L, a, n(b.id), b.how, now); break
      case 'depositBond': r = P.depositBond(L, a, b.bond ?? {}); break
      case 'listBond': r = P.listBond(L, a, n(b.id), n(b.price), now); break
      case 'cancelBond': r = P.cancelBond(L, a, n(b.id)); break
      case 'buyBond': r = P.buyBond(L, a, n(b.id)); break
      case 'withdrawBond': r = P.withdrawBond(a, n(b.id)); break
      case 'delete': P.deleteAccount(L, a); await this.state.storage.put('ledger', L); return Response.json({ ok: true, deleted: a.name })
      default: return err('unknown op', 404)
    }
    if (typeof r === 'string') return err(r)
    await this.state.storage.put('ledger', L)
    return Response.json({ ok: true, result: r, me: P.view(L, a), ...link })
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname
    if (path.startsWith('/p2p/')) return this.p2p(path.slice(5), await req.json<any>().catch(() => ({})))
    if (path === '/report') {
      // { sold: { resId: units } } -- capped per call so one client can't crash prices.
      const { sold } = await req.json<any>()
      const w = await this.step()
      for (const [k, v] of Object.entries(sold ?? {})) if (w.ref[k] !== undefined) w.sold[k] = (w.sold[k] ?? 0) + Math.min(Number(v) || 0, depth(k))
      await this.state.storage.put('world', w)
      return Response.json({ ok: true })
    }
    const w = await this.step()
    return Response.json({ day: w.day, hour: worldHour(), ref: w.ref, phase: w.phase ?? 'normal' })
  }
}

async function sha(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t))
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
}
