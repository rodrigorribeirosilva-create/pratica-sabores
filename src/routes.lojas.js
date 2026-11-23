'use strict';
/**
 * Ferramentas administrativas para lojas de catálogo/cardápio:
 * finanças, despesas e ficha de clientes consolidada a partir dos pedidos.
 * Todos os dados são isolados por req.store.id.
 */
const express = require('express');
const { db } = require('./db');
const { requireAuth } = require('./auth');
const { parseMoneyToCents, formatDateTimeBR } = require('./helpers');

const router = express.Router();
const FORMAS = ['dinheiro', 'pix', 'debito', 'credito', 'outro'];
const digitos = (v) => String(v || '').replace(/\D/g, '');
function telefoneKey(v) {
  let d = digitos(v);
  // O mesmo telefone pode ser digitado com ou sem o código do Brasil.
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d;
}
function hojeBrasil() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}
function dataValida(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) &&
    Number.isFinite(Date.parse(`${v}T12:00:00Z`)) &&
    new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
}
function parseValor(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  const s = String(input ?? '').trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s || !(/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s) || /^\d+(?:\.\d{1,2})?$/.test(s))) return null;
  const cents = parseMoneyToCents(s);
  return Number.isSafeInteger(cents) ? cents : null;
}
function lojaDeCatalogo(req, res, next) {
  if (req.store && req.store.segment === 'servicos') return res.status(404).json({ error: 'Não encontrado.' });
  next();
}
function parseItens(row) {
  try {
    const itens = JSON.parse(row.items_json || '[]');
    return Array.isArray(itens) ? itens : [];
  } catch { return []; }
}
function rotuloStatus(status) {
  return ({
    novo: 'Novo', em_preparo: 'Em preparo', saiu_entrega: 'Saiu para entrega',
    concluido: 'Concluído', cancelado: 'Cancelado',
  })[status] || status || 'Pedido';
}
function dadosPessoa(body) {
  return {
    nome: String(body.nome || '').trim().slice(0, 120),
    telefone: String(body.telefone || '').trim().slice(0, 40),
    email: String(body.email || '').trim().slice(0, 160),
    endereco: String(body.endereco || '').trim().slice(0, 240),
    bairro: String(body.bairro || '').trim().slice(0, 100),
    obs: String(body.obs || '').trim().slice(0, 500),
  };
}
function validarPessoa(p) {
  if (p.nome.length < 2) return 'Informe o nome do cliente.';
  if (!/^[+()\d\s.\-]+$/.test(p.telefone) || telefoneKey(p.telefone).length < 10) return 'Informe um telefone válido com DDD.';
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return 'Confira o e-mail do cliente.';
  return '';
}

