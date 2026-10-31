'use strict';
/**
 * Camada de banco de dados (SQLite) — MULTI-LOJA.
 *
 * Uma instalação atende várias empresas ("lojas"). Cada loja tem cardápio,
 * produtos, pedidos, configurações e senha próprios.
 *
 * Persistência: os dados vivem no arquivo SQLite. Quando SUPABASE_URL e
 * SUPABASE_KEY estão definidas, cada alteração é enviada para a nuvem e
 * restaurada ao iniciar (ver src/remote.js).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const { DATA_DIR, DB_FILE, PERSISTENTE, resolveUploadDir } = require('./paths');
const remote = require('./remote');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE, {
  // Cada comando SQL passa por aqui: alterações disparam o backup na nuvem.
  verbose: remote.ATIVO
    ? (sql) => {
        if (/^\s*(insert|update|delete|replace|create|alter|drop)\b/i.test(String(sql))) {
          remote.scheduleUpload(DB_FILE, db);
        }
      }
    : undefined,
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ------------------------------------------------------------------ */
/* Senhas                                                              */
/* ------------------------------------------------------------------ */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Padrões                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_PERIODS = [
  { id: 'p1', label: '11h30 às 12h30', active: true },
  { id: 'p2', label: '12h30 às 13h30', active: true },
];

const DEFAULT_PAYMENTS = [
  { id: 'pix', label: 'Pix', active: true, instructions: 'Envie o comprovante no WhatsApp.', key: '', pay_url: '' },
  {
    id: 'cartao_online',
    label: 'Cartão de crédito (online)',
    active: true,
    instructions: 'Você será levado ao pagamento seguro. O pedido é confirmado após a aprovação.',
    key: '',
    pay_url: '',
    aceita_credito: true,
    aceita_debito: false,
  },
  { id: 'dinheiro', label: 'Dinheiro na entrega', active: true, instructions: 'Informe o troco no campo de observações.', key: '', pay_url: '' },
  { id: 'cartao', label: 'Cartão na entrega', active: true, instructions: 'Levo a maquininha.', key: '', pay_url: '', aceita_credito: true, aceita_debito: true },
];

const DEFAULT_MESSAGES = {
  out_for_delivery:
    'Olá, {nome}! Seu pedido {codigo} saiu para entrega 🛵\nPrevisão: {horario}.\nTotal: {total} ({pagamento}).\nQualquer coisa é só chamar aqui! — {negocio}',
  confirmed:
    'Olá, {nome}! Recebemos seu pedido {codigo} ✅\nItens: {itens}\nTotal: {total} — {pagamento}.\nEntrega prevista: {horario}. Obrigado! — {negocio}',
  preparing:
    'Olá, {nome}! Seu pedido {codigo} já está sendo preparado 👩‍🍳\nPrevisão de entrega: {horario}. — {negocio}',
  delivered:
    'Olá, {nome}! Seu pedido {codigo} foi entregue ✅\nEspero que goste! Qualquer coisa me chama aqui. Obrigado pela preferência! — {negocio}',
};

