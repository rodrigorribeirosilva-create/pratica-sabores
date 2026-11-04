'use strict';
const assert = require('assert');
const { numero } = require('../public/ageo-telefone');
const scripts = require('../src/ageo-whatsapp');
const exemplos = [
  ['(48) 99999-1234', '5548999991234'],
  ['+55 (48) 99999-1234', '5548999991234'],
  ['5548999991234', '5548999991234'],
  ['(55) 99999-1234', '5555999991234'],
  ['(48) 3333-1234', '554833331234'],
  ['+55489983792', ''],
  ['(55) 48998-3792', ''],
  ['489999912', ''],
  ['+1 555 444 2233', ''],
];
for (const [entrada, saida] of exemplos) assert.strictEqual(numero(entrada), saida, entrada);
assert(scripts.cardapio().includes('window.AgeoTelefone.numero(payload.phone)'));
assert(scripts.painel().includes('WhatsApp corrigido neste pedido.'));
console.log('Telefone da AGEO: formatos, validação e scripts OK.');
