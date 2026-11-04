const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3994/l/mdn', { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.hero-card')).backgroundColor);
  console.log('cor do topo:', bg);
  await p.screenshot({ path: __dirname + '/shots/F4-mdn-cor.png' });
  await b.close();
})();
