// ============================================================================
// Executives screen (menu → Executives).
//
// One full screen for the four executive seats:
//  - A summary card of every active bonus (what your board is doing for you
//    right now, and the hourly salary bill).
//  - One card per seat (COO, CFO, CMO, CTO) with an original drawn portrait,
//    the person in the seat, their skill level (stars), salary per hour and
//    per day, and Train / Let go buttons.
//  - Today's candidates: a small pool that changes every game day. Each card
//    suggests the seat that fits them best and has a Hire button per seat.
// All game rules live in game/execs.ts; this file only shows them.
// ============================================================================
import * as E from '../game/engine'
import * as X from '../game/execs'
import * as M from '../game/market'
import { money } from './fmt'

type Act = (f: (st: E.GameState) => string | null | void) => void

/** Plain-language role names for each seat. */
const ROLE: Record<X.Seat, string> = { coo: 'COO', cfo: 'CFO', cmo: 'CMO', cto: 'CTO' }
/** Seat colors, taken from the game's palette (clay, teal, gold, slate). */
const TINT: Record<X.Seat, string> = { coo: '#e07a5f', cfo: '#3d9970', cmo: '#f2b84b', cto: '#5b6ea8' }

/**
 * Original drawn portrait for a seat: a simple bust (head, hair, shoulders)
 * on a colored disc, with one prop per role so they read at a glance:
 * COO a clipboard, CFO a coin, CMO a megaphone, CTO a gear.
 */
export function Portrait({ seat, size = 56, empty = false }: { seat: X.Seat; size?: number; empty?: boolean }) {
  const c = TINT[seat]
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="exec-portrait">
      <circle cx="32" cy="32" r="31" fill={c} opacity={empty ? 0.25 : 0.9} />
      <circle cx="32" cy="32" r="27" fill="#fdf6ec" opacity={empty ? 0.6 : 0.95} />
      {/* Shoulders / jacket in the seat color, with a white collar. */}
      <path d="M12 60c2-12 10-17 20-17s18 5 20 17z" fill={empty ? '#c9c2b8' : c} />
      <path d="M27 44l5 7 5-7z" fill="#fff" />
      {/* Head and hair (a different hairstyle per seat). */}
      <circle cx="32" cy="30" r="10" fill={empty ? '#ddd6cc' : '#f0c8a0'} />
      {!empty && seat === 'coo' && <path d="M22 28c0-8 6-11 10-11s10 3 10 11c-3-3-7-4-10-4s-7 1-10 4z" fill="#5a3b2e" />}
      {!empty && seat === 'cfo' && <path d="M22 29c-1-9 5-12 10-12s11 3 10 12l-2-5c-4 1-11 1-16 0z" fill="#2f2a26" />}
      {!empty && seat === 'cmo' && <path d="M21 32c-2-11 5-15 11-15s13 4 11 15c-1-4-3-7-5-8-4 2-9 2-13 0-2 1-3 4-4 8z" fill="#a8452f" />}
      {!empty && seat === 'cto' && <path d="M22 27c1-7 5-10 10-10s9 3 10 10c-6-2-14-2-20 0z" fill="#7b7f86" />}
      {/* Eyes and a small smile. */}
      {!empty && <><circle cx="28.5" cy="31" r="1.2" fill="#3d405b" /><circle cx="35.5" cy="31" r="1.2" fill="#3d405b" /><path d="M29 35q3 2 6 0" stroke="#3d405b" strokeWidth="1.2" fill="none" strokeLinecap="round" /></>}
      {/* Role prop, bottom right. */}
      {!empty && seat === 'coo' && <g transform="translate(42 42)"><rect width="13" height="16" rx="2" fill="#fff" stroke="#3d405b" strokeWidth="1.2" /><rect x="4" y="-2" width="5" height="4" rx="1" fill="#3d405b" /><path d="M3 6h7M3 9h7M3 12h5" stroke={c} strokeWidth="1.3" /></g>}
      {!empty && seat === 'cfo' && <g transform="translate(49 50)"><circle r="8" fill="#f2b84b" stroke="#a87b16" strokeWidth="1.5" /><path d="M0-4v8M-2.5-2.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4" stroke="#7a560c" strokeWidth="1.3" fill="none" /></g>}
      {!empty && seat === 'cmo' && <g transform="translate(40 44)"><path d="M2 6l12-6v16L2 10z" fill="#fff" stroke="#3d405b" strokeWidth="1.2" /><rect x="-1" y="5" width="4" height="6" rx="1" fill="#3d405b" /><path d="M17 4l3-2M17 8h4M17 12l3 2" stroke="#3d405b" strokeWidth="1.2" strokeLinecap="round" /></g>}
      {!empty && seat === 'cto' && <g transform="translate(49 50)"><circle r="7" fill="#fff" stroke="#3d405b" strokeWidth="1.3" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <rect key={a} x="-1.5" y="-10" width="3" height="4" fill="#3d405b" transform={`rotate(${a})`} />)}<circle r="2.5" fill={c} /></g>}
    </svg>
  )
}

