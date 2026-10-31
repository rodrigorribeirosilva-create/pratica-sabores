'use strict';
/**
 * Módulo SERVIÇOS (climatização / assistência técnica).
 *
 *  - `publico`  → fica em /l/:slug/api  (cliente final agenda pelo link da empresa)
 *  - `admin`    → fica em /l/:slug/api/admin  (painel do dono, exige senha)
 *
 * Guarda no banco: serviços com preço, clientes, equipamentos instalados e
 * agendamentos. Cada equipamento tem data de próxima limpeza/manutenção — é o
 * que faz o painel avisar "o cliente X precisa de limpeza no ar".
 */
const express = require('express');
const { db, getSetting } = require('./db');
const { requireAuth } = require('./auth');

const admin = express.Router();
const publico = express.Router();

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const todayISO = (d = new Date()) => {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};

const addDays = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + Number(dias || 0));
  return todayISO(d);
};

const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);

const brl = (cents) => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dataBR = (iso) => {
  if (!iso) return '';
  const [a, m, d] = String(iso).split('-');
  return d ? `${d}/${m}/${a}` : iso;
};

const diaSemana = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.getDay()];
};

const STATUS = ['solicitado', 'agendado', 'a_caminho', 'concluido', 'cancelado'];
const STATUS_LABEL = {
  solicitado: 'Solicitado',
  agendado: 'Agendado',
  a_caminho: 'A caminho',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const soDigitos = (t) => String(t || '').replace(/\D/g, '');
const numeroWhats = (t) => {
  const d = soDigitos(t);
  if (!d) return '';
  return d.startsWith('55') ? d : `55${d}`;
};

function nomeLoja(req) {
  const b = getSetting(req.store.id, 'business', {}) || {};
  return b.name || req.store.name || 'nossa empresa';
}

function lojaBusiness(req) {
  return getSetting(req.store.id, 'business', {}) || {};
}


/* ------------------------------------------------------------------ */
/* Disponibilidade da agenda                                           */
/* ------------------------------------------------------------------ */

const PERIODOS_PADRAO = ['Manhã', 'Tarde', 'Noite'];
const STATUS_QUE_OCUPAM = ['solicitado', 'agendado', 'a_caminho', 'concluido'];

/** Configuração da agenda da loja (vagas por período, dias de atendimento). */
function agendaConfig(storeId) {
  const c = getSetting(storeId, 'agenda', {}) || {};
  const periodos = Array.isArray(c.periodos) && c.periodos.length ? c.periodos.map(String) : PERIODOS_PADRAO;
  const vagas = Math.max(1, Math.min(20, Number(c.vagas) || 1));
  const dias = Array.isArray(c.dias) && c.dias.length ? c.dias.map(Number) : [1, 2, 3, 4, 5, 6];
  return { periodos, vagas, dias };
}

/** Quantos agendamentos já existem por período naquele dia. */
function ocupacaoDia(storeId, data) {
  const linhas = db
    .prepare(
      `SELECT periodo, COUNT(*) AS n FROM agendamentos
        WHERE store_id = ? AND data = ? AND status IN (${STATUS_QUE_OCUPAM.map(() => '?').join(',')})
        GROUP BY periodo`
    )
    .all(storeId, data, ...STATUS_QUE_OCUPAM);
  const mapa = {};
  linhas.forEach((l) => {
    mapa[l.periodo || ''] = Number(l.n) || 0;
  });
  return mapa;
}

/** Situação de um dia: cada período livre/ocupado/fechado. */
function situacaoDia(storeId, data) {
  const cfg = agendaConfig(storeId);
  const ocup = ocupacaoDia(storeId, data);
  const dow = new Date(`${data}T12:00:00`).getDay();
  const aberto = cfg.dias.includes(dow);
  const periodos = cfg.periodos.map((nome) => {
    const ocupados = ocup[nome] || 0;
    return { nome, ocupados, vagas: cfg.vagas, livre: aberto && ocupados < cfg.vagas };
  });
  return { data, aberto, vagas: cfg.vagas, periodos };
}

/** Próximos horários com vaga a partir de uma data (para oferecer ao cliente). */
function proximosLivres(storeId, deISO, limite = 4, ignorarId = 0) {
  const cfg = agendaConfig(storeId);
  const saida = [];
  let dia = deISO || todayISO();
  for (let i = 0; i < 45 && saida.length < limite; i += 1) {
    const dow = new Date(`${dia}T12:00:00`).getDay();
    if (cfg.dias.includes(dow)) {
      const ocup = ocupacaoDia(storeId, dia);
      if (ignorarId) {
        const atual = db.prepare('SELECT periodo FROM agendamentos WHERE id = ?').get(ignorarId);
        if (atual && atual.periodo) ocup[atual.periodo] = Math.max(0, (ocup[atual.periodo] || 0) - 1);
      }
      cfg.periodos.forEach((nome) => {
        if (saida.length < limite && (ocup[nome] || 0) < cfg.vagas) {
          saida.push({ data: dia, periodo: nome });
        }
      });
    }
    dia = addDays(dia, 1);
  }
  return saida;
}

const listaHorarios = (lista) =>
  lista
    .map((h) => `• ${dataBR(h.data)} (${diaSemana(h.data)}) — ${h.periodo}`)
    .join('\n');

/** Cliente: procura pelo telefone (últimos 11 dígitos) ou cria um novo. */
function acharOuCriarCliente(storeId, { nome, telefone, email, endereco, bairro, obs }) {
  const tel = soDigitos(telefone).slice(-11);
  if (tel) {
    const achado = db
      .prepare(
        `SELECT * FROM clientes WHERE store_id = ?
           AND replace(replace(replace(replace(telefone,'(',''),')',''),'-',''),' ','') LIKE ?
         ORDER BY id DESC LIMIT 1`
      )
      .get(storeId, `%${tel}`);
    if (achado) {
      db.prepare(
        `UPDATE clientes SET
           nome = CASE WHEN ? <> '' THEN ? ELSE nome END,
           email = CASE WHEN ? <> '' THEN ? ELSE email END,
           endereco = CASE WHEN ? <> '' THEN ? ELSE endereco END,
           bairro = CASE WHEN ? <> '' THEN ? ELSE bairro END,
           atualizado_em = datetime('now')
         WHERE id = ?`
      ).run(nome || '', nome || '', email || '', email || '', endereco || '', endereco || '', bairro || '', bairro || '', achado.id);
      return achado.id;
    }
  }
  const info = db
    .prepare('INSERT INTO clientes (store_id, nome, telefone, email, endereco, bairro, obs) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(storeId, nome || 'Cliente', telefone || '', email || '', endereco || '', bairro || '', obs || '');
  return Number(info.lastInsertRowid);
}

/** Junta agendamento + cliente + equipamento numa linha só (para telas). */
const SQL_AGENDA = `
  SELECT a.*,
         c.nome     AS cliente_nome,
         c.telefone AS cliente_telefone,
         e.tipo     AS equip_tipo,
         e.marca    AS equip_marca,
         e.ambiente AS equip_ambiente,
         e.prox_limpeza,
         e.prox_manutencao
    FROM agendamentos a
    LEFT JOIN clientes c     ON c.id = a.cliente_id
    LEFT JOIN equipamentos e ON e.id = a.equipamento_id`;

/* ------------------------------------------------------------------ */
/* PAINEL — resumo do dia                                              */
/* ------------------------------------------------------------------ */

admin.get('/painel', requireAuth, (req, res) => {
  const storeId = req.store.id;
  const hoje = todayISO();
  const semana = addDays(hoje, 7);
  const limite = addDays(hoje, 30);

  const hojeLista = db
    .prepare(`${SQL_AGENDA} WHERE a.store_id = ? AND a.data = ? AND a.status IN ('solicitado','agendado','a_caminho') ORDER BY a.periodo, a.id`)
    .all(storeId, hoje);

  const proximos = db
    .prepare(`${SQL_AGENDA} WHERE a.store_id = ? AND a.data > ? AND a.data <= ? AND a.status IN ('solicitado','agendado','a_caminho') ORDER BY a.data, a.id`)
    .all(storeId, hoje, semana);

  const novos = db
    .prepare(`${SQL_AGENDA} WHERE a.store_id = ? AND a.status = 'solicitado' ORDER BY a.id DESC LIMIT 30`)
    .all(storeId);

  const atrasados = db
    .prepare(`${SQL_AGENDA} WHERE a.store_id = ? AND a.data <> '' AND a.data < ? AND a.status IN ('solicitado','agendado') ORDER BY a.data`)
    .all(storeId, hoje);

  // Equipamentos que já venceram ou vencem nos próximos 30 dias
  const vencendo = db
    .prepare(
      `SELECT e.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.endereco AS cliente_endereco
         FROM equipamentos e LEFT JOIN clientes c ON c.id = e.cliente_id
        WHERE e.store_id = ? AND e.ativo = 1
          AND (
            (e.prox_limpeza <> '' AND e.prox_limpeza <= ?)
            OR (e.prox_manutencao <> '' AND e.prox_manutencao <= ?)
          )
        ORDER BY CASE WHEN e.prox_limpeza <> '' THEN e.prox_limpeza ELSE e.prox_manutencao END`
    )
    .all(storeId, limite, limite)
    .map((e) => {
      const alertas = [];
      if (e.prox_limpeza && e.prox_limpeza <= limite) {
        alertas.push({ tipo: 'limpeza', data: e.prox_limpeza, dias: diasEntre(hoje, e.prox_limpeza) });
      }
      if (e.prox_manutencao && e.prox_manutencao <= limite) {
        alertas.push({ tipo: 'manutenção', data: e.prox_manutencao, dias: diasEntre(hoje, e.prox_manutencao) });
      }
      return { ...e, alertas };
    });

  const totalClientes = db.prepare('SELECT COUNT(*) n FROM clientes WHERE store_id = ?').get(storeId).n;
  const totalEquip = db.prepare('SELECT COUNT(*) n FROM equipamentos WHERE store_id = ? AND ativo = 1').get(storeId).n;
  const mesRef = hoje.slice(0, 7);
  const mesValor = db
    .prepare(`SELECT COALESCE(SUM(valor_cents),0) v FROM agendamentos WHERE store_id = ? AND status = 'concluido' AND data LIKE ?`)
    .get(storeId, `${mesRef}%`).v;
  const concluidosMes = db
    .prepare(`SELECT COUNT(*) n FROM agendamentos WHERE store_id = ? AND status = 'concluido' AND data LIKE ?`)
    .get(storeId, `${mesRef}%`).n;

  res.json({
    hoje,
    hoje_lista: hojeLista,
    proximos,
    novos,
    atrasados,
    vencendo,
    resumo: {
      clientes: totalClientes,
      equipamentos: totalEquip,
      concluidos_mes: concluidosMes,
      faturado_mes_cents: mesValor,
      faturado_mes: brl(mesValor),
      alertas: vencendo.length + atrasados.length + novos.length,
    },
  });
});

/** Texto pronto para mandar o resumo do dia no WhatsApp. */
admin.get('/resumo-dia', requireAuth, (req, res) => {
  const storeId = req.store.id;
  const hoje = todayISO();
  const nome = nomeLoja(req);
  const lista = db
    .prepare(`${SQL_AGENDA} WHERE a.store_id = ? AND a.data = ? AND a.status IN ('agendado','a_caminho') ORDER BY a.periodo, a.id`)
    .all(storeId, hoje);
  const venc = db
    .prepare(
      `SELECT e.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone FROM equipamentos e
         LEFT JOIN clientes c ON c.id = e.cliente_id
        WHERE e.store_id = ? AND e.ativo = 1 AND e.prox_limpeza <> '' AND e.prox_limpeza <= ? ORDER BY e.prox_limpeza LIMIT 10`
    )
    .all(storeId, hoje);

  const linhas = [`*Agenda de hoje — ${nome}*`, `${dataBR(hoje)} (${diaSemana(hoje)})`, ''];
  if (!lista.length) linhas.push('Nenhum serviço agendado para hoje.');
  for (const a of lista) {
    linhas.push(
      `• ${a.periodo ? a.periodo + ' · ' : ''}${a.servico_nome} — ${a.cliente_nome || 'cliente'}` +
        `${a.equip_tipo ? ` (${a.equip_tipo}${a.equip_marca ? ' ' + a.equip_marca : ''})` : ''}` +
        `${a.endereco ? `\n   ${a.endereco}` : ''}`
    );
  }
  if (venc.length) {
    linhas.push('', '*Clientes pedindo limpeza:*');
    for (const e of venc) {
      linhas.push(`• ${e.cliente_nome || 'cliente'} — ${e.equip_tipo || e.tipo}${e.marca ? ' ' + e.marca : ''} · venceu em ${dataBR(e.prox_limpeza)}`);
    }
  }
  const business = lojaBusiness(req);
  const texto = linhas.join('\n');
  res.json({
    texto,
    whatsapp_url: `https://wa.me/${numeroWhats(business.whatsapp)}?text=${encodeURIComponent(texto)}`,
    whatsapp_share: `https://wa.me/?text=${encodeURIComponent(texto)}`,
  });
});

/* ------------------------------------------------------------------ */
/* SERVIÇOS (catálogo com preços)                                      */
/* ------------------------------------------------------------------ */

admin.get('/servicos', requireAuth, (req, res) => {
  res.json(
    db.prepare('SELECT * FROM servicos WHERE store_id = ? ORDER BY ordem, id').all(req.store.id)
  );
});

admin.post('/servicos', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!String(b.nome || '').trim()) return res.status(400).json({ error: 'Informe o nome do serviço.' });
  const info = db
    .prepare(
      `INSERT INTO servicos (store_id, nome, descricao, categoria, preco_cents, tipo_preco, duracao_min, ativo, ordem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.store.id,
      String(b.nome).trim(),
      String(b.descricao || ''),
      String(b.categoria || 'Outros'),
      Number(b.preco_cents || 0),
      ['fixo', 'a_partir', 'sob_orcamento'].includes(b.tipo_preco) ? b.tipo_preco : 'fixo',
      Number(b.duracao_min || 60),
      b.ativo === false ? 0 : 1,
      Number(b.ordem || 99)
    );
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

admin.put('/servicos/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = db.prepare('SELECT * FROM servicos WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Serviço não encontrado.' });
  db.prepare(
    `UPDATE servicos SET nome = ?, descricao = ?, categoria = ?, preco_cents = ?, tipo_preco = ?, duracao_min = ?, ativo = ?, ordem = ?
      WHERE id = ? AND store_id = ?`
  ).run(
    String(b.nome ?? atual.nome).trim(),
    String(b.descricao ?? atual.descricao),
    String(b.categoria ?? atual.categoria),
    Number(b.preco_cents ?? atual.preco_cents),
    ['fixo', 'a_partir', 'sob_orcamento'].includes(b.tipo_preco) ? b.tipo_preco : atual.tipo_preco,
    Number(b.duracao_min ?? atual.duracao_min),
    b.ativo === undefined ? atual.ativo : b.ativo ? 1 : 0,
    Number(b.ordem ?? atual.ordem),
    atual.id,
    req.store.id
  );
  res.json({ ok: true });
});

admin.delete('/servicos/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM servicos WHERE id = ? AND store_id = ?').run(req.params.id, req.store.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* CLIENTES                                                            */
/* ------------------------------------------------------------------ */

admin.get('/clientes', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  const lista = q
    ? db
        .prepare(
          `SELECT * FROM clientes WHERE store_id = ? AND (nome LIKE ? OR telefone LIKE ? OR endereco LIKE ?)
            ORDER BY nome LIMIT 300`
        )
        .all(req.store.id, `%${q}%`, `%${q}%`, `%${q}%`)
    : db.prepare('SELECT * FROM clientes WHERE store_id = ? ORDER BY nome LIMIT 300').all(req.store.id);
  res.json(lista);
});

admin.post('/clientes', requireAuth, (req, res) => {
  const b = req.body || {};
  if (!String(b.nome || '').trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' });
  const id = acharOuCriarCliente(req.store.id, b);
  res.json({ ok: true, id });
});

admin.put('/clientes/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = db.prepare('SELECT * FROM clientes WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Cliente não encontrado.' });
  db.prepare(
    `UPDATE clientes SET nome = ?, telefone = ?, email = ?, endereco = ?, bairro = ?, obs = ?, atualizado_em = datetime('now')
      WHERE id = ? AND store_id = ?`
  ).run(
    String(b.nome ?? atual.nome).trim(),
    String(b.telefone ?? atual.telefone),
    String(b.email ?? atual.email),
    String(b.endereco ?? atual.endereco),
    String(b.bairro ?? atual.bairro),
    String(b.obs ?? atual.obs),
    atual.id,
    req.store.id
  );
  res.json({ ok: true });
});

admin.delete('/clientes/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ? AND store_id = ?').run(req.params.id, req.store.id);
  db.prepare('DELETE FROM equipamentos WHERE cliente_id = ? AND store_id = ?').run(req.params.id, req.store.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* EQUIPAMENTOS                                                        */
/* ------------------------------------------------------------------ */

admin.get('/equipamentos', requireAuth, (req, res) => {
  const filtroCliente = Number(req.query.cliente_id || 0);
  const base = `SELECT e.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone
                  FROM equipamentos e LEFT JOIN clientes c ON c.id = e.cliente_id
                 WHERE e.store_id = ?`;
  const lista = filtroCliente
    ? db.prepare(`${base} AND e.cliente_id = ? ORDER BY e.id DESC`).all(req.store.id, filtroCliente)
    : db.prepare(`${base} ORDER BY e.id DESC`).all(req.store.id);
  const hoje = todayISO();
  res.json(
    lista.map((e) => ({
      ...e,
      prox_limpeza_dias: e.prox_limpeza ? diasEntre(hoje, e.prox_limpeza) : null,
      prox_manutencao_dias: e.prox_manutencao ? diasEntre(hoje, e.prox_manutencao) : null,
    }))
  );
});

admin.post('/equipamentos', requireAuth, (req, res) => {
  const b = req.body || {};
  const info = db
    .prepare(
      `INSERT INTO equipamentos
        (store_id, cliente_id, tipo, marca, modelo, btu, ambiente, quantidade, instalado_em,
         ultima_limpeza, prox_limpeza, prox_manutencao, intervalo_dias, obs, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.store.id,
      Number(b.cliente_id || 0),
      String(b.tipo || 'Split'),
      String(b.marca || ''),
      String(b.modelo || ''),
      String(b.btu || ''),
      String(b.ambiente || ''),
      Number(b.quantidade || 1),
      String(b.instalado_em || ''),
      String(b.ultima_limpeza || ''),
      String(b.prox_limpeza || ''),
      String(b.prox_manutencao || ''),
      Number(b.intervalo_dias || 180),
      String(b.obs || ''),
      b.ativo === false ? 0 : 1
    );
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

admin.put('/equipamentos/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = db.prepare('SELECT * FROM equipamentos WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  db.prepare(
    `UPDATE equipamentos SET cliente_id = ?, tipo = ?, marca = ?, modelo = ?, btu = ?, ambiente = ?, quantidade = ?,
        instalado_em = ?, ultima_limpeza = ?, prox_limpeza = ?, prox_manutencao = ?, intervalo_dias = ?, obs = ?, ativo = ?
      WHERE id = ? AND store_id = ?`
  ).run(
    Number(b.cliente_id ?? atual.cliente_id),
    String(b.tipo ?? atual.tipo),
    String(b.marca ?? atual.marca),
    String(b.modelo ?? atual.modelo),
    String(b.btu ?? atual.btu),
    String(b.ambiente ?? atual.ambiente),
    Number(b.quantidade ?? atual.quantidade),
    String(b.instalado_em ?? atual.instalado_em),
    String(b.ultima_limpeza ?? atual.ultima_limpeza),
    String(b.prox_limpeza ?? atual.prox_limpeza),
    String(b.prox_manutencao ?? atual.prox_manutencao),
    Number(b.intervalo_dias ?? atual.intervalo_dias),
    String(b.obs ?? atual.obs),
    b.ativo === undefined ? atual.ativo : b.ativo ? 1 : 0,
    atual.id,
    req.store.id
  );
  res.json({ ok: true });
});

admin.delete('/equipamentos/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM equipamentos WHERE id = ? AND store_id = ?').run(req.params.id, req.store.id);
  res.json({ ok: true });
});