/* Clientes cadastrados e pessoas identificadas nos pedidos antigos/novos. */
router.get('/customers', requireAuth, lojaDeCatalogo, (req, res) => {
  const storeId = req.store.id;
  const q = String(req.query.q || '').trim().toLocaleLowerCase('pt-BR');
  const pedidos = db.prepare(
    `SELECT id, customer_name, phone, address, neighborhood, total_cents, items_json, status, created_at
       FROM orders WHERE store_id = ? ORDER BY created_at DESC, id DESC`
  ).all(storeId);
  const resumo = new Map();
  for (const o of pedidos) {
    const tel = telefoneKey(o.phone);
    if (tel.length < 10) continue;
    let r = resumo.get(tel);
    if (!r) {
      r = {
        pedido_count: 0, total_gasto_cents: 0, total_itens: 0,
        ultimo_pedido: o.created_at || '', ultimo_status: o.status || '',
        ultimo_nome: o.customer_name || '', ultimo_telefone: o.phone || '',
        ultimo_endereco: o.address || '', ultimo_bairro: o.neighborhood || '',
      };
      resumo.set(tel, r);
    }
    // Cancelamentos aparecem como último contato, mas não contam como compra,
    // recorrência nem receita acumulada.
    if (o.status === 'cancelado') continue;
    r.pedido_count += 1;
    r.total_gasto_cents += Number(o.total_cents || 0);
    r.total_itens += parseItens(o).reduce((n, it) => n + (Number(it.qty) || 0), 0);
  }

  const cadastrados = db.prepare('SELECT * FROM clientes WHERE store_id = ? ORDER BY nome COLLATE NOCASE, id').all(storeId);
  const clientes = [];
  const telefoneRegistrado = new Set();
  for (const c of cadastrados) {
    const tel = telefoneKey(c.telefone);
    const pedidosCliente = tel.length >= 10 ? resumo.get(tel) : null;
    if (tel.length >= 10 && telefoneRegistrado.has(tel)) continue;
    if (tel.length >= 10) telefoneRegistrado.add(tel);
    clientes.push({
      ...c,
      origem: 'cadastro',
      pedido_count: pedidosCliente ? pedidosCliente.pedido_count : 0,
      total_gasto_cents: pedidosCliente ? pedidosCliente.total_gasto_cents : 0,
      total_itens: pedidosCliente ? pedidosCliente.total_itens : 0,
      ultimo_pedido: pedidosCliente ? pedidosCliente.ultimo_pedido : '',
      ultimo_pedido_br: pedidosCliente && pedidosCliente.ultimo_pedido ? formatDateTimeBR(pedidosCliente.ultimo_pedido) : '',
      ultimo_pedido_status: pedidosCliente ? pedidosCliente.ultimo_status : '',
      ultimo_pedido_status_label: pedidosCliente ? rotuloStatus(pedidosCliente.ultimo_status) : '',
      recorrente: !!(pedidosCliente && pedidosCliente.pedido_count > 1),
    });
  }
  for (const [tel, p] of resumo) {
    if (telefoneRegistrado.has(tel)) continue;
    clientes.push({
      id: null, store_id: storeId, nome: p.ultimo_nome || 'Cliente', telefone: p.ultimo_telefone,
      email: '', endereco: p.ultimo_endereco, bairro: p.ultimo_bairro, obs: '', criado_em: '',
      origem: 'pedido', pedido_count: p.pedido_count, total_gasto_cents: p.total_gasto_cents,
      total_itens: p.total_itens, ultimo_pedido: p.ultimo_pedido,
      ultimo_pedido_br: p.ultimo_pedido ? formatDateTimeBR(p.ultimo_pedido) : '',
      ultimo_pedido_status: p.ultimo_status,
      ultimo_pedido_status_label: rotuloStatus(p.ultimo_status),
      recorrente: p.pedido_count > 1,
    });
  }
  const filtrados = q ? clientes.filter((c) =>
    [c.nome, c.telefone, c.email, c.endereco, c.bairro].some((v) => String(v || '').toLocaleLowerCase('pt-BR').includes(q))
  ) : clientes;
  filtrados.sort((a, b) => String(b.ultimo_pedido || b.criado_em || '').localeCompare(String(a.ultimo_pedido || a.criado_em || '')) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  res.set('Cache-Control', 'no-store');
  res.json(filtrados);
});

/* Histórico ligado ao telefone, inclusive clientes gerados automaticamente por pedidos. */
router.get('/customers/history', requireAuth, lojaDeCatalogo, (req, res) => {
  const telefone = String(req.query.telefone || '');
  const key = telefoneKey(telefone);
  if (key.length < 10) return res.status(400).json({ error: 'Telefone do cliente inválido.' });
  const storeId = req.store.id;
  const pedidos = db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC, id DESC').all(storeId)
    .filter((o) => telefoneKey(o.phone) === key)
    .slice(0, 200)
    .map((o) => ({
      id: o.id, code: o.code, customer_name: o.customer_name, phone: o.phone,
      created_at: o.created_at, created_at_br: formatDateTimeBR(o.created_at),
      status: o.status, status_label: rotuloStatus(o.status),
      subtotal_cents: Number(o.subtotal_cents || 0), fee_cents: Number(o.fee_cents || 0),
      total_cents: Number(o.total_cents || 0), payment_method: o.payment_method || '',
      items: parseItens(o),
    }));
  res.set('Cache-Control', 'no-store');
  res.json({ telefone, pedidos });
});

router.post('/customers', requireAuth, lojaDeCatalogo, (req, res) => {
  const p = dadosPessoa(req.body || {});
  const erro = validarPessoa(p);
  if (erro) return res.status(400).json({ error: erro });
  const storeId = req.store.id;
  const tel = telefoneKey(p.telefone);
  const existente = db.prepare('SELECT id, telefone FROM clientes WHERE store_id = ?').all(storeId)
    .find((c) => telefoneKey(c.telefone) === tel);
  if (existente) {
    db.prepare(`UPDATE clientes SET nome=?, telefone=?, email=?, endereco=?, bairro=?, obs=?, atualizado_em=datetime('now') WHERE id=? AND store_id=?`)
      .run(p.nome, p.telefone, p.email, p.endereco, p.bairro, p.obs, existente.id, storeId);
    return res.json({ ok: true, id: existente.id, atualizado: true });
  }
  const info = db.prepare('INSERT INTO clientes (store_id, nome, telefone, email, endereco, bairro, obs) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(storeId, p.nome, p.telefone, p.email, p.endereco, p.bairro, p.obs);
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid), atualizado: false });
});

