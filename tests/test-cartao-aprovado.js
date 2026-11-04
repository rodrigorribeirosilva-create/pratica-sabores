const { chromium } = require('playwright');

const FAKE_SDK = `
window.MercadoPago = function (publicKey, opts) {
  this.publicKey = publicKey;
  this.createCardToken = async function (d) {
    const num = String(d.cardNumber || '');
    window.__cards = window.__cards || [];
    window.__cards.push(d);
    if (num.endsWith('0002')) return { id: 'TOKEN-RECUSADO', payment_method_id: 'visa' };
    if (num.endsWith('0001')) return { id: 'TOKEN-OK', payment_method_id: 'visa' };
    return { id: 'TOKEN-OK', payment_method_id: 'master' };
  };
  this.getPaymentMethods = async function (o) {
    return { results: [{ id: num => num, issuer_id: '310', payment_method_id: 'visa' }].map(() => ({ id: 'visa', issuer_id: '310' })) };
  };
  this.getInstallments = async function (o) {
    const total = Number(o.amount);
    const custos = [1, 2, 3, 6].map((n) => ({
      installments: n,
      recommended_message: n + 'x de R$ ' + (total / n).toFixed(2).replace('.', ',') + (n > 1 ? ' (com juros)' : ' sem juros'),
    }));
    return [{ payment_method_id: 'visa', payer_costs: custos }];
  };
};
`;

(async () => {
  const base = 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  // SDK falso injetado antes de qualquer script da página
  await p.addInitScript(FAKE_SDK);

  await p.goto(base + '/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  async function abrirCheckout() {
    const add = p.locator('button').filter({ hasText: /adicionar|\+/i }).first();
    await add.click();
    await p.waitForTimeout(600);
    await p.locator('#cartBarBtn').click();
    await p.waitForTimeout(600);
    await p.locator('button').filter({ hasText: /finalizar|continuar|fechar pedido|ir para o pagamento/i }).first().click();
    await p.waitForTimeout(900);
    await p.fill('input[name="customer_name"]', 'Maria Teste');
    await p.fill('input[name="phone"]', '48999998888');
    const addr = p.locator('input[name="address"]');
    if (await addr.count()) await addr.first().fill('Rua das Flores 100, Centro');
    const bairro = p.locator('input[name="neighborhood"]');
    if (await bairro.count()) await bairro.first().fill('Centro');
    await p.locator('input[name="payment_method"][data-pay-id="cartao_online"]').check({ force: true });
    await p.waitForTimeout(900);
  }

  await abrirCheckout();

  console.log('formulário do cartão apareceu:', await p.locator('#mpNumero').count());
  console.log('botão mudou para:', (await p.locator('#submitLabel').innerText()).trim());
  console.log('texto do bloco:', (await p.locator('#payInfo').innerText()).split('\n').slice(0, 3).join(' | '));
  await p.locator('#payInfo').scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'tests/shots/JA-checkout-cartao.png' });

  // preenche o cartão aprovado
  await p.fill('#mpNumero', '4111111111110001');
  await p.waitForTimeout(900);
  console.log('parcelas disponíveis:', await p.locator('#mpParcelas option').evaluateAll((els) => els.map((e) => e.textContent)));
  await p.selectOption('#mpParcelas', '3');
  await p.fill('#mpNome', 'MARIA TESTE');
  await p.fill('#mpValidade', '1230');
  await p.fill('#mpCvv', '123');
  await p.fill('#mpCpf', '12345678909');
  await p.fill('#mpEmail', 'maria@teste.com');
  await p.screenshot({ path: 'tests/shots/JB-cartao-preenchido.png' });

  await p.locator('#submitOrder').click();
  await p.waitForTimeout(3000);
  const corpo = await p.locator('.drawer-body').innerText().catch(() => '');
  console.log('--- depois de pagar ---');
  console.log(corpo.replace(/\n+/g, ' | ').slice(0, 400));
  console.log('faixa de pagamento:', await p.locator('.pay-result').getAttribute('class').catch(() => 'sem faixa'));
  await p.screenshot({ path: 'tests/shots/JC-pagamento-aprovado.png' });

  console.log('ERROS:', erros.length ? erros.slice(0, 6) : 0);
  await b.close();
})();
