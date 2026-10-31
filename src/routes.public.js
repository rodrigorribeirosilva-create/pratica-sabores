'use strict';
/** Rotas públicas: cardápio e criação de pedidos (por loja — req.store). */
const express = require('express');
const { db, getSetting } = require('./db');
const {
  normalizeWhatsapp,
  orderCode,
  buildWhatsappMessage,
} = require('./helpers');
const { limparMarca, baixarImagem } = require('./marca');
const { resolveUploadDir } = require('./paths');

const router = express.Router();

/* --------------------------- rate limit simples --------------------------- */
const hits = new Map();
function rateLimit({ windowMs, max, key }) {
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const rec = hits.get(k) || { count: 0, reset: now + windowMs };
    if (now > rec.reset) {
      rec.count = 0;
      rec.reset = now + windowMs;
    }
    rec.count += 1;
    hits.set(k, rec);
    if (rec.count > max) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    next();
  };
}

/* --------------------------------- cardápio -------------------------------- */
/* ------------------------------------------------------------------ */
/* Marca d'água limpa: a arte do logotipo, sem o fundo claro            */
/* ------------------------------------------------------------------ */
router.get('/marca-dagua', async (req, res) => {
  try {
    const business = getSetting(req.store.id, 'business', {}) || {};
    const fonte = business.watermark_url || business.logo_url;
    if (!fonte) return res.status(404).end();

    const origem = `${req.protocol}://${req.get('host')}`;
    const buffer = await baixarImagem(fonte, origem, resolveUploadDir());
    const r = await limparMarca(buffer);

    res.set('Cache-Control', 'public, max-age=3600');
    if (!r.png) return res.redirect(302, /^https?:/i.test(fonte) ? fonte : origem + fonte);
    res.type('png').send(r.png);
  } catch (e) {
    console.error('[marca-dagua]', e.message);
    res.status(404).end();
  }
});

router.get('/menu', (req, res) => {
  const store = req.store;
  const business = getSetting(store.id, 'business', {});
  const delivery = getSetting(store.id, 'delivery', {});
  const payments = (getSetting(store.id, 'payments', []) || []).filter((p) => p.active);

  const products = db
    .prepare(
      `SELECT id, name, description, price_cents, image_url, category, sort_order
         FROM products WHERE store_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC`
    )
    .all(store.id);

  const categories = [];
  for (const p of products) {
    if (p.category && !categories.includes(p.category)) categories.push(p.category);
  }

  res.json({
    store: { slug: store.slug, name: store.name, segment: store.segment || 'food' },
    business: {
      name: business.name || store.name || 'Meu negócio',
      tagline: business.tagline || '',
      whatsapp: business.whatsapp || '',
      instagram: business.instagram || '',
      address: business.address || '',
      about: business.about || '',
      cover_url: business.cover_url || '',
      logo_url: business.logo_url || '',
      watermark_url: business.watermark_url || '',
      theme_color: business.theme_color || '#1e6b4f',
      accent_color: business.accent_color || '#f0a63c',
    },
    delivery: {
      fee_cents: Number(delivery.fee_cents || 0),
      free_above_cents: Number(delivery.free_above_cents || 0),
      pickup_enabled: delivery.pickup_enabled !== false,
      periods: (delivery.periods || []).filter((p) => p.active),
      periods_note: delivery.periods_note || '',
    },
    payments: payments.map((p) => ({
      id: p.id,
      label: p.label,
      instructions: p.instructions || '',
      key: p.key || '',
      pay_url: p.pay_url || '',
      aceita_credito: p.aceita_credito !== false,
      aceita_debito: p.aceita_debito !== false,
    })),
    accepting_orders: delivery.accepting_orders !== false,
    closed_message: delivery.closed_message || 'Estamos fechados para novos pedidos agora. Volte em breve!',
    categories,
    products,
  });
});

