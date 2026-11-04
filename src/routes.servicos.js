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
const { db, getSetting, setSetting, getStoreById } = require('./db');
const { requireAuth, requireDono } = require('./auth');
const { origemDaSessao, sessaoDe, registrarEvento } = require('./rastreio');

const admin = express.Router();
const publico = express.Router();

/**
 * PERMISSÕES DA EQUIPE
 * O dono (senha da loja) vê tudo. O funcionário (barbeiro com senha própria)
 * entra só na agenda e nos clientes — nunca em dinheiro, preços ou configurações.
 */
const ROTAS_ABERTAS = new Set(['/login', '/logout', '/session']);
admin.use((req, res, next) => {
  if (ROTAS_ABERTAS.has(req.path)) return next();
  return requireAuth(req, res, () => {
    if (req.papel !== 'funcionario') return next();
    const podeVer = /^\/(painel|agendamentos|clientes|agenda|disponibilidade|dias|profissionais|servicos|equipamentos|por-profissional)(\/|$)/.test(req.path);
    const podeEscrever = /^\/(agendamentos|clientes)(\/|$)/.test(req.path) || (req.store.slug === 'imperio-barber' && /^\/agenda\/bloqueios(?:\/\d+)?$/.test(req.path) && ['POST','DELETE'].includes(req.method));
    if (podeVer && (req.method === 'GET' || podeEscrever)) return next();
    return res.status(403).json({ error: 'Esse setor é só do dono da barbearia.' });
  });
});

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
  const hhmm = (v, padrao) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : padrao);
  // Horário real de funcionamento: é daqui que saem os horários do site.
  const abre = hhmm(c.abre, '09:00');
  const fecha = hhmm(c.fecha, '19:00');
  // De quanto em quanto tempo o sistema oferece um horário novo (a duração
  // do serviço decide quanto tempo ele ocupa na agenda).
  const intervalo = Math.max(10, Math.min(120, Number(c.intervalo) || 30));
  return { periodos, vagas, dias, abre, fecha, intervalo };
}

/* ---------------------- horários reais (por duração) ---------------------- */
function minutosDeHHMM(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}
function hhmmDeMinutos(min) {
  const m = Math.max(0, Math.round(min));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function periodoDoHorario(hora) {
  const m = minutosDeHHMM(hora);
  if (m < 0) return '';
  if (m < 12 * 60) return 'Manhã';
  if (m < 18 * 60) return 'Tarde';
  return 'Noite';
}

/**
 * Agenda do dia em HORÁRIOS de verdade.
 * - começa no horário em que a loja abre e vai até o fechamento
 * - cada horário ocupa o tempo do serviço escolhido (ex.: corte de 30 min)
 * - se já tem cliente naquele intervalo, o horário sai ocupado (vermelho)
 * - horário que já passou (quando o dia é hoje) também não aparece livre
 */
function horariosDoDia(storeId, data, profissionalId, duracaoMin, ignorarId, detalhado) {
  const cfg = agendaConfig(storeId);
  const dow = new Date(`${data}T12:00:00`).getDay();
  if (!cfg.dias.includes(dow)) {
    return { aberto: false, horarios: [], abre: cfg.abre, fecha: cfg.fecha, intervalo: cfg.intervalo, duracao: cfg.intervalo };
  }
  const dura = Math.max(10, Math.min(480, Number(duracaoMin) || cfg.intervalo));
  const abertura = minutosDeHHMM(cfg.abre);
  const fechamento = minutosDeHHMM(cfg.fecha);
  const linhas = db
    .prepare(
      `SELECT a.id, a.cliente_id, a.servico_id, a.hora, a.periodo, a.profissional_id, a.servico_nome, a.status, a.valor_cents,
              c.nome AS cliente_nome, c.telefone AS cliente_telefone, s.duracao_min AS servico_dura
         FROM agendamentos a
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.store_id = ? AND a.data = ?
          AND a.status IN (${STATUS_QUE_OCUPAM.map(() => '?').join(',')})`
    )
    .all(storeId, data, ...STATUS_QUE_OCUPAM);

  const doBarbeiro = linhas.filter(
    (l) => !profissionalId || !Number(l.profissional_id) || Number(l.profissional_id) === Number(profissionalId)
  );
  const ocupados = doBarbeiro
    .filter((l) => Number(l.id) !== Number(ignorarId || 0))
    .map((l) => {
      let ini = minutosDeHHMM(l.hora);
      let dur = Math.max(10, Number(l.servico_dura) || cfg.intervalo);
      if (ini < 0) {
        // Agendamento antigo, feito antes da agenda por horário (só tinha
        // "Manhã/Tarde/Noite"). Não pode travar o período inteiro: reserva o
        // primeiro horário daquele período e o painel mostra "a definir".
        const p = String(l.periodo || '');
        ini = p === 'Tarde' ? Math.max(abertura, 12 * 60) : p === 'Noite' ? Math.max(abertura, 18 * 60) : abertura;
        dur = Math.max(10, Number(l.servico_dura) || cfg.intervalo);
      }
      const nome = String(l.cliente_nome || '').trim();
      return {
        id: Number(l.id),
        cliente_id: Number(l.cliente_id || 0),
        servico_id: Number(l.servico_id || 0),
        ini,
        fim: ini + dur,
        hora: l.hora || (ini >= 0 ? hhmmDeMinutos(ini) : ''),
        cliente: nome ? nome.split(/\s+/)[0] : '',
        cliente_nome: nome,
        cliente_telefone: String(l.cliente_telefone || ''),
        servico: l.servico_nome || '',
        valor_cents: Number(l.valor_cents || 0),
        status: l.status || '',
      };
    })
    .filter((o) => o.ini >= 0);

  const agora = new Date();
  const ehImperio = (getStoreById(storeId) || {}).slug === 'imperio-barber';
  const partes = ehImperio ? Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(agora).map((p) => [p.type, p.value])) : null;
  const hojeISO = partes ? `${partes.year}-${partes.month}-${partes.day}` : todayISO();
  const agoraMin = data === hojeISO ? (partes ? Number(partes.hour) * 60 + Number(partes.minute) : agora.getHours() * 60 + agora.getMinutes()) : -1;
  // Somente na Império, a disponibilidade considera os dias e o turno já
  // cadastrados do profissional. Não altera sua configuração nem ativa ninguém.
  const prof = ehImperio && profissionalId ? profissionalDa(storeId, profissionalId) : null;
  const diasProf = prof ? String(prof.dias || '1,2,3,4,5,6').split(',').map(Number) : [];
  const profAbre = prof && /^([01]\d|2[0-3]):[0-5]\d$/.test(prof.hora_ini || '') ? minutosDeHHMM(prof.hora_ini) : abertura;
  const profFecha = prof && /^([01]\d|2[0-3]):[0-5]\d$/.test(prof.hora_fim || '') ? minutosDeHHMM(prof.hora_fim) : fechamento;

  const bloqueios = ehImperio ? db.prepare('SELECT id, inicio, fim FROM imperio_bloqueios WHERE store_id = ? AND data = ? AND (? = 0 OR profissional_id = ?)').all(storeId, data, Number(profissionalId || 0), Number(profissionalId || 0)) : [];
  const horarios = [];
  for (let m = abertura; m + dura <= fechamento; m += cfg.intervalo) {
    const fim = m + dura;
    const choque = ocupados.find((o) => m < o.fim && fim > o.ini);
    const bloqueado = bloqueios.some((b) => m < minutosDeHHMM(b.fim) && fim > minutosDeHHMM(b.inicio));
    const passou = (ehImperio && data < hojeISO) || (agoraMin >= 0 && m <= agoraMin + 9);
    const foraDoTurno = ehImperio && profissionalId && (!prof || !diasProf.includes(dow) || m < profAbre || fim > profFecha);
    horarios.push({
      hora: hhmmDeMinutos(m),
      fim: hhmmDeMinutos(fim),
      periodo: periodoDoHorario(hhmmDeMinutos(m)),
      livre: !choque && !bloqueado && !passou && !foraDoTurno,
      ...(detalhado && bloqueado && !choque ? { bloqueado: true } : {}),
      /* O site do cliente NÃO recebe o nome de quem já agendou: o horário
         aparece apenas como "já agendado". O nome completo só vem na chamada
         do painel (detalhado=1), que é área privada da loja. */
      ocupado_por: choque && detalhado ? choque.cliente : choque ? 'Já agendado' : '',
      servico_ocupando: choque && detalhado ? choque.servico : '',
      passou,
      // dados completos só para o painel (o site do cliente vê só o primeiro nome)
      ...(detalhado && choque
        ? {
            agendamento_id: choque.id,
            cliente_nome: choque.cliente_nome,
            cliente_telefone: choque.cliente_telefone,
            servico_id_ocupando: choque.servico,
            ...(ehImperio ? { valor_cents_ocupando: choque.valor_cents, cliente_id_ocupando: choque.cliente_id, servico_ref_ocupando: choque.servico_id } : {}),
            status_ocupando: choque.status,
          }
        : {}),
    });
  }
  return {
    aberto: true,
    abre: cfg.abre,
    fecha: cfg.fecha,
    intervalo: cfg.intervalo,
    duracao: dura,
    horarios,
  };
}

/** ---------------------------------- promoções ---------------------------------- */
/**
 * Campanha de promoção da loja (Black Friday, combo do mês, terça do corte…).
 * Guardada nas configurações da loja — cada loja monta a sua pelo painel.
 */
