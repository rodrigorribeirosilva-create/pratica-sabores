'use strict';
// Aplica db/schema.sql em statements individuais (PGlite não aceita multi-command preparado)
const fs = require('fs');
const path = require('path');
const db = require('./db');

function splitStatements(sql) {
  const cleaned = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');
  return cleaned.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
}

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const statements = splitStatements(sql);
  for (const stmt of statements) await db.query(stmt);
  console.log(`[migrate] ${statements.length} statements aplicados (modo: ${db.dbMode()})`);
  process.exit(0);
})().catch(e => { console.error('[migrate] falha:', e.message); process.exit(1); });
