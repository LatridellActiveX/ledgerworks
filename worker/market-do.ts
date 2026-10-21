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
import { GAME_SPEED } from '../src/game/engine'
import { depth } from '../src/game/market'

/** Real-world moment that counts as "game hour 0" of the shared world. */
const EPOCH = Date.UTC(2026, 9, 21)
export const worldHour = (now = Date.now()) => ((now - EPOCH) / 3600000) * GAME_SPEED

interface World { day: number; seed: number; ref: Record<string, number>; sold: Record<string, number> }

export class MarketDO {
  constructor(private state: DurableObjectState) {}

  private async load(): Promise<World> {
    const w = await this.state.storage.get<World>('world')
    if (w) return w
    const ref = Object.fromEntries(RESOURCES.map(r => [r.id, r.basePrice]))
    return { day: Math.floor(worldHour() / 24), seed: 777, ref, sold: {} }
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
        let next = ref + 0.1 * (r.basePrice - ref) + ref * 0.06 * (x - 0.5)
        next *= 1 - Math.min(0.08, ((w.sold[r.id] ?? 0) / (depth(r.id) * 5)) * 0.04)
        w.ref[r.id] = Math.min(r.basePrice * 1.8, Math.max(r.basePrice * 0.6, next))
      }
      w.sold = {}
      w.day++
    }
    w.day = Math.max(w.day, today)
    await this.state.storage.put('world', w)
    return w
  }

  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname
    if (path === '/report') {
      // { sold: { resId: units } } -- capped per call so one client can't crash prices.
      const { sold } = await req.json<any>()
      const w = await this.step()
      for (const [k, v] of Object.entries(sold ?? {})) if (w.ref[k] !== undefined) w.sold[k] = (w.sold[k] ?? 0) + Math.min(Number(v) || 0, depth(k))
      await this.state.storage.put('world', w)
      return Response.json({ ok: true })
    }
    const w = await this.step()
    return Response.json({ day: w.day, hour: worldHour(), ref: w.ref })
  }
}
