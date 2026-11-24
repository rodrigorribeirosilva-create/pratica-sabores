'use strict';
/**
 * Vinculação de suporte entre o cardápio (painel da loja) e o Master.
 *
 * O chamado em si continua no Supabase (suporte_externo_abrir/listar). Aqui
 * fica a PONTE com o banco desta instalação:
 *
 *   loja abre chamado  → gravamos o id do chamado junto da loja (store_id)
 *   Master responde    → a resposta é gravada aqui e aparece na hora no
 *                        painel da loja, sem depender de recarregar o Supabase
 *
 * Regras de segurança: toda consulta é por store_id (uma loja nunca vê o
 * chamado da outra) e a rota do Master é a única que grava resposta.
 */
const { db } = require('./db');

const STATUS = ['aberta', 'em_analise', 'aguardando_cliente', 'concluida', 'cancelada'];
const normalizarStatus = (s) => (STATUS.includes(s) ? s : 'aberta');

/** Grava (ou atualiza) a ligação entre um chamado do Supabase e a loja. */
function registrarChamado(storeId, chamadoId, dados = {}) {
  if (!storeId || !chamadoId) return null;
  const existente = db.prepare('SELECT * FROM suporte_chamados WHERE chamado_id = ?').get(String(chamadoId));
  db.prepare(
    `INSERT INTO suporte_chamados (store_id, chamado_id, titulo, status, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(chamado_id) DO UPDATE SET
       store_id = excluded.store_id,
       titulo = CASE WHEN excluded.titulo <> '' THEN excluded.titulo ELSE suporte_chamados.titulo END,
       atualizado_em = datetime('now')`
  ).run(Number(storeId), String(chamadoId), String(dados.titulo || '').slice(0, 120), normalizarStatus(dados.status));
  return existente || db.prepare('SELECT * FROM suporte_chamados WHERE chamado_id = ?').get(String(chamadoId));
}

/** Chamados de UMA loja (o painel da loja usa isto). */
function chamadosDaLoja(storeId, limite = 50) {
  return db
    .prepare('SELECT * FROM suporte_chamados WHERE store_id = ? ORDER BY atualizado_em DESC, id DESC LIMIT ?')
    .all(Number(storeId), Number(limite) || 50);
}

/** Ligação de um chamado só (para o Master saber de quem é). */
function vinculoDoChamado(chamadoId) {
  return db.prepare('SELECT * FROM suporte_chamados WHERE chamado_id = ?').get(String(chamadoId)) || null;
}

/** Resposta do Master: grava, marca como aguardando o cliente e avisa a loja. */
function responderChamado(chamadoId, resposta, status = 'aguardando_cliente') {
  const atual = vinculoDoChamado(chamadoId);
  if (!atual) return null;
  db.prepare(
    `UPDATE suporte_chamados
        SET resposta_admin = ?, resposta_em = datetime('now'),
            status = ?, visto_loja_em = NULL, atualizado_em = datetime('now')
      WHERE chamado_id = ?`
  ).run(String(resposta || '').slice(0, 4000), normalizarStatus(status), String(chamadoId));
  return vinculoDoChamado(chamadoId);
}

/** Marca que a loja já viu o retorno (some o aviso de "resposta nova"). */
function marcarVisto(storeId, chamadoId) {
  db.prepare(
    `UPDATE suporte_chamados SET visto_loja_em = datetime('now')
      WHERE store_id = ? AND chamado_id = ? AND resposta_em IS NOT NULL`
  ).run(Number(storeId), String(chamadoId));
  return true;
}

/** Quantos chamados têm resposta nova que a loja ainda não abriu. */
function respostasNovas(storeId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM suporte_chamados
        WHERE store_id = ? AND resposta_em IS NOT NULL AND visto_loja_em IS NULL`
    )
    .get(Number(storeId)).n;
}

/** Quantos chamados de todas as lojas esperam o Master (alimenta o selo da aba). */
function pendentesMaster() {
  return db
    .prepare(
      `SELECT COUNT(*) AS n FROM suporte_chamados
        WHERE status NOT IN ('concluida', 'cancelada')
          AND (resposta_em IS NULL OR status = 'aberta' OR status = 'em_analise')`
    )
    .get().n;
}

/**
 * Dados da loja+Master para o card do chamado no Master: junta a ligação
 * gravada aqui com o que veio do Supabase.
 */
function enriquecerChamado(chamado) {
  const vinculo = chamado && chamado.id ? vinculoDoChamado(chamado.id) : null;
  if (!vinculo) return { ...chamado, vinculado: false };
  const loja = db.prepare('SELECT id, slug, name FROM stores WHERE id = ?').get(vinculo.store_id) || null;
  return {
    ...chamado,
    vinculado: true,
    store_id: vinculo.store_id,
    store_name: loja ? loja.name : '',
    store_slug: loja ? loja.slug : '',
    store_admin_path: loja ? `/l/${loja.slug}/admin` : '',
    status: chamado.status || vinculo.status,
    resposta_admin: chamado.resposta_admin || vinculo.resposta_admin,
    resposta_em: vinculo.resposta_em,
    visto_loja_em: vinculo.visto_loja_em,
  };
}

module.exports = {
  STATUS,
  registrarChamado,
  chamadosDaLoja,
  vinculoDoChamado,
  responderChamado,
  marcarVisto,
  respostasNovas,
  pendentesMaster,
  enriquecerChamado,
};
