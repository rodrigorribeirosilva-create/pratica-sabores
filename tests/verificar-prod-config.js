const { chromium } = require('playwright');
const BASE = 'https://pratica-sabores.onrender.com';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 950 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/l/mdn-presents/admin`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loginPass', { timeout: 30000 });
  await p.fill('#loginPass', 'mdn2026');
  await p.click('#loginBtn');
  await p.waitForSelector('#navMenuLabel', { state: 'attached', timeout: 20000 });
  await p.waitForTimeout(1500);
  await p.click('.side-link[data-view="config"] >> visible=true');
  await p.waitForTimeout(1500);
  const d = await p.evaluate(() => ({
    linkTitulo: (document.getElementById('linkCardTitle') || {}).textContent,
    botaoAbrir: (document.getElementById('openLinkLabel') || {}).textContent,
    msgWhats: decodeURIComponent((document.getElementById('waShareBtn') || {}).href || '').slice(0, 120),
  }));
  console.log(d);
  await p.screenshot({ path: __dirname + '/shots/M-prod-mdn-config.png' });
  console.log('erros JS:', errs.length ? errs : 'nenhum');
  await b.close();
})();
