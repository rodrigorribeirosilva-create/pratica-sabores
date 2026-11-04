/** Testa o atalho "Nova caixa com sabores" do painel: prévia, validação e criação. */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3978';
const SLUG = process.env.SLUG || 'ageo-confeitaria';
const SENHA = process.env.SENHA || 'ageo2026';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${BASE}/l/${SLUG}/admin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  const pass = p.locator('input[type=password]').first();
  if (await pass.count()) {
    await pass.fill(SENHA);
    await p.locator('button[type=submit]').first().click().catch(() => {});
    await p.waitForTimeout(2500);
  }
  // produtos -> nova caixa
  await p.evaluate(() => [...document.querySelectorAll('nav a, nav button, [data-view]')].find((x) => /produto|cardápio|menu/i.test(x.textContent))?.click());
  await p.waitForTimeout(1200);
  await p.click('#newBoxBtn');
  await p.waitForTimeout(800);
  console.log('nome pré-preenchido:', await p.inputValue('#pName'));
  console.log('montagem ligada:', await p.isChecked('#pMontagemAtiva'), '| unidades:', await p.inputValue('#pMontagemUnidades'));

  await p.fill('#pSaboresCola', 'Beijinho, Brigadeiro, Ninho com Nutella');
  await p.click('#pSaboresColaBtn');
  await p.waitForTimeout(400);
  await p.fill('#pMontagemUnidades', '10');
  await p.waitForTimeout(300);
  console.log('prévia:', (await p.locator('#pMontagemPreview').innerText()).replace(/\n+/g, ' | '));

  // validação: um sabor só deve barrar
  await p.evaluate(() => {
    document.querySelectorAll('[data-sabor-del]').forEach((b, i) => { if (i > 0) b.click(); });
  });
  await p.waitForTimeout(300);
  await p.click('#pSaveBtn');
  await p.waitForTimeout(800);
  console.log('modal ainda aberto (barrado):', await p.isVisible('#productModal'));

  // completa e salva
  await p.fill('#pSaboresCola', 'Beijinho, Brigadeiro, Ninho com Nutella');
  await p.click('#pSaboresColaBtn');
  await p.waitForTimeout(300);
  await p.fill('#pName', 'TESTE Caixa personalizada (10 un.)');
  await p.fill('#pPrice', '37,50');
  await p.click('#pSaveBtn');
  await p.waitForTimeout(2500);

  const criado = await p.evaluate(async () => {
    const r = await fetch('/l/' + location.pathname.split('/')[2] + '/api/admin/products');
    const l = await r.json();
    return l.find((x) => x.name.startsWith('TESTE Caixa personalizada'));
  });
  console.log('criado:', criado && `${criado.id} ${criado.name} R$${(criado.price_cents / 100).toFixed(2)} · ${criado.opcoes?.unidades} un · ${criado.opcoes?.sabores?.length} sabores`);
  const badge = await p.locator('.p-row', { hasText: 'TESTE Caixa personalizada' }).innerText().catch(() => '');
  console.log('selo na lista:', badge.replace(/\n+/g, ' | '));

  if (criado) await p.evaluate((id) => fetch(`/l/${location.pathname.split('/')[2]}/api/admin/products/${id}`, { method: 'DELETE' }), criado.id);
  console.log('ERROS:', erros);
  await b.close();
})();
