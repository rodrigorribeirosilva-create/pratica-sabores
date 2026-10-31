'use strict';
/**
 * Painel MASTER — o seu painel (administrador do sistema).
 * Só aqui é possível criar novas lojas (novos clientes), redefinir a senha
 * de cada loja, ativar/desativar e baixar o backup completo do banco.
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const storage = require('./storage');
const { resolveUploadDir } = require('./paths');

const {
  db,
  listStores,
  getStoreById,
  createStore,
  getSetting,
  setSetting,
  getAppSetting,
  setAppSetting,
  hashPassword,
  verifyPassword,
  slugify,
  DB_FILE,
} = require('./db');
const { requireMaster, setMasterSession, clearMasterSession, parseCookies, verifyToken } = require('./auth');
const { normalizeWhatsapp, formatDateTimeBR } = require('./helpers');

const router = express.Router();

/* --------------------------------- login --------------------------------- */
const hits = new Map();
router.post('/login', (req, res) => {
  const key = `master:${req.ip}`;
  const now = Date.now();
  const rec = hits.get(key) || { count: 0, reset: now + 10 * 60_000 };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + 10 * 60_000;
  }
  rec.count += 1;
  hits.set(key, rec);
  if (rec.count > 6) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });

  const master = getAppSetting('master', {});
  const password = String((req.body || {}).password || '');
  if (!verifyPassword(password, master.password_hash)) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  setMasterSession(res);
  res.json({
    ok: true,
    must_change: !!master.must_change,
    name: master.name || 'Administrador',
    photo_url: master.photo_url || '',
  });
});

router.post('/logout', (req, res) => {
  clearMasterSession(res);
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const data = verifyToken(parseCookies(req.headers.cookie || '').ps_master);
  const master = getAppSetting('master', {});
  res.json({
    logged: !!data && data.sub === 'master',
    must_change: !!master.must_change,
    name: master.name || 'Administrador',
    photo_url: master.photo_url || '',
  });
});

router.post('/profile', requireMaster, (req, res) => {
  const b = req.body || {};
  const master = getAppSetting('master', {});
  const name = b.name === undefined ? master.name || 'Administrador' : String(b.name || '').trim().slice(0, 40);
  if (name.length < 2) return res.status(400).json({ error: 'Informe seu nome.' });
  const photo_url = b.photo_url === undefined ? master.photo_url || '' : String(b.photo_url || '').trim().slice(0, 500);
  setAppSetting('master', { ...master, name, photo_url });
  res.json({ ok: true, name, photo_url });
});

/* ------------------------ foto do painel master -------------------------- */
const MASTER_UPLOAD_DIR = path.join(resolveUploadDir(), '_master');

const uploadMaster = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Envie uma imagem JPG, PNG, WEBP ou GIF.'));
  },
});

router.post('/upload', requireMaster, (req, res) => {
  uploadMaster.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo recebido.' });
    const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' }[req.file.mimetype];
    const nome = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
    if (storage.ATIVO) {
      try {
        const url = await storage.salvarImagem(req.file.buffer, nome, '_master', req.file.mimetype);
        return res.status(201).json({ url });
      } catch (e) {
        console.error('[master/foto] nuvem falhou:', e.message);
      }
    }
    fs.mkdirSync(MASTER_UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(MASTER_UPLOAD_DIR, nome), req.file.buffer);
    res.status(201).json({ url: `/uploads/_master/${nome}` });
  });
});

/* ---- meus dados no contrato (quem recebe as assinaturas) ---- */
router.get('/contratado', requireMaster, (req, res) => {
  const { dadosContratado } = require('./contrato');
  res.json({ contratado: dadosContratado() });
});

