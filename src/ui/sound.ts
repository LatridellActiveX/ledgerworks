// ============================================================================
// Ledgerworks sound effects — a small synthesized Web Audio engine.
// ============================================================================
//
// There are NO audio files: every sound is built on the fly from oscillators
// (pure tones) and filtered white noise (clicks, knocks, hiss), so the game
// stays one small download and every sound is our own.
//
// Design notes (ideas only, no assets borrowed):
//  * Anno 1800's UI uses "fiddly small mechanical sounds" that live in the
//    same world as its heavy factory machines. That is the main inspiration:
//    our taps are tiny mechanical ticks, production is a chugging machine,
//    building is hammer knocks and finishing a job lets off a puff of steam.
//  * Idle/tycoon games make repeated pickups climb in pitch (a "pitch
//    ladder"), so a run of collects sounds like one rising phrase instead of
//    the same click over and over. collect/coin/sell do that here.
//  * Offworld Trading Company delays its big fanfares so they don't pile on
//    top of other sounds; we keep every sound short, throttle repeats and
//    cap how many voices play at once.
//
// Signal chain:  voices -> master gain (volume) -> compressor -> speakers
//
// Settings (localStorage):
//  * 'ledgerworks-sound'  'on' | 'off'. Off (muted) by default. This is the
//    same key the old helper used, so existing choices are kept.
//  * 'ledgerworks-volume' 0-100, default 70.
//
// Everything is wrapped in try/catch: if the browser has no Web Audio (or
// blocks it), the game simply stays silent.
// ============================================================================

/** Every sound the game can play. */
export type Sfx =
  | 'tap' | 'collect' | 'coin' | 'produce' | 'done' | 'build'
  | 'upgrade' | 'buy' | 'sell' | 'levelup' | 'error' | 'news' | 'cart'
/** Old names from the first sound helper, still accepted. */
type Legacy = 'pop' | 'buzz'

/** Names and order for the "Test sounds" preview in Settings. */
export const SFX_LIST: { id: Sfx; label: string }[] = [
  { id: 'tap', label: 'Tap' }, { id: 'collect', label: 'Collect' }, { id: 'coin', label: 'Coins' },
  { id: 'produce', label: 'Start job' }, { id: 'done', label: 'Job done' }, { id: 'build', label: 'Build' },
  { id: 'upgrade', label: 'Upgrade' }, { id: 'buy', label: 'Buy' }, { id: 'sell', label: 'Sell' },
  { id: 'levelup', label: 'Level up' }, { id: 'error', label: 'Error' }, { id: 'news', label: 'News' }, { id: 'cart', label: 'Trade cart' },
]

// ---------------------------------------------------------------------------
// Settings: mute + volume, persisted. Safe outside a browser (tests, SSR):
// with no localStorage we just use the defaults.
// ---------------------------------------------------------------------------
export const SOUND_KEY = 'ledgerworks-sound'
export const VOLUME_KEY = 'ledgerworks-volume'
export const DEFAULT_VOLUME = 70

const store = (): Storage | null => { try { return (globalThis as any).localStorage ?? null } catch { return null } }

/** Is sound switched on? Muted unless the player turned it on. */
export const soundOn = () => store()?.getItem(SOUND_KEY) === 'on'
/** Switch sound on or off (kept across visits). */
export function setSound(on: boolean) { try { store()?.setItem(SOUND_KEY, on ? 'on' : 'off') } catch { /* storage full/blocked */ } }

/** Clamp anything to a whole number 0..100 (bad input -> default). */
export function clampVolume(v: unknown): number {
  const n = Number(v)
  if (v === null || v === '' || !isFinite(n)) return DEFAULT_VOLUME
  return Math.max(0, Math.min(100, Math.round(n)))
}
/** Saved volume 0..100. */
export const volume = () => clampVolume(store()?.getItem(VOLUME_KEY) ?? null)
/** Save a new volume and apply it to the live master gain right away. */
export function setVolume(v: number) {
  const n = clampVolume(v)
  try { store()?.setItem(VOLUME_KEY, String(n)) } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(gainFor(n), ctx.currentTime, 0.02)
  return n
}
/** Slider value -> gain. Squared so the slider feels even to the ear. */
export const gainFor = (v: number) => Math.pow(clampVolume(v) / 100, 2) * 0.9

