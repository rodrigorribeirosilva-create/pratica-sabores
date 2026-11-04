/* Telefones brasileiros da AGEO: nunca inventar dígitos nem cortar o número. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AgeoTelefone = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function numero(raw) {
    var texto = String(raw == null ? '' : raw).trim();
    var digitos = texto.replace(/\D/g, '');
    if (digitos.indexOf('0055') === 0) digitos = digitos.slice(2);
    var internacional = /^\+/.test(texto) || digitos.length === 12 || digitos.length === 13;
    if (internacional) {
      if (digitos.indexOf('55') !== 0 || (digitos.length !== 12 && digitos.length !== 13)) return '';
      digitos = digitos.slice(2);
    }
    if (digitos.length !== 10 && digitos.length !== 11) return '';
    var ddd = Number(digitos.slice(0, 2));
    if (ddd < 11 || ddd > 99) return '';
    if (digitos.length === 11 && digitos.charAt(2) !== '9') return '';
    if (digitos.length === 10 && !/^[2-5]/.test(digitos.slice(2))) return '';
    return '55' + digitos;
  }
  return { numero: numero };
});