router.post('/contratado', requireMaster, (req, res) => {
  const b = req.body || {};
  const atual = getAppSetting('contratado', {}) || {};
  const whatsapp = normalizeWhatsapp(b.whatsapp === undefined ? atual.whatsapp : b.whatsapp);
  if (b.whatsapp !== undefined && whatsapp.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Informe o WhatsApp com DDD (ex.: 48 98854-5558).' });
  }
  const dados = {
    nome: String(b.nome === undefined ? atual.nome || '' : b.nome).trim().slice(0, 60),
    doc: String(b.doc === undefined ? atual.doc || '' : b.doc).trim().slice(0, 30),
    cidade: String(b.cidade === undefined ? atual.cidade || '' : b.cidade).trim().slice(0, 60),
    email: String(b.email === undefined ? atual.email || '' : b.email).trim().slice(0, 80),
    whatsapp,
  };
  setAppSetting('contratado', dados);
  const { dadosContratado } = require('./contrato');
  res.json({ ok: true, contratado: dadosContratado() });
});

router.post('/password', requireMaster, (req, res) => {
  const current = String((req.body || {}).current_password || '');
  const next = String((req.body || {}).new_password || '');
  const master = getAppSetting('master', {});
  if (!verifyPassword(current, master.password_hash)) {
    return res.status(400).json({ error: 'A senha atual está incorreta.' });
  }
  if (next.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres.' });
  setAppSetting('master', { password_hash: hashPassword(next), must_change: false });
  res.json({ ok: true });
});

/* --------------------------------- lojas ---------------------------------- */
const produtos_ativos = (p) => Number(p && p.ativos ? p.ativos : 0);
function contarTabela(tabela, storeId, extra = '') {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE store_id = ? ${extra}`).get(storeId).n;
  } catch {
    return 0;
  }
}

function storeSummary(store) {
  const ehServicos = store.segment === 'servicos';
  const products = ehServicos
    ? { n: contarTabela('servicos', store.id), ativos: contarTabela('servicos', store.id, 'AND ativo = 1') }
    : db
        .prepare('SELECT COUNT(*) AS n, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS ativos FROM products WHERE store_id = ?')
        .get(store.id);
  const orders = ehServicos
    ? contarTabela('agendamentos', store.id)
    : db.prepare('SELECT COUNT(*) AS n FROM orders WHERE store_id = ?').get(store.id).n;
  const agendaAberta = ehServicos
    ? contarTabela('agendamentos', store.id, "AND status IN ('solicitado','agendado','a_caminho')")
    : 0;
  const business = getSetting(store.id, 'business', {});
  const delivery = getSetting(store.id, 'delivery', {});
  const admin = getSetting(store.id, 'admin', {});
  const senha = require('./db').revealStorePassword(admin);
  return {
    id: store.id,
    slug: store.slug,
    segment: store.segment || 'food',
    name: business.name || store.name,
    whatsapp: business.whatsapp || '',
    password: senha,
    password_changed_at: admin.password_changed_at || '',
    password_changed_by: admin.password_changed_by || '',
    password_history: (admin.password_history || []).slice(0, 5),
    active: !!store.active,
    logo_url: business.logo_url || '',
    theme_color: business.theme_color || '#1e6b4f',
    accepting_orders: delivery.accepting_orders !== false,
    must_change: !!admin.must_change,
    products: products.n || 0,
    products_active: produtos_ativos(products),
    orders,
    agenda_aberta: agendaAberta,
    // rótulos prontos: o master não precisa adivinhar o que é "produto" aqui
    rotulo_link: ehServicos ? 'agendamento' : store.segment === 'catalogo' ? 'catálogo' : 'cardápio',
    rotulo_item: ehServicos ? 'serviço' : store.segment === 'catalogo' ? 'produto' : 'item',
    rotulo_itens: ehServicos ? 'serviços' : 'produtos',
    rotulo_pedidos: ehServicos ? 'agendamentos' : 'pedidos',
    created_at: formatDateTimeBR(store.created_at),
    menu_path: `/l/${store.slug}`,
    admin_path: `/l/${store.slug}/admin`,
  };
}

router.get('/stores', requireMaster, (req, res) => {
  res.json({ stores: listStores().map(storeSummary) });
});

router.post('/stores', requireMaster, (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Informe o nome da empresa.' });
    const password = String(b.password || '').trim();
    if (password.length < 6) return res.status(400).json({ error: 'A senha do painel precisa ter ao menos 6 caracteres.' });

    const store = createStore({
      name,
      slug: b.slug ? slugify(b.slug) : undefined,
      whatsapp: normalizeWhatsapp(b.whatsapp),
      password,
      about: String(b.about || '').slice(0, 400),
      tagline: String(b.tagline || '').slice(0, 120),
      notes: String(b.notes || '').slice(0, 300),
      segment: ['catalogo', 'servicos'].includes(b.segment) ? b.segment : 'food',
      withSeedProducts: b.withSeedProducts === true,
    });
    res.status(201).json({ ok: true, store: storeSummary(store) });
  } catch (err) {
    console.error('[master/create]', err);
    res.status(400).json({ error: err.message || 'Não foi possível criar a loja.' });
  }
});

router.patch('/stores/:id', requireMaster, (req, res) => {
  const store = getStoreById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const b = req.body || {};

  if (b.name !== undefined) {
    const name = String(b.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'Informe o nome da empresa.' });
    db.prepare('UPDATE stores SET name = ? WHERE id = ?').run(name, store.id);
    const business = getSetting(store.id, 'business', {});
    setSetting(store.id, 'business', { ...business, name });
  }
  if (b.notes !== undefined) {
    db.prepare('UPDATE stores SET notes = ? WHERE id = ?').run(String(b.notes || '').slice(0, 300), store.id);
  }
  if (b.segment !== undefined) {
    const seg = ['catalogo', 'servicos'].includes(b.segment) ? b.segment : 'food';
    db.prepare('UPDATE stores SET segment = ? WHERE id = ?').run(seg, store.id);
  }
  if (b.active !== undefined) {
    db.prepare('UPDATE stores SET active = ? WHERE id = ?').run(b.active ? 1 : 0, store.id);
  }
  if (b.new_password !== undefined) {
    const pw = String(b.new_password || '');
    if (pw.length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
    setSetting(store.id, 'admin', { password_hash: hashPassword(pw), must_change: true });
    require('./db').recordStorePassword(store.id, pw, { by: 'master' });
  }
  res.json({ ok: true, store: storeSummary(getStoreById(store.id)) });
});

router.delete('/stores/:id', requireMaster, (req, res) => {
  const store = getStoreById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const total = db.prepare('SELECT COUNT(*) AS n FROM stores').get().n;
  if (total <= 1) return res.status(400).json({ error: 'Não é possível excluir a única loja do sistema.' });
  if (String((req.body || {}).confirm || '') !== store.slug) {
    return res.status(400).json({ error: `Digite o endereço "${store.slug}" para confirmar a exclusão.` });
  }
  db.prepare('DELETE FROM orders WHERE store_id = ?').run(store.id);
  db.prepare('DELETE FROM products WHERE store_id = ?').run(store.id);
  db.prepare('DELETE FROM store_settings WHERE store_id = ?').run(store.id);
  db.prepare('DELETE FROM stores WHERE id = ?').run(store.id);
  res.json({ ok: true });
});

/** Link do WhatsApp para você enviar ao cliente. */
router.get('/stores/:id/share', requireMaster, (req, res) => {
  const store = getStoreById(req.params.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const s = storeSummary(store);
  const origin = `${req.protocol}://${req.get('host')}`;
  const menuUrl = origin + s.menu_path;
  const palavra = s.segment === 'catalogo' ? 'catálogo' : s.segment === 'servicos' ? 'agendamento' : 'cardápio';
  // Duas mensagens bem diferentes:
  //  • cliente → só o link público (o painel nunca vai para o cliente!)
  //  • dono    → link do painel + senha
  const ehServicos = s.segment === 'servicos';
  const textoCliente = ehServicos
    ? `Olá! 😊 Aqui você agenda instalação, limpeza e manutenção de ar condicionado com a ${s.name}:\n` +
      `${menuUrl}\n\n` +
      `É só abrir o link, escolher o serviço e o melhor dia. O pedido cai direto na nossa agenda. Qualquer dúvida me chama!`
    : `Olá! 😊 Aqui está o ${palavra} digital da ${s.name}:\n` +
      `${menuUrl}\n\n` +
      `É só abrir o link, escolher e enviar o pedido pelo WhatsApp. Qualquer dúvida me chama!`;

  const senha = require('./db').revealStorePassword(getSetting(s.id, 'admin', {})) || '';

  const textoDono = ehServicos
    ? `Olá! Segue o acesso ao *painel administrativo* da ${s.name}. 🔐\n\n` +
      `1) Abra o link:\n${origin}${s.admin_path}\n\n` +
      `2) Digite a senha: *${senha || '(já cadastrada)'}*\n\n` +
      `Dentro do painel você vê os pedidos que chegam pelo site, confirma o dia de cada serviço, ` +
      `cadastra clientes e aparelhos e recebe o aviso quando o ar de um cliente estiver precisando de limpeza.\n` +
      `Assim que entrar, troque a senha em *Configurações*.\n\n` +
      `Link para enviar aos seus clientes:\n${menuUrl}`
    : `Olá! Segue o acesso ao *painel administrativo* do ${palavra.toLowerCase()} digital da ${s.name}. 🔐\n\n` +
      `1) Abra o link:\n${origin}${s.admin_path}\n\n` +
      `2) Digite a senha: *${senha || '(já cadastrada)'}*\n\n` +
      `Dentro do painel você cadastra produtos, troca fotos e preços e acompanha os pedidos.\n` +
      `Assim que entrar, troque a senha em *Configurações › Segurança*.\n\n` +
      `Link para enviar aos seus clientes:\n${menuUrl}`;

  res.json({
    menu_url: menuUrl,
    admin_url: origin + s.admin_path,
    text: textoCliente,
    text_customer: textoCliente,
    text_owner: textoDono,
    whatsapp_url: s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(textoCliente)}` : '',
    // sem número fixo: abre a lista de contatos do WhatsApp, para mandar
    // para quem vai cuidar do painel (gerente, filho, sócio…)
    whatsapp_owner_url: `https://wa.me/?text=${encodeURIComponent(textoDono)}`,
  });
});

