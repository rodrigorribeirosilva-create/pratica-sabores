'use strict';
// Fase 2 — Cadastros: lojas, usuários, fornecedores, transportadoras, docas,
// capacidade por faixa horária e bloqueios de agenda.
const express = require('express');
const db = require('../db');
const auth = require('../auth');
const { audit } = require('../services');
const { validCNPJ, isEmail, isPhone, cleanString, toInt, onlyDigits } = require('../validate');

const router = express.Router();
router.use(auth.requireAuth);
const R = (s) => s; // legibilidade

// ---------------------------------------------------------------- LOJAS
router.get('/stores', async (req, res, next) => {
  try {
    const ctx = req.ctx;
    if (auth.isSupplierUser(ctx) && !ctx.isRedeAdmin && !ctx.storeIds.length) {
      // Fornecedor vê apenas dados públicos das lojas (para agendar)
      const { rows } = await db.query(
        `SELECT id, name, city, state, receiving_start, receiving_end, weekdays
           FROM stores WHERE network_id=$1 AND status='ativo' ORDER BY name`, [ctx.networkId]);
      return res.json({ stores: rows, limited: true });
    }
    let sql = `SELECT s.*, (SELECT count(*)::int FROM docks d WHERE d.store_id=s.id) AS docks_registered
               FROM stores s WHERE s.network_id=$1`;
    const params = [ctx.networkId];
    if (!ctx.isRedeAdmin) { sql += ' AND s.id = ANY($2::uuid[])'; params.push(ctx.storeIds); }
    sql += ' ORDER BY s.name';
    const { rows } = await db.query(sql, params);
    res.json({ stores: rows });
  } catch (e) { next(e); }
});

