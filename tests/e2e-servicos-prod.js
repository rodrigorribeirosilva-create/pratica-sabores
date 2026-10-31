const { chromium } = require('playwright');
const BASE = 'https://loja-digital.onrender.com/l/henrique-borges';
(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 400, height: 900 }, isMobile: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('PUB ' + e.message));
  await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await p.waitForTimeout(2500);
  console.log('serviços na página:', await p.locator('#listaServicos .srv').count());
  await p.screenshot({ path: 'tests/shots/BC-prod-servicos.png' });

  // agenda como cliente
  await p.fill('#nome', 'Vanessa Maria da Silva');
  await p.fill('#telefone', '(44) 99911-2233');
  await p.fill('#endereco', 'Rua das Palmeiras, 245 - apto 32');
  await p.fill('#bairro', 'Centro');
  await p.selectOption('#servico_id', { index: 2 });
  await p.fill('#equip_marca', 'Samsung');
  await p.fill('#equip_ambiente', 'quarto');
  await p.fill('#data', new Date(Date.now() + 172800000).toISOString().slice(0, 10));
  await p.fill('#obs_cliente', 'Ar pingando água.');
  await p.click('#btnEnviar');
  await p.waitForSelector('#okBox:not(.oculto)', { state: 'visible', timeout: 20000 });
  console.log('pedido pelo site: OK');
  await p.screenshot({ path: 'tests/shots/BD-prod-ok.png', fullPage: true });

  // painel
  const a = await ctx.newPage();
  a.on('pageerror', (e) => erros.push('ADM ' + e.message));
  await a.goto(BASE + '/admin', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await a.fill('#senha', 'henrique2026');
  await a.click('#btnLogin');
  await a.waitForSelector('#app:not(.oculto)', { timeout: 20000 });
  await a.waitForTimeout(2000);
  const p2 = await a.evaluate(() => fetch(location.pathname.replace(/\/admin$/, '') + '/api/admin/painel', { credentials: 'same-origin' }).then((r) => r.json()));
  console.log('painel → pedidos novos:', p2.novos.length, '| clientes:', p2.resumo.clientes, '| aparelhos:', p2.resumo.equipamentos);
  console.log('cliente:', p2.novos[0].cliente_nome, '|', p2.novos[0].servico_nome, '|', p2.novos[0].data);
  await a.screenshot({ path: 'tests/shots/BE-prod-painel.png', fullPage: true });
  console.log('erros JS:', erros.length ? erros : 'nenhum');
  await br.close();
})();
