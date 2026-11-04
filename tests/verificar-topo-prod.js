const { chromium } = require('playwright');
const BASE = 'https://loja-digital.onrender.com';
(async () => {
  const br = await chromium.launch();
  for (const [slug, senha] of [['mdn-presents', 'mdn2026'], ['pratica-sabores', 'pratica123']]) {
    const ctx = await br.newContext({ viewport: { width: 400, height: 900 }, isMobile: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${BASE}/l/${slug}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#heroCard', { timeout: 40000 });
    await p.waitForTimeout(2000);
    const pub = await p.evaluate(() => {
      const l = document.getElementById('heroLogo');
      return {
        fotoDeCapa: !!document.querySelector('.hero-img'),
        logoNoTopo: l ? (!l.hidden && l.naturalWidth > 0) : false,
      };
    });
    await p.screenshot({ path: `${__dirname}/shots/AE-prod-topo-${slug}.png` });

    // painel: só logo (sem capa)
    await p.goto(`${BASE}/l/${slug}/admin`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loginPass', { timeout: 40000 });
    await p.fill('#loginPass', senha);
    await p.click('#loginBtn');
    await p.waitForSelector('#navMenuLabel', { state: 'attached' });
    await p.waitForTimeout(1500);
    await p.click('.side-link[data-view="config"] >> visible=true');
    await p.waitForTimeout(1200);
    const painel = await p.evaluate(() => ({ campoCapa: !!document.getElementById('coverFile'), campoLogo: !!document.getElementById('logoFile') }));
    console.log(slug, '| público:', pub, '| painel:', painel, '| erros:', errs.length ? errs : 'nenhum');
    await ctx.close();
  }
  await br.close();
})();
