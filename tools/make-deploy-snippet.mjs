// Builds dist/deploy-snippet.js: an async arrow function for the Cloudflare
// API "execute" helper that uploads dist/worker.js as the `ledgerworks`
// Worker and enables its workers.dev URL. Used when no API token is on the box.
import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync('dist/worker.js', 'utf8')
const snippet = `async () => {
  const code = ${JSON.stringify(src)};
  const b = 'LW' + Date.now();
  const meta = { main_module: 'worker.js', compatibility_date: '2026-01-01' };
  const body = ['--'+b,'Content-Disposition: form-data; name="metadata"','Content-Type: application/json','',JSON.stringify(meta),
    '--'+b,'Content-Disposition: form-data; name="worker.js"; filename="worker.js"','Content-Type: application/javascript+module','',code,'--'+b+'--'].join('\\r\\n');
  const up = await cloudflare.request({ method:'PUT', path:'/accounts/'+accountId+'/workers/scripts/ledgerworks', body, contentType:'multipart/form-data; boundary='+b, rawBody:true });
  await cloudflare.request({ method:'POST', path:'/accounts/'+accountId+'/workers/scripts/ledgerworks/subdomain', body:{ enabled:true } });
  const sub = await cloudflare.request({ method:'GET', path:'/accounts/'+accountId+'/workers/subdomain' });
  return { ok: up.success, etag: up.result && up.result.etag, subdomain: sub.result && sub.result.subdomain };
}`
writeFileSync('dist/deploy-snippet.js', snippet)
