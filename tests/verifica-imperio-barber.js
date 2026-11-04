/** Império Barber: equipe (barbeiros), agenda por barbeiro e agendamento.
 *  Regras que este teste garante:
 *   - quem pede primeiro RESERVA o horário (fica "já agendado" para os outros);
 *   - o site do cliente NÃO mostra o nome de quem agendou;
 *   - o painel tem o nome completo (área privada);
 *   - recusar no painel devolve o horário para a lista.
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
const SLUG = 'imperio-barber';
const API = `${B}/l/${SLUG}/api`;
const ADM = `${API}/admin`;
let erros = 0;
const checa = (n, ok, extra = '') => { if (!ok) erros++; console.log(`${ok ? '✓' : '✗'} ${n} ${extra}`); };

async function sessao() {
  const l = await fetch(ADM + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'imperio2026' }),
  });
  return (l.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
}
async function limpar(cookie, nomes) {
  const ago = await (await fetch(ADM + '/agendamentos?status=todos', { headers: { cookie } })).json();
  for (const a of ago.filter((x) => nomes.includes(x.cliente_nome || ''))) {
    await fetch(ADM + '/agendamentos/' + a.id, { method: 'DELETE', headers: { cookie } });
  }
}

(async () => {
  const cookie = await sessao();
  const servicos = await (await fetch(API + '/servicos')).json();
  const svc = servicos.servicos[0];
  const barbeiros = servicos.equipe || [];
  const b1 = barbeiros[0];
  const b2 = barbeiros[1] || null;

  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });

  await p.goto(`${B}/l/${SLUG}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  checa('página carrega', /Império Barber/i.test(await p.locator('body').innerText()));
  checa('seção da equipe aparece', await p.locator('#equipe').isVisible());
  const cards = await p.locator('.card-barbeiro').count();
  checa('barbeiros na tela', cards >= 2, `(${cards})`);

  // nada de ar-condicionado numa barbearia
  checa('não pede endereço', !(await p.locator('#endereco').isVisible().catch(() => false)));
  checa('não pede equipamento de ar', !(await p.locator('#equip_tipo').isVisible().catch(() => false)));
  checa('avisa que o atendimento é na barbearia', /barbearia/i.test(await p.locator('body').innerText()));

  // ---- escolhe um dia ABERTO e com vaga, longe dos agendamentos reais ----
  let iso = '', hora = null;
  for (let i = 20; i < 80 && !hora; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const cand = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await (await fetch(`${API}/disponibilidade?data=${cand}&profissional=${b1.id}&servico=${svc.id}`)).json();
    if (!r.aberto) continue;
    const livre = (r.horarios || []).find((h) => h.livre);
    if (livre) { iso = cand; hora = livre; }
  }
  checa('o dia sorteado tem horário livre', !!hora, hora ? `${iso} ${hora.hora}` : 'nenhum');

  await p.locator('.card-serv-foto .cs-radio').first().click();
  await p.waitForTimeout(1200);
  await p.locator('.card-barbeiro').first().click();
  await p.waitForTimeout(2000);
  checa('barbeiro escolhido marcado', (await p.locator('.card-barbeiro.on').count()) === 1);

  const pedido = await p.evaluate(async ({ iso, svc, prof, hora }) => {
    const base = location.pathname + '/api';
    const r = await fetch(base + '/agendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Cliente Teste Império', telefone: '48999990000', servico_id: svc, data: iso, hora, profissional_id: prof, pagamento: 'local' }),
    });
    return { status: r.status, j: await r.json() };
  }, { iso, svc: svc.id, prof: b1.id, hora: hora.hora });
  checa('agendamento criado pelo site', pedido.status === 200 && pedido.j.ok === true, JSON.stringify(pedido.j).slice(0, 80));

  // ---- o mesmo horário agora é de quem pediu primeiro ----
  const publico = await (await fetch(`${API}/disponibilidade?data=${iso}&profissional=${b1.id}&servico=${svc.id}`)).json();
  const ocupado = publico.horarios.find((h) => h.hora === hora.hora);
  checa('horário reservado fica "já agendado" para os outros', ocupado.livre === false);
  checa('site NÃO recebe o nome de quem agendou', !JSON.stringify(publico).includes('Cliente Teste Império'));
  checa('site mostra só "Já agendado"', ocupado.ocupado_por === 'Já agendado', JSON.stringify(ocupado.ocupado_por));

  const outro = await fetch(`${API}/agendar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Segundo Cliente', telefone: '48999990001', servico_id: svc.id, data: iso, hora: hora.hora, profissional_id: b1.id, pagamento: 'local' }),
  });
  const outroJ = await outro.json();
  checa('outro cliente no mesmo horário é recusado (409)', outro.status === 409, JSON.stringify(outroJ).slice(0, 90));
  checa('a recusa não revela o nome do outro cliente', !JSON.stringify(outroJ).includes('Cliente Teste Império'), JSON.stringify(outroJ.error || ''));

  if (b2) {
    const outroBarbeiro = await (await fetch(`${API}/disponibilidade?data=${iso}&profissional=${b2.id}&servico=${svc.id}`)).json();
    checa('a agenda do outro barbeiro continua livre', outroBarbeiro.horarios.find((h) => h.hora === hora.hora).livre === true);
  } else {
    console.log('– só um barbeiro ativo na loja: checagem de outro barbeiro não se aplica');
  }

  // ---- o painel (área privada) TEM o nome completo ----
  const privado = await (await fetch(`${ADM}/agenda/disponibilidade?detalhado=1&data=${iso}&profissional=${b1.id}&servico=${svc.id}`, { headers: { cookie } })).json();
  const linha = privado.horarios.find((h) => h.hora === hora.hora);
  checa('painel mostra o nome completo de quem agendou', linha && linha.cliente_nome === 'Cliente Teste Império', linha ? linha.cliente_nome : 'sem linha');

  // ---- recusar devolve o horário ----
  const ago = await (await fetch(ADM + '/agendamentos?status=todos', { headers: { cookie } })).json();
  const alvo = ago.find((x) => x.cliente_nome === 'Cliente Teste Império');
  await fetch(ADM + '/agendamentos/' + alvo.id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ status: 'cancelado' }),
  });
  const depois = await (await fetch(`${API}/disponibilidade?data=${iso}&profissional=${b1.id}&servico=${svc.id}`)).json();
  checa('recusar no painel libera o horário de novo', depois.horarios.find((h) => h.hora === hora.hora).livre === true);

  await p.screenshot({ path: 'tests/shots/imperio-equipe.png', fullPage: false });
  await limpar(cookie, ['Cliente Teste Império', 'Segundo Cliente']);
  await b.close();
  console.log('\nERROS:', erros);
  process.exit(erros ? 1 : 0);
})();
