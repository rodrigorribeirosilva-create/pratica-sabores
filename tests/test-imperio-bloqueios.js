'use strict';
// Executar somente na fixture isolada em 3988: este teste cria e remove bloqueios fictícios.
const { chromium } = require('playwright'); const assert = require('assert');
(async () => { const browser = await chromium.launch({headless:true,args:['--no-sandbox']}); try {
 const p = await browser.newPage({viewport:{width:390,height:844}}), erros=[]; p.on('pageerror',e=>erros.push(e.message));
 const inicial=p.waitForResponse(r=>r.url().endsWith('/api/admin/painel')); await p.goto('http://127.0.0.1:3988/l/imperio-barber/admin'); await inicial; await p.waitForTimeout(400); await p.locator('#senha').fill('teste123'); await p.locator('#loginForm button').click(); await p.locator('#app:not(.oculto)').waitFor();
 const call=(url,method='GET',body)=>p.evaluate(async ({url,method,body})=>{let r=await fetch(url,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};},{url,method,body});
 const base='/l/imperio-barber/api', admin=base+'/admin';
 let profs=(await call(admin+'/profissionais')).data.profissionais.filter(x=>x.ativo); assert(profs.length>=2);
 const a=profs[0].id,b=profs[1].id, data='2026-12-02';
 assert.equal((await call(admin+'/agenda/bloqueios','POST',{profissional_id:a,data,inicio:'15:30',fim:'15:00'})).status,400);
 assert.equal((await call(admin+'/agenda/bloqueios','POST',{profissional_id:2,data,inicio:'15:00',fim:'15:30'})).status,400);
 assert.equal((await call('/l/outra-barbearia/api/admin/agenda/bloqueios')).status,401);
 await p.locator('#imperioAbrirMenu').click(); await p.locator('[data-tab="agenda"]').click(); await p.waitForFunction(()=>document.querySelectorAll('#imperioBarbeirosAtalhos button').length>=2);
 await p.locator('#imperioDataAgenda').fill(data); await p.locator('#imperioDataAgenda').dispatchEvent('change'); await p.getByRole('button',{name:'Gerenciar bloqueios deste barbeiro'}).click();
 assert((await p.locator('#imperioBloqueiosContexto').textContent()).includes('02/12/2026'));
 await p.locator('#imperioBloqueioInicio').fill('15:00'); await p.locator('#imperioBloqueioFim').fill('15:30'); await p.getByRole('button',{name:'Bloquear horário'}).click(); await p.getByText('15:00 às 15:30').waitFor();
 let grade=(await call(base+'/disponibilidade?data='+data+'&profissional='+a+'&servico=1')).data.horarios, fifteen=grade.find(x=>x.hora==='15:00'); assert.equal(fifteen.livre,false); assert(!('bloqueado' in fifteen));
 let outra=(await call(base+'/disponibilidade?data='+data+'&profissional='+b+'&servico=1')).data.horarios; assert.equal(outra.find(x=>x.hora==='15:00').livre,true);
 let longo=(await call(base+'/disponibilidade?data='+data+'&profissional='+a+'&servico=2')).data.horarios; assert.equal(longo.find(x=>x.hora==='14:00').livre,false);
 assert.equal((await call(admin+'/agenda/bloqueios','POST',{profissional_id:a,data,inicio:'15:15',fim:'15:45'})).status,409);
 assert.equal((await call(admin+'/agendamentos','POST',{data,hora:'15:00',profissional_id:a,servico_id:1,cliente_nome:'Teste Bloqueio',status:'agendado'})).status,409);
 assert.equal((await call(admin+'/agendamentos','POST',{data,hora:'',profissional_id:a,servico_id:1,cliente_nome:'Teste Bloqueio',status:'agendado'})).status,409);
 assert.equal((await call(admin+'/agenda/bloqueios','POST',{profissional_id:a,data:'2026-12-01',inicio:'09:30',fim:'10:00'})).status,409);
 await p.locator('#imperioBloqueiosFechar').click(); await p.locator('#gradeHoras .imperio-bloqueado').getByText('bloqueado').waitFor();
 await p.getByRole('button',{name:'Gerenciar bloqueios deste barbeiro'}).click(); p.once('dialog',d=>d.accept()); await p.getByRole('button',{name:'Remover bloqueio das 15:00 às 15:30'}).click(); await p.getByText('Nenhum bloqueio neste dia.').waitFor();
 grade=(await call(base+'/disponibilidade?data='+data+'&profissional='+a+'&servico=1')).data.horarios; assert.equal(grade.find(x=>x.hora==='15:00').livre,true); assert.deepEqual(erros,[]);
 console.log('Bloqueios: interface, conflitos, privacidade, duração e isolamento por barbeiro OK.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
