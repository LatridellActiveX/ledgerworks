// Root component. Stage 1: a simple hello screen plus the change log.
import { CHANGELOG } from './changelog'

export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 32 }}>
      <h1>Ledgerworks</h1>
      <p>Build a company, make goods, sell them. Coming soon.</p>
      <h3>Changes</h3>
      <ul>{CHANGELOG.map(c => <li key={c.id}>{c.date}: {c.title}</li>)}</ul>
    </main>
  )
}
