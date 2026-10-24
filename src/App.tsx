// ============================================================================
// Root UI. Holds the GameState in React state, ticks the simulation once a
// second, autosaves every few seconds, and renders:
//   top bar (cash, level, clock) | plot grid | side panel (selected plot)
//   warehouse + exchange | event log | change log
// ============================================================================
import { TurboChip, TurboTag } from './ui/TurboChip'
import { Boot } from './ui/Boot'
import { PlayerSearch, PlayerProfile } from './ui/Players'
import { PlayerCtx } from './ui/PlayerLink'
import { FarmPlot } from './ui/Farm'
import { isFarm } from './game/farm'
import * as FM from './game/farm'
import * as GFX from './game/gfx'
import { Warehouse } from './ui/Warehouse'
import { Chains } from './ui/Chains'
import { News } from './ui/News'
import { Routes, RouteLane } from './ui/Routes'
import { PrivacyBody } from './ui/Privacy'
import { activityOf, chipLabel, type ActState } from './game/activity'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as E from './game/engine'
import { BLD, BUILDINGS, REC, RES, RESOURCES } from './game/data'
import { loadGame, saveGame, exportCode, importCode, freshGame } from './game/save'
import * as SEA from './game/seasons'
import { companyValue } from './game/trade'
import * as T from './game/trade'
import { CompanyValue } from './ui/CompanyValue'
import { UpdatePrompt } from './ui/UpdatePrompt'
import { Login } from './ui/Login'
import { Tutorial, loadTut, saveTut, type TutState } from './ui/Tutorial'
import * as A from './game/auth'
import { BuildingArt, Logo, ResIcon } from './ui/art'
import { Campus3D } from './ui/Campus3D'
import { Ticker } from './ui/Ticker'
import { setSound, setVolume, sfx, soundOn, testSounds, unlockAudio, volume, SFX_LIST } from './ui/sound'
import { actionSfx, tickSfx } from './ui/sfxFor'
import { clock, dur, money, num } from './ui/fmt'
import { GAME_SPEED } from './game/engine-constants'
import { CHANGELOG } from './changelog'
import { Crest } from './ui/Crest'
import { LevelScreen } from './ui/Levels'
import { renameCompany } from './game/company'
import { OtherGoods, RetailPanel } from './ui/RetailPanel'
import { Exchange } from './ui/Exchange'
import { Research } from './ui/Research'
import { Board } from './ui/Board'
import { Executives } from './ui/Executives'
import { Finance } from './ui/Finance'
import { TradeFloor } from './ui/TradeFloor'
import { QtyPicker, clampQty } from './ui/QtyPicker'
import { flyTo } from './ui/fly'
import * as Q from './game/qty'
import { cashLineBonus, checkAchievements } from './game/execs'
import { PHASE_LABEL, accountingFee } from './game/economy'
import { cloudKey, cloudLoad, cloudSave, syncWorld, useCloudKey } from './game/cloud'
import './app.css'

