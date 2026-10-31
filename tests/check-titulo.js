const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:3995/l/essencia', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  console.log('catálogo →', await p.textContent('#menuTitle'));
  const f = await b.newPage();
  await f.goto('http://localhost:3995/l/pratica-sabores', { waitUntil: 'networkidle' });
  await f.waitForTimeout(700);
  console.log('comida  →', await f.textContent('#menuTitle'));
  await b.close();
})();
