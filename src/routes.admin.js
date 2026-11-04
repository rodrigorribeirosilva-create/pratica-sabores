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
const { testarCredenciais } = require('./pagamentos');
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

  // 1) senha do DONO: entra com acesso total
  if (verifyPassword(password, admin.password_hash)) {
    setStoreSession(res, req.store.id);
    return res.json({ ok: true, papel: 'admin', must_change: !!admin.must_change, store: { slug: req.store.slug, name: req.store.name } });
  }

  // 2) senha de FUNCIONÁRIO (barbeiro): entra só com agenda e clientes
  const funcionarios = require('./db')
    .db.prepare('SELECT * FROM funcionarios WHERE store_id = ? AND ativo = 1')
    .all(req.store.id);
  const f = funcionarios.find((x) => verifyPassword(password, x.senha_hash));
  if (f) {
    setStoreSession(res, req.store.id, 'funcionario', f.id);
    return res.json({
      ok: true,
      papel: 'funcionario',
      funcionario: { id: f.id, nome: f.nome, profissional_id: f.profissional_id },
      store: { slug: req.store.slug, name: req.store.name },
    });
  }
  return res.status(401).json({ error: 'Senha incorreta.' });
});

router.post('/logout', (req, res) => {
  clearStoreSession(res, req.store.id);
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  const admin = getSetting(req.store.id, 'admin', {});
  const cookie = require('./auth').parseCookies(req.headers.cookie || '')[require('./auth').cookieName(req.store.id)];
  const data = require('./auth').verifyToken(cookie);
  const daLoja = !!data && Number(data.store) === Number(req.store.id);
  const logged = daLoja && (data.sub === 'admin' || data.sub === 'funcionario');
  const papel = logged ? data.sub : '';
  let funcionario = null;
  if (papel === 'funcionario') {
    const f = db.prepare('SELECT id, nome, profissional_id FROM funcionarios WHERE id = ? AND store_id = ?').get(data.fid, req.store.id);
    funcionario = f || null;
  }
  res.json({
    logged,
    papel,
    funcionario,
    store: { slug: req.store.slug, name: req.store.name },
    must_change: papel === 'admin' ? !!admin.must_change : false,
  });
});

/* --------------------------------- produtos -------------------------------- */
router.get('/products', requireAuth, (req, res) => {
  const linhas = db
    .prepare('SELECT * FROM products WHERE store_id = ? ORDER BY sort_order ASC, id ASC')
    .all(req.store.id);
  res.json(
    linhas.map((p) => {
      let opcoes = null;
      try {
        opcoes = p.opcoes_json ? JSON.parse(p.opcoes_json) : null;
      } catch {
        opcoes = null;
      }
      return { ...p, opcoes: opcoes && opcoes.ativo ? opcoes : null };
    })
  );
});

/** Montagem de caixa: { ativo, titulo, unidades, sabores:[{nome, extra_cents}] } */
function montagemPayload(bruto) {
  if (!bruto || typeof bruto !== 'object') return '';
  const ativo = bruto.ativo === true || bruto.ativo === 1 || bruto.ativo === '1';
  const sabores = (Array.isArray(bruto.sabores) ? bruto.sabores : [])
    .map((s) => ({
      nome: String((s && s.nome) || '').trim().slice(0, 40),
      extra_cents: Math.max(0, Math.round(Number((s && s.extra_cents) || 0))),
      ativo: !(s && s.ativo === false),
    }))
    .filter((s) => s.nome)
    .slice(0, 30);
  const unidades = Math.max(1, Math.min(200, Math.round(Number(bruto.unidades) || 0)));
  const modo = String(bruto.modo || 'partes') === 'sabores' ? 'sabores' : 'partes';
  if (!ativo || !sabores.length) return '';
  return JSON.stringify({
    ativo: true,
    modo,
    titulo: String(bruto.titulo || 'Escolha os sabores').trim().slice(0, 60),
    unidades,
    // quantas barras vêm no item (1 barra grande, 8 mini barras…)
    barras: Math.max(1, Math.min(99, Math.round(Number(bruto.barras) || 1))),
    // barra: pode escolher de 1 até "unidades" sabores; caixa: precisa fechar o total
    minimo:
      modo === 'sabores'
        ? Math.max(1, Math.min(unidades, Math.round(Number(bruto.minimo) || Math.min(2, unidades))))
        : Math.max(1, Math.min(unidades, Math.round(Number(bruto.minimo) || unidades))),
    sabores,
  });
}

