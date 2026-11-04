const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3990/l/mdn', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);

  // adiciona 2 itens ao carrinho
  await p.locator('.add-btn').first().click();
  await p.waitForTimeout(300);
  await p.locator('.add-btn').nth(1).click();
  await p.waitForTimeout(400);
  await p.click('#headerCartBtn');
  await p.waitForTimeout(600);
  await p.screenshot({ path: __dirname + '/shots/H1-carrinho-catalogo.png' });
  console.log('itens no carrinho:', await p.locator('[data-stepper]').count());

  // vai para o checkout
  await p.locator('[data-go-checkout]').first().click();
  await p.waitForTimeout(900);
  await p.screenshot({ path: __dirname + '/shots/H2-checkout-catalogo.png' });

  const temNome = await p.locator('#fName').count();
  const temEndereco = await p.locator('#fAddress').count();
  const temHorario = await p.locator('#fPeriod').count();
  console.log('campo nome:', temNome > 0, '| endereço:', temEndereco > 0, '| horário:', temHorario > 0);

  // preenche e envia
  await p.fill('#fName', 'Ana Paula');
  await p.fill('#fPhone', '48988887777');
  await p.fill('#fAddress', 'Rua das Flores, 120');
  await p.fill('#fNeighborhood', 'Centro');
  await p.screenshot({ path: __dirname + '/shots/H3-checkout-preenchido.png' });
  await p.click('#submitOrder');
  await p.waitForTimeout(1800);
  await p.screenshot({ path: __dirname + '/shots/H4-sucesso-catalogo.png' });
  const wa = await p.locator('#waLink').getAttribute('href').catch(() => null);
  console.log('link do WhatsApp gerado:', wa ? decodeURIComponent(wa).slice(0, 130) : 'NÃO');
  const msg = wa ? decodeURIComponent(wa).split('text=')[1] : '';
  console.log('mensagem tem endereço?', /Rua das Flores/.test(msg));
  console.log('mensagem tem total?', /Total:/.test(msg));
  console.log('erros JS:', errs.length ? errs : 'nenhum');
  await b.close();
})();