router.post('/stores', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const name = cleanString(b.name, 150), code = cleanString(b.code, 30).toUpperCase();
    const cnpj = b.cnpj ? onlyDigits(b.cnpj) : null;
    if (!name || !code) return res.status(400).json({ error: 'nome_e_codigo_obrigatorios' });
    if (cnpj && !validCNPJ(cnpj)) return res.status(400).json({ error: 'cnpj_invalido' });
    const ws = cleanString(b.receiving_start, 5) || '08:00', we = cleanString(b.receiving_end, 5) || '17:00';
    if (ws >= we) return res.status(400).json({ error: 'horario_invalido' });
    const weekdays = cleanString(b.weekdays, 20) || '1,2,3,4,5,6';
    if (!/^[1-7](,\s*[1-7])*$/.test(weekdays.replace(/\s/g, ''))) return res.status(400).json({ error: 'dias_invalidos' });
    const dockCount = Math.max(0, Math.min(50, toInt(b.dock_count, 2)));
    const capacity = Math.max(1, Math.min(50, toInt(b.capacity_per_slot, 2)));
    const approval = b.approval_mode === 'auto' ? 'auto' : 'manual';
    const created = await db.withTransaction(async (q) => {
      const r = await q(
        `INSERT INTO stores(network_id, name, code, cnpj, address, city, state, phone,
                            receiving_start, receiving_end, weekdays, dock_count, capacity_per_slot,
                            approval_mode, responsible_name, sysmo_store_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [req.ctx.networkId, name, code, cnpj, cleanString(b.address, 300) || null, cleanString(b.city, 120) || null,
         cleanString(b.state, 2).toUpperCase() || null, cleanString(b.phone, 20) || null, ws, we,
         weekdays.replace(/\s/g, ''), dockCount, capacity, approval, cleanString(b.responsible_name, 200) || null,
         cleanString(b.sysmo_store_code, 60) || null]);
      const store = r.rows[0];
      for (let i = 1; i <= dockCount; i++) {
        await q('INSERT INTO docks(network_id, store_id, name) VALUES ($1,$2,$3) ON CONFLICT (store_id, name) DO NOTHING',
          [req.ctx.networkId, store.id, `Doca ${i}`]);
      }
      return store;
    });
    await audit(req, 'loja_criada', 'stores', created.id, { name, code });
    res.status(201).json({ store: created });
  } catch (e) {
    if (String(e.message).includes('UNIQUE') || e.code === '23505') return res.status(409).json({ error: 'codigo_ja_existe' });
    next(e);
  }
});

router.put('/stores/:id', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const sets = [], params = [];
    let i = 1;
    const push = (col, val) => { sets.push(`${col}=$${i++}`); params.push(val); };
    if (b.name !== undefined) push('name', cleanString(b.name, 150));
    if (b.code !== undefined) push('code', cleanString(b.code, 30).toUpperCase());
    if (b.cnpj !== undefined) { const c = onlyDigits(b.cnpj); if (c && !validCNPJ(c)) return res.status(400).json({ error: 'cnpj_invalido' }); push('cnpj', c || null); }
    if (b.address !== undefined) push('address', cleanString(b.address, 300) || null);
    if (b.city !== undefined) push('city', cleanString(b.city, 120) || null);
    if (b.state !== undefined) push('state', cleanString(b.state, 2).toUpperCase() || null);
    if (b.phone !== undefined) push('phone', cleanString(b.phone, 20) || null);
    if (b.receiving_start !== undefined) push('receiving_start', cleanString(b.receiving_start, 5));
    if (b.receiving_end !== undefined) push('receiving_end', cleanString(b.receiving_end, 5));
    if (b.weekdays !== undefined) { const w = cleanString(b.weekdays, 20).replace(/\s/g, ''); if (!/^[1-7](,[1-7])*$/.test(w)) return res.status(400).json({ error: 'dias_invalidos' }); push('weekdays', w); }
    if (b.capacity_per_slot !== undefined) push('capacity_per_slot', Math.max(1, toInt(b.capacity_per_slot, 2)));
    if (b.approval_mode !== undefined) push('approval_mode', b.approval_mode === 'auto' ? 'auto' : 'manual');
    if (b.responsible_name !== undefined) push('responsible_name', cleanString(b.responsible_name, 200) || null);
    if (b.sysmo_store_code !== undefined) push('sysmo_store_code', cleanString(b.sysmo_store_code, 60) || null);
    if (b.dock_count !== undefined) push('dock_count', Math.max(0, toInt(b.dock_count, 2)));
    if (!sets.length) return res.status(400).json({ error: 'nada_para_atualizar' });
    sets.push('updated_at=now()');
    params.push(req.ctx.networkId, req.params.id);
    const { rows } = await db.query(
      `UPDATE stores SET ${sets.join(',')} WHERE network_id=$${i} AND id=$${i + 1} RETURNING *`, params);
    if (!rows.length) return res.status(404).json({ error: 'loja_nao_encontrada' });
    await audit(req, 'loja_atualizada', 'stores', req.params.id, b);
    res.json({ store: rows[0] });
  } catch (e) { next(e); }
});

router.patch('/stores/:id/status', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const status = req.body.status === 'ativo' ? 'ativo' : 'inativo';
    const { rows } = await db.query('UPDATE stores SET status=$1, updated_at=now() WHERE network_id=$2 AND id=$3 RETURNING id', [status, req.ctx.networkId, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'loja_nao_encontrada' });
    await audit(req, 'loja_status', 'stores', req.params.id, { status });
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

// Capacidade por faixa horária (override por loja)
router.put('/stores/:id/slot-capacity', async (req, res, next) => {
  try {
    const storeId = req.params.id;
    if (!auth.requireStoreManager(req, storeId)) return res.status(403).json({ error: 'sem_permissao' });
    const slot = cleanString(req.body.slot_time, 5);
    const capacity = toInt(req.body.capacity, null);
    if (!/^[0-2][0-9]:[0-5][0-9]$/.test(slot)) return res.status(400).json({ error: 'horario_invalido' });
    if (capacity === null || capacity < 0 || capacity > 50) return res.status(400).json({ error: 'capacidade_invalida' });
    const r = await db.query(
      `INSERT INTO store_slot_capacity(network_id, store_id, slot_time, capacity)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (store_id, slot_time) DO UPDATE SET capacity=EXCLUDED.capacity RETURNING *`,
      [req.ctx.networkId, storeId, slot, capacity]);
    await audit(req, 'capacidade_faixa', 'stores', storeId, { slot_time: slot, capacity });
    res.json({ slotCapacity: r.rows[0] });
  } catch (e) { next(e); }
});
router.get('/stores/:id/slot-capacity', async (req, res, next) => {
  try {
    if (!auth.canAccessStore(req.ctx, req.params.id) && !auth.isSupplierUser(req.ctx)) return res.status(403).json({ error: 'sem_permissao' });
    const { rows } = await db.query('SELECT slot_time, capacity FROM store_slot_capacity WHERE store_id=$1 ORDER BY slot_time', [req.params.id]);
    res.json({ capacities: rows });
  } catch (e) { next(e); }
});
router.delete('/stores/:id/slot-capacity/:slot', async (req, res, next) => {
  try {
    const storeId = req.params.id;
    if (!auth.requireStoreManager(req, storeId)) return res.status(403).json({ error: 'sem_permissao' });
    await db.query('DELETE FROM store_slot_capacity WHERE store_id=$1 AND slot_time=$2', [storeId, req.params.slot]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Bloqueio de dias/horários
router.get('/blocked-slots', async (req, res, next) => {
  try {
    const storeId = cleanString(req.query.store_id, 40);
    const params = [req.ctx.networkId];
    let sql = 'SELECT * FROM blocked_slots WHERE network_id=$1';
    if (storeId) { sql += ' AND store_id=$2'; params.push(storeId); if (!auth.canAccessStore(req.ctx, storeId)) sql += ' AND 1=0'; }
    else if (!req.ctx.isRedeAdmin) { sql += ' AND store_id = ANY($2::uuid[])'; params.push(req.ctx.storeIds); }
    sql += ' ORDER BY block_date DESC, slot_time NULLS FIRST LIMIT 200';
    const { rows } = await db.query(sql, params);
    res.json({ blocked: rows });
  } catch (e) { next(e); }
});
router.post('/blocked-slots', async (req, res, next) => {
  try {
    const storeId = cleanString(req.body.store_id, 40);
    if (!auth.requireStoreManager(req, storeId)) return res.status(403).json({ error: 'sem_permissao' });
    const date = cleanString(req.body.block_date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'data_invalida' });
    const slot = req.body.slot_time ? cleanString(req.body.slot_time, 5) : null;
    if (slot && !/^[0-2][0-9]:[0-5][0-9]$/.test(slot)) return res.status(400).json({ error: 'horario_invalido' });
    const reason = cleanString(req.body.reason, 300) || null;
    const { rows } = await db.query(
      'INSERT INTO blocked_slots(network_id, store_id, block_date, slot_time, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.ctx.networkId, storeId, date, slot, reason, req.ctx.user.id]);
    await audit(req, 'agenda_bloqueada', 'blocked_slots', rows[0].id, { store_id: storeId, block_date: date, slot_time: slot, reason });
    res.status(201).json({ blocked: rows[0] });
  } catch (e) { next(e); }
});
router.delete('/blocked-slots/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT store_id FROM blocked_slots WHERE id=$1 AND network_id=$2', [req.params.id, req.ctx.networkId]);
    if (!rows.length) return res.status(404).json({ error: 'bloqueio_nao_encontrado' });
    if (!auth.requireStoreManager(req, rows[0].store_id)) return res.status(403).json({ error: 'sem_permissao' });
    await db.query('DELETE FROM blocked_slots WHERE id=$1', [req.params.id]);
    await audit(req, 'bloqueio_removido', 'blocked_slots', req.params.id, {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- USUÁRIOS
router.get('/users', async (req, res, next) => {
  try {
    const ctx = req.ctx;
    if (!ctx.isRedeAdmin && !ctx.storeIds.length) return res.status(403).json({ error: 'sem_permissao' });
    let sql = `SELECT u.id, u.name, u.email, u.phone, u.status, u.last_login_at, u.created_at,
                      COALESCE(json_agg(json_build_object('role', ur.role, 'store_id', ur.store_id, 'store_name', s.name, 'supplier_id', ur.supplier_id))
                               FILTER (WHERE ur.id IS NOT NULL), '[]') AS roles
                 FROM users u
                 LEFT JOIN user_roles ur ON ur.user_id = u.id
                 LEFT JOIN stores s ON s.id = ur.store_id
                WHERE u.network_id=$1`;
    const params = [ctx.networkId];
    if (!ctx.isRedeAdmin) {
      sql += ' AND EXISTS (SELECT 1 FROM user_roles ur2 WHERE ur2.user_id=u.id AND ur2.store_id = ANY($2::uuid[]))';
      params.push(ctx.storeIds);
    }
    sql += ' GROUP BY u.id ORDER BY u.name';
    const { rows } = await db.query(sql, params);
    res.json({ users: rows });
  } catch (e) { next(e); }
});

router.post('/users', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const name = cleanString(b.name, 200), email = cleanString(b.email, 200).toLowerCase();
    const phone = cleanString(b.phone, 20);
    const password = String(b.password || '');
    const role = cleanString(b.role, 30);
    if (!name || !isEmail(email) || password.length < 8) return res.status(400).json({ error: 'dados_invalidos', message: 'Nome, e-mail válido e senha de 8+ caracteres.' });
    if (!['rede_admin', 'loja_gerente', 'recebimento', 'fornecedor'].includes(role)) return res.status(400).json({ error: 'papel_invalido' });
    const storeId = b.store_id ? cleanString(b.store_id, 40) : null;
    const supplierId = b.supplier_id ? cleanString(b.supplier_id, 40) : null;
    if ((role === 'loja_gerente' || role === 'recebimento') && !storeId) return res.status(400).json({ error: 'loja_obrigatoria_para_o_papel' });
    if (role === 'fornecedor' && !supplierId) return res.status(400).json({ error: 'fornecedor_obrigatorio_para_o_papel' });
    if (storeId && !auth.canAccessStore(req.ctx, storeId)) return res.status(403).json({ error: 'loja_fora_da_rede' });
    if (supplierId) {
      const { rows } = await db.query('SELECT id FROM suppliers WHERE id=$1 AND network_id=$2', [supplierId, req.ctx.networkId]);
      if (!rows.length) return res.status(400).json({ error: 'fornecedor_nao_encontrado' });
    }
    const created = await db.withTransaction(async (q) => {
      const r = await q('INSERT INTO users(network_id, name, email, password_hash, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email',
        [req.ctx.networkId, name, email, auth.hashPassword(password), phone || null]);
      const userId = r.rows[0].id;
      await q('INSERT INTO user_roles(user_id, role, store_id, supplier_id) VALUES ($1,$2,$3,$4)',
        [userId, role, storeId, role === 'fornecedor' ? supplierId : null]);
      return r.rows[0];
    });
    await audit(req, 'usuario_criado', 'users', created.id, { role, store_id: storeId });
    res.status(201).json({ user: created });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email_ja_cadastrado' });
    next(e);
  }
});

router.patch('/users/:id', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const sets = [], params = [];
    let i = 1;
    if (b.status !== undefined) { sets.push(`status=$${i++}`); params.push(b.status === 'inativo' ? 'inativo' : 'ativo'); }
    if (b.name !== undefined) { sets.push(`name=$${i++}`); params.push(cleanString(b.name, 200)); }
    if (b.phone !== undefined) { sets.push(`phone=$${i++}`); params.push(cleanString(b.phone, 20) || null); }
    if (b.newPassword) { if (String(b.newPassword).length < 8) return res.status(400).json({ error: 'senha_curta' }); sets.push(`password_hash=$${i++}`); params.push(auth.hashPassword(String(b.newPassword))); }
    if (!sets.length) return res.status(400).json({ error: 'nada_para_atualizar' });
    sets.push('updated_at=now()');
    params.push(req.ctx.networkId, req.params.id);
    const { rows } = await db.query(`UPDATE users SET ${sets.join(',')} WHERE network_id=$${i} AND id=$${i + 1} RETURNING id, name, email, status`, params);
    if (!rows.length) return res.status(404).json({ error: 'usuario_nao_encontrado' });
    if (String(b.status || '') === 'inativo') await db.query('DELETE FROM sessions WHERE user_id=$1', [req.params.id]);
    await audit(req, 'usuario_atualizado', 'users', req.params.id, { ...b, newPassword: b.newPassword ? '***' : undefined });
    res.json({ user: rows[0] });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- FORNECEDORES
router.get('/suppliers', async (req, res, next) => {
  try {
    const ctx = req.ctx;
    const search = cleanString(req.query.q, 120).toLowerCase();
    let sql = `SELECT s.*, COALESCE(cat.names, '[]'::json) AS categories
                 FROM suppliers s
                 LEFT JOIN LATERAL (
                   SELECT json_agg(pc.name ORDER BY pc.name) AS names
                     FROM supplier_categories sc JOIN product_categories pc ON pc.id = sc.category_id
                    WHERE sc.supplier_id = s.id) cat ON true
                WHERE s.network_id=$1`;
    const params = [ctx.networkId];
    if (auth.isSupplierUser(ctx) && !ctx.isRedeAdmin && !ctx.storeIds.length) {
      sql += ' AND s.id = ANY($2::uuid[])'; params.push(ctx.supplierIds);
    }
    if (search) { sql += ` AND (lower(s.legal_name) LIKE $${params.length + 1} OR lower(COALESCE(s.trade_name,'')) LIKE $${params.length + 1} OR s.cnpj LIKE $${params.length + 1})`; params.push(`%${search}%`); }
    sql += ' ORDER BY s.legal_name';
    const { rows } = await db.query(sql, params);
    res.json({ suppliers: rows });
  } catch (e) { next(e); }
});

function supplierPayload(b) {
  const legalName = cleanString(b.legal_name, 200), tradeName = cleanString(b.trade_name, 200);
  const cnpj = onlyDigits(b.cnpj);
  const phone = cleanString(b.phone, 20), email = cleanString(b.email, 200).toLowerCase();
  if (!legalName || !cnpj || cnpj.length !== 14) return { error: 'razao_social_e_cnpj' };
  if (!validCNPJ(cnpj)) return { error: 'cnpj_invalido' };
  if (email && !isEmail(email)) return { error: 'email_invalido' };
  if (phone && !isPhone(phone)) return { error: 'telefone_invalido' };
  return { legalName, tradeName, cnpj, phone, email, address: cleanString(b.address, 300), representative: cleanString(b.representative, 200), sysmo_code: cleanString(b.sysmo_code, 60) || null };
}

router.post('/suppliers', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const p = supplierPayload(req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    const created = await db.withTransaction(async (q) => {
      const r = await q(
        `INSERT INTO suppliers(network_id, legal_name, trade_name, cnpj, phone, email, address, representative, sysmo_code, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ativo') RETURNING *`,
        [req.ctx.networkId, p.legalName, p.tradeName || null, p.cnpj, p.phone || null, p.email || null, p.address || null, p.representative || null, p.sysmo_code]);
      await setSupplierLinks(q, r.rows[0].id, req.body);
      return r.rows[0];
    });
    await audit(req, 'fornecedor_criado', 'suppliers', created.id, { cnpj: created.cnpj });
    res.status(201).json({ supplier: created });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'cnpj_ja_cadastrado' });
    next(e);
  }
});

