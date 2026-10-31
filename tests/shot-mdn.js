const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto('https://pratica-sabores.onrender.com/l/mdn-presents', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: __dirname + '/shots/F1-mdn-desktop.png' });

  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 900 });
  await m.goto('https://pratica-sabores.onrender.com/l/mdn-presents', { waitUntil: 'domcontentloaded' });
  await m.waitForTimeout(1200);
  await m.screenshot({ path: __dirname + '/shots/F2-mdn-celular.png' });

  const d = await ctx.newPage();
  await d.setViewportSize({ width: 1280, height: 900 });
  await d.goto('https://pratica-sabores.onrender.com/l/mdn-presents/admin', { waitUntil: 'domcontentloaded' });
  await d.waitForTimeout(1200);
  await d.screenshot({ path: __dirname + '/shots/F3-mdn-painel.png' });
  await b.close();
  console.log('prints ok');
})();
