'use strict';
// Validadores reais (dígitos verificadores), sem dependências externas.
const onlyDigits = s => String(s || '').replace(/\D/g, '');

function validCNPJ(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base) => {
    let weights = base.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * weights[i];
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + d1);
  return cnpj === cnpj.slice(0, 12) + String(d1) + String(d2);
}

function validCPF(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (base.length + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = calc(cpf.slice(0, 9));
  const d2 = calc(cpf.slice(0, 9) + d1);
  return cpf === cpf.slice(0, 9) + String(d1) + String(d2);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PLATE_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/; // Mercosul e padrão antigo

const isEmail = s => EMAIL_RE.test(String(s || '').trim());
const normalizePlate = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
const isPlate = s => PLATE_RE.test(normalizePlate(s));
const isPhone = s => { const d = onlyDigits(s); return d.length >= 10 && d.length <= 13; };
const fmtCNPJ = s => { const d = onlyDigits(s); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : String(s || ''); };
function cleanString(v, max = 500) { return String(v ?? '').trim().slice(0, max); }
function toInt(v, def = null) { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? n : def; }

module.exports = { validCNPJ, validCPF, isEmail, isPlate, isPhone, normalizePlate, fmtCNPJ, onlyDigits, cleanString, toInt };
