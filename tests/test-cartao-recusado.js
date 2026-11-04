const { chromium } = require('playwright');
const fs = require('fs');
const FAKE = fs.readFileSync('tests/test-cartao-aprovado.js', 'utf8').match(/const FAKE_SDK = `([\s\S]*?)`;/)[1];

(async () => {
  const base = 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  await p.addInitScript(FAKE);

  await p.goto(base + '/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  await p.locator('button').filter({ hasText: /adicionar|\+/i }).first().click();
  await p.waitForTimeout(500);
  await p.locator('#cartBarBtn').click();
  await p.waitForTimeout(500);
  await p.locator('button').filter({ hasText: /finalizar|continuar|fechar pedido|ir para o pagamento/i }).first().click();
  await p.waitForTimeout(800);
  await p.fill('input[name="customer_name"]', 'João Recusado');
  await p.fill('input[name="phone"]', '48988887777');
  const addr = p.locator('input[name="address"]');
  if (await addr.count()) await addr.first().fill('Rua Sem Saída 5, Centro');
  await p.locator('input[name="payment_method"][data-pay-id="cartao_online"]').check({ force: true });
  await p.waitForTimeout(800);

  // ---- cartão recusado ----
  await p.fill('#mpNumero', '5555555555550002');
  await p.waitForTimeout(700);
  await p.fill('#mpNome', 'JOAO RECUSADO');
  await p.fill('#mpValidade', '1131');
  await p.fill('#mpCvv', '999');
  await p.fill('#mpCpf', '98765432100');
  await p.locator('#submitOrder').click();
  await p.waitForTimeout(3000);
  const toast = await p.locator('.toast').innerText().catch(() => '(sem toast)');
  console.log('aviso ao cliente:', JSON.stringify(toast));
  console.log('continua no checkout:', await p.locator('#checkoutForm').count());
  await p.screenshot({ path: 'tests/shots/JD-cartao-recusado.png' });

  // ---- tenta de novo com cartão bom (não pode duplicar pedido) ----
  await p.fill('#mpNumero', '4111111111110001');
  await p.waitForTimeout(700);
  await p.locator('#submitOrder').click();
  await p.waitForTimeout(3500);
  const corpo = await p.locator('.drawer-body').innerText().catch(() => '');
  console.log('--- 2ª tentativa ---');
  console.log(corpo.replace(/\n+/g, ' | ').slice(0, 300));
  await p.screenshot({ path: 'tests/shots/JE-retentativa-aprovada.png' });

  console.log('ERROS:', erros.length ? erros.slice(0, 5) : 0);
  await b.close();
})();
