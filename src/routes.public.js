'use strict';
/** Rotas públicas: cardápio e criação de pedidos (por loja — req.store). */
const express = require('express');
const { db, getSetting, segmentoEfetivo } = require('./db');
const {
  normalizeWhatsapp,
  orderCode,
  buildWhatsappMessage,
} = require('./helpers');
const { limparMarca, baixarImagem } = require('./marca');
const { resolveUploadDir } = require('./paths');
const { registrarEvento, origemDaSessao, sessaoDe } = require('./rastreio');
const {
  cartaoOnlineDisponivel,
  configPublica,
  cobrarCartao,
  consultarPagamento,
  criarLinkCheckoutPro,
  traduzirStatus,
  motivoRecusa,
} = require('./pagamentos');

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

/* --------------------------- pagamento com cartão -------------------------- */
/** A forma escolhida pelo cliente é a de cartão online? */
function ehCartaoOnline(p) {
  const t = `${(p && p.id) || ''} ${(p && p.label) || ''}`.toLowerCase();
  if (/pix|dinheiro|esp[eé]cie/.test(t)) return false;
  return /cart/.test(t) && /online|cr[eé]dito/.test(t) && !/entrega|retirada|maquininha/.test(t);
}

function resumoPagamento(p) {
  return {
    status: p.status,
    status_detail: p.status_detail,
    chave: p.chave,
    rotulo: p.rotulo,
    aprovado: !!p.aprovado,
    parcelas: p.parcelas,
    bandeira: p.bandeira,
    motivo: p.motivo || '',
    id: p.id,
  };
}

/** Grava o resultado da cobrança no pedido e devolve o resumo. */
function gravarPagamento(storeId, orderId, p, payLabel) {
  const detalhe = `${p.parcelas || 1}x · ${p.rotulo}`;
  const label = `${payLabel} — ${detalhe}`;
  db.prepare(
    `UPDATE orders SET payment_status = ?, payment_gateway = 'mercadopago',
       payment_gateway_id = ?, payment_detail = ?, payment_method = ? WHERE id = ? AND store_id = ?`
  ).run(p.chave, String(p.id || ''), detalhe, label, orderId, storeId);
  return p;
}

async function cobrarPedido({ req, store, orderId, code, valorCents, cartao, items }) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const business = getSetting(store.id, 'business', {});
  const nomes = (items || []).map((i) => `${i.qty}x ${i.name}`).join(', ').slice(0, 120);
  const descricao = `Pedido ${code} - ${business.name || store.name}${nomes ? ` (${nomes})` : ''}`;

  const resultado = await cobrarCartao({
    storeId: store.id,
    storeSlug: store.slug,
    valorCents,
    descricao,
    referencia: code,
    token: cartao.token,
    paymentMethodId: cartao.payment_method_id,
    installments: cartao.installments,
    issuerId: cartao.issuer_id,
    email: cartao.email || cartao.payer_email,
    cpf: (cartao.cpf || (cartao.payer && cartao.payer.identification && cartao.payer.identification.number) || ''),
    nomeTitular: cartao.nome_titular || '',
    baseUrl,
    tentativa: Date.now(),
  });

  const payLabel = (String(cartao.pay_label || '').trim() || 'Cartão de crédito (online)').slice(0, 60);
  return gravarPagamento(store.id, orderId, resultado, payLabel);
}

