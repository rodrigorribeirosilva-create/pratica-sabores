const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [slug, senha] of [['mdn', 'mdn2026'], ['pratica-sabores', 'pratica123']]) {
    const p = await b.newPage({ viewport: { width: 430, height: 900 } });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`http://localhost:3976/l/${slug}/admin`, { waitUntil: 'networkidle' });
    await p.fill('#loginPass', senha);
    await p.click('#loginBtn');
    await p.waitForSelector('#navMenuLabel', { state: 'attached' });
    await p.waitForTimeout(1200);
    const links = await p.evaluate(() => ({
      menuLateral: document.getElementById('sideMenuLink').getAttribute('href'),
      verMenu: document.getElementById('viewMenuBtn').getAttribute('href'),
    }));
    // aba pedidos (estado vazio) tem um link solto
    await p.click('.side-link[data-view="pedidos"] >> visible=true');
    await p.waitForTimeout(1000);
    const vazio = await p.evaluate(() => {
      const a = document.querySelector('#ordersList a');
      return a ? a.getAttribute('href') : 'sem link';
    });
    console.log(slug, JSON.stringify({ ...links, estadoVazio: vazio }), 'erros:', errs.length ? errs : 'nenhum');
    await p.close();
  }
  await b.close();
})();