const DEFAULT_PRODUCTS = [
  { name: 'Marmita de frango grelhado', description: 'Arroz soltinho, feijão carioca, filé de frango grelhado, farofa e salada.', price_cents: 2400, image_url: '/img/seed-frango.jpg', category: 'Marmitas', sort_order: 1 },
  { name: 'Marmita parmegiana', description: 'Frango empanado ao molho de tomate artesanal, queijo gratinado e arroz.', price_cents: 2800, image_url: '/img/seed-carne.jpg', category: 'Marmitas', sort_order: 2 },
  { name: 'Feijoada da casa (sábado)', description: 'Feijoada completa com arroz, couve, farofa e laranja. Somente aos sábados.', price_cents: 3200, image_url: '/img/seed-carne.jpg', category: 'Marmitas', sort_order: 3 },
  { name: 'Marmita vegetariana', description: 'Gratinado de legumes, arroz integral, feijão, salada e farofa.', price_cents: 2300, image_url: '/img/seed-frango.jpg', category: 'Marmitas', sort_order: 4 },
  { name: 'Refrigerante lata 350ml', description: 'Coca-Cola, Guaraná, Fanta laranja ou Sprite. Informe o sabor na observação.', price_cents: 600, image_url: '/img/bebidas.jpg', category: 'Bebidas', sort_order: 5 },
  { name: 'Suco natural 500ml', description: 'Laranja, limão ou maracujá, feito na hora.', price_cents: 1000, image_url: '/img/bebidas.jpg', category: 'Bebidas', sort_order: 6 },
  { name: 'Água mineral 500ml', description: 'Com ou sem gás.', price_cents: 400, image_url: '/img/bebidas.jpg', category: 'Bebidas', sort_order: 7 },
  { name: 'Pudim de leite condensado', description: 'Fatia generosa com calda de caramelo.', price_cents: 900, image_url: '/img/pudim.jpg', category: 'Sobremesas', sort_order: 8 },
  { name: 'Bolo de pote (Ninho + morango)', description: 'Camadas de bolo, creme de leite ninho e morango fresco.', price_cents: 1200, image_url: '/img/pudim.jpg', category: 'Sobremesas', sort_order: 9 },
  { name: 'Caixa de docinhos (10 un.)', description: 'Brigadeiro, beijinho e cajuzinho para festas.', price_cents: 1800, image_url: '/img/doces.jpg', category: 'Sobremesas', sort_order: 10 },
];

const DEFAULT_CATALOG_PRODUCTS = [
  { name: 'Perfume Essence Noir 100ml', description: 'Amadeirado intenso, fixação de até 12h. Unissex.', price_cents: 18900, image_url: '/img/demo-perfume.jpg', category: 'Perfumes', sort_order: 1 },
  { name: 'Perfume Flor de Cerejeira 50ml', description: 'Floral suave e delicado, ideal para o dia a dia.', price_cents: 12900, image_url: '/img/demo-perfume.jpg', category: 'Perfumes', sort_order: 2 },
  { name: 'Perfume masculino Intense 100ml', description: 'Cítrico com fundo de couro. Presente certeiro.', price_cents: 21900, image_url: '/img/demo-perfume.jpg', category: 'Perfumes', sort_order: 3 },
  { name: 'Body splash baunilha 200ml', description: 'Leve, perfeito para depois do banho.', price_cents: 5900, image_url: '/img/demo-perfume.jpg', category: 'Perfumes', sort_order: 4 },
  { name: 'Kit presente perfume + velas', description: 'Perfume 50ml, duas velas aromáticas e cartão escrito à mão.', price_cents: 24900, image_url: '/img/demo-presente.jpg', category: 'Kits e presentes', sort_order: 5 },
  { name: 'Caixa surpresa especial', description: 'Perfume, sabonetes artesanais e chocolates. Embalagem premium.', price_cents: 19900, image_url: '/img/demo-presente.jpg', category: 'Kits e presentes', sort_order: 6 },
  { name: 'Kit brinquedo educativo (3 peças)', description: 'Quebra-cabeça e blocos de montar para crianças de 3 a 6 anos.', price_cents: 7900, image_url: '/img/demo-presente.jpg', category: 'Brinquedos', sort_order: 7 },
  { name: 'Pelúcia ursinho 25cm', description: 'Macio, antialérgico, com laço de cetim. Embalagem para presente inclusa.', price_cents: 8900, image_url: '/img/demo-presente.jpg', category: 'Brinquedos', sort_order: 8 },
  { name: 'Caneca personalizada', description: 'Nome ou frase à sua escolha. Pronta em 3 dias.', price_cents: 6900, image_url: '/img/demo-presente.jpg', category: 'Presentes', sort_order: 9 },
  { name: 'Cartão + embalagem premium', description: 'Embalagem com laço, papel seda e cartão escrito à mão.', price_cents: 2500, image_url: '/img/demo-presente.jpg', category: 'Presentes', sort_order: 10 },
];