/** Avisar o cliente no WhatsApp que a limpeza/manutenção está vencendo. */
admin.get('/equipamentos/:id/lembrete', requireAuth, (req, res) => {
  const e = db
    .prepare('SELECT e.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone FROM equipamentos e LEFT JOIN clientes c ON c.id = e.cliente_id WHERE e.id = ? AND e.store_id = ?')
    .get(req.params.id, req.store.id);
  if (!e) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const b = lojaBusiness(req);
  const nome = b.name || req.store.name;
  const link = `${(process.env.PUBLIC_URL || req.get('x-forwarded-host') ? `https://${req.get('x-forwarded-host') || req.get('host')}` : '').replace(/\/$/, '')}/l/${req.store.slug}`;
  const quando = e.prox_limpeza || e.prox_manutencao;
  const texto =
    `Olá, ${e.cliente_nome || 'tudo bem'}! Aqui é da ${nome} 😊\n\n` +
    `Passando para lembrar que já está na hora de fazer a limpeza/manutenção do seu ar condicionado` +
    `${e.marca || e.tipo ? ` (${[e.tipo, e.marca].filter(Boolean).join(' ')}${e.ambiente ? ` - ${e.ambiente}` : ''})` : ''}` +
    `${quando ? `, prevista para ${dataBR(quando)}` : ''}.\n\n` +
    `Quer que eu já agende um dia pra você? Pode escolher o melhor dia aqui: ${link}\n\n` +
    `Qualquer dúvida é só chamar!`;
  res.json({
    texto,
    whatsapp_url: `https://wa.me/${numeroWhats(e.cliente_telefone)}?text=${encodeURIComponent(texto)}`,
  });
});

