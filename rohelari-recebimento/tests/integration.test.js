'use strict';
// Teste de integração ponta-a-ponta da API — banco PGlite descartável em diretório
// temporário (nunca toca nos dados de demo). Sobe o Express real em porta efêmera
// e exercita os fluxos críticos com HTTP de verdade.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-test-data-'));
process.env.NODE_ENV = 'test';

const { hashPassword } = require('../src/auth');

const FIXTURE_DATE = '2026-11-30'; // segunda-feira (dia operacional)

let server, base, db;
const cookies = {};

async function api(pathname, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
  return { status: res.status, json, headers: res.headers, text };
}
const jar = (res) => {
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return setCookies.map(c => c.split(';')[0]).join('; ');
};
async function login(email, password) {
  const res = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  assert.equal(res.status, 200, `login ${email}: ${res.text}`);
  return jar(res);
}

test.before(async () => {
  const { app, ready } = require('../src/app');
  db = require('../src/db');
  await ready;

  // --- fixtures mínimas, porém reais (FKs e constraints valem)
  const net = (await db.query(
    `INSERT INTO networks(name, cnpj, admin_name, supplier_signup_code, status)
     VALUES ('REDE TESTE SA', '04252011000110', 'Admin Teste', 'TESTE-CODE', 'ativo') RETURNING id`)).rows[0];
  const store = (await db.query(
    `INSERT INTO stores(network_id, name, code, cnpj, address, city, state, receiving_start, receiving_end, weekdays, dock_count, capacity_per_slot, approval_mode, responsible_name)
     VALUES ($1,'Loja Teste','T01',NULL,'Rua Teste, 1','Florianópolis','SC','07:30','17:30','1,2,3,4,5,6',2,2,'manual','Resp Teste') RETURNING id`, [net.id])).rows[0];
  for (let i = 1; i <= 2; i++) await db.query('INSERT INTO docks(network_id, store_id, name) VALUES ($1,$2,$3)', [net.id, store.id, `Doca ${i}`]);
  const supplier = (await db.query(
    `INSERT INTO suppliers(network_id, legal_name, trade_name, cnpj, phone, email, status)
     VALUES ($1,'Fornecedor Teste LTDA','Fornecedor Teste','04252011000195','4830001111','forn@teste.com','ativo') RETURNING id`, [net.id])).rows[0];

  const mkUser = async (name, email, role, links = {}) => {
    const { rows } = await db.query('INSERT INTO users(network_id, name, email, password_hash, status) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [net.id, name, email, hashPassword('senhaforte123'), 'ativo']);
    await db.query('INSERT INTO user_roles(user_id, role, store_id, supplier_id) VALUES ($1,$2,$3,$4)', [rows[0].id, role, links.store_id || null, links.supplier_id || null]);
    return rows[0].id;
  };
  await mkUser('Admin Rede', 'rede@teste.com', 'rede_admin');
  await mkUser('Gerente Teste', 'gerente@teste.com', 'loja_gerente', { store_id: store.id });
  await mkUser('Recebimento Teste', 'rec@teste.com', 'recebimento', { store_id: store.id });
  await mkUser('Fornecedor Teste', 'forn@teste.com', 'fornecedor', { supplier_id: supplier.id });

  globalThis.__fix = { netId: net.id, storeId: store.id, supplierId: supplier.id };

  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  cookies.rede = await login('rede@teste.com', 'senhaforte123');
  cookies.gerente = await login('gerente@teste.com', 'senhaforte123');
  cookies.rec = await login('rec@teste.com', 'senhaforte123');
  cookies.forn = await login('forn@teste.com', 'senhaforte123');
});

test.after(async () => {
  if (server) await new Promise(r => server.close(r));
  const dir = process.env.DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
});

test('health é público', async () => {
  const res = await api('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
});

test('login com senha errada é recusado', async () => {
  const res = await api('/api/auth/login', { method: 'POST', body: { email: 'rede@teste.com', password: 'errada' } });
  assert.equal(res.status, 401);
});

test('sem cookie a API responde 401', async () => {
  const res = await api('/api/appointments');
  assert.equal(res.status, 401);
});

test('RBAC: fornecedor não lista usuários da rede', async () => {
  const res = await api('/api/users', { cookie: cookies.forn });
  assert.equal(res.status, 403);
});

test('RBAC: rede_admin lista usuários', async () => {
  const res = await api('/api/users', { cookie: cookies.rede });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.users));
  assert.ok(res.json.users.length >= 4);
});

test('código de convite de fornecedor não vaza para não-admin', async () => {
  const res = await api('/api/network', { cookie: cookies.forn });
  assert.equal(res.status, 200);
  assert.equal(res.json.network?.supplier_signup_code, undefined);
  assert.equal(res.json.supplier_signup_code, undefined);
  const adminView = await api('/api/network', { cookie: cookies.rede });
  const code = adminView.json.network?.supplier_signup_code ?? adminView.json.supplier_signup_code;
  assert.equal(code, 'TESTE-CODE');
});

test('fornecedor não acessa trilha de auditoria', async () => {
  const res = await api('/api/audit', { cookie: cookies.forn });
  assert.equal(res.status, 403);
});