/** Diagnóstico do servidor: mostra onde os dados estão sendo gravados. */
router.get('/system', requireMaster, (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { DATA_DIR: dataDir, resolveUploadDir: resolveUp } = require('./db');
  const uploadDir = resolveUp();
  let dbSize = 0;
  try {
    dbSize = fs.statSync(DB_FILE).size;
  } catch {
    /* ignora */
  }
  const { PERSISTENTE: persistente } = require('./db');
  res.json({
    data_dir: dataDir,
    db_file: DB_FILE,
    upload_dir: uploadDir,
    db_size_kb: Math.round(dbSize / 1024),
    disco_persistente: persistente,
    variavel_data_dir: process.env.DATA_DIR || '(não definida)',
    variavel_upload_dir: process.env.UPLOAD_DIR || '(não definida)',
    uptime_segundos: Math.round(process.uptime()),
    lojas: listStores().length,
    discos_montados: require('./db').mountTable().map((m) => `${m.device} → ${m.mount} (${m.fstype})`),
    nuvem_ativa: require('./remote').ATIVO,
    aviso: persistente
      ? 'OK: os dados estão no disco persistente.'
      : require('./remote').ATIVO
      ? 'Os dados são salvos na nuvem (Supabase) a cada alteração e restaurados automaticamente quando o sistema reinicia ou é atualizado. Nada é perdido.'
      : 'ATENÇÃO: sem disco persistente e sem nuvem configurada, os dados podem ser perdidos. Configure SUPABASE_URL e SUPABASE_KEY.',
  });
});

