'use strict';
/**
 * Pagamento com cartão de crédito pelo Mercado Pago (transparente).
 *
 * O cliente digita o cartão dentro do próprio checkout da loja. O número e o
 * CVV nunca passam pelo nosso servidor: o navegador troca os dados por um
 * "token" direto no Mercado Pago (SDK v2, chave pública da loja). O servidor
 * recebe só o token e cobra com o Access Token privado da loja.
 *
 * Credenciais ficam em store_settings.mercadopago:
 *   { ativo: true, public_key: 'APP_USR-...', access_token: 'APP_USR-...' }
 */
const { getSetting } = require('./db');

/* Endereço da API — dá para trocar em teste (MP_API_BASE). */
const MP_BASE = process.env.MP_API_BASE || 'https://api.mercadopago.com';
const TIMEOUT_MS = Number(process.env.MP_TIMEOUT_MS || 20000);

/* ------------------------------------------------------------------ */
/* Configuração da loja                                               */
/* ------------------------------------------------------------------ */

function getMercadoPago(storeId) {
  const cfg = getSetting(storeId, 'mercadopago', {}) || {};
  // o Access Token fica criptografado; se a loja ainda tem o token em texto
  // puro (configurado antes), continua funcionando.
  let token = '';
  try {
    token = require('./db').lerSegredo(storeId, 'mp_access_token') || '';
  } catch {
    token = '';
  }
  if (!token) token = String(cfg.access_token || '').trim();
  return {
    ativo: cfg.ativo !== false,
    public_key: String(cfg.public_key || '').trim(),
    access_token: token,
    nome_fatura: String(cfg.nome_fatura || '').trim(),
  };
}

/** Só cobra cartão se a loja colou as duas chaves e não desligou a opção. */
function cartaoOnlineDisponivel(storeId) {
  const cfg = getMercadoPago(storeId);
  return !!(cfg.ativo && cfg.public_key && cfg.access_token);
}

/**
 * Checkout do Mercado Pago (igual Mercado Livre): com SÓ o Access Token a loja já
 * consegue cobrar cartão de crédito, débito virtual e Pix na página do Mercado Pago.
 * Não precisa da Public Key nem de formulário de cartão no nosso site.
 */
function checkoutProDisponivel(storeId) {
  const cfg = getMercadoPago(storeId);
  return !!(cfg.ativo && cfg.access_token);
}

/** O que pode ir para o navegador (nunca o Access Token). */
function configPublica(storeId) {
  const cfg = getMercadoPago(storeId);
  return {
    disponivel: cartaoOnlineDisponivel(storeId), // formulário de cartão no nosso site
    checkout: checkoutProDisponivel(storeId), // pagar na página do Mercado Pago
    public_key: cfg.public_key,
  };
}

/* ------------------------------------------------------------------ */
/* Chamadas ao Mercado Pago                                           */
/* ------------------------------------------------------------------ */

async function mpFetch(accessToken, path, { method = 'GET', body, idempotencyKey } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${MP_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const texto = await res.text();
    let dados = null;
    try {
      dados = texto ? JSON.parse(texto) : null;
    } catch {
      dados = { raw: texto };
    }
    return { ok: res.ok, status: res.status, dados };
  } finally {
    clearTimeout(timer);
  }
}

/** Traduz o status do Mercado Pago para o que mostramos ao cliente/dono. */
function traduzirStatus(status) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
      return { chave: 'pago', rotulo: 'Aprovado', ok: true };
    case 'authorized':
      return { chave: 'autorizado', rotulo: 'Autorizado', ok: true };
    case 'in_process':
    case 'pending':
      return { chave: 'em_analise', rotulo: 'Em análise', ok: false };
    case 'rejected':
      return { chave: 'recusado', rotulo: 'Recusado', ok: false };
    case 'cancelled':
      return { chave: 'cancelado', rotulo: 'Cancelado', ok: false };
    case 'refunded':
      return { chave: 'estornado', rotulo: 'Estornado', ok: false };
    case 'charged_back':
      return { chave: 'contestado', rotulo: 'Contestado', ok: false };
    default:
      return { chave: 'pendente', rotulo: status ? String(status) : 'Pendente', ok: false };
  }
}

