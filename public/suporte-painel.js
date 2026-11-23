(() => {
  'use strict';
  const app=document.getElementById('app'), area=document.getElementById('suporte-area'), form=document.getElementById('suporte-form');
  if(!app || !area || !form) return;
  const prefix=(location.pathname.match(/^\/l\/([a-z0-9-]+)/i)||[])[0] || '';
  const base=prefix+'/api/admin/suporte';
  const btns=[...document.querySelectorAll('.suporte-nav')];
  const feedback=document.getElementById('suporte-feedback'), lista=document.getElementById('suporte-lista');
  const enviar=document.getElementById('suporte-enviar');
  let carregando=false;
  const get=async (url,op={})=>{
    const r=await fetch(base+url,{...op,cache:'no-store'}); const j=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(j.error || 'Não foi possível concluir agora.'); return j;
  };
  async function verificar(){
    if(carregando)return; carregando=true;
    try {const cfg=await get('/config'); btns.forEach(b=>b.hidden=!cfg.disponivel);} catch {btns.forEach(b=>b.hidden=true);}
    finally {carregando=false;}
  }
  const visible=()=> !app.hidden && !app.classList.contains('oculto');
  new MutationObserver(()=>{if(visible())verificar();else btns.forEach(b=>b.hidden=true);}).observe(app,{attributes:true,attributeFilter:['hidden','class']});
  if(visible())verificar();
  async function listar(){
    lista.textContent='Carregando pedidos…';
    try {
      const pedidos=await get('/pedidos'); lista.replaceChildren();
      if(!pedidos.length){lista.textContent='Você ainda não tem pedidos.';return;}
      const nomes={aberta:'Enviado',em_analise:'Em análise',aguardando_cliente:'Aguardando você',concluida:'Concluído',cancelada:'Cancelado'};
      pedidos.forEach(p=>{
        const item=document.createElement('article');item.className='suporte-pedido';
        const titulo=document.createElement('strong');titulo.textContent=String(p.titulo||'Pedido');item.append(titulo);
        const estado=document.createElement('p');estado.textContent='Situação: '+(nomes[p.status]||'Em atualização');item.append(estado);
        if(p.criado_em){const data=new Date(p.criado_em);if(!Number.isNaN(data.getTime())) {const d=document.createElement('small');d.textContent=data.toLocaleString('pt-BR');item.append(d);}}
        if(p.resposta_admin){const resposta=document.createElement('p');resposta.textContent='Resposta: '+String(p.resposta_admin);item.append(resposta);}
        lista.append(item);
      });
    } catch(e){lista.textContent=e instanceof TypeError ? 'Não foi possível carregar seus pedidos agora.' : e.message;}
  }
  btns.forEach(b=>b.addEventListener('click',()=>listar()));
  form.addEventListener('submit',async ev=>{
    ev.preventDefault(); if(enviar.disabled)return;
    const titulo=document.getElementById('suporte-titulo').value.trim();
    const descricao=document.getElementById('suporte-descricao').value.trim();
    const files=document.getElementById('suporte-fotos').files;
    if([...titulo].length<3 || [...titulo].length>120 || [...descricao].length>2000){feedback.textContent='Informe um título de 3 a 120 caracteres e um relato de até 2000 caracteres.';return;}
    if(files.length>3){feedback.textContent='Envie no máximo 3 fotos.';return;}
    const data=new FormData();data.append('titulo',titulo);data.append('descricao',descricao);for(const f of files)data.append('fotos',f);
    enviar.disabled=true;feedback.textContent='Enviando…';
    try {await get('/pedidos',{method:'POST',body:data});form.reset();feedback.textContent='Pedido enviado';await listar();}
    catch(e){feedback.textContent=e instanceof TypeError ? 'Não foi possível confirmar o envio. Confira seus pedidos antes de tentar novamente.' : e.message;}
    finally{enviar.disabled=false;}
  });
})();
