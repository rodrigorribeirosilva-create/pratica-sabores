const { chromium } = require('playwright');
(async () => {
  const base = 'https://loja-digital.onrender.com';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  let posts = 0;
  p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/orders$/.test(r.url())) posts++; });

  // 1) Prática: pedidos reabertos e checkout acessível
  await p.goto(base + '/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.locator('.card button').first().click();
  await p.waitForTimeout(600);
  await p.locator('#cartBarBtn').click();
  await p.waitForTimeout(700);
  const btns = await p.locator('.drawer button').evaluateAll((e) => e.map((x) => x.textContent.trim()));
  console.log('botões do carrinho:', btns.filter((t) => t.length > 2).slice(0, 5));
  await p.locator('.drawer button').filter({ hasText: /finalizar|continuar|fechar/i }).first().click();
  await p.waitForTimeout(1200);
  const formas = await p.locator('input[name="payment_method"]').evaluateAll((e) => e.map((x) => x.value));
  console.log('formas de pagamento:', formas);
  await p.locator('input[name="payment_method"][data-pay-id="cartao_online"]').check({ force: true });
  await p.waitForTimeout(800);
  console.log('aviso cartão:', JSON.stringify((await p.locator('#payInfo').innerText()).replace(/\n/g, ' ').slice(0, 120)));
  await p.screenshot({ path: 'tests/shots/JT-prod-pratica-checkout.png' });
  console.log('pedidos POST (deve ser 0):', posts);
  console.log('ERROS:', erros.length ? erros.slice(0, 4) : 0);
  await b.close();
})();
