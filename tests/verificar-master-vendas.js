/** Cards de venda das lojas no Master + resumo geral. */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3983';
const SHOT = process.env.SHOT || 'tests/shots/KY-master-vendas.png';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1100 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${BASE}/master`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const pass = p.locator('#masterPass');
  if (await pass.count()) {
    await pass.fill(process.env.MASTER || 'master123');
    await p.locator('#loginForm button[type=submit]').click();
    await p.waitForTimeout(2500);
  }
  console.log('resumo:', (await p.locator('#vendasResumo').innerText()).replace(/\n+/g, ' | '));
  const cards = await p.locator('#storesList .store').count();
  console.log('lojas:', cards);
  for (let i = 0; i < cards; i++) {
    const t = (await p.locator('#storesList .store').nth(i).innerText()).replace(/\n+/g, ' · ');
    console.log(' -', t.slice(0, 200));
  }
  await p.screenshot({ path: SHOT, fullPage: true });
  console.log('ERROS:', erros);
  await b.close();
})();
