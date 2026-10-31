/**
 * Prova completa, em produção, pelo caminho que o dono usa:
 *   1. celular da cliente com o cardápio aberto
 *   2. dono abre o painel, clica em editar no 1º produto e muda o preço no formulário
 *   3. o celular da cliente passa a mostrar o preço novo SEM recarregar
 *   4. reinicia o servidor (deploy)
 *   5. o preço novo continua lá
 *   6. volta ao preço original
 */
const { chromium } = require('playwright');
const BASE = 'https://loja-digital.onrender.com';
const SLUG = 'pratica-sabores', SENHA = 'pratica123';
const SID = 'srv-dbhvkcek1f9s73ecakog', RND = process.env.RND;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function precoNoAr() {
  const m = await (await fetch(`${BASE}/l/${SLUG}/api/menu`)).json();
  const p = m.products[0];
  return { nome: p.name, preco: (p.price_cents / 100).toFixed(2) };
}

async function mudaPeloPainel(novoTexto) {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 430, height: 950 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/l/${SLUG}/admin`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#loginPass', { timeout: 40000 });
  await p.fill('#loginPass', SENHA);
  await p.click('#loginBtn');
  await p.waitForSelector('#navMenuLabel', { state: 'attached', timeout: 25000 });
  await p.waitForTimeout(1800);
  // botão de editar do primeiro produto
  const lápis = await p.locator('.produto-edit, [data-edit], .p-actions button').first();
  await p.locator('[data-edit], .icon-btn').first().click().catch(async () => {
    await p.locator('.card-produto button').nth(1).click();
  });
  await p.waitForSelector('#pPrice', { state: 'visible', timeout: 15000 });
  const antes = await p.inputValue('#pPrice');
  await p.fill('#pPrice', novoTexto);
  await p.click('#productForm button[type=submit]');
  await p.waitForTimeout(2500);
  const msg = await p.locator('#toast, .toast').innerText().catch(() => '');
  await p.screenshot({ path: `${__dirname}/shots/U-painel-salvando.png` });
  await br.close();
  return { antes, msg: msg.trim() };
}

async function reiniciar() {
  const r = await fetch(`https://api.render.com/v1/services/${SID}/deploys`, {
    method: 'POST', headers: { Authorization: `Bearer ${RND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const j = await r.json();
  for (let i = 0; i < 60; i++) {
    await dormir(10000);
    const d = await (await fetch(`https://api.render.com/v1/services/${SID}/deploys/${j.id}`, { headers: { Authorization: `Bearer ${RND}` } })).json();
    if (d.status === 'live') return true;
    if (d.status === 'build_failed' || d.status === 'canceled') return false;
  }
  return false;
}

(async () => {
  console.log('1) antes:', await precoNoAr());

  // celular da cliente já com o cardápio aberto
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 400, height: 820 }, isMobile: true });
  const pc = await ctx.newPage();
  await pc.goto(`${BASE}/l/${SLUG}`, { waitUntil: 'domcontentloaded' });
  await pc.waitForSelector('.card', { timeout: 40000 });
  await pc.waitForTimeout(1000);
  console.log('   celular da cliente vê:', (await pc.locator('.card .price').first().innerText()).trim());

  console.log('2) dono muda o preço no formulário do painel para 17,50…');
  const r = await mudaPeloPainel('17,50');
  console.log('   campo estava:', r.antes, '| aviso na tela:', r.msg || '(nenhum)');

  console.log('3) esperando o celular se atualizar sozinho (até 25s)…');
  await pc.waitForTimeout(25000);
  console.log('   celular agora mostra:', (await pc.locator('.card .price').first().innerText()).trim());
  console.log('   API pública:', await precoNoAr());
  await pc.screenshot({ path: `${__dirname}/shots/U-celular-cliente.png` });
  await br.close();

  console.log('4) reiniciando o servidor…');
  const ok = await reiniciar();
  console.log('   deploy:', ok ? 'live' : 'FALHOU');
  if (ok) {
    await dormir(5000);
    console.log('5) DEPOIS do reinício:', await precoNoAr());
  }

  console.log('6) devolvendo o preço original (15,00)…');
  await mudaPeloPainel('15,00');
  await dormir(4000);
  console.log('   preço final:', await precoNoAr());
})();
