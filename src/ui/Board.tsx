// Board & goals tab: executive seats, weekly candidates, and achievements.
import * as E from '../game/engine'
import * as X from '../game/execs'

export function Board({ s, onExecs }: { s: E.GameState; onExecs: () => void }) {
  // The executive seats moved to their own screen (menu → Executives).
  const n = X.boardSize(s)
  return (
    <div className="boardtab">
      <div className="card">
        <b>Executive board</b>
        <small className="muted">{n ? `${n} of 4 seats filled.` : 'No executives hired yet.'} Hire a COO, CFO, CMO and CTO on the Executives screen.</small>
        <button onClick={onExecs}>Open Executives</button>
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
