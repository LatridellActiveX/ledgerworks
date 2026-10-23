// ============================================================================
// Market news screen ("LW Business Live", a modern live news feed; was the
// "Ledger Gazette" newspaper until Oct 2026). New stories reach you as bell notifications.
//
// Shows the stories running today (see src/game/news.ts), a "Rumor" for the
// story that starts tomorrow so you can stock up a day early, and the stories
// of the past week. Day numbers are shown 1-based, like the event log. Each story lists the goods it moves with their icons,
// the effect on shop sales (+40% / -25%), how many you hold, and when it ends.
//
// UX idea borrowed from Offworld Trading Company's event pop-ups and
// Capitalism Lab's news reports; the live-feed look, words and art are ours.
// ============================================================================
import * as E from '../game/engine'
import * as N from '../game/news'
import { RES } from '../game/data'
import { GoodArt } from './goodart'
import { num } from './fmt'

/** "+40%" / "-25%" for a multiplier. */
const pct = (m: number) => `${m >= 1 ? '+' : '−'}${Math.round(Math.abs(m - 1) * 100)}%`

/** One story card. `kind` changes the label and colours. */
function Story({ s, st, kind, day }: { s: E.GameState; st: N.NewsStory; kind: 'lead' | 'live' | 'rumor' | 'past'; day: number }) {
  const up = st.t.mult >= 1
  const left = st.endDay - day // whole days until it ends
  const when = kind === 'rumor' ? 'Starts tomorrow' : kind === 'past' ? `Day ${st.startDay + 1}–${st.endDay}` : left <= 1 ? 'Ends today' : `${left} days left`
  return (
    <article className={`nw-story nw-${kind} ${up ? 'nw-up' : 'nw-down'}`}>
      <div className="nw-top">
        <span className="nw-pic" aria-hidden>{st.t.icon}</span>
        <div>
          <small className="nw-tag">{kind === 'rumor' ? 'Rumor' : kind === 'past' ? 'Earlier' : 'Breaking'} · {when}</small>
          <h3>{st.t.headline}</h3>
          <p>{st.t.blurb}</p>
        </div>
        <b className="nw-eff">{pct(st.t.mult)}</b>
      </div>
      {kind !== 'past' && <ul className="nw-goods">
        {st.t.goods.map(g => {
          const have = E.haveQty(s, g)
          return <li key={g} title={RES[g].name}>
            <GoodArt id={g} size={34} />
            <span>{RES[g].name}</span>
            <small>{have > 0 ? `📦 ${num(have)}` : '—'}</small>
          </li>
        })}
      </ul>}
    </article>
  )
}

export function News({ s }: { s: E.GameState }) {
  const day = N.dayOf(s.hour)
  const live = N.activeStories(day)
  const rum = N.rumor(day)
  const past = N.pastStories(day)
  return (
    <div className="nw">
      {/* Header: live-feed brand with a pulsing LIVE badge, day number and a one-line summary. */}
      <header className="nw-mast">
        <small>Day {day + 1} · {live.length ? `${live.length} ${live.length === 1 ? 'story' : 'stories'} moving markets` : 'Quiet markets'}</small>
        <h2><span className="nw-live">● LIVE</span> LW Business Live</h2>
        <div className="nw-rule" />
      </header>
      <p className="muted nw-help">News changes how fast shops sell the goods in a story (and, playing offline, nudges their market price). Stock up before a boom; hold back during a slump.</p>
      {live.length === 0 && <p className="nw-quiet">No market news today. Prices and demand are normal.</p>}
      {live.map((st, i) => <Story key={st.t.id + st.startDay} s={s} st={st} kind={i === 0 ? 'lead' : 'live'} day={day} />)}
      {rum && <Story s={s} st={rum} kind="rumor" day={day} />}
      {past.length > 0 && <h4 className="nw-sec">Earlier this week · feed archive</h4>}
      {past.map(st => <Story key={st.t.id + st.startDay} s={s} st={st} kind="past" day={day} />)}
    </div>
  )
}
