'use strict';
/**
 * Shim LOCAL de better-sqlite3 (só para testes neste sandbox, nunca vai pro deploy).
 * O better-sqlite3 precisa compilar com node-gyp e aqui não há rede para os headers;
 * usamos o node:sqlite (Node 22+) com a mesma superfície que o projeto usa:
 * prepare().get/all/run, exec, pragma, transaction, pluck.
 */
const { DatabaseSync } = require('node:sqlite');

function normalizar(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'bigint') return Number(v);
  return v;
}
function normalizarLinha(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = normalizar(v);
  return out;
}

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this._stmt = db._raw.prepare(sql);
    this._pluck = false;
  }
  pluck() {
    this._pluck = true;
    return this;
  }
  _params(args) {
    // better-sqlite3: .get(a, b) ou .get({ nome }) ou .run({ '@a': 1 })
    if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      if (/[@:$][A-Za-z_]/.test(this.sql)) {
        // normaliza chaves "@x"/":x" para "x"
        const out = {};
        for (const [k, v] of Object.entries(args[0])) out[String(k).replace(/^[@:$]/, '')] = v;
        return [out];
      }
      return Object.values(args[0]);
    }
    return args;
  }
  get(...args) {
    const row = this._stmt.get(...this._params(args));
    if (row === undefined) return undefined;
    if (this._pluck) {
      const vals = Object.values(row);
      return normalizar(vals[0]);
    }
    return normalizarLinha(row);
  }
  all(...args) {
    const rows = this._stmt.all(...this._params(args)) || [];
    if (this._pluck) return rows.map((r) => normalizar(Object.values(r)[0]));
    return rows.map(normalizarLinha);
  }
  run(...args) {
    const info = this._stmt.run(...this._params(args));
    return {
      changes: Number(info.changes || 0),
      lastInsertRowid: Number(info.lastInsertRowid || 0),
    };
  }
}

class Database {
  constructor(file, opts = {}) {
    this._raw = new DatabaseSync(file);
    this._raw.exec('PRAGMA foreign_keys = ON');
    if (opts.readonly) this._raw.exec('PRAGMA query_only = ON');
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  exec(sql) {
    this._raw.exec(sql);
    return this;
  }
  pragma(sql) {
    // better-sqlite3: db.pragma('journal_mode = WAL')
    try {
      this._raw.exec(`PRAGMA ${sql}`);
      return [];
    } catch {
      return [];
    }
  }
  transaction(fn) {
    return (...args) => {
      this._raw.exec('BEGIN');
      try {
        const out = fn(...args);
        this._raw.exec('COMMIT');
        return out;
      } catch (e) {
        try {
          this._raw.exec('ROLLBACK');
        } catch {}
        throw e;
      }
    };
  }
  close() {
    try {
      this._raw.close();
    } catch {}
  }
}

module.exports = Database;
module.exports.default = Database;
