/**
 * Teste de fumaça da interface (Playwright).
 * Uso: node tests/ui-test.js   (com o servidor rodando em localhost:3000)
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3000';

const errors = [];
const shot = async (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  /* ---------------- 1. cardápio (mobile) ---------------- */
  const mobile = await browser.newContext({ ...devices['iPhone 12'] });
  const page = await mobile.newPage();
  page.on('pageerror', (e) => errors.push(`[menu] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[menu console] ${m.text()}`));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card');
  await shot(page, '01-cardapio-mobile');

  const cards = await page.locator('.card').count();
  console.log('produtos visíveis no cardápio:', cards);

  // adiciona 2x frango + 1x carne
  await page.locator('.card', { hasText: 'Marmita de frango' }).locator('[data-inc]').click();
  await page.locator('.card', { hasText: 'Marmita de frango' }).locator('[data-inc]').click();
  await page.locator('.card', { hasText: 'Marmita de carne' }).locator('[data-inc]').click();
  await page.waitForTimeout(300);
  console.log('barra do carrinho:', (await page.locator('#cartBarTotal').textContent()).trim());
  await shot(page, '02-carrinho-bar');

  await page.locator('#cartBarBtn').click();
  await page.waitForTimeout(400);
  await shot(page, '03-carrinho-aberto');
  const drawerTotal = (await page.locator('.summary-line.total').last().textContent()).replace(/\s+/g, ' ');
  console.log('total no carrinho:', drawerTotal);

  await page.locator('[data-go-checkout]').click();
  await page.waitForTimeout(400);
  await page.fill('#fName', 'João');
  await page.fill('#fPhone', '48988887777');
  await page.fill('#fAddress', 'Rua das Palmeiras, 120');
  await page.fill('#fNeighborhood', 'Centro');
  await page.fill('#fComplement', 'Apto 302');
  await page.fill('#fNotes', 'Sem cebola, por favor.');
  await shot(page, '04-checkout');
  await page.locator('#fPhone').scrollIntoViewIfNeeded();
  await shot(page, '05-checkout-final');

  // impede abrir nova aba do WhatsApp
  await mobile.route('https://wa.me/**', (r) => r.abort());
  await page.locator('#submitOrder').click();
  await page.waitForSelector('.success', { timeout: 8000 });
  await shot(page, '06-sucesso');
  console.log('código do pedido:', (await page.locator('.order-box .code').textContent()).trim());
  console.log('link WhatsApp gerado:', await page.locator('#waLink').getAttribute('href'));

  /* ---------------- 2. painel (desktop) ---------------- */
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const admin = await desk.newPage();
  admin.on('pageerror', (e) => errors.push(`[admin] ${e.message}`));
  admin.on('console', (m) => m.type() === 'error' && errors.push(`[admin console] ${m.text()}`));

  await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await shot(admin, '07-login');
  await admin.fill('#loginPass', 'pratica123');
  await admin.click('#loginBtn');
  await admin.waitForSelector('#view-produtos:not([hidden])');
  await admin.waitForTimeout(600);
  await shot(admin, '08-admin-produtos');

  // cria produto
  await admin.click('#newProductBtn');
  await admin.waitForTimeout(250);
  const NEW_NAME = `Marmita vegetariana ${String(Date.now()).slice(-4)}`;
  await admin.fill('#pName', NEW_NAME);
  await admin.fill('#pPrice', '26,50');
  await admin.fill('#pCategory', 'Vegetariana');
  await admin.fill('#pDesc', 'Grão-de-bico, arroz integral, legumes assados e salada.');
  await admin.fill('#pOrder', '4');
  await shot(admin, '09-modal-produto');
  await admin.click('#pSaveBtn');
  await admin.waitForTimeout(900);
  const hasNew = await admin.locator('.p-row', { hasText: NEW_NAME }).count();
  console.log('produto criado aparece na lista:', hasNew === 1);

  // verifica se apareceu no cardápio público
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const publicHas = await page.locator('.card', { hasText: NEW_NAME }).count();
  console.log('produto novo já no cardápio público:', publicHas === 1);

  // edita preço
  await admin.locator('.p-row', { hasText: NEW_NAME }).locator('[data-edit]').click();
  await admin.waitForTimeout(250);
  await admin.fill('#pPrice', '29,90');
  await admin.click('#pSaveBtn');
  await admin.waitForTimeout(900);
  const priceText = await admin.locator('.p-row', { hasText: NEW_NAME }).locator('.p-price').textContent();
  console.log('preço após edição:', priceText.trim());

  // oculta produto
  await admin.locator('.p-row', { hasText: NEW_NAME }).locator('.switch .track').click();
  await admin.waitForTimeout(800);
  await page.reload({ waitUntil: 'networkidle' });
  const hiddenOnMenu = await page.locator('.card', { hasText: NEW_NAME }).count();
  console.log('produto oculto sumiu do cardápio:', hiddenOnMenu === 0);

  // pedidos
  await admin.click('[data-view="pedidos"]');
  await admin.waitForTimeout(900);
  await shot(admin, '10-admin-pedidos');

  // configurações
  await admin.click('[data-view="config"]');
  await admin.waitForTimeout(900);
  await shot(admin, '11-admin-config');
  await admin.locator('.qr-wrap').scrollIntoViewIfNeeded();
  await shot(admin, '12-admin-qr');

  // salva alteração de taxa de entrega
  await admin.fill('#dFee', '8,00');
  await admin.locator('#formDelivery button[type="submit"]').click();
  await admin.waitForTimeout(900);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.card', { hasText: 'Marmita de frango' }).locator('[data-inc]').click();
  await page.waitForTimeout(300);
  console.log('taxa nova refletida no cardápio:', (await page.locator('#cartBarTotal').textContent()).trim());

  // volta taxa para 7
  await admin.fill('#dFee', '7,00');
  await admin.locator('#formDelivery button[type="submit"]').click();
  await admin.waitForTimeout(600);

  // exclui produto de teste
  await admin.click('[data-view="produtos"]');
  await admin.waitForTimeout(600);
  await admin.locator('.p-row', { hasText: NEW_NAME }).first().locator('[data-del]').click();
  await admin.waitForTimeout(300);
  await admin.click('#confirmYes');
  await admin.waitForTimeout(900);
  const removed = await admin.locator('.p-row', { hasText: NEW_NAME }).count();
  console.log('produto excluído:', removed === 0);

  // viewport mobile do painel
  const adminMobile = await browser.newContext({ ...devices['iPhone 12'] });
  const ap = await adminMobile.newPage();
  await ap.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await ap.fill('#loginPass', 'pratica123');
  await ap.click('#loginBtn');
  await ap.waitForSelector('#view-produtos:not([hidden])');
  await ap.waitForTimeout(700);
  await shot(ap, '13-admin-mobile');

  await browser.close();

  console.log('\n=== erros de JS ===');
  console.log(errors.length ? errors.join('\n') : 'nenhum 🎉');
})();
