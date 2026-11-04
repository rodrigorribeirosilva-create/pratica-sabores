/* Filtros: nenhum cliente sem visitas importadas é tratado como ausente. */
var imperioFiltroClientes = 'todos', imperioClientesSequencia = 0;
function imperioResumoFrequencia(a) {
  if (!a || Number(a.total_concluidos) === 0) return 'Sem atendimento concluído no histórico<br>0 visita(s) neste mês · 0 atendimento(s) concluído(s) no histórico<br>Média ainda não calculável';
  var total=Number(a.total_concluidos)||0, mes=Number(a.no_mes)||0, datados=Number(a.atendimentos)||0, sem=Number(a.sem_data)||0;
  var perfil=total===1 && datados===1 && sem===0 && Number(a.data_futura)===0 ? 'Primeiro atendimento registrado' : total>1 ? 'Cliente recorrente no histórico' : 'Histórico a conferir';
  var media=a.media_dias===null || a.media_dias===undefined ? 'Média ainda não calculável' : Number(a.media_dias)===0 ? 'Média inferior a 1 dia' : 'Média de '+Number(a.media_dias)+' dia(s) entre visitas';
  return '<b>'+perfil+'</b><br>'+mes+' visita(s) neste mês · '+total+' atendimento(s) concluído(s) no histórico<br>'+media+(sem?' · '+sem+' sem data':'');
}
(function () {
  var filtros = document.querySelector('.imperio-filtros-lista');
  var relatorio = document.getElementById('imperioRelatorioClientes');
  if (filtros) filtros.addEventListener('click', function (e) {
    var botao = e.target.closest('button[data-imperio-filtro]');
    if (!botao) return;
    imperioFiltroClientes = botao.getAttribute('data-imperio-filtro');
    filtros.querySelectorAll('button').forEach(function (b) { var ativo = b === botao; b.classList.toggle('on', ativo); b.setAttribute('aria-pressed', String(ativo)); });
    carregarClientes();
  });
  if (relatorio) {
    relatorio.addEventListener('click', function () { var destino = document.querySelector('.nav button[data-tab="relatorios"]'); if (destino && !destino.classList.contains('oculto')) destino.click(); });
    document.addEventListener('imperio-papel-pronto', function () { relatorio.hidden = S.papel !== 'admin'; });
  }
})();
/* Seleção e exclusão de clientes somente para o administrador da Império. */
(function () {
  var caixa = $('imperioSelecaoClientes'), lista = $('listaClientes');
  if (!caixa || !lista) return;
  var todos = $('imperioSelecionarTodos'), excluir = $('imperioExcluirClientes');
  var contador = $('imperioContadorClientes'), aviso = $('imperioErroClientes');
  var selecionados = new Set(), ocupado = false;
  function visiveis() {
    return Array.prototype.map.call(lista.querySelectorAll('.item'), function (item) {
      var botao = item.querySelector('[data-acao="editarCliente"]'), titulo = item.querySelector('.tit');
      return botao ? { id:Number(botao.getAttribute('data-id')), nome:titulo ? titulo.textContent : 'Cliente' } : null;
    }).filter(Boolean);
  }
  function desenhar() {
    var dono = S.papel === 'admin'; caixa.hidden = !dono;
    var clientesVisiveis = visiveis();
    var atuais = new Set(clientesVisiveis.map(function (c) { return c.id; }));
    selecionados.forEach(function (id) { if (!atuais.has(id)) selecionados.delete(id); });
    Array.prototype.forEach.call(lista.querySelectorAll('.item'), function (item) {
      var editar = item.querySelector('[data-acao="editarCliente"]');
      if (!editar) return;
      var id = Number(editar.getAttribute('data-id'));
      var entrada = item.querySelector('[data-imperio-cliente]');
      if (!dono) { if (entrada) entrada.parentNode.remove(); return; }
      if (!entrada) {
        var cliente = clientesVisiveis.find(function (c) { return c.id === id; });
        if (!cliente) return;
        var rotulo = document.createElement('label'); rotulo.className = 'imperio-selecionar-cliente';
        entrada = document.createElement('input'); entrada.type = 'checkbox'; entrada.setAttribute('data-imperio-cliente', String(id));
        entrada.setAttribute('aria-label', 'Selecionar ' + cliente.nome);
        var texto = document.createElement('span'); texto.textContent = 'Selecionar';
        rotulo.appendChild(entrada); rotulo.appendChild(texto); item.insertBefore(rotulo, item.firstChild);
      }
      entrada.checked = selecionados.has(id); entrada.disabled = ocupado;
    });
    contador.textContent = selecionados.size + (selecionados.size === 1 ? ' selecionado' : ' selecionados');
    excluir.disabled = ocupado || !selecionados.size;
    todos.disabled = ocupado || !clientesVisiveis.length;
    todos.textContent = clientesVisiveis.length && selecionados.size === clientesVisiveis.length ? 'Limpar seleção' : 'Selecionar exibidos';
  }
  lista.addEventListener('change', function (e) {
    var entrada = e.target.closest('input[data-imperio-cliente]');
    if (!entrada || S.papel !== 'admin' || ocupado) return;
    var id = Number(entrada.getAttribute('data-imperio-cliente'));
    if (entrada.checked) selecionados.add(id); else selecionados.delete(id);
    aviso.textContent = ''; desenhar();
  });
  todos.addEventListener('click', function () {
    if (S.papel !== 'admin' || ocupado) return;
    var clientesVisiveis = visiveis();
    if (selecionados.size === clientesVisiveis.length) selecionados.clear();
    else clientesVisiveis.forEach(function (c) { selecionados.add(c.id); });
    aviso.textContent = ''; desenhar();
  });
  excluir.addEventListener('click', async function () {
    if (S.papel !== 'admin' || ocupado || !selecionados.size) return;
    var escolhidos = visiveis().filter(function (c) { return selecionados.has(c.id); });
    var nomes = escolhidos.slice(0, 8).map(function (c) { return '• ' + c.nome; }).join('\n');
    if (escolhidos.length > 8) nomes += '\n• e mais ' + (escolhidos.length - 8);
    if (!confirm('Excluir ' + escolhidos.length + ' cliente(s)?\n\n' + nomes + '\n\nEsta exclusão é definitiva. Clientes com agendamentos ou outros registros vinculados não serão excluídos.')) return;
    ocupado = true; aviso.textContent = ''; desenhar();
    try {
      var r = await api('/imperio-clientes/excluir', { method: 'POST', body: { ids: escolhidos.map(function (c) { return Number(c.id); }) } });
      selecionados.clear(); aviso.textContent = (r.excluidos || 0) + ' cliente(s) excluído(s).';
      carregarClientes(); carregarPainel();
    } catch (e) { aviso.textContent = e.message || 'Não foi possível excluir os clientes.'; }
    finally { ocupado = false; desenhar(); }
  });
  new MutationObserver(desenhar).observe(lista, { childList:true, subtree:true });
  document.addEventListener('imperio-papel-pronto', desenhar);
  desenhar();
})();
