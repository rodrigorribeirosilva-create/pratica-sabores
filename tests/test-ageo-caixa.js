const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await p.goto(base + '/l/ageo-confeitaria', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'tests/shots/KF-ageo-catalogo.png' });
  await p.locator('[data-montar]').first().click();
  await p.waitForTimeout(700);
  console.log('caixa aberta:', await p.locator('.montar-titulo').innerText(), '|', await p.locator('.montar-sub').innerText());
  // 4 beijinho + 8 brigadeiro
  for (let i = 0; i < 4; i++) { await p.locator('[data-montar-inc="Beijinho"]').click(); await p.waitForTimeout(70); }
  for (let i = 0; i < 8; i++) { await p.locator('[data-montar-inc="Brigadeiro"]').click(); await p.waitForTimeout(70); }
  await p.waitForTimeout(300);
  console.log('contador:', (await p.locator('.montar-contador').innerText()).replace(/\n/g, ' '));
  await p.screenshot({ path: 'tests/shots/KG-ageo-montagem.png' });
  await p.locator('#montarAdd').click();
  await p.waitForTimeout(900);
  console.log('carrinho:', (await p.locator('.drawer-body').innerText()).replace(/\n/g, ' | ').slice(0, 160));
  await p.locator('[data-go-checkout]').click();
  await p.waitForTimeout(800);
  await p.fill('input[name="customer_name"]', 'Cliente AGEO');
  await p.fill('input[name="phone"]', '48999997777');
  const ret = p.locator('input[name="fulfillment"][value="pickup"]');
  if (await ret.count()) await ret.check({ force: true });
  await p.locator('input[name="payment_method"][data-pay-id="pix"]').check({ force: true });
  await p.waitForTimeout(400);
  await p.locator('#submitOrder').click();
  await p.waitForTimeout(2500);
  console.log('pedido:', (await p.locator('.drawer-body').innerText()).replace(/\n/g, ' | ').slice(0, 220));
  await p.screenshot({ path: 'tests/shots/KH-ageo-pedido.png' });
  console.log('ERROS:', erros.length ? erros.slice(0, 5) : 0);
  await b.close();
})();
