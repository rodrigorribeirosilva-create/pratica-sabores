'use strict';
/**
 * Caminhos de armazenamento (usado pelo banco, pelos uploads e pelo módulo da nuvem).
 *
 * Prioridade da pasta de dados:
 *   1. DATA_DIR, se for um disco realmente persistente;
 *   2. /var/data, /app/data, /data, /mnt/data — o primeiro que for disco persistente;
 *   3. DATA_DIR (ou ./data) — temporário (Render sem disco).
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

/** Um caminho é disco persistente quando está em um device diferente da raiz. */
function isMountPoint(dir) {
  try {
    const rootDev = fs.statSync('/').dev;
    return fs.statSync(dir).dev !== rootDev;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  const candidatos = [process.env.DATA_DIR, '/var/data', '/app/data', '/data', '/mnt/data'].filter(Boolean);
  for (const dir of candidatos) {
    if (fs.existsSync(dir) && isMountPoint(dir)) {
      if (process.env.DATA_DIR && process.env.DATA_DIR !== dir) {
        console.warn(`[paths] disco persistente em ${dir} — usando no lugar de ${process.env.DATA_DIR}`);
      }
      return dir;
    }
  }
  return process.env.DATA_DIR || path.join(ROOT, 'data');
}

const DATA_DIR = resolveDataDir();
const PERSISTENTE = isMountPoint(DATA_DIR);
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'menu.db');

/** Uploads ficam dentro do disco persistente quando ele existe. */
function resolveUploadDir() {
  if (PERSISTENTE) return path.join(DATA_DIR, 'uploads');
  return process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
}

module.exports = { DATA_DIR, DB_FILE, PERSISTENTE, resolveUploadDir, isMountPoint, ROOT };