const DEFAULT_SERVICOS = [
  { nome: 'Instalação de ar condicionado', descricao: 'Instalação completa de split: suporte, furação, tubulação até 3 m, vácuo e teste de funcionamento.', categoria: 'Instalação', preco_cents: 35000, tipo_preco: 'a_partir', duracao_min: 180, ordem: 1 },
  { nome: 'Limpeza / higienização de ar condicionado', descricao: 'Limpeza completa do split: filtros, serpentina, dreno, bandeja e higienização com produto bactericida.', categoria: 'Limpeza', preco_cents: 15000, tipo_preco: 'a_partir', duracao_min: 90, ordem: 2 },
  { nome: 'Manutenção preventiva', descricao: 'Revisão geral: pressão do gás, conexões elétricas, dreno, ruídos e desempenho de refrigeração.', categoria: 'Manutenção', preco_cents: 18000, tipo_preco: 'a_partir', duracao_min: 90, ordem: 3 },
  { nome: 'Recarga de gás / correção de vazamento', descricao: 'Teste de estanqueidade, correção do vazamento e recarga de gás refrigerante.', categoria: 'Manutenção', preco_cents: 0, tipo_preco: 'sob_orcamento', duracao_min: 120, ordem: 4 },
  { nome: 'Desinstalação / remoção de aparelho', descricao: 'Retirada do aparelho com recuperação do gás e organização do local.', categoria: 'Instalação', preco_cents: 20000, tipo_preco: 'a_partir', duracao_min: 120, ordem: 5 },
  { nome: 'Orçamento para outros serviços', descricao: 'Reparos elétricos, troca de peças, suportes, drenos, automação e outros serviços residenciais.', categoria: 'Outros', preco_cents: 0, tipo_preco: 'sob_orcamento', duracao_min: 60, ordem: 6 },
];

const SEGMENTS = {
  food: { label: 'Comida / marmitas', products: () => DEFAULT_PRODUCTS },
  catalogo: { label: 'Perfumes e presentes', products: () => DEFAULT_CATALOG_PRODUCTS },
  servicos: { label: 'Serviços (climatização, assistência)', products: () => [] },
};

/** Configurações padrão de uma loja recém-criada. */
function defaultSettingsFor({ name, whatsapp = '', about = '', tagline = '', segment = 'food' }) {
  const isCatalog = segment === 'catalogo';
  return {
    business: {
      name: name || 'Minha Loja',
      tagline: tagline || '',
      whatsapp: whatsapp || '',
      instagram: '',
      address: '',
      about: about || '',
      cover_url: '',
      logo_url: '',
      theme_color: segment === 'servicos' ? '#14386b' : '#1e6b4f',
      accent_color: segment === 'servicos' ? '#f5a623' : '#f0a63c',
    },
    delivery: {
      fee_cents: 0,
      free_above_cents: 0,
      pickup_enabled: true,
      accepting_orders: true,
      closed_message: 'Estamos fechados para novos pedidos agora. Volte em breve!',
      periods: isCatalog ? [] : DEFAULT_PERIODS,
      periods_note: '',
    },
    payments: DEFAULT_PAYMENTS,
  };
}

/* ------------------------------------------------------------------ */
/* Utilidades de esquema                                               */
/* ------------------------------------------------------------------ */