/** Recalcula o total do pedido a partir do banco (nunca confia no navegador). */
function totalDoPedido(storeId, code) {
  const row = db
    .prepare('SELECT * FROM orders WHERE code = ? AND store_id = ?')
    .get(code, storeId);
  return row || null;
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
  // Forma de pagamento "cartão online" só aparece para o cliente se o Mercado Pago
  // da loja estiver configurado — assim ninguém escolhe algo que não vai funcionar.
  const mpOk = require('./pagamentos').checkoutProDisponivel(store.id);
  const modoCheckout = (getSetting(store.id, 'checkout', { modo: 'todos' }) || {}).modo === 'online' ? 'online' : 'todos';
  let payments = (getSetting(store.id, 'payments', []) || [])
    .filter((p) => p.active)
    .filter((p) => !(String(p.id || '') === 'cartao_online' && !mpOk));

  // "Somente pagamento online": o cliente vê só um botão e escolhe Pix, boleto
  // ou cartão na página segura (Mercado Pago ou link de pagamento da loja).
  const linkLoja = (payments.find((p) => p.pay_url) || {}).pay_url || '';
  if (modoCheckout === 'online' && (mpOk || linkLoja)) {
    payments = [
      {
        id: 'cartao_online',
        label: 'Pagamento online',
        instructions: 'Pix, boleto ou cartão na página segura',
        active: true,
        key: '',
        pay_url: linkLoja,
        aceita_credito: false,
        aceita_debito: false,
      },
    ];
  }

  const products = db
    .prepare(
      `SELECT id, name, description, price_cents, image_url, category, sort_order, opcoes_json
         FROM products WHERE store_id = ? AND active = 1 ORDER BY sort_order ASC, id ASC`
    )
    .all(store.id);

  const categories = [];
  for (const p of products) {
    if (p.category && !categories.includes(p.category)) categories.push(p.category);
  }

  res.json({
    store: { slug: store.slug, name: store.name, segment: segmentoEfetivo(store) },
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
      ramo: business.ramo || '',
      hero_chamada: business.hero_chamada || '',
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
    pagamentos_online: { cartao: configPublica(store.id) },
    checkout_modo: modoCheckout,
    accepting_orders: delivery.accepting_orders !== false,
    closed_message: delivery.closed_message || 'Estamos fechados para novos pedidos agora. Volte em breve!',
    categories,
    products: products.map((p) => {
      let opcoes = null;
      try {
        opcoes = p.opcoes_json ? JSON.parse(p.opcoes_json) : null;
      } catch {
        opcoes = null;
      }
      const { opcoes_json, ...resto } = p;
      return { ...resto, opcoes: opcoes && opcoes.ativo ? opcoes : null };
    }),
  });
});

