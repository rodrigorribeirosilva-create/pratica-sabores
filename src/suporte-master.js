'use strict';
const express = require('express');
const { requireMaster } = require('./auth');
const { obterConfiguracao } = require('./suporte-config');
const vinculo = require('./suporte-vinculo');

const router = express.Router();
const RPC_TIMEOUT_MS = 15000;

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

async function chamarRpc(nome, dados) {
  const cfg = obterConfiguracao();
  if (!cfg) {
    const err = new Error('O suporte da plataforma não está configurado neste servidor.');
    err.code = 'SUPORTE_CONFIG';
    throw err;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.origin}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: {
        apikey: cfg.anon,
        Authorization: `Bearer ${cfg.anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...dados, p_chave: cfg.chave }),
      signal: ctrl.signal,
      redirect: 'error',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || (data && data.ok === false)) {
      const err = new Error(data && typeof data.message === 'string' ? data.message.slice(0, 500) : 'Falha na integração de suporte.');
      err.code = 'SUPORTE_RPC';
      err.status = response.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function responderErro(res, err, fallback) {
  if (err.code === 'SUPORTE_CONFIG') {
    return res.status(503).json({ error: err.message });
  }
  if (err.name === 'AbortError' || err instanceof TypeError) {
    return res.status(502).json({ error: 'Não foi possível falar com o serviço de suporte agora. Tente novamente.' });
  }
  if (err.code === 'SUPORTE_RPC' && err.message === 'Chamado não encontrado.') {
    return res.status(404).json({ error: err.message });
  }
  if (err.code === 'SUPORTE_RPC' && err.message === 'Chave de suporte inválida.') {
    return res.status(503).json({ error: 'A integração de suporte não está disponível no momento.' });
  }
  console.error('[master/suporte]', err.message);
  return res.status(502).json({ error: fallback });
}

function protegerOrigem(req, res, next) {
  const origin = req.get('origin');
  if (req.get('sec-fetch-site') === 'cross-site') {
    return res.status(403).json({ error: 'Requisição não permitida.' });
  }
  if (origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Requisição não permitida.' });
    } catch {
      return res.status(403).json({ error: 'Requisição não permitida.' });
    }
  }
  return next();
}

/**
 * GET /api/master/suporte/vinculos
 *
 * Lista o que está gravado nesta instalação: cada chamado com a loja que o
 * abriu, a resposta já dada e se a loja já leu. Serve de base mesmo quando o
 * Supabase está fora do ar — e é daqui que sai o selo de pendências.
 */
router.get('/vinculos', requireMaster, (req, res) => {
  const linhas = require('./suporte-vinculo');
  res.json({
    pendentes: linhas.pendentesMaster(),
    chamados: require('./db')
      .db.prepare(
        `SELECT v.chamado_id AS id, v.titulo, v.status, v.resposta_admin, v.resposta_em,
                v.visto_loja_em, v.criado_em, v.atualizado_em,
                s.id AS store_id, s.slug AS store_slug, s.name AS store_name
           FROM suporte_chamados v
           LEFT JOIN stores s ON s.id = v.store_id
          ORDER BY v.atualizado_em DESC, v.id DESC
          LIMIT 250`
      )
      .all(),
  });
});

router.get('/', requireMaster, async (req, res) => {
  try {
    const chamados = await chamarRpc('suporte_externo_master_listar', {});
    if (!Array.isArray(chamados)) throw new Error('Formato inválido na lista de chamados.');
    // Cada chamado vai para o Master já com a loja daqui (nome, slug e link do
    // painel) — é a vinculação entre o cardápio e o Master.
    const comVinculo = chamados.map((c) => vinculo.enriquecerChamado(c));
    res.json({ chamados: comVinculo, pendentes: vinculo.pendentesMaster(), vinculado: true });
  } catch (err) {
    responderErro(res, err, 'Não foi possível carregar os chamados agora.');
  }
});

/**
 * POST /api/master/suporte/:id/vincular
 *
 * Liga um chamado a uma loja daqui (útil para os chamados que chegaram antes
 * desta ponte existir). A partir daí o Master sabe de qual cardápio é e a
 * resposta aparece no painel daquela loja.
 */
router.post('/:id/vincular', requireMaster, protegerOrigem, (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Chamado inválido.' });
  }
  const storeId = Number((req.body || {}).store_id || 0);
  if (!storeId) return res.status(400).json({ error: 'Escolha a loja.' });

  const loja = require('./db').getStoreById(storeId);
  if (!loja) return res.status(404).json({ error: 'Loja não encontrada.' });

  const chamado = vinculo.vinculoDoChamado(id);
  if (!chamado) {
    // Primeiro vínculo: o chamado pode já existir no Supabase, então grava aqui.
    vinculo.registrarChamado(storeId, id, { titulo: '', status: 'aberta' });
  } else {
    require('./db').db
      .prepare("UPDATE suporte_chamados SET store_id = ?, atualizado_em = datetime('now') WHERE chamado_id = ?")
      .run(storeId, id);
  }
  // Se já havia uma resposta gravada, a loja nova passa a vê-la como não lida.
  require('./db').db
    .prepare('UPDATE suporte_chamados SET visto_loja_em = NULL WHERE chamado_id = ?')
    .run(id);

  res.json({
    ok: true,
    chamado_id: id,
    loja: { id: loja.id, slug: loja.slug, name: loja.name },
    vinculo: vinculo.vinculoDoChamado(id),
  });
});

router.post('/:id/responder', requireMaster, protegerOrigem, async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Chamado inválido.' });
  }

  const resposta = typeof (req.body || {}).resposta === 'string' ? req.body.resposta.trim() : '';
  const tamanho = [...resposta].length;
  if (tamanho < 1 || tamanho > 4000) {
    return res.status(400).json({ error: 'Escreva uma resposta de até 4000 caracteres.' });
  }

  try {
    const data = await chamarRpc('suporte_externo_master_responder', { p_id: id, p_resposta: resposta });
    if (!data || data.ok !== true) throw new Error('Formato inválido ao salvar a resposta.');
    // A mesma resposta fica gravada aqui: o painel da loja mostra na hora,
    // mesmo que o Supabase demore a refletir a mudança.
    let vinculoAtualizado = null;
    try {
      vinculoAtualizado = vinculo.responderChamado(id, resposta, data.status || 'aguardando_cliente');
    } catch (e) {
      console.error('[master/suporte] vínculo:', e.message);
    }
    res.json({ ...data, vinculo: vinculoAtualizado ? { loja: vinculoAtualizado.store_id, status: vinculoAtualizado.status } : null });
  } catch (err) {
    responderErro(res, err, 'Não foi possível salvar a resposta agora.');
  }
});

module.exports = router;
