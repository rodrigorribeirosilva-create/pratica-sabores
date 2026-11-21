/**
 * Rótulos por loja: cada loja chama a equipe e o lugar do jeito dela.
 *
 *   • Loja de estética  → "esteticista / estúdio" no painel e na página do cliente
 *   • Loja comum (barbeiro) → continua "barbeiro / barbearia", igual sempre foi
 *   • A escolha de uma loja NUNCA muda o texto da outra
 *
 * Roda contra um servidor local (sem navegador):
 *   PORT=3977 node server.js      (outro terminal)
 *   node tests/verifica-rotulos-por-loja.js
 *
 * BASE=http://127.0.0.1:3977 node tests/verifica-rotulos-por-loja.js
 */
const assert = require('assert');

const BASE = process.env.BASE || 'http://127.0.0.1:3977';
const MASTER_PASS = process.env.MASTER_PASS || 'master123';

let falhas = 0;
function checa(nome, ok, detalhe = '') {
  if (ok) console.log('  ✓', nome, detalhe);
  else {
    falhas += 1;
    console.log('  ✗', nome, detalhe);
  }
}

/* Um "navegador" mínimo: guarda o cookie de cada loja para as chamadas seguintes. */
function sessao(url) {
  let cookie = '';
  async function req(caminho, { method = 'GET', body } = {}) {
    const r = await fetch(url + caminho, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const texto = await r.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* página HTML */
    }
    return { status: r.status, json, texto };
  }
  return { req };
}

