/** Barra de chocolate: cliente escolhe até N sabores (sem quantidade). */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3987';
const SLUG = process.env.SLUG || 'ageo-confeitaria';
const SHOT = process.env.SHOT || 'tests/shots/KB-barra-sabores.png';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${BASE}/l/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);

  const btn = p.locator('button[data-montar]').filter({ hasText: /até/ }).first();
  console.log('botão no cardápio:', (await btn.innerText()).replace(/\n/g, ' '));
  await btn.click();
  await p.waitForTimeout(700);
  console.log('cabeçalho:', (await p.locator('.montar-sub').first().innerText()));
  console.log('contador inicial:', (await p.locator('.montar-contador').first().innerText()).replace(/\n/g, ' '));

  for (const sabor of ['Meio-amargo', 'Branco', 'Brigadeiro']) {
    await p.locator(`[data-montar-inc="${sabor}"]`).click();
    await p.waitForTimeout(250);
  }
  console.log('contador 3 sabores:', (await p.locator('.montar-contador').first().innerText()).replace(/\n/g, ' '));

  // tenta um 5º sabor (máximo é 4)
  await p.locator('[data-montar-inc="Ao leite"]').click();
  await p.waitForTimeout(250);
  await p.locator('[data-montar-inc="Ninho com Nutella"]').click().catch(() => {});
  await p.waitForTimeout(300);
  console.log('contador 4 sabores:', (await p.locator('.montar-contador').first().innerText()).replace(/\n/g, ' '));
  const travado = await p.locator('[data-montar-inc="Ninho com Nutella"]').isDisabled();
  console.log('5º sabor bloqueado:', travado);

  await p.locator('#montarAdd').click();
  await p.waitForTimeout(900);
  console.log('carrinho:', (await p.locator('.drawer-body').innerText()).replace(/\n/g, ' | ').slice(0, 220));
  await p.screenshot({ path: SHOT, fullPage: false });
  console.log('ERROS:', erros);
  await b.close();
})();
