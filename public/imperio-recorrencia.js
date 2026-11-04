// Histórico e recorrência de clientes no painel da Império.
var imperioRecorrenciaSequencia = 0;
function imperioDataCompleta(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : (iso || 'data não informada'); }
function imperioMostrarRecorrencia(id) {
  var seq = ++imperioRecorrenciaSequencia;
  Promise.all([api('/imperio-clientes/' + encodeURIComponent(id) + '/recorrencia'), api('/clientes/' + encodeURIComponent(id) + '/historico')]).then(function (rs) {
    if (seq !== imperioRecorrenciaSequencia) return;
    var r = rs[0], h = rs[1], c = h.cliente || {};
    var rotulo = r.agendamentos === 0 ? (r.cancelados ? 'Somente agendamento(s) cancelado(s)' : 'Sem agendamentos registrados') : r.agendamentos === 1 ? (r.cancelados ? '1 agendamento ativo; há cancelamento(s)' : 'Primeiro agendamento registrado') : 'Cliente com mais de um agendamento';
    var media = r.media_dias === null ? 'Ainda não calculável' : 'A cada ' + r.media_dias + (r.media_dias === 1 ? ' dia' : ' dias') + ' em média';
    var html = '<div class="imperio-recorrencia-resumo"><div class="imperio-recorrencia-situacao">' + esc(rotulo) + '</div>' +
      '<div class="imperio-recorrencia-kpis"><div><b>' + Number(r.agendamentos) + '</b><span>agendamento(s) registrado(s)</span></div><div><b>' + Number(r.concluidos) + '</b><span>atendimento(s) concluído(s)</span></div></div>' +
      '<p><b>Último atendimento:</b> ' + (r.ultima_visita ? esc(imperioDataCompleta(r.ultima_visita)) : 'nenhum registrado') + '<br>' +
      '<b>Frequência entre atendimentos:</b> ' + esc(media) + '</p>' +
      '<p class="imperio-recorrencia-nota">Considera apenas o histórico registrado neste painel. Agendamentos incluem reservas ativas e concluídas; cancelados não entram nessa contagem. A frequência usa atendimentos concluídos com data válida.</p>' +
      (r.cancelados ? '<p>Cancelados: ' + Number(r.cancelados) + '</p>' : '') + '</div>' +
      (c.telefone ? '<div class="imperio-recorrencia-contato">Telefone: ' + esc(c.telefone) + '</div>' : '') +
      (c.obs ? '<div class="campo"><label>Preferências / observações</label><div>' + esc(c.obs) + '</div></div>' : '') +
      '<h3>Histórico de agendamentos</h3><p class="imperio-recorrencia-nota">Últimos 50 registros, incluindo cancelados.</p>' +
      (h.agendamentos.length ? h.agendamentos.map(function (a) {
        return '<div class="item"><div class="l1"><div class="tit">' + esc(a.servico_nome || 'Serviço') + '</div>' + statusPill(a.status) + '</div>' +
          '<div class="meta">' + esc(imperioDataCompleta(a.data)) + (a.hora ? ' · ' + esc(a.hora) : a.periodo ? ' · ' + esc(a.periodo) : '') +
          (a.barbeiro ? ' · ' + esc(a.barbeiro) : '') + (S.papel === 'admin' ? ' · ' + esc(dinheiro2(a.valor_cents)) : '') + '</div></div>';
      }).join('') : '<div class="vazio">Nenhum agendamento registrado.</div>');
    abrirSheet('Recorrência de ' + (c.nome || 'cliente'), html, function () { fecharSheet(); }, 'Fechar');
  }).catch(function (e) { if (seq === imperioRecorrenciaSequencia) toast(e.message || 'Não foi possível carregar a recorrência.'); });
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-imperio-recorrencia]');
  if (!b) return;
  var id = Number(b.getAttribute('data-imperio-recorrencia'));
  if (id > 0) { e.preventDefault(); imperioMostrarRecorrencia(id); }
});
