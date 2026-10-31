'use strict';
/**
 * Rotas do painel administrativo — TODAS presas a uma loja (req.store).
 * Senha, produtos, pedidos, configurações e fotos são separados por loja.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const storage = require('./storage');
const QRCode = require('qrcode');

const { db, getSetting, setSetting, hashPassword, verifyPassword, resolveUploadDir, recordStorePassword } = require('./db');
const { requireAuth, setStoreSession, clearStoreSession } = require('./auth');
const { parseMoneyToCents, normalizeWhatsapp, formatDateTimeBR } = require('./helpers');

const router = express.Router();
const UPLOAD_ROOT = resolveUploadDir();
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

/** Pasta de fotos da loja: uploads/<slug>/ (criada sob demanda). */
function storeUploadDir(store) {
  const dir = path.join(UPLOAD_ROOT, store.slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/* --------------------------------- login --------------------------------- */
const loginHits = new Map();
router.post('/login', (req, res) => {
  const key = `login:${req.store.id}:${req.ip}`;
  const now = Date.now();
  const rec = loginHits.get(key) || { count: 0, reset: now + 10 * 60_000 };
  if (now > rec.reset) {
    rec.count = 0;
    rec.reset = now + 10 * 60_000;
  }
  rec.count += 1;
  loginHits.set(key, rec);
  if (rec.count > 8) return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' });

  const admin = getSetting(req.store.id, 'admin', {});
  const password = String((req.body || {}).password || '');
  if (!verifyPassword(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  setStoreSession(res, req.store.id);
  res.json({ ok: true, must_change: !!admin.must_change, store: { slug: req.store.slug, name: req.store.name } });
});

router.post('/logout', (req, res) => {
  clearStoreSession(res, req.store.id);
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const admin = getSetting(req.store.id, 'admin', {});
  const cookie = require('./auth').parseCookies(req.headers.cookie || '')[require('./auth').cookieName(req.store.id)];
  const data = require('./auth').verifyToken(cookie);
  const logged = !!data && data.sub === 'admin' && Number(data.store) === Number(req.store.id);
  res.json({
    logged,
    store: { slug: req.store.slug, name: req.store.name },
    must_change: logged ? !!admin.must_change : false,
  });
});

/* --------------------------------- produtos -------------------------------- */
router.get('/products', requireAuth, (req, res) => {
  res.json(
    db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY sort_order ASC, id ASC').all(req.store.id)
  );
});

function productPayload(body, store) {
  const name = String(body.name || '').trim();
  if (name.length < 2) return { error: 'Informe o nome do produto.' };
  const price_cents = parseMoneyToCents(body.price_cents ?? body.price);
  if (price_cents <= 0) return { error: 'Informe um preço válido.' };
  return {
    data: {
      name,
      description: String(body.description || '').trim().slice(0, 400),
      price_cents,
      image_url: String(body.image_url || '').trim(),
      category:
        String(body.category || '').trim() ||
        ((store && store.segment === 'catalogo') ? 'Perfumes' : 'Marmitas'),
      active: body.active === false || body.active === 0 || body.active === '0' ? 0 : 1,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    },
  };
}

router.post('/products', requireAuth, (req, res) => {
  const { data, error } = productPayload(req.body || {}, req.store);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare(
      `INSERT INTO products (store_id, name, description, price_cents, image_url, category, active, sort_order)
       VALUES (@store_id, @name, @description, @price_cents, @image_url, @category, @active, @sort_order)`
    )
    .run({ ...data, store_id: req.store.id });
  res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/products/:id', requireAuth, (req, res) => {
  const existing = db
    .prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
    .get(req.params.id, req.store.id);
  if (!existing) return res.status(404).json({ error: 'Produto não encontrado.' });
  const { data, error } = productPayload(req.body || {}, req.store);
  if (error) return res.status(400).json({ error });
  db.prepare(
    `UPDATE products SET name=@name, description=@description, price_cents=@price_cents,
       image_url=@image_url, category=@category, active=@active, sort_order=@sort_order,
       updated_at=datetime('now') WHERE id=@id AND store_id=@store_id`
  ).run({ ...data, id: existing.id, store_id: req.store.id });
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id));
});

router.patch('/products/:id/active', requireAuth, (req, res) => {
  const active = req.body && (req.body.active === true || req.body.active === 1) ? 1 : 0;
  const info = db
    .prepare("UPDATE products SET active = ?, updated_at = datetime('now') WHERE id = ? AND store_id = ?")
    .run(active, req.params.id, req.store.id);
  if (!info.changes) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json({ ok: true, active });
});

router.delete('/products/:id', requireAuth, (req, res) => {
  const info = db
    .prepare('DELETE FROM products WHERE id = ? AND store_id = ?')
    .run(req.params.id, req.store.id);
  if (!info.changes) return res.status(404).json({ error: 'Produto não encontrado.' });
  res.json({ ok: true });
});

/* -------------------------------- uploads -------------------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Envie uma imagem JPG, PNG, WEBP ou GIF.'));
  },
});

router.post('/upload', requireAuth, async (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo recebido.' });
    const ext = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/avif': '.avif',
    }[req.file.mimetype];
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;

    // Foto vai para a nuvem (não some em deploy); sem nuvem, cai no disco local.
    if (storage.ATIVO) {
      try {
        const url = await storage.salvarImagem(req.file.buffer, name, req.store.slug, req.file.mimetype);
        return res.status(201).json({ url });
      } catch (e) {
        console.error('[foto] nuvem falhou:', e.message);
        return res.status(502).json({ error: 'Não foi possível salvar a foto agora. Tente de novo.' });
      }
    }
    fs.writeFileSync(path.join(storeUploadDir(req.store), name), req.file.buffer);
    res.status(201).json({ url: `/uploads/${req.store.slug}/${name}` });
  });
});

/* ------------------------------ configurações ------------------------------ */
router.get('/settings', requireAuth, (req, res) => {
  const admin = getSetting(req.store.id, 'admin', {});
  res.json({
    store: { slug: req.store.slug, name: req.store.name },
    business: getSetting(req.store.id, 'business', {}),
    delivery: getSetting(req.store.id, 'delivery', {}),
    payments: getSetting(req.store.id, 'payments', []),
    messages: getSetting(req.store.id, 'messages', {}),
    must_change: !!admin.must_change,
  });
});

router.put('/settings', requireAuth, (req, res) => {
  const body = req.body || {};
  const id = req.store.id;

  if (body.business) {
    const b = body.business;
    const current = getSetting(id, 'business', {});
    setSetting(id, 'business', {
      ...current,
      name: String(b.name || '').trim() || 'Minha loja',
      tagline: String(b.tagline || '').trim().slice(0, 120),
      whatsapp: normalizeWhatsapp(b.whatsapp),
      instagram: String(b.instagram || '').trim().replace(/^@/, ''),
      address: String(b.address || '').trim().slice(0, 160),
      about: String(b.about || '').trim().slice(0, 400),
      cover_url: String(b.cover_url || '').trim(),
      logo_url: String(b.logo_url || '').trim(),
      watermark_url:
        b.watermark_url === undefined
          ? current.watermark_url || ''
          : String(b.watermark_url || '').trim().slice(0, 500),
      theme_color: b.theme_color === undefined ? current.theme_color || '#1e6b4f' : String(b.theme_color || '#1e6b4f').slice(0, 9),
      accent_color: b.accent_color === undefined ? current.accent_color || '#f0a63c' : String(b.accent_color || '#f0a63c').slice(0, 9),
    });
  }

  if (body.delivery) {
    const d = body.delivery;
    const periods = (Array.isArray(d.periods) ? d.periods : [])
      .map((p, i) => ({
        id: String(p.id || `p${i + 1}`),
        label: String(p.label || '').trim().slice(0, 40),
        active: p.active !== false,
      }))
      .filter((p) => p.label);
    setSetting(id, 'delivery', {
      fee_cents: parseMoneyToCents(d.fee_cents),
      free_above_cents: parseMoneyToCents(d.free_above_cents),
      pickup_enabled: d.pickup_enabled !== false,
      accepting_orders: d.accepting_orders !== false,
      closed_message: String(d.closed_message || '').trim().slice(0, 160),
      periods,
      periods_note: String(d.periods_note || '').trim().slice(0, 160),
    });
  }

  if (body.messages) {
    const m = body.messages;
    setSetting(id, 'messages', {
      out_for_delivery: String(m.out_for_delivery || '').slice(0, 600),
      confirmed: String(m.confirmed || '').slice(0, 600),
      preparing: String(m.preparing || '').slice(0, 600),
      delivered: String(m.delivered || '').slice(0, 600),
    });
  }

  if (Array.isArray(body.payments)) {
    const payments = body.payments
      .map((p) => ({
        id: String(p.id || crypto.randomBytes(4).toString('hex')),
        label: String(p.label || '').trim().slice(0, 40),
        active: p.active !== false,
        instructions: String(p.instructions || '').trim().slice(0, 200),
        key: String(p.key || '').trim().slice(0, 120),
        pay_url: String(p.pay_url || '').trim().slice(0, 500),
        aceita_credito: p.aceita_credito !== false,
        aceita_debito: p.aceita_debito !== false,
      }))
      .filter((p) => p.label);
    setSetting(id, 'payments', payments);
  }

  res.json({ ok: true });
});

router.post('/password', requireAuth, (req, res) => {
  const current = String((req.body || {}).current_password || '');
  const next = String((req.body || {}).new_password || '');
  const admin = getSetting(req.store.id, 'admin', {});
  if (!verifyPassword(current, admin.password_hash)) {
    return res.status(400).json({ error: 'A senha atual está incorreta.' });
  }
  if (next.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter ao menos 6 caracteres.' });
  setSetting(req.store.id, 'admin', {
    ...admin,
    password_hash: hashPassword(next),
    must_change: false,
  });
  // guarda a senha no cofre para o master poder consultar (suporte)
  recordStorePassword(req.store.id, next, { by: 'admin' });
  res.json({ ok: true });
});

/* --------------------------------- pedidos -------------------------------- */
router.get('/orders', requireAuth, (req, res) => {
  const status = String(req.query.status || '');
  const rows =
    status && status !== 'todos'
      ? db
          .prepare('SELECT * FROM orders WHERE store_id = ? AND status = ? ORDER BY id DESC LIMIT 300')
          .all(req.store.id, status)
      : db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY id DESC LIMIT 300').all(req.store.id);
  res.json(
    rows.map((o) => ({
      ...o,
      items: JSON.parse(o.items_json || '[]'),
      created_at_br: formatDateTimeBR(o.created_at),
    }))
  );
});

router.patch('/orders/:id/status', requireAuth, (req, res) => {
  const allowed = ['novo', 'em_preparo', 'saiu_entrega', 'concluido', 'cancelado'];
  const status = String((req.body || {}).status || '');
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const info = db
    .prepare('UPDATE orders SET status = ? WHERE id = ? AND store_id = ?')
    .run(status, req.params.id, req.store.id);
  if (!info.changes) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ ok: true, status });
});

router.get('/stats', requireAuth, (req, res) => {
  const id = req.store.id;
  const today = db
    .prepare(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total_cents),0) AS total
         FROM orders WHERE store_id = ? AND date(created_at) = date('now') AND status != 'cancelado'`
    )
    .get(id);
  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND status IN ('novo','em_preparo')")
    .get(id).n;
  const week = db
    .prepare(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(total_cents),0) AS total
         FROM orders WHERE store_id = ? AND created_at >= datetime('now','-7 days') AND status != 'cancelado'`
    )
    .get(id);
  res.json({ today, week, pending });
});

