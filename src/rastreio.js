'use strict';
/**
 * Rastreio de tráfego por loja.
 *
 * - Toda visita a /l/<slug> é registrada com a origem (utm_source, utm_campaign…).
 * - Cliques em WhatsApp viram "lead".
 * - Pedidos/agendamentos viram "conversão" (e guardam de qual campanha vieram).
 *
 * Nada disso depende de Meta/Google: o link rastreado é criado no painel e
 * colado no anúncio. O que o anúncio trouxe aparece aqui.
 */
const crypto = require('crypto');
const { db } = require('./db');

const COOKIE = 'ps_s';
const UM_DIA = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Sessão do visitante (para não contar a mesma pessoa 10 vezes)      */
/* ------------------------------------------------------------------ */

function lerCookie(req, nome) {
  const cru = req.headers.cookie || '';
  for (const parte of cru.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nome) return decodeURIComponent(v.join('=') || '');
  }
  return '';
}

function sessaoDe(req, res) {
  let s = lerCookie(req, COOKIE);
  if (!s || s.length < 8) {
    s = crypto.randomBytes(9).toString('hex');
    if (res && res.cookie) {
      res.cookie(COOKIE, s, {
        maxAge: 30 * UM_DIA,
        httpOnly: true,
        sameSite: 'lax',
        secure: req.protocol === 'https',
      });
    }
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Registro                                                           */
/* ------------------------------------------------------------------ */

const limpo = (v, max = 90) => String(v == null ? '' : v).trim().slice(0, max);

/** Chamado quando a página pública da loja é aberta. */
function registrarVisita(req, res, store) {
  try {
    const q = req.query || {};
    const sessao = sessaoDe(req, res);
    const ua = String(req.headers['user-agent'] || '').slice(0, 200);
    const ehBot = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|headless|curl|wget/i.test(ua);
    if (ehBot) return sessao;

    const ref = String(req.headers.referer || '').slice(0, 200);
    const host = String(req.headers.host || '');
    const interno = ref && host && ref.includes(host);
    const direto = !ref || interno;

    // Se essa pessoa já chegou por uma campanha, as próximas páginas continuam
    // contando para ela (não viram "direto" no meio do caminho).
    const anterior = db
      .prepare('SELECT source, campaign FROM sessoes_origem WHERE sessao = ? AND store_id = ?')
      .get(sessao, store.id);

    const fonte = limpo(q.utm_source) || (anterior && anterior.source) || (direto ? 'direto' : 'indicacao');
    const campanha = limpo(q.utm_campaign) || (anterior && anterior.campaign) || '';

    db.prepare(
      `INSERT INTO visitas (store_id, sessao, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, caminho, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      store.id,
      sessao,
      fonte,
      limpo(q.utm_medium),
      campanha,
      limpo(q.utm_content),
      limpo(q.utm_term),
      direto ? '' : limpo(ref, 200),
      limpo(String(req.originalUrl || '').split('?')[0], 120)
    );

    // guarda a campanha na sessão: o pedido feito depois herda a origem
    if (q.utm_campaign || q.utm_source) {
      db.prepare(
        `INSERT INTO sessoes_origem (sessao, store_id, source, campaign, criado_em)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(sessao) DO UPDATE SET source = excluded.source, campaign = excluded.campaign`
      ).run(sessao, store.id, limpo(q.utm_source), limpo(q.utm_campaign));
    }
    return sessao;
  } catch (e) {
    console.error('[visita]', e.message);
    return '';
  }
}

/** Lead (clique no WhatsApp) ou outro evento. */
function registrarEvento(store, tipo, sessao, detalhe = '') {
  try {
    db.prepare(
      `INSERT INTO eventos (store_id, sessao, tipo, detalhe, criado_em) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(store.id, limpo(sessao, 40), limpo(tipo, 30), limpo(detalhe, 120));
  } catch (e) {
    console.error('[evento]', e.message);
  }
}

/** Origem de uma sessão (usada ao criar pedido/agendamento). */
function origemDaSessao(storeId, sessao) {
  try {
    const row = db
      .prepare('SELECT source, campaign FROM sessoes_origem WHERE sessao = ? AND store_id = ?')
      .get(String(sessao || ''), storeId);
    return { source: (row && row.source) || '', campaign: (row && row.campaign) || '' };
  } catch {
    return { source: '', campaign: '' };
  }
}

/* ------------------------------------------------------------------ */
/* Resumo para o painel                                               */
/* ------------------------------------------------------------------ */

function resumo({ storeId = null, dias = 7 } = {}) {
  const diasNum = Math.max(1, Math.min(365, Number(dias) || 7));
  const filtroLoja = storeId ? ' AND v.store_id = ?' : '';
  const filtroLojaE = storeId ? ' AND e.store_id = ?' : '';
  const filtroLojaO = storeId ? ' AND o.store_id = ?' : '';
  const filtroLojaA = storeId ? ' AND a.store_id = ?' : '';
  const p = storeId ? [storeId] : [];
  const janela = `-${diasNum} days`;

  const visitas = db
    .prepare(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT v.sessao) AS pessoas
         FROM visitas v
        WHERE v.criado_em >= datetime('now', ?)${filtroLoja}`
    )
    .get(janela, ...p);

  const porLojaVisitas = db
    .prepare(
      `SELECT v.store_id,
              COUNT(*) AS visitas,
              COUNT(DISTINCT v.sessao) AS pessoas
         FROM visitas v
        WHERE v.criado_em >= datetime('now', ?)
        GROUP BY v.store_id`
    )
    .all(janela);

  const porLojaCliques = db
    .prepare(
      `SELECT e.store_id, COUNT(*) AS cliques
         FROM eventos e
        WHERE e.tipo = 'whatsapp' AND e.criado_em >= datetime('now', ?)
        GROUP BY e.store_id`
    )
    .all(janela);

  const porLojaPedidos = db
    .prepare(
      `SELECT o.store_id, COUNT(*) AS pedidos, SUM(o.total_cents) AS valor
         FROM orders o
        WHERE o.created_at >= datetime('now', ?)
        GROUP BY o.store_id`
    )
    .all(janela);

  const porLojaAgenda = db
    .prepare(
      `SELECT a.store_id, COUNT(*) AS pedidos, SUM(a.valor_cents) AS valor
         FROM agendamentos a
        WHERE a.criado_em >= datetime('now', ?)
        GROUP BY a.store_id`
    )
    .all(janela);

  const cliques = db
    .prepare(
      `SELECT COUNT(*) AS total FROM eventos e
        WHERE e.tipo = 'whatsapp' AND e.criado_em >= datetime('now', ?)${filtroLojaE}`
    )
    .get(janela, ...p);

  const pedidos = db
    .prepare(`SELECT COUNT(*) AS n, SUM(total_cents) AS v FROM orders o WHERE o.created_at >= datetime('now', ?)${filtroLojaO}`)
    .get(janela, ...p);
  // pedidos com origem registrada (os que o rastreio conseguiu acompanhar)
  const pedidosRastreados = db
    .prepare(
      `SELECT COUNT(*) AS n FROM orders o
        WHERE o.created_at >= datetime('now', ?) AND o.origem_fonte <> ''${filtroLojaO}`
    )
    .get(janela, ...p);
  const agendamentos = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(valor_cents) AS v FROM agendamentos a WHERE a.criado_em >= datetime('now', ?)${filtroLojaA}`
    )
    .get(janela, ...p);

  const origens = db
    .prepare(
      `SELECT COALESCE(NULLIF(v.utm_source, ''), 'direto') AS origem,
              COALESCE(NULLIF(v.utm_campaign, ''), '—') AS campanha,
              COUNT(*) AS visitas, COUNT(DISTINCT v.sessao) AS pessoas
         FROM visitas v
        WHERE v.criado_em >= datetime('now', ?)${filtroLoja}
        GROUP BY origem, campanha
        ORDER BY visitas DESC
        LIMIT 12`
    )
    .all(janela, ...p);

  const campanhas = db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM visitas v
                WHERE v.store_id = c.store_id AND v.utm_campaign = c.utm_campaign
                  AND v.criado_em >= datetime('now', ?)) AS visitas,
              (SELECT COUNT(DISTINCT v.sessao) FROM visitas v
                WHERE v.store_id = c.store_id AND v.utm_campaign = c.utm_campaign
                  AND v.criado_em >= datetime('now', ?)) AS pessoas,
              (SELECT COUNT(*) FROM orders o
                WHERE o.store_id = c.store_id AND o.origem_campanha = c.utm_campaign
                  AND o.created_at >= datetime('now', ?)) AS pedidos,
              (SELECT COUNT(*) FROM eventos e
                WHERE e.store_id = c.store_id AND e.tipo = 'whatsapp'
                  AND e.sessao IN (SELECT v2.sessao FROM visitas v2
                                    WHERE v2.store_id = c.store_id AND v2.utm_campaign = c.utm_campaign)
                  AND e.criado_em >= datetime('now', ?)) AS cliques
         FROM campanhas c
        ${storeId ? 'WHERE c.store_id = ?' : ''}
        ORDER BY c.id DESC`
    )
    .all(janela, janela, janela, janela, ...p);

  const somaPedidos = Number(pedidos.n || 0) + Number(agendamentos.n || 0);
  const somaValor = Number(pedidos.v || 0) + Number(agendamentos.v || 0);
  const somaRastreados = Number(pedidosRastreados.n || 0);
  const totalVisitas = Number(visitas.total || 0);

  const lojas = {};
  for (const r of porLojaVisitas) lojas[r.store_id] = { visitas: r.visitas, pessoas: r.pessoas, cliques: 0, pedidos: 0, valor: 0 };
  for (const r of porLojaCliques) (lojas[r.store_id] = lojas[r.store_id] || { visitas: 0, pessoas: 0, pedidos: 0, valor: 0 }).cliques = r.cliques;
  const porLojaRastreados = db
    .prepare(
      `SELECT o.store_id, COUNT(*) AS n FROM orders o
        WHERE o.created_at >= datetime('now', ?) AND o.origem_fonte <> ''
        GROUP BY o.store_id`
    )
    .all(janela);
  for (const r of porLojaRastreados) {
    const l = (lojas[r.store_id] = lojas[r.store_id] || { visitas: 0, pessoas: 0, cliques: 0, pedidos: 0, valor: 0 });
    l.rastreados = Number(r.n || 0);
  }
  for (const r of [...porLojaPedidos, ...porLojaAgenda]) {
    const l = (lojas[r.store_id] = lojas[r.store_id] || { visitas: 0, pessoas: 0, cliques: 0, pedidos: 0, valor: 0 });
    l.pedidos += Number(r.pedidos || 0);
    l.valor += Number(r.valor || 0);
  }

  const investido = campanhas.reduce((s, c) => s + Number(c.gasto_cents || 0), 0);

  return {
    dias: diasNum,
    totais: {
      visitas: totalVisitas,
      pessoas: Number(visitas.pessoas || 0),
      cliques: Number(cliques.total || 0),
      pedidos: somaPedidos,
      valor_cents: somaValor,
      pedidos_rastreados: somaRastreados,
      conversao: totalVisitas ? Math.round((Math.min(somaRastreados, totalVisitas) / totalVisitas) * 1000) / 10 : 0,
      investido_cents: investido,
      custo_por_pedido_cents: somaPedidos && investido ? Math.round(investido / somaPedidos) : 0,
    },
    por_loja: lojas,
    origens,
    campanhas: campanhas.map((c) => ({
      ...c,
      conversao: c.visitas ? Math.round((Math.min(Number(c.pedidos), Number(c.visitas)) / Number(c.visitas)) * 1000) / 10 : 0,
      custo_por_pedido_cents: Number(c.pedidos) ? Math.round(Number(c.gasto_cents || 0) / Number(c.pedidos)) : 0,
    })),
  };
}

/** Link rastreado pronto para colar no anúncio. */
function linkRastreado(baseUrl, slug, { source = 'meta', medium = 'cpc', campaign = '', content = '' }) {
  const u = new URL(`${baseUrl}/l/${slug}`);
  u.searchParams.set('utm_source', source || 'meta');
  if (medium) u.searchParams.set('utm_medium', medium);
  if (campaign) u.searchParams.set('utm_campaign', campaign);
  if (content) u.searchParams.set('utm_content', content);
  return u.toString();
}


/* ------------------------------------------------------------------ */
/* Links prontos por canal (Instagram, WhatsApp, Google, bio…)        */
/* ------------------------------------------------------------------ */

const CANAIS = {
  instagram: { source: 'instagram', medium: 'social', campanha: 'instagram', rotulo: 'Instagram (bio, stories, direct)' },
  whatsapp: { source: 'whatsapp', medium: 'social', campanha: 'whatsapp-status', rotulo: 'WhatsApp (status, grupos, conversa)' },
  google: { source: 'google', medium: 'cpc', campanha: 'google', rotulo: 'Google Ads / Busca' },
  facebook: { source: 'facebook', medium: 'social', campanha: 'facebook', rotulo: 'Facebook (post, marketplace)' },
  qrcode: { source: 'qrcode', medium: 'offline', campanha: 'material-impresso', rotulo: 'QR Code / material impresso' },
};

/** Todos os links de uma loja, prontos para colar. */
function linksDaLoja(baseUrl, slug) {
  const saida = {};
  for (const [chave, cfg] of Object.entries(CANAIS)) {
    saida[chave] = {
      rotulo: cfg.rotulo,
      url: linkRastreado(baseUrl, slug, { source: cfg.source, medium: cfg.medium, campaign: cfg.campanha }),
    };
  }
  saida.limpo = { rotulo: 'Link limpo (sem etiqueta)', url: `${baseUrl}/l/${slug}` };
  return saida;
}

module.exports = {
  COOKIE,
  CANAIS,
  linksDaLoja,
  sessaoDe,
  registrarVisita,
  registrarEvento,
  origemDaSessao,
  resumo,
  linkRastreado,
};
