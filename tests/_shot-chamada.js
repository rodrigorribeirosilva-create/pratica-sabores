const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
(async () => {
  const b = await chromium.launch();
  let erros = 0;
  for (const slug of ['ageo-confeitaria', 'pratica-sabores', 'mdn-presents', 'mimo-de-linha']) {
    const p = await b.newPage({ viewport: { width: 430, height: 950 } });
    p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
    await p.goto(`${B}/l/${slug}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    const visivel = await p.locator('#heroChamada').isVisible().catch(() => false);
    const txt = (await p.locator('#heroChamada').innerText().catch(() => '')).trim();
    console.log(`${slug.padEnd(18)} chamada visível: ${visivel}${visivel ? ` → "${txt}"` : ''}`);
    if (slug === 'ageo-confeitaria') await p.screenshot({ path: 'tests/shots/ageo-hero-chamada.png' });
    await p.close();
  }
  // cartão do QR da AGEO (gerado no painel)
  const a = await b.newPage({ viewport: { width: 1280, height: 950 } });
  a.on('pageerror', (e) => { console.log('ERRO JS painel:', e.message); erros++; });
  await a.goto(`${B}/l/ageo-confeitaria/admin`, { waitUntil: 'domcontentloaded' });
  await a.waitForTimeout(1600);
  const pass = a.locator('input[type=password]').first();
  if (await pass.count()) { await pass.fill('ageo2026'); await a.locator('button[type=submit]').first().click().catch(()=>{}); await a.waitForTimeout(3500); }
  await a.locator('nav >> text=Configura').first().click().catch(()=>{});
  await a.waitForTimeout(2000);
  const src = await a.locator('#cardPreview').getAttribute('src').catch(() => null);
  if (src && src.startsWith('data:image')) {
    const fs = require('fs');
    fs.writeFileSync('tests/shots/ageo-cartao-qr.png', Buffer.from(src.split(',')[1], 'base64'));
    console.log('cartão do QR salvo');
  } else console.log('cartão não encontrado');
  console.log('ERROS:', erros);
  await b.close();
})();
