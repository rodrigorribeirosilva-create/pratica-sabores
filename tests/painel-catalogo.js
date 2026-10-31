const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));

  await p.goto('http://localhost:3979/l/mdn/admin', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  console.log('titulo da aba:', await p.title());
  await p.screenshot({ path: __dirname + '/shots/I1-login-catalogo.png' });

  await p.fill('#loginPass', 'mdn2026');
  await p.click('#loginBtn');
  await p.waitForTimeout(2000);
  console.log('menu lateral:', (await p.textContent('#navMenuLabel')).trim());
  console.log('titulo da secao:', (await p.textContent('#productsTitle')).trim());
  console.log('subtitulo:', (await p.textContent('#productsSub')).trim());
  console.log('link rodape:', (await p.textContent('#sideMenuLabel')).trim());
  console.log('link do painel aponta para:', await p.getAttribute('#viewMenuBtn', 'href'));
  await p.screenshot({ path: __dirname + '/shots/I2-painel-catalogo.png' });

  // abre o formulário de produto novo
  await p.click('#newProductBtn');
  await p.waitForTimeout(500);
  console.log('placeholder nome:', await p.getAttribute('#pName', 'placeholder'));
  console.log('placeholder categoria:', await p.getAttribute('#pCategory', 'placeholder'));
  console.log('label disponibilidade:', (await p.textContent('#pActiveLabel')).trim());
  const cats = await p.locator('#categoryOptions option').evaluateAll((o) => o.map((x) => x.value));
  console.log('categorias sugeridas:', cats.join(' | '));
  await p.screenshot({ path: __dirname + '/shots/I3-form-catalogo.png' });
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(300);

  // painel da marmita continua igual
  const f = await ctx.newPage();
  await f.goto('http://localhost:3979/l/pratica-sabores/admin', { waitUntil: 'networkidle' });
  await f.waitForTimeout(800);
  await f.fill('#loginPass', 'pratica123');
  await f.click('#loginBtn');
  await f.waitForTimeout(1800);
  console.log('--- MARMITA ---');
  console.log('menu lateral:', (await f.textContent('#navMenuLabel')).trim());
  console.log('titulo da secao:', (await f.textContent('#productsTitle')).trim());
  await f.screenshot({ path: __dirname + '/shots/I4-painel-marmita.png' });

  console.log('erros JS:', errs.length ? errs : 'nenhum');
  await b.close();
})();
