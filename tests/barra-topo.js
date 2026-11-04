const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3976';
(async () => {
  const br = await chromium.launch();
  for (const [slug, senha, esperado] of [['pratica-sabores', 'pratica123', 'Cardápio'], ['mdn', 'mdn2026', 'Catálogo']]) {
    const ctx = await br.newContext({ viewport: { width: 430, height: 950 }, isMobile: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${BASE}/l/${slug}/admin`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#loginPass', { timeout: 30000 });
    await p.fill('#loginPass', senha);
    await p.click('#loginBtn');
    await p.waitForSelector('#navMenuLabel', { state: 'attached' });
    await p.waitForTimeout(1800);
    const info = await p.evaluate(() => {
      const barra = document.getElementById('mobBrand');
      const logo = document.getElementById('mobLogo');
      return {
        visivel: barra ? getComputedStyle(barra).display : 'sem barra',
        logo: logo ? logo.src.split('/').pop() : '',
        logoCarregou: logo ? logo.naturalWidth > 0 : false,
        nome: (document.getElementById('mobName') || {}).textContent,
        tipo: (document.getElementById('mobSegment') || {}).textContent,
        abrir: (document.getElementById('mobOpenMenu') || {}).getAttribute?.('href'),
      };
    });
    console.log(slug, '->', info, '| esperado:', esperado, '| erros:', errs.length ? errs : 'nenhum');
    await p.screenshot({ path: `${__dirname}/shots/Z-barra-${slug}.png` });
    await ctx.close();
  }
  await br.close();
})();
