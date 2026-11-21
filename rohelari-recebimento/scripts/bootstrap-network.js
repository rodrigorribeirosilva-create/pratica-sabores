'use strict';
// BOOTSTRAP DE PRODUÇÃO (não-demo): cria a 1ª rede + o Administrador da rede.
// Uso:
//   NETWORK_NAME="Minha Rede" NETWORK_CNPJ="00000000000191" \
//   ADMIN_NAME="Administrador" ADMIN_EMAIL="admin@suarede.com.br" ADMIN_PASSWORD="senha-forte" \
//   npm run bootstrap
const db = require('../src/db');
const { hashPassword } = require('../src/auth');
const { validCNPJ, isEmail, onlyDigits } = require('../src/validate');

(async () => {
  const name = process.env.NETWORK_NAME, cnpj = onlyDigits(process.env.NETWORK_CNPJ || '');
  const adminName = process.env.ADMIN_NAME, email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!name || !validCNPJ(cnpj) || !adminName || !isEmail(email) || password.length < 10) {
    console.error('Defina NETWORK_NAME, NETWORK_CNPJ (válido), ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD (mín. 10 caracteres).');
    process.exit(1);
  }
  await require('../src/migrate-run').ready;
  const { rows } = await db.query("SELECT count(*)::int AS n FROM user_roles WHERE role='rede_admin'");
  if (rows[0].n > 0) { console.error('Já existe um Administrador da rede cadastrado. Use o painel para criar novos usuários.'); process.exit(1); }
  await db.withTransaction(async (q) => {
    const net = await q('INSERT INTO networks(name, cnpj, admin_name, status) VALUES ($1,$2,$3,\'ativo\') RETURNING id', [name, cnpj, adminName]);
    const u = await q('INSERT INTO users(network_id, name, email, password_hash, status) VALUES ($1,$2,$3,$4,\'ativo\') RETURNING id',
      [net.rows[0].id, adminName, email, hashPassword(password)]);
    await q("INSERT INTO user_roles(user_id, role) VALUES ($1, 'rede_admin')", [u.rows[0].id]);
    console.log(`Rede "${name}" criada. Administrador: ${email}`);
  });
  process.exit(0);
})().catch(e => { console.error('bootstrap falhou:', e.message); process.exit(1); });
