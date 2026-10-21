// Sign-in / sign-up screen (full screen, over the map). Also "Play as guest".
// After signing in we load the account's cloud save if it has one.
import { useState } from 'react'
import * as A from '../game/auth'
import { Logo } from './art'

export function Login({ onDone, onClose }: { onDone: (name: string | null) => void; onClose?: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true); setErr('')
    try { const j = mode === 'in' ? await A.login(name, pw) : await A.signup(name, pw); A.setGuest(false); onDone(j.name) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <section className="screen login-screen">
      <div className="login-card">
        {onClose && <button className="sheet-close" aria-label="Close" onClick={onClose}>✕</button>}
        <div className="login-logo"><Logo /><h2>Ledgerworks</h2></div>
        <div className="seg dark"><button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button><button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button></div>
        <form onSubmit={e => { e.preventDefault(); void go() }}>
          <label>Username<input autoComplete="username" value={name} onChange={e => setName(e.target.value)} placeholder="3-20 letters, digits or _" /></label>
          <label>Password<input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={e => setPw(e.target.value)} placeholder={mode === 'up' ? 'At least 8 characters' : ''} /></label>
          {mode === 'up' && <small className="muted">Your current company (and any cloud save on this device) moves into the new account.</small>}
          {err && <p className="err">{err}</p>}
          <button className="primary big" disabled={busy}>{busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="link" onClick={() => { A.setGuest(true); onDone(null) }}>Play as guest</button>
        <small className="muted">Have an old cloud key? Load it from Menu → Saves & account, then create an account here to give it a password.</small>
      </div>
    </section>
  )
}
