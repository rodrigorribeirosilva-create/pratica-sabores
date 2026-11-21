'use strict';
// Fases 3 e 5 — Agenda inteligente (30 min), agendamentos, ciclo operacional
// chegada → fila/doca → conferência → conclusão, com histórico e auditoria.
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { audit, notify, notifyStore, makeProtocol, appointmentScope, ACTIVE_STATUSES } = require('../services');
const { cleanString, toInt, isPlate, normalizePlate, validCPF, onlyDigits, validCNPJ, isEmail } = require('../validate');

const router = express.Router();

const INACTIVE = ['cancelado', 'recusado', 'nao_compareceu'];

function isoWeekday(dateStr) { const d = new Date(dateStr + 'T00:00:00Z'); return ((d.getUTCDay() + 6) % 7) + 1; }
function nowDateStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function badHour(t) { return !/^[0-2][0-9]:[0-5][0-9]$/.test(t); }
function slotAligned(t) { return /^[0-2][0-9]:(00|30)$/.test(t); }

async function effectiveCapacity(q, storeId, slotTime) {
  const { rows } = await q(
    `SELECT COALESCE((SELECT capacity FROM store_slot_capacity WHERE store_id=$1 AND slot_time=$2),
                     (SELECT capacity_per_slot FROM stores WHERE id=$1)) AS capacity`,
    [storeId, slotTime]);
  return rows[0] ? Number(rows[0].capacity) : 1;
}
async function blockedReason(q, storeId, date, slotTime) {
  const { rows } = await q(
    `SELECT reason, slot_time FROM blocked_slots
      WHERE store_id=$1 AND block_date=$2 AND (slot_time IS NULL OR slot_time=$3)
      ORDER BY slot_time NULLS FIRST LIMIT 1`, [storeId, date, slotTime]);
  if (!rows.length) return null;
  return rows[0].slot_time === null ? (rows[0].reason || 'Dia bloqueado pela loja') : (rows[0].reason || 'Horário bloqueado pela loja');
}
async function usedCapacity(q, storeId, date, slotTime) {
  const { rows } = await q(
    `SELECT count(*)::int AS used FROM appointments
      WHERE store_id=$1 AND delivery_date=$2 AND slot_time=$3 AND status <> ALL($4::text[])`,
    [storeId, date, slotTime, INACTIVE]);
  return rows[0].used;
}

// ---------------------------------------------------------------- AGENDA / DISPONIBILIDADE
router.get('/agenda/availability', auth.requireAuth, async (req, res, next) => {
  try {
    const storeId = cleanString(req.query.store_id, 40);
    const date = cleanString(req.query.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'data_invalida' });
    const { rows: stores } = await db.query('SELECT * FROM stores WHERE id=$1 AND network_id=$2', [storeId, req.ctx.networkId]);
    if (!stores.length) return res.status(404).json({ error: 'loja_nao_encontrada' });
    const store = stores[0];
    const weekday = isoWeekday(date);
    const operating = store.weekdays.split(',').map(s => Number(s.trim())).includes(weekday);
    const dayBlock = await blockedReason(db.query.bind(db), storeId, date, '00:00');
    const slots = [];
    if (operating && store.status === 'ativo') {
      const [sh, sm] = store.receiving_start.slice(0, 5).split(':').map(Number);
      const [eh, em] = store.receiving_end.slice(0, 5).split(':').map(Number);
      let cur = sh * 60 + sm; const end = eh * 60 + em;
      while (cur < end) {
        const t = `${String(Math.floor(cur / 60)).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`;
        const cap = await effectiveCapacity(db.query.bind(db), storeId, t);
        const used = await usedCapacity(db.query.bind(db), storeId, date, t);
        const block = await blockedReason(db.query.bind(db), storeId, date, t);
        slots.push({ time: t, capacity: cap, used, available: !block && used < cap, blocked: !!block, reason: block });
        cur += 30;
      }
    }
    res.json({ store: { id: store.id, name: store.name, approval_mode: store.approval_mode, receiving_start: store.receiving_start, receiving_end: store.receiving_end, weekdays: store.weekdays }, date, isOperatingDay: operating && store.status === 'ativo', slots });
  } catch (e) { next(e); }
});

