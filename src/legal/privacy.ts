// Privacy policy text, shared by the Worker's plain /privacy page and the
// in-game Privacy screen, so both always say the same thing.
//
// Every statement here was checked against the code (worker/auth.ts,
// worker/index.ts, worker/market-do.ts, src/game/*). If you change what the
// game stores, update this file in the same commit.

export const PRIVACY_EFFECTIVE = 'October 21, 2026'
export const PRIVACY_CONTACT = 'https://github.com/LatridellActiveX/ledgerworks/issues'

export interface PolicySection { h: string; p: string[] }

export const PRIVACY: PolicySection[] = [
  { h: 'Who we are', p: [
    'Ledgerworks is a free browser business game. It runs on Cloudflare Workers, and its source code is public on GitHub. This policy explains what the game stores, why, and how to delete it.',
  ] },
  { h: 'What we store on our server', p: [
    'Account (only if you create one): your username, a random salt, and a PBKDF2-SHA256 hash of your password (100,000 iterations). We never store your password itself. We also store when the account was created and which cloud save it owns.',
    'Sessions: when you sign in, your browser gets a random token in an HttpOnly cookie named lw_session that lasts 30 days. On the server we keep only a SHA-256 hash of that token, the username and the expiry time.',
    'Failed sign-ins: to stop password guessing, we count wrong passwords per username and briefly lock that username. We store the username, the number of failures and the lock time. Your IP address is not stored for this.',
    'Game saves: if you are signed in or use Cloud save, your game state is stored in a Cloudflare D1 database. That includes your company name, level, cash, buildings, stock and history, plus the time of the last save. Guest cloud saves are tied to a random ID and a secret key kept in your browser (only a hash of the key is stored). Guest cloud saves that have not been updated for 90 days are deleted automatically.',
    'Trade floor (optional): if you register on the player trade floor, we store your trader name, a hash of your trader key, your company name and value (shown on the leaderboard), and your wallet, stock, listings and offers. Other players can see your trader name, company name, company value, and your public listings and offers.',
    'Shared market: the game reports the amount of each good sold on the exchange so that prices react. These reports are added to shared totals and don\'t include your name.',
  ] },
  { h: 'What we store in your browser', p: [
    'The game uses localStorage on your device for: your save (ledgerworks-save-v1), your guest cloud ID and key (ledgerworks-cloud-id), guest mode (ledgerworks-guest), your trade floor name and key (ledgerworks-account), and settings and progress (ledgerworks-view, ledgerworks-gfx, ledgerworks-gfx-auto, ledgerworks-sound, ledgerworks-volume, ledgerworks-tutorial, ledgerworks-realm, ledgerworks-seen-log, ledgerworks-season-results). It is not sent anywhere except as described above. You can delete it by clearing site data in your browser.',
    'The only cookie is the lw_session sign-in cookie. We don\'t use any tracking or advertising cookies.',
  ] },
  { h: 'What we don\'t do', p: [
    'Ledgerworks has no ads, analytics, tracking pixels or third-party trackers, and it loads no third-party scripts. We don\'t ask for your email, real name, location or payment details. We don\'t sell, rent or share your data.',
  ] },
  { h: 'Hosting and logs', p: [
    'The game is hosted by Cloudflare, which processes each request (including your IP address) to deliver the site and protect it from attacks. Cloudflare may keep short-term logs under its own privacy policy (cloudflare.com/privacypolicy). The game\'s code does not read or store your IP address.',
  ] },
  { h: 'How long we keep data', p: [
    'Accounts, account saves and trade floor data are kept until you delete them. Guest cloud saves are deleted after 90 days without use. A session stops working after 30 days or when you log out, and expired sessions are cleared when you next sign in. A failed sign-in lock lasts at most 15 minutes, and the counter is cleared after a successful sign-in.',
  ] },
  { h: 'Deleting your data', p: [
    'Signed in: go to Menu → Settings → Delete my account and confirm with your password. This permanently deletes your account, its sessions, its cloud saves (classic and seasons) and its failed sign-in record. If this browser also holds a trade floor account, that is deleted too. Everything is then cleared from this browser.',
    'Guest: Menu → Settings → Delete my data deletes this browser\'s cloud saves and trade floor account, and clears local data. You can also delete a trade floor account at any time from the Market → Trade floor screen.',
    'If you can\'t do this yourself (for example, you forgot your password), open an issue at the contact link below. Don\'t post your password or keys there.',
  ] },
  { h: 'Children', p: [
    'Ledgerworks is not directed at children under 13, and we don\'t knowingly collect personal information from them. We don\'t ask for any personal details beyond a username. If you believe a child under 13 has made an account, tell us using the contact link and we will delete it.',
  ] },
  { h: 'Changes and contact', p: [
    'If this policy changes, we will update the effective date here and note it in the in-game change log.',
    'Questions or requests: ' + PRIVACY_CONTACT,
  ] },
]

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** Plain, readable, standalone HTML page served at /privacy. */
export function privacyHtml() {
  const body = PRIVACY.map(s => `<h2>${esc(s.h)}</h2>\n${s.p.map(p => `<p>${esc(p).replace(PRIVACY_CONTACT, `<a href="${PRIVACY_CONTACT}">${PRIVACY_CONTACT}</a>`)}</p>`).join('\n')}`).join('\n')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy policy · Ledgerworks</title><link rel="icon" href="/favicon.ico">
<style>body{font:17px/1.6 system-ui,sans-serif;max-width:46rem;margin:0 auto;padding:1.5rem 1.2rem 4rem;color:#1d2433;background:#fbfaf6}h1{margin-bottom:.2rem}h2{margin-top:2rem;font-size:1.2rem}.muted{color:#667}a{color:#1f6feb}</style></head>
<body><p><a href="/">← Back to Ledgerworks</a></p><h1>Privacy policy</h1><p class="muted">Effective ${PRIVACY_EFFECTIVE}</p>
${body}</body></html>`
}