/** Mensagem amigável para o motivo da recusa. */
function motivoRecusa(statusDetail) {
  const d = String(statusDetail || '').toLowerCase();
  const mapa = [
    ['cc_rejected_insufficient_amount', 'Saldo/limite insuficiente no cartão.'],
    ['cc_rejected_bad_filled_security_code', 'Código de segurança (CVV) incorreto.'],
    ['cc_rejected_bad_filled_date', 'Data de validade incorreta.'],
    ['cc_rejected_bad_filled_other', 'Confira os dados do cartão.'],
    ['cc_rejected_bad_filled_card_number', 'Número do cartão incorreto.'],
    ['cc_rejected_call_for_authorize', 'O banco precisa autorizar. Ligue para o banco e tente de novo.'],
    ['cc_rejected_card_disabled', 'Cartão desativado. Fale com o banco.'],
    ['cc_rejected_duplicated_payment', 'Esse pagamento já foi feito.'],
    ['cc_rejected_high_risk', 'Pagamento recusado por segurança. Tente outro cartão.'],
    ['cc_rejected_max_attempts', 'Muitas tentativas. Tente outro cartão ou outro meio.'],
    ['cc_rejected_other_reason', 'O banco recusou o pagamento.'],
    ['cc_rejected_invalid_installments', 'Número de parcelas não aceito por esse cartão.'],
  ];
  for (const [k, v] of mapa) if (d.includes(k)) return v;
  if (!d) return 'O cartão não foi aprovado.';
  return `O cartão não foi aprovado (${d}).`;
}

/**
 * Cobra o cartão. `dados.token` veio do SDK do Mercado Pago no navegador.
 * O valor é sempre recalculado no servidor — nunca confiamos no navegador.
 */
async function cobrarCartao({
  storeId,
  storeSlug,
  valorCents,
  descricao,
  referencia,          // código do pedido (external_reference)
  token,
  paymentMethodId,
  installments,
  issuerId,
  email,
  cpf,
  nomeTitular,
  baseUrl,
  tentativa,
}) {
  const cfg = getMercadoPago(storeId);
  if (!cfg.access_token) throw new Error('Mercado Pago não configurado nesta loja.');

  const cpfDigitos = String(cpf || '').replace(/\D/g, '');
  if (cpfDigitos.length !== 11) throw new Error('Informe o CPF do titular do cartão.');

  const emailLimpo = String(email || '').trim();
  const emailFinal =
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailLimpo)
      ? emailLimpo
      : `${String(referencia || 'pedido').toLowerCase().replace(/[^a-z0-9]/g, '')}@pagamento.local`;

  const corpo = {
    transaction_amount: Number((valorCents / 100).toFixed(2)),
    token: String(token || ''),
    description: String(descricao || 'Pedido').slice(0, 250),
    installments: Math.max(1, Math.min(12, Number(installments) || 1)),
    payment_method_id: String(paymentMethodId || ''),
    payer: {
      email: emailFinal,
      identification: { type: 'CPF', number: cpfDigitos },
      ...(nomeTitular ? { first_name: String(nomeTitular).slice(0, 60) } : {}),
    },
    external_reference: String(referencia || ''),
    capture: true,
    binary_mode: false,
    notification_url: `${baseUrl}/l/${storeSlug}/api/pagamentos/webhook?store=${storeId}`,
  };
  if (issuerId) corpo.issuer_id = String(issuerId);
  if (cfg.nome_fatura) corpo.statement_descriptor = cfg.nome_fatura.slice(0, 22);

  const idem = `pedido-${storeId}-${referencia}-${tentativa || Date.now()}`;
  const { ok, dados, status } = await mpFetch(cfg.access_token, '/v1/payments', {
    method: 'POST',
    body: corpo,
    idempotencyKey: idem,
  });

  if (!ok) {
    const detalhe =
      (dados && dados.message) ||
      (Array.isArray(dados && dados.cause) && dados.cause[0] && dados.cause[0].description) ||
      'Falha ao falar com o Mercado Pago.';
    const err = new Error(detalhe);
    err.mp = { status, dados };
    throw err;
  }

  const st = traduzirStatus(dados.status);
  return {
    id: dados.id,
    status: dados.status,
    status_detail: dados.status_detail,
    chave: st.chave,
    rotulo: st.rotulo,
    aprovado: st.ok,
    valor_cents: Math.round(Number(dados.transaction_amount || valorCents / 100) * 100),
    parcelas: dados.installments,
    bandeira: dados.payment_method_id,
    motivo: st.ok ? '' : motivoRecusa(dados.status_detail),
    dados,
  };
}

