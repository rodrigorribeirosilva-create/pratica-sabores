'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const { audit, notify, notifyNetworkAdmins } = require('../services');
const { validCNPJ, isEmail, isPhone, cleanString } = require('../validate');

const router = express.Router();

function publicCtx(ctx) {
  return {
    user: ctx.user, networkId: ctx.networkId, isRedeAdmin: ctx.isRedeAdmin,
    roleLabels: ctx.roleLabels, storeIds: ctx.storeIds,
    roles: ctx.roles.map(r => ({ role: r.role, store_id: r.store_id, store_name: r.store_name || null, supplier_id: r.supplier_id || null })),
  };
}

router.post('/login', async (req, res, next) => {
  try {
    const email = cleanString(req.body.email, 200).toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'informe_email_e_senha' });
    const ip = auth.clientIp(req);
    const rateKey = `${email}|${ip}`;
    if (auth.loginRateLimited(rateKey)) return res.status(429).json({ error: 'muitas_tentativas', message: 'Muitas tentativas. Tente novamente em 15 minutos.' });

    const { rows } = await db.query(
      `SELECT u.*, n.name AS network_name FROM users u JOIN networks n ON n.id = u.network_id
        WHERE lower(u.email)=$1 AND u.status='ativo' ORDER BY u.created_at LIMIT 5`, [email]);
    const user = rows.find(u => auth.verifyPassword(password, u.password_hash));
    if (!user) { auth.noteLoginFailure(rateKey); return res.status(401).json({ error: 'credenciais_invalidas' }); }

    auth.clearLoginFailures(rateKey);
    const { token, expires } = await auth.createSession(user.id, req);
    await db.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
    const ctx = await auth.loadContext(user.id);
    audit({ ...req, ctx }, 'login', 'users', user.id, {});
    res.setHeader('Set-Cookie', auth.sessionCookie(token, Math.floor((expires - Date.now()) / 1000)));
    res.json({ ok: true, network: user.network_name, ...publicCtx(ctx) });
  } catch (e) { next(e); }
});

router.post('/logout', auth.requireAuth, async (req, res, next) => {
  try {
    await auth.destroySession(req.sessionToken);
    res.setHeader('Set-Cookie', auth.sessionCookie('apagado', 0));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/me', auth.requireAuth, async (req, res) => res.json(publicCtx(req.ctx)));

// Recuperação de senha — resposta sempre genérica (LGPD: não revela se o e-mail existe)
router.post('/forgot', async (req, res, next) => {
  try {
    const email = cleanString(req.body.email, 200).toLowerCase();
    if (!isEmail(email)) return res.json({ ok: true });
    const { rows } = await db.query("SELECT id, network_id, name FROM users WHERE lower(email)=$1 AND status='ativo' LIMIT 1", [email]);
    if (rows.length) {
      const user = rows[0];
      const code = String(crypto.randomInt(100000, 1000000));
      const codeHash = auth.sha256(code);
      await db.query(
        `INSERT INTO password_resets(user_id, code_hash, expires_at) VALUES ($1,$2, now() + interval '30 minutes')`,
        [user.id, codeHash]);
      const delivered = process.env.NOTIFY_WEBHOOK_URL ? 'webhook' : 'interno';
      if (process.env.NOTIFY_WEBHOOK_URL) {
        try {
          await fetch(process.env.NOTIFY_WEBHOOK_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: 'email', to: email, subject: 'ROHELARI RECEBIMENTO — código de recuperação', body: `Seu código é ${code} (válido por 30 minutos).` }),
          });
        } catch (e) { console.error('[forgot] webhook falhou:', e.message); }
      } else {
        // Sem e-mail configurado: o código fica disponível apenas para o admin da rede entregar pelo canal seguro
        await notifyNetworkAdmins(user.network_id, {
          type: 'recuperacao_senha',
          title: `Recuperação de senha — ${user.name}`,
          body: `Código solicitado pelo usuário ${email}: ${code} (válido por 30 min). Entregue pelo canal oficial; nunca exponha publicamente.`,
        });
      }
      await audit({ ...req, ctx: null }, 'recuperacao_senha_solicitada', 'users', user.id, { delivered });
    }
    res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, as instruções de recuperação serão enviadas.' });
  } catch (e) { next(e); }
});

