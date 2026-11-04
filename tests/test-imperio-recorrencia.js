'use strict';
// Fixture isolada em 3988: IDs e dados inteiramente fictícios.
const {chromium}=require('playwright'), assert=require('assert');
(async()=>{let b=await chromium.launch({headless:true,args:['--no-sandbox']});try {
 const p=await b.newPage({viewport:{width:390,height:844}}), erros=[];p.on('pageerror',e=>erros.push(e.message));
 const ini=p.waitForResponse(r=>r.url().endsWith('/api/admin/painel'));await p.goto('http://127.0.0.1:3988/l/imperio-barber/admin');await ini;await p.waitForTimeout(400);await p.locator('#senha').fill('teste123');await p.locator('#loginForm button').click();await p.locator('#app:not(.oculto)').waitFor();
 const data=await p.evaluate(async()=>{const base='/l/imperio-barber/api/admin/imperio-clientes/';let r=await Promise.all([11,12,13].map(x=>fetch(base+x+'/recorrencia').then(r=>r.json())));let missing=await fetch(base+'99999/recorrencia');return {r,missing:missing.status};});
 assert.deepEqual(data.r[0],{agendamentos:0,concluidos:0,cancelados:0,primeira_visita:'',ultima_visita:'',media_dias:null});assert.equal(data.r[1].agendamentos,1);assert.equal(data.r[1].concluidos,0);
 assert.equal(data.r[2].agendamentos,4);assert.equal(data.r[2].concluidos,2);assert.equal(data.r[2].cancelados,1);assert.equal(data.r[2].media_dias,31);assert.equal(data.missing,404);
 await p.locator('#imperioAbrirMenu').click();await p.locator('[data-tab="clientes"]').click();await p.locator('#buscaCliente').fill('Primeiro teste');await p.waitForFunction(()=>[...document.querySelectorAll('#listaClientes .tit')].some(x=>x.textContent==='Primeiro teste'));
 await p.getByRole('button',{name:'Primeiro teste',exact:true}).click();await p.getByText('Primeiro agendamento registrado',{exact:true}).waitFor();assert.equal(await p.locator('.imperio-recorrencia-kpis b').nth(1).textContent(),'0');await p.getByText('Ainda não calculável').waitFor();assert((await p.locator('#sheetBody').innerText()).includes('Considera apenas o histórico registrado neste painel'));await p.locator('#sheetSalvar').click();
 await p.locator('#buscaCliente').fill('Recorrente teste');await p.waitForFunction(()=>[...document.querySelectorAll('#listaClientes .tit')].some(x=>x.textContent==='Recorrente teste'));
 await p.getByRole('button',{name:'Recorrente teste',exact:true}).click();await p.getByText('Cliente com mais de um agendamento',{exact:true}).waitFor();await p.getByText('A cada 31 dias em média').waitFor();await p.getByText('Cancelados: 1').waitFor();await p.locator('#sheetSalvar').click();
 await p.locator('#imperioAbrirMenu').click();await p.locator('[data-tab="agenda"]').click();await p.waitForFunction(()=>document.querySelectorAll('#imperioBarbeirosAtalhos button').length>0);await p.locator('#imperioDataAgenda').fill('2026-12-01');await p.locator('#imperioDataAgenda').dispatchEvent('change');
 await p.getByRole('button',{name:'Ver recorrência de Primeiro teste'}).waitFor();await p.getByRole('button',{name:'Ver recorrência de Primeiro teste'}).click();await p.getByText('Primeiro agendamento registrado',{exact:true}).waitFor();await p.locator('#sheetSalvar').click();
 assert.deepEqual(erros,[]);console.log('Recorrência: cadastro, primeiro registro, histórico, cancelados, média e acesso pela agenda OK.');
 }finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
