const { chromium } = require('playwright');
(async () => {
  const base = 'https://loja-digital.onrender.com';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  p.on('response', (r) => { if (r.status() >= 400 && /supabase|uploads/.test(r.url())) erros.push('img ' + r.status() + ' ' + r.url().slice(0, 60)); });
  await p.goto(base + '/l/ageo-confeitaria', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  // categorias: clicar em "Docinhos" para ver as caixas
  const cats = await p.locator('#catsScroll button, .cats button').evaluateAll((e) => e.map((x) => x.textContent.trim()));
  console.log('categorias:', cats);
  const catDoces = p.locator('#catsScroll button, .cats button').filter({ hasText: /Docinhos|Todos|TODOS/i }).first();
  if (await catDoces.count()) { await catDoces.click(); await p.waitForTimeout(900); }
  const cards = await p.locator('.card, article').evaluateAll((els) =>
    els.slice(0, 12).map((e) => ({
      nome: (e.querySelector('.card-name, h3, .nome') || {}).textContent || '',
      temFoto: !!e.querySelector('img'),
      src: (e.querySelector('img') || {}).src || '',
    }))
  );
  console.log(cards.filter((c) => /docinhos|Prestígio/i.test(c.nome)));
  const alvo = p.locator('.card, article').filter({ hasText: /Caixa de docinhos \(12/ }).first();
  await alvo.scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'tests/shots/KP-ageo-catalogo-fotos.png' });
  const alvo2 = p.locator('.card, article').filter({ hasText: /Prestígio/ }).first();
  await alvo2.scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  await p.screenshot({ path: 'tests/shots/KQ-ageo-prestigio-foto.png' });
  console.log('ERROS:', erros.length ? erros.slice(0, 4) : 0);
  await b.close();
})();
