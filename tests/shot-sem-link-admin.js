const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const prod = 'https://loja-digital.onrender.com';
  const htmlServ = fs.readFileSync('public/servicos.html', 'utf8');
  const htmlCat = fs.readFileSync('public/index.html', 'utf8');

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const erros = [];

  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await mob.newPage();
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });

  // serve o arquivo local, deixa a API ir para produção
  await p.route('**/l/henrique-borges', async route => {
    if (route.request().resourceType() === 'document') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: htmlServ });
    }
    return route.continue();
  });

  await p.goto(prod + '/l/henrique-borges', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  const linksAdmin = await p.locator('a[href*="admin"]').count();
  const txtAdmin = await p.locator('text=/Área da empresa|Área do administrador/i').count();
  const cards = await p.locator('.card-serv').count();
  const rodape = await p.locator('.rodape-info').innerText().catch(() => '');
  console.log('[servicos] cards:', cards, '| a[href*=admin]:', linksAdmin, '| texto admin:', txtAdmin);
  console.log('[servicos] rodapé:', JSON.stringify(rodape));

  await p.locator('#contato').scrollIntoViewIfNeeded();
  await p.waitForTimeout(800);
  await p.screenshot({ path: 'tests/shots/IT-sem-link-mobile.png' });

  for (let i = 0; i < 5; i++) { await p.locator('#rodapeNome').click({ force: true }); await p.waitForTimeout(130); }
  await p.waitForTimeout(2500);
  console.log('[servicos] após 5 toques, URL =', p.url());
  const temSenha = await p.locator('input[type=password]').count();
  console.log('[servicos] tela de login (campo senha):', temSenha);
  await p.screenshot({ path: 'tests/shots/IU-toques-painel.png' });

  // catálogo
  const p2 = await mob.newPage();
  p2.on('pageerror', e => erros.push('catalogo pageerror: ' + e.message));
  await p2.route('**/l/pratica-sabores', async route => {
    if (route.request().resourceType() === 'document') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: htmlCat });
    }
    return route.continue();
  });
  await p2.goto(prod + '/l/pratica-sabores', { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1500);
  console.log('[catalogo] a[href*=admin]:', await p2.locator('a[href*="admin"]').count(),
              '| texto admin:', await p2.locator('text=/Área do administrador/i').count());
  console.log('[catalogo] rodapé:', JSON.stringify(await p2.locator('.site-footer').innerText().catch(() => '')));
  await p2.locator('.site-footer').scrollIntoViewIfNeeded();
  await p2.waitForTimeout(600);
  await p2.screenshot({ path: 'tests/shots/IV-catalogo-rodape.png' });

  // desktop
  const dsk = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const p3 = await dsk.newPage();
  await p3.route('**/l/henrique-borges', async route => {
    if (route.request().resourceType() === 'document') {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: htmlServ });
    }
    return route.continue();
  });
  await p3.goto(prod + '/l/henrique-borges', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(1500);
  await p3.locator('#contato').scrollIntoViewIfNeeded();
  await p3.waitForTimeout(800);
  await p3.screenshot({ path: 'tests/shots/IW-sem-link-desktop.png' });

  console.log('ERROS:', erros.length ? erros : '0');
  await browser.close();
})();
