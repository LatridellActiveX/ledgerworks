// ============================================================================
// Graphics quality for the 3D map (Settings → Graphics quality).
//
// Choices: Auto (default), High, Medium, Low. Auto picks a starting tier from
// the device (navigator.deviceMemory, hardwareConcurrency, screen density),
// then the 3D scene samples its frame rate for a few seconds; if it stays
// below FPS_FLOOR, Auto steps down one tier and remembers that for next time.
// Mid-range phones such as the Samsung Galaxy A15/A25/A35/A54/A55 usually
// report 4–8 GB of memory and 8 cores with a very dense screen, so they
// start at Medium (or High, then step down if the FPS sample is low).
// ============================================================================
export type Tier = 'high' | 'medium' | 'low'
export type GfxSetting = 'auto' | Tier
export const GFX_KEY = 'ledgerworks-gfx' // the setting
export const GFX_AUTO_KEY = 'ledgerworks-gfx-auto' // tier Auto settled on after FPS sampling
export const FPS_FLOOR = 40

/** What each tier changes in the scene. */
export interface Preset { pixelRatio: number; shadows: boolean; softShadows: boolean; shadowMap: number; particles: number; sparkles: number; walkers: number; antialias: boolean }
export const PRESETS: Record<Tier, Preset> = {
  high: { pixelRatio: 1.75, shadows: true, softShadows: true, shadowMap: 2048, particles: 360, sparkles: 140, walkers: 16, antialias: true },
  medium: { pixelRatio: 1.25, shadows: true, softShadows: false, shadowMap: 1024, particles: 140, sparkles: 60, walkers: 8, antialias: false },
  low: { pixelRatio: 1, shadows: false, softShadows: false, shadowMap: 512, particles: 40, sparkles: 24, walkers: 4, antialias: false },
}

export interface DeviceInfo { memory?: number; cores?: number; dpr: number; mobile: boolean }
export const deviceInfo = (): DeviceInfo => ({
  memory: (navigator as any).deviceMemory, cores: navigator.hardwareConcurrency,
  dpr: globalThis.devicePixelRatio || 1, mobile: matchMedia('(pointer: coarse)').matches || innerWidth < 760,
})

/** Starting tier from device hints only (before any FPS sample). */
export function detectTier(d: DeviceInfo): Tier {
  if ((d.memory !== undefined && d.memory <= 2) || (d.cores !== undefined && d.cores <= 4)) return 'low'
  if (d.mobile && ((d.memory !== undefined && d.memory <= 6) || (d.cores !== undefined && d.cores <= 8) || d.dpr >= 2.5)) return 'medium'
  return 'high'
}
export const lower = (t: Tier): Tier => (t === 'high' ? 'medium' : 'low')

export const getSetting = (): GfxSetting => (localStorage.getItem(GFX_KEY) as GfxSetting) || 'auto'
export const setSetting = (g: GfxSetting) => { localStorage.setItem(GFX_KEY, g); if (g === 'auto') localStorage.removeItem(GFX_AUTO_KEY) }
/** The tier to render with right now. */
export function currentTier(): Tier {
  const g = getSetting()
  if (g !== 'auto') return g
  return (localStorage.getItem(GFX_AUTO_KEY) as Tier) || detectTier(deviceInfo())
}
/**
 * Called with the scene's average FPS after its sample window. In Auto mode a
 * slow sample steps down one tier (returns the new tier), else null.
 */
export function onFpsSample(fps: number): Tier | null {
  if (getSetting() !== 'auto' || fps >= FPS_FLOOR) return null
  const t = currentTier(); if (t === 'low') return null
  const n = lower(t); localStorage.setItem(GFX_AUTO_KEY, n); return n
}
/** Mobile cap: dense phone screens never render above 1.5x even on High. */
export const pixelRatioFor = (p: Preset, d: DeviceInfo) => Math.min(d.dpr, d.mobile ? Math.min(1.5, p.pixelRatio) : p.pixelRatio)
