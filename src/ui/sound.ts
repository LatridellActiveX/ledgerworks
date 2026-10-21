// Tiny optional sound effects synthesized with WebAudio (no audio files).
// Muted by default; the choice is remembered in localStorage.
let ctx: AudioContext | null = null
const KEY = 'ledgerworks-sound'
export const soundOn = () => localStorage.getItem(KEY) === 'on'
export const setSound = (on: boolean) => localStorage.setItem(KEY, on ? 'on' : 'off')

/** Play a short tone sweep. kind: 'pop' (success), 'coin' (money in), 'buzz' (error). */
export function sfx(kind: 'pop' | 'coin' | 'buzz') {
  if (!soundOn()) return
  try {
    ctx = ctx ?? new AudioContext()
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime
    const [f0, f1, type, len] = kind === 'pop' ? [520, 880, 'sine', 0.12] : kind === 'coin' ? [880, 1320, 'triangle', 0.18] : [180, 120, 'square', 0.16]
    o.type = type as OscillatorType
    o.frequency.setValueAtTime(f0 as number, t); o.frequency.exponentialRampToValueAtTime(f1 as number, t + (len as number))
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (len as number))
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + (len as number) + 0.02)
  } catch { /* audio not available */ }
}
