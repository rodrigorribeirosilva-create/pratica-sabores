'use strict';
// Verifica as transformações da tela sem tocar em dados reais.
const assert = require('assert');
const fs = require('fs');
const { aplicar } = require('../src/imperio-painel-premium');
const original = fs.readFileSync(require('path').join(__dirname, '../public/servicos-admin.html'), 'utf8');
const html = aplicar(original);
const area = html.slice(html.indexOf('<section id="tab-clientes"'), html.indexOf('<!-- ---------------- EQUIPAMENTOS'));
assert.equal((area.match(/id="btnNovoCliente"/g) || []).length, 1);
for (const id of ['listaClientes','buscaCliente','imperioSelecaoClientes','imperioRelatorioClientes']) assert(area.includes(`id="${id}"`));
for (const filtro of ['todos','30','60','90','120','sem']) assert(area.includes(`data-imperio-filtro="${filtro}"`));
assert(html.includes("api('/imperio-clientes/atividade')"));
assert(html.includes('Sem histórico de atendimento'));
assert(!original.includes('imperioRelatorioClientes'));
console.log('Referência de clientes: elementos existentes, filtros e isolamento OK.');
