/**
 * Confere o fluxo de pagamento "igual Mercado Livre":
 * com Mercado Pago configurado, o cliente vê o botão de pagar na página do MP
 * (crédito, débito, Pix) e o formulário do site fica escondido.
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
const LOJAS = [
  { slug: 'ageo-confeitaria', senha: 'ageo2026' },
  { slug: 'pratica-sabores', senha: 'pratica123' },
];
(async () => {
  const b = await chromium.launch();
  let erros = 0;
  for (const l of LOJAS) {
    const p = await b.newPage({ viewport: { width: 430, height: 950 } });
    p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
    await p.goto(`${B}/l/${l.slug}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2600);

    // configuração de pagamento que o site recebeu
    const cfg = await p.evaluate(async () => {
      const r = await fetch(location.pathname.replace(/\/+$/, '') + '/api/menu');
      const d = await r.json();
      return { cartao: d.pagamentos_online && d.pagamentos_online.cartao, metodos: (d.payments || []).map((x) => x.label) };
    });
    console.log(`\n== ${l.slug}`);
    console.log('   pagamentos configurados:', cfg.metodos.join(' · '));
    console.log('   mercadopago:', JSON.stringify(cfg.cartao));

    // adiciona um item e vai para o checkout
    await p.locator('.add-btn, [data-inc]').first().click().catch(() => {});
    await p.waitForTimeout(700);
    await p.locator('.cart-bar, #cartBar, button:has-text("Ver carrinho")').first().click().catch(() => {});
    await p.waitForTimeout(1200);
    await p.locator('button:has-text("Finalizar"), button:has-text("Continuar")').first().click().catch(() => {});
    await p.waitForTimeout(1500);

    // escolhe a forma "cartão"
    const opcaoCartao = p.locator('.pay-chip:has-text("artão")').first();
    if (await opcaoCartao.count()) {
      await opcaoCartao.click().catch(() => {});
      await p.waitForTimeout(1200);
    }
    const temBotaoMP = await p.locator('#mpPagarAgora').isVisible().catch(() => false);
    const formEscondido = await p.locator('#mpCardBox').isHidden().catch(() => null);
    const temEntrega = await p.locator('text=Crédito na entrega').isVisible().catch(() => false);
    console.log(`   botão "Pagar no Mercado Pago": ${temBotaoMP}`);
    console.log(`   formulário de cartão no site escondido: ${formEscondido}`);
    console.log(`   opção de cartão na entrega: ${temEntrega}`);
    if (cfg.cartao.checkout && !temBotaoMP) { erros++; console.log('   ✗ deveria ter o botão do Mercado Pago'); }
    await p.screenshot({ path: `tests/shots/pagamento-${l.slug}.png` });
    await p.close();
  }
  console.log('\nERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
