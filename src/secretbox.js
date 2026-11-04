'use strict';
/**
 * Cofre de senhas — criptografia simétrica (AES-256-GCM).
 *
 * Não importa o banco (evita dependência circular): recebe o segredo por parâmetro.
 * Quem chama é o src/db.js (recordStorePassword / revealStorePassword).
 *
 * ⚠️ Guarda uma cópia RECUPERÁVEL das senhas dos clientes, para que o master
 *    possa consultar e dar suporte. Quem tiver o banco + o segredo consegue ler.
 */
const crypto = require('crypto');

function keyFrom(secret) {
  return crypto.scryptSync(String(secret || 'fallback-secret'), 'ps-password-vault', 32);
}

function encrypt(plain, secret) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

function decrypt(payload, secret) {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('v1.')) return '';
  try {
    const [, ivB64, tagB64, dataB64] = payload.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

module.exports = { encrypt, decrypt };