router.put('/customers/:id', requireAuth, lojaDeCatalogo, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Cliente inválido.' });
  const atual = db.prepare('SELECT * FROM clientes WHERE id = ? AND store_id = ?').get(id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Cliente não encontrado.' });
  const p = dadosPessoa(req.body || {});
  const erro = validarPessoa(p);
  if (erro) return res.status(400).json({ error: erro });
  const tel = telefoneKey(p.telefone);
  const duplicado = db.prepare('SELECT id, telefone FROM clientes WHERE store_id = ? AND id != ?').all(req.store.id, id)
    .find((c) => telefoneKey(c.telefone) === tel);
  if (duplicado) return res.status(409).json({ error: 'Esse telefone já está cadastrado para outro cliente.' });
  db.prepare(`UPDATE clientes SET nome=?, telefone=?, email=?, endereco=?, bairro=?, obs=?, atualizado_em=datetime('now') WHERE id=? AND store_id=?`)
    .run(p.nome, p.telefone, p.email, p.endereco, p.bairro, p.obs, id, req.store.id);
  res.json({ ok: true });
});

/* ------------------------ Financeiro do catálogo/cardápio ------------------------ */
function obterVendas(storeId, de, ate) {
  return db.prepare(
    `SELECT id, customer_name, phone, total_cents, payment_method, status, created_at,
            date(datetime(created_at, '-3 hours')) AS dia
       FROM orders
      WHERE store_id = ? AND status != 'cancelado'
        AND date(datetime(created_at, '-3 hours')) >= ? AND date(datetime(created_at, '-3 hours')) <= ?
      ORDER BY created_at, id`
  ).all(storeId, de, ate);
}
function pagamentoEmDinheiro(rotulo) {
  const s = String(rotulo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return s.includes('dinheiro') || s.includes('especie');
}
function apurarCaixa(storeId, data) {
  const vendas = db.prepare(
    `SELECT total_cents, payment_method FROM orders WHERE store_id = ? AND status != 'cancelado'
      AND date(datetime(created_at, '-3 hours')) = ?`
  ).all(storeId, data);
  const despesas = db.prepare('SELECT valor_cents, forma FROM despesas WHERE store_id = ? AND data = ?').all(storeId, data);
  const vendasDinheiro = vendas.filter((v) => pagamentoEmDinheiro(v.payment_method)).reduce((n, v) => n + Number(v.total_cents || 0), 0);
  const despesasDinheiro = despesas.filter((d) => d.forma === 'dinheiro').reduce((n, d) => n + Number(d.valor_cents || 0), 0);
  const despesasTotal = despesas.reduce((n, d) => n + Number(d.valor_cents || 0), 0);
  return { vendas_dinheiro_cents: vendasDinheiro, despesas_dinheiro_cents: despesasDinheiro, despesas_cents: despesasTotal, esperado_cents: vendasDinheiro - despesasDinheiro };
}

router.get('/store-finance', requireAuth, lojaDeCatalogo, (req, res) => {
  const storeId = req.store.id;
  const hoje = hojeBrasil();
  const padraoDe = `${hoje.slice(0, 7)}-01`;
  const de = dataValida(req.query.de) ? req.query.de : padraoDe;
  const ate = dataValida(req.query.ate) ? req.query.ate : hoje;
  if (de > ate) return res.status(400).json({ error: 'A data inicial não pode ser posterior à data final.' });
  const pedidos = obterVendas(storeId, de, ate);
  const despesas = db.prepare('SELECT * FROM despesas WHERE store_id = ? AND data >= ? AND data <= ? ORDER BY data DESC, id DESC').all(storeId, de, ate);
  const totalVendas = pedidos.reduce((n, p) => n + Number(p.total_cents || 0), 0);
  const totalDespesas = despesas.reduce((n, d) => n + Number(d.valor_cents || 0), 0);
  const dias = new Map();
  const dia = (key) => {
    if (!dias.has(key)) dias.set(key, { data: key, vendas_cents: 0, despesas_cents: 0, pedidos: 0, vendas_dinheiro_cents: 0, despesas_dinheiro_cents: 0 });
    return dias.get(key);
  };
  const formas = new Map();
  for (const p of pedidos) {
    const d = dia(p.dia);
    d.vendas_cents += Number(p.total_cents || 0);
    d.pedidos += 1;
    if (pagamentoEmDinheiro(p.payment_method)) d.vendas_dinheiro_cents += Number(p.total_cents || 0);
    const forma = String(p.payment_method || 'Não informado').slice(0, 120);
    formas.set(forma, (formas.get(forma) || 0) + Number(p.total_cents || 0));
  }
  for (const e of despesas) {
    const d = dia(e.data);
    d.despesas_cents += Number(e.valor_cents || 0);
    if (e.forma === 'dinheiro') d.despesas_dinheiro_cents += Number(e.valor_cents || 0);
  }
  const diasLista = [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)).map((d) => ({
    ...d, liquido_cents: d.vendas_cents - d.despesas_cents,
    caixa_esperado_cents: d.vendas_dinheiro_cents - d.despesas_dinheiro_cents,
  }));
  const fechamentoHoje = db.prepare('SELECT * FROM caixas WHERE store_id = ? AND data = ?').get(storeId, hoje) || null;
  res.set('Cache-Control', 'no-store');
  res.json({
    de, ate, vendas_cents: totalVendas, despesas_cents: totalDespesas,
    liquido_cents: totalVendas - totalDespesas, pedidos: pedidos.length,
    por_forma: [...formas.entries()].map(([forma, valor_cents]) => ({ forma, valor_cents })).sort((a, b) => b.valor_cents - a.valor_cents),
    dias: diasLista, despesas, fechamento_hoje: fechamentoHoje,
    caixa_hoje: apurarCaixa(storeId, hoje),
  });
});