/** One to five stars for a skill level. */
const Stars = ({ n }: { n: number }) => <span className="exec-stars" aria-label={`Skill level ${n} of 5`}>{'★'.repeat(n)}<i>{'★'.repeat(5 - n)}</i></span>

/** What a seat does, with the current size of the bonus. */
function bonusText(s: E.GameState, seat: X.Seat): string {
  switch (seat) {
    case 'coo': return `Overhead −${(X.overheadCut(s) * 100).toFixed(0)}%`
    case 'cfo': return `Exchange fees −${((1 - X.feeMult(s)) * 100).toFixed(0)}% (sell fee ${(M.feeRate(s) * 100).toFixed(2)}%) · tax-free cash +${money(X.cashLineBonus(s))}`
    case 'cmo': return `Shops sell +${((X.retailBoost(s) - 1) * 100).toFixed(0)}% faster`
    case 'cto': return `Research +${((X.techBoost(s) - 1) * 100).toFixed(0)}% patent chance`
  }
}
/** Short role description for empty seats. */
const ROLE_HELP: Record<X.Seat, string> = {
  coo: 'Runs operations: cuts the admin overhead of your buildings.',
  cfo: 'Runs the money: lowers Exchange and broker fees.',
  cmo: 'Runs marketing: your shops sell faster.',
  cto: 'Runs the labs: research turns into patents faster.',
}

export function Executives({ s, act }: { s: E.GameState; act: Act }) {
  const lvl = E.companyLevel(s.xp)
  const locked = lvl < X.EXEC_LEVEL
  const hourly = X.hourlySalaries(s)
  const active = X.SEATS.filter(x => s.execs?.[x])
  return (
    <div className="execs">
      {/* Summary of active bonuses. */}
      <section className="card exec-sum">
        <b>Your board</b>
        {locked && <small className="muted">Executives unlock at company level {X.EXEC_LEVEL} (you are level {lvl}).</small>}
        {active.length ? <ul>{active.map(x => <li key={x}><span className="dot" style={{ background: TINT[x] }} />{bonusText(s, x)}</li>)}</ul>
          : <small className="muted">No executives yet. Hire one below; each seat helps a different part of the company. Board members also lend a quarter of their other skills to the rest of the board.</small>}
        {hourly > 0 && <small>Salaries: <b>{money(hourly)}/h</b> ({money(X.dailySalaries(s))}/day), charged every hour, also while you are away.</small>}
      </section>

      {/* The four seats. */}
      <div className="exec-seats">
        {X.SEATS.map(seat => {
          const e = s.execs?.[seat]
          return (
            <div key={seat} className="card exec-card">
              <Portrait seat={seat} empty={!e} />
              <div className="exec-info">
                <b>{ROLE[seat]} · {X.SEAT_LABEL[seat]}</b>
                {e ? <>
                  <span>{e.name} <Stars n={X.skillLevel(e, seat)} /></span>
                  <small className="muted">{money(X.salary(e) / 24)}/h · {bonusText(s, seat)}</small>
                  <div className="row">
                    <button disabled={e.skills[X.SEAT_SKILL[seat]] >= 40} onClick={() => act(st => X.train(st, seat))}>Train +1 ({money(X.trainCost(e, X.SEAT_SKILL[seat]))})</button>
                    <button className="danger" onClick={() => { if (confirm(`Let ${e.name} go? The signing bonus is not refunded.`)) act(st => X.fire(st, seat)) }}>Let go</button>
                  </div>
                </> : <small className="muted">Empty seat. {ROLE_HELP[seat]}</small>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Today's candidates. */}
      <h4>Candidates today <small className="muted">· a new group arrives every day at midnight</small></h4>
      <div className="exec-seats">
        {s.candidates.length === 0 && <small className="muted">Everyone today has been hired. New candidates arrive at midnight.</small>}
        {s.candidates.map(c => {
          const best = X.bestSeat(c)
          return (
            <div key={c.id} className="card exec-card">
              <Portrait seat={best} />
              <div className="exec-info">
                <b>{c.name}</b>
                <span>Best as {ROLE[best]} <Stars n={X.skillLevel(c, best)} /></span>
                <small className="muted">{money(X.salary(c) / 24)}/h · signing {money(X.hireCost(c))} · Ops {c.skills.ops} · Fin {c.skills.fin} · Mkt {c.skills.mkt} · Tech {c.skills.tech}</small>
                <div className="row">{X.SEATS.map(seat => (
                  <button key={seat} className={seat === best ? 'primary' : ''} disabled={locked || !!s.execs?.[seat] || s.cash < X.hireCost(c)}
                    title={s.execs?.[seat] ? 'Seat is taken' : undefined}
                    onClick={() => act(st => X.hire(st, c.id, seat, lvl))}>Hire as {ROLE[seat]}</button>
                ))}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
