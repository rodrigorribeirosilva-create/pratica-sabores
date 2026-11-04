const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  await p.goto(base + '/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  console.log('botão de montar:', await p.locator('[data-montar]').count());
  await p.locator('[data-montar]').first().click();
  await p.waitForTimeout(700);
  console.log('título:', await p.locator('#drawerTitle').innerText());
  console.log('contador inicial:', (await p.locator('.montar-contador').innerText()).replace(/\n/g, ' '));
  await p.screenshot({ path: 'tests/shots/KB-montagem-inicio.png' });

  // 4 beijinho
  for (let i = 0; i < 4; i++) { await p.locator('[data-montar-inc="Beijinho"]').click(); await p.waitForTimeout(90); }
  // 8 brigadeiro
  for (let i = 0; i < 8; i++) { await p.locator('[data-montar-inc="Brigadeiro"]').click(); await p.waitForTimeout(90); }
  await p.waitForTimeout(300);
  console.log('contador final:', (await p.locator('.montar-contador').innerText()).replace(/\n/g, ' '));
  console.log('botão:', (await p.locator('#montarAdd').innerText()).trim());
  await p.screenshot({ path: 'tests/shots/KC-montagem-completa.png' });

  // tentar passar de 12
  const bloqueou = await p.locator('[data-montar-inc="Ninho com Nutella"]').isDisabled().catch(() => false);
  console.log('travou ao chegar em 12?', bloqueou, '| (o botão não deve somar além)');

  await p.locator('#montarAdd').click();
  await p.waitForTimeout(900);
  console.log('carrinho:', (await p.locator('.drawer-body').innerText()).replace(/\n/g, ' | ').slice(0, 200));
  await p.screenshot({ path: 'tests/shots/KD-carrinho-montado.png' });

  // checkout e envio
  await p.locator('[data-go-checkout]').click();
  await p.waitForTimeout(800);
  await p.fill('input[name="customer_name"]', 'Cliente Caixa');
  await p.fill('input[name="phone"]', '48988887777');
  const retirada = p.locator('input[name="fulfillment"][value="pickup"]');
  if (await retirada.count()) await retirada.check({ force: true });
  await p.locator('input[name="payment_method"][data-pay-id="pix"]').check({ force: true });
  await p.waitForTimeout(400);
  await p.locator('#submitOrder').click();
  await p.waitForTimeout(2500);
  const sucesso = await p.locator('.drawer-body').innerText().catch(() => '');
  console.log('resultado:', sucesso.replace(/\n/g, ' | ').slice(0, 260));
  await p.screenshot({ path: 'tests/shots/KE-pedido-montado.png' });
  console.log('ERROS:', erros.length ? erros.slice(0, 5) : 0);
  await b.close();
})();
