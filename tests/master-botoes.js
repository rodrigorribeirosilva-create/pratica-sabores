const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:3976/master', { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  await p.fill('#masterPass', 'master123');
  await p.click('#loginForm button[type=submit]');
  await p.waitForSelector('.store');
  await p.waitForTimeout(600);
  const cards = await p.locator('.store').evaluateAll((els) =>
    els.map((e) => ({
      nome: e.querySelector('.sname').textContent.trim().split(' ')[0],
      botoes: Array.from(e.querySelectorAll('.actions .btn')).slice(0, 2).map((b) => b.textContent.trim()),
    }))
  );
  console.log(JSON.stringify(cards, null, 1));
  await p.screenshot({ path: __dirname + '/shots/K-master-botoes.png' });
  console.log('erros JS:', errs.length ? errs : 'nenhum');
  await b.close();
})();