async function setSupplierLinks(q, supplierId, b) {
  if (Array.isArray(b.category_ids)) {
    await q('DELETE FROM supplier_categories WHERE supplier_id=$1', [supplierId]);
    for (const cid of b.category_ids) await q('INSERT INTO supplier_categories(supplier_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [supplierId, cid]);
  }
  if (Array.isArray(b.carrier_ids)) {
    await q('DELETE FROM supplier_carriers WHERE supplier_id=$1', [supplierId]);
    for (const cid of b.carrier_ids) await q('INSERT INTO supplier_carriers(supplier_id, carrier_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [supplierId, cid]);
  }
}

router.put('/suppliers/:id', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const p = supplierPayload(req.body);
    if (p.error) return res.status(400).json({ error: p.error });
    const updated = await db.withTransaction(async (q) => {
      const r = await q(
        `UPDATE suppliers SET legal_name=$1, trade_name=$2, cnpj=$3, phone=$4, email=$5, address=$6,
                representative=$7, sysmo_code=$8, updated_at=now()
          WHERE network_id=$9 AND id=$10 RETURNING *`,
        [p.legalName, p.tradeName || null, p.cnpj, p.phone || null, p.email || null, p.address || null, p.representative || null, p.sysmo_code, req.ctx.networkId, req.params.id]);
      if (r.rows.length) await setSupplierLinks(q, r.rows[0].id, req.body);
      return r.rows[0];
    });
    if (!updated) return res.status(404).json({ error: 'fornecedor_nao_encontrado' });
    await audit(req, 'fornecedor_atualizado', 'suppliers', req.params.id, {});
    res.json({ supplier: updated });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'cnpj_ja_cadastrado' });
    next(e);
  }
});

