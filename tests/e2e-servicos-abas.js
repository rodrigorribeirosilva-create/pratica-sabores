const { chromium } = require('playwright');
const BASE = 'http://localhost:3976/l/henrique-borges';
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 400, height: 900 }, isMobile: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await p.fill('#senha', 'henrique2026');
  await p.click('#btnLogin');
  await p.waitForSelector('#app:not(.oculto)');
  await p.waitForTimeout(1500);

  for (const aba of ['agenda', 'clientes', 'equipamentos', 'servicos']) {
    await p.click(`.nav button[data-tab="${aba}"]`);
    await p.waitForTimeout(1200);
    const n = await p.locator(`#tab-${aba} .item`).count();
    console.log(aba + ':', n, 'itens');
    await p.screenshot({ path: `tests/shots/BA-${aba}.png`, fullPage: true });
  }

  // aviso de limpeza no WhatsApp
  await p.click('.nav button[data-tab="hoje"]');
  await p.waitForTimeout(1200);
  const [popup] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
    p.locator('[data-acao="lembrete"]').first().click(),
  ]);
  console.log('aviso de limpeza abriu:', popup ? popup.url().slice(0, 70) : 'nenhum');

  // resumo do dia
  const [popup2] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
    p.click('#btnResumo'),
  ]);
  console.log('resumo do dia abriu:', popup2 ? decodeURIComponent(popup2.url()).slice(0, 90) : 'nenhum');

  // dados da empresa + link
  await p.click('#btnConfig');
  await p.waitForTimeout(900);
  console.log('link público:', await p.locator('#linkPublico').innerText());
  await p.screenshot({ path: 'tests/shots/BB-empresa.png', fullPage: true });

  console.log('erros JS:', erros.length ? erros : 'nenhum');
  await br.close();
})();