/* ------------------------------ criar pedido ------------------------------ */
router.post(
  '/orders',
  rateLimit({ windowMs: 60_000, max: 12, key: (req) => `order:${req.store.id}:${req.ip}` }),
  async (req, res) => {
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
      const cartao = body.cartao && typeof body.cartao === 'object' ? body.cartao : null;

      const errors = [];
      if (customer_name.length < 2) errors.push('Informe seu nome.');
      if (store.slug === 'ageo-confeitaria') {
        if (!/^[+()\d\s.\-]+$/.test(phone) || !require('../public/ageo-telefone').numero(phone)) {
          errors.push('Informe o WhatsApp completo com DDD, com ou sem +55.');
        }
      } else if (phone.replace(/\D/g, '').length < 10) errors.push('Informe um telefone válido com DDD.');
      if (fulfillment === 'delivery' && address.length < 3) errors.push('Informe o endereço de entrega.');
      if (!payment_method && !payment_id) errors.push('Escolha a forma de pagamento.');
      if (errors.length) return res.status(400).json({ error: errors[0], errors });

      // Recalcula preços no servidor (nunca confia no navegador)
      const getProduct = db.prepare(
        'SELECT id, name, price_cents, active, opcoes_json FROM products WHERE id = ? AND store_id = ?'
      );
      const resolved = [];
      for (const raw of items) {
        const id = Number(raw.id);
        const qty = Math.max(1, Math.min(99, Number(raw.qty) || 1));
        const p = getProduct.get(id, store.id);
        if (!p || !p.active) continue;

        let montagem = null;
        try {
          montagem = p.opcoes_json ? JSON.parse(p.opcoes_json) : null;
        } catch {
          montagem = null;
        }

        if (!montagem || !montagem.ativo) {
          resolved.push({ id: p.id, name: p.name, price_cents: p.price_cents, qty });
          continue;
        }

        // ---- produto com montagem (caixa de doces, sabores etc.) ----
        const escolhidos = Array.isArray(raw.escolhas) ? raw.escolhas : [];
        const modoSabores = montagem.modo === 'sabores'; // barra: cada sabor conta 1
        const sabores = (montagem.sabores || []).filter((s) => s.ativo !== false);
        const porNome = Object.fromEntries(sabores.map((s) => [s.nome, s]));
        const contagem = [];
        let totalUnidades = 0;
        let extraCents = 0;

        for (const e of escolhidos) {
          const sabor = porNome[String(e && e.nome)];
          const n = modoSabores
            ? 1
            : Math.max(0, Math.min(montagem.unidades, Math.round(Number(e && e.qtd) || 0)));
          if (!sabor || !n) continue;
          contagem.push({ nome: sabor.nome, qtd: n, extra_cents: Number(sabor.extra_cents || 0) });
          totalUnidades += n;
          extraCents += Number(sabor.extra_cents || 0) * n;
        }

        const precisa = Number(montagem.unidades) || 0;
        const minimo = Number(montagem.minimo) || precisa;
        const porSabores = modoSabores; // barra: conta sabores, não unidades

        if (porSabores) {
          const distintos = contagem.length;
          if (distintos < Math.min(2, precisa)) {
            return res.status(400).json({
              error: `${p.name}: escolha pelo menos ${Math.min(2, precisa)} sabores (você escolheu ${distintos}).`,
            });
          }
          if (distintos > precisa) {
            return res.status(400).json({ error: `${p.name}: essa barra leva no máximo ${precisa} sabores.` });
          }
        } else {
          if (totalUnidades < minimo) {
            return res.status(400).json({
              error: `${p.name}: escolha ${precisa} unidades (você escolheu ${totalUnidades}).`,
            });
          }
          if (totalUnidades > precisa) {
            return res.status(400).json({ error: `${p.name}: o máximo é ${precisa} unidades.` });
          }
        }

        const resumo = porSabores
          ? contagem.map((c) => c.nome).join(', ')
          : contagem.map((c) => `${c.qtd} ${c.nome}`).join(', ');
        resolved.push({
          id: p.id,
          name: `${p.name} (${resumo})`,
          price_cents: p.price_cents + extraCents,
          unit_base_cents: p.price_cents,
          extra_cents: extraCents,
          escolhas: contagem,
          qty,
        });
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

      // de onde veio esse pedido (campanha do anúncio / link rastreado)
      const origem = origemDaSessao(store.id, sessaoDe(req, res));

      const info = db
        .prepare(
          `INSERT INTO orders (store_id, code, customer_name, phone, address, neighborhood, complement, notes,
             fulfillment, payment_method, period, subtotal_cents, fee_cents, total_cents, items_json,
             origem_fonte, origem_campanha)
           VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
          JSON.stringify(resolved),
          origem.source,
          origem.campaign
        );

      const code = orderCode(info.lastInsertRowid, store.code_prefix);
      db.prepare('UPDATE orders SET code = ? WHERE id = ?').run(code, info.lastInsertRowid);

      // ---- cartão de crédito online (Mercado Pago): cobra agora ----
      let pagamento = null;
      if (cartao && cartao.token && pay && ehCartaoOnline(pay) && cartaoOnlineDisponivel(store.id)) {
        pagamento = await cobrarPedido({ req, store, orderId: info.lastInsertRowid, code, valorCents: total_cents, cartao, items: resolved });
      }

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
          payment_key: pay && pay.key ? pay.key : '',
        },
        items: resolved,
        deliveryLabel: deliveryLabelMap[period] || period,
      });

      const number = normalizeWhatsapp(business.whatsapp);
      const whatsapp_url = number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '';

      // cartão recusado: avisa o cliente e guarda o pedido para nova tentativa
      if (pagamento && pagamento.chave === 'recusado') {
        return res.status(402).json({
          error: pagamento.motivo || 'O cartão não foi aprovado.',
          code,
          payment: resumoPagamento(pagamento),
        });
      }

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
          payment_method: order.payment_method,
          payment_status: order.payment_status || '',
          customer_name,
        },
        payment: pagamento ? resumoPagamento(pagamento) : null,
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
    .prepare(
      `SELECT code, status, total_cents, created_at, payment_method, payment_status, payment_gateway_id
         FROM orders WHERE code = ? AND store_id = ?`
    )
    .get(req.params.code, req.store.id);
  if (!row) return res.status(404).json({ error: 'Pedido não encontrado.' });
  res.json(row);
});

/* ------------------- cobrar cartão de um pedido já criado ------------------- */
router.post(
  '/orders/:code/pagar-cartao',
  rateLimit({ windowMs: 60_000, max: 10, key: (req) => `pay:${req.store.id}:${req.ip}` }),
  async (req, res) => {
    try {
      const store = req.store;
      const order = totalDoPedido(store.id, String(req.params.code || '').trim());
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
      if (order.payment_status === 'pago') {
        return res.status(409).json({ error: 'Este pedido já está pago.', code: order.code });
      }
      if (!cartaoOnlineDisponivel(store.id)) {
        return res.status(400).json({ error: 'Pagamento com cartão online não está ativo nesta loja.' });
      }
      const cartao = (req.body || {}).cartao;
      if (!cartao || !cartao.token) return res.status(400).json({ error: 'Dados do cartão não recebidos.' });

      const items = JSON.parse(order.items_json || '[]');
      const pagamento = await cobrarPedido({
        req,
        store,
        orderId: order.id,
        code: order.code,
        valorCents: order.total_cents,
        cartao,
        items,
      });

      const business = getSetting(store.id, 'business', {});
      const atualizado = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      const message = buildWhatsappMessage({
        business: { ...business, name: business.name || store.name },
        order: atualizado,
        items,
        deliveryLabel: atualizado.period || '',
      });
      const number = normalizeWhatsapp(business.whatsapp);
      const whatsapp_url = number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : '';

      if (pagamento.chave === 'recusado') {
        return res.status(402).json({ error: pagamento.motivo, code: order.code, payment: resumoPagamento(pagamento) });
      }
      res.json({
        ok: true,
        code: order.code,
        payment: resumoPagamento(pagamento),
        whatsapp_url,
        message,
      });
    } catch (err) {
      console.error('[pagar-cartao] erro:', err.message);
      res.status(502).json({ error: err.message || 'Não foi possível concluir o pagamento. Tente novamente.' });
    }
  }
);

/* -------- link de emergência: página segura do Mercado Pago (Checkout Pro) -------- */
router.post(
  '/orders/:code/link-pagamento',
  rateLimit({ windowMs: 60_000, max: 8, key: (req) => `link:${req.store.id}:${req.ip}` }),
  async (req, res) => {
    try {
      const store = req.store;
      const order = totalDoPedido(store.id, String(req.params.code || '').trim());
      if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
      if (order.payment_status === 'pago') return res.status(409).json({ error: 'Este pedido já está pago.' });
      const business = getSetting(store.id, 'business', {});
      const url = await criarLinkCheckoutPro({
        storeId: store.id,
        storeSlug: store.slug,
        valorCents: order.total_cents,
        descricao: `Pedido ${order.code} - ${business.name || store.name}`,
        referencia: order.code,
        baseUrl: `${req.protocol}://${req.get('host')}`,
      });
      res.json({ url, code: order.code });
    } catch (err) {
      console.error('[link-pagamento] erro:', err.message);
      res.status(502).json({ error: err.message || 'Não foi possível gerar o link de pagamento.' });
    }
  }
);