// Painel de agendamentos do dia para a equipe (fila operacional)
router.get('/agenda/day', auth.requireAuth, async (req, res, next) => {
  try {
    const date = cleanString(req.query.date, 10) || nowDateStr();
    const storeId = cleanString(req.query.store_id, 40);
    const params = [req.ctx.networkId, date];
    let sql = `SELECT a.*, s.name AS store_name, sup.legal_name AS supplier_name, sup.trade_name AS supplier_trade,
                      c.trade_name AS carrier_name, pc.name AS category_label
                 FROM appointments a
                 JOIN stores s ON s.id = a.store_id
                 JOIN suppliers sup ON sup.id = a.supplier_id
                 LEFT JOIN carriers c ON c.id = a.carrier_id
                 LEFT JOIN product_categories pc ON pc.id = a.category_id
                WHERE a.network_id=$1 AND a.delivery_date=$2`;
    if (storeId) { sql += ' AND a.store_id=$3'; params.push(storeId); }
    else if (!req.ctx.isRedeAdmin) { sql += ' AND (a.store_id = ANY($3::uuid[]) OR a.supplier_id = ANY($4::uuid[]))'; params.push(req.ctx.storeIds, req.ctx.supplierIds); }
    sql += ' ORDER BY a.slot_time, a.created_at';
    const { rows } = await db.query(sql, params);
    res.json({ date, appointments: rows });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- CRIAR AGENDAMENTO
router.post('/appointments', auth.requireAuth, async (req, res, next) => {
  try {
    const ctx = req.ctx;
    const b = req.body;
    const storeId = cleanString(b.store_id, 40);
    const date = cleanString(b.delivery_date, 10);
    const slotTime = cleanString(b.slot_time, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'data_invalida' });
    if (badHour(slotTime) || !slotAligned(slotTime)) return res.status(400).json({ error: 'horario_invalido', message: 'Use intervalos de 30 minutos (HH:00 ou HH:30).' });
    if (date < nowDateStr()) return res.status(400).json({ error: 'data_no_passado' });

    const supplierIsActor = auth.isSupplierUser(ctx) && !ctx.isRedeAdmin && !ctx.storeIds.length;
    const supplierId = supplierIsActor ? ctx.supplierIds[0] : cleanString(b.supplier_id, 40);
    if (!supplierId) return res.status(400).json({ error: 'fornecedor_obrigatorio' });
    if (!supplierIsActor && !auth.canAccessStore(ctx, storeId)) return res.status(403).json({ error: 'loja_fora_do_seu_acesso' });

    const { rows: stores } = await db.query('SELECT * FROM stores WHERE id=$1 AND network_id=$2 AND status=\'ativo\'', [storeId, ctx.networkId]);
    if (!stores.length) return res.status(404).json({ error: 'loja_nao_encontrada' });
    const store = stores[0];
    const { rows: sups } = await db.query('SELECT * FROM suppliers WHERE id=$1 AND network_id=$2', [supplierId, ctx.networkId]);
    if (!sups.length) return res.status(400).json({ error: 'fornecedor_nao_encontrado' });
    const supplier = sups[0];
    if (supplier.status !== 'ativo') return res.status(403).json({ error: 'fornecedor_inativo', message: 'Fornecedor inativo/pendente: aguarde liberação da rede.' });

    const weekday = isoWeekday(date);
    if (!store.weekdays.split(',').map(s => Number(s.trim())).includes(weekday)) {
      return res.status(400).json({ error: 'loja_fechada_no_dia', message: 'A loja não recebe neste dia da semana.' });
    }
    const [sh, sm] = store.receiving_start.slice(0, 5).split(':').map(Number);
    const [eh, em] = store.receiving_end.slice(0, 5).split(':').map(Number);
    const [th, tm] = slotTime.split(':').map(Number);
    const toMin = (h, m) => h * 60 + m;
    if (toMin(th, tm) < toMin(sh, sm) || toMin(th, tm) >= toMin(eh, em)) {
      return res.status(400).json({ error: 'fora_do_horario_de_recebimento', message: `A loja recebe das ${store.receiving_start.slice(0,5)} às ${store.receiving_end.slice(0,5)}.` });
    }

    // Dados do veículo/motorista
    const plate = b.plate ? normalizePlate(b.plate) : null;
    if (plate && !isPlate(plate)) return res.status(400).json({ error: 'placa_invalida' });
    const driverCpf = b.driver_cpf ? onlyDigits(b.driver_cpf) : null;
    if (driverCpf && !validCPF(driverCpf)) return res.status(400).json({ error: 'cpf_motorista_invalido' });
    const nfeKey = b.nfe_key ? onlyDigits(b.nfe_key) : null;
    if (nfeKey && nfeKey.length !== 44) return res.status(400).json({ error: 'chave_nfe_44_digitos' });
    const vehicleType = b.vehicle_type && ['carreta','truck','toco','van','utilitario','outro'].includes(b.vehicle_type) ? b.vehicle_type : null;
    const volumes = toInt(b.expected_volumes, null);
    if (volumes !== null && (volumes < 0 || volumes > 100000)) return res.status(400).json({ error: 'volumes_invalidos' });
    const invoiceNumber = cleanString(b.invoice_number, 60) || null;
    const nfeIssueDate = /^\d{4}-\d{2}-\d{2}$/.test(b.nfe_issue_date || '') ? b.nfe_issue_date : null;
    const nfeValue = b.nfe_value !== undefined && b.nfe_value !== '' && Number.isFinite(Number(b.nfe_value)) ? Number(b.nfe_value) : null;

    // ---- Transação com lock consultivo por loja+dia+faixa (evita overbooking)
    const result = await db.withTransaction(async (q) => {
      await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`appt:${storeId}:${date}:${slotTime}`]);

      const block = await blockedReason(q, storeId, date, slotTime);
      if (block) { const err = new Error(block); err.status = 409; err.code = 'horario_bloqueado'; throw err; }
      const cap = await effectiveCapacity(q, storeId, slotTime);
      const used = await usedCapacity(q, storeId, date, slotTime);
      if (used >= cap) { const err = new Error(`Loja sem capacidade para ${slotTime} (${cap} caminhão(ões) por horário).`); err.status = 409; err.code = 'horario_lotado'; throw err; }

      // Anti-duplicidade
      if (plate) {
        const dup = await q(
          `SELECT protocol FROM appointments WHERE store_id=$1 AND delivery_date=$2 AND slot_time=$3 AND plate=$4 AND status <> ALL($5::text[]) LIMIT 1`,
          [storeId, date, slotTime, plate, INACTIVE]);
        if (dup.rows.length) { const err = new Error(`Duplicado: placa ${plate} já possui agendamento ${dup.rows[0].protocol} neste horário.`); err.status = 409; err.code = 'duplicado_placa'; throw err; }
      }
      if (invoiceNumber) {
        const dup = await q(
          `SELECT protocol FROM appointments WHERE store_id=$1 AND delivery_date=$2 AND supplier_id=$3 AND invoice_number=$4 AND status <> ALL($5::text[]) LIMIT 1`,
          [storeId, date, supplierId, invoiceNumber, INACTIVE]);
        if (dup.rows.length) { const err = new Error(`Nota fiscal ${invoiceNumber} já agendada para esta loja nesta data (protocolo ${dup.rows[0].protocol}).`); err.status = 409; err.code = 'duplicado_nota'; throw err; }
      }
      if (nfeKey) {
        const dup = await q('SELECT protocol FROM appointments WHERE nfe_key=$1 LIMIT 1', [nfeKey]);
        if (dup.rows.length) { const err = new Error(`Chave NF-e já utilizada no protocolo ${dup.rows[0].protocol}.`); err.status = 409; err.code = 'duplicado_nfe'; throw err; }
      }

      // Protocolo único
      let protocol = makeProtocol(new Date(date + 'T00:00:00'));
      for (let attempt = 0; attempt < 5; attempt++) {
        const exists = await q('SELECT 1 FROM appointments WHERE protocol=$1', [protocol]);
        if (!exists.rows.length) break;
        protocol = makeProtocol(new Date(date + 'T00:00:00'));
      }

      const auto = store.approval_mode === 'auto';
      const status = auto ? 'confirmado' : 'solicitado';
      const inserted = await q(
        `INSERT INTO appointments(
           network_id, store_id, protocol, supplier_id, carrier_id, invoice_number, nfe_key, nfe_issue_date, nfe_value,
           driver_name, driver_cpf, plate, vehicle_type, category_id, category_name, expected_volumes, notes,
           delivery_date, slot_time, status, created_by, approved_by, approved_at, integration_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,'pendente')
         RETURNING *`,
        [ctx.networkId, storeId, protocol, supplierId, b.carrier_id || null, invoiceNumber, nfeKey, nfeIssueDate, nfeValue,
         cleanString(b.driver_name, 200) || null, driverCpf, plate, vehicleType, b.category_id || null,
         cleanString(b.category_name, 120) || null, volumes, cleanString(b.notes, 1000) || null,
         date, slotTime, status, ctx.user.id, auto ? ctx.user.id : null, auto ? new Date().toISOString() : null]);
      const appt = inserted.rows[0];
      await q('INSERT INTO appointment_status_history(appointment_id, from_status, to_status, changed_by, note) VALUES ($1, NULL, $2, $3, $4)',
        [appt.id, status, ctx.user.id, auto ? 'Aprovação automática (configuração da loja)' : 'Solicitação criada']);
      // Fase 7 — trilha de integração (nunca enviada sem credencial/documentação)
      await q(
        `INSERT INTO integration_outbox(network_id, appointment_id, target, event, payload, status)
         VALUES ($1,$2,'sysmo_s1','agendamento_criado',$3,'desativada')`,
        [ctx.networkId, appt.id, JSON.stringify({ protocol, store_id: storeId, sysmo_store_code: store.sysmo_store_code || null, supplier_id: supplierId, invoice_number: invoiceNumber, nfe_key: nfeKey, nfe_issue_date: nfeIssueDate, nfe_value: nfeValue })]);
      return appt;
    });

    const appt = result;
    if (appt.status === 'confirmado') {
      await notifyStore(ctx.networkId, storeId, ['loja_gerente', 'recebimento'], { type: 'agendamento_confirmado', title: `Agendamento confirmado — ${appt.protocol}`, body: `${supplier.legal_name} em ${date} às ${slotTime} (aprovação automática).`, appointmentId: appt.id });
      await notifySupplierUsers(ctx.networkId, supplierId, { type: 'agendamento_aprovado', title: `Agendamento aprovado — ${appt.protocol}`, body: `Sua entrega em ${store.name} foi confirmada para ${date} às ${slotTime}.`, appointmentId: appt.id });
    } else {
      await notifyStore(ctx.networkId, storeId, ['loja_gerente'], { type: 'agendamento_solicitado', title: `Nova solicitação — ${appt.protocol}`, body: `${supplier.legal_name} pediu ${date} às ${slotTime}. Aguardando aprovação.`, appointmentId: appt.id });
      await notifySupplierUsers(ctx.networkId, supplierId, { type: 'agendamento_solicitado', title: `Solicitação enviada — ${appt.protocol}`, body: `Sua solicitação para ${store.name} em ${date} às ${slotTime} aguarda aprovação da loja.`, appointmentId: appt.id });
    }
    await audit(req, 'agendamento_criado', 'appointments', appt.id, { protocol: appt.protocol, store_id: storeId, status: appt.status });
    res.status(201).json({ appointment: appt });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.code || 'conflito', message: e.message });
    next(e);
  }
});

