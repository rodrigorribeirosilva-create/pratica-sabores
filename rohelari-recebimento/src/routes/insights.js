'use strict';
// Fases 4 e 6 — Dashboard, relatórios (CSV/PDF), notificações, auditoria, integração Sysmo (preparada)
const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db');
const auth = require('../auth');
const { audit } = require('../services');
const { cleanString, toInt } = require('../validate');

const router = express.Router();
router.use(auth.requireAuth);

const scopeAppts = (ctx) => {
  // fragmento + params iniciais (a = appointments alias)
  if (ctx.isRedeAdmin) return { sql: 'a.network_id=$1', params: [ctx.networkId], next: 2 };
  const parts = [], params = [ctx.networkId];
  let i = 2;
  if (ctx.storeIds.length) { parts.push(`a.store_id = ANY($${i}::uuid[])`); params.push(ctx.storeIds); i++; }
  if (ctx.supplierIds.length) { parts.push(`a.supplier_id = ANY($${i}::uuid[])`); params.push(ctx.supplierIds); i++; }
  if (!parts.length) return { sql: '1=0', params: [], next: 1 };
  // network_id sempre referenciado no fragmento (PGlite exige tipo inferível para todo parâmetro)
  return { sql: `a.network_id=$1 AND (${parts.join(' OR ')})`, params, next: i };
};

