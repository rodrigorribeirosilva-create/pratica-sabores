'use strict';
/**
 * Vinculação de suporte entre o cardápio (painel da loja) e o Master.
 *
 * Cobre o caminho completo, com o Supabase simulado:
 *   1. a loja abre um chamado  → fica gravado junto daquela loja;
 *   2. o Master lista         → recebe o chamado com nome, slug e link do painel;
 *   3. o Master responde      → a resposta aparece no painel da loja na hora
 *                               (e como "nova" até a loja abrir);
 *   4. chamado antigo sem vínculo pode ser ligado a uma loja pelo Master;
 *   5. uma loja nunca enxerga o chamado da outra.
 *
 * Uso: node --test tests/suporte-vinculo.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'suporte-vinculo-'));
process.env.DATA_DIR = TMP;
process.env.UPLOAD_DIR = path.join(TMP, 'uploads');
process.env.DB_FILE = path.join(TMP, 'teste.db');
process.env.ROHELARI_SUPABASE_URL = 'https://supabase-teste.supabase.co';
process.env.ROHELARI_SUPABASE_ANON_KEY = 'anon-teste';
process.env.ROHELARI_SUPORTE_CHAVE = 'chave-teste';

const express = require('express');
const db = require('../src/db');
const auth = require('../src/auth');
const vinculo = require('../src/suporte-vinculo');

const CHAMADO_NOVO = '11111111-1111-4111-8111-111111111111';
const CHAMADO_ANTIGO = '22222222-2222-4222-8222-222222222222';

/** Supabase falso: guarda os chamados em memória. */
const supabase = [];
const originalFetch = global.fetch;
global.fetch = async (input, options = {}) => {
  const url = String(input);
  if (url.startsWith('https://supabase-teste.supabase.co/rest/v1/rpc/')) {
    const fn = url.split('/').pop();
    const body = JSON.parse(options.body || '{}');
    if (fn === 'suporte_externo_abrir') {
      const novo = { id: CHAMADO_NOVO, titulo: body.p_titulo, descricao: body.p_descricao, status: 'aberta', fotos: body.p_fotos, loja_slug: body.p_loja };
      supabase.push(novo);
      return new Response(JSON.stringify({ ok: true, id: novo.id }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }
    if (fn === 'suporte_externo_master_listar') {
      return new Response(JSON.stringify(supabase), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (fn === 'suporte_externo_master_responder') {
      const alvo = supabase.find((c) => c.id === body.p_id);
      if (alvo) {
        alvo.resposta_admin = body.p_resposta;
        alvo.status = 'aguardando_cliente';
      }
      return new Response(
        JSON.stringify({ ok: true, id: body.p_id, status: 'aguardando_cliente', resposta_admin: body.p_resposta }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return originalFetch(input, options);
};

/** Duas lojas: a segunda serve para provar que uma não vê a outra. */
function prepararLojas() {
  const principal = db.defaultStore();
  const outra =
    db.getStoreBySlug('outra-loja') ||
    db.createStore({ name: 'Outra Loja', slug: 'outra-loja', password: 'outra123', segment: 'food' });
  return { principal, outra };
}

function app() {
  const a = express();
  a.use(express.json());
  // Mesmo caminho de produção: a sessão da loja já resolvida em req.store.
  a.use('/l/:slug/api/admin', (req, res, next) => {
    const store = db.getStoreBySlug(req.params.slug);
    if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
    req.store = store;
    next();
  }, require('../src/suporte-externo'));
  a.use('/api/master/suporte', require('../src/suporte-master'));
  return a;
}

async function abrirServidor(t) {
  const server = http.createServer(app());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  return `http://127.0.0.1:${server.address().port}`;
}

/** Cookie de sessão da loja/dono, assinado pelo próprio módulo de auth. */
function cookieLoja(storeId) {
  const res = { setHeader: (k, v) => (res.cookie = v) };
  auth.setStoreSession(res, storeId);
  return res.cookie.split(';')[0];
}
function cookieMaster() {
  const res = { setHeader: (k, v) => (res.cookie = v) };
  auth.setMasterSession(res);
  return res.cookie.split(';')[0];
}

test('chamado da loja chega ao Master já vinculado, a resposta volta e a loja marca como lida', async (t) => {
  const { principal } = prepararLojas();
  const base = await abrirServidor(t);
  const loja = `http://127.0.0.1:${new URL(base).port}/l/${principal.slug}/api/admin/suporte`;
  const master = `${base}/api/master/suporte`;
  const ckLoja = cookieLoja(principal.id);
  const ckMaster = cookieMaster();

  // 1) a loja abre o chamado (como o formulário do painel faz)
  const formulario = new FormData();
  formulario.append('titulo', 'Botão do cardápio não abre');
  formulario.append('descricao', 'No celular o botão de pedir não responde.');
  const enviado = await fetch(`${loja}/pedidos`, { method: 'POST', headers: { Cookie: ckLoja }, body: formulario });
  assert.equal(enviado.status, 201);
  const { id } = await enviado.json();
  assert.equal(id, CHAMADO_NOVO);

  // 2) a loja vê o chamado ligado a ela
  const daLoja = await (await fetch(`${loja}/vinculo`, { headers: { Cookie: ckLoja } })).json();
  assert.equal(daLoja.loja.id, principal.id);
  assert.equal(daLoja.chamados.length, 1);
  assert.equal(daLoja.chamados[0].chamado_id, CHAMADO_NOVO);
  assert.equal(daLoja.novas, 0);

  // 3) o Master enxerga a loja dona do chamado, com link do painel
  const listaMaster = await (await fetch(master, { headers: { Cookie: ckMaster } })).json();
  assert.equal(listaMaster.chamados.length, 1);
  const chamado = listaMaster.chamados[0];
  assert.equal(chamado.vinculado, true);
  assert.equal(chamado.store_id, principal.id);
  assert.equal(chamado.store_slug, principal.slug);
  assert.equal(chamado.store_name, principal.name);
  assert.equal(chamado.store_admin_path, `/l/${principal.slug}/admin`);
  assert.equal(listaMaster.pendentes, 1);

  // 4) o Master responde → grava a ponte e responde com o vínculo
  const resposta = await fetch(`${master}/${id}/responder`, {
    method: 'POST',
    headers: { Cookie: ckMaster, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resposta: 'Já corrigimos: atualize o painel e tente de novo.' }),
  });
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  assert.equal(corpo.vinculo.loja, principal.id);

  // 5) o painel da loja mostra a resposta e avisa que é nova
  const depois = await (await fetch(`${loja}/vinculo`, { headers: { Cookie: ckLoja } })).json();
  assert.equal(depois.novas, 1);
  assert.match(depois.chamados[0].resposta_admin, /Já corrigimos/);
  assert.equal(depois.chamados[0].status, 'aguardando_cliente');
  assert.equal(depois.chamados[0].visto_loja_em, null);

  // 6) a loja abriu a resposta → o aviso some
  const visto = await (
    await fetch(`${loja}/vinculo/${id}/visto`, { method: 'POST', headers: { Cookie: ckLoja } })
  ).json();
  assert.equal(visto.novas, 0);

  // 7) a outra loja não vê nada disso
  const { outra } = prepararLojas();
  const alheio = await (
    await fetch(`http://127.0.0.1:${new URL(base).port}/l/${outra.slug}/api/admin/suporte/vinculo`, {
      headers: { Cookie: cookieLoja(outra.id) },
    })
  ).json();
  assert.equal(alheio.chamados.length, 0);
  assert.equal(alheio.novas, 0);
});

test('Master vincula um chamado antigo (que chegou sem loja) a uma loja', async (t) => {
  const { principal } = prepararLojas();
  const base = await abrirServidor(t);
  const master = `${base}/api/master/suporte`;
  const ckMaster = cookieMaster();

  // chamado que existe no Supabase mas nunca passou pela ponte
  supabase.push({ id: CHAMADO_ANTIGO, titulo: 'Chamado antigo', status: 'aberta', loja_slug: 'slug-que-nao-existe-mais' });
  const lista = await (await fetch(master, { headers: { Cookie: ckMaster } })).json();
  const antigo = lista.chamados.find((c) => c.id === CHAMADO_ANTIGO);
  assert.equal(antigo.vinculado, false);

  const vincular = await fetch(`${master}/${CHAMADO_ANTIGO}/vincular`, {
    method: 'POST',
    headers: { Cookie: ckMaster, Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: principal.id }),
  });
  assert.equal(vincular.status, 200);
  const corpo = await vincular.json();
  assert.equal(corpo.loja.slug, principal.slug);

  const depois = await (await fetch(master, { headers: { Cookie: ckMaster } })).json();
  const ligado = depois.chamados.find((c) => c.id === CHAMADO_ANTIGO);
  assert.equal(ligado.vinculado, true);
  assert.equal(ligado.store_name, principal.name);

  // e passa a aparecer no painel da loja
  const daLoja = await (
    await fetch(`http://127.0.0.1:${new URL(base).port}/l/${principal.slug}/api/admin/suporte/vinculo`, {
      headers: { Cookie: cookieLoja(principal.id) },
    })
  ).json();
  assert.ok(daLoja.chamados.some((c) => c.chamado_id === CHAMADO_ANTIGO));
});

test('ninguém sem sessão de Master vincula ou responde', async (t) => {
  const base = await abrirServidor(t);
  const semSessao = await fetch(`${base}/api/master/suporte/${CHAMADO_ANTIGO}/vincular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: 1 }),
  });
  assert.equal(semSessao.status, 401);
});

test('a ponte grava no banco com a loja certa e mantém o histórico da resposta', () => {
  const { principal } = prepararLojas();
  const id = '33333333-3333-4333-8333-333333333333';
  vinculo.registrarChamado(principal.id, id, { titulo: 'Teste direto', status: 'aberta' });
  const gravado = vinculo.vinculoDoChamado(id);
  assert.equal(gravado.store_id, principal.id);
  assert.equal(gravado.titulo, 'Teste direto');

  const respondido = vinculo.responderChamado(id, 'Voltou ao normal.');
  assert.equal(respondido.status, 'aguardando_cliente');
  assert.equal(respondido.resposta_admin, 'Voltou ao normal.');
  assert.ok(respondido.resposta_em);
  assert.equal(vinculo.respostasNovas(principal.id), 1);

  vinculo.marcarVisto(principal.id, id);
  assert.equal(vinculo.respostasNovas(principal.id), 0);
});