/* ------------------------------------------------------------------ */
/* AGENDAMENTOS                                                        */
/* ------------------------------------------------------------------ */

admin.get('/agendamentos', requireAuth, (req, res) => {
  const { status, de, ate, cliente_id } = req.query;
  const where = ['a.store_id = ?'];
  const args = [req.store.id];
  if (status && status !== 'todos') {
    where.push(`a.status ${status === 'abertos' ? "IN ('solicitado','agendado','a_caminho')" : '= ?'}`);
    if (status !== 'abertos') args.push(status);
  }
  if (de) {
    where.push('a.data >= ?');
    args.push(de);
  }
  if (ate) {
    where.push('a.data <= ?');
    args.push(ate);
  }
  if (cliente_id) {
    where.push('a.cliente_id = ?');
    args.push(Number(cliente_id));
  }
  const lista = db.prepare(`${SQL_AGENDA} WHERE ${where.join(' AND ')} ORDER BY a.data DESC, a.id DESC LIMIT 400`).all(...args);
  res.json(lista);
});

function gravarAgendamento(storeId, b, origem) {
  const clienteId = Number(b.cliente_id || 0) || acharOuCriarCliente(storeId, {
    nome: b.cliente_nome || b.nome,
    telefone: b.cliente_telefone || b.telefone,
    email: b.email,
    endereco: b.endereco,
    bairro: b.bairro,
  });

  let equipId = Number(b.equipamento_id || 0);
  if (!equipId && (b.equip_tipo || b.equip_marca)) {
    const info = db
      .prepare(
        `INSERT INTO equipamentos (store_id, cliente_id, tipo, marca, modelo, btu, ambiente, quantidade, instalado_em, intervalo_dias)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        storeId,
        clienteId,
        String(b.equip_tipo || 'Split'),
        String(b.equip_marca || ''),
        String(b.equip_modelo || ''),
        String(b.equip_btu || ''),
        String(b.equip_ambiente || ''),
        Number(b.equip_quantidade || 1),
        String(b.equip_instalado_em || ''),
        Number(b.equip_intervalo_dias || 180)
      );
    equipId = Number(info.lastInsertRowid);
  }

  let servicoNome = String(b.servico_nome || '');
  let valor = Number(b.valor_cents || 0);
  const servicoId = Number(b.servico_id || 0);
  if (servicoId) {
    const sv = db.prepare('SELECT * FROM servicos WHERE id = ? AND store_id = ?').get(servicoId, storeId);
    if (sv) {
      servicoNome = servicoNome || sv.nome;
      if (!valor) valor = Number(sv.preco_cents || 0);
    }
  }

  const info = db
    .prepare(
      `INSERT INTO agendamentos
        (store_id, cliente_id, equipamento_id, servico_id, servico_nome, data, periodo, hora, status,
         valor_cents, endereco, obs_cliente, obs_interno, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      storeId,
      clienteId,
      equipId,
      servicoId,
      servicoNome || 'Serviço',
      String(b.data || ''),
      String(b.periodo || ''),
      String(b.hora || ''),
      STATUS.includes(b.status) ? b.status : 'solicitado',
      valor,
      String(b.endereco || ''),
      String(b.obs_cliente || ''),
      String(b.obs_interno || ''),
      origem
    );
  return { id: Number(info.lastInsertRowid), cliente_id: clienteId, equipamento_id: equipId, servico_nome: servicoNome };
}

admin.post('/agendamentos', requireAuth, (req, res) => {
  const r = gravarAgendamento(req.store.id, req.body || {}, 'painel');
  res.json({ ok: true, ...r });
});

admin.put('/agendamentos/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = db.prepare('SELECT * FROM agendamentos WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  db.prepare(
    `UPDATE agendamentos SET cliente_id = ?, equipamento_id = ?, servico_id = ?, servico_nome = ?, data = ?, periodo = ?,
       hora = ?, status = ?, valor_cents = ?, endereco = ?, obs_cliente = ?, obs_interno = ?, atualizado_em = datetime('now')
     WHERE id = ? AND store_id = ?`
  ).run(
    Number(b.cliente_id ?? atual.cliente_id),
    Number(b.equipamento_id ?? atual.equipamento_id),
    Number(b.servico_id ?? atual.servico_id),
    String(b.servico_nome ?? atual.servico_nome),
    String(b.data ?? atual.data),
    String(b.periodo ?? atual.periodo),
    String(b.hora ?? atual.hora),
    STATUS.includes(b.status) ? b.status : atual.status,
    Number(b.valor_cents ?? atual.valor_cents),
    String(b.endereco ?? atual.endereco),
    String(b.obs_cliente ?? atual.obs_cliente),
    String(b.obs_interno ?? atual.obs_interno),
    atual.id,
    req.store.id
  );
  res.json({ ok: true });
});

/**
 * Muda o status. Ao marcar como CONCLUÍDO, o equipamento ganha a data da
 * próxima limpeza/manutenção automaticamente (é o que gera o aviso futuro).
 */
admin.patch('/agendamentos/:id/status', requireAuth, (req, res) => {
  const novo = String((req.body || {}).status || '');
  if (!STATUS.includes(novo)) return res.status(400).json({ error: 'Status inválido.' });
  const ag = db.prepare('SELECT * FROM agendamentos WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!ag) return res.status(404).json({ error: 'Agendamento não encontrado.' });

  db.prepare("UPDATE agendamentos SET status = ?, atualizado_em = datetime('now') WHERE id = ? AND store_id = ?").run(
    novo,
    ag.id,
    req.store.id
  );

  let proxima = '';
  if (novo === 'concluido' && ag.equipamento_id) {
    const eq = db.prepare('SELECT * FROM equipamentos WHERE id = ? AND store_id = ?').get(ag.equipamento_id, req.store.id);
    if (eq) {
      const feito = ag.data || todayISO();
      const intervalo = Number(eq.intervalo_dias || 180);
      const nova = addDays(feito, intervalo);
      const nome = String(ag.servico_nome || '').toLowerCase();
      if (nome.includes('limpeza') || nome.includes('higieniz')) {
        db.prepare("UPDATE equipamentos SET ultima_limpeza = ?, prox_limpeza = ? WHERE id = ?").run(feito, nova, eq.id);
        proxima = nova;
      } else if (nome.includes('manuten') || nome.includes('revis')) {
        db.prepare('UPDATE equipamentos SET prox_manutencao = ? WHERE id = ?').run(nova, eq.id);
        proxima = nova;
      } else if (!eq.prox_limpeza) {
        db.prepare('UPDATE equipamentos SET prox_limpeza = ? WHERE id = ?').run(nova, eq.id);
        proxima = nova;
      }
    }
  }
  res.json({ ok: true, proxima_limpeza: proxima });
});

/** Configuração da agenda da loja. */
admin.get('/agenda/config', requireAuth, (req, res) => {
  res.json(agendaConfig(req.store.id));
});

admin.put('/agenda/config', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = agendaConfig(req.store.id);
  const periodos = Array.isArray(b.periodos) && b.periodos.length ? b.periodos.map((p) => String(p).trim()).filter(Boolean).slice(0, 6) : atual.periodos;
  const vagas = Math.max(1, Math.min(20, Number(b.vagas) || atual.vagas));
  const dias = Array.isArray(b.dias) && b.dias.length ? b.dias.map(Number).filter((d) => d >= 0 && d <= 6) : atual.dias;
  const { setSetting } = require('./db');
  setSetting(req.store.id, 'agenda', { periodos, vagas, dias });
  res.json({ ok: true, ...agendaConfig(req.store.id) });
});

/** Disponibilidade vista pelo painel (com quantos já estão agendados). */
admin.get('/agenda/disponibilidade', requireAuth, (req, res) => {
  const data = String(req.query.data || todayISO()).slice(0, 10);
  const dia = situacaoDia(req.store.id, data);
  res.json({ ...dia, sugestoes: proximosLivres(req.store.id, data, 6) });
});

/** Mensagem para o cliente quando o horário pedido já está tomado. */
admin.get('/agendamentos/:id/whatsapp-remarcar', requireAuth, (req, res) => {
  const a = db
    .prepare(`${SQL_AGENDA} WHERE a.id = ? AND a.store_id = ?`)
    .get(req.params.id, req.store.id);
  if (!a) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  const nome = nomeLoja(req);
  const livres = proximosLivres(req.store.id, todayISO(), Number(req.query.limite) || 5)
    .filter((h) => !(h.data === a.data && h.periodo === a.periodo))
    .slice(0, 4);
  const pedido = a.data ? `${dataBR(a.data)}${a.periodo ? ` (${a.periodo})` : ''}` : 'o dia que você pediu';
  const texto =
    `Olá, ${a.cliente_nome || ''}! Aqui é da equipe ${nome}. 😊\n\n` +
    `Sobre o seu agendamento de *${a.servico_nome || 'serviço'}* para ${pedido}: ` +
    `esse horário já está ocupado com outro atendimento.\n\n` +
    (livres.length
      ? `Tenho estes horários livres:\n${listaHorarios(livres)}\n\nQual fica melhor para você?`
      : `Me diga o melhor dia e período para você que eu encaixo.`);
  res.json({
    texto,
    livres,
    whatsapp_url: a.cliente_telefone
      ? `https://wa.me/${numeroWhats(a.cliente_telefone)}?text=${encodeURIComponent(texto)}`
      : '',
  });
});

admin.delete('/agendamentos/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM agendamentos WHERE id = ? AND store_id = ?').run(req.params.id, req.store.id);
  res.json({ ok: true });
});