/** Situação do backup na nuvem (o que o painel mostra em "Onde os dados estão salvos"). */
router.get('/backup/status', requireMaster, async (req, res) => {
  const remote = require('./remote');
  const { db: banco } = require('./db');
  const conta = (tabela, extra = '') => {
    try {
      return banco.prepare(`SELECT COUNT(*) n FROM ${tabela} ${extra}`).get().n;
    } catch {
      return 0;
    }
  };
  const info = {
    nuvem_ativa: remote.ATIVO,
    endereco: remote.SUPABASE_URL || '',
    ultimo_backup: '',
    minutos_atras: null,
    tamanho_kb: 0,
    pendente: false,
    falhas: 0,
    resumo: {
      lojas: conta('stores'),
      contratos: conta('contratos'),
      clientes: conta('clientes'),
      agendamentos: conta('agendamentos'),
      produtos: conta('products'),
      servicos: conta('servicos'),
    },
  };
  if (remote.ATIVO) {
    try {
      const url = `${remote.SUPABASE_URL}/rest/v1/${remote.TABLE}?id=eq.1&select=updated_at,payload`;
      const r = await fetch(url, {
        headers: { apikey: process.env.SUPABASE_KEY, Authorization: `Bearer ${process.env.SUPABASE_KEY}` },
      });
      if (r.ok) {
        const linhas = await r.json();
        if (linhas.length) {
          info.ultimo_backup = linhas[0].updated_at;
          info.minutos_atras = Math.max(0, Math.round((Date.now() - new Date(linhas[0].updated_at).getTime()) / 60000));
          info.tamanho_kb = Math.round(String(linhas[0].payload || '').length * 0.75 / 1024);
        }
      }
    } catch (e) {
      info.erro = e.message;
    }
  }
  Object.assign(info, remote.status ? remote.status() : {});
  res.json(info);
});

