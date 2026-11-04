'use strict';
/** Utilidades compartilhadas: dinheiro, telefone, WhatsApp, códigos. */

const brl = (cents) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const onlyDigits = (s) => String(s || '').replace(/\D/g, '');

/**
 * Aceita "25", "25,50", "7.00", "R$ 25,50", 25.5 → centavos.
 * Regra: se há vírgula, ela é o decimal (padrão BR). Se só há ponto, ele é o
 * decimal quando tem 1 ou 2 casas ("7.00", "7.5"); senão é separador de milhar.
 */
function parseMoneyToCents(input) {
  if (input === null || input === undefined || input === '') return 0;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : 0;

  let s = String(input).trim().replace(/[R$\s]/g, '');
  if (!s) return 0;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes('.')) {
    const decimals = s.split('.').pop().length;
    if (decimals === 3 && s.split('.').length === 2) s = s.replace('.', ''); // 1.500 = mil e quinhentos
    else if (decimals > 2) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Normaliza para o formato internacional do WhatsApp (55DDDNUMERO) */
function normalizeWhatsapp(raw) {
  let d = onlyDigits(raw);
  if (!d) return '';
  if (d.length <= 11 && !d.startsWith('55')) d = `55${d}`;
  return d;
}

function formatPhoneBR(raw) {
  const d = onlyDigits(raw).replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function orderCode(id, prefix = 'PS') {
  const d = new Date();
  const pre = String(prefix || 'PS').toUpperCase().slice(0, 3);
  const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(
    d.getDate()
  ).padStart(2, '0')}`;
  return `${pre}${stamp}-${String(id).padStart(3, '0')}`;
}

function formatDateTimeBR(sqliteDate) {
  // sqlite: "YYYY-MM-DD HH:MM:SS" em UTC
  const iso = String(sqliteDate).replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return sqliteDate;
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Mensagem organizada que vai para o WhatsApp do vendedor */
function buildWhatsappMessage({ business, order, items, deliveryLabel }) {
  const lines = [];
  lines.push(`*NOVO PEDIDO — ${business.name}*`);
  lines.push(`Pedido: *${order.code}*`);
  lines.push(`Recebido em: ${formatDateTimeBR(order.created_at)}`);
  lines.push('');
  lines.push('*ITENS*');
  for (const it of items) {
    lines.push(`• ${it.qty}x ${it.name} — ${brl(it.price_cents * it.qty)}`);
  }
  lines.push('');
  lines.push(`Subtotal: ${brl(order.subtotal_cents)}`);
  lines.push(
    order.fulfillment === 'pickup'
      ? 'Retirada no local: grátis'
      : `Taxa de entrega: ${order.fee_cents === 0 ? 'grátis' : brl(order.fee_cents)}`
  );
  lines.push(`*Total: ${brl(order.total_cents)}*`);
  lines.push('');
  const quando = deliveryLabel || order.period || '';
  lines.push(
    `*${order.fulfillment === 'pickup' ? 'RETIRADA' : 'ENTREGA'}*${quando ? ` — ${quando}` : ''}`
  );
  lines.push(`Nome: ${order.customer_name}`);
  lines.push(`Telefone: ${formatPhoneBR(order.phone)}`);
  if (order.fulfillment === 'delivery') {
    const addr = [order.address, order.complement].filter(Boolean).join(' - ');
    lines.push(`Endereço: ${addr}`);
    if (order.neighborhood) lines.push(`Bairro: ${order.neighborhood}`);
  }
  if (order.notes) lines.push(`Obs.: ${order.notes}`);
  lines.push('');
  lines.push(`*PAGAMENTO*`);
  lines.push(order.payment_method || 'A combinar');
  if (order.payment_key) lines.push(`Chave Pix: ${order.payment_key}`);
  if (order.payment_url) lines.push(`Link de pagamento: ${order.payment_url}`);
  return lines.join('\n');
}

module.exports = {
  brl,
  onlyDigits,
  parseMoneyToCents,
  normalizeWhatsapp,
  formatPhoneBR,
  orderCode,
  formatDateTimeBR,
  buildWhatsappMessage,
};
