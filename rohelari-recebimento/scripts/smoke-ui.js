'use strict';
// Smoke de UI em jsdom — NÃO substitui teste visual, mas executa o JavaScript real
// do painel contra o backend real e falha se qualquer view quebrar em runtime.
// Uso: node scripts/smoke-ui.js [baseUrl]
// Requer o servidor rodando (PORT=3100 por padrão) com o banco demo.
const { JSDOM } = require('jsdom');

const BASE = process.argv[2] || process.env.BASE_URL || 'http://127.0.0.1:3100';
const PASSWORD = process.env.SMOKE_PASSWORD || 'demo12345';
const NAV_CLICK_DELAY = 700;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 8000, interval = 120) {
  const t0 = Date.now();
  for (;;) {
    try { const v = fn(); if (v) return v; } catch (_) { /* ainda não */ }
    if (Date.now() - t0 > timeout) throw new Error('waitFor timeout');
    await sleep(interval);
  }
}

function makeJarFetch() {
  let cookie = '';
  const jarFetch = async (url, opts = {}) => {
    const u = new URL(url, BASE);
    const headers = { ...(opts.headers || {}) };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(u, { ...opts, headers, redirect: 'manual' });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map(c => c.split(';')[0]).join('; ');
    return res;
  };
  return { jarFetch, hasCookie: () => !!cookie };
}

async function loadPage(path, jar, sink) {
  const html = await (await fetch(BASE + path)).text();
  const { VirtualConsole } = require('jsdom');
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const msg = String(e?.detail?.message || e?.message || e);
    if (/Not implemented: navigation/i.test(msg)) return; // redirects esperados em jsdom
    sink.errors.push(`jsdomError: ${msg}`);
  });
  vc.on('error', (m) => sink.errors.push(`console.error: ${m}`));
  const dom = new JSDOM(html, {
    url: BASE + path,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.fetch = jar.jarFetch;
      window.scrollTo = () => {};
      if (!window.matchMedia) window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.print = () => {};
      window.open = () => null;
      window.confirm = () => true;
      window.alert = () => {};
      window.addEventListener('error', (e) => sink.errors.push(`window.onerror: ${e.message}`));
      window.addEventListener('unhandledrejection', (e) => sink.errors.push(`unhandledrejection: ${e.reason?.message || e.reason}`));
    }
  });
  // aguarda o window load (todos os <script> executaram)
  await new Promise(resolve => {
    if (dom.window.document.readyState === 'complete') return resolve();
    dom.window.addEventListener('load', resolve);
    setTimeout(resolve, 8000); // fallback
  });
  await sleep(150);
  return dom;
}

async function smokeRole(email, sink) {
  const jar = makeJarFetch();

  // 1) Login real pela tela de login
  const loginDom = await loadPage('/', jar, sink);
  await waitFor(() => loginDom.window.document.querySelector('#form-login'), 5000);
  const doc = loginDom.window.document;
  doc.querySelector('#form-login [name=email]').value = email;
  doc.querySelector('#form-login [name=password]').value = PASSWORD;
  doc.querySelector('#form-login').dispatchEvent(new loginDom.window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => jar.hasCookie(), 8000);
  await sleep(300);
  loginDom.window.close();
  sink.ok.push(`login: ${email}`);

  // 2) Painel — boot completo
  const dom = await loadPage('/app.html', jar, sink);
  const win = dom.window;
  const $content = () => win.document.querySelector('#content');
  await waitFor(() => (win.document.querySelector('#userName')?.textContent || '').trim().length > 0, 10000);
  sink.ok.push(`boot: painel carregado para ${email} (${win.document.querySelector('#userRole')?.textContent})`);

  // 3) Percorrer todas as views visíveis no menu
  const navButtons = [...win.document.querySelectorAll('[data-nav]')]
    .filter(el => !el.closest('[hidden]'));
  const seen = new Set();
  for (const el of navButtons) {
    const view = el.dataset.nav;
    if (seen.has(view)) continue;
    seen.add(view);
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(NAV_CLICK_DELAY);
    const html = $content()?.innerHTML || '';
    const toasts = [...win.document.querySelectorAll('#toastRoot .toast.error')].map(t => t.textContent);
    const empty = html.replace(/<[^>]*>/g, '').trim().length;
    if (empty < 40) sink.errors.push(`view "${view}": conteúdo vazio ou não renderizou (${empty} chars)`);
    else sink.ok.push(`view ${view}: ${empty} chars`);
    for (const t of toasts) sink.errors.push(`view "${view}": toast de erro — ${t}`);
  }
  win.close();
}

(async () => {
  const sink = { ok: [], errors: [] };
  const roles = (process.env.SMOKE_ROLES || 'rede,gerente,recebimento,fornecedor').split(',').map(s => s.trim());
  const emails = {
    rede: 'rede@demo.rohelari.com.br',
    gerente: 'gerente.centro@demo.rohelari.com.br',
    recebimento: 'recebimento.centro@demo.rohelari.com.br',
    fornecedor: 'fornecedor@demo.rohelari.com.br'
  };
  for (const role of roles) {
    console.log(`\n== ${role} ==`);
    try { await smokeRole(emails[role], sink); }
    catch (e) { sink.errors.push(`${role}: ${e.message}`); }
  }
  console.log('\n== resultados ==');
  for (const line of sink.ok) console.log('  ok  -', line);
  if (sink.errors.length) {
    console.log('\nFALHAS:');
    for (const line of sink.errors) console.log('  ✗  ', line);
    process.exit(1);
  }
  console.log('\nUI smoke OK — sem erros de runtime.');
  process.exit(0);
})().catch(e => { console.error('smoke falhou:', e); process.exit(1); });