router.patch('/suppliers/:id/status', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const status = ['ativo', 'inativo', 'pendente'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'status_invalido' });
    const updated = await db.withTransaction(async (q) => {
      const r = await q('UPDATE suppliers SET status=$1, updated_at=now() WHERE network_id=$2 AND id=$3 RETURNING id', [status, req.ctx.networkId, req.params.id]);
      if (!r.rows.length) return null;
      // Ao ativar fornecedor pendente, libera também a conta de usuário vinculada
      if (status === 'ativo') await q("UPDATE users SET status='ativo', updated_at=now() WHERE id IN (SELECT user_id FROM user_roles WHERE supplier_id=$1) AND status='inativo'", [req.params.id]);
      if (status === 'inativo') await q("UPDATE users SET status='inativo', updated_at=now() WHERE id IN (SELECT user_id FROM user_roles WHERE supplier_id=$1)", [req.params.id]);
      return r.rows[0];
    });
    if (!updated) return res.status(404).json({ error: 'fornecedor_nao_encontrado' });
    await audit(req, 'fornecedor_status', 'suppliers', req.params.id, { status });
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- TRANSPORTADORAS
router.get('/carriers', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM carriers WHERE network_id=$1 ORDER BY legal_name', [req.ctx.networkId]);
    res.json({ carriers: rows });
  } catch (e) { next(e); }
});
router.post('/carriers', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const legalName = cleanString(b.legal_name, 200);
    const cnpj = b.cnpj ? onlyDigits(b.cnpj) : null;
    if (!legalName) return res.status(400).json({ error: 'razao_social_obrigatoria' });
    if (cnpj && !validCNPJ(cnpj)) return res.status(400).json({ error: 'cnpj_invalido' });
    const phone = cleanString(b.phone, 20), email = cleanString(b.email, 200).toLowerCase();
    if (email && !isEmail(email)) return res.status(400).json({ error: 'email_invalido' });
    const { rows } = await db.query(
      'INSERT INTO carriers(network_id, legal_name, trade_name, cnpj, phone, email, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [req.ctx.networkId, legalName, cleanString(b.trade_name, 200) || null, cnpj, phone || null, email || null, b.status === 'inativo' ? 'inativo' : 'ativo']);
    await audit(req, 'transportadora_criada', 'carriers', rows[0].id, {});
    res.status(201).json({ carrier: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'cnpj_ja_cadastrado' });
    next(e);
  }
});
router.put('/carriers/:id', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const cnpj = b.cnpj !== undefined ? (onlyDigits(b.cnpj) || null) : undefined;
    if (cnpj && !validCNPJ(cnpj)) return res.status(400).json({ error: 'cnpj_invalido' });
    const { rows } = await db.query(
      `UPDATE carriers SET legal_name=COALESCE($1, legal_name), trade_name=COALESCE($2, trade_name),
              cnpj=COALESCE($3, cnpj), phone=COALESCE($4, phone), email=COALESCE($5, email),
              status=COALESCE($6, status)
        WHERE network_id=$7 AND id=$8 RETURNING *`,
      [b.legal_name ? cleanString(b.legal_name, 200) : null, b.trade_name !== undefined ? cleanString(b.trade_name, 200) || null : null,
       cnpj === undefined ? null : cnpj, b.phone !== undefined ? cleanString(b.phone, 20) || null : null,
       b.email !== undefined ? cleanString(b.email, 200).toLowerCase() || null : null,
       b.status && ['ativo', 'inativo'].includes(b.status) ? b.status : null, req.ctx.networkId, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'transportadora_nao_encontrada' });
    await audit(req, 'transportadora_atualizada', 'carriers', req.params.id, {});
    res.json({ carrier: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'cnpj_ja_cadastrado' });
    next(e);
  }
});

