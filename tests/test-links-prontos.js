const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(base + '/master', { waitUntil: 'networkidle' });
  await p.fill('#masterPass', 'master123');
  await p.locator('#loginForm button[type="submit"]').click();
  await p.waitForTimeout(2000);
  await p.locator('.tab[data-tab="trafego"]').click();
  await p.waitForTimeout(2500);
  console.log('lojas com links:', await p.locator('.lk-loja').count());
  console.log('blocos de link:', await p.locator('.lk-item').count());
  const primeiro = await p.locator('.lk-item code').first().innerText();
  console.log('exemplo:', primeiro);
  // copiar
  await p.locator('[data-copy-link]').first().click();
  await p.waitForTimeout(400);
  const copiado = await p.evaluate(() => navigator.clipboard.readText().catch(() => 'sem clipboard'));
  console.log('copiado:', copiado.slice(0, 70));
  await p.evaluate(() => document.querySelector('#trafLinks').scrollIntoView({ block: 'start' }));
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'tests/shots/JX-links-prontos.png' });
  console.log('ERROS:', erros.length ? erros : 0);
  await b.close();
})();
