// Preferências visuais somente do painel Império. As cores não mudam a disponibilidade.
var imperioCores = {status:{solicitado:'#e3c16e',agendado:'#bb89e8',a_caminho:'#9546df',concluido:'#d4d8dc',cancelado:'#db6268',bloqueado:'#f0a8ae'},servicos:{}};
var imperioRotulosCores = {solicitado:'Solicitado',agendado:'Agendado',a_caminho:'A caminho',concluido:'Concluído',cancelado:'Cancelado',bloqueado:'Bloqueado'};
function imperioCorValida(c) { return /^#[0-9a-fA-F]{6}$/.test(String(c || '')); }
function imperioTextoCor(c) {
  var x = [1,3,5].map(function(i){ var v=parseInt(c.slice(i,i+2),16)/255; return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4); });
  var l=.2126*x[0]+.7152*x[1]+.0722*x[2];
  return (l+.05)/.05 >= 1.05/(l+.05) ? '#17130f' : '#ffffff';
}
function imperioRotuloStatus(s) { return imperioRotulosCores[s] || 'Agendamento'; }
function imperioEstiloStatus(s) {
  var cor=imperioCores.status[s]; if (!imperioCorValida(cor)) return '';
  return 'background-color:' + cor + ';color:' + imperioTextoCor(cor) + ';border-color:' + cor + ';';
}
function imperioEstiloGrade(status, servico) {
  var cor=imperioCores.status[status], detalhe=imperioCores.servicos[String(Number(servico || 0))];
  var estilo=imperioCorValida(cor) ? 'background-color:' + cor + ';color:' + imperioTextoCor(cor) + ';' : '';
  if (imperioCorValida(detalhe)) estilo += 'box-shadow:inset 7px 0 0 ' + detalhe + ';';
  return estilo;
}
(function () {
  var botao=$('imperioAbrirCores'), consultando=false;
  function carregar() {
    if (consultando) return;
    consultando=true;
    api('/agenda/cores').then(function(c) {
      var anterior=JSON.stringify(imperioCores); imperioCores=c;
      if (JSON.stringify(c)!==anterior && S.aba==='agenda') { carregarGrade(); carregarListaPessoas(); carregarAgenda(); }
    }).catch(function(){}).finally(function(){consultando=false;});
  }
  document.addEventListener('imperio-papel-pronto', function() { if(botao) botao.hidden=S.papel!=='admin'; carregar(); });
  if (botao) botao.addEventListener('click', function() {
    if (S.papel!=='admin') return;
    Promise.all([api('/agenda/cores'),api('/servicos')]).then(function(result) {
      var cores=result[0], servicos=result[1] || [], html='<p>Escolha a cor de cada situação. O bloqueio tem cor própria; cancelar não ocupa o horário.</p><div class="imperio-cores-lista">';
      Object.keys(imperioRotulosCores).forEach(function(k) {
        html += '<label class="imperio-cor-linha"><span>' + esc(imperioRotulosCores[k]) + '</span><input type="color" data-cor-status="' + esc(k) + '" value="' + esc(cores.status[k]) + '" aria-label="Cor de ' + esc(imperioRotulosCores[k]) + '"></label>';
      });
      html+='</div><h3>Cor por serviço</h3><p>Opcional: a cor do serviço aparece como uma faixa no cartão, junto com a cor da situação.</p><div class="imperio-cores-lista">';
      servicos.forEach(function(s) {
        var id=Number(s.id), salvo=cores.servicos[String(id)];
        html += '<div class="imperio-cor-linha"><label><input type="checkbox" data-cor-ativar="' + id + '"' + (salvo?' checked':'') + '> ' + esc(s.nome) + (s.ativo?'':' (inativo)') + '</label><input type="color" data-cor-servico="' + id + '" value="' + esc(salvo || '#d5b36b') + '" aria-label="Cor do serviço ' + esc(s.nome) + '"></div>';
      });
      html+='</div><p class="imperio-recorrencia-nota">As cores são visuais e valem somente para este painel. As cores da loja continuam preto e dourado.</p>';
      abrirSheet('Cores da agenda',html,function(){
        var status={}, mapa={};
        document.querySelectorAll('#sheetBody [data-cor-status]').forEach(function(el){ status[el.dataset.corStatus]=el.value; });
        document.querySelectorAll('#sheetBody [data-cor-ativar]:checked').forEach(function(el){ var id=el.dataset.corAtivar, picker=document.querySelector('#sheetBody [data-cor-servico="'+id+'"]'); if(picker) mapa[id]=picker.value; });
        return api('/agenda/cores',{method:'PUT',body:{status:status,servicos:mapa}}).then(function(d){imperioCores={status:d.status,servicos:d.servicos};fecharSheet();carregarGrade();carregarListaPessoas();carregarAgenda();toast('Cores da agenda salvas.');});
      },'Salvar cores');
    }).catch(function(e){toast(e.message||'Não foi possível abrir as cores.');});
  });
  setInterval(function(){if(S.aba==='agenda'&&!document.hidden&&!($('backdrop')&&$('backdrop').classList.contains('on'))) carregar();},20000);
})();
