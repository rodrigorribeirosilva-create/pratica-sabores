/** Página da barbearia: simples e na ordem certa. */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com/l/imperio-barber';
let erros = 0;
const checa = (n, ok, extra = '') => { if (!ok) erros++; console.log(`${ok ? '✓' : '✗'} ${n} ${extra}`); };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(B, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);

  // 1) só o essencial na página
  const visiveis = await p.evaluate(() => ['servicos','equipe','agendar','meus','contato','valores','diferenciais','atalhos','barra']
    .filter(id => { const e = document.getElementById(id); return e && e.offsetParent !== null; }));
  checa('sem excesso de seções', visiveis.length === 2 && visiveis.includes('servicos') && visiveis.includes('equipe'), JSON.stringify(visiveis));

  // 2) logo grande em cima
  const logo = await p.locator('#marcaHero').boundingBox();
  checa('logotipo grande no topo', logo && logo.width >= 150, logo ? `${Math.round(logo.width)}px` : 'sem logo');

  // 3) ordem: serviços, depois barbeiros
  const yS = (await p.locator('#servicos').boundingBox()).y;
  const yE = (await p.locator('#equipe').boundingBox()).y;
  checa('serviços antes dos barbeiros', yS < yE);

  // 4) fluxo: serviço -> barbeiro -> dia -> horário -> nome/tel/pagamento
  await p.locator('[data-agendar]').first().click();
  await p.waitForTimeout(1100);
  checa('serviço escolhido aparece', await p.locator('#servicoEscolhidoTopo').isVisible());
  await p.locator('.card-barbeiro').first().click();
  await p.waitForTimeout(1100);
  await p.locator('.ai-dia').nth(2).click();
  await p.waitForTimeout(1500);
  await p.locator('.ai-hora:not([disabled])').first().click();
  await p.waitForTimeout(800);
  checa('pede nome e WhatsApp', (await p.locator('#aiNome').isVisible()) && (await p.locator('#aiTel').isVisible()));
  const pag = await p.locator('.ai-pag').innerText();
  checa('3 formas de pagamento', (await p.locator('.ai-pag .opt').count()) === 3, pag.replace(/\n/g, ' | '));
  checa('Pix, dinheiro e cartão', /Pix/i.test(pag) && /Dinheiro/i.test(pag) && /Cartão/i.test(pag));

  console.log('\nERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
