'use strict';
// ============================================================================
// Camada de dados — PostgreSQL real.
//  • DATABASE_URL definida  → pool `pg` (Supabase/Render/RDS em produção)
//  • caso contrário         → PGlite (engine PostgreSQL 17 embutida) persistido
//                             em DATA_DIR/pgdata — mesmo SQL, constraints e FKs
// ============================================================================
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

let mode = null;
let pglite = null;
let pool = null;

async function init() {
  if (mode) return;
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false } });
    await pool.query('SELECT 1');
    mode = 'pg';
    return;
  }
  const { PGlite } = require('@electric-sql/pglite');
  pglite = new PGlite(path.join(DATA_DIR, 'pgdata'));
  await pglite.waitReady;
  mode = 'pglite';
}

// Normaliza: { rows, rowCount }
async function query(text, params) {
  await init();
  if (mode === 'pg') {
    const r = await pool.query(text, params);
    return { rows: r.rows, rowCount: r.rowCount ?? (r.rows ? r.rows.length : 0) };
  }
  const r = await pglite.query(text, params);
  return { rows: r.rows || [], rowCount: r.affectedRows ?? (r.rows ? r.rows.length : 0) };
}

// Transação com escopo: fn recebe q(text, params)->{rows,rowCount}
async function withTransaction(fn) {
  await init();
  if (mode === 'pg') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const q = async (t, p) => { const r = await client.query(t, p); return { rows: r.rows, rowCount: r.rowCount ?? r.rows.length }; };
      const out = await fn(q);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      throw e;
    } finally { client.release(); }
  }
  return pglite.transaction(async (tx) => {
    const q = async (t, p) => { const r = await tx.query(t, p); return { rows: r.rows || [], rowCount: r.affectedRows ?? (r.rows ? r.rows.length : 0) }; };
    return fn(q);
  });
}

module.exports = { query, withTransaction, init, dbMode: () => mode, DATA_DIR };