/**
 * Categoria padrão quando a pessoa não digita nenhuma: usa a categoria que a loja
 * mais usa (ex.: AGEO → "Bombons") em vez de chutar "Perfumes" numa loja de doces.
 */
function categoriaPadrao(storeId, store) {
  try {
    const { db } = require('./db');
    const linha = db
      .prepare(
        `SELECT category, COUNT(*) n FROM products
          WHERE store_id = ? AND TRIM(COALESCE(category, '')) != ''
          GROUP BY category ORDER BY n DESC, category ASC LIMIT 1`
      )
      .get(storeId);
    if (linha && linha.category) return linha.category;
  } catch {
    /* segue para o padrão do segmento */
  }
  return store && require('./db').segmentoEfetivo(store) === 'catalogo' ? 'Perfumes' : 'Marmitas';
}

function productPayload(body, store) {
  const name = String(body.name || '').trim();
  if (name.length < 2) return { error: 'Informe o nome do produto.' };
  const price_cents = parseMoneyToCents(body.price_cents ?? body.price);
  if (price_cents <= 0) return { error: 'Informe um preço válido.' };
  // trava contra preço digitado errado (ex.: R$ 189,00 virar R$ 18.900,00)
  if (price_cents > 5000000) {
    return { error: 'Preço muito alto (acima de R$ 50.000). Confira se digitou certo — ex.: 189,00.' };
  }
  return {
    data: {
      name,
      description: String(body.description || '').trim().slice(0, 400),
      price_cents,
      image_url: String(body.image_url || '').trim(),
      category: String(body.category || '').trim() || categoriaPadrao(store && store.id, store),
      active: body.active === false || body.active === 0 || body.active === '0' ? 0 : 1,
      sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      opcoes_json: montagemPayload(body.opcoes),
    },
  };
}

