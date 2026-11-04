/**
 * No Master, cada loja tem de aparecer com o próprio rótulo:
 * AGEO e Prática → cardápio | MDN e Mimo → catálogo | Henrique → agendamento
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
const ESPERADO = {
  'Prática Sabores': 'cardápio',
  'AGEO Confeitaria': 'cardápio',
  'MDN Presents': 'catálogo',
  'Mimo de Linha': 'catálogo',
};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 1500 } });
  let erros = [];
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${B}/master`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const pass = p.locator('#masterPass');
  if (await pass.count()) {
    await pass.fill('master123');
    await p.locator('#loginForm button[type=submit]').click().catch(() => {});
    await p.waitForTimeout(4000);
  }
  const txt = await p.locator('body').innerText();
  for (const [nome, esperado] of Object.entries(ESPERADO)) {
    const i = txt.indexOf(nome);
    const bloco = txt.slice(i, i + 320);
    const linhas = bloco.split('\n').map((l) => l.trim());
    const outro = esperado === 'cardápio' ? 'catálogo' : 'cardápio';
    const temCerto = linhas.includes(esperado);
    const temErrado =
      linhas.some((l) => l.startsWith(`Copiar link do ${outro}`)) ||
      linhas.some((l) => l === `Ver ${outro}`) ||
      linhas.some((l) => l.startsWith(`Mandar ${outro}`));
    const ok = temCerto && !temErrado;
    if (!ok) erros++;
    console.log(`${ok ? '✓' : '✗'} ${nome.padEnd(20)} deveria ser "${esperado}"`);
  }
  console.log("ERROS:", erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
