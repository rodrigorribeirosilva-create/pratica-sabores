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
// O histórico mora na MESMA tabela do backup, em ids de 101 a 120 (anel).
// Assim não precisamos criar tabela nova no Supabase para guardar versões.
const HIST = TABLE;
const HIST_BASE = 101;
const ROW_ID = 1;
const HIST_MAX = 20; // quantos snapshots ficam guardados para voltar atrás
const ATIVO = !!(SUPABASE_URL && SUPABASE_KEY);

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/**
 * Espera o snapshot "assentar" antes de restaurar.
 *
 * Problema real que aconteceu: no deploy, a instância antiga recebe SIGTERM e
 * começa a enviar o último backup; a instância nova subia e lia a linha ANTES
 * desse envio terminar — restaurava um retrato velho e, pior, o gravava por
 * cima do bom. Aqui a gente lê, espera o `updated_at` parar de mudar e só
 * então usa o snapshot mais recente.
 */
async function lerSnapshot() {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=payload,updated_at`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function snapshotEstavel({ tentativas = 6, esperaMs = 1200 } = {}) {
  let anterior = null;
  for (let i = 0; i < tentativas; i++) {
    const atual = await lerSnapshot();
    if (!atual) return null;
    if (anterior && atual.updated_at === anterior.updated_at) return atual;
    anterior = atual;
    await new Promise((r) => setTimeout(r, esperaMs));
  }
  return anterior;
}

/** Baixa o snapshot e grava no caminho informado. Retorna true se restaurou. */
async function restoreTo(dbFile) {
  if (!ATIVO) return false;
  try {
    let linha = null;
    try {
      linha = await snapshotEstavel();
    } catch {
      linha = null;
    }
    if (!linha) {
      const url = `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=payload,updated_at`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) {
        console.warn(`[nuvem] restore falhou: HTTP ${res.status}`);
        return false;
      }
      const rows = await res.json();
      linha = Array.isArray(rows) && rows.length ? rows[0] : null;
    }
    const rows = linha ? [linha] : [];
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
    // Trava de segurança: se o banco local está vazio mas a nuvem tem dados,
    // NÃO envia (isso apagaria tudo — foi o que aconteceu no deploy anterior).
    if (db) {
      let lojas = null;
      try {
        lojas = db.prepare('SELECT COUNT(*) n FROM stores').get().n;
      } catch {
        lojas = null;
      }
      if (lojas === 0) {
        try {
          const atual = await lerSnapshot();
          if (atual && atual.payload && atual.payload.length > 20000) {
            bloqueios += 1;
            console.warn('[nuvem] BLOQUEADO: banco local vazio, nuvem tem dados. Backup não enviado.');
            return false;
          }
        } catch {
          /* se não deu para checar, segue o fluxo normal */
        }
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
    // guarda também no histórico (anel de ids 101..120) para poder voltar atrás
    try {
      const lista = await fetch(
        `${SUPABASE_URL}/rest/v1/${HIST}?id=gte.${HIST_BASE}&select=id&order=id.asc`,
        { headers: headers() }
      );
      const usados = lista.ok ? await lista.json() : [];
      const ids = Array.isArray(usados) ? usados.map((r) => r.id) : [];
      const proximo = ids.length >= HIST_MAX ? ids[0] : ids.length ? Math.max(...ids) + 1 : HIST_BASE;
      if (ids.length >= HIST_MAX) {
        await fetch(`${SUPABASE_URL}/rest/v1/${HIST}?id=eq.${proximo}`, {
          method: 'DELETE',
          headers: headers({ Prefer: 'return=minimal' }),
        });
      }
      await fetch(`${SUPABASE_URL}/rest/v1/${HIST}`, {
        method: 'POST',
        headers: headers({ Prefer: 'return=minimal,resolution=ignore-duplicates' }),
        body: JSON.stringify({ id: proximo, payload, updated_at: new Date().toISOString() }),
      });
    } catch {
      /* histórico é extra: se falhar, o backup principal continua valendo */
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
let bloqueios = 0; // quantas vezes o envio foi barrado para não apagar dados
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

/**
 * Lê UMA versão guardada (id 101–120) e devolve o payload — só para comparação.
 * Não altera nada. Usado pelo master para "o que mudou nesta loja desde ontem?".
 */
async function lerVersao(id) {
  if (!ATIVO) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/${HIST}?id=eq.${encodeURIComponent(id)}&select=id,payload,updated_at`;
    const res = await fetch(url, { headers: headers() });
    if (!res.ok) return null;
    const linhas = await res.json();
    if (!Array.isArray(linhas) || !linhas.length) return null;
    const linha = linhas[0];
    return { id: linha.id, quando: linha.updated_at, base64: linha.payload };
  } catch {
    return null;
  }
}

/** Estado atual (usado pelo /healthz para diagnóstico). */
/** Lista os snapshots guardados (mais recentes primeiro). */
async function listarHistorico(limite = 20) {
  if (!ATIVO) return [];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${HIST}?id=gte.${HIST_BASE}&select=id,updated_at&order=id.desc&limit=${Math.max(1, Math.min(50, limite))}`,
      { headers: headers() }
    );
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows.map((r) => ({ id: r.id, quando: r.updated_at })) : [];
  } catch {
    return [];
  }
}

/** Restaura um snapshot do histórico para o arquivo e o torna o atual. */
async function restaurarDoHistorico(dbFile, id) {
  if (!ATIVO) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${HIST}?id=eq.${Number(id)}&select=payload`, {
      headers: headers(),
    });
    if (!res.ok) return false;
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length || !rows[0].payload) return false;
    const buf = Buffer.from(rows[0].payload, 'base64');
    fs.writeFileSync(dbFile, buf);
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=id`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify({ id: ROW_ID, payload: rows[0].payload, updated_at: new Date().toISOString() }),
    });
    return true;
  } catch {
    return false;
  }
}

function status() {
  return { ativo: ATIVO, pendente, enviando, falhas, bloqueios, temAgendamento: !!timer };
}

module.exports = {
  ATIVO,
  lerVersao,
  restoreTo,
  uploadFrom,
  scheduleUpload,
  flush,
  status,
  TABLE,
  HIST,
  SUPABASE_URL,
  listarHistorico,
  restaurarDoHistorico,
};
