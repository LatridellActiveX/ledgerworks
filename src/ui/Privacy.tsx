// Full-screen in-game privacy policy. Text comes from src/legal/privacy.ts,
// the same source as the Worker's /privacy page.
import { PRIVACY, PRIVACY_CONTACT, PRIVACY_EFFECTIVE } from '../legal/privacy'

export function PrivacyBody() {
  return (
    <div className="privacy">
      <p className="muted">Effective {PRIVACY_EFFECTIVE} · <a href="/privacy" target="_blank" rel="noopener">Open as a web page</a></p>
      {PRIVACY.map(s => <section key={s.h}><h3>{s.h}</h3>{s.p.map((p, i) => <p key={i}>{p.includes(PRIVACY_CONTACT) ? <>{p.replace(PRIVACY_CONTACT, '')}<a href={PRIVACY_CONTACT} target="_blank" rel="noopener">GitHub issues</a></> : p}</p>)}</section>)}
    </div>
  )
}

/** Stand-alone overlay (used from the login screen, before the HUD exists). */
export function PrivacyOverlay({ onClose }: { onClose: () => void }) {
  return (
    <section className="privacy-overlay">
      <header><button className="back" onClick={onClose} aria-label="Back">←</button><b>Privacy policy</b></header>
      <PrivacyBody />
    </section>
  )
}
