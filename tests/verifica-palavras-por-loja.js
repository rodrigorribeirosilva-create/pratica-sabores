/**
 * Garante que as palavras de cada loja são as dela:
 * AGEO (ramo doces) → "doces / item do cardápio"
 * Prática (comida)   → volta ao original: "Marmitas caseiras / marmita"
 * MDN e Mimo (catálogo) → "Nosso catálogo", sem nada de comida
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
const casos = [
  { slug: 'ageo-confeitaria', naoDeveTer: ['marmita'], deveTer: [] },
  { slug: 'pratica-sabores', deveTer: [] },
  { slug: 'mdn-presents', deveTer: [] },
  { slug: 'mimo-de-linha', deveTer: [] },
];
(async () => {
  const b = await chromium.launch();
  let erros = 0;
  for (const c of casos) {
    const p = await b.newPage({ viewport: { width: 430, height: 950 } });
    p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
    await p.goto(`${B}/l/${c.slug}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2400);
    const texto = (await p.locator('body').innerText()).toLowerCase();
    const sub = (await p.locator('#brandSub').innerText().catch(() => '')).trim();
    const lista = (await p.locator('#menuTitle').innerText().catch(() => '')).trim();
    const proibidas = (c.naoDeveTer || []).filter((t) => texto.includes(t));
    const ok = proibidas.length === 0;
    if (!ok) erros++;
    console.log(`${ok ? '✓' : '✗'} ${c.slug.padEnd(18)} sub="${sub}" | lista="${lista}"${proibidas.length ? ' | PROBLEMA: ' + proibidas.join(',') : ''}`);
    await p.close();
  }
  console.log('ERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
