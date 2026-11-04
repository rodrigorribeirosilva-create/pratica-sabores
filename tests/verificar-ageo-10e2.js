/** Cliente monta a caixa de 12 com 10 de um sabor e 2 de outro (produção). */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'https://loja-digital.onrender.com';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 900 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${BASE}/l/ageo-confeitaria`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  const card = p.locator('.card', { hasText: 'Caixa de docinhos (12 un.)' }).first();
  await card.locator('button', { hasText: /Escolher sabores/i }).click();
  await p.waitForTimeout(800);
  for (let i = 0; i < 10; i++) await p.locator('[data-montar-inc="Beijinho"]').click();
  await p.waitForTimeout(300);
  for (let i = 0; i < 2; i++) await p.locator('[data-montar-inc="Brigadeiro"]').click();
  await p.waitForTimeout(500);
  const painel = await p.evaluate(() => document.body.innerText);
  console.log('contador:', (painel.match(/Tudo certo[^\n]*/i) || painel.match(/faltam?[^\n]*/i) || ['?'])[0]);
  const soma = await p.evaluate(() => [...document.querySelectorAll('[data-montar-inc]')].map((b) => {
    const nome = b.dataset.montarInc;
    const n = b.parentElement.querySelector('span,strong,input')?.textContent || b.parentElement.innerText;
    return nome + '=' + String(n).replace(/\s+/g, ' ').trim();
  }));
  console.log('linhas:', soma.join(' | '));
  await p.screenshot({ path: 'tests/shots/KS-ageo-10e2.png' });
  const cta = p.locator('button', { hasText: /Adicionar ao carrinho/i }).last();
  console.log('botão:', (await cta.innerText()).replace(/\n/g, ' '));
  await cta.click();
  await p.waitForTimeout(900);
  console.log('carrinho:', (await p.locator('.drawer-body').innerText()).replace(/\n/g, ' | ').slice(0, 260));
  console.log('ERROS:', erros);
  await b.close();
})();