// ---------------------------------------------------------------------------
// Throttling: the same sound can't retrigger faster than its gap, and at
// most MAX_VOICES sounds overlap. Pure and testable (time is passed in).
// ---------------------------------------------------------------------------
const GAP_MS: Record<Sfx, number> = {
  tap: 60, collect: 70, coin: 70, produce: 150, done: 300, build: 200,
  upgrade: 250, buy: 120, sell: 120, levelup: 1200, error: 200, news: 1500, cart: 1200,
}
const LEN_MS = 700 // rough upper bound of a voice's length, for the voice cap
export const MAX_VOICES = 6
const lastAt: Partial<Record<Sfx, number>> = {}
let voices: number[] = [] // end times of playing voices

/** Should `kind` play at time `now` (ms)? Records it if so. */
export function shouldPlay(kind: Sfx, now: number): boolean {
  const last = lastAt[kind]
  if (last !== undefined && now - last < GAP_MS[kind]) return false
  voices = voices.filter(t => t > now)
  if (voices.length >= MAX_VOICES && kind !== 'levelup' && kind !== 'error') return false
  lastAt[kind] = now; voices.push(now + LEN_MS)
  return true
}
/** Forget throttle state (tests). */
export function resetThrottle() { for (const k in lastAt) delete lastAt[k as Sfx]; voices = []; ladder = { step: 0, at: -1e9 } }

// Pitch ladder: quick repeated pickups climb a semitone each, up to an
// octave, and reset after 1.5 s of quiet.
let ladder = { step: 0, at: -1e9 }
export function ladderStep(now: number): number {
  ladder.step = now - ladder.at < 1500 ? Math.min(ladder.step + 1, 12) : 0
  ladder.at = now
  return ladder.step
}

// ---------------------------------------------------------------------------
// The audio graph (created lazily on the first sound).
// ---------------------------------------------------------------------------
let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext
      if (!AC) return null
      ctx = new AC() as AudioContext
      master = ctx.createGain()
      master.gain.value = gainFor(volume())
      // A gentle compressor stops stacked sounds from clipping.
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -14; comp.ratio.value = 4
      master.connect(comp).connect(ctx.destination)
      // One second of white noise, reused for every click/knock/hiss.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    // Browsers start audio "suspended" until the player touches the page.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch { return null }
}

/**
 * Resume audio on the first tap/key press. Mobile browsers only allow sound
 * after a user gesture, so call this once at start-up.
 */
let unlocked = false
export function unlockAudio() {
  if (unlocked || typeof window === 'undefined') return
  unlocked = true
  const go = () => { if (soundOn()) audio(); if (ctx?.state === 'running') for (const e of EVENTS) window.removeEventListener(e, go, true) }
  const EVENTS = ['pointerdown', 'touchend', 'keydown']
  for (const e of EVENTS) window.addEventListener(e, go, true)
}

// ---------------------------------------------------------------------------
// Building blocks. `t` is the start time in seconds (ctx.currentTime based).
// ---------------------------------------------------------------------------

/** Attack/decay envelope on a fresh gain node; returns the node to feed. */
function env(a: AudioContext, t: number, peak: number, attack: number, decay: number) {
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  g.connect(master!)
  return g
}

/** One tone, optionally gliding to `to` Hz. */
function tone(a: AudioContext, t: number, f: number, o: { type?: OscillatorType; dur?: number; peak?: number; to?: number; attack?: number } = {}) {
  const dur = o.dur ?? 0.15, attack = o.attack ?? 0.005
  const osc = a.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(f, t)
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur)
  osc.connect(env(a, t, o.peak ?? 0.2, attack, dur))
  osc.start(t); osc.stop(t + attack + dur + 0.03)
}

/** A burst of filtered noise: clicks (high, short), knocks (low), hiss (long). */
function noise(a: AudioContext, t: number, o: { dur: number; freq: number; q?: number; peak?: number; type?: BiquadFilterType; sweepTo?: number }) {
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const f = a.createBiquadFilter()
  f.type = o.type ?? 'bandpass'
  f.frequency.setValueAtTime(o.freq, t)
  if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur)
  f.Q.value = o.q ?? 1
  src.connect(f).connect(env(a, t, o.peak ?? 0.3, 0.003, o.dur))
  src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.05)
}

