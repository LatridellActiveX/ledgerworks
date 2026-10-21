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
import { CHANGELOG } from '../changelog'

declare const __BUILD_ID__: string

/** Shape of /version.json (loose: older deploys only had `build`). */
export interface RemoteVersion { buildId?: string; build?: string; version?: string }

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
  const latest = CHANGELOG[0]
  return (
    <div className="update-prompt" role="dialog" aria-label="Update available">
      <div className="up-icon">⟳</div>
      <h3>Update available</h3>
      <p>A new version of Ledgerworks{avail.version ? <> <span className="muted">({avail.version} UTC)</span></> : ''} is ready. Your company is saved and the game reloads right where you are.</p>
      {forced && <p className="warn">Part of the game failed to load because a new version replaced it.</p>}
      {latest && <p className="up-new"><b>Latest:</b> {latest.title}</p>}
      <div className="row">
        <button onClick={() => { dismissed.current.add(avail.buildId!); setAvail(null) }}>Later</button>
        <button className="primary" onClick={() => { saveRef.current(); location.reload() }}>Update now</button>
      </div>
    </div>
  )
}
