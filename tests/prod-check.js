const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.goto('https://loja-digital.onrender.com/l/henrique-borges', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  console.log('cards:', await p.locator('.card-serv').count());
  console.log('links admin:', await p.locator('a[href*="admin"]').count());
  console.log('texto Área da empresa:', await p.locator('text=/Área da empresa|Área do administrador/i').count());
  await p.locator('#contato').scrollIntoViewIfNeeded();
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'tests/shots/IX-prod-final-sem-link.png' });
  // clicar em AGENDAR continua indo para a agenda do serviço
  await p.locator('.card-serv .btn-agendar').first().click();
  await p.waitForTimeout(1200);
  const serv = await p.locator('#servico').inputValue().catch(()=> '?');
  const visivel = await p.locator('#cardForm').isVisible();
  console.log('serviço selecionado:', serv, '| formulário visível:', visivel);
  await p.screenshot({ path: 'tests/shots/IY-prod-agendar.png' });
  console.log('erros:', erros.length ? erros : 0);
  await b.close();
})();
