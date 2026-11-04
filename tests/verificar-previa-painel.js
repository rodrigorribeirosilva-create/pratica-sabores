/** Abre "Nova caixa com sabores" no painel de produção e confere a prévia (não salva). */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'https://loja-digital.onrender.com';
const SLUG = process.env.SLUG || 'ageo-confeitaria';
const SENHA = process.env.SENHA || 'ageo2026';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${BASE}/l/${SLUG}/admin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const pass = p.locator('input[type=password]').first();
  if (await pass.count()) {
    await pass.fill(SENHA);
    await p.locator('button[type=submit]').first().click().catch(() => {});
    await p.waitForTimeout(3000);
  }
  await p.click('#newBoxBtn');
  await p.waitForTimeout(700);
  await p.fill('#pMontagemUnidades', '15');
  await p.fill('#pSaboresCola', 'Prestígio, Brigadeiro, Beijinho, Ninho');
  await p.click('#pSaboresColaBtn');
  await p.waitForTimeout(500);
  console.log('prévia:\n' + (await p.locator('#pMontagemPreview').innerText()));
  await p.screenshot({ path: 'tests/shots/KT-painel-caixa-previa.png' });
  const selos = await p.locator('.p-row [class=tag]', { hasText: 'cliente escolhe' }).count();
  console.log('produtos marcados como montáveis na lista:', selos);
  await p.keyboard.press('Escape');
  console.log('ERROS:', erros);
  await b.close();
})();
