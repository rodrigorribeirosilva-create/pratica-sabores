'use strict';
// Sessão segura: cookie httpOnly + token aleatório (SHA-256 no banco) + RBAC no backend.
const crypto = require('crypto');
const db = require('./db');

const SCRYPT_KEYLEN = 64;
const SESSION_DAYS = 14;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:8:1:${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split(':');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N: +N, r: +r, p: +p });
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// ---- rate limit simples em memória (login) --------------------------------
const loginAttempts = new Map(); // key: email|ip -> {count, first}
function loginRateLimited(key) {
  const now = Date.now(), rec = loginAttempts.get(key);
  if (!rec) return false;
  if (now - rec.first > 15 * 60 * 1000) { loginAttempts.delete(key); return false; }
  return rec.count >= 10;
}
function noteLoginFailure(key) {
  const now = Date.now(), rec = loginAttempts.get(key);
  if (!rec || now - rec.first > 15 * 60 * 1000) loginAttempts.set(key, { count: 1, first: now });
  else rec.count += 1;
}
function clearLoginFailures(key) { loginAttempts.delete(key); }

async function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.query(
    'INSERT INTO sessions(user_id, token_hash, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5)',
    [userId, sha256(token), expires.toISOString(), (req.ip || '').slice(0, 64), String(req.headers['user-agent'] || '').slice(0, 300)]
  );
  return { token, expires };
}

async function destroySession(token) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]).catch(() => {});
}

// Contexto completo do usuário: rede, papéis, lojas e fornecedores vinculados
async function loadContext(userId) {
  const { rows: users } = await db.query('SELECT * FROM users WHERE id=$1', [userId]);
  if (!users.length) return null;
  const user = users[0];
  const { rows: roles } = await db.query(
    `SELECT ur.role, ur.store_id, ur.supplier_id, s.name AS store_name
       FROM user_roles ur LEFT JOIN stores s ON s.id = ur.store_id
      WHERE ur.user_id=$1`, [userId]);
  const ctx = {
    user: { id: user.id, network_id: user.network_id, name: user.name, email: user.email, phone: user.phone, status: user.status },
    networkId: user.network_id,
    roles,
    isRedeAdmin: roles.some(r => r.role === 'rede_admin'),
    storeIds: [...new Set(roles.filter(r => r.store_id).map(r => r.store_id))],
    supplierIds: [...new Set(roles.filter(r => r.supplier_id).map(r => r.supplier_id))],
    roleLabels: [...new Set(roles.map(r => r.role))],
  };
  return ctx;
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(token, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `rr_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

// middleware: exige login; anexa req.ctx
async function requireAuth(req, res, next) {
  try {
    const token = parseCookies(req).rr_session;
    if (!token) return res.status(401).json({ error: 'não_autenticado' });
    const { rows } = await db.query(
      `SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash=$1 AND s.expires_at > now() AND u.status='ativo'`, [sha256(token)]);
    if (!rows.length) return res.status(401).json({ error: 'sessão_expirada' });
    const ctx = await loadContext(rows[0].id);
    if (!ctx) return res.status(401).json({ error: 'não_autenticado' });
    req.ctx = ctx;
    req.sessionToken = token;
    next();
  } catch (e) { next(e); }
}

// Regra de acesso por loja: rede_admin acessa tudo; papéis de loja só as suas lojas
function canAccessStore(ctx, storeId) {
  if (ctx.isRedeAdmin) return true;
  return ctx.storeIds.includes(storeId);
}
function requireRedeAdmin(req, res, next) {
  if (!req.ctx?.isRedeAdmin) return res.status(403).json({ error: 'acesso_restrito_rede_admin' });
  next();
}
function requireStoreStaff(req, storeId) {
  // rede_admin, loja_gerente ou recebimento com vínculo na loja
  if (req.ctx.isRedeAdmin) return true;
  return req.ctx.roles.some(r => r.store_id === storeId && (r.role === 'loja_gerente' || r.role === 'recebimento'));
}
function requireStoreManager(req, storeId) {
  if (req.ctx.isRedeAdmin) return true;
  return req.ctx.roles.some(r => r.store_id === storeId && r.role === 'loja_gerente');
}
function canOperateStore(req, storeId) { return requireStoreStaff(req, storeId); }
const isSupplierUser = ctx => ctx.roles.some(r => r.role === 'fornecedor');

function clientIp(req) { return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim().slice(0, 64); }

module.exports = {
  hashPassword, verifyPassword, sha256, createSession, destroySession,
  requireAuth, requireRedeAdmin, canAccessStore, requireStoreStaff, requireStoreManager,
  isSupplierUser, clientIp, sessionCookie, parseCookies,
  loginRateLimited, noteLoginFailure, clearLoginFailures, loadContext,
};
