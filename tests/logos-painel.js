const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [slug, senha] of [['mdn', 'mdn2026'], ['pratica-sabores', 'pratica123']]) {
    const p = await b.newPage({ viewport: { width: 430, height: 900 } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:3976/l/${slug}/admin`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    const login = await p.evaluate(() => {
      const l = document.getElementById('loginLogo');
      return { src: l.src.slice(0, 70), visivel: l.offsetWidth > 0 };
    });
    await p.fill('#loginPass', senha);
    await p.click('#loginBtn');
    await p.waitForSelector('#navMenuLabel', { state: 'attached' });
    await p.waitForTimeout(1300);
    const dentro = await p.evaluate(() => {
      const s = document.getElementById('sideLogo');
      return { src: s.src.slice(0, 70), nome: document.getElementById('sideBusinessName').textContent };
    });
    console.log(slug, JSON.stringify({ login, dentro }), 'erros:', errs.length ? errs : 'nenhum');
    await p.screenshot({ path: `${__dirname}/shots/O-logo-${slug}.png` });
    await p.close();
  }
  await b.close();
})();