function normalizarPromocoes(bruto) {
  const lista = Array.isArray(bruto) ? bruto : [];
  const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
  return lista
    .slice(0, 20)
    .map((p, i) => ({
      id: String((p && p.id) || `p${i + 1}-${Date.now().toString(36)}`),
      nome: String((p && p.nome) || '').trim().slice(0, 40),
      etiqueta: String((p && p.etiqueta) || '').trim().slice(0, 24),
      texto: String((p && p.texto) || '').trim().slice(0, 90),
      desconto: Math.max(0, Math.min(90, Math.round(Number((p && p.desconto) || 0)))),
      servicos: (Array.isArray(p && p.servicos) ? p.servicos : []).map(Number).filter(Boolean).slice(0, 80),
      de: iso(p && p.de),
      ate: iso(p && p.ate),
      ativo: !(p && p.ativo === false),
    }))
    .filter((p) => p.nome);
}

function promocoesDa(storeId) {
  return normalizarPromocoes(getSetting(storeId, 'promocoes', []));
}

/** A campanha que vale HOJE (a de maior desconto entre as vigentes). */
function promocaoDeHoje(storeId) {
  const hoje = todayISO();
  const vigentes = promocoesDa(storeId)
    .filter((p) => p.ativo && p.desconto > 0)
    .filter((p) => (!p.de || hoje >= p.de) && (!p.ate || hoje <= p.ate))
    .sort((a, b) => b.desconto - a.desconto);
  return vigentes[0] || null;
}

/** Duração de um serviço da loja (em minutos). */
function duracaoDoServico(storeId, servicoId) {
  const n = Number(servicoId || 0);
  if (!n) return 0;
  const l = db.prepare('SELECT duracao_min FROM servicos WHERE id = ? AND store_id = ?').get(n, storeId);
  return l ? Number(l.duracao_min) || 0 : 0;
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

/* ------------------------------------------------------------------ */
/* EQUIPE (barbeiros) — só existe na loja que cadastrar alguém        */
/* ------------------------------------------------------------------ */

/** Equipe da loja. Loja sem equipe = fluxo antigo, sem nenhuma mudança. */
function listaProfissionais(storeId, somenteAtivos = true) {
  const where = somenteAtivos ? 'AND ativo = 1' : '';
  return db
    .prepare(`SELECT * FROM profissionais WHERE store_id = ? ${where} ORDER BY ordem, id`)
    .all(storeId);
}

const temEquipe = (storeId) => listaProfissionais(storeId).length > 0;

function profissionalDa(storeId, id) {
  const n = Number(id || 0);
  if (!n) return null;
  return db.prepare('SELECT * FROM profissionais WHERE id = ? AND store_id = ? AND ativo = 1').get(n, storeId) || null;
}

/** O barbeiro já tem cliente naquele dia/período? (1 atendimento por período) */
function profissionalOcupado(storeId, data, periodo, profissionalId, ignorarId = 0) {
  if (!profissionalId) return false;
  const linhas = db
    .prepare(
      `SELECT id FROM agendamentos
        WHERE store_id = ? AND data = ? AND periodo = ? AND profissional_id = ?
          AND status IN (${STATUS_QUE_OCUPAM.map(() => '?').join(',')})`
    )
    .all(storeId, data, periodo, profissionalId, ...STATUS_QUE_OCUPAM);
  return linhas.some((l) => Number(l.id) !== Number(ignorarId || 0));
}

/** Primeiro nome do cliente que ocupa o horário do barbeiro (marca em vermelho). */
function quemOcupa(storeId, data, periodo, profissionalId) {
  const l = db
    .prepare(
      `SELECT c.nome AS nome FROM agendamentos a
         LEFT JOIN clientes c ON c.id = a.cliente_id
        WHERE a.store_id = ? AND a.data = ? AND a.periodo = ? AND a.profissional_id = ?
          AND a.status IN (${STATUS_QUE_OCUPAM.map(() => '?').join(',')})
        ORDER BY a.id DESC LIMIT 1`
    )
    .get(storeId, data, periodo, profissionalId, ...STATUS_QUE_OCUPAM);
  const nome = String((l && l.nome) || '').trim();
  return nome ? nome.split(/\s+/)[0] : '';
}

/** Quem está livre naquele dia/período. */
function profissionaisLivres(storeId, data, periodo, ignorarId = 0) {
  return listaProfissionais(storeId).filter((p) => !profissionalOcupado(storeId, data, periodo, p.id, ignorarId));
}

/**
 * Situação do dia considerando a equipe:
 * cada barbeiro atende 1 cliente por período; o período fica livre
 * enquanto pelo menos um barbeiro estiver livre.
 */
function situacaoDiaEquipe(storeId, data, profissionalId = 0) {
  const cfg = agendaConfig(storeId);
  const dow = new Date(`${data}T12:00:00`).getDay();
  const aberto = cfg.dias.includes(dow);
  const equipe = listaProfissionais(storeId);
  const alvo = profissionalId ? equipe.filter((p) => Number(p.id) === Number(profissionalId)) : equipe;
  const periodos = cfg.periodos.map((nome) => {
    const livres = alvo.filter((p) => !profissionalOcupado(storeId, data, nome, p.id));
    const ocupadosPor = alvo
      .filter((p) => !livres.some((l) => l.id === p.id))
      .map((p) => ({ barbeiro: p.nome, cliente: quemOcupa(storeId, data, nome, p.id) }));
    return {
      nome,
      livre: aberto && livres.length > 0,
      livres: livres.map((p) => ({ id: p.id, nome: p.nome })),
      ocupados: alvo.length - livres.length,
      ocupados_por: ocupadosPor,
      vagas: alvo.length,
    };
  });
  return { data, aberto, vagas: alvo.length, periodos, equipe: temEquipe(storeId) };
}

/** Próximo horário livre de um barbeiro (para mostrar no card da equipe). */
function proximaVaga(storeId, profissionalId) {
  const cfg = agendaConfig(storeId);
  if (!cfg.dias.length) return { proxima_vaga: null, proxima_vaga_rotulo: '' };
  let dia = todayISO();
  for (let i = 0; i < 45; i += 1) {
    const dow = new Date(`${dia}T12:00:00`).getDay();
    if (cfg.dias.includes(dow)) {
      // mostra o primeiro HORÁRIO real livre (ex.: "Hoje · 09:30")
      const grade = horariosDoDia(storeId, dia, profissionalId, 0);
      const livre = grade.horarios.filter((h) => h.livre)[0];
      if (livre) {
        const ehHoje = dia === todayISO();
        const ehAmanha = dia === addDays(todayISO(), 1);
        const quando = ehHoje ? 'Hoje' : ehAmanha ? 'Amanhã' : dataBR(dia).slice(0, 5);
        return {
          proxima_vaga: { data: dia, periodo: livre.periodo, hora: livre.hora },
          proxima_vaga_rotulo: `${quando} · ${livre.hora}`,
          proxima_vaga_hoje: ehHoje,
        };
      }
    }
    dia = addDays(dia, 1);
  }
  return { proxima_vaga: null, proxima_vaga_rotulo: 'Sem vaga nos próximos dias' };
}

/** Nome da forma de pagamento escolhida pelo cliente. */
function rotuloPagamento(p) {
  return (
    {
      local: 'na barbearia, no dia do atendimento',
      pix: 'Pix antecipado (enviar comprovante no WhatsApp)',
      cartao: 'cartão na maquininha, no atendimento',
    }[String(p || '')] || 'a combinar'
  );
}

/** Chave Pix cadastrada pela loja (painel → Pagamentos). */
function chavePix(storeId) {
  const lista = getSetting(storeId, 'payments', []) || [];
  const pix = lista.find((f) => f && f.id === 'pix' && f.active);
  return (pix && (pix.key || '')) || '';
}

const listaHorarios = (lista) =>
  lista
    .map((h) => `• ${dataBR(h.data)} (${diaSemana(h.data)}) — ${h.periodo}`)
    .join('\n');

// Clientes antigos retirados da listagem da Império continuam vinculados ao histórico.
function clientesOcultosImperio(storeId) {
  const loja = getStoreById(storeId);
  if (!loja || loja.slug !== 'imperio-barber') return [];
  const ids = getSetting(storeId, 'imperio_clientes_ocultos', []);
  return Array.isArray(ids) ? [...new Set(ids.map(Number).filter((x) => Number.isSafeInteger(x) && x > 0))] : [];
}
function quantidadeClientesVisiveis(storeId) {
  const ids = clientesOcultosImperio(storeId);
  const filtro = ids.length ? ` AND id NOT IN (${ids.map(() => '?').join(',')})` : '';
  return Number((db.prepare('SELECT COUNT(*) n FROM clientes WHERE store_id = ?' + filtro).get(storeId, ...ids) || {}).n || 0);
}

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
      const ocultos = clientesOcultosImperio(storeId);
      if (ocultos.includes(Number(achado.id))) setSetting(storeId, 'imperio_clientes_ocultos', ocultos.filter((id) => id !== Number(achado.id)));
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
         (SELECT nome FROM profissionais WHERE id = a.profissional_id) AS profissional_nome,
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
  const semDinheiro = req.papel === 'funcionario';
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

  const totalClientes = quantidadeClientesVisiveis(storeId);
  const totalEquip = db.prepare('SELECT COUNT(*) n FROM equipamentos WHERE store_id = ? AND ativo = 1').get(storeId).n;
  const mesRef = hoje.slice(0, 7);
  const mesValor = db
    .prepare(`SELECT COALESCE(SUM(valor_cents),0) v FROM agendamentos WHERE store_id = ? AND status = 'concluido' AND data LIKE ?`)
    .get(storeId, `${mesRef}%`).v;
  const concluidosMes = db
    .prepare(`SELECT COUNT(*) n FROM agendamentos WHERE store_id = ? AND status = 'concluido' AND data LIKE ?`)
    .get(storeId, `${mesRef}%`).n;

  // Vendas por período (dia / semana / mês): serviço concluído = venda feita
  const vendasDe = (de, ate) => {
    const r = db
      .prepare(
        `SELECT COUNT(*) n, COALESCE(SUM(valor_cents),0) v FROM agendamentos
          WHERE store_id = ? AND status = 'concluido' AND data >= ? AND data <= ?`
      )
      .get(storeId, de, ate);
    return { concluidos: Number(r.n) || 0, valor_cents: Number(r.v) || 0 };
  };
  const inicioSemana = addDays(hoje, -6);
  const inicioMes = `${mesRef}-01`;
  const vendas = {
    dia: vendasDe(hoje, hoje),
    semana: vendasDe(inicioSemana, hoje),
    mes: vendasDe(inicioMes, hoje),
    agendados: db
      .prepare(
        `SELECT COUNT(*) n FROM agendamentos WHERE store_id = ? AND status IN ('solicitado','agendado','a_caminho') AND data >= ?`
      )
      .get(storeId, hoje).n,
  };

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
      concluidos_mes: semDinheiro ? 0 : concluidosMes,
      faturado_mes_cents: semDinheiro ? 0 : mesValor,
      faturado_mes: semDinheiro ? '' : brl(mesValor),
      alertas: vencendo.length + atrasados.length + novos.length,
    },
    // funcionário não vê faturamento
    vendas: semDinheiro ? null : vendas,
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

