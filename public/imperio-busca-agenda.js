// Filtro por nome, exclusivo do painel Império. Usa os profissionais já cadastrados.
(function iniciarBuscaAgendaImperio() {
  var campo = $('imperioBuscaBarbeiro'), resultados = $('imperioBuscaResultados');
  var estado = $('imperioBuscaEstado'), limpar = $('imperioBuscaLimpar');
  if (!campo || !resultados || !estado || !limpar) return;
  var profissionais = [], cadastrados = [], pedido = 0;
  function normalizar(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function atualizarAgenda() {
    if (S.aba !== 'agenda') return;
    carregarListaPessoas();
    carregarAgendaBarbeiros();
    carregarCalendario();
    carregarGrade();
    carregarAgendamentosDoDia(($('gradeData') || {}).value || hojeISO());
    carregarAgenda();
  }
  function selecionar(p) {
    imperioProfId = p ? Number(p.id) : 0;
    desenharAtalhos();
    campo.value = p ? p.nome : '';
    estado.textContent = p ? 'Agenda de ' + p.nome : 'Nenhum barbeiro ativo disponível.';
    var titulo = $('imperioGradeTitulo'); if (titulo) titulo.textContent = p ? p.nome : 'Selecione um barbeiro';
    var avatar = $('imperioGradeFoto'); if (avatar) { avatar.replaceChildren(); if (p && p.foto_url) { var img = document.createElement('img'); img.src = p.foto_url; img.alt = ''; avatar.appendChild(img); } else avatar.textContent = p ? String(p.nome || '?').charAt(0).toUpperCase() : ''; }
    limpar.hidden = true;
    resultados.hidden = true;
    resultados.replaceChildren();
    atualizarAgenda();
  }
  function exibir() {
    var q = normalizar(campo.value);
    var encontrados = profissionais.filter(function (p) { return normalizar(p.nome).indexOf(q) !== -1; });
    resultados.replaceChildren();
    if (!encontrados.length) {
      var vazio = document.createElement('div'); vazio.className = 'imperio-busca-vazio';
      vazio.textContent = q ? 'Nenhum barbeiro ativo encontrado.' : 'Nenhum barbeiro ativo cadastrado.';
      resultados.appendChild(vazio);
    } else {
      encontrados.forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'imperio-busca-opcao';
        b.textContent = p.nome; b.addEventListener('click', function () { selecionar(p); });
        resultados.appendChild(b);
      });
    }
    resultados.hidden = false;
  }
  function desenharAtalhos() {
    var box = $('imperioBarbeirosAtalhos'); if (!box) return;
    box.replaceChildren();
    cadastrados.forEach(function(p) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'imperio-barbeiro-atalho';
      b.setAttribute('aria-label', 'Ver agenda de ' + p.nome);
      b.setAttribute('aria-pressed', String(Number(p.id) === Number(imperioProfId)));
      var foto = document.createElement(p.foto_url ? 'img' : 'span');
      if (p.foto_url) { foto.src = p.foto_url; foto.alt = ''; } else foto.textContent = String(p.nome || '?').charAt(0).toUpperCase();
      b.appendChild(foto); var nome = document.createElement('small'); nome.textContent = p.nome; b.appendChild(nome);
      b.addEventListener('click', function() { selecionar(p); }); box.appendChild(b);
    });
  }
  function consultar(silencioso) {
    var vez = ++pedido;
    api('/profissionais').then(function (d) {
      if (vez !== pedido) return;
      profissionais = (d.profissionais || []).filter(function (p) { return !!p.ativo; });
      cadastrados = profissionais;
      if (profissionais.length && (!imperioProfId || !profissionais.some(function(p) { return Number(p.id) === Number(imperioProfId); }))) selecionar(profissionais[0]);
      else if (!profissionais.length) selecionar(null);
      else desenharAtalhos();
      if (!silencioso) exibir();
    }).catch(function () {
      if (vez !== pedido) return;
      resultados.replaceChildren();
      var erro = document.createElement('div'); erro.className = 'imperio-busca-vazio';
      erro.textContent = 'Não foi possível carregar a equipe. Tente novamente.';
      resultados.appendChild(erro); resultados.hidden = false;
    });
  }
  campo.addEventListener('focus', function() { consultar(false); });
  var aba = document.querySelector('.nav button[data-tab="agenda"]');
  if (aba) aba.addEventListener('click', function() { consultar(true); });
  campo.addEventListener('input', function () {
    limpar.hidden = !campo.value;
    if (profissionais.length) exibir(); else consultar(false);
  });
  campo.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { resultados.hidden = true; return; }
    if (e.key === 'Enter') { var b = resultados.querySelector('button'); if (b && !resultados.hidden) { e.preventDefault(); b.click(); } }
  });
  limpar.addEventListener('click', function () { campo.value = ''; limpar.hidden = true; campo.focus(); consultar(false); });
  document.addEventListener('click', function (e) { if (!e.target.closest('#imperioBuscaCard')) resultados.hidden = true; });
})();
