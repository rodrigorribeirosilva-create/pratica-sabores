const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  await p.goto('https://pratica-sabores.onrender.com/master', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForSelector('#masterPass', { timeout: 90000 });
  await p.fill('#masterPass', 'master123');
  await p.click('#loginForm button[type=submit]');
  await p.waitForSelector('.store', { timeout: 60000 });
  await p.waitForTimeout(800);
  await p.screenshot({ path: __dirname + '/shots/P1-master-producao.png' });
  console.log('lojas:', await p.locator('.store').count());

  // celular
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto('https://pratica-sabores.onrender.com/master', { waitUntil: 'domcontentloaded' });
  await m.waitForSelector('.store', { timeout: 60000 });
  await m.waitForTimeout(500);
  await m.screenshot({ path: __dirname + '/shots/P2-master-producao-celular.png' });
  await b.close();
})();
