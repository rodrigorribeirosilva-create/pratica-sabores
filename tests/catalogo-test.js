const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));

  await p.goto('http://localhost:3995/l/essencia', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  console.log('título:', await p.title());
  const waBtns = await p.locator('.wa-item').count();
  console.log('botões "Pedir este no WhatsApp":', waBtns);
  const href = await p.locator('.wa-item').first().getAttribute('href');
  console.log('link do botão:', decodeURIComponent(href).slice(0, 110));
  await p.screenshot({ path: __dirname + '/shots/E1-catalogo.png' });

  // celular
  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto('http://localhost:3995/l/essencia', { waitUntil: 'networkidle' });
  await m.waitForTimeout(600);
  await m.screenshot({ path: __dirname + '/shots/E2-catalogo-celular.png' });

  // cardápio de comida continua sem o botão
  const f = await ctx.newPage();
  await f.goto('http://localhost:3995/l/pratica-sabores', { waitUntil: 'networkidle' });
  await f.waitForTimeout(600);
  console.log('botões no cardápio de comida (deve ser 0):', await f.locator('.wa-item').count());
  await f.screenshot({ path: __dirname + '/shots/E3-comida-inalterada.png' });

  console.log('erros JS:', errs.length ? errs : 'nenhum');
  await b.close();
})();
