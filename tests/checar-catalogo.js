const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3978/l/mdn/admin', { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.fill('#loginPass', 'mdn2026'); await p.click('#loginBtn');
  await p.waitForTimeout(1800);
  console.log('status do topo:', (await p.textContent('#scSub')).trim());
  await p.click('#newProductBtn'); await p.waitForTimeout(400);
  const cats = await p.locator('#categoryOptions option').evaluateAll((o) => o.map((x) => x.value));
  console.log('categorias:', cats.join(' | '));
  await p.screenshot({ path: __dirname + '/shots/I5-catalogo-final.png' });
  const nomes = await p.locator('.prod-name, .produto-nome, h3').allTextContents().catch(() => []);
  console.log('erros JS:', errs.length ? errs : 'nenhum');
  await b.close();
})();
