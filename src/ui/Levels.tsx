// ============================================================================
// Company level screen: opened by tapping the level bar in the HUD. Shows
// progress to the next level, the next unlock, every level's XP cost and
// unlocks (reached levels are ticked), and exactly how XP is earned.
// ============================================================================
import type { GameState } from '../game/engine'
import { levelInfo, milestones, nextUnlock, XP_SOURCES } from '../game/levels'
import { num } from './fmt'

export function LevelScreen({ s }: { s: GameState }) {
  const info = levelInfo(s.xp)
  const all = milestones()
  const next = nextUnlock(info.level, all)
  const xpNow = Math.floor(s.xp)
  return (
    <div className="lvl">
      <div className="card lvl-hero">
        <div className="lvl-badge" aria-label={`Level ${info.level}`}>
          <small>LEVEL</small>
          <b>{info.level}</b>
        </div>
        <div className="lvl-main">
          <div className="lvl-xp">{num(xpNow)} XP</div>
          <div className="lvl-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.pct)}>
            <i style={{ width: `${info.pct}%` }} />
          </div>
          <div className="lvl-sub">
            <span>{info.pct.toFixed(0)}% to level {info.level + 1}</span>
            <span>{num(Math.ceil(info.next))} XP to go</span>
          </div>
          <div className="lvl-plots">Plots: <b>{info.plots}</b> now{info.nextPlots > info.plots ? ` · ${info.nextPlots} at level ${info.level + 1}` : ' · maximum reached'}</div>
        </div>
      </div>

      {next && (
        <div className="card lvl-next">
          <small>Next unlock · level {next.level}</small>
          <b>{next.unlocks.join(' · ')}</b>
          <span className="muted">{num(Math.ceil(next.xpTotal - s.xp))} XP away</span>
        </div>
      )}

      <div className="card">
        <b>Level by level</b>
        <p className="muted lvl-note">Each level needs more XP than the last. Plots grow with your level, and new buildings, shops and systems unlock as you go.</p>
        <ol className="lvl-list">
          {all.map(m => {
            const reached = info.level >= m.level
            const current = info.level === m.level
            return (
              <li key={m.level} className={`lvl-row ${reached ? 'reached' : ''} ${current ? 'current' : ''}`}>
                <span className="lvl-dot">{reached ? '✓' : m.level}</span>
                <div className="lvl-info">
                  <div className="lvl-head">
                    <b>Level {m.level}</b>
                    <small className="muted">{m.level === 1 ? 'start' : `${num(m.xpTotal)} XP total · +${num(m.xpStep)}`} · {m.plots} plots</small>
                  </div>
                  {m.unlocks.length > 0
                    ? <ul className="lvl-unlocks">{m.unlocks.map(u => <li key={u}>{u}</li>)}</ul>
                    : <small className="muted">Nothing new</small>}
                </div>
              </li>
            )
          })}
        </ol>
      </div>

      <div className="card">
        <b>How you earn XP</b>
        {XP_SOURCES.map(x => (
          <div key={x.title} className="lvl-src">
            <div><b>{x.title}</b><small className="muted"> · {x.rate}</small></div>
            <small className="muted">{x.detail}</small>
          </div>
        ))}
        <p className="muted lvl-note">XP is never lost. Rates use the cost or revenue at the time, so bigger investments and busier shops level you faster.</p>
      </div>
    </div>
  )
}
