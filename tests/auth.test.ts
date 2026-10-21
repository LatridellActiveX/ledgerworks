// Auth helpers (worker/auth.ts): hashing, validation, rate limiting, and the
// signup/login/session flow against a tiny in-memory D1 stand-in.
import { describe, it, expect } from 'vitest'
import * as A from '../worker/auth'

/** Minimal fake D1: enough SQL for auth.ts (tables as Maps keyed by primary key). */
function fakeDB() {
  const t = { users: new Map<string, any>(), sessions: new Map<string, any>(), login_fails: new Map<string, any>(), saves: new Map<string, any>() }
  const stmt = (sql: string) => {
    let args: any[] = []
    const o = {
      bind: (...a: any[]) => { args = a; return o },
      async first() {
        if (sql.startsWith('SELECT 1 FROM users WHERE name')) return t.users.has(args[0]) ? { 1: 1 } : null
        if (sql.startsWith('SELECT 1 FROM users WHERE player_id')) return [...t.users.values()].some(u => u.player_id === args[0]) ? { 1: 1 } : null
        if (sql.startsWith('SELECT salt')) return t.users.get(args[0]) ?? null
        if (sql.startsWith('SELECT fails')) return t.login_fails.get(args[0]) ?? null
        if (sql.startsWith('SELECT token_hash FROM saves')) return t.saves.get(args[0]) ?? null
        if (sql.startsWith('SELECT u.name')) { const s = t.sessions.get(args[0]); const u = s && t.users.get(s.name); return s && u ? { name: u.name, player_id: u.player_id, expires: s.expires } : null }
        return null
      },
      async run() {
        if (sql.startsWith('INSERT INTO users')) t.users.set(args[0], { name: args[0], salt: args[1], hash: args[2], iters: args[3], player_id: args[4] })
        else if (sql.startsWith('INSERT INTO sessions')) t.sessions.set(args[0], { name: args[1], expires: args[2] })
        else if (sql.startsWith('INSERT INTO login_fails')) t.login_fails.set(args[0], { fails: args[1], until: args[2] })
        else if (sql.startsWith('DELETE FROM login_fails')) t.login_fails.delete(args[0])
        else if (sql.startsWith('DELETE FROM sessions WHERE token_hash')) t.sessions.delete(args[0])
        return {}
      },
    }
    return o
  }
  return { t, DB: { prepare: stmt, batch: async () => [] } as any }
}
const post = (op: string, body: any, cookie = '') => new Request('https://x/api/auth/' + op, { method: 'POST', body: JSON.stringify(body), headers: { cookie, 'cf-connecting-ip': '1.2.3.4' } })
const cookieFrom = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]

describe('auth helpers', () => {
  it('PBKDF2 hash is salted and deterministic', async () => {
    const a = await A.hashPassword('hunter22!', '00'.repeat(16), 1000), b = await A.hashPassword('hunter22!', '00'.repeat(16), 1000), c = await A.hashPassword('hunter22!', '11'.repeat(16), 1000)
    expect(a).toBe(b); expect(a).not.toBe(c); expect(a).toHaveLength(64)
  })
  it('validates names and passwords', () => {
    expect(A.validName('parker_1')).toBe(true); expect(A.validName('ab')).toBe(false); expect(A.validName('bad name')).toBe(false)
    expect(A.validPassword('1234567')).toBe(false); expect(A.validPassword('12345678')).toBe(true)
  })
  it('locks after 5 failures for 15 minutes, then resets', () => {
    let r: any = null; const now = 1000
    for (let i = 0; i < 4; i++) { r = A.afterFail(r, now); expect(A.isLocked(r, now)).toBe(false) }
    r = A.afterFail(r, now); expect(A.isLocked(r, now)).toBe(true); expect(A.isLocked(r, now + A.LOCK_MS + 1)).toBe(false)
    expect(A.afterFail(r, now + A.LOCK_MS + 1).fails).toBe(1)
  })
  it('constant-time compare', () => { expect(A.safeEqual('abc', 'abc')).toBe(true); expect(A.safeEqual('abc', 'abd')).toBe(false); expect(A.safeEqual('a', 'ab')).toBe(false) })
})

describe('auth flow', () => {
  it('signup -> session cookie -> me -> logout', async () => {
    const { DB, t } = fakeDB(), env = { DB }
    const r = (await A.handleAuth(post('signup', { name: 'Parker', password: 'correct horse' }), env, '/api/auth/signup'))!
    expect(r.status).toBe(200)
    const sc = r.headers.get('set-cookie')!
    expect(sc).toMatch(/HttpOnly/); expect(sc).toMatch(/Secure/); expect(sc).toMatch(/SameSite=Lax/)
    expect(t.users.get('parker').hash).not.toContain('correct') // never plain
    const cookie = cookieFrom(r)
    expect([...t.sessions.keys()][0]).not.toBe(cookie.split('=')[1]) // stored hashed
    const me = await A.sessionUser(new Request('https://x/', { headers: { cookie } }), env)
    expect(me?.name).toBe('parker')
    await A.handleAuth(post('logout', {}, cookie), env, '/api/auth/logout')
    expect(await A.sessionUser(new Request('https://x/', { headers: { cookie } }), env)).toBeNull()
  })
  it('duplicate names are refused; wrong passwords rate-limited', async () => {
    const { DB } = fakeDB(), env = { DB }
    await A.handleAuth(post('signup', { name: 'ann', password: 'password1' }), env, '/api/auth/signup')
    expect((await A.handleAuth(post('signup', { name: 'ANN', password: 'password2' }), env, '/api/auth/signup'))!.status).toBe(409)
    for (let i = 0; i < 5; i++) expect((await A.handleAuth(post('login', { name: 'ann', password: 'nope' }), env, '/api/auth/login'))!.status).toBe(401)
    expect((await A.handleAuth(post('login', { name: 'ann', password: 'password1' }), env, '/api/auth/login'))!.status).toBe(429)
  }, 30000)
  it('guest / legacy cloud key upgrade takes over the save only with the right token', async () => {
    const { DB, t } = fakeDB(), env = { DB }
    t.saves.set('abcdef0123456789', { token_hash: await A.sha256('tok') })
    expect((await A.handleAuth(post('signup', { name: 'bob', password: 'password1', cloudId: 'abcdef0123456789', cloudToken: 'bad' }), env, '/api/auth/signup'))!.status).toBe(403)
    expect((await A.handleAuth(post('signup', { name: 'bob', password: 'password1', cloudId: 'abcdef0123456789', cloudToken: 'tok' }), env, '/api/auth/signup'))!.status).toBe(200)
    expect(t.users.get('bob').player_id).toBe('abcdef0123456789')
    const ok = await A.handleAuth(post('login', { name: 'bob', password: 'password1' }), env, '/api/auth/login')
    expect(ok!.status).toBe(200)
  }, 30000)
})
