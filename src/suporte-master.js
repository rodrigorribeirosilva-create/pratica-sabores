'use strict';
const express = require('express');
const { requireMaster } = require('./auth');
const { obterConfiguracao } = require('./suporte-config');

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

router.get('/', requireMaster, async (req, res) => {
  try {
    const chamados = await chamarRpc('suporte_externo_master_listar', {});
    if (!Array.isArray(chamados)) throw new Error('Formato inválido na lista de chamados.');
    res.json({ chamados });
  } catch (err) {
    responderErro(res, err, 'Não foi possível carregar os chamados agora.');
  }
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
    res.json(data);
  } catch (err) {
    responderErro(res, err, 'Não foi possível salvar a resposta agora.');
  }
});

module.exports = router;
