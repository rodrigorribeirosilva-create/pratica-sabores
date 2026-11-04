const { chromium } = require('playwright');
(async () => {
  const base = 'https://loja-digital.onrender.com';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await p.goto(base + '/l/ageo-confeitaria', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  // acha o card da caixa de 12
  const card = p.locator('.card, article').filter({ hasText: /Caixa de docinhos \(12 un\.\)/ }).first();
  await card.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  console.log('card da caixa de 12:', await card.count(), '| botão:', await card.locator('[data-montar]').innerText().catch(() => '-'));
  await p.screenshot({ path: 'tests/shots/KL-ageo-catalogo-12.png' });

  await card.locator('[data-montar]').click();
  await p.waitForTimeout(800);
  console.log('título:', await p.locator('.montar-titulo').innerText(), '|', await p.locator('.montar-sub').innerText());
  // 4 beijinho + 8 brigadeiro (exatamente o exemplo do pedido)
  for (let i = 0; i < 4; i++) { await p.locator('[data-montar-inc="Beijinho"]').click(); await p.waitForTimeout(70); }
  for (let i = 0; i < 8; i++) { await p.locator('[data-montar-inc="Brigadeiro"]').click(); await p.waitForTimeout(70); }
  await p.waitForTimeout(400);
  console.log('contador:', (await p.locator('.montar-contador').innerText()).replace(/\n/g, ' '));
  console.log('preço do botão:', (await p.locator('#montarAdd').innerText()).trim());
  await p.screenshot({ path: 'tests/shots/KM-ageo-12-montada.png' });

  await p.locator('#montarAdd').click();
  await p.waitForTimeout(900);
  console.log('carrinho:', (await p.locator('.drawer-body').innerText()).replace(/\n/g, ' | ').slice(0, 140));
  console.log('ERROS:', erros.length ? erros.slice(0, 4) : 0);
  await b.close();
})();
