const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 950 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3976/l/mdn/admin', { waitUntil: 'networkidle' });
  await p.fill('#loginPass', 'mdn2026');
  await p.click('#loginForm button[type=submit]');
  await p.waitForSelector('#navMenuLabel', { state: 'attached', timeout: 15000 });
  await p.waitForTimeout(800);
  await p.click(".side-link[data-view=\"config\"] >> visible=true");
  await p.waitForTimeout(1200);
  const dados = await p.evaluate(() => ({
    linkTitulo: (document.getElementById('linkCardTitle') || {}).textContent,
    quem: (document.getElementById('linkStoreName') || {}).textContent,
    enderecoVisivel: (document.getElementById('menuLinkText') || {}).textContent,
    cortado: (() => { const e = document.getElementById('menuLinkText'); return e ? e.scrollWidth > e.clientWidth + 1 : null; })(),
    valorCopiado: (document.getElementById('menuLink') || {}).value,
    botaoAbrir: (document.getElementById('openLinkLabel') || {}).textContent,
    qrTexto: (document.getElementById('qrCaption') || {}).textContent,
    linkWhats: decodeURIComponent((document.getElementById('waShareBtn') || {}).href || '').slice(0, 140),
    baixar: (document.getElementById('qrDownload') || {}).getAttribute?.('download'),
  }));
  console.log(JSON.stringify(dados, null, 1));
  await p.screenshot({ path: __dirname + '/shots/L-config-catalogo.png', fullPage: false });
  console.log('erros JS:', errs.length ? errs : 'nenhum');
  await b.close();
})();
