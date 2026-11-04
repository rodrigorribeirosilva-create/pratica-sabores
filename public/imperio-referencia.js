/* Controles de apresentação da Império; usam os dados e ações já existentes. */
function imperioAtualizarDiaAgenda(iso) {
  var destino = $('imperioGradeDia');
  if (!destino || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
  destino.textContent = new Intl.DateTimeFormat('pt-BR', { weekday:'long' }).format(new Date(iso + 'T12:00:00'));
}
(function () {
  var busca = $('imperioBuscaServico'), categoria = $('imperioCategoriaServico');
  var lista = $('listaServ'), contagem = $('imperioServicosContagem');
  function normalizar(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim(); }
  function atualizarCategorias() {
    if (!categoria) return;
    var atual = categoria.value;
    var nomes = Array.from(new Set((S.servicos || []).map(function(s) { return s.categoria || 'Outros'; }))).sort(function(a,b) { return a.localeCompare(b, 'pt-BR'); });
    categoria.replaceChildren(new Option('Todas as categorias', ''));
    nomes.forEach(function(nome) { categoria.add(new Option(nome, nome)); });
    if (nomes.indexOf(atual) !== -1) categoria.value = atual;
  }
  function filtrar() {
    if (!lista || !busca || !categoria) return;
    var termo = normalizar(busca.value), cat = categoria.value, total = 0;
    lista.querySelectorAll('.item').forEach(function(item) {
      var editar = item.querySelector('[data-acao="editarServico"]');
      var s = editar && (S.servicos || []).find(function(x) { return Number(x.id) === Number(editar.dataset.id); });
      if (!s) return;
      var visivel = (!cat || (s.categoria || 'Outros') === cat) && (!termo || normalizar([s.nome, s.categoria, s.descricao].join(' ')).indexOf(termo) !== -1);
      item.hidden = !visivel;
      if (visivel) total++;
    });
    contagem.textContent = total + (total === 1 ? ' serviço exibido' : ' serviços exibidos');
  }
  if (lista && busca && categoria) {
    busca.addEventListener('input', filtrar); categoria.addEventListener('change', filtrar);
    new MutationObserver(function() { atualizarCategorias(); filtrar(); }).observe(lista, {childList:true});
  }
  var data = $('imperioDataAgenda'), anterior = $('imperioDiaAnterior'), proximo = $('imperioDiaProximo');
  function mudarDia(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    data.value = iso; imperioAtualizarDiaAgenda(iso);
    ['listaDiaData','abData','gradeData'].forEach(function(id) { if ($(id)) $(id).value = iso; });
    CAL.ref = dataDeIso(iso);
    carregarListaPessoas(); carregarAgendaBarbeiros(); carregarGrade(); carregarCalendario(); carregarAgendamentosDoDia(iso);
  }
  function passo(dias) { var d = new Date((data.value || hojeISO()) + 'T12:00:00'); d.setDate(d.getDate() + dias); mudarDia(d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0')); }
  if (data && anterior && proximo) {
    data.value = hojeISO(); imperioAtualizarDiaAgenda(data.value); anterior.addEventListener('click', function() { passo(-1); }); proximo.addEventListener('click', function() { passo(1); });
    data.addEventListener('change', function() { mudarDia(data.value); });
    ['listaDiaData','abData','gradeData'].forEach(function(id) { var campo = $(id); if(campo) campo.addEventListener('change', function() { if(campo.value && campo.value !== data.value) mudarDia(campo.value); }); });
    // Ao escolher um dia no calendário existente, o seletor superior acompanha.
    var grade = $('gradeData');
    if (grade) new MutationObserver(function() { if (grade.value && grade.value !== data.value) data.value = grade.value; }).observe(grade, {attributes:true,attributeFilter:['value']});
  }
  var gradeHoras = $('gradeHoras'), abrindoHorario = false;
  if (gradeHoras) gradeHoras.addEventListener('click', function(e) {
    var b = e.target.closest('button[data-imperio-hora]');
    if (!b || abrindoHorario) return;
    var profId = Number(imperioProfId), dia = ($('gradeData') || {}).value, hora = b.getAttribute('data-imperio-hora');
    if (!profId || !dia || !hora) { toast('Escolha o barbeiro e o dia.'); return; }
    abrindoHorario = true; b.disabled = true;
    Promise.all([api('/profissionais'), api('/servicos'), api('/clientes'), api('/agenda/config')]).then(function(r) {
      S.prof = (r[0].profissionais || []).filter(function(p) { return !!p.ativo; });
      S.servicos = r[1] || []; S.clientes = r[2] || []; S.agendaCfg = r[3] || {};
      if (!S.prof.some(function(p) { return Number(p.id) === profId; })) throw new Error('Barbeiro inativo ou indisponível.');
      if (!S.servicos.some(function(s) { return !!s.ativo; })) throw new Error('Cadastre um serviço antes de agendar.');
      formAgendamento({status:'agendado', data:dia, hora:hora, profissional_id:profId, imperio_grade:true});
    }).catch(function(e) { toast(e.message || 'Não foi possível abrir o agendamento.'); })
      .finally(function() { abrindoHorario = false; b.disabled = false; });
  });
})();
