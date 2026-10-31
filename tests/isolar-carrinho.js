const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 } }); // MESMO navegador, como um celular
  const p = await ctx.newPage();

  // 1) cardápio da marmita: coloca 2 marmitas no carrinho
  await p.goto('http://localhost:3980/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.locator('.add-btn').first().click();
  await p.waitForTimeout(200);
  await p.locator('.add-btn').first().click();
  await p.waitForTimeout(400);
  const countMenu = await p.locator('#headerCount').textContent().catch(() => '0');
  console.log('carrinho do CARDÁPIO (marmita):', countMenu);

  // 2) agora abre o CATÁLOGO da MDN no mesmo navegador
  await p.goto('http://localhost:3980/l/mdn', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const hidden = await p.locator('#headerCount').isHidden();
  const countCat = hidden ? '0 (vazio)' : await p.locator('#headerCount').textContent();
  console.log('carrinho do CATÁLOGO (MDN):', countCat);

  // 3) adiciona um perfume no catálogo
  await p.locator('.add-btn').first().click();
  await p.waitForTimeout(500);
  console.log('carrinho do catálogo depois de add:', await p.locator('#headerCount').textContent());

  // 4) volta ao cardápio: deve continuar com as 2 marmitas
  await p.goto('http://localhost:3980/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  console.log('carrinho do cardápio ao voltar:', await p.locator('#headerCount').textContent());

  // 5) titulos e icones
  console.log('titulo cardápio:', await p.title());
  const icon = await p.getAttribute('link[rel=icon]', 'href');
  console.log('icone cardápio:', icon);
  await p.goto('http://localhost:3980/l/mdn', { waitUntil: 'domcontentloaded' });
  console.log('titulo catálogo:', await p.title());
  console.log('icone catálogo:', await p.getAttribute('link[rel=icon]', 'href'));
  await b.close();
})();
