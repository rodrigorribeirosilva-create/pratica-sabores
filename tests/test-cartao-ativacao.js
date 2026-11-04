const { chromium } = require('playwright');

(async () => {
  const base = 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));

  await p.goto(base + '/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.locator('button').filter({ hasText: /adicionar|\+/i }).first().click();
  await p.waitForTimeout(400);
  await p.locator('#cartBarBtn').click();
  await p.waitForTimeout(400);
  await p.locator('button').filter({ hasText: /finalizar|continuar|fechar pedido|ir para o pagamento/i }).first().click();
  await p.waitForTimeout(700);
  const nota = await p.locator('input[name="payment_method"][data-pay-id="cartao_online"]').locator('..').innerText();
  console.log('nota da opção:', JSON.stringify(nota.replace(/\n/g, ' | ')));
  await p.locator('input[name="payment_method"][data-pay-id="cartao_online"]').check({ force: true });
  await p.waitForTimeout(700);
  console.log('bloco:', JSON.stringify((await p.locator('#payInfo').innerText()).replace(/\n/g, ' | ')));
  console.log('tem formulário de cartão?', await p.locator('#mpNumero').count());
  console.log('botão:', (await p.locator('#submitLabel').innerText()).trim());
  await p.screenshot({ path: 'tests/shots/JF-cartao-em-ativacao.png' });
  console.log('ERROS:', erros.length ? erros : 0);
  await b.close();
})();