(async () => {
  const master = sessao(BASE);
  const login = await master.req('/api/master/login', { method: 'POST', body: { password: MASTER_PASS } });
  if (login.status !== 200) {
    console.error('Não consegui entrar no master em', BASE, '- suba o servidor antes de rodar este teste.');
    process.exit(2);
  }

  const sufixo = Date.now().toString(36).slice(-5);
  const slugEstetica = 'estetica-' + sufixo;
  const slugBarber = 'barber-' + sufixo;

  /* ---------- 1. criar as duas lojas ---------- */
  const estetica = await master.req('/api/master/stores', {
    method: 'POST',
    body: {
      name: 'Estética ' + sufixo,
      slug: slugEstetica,
      password: 'estetica123',
      segment: 'servicos',
      rotulo_profissional: 'esteticista',
      rotulo_local: 'estudio',
    },
  });
  checa('loja de estética criada', estetica.status === 201, String(estetica.json && estetica.json.error || ''));
  const barber = await master.req('/api/master/stores', {
    method: 'POST',
    body: { name: 'Barber ' + sufixo, slug: slugBarber, password: 'barber123', segment: 'servicos' },
  });
  checa('loja barbearia criada', barber.status === 201);

  /* ---------- 2. o master vê a palavra de cada loja ---------- */
  const lojas = await master.req('/api/master/stores');
  const linhaEstetica = lojas.json.stores.find((s) => s.slug === slugEstetica);
  const linhaBarber = lojas.json.stores.find((s) => s.slug === slugBarber);
  checa('master mostra "esteticistas" na loja de estética', linhaEstetica.rotulos.profissionais === 'esteticistas', linhaEstetica.rotulos.profissionais);
  checa('master mostra "barbearia" na outra loja', linhaBarber.rotulos.local === 'barbearia', linhaBarber.rotulos.local);

  /* ---------- 3. página pública ---------- */
  const pubEstetica = await fetch(`${BASE}/l/${slugEstetica}/api/servicos`).then((r) => r.json());
  const pubBarber = await fetch(`${BASE}/l/${slugBarber}/api/servicos`).then((r) => r.json());
  const rE = pubEstetica.negocio.rotulos;
  const rB = pubBarber.negocio.rotulos;
  checa('site da estética: a esteticista / no estúdio', rE.profissional === 'esteticista' && rE.noLocal === 'no estúdio', `${rE.oProfissional} · ${rE.noLocal}`);
  checa('site da barbearia: o barbeiro / na barbearia', rB.profissional === 'barbeiro' && rB.noLocal === 'na barbearia', `${rB.oProfissional} · ${rB.noLocal}`);
  checa('só a loja de estética deixa de ser "barbearia"', rE.ehBarbearia === false && rB.ehBarbearia === true);

  /* ---------- 4. painel da loja: dono lê as palavras ---------- */
  const painel = sessao(`${BASE}/l/${slugEstetica}/api/admin`);
  await painel.req('/login', { method: 'POST', body: { password: 'estetica123' } });
  const rot = await painel.req('/rotulos');
  checa('painel entrega as palavras da loja', rot.status === 200 && rot.json.profissional === 'esteticista', rot.json && rot.json.profissional);
  checa('painel tem a lista de opções', (rot.json.opcoes_profissional || []).length >= 8);

  /* ---------- 5. dono troca as palavras do próprio painel ---------- */
  await painel.req('/settings', {
    method: 'PUT',
    body: { business: { name: 'Estética ' + sufixo, rotulo_profissional: 'manicure', rotulo_local: 'salao de beleza' } },
  });
  const rot2 = await painel.req('/rotulos');
  checa('troca pelo painel vale na hora', rot2.json.profissional === 'manicure' && rot2.json.noLocal === 'no salão de beleza', `${rot2.json.oProfissional} · ${rot2.json.noLocal}`);
  checa('palavra feminina usa "a"', rot2.json.artigo === 'a', rot2.json.oProfissional);

  /* campo não enviado não apaga a escolha (painel antigo, aba Loja) */
  await painel.req('/settings', { method: 'PUT', body: { business: { name: 'Estética ' + sufixo, tagline: 'Unhas e pele' } } });
  const rot3 = await painel.req('/rotulos');
  checa('salvar outros dados não apaga as palavras', rot3.json.profissional === 'manicure');

  /* de volta para esteticista/estúdio */
  await painter_set(painel, sufixo, 'esteticista', 'estudio');

  /* ---------- 6. agendamento: mensagem e erros usam a palavra da loja ---------- */
  await painel.req('/settings', {
    method: 'PUT',
    body: { business: { name: 'Estética ' + sufixo, perfil_agenda: 'barbearia', address: 'Rua das Flores, 10' } },
  });
  const prof = await painel.req('/profissionais', { method: 'POST', body: { nome: 'Ana Souza' } });
  checa('profissional cadastrado', prof.status === 201);

  const semProf = await fetch(`${BASE}/l/${slugEstetica}/api/agendar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nome: 'Cliente Teste', telefone: '48999990000', servico_id: 1, data: '2030-01-15', hora: '10:00' }),
  }).then((r) => r.json());
  checa('erro do site fala "a esteticista"', /a esteticista/i.test(semProf.error || ''), semProf.error);

  const comProf = await fetch(`${BASE}/l/${slugEstetica}/api/agendar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nome: 'Cliente Teste', telefone: '48999990000', servico_id: 1, data: '2030-01-15', hora: '10:00', profissional_id: prof.json.id, pagamento: 'local' }),
  }).then((r) => r.json());
  const texto = comProf.whatsapp_url ? decodeURIComponent(comProf.whatsapp_url.split('text=')[1]) : '';
  checa('WhatsApp do dono escreve "Esteticista: …"', /Esteticista: Ana Souza/.test(texto));
  checa('pagamento sai como "no estúdio"', /no estúdio, no dia/.test(texto));

  /* ---------- 7. master corrige a palavra de uma loja já existente ---------- */
  const idBarber = linhaBarber.id;
  await master.req(`/api/master/stores/${idBarber}`, { method: 'PATCH', body: { rotulo_profissional: 'cabeleireiro', rotulo_local: 'salao' } });
  const pubBarber2 = await fetch(`${BASE}/l/${slugBarber}/api/servicos`).then((r) => r.json());
  checa('master muda a palavra da loja pronta', pubBarber2.negocio.rotulos.profissional === 'cabeleireiro', pubBarber2.negocio.rotulos.noLocal);
  const pubEstetica2 = await fetch(`${BASE}/l/${slugEstetica}/api/servicos`).then((r) => r.json());
  checa('e não mexe na outra loja', pubEstetica2.negocio.rotulos.profissional === 'esteticista');

  /* ---------- 8. funcionário lê as palavras, mas não muda ---------- */
  await painel.req('/funcionarios', { method: 'POST', body: { nome: 'Bia', senha: 'bia12345', profissional_id: prof.json.id } });
  const func = sessao(`${BASE}/l/${slugEstetica}/api/admin`);
  await func.req('/login', { method: 'POST', body: { password: 'bia12345' } });
  const rotFunc = await func.req('/rotulos');
  checa('funcionário vê as palavras da loja', rotFunc.status === 200 && rotFunc.json.profissional === 'esteticista');
  checa('funcionário não pode editar', rotFunc.json.pode_editar === false);
  const bloqueado = await func.req('/financeiro');
  checa('funcionário segue sem acesso ao financeiro', bloqueado.status >= 400, `${bloqueado.status} ${(bloqueado.json && bloqueado.json.error) || ''}`);

  /* ---------- 9. limpeza ---------- */
  await master.req(`/api/master/stores/${linhaEstetica.id}`, { method: 'DELETE', body: { confirm: slugEstetica } });
  await master.req(`/api/master/stores/${idBarber}`, { method: 'DELETE', body: { confirm: slugBarber } });

  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nRótulos por loja: tudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});

async function painter_set(painel, sufixo, prof, local) {
  await painel.req('/settings', { method: 'PUT', body: { business: { name: 'Estética ' + sufixo, rotulo_profissional: prof, rotulo_local: local } } });
}