/** Mensagem de confirmação/lembrete para o cliente sobre um agendamento. */
admin.get('/agendamentos/:id/whatsapp', requireAuth, (req, res) => {
  const a = db.prepare(`${SQL_AGENDA} WHERE a.id = ? AND a.store_id = ?`).get(req.params.id, req.store.id);
  if (!a) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  const b = lojaBusiness(req);
  const nome = b.name || req.store.name;
  const equipe = a.equip_tipo ? ` do seu ${[a.equip_tipo, a.equip_marca].filter(Boolean).join(' ')}` : '';
  let texto;
  if (a.status === 'concluido') {
    texto =
      `Olá, ${a.cliente_nome || ''}! Serviço concluído ✅\n\n` +
      `Serviço: ${a.servico_nome}${equipe}\nData: ${dataBR(a.data)}\n` +
      `${a.valor_cents ? `Valor: ${brl(a.valor_cents)}\n` : ''}\n` +
      `Ficou tudo certo? Qualquer coisa é só chamar. Obrigado pela confiança! — ${nome}`;
  } else {
    texto =
      `Olá, ${a.cliente_nome || ''}! Confirmando seu agendamento 😊\n\n` +
      `Serviço: ${a.servico_nome}${equipe}\n` +
      `Data: ${a.data ? `${dataBR(a.data)} (${diaSemana(a.data)})` : 'a combinar'}` +
      `${a.periodo ? ` — ${a.periodo}` : ''}\n` +
      `${a.endereco ? `Endereço: ${a.endereco}\n` : ''}` +
      `${a.valor_cents ? `Valor: ${brl(a.valor_cents)}\n` : ''}\n` +
      `Se precisar remarcar, é só responder aqui. — ${nome}`;
  }
  res.json({ texto, whatsapp_url: `https://wa.me/${numeroWhats(a.cliente_telefone)}?text=${encodeURIComponent(texto)}` });
});

