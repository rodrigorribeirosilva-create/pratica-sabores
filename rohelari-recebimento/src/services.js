'use strict';
// Serviços compartilhados: auditoria, notificações, protocolo e escopo de queries.
const crypto = require('crypto');
const db = require('./db');

async function audit(req, action, entity, entityId, details) {
  try {
    await db.query(
      `INSERT INTO audit_logs(network_id, store_id, user_id, action, entity, entity_id, details, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.ctx?.networkId || null, details?.store_id || null, req.ctx?.user?.id || null,
       action, entity, entityId ? String(entityId) : null,
       JSON.stringify(details || {}), (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim().slice(0, 64)]
    );
  } catch (e) { console.error('[audit] falha:', e.message); }
}

async function notify({ networkId, storeId = null, userId = null, appointmentId = null, type, channel = 'inapp', title, body }) {
  const { rows } = await db.query(
    `INSERT INTO notifications(network_id, store_id, user_id, appointment_id, type, channel, title, body, status, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [networkId, storeId, userId, appointmentId, type, channel, title, body || null,
     channel === 'inapp' ? 'enviada' : 'pendente', channel === 'inapp' ? new Date().toISOString() : null]
  );
  // Entrega por e-mail/WhatsApp: preparada via webhook opcional (sem credenciais, fica 'pendente')
  if ((channel === 'email' || channel === 'whatsapp') && process.env.NOTIFY_WEBHOOK_URL) {
    try {
      const resp = await fetch(process.env.NOTIFY_WEBHOOK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, to_user: userId, store_id: storeId, type, title, body, appointmentId }),
      });
      await db.query('UPDATE notifications SET status=$1, sent_at=$2 WHERE id=$3',
        [resp.ok ? 'enviada' : 'falha', new Date().toISOString(), rows[0].id]);
    } catch (e) {
      await db.query('UPDATE notifications SET status=$1 WHERE id=$2', ['falha', rows[0].id]);
    }
  }
  return rows[0].id;
}

// Notifica papéis de loja (e opcionalmente rede) sobre um evento de recebimento
async function notifyStore(networkId, storeId, roles, payload) {
  const placeholders = roles.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await db.query(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.store_id=$${roles.length + 1} AND ur.role IN (${placeholders}) AND u.status='ativo'`,
    [...roles, storeId]);
  for (const r of rows) {
    await notify({ networkId, storeId, userId: r.id, appointmentId: payload.appointmentId || null, ...payload });
  }
  return rows.length;
}
async function notifyNetworkAdmins(networkId, payload) {
  const { rows } = await db.query(
    `SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id
      WHERE ur.role='rede_admin' AND u.network_id=$1 AND u.status='ativo'`, [networkId]);
  for (const r of rows) await notify({ networkId, userId: r.id, ...payload });
  return rows.length;
}

// Protocolo único: RB + AAAAMMDD + '-' + 4 chars (base32 sem ambíguos)
function makeProtocol(date) {
  const d = date instanceof Date ? date : new Date(date);
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const buf = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) suffix += alphabet[buf[i] % alphabet.length];
  return `RB${ymd}-${suffix}`;
}

// Cláusula de escopo multi-loja para listagens de agendamentos
// Retorna fragmento SQL parametrizado começando em $startIdx
function appointmentScope(ctx, startIdx = 1) {
  if (ctx.isRedeAdmin) return { sql: `a.network_id = $${startIdx}`, params: [ctx.networkId], next: startIdx + 1 };
  const parts = [], params = [ctx.networkId];
  let i = startIdx + 1;
  if (ctx.storeIds.length) { parts.push(`a.store_id = ANY($${i}::uuid[])`); params.push(ctx.storeIds); i++; }
  if (ctx.supplierIds.length) { parts.push(`a.supplier_id = ANY($${i}::uuid[])`); params.push(ctx.supplierIds); i++; }
  if (!parts.length) return { sql: '1=0', params: [], next: startIdx };
  return { sql: parts.join(' OR '), params, next: i };
}

const ACTIVE_STATUSES = ['solicitado', 'confirmado', 'chegada_registrada', 'aguardando_doca', 'em_recebimento'];

module.exports = { audit, notify, notifyStore, notifyNetworkAdmins, makeProtocol, appointmentScope, ACTIVE_STATUSES };
