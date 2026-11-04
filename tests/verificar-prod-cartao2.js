const { chromium } = require('playwright');
(async () => {
  const base = 'https://loja-digital.onrender.com';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  let pedidos = 0;
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('request', (r) => { if (r.method() === 'POST' && /\/api\/orders$/.test(r.url())) pedidos++; });

  await p.goto(base + '/l/mdn-presents', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  await p.locator('button').filter({ hasText: /adicionar|\+/i }).first().click();
  await p.waitForTimeout(500);
  await p.locator('#cartBarBtn').click();
  await p.waitForTimeout(500);
  await p.locator('button').filter({ hasText: /finalizar|continuar|fechar pedido|ir para o pagamento/i }).first().click();
  await p.waitForTimeout(900);
  await p.fill('input[name="customer_name"]', 'Teste Visual');
  await p.fill('input[name="phone"]', '48999990000');
  const addr = p.locator('input[name="address"]');
  if (await addr.count()) await addr.first().fill('Rua Teste 1');
  const opt = p.locator('input[name="payment_method"][data-pay-id="cartao_online"]');
  console.log('opção existe:', await opt.count());
  await opt.check({ force: true });
  await p.waitForTimeout(800);
  console.log('bloco:', JSON.stringify((await p.locator('#payInfo').innerText()).replace(/\n/g, ' | ').slice(0, 160)));
  await p.locator('#payInfo').scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'tests/shots/JP-prod-mdn-cartao.png' });
  // tentar enviar deve bloquear sem criar pedido
  await p.locator('#submitOrder').click();
  await p.waitForTimeout(1200);
  console.log('aviso:', JSON.stringify(await p.locator('.toast').first().innerText().catch(() => '(sem toast)')));
  console.log('pedidos POST enviados (deve ser 0):', pedidos);
  // volta para o Pix e confere que dá pra seguir
  await p.locator('input[name="payment_method"][data-pay-id="pix"]').check({ force: true });
  await p.waitForTimeout(600);
  console.log('botão com Pix:', (await p.locator('#submitLabel').innerText()).trim());
  console.log('ERROS:', erros.length ? erros : 0);
  await b.close();
})();