/* --------------------------- retorno do Mercado Pago --------------------------- */
async function processarNotificacao(req, res) {
  try {
    const store = req.store;
    const tipo = String(req.query.type || req.query.topic || (req.body && req.body.type) || '');
    const id =
      req.query['data.id'] ||
      (req.body && req.body.data && req.body.data.id) ||
      req.query.id;

    if (tipo && tipo !== 'payment' && tipo !== 'merchant_order') return res.sendStatus(200);
    if (!id || !require('./pagamentos').checkoutProDisponivel(store.id)) return res.sendStatus(200);

    const pagamento = await consultarPagamento(store.id, id);
    const st = traduzirStatus(pagamento.status);
    const ref = String(pagamento.external_reference || '').trim();
    if (!ref) return res.sendStatus(200);

    const order = db.prepare('SELECT * FROM orders WHERE code = ? AND store_id = ?').get(ref, store.id);
    if (!order) return res.sendStatus(200);

    // Nunca rebaixa um pedido já pago por um aviso atrasado.
    if (order.payment_status === 'pago' && st.chave !== 'pago' && st.chave !== 'estornado') {
      return res.sendStatus(200);
    }
    if (st.chave === 'em_analise' && order.payment_status === 'pago') return res.sendStatus(200);

    gravarPagamento(
      store.id,
      order.id,
      {
        id: pagamento.id,
        status: pagamento.status,
        status_detail: pagamento.status_detail,
        chave: st.chave,
        rotulo: st.rotulo,
        parcelas: pagamento.installments,
        bandeira: pagamento.payment_method_id,
        motivo: st.ok ? '' : motivoRecusa(pagamento.status_detail),
      },
      String(order.payment_method || 'Cartão de crédito (online)').split(' — ')[0]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook mp]', err.message);
    res.sendStatus(200);
  }
}

/* --------- cliques no WhatsApp (lead) — o site avisa por aqui --------- */
router.post('/eventos', (req, res) => {
  try {
    const tipo = String((req.body || {}).tipo || 'whatsapp').slice(0, 30);
    const detalhe = String((req.body || {}).detalhe || '').slice(0, 120);
    registrarEvento(req.store, tipo, sessaoDe(req, res), detalhe);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

router.post('/pagamentos/webhook', processarNotificacao);
router.get('/pagamentos/webhook', processarNotificacao);

module.exports = router;

