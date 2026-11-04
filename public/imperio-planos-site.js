(function () {
  'use strict';
  var sec=document.getElementById('imperioPlanosPublicos'),lista=document.getElementById('imperioPlanosPublicosLista'),aviso=document.getElementById('imperioPlanosPublicosAviso'), modal=document.getElementById('imperioPlanoDialog');
  if(!sec||!lista||!aviso||!modal)return;
  var area=document.getElementById('imperioPlanosArea'),abrirPlanos=document.getElementById('imperioAbrirPlanos');
  if(!area||!abrirPlanos)return;
  abrirPlanos.addEventListener('click',function(){area.hidden=!area.hidden;abrirPlanos.setAttribute('aria-expanded',area.hidden?'false':'true');abrirPlanos.textContent=area.hidden?'Ver planos mensais':'Fechar planos mensais';});
  var dados={planos:[],barbeiros:[],whatsapp:''}, seq=0, selecionado=0, acao='', disponivel=false, assinaturaBarbeiros='';
  var titulo=document.getElementById('imperioPlanoDialogTitulo'),detalhe=document.getElementById('imperioPlanoDialogDetalhe'),barbeiro=document.getElementById('imperioPlanoBarbeiro'),forma=document.getElementById('imperioPlanoForma'),destino=document.getElementById('imperioPlanoDestino'),nota=document.getElementById('imperioPlanoNota'),link=document.getElementById('imperioPlanoWhats');
  function atalhos(visivel){document.querySelectorAll('[data-imperio-atalho-planos]').forEach(function(a){a.hidden=!visivel;});}
  function moeda(c){return (Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  function planoAtual(){return dados.planos.find(function(p){return Number(p.id)===Number(selecionado);});}
  function contatoAtual(){return dados.barbeiros.find(function(p){return String(p.id)===barbeiro.value;});}
  function fechar(){if(modal.open){if(typeof modal.close==='function')modal.close();else modal.removeAttribute('open');}}
  function preencherBarbeiros(forcar){
    var assinatura=JSON.stringify(dados.barbeiros);
    if(!forcar && assinatura===assinaturaBarbeiros)return;
    assinaturaBarbeiros=assinatura;
    var anterior=barbeiro.value;barbeiro.replaceChildren();var inicial=document.createElement('option');inicial.value='';inicial.textContent='Selecione o barbeiro';barbeiro.append(inicial);
    dados.barbeiros.forEach(function(p){var o=document.createElement('option');o.value=String(p.id);o.textContent=p.nome;barbeiro.append(o);});
    if(dados.barbeiros.some(function(p){return String(p.id)===anterior;}))barbeiro.value=anterior;
  }
  function preencherDestino(){
    var anterior=destino.value,prof=contatoAtual(),disponiveis=[];
    if(dados.whatsapp)disponiveis.push(['loja','Barbearia']);
    if(prof&&prof.whatsapp)disponiveis.push(['barbeiro','Barbeiro: '+prof.nome]);
    destino.replaceChildren();var inicial=document.createElement('option');inicial.value='';inicial.textContent='Selecione o WhatsApp';destino.append(inicial);
    disponiveis.forEach(function(x){var o=document.createElement('option');o.value=x[0];o.textContent=x[1];destino.append(o);});
    if(disponiveis.some(function(x){return x[0]===anterior;}))destino.value=anterior;
    else if(disponiveis.length===1)destino.value=disponiveis[0][0];
  }
  function atualizarDialog(){
    var p=planoAtual(),prof=contatoAtual(),pag=forma.value;
    titulo.textContent=acao==='renovar'?'Renovar plano':'Assinar plano';
    detalhe.textContent=p?p.nome+' · '+moeda(p.preco_cents):'Este plano não está disponível no momento.';
    preencherDestino();link.hidden=true;link.removeAttribute('href');nota.textContent='O pagamento é feito na barbearia. A assinatura e o pagamento precisam ser confirmados pela equipe. Esta mensagem ainda não agenda horários nem registra a assinatura no painel.';
    if(!disponivel||!p){nota.textContent='Não foi possível confirmar a disponibilidade do plano. Tente novamente mais tarde.';return;}
    if(!dados.barbeiros.length){nota.textContent='Nenhum barbeiro disponível no momento. Fale com a barbearia.';return;}
    if(!dados.whatsapp&&!(prof&&prof.whatsapp)){nota.textContent='Não há WhatsApp disponível para este atendimento. Fale com a barbearia.';return;}
    if(!prof||!pag||!destino.value)return;
    var numero=destino.value==='loja'?dados.whatsapp:prof.whatsapp;
    var rotulos={pix:'Pix na barbearia',cartao:'Cartão na barbearia',dinheiro:'Dinheiro na barbearia'};
    if(!numero||!rotulos[pag])return;
    var texto='Olá! Gostaria de '+(acao==='renovar'?'renovar':'assinar')+' o plano '+p.nome+' ('+moeda(p.preco_cents)+'). Barbeiro escolhido: '+prof.nome+'. Forma de pagamento: '+rotulos[pag]+'. Gostaria de combinar os horários.';
    link.href='https://wa.me/'+numero+'?text='+encodeURIComponent(texto);link.hidden=false;
  }
  function abrir(id,modo){
    selecionado=id;acao=modo;forma.value='';barbeiro.value='';destino.value='';preencherBarbeiros(true);atualizarDialog();
    if(typeof modal.showModal==='function')modal.showModal();else modal.setAttribute('open','');
  }
  document.getElementById('imperioPlanoFechar').addEventListener('click',fechar);
  barbeiro.addEventListener('change',atualizarDialog);forma.addEventListener('change',atualizarDialog);destino.addEventListener('change',atualizarDialog);
  function carregar(){
    var n=++seq;
    fetch('/l/imperio-barber/api/imperio-planos-publicos',{cache:'no-store',headers:{Accept:'application/json'}})
      .then(function(r){if(!r.ok)throw new Error('planos indisponíveis');return r.json();})
      .then(function(d){
        if(n!==seq)return;dados={planos:Array.isArray(d.planos)?d.planos:[],barbeiros:Array.isArray(d.barbeiros)?d.barbeiros:[],whatsapp:String(d.whatsapp||'')};disponivel=true;
        lista.replaceChildren();
        if(!dados.planos.length){fechar();sec.hidden=true;atalhos(false);return;}
        sec.hidden=false;atalhos(true);aviso.textContent='Escolha um plano para assinar ou renovar. A contratação e o pagamento são confirmados pela barbearia.';
        dados.planos.forEach(function(p){
          var card=document.createElement('article'),tituloPlano=document.createElement('h3'),valor=document.createElement('div'),acoes=document.createElement('div');
          card.className='imperio-site-plano';tituloPlano.textContent=p.nome;valor.className='imperio-site-plano-valor';valor.textContent=moeda(p.preco_cents);acoes.className='imperio-site-plano-acoes';
          if(p.imagem_url && (/^\/uploads\/imperio-barber\//.test(p.imagem_url) || /^\/img\/imperio-planos\//.test(p.imagem_url) || /^https:\/\//.test(p.imagem_url))){var img=document.createElement('img');img.className='imperio-site-plano-foto';img.alt='Imagem do plano '+p.nome;img.loading='lazy';img.src=p.imagem_url;img.addEventListener('error',function(){img.hidden=true;});card.append(img);if(/^\/img\/imperio-planos\//.test(p.imagem_url)){var legenda=document.createElement('small');legenda.className='imperio-site-plano-legenda';legenda.textContent='Imagem ilustrativa';card.append(legenda);}}
          card.append(tituloPlano,valor);
          if(p.descricao){var descricao=document.createElement('p');descricao.className='imperio-site-plano-detalhe';descricao.textContent=p.descricao;card.append(descricao);}
          if(Number.isInteger(p.quantidade_servicos)&&p.quantidade_servicos>0){var quantidade=document.createElement('p');quantidade.className='imperio-site-plano-detalhe';quantidade.textContent=p.quantidade_servicos+' atendimento(s) incluído(s)';card.append(quantidade);}
          if(p.condicoes){var condicoes=document.createElement('p');condicoes.className='imperio-site-plano-detalhe';condicoes.textContent='Condições: '+p.condicoes;card.append(condicoes);}
          card.append(acoes);
          [['assinar','Assinar plano'],['renovar','Renovar plano']].forEach(function(par){var btn=document.createElement('button');btn.type='button';btn.className='imperio-site-plano-botao'+(par[0]==='renovar'?' secundario':'');btn.textContent=par[1];btn.setAttribute('aria-label',par[1]+' '+p.nome);btn.addEventListener('click',function(){abrir(p.id,par[0]);});acoes.append(btn);});
          lista.append(card);
        });
        if(modal.open){preencherBarbeiros();atualizarDialog();}
      })
      .catch(function(){if(n!==seq)return;disponivel=false;lista.replaceChildren();sec.hidden=false;atalhos(false);aviso.textContent='Não foi possível carregar os planos. Atualize a página para tentar novamente.';if(modal.open)atualizarDialog();});
  }
  carregar();setInterval(function(){if(!document.hidden)carregar();},20000);document.addEventListener('visibilitychange',function(){if(!document.hidden)carregar();});
})();
