'use strict';
/**
 * Sessões assinadas com HMAC (sem dependências extras).
 *
 *  - Sessão da LOJA (dono do negócio): cookie ps_s_<storeId>, vale só para aquela loja.
 *  - Sessão do MASTER (você, administrador do sistema): cookie ps_master.
 *
 * Assim você pode ficar logado no painel de vários clientes ao mesmo tempo.
 */
const crypto = require('crypto');
const { getAppSetting } = require('./db');

const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias (o cliente não é deslogado toda hora)

function secret() {
  // Variável de ambiente tem prioridade: mantém as sessões válidas mesmo que
  // o banco seja recriado (deploy). Sem ela, usa o segredo guardado no banco.
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  return (getAppSetting('secret', {}) || {}).value || 'fallback-secret';
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function createToken(data, ttl = TTL_MS) {
  const payload = b64url(JSON.stringify({ ...data, exp: Date.now() + ttl }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, mac] = token.split('.');
  const expected = sign(payload);
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp <= Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const i = part.indexOf('=');
    if (i > -1) acc[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    return acc;
  }, {});
}

function cookieName(storeId) {
  return `ps_s_${storeId}`;
}

function cookieHeader(name, value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function setStoreSession(res, storeId) {
  res.setHeader('Set-Cookie', cookieHeader(cookieName(storeId), createToken({ sub: 'admin', store: storeId }), Math.floor(TTL_MS / 1000)));
}

function clearStoreSession(res, storeId) {
  res.setHeader('Set-Cookie', `${cookieName(storeId)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function setMasterSession(res) {
  res.setHeader('Set-Cookie', cookieHeader('ps_master', createToken({ sub: 'master' }), Math.floor(TTL_MS / 1000)));
}

function clearMasterSession(res) {
  res.setHeader('Set-Cookie', 'ps_master=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

const RENOVAR_ABAIXO_DE_MS = 1000 * 60 * 60 * 24 * 20; // renova quando faltar menos de 20 dias

/** Middleware: exige sessão válida DA LOJA da requisição (req.store). */
function requireAuth(req, res, next) {
  const token = parseCookies(req.headers.cookie || '')[cookieName(req.store.id)];
  const data = verifyToken(token);
  if (data && data.sub === 'admin' && Number(data.store) === Number(req.store.id)) {
    // sessão "deslizante": cada uso prolonga o prazo
    if (data.exp - Date.now() < RENOVAR_ABAIXO_DE_MS) setStoreSession(res, req.store.id);
    return next();
  }
  return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
}

/** Middleware: exige sessão do MASTER. */
function requireMaster(req, res, next) {
  const data = verifyToken(parseCookies(req.headers.cookie || '').ps_master);
  if (data && data.sub === 'master') {
    if (data.exp - Date.now() < RENOVAR_ABAIXO_DE_MS) setMasterSession(res);
    return next();
  }
  return res.status(401).json({ error: 'Acesso restrito. Entre com a senha do administrador.' });
}

module.exports = {
  requireAuth,
  requireMaster,
  createToken,
  verifyToken,
  setStoreSession,
  clearStoreSession,
  setMasterSession,
  clearMasterSession,
  parseCookies,
  cookieName,
};
