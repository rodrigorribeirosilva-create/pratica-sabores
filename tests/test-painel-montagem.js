const { chromium } = require('playwright');
(async () => {
  const base = process.env.BASE || 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  await p.goto(base + '/l/ageo-confeitaria/admin', { waitUntil: 'networkidle' });
  await p.fill('#loginPass', 'ageo2026');
  await p.locator('#loginBtn').click();
  await p.waitForTimeout(2500);

  // abre a edição da primeira caixa
  const editar = p.locator('[data-edit], button[data-act="edit"]').first();
  if (await editar.count()) {
    await editar.click();
  } else {
    await p.locator('#newProductBtn').click();
  }
  await p.waitForTimeout(1200);
  console.log('checkbox montagem:', await p.locator('#pMontagemAtiva').isChecked().catch(() => 'não existe'));
  console.log('unidades:', await p.locator('#pMontagemUnidades').inputValue().catch(() => '-'));
  console.log('sabores na lista:', await p.locator('[data-sabor-nome]').count());
  const nomes = await p.locator('[data-sabor-nome]').evaluateAll((els) => els.map((e) => e.value));
  console.log('sabores:', nomes.slice(0, 8));
  await p.evaluate(() => document.getElementById('pMontagemBox')?.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'tests/shots/KI-painel-montagem.png' });

  // adiciona um sabor novo
  await p.locator('#pSaborAdd').click();
  await p.waitForTimeout(300);
  console.log('depois de adicionar, sabores:', await p.locator('[data-sabor-nome]').count());
  console.log('ERROS:', erros.length ? erros.slice(0, 4) : 0);
  await b.close();
})();
