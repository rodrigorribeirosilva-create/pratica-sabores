/** Agenda do barbeiro abre embaixo da foto, com horários e cadastro do cliente.
 *  Fluxo obrigatório da loja: serviço -> barbeiro -> horário -> nome+WhatsApp -> pagamento.
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com/l/imperio-barber';
const ADM = B + '/api/admin';
let erros = 0;
const checa = (n, ok, extra = '') => { if (!ok) erros++; console.log(`${ok ? '✓' : '✗'} ${n} ${extra}`); };

/** apaga do painel os agendamentos criados pelo teste (não deixa lixo na loja) */
async function limpar(nome) {
  const l = await fetch(ADM + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'imperio2026' }),
  });
  const cookie = (l.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  const ago = await (await fetch(ADM + '/agendamentos?status=todos', { headers: { cookie } })).json();
  for (const a of ago.filter((x) => (x.cliente_nome || '') === nome)) {
    await fetch(ADM + '/agendamentos/' + a.id, { method: 'DELETE', headers: { cookie } });
  }
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(B, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  // 1) serviço primeiro (o fluxo da loja começa por aqui)
  await p.locator('.card-serv-foto .cs-radio').first().click();
  await p.waitForTimeout(1200);
  checa('serviço escolhido aparece no topo da agenda', await p.locator('#servicoEscolhidoTopo').isVisible());

  // 2) barbeiro
  await p.locator('.card-barbeiro').first().click();
  await p.waitForTimeout(2000);
  checa('agenda abre logo abaixo das fotos', await p.locator('#agendaInline').isVisible());
  const topo = await p.locator('#equipe').boundingBox();
  const painel = await p.locator('#agendaInline').boundingBox();
  const cards = await p.locator('.card-barbeiro').all();
  const ultimo = (await cards[cards.length - 1].boundingBox()).y;
  checa('agenda abre logo DEPOIS dos cards de barbeiro', painel.y > ultimo - 60, `${Math.round(painel.y - topo.y)}px abaixo do topo da equipe`);
  const dist = await p.evaluate(() => Math.abs(window.scrollY - (document.getElementById('equipe').offsetTop || 0)));
  checa('continua na seção do barbeiro (sem pular para o fim)', dist < 900, `dist=${Math.round(dist)}`);
  const dias = await p.locator('.ai-dia').count();
  checa('mostra os dias', dias >= 7, `${dias} dias`);

  // 3) dia e horário
  await p.locator('.ai-dia:not([disabled])').first().click();
  await p.waitForTimeout(2000);
  const horas = await p.locator('.ai-hora').count();
  checa('mostra os horários do barbeiro', horas > 0, `${horas} horário(s)`);
  checa('cadastro aparece só depois do horário', (await p.locator('#aiNome').count()) === 0);

  await p.locator('.ai-hora:not([disabled])').first().click();
  await p.waitForTimeout(900);
  checa('pede o cadastro (nome e WhatsApp)', (await p.locator('#aiNome').isVisible()) && (await p.locator('#aiTel').isVisible()));
  checa('oferece as 3 formas de pagamento', (await p.locator('.ai-pag .opt').count()) === 3);

  // 4) nome digitado não pode sumir ao escolher o pagamento
  await p.fill('#aiNome', 'Cliente Inline');
  await p.fill('#aiTel', '48999991111');
  await p.locator('.ai-pag .opt').nth(1).click();
  await p.waitForTimeout(600);
  checa('nome/WhatsApp continuam preenchidos ao trocar o pagamento',
    (await p.inputValue('#aiNome')) === 'Cliente Inline' && (await p.inputValue('#aiTel')) === '48999991111');

  await p.locator('#aiEnviar').click();
  await p.waitForTimeout(3000);
  const txt = await p.locator('#agendaInline').innerText();
  checa('agendamento concluído ali mesmo', /reservado|solicitado/i.test(txt));
  checa('horário fica reservado no nome do cliente', /reservado no seu nome/i.test(txt));
  checa('oferece confirmar no WhatsApp', await p.locator('#agendaInline a').first().isVisible());
  await p.screenshot({ path: 'tests/shots/imperio-agenda-inline.png' });

  await limpar('Cliente Inline');
  console.log('\nERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
