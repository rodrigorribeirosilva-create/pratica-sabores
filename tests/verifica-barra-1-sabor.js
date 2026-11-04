/**
 * AGEO → seção Barras: a barra mostra os 4 sabores, mas o cliente escolhe só 1.
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
(async () => {
  const b = await chromium.launch();
  let erros = 0;
  const p = await b.newPage({ viewport: { width: 430, height: 950 } });
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${B}/l/ageo-confeitaria?cat=Barras`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);

  const rotulos = await p.locator('button:has-text("Escolher")').allInnerTexts();
  console.log('botões nos cards:', rotulos.map((t) => t.trim()).join(' | '));

  await p.locator('button:has-text("Escolher 1 sabor")').first().click().catch(() => {});
  await p.waitForTimeout(1500);

  const chips = await p.locator('.mi-chip').count();
  const texto = await p.locator('body').innerText();
  const mostra4 = chips >= 4;
  const diz1 = /escolha 1 sabor/i.test(texto);
  console.log(`${mostra4 ? '✓' : '✗'} aparecem ${chips} sabores na tela`);
  console.log(`${diz1 ? '✓' : '✗'} o texto diz "escolha 1 sabor"`);

  const primeiro = p.locator('.mi-chip').first();
  await primeiro.click();
  await p.waitForTimeout(700);
  // tenta escolher um segundo sabor
  const segundo = p.locator('.mi-chip').nth(1);
  const desabilitado = await segundo.isDisabled().catch(() => false);
  await segundo.click({ force: true }).catch(() => {});
  await p.waitForTimeout(800);
  const aviso = (await p.locator('body').innerText()).includes('leva 1 sabor só');
  const escolhidos = await p.locator('.mi-chip.on').count().catch(() => 0);
  const ok = mostra4 && diz1 && escolhidos === 1;
  if (!ok) erros++;
  console.log(`${escolhidos === 1 ? '✓' : '✗'} sabores marcados após tentar o segundo: ${escolhidos} (tem de ser 1)`);
  console.log(`   segundo chip desabilitado: ${desabilitado} | aviso na tela: ${aviso}`);
  await p.screenshot({ path: 'tests/shots/ageo-barra-4-sabores-1-escolhido.png' });
  console.log('ERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
