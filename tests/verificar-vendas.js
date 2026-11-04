/** Confere a aba Vendas do painel: dia, semana, mês, itens e mais vendidos. */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:3980';
const SLUG = process.env.SLUG || 'ageo-confeitaria';
const SENHA = process.env.SENHA || 'ageo2026';
const SHOT = process.env.SHOT || 'tests/shots/KU-painel-vendas.png';

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 1200 } });
  let erros = 0;
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(`${BASE}/l/${SLUG}/admin`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const pass = p.locator('input[type=password]').first();
  if (await pass.count()) {
    await pass.fill(SENHA);
    await p.locator('button[type=submit]').first().click().catch(() => {});
    await p.waitForTimeout(2500);
  }
  await p.locator('.side-link[data-view=vendas]').first().click();
  await p.waitForTimeout(1500);
  const ler = async () => (await p.locator('#vendasCards').innerText()).replace(/\n+/g, ' | ');
  console.log('HOJE  :', await ler());
  await p.locator('#vendasPeriodo [data-periodo=week]').click();
  await p.waitForTimeout(400);
  console.log('7 DIAS:', await ler());
  await p.locator('#vendasPeriodo [data-periodo=month]').click();
  await p.waitForTimeout(400);
  console.log('MÊS   :', await ler());
  console.log('mais vendidos:', (await p.locator('#maisVendidos').innerText()).split('\n').slice(0, 6).join(' | '));
  const barras = await p.locator('#grafico14 > div').count();
  console.log('barras no gráfico:', barras);
  await p.screenshot({ path: SHOT, fullPage: true });
  console.log('ERROS:', erros);
  await b.close();
})();
