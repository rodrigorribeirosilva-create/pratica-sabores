'use strict';
// DADOS DE DEMONSTRAÇÃO — só rodar em ambiente de demonstração!
// Uso: SEED_DEMO=true npm run seed:demo   (ou: node src/seed-demo.js --confirm)
const db = require('./db');
const { hashPassword } = require('./auth');
const { makeProtocol } = require('./services');

const CONFIRM = process.env.SEED_DEMO === 'true' || process.argv.includes('--confirm');

function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

(async () => {
  if (!CONFIRM) {
    console.error('Recusado: dados de demonstração só com SEED_DEMO=true ou --confirm.');
    process.exit(1);
  }
  await require('./migrate-run').ready;

  const demoCnpj = '11222333000181';
  const { rows: exists } = await db.query('SELECT id FROM networks WHERE cnpj=$1', [demoCnpj]);
  if (exists.length) { console.log('[seed:demo] já aplicado — nada a fazer.'); process.exit(0); }

  console.log('[seed:demo] criando ambiente de DEMONSTRAÇÃO (rede fictícia)...');
  const net = (await db.query(
    `INSERT INTO networks(name, cnpj, admin_name, supplier_signup_code, status)
     VALUES ('REDE DEMO — ROHELARI SUPERMERCADOS (demonstração)', $1, 'Administrador Demo', 'DEMO-ROHELARI', 'ativo') RETURNING id`,
    [demoCnpj])).rows[0];

  const mkStore = async (name, code, approval) => {
    const { rows } = await db.query(
      `INSERT INTO stores(network_id, name, code, cnpj, address, city, state, phone, receiving_start, receiving_end,
                          weekdays, dock_count, capacity_per_slot, approval_mode, responsible_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'07:30','17:30','1,2,3,4,5,6',3,2,$9,'Responsável Demo') RETURNING id`,
      [net.id, name, code, null, `Rua de Demonstração, ${code}00`, 'Florianópolis', 'SC', '4830000000' + code, approval]);
    const store = rows[0];
    for (let i = 1; i <= 3; i++) await db.query('INSERT INTO docks(network_id, store_id, name) VALUES ($1,$2,$3)', [net.id, store.id, `Doca ${i}`]);
    return store;
  };
  const centro = await mkStore('Loja Centro', '001', 'manual');
  const norte  = await mkStore('Loja Norte',  '002', 'auto');

  const cats = {};
  for (const c of ['Mercearia', 'Hortifrúti', 'Laticínios', 'Bebidas', 'Limpeza']) {
    const { rows } = await db.query('INSERT INTO product_categories(network_id, name) VALUES ($1,$2) RETURNING id', [net.id, c]);
    cats[c] = rows[0].id;
  }

  const mkSupplier = async (legal, trade, cnpj, status = 'ativo') => {
    const { rows } = await db.query(
      `INSERT INTO suppliers(network_id, legal_name, trade_name, cnpj, phone, email, address, representative, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [net.id, legal, trade, cnpj, '4831112233', `${trade.toLowerCase().replace(/\s+/g, '')}@demo.com.br`, 'Rod. de Demonstração, 1000', 'Representante Demo', status]);
    return rows[0];
  };
  const bompreco  = await mkSupplier('Distribuidora Bom Preço LTDA', 'Bom Preço', '04252011000110');
  const laticinios= await mkSupplier('Laticínios Serra do Rio LTDA', 'Laticínios Serra', '11444555000161');
  const hortifruti= await mkSupplier('Hortifruti Vale Verde LTDA', 'Vale Verde', '61099008000186');
  await mkSupplier('Bebidas Serra Azul LTDA', 'Serra Azul', '27100289000113', 'pendente'); // aguardando aprovação

  await db.query('INSERT INTO supplier_categories(supplier_id, category_id) VALUES ($1,$2),($3,$4),($5,$6)',
    [bompreco.id, cats['Mercearia'], laticinios.id, cats['Laticínios'], hortifruti.id, cats['Hortifrúti']]);

  const { rows: carrierRows } = await db.query(
    `INSERT INTO carriers(network_id, legal_name, trade_name, cnpj, phone, email, status)
     VALUES ($1,'Transportadora Rota Sul LTDA','Rota Sul','93717219000180','4832223344','contato@rotasul.demo','ativo') RETURNING id`, [net.id]);
  const rotaSul = carrierRows[0];
  await db.query('INSERT INTO supplier_carriers(supplier_id, carrier_id) VALUES ($1,$2),($3,$4)', [bompreco.id, rotaSul.id, hortifruti.id, rotaSul.id]);

  const mkUser = async (name, email, password, links) => {
    const { rows } = await db.query('INSERT INTO users(network_id, name, email, password_hash, phone, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [net.id, name, email, hashPassword(password), '4898888777' + Math.floor(Math.random() * 9), 'ativo']);
    const uid = rows[0].id;
    for (const l of links) await db.query('INSERT INTO user_roles(user_id, role, store_id, supplier_id) VALUES ($1,$2,$3,$4)', [uid, l.role, l.store_id || null, l.supplier_id || null]);
    return uid;
  };
  await mkUser('Administrador Demo', 'rede@demo.rohelari.com.br', 'demo12345', [{ role: 'rede_admin' }]);
  await mkUser('Gerente Centro (Demo)', 'gerente.centro@demo.rohelari.com.br', 'demo12345', [{ role: 'loja_gerente', store_id: centro.id }]);
  await mkUser('Equipe Recebimento Centro (Demo)', 'recebimento.centro@demo.rohelari.com.br', 'demo12345', [{ role: 'recebimento', store_id: centro.id }]);
  await mkUser('Equipe Recebimento Norte (Demo)', 'recebimento.norte@demo.rohelari.com.br', 'demo12345', [{ role: 'recebimento', store_id: norte.id }]);
  await mkUser('Fornecedor Bom Preço (Demo)', 'fornecedor@demo.rohelari.com.br', 'demo12345', [{ role: 'fornecedor', supplier_id: bompreco.id }]);

  // Agendamentos de demonstração — hoje, ontem e amanhã
  const mkAppt = async (store, supplier, { daysOffset, slot, status, volumes = 12, invoice, driver, plate, type = 'truck', started = null, completed = null, arrived = null }) => {
    const date = isoDate(daysOffset);
    const protocol = makeProtocol(new Date(date + 'T00:00:00'));
    const { rows } = await db.query(
      `INSERT INTO appointments(network_id, store_id, protocol, supplier_id, carrier_id, invoice_number, driver_name, driver_cpf, plate, vehicle_type,
                                category_id, expected_volumes, delivery_date, slot_time, status, arrived_at, started_at, completed_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now()) RETURNING id, protocol`,
      [net.id, store.id, protocol, supplier.id, rotaSul.id, invoice || null, driver || 'Motorista Demo', null, plate || 'ABC1D23', type,
       cats['Mercearia'], volumes, date, slot, status, arrived, started, completed]);
    return rows[0];
  };
  const t = (h, m = 0) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ts = (daysOffset, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + daysOffset); d.setHours(h, m, 0, 0); return d.toISOString(); };

  await mkAppt(centro, bompreco, { daysOffset: -1, slot: t(9), status: 'concluido', invoice: 'NF-1001', driver: 'Carlos Silva', plate: 'BRA2E19', arrived: ts(-1, 8, 55), started: ts(-1, 9, 10), completed: ts(-1, 9, 50) });
  await mkAppt(centro, laticinios, { daysOffset: -1, slot: t(10), status: 'concluido', invoice: 'NF-2050', driver: 'Ana Souza', plate: 'DEF4G56', arrived: ts(-1, 10, 40), started: ts(-1, 10, 45), completed: ts(-1, 11, 15) });
  await mkAppt(centro, bompreco, { daysOffset: 0, slot: t(8), status: 'concluido', invoice: 'NF-1102', driver: 'Carlos Silva', plate: 'BRA2E19', arrived: ts(0, 7, 58), started: ts(0, 8, 5), completed: ts(0, 8, 40) });
  await mkAppt(centro, laticinios, { daysOffset: 0, slot: t(9, 30), status: 'em_recebimento', invoice: 'NF-2055', driver: 'Ana Souza', plate: 'DEF4G56', arrived: ts(0, 9, 25), started: ts(0, 9, 35) });
  await mkAppt(centro, hortifruti, { daysOffset: 0, slot: t(11), status: 'confirmado', invoice: 'NF-3100', driver: 'Marcos Vale', plate: 'GHI7H89' });
  await mkAppt(norte, bompreco, { daysOffset: 0, slot: t(10), status: 'solicitado', invoice: 'NF-1103', driver: 'Carlos Silva', plate: 'BRA2E19' });
  await mkAppt(norte, hortifruti, { daysOffset: 0, slot: t(13, 30), status: 'confirmado', invoice: 'NF-3101', driver: 'Marcos Vale', plate: 'JKL0M12' });
  await mkAppt(centro, bompreco, { daysOffset: 0, slot: t(14), status: 'solicitado', invoice: 'NF-1104', driver: 'José Pereira', plate: 'MNO3P45' });
  await mkAppt(centro, hortifruti, { daysOffset: 1, slot: t(8, 30), status: 'confirmado', invoice: 'NF-3200', driver: 'Marcos Vale', plate: 'GHI7H89' });
  await mkAppt(norte, laticinios, { daysOffset: 1, slot: t(9, 30), status: 'solicitado', invoice: 'NF-2060', driver: 'Ana Souza', plate: 'DEF4G56' });
  await mkAppt(centro, laticinios, { daysOffset: -2, slot: t(9), status: 'cancelado', invoice: 'NF-2040', driver: 'Ana Souza', plate: 'DEF4G56' });

  // Conferência parcial para demo
  const { rows: partialAppt } = await db.query("SELECT id FROM appointments WHERE invoice_number='NF-2050' LIMIT 1");
  console.log('[seed:demo] concluído. Credenciais de DEMONSTRAÇÃO (senha: demo12345):');
  console.log('  Rede (admin):        rede@demo.rohelari.com.br');
  console.log('  Gerente Centro:      gerente.centro@demo.rohelari.com.br');
  console.log('  Recebimento Centro:  recebimento.centro@demo.rohelari.com.br');
  console.log('  Fornecedor:          fornecedor@demo.rohelari.com.br');
  console.log('  Código de convite de cadastro externo: DEMO-ROHELARI');
  process.exit(0);
})().catch(e => { console.error('[seed:demo] falhou:', e); process.exit(1); });
