/**
 * Sequência do agendamento da barbearia:
 * 1º cortes (topo) → barbeiro → dia/horário → cadastro (nome + WhatsApp) → pagamento → pedido.
 * Horário já tomado fica FIXO em vermelho com o nome de quem marcou.
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com/l/imperio-barber';
let erros = 0;
const checa = (n, ok, extra = '') => { if (!ok) erros++; console.log(`${ok ? '✓' : '✗'} ${n} ${extra}`); };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 420, height: 900 } });
  p.on('pageerror', (e) => { console.log('ERRO JS:', e.message); erros++; });
  await p.goto(B, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);

  // 1) a ordem das seções: serviços antes dos barbeiros
  const yServ = (await p.locator('#servicos').boundingBox()).y;
  const yEq = (await p.locator('#equipe').boundingBox()).y;
  checa('os cortes vêm ANTES dos barbeiros', yServ < yEq, `serviços y=${Math.round(yServ)} · barbeiros y=${Math.round(yEq)}`);

  // 2) clicar no barbeiro sem serviço escolhido manda escolher o corte
  await p.locator('.card-barbeiro').first().click();
  await p.waitForTimeout(900);
  checa('sem serviço, não abre a agenda', !(await p.locator('#agendaInline').isVisible()));
  checa('avisa para escolher o serviço primeiro', /Escolha primeiro o serviço/i.test(await p.locator('body').innerText()));

  // 3) escolher o corte
  await p.locator('[data-agendar]').first().click();
  await p.waitForTimeout(1200);
  checa('mostra o serviço escolhido no topo dos barbeiros', await p.locator('#servicoEscolhidoTopo').isVisible());
  checa('o card do serviço fica marcado', (await p.locator('.card-serv-foto.on').count()) === 1);

  // 4) escolher o barbeiro -> agenda abre embaixo
  await p.locator('.card-barbeiro').first().click();
  await p.waitForTimeout(1200);
  checa('agenda abre embaixo da foto do barbeiro', await p.locator('#agendaInline').isVisible());

  // 5) dia e horário
  await p.locator('.ai-dia').nth(3).click();
  await p.waitForTimeout(1600);
  checa('mostra os horários', (await p.locator('.ai-hora').count()) > 0);
  checa('cadastro só depois do horário', (await p.locator('#aiNome').count()) === 0);

  await p.locator('.ai-hora:not([disabled])').first().click();
  await p.waitForTimeout(900);
  checa('3. cadastro (nome + WhatsApp)', (await p.locator('#aiNome').isVisible()) && (await p.locator('#aiTel').isVisible()));
  checa('4. forma de pagamento aparece', (await p.locator('.ai-pag .opt').count()) >= 1);
  checa('tem "Pagar na barbearia"', /Pagar na barbearia/i.test(await p.locator('.ai-pag').innerText()));

  // 6) tentar enviar sem pagamento
  await p.fill('#aiNome', 'Cliente Sequência');
  await p.fill('#aiTel', '48999993333');
  await p.click('#aiEnviar');
  await p.waitForTimeout(800);
  checa('exige a forma de pagamento', /forma de pagamento/i.test(await p.locator('#aiErro').innerText()));

  // 7) escolher pagamento na barbearia e enviar
  await p.locator('.ai-pag .opt[data-pag="local"]').click();
  await p.waitForTimeout(500);
  await p.click('#aiEnviar');
  await p.waitForTimeout(2500);
  const ok = await p.locator('#agendaInline').innerText();
  checa('pedido concluído', /solicitado/i.test(ok));
  checa('mostra "Pagamento na barbearia"', /Pagamento na barbearia/i.test(ok));
  await p.screenshot({ path: 'tests/shots/imperio-sequencia-ok.png' });

  // 8) voltar: o horário agora fica VERMELHO com o nome
  await p.locator('#aiOutro').click();
  await p.waitForTimeout(2000);
  checa('horário ocupado fica fixo em vermelho', (await p.locator('.ai-hora.tomada').count()) === 1);
  const tomada = await p.locator('.ai-hora.tomada').innerText();
  checa('mostra o nome de quem agendou', /CLIENTE/i.test(tomada), JSON.stringify(tomada));
  await p.locator('#agendaInline').scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'tests/shots/imperio-sequencia-vermelho.png' });

  console.log('\nERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