/** Envia o backup na nuvem agora (botão do painel). */
router.post('/backup/agora', requireMaster, async (req, res) => {
  const remote = require('./remote');
  if (!remote.ATIVO) return res.status(400).json({ error: 'Backup na nuvem não está configurado.' });
  const banco = require('./db').db;
  const DB_FILE = require('./paths').DB_FILE;
  const ok = await remote.flush(DB_FILE, banco);
  res.json({ ok, quando: new Date().toISOString() });
});

/** Backup completo do banco (todas as lojas) — só o master baixa. */
router.get('/backup', requireMaster, (req, res) => {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    res.download(DB_FILE, `backup-completo-${stamp}.db`, (err) => {
      if (err) console.error('[master/backup]', err.message);
    });
  } catch (err) {
    console.error('[master/backup]', err);
    res.status(500).json({ error: 'Não foi possível gerar o backup.' });
  }
});

/* ------------------------------------------------------------------ */
/* Contratos de mensalidade                                            */
/* ------------------------------------------------------------------ */

/** Ver o contrato de uma loja (cria o rascunho se ainda não existir). */
router.get('/stores/:id/contrato', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  let c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);
  res.json({
    contrato: c || null,
    valor_padrao_cents: 4000,
    dia_padrao: 10,
    link: c ? `/contrato/${c.token}` : '',
  });
});

/** Criar (ou refazer) o contrato: define valor, vencimento e cláusulas extras. */
router.post('/stores/:id/contrato', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const b = req.body || {};
  const valor = Math.max(100, Number(b.valor_cents) || 4000);
  const implantacao = Math.max(0, Number(b.implantacao_cents) || 10000);
  const dia = Math.min(28, Math.max(1, Number(b.dia_vencimento) || 10));
  const extras = String(b.extras || '').slice(0, 2000);
  const token = require('crypto').randomBytes(9).toString('base64url');

  const existente = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);

  if (existente && existente.status === 'cancelado') {
    // contrato cancelado não é reaproveitado: use "Renovar contrato" para gerar um novo para assinar
    return res.status(409).json({
      error: 'Esse contrato está cancelado. Use "Renovar contrato" para gerar um novo link de assinatura.',
      contrato: existente,
    });
  }
  if (existente && existente.status !== 'assinado') {
    db.prepare('UPDATE contratos SET valor_cents=?, implantacao_cents=?, dia_vencimento=?, extras=?, token=? WHERE id=?').run(
      valor, implantacao, dia, extras, token, existente.id
    );
    return res.json({ ok: true, id: existente.id, token, link: `/contrato/${token}` });
  }
  if (existente && existente.status === 'assinado' && !b.forcar) {
    return res.status(409).json({
      error: 'Esta loja já tem um contrato assinado. Envie o link existente ou marque "criar novo" para gerar outro.',
      contrato: existente,
    });
  }
  const info = db
    .prepare('INSERT INTO contratos (store_id, token, valor_cents, implantacao_cents, dia_vencimento, extras) VALUES (?,?,?,?,?,?)')
    .run(store.id, token, valor, implantacao, dia, extras);
  res.status(201).json({ ok: true, id: info.lastInsertRowid, token, link: `/contrato/${token}` });
});