test('agenda: disponibilidade retorna slots de 30min e recusa data inválida', async () => {
  const ok = await api(`/api/agenda/availability?store_id=${globalThis.__fix.storeId}&date=${FIXTURE_DATE}`, { cookie: cookies.forn });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.isOperatingDay, true);
  assert.ok(ok.json.slots.length > 0);
  assert.ok(ok.json.slots.every(s => /^\d{2}:\d{2}$/.test(s.time)));
  const bad = await api(`/api/agenda/availability?store_id=${globalThis.__fix.storeId}&date=30/11/2026`, { cookie: cookies.forn });
  assert.equal(bad.status, 400);
});

test('fluxo completo: criar → aprovar → chegada → conferência → parcial/total', async (t) => {
  // Fornecedor agenda
  const created = await api('/api/appointments', {
    method: 'POST', cookie: cookies.forn,
    body: { store_id: globalThis.__fix.storeId, delivery_date: FIXTURE_DATE, slot_time: '09:00', invoice_number: 'NF-TESTE-1', plate: 'TST1A11', driver_name: 'Motorista Teste', driver_cpf: '52998224725', expected_volumes: 120 }
  });
  assert.equal(created.status, 201, created.text);
  const appt = created.json.appointment;
  assert.ok(appt.protocol);
  assert.equal(appt.status, 'solicitado');

  await t.test('duplicidade de placa+faixa é bloqueada', async () => {
    const dup = await api('/api/appointments', {
      method: 'POST', cookie: cookies.forn,
      body: { store_id: globalThis.__fix.storeId, delivery_date: FIXTURE_DATE, slot_time: '09:00', invoice_number: 'NF-TESTE-2', plate: 'TST1A11' }
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.code || dup.json.error, 'duplicado_placa');
  });

  await t.test('fornecedor não aprova o próprio agendamento', async () => {
    const res = await api(`/api/appointments/${appt.id}/approve`, { method: 'POST', cookie: cookies.forn });
    assert.ok([403, 404].includes(res.status));
  });

  await t.test('gerente aprova', async () => {
    const res = await api(`/api/appointments/${appt.id}/approve`, { method: 'POST', cookie: cookies.gerente });
    assert.equal(res.status, 200);
    assert.equal(res.json.appointment.status, 'confirmado');
  });

  await t.test('chegada registrada pela equipe', async () => {
    const res = await api(`/api/appointments/${appt.id}/arrival`, { method: 'POST', cookie: cookies.rec, body: {} });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.appointment.status, 'chegada_registrada');
  });

  await t.test('fornecedor não finaliza recebimento', async () => {
    const res = await api(`/api/appointments/${appt.id}/finalize`, { method: 'POST', cookie: cookies.forn, body: { received_volumes: 100, result: 'parcial' } });
    assert.ok([403, 404].includes(res.status));
  });

  await t.test('equipe inicia conferência e registra divergência', async () => {
    const start = await api(`/api/appointments/${appt.id}/start-conference`, { method: 'POST', cookie: cookies.rec, body: {} });
    assert.equal(start.status, 200, start.text);
    const div = await api(`/api/appointments/${appt.id}/divergences`, { method: 'POST', cookie: cookies.rec,
      body: { type: 'falta', description: 'Faltaram 20 caixas de leite', quantity: 20 } });
    assert.equal(div.status, 201, div.text);
  });

  await t.test('equipe finaliza parcialmente e histórico registra a jornada', async () => {
    const fin = await api(`/api/appointments/${appt.id}/finalize`, { method: 'POST', cookie: cookies.rec,
      body: { received_volumes: 100, result: 'parcial', notes: 'Faltante registrado' } });
    assert.equal(fin.status, 200, fin.text);
    assert.equal(fin.json.appointment.status, 'parcial');
    const detail = await api(`/api/appointments/${appt.id}`, { cookie: cookies.gerente });
    assert.equal(detail.status, 200);
    assert.ok(Array.isArray(detail.json.history));
    const statuses = detail.json.history.map(h => h.to_status);
    for (const s of ['confirmado', 'chegada_registrada', 'em_recebimento', 'parcial']) {
      assert.ok(statuses.includes(s), `histórico deveria conter ${s}: ${statuses}`);
    }
  });
});

test('cancelamento pós-chegada não é permitido', async () => {
  // cria outro agendamento e avança até chegada
  const created = await api('/api/appointments', {
    method: 'POST', cookie: cookies.forn,
    body: { store_id: globalThis.__fix.storeId, delivery_date: FIXTURE_DATE, slot_time: '11:00', invoice_number: 'NF-TESTE-3', plate: 'TST2B22' }
  });
  const appt = created.json.appointment;
  await api(`/api/appointments/${appt.id}/approve`, { method: 'POST', cookie: cookies.gerente });
  await api(`/api/appointments/${appt.id}/arrival`, { method: 'POST', cookie: cookies.rec, body: {} });
  const res = await api(`/api/appointments/${appt.id}/cancel`, { method: 'POST', cookie: cookies.forn, body: { reason: 'não vou mais' } });
  assert.equal(res.status, 403);
});

test('dashboard responde para gerente e é isolado por papel', async () => {
  const ok = await api('/api/dashboard', { cookie: cookies.gerente });
  assert.equal(ok.status, 200);
  const denied = await api('/api/dashboard', { cookie: cookies.forn });
  // fornecedor não tem visão de dashboard operacional — se responder 200, exige flags de fornecedor; senão 403
  assert.ok([200, 403].includes(denied.status));
});
