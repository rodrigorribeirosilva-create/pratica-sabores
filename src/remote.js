'use strict';
/**
 * Persistência na nuvem (Supabase) — substituto do disco persistente.
 *
 * Como funciona:
 *   • Na inicialização: baixa o último snapshot do banco e o coloca no lugar
 *     do arquivo local (que é temporário no Render).
 *   • A cada alteração no banco: envia um novo snapshot (com atraso de 2s,
 *     para agrupar várias alterações seguidas).
 *
 * Só é ativado quando SUPABASE_URL e SUPABASE_KEY estão definidas.
 * Sem elas, o comportamento é o antigo (arquivo local).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const TABLE = 'ps_backup';
const ROW_ID = 1;
const ATIVO = !!(SUPABASE_URL && SUPABASE_KEY);

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Baixa o snapshot e grava no caminho informado. Retorna true se restaurou. */
async function restoreTo(dbFile) {
  if (!ATIVO) return false;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=payload,updated_at`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      console.warn(`[nuvem] restore falhou: HTTP ${res.status}`);
      return false;
    }
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length || !rows[0].payload) {
      console.log('[nuvem] nenhum snapshot salvo ainda — começando do zero');
      return false;
    }
    const buf = Buffer.from(rows[0].payload, 'base64');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    // remove restos do WAL antigo para não corromper a cópia restaurada
    for (const sufixo of ['-wal', '-shm']) {
      try {
        fs.unlinkSync(dbFile + sufixo);
      } catch {
        /* não existe */
      }
    }
    fs.writeFileSync(dbFile, buf);
    console.log(
      `[nuvem] snapshot restaurado: ${(buf.length / 1024).toFixed(1)} KB · salvo em ${rows[0].updated_at}`
    );
    return true;
  } catch (err) {
    console.warn('[nuvem] erro ao restaurar:', err.message);
    return false;
  }
}

/** Envia o arquivo do banco como snapshot (upsert de uma linha só). */
async function uploadFrom(dbFile, db) {
  if (!ATIVO) return false;
  try {
    if (db) {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        /* ignora */
      }
    }
    const payload = fs.readFileSync(dbFile).toString('base64');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ id: ROW_ID, payload, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[nuvem] backup falhou: HTTP ${res.status} ${txt.slice(0, 120)}`);
      return false;
    }
    console.log(`[nuvem] backup enviado (${(payload.length / 1024).toFixed(1)} KB base64)`);
    return true;
  } catch (err) {
    console.warn('[nuvem] erro ao enviar backup:', err.message);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Agendador do backup                                                 */
/*                                                                     */
/* Regra de ouro: NENHUMA alteração pode ficar sem enviar.             */
/* Antes havia uma condição de corrida: se uma alteração acontecesse   */
/* enquanto outro envio estava em andamento, o agendamento era         */
/* descartado e a alteração só subia na próxima mudança — se o app     */
/* reiniciasse antes, ela era perdida.                                 */
/* ------------------------------------------------------------------ */
let timer = null;
let enviando = false;
let pendente = false;
let falhas = 0;
let alvo = null; // { dbFile, db }

async function enviarAgora() {
  if (!alvo) return false;
  const ok = await uploadFrom(alvo.dbFile, alvo.db);
  if (ok) falhas = 0;
  else falhas += 1;
  return ok;
}

async function tick(delayPadrao = 0) {
  timer = null;
  if (enviando) return; // o envio em curso reagenda no final
  if (!pendente) return;
  enviando = true;
  pendente = false;
  let ok = false;
  try {
    ok = await enviarAgora();
  } finally {
    enviando = false;
  }
  // Se algo mudou durante o envio, ou se o envio falhou: agenda de novo.
  if (pendente || !ok) {
    const espera = ok ? 300 : Math.min(60000, 1000 * 2 ** Math.min(falhas, 6));
    timer = setTimeout(tick, espera);
    timer.unref?.();
  } else if (delayPadrao) {
    /* nada pendente */
  }
}

/**
 * Agenda o envio do snapshot (agrupa alterações seguidas).
 * @param {string} dbFile
 * @param {object} db instância do better-sqlite3 (para checkpoint do WAL)
 */
function scheduleUpload(dbFile, db, delayMs = 1500) {
  if (!ATIVO) return;
  alvo = { dbFile, db };
  pendente = true;
  if (timer || enviando) return; // já existe envio/agendamento em curso
  timer = setTimeout(tick, delayMs);
  timer.unref?.();
}

/** Envio imediato (usado ao desligar o servidor). */
async function flush(dbFile, db) {
  if (!ATIVO) return false;
  if (dbFile && db) alvo = { dbFile, db };
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pendente = false;
  return enviarAgora();
}

/**
 * Rede de segurança: a cada 30s, se sobrou alguma alteração sem enviar
 * (falha de rede, envio interrompido), tenta novamente.
 */
const vigia = setInterval(() => {
  if (!ATIVO || enviando || !pendente || timer) return;
  timer = setTimeout(tick, 0);
  timer.unref?.();
}, 30000);
vigia.unref?.();

/** Estado atual (usado pelo /healthz para diagnóstico). */
function status() {
  return { ativo: ATIVO, pendente, enviando, falhas, temAgendamento: !!timer };
}

module.exports = { ATIVO, restoreTo, uploadFrom, scheduleUpload, flush, status, TABLE, SUPABASE_URL };
