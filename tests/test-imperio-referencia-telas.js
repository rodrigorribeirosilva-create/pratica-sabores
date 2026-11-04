'use strict';
// Rodar somente no servidor local de testes (porta 3988), com dados fictícios.
const { chromium } = require('playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    for (const width of [320,390,1200]) {
      const p = await browser.newPage({viewport:{width,height:844},locale:'pt-BR'}), erros=[];
      p.on('pageerror', e => erros.push(e.message));
      const inicial = p.waitForResponse(r => r.url().endsWith('/api/admin/painel'));
      await p.goto('http://127.0.0.1:3988/l/imperio-barber/admin'); await inicial; await p.waitForTimeout(350);
      await p.locator('#senha').fill('teste123'); await p.locator('#loginForm button').click(); await p.locator('#app:not(.oculto)').waitFor();
      async function nav(t) { if(width<900) await p.locator('#imperioAbrirMenu').click(); await p.locator('.nav [data-tab="'+t+'"]').click(); }
      await nav('servicos'); await p.locator('#listaServ .item').first().waitFor();
      assert.equal(await p.locator('#listaServ .item').count(),6);
      await p.locator('#imperioBuscaServico').fill('higienizacao'); assert.equal(await p.locator('#listaServ .item:visible').count(),1);
      await p.locator('#imperioBuscaServico').clear(); await p.locator('#imperioCategoriaServico').selectOption({label:'Manutenção'});
      assert.equal(await p.locator('#listaServ .item:visible').count(),2);
      await p.locator('#listaServ .item:visible [data-acao="editarServico"]').first().click(); await p.locator('#svNome').waitFor();
      await p.reload(); await p.locator('#app:not(.oculto)').waitFor();
      await nav('agenda'); await p.locator('#imperioBarbeirosAtalhos button').first().waitFor();
      await p.locator('#imperioBarbeirosAtalhos button').first().click();
      await p.waitForFunction(() => document.querySelector('#imperioBuscaEstado').textContent.includes('Barbeiro de Teste'));
      assert.equal(await p.locator('#imperioBarbeirosAtalhos button').first().getAttribute('aria-pressed'),'true');
      await p.locator('#imperioDataAgenda').fill('2026-11-04'); await p.locator('#imperioDataAgenda').dispatchEvent('change');
      for(const id of ['gradeData','abData','listaDiaData']) assert.equal(await p.locator('#'+id).inputValue(),'2026-11-04');
      await p.locator('#imperioDiaProximo').click(); assert.equal(await p.locator('#gradeData').inputValue(),'2026-11-05');
      await nav('financeiro'); await p.waitForTimeout(300);
      const periodo = await p.evaluate(() => { let d=new Date(), hoje=new Date(d.getFullYear(),d.getMonth(),d.getDate()); let inicio=new Date(hoje); inicio.setDate(inicio.getDate()-((inicio.getDay()+6)%7)); const fmt=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); return 'de='+fmt(inicio)+'&ate='+fmt(hoje); });
      const semana = p.waitForResponse(r => r.url().includes('/financeiro?'+periodo) && r.status()===200);
      await p.locator('#finPeriodo [data-fin="semana"]').click(); await semana;
      assert.equal(await p.locator('#finPeriodo .on').textContent(),'Semana');
      assert.deepEqual(erros,[]); assert(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
      console.log(width+'px: agenda, serviços e financeiro OK'); await p.close();
    }
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exit(1)});