/** A struck-metal "bell": a tone plus an inharmonic partial, like a coin. */
function bell(a: AudioContext, t: number, f: number, peak = 0.14, dur = 0.25) {
  tone(a, t, f, { type: 'sine', peak, dur })
  tone(a, t, f * 2.76, { type: 'sine', peak: peak * 0.35, dur: dur * 0.6 })
}

/** Semitones -> frequency ratio. Small random detune (±35 cents) keeps repeats fresh. */
const semi = (n: number) => Math.pow(2, n / 12)
const jitter = () => semi((Math.random() - 0.5) * 0.7)

// ---------------------------------------------------------------------------
// The sounds. Each is short (<0.7 s) and pitched in C major so they sit
// together nicely.
// ---------------------------------------------------------------------------
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5

const VOICES: Record<Sfx, (a: AudioContext, t: number, step: number) => void> = {
  // UI tap: a tiny mechanical tick (Anno-style switch), barely there.
  tap: (a, t) => {
    noise(a, t, { dur: 0.025, freq: 3800, q: 3, peak: 0.12 })
    tone(a, t, 1900 * jitter(), { dur: 0.03, peak: 0.04 })
  },
  // Collect goods: a soft crate "thock" and a wooden plonk that climbs the ladder.
  collect: (a, t, step) => {
    noise(a, t, { dur: 0.06, freq: 400, q: 1.5, peak: 0.25, type: 'lowpass' })
    tone(a, t + 0.01, 440 * semi(step) * jitter(), { type: 'triangle', dur: 0.14, peak: 0.22, to: 660 * semi(step) })
  },
  // Money in: two bright coin bells, a fourth apart, climbing the ladder.
  coin: (a, t, step) => {
    const f = 1318.5 * semi(step) * jitter()
    bell(a, t, f, 0.12, 0.12)
    bell(a, t + 0.07, f * semi(5), 0.13, 0.3)
  },
  // Production start: a machine catching — three low chugs speeding up.
  produce: (a, t) => {
    for (const [i, dt] of [0, 0.12, 0.21].entries()) {
      noise(a, t + dt, { dur: 0.08, freq: 300 + i * 80, q: 2, peak: 0.28, type: 'lowpass' })
      tone(a, t + dt, 90 + i * 15, { type: 'sawtooth', dur: 0.07, peak: 0.06 })
    }
    tone(a, t + 0.28, 196, { type: 'triangle', dur: 0.12, peak: 0.12, to: 262 })
  },
  // Production finished: a puff of steam and a little two-note ding.
  done: (a, t) => {
    noise(a, t, { dur: 0.35, freq: 5000, q: 0.7, peak: 0.07, sweepTo: 2500 })
    bell(a, t + 0.05, G5, 0.12, 0.18)
    bell(a, t + 0.17, C6, 0.13, 0.35)
  },
  // Construction start: three hammer knocks on wood.
  build: (a, t) => {
    for (const dt of [0, 0.11, 0.22]) {
      noise(a, t + dt, { dur: 0.05, freq: 1200, q: 4, peak: 0.3 })
      tone(a, t + dt, 170 * jitter(), { dur: 0.08, peak: 0.25, to: 90 })
    }
  },
  // Upgrade / construction done: a ratchet winding up, then a bright chord.
  upgrade: (a, t) => {
    for (let i = 0; i < 4; i++) noise(a, t + i * 0.05, { dur: 0.02, freq: 2500 + i * 600, q: 5, peak: 0.18 })
    for (const f of [C5, E5, G5]) tone(a, t + 0.22, f, { type: 'triangle', dur: 0.4, peak: 0.08 })
  },
  // Market buy: a ledger "stamp" then two notes stepping DOWN (money out).
  buy: (a, t) => {
    noise(a, t, { dur: 0.04, freq: 700, q: 2, peak: 0.25, type: 'lowpass' })
    tone(a, t + 0.03, 880, { type: 'triangle', dur: 0.09, peak: 0.13 })
    tone(a, t + 0.11, 660, { type: 'triangle', dur: 0.15, peak: 0.13 })
  },
  // Market sell: the same stamp, then notes stepping UP and a coin shimmer.
  sell: (a, t, step) => {
    noise(a, t, { dur: 0.04, freq: 700, q: 2, peak: 0.25, type: 'lowpass' })
    tone(a, t + 0.03, 660 * semi(step / 2), { type: 'triangle', dur: 0.09, peak: 0.13 })
    tone(a, t + 0.11, 990 * semi(step / 2), { type: 'triangle', dur: 0.12, peak: 0.13 })
    bell(a, t + 0.2, 1975 * semi(step / 2), 0.06, 0.2)
  },
  // Level up: a short brass-ish fanfare, C-E-G then a held high C.
  levelup: (a, t) => {
    const notes: [number, number, number][] = [[C5, 0, 0.1], [E5, 0.1, 0.1], [G5, 0.2, 0.1], [C6, 0.32, 0.45]]
    for (const [f, dt, d] of notes) {
      tone(a, t + dt, f, { type: 'square', dur: d, peak: 0.05, attack: 0.01 })
      tone(a, t + dt, f, { type: 'triangle', dur: d, peak: 0.12, attack: 0.01 })
    }
    bell(a, t + 0.32, C6 * 2, 0.05, 0.5)
  },
  // Error: a dull double "bonk", low and short so it never nags.
  error: (a, t) => {
    tone(a, t, 220, { type: 'square', dur: 0.08, peak: 0.06, to: 200 })
    tone(a, t + 0.1, 175, { type: 'square', dur: 0.12, peak: 0.06, to: 150 })
    noise(a, t, { dur: 0.05, freq: 300, q: 1, peak: 0.15, type: 'lowpass' })
  },
  // Market news: a newspaper page flick (a falling noise sweep), five quick
  // teletype ticks, then a two-note "news desk" chime (G then high C).
  news: (a, t) => {
    noise(a, t, { dur: 0.18, freq: 6000, q: 0.8, peak: 0.1, sweepTo: 1500 })
    for (let i = 0; i < 5; i++) noise(a, t + 0.16 + i * 0.045, { dur: 0.012, freq: 4200, q: 6, peak: 0.14 })
    bell(a, t + 0.42, G5, 0.1, 0.2)
    bell(a, t + 0.54, C6, 0.11, 0.4)
  },
  // Trade cart (a route's cart leaving or arriving): four hollow "clip-clop"
  // knocks (low band-passed noise with a short pitched body, alternating
  // high/low like two hooves), a soft wheel rattle under them, then a small
  // two-note hand bell (E then G) as the delivery bell.
  cart: (a, t) => {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.085, f = i % 2 ? 520 : 700
      noise(a, at, { dur: 0.035, freq: f, q: 4, peak: 0.22 })
      tone(a, at, f * 0.5, { type: 'triangle', dur: 0.04, peak: 0.06, to: f * 0.4 })
    }
    noise(a, t, { dur: 0.36, freq: 180, q: 0.7, peak: 0.05, type: 'lowpass' })
    bell(a, t + 0.38, E5, 0.08, 0.18)
    bell(a, t + 0.47, G5, 0.09, 0.3)
  },
}

const LEGACY: Record<Legacy, Sfx> = { pop: 'tap', buzz: 'error' }
const LADDER = new Set<Sfx>(['collect', 'coin', 'sell'])

/**
 * Play a sound effect. Does nothing when muted, throttled, or when audio is
 * unavailable. `force` skips the throttle (used by the Settings preview).
 */
export function sfx(kind: Sfx | Legacy, force = false) {
  const k: Sfx = (LEGACY as Record<string, Sfx>)[kind] ?? (kind as Sfx)
  if (!soundOn() || volume() === 0 || !VOICES[k]) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (!force && !shouldPlay(k, now)) return
  const a = audio()
  if (!a || !master) return
  try { VOICES[k](a, a.currentTime + 0.01, LADDER.has(k) ? ladderStep(now) : 0) } catch { /* ignore */ }
}

/** Play every sound in turn, ~0.55 s apart (Settings > Test sounds). */
export function testSounds() {
  SFX_LIST.forEach((x, i) => setTimeout(() => sfx(x.id, true), i * 550))
}
