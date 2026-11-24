'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const Module = require('node:module');

process.env.ROHELARI_SUPABASE_URL = 'https://support-master-test.supabase.co';
process.env.ROHELARI_SUPABASE_ANON_KEY = 'test-anon-key';
process.env.ROHELARI_SUPORTE_CHAVE = 'test-support-secret';

const express = require('express');
const authPath = path.resolve(__dirname, '../src/suporte-master.js');
const originalLoadModule = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === './auth' && parent && parent.filename === authPath) {
    return {
      requireMaster(req, res, next) {
        if (req.get('cookie') === 'ps_master=test-session') return next();
        return res.status(401).json({ error: 'Acesso restrito.' });
      },
    };
  }
  return originalLoadModule.call(this, request, parent, isMain);
};
const suporteMaster = require('../src/suporte-master');
Module._load = originalLoadModule;

const id = '11111111-1111-4111-8111-111111111111';

test('caixa de suporte do Master autentica, lista, responde e bloqueia pedidos inválidos', async (t) => {
  const app = express();
  app.use(express.json());
  app.use('/api/master/suporte', suporteMaster);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const base = `http://127.0.0.1:${server.address().port}/api/master/suporte`;
  const cookie = 'ps_master=test-session';
  const upstreamCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url.startsWith('https://support-master-test.supabase.co/rest/v1/rpc/')) {
      const payload = JSON.parse(options.body || '{}');
      upstreamCalls.push({ url, payload });
      const result = url.endsWith('/suporte_externo_master_listar')
        ? [{ id, titulo: 'Pedido de teste' }]
        : { ok: true, id, status: 'aguardando_cliente', resposta_admin: payload.p_resposta };
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input, options);
  };
  t.after(() => { global.fetch = originalFetch; });

  const semSessao = await originalFetch(base);
  assert.equal(semSessao.status, 401);
  assert.equal(upstreamCalls.length, 0);

  const listaResponse = await originalFetch(base, { headers: { Cookie: cookie } });
  assert.equal(listaResponse.status, 200);
  // cada chamado volta com o campo de vínculo (loja do cardápio que abriu)
  const lista = await listaResponse.json();
  assert.deepEqual(lista.chamados, [{ id, titulo: 'Pedido de teste', vinculado: false }]);
  assert.equal(lista.vinculado, true);
  assert.equal(upstreamCalls[0].payload.p_chave, 'test-support-secret');

  const origem = `http://127.0.0.1:${server.address().port}`;
  const invalido = await originalFetch(`${base}/nao-e-uuid/responder`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origem, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resposta: 'Retorno de teste' }),
  });
  assert.equal(invalido.status, 400);
  assert.equal(upstreamCalls.length, 1);

  const crossSite = await originalFetch(`${base}/${id}/responder`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: 'https://outro-site.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ resposta: 'Retorno de teste' }),
  });
  assert.equal(crossSite.status, 403);
  assert.equal(upstreamCalls.length, 1);

  const vazio = await originalFetch(`${base}/${id}/responder`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origem, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resposta: '   ' }),
  });
  assert.equal(vazio.status, 400);
  assert.equal(upstreamCalls.length, 1);

  const resposta = await originalFetch(`${base}/${id}/responder`, {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origem, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resposta: 'Orientação de teste.' }),
  });
  assert.equal(resposta.status, 200);
  const corpo = await resposta.json();
  assert.equal(corpo.ok, true);
  assert.equal(corpo.id, id);
  assert.equal(corpo.status, 'aguardando_cliente');
  assert.equal(corpo.resposta_admin, 'Orientação de teste.');
  // sem vínculo gravado para este chamado no banco de teste, vinculo vem nulo
  assert.equal(corpo.vinculo, null);
  assert.equal(upstreamCalls[1].payload.p_id, id);
  assert.equal(upstreamCalls[1].payload.p_resposta, 'Orientação de teste.');
});
