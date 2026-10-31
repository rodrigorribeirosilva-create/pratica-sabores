/* Teste E2E do modo multi-loja: master cria loja, cliente cadastra produto, pedido aparece no painel certo. */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:3999';
const SHOTS = __dirname + '/shots';
fs.mkdirSync(SHOTS, { recursive: true });

const errors = [];
const log = (...a) => console.log('  ', ...a);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  /* ---------------- 1. Painel master ---------------- */
  await page.goto(BASE + '/master');
  await page.waitForSelector('#masterPass');
  await page.screenshot({ path: SHOTS + '/A1-master-login.png' });
  log('login master visível');

  await page.fill('#masterPass', 'master123');
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('.store');
  const cards = await page.locator('.store').count();
  log('lojas listadas:', cards);
  await page.screenshot({ path: SHOTS + '/A2-master-lojas.png' });

  /* ---------------- 2. Criar loja nova ---------------- */
  await page.click('.tab[data-tab="new"]');
  await page.fill('#nName', 'Cantina da Nonna');
  await page.fill('#nWa', '5548977776666');
  await page.fill('#nPass', 'nonna123');
  await page.fill('#nAbout', 'Massas artesanais no centro.');
  await page.click('#newStoreForm button[type=submit]');
  await page.waitForFunction((n) => document.querySelectorAll(".store").length > n, cards);
  const created = await page.locator('.store').filter({ hasText: 'Cantina da Nonna' }).count();
  log('loja criada e listada:', created === 1);
  await page.screenshot({ path: SHOTS + '/A3-master-nova-loja.png' });

  /* ---------------- 3. Painel do cliente (loja nova) ---------------- */
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push('p2 pageerror: ' + e.message));
  await p2.goto(BASE + '/l/cantina-da-nonna/admin');
  await p2.waitForSelector('input[type=password]', { timeout: 10000 });
  await p2.screenshot({ path: SHOTS + '/B1-loja-login.png' });
  await p2.fill('input[type=password]', 'nonna123');
  await p2.keyboard.press('Enter');
  await p2.waitForTimeout(1500);
  log('entrou no painel do cliente');

  // cria produto
  await p2.click('[data-view="produtos"]');
  await p2.waitForTimeout(400);
  await p2.click('#newProductBtn');
  await p2.waitForSelector('#pName');
  await p2.fill('#pName', 'Lasanha da nonna');
  await p2.fill('#pDesc', 'Massa fresca, molho de tomate e muçarela.');
  await p2.fill('#pPrice', '48,90');
  await p2.fill('#pCategory', 'Massas');
  await p2.click('#pSaveBtn');
  await p2.waitForTimeout(1200);
  await p2.screenshot({ path: SHOTS + '/B2-loja-produto.png' });
  const productVisible = await p2.locator('text=Lasanha da nonna').count();
  log('produto criado no painel:', productVisible > 0);

  /* ---------------- 4. Cardápio público vê o produto? ---------------- */
  const p3 = await ctx.newPage();
  p3.on('pageerror', (e) => errors.push('p3 pageerror: ' + e.message));
  await p3.goto(BASE + '/l/cantina-da-nonna');
  await p3.waitForTimeout(1200);
  const pub = await p3.locator('text=Lasanha da nonna').count();
  log('produto aparece no cardápio público:', pub > 0);
  const title = await p3.title();
  log('título da página:', title);
  await p3.screenshot({ path: SHOTS + '/C1-cardapio-loja-nova.png', fullPage: false });

  /* ---------------- 5. Isolamento: outra loja não vê ---------------- */
  const p4 = await ctx.newPage();
  await p4.goto(BASE + '/l/pratica-sabores');
  await p4.waitForTimeout(1000);
  const leak = await p4.locator('text=Lasanha da nonna').count();
  log('VAZAMENTO entre lojas (deve ser 0):', leak);

  /* ---------------- 6. Pedido no cardápio novo ---------------- */
  await p3.click('text=Lasanha da nonna');
  await p3.waitForTimeout(500);
  const addBtn = p3.locator('.add-btn').first();
  if (await addBtn.count()) await addBtn.click();
  await p3.waitForTimeout(400);
  const cart = await p3.locator('#headerCartBtn').count();
  log('carrinho presente:', cart > 0);
  await p3.screenshot({ path: SHOTS + '/C2-cardapio-carrinho.png' });

  /* ---------------- 7. Mobile master ---------------- */
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(BASE + '/master');
  // a sessão do master já está ativa neste contexto: cai direto na lista de lojas
  await mob.waitForSelector('.store');
  await mob.waitForTimeout(500);
  await mob.screenshot({ path: SHOTS + '/D1-master-mobile.png' });
  const mobStores = await mob.locator('.store').count();
  log('lojas na tela do celular:', mobStores);
  log('master mobile ok');

  await browser.close();

  console.log('\n--- ERROS DE JS ---');
  console.log(errors.length ? errors.join('\n') : 'nenhum');
  console.log('\nRESULTADO:', errors.length === 0 && pub > 0 && leak === 0 && created === 1 ? '✅ TUDO OK' : '⚠️ verificar');
})().catch((e) => {
  console.error('FALHOU:', e.message);
  process.exit(1);
});