export default function App() {
  const [loginMode, setLoginMode] = useState<'in' | 'up'>('in') // 'up' when opened from "Create account to trade"
  const [player, setPlayer] = useState<string | null>(null) // open player profile
  const [gfx, setGfx] = useState(GFX.getSetting)
  const [booting, setBooting] = useState(() => !(globalThis as any).__lwNoBoot)
  const [s, setS] = useState<E.GameState>(() => E.advanceReal(loadGame()))
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const [view, setView] = useState<'3d' | '2d'>(() => (localStorage.getItem('ledgerworks-view') as '3d' | '2d') || '3d')
  const [sound, setSnd] = useState(soundOn())
  const [vol, setVol] = useState(volume())
  useEffect(() => unlockAudio(), []) // resume audio on the first tap (mobile rule)
  const [screen, setScreen] = useState<Screen>('map')
  const [menu, setMenu] = useState(false)
  // Production chains screen: which good is shown, and the Warehouse good page we came from (if any).
  const [chainRes, setChainRes] = useState<string | null>(null)
  const [chainFrom, setChainFrom] = useState<string | null>(null)
  const [whOpen, setWhOpen] = useState<string | null>(null)
  // Accounts: who is signed in (cookie session), and whether to show the login screen.
  const [user, setUser] = useState<string | null>(null)
  const [showLogin, setShowLogin] = useState(false)
  useEffect(() => { A.me().then(m => { if (m) setUser(m.name); else if (!A.isGuest()) setShowLogin(true) }) }, [])
  /** After sign-in: load the account's cloud save, or upload this company if it has none. */
  const afterLogin = async (name: string | null, created = false) => {
    setShowLogin(false); setUser(name)
    if (!name) return
    // Guest -> account: this device's company is the newest copy, so upload it
    // first (an older guest cloud backup must never overwrite it). The trade
    // floor account stays in this browser and links on its next open.
    if (created) { await cloudSave(latest.current); setMsg(`Account ${name} created. All your progress is saved to it.`); return }
    try { const n = await cloudLoad(); setS(n); saveGame(n); setMsg(`Signed in as ${name}`) } catch { await cloudSave(latest.current); setMsg(`Signed in as ${name}. Company saved to your account.`) }
  }
  // First-time tutorial (progress in localStorage).
  const [tut, setTutS] = useState<TutState>(loadTut)
  const setTut = (t: TutState) => { setTutS(t); saveTut(t) }
  const [seenLog, setSeenLog] = useState(() => Number(localStorage.getItem('ledgerworks-seen-log') || 0))

  /** Run a mutating engine action on a copy, show its error if any. */
  const act = (f: (st: E.GameState) => string | null | void) => {
    const next = structuredClone(s)
    const err = f(next)
    if (!err) for (const m of checkAchievements(next)) next.log.unshift(m)
    sfx(actionSfx(s, next, err)) // collect / build / trade / error ... (see ui/sfxFor.ts)
    setMsg(err || '')
    if (!err) { heard.current = next; setS(next); saveGame(next) }
  }
  // Sounds for things that happen on their own: a job or construction
  // finishing, or a level up from sales. `heard` is the last state we made a
  // sound for, so an action's own change isn't played twice.
  const heard = useRef(s)
  useEffect(() => {
    if (heard.current === s) return
    const k = tickSfx(heard.current, s); heard.current = s
    if (k) sfx(k)
  }, [s])

  // Tick: advance by real time once a second; autosave every 5 s.
  useEffect(() => {
    const t = setInterval(() => setS(p => E.advanceReal(structuredClone(p))), 1000)
    return () => clearInterval(t)
  }, [])
  // Autosave: keep the latest state in a ref so ONE interval (created once)
  // always saves the current company. (Before, the interval was recreated on
  // every 1 s tick and never got to fire.)
  const latest = useRef(s); latest.current = s
  useEffect(() => { const t = setInterval(() => saveGame(latest.current), 5000); return () => clearInterval(t) }, [])

  // Every minute: pull shared prices from the server; every 2 minutes: cloud save.
  useEffect(() => {
    const pull = () => setS(p => { const n = structuredClone(p); syncWorld(n).then(() => setS(q => ({ ...q, ref: n.ref, online: n.online, phase: n.phase ?? q.phase }))); return p })
    pull()
    const a = setInterval(pull, 60000)
    const b = setInterval(() => setS(p => { cloudSave(p); return p }), 120000)
    return () => { clearInterval(a); clearInterval(b) }
  }, [])

  /** Tap a bubble (or the panel button): collect what has accrued, then animate it to the HUD. */
  const collectAt = (i: number, r: DOMRect) => {
    const p = s.plots[i] && E.pending(s, s.plots[i]!)
    if (!p || p.units < 1) return
    const icon = (document.querySelector(`.bubble.${p.kind} svg, .bubble.${p.kind} .coin`) as HTMLElement | null)?.outerHTML ?? '<span class="coin">$</span>'
    act(st => E.collect(st, i))
    flyTo(r, p.kind, p.kind === 'goods' ? `+${num(p.units)} ${RES[p.res].name}` : `+${money(p.cents / 100)}`, p.kind === 'cash' ? '<span class="coin">$</span>' : icon)
  }

  const lvl = E.companyLevel(s.xp)
  const slots = E.plotCount(lvl)
  const xpLo = E.xpForLevel(lvl), xpHi = E.xpForLevel(lvl + 1)

  // ---- HUD layout (map fills the screen; menus are their own screens) ----
  const idle = s.plots.flatMap((bd, i) => (bd && !bd.job ? [i] : []))
  // A ripe crop is ready to harvest now, so it counts as free from this hour.
  const nextIdle = s.plots.reduce((m, bd) => { if (!bd?.job) return m; const t = E.ripeOf(bd.job) !== undefined ? s.hour : bd.job.endH; return t < m ? t : m }, Infinity)
  const unseen = Math.max(0, s.log.length - seenLog)
  const open = (t: Screen) => { sfx('tap'); setScreen(t); setMenu(false); setWhOpen(null); setChainFrom(null); if (t === 'log') { setSeenLog(s.log.length); localStorage.setItem('ledgerworks-seen-log', String(s.log.length)) } }
  const xpPct = Math.floor((100 * (s.xp - xpLo)) / (xpHi - xpLo))
  const toggleView = () => { const v = view === '3d' ? '2d' : '3d'; setView(v); localStorage.setItem('ledgerworks-view', v) }

  // Rename from anywhere (Account screen or Company value): one prompt, saved at once.
  const renameCompany_ = () => {
    const raw = prompt('New company name (2 to 40 characters)', s.company)
    if (raw === null) return
    const r = renameCompany(s, raw)
    if ('error' in r) { setMsg(r.error); return }
    setS(r.state); saveGame(r.state)
    setMsg(`Renamed to ${r.state.company}`)
    if (T.account()) T.p2p('me', { company: r.state.company }).catch(() => {})
  }
  // Any player name in the game opens their profile through this.
  const openPlayer = (n: string) => { setPlayer(n); setScreen('players') }
  return (
    <PlayerCtx.Provider value={openPlayer}>
    <div className="app hud-app">
      {/* The map is the whole screen; everything else floats over it. */}
      <section className="campus-wrap full">
        <Campus3D s={s} slots={slots} sel={sel} onPick={i => { setSel(i); setScreen('building') }} mode={view} onCollect={collectAt} />
      </section>

      {/*
        Compact top HUD (Oct 2026): ONE slim strip about 56px tall, so nothing
        big floats over the map. Left to right:
          menu · tiny clock line + Turbo Week chip · (space) · bell · crates ·
          [cash pill over a slim ★ level / XP bar row] · company badge.
        Same taps as before: cash and badge open Company Value, the XP row opens
        Levels, the bell opens notifications, crates open the Warehouse.
        (No mode-switch avatar on the left, unlike the reference layout.)
      */}
      <div className="hud-top hud-strip">
        <button className="hud-btn burger" aria-label="Menu" onClick={() => setMenu(true)}><span /><span /><span /></button>
        {/* Tiny info column: day/clock/phase as small text, event chip under it. */}
        <div className="hud-left">
          <span className="hud-info" title={clock(s.hour)}>{/* Short form "D1 08:00" so it fits the slim strip. A non-breaking space
              (\u00a0) separates day and time: the plain space was so thin in the
              10px strip font that it read as "D108:00". */}{clock(s.hour).replace(/^Day (\d+), /, 'D$1\u00a0')} · <span className={`phase-${s.phase ?? 'normal'}`}>{PHASE_LABEL[s.phase ?? 'normal']}</span>{s.realm === 'seasons' ? ` · S${s.season}` : ''}</span>
          <TurboChip />
        </div>
        {/* Small bell with an unread count. */}
        <button className="hud-mini bell" aria-label={`Notifications${unseen ? `, ${unseen} new` : ''}`} onClick={() => open('log')}>🔔{unseen > 0 && <i>{unseen > 99 ? '99+' : unseen}</i>}</button>
        {/* No crate counter on the map HUD (Parker, Oct 2026): crates show where they are used (Warehouse, Exchange, crate quick-buy prompts). */}
        <div className="hud-stats">
          {/* Slim cash pill: tap opens Company Value. */}
          <button className="pill cash" aria-label="Cash. Show company value" title="Company value" onClick={() => open('value')}><Ticker value={s.cash} /></button>
          {/* Slim level row under the cash: star level, XP bar, percent. */}
          <button className="hud-xp" title={`Company level ${lvl}, ${xpPct}% to the next. Tap for details.`} aria-label={`Company level ${lvl}, ${xpPct} percent to the next. Show level details.`} onClick={() => open('levels')}><b>★ {lvl}</b><span className="bar"><i style={{ width: `${xpPct}%` }} /></span><small>{xpPct}%</small></button>
        </div>
        {/* Company badge, right of the cash (opens Company Value as before). */}
        <button className="hud-badge" title={s.company} aria-label="Company" onClick={() => open('value')}><Crest name={s.company} size={28} /></button>
      </div>

      {s.realm === 'seasons' && (s.season ?? 0) < SEA.seasonAt().no && <div className="season-over">
        <b>Season {s.season} is over!</b> Your company finished at {money(companyValue(s))}.
        <button className="primary" onClick={() => {
          // Keep a record of past seasons, then start fresh in the new one.
          const past = JSON.parse(localStorage.getItem('ledgerworks-season-results') || '[]')
          past.unshift({ season: s.season, company: s.company, value: companyValue(s) })
          localStorage.setItem('ledgerworks-season-results', JSON.stringify(past.slice(0, 20)))
          const n = freshGame(s.company, 'seasons'); setS(n); saveGame(n); setSel(null)
        }}>Start Season {SEA.seasonAt().no}</button></div>}
      {msg && <div key={msg} className="toast" onClick={() => setMsg('')}>{msg}</div>}

      {/* Trade-route carts on the road, in a lane under the HUD. */}
      {screen === 'map' && sel === null && <RouteLane s={s} onOpen={() => open('routes')} />}

      {/* Bottom-left idle info; tap to jump to an idle building. */}
      {screen === 'map' && sel === null && <button className="idle-box" onClick={() => { if (idle.length) { setSel(idle[0]); setScreen('building') } }}>
        <span>Idle buildings: <b>{idle.length}</b></span>
        <span>Next idle: <b>{nextIdle < Infinity ? clock(nextIdle) : '—'}</b></span>
      </button>}

      {/* Building menu (produce / sell / build) opens as its own full screen; see screen 'building'. */}
      {/* Full-screen menu screens, sliding in over the map. */}
      {screen !== 'map' && <section key={screen} className="screen">
        <header className="screen-head">
          <button className="hud-btn" aria-label="Back to map" onClick={() => { sfx('tap'); if (screen === 'chains' && chainFrom) { setWhOpen(chainFrom); setChainFrom(null); setScreen('warehouse'); return } setScreen('map'); setWhOpen(null); if (screen === 'building') setSel(null) }}>‹</button>
          <h2>{screen === 'building' && sel !== null ? (s.plots[sel] ? `${BLD[s.plots[sel]!.type].name} · level ${s.plots[sel]!.level}` : `Build on plot ${sel + 1}`) : SCREEN_TITLE[screen]}</h2>
          {(screen === 'exchange' || screen === 'trade') && <div className="seg"><button className={screen === 'exchange' ? 'on' : ''} onClick={() => setScreen('exchange')}>Exchange</button><button className={screen === 'trade' ? 'on' : ''} onClick={() => setScreen('trade')}>Trade floor</button></div>}
          {(screen === 'research' || screen === 'board') && <div className="seg"><button className={screen === 'research' ? 'on' : ''} onClick={() => setScreen('research')}>Research</button><button className={screen === 'board' ? 'on' : ''} onClick={() => setScreen('board')}>Board & goals</button></div>}
        </header>
        <div className="screen-body bottom">
          {screen === 'warehouse' && <Warehouse s={s} act={act} openPlot={i => { setSel(i); setScreen('building') }} initialOpen={whOpen}
            openChain={r => { sfx('tap'); setChainRes(r); setChainFrom(r); setScreen('chains') }} />}
          {screen === 'news' && <News s={s} />}
          {screen === 'routes' && <Routes s={s} act={act} />}
          {screen === 'chains' && <Chains s={s} res={chainRes} onPick={setChainRes} />}
          {screen === 'exchange' && <Exchange s={s} act={act} user={user} />}
          {screen === 'trade' && <TradeFloor s={s} act={act} user={user} onSignup={() => { setLoginMode('up'); setShowLogin(true) }} />}
          {screen === 'research' && <Research s={s} act={act} />}
          {screen === 'board' && <Board s={s} onExecs={() => open('execs')} />}
          {screen === 'execs' && <Executives s={s} act={act} />}
          {screen === 'finance' && <Finance s={s} act={act} user={user} />}
          {screen === 'levels' && <LevelScreen s={s} />}
          {screen === 'value' && <CompanyValue s={s} onPlayer={openPlayer} onRename={renameCompany_} />}
          {/* Player search + public profiles (ui/Players.tsx). Trade opens the trade floor offer form for that trader. */}
          {screen === 'players' && (player
            ? <PlayerProfile name={player} s={s} act={act} user={user} onBack={() => setPlayer(null)} />
            : <PlayerSearch onOpen={setPlayer} />)}
          {screen === 'building' && sel !== null && (s.plots[sel] ? <BuildingPanel s={s} plot={sel} act={act} /> : <BuildMenu s={s} plot={sel} act={act} />)}
          {screen === 'market' && <Demand s={s} />}
          {screen === 'log' && <ul className="log">{s.log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          {screen === 'changes' && <ul className="log">{CHANGELOG.map(c => <li key={c.id}><b>{c.date} · {c.title}</b> — {c.notes.join(' ')}</li>)}</ul>}
          {screen === 'account' && <div className="menu-list">
            {user ? <p>Signed in as <b>{user}</b> <button onClick={async () => { await A.logout().catch(() => {}); setUser(null); A.setGuest(true); setMsg('Signed out') }}>Log out</button></p>
              : <><p className="muted">Playing as a guest. Create an account to keep this company safe and play on any device.</p><button className="primary" onClick={() => setShowLogin(true)}>Sign in or create account</button></>}
            <div className="crest-row">
              <Crest name={s.company} size={84} />
              <div>
                <b className="co-name">{s.company}</b>
                <small className="muted">Level {E.companyLevel(s.xp)} company</small>
                <button onClick={renameCompany_}>✎ Rename company</button>
              </div>
            </div>
            <p>{s.online ? '● online' : '○ offline'} · Overhead {(E.overhead(s) * 100).toFixed(1)}% <small className="muted">(accounting fee today {money(accountingFee(s.cash, 2_500_000 + cashLineBonus(s)))})</small></p>
            <label>Realm <select className="realm" value={SEA.realm()} title="Classic: play forever. Seasons: a timed season with weather phases, then a fresh start." onChange={e => { saveGame(s); SEA.setRealm(e.target.value as SEA.Realm); location.reload() }}>
              <option value="classic">Classic realm</option><option value="seasons">Seasons realm</option></select></label>
            {s.realm === 'seasons' && (() => { const se = SEA.seasonAt(); return <p className={`season-${se.phase}`}>Season {s.season} · {se.phase} · {se.daysLeft}d left — {SEA.PHASE_NOTE[se.phase]}</p> })()}
            <button onClick={() => { navigator.clipboard?.writeText(exportCode(s)); setMsg('Save code copied to clipboard') }}>Copy save</button>
            <button onClick={() => { const c = prompt('Paste a save code'); if (c) try { const n = importCode(c.trim()); setS(n); saveGame(n) } catch (e: any) { setMsg(e.message) } }}>Load save</button>
            <button onClick={async () => setMsg((await cloudSave(s)) || 'Saved to the cloud')}>Cloud save</button>
            <button onClick={async () => { const k = prompt('Cloud key (copy it from another device). Leave as-is to load this browser\'s cloud save.', cloudKey()); if (!k) return; try { useCloudKey(k); const n = await cloudLoad(); setS(n); saveGame(n); setMsg('Loaded from the cloud') } catch (e: any) { setMsg(e.message) } }}>Cloud load</button>
            <button className="danger" onClick={() => { if (confirm('Start over? Your current company is lost.')) { const n = freshGame(prompt('Company name', 'My Company') || 'My Company'); setS(n); saveGame(n); setSel(null); setScreen('map') } }}>New company</button>
          </div>}
          {screen === 'privacy' && <PrivacyBody />}
          {screen === 'settings' && <div className="menu-list">
            <button onClick={toggleView}>Map view: {view === '3d' ? '3D (tap for 2D)' : '2D (tap for 3D)'}</button>
            {/* Sound: mute toggle, volume slider (0-100, saved) and a preview. */}
            <div className="sound-box">
              <button className={sound ? 'on' : ''} aria-pressed={sound} onClick={() => { setSound(!sound); setSnd(!sound); if (!sound) setTimeout(() => sfx('coin', true), 50) }}>{sound ? '🔊 Sound on' : '🔇 Sound off (muted)'}</button>
              <label className="vol">Volume <input type="range" min={0} max={100} step={1} value={vol} disabled={!sound} aria-label="Sound volume"
                onChange={e => { const v = setVolume(Number(e.target.value)); setVol(v); sfx('tap') }} /><b>{vol}</b></label>
              <button disabled={!sound} onClick={testSounds}>▶ Test sounds</button>
              <div className="sfx-chips">{SFX_LIST.map(x => <button key={x.id} disabled={!sound} onClick={() => sfx(x.id, true)}>{x.label}</button>)}</div>
            </div>
            <button onClick={() => setTut({ ...tut, off: !tut.off, done: tut.off ? false : tut.done })}>Tutorial: {tut.off ? 'off' : 'on'}</button>
            <button onClick={() => { setTut({ step: 0, done: false, off: false }); setScreen('map') }}>Restart tutorial</button>
            {/* Graphics quality for the 3D map (game/gfx.ts). Auto adapts to the device. */}
            <label className="gfx-set">Graphics quality <select value={gfx} onChange={e => { const g = e.target.value as GFX.GfxSetting; GFX.setSetting(g); setGfx(g); dispatchEvent(new Event('lw:gfx')) }}>
              {(['auto', 'high', 'medium', 'low'] as const).map(g => <option key={g} value={g}>{g === 'auto' ? `Auto (now ${GFX.currentTier()})` : g[0].toUpperCase() + g.slice(1)}</option>)}</select></label>
            <button onClick={() => setScreen('privacy')}>🔒 Privacy policy</button>
            {/* Data deletion (see src/legal/privacy.ts). Two confirmations; the
                server also needs the password for accounts. */}
            <button className="danger" onClick={async () => {
              if (!confirm(user ? `Permanently delete the account "${user}", its cloud saves and its trade floor account? This cannot be undone.` : 'Permanently delete this browser\'s cloud saves, trade floor account and local game data? This cannot be undone.')) return
              try {
                if (user) { const pw = prompt('Enter your password to confirm'); if (!pw) return; await A.deleteAccount(user, pw) }
                else await A.deleteGuestCloud()
                if (T.account()) await T.p2p('delete').catch(() => {})
                A.clearLocalData(); alert('Your data was deleted.'); location.reload()
              } catch (e: any) { setMsg(e.message) }
            }}>{user ? 'Delete my account' : 'Delete my data'}</button>
            <p className="muted">Map: drag to pan · pinch or scroll to zoom · Q / E or ⟲ ⟳ to turn (3D) · tap a plot to manage it.</p>
          </div>}
        </div>
      </section>}

      {/* Hamburger drawer: the less-used screens and settings. */}
      {menu && <div className="drawer-bg" onClick={() => setMenu(false)}><nav className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head"><Logo /><b>{s.company}</b></div>
        {(['levels', 'value', 'players', 'execs', 'news', 'routes', 'chains', 'market', 'log', 'changes', 'account', 'settings', 'privacy'] as const).map(t => <button key={t} onClick={() => open(t)}>{SCREEN_ICON[t]} {SCREEN_TITLE[t]}</button>)}
        <button onClick={() => { toggleView(); setMenu(false) }}>{view === '3d' ? '▦ Switch to 2D map' : '◈ Switch to 3D map'}</button>
      </nav></div>}

      <UpdatePrompt save={() => saveGame(latest.current)} />
      {/* Boot screen first (skipped by the screenshot tool via __lwNoBoot). Login and the tour wait for it. */}
      {booting && <Boot view={view} onDone={() => setBooting(false)} />}
      {!booting && showLogin && <Login initial={loginMode} onDone={afterLogin} onClose={A.isGuest() || user ? () => setShowLogin(false) : undefined} />}
      {!booting && !showLogin && !tut.done && !tut.off && <Tutorial t={tut} set={setTut} />}

      {/* Bottom tab bar: five main screens. */}
      <nav className="tabs tabbar">
        {TABS.map(([t, label, icon]) => {
          const on = t === 'map' ? screen === 'map' : t === 'exchange' ? screen === 'exchange' || screen === 'trade' : t === 'research' ? screen === 'research' || screen === 'board' : screen === t
          return <button key={t} aria-label={label} className={on ? 'on' : ''} onClick={() => { open(t); if (t === 'map') setSel(null) }}><span className="ti">{icon}</span><span>{label}</span></button>
        })}
      </nav>
    </div>
    </PlayerCtx.Provider>
  )
}

/** Every screen the HUD can open. 'map' is the plain map. */
type Screen = 'map' | 'levels' | 'value' | 'building' | 'warehouse' | 'exchange' | 'trade' | 'research' | 'board' | 'finance' | 'market' | 'log' | 'changes' | 'account' | 'settings' | 'privacy' | 'chains' | 'news' | 'routes' | 'execs' | 'players'
const SCREEN_TITLE: Record<Screen, string> = { map: 'Map', levels: 'Company level', value: 'Company value', building: 'Building', warehouse: 'Warehouse', exchange: 'Market', trade: 'Market', research: 'Research', board: 'Research', finance: 'Finance', market: 'Public demand', log: 'Events', changes: 'Change log', account: 'Saves & account', settings: 'Settings', privacy: 'Privacy policy', chains: 'Production chains', news: 'Business Live', routes: 'Trade routes', execs: 'Executives', players: 'Players' }
const SCREEN_ICON: Partial<Record<Screen, string>> = { levels: '★', value: '💹', market: '📈', log: '🔔', changes: '📝', account: '💾', settings: '⚙', privacy: '🔒', chains: '🔗', news: '📡', routes: '🚚', execs: '👔', players: '🔎' }
/** The bottom tab bar (original simple glyphs). */
const TABS: [Screen, string, string][] = [['map', 'Map', '🗺'], ['warehouse', 'Warehouse', '📦'], ['exchange', 'Market', '⇄'], ['research', 'Research', '🔬'], ['finance', 'Finance', '🏦']]

type Act = (f: (st: E.GameState) => string | null | void) => void

/** List of buildings you can construct on an empty plot. */
function BuildMenu({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const lvl = E.companyLevel(s.xp)
  return (
    <div>
      <h3>Build on plot {plot + 1}</h3>
      <div className="buildlist">
        {BUILDINGS.map(b => {
          const ok = lvl >= b.unlockLevel
          return (
            <button key={b.id} disabled={!ok || s.cash < b.cost} className="buildopt" onClick={() => act(st => E.construct(st, plot, b.id))}>
              <span className="mini"><BuildingArt type={b.id} /></span>
              <span><b>{b.name}</b><br /><small>{ok ? money(b.cost) : `Unlocks at Lv ${b.unlockLevel}`} · {b.kind === 'retail' ? 'shop' : (b.recipes ?? []).map(r => RES[r].name).join(', ')}</small></span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Manage one building: production form or shop form, upgrade, scrap, rush. */
function BuildingPanel({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = s.plots[plot]!, bt = BLD[bd.type]
  const farm = isFarm(bd.type)
  // Farms: which field the panel below works on. -1 = the farm's main field,
  // 0.. = extra field f. The chosen field's plot ref is handed to the usual
  // FarmPlot / JobCard / MakeForm, which all look their unit up by ref.
  const [fsel, setF] = useState(-1)
  const f = fsel < (bd.fields?.length ?? 0) ? fsel : -1 // field scrapped/reset: fall back to main
  const ref = farm && f >= 0 ? FM.fieldRef(plot, f) : plot
  const u = E.unitAt(s, ref)!
  return (
    <div>
      <h3>{bt.name} · {farm ? `${1 + (bd.fields?.length ?? 0)} field${bd.fields?.length ? 's' : ''}` : `level ${bd.level}`} <StatusChip state={activityOf(s, bd)!.state} /></h3>
      <div className="hero"><BuildingArt type={bd.type} level={bd.level} busy={!!bd.job} /></div>
      {farm && <FieldsCard s={s} plot={plot} sel={f} onSel={setF} act={act} />}
      {farm && <FarmPlot s={s} plot={ref} act={act} />}
      {/* Construction keeps its simple card. Making and selling use the
          stacked label/value layout (JobCard below). */}
      {u.job ? (u.job.kind === 'build' ? (
        <div className="card">
          <span>Under construction</span>
          <div>Done in {dur(u.job.endH - s.hour)}</div>
          <button onClick={() => act(st => E.rush(st, ref))}>Rush for {money(E.rushCost(s, u))}</button>
        </div>
      ) : <JobCard key={ref} s={s} plot={ref} act={act} />
      ) : null}
      {/* A selling store still lists its other goods, locked until this sale ends. */}
      {bd.job?.kind === 'sell' && <OtherGoods s={s} plot={plot} />}
      {u.job ? null : bt.kind === 'production' ? <MakeForm key={ref} s={s} plot={ref} act={act} /> : <RetailPanel s={s} plot={plot} act={act} />}
      <div className="row">
        {/* Farms don't level up any more: they buy fields in FieldsCard. */}
        {!farm && <button disabled={!!bd.job} onClick={() => act(st => E.upgrade(st, plot))}>Upgrade to L{bd.level + 1} ({money(E.upgradeCost(bd.type, bd.level + 1))})</button>}
        <button className="danger" onClick={() => confirm(`Scrap for ${money(E.scrapRefund(bd))} back?`) && act(st => E.scrap(st, plot))}>Scrap</button>
      </div>
      <p className="muted">Wages {money(bt.wage * u.level * (1 + E.overhead(s)))}/game hour while working (incl. {(E.overhead(s) * 100).toFixed(1)}% admin overhead).</p>
    </div>
  )
}

/**
 * Farm fields (Option B): one label/value row per field (what it grows, how
 * far along), a field picker, and the "Buy field" button. Rows use the same
 * zebra .kv layout as the running-job card.
 */
function FieldsCard({ s, plot, sel, onSel, act }: { s: E.GameState; plot: number; sel: number; onSel: (f: number) => void; act: Act }) {
  const bd = s.plots[plot]!
  const units = [bd, ...(bd.fields ?? [])]
  const next = E.nextFieldCost(bd)
  /** Short status for one field: crop and progress, ripe, or empty. */
  const status = (u: E.Building) => {
    const j = u.job
    if (!j) return 'Empty: ready to plant'
    if (j.kind !== 'make') return 'Busy'
    if (j.ripeH !== undefined) return <>{RES[j.res].name} · <b className="ok-note">ripe</b></>
    return <>{RES[j.res].name} · {Math.round(100 * FM.growFrac(j, s.hour))}%</>
  }
  return <div className="card fields-card">
    <div className="jc-head"><b>FIELDS</b><span>Each field grows its own crop</span></div>
    <div className="kv">
      {units.map((u, i) => <KV key={u.uid} k={i === 0 ? `Main field (${bd.level === 1 ? '1×' : `L${bd.level}`})` : `Field ${i + 1} (${FM.FIELD_OUT}×)`}>{status(u)}</KV>)}
      <KV k="Next field">{next === null ? `Maximum (${FM.MAX_FIELDS} extra)` : <>{money(next)} <small className="muted">adds {FM.FIELD_OUT}× base output</small></>}</KV>
    </div>
    {/* Picker: choose which field the plot view and forms below work on. */}
    <div className="row field-tabs">
      {units.map((u, i) => <button key={u.uid} className={sel === i - 1 ? 'primary' : ''} onClick={() => onSel(i - 1)}>{i === 0 ? 'Main' : `Field ${i + 1}`}</button>)}
    </div>
    {next !== null && <button disabled={s.cash < next || bd.job?.kind === 'build'} onClick={() => act(st => E.buyField(st, plot))}>Buy field {units.length + 1} · {money(next)}</button>}
  </div>
}

/** Progress of a running job, with collect-now and stop buttons. */
/**
 * Smoothly count a number up to its latest value (ease toward the target each
 * frame) so output and revenue visibly tick upward. Reduced motion: jump.
 */
function useTicker(target: number) {
  const [v, setV] = useState(target)
  const cur = useRef(target)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || target < cur.current) { cur.current = target; setV(target); return }
    let raf = 0
    const step = () => {
      cur.current += (target - cur.current) * 0.15
      if (Math.abs(target - cur.current) < 0.5) cur.current = target
      setV(cur.current)
      if (cur.current !== target) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

/** Colored status chip: Producing (spinning gear) / Selling (walking cart) / Idle / Done / Building. */
export function StatusChip({ state }: { state: ActState }) {
  return <span className={`status ${state}`}>{state === 'make' ? <span className="gear">⚙</span> : state === 'sell' ? <span className="cart">🛒</span> : state === 'done' ? '✓' : state === 'build' ? '🏗' : '◌'} {chipLabel[state]}</span>
}

/**
 * Wall-clock moment a job finishes. Game hours run at GAME_SPEED x real time
 * (1x now), so the remaining game hours map straight to real milliseconds.
 */
function finishAt(hoursLeft: number) {
  const d = new Date(Date.now() + Math.max(0, hoursLeft) * 3600e3 / GAME_SPEED)
  // Short numeric date plus time, e.g. "10/23/26 8:22 PM", in the player's locale/zone.
  return d.toLocaleString(undefined, { year: '2-digit', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * One row of the stacked details table: bold label right-aligned, value
 * left-aligned, the two meeting at the centre line (see .kv in app.css).
 */
function KV({ k, children }: { k: ReactNode; children: ReactNode }) {
  return <div className="kv-row"><span className="kv-k">{k}</span><span className="kv-v">{children}</span></div>
}

/**
 * Running make/sell job, laid out like a classic "PRODUCTION" card:
 *   1. centred header (PRODUCTION / SELLING) with the product name under it,
 *   2. zebra-striped label/value rows (all the old figures, nothing dropped),
 *   3. progress bar, then the Collect / Stop / Rush actions,
 *   4. remaining time, with "Finishes at <date time>" muted beneath.
 */
function JobCard({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = E.unitAt(s, plot)!, j = bd.job! // plot ref: a building or a farm field
  const a = activityOf(s, bd)
  // Tickers ease the counters upward each frame so progress visibly moves.
  const doneT = useTicker(a?.done ?? 0), centsT = useTicker(a?.cents ?? 0)
  if (j.kind === 'build' || !a) return null
  const p = E.pending(s, bd)!
  const ripe = E.ripeOf(j) !== undefined
  // Time left counts the live event (Turbo Week runs jobs faster).
  const left = E.jobLeft(s, j)
  return <div className={`card jobcard jobprog ${j.kind}`}>
    {/* 1. Header: section title in caps, product name below. */}
    <div className="jc-head">
      <b>{j.kind === 'make' ? 'PRODUCTION' : 'SELLING'}</b>
      <span><ResIcon id={j.res} size={18} /> {RES[j.res].name}</span>
    </div>
    {/* 2. Stacked details. Production rows first, then the store breakdown. */}
    <div className="kv">
      {j.kind === 'make' ? <>
        <KV k="Producing right now">{num(j.qty)}</KV>
        <KV k="Made so far"><span className="ticker">{num(Math.floor(doneT))} / {num(j.qty)}</span></KV>
        <KV k="Collected so far">{num(j.got ?? 0)}</KV>
        {j.src !== undefined && <KV k="Sourcing value">{money(j.src)}</KV>}
        <KV k="Quality">{j.q}</KV>
        {j.src !== undefined && <KV k="Cost per unit">{money(j.wg !== undefined ? (j.src + j.wg) / j.qty : j.src / j.qty)}</KV>}
        {/* Inputs-only figure kept from the old one-line summary. */}
        {j.src !== undefined && j.wg !== undefined && <KV k="Inputs per unit">{money(j.src / j.qty)}</KV>}
      </> : (() => {
        // Store breakdown: same content as before, now one row per figure.
        const total = E.saleCents(j) / 100, got = (j.gotC ?? 0) / 100, wait = p.cents / 100
        return <>
          <KV k="Selling right now">{num(j.qty)}</KV>
          <KV k="Price">{money(j.price)}</KV>
          <KV k="Sold so far"><span className="ticker">{num(Math.floor(doneT))} / {num(j.qty)} · {money(Math.floor(centsT) / 100)}</span></KV>
          <KV k="Uncollected earnings">{money(wait)}</KV>
          <KV k="Already collected">{money(got)}</KV>
          {/* Merged row: drops with each collect; muted note splits out what's still selling. */}
          <KV k="Left to collect">{money(total - got)} <small className="muted">({money(total - got - wait)} still selling · {num(j.qty - E.unitsDone(j, s.hour))} left)</small></KV>
          <KV k="Total for this sale">{money(total)} <small className="muted">({num(j.qty)} × {money(j.price)})</small></KV>
        </>
      })()}
    </div>
    {/* 3. Progress and actions. */}
    <div className="bar wide"><i style={{ width: `${100 * a.prog}%` }} /></div>
    <div className="row jc-acts">
      <button className="primary" disabled={p.units < 1} onClick={e => {
        const r = e.currentTarget.getBoundingClientRect()
        act(st => E.collect(st, plot))
        flyTo(r, p.kind, p.kind === 'goods' ? `+${num(p.units)} ${RES[p.res].name}` : `+${money(p.cents / 100)}`, p.kind === 'cash' ? '<span class="coin">$</span>' : '<span class="coin goods">+</span>')
      }}>{p.units < 1 ? 'Nothing ready yet' : p.kind === 'goods' ? `Collect ${num(p.units)} ${RES[p.res].name}` : `Collect ${money(p.cents / 100)}`}</button>
      <button className="danger" onClick={() => confirm(j.kind === 'make' ? 'Stop now? You keep what is made so far. Wages and used inputs are not refunded.' : 'Stop selling? You keep the money so far and unsold goods go back to the warehouse.') && act(st => E.cancelJob(st, plot))}>{j.kind === 'make' ? 'Cancel production' : 'Stop selling'}</button>
      {!ripe && <button onClick={() => act(st => E.rush(st, plot))}>Rush for {money(E.rushCost(s, bd))}</button>}
    </div>
    {/* 4. Time left, with the wall-clock finish muted underneath. */}
    <div className="jc-time">
      {ripe ? <span>Ripe. Harvest it from the plot above.</span> : <>
        <span>{dur(left)} <TurboTag on={E.boosts(j)} /></span>
        <small className="muted">Finishes at {finishAt(left)}</small>
      </>}
    </div>
  </div>
}

/** Choose a recipe and an exact amount (1..max); live preview of time, wages and inputs. */
function MakeForm({ s, plot, act }: { s: E.GameState; plot: number; act: Act }) {
  const bd = E.unitAt(s, plot)!, bt = BLD[bd.type] // plot ref: a building or a farm field
  const [res, setRes] = useState(bt.recipes![0])
  const [want, setWant] = useState(100)
  const rc = REC[res]
  const ab = bd.abund?.[res] ?? 1
  const lim = Q.maxMake(s, plot, res)
  const qty = clampQty(want, lim.max)
  const hours = E.makeHours(res, qty, bd.level, bd.type, s, ab)
  const wages = E.makeWages(bd.type, bd.level, hours, s)
  const missing = useMemo(() => Object.entries(rc.inputs).filter(([k, v]) => E.haveQty(s, k) + 1e-9 < v * qty), [s, rc, qty])
  return (
    <div className="card">
      <label>Make <select value={res} onChange={e => setRes(e.target.value)}>{bt.recipes!.map(r => <option key={r} value={r}>{RES[r].name}</option>)}</select></label>
      <QtyPicker value={qty} max={lim.max} why={lim.why} onChange={setWant} />
      <div className="preview">
        <div><span>Output</span><b><ResIcon id={res} size={16} /> {num(qty)} {RES[res].name}</b></div>
        <div><span>Time</span><b>{dur(hours)}{hours <= E.MIN_JOB_H + 1e-9 ? ' (shortest job)' : ''}</b></div>
        <div><span>Wages</span><b>{money(wages)} · {money(wages / qty)} each</b></div>
      </div>
      {bd.abund && <div className="abund">Abundance: {Object.entries(bd.abund).map(([k, v]) => <span key={k}><ResIcon id={k} size={14} /> {(v * 100).toFixed(1)}% </span>)}</div>}
      <div className="inputs">{Object.entries(rc.inputs).map(([k, v]) => (
        <span key={k} className={E.haveQty(s, k) + 1e-9 < v * qty ? 'short' : ''}><ResIcon id={k} size={16} /> {num(v * qty)} {RES[k].name} (have {num(E.haveQty(s, k))})</span>
      ))}{Object.keys(rc.inputs).length === 0 && <span className="muted">No inputs needed</span>}</div>
      <button className="primary" disabled={missing.length > 0 || lim.max < 1} onClick={() => act(st => E.startMake(st, plot, res, qty))}>Start production</button>
    </div>
  )
}

/** Public demand table: every retail good, its fair price and saturation. */
function Demand({ s }: { s: E.GameState }) {
  return (
    <table className="demand"><thead><tr><th>Good</th><th>Shop</th><th>Fair price Q0</th><th>Daily demand</th><th>Saturation</th></tr></thead>
      <tbody>{RESOURCES.filter(r => r.store).map(r => {
        const sat = s.saturation[r.id] ?? 1
        return <tr key={r.id}><td><ResIcon id={r.id} size={16} /> {r.name}</td><td>{BUILDINGS.find(b => b.store === r.store)!.name}</td>
          <td>{money(E.fairPrice(r.id, 0))}</td><td>{num(r.dailyDemand!)}</td>
          <td style={{ color: sat > 1.15 ? '#b0413e' : sat < 0.9 ? '#3c7a4a' : undefined }}>{num(sat)}×</td></tr>
      })}</tbody></table>
  )
}
