'use strict';
/**
 * Registra o shim local do better-sqlite3 (node:sqlite) — SÓ PARA TESTES.
 * Uso: node -r tests/_registrar-shim.js server.js
 * Em produção/Docker nada disso é usado: o better-sqlite3 real é instalado no build.
 */
const Module = require('module');
const path = require('path');
const orig = Module._resolveFilename;
const shim = path.join(__dirname, '_shim-better-sqlite3.js');
Module._resolveFilename = function (request, ...rest) {
  if (request === 'better-sqlite3') return shim;
  return orig.call(this, request, ...rest);
};