/** Consulta um pagamento (usado pelo webhook). */
async function consultarPagamento(storeId, paymentId) {
  const cfg = getMercadoPago(storeId);
  if (!cfg.access_token) throw new Error('Mercado Pago não configurado.');
  const { ok, dados } = await mpFetch(cfg.access_token, `/v1/payments/${encodeURIComponent(paymentId)}`);
  if (!ok) throw new Error('Pagamento não encontrado no Mercado Pago.');
  return dados;
}

/** Link de emergência: página segura do Mercado Pago (Checkout Pro). */
async function criarLinkCheckoutPro({ storeId, storeSlug, valorCents, descricao, referencia, baseUrl }) {
  const cfg = getMercadoPago(storeId);
  if (!cfg.access_token) throw new Error('Mercado Pago não configurado.');
  const corpo = {
    external_reference: String(referencia || ''),
    items: [
      {
        title: String(descricao || 'Pedido').slice(0, 250),
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number((valorCents / 100).toFixed(2)),
      },
    ],
    notification_url: `${baseUrl}/l/${storeSlug}/api/pagamentos/webhook?store=${storeId}`,
    back_urls: {
      success: `${baseUrl}/l/${storeSlug}?pago=1&pedido=${encodeURIComponent(referencia || '')}`,
      pending: `${baseUrl}/l/${storeSlug}?pago=2&pedido=${encodeURIComponent(referencia || '')}`,
      failure: `${baseUrl}/l/${storeSlug}?pago=3&pedido=${encodeURIComponent(referencia || '')}`,
    },
  };
  const { ok, dados, status } = await mpFetch(cfg.access_token, '/checkout/preferences', {
    method: 'POST',
    body: corpo,
    idempotencyKey: `pref-${storeId}-${referencia}-${Date.now()}`,
  });
  if (!ok) {
    const e = new Error((dados && dados.message) || 'Não foi possível gerar o link de pagamento.');
    e.mp = { status, dados };
    throw e;
  }
  return dados.init_point || dados.sandbox_init_point || '';
}

/** Confere se o Access Token colado é válido (usado no painel). */
async function testarCredenciais(storeId) {
  const cfg = getMercadoPago(storeId);
  if (!cfg.access_token) return { ok: false, erro: 'Cole o Access Token do Mercado Pago.' };
  const { ok, dados, status } = await mpFetch(cfg.access_token, '/users/me');
  if (!ok) {
    return {
      ok: false,
      erro:
        status === 401
          ? 'Access Token inválido ou expirado. Copie de novo no Mercado Pago (Suas integrações).'
          : (dados && dados.message) || 'Não foi possível validar o token.',
    };
  }
  return {
    ok: true,
    apelido: dados.nickname || '',
    email: dados.email || '',
    pais: dados.site_id || '',
    producao: /^APP_USR-/.test(cfg.access_token),
    public_key: cfg.public_key,
    public_key_valida: !!cfg.public_key,
  };
}

module.exports = {
  testarCredenciais,
  getMercadoPago,
  cartaoOnlineDisponivel,
  checkoutProDisponivel,
  configPublica,
  cobrarCartao,
  consultarPagamento,
  criarLinkCheckoutPro,
  traduzirStatus,
  motivoRecusa,
};