/** Cancelar o contrato (mantém todo o histórico da assinatura). */
router.post('/stores/:id/contrato/cancelar', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);
  if (!c) return res.status(404).json({ error: 'Essa loja não tem contrato.' });
  if (c.status === 'cancelado') return res.json({ ok: true, ja_cancelado: true });
  const motivo = String((req.body || {}).motivo || '').slice(0, 500);
  db.prepare(
    `UPDATE contratos SET status = 'cancelado', cancelado_em = datetime('now'), cancelado_por = 'master', motivo_cancelamento = ?
      WHERE id = ?`
  ).run(motivo, c.id);
  res.json({ ok: true, cancelado_em: new Date().toISOString() });
});

/** Apagar de vez o contrato (só se estiver cancelado, para não perder assinatura ativa). */
router.delete('/stores/:id/contrato', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);
  if (!c) return res.status(404).json({ error: 'Essa loja não tem contrato.' });
  if (c.status !== 'cancelado') {
    return res.status(400).json({ error: 'Primeiro cancele o contrato. Só é possível apagar um contrato cancelado.' });
  }
  db.prepare('DELETE FROM contratos WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

/** Reativar um contrato cancelado (volta para pendente ou assinado). */
router.post('/stores/:id/contrato/reativar', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);
  if (!c) return res.status(404).json({ error: 'Essa loja não tem contrato.' });
  const novo = c.assinado_em ? 'assinado' : 'pendente';
  db.prepare(
    `UPDATE contratos SET status = ?, cancelado_em = '', cancelado_por = '', motivo_cancelamento = '' WHERE id = ?`
  ).run(novo, c.id);
  res.json({ ok: true, status: novo });
});

/**
 * Renovar o contrato: gera um contrato NOVO (link novo, pendente de assinatura)
 * a partir dos dados do anterior. O contrato cancelado/vencido fica no histórico.
 */
router.post('/stores/:id/contrato/renovar', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const b = req.body || {};
  const anterior = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);

  const valor = Math.max(100, Number(b.valor_cents) || (anterior && anterior.valor_cents) || 4000);
  const implantacao = Math.max(0, b.implantacao_cents != null ? Number(b.implantacao_cents) : (anterior ? anterior.implantacao_cents : 10000));
  const dia = Math.min(28, Math.max(1, Number(b.dia_vencimento) || (anterior && anterior.dia_vencimento) || 10));
  const extras = String(b.extras != null ? b.extras : (anterior ? anterior.extras || '' : '')).slice(0, 2000);
  const token = require('crypto').randomBytes(9).toString('base64url');

  const info = db
    .prepare(
      `INSERT INTO contratos (store_id, token, valor_cents, implantacao_cents, dia_vencimento, extras, status, renovacao_de)
       VALUES (?,?,?,?,?,?,'pendente',?)`
    )
    .run(store.id, token, valor, implantacao, dia, extras, anterior ? anterior.id : 0);

  // Se o anterior estava cancelado, mantém o histórico dele intacto.
  res.status(201).json({
    ok: true,
    id: info.lastInsertRowid,
    token,
    link: `/contrato/${token}`,
    renovacao_de: anterior ? anterior.id : 0,
    mensagem: 'Contrato renovado. Envie o novo link para o cliente assinar.',
  });
});

