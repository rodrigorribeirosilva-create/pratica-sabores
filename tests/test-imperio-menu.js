'use strict';
// Teste de navegação somente com servidor e dados fictícios locais.
const assert = require('assert');
const { chromium } = require('playwright');
(async()=>{
 const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  for(const size of [{width:320,height:720},{width:390,height:844},{width:1200,height:800}]){
   const context=await browser.newContext({viewport:size}); const page=await context.newPage(); const errors=[];
   page.on('pageerror', e=>errors.push(e.message));
   const inicial=page.waitForResponse(r=>r.url().endsWith('/api/admin/painel')); await page.goto('http://127.0.0.1:3988/l/imperio-barber/admin'); await inicial; await page.waitForTimeout(400);
   await page.locator('#senha').fill('teste123'); await page.locator('#loginForm button').click();
   await page.locator('#app:not(.oculto)').waitFor();
   await page.waitForTimeout(600);
   const mobile=size.width<900;
   assert.equal(await page.locator('#imperioAbrirMenu').isVisible(),mobile);
   for(const [aba,titulo] of [['clientes','Clientes'],['agenda','Agenda'],['financeiro','Financeiro'],['servicos','Serviços'],['relatorios','Relatórios'],['hoje','Visão geral']]){
    if(mobile){await page.locator('#imperioAbrirMenu').click();assert.equal(await page.locator('#imperioAbrirMenu').getAttribute('aria-expanded'),'true');}
    await page.locator('.nav button[data-tab="'+aba+'"]').click();
    assert.equal(await page.locator('#imperioPaginaTitulo').textContent(),titulo);
    assert(await page.locator('#tab-'+aba).isVisible());
    assert.equal(await page.locator('main section:not(.oculto)').count(),1);
    assert((await page.evaluate(()=>window.scrollY)) < 5);
    if(mobile){assert.equal(await page.locator('#imperioAbrirMenu').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#imperioMenu').getAttribute('aria-hidden'),'true');}
   }
   if(mobile){
    await page.locator('#imperioAbrirMenu').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#imperioAbrirMenu').getAttribute('aria-expanded'),'false');
    await page.locator('#imperioAbrirMenu').click();await page.locator('#imperioFundoMenu').click({position:{x:size.width-2,y:size.height-2}});assert.equal(await page.locator('#imperioAbrirMenu').getAttribute('aria-expanded'),'false');
   }
   assert.deepEqual(errors,[]); console.log(size.width+'px: menu, abas e topo OK'); await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
