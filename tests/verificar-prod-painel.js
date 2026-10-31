const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 900 } });
  for (const [slug, pass] of [['mdn-presents','mdn2026'], ['pratica-sabores','pratica123']]) {
    const p = await ctx.newPage();
    await p.goto(`https://pratica-sabores.onrender.com/l/${slug}/admin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await p.waitForSelector('#loginPass', { timeout: 60000 });
    await p.fill('#loginPass', pass);
    await p.click('#loginBtn');
    await p.waitForTimeout(2500);
    console.log(`\n=== ${slug} ===`);
    console.log(' menu lateral :', (await p.textContent('#navMenuLabelMobile').catch(()=>'?')).trim());
    console.log(' topo         :', (await p.textContent('#scSub').catch(()=>'?')).trim());
    console.log(' titulo secao :', (await p.textContent('#productsTitle').catch(()=>'?')).trim());
    console.log(' subtitulo    :', (await p.textContent('#productsSub').catch(()=>'?')).trim());
    await p.screenshot({ path: __dirname + `/shots/J-${slug}.png` });
    await p.close();
  }
  await b.close();
})();
