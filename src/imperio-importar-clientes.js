'use strict';
// Importação exclusivamente da Império: nunca altera clientes existentes.
const express = require('express');
const { db, getSetting, setSetting } = require('./db');
const { requireAuth, requireDono } = require('./auth');
const router = express.Router();
const textoNome = (v) => String(v || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const chaveNome = (v) => textoNome(v).toLocaleLowerCase('pt-BR');
const digitos = (v) => String(v || '').replace(/\D/g, '');
function telefoneConfiavel(v) {
  const s = String(v || '').trim();
  // Não completar números cortados ou consertar o DDD por suposição.
  if (!/^\(\d{2}\)\s*\d{4,5}-\d{4}$/.test(s)) return false;
  const n = digitos(s), ddd = Number(n.slice(0, 2)), local = n.slice(2);
  if (ddd < 11 || ddd > 99 || new Set(local).size < 2) return false;
  return (n.length === 11 && local[0] === '9') || (n.length === 10 && /^[2-5]/.test(local));
}
router.post('/imperio-clientes/importar-pdf', requireAuth, requireDono, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({ error: 'Não encontrado.' });
  const lista = req.body && req.body.clientes;
  const simular = req.body && req.body.simular === true;
  const antigos = (req.body && req.body.ids_antigos) || [];
  if (!Array.isArray(antigos) || antigos.length > 500 || antigos.some((n) => !Number.isSafeInteger(n) || n < 1) || new Set(antigos).size !== antigos.length) return res.status(400).json({ error:'Lista de clientes anteriores inválida.' });
  if (!Array.isArray(lista) || !lista.length || lista.length > 500) return res.status(400).json({ error: 'Envie entre 1 e 500 clientes.' });
  if (lista.some((c) => !c || typeof c !== 'object' || !textoNome(c.nome) || textoNome(c.nome).length > 100 || String(c.telefone_pdf || '').length > 50 || !Number.isInteger(c.pagina) || c.pagina < 1 || c.pagina > 1000)) {
    return res.status(400).json({ error: 'Há um registro inválido. Nenhum cliente foi alterado.' });
  }
  const executar = db.transaction(() => {
    const originais = db.prepare('SELECT id, nome, telefone, obs FROM clientes WHERE store_id = ?').all(req.store.id);
    const porId = new Map(originais.map((c) => [Number(c.id), c]));
    if (antigos.some((id) => !porId.has(id))) throw new Error('Lista anterior não confere com a loja.');
    const anteriores = new Set(antigos);
    const ocultadosAnteriores = new Set((getSetting(req.store.id, 'imperio_clientes_ocultos', []) || []).map(Number).filter(Number.isSafeInteger));
    const atuais = originais.filter((c) => !anteriores.has(Number(c.id)) && !ocultadosAnteriores.has(Number(c.id)));
    const reutilizados = new Set();
    const ins = db.prepare('INSERT INTO clientes (store_id, nome, telefone, obs) VALUES (?, ?, ?, ?)');
    const resultado = { total:lista.length, novos:0, ja_existiam:0, sem_telefone_confiavel:0, antigos_ocultados:0, conflitos:[], inseridos:[] };
    for (const c of lista) {
      const nome = textoNome(c.nome), raw = String(c.telefone_pdf || '').trim();
      const seguro = telefoneConfiavel(raw), telefone = seguro ? raw : '';
      const obs = seguro ? '' : `Telefone no PDF: ${raw || 'não informado'} — conferir antes de usar WhatsApp.`;
      const telefoneKey = digitos(telefone);
      // Se um cliente anterior for exatamente a pessoa do PDF, manter o ID
      // preserva os agendamentos; os demais anteriores só saem da listagem.
      const anteriorIgual = telefoneKey ? originais.find((a) => anteriores.has(Number(a.id)) && !reutilizados.has(Number(a.id)) && digitos(a.telefone).slice(-11) === telefoneKey && chaveNome(a.nome) === chaveNome(nome)) : null;
      if (anteriorIgual) { reutilizados.add(Number(anteriorIgual.id)); atuais.push(anteriorIgual); resultado.ja_existiam++; continue; }
      const correspondencias = telefoneKey ? atuais.filter((a) => digitos(a.telefone).slice(-11) === telefoneKey) : [];
      if (correspondencias.length) {
        if (correspondencias.some((a) => chaveNome(a.nome) === chaveNome(nome))) resultado.ja_existiam++;
        else resultado.conflitos.push({ nome, pagina:c.pagina, motivo:'telefone já usado por outro nome' });
        continue;
      }
      if (!telefone && atuais.some((a) => chaveNome(a.nome) === chaveNome(nome) && a.obs === obs && !a.telefone)) {
        resultado.ja_existiam++; continue;
      }
      let id = 0;
      if (!simular) id = Number(ins.run(req.store.id, nome, telefone, obs).lastInsertRowid);
      atuais.push({ id, nome, telefone, obs });
      resultado.novos++;
      if (!seguro) resultado.sem_telefone_confiavel++;
      resultado.inseridos.push({ nome, pagina:c.pagina, id:simular ? null : id });
    }
    const ocultar = antigos.filter((id) => !reutilizados.has(id));
    resultado.antigos_ocultados = ocultar.length;
    if (!simular && ocultar.length) {
      ocultar.forEach((id) => ocultadosAnteriores.add(id));
      setSetting(req.store.id, 'imperio_clientes_ocultos', Array.from(ocultadosAnteriores));
    }
    return resultado;
  });
  try { return res.json({ ok:true, simulado:simular, ...executar.immediate() }); }
  catch (e) { console.error('[imperio-importar-clientes]', e.message); return res.status(500).json({ error:'A importação falhou; nenhum cliente foi alterado.' }); }
});
// Atendimento concluído é o único histórico que indica uma visita; cancelamentos,
// reservas futuras e clientes importados sem histórico não contam como ausência.
router.get('/imperio-clientes/atividade', requireAuth, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({ error: 'Não encontrado.' });
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  const valida = `(a.data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND COALESCE(date(a.data, '+0 days') = a.data, 0))`;
  const registros = db.prepare(`SELECT a.cliente_id AS id,
      SUM(CASE WHEN ${valida} AND a.data <= @hoje THEN 1 ELSE 0 END) AS atendimentos,
      SUM(CASE WHEN ${valida} AND a.data >= @mes AND a.data <= @hoje THEN 1 ELSE 0 END) AS no_mes,
      SUM(CASE WHEN ${valida} AND a.data > @hoje THEN 0 ELSE 1 END) AS total_concluidos,
      SUM(CASE WHEN NOT ${valida} THEN 1 ELSE 0 END) AS sem_data,
      SUM(CASE WHEN ${valida} AND a.data > @hoje THEN 1 ELSE 0 END) AS data_futura,
      MIN(CASE WHEN ${valida} AND a.data <= @hoje THEN a.data END) AS primeira_visita,
      MAX(CASE WHEN ${valida} AND a.data <= @hoje THEN a.data END) AS ultima_visita
    FROM agendamentos a JOIN clientes c ON c.id = a.cliente_id AND c.store_id = a.store_id
    WHERE a.store_id = @store AND a.status = 'concluido'
    GROUP BY a.cliente_id`).all({store:req.store.id, hoje, mes:hoje.slice(0,7)+'-01'}).map(r=>({
      ...r,
      media_dias: r.atendimentos >= 2 ? Math.round((Date.parse(r.ultima_visita+'T00:00:00Z')-Date.parse(r.primeira_visita+'T00:00:00Z'))/86400000/(r.atendimentos-1)) : null,
    }));
  res.set('Cache-Control', 'no-store');
  res.json({ hoje, registros });
});
// Resumo baseado apenas nos registros reais vinculados ao cliente nesta loja.
router.get('/imperio-clientes/:id/recorrencia', requireAuth, (req, res) => {
  if (req.store.slug !== 'imperio-barber') return res.status(404).json({error:'Não encontrado.'});
  const id = Number(req.params.id), c = db.prepare('SELECT id FROM clientes WHERE id = ? AND store_id = ?').get(id, req.store.id);
  if (!c) return res.status(404).json({error:'Cliente não encontrado.'});
  const hoje = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
  const registros = db.prepare('SELECT data, status FROM agendamentos WHERE store_id = ? AND cliente_id = ?').all(req.store.id, id);
  const ativos = registros.filter(a => ['solicitado','agendado','a_caminho','concluido'].includes(a.status));
  const cancelados = registros.filter(a => a.status === 'cancelado').length;
  const datas = ativos.filter(a => a.status === 'concluido' && /^\d{4}-\d{2}-\d{2}$/.test(a.data) && a.data <= hoje)
    .map(a => a.data).filter(d => { const t = Date.parse(d+'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === d; }).sort();
  const media = datas.length >= 2 ? Math.round((Date.parse(datas[datas.length-1]+'T00:00:00Z') - Date.parse(datas[0]+'T00:00:00Z')) / 86400000 / (datas.length-1)) : null;
  res.set('Cache-Control','no-store');
  res.json({agendamentos:ativos.length, concluidos:datas.length, cancelados, primeira_visita:datas[0] || '', ultima_visita:datas[datas.length-1] || '', media_dias:media});
});
module.exports = { router, telefoneConfiavel };