// ---------------------------------------------------------------- CATEGORIAS
router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM product_categories WHERE network_id=$1 ORDER BY name', [req.ctx.networkId]);
    res.json({ categories: rows });
  } catch (e) { next(e); }
});
router.post('/categories', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const name = cleanString(req.body.name, 120);
    if (!name) return res.status(400).json({ error: 'nome_obrigatorio' });
    const { rows } = await db.query('INSERT INTO product_categories(network_id, name) VALUES ($1,$2) ON CONFLICT (network_id, name) DO UPDATE SET name=EXCLUDED.name RETURNING *', [req.ctx.networkId, name]);
    res.status(201).json({ category: rows[0] });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- DOCAS
router.get('/docks', async (req, res, next) => {
  try {
    const storeId = cleanString(req.query.store_id, 40);
    const params = [req.ctx.networkId];
    let sql = 'SELECT d.*, s.name AS store_name FROM docks d JOIN stores s ON s.id=d.store_id WHERE d.network_id=$1';
    if (storeId) { sql += ' AND d.store_id=$2'; params.push(storeId); }
    else if (!req.ctx.isRedeAdmin) { sql += ' AND d.store_id = ANY($2::uuid[])'; params.push(req.ctx.storeIds); }
    sql += ' ORDER BY s.name, d.name';
    const { rows } = await db.query(sql, params);
    res.json({ docks: rows });
  } catch (e) { next(e); }
});
router.post('/docks', async (req, res, next) => {
  try {
    const storeId = cleanString(req.body.store_id, 40);
    if (!auth.requireStoreManager(req, storeId)) return res.status(403).json({ error: 'sem_permissao' });
    const name = cleanString(req.body.name, 60);
    if (!name) return res.status(400).json({ error: 'nome_obrigatorio' });
    const { rows } = await db.query('INSERT INTO docks(network_id, store_id, name) VALUES ($1,$2,$3) ON CONFLICT (store_id, name) DO NOTHING RETURNING *', [req.ctx.networkId, storeId, name]);
    await audit(req, 'doca_criada', 'docks', rows[0]?.id || null, { store_id: storeId, name });
    res.status(201).json({ dock: rows[0] || null, duplicated: !rows.length });
  } catch (e) { next(e); }
});
router.patch('/docks/:id/status', async (req, res, next) => {
  try {
    const status = ['livre', 'ocupada', 'manutencao'].includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ error: 'status_invalido' });
    const { rows } = await db.query('SELECT store_id FROM docks WHERE id=$1 AND network_id=$2', [req.params.id, req.ctx.networkId]);
    if (!rows.length) return res.status(404).json({ error: 'doca_nao_encontrada' });
    if (!auth.canOperateStore(req, rows[0].store_id)) return res.status(403).json({ error: 'sem_permissao' });
    await db.query('UPDATE docks SET status=$1 WHERE id=$2', [status, req.params.id]);
    await audit(req, 'doca_status', 'docks', req.params.id, { status });
    res.json({ ok: true, status });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------- MOTORISTAS E VEÍCULOS (quick create p/ formulário)
router.get('/drivers', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, name, cpf, phone FROM drivers WHERE network_id=$1 ORDER BY name LIMIT 500', [req.ctx.networkId]);
    res.json({ drivers: rows });
  } catch (e) { next(e); }
});
router.post('/drivers', async (req, res, next) => {
  try {
    const name = cleanString(req.body.name, 200);
    const cpf = b_cpf(req.body.cpf);
    if (!name) return res.status(400).json({ error: 'nome_obrigatorio' });
    if (req.body.cpf && !cpf) return res.status(400).json({ error: 'cpf_invalido' });
    const { rows } = await db.query(
      `INSERT INTO drivers(network_id, name, cpf, phone) VALUES ($1,$2,$3,$4)
       ON CONFLICT (network_id, cpf) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone RETURNING *`,
      [req.ctx.networkId, name, cpf, cleanString(req.body.phone, 20) || null]);
    res.status(201).json({ driver: rows[0] });
  } catch (e) { next(e); }
});
function b_cpf(v) {
  const { validCPF, onlyDigits: od } = require('../validate');
  const d = od(v);
  return d.length === 11 && validCPF(d) ? d : null;
}
router.get('/vehicles', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, plate, vehicle_type FROM vehicles WHERE network_id=$1 ORDER BY plate LIMIT 500', [req.ctx.networkId]);
    res.json({ vehicles: rows });
  } catch (e) { next(e); }
});
router.post('/vehicles', async (req, res, next) => {
  try {
    const { normalizePlate, isPlate } = require('../validate');
    const plate = normalizePlate(req.body.plate);
    if (!isPlate(plate)) return res.status(400).json({ error: 'placa_invalida' });
    const type = ['carreta', 'truck', 'toco', 'van', 'utilitario', 'outro'].includes(req.body.vehicle_type) ? req.body.vehicle_type : 'truck';
    const { rows } = await db.query(
      `INSERT INTO vehicles(network_id, plate, vehicle_type) VALUES ($1,$2,$3)
       ON CONFLICT (network_id, plate) DO UPDATE SET vehicle_type=EXCLUDED.vehicle_type RETURNING *`,
      [req.ctx.networkId, plate, type]);
    res.status(201).json({ vehicle: rows[0] });
  } catch (e) { next(e); }
});

