const { chromium } = require('playwright');
(async () => {
  const base = 'http://127.0.0.1:3978';
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  const p = await c.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(base + '/l/pratica-sabores/admin', { waitUntil: 'networkidle' });
  await p.fill('#loginPass', 'pratica123');
  await p.locator('#loginBtn').click();
  await p.waitForTimeout(2500);
  const abas = await p.locator('[data-tab], .tabs button, nav button').evaluateAll((els) => els.slice(0, 16).map((e) => (e.textContent || '').trim() || e.getAttribute('data-tab')));
  console.log('abas:', abas);
  // tenta abrir configurações
  const cfg = p.locator('[data-tab="settings"], .tabs button', { hasText: /configura/i }).first();
  if (await cfg.count()) await cfg.click();
  await p.waitForTimeout(1500);
  const bloco = p.locator('#mpStatus');
  if (await bloco.count()) {
    await bloco.scrollIntoViewIfNeeded();
    await p.waitForTimeout(500);
    console.log('status do bloco:', JSON.stringify(await bloco.innerText()));
    console.log('public key no campo:', await p.locator('#mpPublicKey').inputValue());
    console.log('placeholder do token:', await p.locator('#mpAccessToken').getAttribute('placeholder'));
    await p.screenshot({ path: 'tests/shots/JI-painel-mercadopago.png' });
    // testa conexão
    await p.locator('#mpTestarBtn').click();
    await p.waitForTimeout(2000);
    console.log('toast do teste:', JSON.stringify(await p.locator('.toast').first().innerText().catch(() => '(sem toast)')));
    await p.screenshot({ path: 'tests/shots/JJ-painel-teste-conexao.png' });
  } else {
    console.log('bloco do MP não encontrado na tela');
    await p.screenshot({ path: 'tests/shots/JI-painel-sem-bloco.png' });
  }
  console.log('ERROS:', erros.length ? erros : 0);
  await b.close();
})();
