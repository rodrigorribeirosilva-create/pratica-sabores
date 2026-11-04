/** Confere em quais lojas o recurso "Cliente escolhe os sabores" aparece no painel. */
const { chromium } = require('playwright');
const B = process.env.BASE || 'https://loja-digital.onrender.com';
const casos = [
  { slug: 'mdn-presents', senha: 'mdn2026', esperado: false, nome: 'MDN (perfumes)' },
  { slug: 'ageo-confeitaria', senha: 'ageo2026', esperado: true, nome: 'AGEO (doces)' },
  { slug: 'pratica-sabores', senha: 'pratica123', esperado: true, nome: 'Prática (marmitas)' },
  { slug: 'mimo-de-linha', senha: 'mimo2026', esperado: false, nome: 'Mimo (laços)' },
];
(async () => {
  const b = await chromium.launch();
  let erros = 0;
  for (const c of casos) {
    const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
    p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
    await p.goto(`${B}/l/${c.slug}/admin`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1800);
    const pass = p.locator('input[type=password]').first();
    if (await pass.count()) {
      await pass.fill(c.senha);
      await p.locator('button[type=submit]').first().click().catch(() => {});
      await p.waitForTimeout(3000);
    }
    await p.locator('button[aria-label*="ditar"], button:has-text("Editar")').first().click().catch(async () => {
      await p.locator('.p-row button, tr button').nth(1).click().catch(() => {});
    });
    await p.waitForTimeout(1200);
    const visivel = await p.locator('#pMontagemWrap').isVisible().catch(() => false);
    const botaoCaixa = await p.locator('#newBoxBtn').isVisible().catch(() => false);
    const ok = visivel === c.esperado && botaoCaixa === c.esperado;
    console.log(`${ok ? '✓' : '✗'} ${c.nome.padEnd(20)} bloco sabores: ${visivel} | botão nova caixa: ${botaoCaixa}`);
    if (!ok) erros++;
    if (c.slug === 'mdn-presents') await p.screenshot({ path: 'tests/shots/KO-mdn-sem-sabores.png' });
    await p.close();
  }
  console.log('ERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
