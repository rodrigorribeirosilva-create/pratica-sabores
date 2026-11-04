const { chromium } = require('playwright');
(async () => {
  const base = 'https://loja-digital.onrender.com';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  await p.goto(base + '/master', { waitUntil: 'networkidle' });
  await p.fill('#masterPass', 'master123');
  await p.locator('#loginForm button[type="submit"]').click();
  await p.waitForTimeout(2500);
  await p.locator('.tab[data-tab="trafego"]').click();
  await p.waitForTimeout(2500);
  console.log('KPIs:', (await p.locator('#trafKpis').innerText()).replace(/\n/g, ' | '));
  console.log('lojas na tabela:', await p.locator('.tt-row').count());
  // criar uma campanha de exemplo em produção? não — só testa o formulário
  console.log('select de lojas:', await p.locator('#cLoja option').count());
  await p.screenshot({ path: 'tests/shots/JW-prod-trafego.png', fullPage: true });
  console.log('ERROS:', erros.length ? erros.slice(0, 4) : 0);
  await b.close();
})();
