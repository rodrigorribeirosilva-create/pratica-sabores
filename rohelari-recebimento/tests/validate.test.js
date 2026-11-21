'use strict';
const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/validate');

test('validCNPJ aceita CNPJs válidos e rejeita inválidos', () => {
  assert.equal(v.validCNPJ('11.222.333/0001-81'), true);
  assert.equal(v.validCNPJ('11222333000181'), true);
  assert.equal(v.validCNPJ('11222333000182'), false);
  assert.equal(v.validCNPJ('11111111111111'), false);
  assert.equal(v.validCNPJ('123'), false);
});

test('validCPF aceita CPFs válidos e rejeita inválidos', () => {
  assert.equal(v.validCPF('529.982.247-25'), true);
  assert.equal(v.validCPF('52998224725'), true);
  assert.equal(v.validCPF('52998224726'), false);
  assert.equal(v.validCPF('00000000000'), false);
});

test('placas Mercosul e antigas', () => {
  assert.equal(v.isPlate('ABC1D23'), true);
  assert.equal(v.isPlate('ABC1234'), true);
  assert.equal(v.isPlate('abc-1d23'), true); // normaliza
  assert.equal(v.isPlate('ABCD1234'), false);
  assert.equal(v.isPlate('12ABC34'), false);
});

test('email e telefone', () => {
  assert.equal(v.isEmail('a@b.com'), true);
  assert.equal(v.isEmail('a@b'), false);
  assert.equal(v.isPhone('(48) 3000-0000'), true);
  assert.equal(v.isPhone('123'), false);
});

test('cleanString limita tamanho e remove espaços', () => {
  assert.equal(v.cleanString('  abc  '), 'abc');
  assert.equal(v.cleanString('abcdef', 3), 'abc');
  assert.equal(v.cleanString(null), '');
});