async function notifySupplierUsers(networkId, supplierId, payload) {
  const { rows } = await db.query('SELECT user_id FROM user_roles WHERE supplier_id=$1', [supplierId]);
  for (const r of rows) await notify({ networkId, userId: r.user_id, ...payload });
}

// ---------------------------------------------------------------- LISTAR / DETALHE
router.get('/appointments', auth.requireAuth, async (req, res, next) => {
  try {
    const ctx = req.ctx;
    const q = cleanString(req.query.q, 120).toLowerCase();
    const conditions = ['a.network_id=$1'];
    const params = [ctx.networkId];
    let i = 2;
    const add = (cond, val) => { conditions.push(cond.replace('$n', `$${i}`)); params.push(val); i++; };
    if (!ctx.isRedeAdmin) {
      const scope = [];
      if (ctx.storeIds.length) scope.push(`a.store_id = ANY($${i}::uuid[])`);
      const p1 = i; if (ctx.storeIds.length) { params.push(ctx.storeIds); i++; }
      if (ctx.supplierIds.length) { scope.push(`a.supplier_id = ANY($${i}::uuid[])`); params.push(ctx.supplierIds); i++; }
      if (!scope.length) { res.json({ appointments: [] }); return; }
      conditions.push('(' + scope.join(' OR ') + ')');
    }
    if (req.query.store_id) add('a.store_id=$n', req.query.store_id);
    if (req.query.supplier_id) add('a.supplier_id=$n', req.query.supplier_id);
    if (req.query.carrier_id) add('a.carrier_id=$n', req.query.carrier_id);
    if (req.query.category_id) add('a.category_id=$n', req.query.category_id);
    if (req.query.status) add('a.status=$n', req.query.status);
    if (req.query.plate) add('a.plate=$n', normalizePlate(req.query.plate));
    if (req.query.date_from) add('a.delivery_date>=$n', req.query.date_from);
    if (req.query.date_to) add('a.delivery_date<=$n', req.query.date_to);
    if (q) { conditions.push(`(lower(a.protocol) LIKE $${i} OR lower(COALESCE(a.invoice_number,'')) LIKE $${i} OR lower(COALESCE(a.driver_name,'')) LIKE $${i} OR lower(a.plate) LIKE $${i} OR lower(sup.legal_name) LIKE $${i})`); params.push(`%${q}%`); i++; }
    const page = Math.max(1, toInt(req.query.page, 1));
    const pageSize = Math.min(100, Math.max(10, toInt(req.query.pageSize, 25)));
    const where = conditions.join(' AND ');
    const countQ = await db.query(`SELECT count(*)::int AS total FROM appointments a JOIN suppliers sup ON sup.id=a.supplier_id WHERE ${where}`, params);
    params.push(pageSize, (page - 1) * pageSize);
    const { rows } = await db.query(
      `SELECT a.*, s.name AS store_name, sup.legal_name AS supplier_name, sup.trade_name AS supplier_trade,
              c.trade_name AS carrier_name, c.legal_name AS carrier_legal_name
         FROM appointments a
         JOIN stores s ON s.id=a.store_id
         JOIN suppliers sup ON sup.id=a.supplier_id
         LEFT JOIN carriers c ON c.id=a.carrier_id
        WHERE ${where}
        ORDER BY a.delivery_date DESC, a.slot_time DESC
        LIMIT $${i} OFFSET $${i + 1}`, params);
    res.json({ appointments: rows, total: countQ.rows[0].total, page, pageSize });
  } catch (e) { next(e); }
});