function tableExists(name) {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

/** Discos realmente montados (diagnóstico do painel master). */
function mountTable() {
  try {
    return fs
      .readFileSync('/proc/mounts', 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [device, mount, fstype] = line.split(' ');
        return { device, mount, fstype };
      })
      .filter((m) => m.device && m.device.startsWith('/dev/'));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Esquema                                                             */
/* ------------------------------------------------------------------ */

db.exec(`
CREATE TABLE IF NOT EXISTS stores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  code_prefix TEXT    NOT NULL DEFAULT 'PS',
  segment     TEXT    NOT NULL DEFAULT 'food',
  active      INTEGER NOT NULL DEFAULT 1,
  notes       TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_settings (
  store_id INTEGER NOT NULL,
  key      TEXT    NOT NULL,
  value    TEXT    NOT NULL,
  PRIMARY KEY (store_id, key)
);

CREATE TABLE IF NOT EXISTS contratos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id       INTEGER NOT NULL,
  token          TEXT    NOT NULL UNIQUE,
  valor_cents    INTEGER NOT NULL DEFAULT 4000,
  implantacao_cents INTEGER NOT NULL DEFAULT 10000,
  dia_vencimento INTEGER NOT NULL DEFAULT 10,
  inicio         TEXT    NOT NULL DEFAULT (datetime('now')),
  extras         TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'pendente',
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  signatario     TEXT    NOT NULL DEFAULT '',
  documento      TEXT    NOT NULL DEFAULT '',
  assinado_em    TEXT    NOT NULL DEFAULT '',
  ip             TEXT    NOT NULL DEFAULT '',
  navegador      TEXT    NOT NULL DEFAULT '',
  hash           TEXT    NOT NULL DEFAULT '',
  texto_assinado TEXT    NOT NULL DEFAULT '',
  cancelado_em   TEXT    NOT NULL DEFAULT '',
  cancelado_por  TEXT    NOT NULL DEFAULT '',
  motivo_cancelamento TEXT NOT NULL DEFAULT '',
  cancelamento_solicitado_em TEXT NOT NULL DEFAULT '',
  cancelamento_motivo_cliente TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS mensalidades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id     INTEGER NOT NULL,
  contrato_id  INTEGER NOT NULL DEFAULT 0,
  referencia   TEXT    NOT NULL,
  valor_cents  INTEGER NOT NULL DEFAULT 4000,
  pago_em      TEXT    NOT NULL DEFAULT '',
  forma        TEXT    NOT NULL DEFAULT '',
  obs          TEXT    NOT NULL DEFAULT '',
  criado_em    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS servicos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id    INTEGER NOT NULL DEFAULT 1,
  nome        TEXT    NOT NULL,
  descricao   TEXT    NOT NULL DEFAULT '',
  categoria   TEXT    NOT NULL DEFAULT 'Outros',
  preco_cents INTEGER NOT NULL DEFAULT 0,
  tipo_preco  TEXT    NOT NULL DEFAULT 'fixo',
  duracao_min INTEGER NOT NULL DEFAULT 60,
  ativo       INTEGER NOT NULL DEFAULT 1,
  ordem       INTEGER NOT NULL DEFAULT 0,
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id      INTEGER NOT NULL DEFAULT 1,
  nome          TEXT    NOT NULL,
  telefone      TEXT    NOT NULL DEFAULT '',
  email         TEXT    NOT NULL DEFAULT '',
  endereco      TEXT    NOT NULL DEFAULT '',
  bairro        TEXT    NOT NULL DEFAULT '',
  obs           TEXT    NOT NULL DEFAULT '',
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipamentos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id        INTEGER NOT NULL DEFAULT 1,
  cliente_id      INTEGER NOT NULL DEFAULT 0,
  tipo            TEXT    NOT NULL DEFAULT 'Split',
  marca           TEXT    NOT NULL DEFAULT '',
  modelo          TEXT    NOT NULL DEFAULT '',
  btu             TEXT    NOT NULL DEFAULT '',
  ambiente        TEXT    NOT NULL DEFAULT '',
  quantidade      INTEGER NOT NULL DEFAULT 1,
  instalado_em    TEXT    NOT NULL DEFAULT '',
  ultima_limpeza  TEXT    NOT NULL DEFAULT '',
  prox_limpeza    TEXT    NOT NULL DEFAULT '',
  prox_manutencao TEXT    NOT NULL DEFAULT '',
  intervalo_dias  INTEGER NOT NULL DEFAULT 180,
  obs             TEXT    NOT NULL DEFAULT '',
  ativo           INTEGER NOT NULL DEFAULT 1,
  criado_em       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id       INTEGER NOT NULL DEFAULT 1,
  cliente_id     INTEGER NOT NULL DEFAULT 0,
  equipamento_id INTEGER NOT NULL DEFAULT 0,
  servico_id     INTEGER NOT NULL DEFAULT 0,
  servico_nome   TEXT    NOT NULL DEFAULT '',
  data           TEXT    NOT NULL DEFAULT '',
  periodo        TEXT    NOT NULL DEFAULT '',
  hora           TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'solicitado',
  valor_cents    INTEGER NOT NULL DEFAULT 0,
  endereco       TEXT    NOT NULL DEFAULT '',
  obs_cliente    TEXT    NOT NULL DEFAULT '',
  obs_interno    TEXT    NOT NULL DEFAULT '',
  origem         TEXT    NOT NULL DEFAULT 'site',
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now')),
  atualizado_em  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id    INTEGER NOT NULL DEFAULT 1,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  image_url   TEXT    NOT NULL DEFAULT '',
  category    TEXT    NOT NULL DEFAULT 'Marmitas',
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id       INTEGER NOT NULL DEFAULT 1,
  code           TEXT    NOT NULL,
  customer_name  TEXT    NOT NULL,
  phone          TEXT    NOT NULL,
  address        TEXT    NOT NULL DEFAULT '',
  neighborhood   TEXT    NOT NULL DEFAULT '',
  complement     TEXT    NOT NULL DEFAULT '',
  notes          TEXT    NOT NULL DEFAULT '',
  fulfillment    TEXT    NOT NULL DEFAULT 'delivery',
  payment_method TEXT    NOT NULL DEFAULT '',
  period         TEXT    NOT NULL DEFAULT '',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents      INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  items_json     TEXT    NOT NULL DEFAULT '[]',
  status         TEXT    NOT NULL DEFAULT 'novo',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
`);

// Bancos antigos (versão de uma loja só): acrescenta a coluna store_id e o segmento.
if (!columnExists('products', 'store_id')) db.exec('ALTER TABLE products ADD COLUMN store_id INTEGER NOT NULL DEFAULT 1');
if (!columnExists('orders', 'store_id')) db.exec('ALTER TABLE orders ADD COLUMN store_id INTEGER NOT NULL DEFAULT 1');
for (const [col, def] of [
  ['cancelado_em', "TEXT NOT NULL DEFAULT ''"],
  ['cancelado_por', "TEXT NOT NULL DEFAULT ''"],
  ['motivo_cancelamento', "TEXT NOT NULL DEFAULT ''"],
  ['cancelamento_solicitado_em', "TEXT NOT NULL DEFAULT ''"],
  ['cancelamento_motivo_cliente', "TEXT NOT NULL DEFAULT ''"],
]) {
  if (!columnExists('contratos', col)) db.exec(`ALTER TABLE contratos ADD COLUMN ${col} ${def}`);
}
if (!columnExists('contratos', 'implantacao_cents')) db.exec('ALTER TABLE contratos ADD COLUMN implantacao_cents INTEGER NOT NULL DEFAULT 10000');
if (!columnExists('contratos', 'renovacao_de')) db.exec('ALTER TABLE contratos ADD COLUMN renovacao_de INTEGER NOT NULL DEFAULT 0');
if (!columnExists('stores', 'segment')) db.exec("ALTER TABLE stores ADD COLUMN segment TEXT NOT NULL DEFAULT 'food'");

db.exec(`
CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id, active, sort_order);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders(store_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(store_id, code);
CREATE INDEX IF NOT EXISTS idx_servicos_store ON servicos(store_id, ativo, ordem);
CREATE INDEX IF NOT EXISTS idx_clientes_store ON clientes(store_id, nome);
CREATE INDEX IF NOT EXISTS idx_clientes_tel ON clientes(store_id, telefone);
CREATE INDEX IF NOT EXISTS idx_equip_store ON equipamentos(store_id, cliente_id);
CREATE INDEX IF NOT EXISTS idx_agenda_store ON agendamentos(store_id, data, status);
`);

/* ------------------------------------------------------------------ */
/* Migração da versão antiga (tabela "settings" global)                */
/* ------------------------------------------------------------------ */

function migrateLegacySettings() {
  if (!tableExists('settings')) return false;
  const rows = db.prepare('SELECT key, value FROM settings').all();
  if (!rows.length) {
    db.exec('DROP TABLE settings');
    return false;
  }

  const legacy = {};
  for (const r of rows) {
    try {
      legacy[r.key] = JSON.parse(r.value);
    } catch {
      /* ignora valores inválidos */
    }
  }

  const name = (legacy.business && legacy.business.name) || 'Prática Sabores';
  const slug = process.env.DEFAULT_STORE_SLUG || 'pratica-sabores';
  const existing = db.prepare('SELECT id FROM stores WHERE slug = ?').get(slug);
  let storeId;
  if (existing) {
    storeId = existing.id;
  } else {
    const info = db
      .prepare('INSERT INTO stores (slug, name, code_prefix) VALUES (?, ?, ?)')
      .run(slug, name, codePrefix(name));
    storeId = info.lastInsertRowid;
  }

  for (const key of ['business', 'delivery', 'payments', 'messages']) {
    if (legacy[key] !== undefined) setSetting(storeId, key, legacy[key]);
  }
  if (legacy.admin) setSetting(storeId, 'admin', legacy.admin);
  if (legacy.secret) setAppSetting('secret', legacy.secret);

  db.exec('DROP TABLE settings');
  console.log(`[db] configurações antigas migradas para a loja "${slug}" (id ${storeId})`);
  return true;
}

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */

function getSetting(storeId, key, fallback = null) {
  const row = db.prepare('SELECT value FROM store_settings WHERE store_id = ? AND key = ?').get(storeId, key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function setSetting(storeId, key, value) {
  db.prepare(
    `INSERT INTO store_settings (store_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(store_id, key) DO UPDATE SET value = excluded.value`
  ).run(storeId, key, JSON.stringify(value));
  return value;
}

function getAppSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return fallback;
  }
}

function setAppSetting(key, value) {
  db.prepare(
    'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, JSON.stringify(value));
  return value;
}

/* ------------------------------------------------------------------ */
/* Cofre de senhas (para o master consultar)                           */
/* ------------------------------------------------------------------ */

/**
 * Segredo do cofre de senhas — PRÓPRIO, não usa o segredo das sessões.
 * Se usasse, trocar SESSION_SECRET tornaria as senhas ilegíveis.
 */
function vaultSecret() {
  const guardado = (getAppSetting('vault_secret', {}) || {}).value;
  if (guardado) return guardado;
  const novo = process.env.VAULT_SECRET || crypto.randomBytes(48).toString('hex');
  setAppSetting('vault_secret', { value: novo });
  return novo;
}

/** Guarda a senha atual da loja (criptografada) + histórico das trocas. */
function recordStorePassword(storeId, password, { by = 'admin' } = {}) {
  const { encrypt } = require('./secretbox');
  const admin = getSetting(storeId, 'admin', {}) || {};
  const history = Array.isArray(admin.password_history) ? admin.password_history.slice(0, 9) : [];
  const now = new Date().toISOString();
  setSetting(storeId, 'admin', {
    ...admin,
    password_enc: encrypt(password, vaultSecret()),
    password_changed_at: now,
    password_changed_by: by,
    password_history: [{ at: now, by, length: String(password || '').length }, ...history],
  });
}

/** Lê a senha atual da loja (texto). */
function revealStorePassword(adminSetting) {
  const { decrypt } = require('./secretbox');
  return decrypt((adminSetting || {}).password_enc, vaultSecret());
}

/* ------------------------------------------------------------------ */
/* Lojas                                                               */
/* ------------------------------------------------------------------ */

function codePrefix(name) {
  const words = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).slice(0, 2);
  return (words[0] || 'LO').slice(0, 2);
}

function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function getStoreBySlug(slug) {
  if (!slug) return null;
  return db.prepare('SELECT * FROM stores WHERE slug = ? AND active = 1').get(String(slug).toLowerCase()) || null;
}

function getStoreById(id) {
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(Number(id)) || null;
}

function listStores() {
  return db.prepare('SELECT * FROM stores ORDER BY id ASC').all();
}

function uniqueSlug(base) {
  let slug = slugify(base) || 'loja';
  let i = 1;
  while (db.prepare('SELECT 1 FROM stores WHERE slug = ?').get(slug)) {
    i += 1;
    slug = `${slugify(base)}-${i}`;
  }
  return slug;
}

/** Cria uma loja completa (configurações + senha do painel). */
function createStore(opts) {
  const name = String(opts.name || '').trim();
  if (!name) throw new Error('Informe o nome da loja.');
  const slug = opts.slug ? uniqueSlug(opts.slug) : uniqueSlug(name);
  const segment = SEGMENTS[opts.segment] ? opts.segment : 'food';

  const info = db
    .prepare('INSERT INTO stores (slug, name, code_prefix, segment, notes) VALUES (?, ?, ?, ?, ?)')
    .run(slug, name, codePrefix(name), segment, String(opts.notes || '').slice(0, 300));
  const storeId = Number(info.lastInsertRowid);

  const defs = defaultSettingsFor({
    name,
    whatsapp: opts.whatsapp,
    about: opts.about,
    tagline: opts.tagline,
    segment,
  });
  setSetting(storeId, 'business', defs.business);
  setSetting(storeId, 'delivery', defs.delivery);
  setSetting(storeId, 'payments', defs.payments);
  setSetting(storeId, 'messages', DEFAULT_MESSAGES);
  setSetting(storeId, 'admin', {
    password_hash: hashPassword(opts.password || crypto.randomBytes(4).toString('hex')),
    must_change: true,
  });
  if (opts.password) recordStorePassword(storeId, opts.password, { by: 'master' });

  if (segment === 'servicos') {
    const ins = db.prepare(
      `INSERT INTO servicos (store_id, nome, descricao, categoria, preco_cents, tipo_preco, duracao_min, ordem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const sv of DEFAULT_SERVICOS) {
      ins.run(storeId, sv.nome, sv.descricao, sv.categoria, sv.preco_cents, sv.tipo_preco, sv.duracao_min, sv.ordem);
    }
  }

  if (opts.withSeedProducts) {
    const insert = db.prepare(
      `INSERT INTO products (store_id, name, description, price_cents, image_url, category, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const p of SEGMENTS[segment].products()) {
      insert.run(storeId, p.name, p.description, p.price_cents, p.image_url, p.category, p.sort_order);
    }
  }

  return getStoreById(storeId);
}

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

function init() {
  // O segredo precisa existir antes de qualquer senha ser gravada no cofre.
  if (process.env.SESSION_SECRET) {
    setAppSetting('secret', { value: String(process.env.SESSION_SECRET) });
  } else if (!getAppSetting('secret', null)) {
    setAppSetting('secret', { value: crypto.randomBytes(48).toString('hex') });
  }

  const migrated = migrateLegacySettings();
  const defaultSlug = process.env.DEFAULT_STORE_SLUG || 'pratica-sabores';

  let first = db.prepare('SELECT * FROM stores ORDER BY id ASC LIMIT 1').get();
  if (!first) {
    first = createStore({
      name: process.env.DEFAULT_STORE_NAME || 'Prática Sabores',
      slug: defaultSlug,
      whatsapp: process.env.DEFAULT_STORE_WHATSAPP || '5555997023507',
      password: process.env.ADMIN_PASSWORD || 'pratica123',
      about: 'Comida de verdade, feita no dia. Pedidos de segunda a sábado, das 10h às 13h.',
      tagline: 'Refeições práticas e saborosas',
      withSeedProducts: true,
    });
    const b = getSetting(first.id, 'business', {});
    setSetting(first.id, 'business', {
      ...b,
      instagram: 'praticasabores',
      address: 'Florianópolis - SC',
      cover_url: '/img/hero.jpg',
      logo_url: '/img/logo-transparent.png',
    });
    const d = getSetting(first.id, 'delivery', {});
    setSetting(first.id, 'delivery', {
      ...d,
      fee_cents: 700,
      periods_note: 'Pedidos de segunda a sábado, das 10h às 13h.',
    });
    console.log(`[db] loja principal criada: ${first.slug}`);
  } else if (migrated) {
    /* migração já ajustou a primeira loja */
  }

  // Senha do master
  const masterEnv = process.env.MASTER_PASSWORD;
  const masterAtual = getAppSetting('master', null);

  if (!masterAtual) {
    const initial = masterEnv || 'master123';
    setAppSetting('master', { password_hash: hashPassword(initial), must_change: !masterEnv, name: 'Administrador' });
    if (!masterEnv) console.warn('[db] senha do master ausente — usando padrão "master123". Troque em /master.');
  } else if (process.env.RECOVERY_MASTER_PASSWORD) {
    setAppSetting('master', { ...masterAtual, password_hash: hashPassword(process.env.RECOVERY_MASTER_PASSWORD) });
    console.warn('[db] senha do master redefinida por RECOVERY_MASTER_PASSWORD — remova a variável.');
  } else if (masterEnv && !verifyPassword(masterEnv, masterAtual.password_hash)) {
    setAppSetting('master', { ...masterAtual, password_hash: hashPassword(masterEnv) });
    console.warn('[db] senha do master sincronizada com MASTER_PASSWORD.');
  }

  return first;
}

const FIRST_STORE = init();

/** Loja padrão: a que responde em "/". */
function defaultStore() {
  return db.prepare('SELECT * FROM stores WHERE id = ?').get(FIRST_STORE.id) || FIRST_STORE;
}

/* Backup automático de segurança (a cada 30s, se o arquivo mudou). */
if (remote.ATIVO) {
  console.log('[nuvem] backup automatico ativo (Supabase)');
  let ultimoEnvio = 0;
  setInterval(() => {
    try {
      const mtime = fs.statSync(DB_FILE).mtimeMs;
      if (mtime > ultimoEnvio) {
        ultimoEnvio = mtime;
        remote.scheduleUpload(DB_FILE, db, 500);
      }
    } catch {
      /* arquivo ainda não existe */
    }
  }, 30000).unref();
}

module.exports = {
  db,
  init,
  defaultStore,
  getStoreBySlug,
  getStoreById,
  listStores,
  createStore,
  uniqueSlug,
  slugify,
  codePrefix,
  getSetting,
  setSetting,
  getAppSetting,
  setAppSetting,
  recordStorePassword,
  revealStorePassword,
  hashPassword,
  verifyPassword,
  defaultSettingsFor,
  SEGMENTS,
  DEFAULT_SERVICOS,
  DEFAULT_MESSAGES,
  DEFAULT_PAYMENTS,
  DEFAULT_PERIODS,
  mountTable,
  DATA_DIR,
  DB_FILE,
  PERSISTENTE,
  resolveUploadDir,
};