/* --------------------------- EQUIPE (painel) --------------------------- */

admin.get('/profissionais', requireAuth, (req, res) => {
  const lista = listaProfissionais(req.store.id, false).map((p) => ({
    ...p,
    atendimentos: Number(
      (db.prepare(`SELECT COUNT(*) AS n FROM agendamentos WHERE store_id = ? AND profissional_id = ? AND status = 'concluido'`).get(req.store.id, p.id) || {}).n || 0
    ),
  }));
  res.json({ profissionais: lista, tem_equipe: lista.length > 0 });
});

function gravarProfissional(req, id) {
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  if (!nome) return { erro: 'Informe o nome.' };
  const dados = [
    nome,
    String(b.telefone || '').replace(/[^0-9]/g, '').slice(0, 13),
    String(b.apelido || '').trim(),
    String(b.foto_url || ''),
    String(b.bio || ''),
    Array.isArray(b.servicos) ? b.servicos.join(',') : String(b.servicos || ''),
    b.ativo === false || b.ativo === 0 ? 0 : 1,
    Number(b.ordem || 0),
    Math.max(0, Math.min(100, Number(b.comissao_pct || 0))),
    /^\d{2}:\d{2}$/.test(b.hora_ini || '') ? b.hora_ini : '',
    /^\d{2}:\d{2}$/.test(b.hora_fim || '') ? b.hora_fim : '',
    String(b.dias || '1,2,3,4,5,6')
      .split(',')
      .map((d) => Number(d))
      .filter((d) => d >= 0 && d <= 6)
      .join(',') || '1,2,3,4,5,6',
  ];
  if (id) {
    db.prepare(
      `UPDATE profissionais SET nome = ?, telefone = ?, apelido = ?, foto_url = ?, bio = ?, servicos = ?, ativo = ?, ordem = ?,
              comissao_pct = ?, hora_ini = ?, hora_fim = ?, dias = ?
        WHERE id = ? AND store_id = ?`
    ).run(...dados, id, req.store.id);
    return { id };
  }
  const info = db
    .prepare(
      `INSERT INTO profissionais (store_id, nome, telefone, apelido, foto_url, bio, servicos, ativo, ordem,
              comissao_pct, hora_ini, hora_fim, dias)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.store.id, ...dados);
  return { id: Number(info.lastInsertRowid) };
}

admin.post('/profissionais', requireAuth, (req, res) => {
  const r = gravarProfissional(req, 0);
  if (r.erro) return res.status(400).json({ error: r.erro });
  res.status(201).json({ ok: true, id: r.id });
});

// A alternância de status da Império altera somente esse campo: dados e agenda permanecem intactos.
admin.patch('/imperio-profissionais/:id/status', requireAuth, requireDono, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({ error: 'Não encontrado.' });
  if (typeof (req.body || {}).ativo !== 'boolean') return res.status(400).json({ error: 'Informe um status válido.' });
  const info = db.prepare('UPDATE profissionais SET ativo = ? WHERE id = ? AND store_id = ?').run(req.body.ativo ? 1 : 0, req.params.id, req.store.id);
  if (!info.changes) return res.status(404).json({ error: 'Profissional não encontrado.' });
  res.json({ ok: true });
});

admin.put('/profissionais/:id', requireAuth, (req, res) => {
  const atual = db.prepare('SELECT * FROM profissionais WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Profissional não encontrado.' });
  // Formulários antigos de foto/status enviam apenas parte dos campos. Na Império,
  // preservar o que não foi enviado evita zerar telefone, comissão e horários.
  if (req.store.slug === 'imperio-barber') req.body = { ...atual, ...(req.body || {}) };
  const r = gravarProfissional(req, Number(req.params.id));
  if (r.erro) return res.status(400).json({ error: r.erro });
  res.json({ ok: true });
});

admin.delete('/profissionais/:id', requireAuth, (req, res) => {
  const atual = db.prepare('SELECT id FROM profissionais WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Profissional não encontrado.' });
  // Histórico NUNCA se perde: desativa em vez de apagar quando já atendeu alguém.
  const usados = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM agendamentos WHERE store_id = ? AND profissional_id = ?').get(req.store.id, atual.id) || {}).n || 0
  );
  if (usados) {
    db.prepare('UPDATE profissionais SET ativo = 0 WHERE id = ? AND store_id = ?').run(atual.id, req.store.id);
    return res.json({ ok: true, desativado: true, atendimentos: usados });
  }
  db.prepare('DELETE FROM profissionais WHERE id = ? AND store_id = ?').run(atual.id, req.store.id);
  res.json({ ok: true, apagado: true });
});

/** Cruzamento de dados: números por barbeiro (hoje, semana, mês). */
admin.get('/por-profissional', requireAuth, (req, res) => {
  const storeId = req.store.id;
  const hoje = todayISO();
  const inicioSemana = addDays(hoje, -6);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const contagem = (de, ate) => {
    const linhas = db
      .prepare(
        `SELECT a.profissional_id AS id,
                COUNT(*) AS total,
                SUM(CASE WHEN a.status = 'concluido' THEN 1 ELSE 0 END) AS concluidos,
                SUM(CASE WHEN a.status = 'cancelado' THEN 0 ELSE a.valor_cents END) AS valor
           FROM agendamentos a
          WHERE a.store_id = ? AND a.data >= ? AND a.data <= ?
          GROUP BY a.profissional_id`
      )
      .all(storeId, de, ate);
    const mapa = {};
    linhas.forEach((l) => {
      mapa[Number(l.id) || 0] = { total: Number(l.total) || 0, concluidos: Number(l.concluidos) || 0, valor: Number(l.valor) || 0 };
    });
    return mapa;
  };
  const dia = contagem(hoje, hoje);
  const semana = contagem(inicioSemana, hoje);
  const mes = contagem(inicioMes, hoje);
  const zero = { total: 0, concluidos: 0, valor: 0 };
  const equipe = listaProfissionais(storeId, false).map((p) => ({
    id: p.id,
    nome: p.nome,
    foto_url: p.foto_url,
    ativo: p.ativo,
    hoje: dia[p.id] || zero,
    semana: semana[p.id] || zero,
    mes: mes[p.id] || zero,
  }));
  res.json({ equipe, sem_barbeiro: { hoje: dia[0] || zero, semana: semana[0] || zero, mes: mes[0] || zero } });
});

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
      `INSERT INTO servicos (store_id, nome, descricao, categoria, preco_cents, tipo_preco, duracao_min, ativo, ordem, imagem_url, promo_label, preco_antigo_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      Number(b.ordem || 99),
      String(b.imagem_url || ''),
      String(b.promo_label || '').slice(0, 24),
      Math.max(0, Number(b.preco_antigo_cents || 0))
    );
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

admin.put('/servicos/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = db.prepare('SELECT * FROM servicos WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Serviço não encontrado.' });
  db.prepare(
    `UPDATE servicos SET nome = ?, descricao = ?, categoria = ?, preco_cents = ?, tipo_preco = ?, duracao_min = ?, ativo = ?, ordem = ?,
       imagem_url = ?, promo_label = ?, preco_antigo_cents = ?
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
    String(b.imagem_url ?? atual.imagem_url ?? ''),
    String(b.promo_label ?? atual.promo_label ?? '').slice(0, 24),
    Math.max(0, Number(b.preco_antigo_cents ?? atual.preco_antigo_cents ?? 0)),
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
  const ocultos = clientesOcultosImperio(req.store.id);
  const excluir = ocultos.length ? ` AND id NOT IN (${ocultos.map(() => '?').join(',')})` : '';
  const busca = q ? ' AND (nome LIKE ? OR telefone LIKE ? OR endereco LIKE ?)' : '';
  const args = [req.store.id, ...ocultos, ...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [])];
  const limite = req.store.slug === 'imperio-barber' ? 1000 : 300;
  const lista = db.prepare('SELECT * FROM clientes WHERE store_id = ?' + excluir + busca + ` ORDER BY nome LIMIT ${limite}`).all(...args);
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
  if (req.store.slug === 'imperio-barber' && db.prepare('SELECT id FROM imperio_assinaturas WHERE store_id = ? AND cliente_id = ? LIMIT 1').get(req.store.id, Number(req.params.id))) return res.status(409).json({error:'Cliente possui assinatura vinculada; não pode ser excluído para preservar o histórico.'});
  db.prepare('DELETE FROM clientes WHERE id = ? AND store_id = ?').run(req.params.id, req.store.id);
  db.prepare('DELETE FROM equipamentos WHERE cliente_id = ? AND store_id = ?').run(req.params.id, req.store.id);
  res.json({ ok: true });
});

/* Exclusivo da Império: exclusão selecionada, atômica e sem quebrar histórico. */
admin.post('/imperio-clientes/excluir', requireAuth, requireDono, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({ error: 'Não encontrado.' });
  const ids = req.body && req.body.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some((n) => !Number.isSafeInteger(n) || n < 1)) {
    return res.status(400).json({ error: 'Selecione de 1 a 1000 clientes válidos.' });
  }
  const unicos = [...new Set(ids)];
  if (unicos.length !== ids.length) return res.status(400).json({ error: 'A lista contém clientes repetidos.' });
  const marcas = unicos.map(() => '?').join(',');
  const apagar = db.transaction(() => {
    const clientes = db.prepare(`SELECT id, nome FROM clientes WHERE store_id = ? AND id IN (${marcas})`).all(req.store.id, ...unicos);
    if (clientes.length !== unicos.length) return { status: 404, error: 'Algum cliente não foi encontrado nesta loja. Atualize a lista e tente novamente.' };
    const vinculados = db.prepare(`SELECT c.nome FROM clientes c WHERE c.store_id = ? AND c.id IN (${marcas}) AND (
      EXISTS (SELECT 1 FROM agendamentos a WHERE a.store_id = c.store_id AND a.cliente_id = c.id) OR
      EXISTS (SELECT 1 FROM equipamentos e WHERE e.store_id = c.store_id AND e.cliente_id = c.id) OR
      EXISTS (SELECT 1 FROM imperio_assinaturas ia WHERE ia.store_id = c.store_id AND ia.cliente_id = c.id)
    ) ORDER BY c.nome`).all(req.store.id, ...unicos);
    if (vinculados.length) {
      const nomes = vinculados.slice(0, 4).map((c) => c.nome).join(', ');
      return { status: 409, error: 'Não foi excluído nenhum cliente. ' + nomes + (vinculados.length > 4 ? ' e outros' : '') + ' possui agendamento ou registro vinculado. Para preservar o histórico, esses cadastros não podem ser excluídos.' };
    }
    const info = db.prepare(`DELETE FROM clientes WHERE store_id = ? AND id IN (${marcas})`).run(req.store.id, ...unicos);
    return { status: 200, excluidos: info.changes };
  });
  try {
    const resultado = apagar.immediate();
    if (resultado.status !== 200) return res.status(resultado.status).json({ error: resultado.error });
    return res.json({ ok: true, excluidos: resultado.excluidos });
  } catch (err) {
    console.error('[imperio-clientes] falha ao excluir:', err.message);
    return res.status(500).json({ error: 'Não foi possível excluir. Nenhum cliente foi removido.' });
  }
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

/* --------------------- clique no WhatsApp (lead) -------------------- */
publico.post('/eventos', (req, res) => {
  try {
    registrarEvento(req.store, String((req.body || {}).tipo || 'whatsapp'), sessaoDe(req, res), String((req.body || {}).detalhe || ''));
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
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

  // Barbeiro escolhido (loja com equipe). Sem equipe fica 0 e nada muda.
  let profissionalId = Number(b.profissional_id || 0);
  if (profissionalId && !profissionalDa(storeId, profissionalId)) profissionalId = 0;

  const info = db
    .prepare(
      `INSERT INTO agendamentos
        (store_id, cliente_id, equipamento_id, servico_id, servico_nome, data, periodo, hora, status,
         valor_cents, endereco, obs_cliente, obs_interno, origem, origem_fonte, origem_campanha, profissional_id, pagamento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      origem,
      String(b.origem_fonte || ''),
      String(b.origem_campanha || ''),
      profissionalId,
      ['local', 'pix', 'cartao'].includes(String(b.pagamento || '')) ? String(b.pagamento) : ''
    );
  return {
    id: Number(info.lastInsertRowid),
    cliente_id: clienteId,
    equipamento_id: equipId,
    servico_nome: servicoNome,
    profissional_id: profissionalId,
  };
}

/**
 * Choque de horário no PAINEL: mesma loja, mesmo dia, mesmo barbeiro (ou sem
 * barbeiro = vale para todos) e horários que se sobrepõem pela duração do serviço.
 * Serve para o painel nunca criar dois clientes no mesmo horário.
 */
function conflitoNoPainel(storeId, dados, ignorarId) {
  const hora = String(dados.hora || '').trim();
  if (!/^\d{2}:\d{2}$/.test(hora)) {
    if ((getStoreById(storeId) || {}).slug === 'imperio-barber' && db.prepare('SELECT id FROM imperio_bloqueios WHERE store_id = ? AND data = ? AND (? = 0 OR profissional_id = ?) LIMIT 1').get(storeId, String(dados.data || ''), Number(dados.profissional_id || 0), Number(dados.profissional_id || 0))) return {hora:'a definir', cliente:'dia com horário bloqueado; escolha um horário'};
    return null;
  }
  const data = String(dados.data || '');
  if (!data) return null;

  const servico = Number(dados.servico_id || 0);
  const sv = servico
    ? db.prepare('SELECT duracao_min FROM servicos WHERE id = ? AND store_id = ?').get(servico, storeId)
    : null;
  const dur = Math.max(10, Number((sv && sv.duracao_min) || agendaConfig(storeId).intervalo || 30));
  const ini = minutosDeHHMM(hora);
  const fim = ini + dur;
  const prof = Number(dados.profissional_id || 0);

  if ((getStoreById(storeId) || {}).slug === 'imperio-barber') {
    const bloqueios = db.prepare('SELECT inicio, fim FROM imperio_bloqueios WHERE store_id = ? AND data = ? AND (? = 0 OR profissional_id = ?)').all(storeId, data, prof, prof);
    if (bloqueios.some((b) => ini < minutosDeHHMM(b.fim) && fim > minutosDeHHMM(b.inicio))) return {hora, cliente:'horário bloqueado'};
  }

  const linhas = db
    .prepare(
      `SELECT a.id, a.hora, a.periodo, a.profissional_id, a.servico_id, a.servico_nome,
              c.nome AS cliente_nome, s.duracao_min AS servico_dura
         FROM agendamentos a
         LEFT JOIN clientes c ON c.id = a.cliente_id
         LEFT JOIN servicos s ON s.id = a.servico_id
        WHERE a.store_id = ? AND a.data = ? AND a.status IN (${STATUS_QUE_OCUPAM.map(() => '?').join(',')})
          AND a.id <> ?`
    )
    .all(storeId, data, ...STATUS_QUE_OCUPAM, Number(ignorarId || 0));

  const outroProf = (l) => prof && Number(l.profissional_id) && Number(l.profissional_id) !== prof;
  for (const l of linhas) {
    if (outroProf(l)) continue;
    let i2 = minutosDeHHMM(l.hora);
    let d2 = Math.max(10, Number(l.servico_dura || 0) || agendaConfig(storeId).intervalo || 30);
    if (i2 < 0) {
      // agendamento antigo só com período: ocupa o primeiro horário do período
      const per = String(l.periodo || '');
      i2 = per === 'Tarde' ? 12 * 60 : per === 'Noite' ? 18 * 60 : minutosDeHHMM(agendaConfig(storeId).abre);
      d2 = Math.max(10, Number(l.servico_dura || 0) || agendaConfig(storeId).intervalo || 30);
    }
    if (ini < i2 + d2 && fim > i2) {
      return { id: l.id, hora: l.hora || 'a definir', cliente: l.cliente_nome || 'cliente' };
    }
  }
  return null;
}

// Cores da agenda: preferências visuais isoladas, sem alterar dados comerciais.
const IMPERIO_CORES_PADRAO = { solicitado:'#e3c16e', agendado:'#bb89e8', a_caminho:'#9546df', concluido:'#d4d8dc', cancelado:'#db6268', bloqueado:'#f0a8ae' };
function imperioCores(storeId) {
  const salvo = getSetting(storeId, 'imperio_cores_agenda', {}) || {};
  const status = {...IMPERIO_CORES_PADRAO};
  const valid = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  for (const k of Object.keys(status)) if (valid((salvo.status || {})[k])) status[k] = salvo.status[k];
  const servicos = {};
  for (const [k,v] of Object.entries(salvo.servicos || {})) if (/^[1-9]\d*$/.test(k) && valid(v)) servicos[k] = v;
  return {status,servicos};
}
admin.get('/agenda/cores', requireAuth, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({error:'Não encontrado.'});
  res.set('Cache-Control','no-store'); res.json(imperioCores(req.store.id));
});
admin.put('/agenda/cores', requireAuth, requireDono, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({error:'Não encontrado.'});
  const b = req.body || {}, status = b.status, servicos = b.servicos;
  const valid = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  if (!status || typeof status !== 'object' || Array.isArray(status) || !servicos || typeof servicos !== 'object' || Array.isArray(servicos) || Object.keys(status).some(k=>!Object.prototype.hasOwnProperty.call(IMPERIO_CORES_PADRAO,k)) || Object.keys(IMPERIO_CORES_PADRAO).some(k=>!valid(status[k])) || Object.keys(servicos).length > 500 || Object.entries(servicos).some(([k,v])=>!/^([1-9]\d*)$/.test(k)||!valid(v))) return res.status(400).json({error:'Confira as cores escolhidas.'});
  const ids = new Set(db.prepare('SELECT id FROM servicos WHERE store_id = ?').all(req.store.id).map(x=>String(x.id)));
  if (Object.keys(servicos).some(k=>!ids.has(k))) return res.status(400).json({error:'Serviço não pertence a esta loja.'});
  setSetting(req.store.id, 'imperio_cores_agenda', {status, servicos});
  res.json({ok:true, ...imperioCores(req.store.id)});
});

// Bloqueios pontuais da Império: sempre por barbeiro e data, com conflitos protegidos.
function podeGerirBloqueio(req, profissionalId) {
  if (req.papel !== 'funcionario') return true;
  const f = db.prepare('SELECT profissional_id FROM funcionarios WHERE id = ? AND store_id = ? AND ativo = 1').get(req.funcionarioId, req.store.id);
  return !!(f && Number(f.profissional_id) > 0 && Number(f.profissional_id) === Number(profissionalId));
}
admin.get('/agenda/bloqueios', requireAuth, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({error:'Não encontrado.'});
  const prof = Number(req.query.profissional || 0), data = String(req.query.data || '');
  if (!prof || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({error:'Escolha barbeiro e data.'});
  res.json({bloqueios:db.prepare('SELECT id, inicio, fim FROM imperio_bloqueios WHERE store_id = ? AND profissional_id = ? AND data = ? ORDER BY inicio').all(req.store.id, prof, data)});
});
admin.post('/agenda/bloqueios', requireAuth, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({error:'Não encontrado.'});
  const b = req.body || {}, id = Number(b.profissional_id || 0), data = String(b.data || ''), ini = String(b.inicio || ''), fim = String(b.fim || '');
  if (!podeGerirBloqueio(req, id)) return res.status(403).json({error:'O barbeiro pode gerenciar apenas os próprios bloqueios.'});
  const valido = /^\d{4}-\d{2}-\d{2}$/.test(data) && !Number.isNaN(Date.parse(data+'T12:00:00Z')) && new Date(data+'T12:00:00Z').toISOString().slice(0,10) === data;
  if (!profissionalDa(req.store.id, id) || !valido || !/^([01]\d|2[0-3]):[0-5]\d$/.test(ini) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(fim) || ini >= fim) return res.status(400).json({error:'Confira barbeiro, data e horário de início e fim.'});
  const existentes = db.prepare('SELECT inicio, fim FROM imperio_bloqueios WHERE store_id = ? AND profissional_id = ? AND data = ?').all(req.store.id,id,data);
  if (existentes.some(x => ini < x.fim && fim > x.inicio)) return res.status(409).json({error:'Já existe um bloqueio nesse intervalo.'});
  const ags = db.prepare(`SELECT a.hora, a.periodo, s.duracao_min FROM agendamentos a LEFT JOIN servicos s ON s.id = a.servico_id WHERE a.store_id = ? AND a.data = ? AND (a.profissional_id = ? OR a.profissional_id = 0) AND a.status IN ('solicitado','agendado','a_caminho','concluido')`).all(req.store.id,data,id);
  if (ags.some(a => { if (!a.hora) return true; const inicio = minutosDeHHMM(a.hora); return minutosDeHHMM(ini) < inicio + Math.max(10, Number(a.duracao_min) || agendaConfig(req.store.id).intervalo) && minutosDeHHMM(fim) > inicio; })) return res.status(409).json({error:'Existe um agendamento ou horário não definido nesse dia que pode entrar em conflito. Confira a agenda antes de bloquear.'});
  const r = db.prepare('INSERT INTO imperio_bloqueios(store_id, profissional_id, data, inicio, fim) VALUES (?, ?, ?, ?, ?)').run(req.store.id,id,data,ini,fim);
  res.json({ok:true,id:Number(r.lastInsertRowid)});
});
admin.delete('/agenda/bloqueios/:id', requireAuth, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({error:'Não encontrado.'});
  const alvo = db.prepare('SELECT profissional_id FROM imperio_bloqueios WHERE store_id = ? AND id = ?').get(req.store.id, Number(req.params.id));
  if (!alvo) return res.status(404).json({error:'Bloqueio não encontrado.'});
  if (!podeGerirBloqueio(req, alvo.profissional_id)) return res.status(403).json({error:'O barbeiro pode gerenciar apenas os próprios bloqueios.'});
  const r = db.prepare('DELETE FROM imperio_bloqueios WHERE store_id = ? AND id = ?').run(req.store.id, Number(req.params.id));
  if (!r.changes) return res.status(404).json({error:'Bloqueio não encontrado.'});
  res.json({ok:true});
});

