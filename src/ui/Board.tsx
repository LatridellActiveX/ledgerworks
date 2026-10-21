// Board & goals tab: executive seats, weekly candidates, and achievements.
import * as E from '../game/engine'
import * as X from '../game/execs'
import { money } from './fmt'

type Act = (f: (st: E.GameState) => string | null | void) => void

const SK: X.Skill[] = ['ops', 'fin', 'mkt', 'tech']
const SKL: Record<X.Skill, string> = { ops: 'Ops', fin: 'Fin', mkt: 'Mkt', tech: 'Tech' }

/** Four little skill bars. */
const Skills = ({ e, hi }: { e: X.Exec; hi?: X.Skill }) => (
  <div className="skills">{SK.map(k => <span key={k} className={k === hi ? 'hi' : ''}>{SKL[k]} <b>{e.skills[k]}</b><i style={{ width: `${(e.skills[k] / 40) * 100}%` }} /></span>)}</div>
)

export function Board({ s, act }: { s: E.GameState; act: Act }) {
  const lvl = E.companyLevel(s.xp)
  const effect: Record<X.Seat, string> = {
    coo: `Overhead −${(X.overheadCut(s) * 100).toFixed(0)}%`,
    cfo: `Tax-free cash +${money(X.cashLineBonus(s))}`,
    cmo: `Shops +${((X.retailBoost(s) - 1) * 100).toFixed(0)}% faster`,
    cto: `Patent chance ×${X.techBoost(s).toFixed(2)}`,
  }
  return (
    <div className="boardtab">
      <div>
        <h4>Executive board {lvl < X.EXEC_LEVEL && <small className="muted">(unlocks at level {X.EXEC_LEVEL})</small>}</h4>
        <div className="seats">
          {X.SEATS.map(seat => {
            const e = s.execs[seat]
            return (
              <div key={seat} className="card seat">
                <b>{X.SEAT_LABEL[seat]}</b><small className="muted">{effect[seat]}</small>
                {e ? <>
                  <span className="who">{e.name} · {money(X.salary(e))}/day</span>
                  <Skills e={e} hi={X.SEAT_SKILL[seat]} />
                  <div className="row"><button onClick={() => act(st => X.train(st, seat))}>Train +1 ({money(X.trainCost(e, X.SEAT_SKILL[seat]))})</button><button className="danger" onClick={() => act(st => X.fire(st, seat))}>Let go</button></div>
                </> : <span className="muted">Empty seat</span>}
              </div>
            )
          })}
        </div>
        <h4>Candidates this week</h4>
        <div className="seats">
          {s.candidates.map(c => (
            <div key={c.id} className="card seat">
              <span className="who">{c.name}</span><small className="muted">{money(X.salary(c))}/day · signing {money(X.hireCost(c))}</small>
              <Skills e={c} />
              <div className="row">{X.SEATS.map(seat => <button key={seat} disabled={lvl < X.EXEC_LEVEL || !!s.execs[seat]} onClick={() => act(st => X.hire(st, c.id, seat, lvl))}>{seat.toUpperCase()}</button>)}</div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h4>Achievements</h4>
        <div className="achs">
          {X.ACHIEVEMENTS.map(a => {
            const got = s.ach[a.id] ?? 0, next = a.tiers[got]
            return (
              <div key={a.id} className={`ach ${got ? 'got' : ''}`}>
                <span className="medal">{got ? '★'.repeat(got) : '☆'}</span>
                <span><b>{a.name}</b> <small className="muted">{a.what}</small><br /><small>{next ? `Next: ${X.tierText(next, a.id)}` : 'All tiers done!'}</small></span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
