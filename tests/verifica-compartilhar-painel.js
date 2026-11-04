/** Painel: botões de compartilhar (WhatsApp, Instagram, Facebook, Mais) com o link da loja. */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage({ viewport: { width: 1280, height: 950 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${B}/l/ageo-confeitaria/admin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const pass = p.locator('input[type=password]').first();
  if (await pass.count()) {
    await pass.fill('ageo2026');
    await p.locator('button[type=submit]').first().click().catch(() => {});
    await p.waitForTimeout(3500);
  }
  await p.locator('nav >> text=Configura').first().click().catch(() => {});
  await p.waitForTimeout(2500);

  const checa = (nome, ok, extra = '') => { if (!ok) erros++; console.log(`${ok ? '✓' : '✗'} ${nome} ${extra}`); };
  for (const [id, nome] of [['shareWhats', 'WhatsApp'], ['shareInstagram', 'Instagram'], ['shareFacebook', 'Facebook'], ['shareMais', 'Mais']]) {
    checa(`botão ${nome} aparece`, await p.locator('#' + id).isVisible().catch(() => false));
  }
  const link = await p.evaluate(() => document.getElementById('menuLink').value);
  checa('link da loja carregado', /\/l\/ageo-confeitaria/.test(link), link);

  const [w] = await Promise.all([p.waitForEvent('popup', { timeout: 6000 }).catch(() => null), p.locator('#shareWhats').click().catch(() => {})]);
  const wurl = w ? decodeURIComponent(w.url()) : '';
  checa('WhatsApp leva a mensagem + link', wurl.includes('ageo-confeitaria') && /AGEO/i.test(wurl));
  if (w) await w.close();

  const [f] = await Promise.all([p.waitForEvent('popup', { timeout: 6000 }).catch(() => null), p.locator('#shareFacebook').click().catch(() => {})]);
  checa('Facebook abre com o link', !!f && decodeURIComponent(f.url()).includes('ageo-confeitaria'));
  if (f) await f.close();

  const [i] = await Promise.all([p.waitForEvent('popup', { timeout: 6000 }).catch(() => null), p.locator('#shareInstagram').click().catch(() => {})]);
  checa('Instagram abre', !!i && /instagram\.com/.test(i.url()));
  if (i) await i.close();
  await p.waitForTimeout(600);
  const copiado = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  checa('link copiado para colar no Instagram', copiado.includes('/l/ageo-confeitaria'), copiado);

  console.log('\nERROS:', erros);
  await p.mouse.wheel(0, -500);
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'tests/shots/painel-compartilhar.png' });
  await b.close();
  process.exit(erros ? 1 : 0);
})();
