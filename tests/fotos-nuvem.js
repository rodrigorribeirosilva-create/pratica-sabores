// Testa: upload de foto vai para a nuvem e não some.
const fs = require('fs');
const BASE = process.env.BASE || 'https://pratica-sabores.onrender.com';
const SLUG = process.env.SLUG || 'mdn-presents';
const SENHA = process.env.SENHA || 'mdn2026';
const jar = {};
function cookieHeader() { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); }
function guard(res) { const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : []; for (const c of sc) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); } return res; }
async function api(pathname, opts = {}) {
  const res = guard(await fetch(BASE + '/l/' + SLUG + pathname, { ...opts, headers: { Cookie: cookieHeader(), ...(opts.headers || {}) } }));
  const txt = await res.text();
  let json = null; try { json = JSON.parse(txt); } catch {}
  return { status: res.status, json, txt };
}
(async () => {
  const login = await fetch(`${BASE}/l/${SLUG}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() }, body: JSON.stringify({ password: SENHA }) });
  guard(login);
  if (!login.ok) return console.log('login falhou', login.status);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'teste.png');
  const up = await fetch(`${BASE}/l/${SLUG}/api/admin/upload`, { method: 'POST', headers: { Cookie: cookieHeader() }, body: fd });
  const j = await up.json();
  console.log('upload ->', up.status, j);
  if (j.url) {
    const head = await fetch(j.url);
    console.log('foto acessivel:', head.status, head.headers.get('content-type'), 'na nuvem:', j.url.includes('supabase.co'));
  }
})();
