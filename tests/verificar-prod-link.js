const { chromium } = require('playwright');
const BASE = 'https://pratica-sabores.onrender.com';
(async () => {
  const b = await chromium.launch();
  for (const [slug, senha] of [['mdn-presents', 'mdn2026'], ['pratica-sabores', 'pratica123']]) {
    const p = await b.newPage({ viewport: { width: 430, height: 950 } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${BASE}/l/${slug}/admin`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loginPass', { timeout: 30000 });
    await p.fill('#loginPass', senha);
    await p.click('#loginBtn');
    await p.waitForSelector('#navMenuLabel', { state: 'attached', timeout: 20000 });
    await p.waitForTimeout(1400);
    await p.click('.side-link[data-view="config"] >> visible=true');
    await p.waitForTimeout(1400);
    const d = await p.evaluate(() => {
      const e = document.getElementById('menuLinkText');
      return {
        loja: (document.getElementById('linkStoreName') || {}).textContent,
        endereco: (e || {}).textContent,
        cortado: e ? e.scrollWidth > e.clientWidth + 1 : null,
        copia: (document.getElementById('menuLink') || {}).value,
        msg: decodeURIComponent((document.getElementById('waShareBtn') || {}).href || '').slice(0, 110),
      };
    });
    console.log(slug, '->', d, 'erros:', errs.length ? errs : 'nenhum');
    await p.screenshot({ path: `${__dirname}/shots/N-prod-${slug}.png` });
    await p.close();
  }
  await b.close();
})();
