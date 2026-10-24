// ============================================================================
// In-game update pop-up (modeled on lowpoly-city's UpdateChecker).
//
// Every deploy bakes a build id into the page (__BUILD_ID__, vite.config.ts)
// and the Worker serves the same id from /version.json (no-store). While you
// play we fetch /version.json with cache: 'no-store' plus a cache-busting
// query:
//   - every minute,
//   - when the window regains focus / the tab becomes visible again
//     (rate-limited to once per 30 s so alt-tabbing doesn't spam requests),
//   - first check 10 s after start-up (let the game load first).
//
// If the live buildId differs from ours, a new version is out and the card
// appears: [Update now] saves the company and reloads; [Later] hides it for
// that buildId (it won't nag again until another deploy).
//
// Chunk-load failures: an old tab that lazily imports /scene3d.js after a
// deploy may get the NEW 3D bundle or a failed import. Campus3D dispatches a
// 'lw:chunk-error' event in that case and we show the card even if "Later"
// was chosen, flagged that part of the game failed to load.
//
// Ledgerworks saves migrate forward (save.ts), so unlike lowpoly-city there
// is no "needs a new city" branch: every update is save-compatible.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { CHANGELOG, type ChangeEntry } from '../changelog'

declare const __BUILD_ID__: string

/** Shape of /version.json (loose: older deploys only had `build`). */
export interface RemoteVersion { buildId?: string; build?: string; version?: string; latest?: ChangeEntry[] }

/**
 * What's in the NEW build. The old fix read CHANGELOG[0] from this (old)
 * bundle, so the card always lagged one update behind. Now the Worker sends
 * the new build's newest entries in /version.json; we show the ones this tab
 * doesn't have yet (everything above our own newest id), newest first.
 * Fallback (older deploys without `latest`, or a bad payload): nothing, so we
 * never show stale notes as "new".
 */
export function newEntries(remote: RemoteVersion | null | undefined, localTopId = CHANGELOG[0]?.id): ChangeEntry[] {
  const list = Array.isArray(remote?.latest) ? remote!.latest.filter(e => e && typeof e.title === 'string') : []
  const cut = list.findIndex(e => e.id === localTopId)
  return cut === -1 ? list.slice(0, 3) : list.slice(0, Math.min(cut, 3))
}

const POLL_MS = 60_000
const FOCUS_MIN_GAP_MS = 30_000
const FIRST_CHECK_MS = 10_000

/** True when the remote build differs from the one this page was built with. */
export function isNewer(remote: RemoteVersion | null | undefined, local: string): boolean {
  return !!remote?.buildId && remote.buildId !== local
}

export function UpdatePrompt({ save }: { save: () => void }) {
  const [avail, setAvail] = useState<RemoteVersion | null>(null)
  const [forced, setForced] = useState(false)
  const dismissed = useRef(new Set<string>())
  const last = useRef(0)
  const saveRef = useRef(save); saveRef.current = save

  useEffect(() => {
    /** Fetch version.json; show the card if a new build is live. */
    const check = async (force = false) => {
      last.current = Date.now()
      let r: RemoteVersion
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return // e.g. `vite dev` has no version.json
        r = await res.json()
      } catch { return } // offline: try again later
      if (!isNewer(r, __BUILD_ID__)) return
      if (force || !dismissed.current.has(r.buildId!)) { setAvail(r); setForced(force) }
    }
    const onReturn = () => { if (!document.hidden && Date.now() - last.current > FOCUS_MIN_GAP_MS) void check() }
    const onChunk = () => void check(true)
    const t0 = setTimeout(() => void check(), FIRST_CHECK_MS)
    const iv = setInterval(() => void check(), POLL_MS)
    addEventListener('focus', onReturn); document.addEventListener('visibilitychange', onReturn)
    addEventListener('lw:chunk-error', onChunk)
    // Screenshot / debug hook: show the card for a fake build.
    ;(globalThis as any).__lwUpdate = { check, show: (v: RemoteVersion = { buildId: 'preview', version: 'preview' }) => setAvail(v) }
    return () => { clearTimeout(t0); clearInterval(iv); removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); removeEventListener('lw:chunk-error', onChunk) }
  }, [])

  if (!avail) return null
  const fresh = newEntries(avail)
  return (
    <div className="update-prompt" role="dialog" aria-label="Update available">
      <div className="up-icon">⟳</div>
      <h3>Update available</h3>
      <p>A new version of Ledgerworks{avail.version ? <> <span className="muted">({avail.version} UTC)</span></> : ''} is ready. Your company is saved and the game reloads right where you are.</p>
      {forced && <p className="warn">Part of the game failed to load because a new version replaced it.</p>}
      {fresh.length > 0 && <div className="up-new"><b>What's new:</b>{fresh.map(e => <p key={e.id}><b>{e.title}</b> — {e.notes[0]}</p>)}</div>}
      <div className="row">
        <button onClick={() => { dismissed.current.add(avail.buildId!); setAvail(null) }}>Later</button>
        <button className="primary" onClick={() => { saveRef.current(); location.reload() }}>Update now</button>
      </div>
    </div>
  )
}