/* ------------------------------------------------------------------ */
/* PÚBLICO — página da empresa (agendamento pelo cliente)              */
/* ------------------------------------------------------------------ */

/* Arte do logotipo sem o fundo claro (marca d'água do topo) */
publico.get('/marca-dagua', async (req, res) => {
  try {
    const { limparMarca, baixarImagem } = require('./marca');
    const { resolveUploadDir } = require('./paths');
    const b = getSetting(req.store.id, 'business', {}) || {};
    const fonte = b.watermark_url || b.logo_url || '/img/hb-logo.jpg';
    const origem = `${req.protocol}://${req.get('host')}`;
    const buffer = await baixarImagem(fonte, origem, resolveUploadDir());
    const r = await limparMarca(buffer);
    res.set('Cache-Control', 'public, max-age=3600');
    if (!r.png) return res.redirect(302, /^https?:/i.test(fonte) ? fonte : origem + fonte);
    res.type('png').send(r.png);
  } catch (e) {
    console.error('[marca-dagua/servicos]', e.message);
    res.status(404).end();
  }
});

publico.get('/servicos', (req, res) => {
  const b = lojaBusiness(req);
  const lista = db
    .prepare('SELECT id, nome, descricao, categoria, preco_cents, tipo_preco, duracao_min FROM servicos WHERE store_id = ? AND ativo = 1 ORDER BY ordem, id')
    .all(req.store.id);
  res.json({
    negocio: {
      nome: b.name || req.store.name,
      tagline: b.tagline || '',
      about: b.about || '',
      whatsapp: b.whatsapp || '',
      logo_url: b.logo_url || '',
      watermark_url: b.watermark_url || '',
      theme_color: b.theme_color || '#14386b',
      accent_color: b.accent_color || '#f5a623',
      address: b.address || '',
      instagram: b.instagram || '',
    },
    servicos: lista.map((s) => ({ ...s, preco: s.tipo_preco === 'sob_orcamento' ? 'Sob orçamento' : `${s.tipo_preco === 'a_partir' ? 'a partir de ' : ''}${brl(s.preco_cents)}` })),
  });
});