/** Todos os contratos num só lugar (aba "Contratos" do master). */
router.get('/contratos', requireMaster, (req, res) => {
  const origin = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const lista = listStores().map((store) => {
    const business = getSetting(store.id, 'business', {}) || {};
    const c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);
    const brl = (v) => (Number(v || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const nome = business.name || store.name;
    const mensal = c ? c.valor_cents : 4000;
    const implantacao = c && c.implantacao_cents != null ? c.implantacao_cents : 10000;
    const dia = c ? c.dia_vencimento : 10;
    const link = c ? `${origin}/contrato/${c.token}` : '';
    const texto = c
      ? `Olá! Segue o contrato de prestação de serviços da ${nome}. 📄\n\n` +
        `*Produção do link:* ${brl(implantacao)} (pagamento único)\n` +
        `*Manutenção do link:* ${brl(mensal)}/mês, vencimento todo dia ${dia}\n\n` +
        `Para assinar, abra o link, leia e assine digitalmente pelo celular:\n${link}\n\n` +
        `Qualquer dúvida me chama.`
      : '';
    return {
      store_id: store.id,
      nome,
      slug: store.slug,
      segment: store.segment || 'food',
      whatsapp: business.whatsapp || '',
      logo_url: business.logo_url || '',
      theme_color: business.theme_color || '',
      status: c ? c.status : 'sem_contrato',
      token: c ? c.token : '',
      link,
      pdf: c ? `${link}/pdf` : '',
      valor_cents: mensal,
      valor_texto: brl(mensal),
      implantacao_cents: implantacao,
      implantacao_texto: brl(implantacao),
      dia_vencimento: dia,
      criado_em: c ? c.criado_em : '',
      signatario: c ? c.signatario : '',
      documento: c ? c.documento : '',
      assinado_em: c ? c.assinado_em : '',
      ip: c ? c.ip : '',
      hash: c ? c.hash : '',
      cancelado_em: c ? c.cancelado_em || '' : '',
      cancelado_por: c ? c.cancelado_por || '' : '',
      motivo_cancelamento: c ? c.motivo_cancelamento || '' : '',
      cancelamento_solicitado_em: c ? c.cancelamento_solicitado_em || '' : '',
      cancelamento_motivo_cliente: c ? c.cancelamento_motivo_cliente || '' : '',
      renovacao_de: c ? c.renovacao_de || 0 : 0,
      texto,
      whatsapp_url: business.whatsapp
        ? `https://wa.me/${String(business.whatsapp).replace(/\D/g, '').replace(/^(?!55)/, '55')}?text=${encodeURIComponent(texto)}`
        : '',
      whatsapp_escolher: c ? `https://wa.me/?text=${encodeURIComponent(texto)}` : '',
    };
  });
  res.json({
    contratos: lista,
    resumo: {
      total: lista.length,
      assinados: lista.filter((x) => x.status === 'assinado').length,
      pendentes: lista.filter((x) => x.status === 'pendente').length,
      sem_contrato: lista.filter((x) => x.status === 'sem_contrato').length,
      cancelados: lista.filter((x) => x.status === 'cancelado').length,
      cancelamento_pedido: lista.filter((x) => x.cancelamento_solicitado_em && x.status !== 'cancelado').length,
    },
  });
});

/** Texto pronto para mandar no WhatsApp com o link do contrato. */
router.get('/stores/:id/contrato/whatsapp', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);
  if (!c) return res.status(404).json({ error: 'Crie o contrato primeiro.' });
  const business = getSetting(store.id, 'business', {});
  const nome = business.name || store.name;
  const origin = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const valor = (c.valor_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const implantacao = ((c.implantacao_cents == null ? 10000 : c.implantacao_cents) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const link = `${origin}/contrato/${c.token}`;
  const text =
    `Olá! Segue o contrato de prestação de serviços da ${nome}. 📄\n\n` +
    `*Produção do link:* ${implantacao} (pagamento único)\n` +
    `*Manutenção do link:* ${valor}/mês, vencimento todo dia ${c.dia_vencimento}\n\n` +
    `Para assinar, abra o link, leia e assine digitalmente pelo celular:\n${link}\n\n` +
    `Qualquer dúvida me chama.`;
  res.json({ link, text, whatsapp_url: `https://wa.me/?text=${encodeURIComponent(text)}`, contrato: c });
});

/* ------------------------------------------------------------------ */
/* Mensalidades (quem pagou, quem está devendo)                        */
/* ------------------------------------------------------------------ */

const refAtual = () => new Date().toISOString().slice(0, 7); // AAAA-MM

function resumoMensalidades(storeId) {
  const c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(storeId);
  const pagas = db
    .prepare('SELECT * FROM mensalidades WHERE store_id = ? ORDER BY referencia DESC')
    .all(storeId);
  const ref = refAtual();
  const doMes = pagas.find((m) => m.referencia === ref);
  const hoje = new Date();
  const dia = c ? c.dia_vencimento : 10;
  const venceuEsteMes = hoje.getDate() > dia;
  const contratoCancelado = !!c && c.status === 'cancelado';
  return {
    valor_cents: c ? c.valor_cents : 4000,
    dia_vencimento: dia,
    referencia_atual: ref,
    pago_este_mes: !!doMes,
    em_atraso: !doMes && venceuEsteMes && !contratoCancelado,
    contrato_cancelado: contratoCancelado,
    total_pago_cents: pagas.reduce((s, m) => s + m.valor_cents, 0),
    pagamentos: pagas,
    contrato: c || null,
  };
}

/** Resumo de todas as lojas (para a aba Mensalidades). */
router.get('/mensalidades', requireMaster, (req, res) => {
  const lojas = listStores();
  res.json({
    referencia: refAtual(),
    lojas: lojas.map((st) => {
      const business = getSetting(st.id, 'business', {});
      const r = resumoMensalidades(st.id);
      return {
        id: st.id,
        slug: st.slug,
        name: business.name || st.name,
        ...r,
        pagamentos: r.pagamentos.slice(0, 12),
      };
    }),
  });
});

/** Mensalidades de uma loja. */
router.get('/stores/:id/mensalidades', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  res.json(resumoMensalidades(store.id));
});

