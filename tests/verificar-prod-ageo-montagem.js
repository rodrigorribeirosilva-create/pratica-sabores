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
  console.log('produtos montáveis:', await p.locator('[data-montar]').count());
  const precos = await p.locator('.card .price, .preco').evaluateAll((els) => els.slice(0, 4).map((e) => e.textContent.trim()));
  console.log('preços na tela:', precos);
  await p.locator('[data-montar]').first().click();
  await p.waitForTimeout(800);
  console.log('caixa:', await p.locator('.montar-titulo').innerText(), '|', await p.locator('.montar-sub').innerText());
  for (let i = 0; i < 2; i++) { await p.locator('[data-montar-inc="Pistache"]').click(); await p.waitForTimeout(80); }
  for (let i = 0; i < 2; i++) { await p.locator('[data-montar-inc="Ao leite"]').click(); await p.waitForTimeout(80); }
  await p.waitForTimeout(300);
  console.log('contador:', (await p.locator('.montar-contador').innerText()).replace(/\n/g, ' '));
  console.log('botão:', (await p.locator('#montarAdd').innerText()).trim());
  await p.screenshot({ path: 'tests/shots/KJ-prod-ageo-montagem.png' });
  await p.locator('#montarAdd').click();
  await p.waitForTimeout(900);
  console.log('carrinho:', (await p.locator('.drawer-body').innerText()).replace(/\n/g, ' | ').slice(0, 150));
  await p.screenshot({ path: 'tests/shots/KK-prod-ageo-carrinho.png' });
  console.log('ERROS:', erros.length ? erros.slice(0, 4) : 0);
  await b.close();
})();
