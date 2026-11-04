const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto('https://loja-digital.onrender.com/l/ageo-confeitaria/admin', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const pass = p.locator('input[type=password]').first();
  if (await pass.count()) {
    await pass.fill('ageo2026');
    await p.locator('button[type=submit]').first().click().catch(() => {});
    await p.waitForTimeout(3000);
  }
  const loja = await p.evaluate(async () => {
    const r = await fetch('/l/ageo-confeitaria/api/admin/products');
    if (!r.ok) return { erro: r.status };
    const l = await r.json();
    return l.map((x) => `${x.id} ${x.name} R$${(x.price_cents / 100).toFixed(2)} ${x.opcoes?.sabores?.length ?? 0} sab`);
  });
  console.log(loja);
  console.log('ERROS:', erros);
  await b.close();
})();
