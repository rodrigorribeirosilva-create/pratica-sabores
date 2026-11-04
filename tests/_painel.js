const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 1000 } });
  await p.goto('https://loja-digital.onrender.com/l/imperio-barber/admin', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3500);
  await p.fill('#senha', 'imperio2026');
  await p.click('#btnLogin');
  await p.waitForTimeout(4000);
  const abas = await p.locator('.nav button').evaluateAll((els) => els.map((e) => e.dataset.tab + ':' + e.innerText.trim()));
  console.log('ABAS:', JSON.stringify(abas));
  const txt = await p.locator('body').innerText();
  const alvos = /henrique|ar.condicionado|climatiza|split|instala|manuten|kit|btu|higieniza/i;
  console.log('\nLINHAS SUSPEITAS:');
  txt.split('\n').filter((l) => alvos.test(l)).slice(0, 40).forEach((l) => console.log('  •', l.trim().slice(0, 110)));
  for (const t of abas) {
    await p.click(`.nav button[data-tab="${t.split(':')[0]}"]`).catch(() => {});
    await p.waitForTimeout(1500);
    const tx = await p.locator('.painel, main, body').first().innerText();
    const hits = tx.split('\n').filter((l) => alvos.test(l)).map((l) => l.trim().slice(0, 90));
    console.log(`\n[aba ${t}] suspeitas:`, hits.length ? JSON.stringify(hits.slice(0, 8)) : 'nenhuma');
  }
  await b.close();
})();
