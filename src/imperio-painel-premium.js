'use strict';
// Apresentação exclusiva da Império. Os mesmos elementos e eventos do painel são preservados.
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../public/imperio-painel-premium.css'), 'utf8');
const buscaAgenda = fs.readFileSync(path.join(__dirname, '../public/imperio-busca-agenda.js'), 'utf8');
const menuPainel = fs.readFileSync(path.join(__dirname, '../public/imperio-menu-painel.js'), 'utf8');
const clientesImperio = fs.readFileSync(path.join(__dirname, '../public/imperio-clientes.js'), 'utf8');
const referenciaImperio = fs.readFileSync(path.join(__dirname, '../public/imperio-referencia.js'), 'utf8');
const bloqueiosImperio = fs.readFileSync(path.join(__dirname, '../public/imperio-bloqueios.js'), 'utf8');
const recorrenciaImperio = fs.readFileSync(path.join(__dirname, '../public/imperio-recorrencia.js'), 'utf8');
const coresImperio = fs.readFileSync(path.join(__dirname, '../public/imperio-cores.js'), 'utf8');
const planosImperio = fs.readFileSync(path.join(__dirname, '../public/imperio-planos.js'), 'utf8');
const cartazImperio = fs.readFileSync(path.join(__dirname, '../public/imperio-cartaz-admin.js'), 'utf8');
const caminhos = {
  hoje:'<path d="m3 10 9-7 9 7v10H4V10"/><path d="M9 20v-6h6v6"/>',
  agenda:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 18h2"/>',
  clientes:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2c0-3 2-5 6-5s6 2 6 5v2H3ZM16 5a3 3 0 0 1 0 6M18 14c2 1 3 2 3 4v2h-3"/>',
  equipe:'<circle cx="8" cy="8" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 20v-2c0-3 2-5 6-5s6 2 6 5v2H2ZM15 14c4-.4 7 1 7 4v2h-5"/>',
  servicos:'<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="m8 7 13 11M8 17 21 6M12 12h.01"/>',
  promocoes:'<path d="m3 11 14-6v14L3 13v-2ZM7 14l1.5 6h3L10 14M20 8v8"/>',
  financeiro:'<circle cx="12" cy="12" r="9"/><path d="M15 9c-.7-1-1.6-1.4-3-1.4-1.7 0-3 1-3 2.3s1.2 2 3 2.3 3 1 3 2.3-1.3 2.3-3 2.3c-1.4 0-2.5-.5-3.2-1.5M12 5.5v13"/>',
  relatorios:'<path d="M4 20h16M6 17v-4M11 17V8M16 17V4M4 20V4"/>',
  notificacao:'<path d="M18 8a6 6 0 0 0-12 0c0 7-2 7-2 9h16c0-2-2-2-2-9ZM10 20a2 2 0 0 0 4 0"/>',
  config:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.4-2-3.4-2.3 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 3.2a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.4a7 7 0 0 0 0 2l-2 1.4 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.4 3.2h5l.4-3.2a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.4a7 7 0 0 0 .1-1Z"/>',
  menu:'<path d="m6 9 6 6 6-6"/>', resumo:'<path d="M20 11.5a8 8 0 0 1-8 8 8 8 0 0 1-3.6-.8L4 20l1.2-4.2A8 8 0 1 1 20 11.5Z"/><path d="M8 9h8M8 12h6"/>',
  sair:'<path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/>',
  novo:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M12 13v5M9.5 15.5h5"/>',
  relogio:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
function icon(nome) { return '<svg class="icone-premium" aria-hidden="true" viewBox="0 0 24 24">' + caminhos[nome] + '</svg>'; }
function aplicar(html) {
  html = html.replace('</head>', '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Painel Império"><style id="imperio-premium">' + css + '</style></head>');
  // Menu único, lateral no computador e retrátil no celular, sem mudar as abas originais.
  // A lista mantém as ações existentes e ganha a organização e filtros da referência.
  html = html.replace('<section id="tab-clientes" class="oculto">\n      <div class="card" style="padding:10px">', `<section id="tab-clientes" class="oculto">
      <div class="imperio-clientes-topo"><button type="button" class="btn" id="imperioRelatorioClientes">Relatórios</button><button class="btn main" id="btnNovoCliente">+ Cadastrar</button></div>
      <div class="card imperio-pesquisa-clientes" style="padding:10px">`);
  html = html.replace('<button class="btn main bloco" id="btnNovoCliente" style="margin-bottom:12px">+ Novo cliente</button>', `<details class="imperio-filtros-clientes"><summary>Frequência de clientes</summary><div class="imperio-filtros-lista" role="group" aria-label="Filtrar clientes por frequência e última visita"><button type="button" class="on" data-imperio-filtro="todos" aria-pressed="true">Todos</button><button type="button" data-imperio-filtro="30" aria-pressed="false">Ausente 30 dias</button><button type="button" data-imperio-filtro="60" aria-pressed="false">Ausente 60 dias</button><button type="button" data-imperio-filtro="90" aria-pressed="false">Ausente 90 dias</button><button type="button" data-imperio-filtro="120" aria-pressed="false">Ausente 120 dias</button><button type="button" data-imperio-filtro="recentes" aria-pressed="false">Cadastros recentes</button><button type="button" data-imperio-filtro="primeiro" aria-pressed="false">Primeiro atendimento registrado</button><button type="button" data-imperio-filtro="mes0" aria-pressed="false">Sem visitas no mês</button><button type="button" data-imperio-filtro="mes1" aria-pressed="false">1 visita no mês</button><button type="button" data-imperio-filtro="mes2" aria-pressed="false">2 visitas no mês</button><button type="button" data-imperio-filtro="mes3mais" aria-pressed="false">3 ou mais no mês</button><button type="button" data-imperio-filtro="sem" aria-pressed="false">Sem histórico</button></div><p>Ausência conta a partir do último atendimento concluído. Cadastros recentes são ordenados pela data de cadastro no painel; clientes importados podem aparecer juntos. Primeiro atendimento e frequência consideram somente o histórico registrado. Contamos visitas concluídas até hoje; datas ausentes ficam fora da contagem mensal e da média.</p></details><div class="imperio-clientes-contagem" id="imperioClientesContagem" aria-live="polite"></div>`);
  // A seleção reutiliza a lista e a pesquisa existentes; visível apenas ao administrador.
  html = html.replace('<div id="listaClientes"></div>', `<div id="imperioSelecaoClientes" class="imperio-selecao-clientes" hidden>
        <div class="imperio-selecao-topo"><button type="button" class="btn" id="imperioSelecionarTodos">Selecionar exibidos</button><span id="imperioContadorClientes" aria-live="polite">0 selecionados</span><button type="button" class="btn bad" id="imperioExcluirClientes" disabled>Excluir selecionados</button></div>
        <p>Para preservar o histórico, clientes com agendamentos ou outros registros vinculados não podem ser excluídos.</p><div id="imperioErroClientes" role="alert"></div>
      </div><div id="listaClientes"></div>`);
  // Uma consulta consolidada, por loja, traz somente atendimentos concluídos.
  const clientesInicio = html.indexOf('  function carregarClientes() {');
  const clientesFim = html.indexOf('  /* ---------------- equipamentos ---------------- */', clientesInicio);
  if (clientesInicio !== -1 && clientesFim !== -1) {
    let trecho = html.slice(clientesInicio, clientesFim);
    trecho = trecho.replace("api('/clientes' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function (l) {", `var sequencia = ++imperioClientesSequencia;
    var paramsClientes = new URLSearchParams();
    if (q) paramsClientes.set('q', q);
    if (['recentes','primeiro','mes0','mes1','mes2','mes3mais'].includes(imperioFiltroClientes)) paramsClientes.set('imperio_filtro', imperioFiltroClientes);
    Promise.all([api('/clientes' + (paramsClientes.toString() ? '?' + paramsClientes.toString() : '')), api('/imperio-clientes/atividade')]).then(function (resposta) {
      if (sequencia !== imperioClientesSequencia) return;
      var l = resposta[0], atividade = resposta[1], mapa = {};
      (atividade.registros || []).forEach(function (r) { mapa[Number(r.id)] = r; });
      var hoje = Date.parse(atividade.hoje + 'T00:00:00Z');
      var filtrados = l.filter(function (c) {
        var a = mapa[Number(c.id)];
        if (imperioFiltroClientes === 'todos' || imperioFiltroClientes === 'recentes') return true;
        if (imperioFiltroClientes === 'primeiro') return !!a && Number(a.atendimentos) === 1 && Number(a.sem_data) === 0 && Number(a.data_futura) === 0;
        if (imperioFiltroClientes === 'mes0') return !a || Number(a.no_mes) === 0;
        if (imperioFiltroClientes === 'mes1') return !!a && Number(a.no_mes) === 1;
        if (imperioFiltroClientes === 'mes2') return !!a && Number(a.no_mes) === 2;
        if (imperioFiltroClientes === 'mes3mais') return !!a && Number(a.no_mes) >= 3;
        if (imperioFiltroClientes === 'sem') return !a || Number(a.total_concluidos) === 0;
        if (!a || !a.ultima_visita) return false;
        var dias = Math.floor((hoje - Date.parse(a.ultima_visita + 'T00:00:00Z')) / 86400000);
        return Number.isFinite(dias) && dias >= Number(imperioFiltroClientes);
      });
      if (imperioFiltroClientes === 'recentes') filtrados.sort(function (a,b) { return String(b.criado_em||'').localeCompare(String(a.criado_em||'')) || Number(b.id)-Number(a.id); });
      $('imperioClientesContagem').textContent = filtrados.length + (filtrados.length === 1 ? ' cliente exibido' : ' clientes exibidos');`);
    trecho = trecho.replace("$('listaClientes').innerHTML = l.length\n        ? l.map(function (c) {", "$('listaClientes').innerHTML = filtrados.length\n        ? filtrados.map(function (c) {");
    trecho = trecho.replace("'<div class=\"meta\">' +\n                (c.telefone ?", "'<div class=\"imperio-visitas\">' + imperioResumoFrequencia(mapa[Number(c.id)]) + '</div>' +\n              '<div class=\"meta\">' +\n                (c.telefone ?");
    trecho = trecho.replace("'<div class=\"l1\"><div class=\"tit\">' + esc(c.nome) + '</div>' +", "'<div class=\"l1\"><button type=\"button\" class=\"tit imperio-cliente-recorrencia\" data-imperio-recorrencia=\"' + c.id + '\">' + esc(c.nome) + '</button>' +");
    trecho = trecho.replace("' encontrado' : ' cadastrado ainda'", "' encontrado' : imperioFiltroClientes !== 'todos' ? ' neste filtro' : ' cadastrado ainda'");
    trecho = trecho.replace("}).catch(function () {});", "}).catch(function () { if (sequencia === imperioClientesSequencia) $('imperioClientesContagem').textContent = 'Não foi possível carregar os clientes. Tente novamente.'; });");
    html = html.slice(0, clientesInicio) + trecho + html.slice(clientesFim);
  }
  html = html.replace("      S.papel = func ? 'funcionario' : 'admin';", "      S.papel = func ? 'funcionario' : 'admin';\n      document.dispatchEvent(new Event('imperio-papel-pronto'));" );
  html = html.replace('<div class="topo-linha">', `<div class="topo-linha"><button type="button" id="imperioAbrirMenu" aria-controls="imperioMenu" aria-expanded="false" aria-label="Abrir menu">☰</button>`);
  // A nova área é exclusiva do dono na Império e não altera o menu de outras lojas.
  html = html.replace('<button data-tab="clientes"><span class="ic">👥</span>Clientes</button>', '<button data-tab="clientes"><span class="ic">👥</span>Clientes</button><button data-tab="planos" class="oculto" id="imperioNavPlanos"><span class="ic" aria-hidden="true">◈</span>Planos</button>');
  html = html.replace('<section id="tab-servicos" class="oculto">', `<section id="tab-planos" class="oculto"><div class="card"><h2>Cartaz no link dos clientes</h2><p>Edite a imagem e a chamada para os planos e assinaturas.</p><button type="button" class="btn" id="imperioEditarCartaz">Editar cartaz</button></div><div class="imperio-planos-aviso">Controle manual: não cobra cartão, não confirma pagamentos automaticamente e não lança valores no caixa ou financeiro. A quantidade de serviços incluídos não é controlada automaticamente.</div><div class="imperio-planos-nav"><button type="button" class="on" data-planos-visao="planos">Planos e pacotes</button><button type="button" data-planos-visao="assinantes">Assinantes e pagamentos</button></div><div id="imperioPlanosConteudo"></div></section><section id="tab-servicos" class="oculto">`);
  html = html.replace("['hoje', 'agenda', 'clientes', 'equipamentos', 'equipe', 'servicos', 'promocoes', 'financeiro', 'relatorios', 'empresa'].forEach", "['hoje', 'agenda', 'clientes', 'equipamentos', 'equipe', 'servicos', 'promocoes', 'financeiro', 'relatorios', 'empresa', 'planos'].forEach");
  html = html.replace("      if (alvo === 'clientes') carregarClientes();", "      if (alvo === 'clientes') carregarClientes();\n      if (alvo === 'planos') carregarPlanosImperio();");
  html = html.replace('<nav class="nav">', `<button type="button" id="imperioFundoMenu" aria-label="Fechar menu" hidden></button><nav class="nav" id="imperioMenu" aria-label="Navegação do painel"><div class="imperio-menu-titulo"><b>IMPÉRIO</b><span>PAINEL ADMINISTRATIVO</span></div>`);
  html = html.replace('<main>\n    <!-- ---------------- HOJE', `<main>\n    <div class="imperio-pagina-cabecalho"><span>PAINEL ADMINISTRATIVO</span><h1 id="imperioPaginaTitulo">Visão geral</h1></div>\n    <!-- ---------------- HOJE`);
  html = html.replace('      S.aba = alvo;', `      S.aba = alvo;
      var titulosImperio = {hoje:'Visão geral', agenda:'Agenda', clientes:'Clientes', equipamentos:'Aparelhos', equipe:'Equipe', servicos:'Serviços', promocoes:'Promoções', financeiro:'Financeiro', relatorios:'Relatórios', planos:'Planos e assinantes', empresa:'Dados da loja'};
      if (document.getElementById('imperioPaginaTitulo')) document.getElementById('imperioPaginaTitulo').textContent = titulosImperio[alvo] || 'Painel';`);
  for (const nome of ['hoje','agenda','clientes','equipe','servicos','promocoes','financeiro','relatorios']) {
    const re = new RegExp('(<button data-tab="' + nome + '"[^>]*><span class="ic">)[^<]*(</span>)');
    html = html.replace(re, (_, a, b) => a + icon(nome) + b);
  }
  const antes = `<button class="icobtn" id="btnResumo" title="Resumo do dia no WhatsApp">💬</button>
        <button class="icobtn" id="btnConfig" title="Dados da empresa">⚙️</button>
        <button class="icobtn" id="btnSair" title="Sair">⏏</button>`;
  const depois = `<button type="button" class="icobtn" id="imperioNotificacao" title="Ver pedidos" aria-label="Ver pedidos">${icon('notificacao')}<span class="indicador oculto" aria-hidden="true"></span></button>
        <button class="icobtn" id="btnConfig" title="Dados da empresa" aria-label="Dados da empresa">${icon('config')}</button>
        <details class="opcoes-topo"><summary title="Opções" aria-label="Opções">${icon('menu')}</summary><div class="opcoes-lista">
        <button class="icobtn" id="btnResumo" title="Resumo do dia no WhatsApp">${icon('resumo')} Resumo no WhatsApp</button>
        <button class="icobtn" id="btnSair" title="Sair">${icon('sair')} Sair do painel</button></div></details>`;
  html = html.replace(antes, () => depois);
  html = html.replace('id="btnHojeNovo">+ Novo agendamento', 'id="btnHojeNovo">' + icon('novo') + ' Novo agendamento');
  html = html.replace('id="btnHojeGrade">🕐 Horários de hoje', 'id="btnHojeGrade">' + icon('relogio') + ' Horários de hoje');
  // Busca e navegação por data reaproveitam a agenda e não alteram agendamentos.
  html = html.replace('<section id="tab-agenda" class="oculto">', `<section id="tab-agenda" class="oculto">
    <div class="imperio-data-agenda"><button type="button" id="imperioDiaAnterior" aria-label="Dia anterior">‹</button><input type="date" id="imperioDataAgenda" aria-label="Data da agenda"><button type="button" id="imperioDiaProximo" aria-label="Dia seguinte">›</button></div>
    <div class="card" id="imperioBuscaCard">
      <div id="imperioBarbeirosAtalhos" class="imperio-barbeiros-atalhos" aria-label="Selecionar barbeiro"></div>
      <div id="imperioBuscaEstado" class="imperio-busca-estado" aria-live="polite">Selecionando barbeiro ativo…</div>
      <details class="imperio-busca-expandir"><summary>Buscar barbeiro pelo nome</summary>
      <label for="imperioBuscaBarbeiro" class="imperio-busca-titulo">Buscar agenda por barbeiro</label>
      <div class="imperio-busca-linha"><input type="search" id="imperioBuscaBarbeiro" placeholder="Digite o nome do barbeiro" autocomplete="off" aria-describedby="imperioBuscaEstado"><button type="button" class="btn" id="imperioBuscaLimpar" hidden>Limpar busca</button></div>
      <div id="imperioBuscaResultados" class="imperio-busca-resultados" hidden></div>
      <p class="imperio-origem-ajuda">Aqui aparecem os agendamentos feitos pelo link e os lançados no painel. Conversas no WhatsApp, sem o link, devem ser lançadas manualmente.</p></details>
    </div>`);
  html = html.replace('<div class="campo" style="margin:0"><label>Barbeiro</label><select id="gradeProf">', '<div class="campo imperio-grade-prof" style="margin:0"><label>Barbeiro</label><select id="gradeProf">');
  html = html.replace('<div class="card" style="padding:12px">\n        <h2>🕐 Grade do dia', '<div class="card" id="imperioCardGrade" style="padding:12px"><div class="imperio-grade-cabecalho"><span id="imperioGradeFoto" class="imperio-grade-foto" aria-hidden="true"></span><span id="imperioGradeTitulo" class="imperio-grade-titulo">Agenda dos barbeiros</span><span id="imperioGradeDia"></span><button type="button" id="imperioAbrirBloqueios" title="Gerenciar bloqueios" aria-label="Gerenciar bloqueios deste barbeiro"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18M9 14l6 5M15 14l-6 5"/></svg></button></div><button type="button" id="imperioAbrirCores" class="imperio-cores-abrir" hidden>◉ Cores da agenda</button><dialog id="imperioBloqueiosDialog"><div class="imperio-bloqueios-conteudo"><h2>Bloquear horários</h2><p id="imperioBloqueiosContexto"></p><p>O bloqueio vale apenas para o barbeiro e a data selecionados.</p><form id="imperioBloqueiosForm"><div class="imperio-bloqueios-campos"><label>Início<input id="imperioBloqueioInicio" type="time" required></label><label>Fim<input id="imperioBloqueioFim" type="time" required></label></div><button type="submit" class="btn primario">Bloquear horário</button></form><div id="imperioBloqueiosErro" role="alert"></div><h3>Bloqueios deste dia</h3><div id="imperioBloqueiosLista"></div><button type="button" class="btn" id="imperioBloqueiosFechar">Fechar</button></div></dialog>\n        <h2>🕐 Grade do dia');
  html = html.replace('<div class="campo" style="margin:0"><label>Dia</label><input type="date" id="gradeData"></div>', '<div class="campo imperio-grade-data" style="margin:0"><label>Dia</label><input type="date" id="gradeData"></div>');
  html = html.replace("    if (gd) gd.value = iso;\n    carregarGrade();", "    if (gd) gd.value = iso;\n    if ($('imperioDataAgenda')) $('imperioDataAgenda').value = iso;\n    imperioAtualizarDiaAgenda(iso);\n    if ($('listaDiaData')) $('listaDiaData').value = iso;\n    if ($('abData')) $('abData').value = iso;\n    carregarListaPessoas(); carregarAgendaBarbeiros();\n    carregarGrade();");
  // A lista normal mostra ativos. Inativos continuam acessíveis e podem ser reativados.
  html = html.replace('<div id="listaEquipe"></div>', `<div class="imperio-equipe-filtros" role="group" aria-label="Situação dos barbeiros"><button type="button" class="on" data-imperio-equipe-visao="ativos" aria-pressed="true">Ativos</button><button type="button" data-imperio-equipe-visao="inativos" aria-pressed="false">Inativos</button></div><div id="imperioEquipeContagem" class="imperio-clientes-contagem" aria-live="polite"></div><div id="listaEquipe"></div>`);
  html = html.replace('  function carregarEquipe() {', "  var imperioEquipeVisao = 'ativos';\n  function carregarEquipe() {");
  html = html.replace("      if (!S.equipe.length) {\n        $('listaEquipe').innerHTML", "      var listaEquipeVisivel = S.equipe.filter(function(p){ return imperioEquipeVisao === 'ativos' ? Number(p.ativo) === 1 : Number(p.ativo) !== 1; });\n      var contagemEquipe = $('imperioEquipeContagem'); if(contagemEquipe) contagemEquipe.textContent = listaEquipeVisivel.length + (imperioEquipeVisao === 'ativos' ? ' barbeiro(s) ativo(s)' : ' barbeiro(s) inativo(s)');\n      if (!listaEquipeVisivel.length && S.equipe.length) { $('listaEquipe').innerHTML = '<div class=\"card\">' + (imperioEquipeVisao === 'ativos' ? 'Nenhum barbeiro ativo. Acesse Inativos para reativar.' : 'Nenhum barbeiro inativo.') + '</div>'; return; }\n      if (!S.equipe.length) {\n        $('listaEquipe').innerHTML");
  html = html.replace("      $('listaEquipe').innerHTML = S.equipe.map(function (p) {", "      $('listaEquipe').innerHTML = listaEquipeVisivel.map(function (p) {");
  html = html.replace('  /** Foto do barbeiro: envio direto, com prévia grande. */', `  Array.prototype.forEach.call(document.querySelectorAll('[data-imperio-equipe-visao]'), function(btn){ btn.addEventListener('click', function(){ imperioEquipeVisao = btn.dataset.imperioEquipeVisao; document.querySelectorAll('[data-imperio-equipe-visao]').forEach(function(x){ var on=x===btn; x.classList.toggle('on',on); x.setAttribute('aria-pressed',on?'true':'false'); }); carregarEquipe(); }); });\n  /** Foto do barbeiro: envio direto, com prévia grande. */`);
  html = html.replace("      api('/profissionais/' + r.id, { method: 'PUT', body: { nome: r.nome, apelido: r.apelido, bio: r.bio, foto_url: r.foto_url, ativo: !r.ativo, ordem: r.ordem } })", "      api('/imperio-profissionais/' + r.id + '/status', { method: 'PATCH', body: { ativo: !r.ativo } })");
  // Preserva dias personalizados quando se abre o cadastro para editar outro campo.
  html = html.replace("[['1,2,3,4,5,6', 'Seg a Sáb'], ['1,2,3,4,5', 'Seg a Sex'], ['1,2,3,4,5,6,0', 'Todos os dias']]", "[['1,2,3,4,5,6', 'Seg a Sáb'], ['1,2,3,4,5', 'Seg a Sex'], ['1,2,3,4,5,6,0', 'Todos os dias']].concat(p.dias && ['1,2,3,4,5,6','1,2,3,4,5','1,2,3,4,5,6,0'].indexOf(String(p.dias)) < 0 ? [[String(p.dias), 'Dias atuais (' + String(p.dias) + ')']] : [])");
  html = html.replace('<section id="tab-servicos" class="oculto">', `<section id="tab-servicos" class="oculto"><div class="imperio-servicos-filtros"><input type="search" id="imperioBuscaServico" aria-label="Pesquisar serviço" placeholder="Pesquisar serviço"><select id="imperioCategoriaServico" aria-label="Categoria dos serviços"><option value="">Todas as categorias</option></select></div><div id="imperioServicosContagem" class="imperio-clientes-contagem" aria-live="polite"></div>`);
  const servicosInicio = html.indexOf('  function carregarServicos() {');
  const servicosFim = html.indexOf('  /* ---------------- equipe (barbeiros) ---------------- */', servicosInicio);
  if (servicosInicio !== -1 && servicosFim !== -1) {
    let trecho = html.slice(servicosInicio, servicosFim);
    trecho = trecho.replace("return '<div class=\"item\">' +", `return '<div class="item imperio-servico-item">' +
          '<div class="imperio-servico-imagem">' + (s.imagem_url ? '<img src="' + esc(s.imagem_url) + '" alt="">' : '<span aria-hidden="true">✂</span>') + '</div>' +`);
    html = html.slice(0, servicosInicio) + trecho + html.slice(servicosFim);
  }
  html = html.replace('<button type="button" data-fin="mes" class="on">Este mês</button>', '<button type="button" data-fin="semana">Semana</button><button type="button" data-fin="mes" class="on">Este mês</button>');
  html = html.replace("    if (FIN.periodo === '30') return { de: addDiasISO(hoje, -29), ate: hoje };", "    if (FIN.periodo === 'semana') { var d = new Date(hoje + 'T12:00:00'); return { de: addDiasISO(hoje, -((d.getDay() + 6) % 7)), ate: hoje }; }\n    if (FIN.periodo === '30') return { de: addDiasISO(hoje, -29), ate: hoje };");
  html = html.replace('var S = { painel:', 'var imperioProfId = 0;\n  var S = { painel:');
  // A origem identificável é mostrada sem presumir por onde um link comum foi compartilhado.
  html = html.replace('  function itemAgendamento(a, opcoes) {', `  function origemAgendaImperio(a) {
    if (a.origem === 'site') return 'Pelo link';
    if (a.origem === 'painel' && a.origem_fonte === 'whatsapp_conversa') return 'WhatsApp · lançado no painel';
    if (a.origem === 'painel') return 'Lançado no painel';
    return 'Origem não informada';
  }
  function itemAgendamento(a, opcoes) {`);
  html = html.replace("      '<div class=\"meta\">' +\n        '<b>' + esc(a.cliente_nome || 'Cliente') + '</b>' +", "      '<div class=\"meta\">' +\n        '<span class=\"imperio-origem\">' + esc(origemAgendaImperio(a)) + '</span><br>' +\n        '<b>' + esc(a.cliente_nome || 'Cliente') + '</b>' +");
  html = html.replace("'<b>' + esc(a.cliente_nome || 'Cliente') + '</b>' +", "(a.cliente_id ? '<button type=\"button\" class=\"imperio-cliente-recorrencia\" data-imperio-recorrencia=\"' + Number(a.cliente_id) + '\">' + esc(a.cliente_nome || 'Cliente') + '</button>' : '<b>' + esc(a.cliente_nome || 'Cliente') + '</b>') +");
  html = html.replace("'<span class=\"lp-nome\"><b>' + esc(a.cliente_nome || 'Cliente') + '</b>' +", "'<span class=\"lp-nome\">' + (a.cliente_id ? '<button type=\"button\" class=\"imperio-cliente-recorrencia\" data-imperio-recorrencia=\"' + Number(a.cliente_id) + '\">' + esc(a.cliente_nome || 'Cliente') + '</button>' : '<b>' + esc(a.cliente_nome || 'Cliente') + '</b>') +");
  html = html.replace("(a.cliente_telefone ? ' · ' + esc(a.cliente_telefone) : '') + '</small></span>' +", "(a.cliente_telefone ? ' · ' + esc(a.cliente_telefone) : '') + '</small>' +\n                '<small class=\"imperio-origem-lista\">' + esc(origemAgendaImperio(a)) + '</small></span>' +");
  html = html.replace("      campo('agObs', 'Observações', a.obs_interno || a.obs_cliente || '', 'textarea') +", `      (!a.id ? '<div class="campo"><label>Como o cliente entrou em contato?</label><select id="agOrigem"><option value="painel">Lançamento no painel</option><option value="whatsapp_conversa">Conversa no WhatsApp</option></select><div class="dica">Use WhatsApp para pedidos combinados na conversa, sem usar o link.</div></div>' : '') +
      campo('agObs', 'Observações', a.obs_interno || a.obs_cliente || '', 'textarea') +`);
  html = html.replace("        obs_interno: v('agObs')\n      };", "        obs_interno: v('agObs'),\n        imperio_grade: !!a.imperio_grade,\n        origem_fonte: !a.id && v('agOrigem') === 'whatsapp_conversa' ? 'whatsapp_conversa' : ''\n      };");
  html = html.replace("      if (!corpo.data) throw new Error('Escolha o dia.');", "      if (!corpo.data) throw new Error('Escolha o dia.');\n      if (a.imperio_grade && (!corpo.hora || !corpo.profissional_id || !corpo.servico_id)) throw new Error('Escolha um horário disponível, barbeiro e serviço.');");
  html = html.replace("    // mostra na hora quais períodos daquele dia já estão tomados\n    function marcarOcupacao() {", `    var imperioVerificacao = 0;
    function conferirGradeSelecionada() {
      var d = v('agData'), hora = $('agHora'), alvo = $('agOcup'), prof = v('agProf'), servico = v('agServico');
      var sequencia = ++imperioVerificacao;
      if (!d || !prof || !servico || !hora) { if (hora) hora.value = ''; return; }
      var anterior = hora.value;
      alvo.textContent = 'Conferindo disponibilidade…';
      api('/agenda/disponibilidade?data=' + encodeURIComponent(d) + '&servico=' + encodeURIComponent(servico) + '&profissional=' + encodeURIComponent(prof))
        .then(function(g) {
          if (sequencia !== imperioVerificacao || $('agHora') !== hora) return;
          var disponiveis = (g.horarios || []).filter(function(h) { return h.livre; });
          hora.innerHTML = '<option value="">— escolher —</option>' + disponiveis.map(function(h) { return '<option value="' + esc(h.hora) + '"' + (h.hora === anterior ? ' selected' : '') + '>' + esc(h.hora) + ' — disponível</option>'; }).join('');
          alvo.textContent = anterior && !disponiveis.some(function(h) { return h.hora === anterior; }) ? 'Esse horário não está disponível para o serviço escolhido. Selecione outro.' : 'Disponibilidade conferida para o serviço e barbeiro selecionados.';
        }).catch(function() { if (sequencia === imperioVerificacao && $('agHora') === hora) { hora.innerHTML = '<option value="">— escolher —</option>'; alvo.textContent = 'Não foi possível conferir os horários. Tente novamente.'; } });
    }
    if (a.imperio_grade) { ['agServico','agProf'].forEach(function(id) { if ($(id)) $(id).addEventListener('change', conferirGradeSelecionada); }); }
    // mostra na hora quais períodos daquele dia já estão tomados
    function marcarOcupacao() {
      if (a.imperio_grade) return conferirGradeSelecionada();`);
  // Busca só a data exibida, para a lista do dia não depender dos últimos 400 registros.
  html = html.replace("return api('/agendamentos?status=todos').then(function (lista) {", "return api('/agendamentos?status=todos&de=' + encodeURIComponent(data) + '&ate=' + encodeURIComponent(data)).then(function (lista) {");
  html = html.replace("api('/agendamentos?status=todos').then(function (l) {", "api('/agendamentos?status=todos&de=' + encodeURIComponent(iso) + '&ate=' + encodeURIComponent(iso)).then(function (l) {");
  html = html.replace("var prof = Number(($('filtroBarbeiro') || {}).value || 0);", 'var prof = imperioProfId;');
  html = html.split("var prof = ($('gradeProf') && $('gradeProf').value) || 0;").join('var prof = imperioProfId;');
  html = html.replace("return String(a.data) === String(data) && a.status !== 'cancelado';", "return String(a.data) === String(data) && a.status !== 'cancelado' && (!imperioProfId || Number(a.profissional_id) === imperioProfId);");
  html = html.replace("var doDia = (l || []).filter(function (a) { return a.data === iso; })", "var doDia = (l || []).filter(function (a) { return a.data === iso && (!imperioProfId || Number(a.profissional_id) === imperioProfId); })");
  // Não deixar uma resposta antiga substituir o resultado de uma busca mais recente.
  const ini = html.indexOf('  function carregarAgendaBarbeiros()');
  const fim = html.indexOf('  /* ---------------- calendário do painel:', ini);
  if (ini !== -1 && fim !== -1) {
    let trecho = html.slice(ini, fim);
    trecho = trecho.replace("var cx = $('abColunas');", "var cx = $('abColunas');\n    var filtroBusca = imperioProfId;");
    trecho = trecho.replace("var lista = (d.profissionais || []).filter(function (p) { return p.ativo; });", "if (filtroBusca !== imperioProfId || data !== (($('abData') || {}).value || hojeISO())) return;\n      var lista = (d.profissionais || []).filter(function (p) { return p.ativo && (!filtroBusca || Number(p.id) === filtroBusca); });");
    trecho = trecho.replace(').then(function (res) {\n        var livres', ").then(function (res) {\n        if (filtroBusca !== imperioProfId || data !== (($('abData') || {}).value || hojeISO())) return;\n        var livres");
    html = html.slice(0, ini) + trecho + html.slice(fim);
  }
  html = html.replace(".then(function (r) {\n        CAL.dados = r.dias || [];", ".then(function (r) {\n        if (Number(prof) !== imperioProfId) return;\n        CAL.dados = r.dias || [];");
  html = html.replace(".then(function (g) {\n        var lista = g.horarios || [];\n        if (!lista.length) { cx.innerHTML = '<div class=\"vazio\">Nesse dia a loja não abre.</div>';", ".then(function (g) {\n        if (Number(prof) !== imperioProfId || data !== (($('gradeData') || {}).value || hojeISO())) return;\n        var lista = g.horarios || [];\n        if (!lista.length) { cx.innerHTML = '<div class=\"vazio\">Nesse dia a loja não abre.</div>';");
  html = html.replace("&ate=' + encodeURIComponent(data)).then(function (lista) {\n      var doDia", "&ate=' + encodeURIComponent(data)).then(function (lista) {\n      if (data !== (($('listaDiaData') || {}).value || hojeISO())) return;\n      var doDia");
  html = html.replace("&ate=' + encodeURIComponent(iso)).then(function (l) {\n      var doDia", "&ate=' + encodeURIComponent(iso)).then(function (l) {\n      if (iso !== (($('gradeData') || {}).value || hojeISO())) return;\n      var doDia");
  // Disponibilidade sem nome não é apresentada como livre nem como agendamento.
  const gradeInicio = html.indexOf('  function carregarGrade() {');
  const gradeFim = html.indexOf('  /* ---------------- agenda: vagas', gradeInicio);
  if (gradeInicio !== -1 && gradeFim !== -1) {
    let trecho = html.slice(gradeInicio, gradeFim);
    trecho = trecho.replace("    var prof = imperioProfId;\n    cx.innerHTML", "    var prof = imperioProfId;\n    if (!prof) { $('qGrade').textContent = '0'; cx.innerHTML = '<div class=\"vazio\">Selecione um barbeiro ativo para ver os horários.</div>'; return; }\n    cx.innerHTML");
    trecho = trecho.replace("lista.filter(function (h) { return !h.livre; }).length", "lista.filter(function (h) { return !!(h.cliente_nome || h.ocupado_por) || (!h.livre && !h.passou); }).length");
    trecho = trecho.replace("var passou = !!h.passou && !tomado;", "var passou = !!h.passou && !tomado;\n          var indisponivel = !tomado && !passou && !h.livre;");
    trecho = trecho.replace("(passou ? ' passou' : '') + '\">'", "(passou ? ' passou' : '') + (indisponivel ? ' indisponivel' : '') + '\">'");
    trecho = trecho.replace("tomado ? esc(quem) : passou ? 'já passou' : 'livre'", "tomado ? esc(quem) : passou ? 'já passou' : indisponivel ? 'indisponível' : 'livre'");
    trecho = trecho.replace(`return '<div class="grade-hora' + (tomado ? ' ocupado' : '') + (passou ? ' passou' : '') + (indisponivel ? ' indisponivel' : '') + '">' +
            esc(h.hora) +
            '<small>' + (tomado ? esc(quem) : passou ? 'já passou' : indisponivel ? 'indisponível' : 'livre') + '</small>' +
          '</div>';`, `var livre = h.livre && !tomado && !passou && !indisponivel && !!prof;
          var conteudo = tomado ? '<strong class="imperio-grade-hora-texto">' + esc(h.hora) + '</strong><span class="imperio-grade-cliente">' + esc(quem) + (h.cliente_telefone ? '<small>' + esc(h.cliente_telefone) + '</small>' : '') + '<small>' + esc(imperioRotuloStatus(h.status_ocupando)) + '</small></span><span class="imperio-grade-servico">' + esc(h.servico_ocupando || 'Serviço') + (Number(h.valor_cents_ocupando) > 0 ? '<small>' + esc(dinheiro2(h.valor_cents_ocupando)) + '</small>' : '') + '</span>' : '<strong>' + esc(h.hora) + '</strong><small>' + (h.bloqueado ? 'bloqueado' : passou ? 'já passou' : indisponivel ? 'indisponível' : !prof ? 'selecione um barbeiro' : 'disponível · tocar para agendar') + '</small>';
          var estiloCor = tomado ? imperioEstiloGrade(h.status_ocupando, h.servico_ref_ocupando) : h.bloqueado ? imperioEstiloGrade('bloqueado', 0) : '';
          return livre ? '<button type="button" class="grade-hora imperio-hora-livre" data-imperio-hora="' + esc(h.hora) + '" aria-label="Agendar às ' + esc(h.hora) + '">' + conteudo + '</button>' : tomado && h.cliente_id_ocupando ? '<button type="button" class="grade-hora ocupado imperio-hora-cliente" style="' + estiloCor + '" data-imperio-recorrencia="' + Number(h.cliente_id_ocupando) + '" aria-label="Ver recorrência de ' + esc(quem) + '">' + conteudo + '</button>' : '<div class="grade-hora' + (tomado ? ' ocupado' : '') + (passou ? ' passou' : '') + (indisponivel ? ' indisponivel' : '') + (h.bloqueado ? ' imperio-bloqueado' : '') + '" style="' + estiloCor + '">' + conteudo + '</div>';`);
    html = html.slice(0, gradeInicio) + trecho + html.slice(gradeFim);
  }
  html = html.replace("return '<span class=\"pill ' + st + '\">' + (rot[st] || st) + '</span>';", "return '<span class=\"pill ' + esc(st) + '\" style=\"' + imperioEstiloStatus(st) + '\">' + esc(rot[st] || st) + '</span>';");
  // Captura inclusive erros síncronos de validação, sem travar o botão do formulário.
  html = html.replace('Promise.resolve(aoEnviar()).catch', 'Promise.resolve().then(function () { return aoEnviar(); }).catch');
  html = html.replace('  function abrirHistoricoCliente(id) {', '  function abrirHistoricoCliente(id) { imperioMostrarRecorrencia(id); return;');
  html = html.replace('  /* ---------------- início ---------------- */', buscaAgenda + '\n' + menuPainel + '\n' + clientesImperio + '\n' + referenciaImperio + '\n' + bloqueiosImperio + '\n' + coresImperio + '\n' + recorrenciaImperio + '\n' + planosImperio + '\n' + cartazImperio + '\n  /* ---------------- início ---------------- */');
  // Os filtros já existentes passam a usar a lógica de período do próprio painel.
  html = html.replace("var FIN = { periodo: 'mes', dados: null };", `var FIN = { periodo: 'mes', dados: null }, imperioFinSequencia = 0;
  Array.prototype.forEach.call(document.querySelectorAll('#finPeriodo [data-fin]'), function(b) {
    b.addEventListener('click', function() {
      FIN.periodo = b.getAttribute('data-fin');
      Array.prototype.forEach.call(document.querySelectorAll('#finPeriodo [data-fin]'), function(x) { x.classList.toggle('on', x === b); });
      carregarFinanceiro();
    });
  });`);
  html = html.replace("  function carregarFinanceiro() {\n    var p = periodoFin();\n    return api('/financeiro?de=' + p.de + '&ate=' + p.ate).then(function (f) {\n      FIN.dados = f;", "  function carregarFinanceiro() {\n    var p = periodoFin(), sequencia = ++imperioFinSequencia;\n    return api('/financeiro?de=' + p.de + '&ate=' + p.ate).then(function (f) {\n      if (sequencia !== imperioFinSequencia) return;\n      FIN.dados = f;");
  const script = `<script>(function(){
    var aviso=document.getElementById('imperioNotificacao'), dot=document.getElementById('dotHoje');
    if(aviso&&dot){var indicator=aviso.querySelector('.indicador');var sync=function(){indicator.classList.toggle('oculto',dot.classList.contains('oculto'));};new MutationObserver(sync).observe(dot,{attributes:true,attributeFilter:['class']});sync();aviso.addEventListener('click',function(){var hoje=document.querySelector('.nav button[data-tab="hoje"]');if(hoje)hoje.click();setTimeout(function(){var alvo=document.getElementById('listaNovos');if(alvo)alvo.scrollIntoView({behavior:'smooth',block:'start'});},150);});}
    var atalho=document.getElementById('btnHojeGrade');if(atalho)atalho.addEventListener('click',function(e){var d=document.getElementById('imperioHorariosHoje');if(!d)return;e.stopImmediatePropagation();d.open=!d.open;d.scrollIntoView({behavior:'smooth',block:'center'});},true);
    var grafico=document.getElementById('relGrafico');if(grafico)new MutationObserver(function(){var g=grafico.querySelector('.grafico');if(g)g.scrollLeft=g.scrollWidth;}).observe(grafico,{childList:true});
    var kpis=document.getElementById('kpis');
    if(kpis){
      var preparar=function(){Array.prototype.forEach.call(kpis.querySelectorAll('.kpi'),function(card){card.setAttribute('role','button');card.setAttribute('tabindex','0');card.setAttribute('aria-label',card.innerText.replace(/\\s+/g,' ').trim()+' — abrir detalhes');});};
      new MutationObserver(preparar).observe(kpis,{childList:true});preparar();
      var abrir=function(card){
        var rotulo=(card.querySelector('.r')||{}).textContent||'';
        var destino=rotulo.indexOf('clientes hoje')!==-1?'listaHoje':rotulo.indexOf('esperando')!==-1?'listaNovos':rotulo.indexOf('próximos')!==-1?'listaSemana':'';
        if(destino){var el=document.getElementById(destino);if(el)(el.closest('.card')||el).scrollIntoView({behavior:'smooth',block:'start'});return;}
        var periodo=rotulo.indexOf('faturamento hoje')!==-1?'hoje':rotulo.indexOf('no mês')!==-1?'mes':'';
        if(periodo){var nav=document.querySelector('.nav button[data-tab="financeiro"]'),filtro=document.querySelector('#finPeriodo [data-fin="'+periodo+'"]');if(nav&&!nav.classList.contains('oculto')&&filtro){filtro.click();nav.click();}}
      };
      kpis.addEventListener('click',function(e){var card=e.target.closest('.kpi');if(card&&kpis.contains(card))abrir(card);});
      kpis.addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var card=e.target.closest('.kpi');if(card&&kpis.contains(card)){e.preventDefault();abrir(card);}});
    }
  })();</script>`;
  return html.replace('</body>', script + '</body>');
}
module.exports = { aplicar };