router.post('/products', requireAuth, (req, res) => {
  const { data, error } = productPayload(req.body || {}, req.store);
  if (error) return res.status(400).json({ error });
  const info = db
    .prepare(
      `INSERT INTO products (store_id, name, description, price_cents, image_url, category, active, sort_order, opcoes_json)
       VALUES (@store_id, @name, @description, @price_cents, @image_url, @category, @active, @sort_order, @opcoes_json)`
    )
    .run({ ...data, store_id: req.store.id });
  const criado = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ ...criado, opcoes: criado.opcoes_json ? JSON.parse(criado.opcoes_json) : null });
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
       opcoes_json=@opcoes_json,
       updated_at=datetime('now') WHERE id=@id AND store_id=@store_id`
  ).run({ ...data, id: existing.id, store_id: req.store.id });
  const atualizado = db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id);
  res.json({ ...atualizado, opcoes: atualizado.opcoes_json ? JSON.parse(atualizado.opcoes_json) : null });
});

/** Atualiza só a escolha de sabores (montagem) do produto, sem mexer no resto. */
router.patch('/products/:id/opcoes', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(id, req.store.id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });
  db.prepare('UPDATE products SET opcoes_json = ? WHERE id = ?').run(montagemPayload(req.body && req.body.opcoes), id);
  res.json({ ok: true, product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
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
    checkout: getSetting(req.store.id, 'checkout', { modo: 'todos' }),
    messages: getSetting(req.store.id, 'messages', {}),
    mercadopago: (() => {
      const mp = getSetting(req.store.id, 'mercadopago', {}) || {};
      let tok = '';
      try {
        tok = require('./db').lerSegredo(req.store.id, 'mp_access_token') || '';
      } catch {
        tok = '';
      }
      if (!tok) tok = String(mp.access_token || '');
      return {
        ativo: mp.ativo !== false,
        public_key: String(mp.public_key || ''),
        access_token_mask: tok ? `••••••••${tok.slice(-4)}` : '',
        tem_token: !!tok,
        nome_fatura: String(mp.nome_fatura || ''),
      };
    })(),
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
      /* chamada curta no topo do site (ex.: "Encomendas até as 16h") — opcional */
      hero_chamada:
        b.hero_chamada === undefined
          ? current.hero_chamada || ''
          : String(b.hero_chamada || '').trim().slice(0, 60),
      /* ramo (só muda palavras da própria loja: doce ≠ marmita) */
      ramo:
        b.ramo === undefined
          ? current.ramo || ''
          : String(b.ramo || '').toLowerCase() === 'doces'
            ? 'doces'
            : '',
      /* como a loja aparece: cardápio digital (comida) ou catálogo digital */
      tipo:
        b.tipo === undefined
          ? current.tipo || ''
          : String(b.tipo || '')
              .toLowerCase() === 'catalogo'
            ? 'catalogo'
            : String(b.tipo || '').toLowerCase() === 'cardapio'
              ? 'cardapio'
              : '',
      /* perfil da agenda: 'domicilio' (padrão de sempre) ou 'barbearia'
         (cliente atendido no local, com equipe de barbeiros). */
      perfil_agenda:
        b.perfil_agenda === undefined
          ? current.perfil_agenda || ''
          : String(b.perfil_agenda || '').toLowerCase() === 'barbearia'
            ? 'barbearia'
            : '',
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
    // AGEO: o formulário envia valores em reais (texto), mas ao abrir/fechar
    // pedidos o painel reenvia números já armazenados em centavos. Não os
    // multiplique por 100 outra vez; preserve também campos não enviados.
    const ehAgeo = req.store.slug === 'ageo-confeitaria';
    const entregaAtual = ehAgeo ? (getSetting(id, 'delivery', {}) || {}) : {};
    const centavosEntrega = (campo) => {
      const valor = d[campo];
      if (ehAgeo && valor === undefined) return Number(entregaAtual[campo] || 0);
      if (ehAgeo && typeof valor === 'number') return Number.isFinite(valor) ? Math.round(valor) : 0;
      return parseMoneyToCents(valor);
    };
    setSetting(id, 'delivery', {
      ...entregaAtual,
      fee_cents: centavosEntrega('fee_cents'),
      free_above_cents: centavosEntrega('free_above_cents'),
      pickup_enabled: ehAgeo && d.pickup_enabled === undefined ? entregaAtual.pickup_enabled !== false : d.pickup_enabled !== false,
      accepting_orders: ehAgeo && d.accepting_orders === undefined ? entregaAtual.accepting_orders !== false : d.accepting_orders !== false,
      closed_message: ehAgeo && d.closed_message === undefined ? String(entregaAtual.closed_message || '') : String(d.closed_message || '').trim().slice(0, 160),
      periods: ehAgeo && d.periods === undefined ? (entregaAtual.periods || []) : periods,
      periods_note: ehAgeo && d.periods_note === undefined ? String(entregaAtual.periods_note || '') : String(d.periods_note || '').trim().slice(0, 160),
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

  if (body.mercadopago) {
    const m = body.mercadopago;
    const atual = getSetting(id, 'mercadopago', {}) || {};
    const tokenDigitado = String(m.access_token || '').trim();
    const manterToken = !tokenDigitado || tokenDigitado.startsWith('•');
    // o Access Token vai para o cofre (criptografado); nunca fica em texto puro
    if (!manterToken) {
      require('./db').guardarSegredo(id, 'mp_access_token', tokenDigitado.slice(0, 400));
    }
    setSetting(id, 'mercadopago', {
      ativo: m.ativo !== false,
      public_key:
        m.public_key !== undefined ? String(m.public_key).trim().slice(0, 300) : atual.public_key || '',
      access_token: '', // fica no cofre; este campo é só do banco antigo
      nome_fatura:
        m.nome_fatura !== undefined
          ? String(m.nome_fatura).trim().replace(/[^A-Za-z0-9 ]/g, '').slice(0, 22)
          : atual.nome_fatura || '',
    });
  }

  /* Modo de exibição das formas de pagamento no site do cliente */
  if (body.checkout && body.checkout.modo !== undefined) {
    setSetting(id, 'checkout', {
      modo: String(body.checkout.modo).toLowerCase() === 'online' ? 'online' : 'todos',
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

/* ------------------- teste das credenciais do Mercado Pago ------------------ */
router.post('/mercadopago/testar', requireAuth, async (req, res) => {
  try {
    const r = await testarCredenciais(req.store.id);
    res.status(r.ok ? 200 : 400).json(r);
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message || 'Falha ao testar.' });
  }
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

// A AGEO pode corrigir o contato de um pedido sem alterar os demais dados.
router.patch('/orders/:id/phone', requireAuth, (req, res) => {
  if (req.store.slug !== 'ageo-confeitaria') return res.status(404).json({ error: 'Rota não encontrada.' });
  const phone = String((req.body || {}).phone || '').trim();
  if (!/^[+()\d\s.\-]+$/.test(phone) || !require('../public/ageo-telefone').numero(phone)) {
    return res.status(400).json({ error: 'Informe o WhatsApp completo com DDD, com ou sem +55.' });
  }
  const info = db.prepare('UPDATE orders SET phone = ? WHERE id = ? AND store_id = ?').run(phone, req.params.id, req.store.id);
  if (!info.changes) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json({ ok: true, phone });
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

/**
 * Vendas da loja: hoje, últimos 7 dias e mês corrente.
 * Devolve faturamento, nº de pedidos, itens vendidos (soma das quantidades),
 * ticket médio, os mais vendidos e a série dos últimos 14 dias.
 * Pedidos cancelados ficam de fora.
 */
router.get('/stats', requireAuth, (req, res) => {
  const id = req.store.id;

  // Loja de serviços não tem pedido: o que conta como venda é o agendamento.
  const ehServicos = req.store.segment === 'servicos';
  const pedidos = ehServicos
    ? db
        .prepare(
          `SELECT id, valor_cents AS total_cents, '' AS items_json, criado_em AS created_at
             FROM agendamentos
            WHERE store_id = ? AND status != 'cancelado'
              AND criado_em >= datetime('now','-40 days')`
        )
        .all(id)
    : db
        .prepare(
          `SELECT id, total_cents, items_json, created_at
             FROM orders
            WHERE store_id = ? AND status != 'cancelado'
              AND created_at >= datetime('now','-40 days')`
        )
        .all(id);

  const contaItens = (o) => {
    if (ehServicos) return 1; // cada agendamento é 1 serviço
    try {
      const itens = JSON.parse(o.items_json || '[]');
      return itens.reduce((n, it) => n + (Number(it.qty) || 0), 0);
    } catch {
      return 0;
    }
  };

  // Tudo é contado no horário de Brasília (UTC-3), que é o horário da loja —
  // senão um pedido das 22h caía no dia seguinte.
  const OFFSET_MS = -3 * 60 * 60 * 1000;
  const paraLoja = (ms) => new Date(ms + OFFSET_MS); // usa getUTC* para ler
  const p2 = (n) => String(n).padStart(2, '0');
  const chaveDia = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
  const chaveMes = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;

  const agora = Date.now();
  const hoje = paraLoja(agora);
  const diaHoje = chaveDia(hoje);
  const mesHoje = chaveMes(hoje);
  const mesAnteriorRef = (() => {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
    return chaveMes(d);
  })();

  const resumo = (lista) => {
    const total_cents = lista.reduce((n, o) => n + (Number(o.total_cents) || 0), 0);
    const itens = lista.reduce((n, o) => n + contaItens(o), 0);
    const pedidos = lista.length;
    return { pedidos, itens, total_cents, ticket_cents: pedidos ? Math.round(total_cents / pedidos) : 0 };
  };

  const comData = pedidos
    .map((o) => {
      const quando = new Date(String(o.created_at).replace(' ', 'T') + 'Z');
      return { ...o, ms: quando.getTime(), local: paraLoja(quando.getTime()) };
    })
    .filter((o) => Number.isFinite(o.ms));

  const doDia = comData.filter((o) => chaveDia(o.local) === diaHoje);
  const ultimos7 = comData.filter((o) => agora - o.ms < 7 * 86400000); // últimos 7 dias corridos
  const doMes = comData.filter((o) => chaveMes(o.local) === mesHoje);
  const mesAnterior = comData.filter((o) => chaveMes(o.local) === mesAnteriorRef);

  // mais vendidos do mês (por quantidade)
  const mapa = new Map();
  const servicosDoMes = ehServicos
    ? db
        .prepare(
          `SELECT servico_nome AS nome, COUNT(*) AS qtd, SUM(valor_cents) AS total_cents
             FROM agendamentos
            WHERE store_id = ? AND status != 'cancelado'
              AND strftime('%Y-%m', datetime(criado_em,'-3 hours')) = ?
            GROUP BY servico_nome ORDER BY qtd DESC LIMIT 8`
        )
        .all(id, mesHoje)
    : [];
  for (const o of doMes) {
    let itens = [];
    try {
      itens = JSON.parse(o.items_json || '[]');
    } catch {
      itens = [];
    }
    for (const it of itens) {
      // item montado vem como "Caixa (4 Beijinho, 8 Brigadeiro)": agrupa pela caixa
      let nome = String(it.name || 'Item');
      if (Array.isArray(it.escolhas) && it.escolhas.length) nome = nome.replace(/\s*\([^()]*\)\s*$/, '');
      const qtd = Number(it.qty) || 0;
      const valor = (Number(it.price_cents) || 0) * qtd;
      const atual = mapa.get(nome) || { nome, qtd: 0, total_cents: 0 };
      atual.qtd += qtd;
      atual.total_cents += valor;
      mapa.set(nome, atual);
    }
  }
  const maisVendidos = ehServicos
    ? servicosDoMes.map((r) => ({ nome: r.nome || 'Serviço', qtd: Number(r.qtd) || 0, total_cents: Number(r.total_cents) || 0 }))
    : [...mapa.values()].sort((a, b) => b.qtd - a.qtd || b.total_cents - a.total_cents).slice(0, 8);

  // série dos últimos 14 dias (para o gráfico), no fuso da loja
  const serie = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - i));
    const chave = chaveDia(d);
    serie.push({ dia: chave, ...resumo(comData.filter((o) => chaveDia(o.local) === chave)) });
  }

  const pending = db
    .prepare("SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND status IN ('novo','em_preparo')")
    .get(id).n;

  res.json({
    today: resumo(doDia),
    week: resumo(ultimos7),
    month: resumo(doMes),
    mes_anterior: resumo(mesAnterior),
    mais_vendidos: maisVendidos,
    serie_14_dias: serie,
    pending,
  });
});

/**
 * Relatório do mês em CSV (abre no Excel / Google Planilhas).
 * Uma linha por pedido, com os itens separados por ponto e vírgula.
 * ?mes=2026-11 (opcional; padrão = mês corrente)
 */
router.get('/vendas/relatorio.csv', requireAuth, (req, res) => {
  const id = req.store.id;
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || ''))
    ? String(req.query.mes)
    : new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 7);

  const linhas = db
    .prepare(
      `SELECT code, customer_name, phone, neighborhood, payment_method, status,
              subtotal_cents, fee_cents, total_cents, items_json, created_at
         FROM orders
        WHERE store_id = ? AND status != 'cancelado'
          AND strftime('%Y-%m', datetime(created_at, '-3 hours')) = ?
        ORDER BY created_at ASC`
    )
    .all(id, mes);

  const campo = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const dinheiro = (c) => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
  const dataBR = (ts) => {
    const d = new Date(String(ts).replace(' ', 'T') + 'Z');
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };

  const cabecalho = [
    'Pedido', 'Data', 'Cliente', 'Telefone', 'Bairro', 'Pagamento', 'Status',
    'Itens', 'Quantidade total', 'Subtotal (R$)', 'Entrega (R$)', 'Total (R$)',
  ];
  const corpo = linhas.map((o) => {
    let itens = [];
    try {
      itens = JSON.parse(o.items_json || '[]');
    } catch {
      itens = [];
    }
    const descricao = itens.map((it) => `${it.qty}x ${it.name}`).join(' | ');
    const qtd = itens.reduce((n, it) => n + (Number(it.qty) || 0), 0);
    return [
      o.code, dataBR(o.created_at), o.customer_name, o.phone, o.neighborhood,
      o.payment_method, o.status, descricao, qtd,
      dinheiro(o.subtotal_cents), dinheiro(o.fee_cents), dinheiro(o.total_cents),
    ].map(campo).join(';');
  });

  const total = linhas.reduce((n, o) => n + (Number(o.total_cents) || 0), 0);
  const totalItens = linhas.reduce((n, o) => {
    try {
      return n + (JSON.parse(o.items_json || '[]') || []).reduce((k, it) => k + (Number(it.qty) || 0), 0);
    } catch {
      return n;
    }
  }, 0);
  corpo.push('');
  corpo.push(
    ['TOTAL', `${linhas.length} pedidos`, '', '', '', '', '', '', totalItens,
      '', '', dinheiro(total)].map(campo).join(';')
  );

  const csv = '\uFEFF' + [cabecalho.map(campo).join(';'), ...corpo].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="vendas-${req.store.slug}-${mes}.csv"`);
  res.send(csv);
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