/** Registrar um pagamento (mês de referência). */
router.post('/stores/:id/mensalidades', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const b = req.body || {};
  const referencia = String(b.referencia || refAtual()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(referencia)) return res.status(400).json({ error: 'Mês de referência inválido.' });
  const c = db.prepare('SELECT * FROM contratos WHERE store_id = ? ORDER BY id DESC LIMIT 1').get(store.id);
  const valor = Math.max(0, Number(b.valor_cents) || (c ? c.valor_cents : 4000));
  const existente = db.prepare('SELECT id FROM mensalidades WHERE store_id = ? AND referencia = ?').get(store.id, referencia);
  if (existente) {
    db.prepare('UPDATE mensalidades SET valor_cents=?, pago_em=?, forma=?, obs=? WHERE id=?').run(
      valor,
      b.pago_em || new Date().toISOString().slice(0, 10),
      String(b.forma || 'Pix').slice(0, 40),
      String(b.obs || '').slice(0, 300),
      existente.id
    );
    return res.json({ ok: true, id: existente.id, atualizado: true });
  }
  const info = db
    .prepare('INSERT INTO mensalidades (store_id, contrato_id, referencia, valor_cents, pago_em, forma, obs) VALUES (?,?,?,?,?,?,?)')
    .run(store.id, c ? c.id : 0, referencia, valor, b.pago_em || new Date().toISOString().slice(0, 10), String(b.forma || 'Pix').slice(0, 40), String(b.obs || '').slice(0, 300));
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

/** Apagar um lançamento. */
router.delete('/mensalidades/:id', requireMaster, (req, res) => {
  const info = db.prepare('DELETE FROM mensalidades WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  res.json({ ok: true });
});

/** Cobrança amigável pelo WhatsApp (link + valor + mês). */
router.get('/stores/:id/mensalidades/cobranca', requireMaster, (req, res) => {
  const store = getStoreById(Number(req.params.id));
  if (!store) return res.status(404).json({ error: 'Loja não encontrada.' });
  const business = getSetting(store.id, 'business', {});
  const nome = business.name || store.name;
  const r = resumoMensalidades(store.id);
  const [ano, mes] = r.referencia_atual.split('-');
  const mesNome = new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const valor = (r.valor_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const c = r.contrato;
  const origin = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const text =
    `Olá! Tudo bem? 😊\n\n` +
    `Passando para lembrar da mensalidade de *${mesNome}* do sistema da ${nome}:\n` +
    `*${valor}* — vencimento todo dia ${r.dia_vencimento}.\n\n` +
    `Pode pagar por Pix (me peça a chave) e me enviar o comprovante por aqui.\n` +
    (c ? `Contrato: ${origin}/contrato/${c.token}\n` : '') +
    `\nQualquer dúvida é só chamar. Obrigado!`;
  res.json({ text, whatsapp_url: `https://wa.me/?text=${encodeURIComponent(text)}`, ...r });
});

module.exports = router;
