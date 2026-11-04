'use strict';
// Execute apenas contra o servidor isolado com dados fictícios da Império.
const {chromium}=require('playwright'); const assert=require('assert');
const url='http://127.0.0.1:3988/l/imperio-barber';
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const p=await b.newPage({viewport:{width:390,height:844}});const erros=[];p.on('pageerror',e=>erros.push(e.message));
 const inicial=p.waitForResponse(r=>r.url().endsWith('/api/admin/painel')); await p.goto(url+'/admin'); await inicial; await p.waitForTimeout(400);await p.locator('#senha').fill('teste123');await p.locator('#loginForm button').click();await p.locator('#app:not(.oculto)').waitFor();
 assert.equal(await p.locator('#imperioInstalarCard').count(),0);
 await p.locator('#imperioAbrirMenu').click();await p.locator('[data-tab="clientes"]').click();
 await p.locator('#imperioSelecaoClientes:not([hidden])').waitFor();await p.waitForFunction(()=>document.querySelectorAll('input[data-imperio-cliente]').length===3);
 await p.locator('#imperioSelecionarTodos').click();assert.equal(await p.locator('input[data-imperio-cliente]:checked').count(),3);
 p.once('dialog',d=>d.dismiss());await p.locator('#imperioExcluirClientes').click();assert.equal(await p.locator('input[data-imperio-cliente]:checked').count(),3);
 p.once('dialog',d=>d.accept());await p.locator('#imperioExcluirClientes').click();await p.locator('#imperioErroClientes').getByText('Não foi excluído nenhum cliente.',{exact:false}).waitFor();
 assert.equal(await p.locator('input[data-imperio-cliente]').count(),3);
 await p.locator('label.imperio-selecionar-cliente').filter({has:p.locator('input[aria-label="Selecionar Teste Com Agenda"]')}).locator('input').uncheck();
 p.once('dialog',d=>d.accept());await p.locator('#imperioExcluirClientes').click();await p.waitForFunction(()=>document.querySelectorAll('input[data-imperio-cliente]').length===1);
 assert.equal(await p.locator('input[aria-label="Selecionar Teste Com Agenda"]').count(),1);assert.deepEqual(erros,[]);
 let linked=await p.evaluate(async()=>{let r=await fetch('/l/imperio-barber/api/admin/agendamentos?status=todos');return r.json()});assert(linked.some(x=>x.cliente_nome==='Teste Com Agenda'));
 console.log('Administrador: seleção, cancelamento, bloqueio e exclusão preservando agendamento OK');
 const emp=await b.newPage({viewport:{width:1200,height:800}});const inicialEmp=emp.waitForResponse(r=>r.url().endsWith('/api/admin/painel'));await emp.goto(url+'/admin');await inicialEmp; await emp.waitForTimeout(400);await emp.locator('#senha').fill('func123');await emp.locator('#loginForm button').click();await emp.locator('#app:not(.oculto)').waitFor();await emp.locator('[data-tab="clientes"]').click();await emp.waitForTimeout(500);assert(await emp.locator('#imperioSelecaoClientes').isHidden());assert.equal(await emp.locator('input[data-imperio-cliente]').count(),0);
 let denial=await emp.evaluate(async()=>{let r=await fetch('/l/imperio-barber/api/admin/imperio-clientes/excluir',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:[1]})});return r.status;});assert.equal(denial,403);console.log('Funcionário: exclusão bloqueada OK');
 const outro=await b.newPage();await outro.goto('http://127.0.0.1:3988/l/outra-barbearia/admin');assert.equal(await outro.locator('#imperioSelecaoClientes').count(),0);console.log('Outra loja: sem alteração de interface OK');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