/* --------------------------------- backup --------------------------------- */
/** Backup em JSON: só os dados DESTA loja (produtos, pedidos e configurações). */
router.get('/backup', requireAuth, (req, res) => {
  const id = req.store.id;
  const payload = {
    tipo: 'backup-loja',
    loja: { slug: req.store.slug, nome: req.store.name },
    gerado_em: new Date().toISOString(),
    configuracoes: {
      business: getSetting(id, 'business', {}),
      delivery: getSetting(id, 'delivery', {}),
      payments: getSetting(id, 'payments', []),
      messages: getSetting(id, 'messages', {}),
    },
    produtos: db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY id').all(id),
    pedidos: db
      .prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY id')
      .all(id)
      .map((o) => ({ ...o, items: JSON.parse(o.items_json || '[]') })),
  };
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backup-${req.store.slug}-${stamp}.json"`);
  res.send(JSON.stringify(payload, null, 2));
});

/* ------------------------------- QR do cardápio ---------------------------- */
router.get('/qr', async (req, res) => {
  const url = String(req.query.url || '').trim();
  if (!/^https?:\/\//.test(url)) return res.status(400).send('URL inválida');
  try {
    const png = await QRCode.toBuffer(url, { width: 480, margin: 2, color: { dark: '#17211c', light: '#ffffff' } });
    res.type('png').send(png);
  } catch {
    res.status(500).send('Erro ao gerar QR');
  }
});

module.exports = router;
