'use strict';
// Aplicado no boot (server.js). Idempotente (CREATE TABLE IF NOT EXISTS).
const fs = require('fs');
const path = require('path');
const db = require('./db');

function splitStatements(sql) {
  const cleaned = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  return cleaned.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
}

const ready = (async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const statements = splitStatements(sql);
  await db.init();
  for (const stmt of statements) await db.query(stmt);
  console.log(`[migrate] ${statements.length} statements aplicados (modo: ${db.dbMode()})`);
})();

module.exports = { ready };