/** Quais períodos estão livres num dia (o cliente vê antes de escolher). */
publico.get('/disponibilidade', (req, res) => {
  const data = String(req.query.data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Informe a data.' });
  const dia = situacaoDia(req.store.id, data);
  const livres = proximosLivres(req.store.id, data, 4);
  res.json({
    data: dia.data,
    aberto: dia.aberto,
    vagas: dia.vagas,
    periodos: dia.periodos.map((p) => ({ nome: p.nome, livre: p.livre })),
    sugestoes: livres.map((h) => ({ data: h.data, periodo: h.periodo, rotulo: `${dataBR(h.data)} (${diaSemana(h.data)}) — ${h.periodo}` })),
  });
});

publico.post('/agendar', (req, res) => {
  const b = req.body || {};
  if (!String(b.nome || '').trim()) return res.status(400).json({ error: 'Informe seu nome.' });
  if (soDigitos(b.telefone).length < 10) return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
  if (!String(b.endereco || '').trim()) return res.status(400).json({ error: 'Informe o endereço do serviço.' });

  // Não deixa dois clientes caírem no mesmo período já tomado.
  if (b.data) {
    const dia = situacaoDia(req.store.id, String(b.data).slice(0, 10));
    if (!dia.aberto) {
      return res.status(409).json({ error: 'Nesse dia não tem atendimento. Escolha outra data.', livres: proximosLivres(req.store.id, todayISO(), 4) });
    }
    const pedido = dia.periodos.find((p) => p.nome === b.periodo);
    if (pedido && !pedido.livre) {
      const livres = proximosLivres(req.store.id, todayISO(), 4);
      return res.status(409).json({
        error: `Esse horário (${b.periodo}) já está ocupado. Tenho vaga nestes:`,
        livres,
      });
    }
  }

  const registro = gravarAgendamento(req.store.id, { ...b, status: 'solicitado' }, 'site');

  const business = lojaBusiness(req);
  const nomeEmpresa = business.name || req.store.name;
  const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(registro.servico_id);
  const texto =
    `*Nova solicitação de agendamento* 🗓️\n\n` +
    `Cliente: ${b.nome}\nWhatsApp: ${b.telefone}\n` +
    `Serviço: ${registro.servico_nome}${servico && servico.tipo_preco !== 'sob_orcamento' ? ` (${brl(servico.preco_cents)})` : ''}\n` +
    `Data preferida: ${b.data ? `${dataBR(b.data)} (${diaSemana(b.data)})` : 'a combinar'}${b.periodo ? ` — ${b.periodo}` : ''}\n` +
    `Endereço: ${b.endereco}${b.bairro ? ` - ${b.bairro}` : ''}\n` +
    `Equipamento: ${[b.equip_tipo, b.equip_marca, b.equip_ambiente].filter(Boolean).join(' ') || 'não informado'}\n` +
    `${b.obs_cliente ? `Observação: ${b.obs_cliente}\n` : ''}\n` +
    `Recebido pelo site da ${nomeEmpresa}. Já entra no painel como *solicitado*.`;

  res.json({
    ok: true,
    id: registro.id,
    texto,
    whatsapp_url: `https://wa.me/${numeroWhats(business.whatsapp)}?text=${encodeURIComponent(texto)}`,
  });
});

/** O cliente acompanha os pedidos pelo telefone. */
publico.get('/meus-agendamentos', (req, res) => {
  const tel = soDigitos(req.query.telefone).slice(-11);
  if (tel.length < 10) return res.status(400).json({ error: 'Informe o WhatsApp usado no agendamento.' });
  const lista = db
    .prepare(
      `SELECT a.id, a.servico_nome, a.data, a.periodo, a.status, a.valor_cents
         FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id
        WHERE a.store_id = ?
          AND replace(replace(replace(replace(c.telefone,'(',''),')',''),'-',''),' ','') LIKE ?
        ORDER BY a.data DESC, a.id DESC LIMIT 30`
    )
    .all(req.store.id, `%${tel}`);
  res.json(lista.map((a) => ({ ...a, status_label: STATUS_LABEL[a.status] || a.status, data_br: dataBR(a.data) })));
});

module.exports = { admin, publico, STATUS_LABEL };
