const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 1000 }, deviceScaleFactor: 2 });
  const erros = []; p.on('pageerror', (e) => erros.push(e.message));
  await p.goto('https://loja-digital.onrender.com/l/imperio-barber', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);
  await p.locator('.card-serv-foto .cs-radio').first().click();
  await p.waitForTimeout(1800);
  console.log('cards de barbeiro:', await p.locator('#listaEquipe .card-barbeiro').count());
  const alturas = await p.locator('#listaEquipe .card-barbeiro img').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  console.log('altura das fotos:', alturas);
  await p.locator('#equipe').scrollIntoViewIfNeeded();
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'tests/shots/imperio-barbeiros-impacto.png', fullPage: false });
  console.log('ERROS:', erros.length);
  await b.close();
})();