admin.post('/agendamentos', requireAuth, (req, res) => {
  const corpo = req.body || {};
  // O clique na grade confirma novamente, no servidor, a disponibilidade para
  // o serviço escolhido, antes de criar cliente ou agendamento.
  if (req.store.slug === 'imperio-barber' && corpo.imperio_grade === true) {
    const data = String(corpo.data || ''), hora = String(corpo.hora || '');
    const prof = profissionalDa(req.store.id, corpo.profissional_id);
    const sv = db.prepare('SELECT id, duracao_min FROM servicos WHERE store_id = ? AND id = ? AND ativo = 1').get(req.store.id, Number(corpo.servico_id || 0));
    const cliente = Number(corpo.cliente_id || 0);
    if (!prof || !sv || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return res.status(400).json({ error:'Confira barbeiro, serviço, dia e horário.' });
    if (cliente && !db.prepare('SELECT id FROM clientes WHERE store_id = ? AND id = ?').get(req.store.id, cliente)) return res.status(400).json({ error:'Cliente não encontrado nesta loja.' });
    if (!cliente && !String(corpo.cliente_nome || '').trim()) return res.status(400).json({ error:'Informe o nome do cliente.' });
    const grade = horariosDoDia(req.store.id, data, prof.id, sv.duracao_min);
    const escolhido = grade.horarios.find((h) => h.hora === hora);
    if (!escolhido || !escolhido.livre) return res.status(409).json({ error:'Horário indisponível para esse serviço e barbeiro. Escolha outro horário.' });
  }
  const choque = conflitoNoPainel(req.store.id, corpo, 0);
  if (choque) {
    return res.status(409).json({
      error: `Esse horário já está ocupado (${choque.hora} · ${choque.cliente}). Escolha outro horário ou outro barbeiro.`,
      conflito: choque,
    });
  }
  const r = gravarAgendamento(req.store.id, corpo, 'painel');
  res.json({ ok: true, ...r });
});

admin.put('/agendamentos/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = db.prepare('SELECT * FROM agendamentos WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  // ao remarcar, também não deixa cair em cima de outro cliente
  const novoStatus = STATUS.includes(b.status) ? b.status : atual.status;
  if (['solicitado', 'agendado', 'a_caminho', 'concluido'].includes(novoStatus)) {
    const choque = conflitoNoPainel(
      req.store.id,
      {
        data: b.data ?? atual.data,
        hora: String(b.hora ?? atual.hora ?? ''),
        servico_id: b.servico_id ?? atual.servico_id,
        profissional_id: b.profissional_id ?? atual.profissional_id,
      },
      Number(req.params.id)
    );
    if (choque) {
      return res.status(409).json({
        error: `Esse horário já está ocupado (${choque.hora} · ${choque.cliente}). Escolha outro horário ou outro barbeiro.`,
        conflito: choque,
      });
    }
  }
  db.prepare(
    `UPDATE agendamentos SET cliente_id = ?, equipamento_id = ?, servico_id = ?, servico_nome = ?, data = ?, periodo = ?,
       hora = ?, status = ?, valor_cents = ?, endereco = ?, obs_cliente = ?, obs_interno = ?,
       profissional_id = ?, atualizado_em = datetime('now')
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
    Number(b.profissional_id ?? atual.profissional_id ?? 0),
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
  // Renovar um cancelado não pode atravessar um bloqueio nem outro atendimento.
  if (req.store.slug === 'imperio-barber' && ag.status === 'cancelado' && STATUS_QUE_OCUPAM.includes(novo)) {
    const choque = conflitoNoPainel(req.store.id, ag, ag.id);
    if (choque) return res.status(409).json({error:'Não é possível renovar: há conflito com ' + choque.cliente + '. Remarque antes de renovar.'});
  }

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

/** Promoções / combos da loja (o lojista monta o que quiser). */
admin.get('/promocoes', requireAuth, (req, res) => {
  res.json({ promocoes: promocoesDa(req.store.id), ativa: promocaoDeHoje(req.store.id), hoje: todayISO() });
});

admin.put('/promocoes', requireAuth, (req, res) => {
  const { setSetting } = require('./db');
  const lista = normalizarPromocoes((req.body || {}).promocoes);
  setSetting(req.store.id, 'promocoes', lista);
  res.json({ ok: true, promocoes: lista, ativa: promocaoDeHoje(req.store.id) });
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
  const hhmm = (v, padrao) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : padrao);
  const abre = hhmm(b.abre, atual.abre || '09:00');
  const fecha = hhmm(b.fecha, atual.fecha || '19:00');
  const intervalo = Math.max(10, Math.min(120, Number(b.intervalo) || atual.intervalo || 30));
  setSetting(req.store.id, 'agenda', { periodos, vagas, dias, abre, fecha, intervalo });
  res.json({ ok: true, ...agendaConfig(req.store.id) });
});

/** Disponibilidade vista pelo painel (com quantos já estão agendados). */
admin.get('/agenda/disponibilidade', requireAuth, (req, res) => {
  const data = String(req.query.data || todayISO()).slice(0, 10);
  const dia = situacaoDia(req.store.id, data);
  const prof = Number(req.query.profissional || 0);
  const dura = duracaoDoServico(req.store.id, req.query.servico) || 0;
  const grade = horariosDoDia(req.store.id, data, prof, dura, Number(req.query.ignorar || 0), true);
  res.json({ ...dia, ...grade, sugestoes: proximosLivres(req.store.id, data, 6) });
});

/** Calendário do painel: horários livres/ocupados por dia (dia, semana ou mês). */
admin.get('/agenda/calendario', requireAuth, (req, res) => {
  const prof = Number(req.query.profissional || 0);
  const dura = duracaoDoServico(req.store.id, req.query.servico) || 0;
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || '')) ? String(req.query.de) : todayISO();
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || '')) ? String(req.query.ate) : de;
  const cfg = agendaConfig(req.store.id);
  const dias = [];
  let dia = de;
  for (let i = 0; i < 70 && dia <= ate; i += 1) {
    const dow = new Date(`${dia}T12:00:00`).getDay();
    const aberto = cfg.dias.includes(dow);
    const grade = aberto ? horariosDoDia(req.store.id, dia, prof, dura) : { horarios: [] };
    const total = grade.horarios.length;
    const livres = grade.horarios.filter((h) => h.livre).length;
    dias.push({
      data: dia,
      dow,
      aberto,
      total,
      livres,
      ocupados: total - livres,
      lotado: aberto && total > 0 && livres === 0,
      // dias que já passaram: os horários não contam mais
      passado: dia < todayISO(),
      fechado: !aberto,
    });
    dia = addDays(dia, 1);
  }
  res.json({ de, ate, abre: cfg.abre, fecha: cfg.fecha, intervalo: cfg.intervalo, dias });
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

// Catálogo público da Império: sem dados de assinantes, pagamentos ou histórico.
publico.get('/imperio-planos-publicos', (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({error:'Não encontrado.'});
  const planos = db.prepare('SELECT id, nome, preco_cents, imagem_url, descricao, condicoes, quantidade_servicos FROM imperio_planos WHERE store_id=? AND ativo=1 ORDER BY id').all(req.store.id);
  const telefonePublico = (t) => {
    const d = String(t || '').replace(/\D/g, '');
    return d.length === 10 || d.length === 11 ? '55' + d : (d.startsWith('55') && (d.length === 12 || d.length === 13) ? d : '');
  };
  // O dono solicitou o contato direto do barbeiro escolhido, nunca dados de assinantes.
  const barbeiros = listaProfissionais(req.store.id).map(p => ({id:p.id, nome:p.nome, whatsapp:telefonePublico(p.telefone)}));
  const pix = String(chavePix(req.store.id) || '').trim().slice(0, 200);
  res.set('Cache-Control', 'no-store');
  const whatsapp = telefonePublico(lojaBusiness(req).whatsapp);
  res.json({ planos, barbeiros, pix, whatsapp });
});

publico.get('/servicos', (req, res) => {
  const b = lojaBusiness(req);
  const lista = db
    .prepare('SELECT id, nome, descricao, categoria, preco_cents, tipo_preco, duracao_min, imagem_url, promo_label, preco_antigo_cents FROM servicos WHERE store_id = ? AND ativo = 1 ORDER BY ordem, id')
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
      // Perfil da agenda desta loja. 'domicilio' = como sempre foi (Henrique).
      // 'barbearia' = cliente no local, com equipe e sem campos de equipamento.
      perfil: b.perfil_agenda === 'barbearia' ? 'barbearia' : 'domicilio',
    },
    servicos: lista.map((s) => ({ ...s, preco: s.tipo_preco === 'sob_orcamento' ? 'Sob orçamento' : `${s.tipo_preco === 'a_partir' ? 'a partir de ' : ''}${brl(s.preco_cents)}` })),
    // Dias de atendimento e períodos: a página monta os atalhos de dia sem
    // precisar perguntar um por um.
    agenda: agendaConfig(req.store.id),
    // Campanha de promoção válida hoje (se o lojista montou alguma no painel)
    promocao: promocaoDeHoje(req.store.id),
    pix_key: chavePix(req.store.id),
    // Formas de pagamento aceitas (as mesmas do painel de Pagamentos da loja)
    pagamentos: (getSetting(req.store.id, 'payments', []) || [])
      .filter((f) => f && f.active)
      // cartão online só aparece se a loja tiver a conta de pagamento ligada
      .filter((f) => (f.id === 'cartao_online' ? require('./pagamentos').cartaoOnlineDisponivel(req.store.id) : true))
      .map((f) => ({ id: f.id, label: String(f.label || '').replace(/ na entrega/i, ' na hora'), key: f.key || '' })),
    // Loja sem equipe devolve [] e a tela segue como sempre foi.
    equipe: listaProfissionais(req.store.id).map((p) => ({
      ...proximaVaga(req.store.id, p.id),
      id: p.id,
      nome: p.nome,
      apelido: p.apelido || '',
      foto_url: p.foto_url || '',
      bio: p.bio || '',
      servicos: p.servicos ? p.servicos.split(',').map(Number).filter(Boolean) : [],
    })),
  });
});

/** Quais períodos estão livres num dia (o cliente vê antes de escolher). */
/** Situação dos próximos dias: cada dia diz se ainda tem horário livre. */
publico.get('/dias', (req, res) => {
  const profId = Number(req.query.profissional || 0);
  const dura = duracaoDoServico(req.store.id, req.query.servico) || 0;
  const quantos = Math.max(1, Math.min(60, Number(req.query.n) || 21));
  const cfg = agendaConfig(req.store.id);
  const saida = [];
  let dia = todayISO();
  for (let i = 0; i < 120 && saida.length < quantos; i += 1) {
    const dow = new Date(`${dia}T12:00:00`).getDay();
    if (cfg.dias.includes(dow)) {
      const grade = horariosDoDia(req.store.id, dia, profId, dura);
      const livres = grade.horarios.filter((h) => h.livre);
      saida.push({
        data: dia,
        aberto: !!grade.aberto,
        livres: livres.length,
        total: grade.horarios.length,
        esgotado: !!grade.aberto && livres.length === 0,
        primeira: livres.length ? livres[0].hora : '',
      });
    }
    dia = addDays(dia, 1);
  }
  res.json({ dias: saida, abre: cfg.abre, fecha: cfg.fecha, intervalo: cfg.intervalo, duracao: dura || cfg.intervalo });
});

publico.get('/disponibilidade', (req, res) => {
  const data = String(req.query.data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ error: 'Informe a data.' });

  // Loja com equipe: a vaga é de CADA barbeiro, não da loja.
  const profId = Number(req.query.profissional || 0);
  // Grade de horários calculada pela DURAÇÃO do serviço escolhido.
  const grade = horariosDoDia(req.store.id, data, profId, duracaoDoServico(req.store.id, req.query.servico));
  if (temEquipe(req.store.id)) {
    const diaEq = situacaoDiaEquipe(req.store.id, data, profId);
    return res.json({
      data: diaEq.data,
      aberto: diaEq.aberto,
      vagas: diaEq.vagas,
      equipe: true,
      profissional: profId || 0,
      horarios: grade.horarios,
      abre: grade.abre,
      fecha: grade.fecha,
      intervalo: grade.intervalo,
      duracao: grade.duracao,
      periodos: diaEq.periodos.map((p) => ({
        nome: p.nome,
        livre: p.livre,
        livres: p.livres,
        ocupados_por: p.ocupados_por,
      })),
      sugestoes: [],
    });
  }

  const dia = situacaoDia(req.store.id, data);
  const livres = proximosLivres(req.store.id, data, 4);
  res.json({
    data: dia.data,
    aberto: dia.aberto,
    vagas: dia.vagas,
    horarios: grade.horarios,
    abre: grade.abre,
    fecha: grade.fecha,
    intervalo: grade.intervalo,
    duracao: grade.duracao,
    periodos: dia.periodos.map((p) => ({ nome: p.nome, livre: p.livre })),
    sugestoes: livres.map((h) => ({ data: h.data, periodo: h.periodo, rotulo: `${dataBR(h.data)} (${diaSemana(h.data)}) — ${h.periodo}` })),
  });
});

publico.post('/agendar', (req, res) => {
  const b = req.body || {};
  if (!String(b.nome || '').trim()) return res.status(400).json({ error: 'Informe seu nome.' });
  if (soDigitos(b.telefone).length < 10) return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
  const businessLoja = lojaBusiness(req);
  const ehBarbearia = businessLoja.perfil_agenda === 'barbearia';
  if (ehBarbearia) {
    // o cliente é atendido no endereço da loja
    if (!String(b.endereco || '').trim()) b.endereco = businessLoja.address || 'No local';
  } else if (!String(b.endereco || '').trim()) {
    return res.status(400).json({ error: 'Informe o endereço do serviço.' });
  }

  // Horário escolhido (grade nova). Se veio hora, o período é derivado dela.
  const horaPedida = String(b.hora || '').trim();
  if (/^\d{2}:\d{2}$/.test(horaPedida)) {
    b.hora = horaPedida;
    b.periodo = periodoDoHorario(horaPedida) || b.periodo;
    if (b.data) {
      const diaISO = String(b.data).slice(0, 10);
      const grade = horariosDoDia(
        req.store.id,
        diaISO,
        Number(b.profissional_id || 0),
        duracaoDoServico(req.store.id, b.servico_id)
      );
      const alvo = grade.horarios.find((h) => h.hora === horaPedida);
      if (!alvo) return res.status(409).json({ error: 'Esse horário não existe na agenda. Escolha outro.' });
      if (!alvo.livre) {
        return res.status(409).json({
          error: alvo.passou
            ? 'Esse horário já passou. Escolha outro.'
            : 'Esse horário acabou de ser agendado por outro cliente. Escolha outro horário.',
        });
      }
    }
  }

  // Na Império, um bloqueio exige horário explícito; período sem hora não pode contorná-lo.
  if (req.store.slug === 'imperio-barber' && !horaPedida && b.data && db.prepare('SELECT id FROM imperio_bloqueios WHERE store_id = ? AND data = ? AND (? = 0 OR profissional_id = ?) LIMIT 1').get(req.store.id, String(b.data).slice(0,10), Number(b.profissional_id || 0), Number(b.profissional_id || 0))) return res.status(409).json({error:'Escolha um horário disponível para este dia.'});

  // Loja com equipe: o barbeiro escolhido precisa estar livre naquele período.
  const profId = Number(b.profissional_id || 0);
  if (temEquipe(req.store.id) && profId) {
    const prof = profissionalDa(req.store.id, profId);
    if (!prof) return res.status(400).json({ error: 'Escolha um barbeiro da equipe.' });
    if (!horaPedida && b.data && b.periodo && profissionalOcupado(req.store.id, String(b.data).slice(0, 10), b.periodo, profId)) {
      const dia = String(b.data).slice(0, 10);
      const livres = profissionaisLivres(req.store.id, dia, b.periodo).map((p) => ({ id: p.id, nome: p.nome }));
      return res.status(409).json({
        error: `${prof.nome} já tem cliente nesse horário (${b.periodo}).`,
        barbeiros_livres: livres,
      });
    }
    b.profissional_id = profId;
    b.profissional_nome = prof.nome;
  } else if (temEquipe(req.store.id) && !profId) {
    return res.status(400).json({ error: 'Escolha o barbeiro para o atendimento.' });
  }

  // Não deixa dois clientes caírem no mesmo período já tomado.
  if (b.data && !temEquipe(req.store.id)) {
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

  // Central de Tráfego: de qual anúncio/link veio esse agendamento
  const origemSessao = origemDaSessao(req.store.id, sessaoDe(req, res));
  const registro = gravarAgendamento(
    req.store.id,
    { ...b, status: 'solicitado', origem_fonte: origemSessao.source, origem_campanha: origemSessao.campaign },
    'site'
  );

  const business = lojaBusiness(req);
  const nomeEmpresa = business.name || req.store.name;
  const servico = db.prepare('SELECT * FROM servicos WHERE id = ?').get(registro.servico_id);
  const texto =
    `*Nova solicitação de agendamento* 🗓️\n\n` +
    `Cliente: ${b.nome}\nWhatsApp: ${b.telefone}\n` +
    (b.profissional_nome ? `Barbeiro: ${b.profissional_nome}\n` : '') +
    `Serviço: ${registro.servico_nome}${servico && servico.tipo_preco !== 'sob_orcamento' ? ` (${brl(servico.preco_cents)})` : ''}\n` +
    `Data preferida: ${b.data ? `${dataBR(b.data)} (${diaSemana(b.data)})` : 'a combinar'}${b.periodo ? ` — ${b.periodo}` : ''}\n` +
    `Endereço: ${b.endereco}${b.bairro ? ` - ${b.bairro}` : ''}\n` +
    `Pagamento: ${rotuloPagamento(b.pagamento)}\n` +
    (b.equip_tipo || b.equip_marca || b.equip_ambiente
      ? `Equipamento: ${[b.equip_tipo, b.equip_marca, b.equip_ambiente].filter(Boolean).join(' ')}\n`
      : '') +
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

/* ===================== ACESSOS DA EQUIPE (funcionários) ===================== */

admin.get('/funcionarios', requireAuth, (req, res) => {
  const lista = db
    .prepare('SELECT id, nome, profissional_id, ativo, criado_em FROM funcionarios WHERE store_id = ? ORDER BY nome')
    .all(req.store.id);
  res.json({ funcionarios: lista });
});

admin.post('/funcionarios', requireAuth, (req, res) => {
  const b = req.body || {};
  const nome = String(b.nome || '').trim();
  const senha = String(b.senha || '');
  if (!nome) return res.status(400).json({ error: 'Informe o nome do funcionário.' });
  if (senha.length < 4) return res.status(400).json({ error: 'A senha precisa ter ao menos 4 caracteres.' });
  const info = db
    .prepare('INSERT INTO funcionarios (store_id, nome, profissional_id, senha_hash) VALUES (?, ?, ?, ?)')
    .run(req.store.id, nome, Number(b.profissional_id || 0), require('./db').hashPassword(senha));
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

admin.put('/funcionarios/:id', requireAuth, (req, res) => {
  const b = req.body || {};
  const atual = db.prepare('SELECT * FROM funcionarios WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!atual) return res.status(404).json({ error: 'Acesso não encontrado.' });
  const senha = String(b.senha || '');
  if (senha && senha.length < 4) return res.status(400).json({ error: 'A senha precisa ter ao menos 4 caracteres.' });
  db.prepare('UPDATE funcionarios SET nome = ?, profissional_id = ?, ativo = ? WHERE id = ? AND store_id = ?').run(
    String(b.nome ?? atual.nome).trim() || atual.nome,
    Number(b.profissional_id ?? atual.profissional_id) || 0,
    b.ativo === false || b.ativo === 0 ? 0 : 1,
    atual.id,
    req.store.id
  );
  if (senha) {
    db.prepare('UPDATE funcionarios SET senha_hash = ? WHERE id = ? AND store_id = ?').run(
      require('./db').hashPassword(senha),
      atual.id,
      req.store.id
    );
  }
  res.json({ ok: true });
});

admin.delete('/funcionarios/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM funcionarios WHERE id = ? AND store_id = ?').run(req.params.id, req.store.id);
  res.json({ ok: true });
});

/* ===================== FINANCEIRO (despesas, caixa, comissões) ===================== */

const FORMAS_PAG = ['dinheiro', 'pix', 'debito', 'credito', 'outro'];

/** Entradas do período: agendamentos concluídos da loja. */
function entradasDoPeriodo(storeId, de, ate) {
  return db
    .prepare(
      `SELECT a.data, a.hora, a.servico_nome, a.valor_cents, a.pagamento, a.profissional_id
         FROM agendamentos a
        WHERE a.store_id = ? AND a.status = 'concluido' AND a.data >= ? AND a.data <= ?
        ORDER BY a.data, a.id`
    )
    .all(storeId, de, ate);
}

admin.get('/despesas', requireAuth, (req, res) => {
  const de = String(req.query.de || '1900-01-01');
  const ate = String(req.query.ate || '2999-12-31');
  const lista = db
    .prepare('SELECT * FROM despesas WHERE store_id = ? AND data >= ? AND data <= ? ORDER BY data DESC, id DESC')
    .all(req.store.id, de, ate);
  res.json({ despesas: lista, total_cents: lista.reduce((s, d) => s + Number(d.valor_cents || 0), 0) });
});

function gravarDespesa(req, id) {
  const b = req.body || {};
  const valor = Math.round(Number(b.valor_cents || 0));
  if (!valor || valor <= 0) return { erro: 'Informe o valor da despesa.' };
  const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : todayISO();
  const campos = [
    data,
    String(b.categoria || 'Geral').slice(0, 40),
    String(b.descricao || '').slice(0, 160),
    valor,
    FORMAS_PAG.includes(b.forma) ? b.forma : 'dinheiro',
  ];
  if (id) {
    db.prepare('UPDATE despesas SET data = ?, categoria = ?, descricao = ?, valor_cents = ?, forma = ? WHERE id = ? AND store_id = ?')
      .run(...campos, id, req.store.id);
    return { id };
  }
  const info = db
    .prepare('INSERT INTO despesas (store_id, data, categoria, descricao, valor_cents, forma) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.store.id, ...campos);
  return { id: Number(info.lastInsertRowid) };
}

admin.post('/despesas', requireAuth, (req, res) => {
  const r = gravarDespesa(req, 0);
  if (r.erro) return res.status(400).json({ error: r.erro });
  res.status(201).json({ ok: true, id: r.id });
});

admin.put('/despesas/:id', requireAuth, (req, res) => {
  const d = db.prepare('SELECT id FROM despesas WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!d) return res.status(404).json({ error: 'Despesa não encontrada.' });
  const r = gravarDespesa(req, Number(req.params.id));
  if (r.erro) return res.status(400).json({ error: r.erro });
  res.json({ ok: true });
});

admin.delete('/despesas/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM despesas WHERE id = ? AND store_id = ?').run(req.params.id, req.store.id);
  res.json({ ok: true });
});

/** Resumo financeiro do período: entradas, despesas, líquido, formas e comissões. */
admin.get('/financeiro', requireAuth, (req, res) => {
  const storeId = req.store.id;
  const de = /^\d{4}-\d{2}-\d{2}$/.test(req.query.de || '') ? req.query.de : `${todayISO().slice(0, 7)}-01`;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.ate || '') ? req.query.ate : todayISO();

  const entradas = entradasDoPeriodo(storeId, de, ate);
  const totalEntradas = entradas.reduce((s, a) => s + Number(a.valor_cents || 0), 0);

  const despesas = db
    .prepare('SELECT * FROM despesas WHERE store_id = ? AND data >= ? AND data <= ? ORDER BY data DESC, id DESC')
    .all(storeId, de, ate);
  const totalDespesas = despesas.reduce((s, d) => s + Number(d.valor_cents || 0), 0);

  const porForma = {};
  entradas.forEach((a) => {
    const f = FORMAS_PAG.includes(a.pagamento) ? a.pagamento : 'dinheiro';
    porForma[f] = porForma[f] || { forma: f, valor_cents: 0, qtd: 0 };
    porForma[f].valor_cents += Number(a.valor_cents || 0);
    porForma[f].qtd += 1;
  });

  const profs = listaProfissionais(storeId, false);
  const porBarbeiro = profs.map((p) => {
    const meus = entradas.filter((a) => Number(a.profissional_id) === Number(p.id));
    const valor = meus.reduce((s, a) => s + Number(a.valor_cents || 0), 0);
    const pct = Number(p.comissao_pct || 0);
    return {
      id: p.id,
      nome: p.nome,
      atendimentos: meus.length,
      valor_cents: valor,
      comissao_pct: pct,
      comissao_cents: Math.round((valor * pct) / 100),
    };
  });

  const dias = {};
  entradas.forEach((a) => {
    dias[a.data] = dias[a.data] || { data: a.data, entradas_cents: 0, despesas_cents: 0, atendimentos: 0 };
    dias[a.data].entradas_cents += Number(a.valor_cents || 0);
    dias[a.data].atendimentos += 1;
  });
  despesas.forEach((d) => {
    dias[d.data] = dias[d.data] || { data: d.data, entradas_cents: 0, despesas_cents: 0, atendimentos: 0 };
    dias[d.data].despesas_cents += Number(d.valor_cents || 0);
  });

  const caixaHoje = db.prepare('SELECT * FROM caixas WHERE store_id = ? AND data = ?').get(storeId, todayISO());

  res.json({
    de,
    ate,
    entradas_cents: totalEntradas,
    despesas_cents: totalDespesas,
    liquido_cents: totalEntradas - totalDespesas,
    atendimentos: entradas.length,
    por_forma: Object.values(porForma).sort((a, b) => b.valor_cents - a.valor_cents),
    por_barbeiro: porBarbeiro,
    comissoes_cents: porBarbeiro.reduce((s, p) => s + p.comissao_cents, 0),
    dias: Object.values(dias).sort((a, b) => (a.data < b.data ? -1 : 1)),
    caixa_hoje: caixaHoje || null,
    despesas,
  });
});

/** Fechamento de caixa do dia. */
admin.post('/caixa', requireAuth, (req, res) => {
  const b = req.body || {};
  const data = /^\d{4}-\d{2}-\d{2}$/.test(b.data || '') ? b.data : todayISO();
  const sistema = entradasDoPeriodo(req.store.id, data, data).reduce((s, a) => s + Number(a.valor_cents || 0), 0);
  const desp = Number(
    (db.prepare('SELECT COALESCE(SUM(valor_cents),0) AS s FROM despesas WHERE store_id = ? AND data = ?').get(req.store.id, data) || {}).s || 0
  );
  const informado = Math.round(Number(b.valor_informado_cents || 0));
  db.prepare(
    `INSERT INTO caixas (store_id, data, valor_sistema_cents, valor_informado_cents, despesas_cents, obs)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(store_id, data) DO UPDATE SET
       valor_sistema_cents = excluded.valor_sistema_cents,
       valor_informado_cents = excluded.valor_informado_cents,
       despesas_cents = excluded.despesas_cents,
       obs = excluded.obs,
       fechado_em = datetime('now')`
  ).run(req.store.id, data, sistema, informado, desp, String(b.obs || '').slice(0, 200));
  res.json({ ok: true, data, valor_sistema_cents: sistema, diferenca_cents: informado - sistema });
});

/* ===================== RELATÓRIOS ===================== */

admin.get('/relatorios', requireAuth, (req, res) => {
  const storeId = req.store.id;
  const dias = Math.max(7, Math.min(180, Number(req.query.dias) || 30));
  const ate = todayISO();
  const de = addDays(ate, -(dias - 1));

  const entradas = entradasDoPeriodo(storeId, de, ate);
  const total = entradas.reduce((s, a) => s + Number(a.valor_cents || 0), 0);

  const serie = [];
  for (let i = 0; i < dias; i++) {
    const d = addDays(de, i);
    const doDia = entradas.filter((a) => a.data === d);
    serie.push({
      data: d,
      valor_cents: doDia.reduce((s, a) => s + Number(a.valor_cents || 0), 0),
      atendimentos: doDia.length,
    });
  }

  const servicos = {};
  entradas.forEach((a) => {
    const k = a.servico_nome || 'Serviço';
    servicos[k] = servicos[k] || { nome: k, qtd: 0, valor_cents: 0 };
    servicos[k].qtd += 1;
    servicos[k].valor_cents += Number(a.valor_cents || 0);
  });

  const profs = listaProfissionais(storeId, false);
  const porBarbeiro = profs
    .map((p) => {
      const meus = entradas.filter((a) => Number(a.profissional_id) === Number(p.id));
      return {
        id: p.id,
        nome: p.nome,
        atendimentos: meus.length,
        valor_cents: meus.reduce((s, a) => s + Number(a.valor_cents || 0), 0),
      };
    })
    .sort((a, b) => b.valor_cents - a.valor_cents);

  const idsOcultos = clientesOcultosImperio(storeId);
  const filtroClientesOcultos = idsOcultos.length ? ` AND id NOT IN (${idsOcultos.map(() => '?').join(',')})` : '';
  const filtroAgendaOculta = idsOcultos.length ? ` AND cliente_id NOT IN (${idsOcultos.map(() => '?').join(',')})` : '';
  const novos = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM clientes WHERE store_id = ? AND date(criado_em) >= ? AND date(criado_em) <= ?' + filtroClientesOcultos).get(storeId, de, ate, ...idsOcultos) || {}).n || 0
  );
  const recorrentes = Number(
    (db.prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT cliente_id FROM agendamentos
          WHERE store_id = ? AND status = 'concluido' AND cliente_id > 0 AND data >= ? AND data <= ?${filtroAgendaOculta}
          GROUP BY cliente_id HAVING COUNT(*) > 1)`
    ).get(storeId, de, ate, ...idsOcultos) || {}).n || 0
  );
  const totalClientes = quantidadeClientesVisiveis(storeId);

  res.json({
    de,
    ate,
    dias,
    total_cents: total,
    atendimentos: entradas.length,
    ticket_cents: entradas.length ? Math.round(total / entradas.length) : 0,
    serie,
    top_servicos: Object.values(servicos).sort((a, b) => b.qtd - a.qtd).slice(0, 8),
    por_barbeiro: porBarbeiro,
    clientes: { novos, recorrentes, total: totalClientes },
  });
});

/* ===================== HISTÓRICO DO CLIENTE ===================== */

admin.get('/clientes/:id/historico', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM clientes WHERE id = ? AND store_id = ?').get(req.params.id, req.store.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
  const lista = db
    .prepare(
      `SELECT a.id, a.data, a.hora, a.periodo, a.status, a.servico_nome, a.valor_cents,
              (SELECT nome FROM profissionais WHERE id = a.profissional_id) AS barbeiro
         FROM agendamentos a WHERE a.store_id = ? AND a.cliente_id = ?
        ORDER BY a.data DESC, a.id DESC LIMIT 50`
    )
    .all(req.store.id, c.id);
  const concluidos = lista.filter((a) => a.status === 'concluido');
  res.json({
    cliente: c,
    agendamentos: lista,
    total_cents: concluidos.reduce((s, a) => s + Number(a.valor_cents || 0), 0),
    visitas: concluidos.length,
    ultima: concluidos[0] ? concluidos[0].data : '',
  });
});

module.exports = { admin, publico, STATUS_LABEL };