async function loadAppointment(req, res) {
  const { rows } = await db.query('SELECT * FROM appointments WHERE id=$1 AND network_id=$2', [req.params.id, req.ctx.networkId]);
  if (!rows.length) { res.status(404).json({ error: 'agendamento_nao_encontrado' }); return null; }
  const a = rows[0];
  const ctx = req.ctx;
  const allowed = ctx.isRedeAdmin || ctx.storeIds.includes(a.store_id) || ctx.supplierIds.includes(a.supplier_id);
  if (!allowed) { res.status(403).json({ error: 'sem_permissao' }); return null; }
  return a;
}

router.get('/appointments/:id', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    const [hist, store, supplier, carrier, receiving, divs, atts] = await Promise.all([
      db.query('SELECT h.*, u.name AS changed_by_name FROM appointment_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.appointment_id=$1 ORDER BY h.created_at', [a.id]),
      db.query('SELECT id, name, code, address, city, state, phone, receiving_start, receiving_end FROM stores WHERE id=$1', [a.store_id]),
      db.query('SELECT id, legal_name, trade_name, cnpj, phone, email FROM suppliers WHERE id=$1', [a.supplier_id]),
      a.carrier_id ? db.query('SELECT id, legal_name, trade_name, phone FROM carriers WHERE id=$1', [a.carrier_id]) : { rows: [] },
      db.query('SELECT * FROM receiving_records WHERE appointment_id=$1', [a.id]),
      db.query('SELECT * FROM receiving_divergences WHERE appointment_id=$1 ORDER BY created_at', [a.id]),
      db.query('SELECT id, filename, mime, size_bytes, created_at FROM attachments WHERE appointment_id=$1 ORDER BY created_at', [a.id]),
    ]);
    res.json({ appointment: a, history: hist.rows, store: store.rows[0], supplier: supplier.rows[0], carrier: carrier.rows[0] || null, receiving: receiving.rows[0] || null, divergences: divs.rows, attachments: atts.rows });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- TRANSIÇÕES DE STATUS
const ALLOWED_TRANSITIONS = {
  solicitado: ['confirmado', 'recusado', 'cancelado', 'atrasado', 'nao_compareceu'],
  confirmado: ['chegada_registrada', 'cancelado', 'atrasado', 'nao_compareceu'],
  atrasado: ['chegada_registrada', 'cancelado', 'nao_compareceu'],
  chegada_registrada: ['aguardando_doca', 'em_recebimento'],
  aguardando_doca: ['em_recebimento'],
  em_recebimento: ['concluido', 'parcial'],
};
async function changeStatus(req, res, { to, note, allowedRoles, extraUpdate }) {
  const a = await loadAppointment(req, res); if (!a) return null;
  const ctx = req.ctx;
  const storeScoped = ctx.isRedeAdmin || ctx.storeIds.includes(a.store_id);
  const supplierActor = ctx.supplierIds.includes(a.supplier_id) && !storeScoped;
  if (allowedRoles === 'staff' && !storeScoped) { res.status(403).json({ error: 'somente_equipe_da_loja' }); return null; }
  if (allowedRoles === 'staffOrSupplierCancel') {
    if (!storeScoped && !(supplierActor && ['solicitado', 'confirmado', 'atrasado'].includes(a.status) && !a.arrived_at)) {
      res.status(403).json({ error: 'cancelamento_nao_permitido', message: 'Cancelamento só antes da chegada do veículo.' });
      return null;
    }
  }
  if (!ALLOWED_TRANSITIONS[a.status]?.includes(to)) {
    res.status(409).json({ error: 'transicao_invalida', message: `Não é possível ir de "${a.status}" para "${to}".` });
    return null;
  }
  const updated = await db.withTransaction(async (q) => {
    const sets = ['status=$1', 'updated_at=now()'];
    const params = [to];
    let i = 2;
    if (extraUpdate) { for (const [col, val] of Object.entries(extraUpdate)) { sets.push(`${col}=$${i++}`); params.push(val); } }
    params.push(a.id);
    const r = await q(`UPDATE appointments SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, params);
    await q('INSERT INTO appointment_status_history(appointment_id, from_status, to_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)',
      [a.id, a.status, to, ctx.user.id, note || null]);
    return r.rows[0];
  });
  await audit(req, `status_${to}`, 'appointments', a.id, { from: a.status, to, note, store_id: a.store_id });
  return updated;
}

router.post('/appointments/:id/approve', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    if (!(req.ctx.isRedeAdmin || req.ctx.roles.some(r => r.store_id === a.store_id && r.role === 'loja_gerente'))) {
      return res.status(403).json({ error: 'somente_gerente_ou_rede' });
    }
    const updated = await db.withTransaction(async (q) => {
      const r = await q("UPDATE appointments SET status='confirmado', approved_by=$1, approved_at=now(), updated_at=now() WHERE id=$2 AND status='solicitado' RETURNING *", [req.ctx.user.id, a.id]);
      if (!r.rows.length) { const err = new Error('Apenas solicitações pendentes podem ser aprovadas.'); err.status = 409; throw err; }
      await q('INSERT INTO appointment_status_history(appointment_id, from_status, to_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)',
        [a.id, 'solicitado', 'confirmado', req.ctx.user.id, 'Aprovado manualmente']);
      return r.rows[0];
    });
    const { rows: sups } = await db.query('SELECT supplier_id FROM appointments WHERE id=$1', [a.id]);
    await notifySupplierUsers(req.ctx.networkId, sups[0]?.supplier_id, { type: 'agendamento_aprovado', title: `Agendamento aprovado — ${updated.protocol}`, body: `Sua entrega foi confirmada para ${updated.delivery_date} às ${updated.slot_time}.`, appointmentId: a.id });
    await audit(req, 'agendamento_aprovado', 'appointments', a.id, { protocol: updated.protocol, store_id: a.store_id });
    res.json({ appointment: updated });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: 'conflito', message: e.message }); next(e); }
});

router.post('/appointments/:id/refuse', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    if (!(req.ctx.isRedeAdmin || req.ctx.roles.some(r => r.store_id === a.store_id && r.role === 'loja_gerente'))) {
      return res.status(403).json({ error: 'somente_gerente_ou_rede' });
    }
    const note = cleanString(req.body.note, 500) || 'Solicitação recusada pela loja';
    const updated = await changeStatus(req, res, { to: 'recusado', note, allowedRoles: 'staff' });
    if (!updated) return;
    await notifySupplierUsers(req.ctx.networkId, a.supplier_id, { type: 'agendamento_recusado', title: `Agendamento recusado — ${a.protocol}`, body: note, appointmentId: a.id });
    res.json({ appointment: updated });
  } catch (e) { next(e); }
});

router.post('/appointments/:id/cancel', auth.requireAuth, async (req, res, next) => {
  try {
    const reason = cleanString(req.body.reason, 500) || 'Cancelado';
    const updated = await changeStatus(req, res, { to: 'cancelado', note: `Cancelado: ${reason}`, allowedRoles: 'staffOrSupplierCancel' });
    if (!updated) return;
    const counterpartIsSupplier = req.ctx.supplierIds.includes(updated.supplier_id) && !req.ctx.isRedeAdmin && !req.ctx.storeIds.includes(updated.store_id);
    if (counterpartIsSupplier) {
      await notifyStore(req.ctx.networkId, updated.store_id, ['loja_gerente', 'recebimento'], { type: 'agendamento_cancelado', title: `Cancelado pelo fornecedor — ${updated.protocol}`, body: reason, appointmentId: updated.id });
    } else {
      await notifySupplierUsers(req.ctx.networkId, updated.supplier_id, { type: 'agendamento_cancelado', title: `Agendamento cancelado — ${updated.protocol}`, body: reason, appointmentId: updated.id });
    }
    res.json({ appointment: updated });
  } catch (e) { next(e); }
});

// Reagendamento: equipe altera diretamente (com checagem de capacidade); fornecedor solicita note à loja
router.post('/appointments/:id/reschedule', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    const isStaff = req.ctx.isRedeAdmin || req.ctx.storeIds.includes(a.store_id);
    if (!isStaff) return res.status(403).json({ error: 'somente_equipe_da_loja' });
    if (a.arrived_at || ['em_recebimento', 'concluido', 'parcial', 'cancelado', 'recusado'].includes(a.status)) {
      return res.status(409).json({ error: 'reagendamento_nao_permitido', message: 'Agendamento já em andamento ou encerrado.' });
    }
    const date = cleanString(req.body.delivery_date, 10);
    const slotTime = cleanString(req.body.slot_time, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < nowDateStr()) return res.status(400).json({ error: 'data_invalida' });
    if (!slotAligned(slotTime)) return res.status(400).json({ error: 'horario_invalido' });
    const reason = cleanString(req.body.reason, 500) || 'Reagendado pela loja';
    const updated = await db.withTransaction(async (q) => {
      await q('SELECT pg_advisory_xact_lock(hashtext($1))', [`appt:${a.store_id}:${date}:${slotTime}`]);
      const block = await blockedReason(q, a.store_id, date, slotTime);
      if (block) { const err = new Error(block); err.status = 409; err.code = 'horario_bloqueado'; throw err; }
      const cap = await effectiveCapacity(q, a.store_id, slotTime);
      const used = await usedCapacity(q, a.store_id, date, slotTime);
      if (used >= cap) { const err = new Error('Nova faixa sem capacidade.'); err.status = 409; err.code = 'horario_lotado'; throw err; }
      const r = await q('UPDATE appointments SET delivery_date=$1, slot_time=$2, updated_at=now() WHERE id=$3 RETURNING *', [date, slotTime, a.id]);
      await q('INSERT INTO appointment_status_history(appointment_id, from_status, to_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)',
        [a.id, a.status, a.status, req.ctx.user.id, `Reagendado para ${date} ${slotTime}. Motivo: ${reason}`]);
      return r.rows[0];
    });
    await notifySupplierUsers(req.ctx.networkId, a.supplier_id, { type: 'agendamento_alterado', title: `Horário alterado — ${a.protocol}`, body: `Seu agendamento foi reagendado para ${date} às ${slotTime}. Motivo: ${reason}`, appointmentId: a.id });
    await audit(req, 'agendamento_reagendado', 'appointments', a.id, { from: { date: a.delivery_date, slot: a.slot_time }, to: { date, slotTime }, reason, store_id: a.store_id });
    res.json({ appointment: updated });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.code || 'conflito', message: e.message }); next(e); }
});

// Fornecedor solicita alteração (não altera sozinho — decisão é da loja)
router.post('/appointments/:id/request-change', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    const supplierActor = req.ctx.supplierIds.includes(a.supplier_id);
    if (!supplierActor && !req.ctx.isRedeAdmin) return res.status(403).json({ error: 'sem_permissao' });
    const message = cleanString(req.body.message, 1000);
    if (!message) return res.status(400).json({ error: 'mensagem_obrigatoria' });
    await notifyStore(req.ctx.networkId, a.store_id, ['loja_gerente', 'recebimento'], { type: 'solicitacao_alteracao', title: `Alteração solicitada — ${a.protocol}`, body: message, appointmentId: a.id });
    await audit(req, 'alteracao_solicitada', 'appointments', a.id, { message, store_id: a.store_id });
    res.json({ ok: true, message: 'Solicitação enviada à loja.' });
  } catch (e) { next(e); }
});

router.post('/appointments/:id/arrival', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    if (!(req.ctx.isRedeAdmin || req.ctx.storeIds.includes(a.store_id))) return res.status(403).json({ error: 'somente_equipe_da_loja' });
    const updated = await changeStatus(req, res, { to: 'chegada_registrada', note: 'Chegada do caminhão registrada', allowedRoles: 'staff', extraUpdate: { arrived_at: new Date().toISOString() } });
    if (updated) res.json({ appointment: updated });
  } catch (e) { next(e); }
});

router.post('/appointments/:id/assign-dock', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    if (!(req.ctx.isRedeAdmin || req.ctx.storeIds.includes(a.store_id))) return res.status(403).json({ error: 'somente_equipe_da_loja' });
    const dockId = cleanString(req.body.dock_id, 40);
    const { rows: docks } = await db.query('SELECT * FROM docks WHERE id=$1 AND store_id=$2 AND network_id=$3', [dockId, a.store_id, req.ctx.networkId]);
    if (!docks.length) return res.status(400).json({ error: 'doca_nao_encontrada' });
    if (docks[0].status === 'manutencao') return res.status(409).json({ error: 'doca_em_manutencao' });
    const target = a.status === 'chegada_registrada' ? 'aguardando_doca' : a.status;
    const updated = await db.withTransaction(async (q) => {
      await q('UPDATE docks SET status=$1 WHERE id=$2', ['ocupada', dockId]);
      // Libera doca anterior, se houver
      if (a.dock_id && a.dock_id !== dockId) await q("UPDATE docks SET status='livre' WHERE id=$1", [a.dock_id]);
      const r = await q('UPDATE appointments SET dock_id=$1, dock_assigned_at=now(), status=$2, updated_at=now() WHERE id=$3 RETURNING *', [dockId, target, a.id]);
      await q('INSERT INTO appointment_status_history(appointment_id, from_status, to_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)',
        [a.id, a.status, target, req.ctx.user.id, `Doca atribuída: ${docks[0].name}`]);
      return r.rows[0];
    });
    await audit(req, 'doca_atribuida', 'appointments', a.id, { dock_id: dockId, dock: docks[0].name, store_id: a.store_id });
    res.json({ appointment: updated });
  } catch (e) { next(e); }
});

router.post('/appointments/:id/start-conference', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    if (!(req.ctx.isRedeAdmin || req.ctx.storeIds.includes(a.store_id))) return res.status(403).json({ error: 'somente_equipe_da_loja' });
    if (!['chegada_registrada', 'aguardando_doca'].includes(a.status)) {
      return res.status(409).json({ error: 'conferencia_nao_permitida', message: 'Registre a chegada antes de iniciar a conferência.' });
    }
    const updated = await db.withTransaction(async (q) => {
      const r = await q("UPDATE appointments SET status='em_recebimento', started_at=COALESCE(started_at, now()), updated_at=now() WHERE id=$1 RETURNING *", [a.id]);
      await q(
        `INSERT INTO receiving_records(appointment_id, network_id, store_id, invoice_number, supplier_id, responsible_name, expected_volumes, started_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (appointment_id) DO NOTHING`,
        [a.id, req.ctx.networkId, a.store_id, a.invoice_number, a.supplier_id, req.ctx.user.name, a.expected_volumes, req.ctx.user.id]);
      await q('INSERT INTO appointment_status_history(appointment_id, from_status, to_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)',
        [a.id, a.status, 'em_recebimento', req.ctx.user.id, 'Conferência iniciada']);
      if (a.dock_id) await q("UPDATE docks SET status='ocupada' WHERE id=$1", [a.dock_id]);
      return r.rows[0];
    });
    await audit(req, 'conferencia_iniciada', 'appointments', a.id, { store_id: a.store_id });
    res.json({ appointment: updated });
  } catch (e) { next(e); }
});

router.post('/appointments/:id/divergences', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    if (!(req.ctx.isRedeAdmin || req.ctx.storeIds.includes(a.store_id))) return res.status(403).json({ error: 'somente_equipe_da_loja' });
    if (a.status !== 'em_recebimento') return res.status(409).json({ error: 'conferencia_nao_iniciada' });
    const type = ['falta', 'avaria', 'excesso', 'divergencia', 'produto_faltante'].includes(req.body.type) ? req.body.type : null;
    const description = cleanString(req.body.description, 500);
    const quantity = req.body.quantity !== undefined && req.body.quantity !== '' ? Number(req.body.quantity) : null;
    if (!type || !description) return res.status(400).json({ error: 'tipo_e_descricao_obrigatorios' });
    const { rows: rec } = await db.query('SELECT id FROM receiving_records WHERE appointment_id=$1', [a.id]);
    if (!rec.length) return res.status(409).json({ error: 'conferencia_nao_iniciada' });
    const { rows } = await db.query(
      'INSERT INTO receiving_divergences(receiving_id, appointment_id, type, description, quantity) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [rec[0].id, a.id, type, description, Number.isFinite(quantity) ? quantity : null]);
    await audit(req, 'divergencia_registrada', 'receiving_divergences', rows[0].id, { type, store_id: a.store_id });
    res.status(201).json({ divergence: rows[0] });
  } catch (e) { next(e); }
});

router.post('/appointments/:id/finalize', auth.requireAuth, async (req, res, next) => {
  try {
    const a = await loadAppointment(req, res); if (!a) return;
    if (!(req.ctx.isRedeAdmin || req.ctx.storeIds.includes(a.store_id))) return res.status(403).json({ error: 'somente_equipe_da_loja' });
    if (a.status !== 'em_recebimento') return res.status(409).json({ error: 'conferencia_nao_em_andamento' });
    const result = req.body.result === 'parcial' ? 'parcial' : 'total';
    const received = toInt(req.body.received_volumes, null);
    if (received === null || received < 0) return res.status(400).json({ error: 'quantidade_recebida_invalida' });
    const notes = cleanString(req.body.notes, 1000) || null;
    const to = result === 'total' ? 'concluido' : 'parcial';
    const updated = await db.withTransaction(async (q) => {
      await q('UPDATE receiving_records SET received_volumes=$1, result=$2, notes=COALESCE($3, notes), completed_at=now(), completed_by=$4 WHERE appointment_id=$5',
        [received, result, notes, req.ctx.user.id, a.id]);
      const r = await q('UPDATE appointments SET status=$1, completed_at=now(), updated_at=now() WHERE id=$2 RETURNING *', [to, a.id]);
      if (a.dock_id) await q("UPDATE docks SET status='livre' WHERE id=$1", [a.dock_id]);
      await q('INSERT INTO appointment_status_history(appointment_id, from_status, to_status, changed_by, note) VALUES ($1,$2,$3,$4,$5)',
        [a.id, a.status, to, req.ctx.user.id, `Recebimento ${result === 'total' ? 'total' : 'parcial'} — ${received} volume(s)`]);
      return r.rows[0];
    });
    await notifySupplierUsers(req.ctx.networkId, a.supplier_id, { type: 'recebimento_concluido', title: `Recebimento ${result === 'total' ? 'concluído' : 'parcial'} — ${updated.protocol}`, body: `Sua entrega foi conferida (${received} volume(s)).`, appointmentId: a.id });
    await notifyStore(req.ctx.networkId, a.store_id, ['loja_gerente'], { type: 'recebimento_concluido', title: `Recebimento ${result === 'total' ? 'total' : 'parcial'} — ${updated.protocol}`, body: `Conferência finalizada por ${req.ctx.user.name}.`, appointmentId: a.id });
    await audit(req, 'recebimento_finalizado', 'appointments', a.id, { result, received, store_id: a.store_id });
    res.json({ appointment: updated });
  } catch (e) { next(e); }
});

router.post('/appointments/:id/mark-delayed', auth.requireAuth, async (req, res, next) => {
  try {
    const updated = await changeStatus(req, res, { to: 'atrasado', note: cleanString(req.body.note, 500) || 'Marcado como atrasado', allowedRoles: 'staff' });
    if (updated) res.json({ appointment: updated });
  } catch (e) { next(e); }
});
router.post('/appointments/:id/no-show', auth.requireAuth, async (req, res, next) => {
  try {
    const updated = await changeStatus(req, res, { to: 'nao_compareceu', note: cleanString(req.body.note, 500) || 'Fornecedor não compareceu', allowedRoles: 'staff' });
    if (updated) res.json({ appointment: updated });
  } catch (e) { next(e); }
});

module.exports = router;