module.exports = router;

// ----------------------------------------------------------- REDE (configurações)
router.get('/network', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT id, name, cnpj, logo_url, admin_name, supplier_signup_code, auto_approve_appointments, sysmo_enabled, status, created_at FROM networks WHERE id=$1', [req.ctx.networkId]);
    if (!rows.length) return res.status(404).json({ error: 'rede_nao_encontrada' });
    if (!req.ctx.isRedeAdmin) delete rows[0].supplier_signup_code;
    res.json({ network: rows[0] });
  } catch (e) { next(e); }
});
router.put('/network', auth.requireRedeAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const sets = [], params = [];
    let i = 1;
    if (b.name !== undefined) { sets.push(`name=$${i++}`); params.push(cleanString(b.name, 150)); }
    if (b.admin_name !== undefined) { sets.push(`admin_name=$${i++}`); params.push(cleanString(b.admin_name, 200) || null); }
    if (b.auto_approve_appointments !== undefined) { sets.push(`auto_approve_appointments=$${i++}`); params.push(!!b.auto_approve_appointments); }
    if (b.regenerate_signup_code) { sets.push(`supplier_signup_code=$${i++}`); params.push(require('crypto').randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)); }
    else if (b.supplier_signup_code !== undefined) { sets.push(`supplier_signup_code=$${i++}`); params.push(cleanString(b.supplier_signup_code, 40) || null); }
    if (!sets.length) return res.status(400).json({ error: 'nada_para_atualizar' });
    sets.push('updated_at=now()');
    params.push(req.ctx.networkId);
    const { rows } = await db.query(`UPDATE networks SET ${sets.join(',')} WHERE id=$${i} RETURNING id, name, cnpj, admin_name, supplier_signup_code, auto_approve_appointments, sysmo_enabled`, params);
    await audit(req, 'rede_atualizada', 'networks', rows[0].id, { ...b, regenerate_signup_code: !!b.regenerate_signup_code });
    res.json({ network: rows[0] });
  } catch (e) { next(e); }
});

// ----------------------------------------------------------- CONTA (troca de senha própria)
router.post('/account/password', async (req, res, next) => {
  try {
    const current = String(req.body.current || '');
    const next1 = String(req.body.newPassword || '');
    if (next1.length < 8) return res.status(400).json({ error: 'senha_curta', message: 'A nova senha deve ter ao menos 8 caracteres.' });
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id=$1', [req.ctx.user.id]);
    if (!rows.length || !auth.verifyPassword(current, rows[0].password_hash)) return res.status(403).json({ error: 'senha_atual_incorreta' });
    await db.query('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [auth.hashPassword(next1), req.ctx.user.id]);
    await audit(req, 'senha_alterada', 'users', req.ctx.user.id, {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});
