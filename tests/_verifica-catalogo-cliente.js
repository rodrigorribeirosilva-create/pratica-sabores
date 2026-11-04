/** O que o CLIENTE vê: nenhuma menção a "catálogo" na AGEO, e catálogo continua nas de catálogo. */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
const casos = [
  { slug: 'ageo-confeitaria', esperado: 'Cardápio' },
  { slug: 'pratica-sabores', esperado: 'Cardápio' },
  { slug: 'mdn-presents', esperado: 'Catálogo' },
  { slug: 'mimo-de-linha', esperado: 'Catálogo' },
];
(async () => {
  const b = await chromium.launch();
  let erros = 0;
  for (const c of casos) {
    const p = await b.newPage({ viewport: { width: 430, height: 950 } });
    p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
    await p.goto(`${B}/l/${c.slug}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    const titulo = await p.title();
    const lista = (await p.locator('#menuTitle').innerText().catch(() => '')).trim();
    const texto = (await p.locator('body').innerText()).toLowerCase();
    const temCatalogo = texto.includes('catálogo') || texto.includes('catalogo');
    const temMarmita = texto.includes('marmita');
    const okTitulo = titulo.includes(c.esperado + ' digital');
    const okLista = c.esperado === 'Catálogo' ? lista.includes('catálogo') : !lista.toLowerCase().includes('catálogo');
    const ehCardapio = c.esperado === 'Cardápio';
    const ok = okTitulo && okLista && (ehCardapio ? !temCatalogo : temCatalogo);
    if (!ok) erros++;
    console.log(`${ok ? '✓' : '✗'} ${c.slug.padEnd(18)} título="${titulo}" | lista="${lista}" | "catálogo" na página: ${temCatalogo} | "marmita": ${temMarmita}`);
    await p.close();
  }
  console.log('ERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