// ---------------------------------------------------------------- DASHBOARD
router.get('/dashboard', async (req, res, next) => {
  try {
    const ctx = req.ctx;
    const date = cleanString(req.query.date, 10) || new Date().toISOString().slice(0, 10);
    const storeId = cleanString(req.query.store_id, 40);

    // Fornecedores: painel próprio
    if (auth.isSupplierUser(ctx) && !ctx.isRedeAdmin && !ctx.storeIds.length) {
      const { rows } = await db.query(
        `SELECT
           count(*) FILTER (WHERE delivery_date >= CURRENT_DATE AND status IN ('solicitado','confirmado'))::int AS proximos,
           count(*) FILTER (WHERE status='solicitado')::int AS aguardando_aprovacao,
           count(*) FILTER (WHERE status='confirmado')::int AS confirmados,
           count(*) FILTER (WHERE status IN ('concluido','parcial'))::int AS concluidos,
           count(*) FILTER (WHERE status='cancelado')::int AS cancelados,
           count(*)::int AS total
         FROM appointments a WHERE a.network_id=$1 AND a.supplier_id = ANY($2::uuid[])`,
        [ctx.networkId, ctx.supplierIds]);
      const { rows: upcoming } = await db.query(
        `SELECT a.id, a.protocol, a.delivery_date, a.slot_time, a.status, a.plate, s.name AS store_name
           FROM appointments a JOIN stores s ON s.id=a.store_id
          WHERE a.network_id=$1 AND a.supplier_id = ANY($2::uuid[]) AND a.delivery_date >= CURRENT_DATE
            AND a.status NOT IN ('cancelado','recusado','nao_compareceu')
          ORDER BY a.delivery_date, a.slot_time LIMIT 10`,
        [ctx.networkId, ctx.supplierIds]);
      return res.json({ role: 'fornecedor', metrics: rows[0], upcoming });
    }

    const sc = scopeAppts(ctx);
    const dIdx = sc.next;
    const params = [...sc.params, date];
    let storeFilter = '';
    if (storeId) { storeFilter = ` AND a.store_id=$${dIdx + 1}`; params.push(storeId); }

    const { rows } = await db.query(
      `SELECT
         count(*) FILTER (WHERE a.delivery_date = $${dIdx})::int AS agendados_hoje,
         count(*) FILTER (WHERE a.delivery_date = $${dIdx} AND a.status='confirmado')::int AS confirmados_hoje,
         count(*) FILTER (WHERE a.delivery_date = $${dIdx} AND a.status IN ('chegada_registrada','aguardando_doca'))::int AS aguardando_hoje,
         count(*) FILTER (WHERE a.delivery_date = $${dIdx} AND a.status='em_recebimento')::int AS em_recebimento_hoje,
         count(*) FILTER (WHERE a.completed_at::date = $${dIdx})::int AS finalizados_hoje,
         count(*) FILTER (WHERE a.delivery_date = $${dIdx} AND a.status='parcial')::int AS parciais_hoje,
         count(*) FILTER (WHERE a.delivery_date = $${dIdx} AND a.status='solicitado')::int AS pendentes,
         count(*) FILTER (WHERE a.delivery_date = $${dIdx} AND a.status='cancelado')::int AS cancelados_hoje,
         count(*) FILTER (WHERE a.status='atrasado' OR (a.delivery_date < CURRENT_DATE AND a.status IN ('confirmado','solicitado','atrasado') AND a.arrived_at IS NULL))::int AS atrasados,
         count(*) FILTER (WHERE a.status='nao_compareceu')::int AS nao_compareceram_30d
       FROM appointments a WHERE ${sc.sql}${storeFilter}`,
      params);

    // Visão por loja (rede: todas; equipe: apenas as suas)
    const byStoreSqlBase = `SELECT s.id, s.name, s.code,
              count(*) FILTER (WHERE a.delivery_date = $2)::int AS agendados,
              count(*) FILTER (WHERE a.delivery_date = $2 AND a.status IN ('chegada_registrada','aguardando_doca','em_recebimento'))::int AS em_operacao,
              count(*) FILTER (WHERE a.delivery_date = $2 AND a.status='solicitado')::int AS pendentes,
              (SELECT count(*)::int FROM docks d WHERE d.store_id=s.id AND d.status='livre') AS docas_livres,
              (SELECT count(*)::int FROM docks d WHERE d.store_id=s.id) AS docas_total
         FROM stores s LEFT JOIN appointments a ON a.store_id = s.id
        WHERE s.network_id=$1`;
    let byStoreSql = byStoreSqlBase;
    let byStoreParams = [ctx.networkId, date];
    if (!ctx.isRedeAdmin) { byStoreSql += ' AND s.id = ANY($3::uuid[])'; byStoreParams = [ctx.networkId, date, ctx.storeIds]; }
    byStoreSql += ' GROUP BY s.id, s.name, s.code ORDER BY s.name';
    const { rows: byStore } = await db.query(byStoreSql, byStoreParams);

    const upParams = [...sc.params, date];
    let upSql = `SELECT a.id, a.protocol, a.delivery_date, a.slot_time, a.status, a.plate, s.name AS store_name, sup.legal_name AS supplier_name
         FROM appointments a JOIN stores s ON s.id=a.store_id JOIN suppliers sup ON sup.id=a.supplier_id
        WHERE ${sc.sql} AND a.delivery_date >= $${sc.next} AND a.status NOT IN ('cancelado','recusado','nao_compareceu','concluido','parcial')`;
    if (storeId) { upSql += ` AND a.store_id=$${upParams.length + 1}`; upParams.push(storeId); }
    upSql += ' ORDER BY a.delivery_date, a.slot_time LIMIT 12';
    const { rows: upcoming } = await db.query(upSql, upParams);

    res.json({ role: ctx.isRedeAdmin ? 'rede' : 'loja', date, metrics: rows[0], byStore, upcoming });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- RELATÓRIOS
function reportFilters(req) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : new Date().toISOString().slice(0, 10);
  return { from, to, store_id: cleanString(req.query.store_id, 40), supplier_id: cleanString(req.query.supplier_id, 40) };
}

async function reportData(req) {
  const ctx = req.ctx;
  const f = reportFilters(req);
  const sc = scopeAppts(ctx);
  const params = [...sc.params, f.from, f.to];
  let i = sc.next + 2;
  let extra = '';
  if (f.store_id) { if (!auth.canAccessStore(ctx, f.store_id)) { const e = new Error('sem_permissao'); e.status = 403; throw e; } extra += ` AND a.store_id=$${i++}`; params.push(f.store_id); }
  if (f.supplier_id) { extra += ` AND a.supplier_id=$${i++}`; params.push(f.supplier_id); }
  const where = `${sc.sql} AND a.delivery_date BETWEEN $${sc.next} AND $${sc.next + 1}${extra}`;

  const summaryQ = db.query(
    `SELECT
       count(*)::int AS total_agendados,
       count(*) FILTER (WHERE a.status IN ('concluido','parcial'))::int AS concluidos,
       count(*) FILTER (WHERE a.status='concluido')::int AS total_recebimentos,
       count(*) FILTER (WHERE a.status='parcial')::int AS parciais,
       count(*) FILTER (WHERE a.status='cancelado')::int AS cancelamentos,
       count(*) FILTER (WHERE a.status='recusado')::int AS recusados,
       count(*) FILTER (WHERE a.status='nao_compareceu')::int AS faltas,
       count(*) FILTER (WHERE a.arrived_at IS NOT NULL AND (a.delivery_date + a.slot_time + interval '30 minutes') < a.arrived_at)::int AS atrasos,
       count(*) FILTER (WHERE a.arrived_at IS NOT NULL AND (a.delivery_date + a.slot_time + interval '30 minutes') >= a.arrived_at)::int AS pontuais,
       count(DISTINCT a.store_id)::int AS lojas,
       COALESCE(avg(GREATEST(0, EXTRACT(EPOCH FROM (a.arrived_at - (a.delivery_date + a.slot_time)))/60)) FILTER (WHERE a.arrived_at IS NOT NULL), 0)::int AS espera_media_min,
       COALESCE(avg(EXTRACT(EPOCH FROM (a.completed_at - a.started_at))/60) FILTER (WHERE a.completed_at IS NOT NULL AND a.started_at IS NOT NULL), 0)::int AS recebimento_medio_min
     FROM appointments a WHERE ${where}`, params);

  const bySupplierQ = db.query(
    `SELECT sup.legal_name AS fornecedor, count(*)::int AS agendados,
            count(*) FILTER (WHERE a.status IN ('concluido','parcial'))::int AS entregas,
            count(*) FILTER (WHERE a.status='cancelado')::int AS cancelamentos,
            count(*) FILTER (WHERE a.status='nao_compareceu')::int AS faltas,
            count(*) FILTER (WHERE a.arrived_at IS NOT NULL AND (a.delivery_date + a.slot_time + interval '30 minutes') < a.arrived_at)::int AS atrasos
       FROM appointments a JOIN suppliers sup ON sup.id=a.supplier_id
      WHERE ${where}
      GROUP BY sup.legal_name ORDER BY agendados DESC LIMIT 50`, params);

  const byStoreQ = db.query(
    `SELECT s.name AS loja, s.code AS codigo, count(*)::int AS agendados,
            count(*) FILTER (WHERE a.status IN ('concluido','parcial'))::int AS recebidos,
            count(*) FILTER (WHERE a.status='cancelado')::int AS cancelamentos,
            count(*) FILTER (WHERE a.status='nao_compareceu')::int AS faltas,
            COALESCE(avg(EXTRACT(EPOCH FROM (a.completed_at - a.started_at))/60) FILTER (WHERE a.completed_at IS NOT NULL AND a.started_at IS NOT NULL), 0)::int AS recebimento_medio_min
       FROM appointments a JOIN stores s ON s.id=a.store_id
      WHERE ${where}
      GROUP BY s.name, s.code ORDER BY agendados DESC`, params);

  const byDayQ = db.query(
    `SELECT a.delivery_date::text AS dia, count(*)::int AS agendados,
            count(*) FILTER (WHERE a.status IN ('concluido','parcial'))::int AS recebidos
       FROM appointments a WHERE ${where}
      GROUP BY a.delivery_date ORDER BY a.delivery_date`, params);

  const [summary, bySupplier, byStore, byDay] = await Promise.all([summaryQ, bySupplierQ, byStoreQ, byDayQ]);
  const totalEntregas = summary.rows[0].concluidos || 0;
  const agendados = summary.rows[0].total_agendados || 0;
  const metrics = {
    ...summary.rows[0],
    indice_faltas: agendados ? Math.round((summary.rows[0].faltas / agendados) * 1000) / 10 : 0,
    taxa_cancelamento: agendados ? Math.round((summary.rows[0].cancelamentos / agendados) * 1000) / 10 : 0,
    taxa_pontualidade: totalEntregas + summary.rows[0].atrasos ? Math.round((summary.rows[0].pontuais / (summary.rows[0].pontuais + summary.rows[0].atrasos)) * 1000) / 10 : null,
  };
  return { periodo: { from: f.from, to: f.to, store_id: f.store_id || null, supplier_id: f.supplier_id || null }, summary: metrics, bySupplier: bySupplier.rows, byStore: byStore.rows, byDay: byDay.rows };
}

router.get('/reports/summary', async (req, res, next) => {
  try { res.json(await reportData(req)); } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
});

router.get('/reports/export.csv', async (req, res, next) => {
  try {
    const d = await reportData(req);
    const lines = [];
    lines.push(`# ROHELARI RECEBIMENTO — Relatório ${d.periodo.from} a ${d.periodo.to}`);
    lines.push('Indicador;Valor');
    const s = d.summary;
    const map = {
      'Total agendado': s.total_agendados, 'Entregas concluídas': s.concluidos, 'Recebimentos totais': s.total_recebimentos,
      'Parciais': s.parciais, 'Cancelamentos': s.cancelamentos, 'Recusados': s.recusados, 'Faltas (não compareceu)': s.faltas,
      'Entregas pontuais': s.pontuais, 'Entregas atrasadas': s.atrasos, 'Espera média (min)': s.espera_media_min,
      'Recebimento médio (min)': s.recebimento_medio_min, 'Índice de faltas (%)': s.indice_faltas,
      'Taxa de cancelamento (%)': s.taxa_cancelamento, 'Taxa de pontualidade (%)': s.taxa_pontualidade ?? '',
    };
    for (const [k, v] of Object.entries(map)) lines.push(`${k};${v}`);
    lines.push(''); lines.push('Fornecedor;Agendados;Entregas;Atrasos;Faltas;Cancelamentos');
    for (const r of d.bySupplier) lines.push([r.fornecedor, r.agendados, r.entregas, r.atrasos, r.faltas, r.cancelamentos].join(';'));
    lines.push(''); lines.push('Loja;Código;Agendados;Recebidos;Cancelamentos;Faltas;Recebimento médio (min)');
    for (const r of d.byStore) lines.push([r.loja, r.codigo, r.agendados, r.recebidos, r.cancelamentos, r.faltas, r.recebimento_medio_min].join(';'));
    lines.push(''); lines.push('Dia;Agendados;Recebidos');
    for (const r of d.byDay) lines.push([r.dia, r.agendados, r.recebidos].join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rohelari-recebimento-${d.periodo.from}-a-${d.periodo.to}.csv"`);
    res.send('\ufeff' + lines.join('\r\n'));
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
});

router.get('/reports/export.pdf', async (req, res, next) => {
  try {
    const d = await reportData(req);
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rohelari-recebimento-${d.periodo.from}-a-${d.periodo.to}.pdf"`);
    doc.pipe(res);
    const GREEN = '#15803d', DARK = '#111111';
    doc.rect(0, 0, doc.page.width, 70).fill(DARK);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('ROHELARI RECEBIMENTO', 40, 18);
    doc.fontSize(10).font('Helvetica').fillColor('#86efac').text(`Relatório de recebimento — ${d.periodo.from} a ${d.periodo.to}`, 40, 44);
    doc.moveDown(2);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('Indicadores do período', 40, 90);
    const s = d.summary;
    const rows = [
      ['Total agendado', s.total_agendados], ['Entregas concluídas', s.concluidos],
      ['Recebimentos totais', s.total_recebimentos], ['Parciais', s.parciais],
      ['Entregas pontuais', s.pontuais], ['Entregas atrasadas', s.atrasos],
      ['Cancelamentos', s.cancelamentos], ['Faltas (não compareceu)', s.faltas],
      ['Espera média', `${s.espera_media_min} min`], ['Recebimento médio', `${s.recebimento_medio_min} min`],
      ['Índice de faltas', `${s.indice_faltas}%`], ['Taxa de pontualidade', s.taxa_pontualidade === null ? '—' : `${s.taxa_pontualidade}%`],
    ];
    let y = 115;
    for (const [k, v] of rows) {
      doc.rect(40, y, 515, 20).fill('#f3f4f6');
      doc.fillColor(DARK).font('Helvetica').fontSize(10).text(String(k), 48, y + 5);
      doc.font('Helvetica-Bold').text(String(v), 400, y + 5, { width: 148, align: 'right' });
      y += 24;
    }
    y += 8;
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12).text('Desempenho por fornecedor (top 10)', 40, y); y += 18;
    doc.fontSize(9);
    const colX = [40, 330, 400, 455, 510];
    doc.fillColor('#374151').font('Helvetica-Bold');
    ['Fornecedor', 'Agendados', 'Entregas', 'Atrasos', 'Faltas'].forEach((h, i2) => doc.text(h, colX[i2], y)); y += 14;
    doc.font('Helvetica').fillColor(DARK);
    for (const r of d.bySupplier.slice(0, 10)) {
      if (y > 780) { doc.addPage(); y = 50; }
      doc.text(String(r.fornecedor).slice(0, 48), colX[0], y);
      doc.text(String(r.agendados), colX[1], y); doc.text(String(r.entregas), colX[2], y);
      doc.text(String(r.atrasos), colX[3], y); doc.text(String(r.faltas), colX[4], y);
      y += 14;
    }
    y += 8;
    if (y > 720) { doc.addPage(); y = 50; }
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(12).text('Desempenho por loja', 40, y); y += 18;
    doc.fontSize(9).fillColor('#374151');
    ['Loja', 'Agendados', 'Recebidos', 'Cancel.', 'Faltas'].forEach((h, i2) => doc.text(h, colX[i2], y)); y += 14;
    doc.font('Helvetica').fillColor(DARK);
    for (const r of d.byStore) {
      if (y > 780) { doc.addPage(); y = 50; }
      doc.text(`${r.loja} (${r.codigo})`.slice(0, 48), colX[0], y);
      doc.text(String(r.agendados), colX[1], y); doc.text(String(r.recebidos), colX[2], y);
      doc.text(String(r.cancelamentos), colX[3], y); doc.text(String(r.faltas), colX[4], y);
      y += 14;
    }
    doc.moveDown();
    doc.fontSize(8).fillColor('#6b7280').text('Documento gerado pelo ROHELARI RECEBIMENTO. Valores referem-se ao período filtrado e ao escopo de acesso do usuário.', 40, Math.min(y + 20, 800));
    doc.end();
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); next(e); }
});

// ---------------------------------------------------------------- NOTIFICAÇÕES
router.get('/notifications', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT id, type, channel, title, body, status, read_at, created_at, appointment_id
         FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60`, [req.ctx.user.id]);
    const unread = rows.filter(r => !r.read_at).length;
    res.json({ notifications: rows, unread });
  } catch (e) { next(e); }
});
router.post('/notifications/:id/read', async (req, res, next) => {
  try {
    await db.query('UPDATE notifications SET read_at=now(), status=\'lida\' WHERE id=$1 AND user_id=$2', [req.params.id, req.ctx.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post('/notifications/read-all', async (req, res, next) => {
  try {
    await db.query("UPDATE notifications SET read_at=now(), status='lida' WHERE user_id=$1 AND read_at IS NULL", [req.ctx.user.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- AUDITORIA
router.get('/audit', async (req, res, next) => {
  try {
    const ctx = req.ctx;
    if (!ctx.isRedeAdmin && !ctx.storeIds.length) return res.status(403).json({ error: 'sem_permissao' });
    const params = [ctx.networkId];
    let sql = `SELECT a.id, a.action, a.entity, a.entity_id, a.details, a.ip, a.created_at, u.name AS user_name, s.name AS store_name
                 FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN stores s ON s.id=a.store_id
                WHERE a.network_id=$1`;
    if (!ctx.isRedeAdmin) { sql += ' AND a.store_id = ANY($2::uuid[])'; params.push(ctx.storeIds); }
    sql += ' ORDER BY a.created_at DESC LIMIT 150';
    const { rows } = await db.query(sql, params);
    res.json({ logs: rows });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- INTEGRAÇÃO SYSMO (Fase 7 — preparada, não executa)
router.get('/integration/status', async (req, res, next) => {
  try {
    if (!req.ctx.isRedeAdmin) return res.status(403).json({ error: 'acesso_restrito_rede_admin' });
    const { rows: nets } = await db.query('SELECT sysmo_enabled, name FROM networks WHERE id=$1', [req.ctx.networkId]);
    const { rows: counts } = await db.query("SELECT status, count(*)::int AS n FROM integration_outbox WHERE network_id=$1 GROUP BY status", [req.ctx.networkId]);
    const { rows: last } = await db.query("SELECT event, status, created_at FROM integration_outbox WHERE network_id=$1 ORDER BY created_at DESC LIMIT 5", [req.ctx.networkId]);
    res.json({
      sysmo: {
        enabled: nets[0]?.sysmo_enabled || false,
        status: 'aguardando_documentacao',
        message: 'Integração com Sysmo S1 preparada (campos NF-e, códigos de loja/fornecedor e fila outbox). Nenhum dado é enviado: depende de documentação e autorização oficiais.',
        outbox: counts,
        latest: last,
      },
    });
  } catch (e) { next(e); }
});

module.exports = router;
