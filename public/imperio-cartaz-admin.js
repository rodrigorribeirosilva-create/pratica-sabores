// Editor do cartaz público; altera apenas textos e imagem da Império.
(function(){
  var botao=$('imperioEditarCartaz');if(!botao)return;
  botao.addEventListener('click',function(){
    if(S.papel!=='admin')return;
    api('/imperio-cartaz').then(function(c){
      var imagem=c.imagem||'',enviando=false;
      var corpo='<p>Este cartaz aparece no link dos clientes. Ao tocar nele, o cliente vê os planos e assinaturas.</p>'+ 
        '<div class="campo"><label for="icMarca">Nome no cartaz</label><input id="icMarca" maxlength="60" value="'+esc(c.marca)+'"></div>'+ 
        '<div class="campo"><label for="icTitulo">Chamada principal</label><input id="icTitulo" maxlength="100" value="'+esc(c.titulo)+'"></div>'+ 
        '<div class="campo"><label for="icDescricao">Texto de apoio</label><textarea id="icDescricao" maxlength="160" rows="3">'+esc(c.descricao)+'</textarea></div>'+ 
        '<div class="campo"><label for="icBotao">Texto do botão</label><input id="icBotao" maxlength="48" value="'+esc(c.botao)+'"></div>'+ 
        '<div class="campo"><label>Imagem ilustrativa do cartaz</label><img id="icImagemPrev" class="imperio-plano-foto-prev" alt="Imagem de fundo do cartaz"'+(imagem?' src="'+esc(imagem)+'"':' hidden')+'><div class="imperio-plano-acoes"><button type="button" class="btn" id="icEnviar">Enviar imagem</button><button type="button" class="btn" id="icPadrao">Usar imagem original</button><button type="button" class="btn" id="icRemover">Remover imagem</button></div><input id="icArquivo" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden><p class="imperio-plano-nota" id="icAviso" aria-live="polite">A imagem e os textos só mudam no link ao salvar.</p></div>';
      abrirSheet('Editar cartaz das assinaturas',corpo,function(){
        return Promise.resolve().then(function(){if(enviando)throw new Error('Aguarde a imagem terminar de enviar.');var dados={marca:v('icMarca'),titulo:v('icTitulo'),descricao:v('icDescricao'),botao:v('icBotao'),imagem:imagem,revisao:c.revisao};if(!dados.marca||!dados.titulo||!dados.descricao||!dados.botao)throw new Error('Preencha os textos do cartaz.');return api('/imperio-cartaz',{method:'PUT',body:dados});}).then(function(){fecharSheet();toast('Cartaz salvo. O link será atualizado em instantes.');});
      },'Salvar cartaz');
      var file=$('icArquivo'),preview=$('icImagemPrev'),aviso=$('icAviso'),salvar=$('sheetSalvar'),enviar=$('icEnviar'),padrao=$('icPadrao'),remover=$('icRemover');
      function mostrar(){if(imagem){preview.src=imagem;preview.hidden=false;}else{preview.removeAttribute('src');preview.hidden=true;}}
      enviar.addEventListener('click',function(){file.click();});
      padrao.addEventListener('click',function(){imagem='/img/imperio-planos/banner-assinaturas.jpg';mostrar();aviso.textContent='Imagem original selecionada. Toque em Salvar cartaz.';});
      remover.addEventListener('click',function(){imagem='';mostrar();aviso.textContent='A imagem será removida quando você salvar; o cartaz continuará com fundo escuro.';});
      file.addEventListener('change',function(){var f=file.files&&file.files[0];if(!f)return;var fd=new FormData();fd.append('image',f);enviando=true;[enviar,padrao,remover,salvar].forEach(function(x){x.disabled=true;});aviso.textContent='Enviando imagem…';fetch(BASE+'/upload',{method:'POST',credentials:'same-origin',body:fd}).then(function(r){return r.json().then(function(j){if(!r.ok||!j.url)throw new Error(j.error||'Não foi possível enviar a imagem.');return j;});}).then(function(j){if(!file.isConnected)return;imagem=j.url;mostrar();aviso.textContent='Imagem enviada. Toque em Salvar cartaz.';}).catch(function(e){if(file.isConnected)aviso.textContent=e.message||'Não foi possível enviar a imagem.';}).then(function(){enviando=false;if(file.isConnected){[enviar,padrao,remover,salvar].forEach(function(x){x.disabled=false;});file.value='';}});});
    }).catch(function(e){toast(e.message||'Não foi possível abrir o cartaz.');});
  });
})();