/* ------------------------------ criar pedido ------------------------------ */
router.post(
  '/orders',
  rateLimit({ windowMs: 60_000, max: 12, key: (req) => `order:${req.store.id}:${req.ip}` }),
  (req, res) => {
    try {
      const store = req.store;
      const body = req.body || {};
      const deliveryCfg = getSetting(store.id, 'delivery', {});
      if (deliveryCfg.accepting_orders === false) {
        return res.status(409).json({
          error: deliveryCfg.closed_message || 'Estamos fechados para novos pedidos agora.',
        });
      }
      const items = Array.isArray(body.items) ? body.items : [];
      if (!items.length) return res.status(400).json({ error: 'Adicione pelo menos um item ao carrinho.' });

      const customer_name = String(body.customer_name || '').trim();
      const phone = String(body.phone || '').trim();
      const fulfillment = body.fulfillment === 'pickup' ? 'pickup' : 'delivery';
      const address = String(body.address || '').trim();
      const neighborhood = String(body.neighborhood || '').trim();
      const complement = String(body.complement || '').trim();
      const notes = String(body.notes || '').trim().slice(0, 500);
      const period = String(body.period || '').trim();
      const payment_method = String(body.payment_method || '').trim();
      const payment_id = String(body.payment_id || '').trim();
      const payment_detail = String(body.payment_detail || '').trim().slice(0, 140);

      const errors = [];
      if (customer_name.length < 2) errors.push('Informe seu nome.');
      if (phone.replace(/\D/g, '').length < 10) errors.push('Informe um telefone válido com DDD.');
      if (fulfillment === 'delivery' && address.length < 3) errors.push('Informe o endereço de entrega.');
      if (!payment_method && !payment_id) errors.push('Escolha a forma de pagamento.');
      if (errors.length) return res.status(400).json({ error: errors[0], errors });

      // Recalcula preços no servidor (nunca confia no navegador)
      const getProduct = db.prepare('SELECT id, name, price_cents, active FROM products WHERE id = ? AND store_id = ?');
      const resolved = [];
      for (const raw of items) {
        const id = Number(raw.id);
        const qty = Math.max(1, Math.min(99, Number(raw.qty) || 1));
        const p = getProduct.get(id, store.id);
        if (!p || !p.active) continue;
        resolved.push({ id: p.id, name: p.name, price_cents: p.price_cents, qty });
      }
      if (!resolved.length) return res.status(400).json({ error: 'Os produtos do carrinho não estão mais disponíveis.' });

      const delivery = getSetting(store.id, 'delivery', {});
      const payments = getSetting(store.id, 'payments', []) || [];
      const deliveryLabelMap = Object.fromEntries((delivery.periods || []).map((p) => [p.label, p.label]));

      const subtotal_cents = resolved.reduce((sum, it) => sum + it.price_cents * it.qty, 0);

      let fee_cents = 0;
      if (fulfillment === 'delivery') {
        fee_cents = Number(delivery.fee_cents || 0);
        const freeAbove = Number(delivery.free_above_cents || 0);
        if (freeAbove > 0 && subtotal_cents >= freeAbove) fee_cents = 0;
      }
      const total_cents = subtotal_cents + fee_cents;

      const pay = payments.find(
        (p) => (payment_id && p.id === payment_id) || p.label === payment_method || p.id === payment_method
      );
      let paymentLabel = pay ? pay.label : payment_method;
      if (pay && pay.instructions) paymentLabel += ` (${pay.instructions})`;
      // detalhe escolhido pelo cliente: "troco para R$ 100,00", "débito na entrega"…
      if (payment_detail) paymentLabel += ` — ${payment_detail}`;

      const info = db
        .prepare(
          `INSERT INTO orders (store_id, code, customer_name, phone, address, neighborhood, complement, notes,
             fulfillment, payment_method, period, subtotal_cents, fee_cents, total_cents, items_json)
           VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          store.id,
          customer_name,
          phone,
          address,
          neighborhood,
          complement,
          notes,
          fulfillment,
          paymentLabel,
          period,
          subtotal_cents,
          fee_cents,
          total_cents,
          JSON.stringify(resolved)
        );

      const code = orderCode(info.lastInsertRowid, store.code_prefix);
      db.prepare('UPDATE orders SET code = ? WHERE id = ?').run(code, info.lastInsertRowid);

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
      const business = getSetting(store.id, 'business', {});

      const totalStr = (total_cents / 100).toFixed(2);
      const payUrl = pay && pay.pay_url
        ? pay.pay_url
            .replace(/\{valor\}/g, totalStr)
            .replace(/\{codigo\}/g, code)
            .replace(/\{total\}/g, totalStr)
        : '';

      const message = buildWhatsappMessage({
        business: { ...business, name: business.name || store.name },
        order: {
          ...order,
          payment_url: payUrl,
          payment_key: pay && pay.key ? pay.key : (String(payment_detail || '').length ? '' : ''),
        },
        items: resolved,
        deliveryLabel: deliveryLabelMap[period] || period,
      });

      const number = normalizeWhatsapp(business.whatsapp);
      const whatsapp_url = number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '';

      res.status(201).json({
        order: {
          payment_url: payUrl,
          payment_key: (pay && pay.key) || '',
          id: order.id,
          code: order.code,
          subtotal_cents,
          fee_cents,
          total_cents,
          fulfillment,
          period,
          payment_method: paymentLabel,
          customer_name,
        },
        whatsapp_url,
        message,
      });
    } catch (err) {
      console.error('[orders] erro:', err);
      res.status(500).json({ error: 'Não foi possível registrar o pedido. Tente novamente.' });
    }
  }
);

/** Rastreio simples do pedido pelo código (usado na tela de sucesso) */
router.get('/orders/:code', (req, res) => {
  const row = db
    .prepare('SELECT code, status, total_cents, created_at FROM orders WHERE code = ? AND store_id = ?')
    .get(req.params.code, req.store.id);
  if (!row) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json(row);
});

module.exports = router;
