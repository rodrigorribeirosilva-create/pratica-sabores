const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 800 } });
  await p.goto('http://localhost:3977/l/mdn/admin', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.fill('#loginPass', 'mdn2026'); await p.click('#loginBtn');
  await p.waitForTimeout(1500);
  await p.click('#newProductBtn'); await p.waitForTimeout(400);
  console.log('campo categoria vem preenchido com:', await p.inputValue('#pCategory'));
  console.log('placeholder do nome:', await p.getAttribute('#pName','placeholder'));
  await b.close();
})();
