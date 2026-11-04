const { chromium } = require('playwright');
const BASE = 'http://localhost:3976/l/henrique-borges';

(async () => {
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 400, height: 900 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push('PÚBLICO: ' + e.message));

  // ---------- 1) cliente agenda pelo link ----------
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'tests/shots/AT-servicos-topo.png' });
  const servicos = await p.locator('#listaServicos .srv').count();
  console.log('serviços listados:', servicos);

  await p.fill('#nome', 'Vanessa Maria da Silva');
  await p.fill('#telefone', '(44) 99911-2233');
  await p.fill('#endereco', 'Rua das Palmeiras, 245 - apto 32');
  await p.fill('#bairro', 'Centro');
  await p.selectOption('#servico_id', { index: 2 }); // limpeza
  await p.fill('#equip_marca', 'Samsung');
  await p.fill('#equip_ambiente', 'quarto');
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await p.fill('#data', amanha);
  await p.selectOption('#periodo', 'Manhã');
  await p.fill('#obs_cliente', 'O ar está pingando água e fazendo barulho.');
  await p.locator('#btnEnviar').scrollIntoViewIfNeeded();
  await p.screenshot({ path: 'tests/shots/AU-servicos-form.png', fullPage: true });
  await p.click('#btnEnviar');
  await p.waitForSelector('#okBox:not(.oculto)', { state: 'visible', timeout: 10000 });
  const zap = await p.getAttribute('#btnZap', 'href');
  console.log('agendou:', (await p.locator('#okBox').innerText()).includes('Pedido enviado'));
  console.log('whatsapp da empresa:', decodeURIComponent(zap).slice(0, 60));
  await p.screenshot({ path: 'tests/shots/AV-servicos-ok.png', fullPage: true });

  // ---------- 2) painel da empresa ----------
  const adm = await ctx.newPage();
  adm.on('pageerror', (e) => erros.push('PAINEL: ' + e.message));
  await adm.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await adm.waitForTimeout(800);
  const temLogin = await adm.locator('#login:not(.off)').count();
  console.log('pediu senha:', temLogin === 1);
  await adm.screenshot({ path: 'tests/shots/AW-painel-login.png' });
  await adm.fill('#senha', 'henrique2026');
  await adm.click('#btnLogin');
  await adm.waitForSelector('#app:not(.oculto)', { timeout: 10000 });
  await adm.waitForTimeout(1500);

  const painel = await adm.evaluate(() => fetch(location.pathname.replace(/\/admin$/, '') + '/api/admin/painel', { credentials: 'same-origin' }).then((r) => r.json()));
  console.log('novos pedidos:', painel.novos.length, '| hoje:', painel.hoje_lista.length);
  console.log('cliente:', painel.novos[0] && painel.novos[0].cliente_nome, '| serviço:', painel.novos[0] && painel.novos[0].servico_nome);
  await adm.screenshot({ path: 'tests/shots/AX-painel-hoje.png', fullPage: true });

  // confirma o dia (solicitado → agendado)
  await adm.locator('[data-acao="agendar"]').first().click();
  await adm.waitForSelector('#backdrop.on');
  await adm.screenshot({ path: 'tests/shots/AY-painel-agendar.png' });
  await adm.click('#sheetSalvar');
  await adm.waitForTimeout(1800);
  const p2 = await adm.evaluate(() => fetch(location.pathname.replace(/\/admin$/, '') + '/api/admin/painel', { credentials: 'same-origin' }).then((r) => r.json()));
  console.log('depois de confirmar → novos:', p2.novos.length, '| hoje:', p2.hoje_lista.length);

  // concluir o serviço → deve gerar próxima limpeza
  const idAg = p2.hoje_lista[0] ? p2.hoje_lista[0].id : (p2.proximos[0] && p2.proximos[0].id);
  adm.on('dialog', (d) => d.accept());
  await adm.locator('[data-acao="concluido"]').first().click();
  await adm.waitForTimeout(2000);
  const eqs = await adm.evaluate(() => fetch(location.pathname.replace(/\/admin$/, '') + '/api/admin/equipamentos', { credentials: 'same-origin' }).then((r) => r.json()));
  console.log('aparelhos:', eqs.length, '| próxima limpeza gerada:', eqs[0] && eqs[0].prox_limpeza);
  await adm.screenshot({ path: 'tests/shots/AZ-painel-depois.png', fullPage: true });

  console.log('erros JS:', erros.length ? erros : 'nenhum');
  await br.close();
})();
