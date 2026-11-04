const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3976';
const fs = require('fs');
const contas = [
  ['pratica-sabores', 'pratica123'],
  ['mdn-presents', 'mdn2026'],
];
(async () => {
  const br = await chromium.launch();
  for (const [slug, senha] of contas) {
    const ctx = await br.newContext({ viewport: { width: 430, height: 950 }, acceptDownloads: true });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${BASE}/l/${slug}/admin`, { waitUntil: 'networkidle' });
    await p.fill('#loginPass', senha);
    await p.click('#loginBtn');
    await p.waitForSelector('#navMenuLabel', { state: 'attached' });
    await p.waitForTimeout(1500);
    await p.click('.side-link[data-view="config"] >> visible=true');
    await p.waitForTimeout(2500);

    // o cartão foi montado no canvas?
    const info = await p.evaluate(() => {
      const img = document.getElementById('cardPreview');
      return { largura: img.naturalWidth, altura: img.naturalHeight, bytes: img.src.length };
    });
    console.log(slug, 'cartão na tela:', info);

    // baixa o arquivo
    const [down] = await Promise.all([
      p.waitForEvent('download', { timeout: 20000 }),
      p.click('#downloadCardBtn'),
    ]);
    const destino = `${__dirname}/shots/VER-${slug}.png`;
    await down.saveAs(destino);
    console.log('  arquivo baixado:', down.suggestedFilename(), fs.statSync(destino).size, 'bytes');
    console.log('  erros JS:', errs.length ? errs : 'nenhum');
    await ctx.close();
  }
  await br.close();
})();
