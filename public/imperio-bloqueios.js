// Bloqueios de um único dia; não altera agendamentos nem configurações dos barbeiros.
(function () {
  var abrir = $('imperioAbrirBloqueios'), dialog = $('imperioBloqueiosDialog');
  var form = $('imperioBloqueiosForm'), lista = $('imperioBloqueiosLista'), erro = $('imperioBloqueiosErro');
  if (!abrir || !dialog || !form) return;
  var contexto = null, salvando = false;
  function consultar() {
    if (!contexto) return;
    lista.textContent = 'Carregando…';
    api('/agenda/bloqueios?profissional=' + encodeURIComponent(contexto.prof) + '&data=' + encodeURIComponent(contexto.data)).then(function (d) {
      lista.replaceChildren();
      if (!d.bloqueios.length) { lista.textContent = 'Nenhum bloqueio neste dia.'; return; }
      d.bloqueios.forEach(function (x) {
        var linha = document.createElement('div'); linha.className = 'imperio-bloqueio-item';
        var texto = document.createElement('span'); texto.textContent = x.inicio + ' às ' + x.fim;
        var remover = document.createElement('button'); remover.type = 'button'; remover.className = 'btn'; remover.textContent = 'Remover';
        remover.setAttribute('aria-label', 'Remover bloqueio das ' + x.inicio + ' às ' + x.fim);
        remover.addEventListener('click', function () {
          if (salvando || !confirm('Remover este bloqueio? O horário voltará a ficar disponível se não houver outro impedimento.')) return;
          salvando = true; remover.disabled = true; erro.textContent = '';
          api('/agenda/bloqueios/' + encodeURIComponent(x.id), {method:'DELETE'}).then(function () { consultar(); carregarGrade(); carregarCalendario(); carregarAgendaBarbeiros(); }).catch(function (e) { erro.textContent = e.message; remover.disabled = false; }).finally(function () { salvando = false; });
        });
        linha.appendChild(texto); linha.appendChild(remover); lista.appendChild(linha);
      });
    }).catch(function (e) { lista.textContent = 'Não foi possível carregar os bloqueios: ' + e.message; });
  }
  abrir.addEventListener('click', function () {
    var prof = Number(imperioProfId), data = ($('gradeData') || {}).value;
    if (!prof || !data) { toast('Selecione um barbeiro e um dia.'); return; }
    contexto = {prof:prof, data:data};
    $('imperioBloqueiosContexto').textContent = $('imperioGradeTitulo').textContent + ' · ' + data.split('-').reverse().join('/');
    erro.textContent = ''; form.reset(); dialog.showModal(); consultar();
  });
  $('imperioBloqueiosFechar').addEventListener('click', function () { if (!salvando) dialog.close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); if (!contexto || salvando) return;
    var inicio = $('imperioBloqueioInicio').value, fim = $('imperioBloqueioFim').value;
    if (!inicio || !fim || inicio >= fim) { erro.textContent = 'Informe o início e um fim posterior.'; return; }
    erro.textContent = ''; salvando = true; var botao = form.querySelector('button'); botao.disabled = true;
    api('/agenda/bloqueios', {method:'POST', body:{profissional_id:contexto.prof, data:contexto.data, inicio:inicio, fim:fim}}).then(function () {
      form.reset(); consultar(); carregarGrade(); carregarCalendario(); carregarAgendaBarbeiros(); toast('Horário bloqueado.');
    }).catch(function (e) { erro.textContent = e.message; }).finally(function () { salvando = false; botao.disabled = false; });
  });
})();
