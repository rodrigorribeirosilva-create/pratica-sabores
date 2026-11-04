// Planos e assinaturas da Império: controle manual, sem cobrança de cartão ou Pix.
var imperioPlanosDados = {planos:[],assinaturas:[],pagamentos:[],hoje:''};
var imperioPlanosVisao = 'planos', imperioPlanosSeq = 0;
var imperioPlanosFiltros = {busca:'', status:'todos', pagamento:'todos'};
function imperioPlanoDinheiro(n) { return dinheiro2(Number(n || 0)); }
function imperioPlanoData(d) { return d ? imperioDataCompleta(d) : 'Não informado'; }
function imperioPlanoValor(id) {
  var v = String(($(id) || {}).value || '').trim().replace(',', '.');
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(v)) throw new Error('Informe um valor válido, por exemplo 180,00.');
  var partes=v.split('.'); return Number(partes[0])*100+Number((partes[1]||'').padEnd(2,'0'));
}
function imperioPlanoInputValor(id, label, cents) { return '<div class="campo"><label for="'+id+'">'+esc(label)+'</label><input type="number" id="'+id+'" min="0" max="1000000" step="0.01" inputmode="decimal" value="'+esc((Number(cents||0)/100).toFixed(2))+'"></div>'; }
function imperioPlanoDataCampo(id, label, valor) { return '<div class="campo"><label for="'+id+'">'+esc(label)+'</label><input type="date" id="'+id+'" value="'+esc(valor||'')+'"></div>'; }
function imperioPlanoTexto(id,label,valor) { return '<div class="campo"><label for="'+id+'">'+esc(label)+'</label><input type="text" id="'+id+'" maxlength="120" value="'+esc(valor||'')+'"></div>'; }
function imperioPlanoForma(valor) {
  var formas=[['','Selecione'],['pix','Pix'],['dinheiro','Dinheiro'],['cartao_credito','Cartão de crédito'],['cartao_debito','Cartão de débito'],['transferencia','Transferência'],['outro','Outra forma']];
  return '<div class="campo"><label for="ipForma">Forma de pagamento</label><select id="ipForma">'+formas.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===valor?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select></div>';
}
function imperioPlanoNomeForma(x) { return {pix:'Pix',dinheiro:'Dinheiro',cartao_credito:'Cartão de crédito',cartao_debito:'Cartão de débito',transferencia:'Transferência',outro:'Outra forma'}[x] || 'Não informada'; }
function imperioPlanoSituacao(p) { return p.status==='pendente' && p.vencimento<imperioPlanosDados.hoje ? 'Em atraso' : p.status==='pendente' ? 'A vencer' : p.status==='pago' ? 'Pago' : 'Cancelado'; }
function carregarPlanosImperio() {
  if (S.papel !== 'admin') return Promise.resolve();
  var n=++imperioPlanosSeq, cx=$('imperioPlanosConteudo');
  if (!cx) return Promise.resolve();
  if (!cx.innerHTML) cx.innerHTML='<div class="vazio">Carregando planos…</div>';
  return api('/imperio-planos/dados').then(function(d){if(n!==imperioPlanosSeq)return;imperioPlanosDados=d;pintarPlanosImperio();})
    .catch(function(e){if(n===imperioPlanosSeq)cx.innerHTML='<div class="vazio">'+esc(e.message || 'Não foi possível carregar os planos.')+'</div>';});
}
function pintarPlanosImperio() {
  var cx=$('imperioPlanosConteudo'); if (!cx) return;
  document.querySelectorAll('[data-planos-visao]').forEach(function(b){b.classList.toggle('on',b.dataset.planosVisao===imperioPlanosVisao);});
  var planos=imperioPlanosDados.planos, ass=imperioPlanosDados.assinaturas, pags=imperioPlanosDados.pagamentos;
  var ferramentas='<div class="imperio-planos-ferramentas"><input id="imperioPlanosBusca" type="search" placeholder="Pesquisar" aria-label="Pesquisar planos ou assinantes"><select id="imperioPlanosFiltro" aria-label="Filtrar por status"><option value="todos">Todos</option><option value="ativo">Ativos</option><option value="inativo">Inativos ou cancelados</option></select></div>';
  if (imperioPlanosVisao==='planos') {
    cx.innerHTML=ferramentas+'<button type="button" class="btn main imperio-planos-novo" data-ip-acao="novo-plano">+ Plano / pacote</button><div class="imperio-planos-lista">'+(planos.length?planos.map(function(p){
      return '<article class="imperio-plano-card" data-ip-item data-busca="'+esc(p.nome)+'" data-status="'+(p.ativo?'ativo':'inativo')+'">'+(p.imagem_url?'<img class="imperio-plano-foto" src="'+esc(p.imagem_url)+'" alt="">':'')+'<span class="imperio-plano-estado '+(p.ativo?'ativo':'inativo')+'">'+(p.ativo?'Ativo':'Inativo')+'</span><h3>'+esc(p.nome)+'</h3><p>'+Number(p.assinantes)+' assinante(s) ativo(s)</p><strong>'+imperioPlanoDinheiro(p.preco_cents)+'</strong><div class="imperio-plano-acoes"><button type="button" class="btn" data-ip-acao="editar-plano" data-id="'+p.id+'">Editar</button><button type="button" class="btn" data-ip-acao="status-plano" data-id="'+p.id+'">'+(p.ativo?'Desativar':'Reativar')+'</button></div></article>';
    }).join(''):'<div class="vazio">Nenhum plano cadastrado.</div>')+'</div>';
  } else {
    var ativos=ass.filter(function(a){return a.status==='ativa';}).length;
    var pendentes=pags.filter(function(p){return p.status==='pendente';}).length;
    cx.innerHTML='<div class="imperio-planos-resumo"><span><b>'+ativos+'</b> assinatura(s) ativa(s)</span><span><b>'+pendentes+'</b> pagamento(s) pendente(s)</span></div>'+ferramentas+'<div class="imperio-planos-ferramentas"><select id="imperioPlanosPagamentoFiltro" aria-label="Filtrar por pagamento"><option value="todos">Todos os pagamentos</option><option value="pendente">Com pendência</option><option value="pago">Com pagamento registrado</option><option value="sem">Sem registro de pagamento</option></select></div><button type="button" class="btn main imperio-planos-novo" data-ip-acao="nova-assinatura">+ Cadastrar assinante</button><div class="imperio-planos-lista">'+(ass.length?ass.map(function(a){
      var ps=pags.filter(function(p){return Number(p.assinatura_id)===Number(a.id)&&p.status!=='cancelado';});
      var pend=ps.filter(function(p){return p.status==='pendente';}).length, pagos=ps.filter(function(p){return p.status==='pago';}).length, ultimo=ps[0];
      return '<article class="imperio-plano-card" data-ip-item data-busca="'+esc(a.cliente_nome+' '+a.plano_nome)+'" data-status="'+(a.status==='ativa'?'ativo':'inativo')+'" data-pendentes="'+pend+'" data-pagos="'+pagos+'"><span class="imperio-plano-estado '+(a.status==='ativa'?'ativo':'inativo')+'">'+(a.status==='ativa'?'Assinatura ativa':'Assinatura cancelada')+'</span><h3>'+esc(a.cliente_nome)+'</h3><p>'+esc(a.plano_nome)+'</p><p>Valor combinado: <b>'+imperioPlanoDinheiro(a.valor_cents)+'</b><br>Início: '+esc(imperioPlanoData(a.inicio))+'<br>Próximo vencimento informado: '+esc(imperioPlanoData(a.proximo_vencimento))+'<br>Pagamentos pendentes: '+pend+'<br>Último vencimento registrado: '+(ultimo ? esc(imperioPlanoData(ultimo.vencimento))+' · <b>'+esc(imperioPlanoSituacao(ultimo))+'</b>' : 'Nenhum registro')+'</p><div class="imperio-plano-acoes"><button type="button" class="btn" data-ip-acao="pagamentos" data-id="'+a.id+'">Pagamentos</button><button type="button" class="btn" data-ip-acao="editar-assinatura" data-id="'+a.id+'">Editar</button><button type="button" class="btn" data-ip-acao="status-assinatura" data-id="'+a.id+'">'+(a.status==='ativa'?'Cancelar':'Reativar')+'</button></div></article>';
    }).join(''):'<div class="vazio">Nenhum assinante cadastrado.</div>')+'</div>';
  }
  if ($('imperioPlanosBusca')) $('imperioPlanosBusca').value=imperioPlanosFiltros.busca;
  if ($('imperioPlanosFiltro')) $('imperioPlanosFiltro').value=imperioPlanosFiltros.status;
  if ($('imperioPlanosPagamentoFiltro')) $('imperioPlanosPagamentoFiltro').value=imperioPlanosFiltros.pagamento;
  ['imperioPlanosBusca','imperioPlanosFiltro','imperioPlanosPagamentoFiltro'].forEach(function(id){var el=$(id);if(el)el.addEventListener(id==='imperioPlanosBusca'?'input':'change',filtrarPlanosImperio);});
  filtrarPlanosImperio();
}
function filtrarPlanosImperio() {
  imperioPlanosFiltros={busca:($('imperioPlanosBusca')||{}).value||'', status:($('imperioPlanosFiltro')||{}).value||'todos', pagamento:($('imperioPlanosPagamentoFiltro')||{}).value||'todos'};
  var termo=imperioPlanosFiltros.busca.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(), filtro=imperioPlanosFiltros.status, pag=imperioPlanosFiltros.pagamento;
  document.querySelectorAll('#imperioPlanosConteudo [data-ip-item]').forEach(function(el){var texto=el.dataset.busca.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(), pend=Number(el.dataset.pendentes||0), pagos=Number(el.dataset.pagos||0);el.hidden=(termo && texto.indexOf(termo)<0)||(filtro!=='todos'&&el.dataset.status!==filtro)||(pag==='pendente'&&!pend)||(pag==='pago'&&!pagos)||(pag==='sem'&&(pend||pagos));});
}
function imperioFormPlano(plano) {
  var p=plano||{}, imagem=p.imagem_url||'', enviando=false;
  var sugestoes=[['/img/imperio-planos/corte-barba-sobrancelha.jpg','Corte, barba e sobrancelha'],['/img/imperio-planos/cabelo-sobrancelha.jpg','Cabelo e sobrancelha'],['/img/imperio-planos/raspar-barba-sobrancelha.jpg','Raspado, barba e sobrancelha']];
  var opcoes=sugestoes.map(function(x){return '<button type="button" class="imperio-plano-sugestao" data-ip-foto-sugerida="'+esc(x[0])+'" aria-label="Usar imagem ilustrativa de '+esc(x[1])+'"><img src="'+esc(x[0])+'" alt=""><span>'+esc(x[1])+'</span></button>';}).join('');
  var foto='<div class="campo"><label>Foto do plano (aparece no link)</label><img id="ipFotoPrev" class="imperio-plano-foto-prev" alt="Prévia da foto"'+(imagem?' src="'+esc(imagem)+'"':' hidden')+'><div class="imperio-plano-acoes"><button type="button" class="btn" id="ipFotoBtn">Enviar minha foto</button><button type="button" class="btn" id="ipFotoRemover"'+(imagem?'':' hidden')+'>Remover foto</button></div><input type="file" id="ipFotoFile" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden><p class="imperio-plano-nota">Ou escolha uma imagem ilustrativa criada por inteligência artificial:</p><div class="imperio-planos-sugestoes">'+opcoes+'</div><p class="imperio-plano-nota" id="ipFotoAviso" aria-live="polite">A foto só entra no plano quando você salvar.</p></div>';
  var detalhes='<div class="campo"><label for="ipDescricao">Descrição e benefícios (opcional)</label><textarea id="ipDescricao" maxlength="1000" rows="3">'+esc(p.descricao||'')+'</textarea></div><div class="campo"><label for="ipQuantidade">Quantidade de atendimentos (opcional)</label><input id="ipQuantidade" type="number" min="1" max="100" step="1" inputmode="numeric" value="'+esc(p.quantidade_servicos==null?'':p.quantidade_servicos)+'"><p class="imperio-plano-nota">Informação exibida no link; ainda não limita nem agenda atendimentos automaticamente.</p></div><div class="campo"><label for="ipCondicoes">Condições do plano (opcional)</label><textarea id="ipCondicoes" maxlength="1000" rows="3">'+esc(p.condicoes||'')+'</textarea></div>';
  abrirSheet(p.id?'Editar plano':'Novo plano',imperioPlanoTexto('ipNome','Nome do plano',p.nome)+imperioPlanoInputValor('ipValor','Valor mensal em reais',p.preco_cents)+detalhes+foto+'<p class="imperio-plano-nota">Alterar o preço do plano não modifica o valor combinado com assinantes existentes.</p>',function(){
    var nome=v('ipNome'),valor=imperioPlanoValor('ipValor'),quantidade=String(v('ipQuantidade')||'').trim();if(!nome)throw new Error('Informe o nome do plano.');if(enviando)throw new Error('Aguarde o envio da foto.');if(quantidade&&(!/^\d+$/.test(quantidade)||Number(quantidade)<1||Number(quantidade)>100))throw new Error('Informe uma quantidade de 1 a 100.');
    return api('/imperio-planos/planos'+(p.id?'/'+p.id:''),{method:p.id?'PUT':'POST',body:{nome:nome,preco_cents:valor,imagem_url:imagem,descricao:v('ipDescricao'),condicoes:v('ipCondicoes'),quantidade_servicos:quantidade?Number(quantidade):null}}).then(function(){fecharSheet();return carregarPlanosImperio();});
  },p.id?'Salvar plano':'Cadastrar plano');
  var arquivo=$('ipFotoFile'),btn=$('ipFotoBtn'),remover=$('ipFotoRemover'),prev=$('ipFotoPrev'),aviso=$('ipFotoAviso'),salvar=$('sheetSalvar');
  btn.addEventListener('click',function(){arquivo.click();});
  var sugestoesBtns=Array.prototype.slice.call(document.querySelectorAll('[data-ip-foto-sugerida]'));
  function destacarSugestao(){sugestoesBtns.forEach(function(x){var on=x.dataset.ipFotoSugerida===imagem;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on?'true':'false');});}
  sugestoesBtns.forEach(function(botao){botao.addEventListener('click',function(){if(enviando)return;imagem=botao.dataset.ipFotoSugerida;prev.src=imagem;prev.hidden=false;remover.hidden=false;arquivo.value='';destacarSugestao();aviso.textContent='Imagem ilustrativa selecionada. Toque em Salvar para aplicar.';});});destacarSugestao();
  remover.addEventListener('click',function(){imagem='';prev.removeAttribute('src');prev.hidden=true;remover.hidden=true;arquivo.value='';destacarSugestao();aviso.textContent='A foto será removida ao salvar o plano.';});
  arquivo.addEventListener('change',function(){
    var file=arquivo.files&&arquivo.files[0];if(!file)return;
    var fd=new FormData();fd.append('image',file);enviando=true;btn.disabled=true;remover.disabled=true;salvar.disabled=true;sugestoesBtns.forEach(function(x){x.disabled=true;});aviso.textContent='Enviando foto…';
    fetch(BASE+'/upload',{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json().then(function(j){if(!r.ok||!j.url)throw new Error(j.error||'Não foi possível enviar a foto.');return j;});}).then(function(j){
      if(!arquivo.isConnected)return;imagem=j.url;prev.src=imagem;prev.hidden=false;remover.hidden=false;destacarSugestao();aviso.textContent='Foto pronta. Toque em Salvar para aplicar.';
    }).catch(function(e){if(arquivo.isConnected)aviso.textContent=e.message||'Não foi possível enviar a foto.';}).then(function(){enviando=false;if(arquivo.isConnected){btn.disabled=false;remover.disabled=false;salvar.disabled=false;sugestoesBtns.forEach(function(x){x.disabled=false;});arquivo.value='';}});
  });
}
function imperioFormAssinatura(a) {
  var existente=!!a; a=a||{};
  Promise.all([api('/clientes'),api('/imperio-planos/dados')]).then(function(rs){
    imperioPlanosDados=rs[1];var clientes=rs[0], planos=rs[1].planos.filter(function(p){return p.ativo;});
    if(!existente && (!clientes.length||!planos.length)){toast(!clientes.length?'Cadastre um cliente primeiro.':'Cadastre ou ative um plano primeiro.');return;}
    var campos=existente?'<p>'+esc(a.cliente_nome)+' · '+esc(a.plano_nome)+'</p>':'<div class="campo"><label for="ipCliente">Cliente</label><select id="ipCliente">'+clientes.map(function(c){return '<option value="'+Number(c.id)+'">'+esc(c.nome+(c.telefone?' · '+c.telefone:''))+'</option>';}).join('')+'</select></div><div class="campo"><label for="ipPlano">Plano</label><select id="ipPlano">'+planos.map(function(p){return '<option value="'+Number(p.id)+'">'+esc(p.nome)+'</option>';}).join('')+'</select></div>';
    campos+=imperioPlanoInputValor('ipValor','Valor combinado em reais',existente?a.valor_cents:planos[0].preco_cents)+imperioPlanoDataCampo('ipInicio','Início da assinatura',existente?a.inicio:rs[1].hoje)+imperioPlanoDataCampo('ipProximo','Próximo vencimento (opcional)',a.proximo_vencimento)+imperioPlanoTexto('ipObs','Observação (não escreva dados do cartão)',a.observacao)+'<p class="imperio-plano-nota">Os vencimentos e pagamentos são informados manualmente. Nenhuma cobrança é enviada automaticamente.</p>';
    abrirSheet(existente?'Editar assinatura':'Cadastrar assinante',campos,function(){var body={valor_cents:imperioPlanoValor('ipValor'),inicio:v('ipInicio'),proximo_vencimento:v('ipProximo'),observacao:v('ipObs')};if(!existente){body.cliente_id=Number(v('ipCliente'));body.plano_id=Number(v('ipPlano'));}return api('/imperio-planos/assinaturas'+(existente?'/'+a.id:''),{method:existente?'PUT':'POST',body:body}).then(function(){fecharSheet();imperioPlanosVisao='assinantes';imperioPlanosFiltros={busca:'',status:'todos',pagamento:'todos'};return carregarPlanosImperio();});},existente?'Salvar assinatura':'Cadastrar assinatura');
    if(!existente) $('ipPlano').addEventListener('change',function(){var p=planos.find(function(x){return Number(x.id)===Number(v('ipPlano'));});if(p)$('ipValor').value=(p.preco_cents/100).toFixed(2);});
  }).catch(function(e){toast(e.message);});
}
function imperioAbrirPagamentos(a) {
  if(!a)return;
  var lista=imperioPlanosDados.pagamentos.filter(function(p){return Number(p.assinatura_id)===Number(a.id);});
  var historico=lista.length?lista.map(function(p){var situacao=imperioPlanoSituacao(p);return '<div class="imperio-pagamento-card '+(p.status==='pago'?'pago':p.status==='cancelado'?'cancelado':situacao==='Em atraso'?'atrasado':'pendente')+'"><div class="imperio-pagamento-topo"><span>'+esc(imperioPlanoData(p.vencimento))+'</span><b>'+imperioPlanoDinheiro(p.valor_cents)+'</b><strong>'+esc(situacao)+'</strong></div><div class="imperio-pagamento-info">Forma: '+esc(imperioPlanoNomeForma(p.forma))+(p.pago_em?' · Recebido em '+esc(imperioPlanoData(p.pago_em)):'')+(p.observacao?'<br>'+esc(p.observacao):'')+'<div class="imperio-plano-acoes">'+(p.status==='pendente'?'<button type="button" class="btn" data-ip-acao="receber" data-id="'+p.id+'">Confirmar recebimento</button>':'')+(p.status!=='cancelado'?'<button type="button" class="btn" data-ip-acao="cancelar-pagamento" data-id="'+p.id+'">Cancelar registro</button>':'')+'</div></div></div>';}).join(''):'<p class="imperio-plano-nota">Nenhum pagamento registrado para esta assinatura.</p>';
  var formulario=a.status==='ativa'?'<h3>Registrar pagamento</h3>'+imperioPlanoDataCampo('ipVencimento','Vencimento',a.proximo_vencimento)+imperioPlanoInputValor('ipValor','Valor em reais',a.valor_cents)+'<div class="campo"><label for="ipStatus">Situação</label><select id="ipStatus"><option value="pendente">Pendente</option><option value="pago">Já recebido</option></select></div>'+imperioPlanoForma('')+imperioPlanoDataCampo('ipPagoEm','Data em que recebeu (somente se já pago)','')+imperioPlanoTexto('ipObs','Observação (sem dados do cartão)','')+'<p class="imperio-plano-nota">Este é um registro manual. Nenhuma cobrança é feita e o pagamento só será marcado como recebido se você confirmar.</p>':'<p class="imperio-plano-nota">Assinatura cancelada. Reative-a para registrar uma nova cobrança.</p>';
  abrirSheet('Pagamentos · '+a.cliente_nome,historico+formulario,function(){if(a.status!=='ativa'){fecharSheet();return;}var status=v('ipStatus');return api('/imperio-planos/pagamentos',{method:'POST',body:{assinatura_id:a.id,vencimento:v('ipVencimento'),valor_cents:imperioPlanoValor('ipValor'),status:status,forma:v('ipForma'),pago_em:status==='pago'?v('ipPagoEm'):'',observacao:v('ipObs')}}).then(function(){fecharSheet();return carregarPlanosImperio();});},a.status==='ativa'?'Registrar pagamento':'Fechar');
}
function imperioConfirmarPagamento(p) {
  var a=imperioPlanosDados.assinaturas.find(function(x){return Number(x.id)===Number(p.assinatura_id);});
  abrirSheet('Confirmar recebimento', '<p>Confirme o recebimento de '+imperioPlanoDinheiro(p.valor_cents)+' com vencimento em '+esc(imperioPlanoData(p.vencimento))+'.</p>'+imperioPlanoForma(p.forma)+imperioPlanoDataCampo('ipPagoEm','Data de recebimento',imperioPlanosDados.hoje)+'<p class="imperio-plano-nota">A confirmação é manual. Não há consulta automática ao banco ou à operadora do cartão.</p>',function(){return api('/imperio-planos/pagamentos/'+p.id,{method:'PUT',body:{status:'pago',forma:v('ipForma'),pago_em:v('ipPagoEm')}}).then(function(){fecharSheet();return carregarPlanosImperio().then(function(){imperioAbrirPagamentos(a);});});},'Confirmar recebido');
}
(function(){
  var nav=$('imperioNavPlanos'),sec=$('tab-planos');
  document.addEventListener('imperio-papel-pronto',function(){if(nav)nav.classList.toggle('oculto',S.papel!=='admin');});
  if(!sec)return;
  sec.addEventListener('click',function(e){var v=e.target.closest('[data-planos-visao]');if(v){imperioPlanosVisao=v.dataset.planosVisao;imperioPlanosFiltros={busca:'',status:'todos',pagamento:'todos'};pintarPlanosImperio();}});
  document.addEventListener('click',function(e){var btn=e.target.closest('[data-ip-acao]');if(!btn||S.papel!=='admin')return;var acao=btn.dataset.ipAcao,id=Number(btn.dataset.id||0), p=imperioPlanosDados.planos.find(function(x){return Number(x.id)===id;}), a=imperioPlanosDados.assinaturas.find(function(x){return Number(x.id)===id;}), pg=imperioPlanosDados.pagamentos.find(function(x){return Number(x.id)===id;});
    if(acao==='novo-plano')return imperioFormPlano(null);
    if(acao==='editar-plano'&&p)return imperioFormPlano(p);
    if(acao==='nova-assinatura')return imperioFormAssinatura(null);
    if(acao==='editar-assinatura'&&a)return imperioFormAssinatura(a);
    if(acao==='pagamentos'&&a)return imperioAbrirPagamentos(a);
    if(acao==='receber'&&pg)return imperioConfirmarPagamento(pg);
    if(acao==='status-plano'&&p&&confirm((p.ativo?'Desativar':'Reativar')+' o plano? As assinaturas e pagamentos existentes serão preservados.')) return api('/imperio-planos/planos/'+id,{method:'PUT',body:{ativo:!p.ativo}}).then(carregarPlanosImperio).catch(function(e){toast(e.message);});
    if(acao==='status-assinatura'&&a&&confirm((a.status==='ativa'?'Cancelar':'Reativar')+' esta assinatura? O histórico de pagamentos será preservado.')) return api('/imperio-planos/assinaturas/'+id,{method:'PUT',body:{status:a.status==='ativa'?'cancelada':'ativa'}}).then(carregarPlanosImperio).catch(function(e){toast(e.message);});
    if(acao==='cancelar-pagamento'&&pg&&confirm('Cancelar este registro? Isto não estorna nem cancela cobranças externas. O histórico será preservado.')) {var sub=imperioPlanosDados.assinaturas.find(function(x){return Number(x.id)===Number(pg.assinatura_id);});return api('/imperio-planos/pagamentos/'+id,{method:'PUT',body:{status:'cancelado'}}).then(function(){fecharSheet();return carregarPlanosImperio().then(function(){imperioAbrirPagamentos(sub);});}).catch(function(e){toast(e.message);});}
  });
  setInterval(function(){if(S.aba==='planos'&&S.papel==='admin'&&!document.hidden&&document.activeElement!==$('imperioPlanosBusca')&&document.activeElement!==$('imperioPlanosFiltro')&&document.activeElement!==$('imperioPlanosPagamentoFiltro')&&!($('backdrop')&&$('backdrop').classList.contains('on')))carregarPlanosImperio();},20000);
})();