router.post('/reset', async (req, res, next) => {
  try {
    const email = cleanString(req.body.email, 200).toLowerCase();
    const code = cleanString(req.body.code, 12);
    const newPassword = String(req.body.newPassword || '');
    if (!isEmail(email) || !code || newPassword.length < 8) {
      return res.status(400).json({ error: 'dados_invalidos', message: 'A nova senha deve ter ao menos 8 caracteres.' });
    }
    const { rows } = await db.query(
      `SELECT pr.id AS reset_id, u.id AS user_id FROM password_resets pr
         JOIN users u ON u.id = pr.user_id
        WHERE lower(u.email)=$1 AND pr.code_hash=$2 AND pr.used_at IS NULL AND pr.expires_at > now()
        ORDER BY pr.created_at DESC LIMIT 1`, [email, auth.sha256(code)]);
    if (!rows.length) return res.status(400).json({ error: 'codigo_invalido_ou_expirado' });
    await db.withTransaction(async (q) => {
      await q('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [auth.hashPassword(newPassword), rows[0].user_id]);
      await q('UPDATE password_resets SET used_at=now() WHERE id=$1', [rows[0].reset_id]);
      await q('DELETE FROM sessions WHERE user_id=$1', [rows[0].user_id]);
    });
    res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
  } catch (e) { next(e); }
});

// Cadastro externo de fornecedor/transportadora (com código de convite da rede)
router.post('/register-supplier', async (req, res, next) => {
  try {
    const signupCode = cleanString(req.body.signupCode, 64);
    const legalName = cleanString(req.body.legalName, 200);
    const tradeName = cleanString(req.body.tradeName, 200);
    const cnpj = cleanString(req.body.cnpj, 20);
    const phone = cleanString(req.body.phone, 20);
    const email = cleanString(req.body.email, 200).toLowerCase();
    const representative = cleanString(req.body.representative, 200);
    const name = cleanString(req.body.name, 200);
    const password = String(req.body.password || '');

    if (!signupCode || !legalName || !validCNPJ(cnpj) || !isEmail(email) || !isPhone(phone) || password.length < 8 || !name) {
      return res.status(400).json({ error: 'dados_invalidos', message: 'Confira CNPJ, e-mail, telefone e senha (mín. 8 caracteres).' });
    }
    const { rows: nets } = await db.query("SELECT id, name FROM networks WHERE supplier_signup_code=$1 AND status='ativo'", [signupCode]);
    if (!nets.length) return res.status(400).json({ error: 'codigo_convite_invalido' });
    const network = nets[0];

    const out = await db.withTransaction(async (q) => {
      const dup = await q('SELECT id FROM suppliers WHERE network_id=$1 AND cnpj=$2', [network.id, cnpj.replace(/\D/g, '')]);
      if (dup.rows.length) { const err = new Error('cnpj_ja_cadastrado'); err.status = 409; throw err; }
      const sup = await q(
        `INSERT INTO suppliers(network_id, legal_name, trade_name, cnpj, phone, email, representative, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pendente') RETURNING id`,
        [network.id, legalName, tradeName || null, cnpj.replace(/\D/g, ''), phone, email, representative || null]);
      const u = await q(
        `INSERT INTO users(network_id, name, email, password_hash, phone, status)
         VALUES ($1,$2,$3,$4,$5,'inativo') RETURNING id`,
        [network.id, name, email, auth.hashPassword(password), phone]);
      await q('INSERT INTO user_roles(user_id, role, supplier_id) VALUES ($1,$2,$3)', [u.rows[0].id, 'fornecedor', sup.rows[0].id]);
      return { supplierId: sup.rows[0].id, userId: u.rows[0].id };
    });
    await notifyNetworkAdmins(network.id, {
      type: 'fornecedor_pendente',
      title: `Fornecedor pendente: ${tradeName || legalName}`,
      body: `Cadastro solicitado por ${name} (${email}). Revise e ative em Cadastros → Fornecedores.`,
    });
    res.status(201).json({ ok: true, message: 'Cadastro recebido! A rede irá validar seus dados. Você será avisado quando o acesso for liberado.' });
  } catch (e) {
    if (e.status === 409) return res.status(409).json({ error: 'cnpj_ja_cadastrado' });
    next(e);
  }
});

module.exports = router;