function salvarDespesa(req, id = null) {
  const b = req.body || {};
  const valor = parseValor(b.valor);
  const data = dataValida(b.data) ? b.data : hojeBrasil();
  const categoria = String(b.categoria || 'Geral').trim().slice(0, 40) || 'Geral';
  const descricao = String(b.descricao || '').trim().slice(0, 160);
  const forma = FORMAS.includes(String(b.forma || '')) ? String(b.forma) : 'dinheiro';
  if (!Number.isSafeInteger(valor) || valor <= 0 || valor > 1000000000) return { error: 'Informe uma despesa válida, de até R$ 10.000.000.' };
  if (id) {
    db.prepare('UPDATE despesas SET data=?, categoria=?, descricao=?, valor_cents=?, forma=? WHERE id=? AND store_id=?')
      .run(data, categoria, descricao, valor, forma, id, req.store.id);
    return { id };
  }
  const info = db.prepare('INSERT INTO despesas (store_id, data, categoria, descricao, valor_cents, forma) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.store.id, data, categoria, descricao, valor, forma);
  return { id: Number(info.lastInsertRowid) };
}
router.post('/store-expenses', requireAuth, lojaDeCatalogo, (req, res) => {
  const r = salvarDespesa(req);
  if (r.error) return res.status(400).json({ error: r.error });
  res.status(201).json({ ok: true, id: r.id });
});
router.put('/store-expenses/:id', requireAuth, lojaDeCatalogo, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1 || !db.prepare('SELECT id FROM despesas WHERE id=? AND store_id=?').get(id, req.store.id)) return res.status(404).json({ error: 'Despesa não encontrada.' });
  const r = salvarDespesa(req, id);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ ok: true });
});
router.delete('/store-expenses/:id', requireAuth, lojaDeCatalogo, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: 'Despesa não encontrada.' });
  const info = db.prepare('DELETE FROM despesas WHERE id=? AND store_id=?').run(id, req.store.id);
  if (!info.changes) return res.status(404).json({ error: 'Despesa não encontrada.' });
  res.json({ ok: true });
});
router.post('/store-finance/close', requireAuth, lojaDeCatalogo, (req, res) => {
  const b = req.body || {};
  const data = dataValida(b.data) ? b.data : hojeBrasil();
  const informado = parseValor(b.valor_informado);
  if (!Number.isSafeInteger(informado) || informado < 0 || informado > 1000000000) return res.status(400).json({ error: 'Informe um valor de caixa válido.' });
  const apurado = apurarCaixa(req.store.id, data);
  db.prepare(
    `INSERT INTO caixas (store_id, data, valor_sistema_cents, valor_informado_cents, despesas_cents, obs)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id, data) DO UPDATE SET valor_sistema_cents=excluded.valor_sistema_cents,
       valor_informado_cents=excluded.valor_informado_cents, despesas_cents=excluded.despesas_cents,
       obs=excluded.obs, fechado_em=datetime('now')`
  ).run(req.store.id, data, apurado.esperado_cents, informado, apurado.despesas_cents, String(b.obs || '').trim().slice(0, 200));
  res.json({ ok: true, data, esperado_cents: apurado.esperado_cents, informado_cents: informado, diferenca_cents: informado - apurado.esperado_cents });
});

module.exports = router;
