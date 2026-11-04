/**
 * Verificação completa da loja Império Barber (site + painel).
 * Uso: node tests/verifica-imperio-v2.js
 */
const { chromium } = require('playwright');

const BASE = 'https://loja-digital.onrender.com';
const LOJA = `${BASE}/l/imperio-barber`;
const SENHA = 'imperio2026';
let falhas = 0;
const ok = (cond, txt, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + txt + (extra !== undefined && !cond ? ' → ' + JSON.stringify(extra) : ''));
  if (!cond) falhas += 1;
};

/** Enche um dia de propósito (para provar o selo "Esgotado") e depois apaga. */
async function encherUmDia() {
  const sv = await (await fetch(`${LOJA}/api/servicos`)).json();
  const servico = sv.servicos[0];
  const prof = (sv.equipe || [])[0];
  const l = await fetch(`${LOJA}/api/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: SENHA }),
  });
  const cookie = (l.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  let dia = null, horas = [];
  for (let i = 5; i < 18 && !dia; i++) { // dentro da janela que o site mostra
    const d = new Date(Date.now() + i * 86400000);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await (await fetch(`${LOJA}/api/disponibilidade?data=${iso}&profissional=${prof.id}&servico=${servico.id}`)).json();
    const livres = (r.horarios || []).filter((h) => h.livre);
    if (r.aberto && livres.length) { dia = iso; horas = livres.map((h) => h.hora); }
  }
  for (const hora of horas) {
    await fetch(`${LOJA}/api/agendar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Ocupa Dia Teste', telefone: '48990000000', servico_id: servico.id, data: dia, hora, profissional_id: prof.id, pagamento: 'local' }),
    });
  }
  return { cookie, dia, horas };
}

(async () => {
  const cheio = await encherUmDia();
  const browser = await chromium.launch();
  const erros = [];

  /* ---------------- SITE (mobile) ---------------- */
  console.log('\n== Página do cliente ==');
  const p = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => erros.push('site: ' + e.message));
  await p.goto(LOJA, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1600);

  const meta = await p.evaluate(() => {
    const g = (n) => (document.querySelector(`meta[property="${n}"]`) || {}).content || '';
    return { titulo: g('og:title'), desc: g('og:description'), img: g('og:image') };
  });
  ok(/agende seu horário/i.test(meta.titulo), 'prévia do link fala "Agende seu horário"', meta.titulo);
  ok(!/onrender|loja-digital/i.test(meta.titulo + ' ' + meta.desc), 'prévia não cita a plataforma', meta);
  ok(/og-card\.png/.test(meta.img), 'prévia usa o cartão com o logotipo redondo', meta.img);

  const logo = await p.locator('#marcaHero').evaluate((e) => {
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    return { w: Math.round(r.width), raio: cs.borderRadius };
  });
  ok(logo.raio === '50%' && logo.w >= 300, 'topo só com o logotipo redondo e grande', logo);
  ok(!(await p.locator('.hero h1').isVisible()), 'nome da empresa escondido no topo');

  const servicos = await p.locator('.card-serv-foto').count();
  ok(servicos === 13, '13 serviços com foto', servicos);
  ok((await p.locator('.faixa').count()) === 0 || !(await p.locator('.faixa').first().isVisible()), 'sem faixa de números no topo');

  /* serviço → barbeiro → dias → horários */
  await p.locator('.card-serv-foto .cs-radio').first().click();
  await p.waitForTimeout(1500);
  await p.locator('#listaEquipe .card-barbeiro').first().click();
  await p.waitForTimeout(3000);
  const dias = await p.locator('#aiDias .ai-dia').count();
  ok(dias >= 14, 'seletor de dias com data + dia da semana', dias);
  const selos = await p.locator('#aiDias .tag').count();
  ok(selos >= 1, 'dias lotados marcados como "Esgotado"', selos);
  const rotulo = await p.locator('#aiDias .ai-dia').first().innerText();
  ok(/\d{2}\/\d{2}/.test(rotulo) && /(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i.test(rotulo), 'cartão do dia mostra 02/11 + Segunda', rotulo);

  await p.locator('#aiDias .ai-dia:not(.esgotado)').first().click();
  await p.waitForTimeout(2800);
  const grade = await p.locator('#aiHorarios .ai-hora').allInnerTexts();
  const horas = grade.map((t) => t.split('\n')[0]);
  ok(/^09:00$/.test(horas[0]), 'grade começa no horário de abertura (09:00)', horas.slice(0, 3));
  ok(horas.includes('09:30') && horas.includes('10:00'), 'grade de 30 em 30 min (duração do corte)', horas.slice(0, 4));
  const tomadas = await p.locator('#aiHorarios .ai-hora.tomada').allInnerTexts();
  ok(tomadas.every((t) => /já agendou|já passou/i.test(t)), 'horário ocupado fica vermelho com o nome', tomadas.slice(0, 2));
  ok((await p.locator('#aiHorarios .ai-hora.tomada[disabled]').count()) === tomadas.length, 'horário ocupado não pode ser selecionado');

  await p.screenshot({ path: 'tests/shots/v2-site-agenda.png' });

  /* ---------------- PAINEL ---------------- */
  console.log('\n== Painel ==');
  const a = await browser.newPage({ viewport: { width: 390, height: 950 }, deviceScaleFactor: 2 });
  a.on('pageerror', (e) => erros.push('painel: ' + e.message));
  await a.goto(`${LOJA}/admin`, { waitUntil: 'domcontentloaded' });
  await a.waitForTimeout(3200);
  ok(await a.evaluate(() => document.body.classList.contains('tema-imperio')), 'painel no tema Império (escuro + dourado)');
  await a.fill('#senha', SENHA);
  await a.click('#btnLogin');
  await a.waitForTimeout(5500);

  const abas = await a.locator('.nav button').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.innerText.replace(/\n/g, ' ')));
  ok(abas.length === 6, 'menu com 6 abas (simples)', abas);
  ok(!(await a.locator('.nav button[data-tab="equipamentos"]').isVisible()), 'sem aba de Aparelhos (ar-condicionado)');
  const kpis = (await a.locator('.kpi').allInnerTexts()).map((t) => t.replace(/\n/g, ' ').toLowerCase());
  ok(kpis.some((k) => /clientes hoje/.test(k)) && kpis.some((k) => /faturamento hoje/.test(k)) && kpis.some((k) => /no mês/.test(k)), 'números do dia + faturamento', kpis);
  ok((await a.locator('#gradeHoje .grade-hora').count()) > 10, 'grade de horários de hoje no painel');
  const corpo = await a.locator('body').innerText();
  ok(!/aparelho|ar\(es\)|climatiza/i.test(corpo), 'nenhuma sobra de ar-condicionado no painel');

  await a.click('.nav button[data-tab="equipe"]');
  await a.waitForTimeout(2000);
  ok((await a.locator('[data-acao="fotoBarbeiro"]').count()) >= 1, 'equipe com botão de foto do barbeiro');

  /* calendário: dia / semana / mês */
  await a.click('.nav button[data-tab="agenda"]');
  await a.waitForTimeout(3500);
  ok((await a.locator('.cal-dia[data-cal]').count()) >= 28, 'calendário do mês com todos os dias', await a.locator('.cal-dia[data-cal]').count());
  const celulas = await a.locator('.cal-dia[data-cal]').allInnerTexts();
  ok(celulas.some((t) => /livre/.test(t)), 'cada dia mostra quantos horários estão livres', celulas.slice(0, 4));
  await a.locator('.cal-modos button[data-modo="semana"]').click();
  await a.waitForTimeout(2200);
  ok((await a.locator('.cal-linha').count()) === 7, 'visão por semana (7 dias)', await a.locator('.cal-linha').count());
  await a.locator('.cal-modos button[data-modo="dia"]').click();
  await a.waitForTimeout(2000);
  ok((await a.locator('.cal-linha').count()) === 1, 'visão por dia', await a.locator('.cal-linha').count());
  await a.locator('.cal-modos button[data-modo="mes"]').click();
  await a.waitForTimeout(1800);
  await a.locator('.cal-dia[data-cal]').nth(15).click();
  await a.waitForTimeout(2600);
  ok((await a.locator('#gradeHoras .grade-hora').count()) > 5, 'clicar no dia abre a grade de horários dele', await a.locator('#gradeHoras .grade-hora').count());
  await a.screenshot({ path: 'tests/shots/v2-calendario.png' });

  await a.click('.nav button[data-tab="promocoes"]');
  await a.waitForTimeout(2500);
  ok(await a.locator('#resumoVenda').isVisible(), 'aba Promoções com resumo da venda');
  ok((await a.locator('[data-promo-atalho]').count()) === 3, 'atalhos de campanha (Black Friday etc.)');

  await a.click('#btnConfig');
  await a.waitForTimeout(2000);
  ok(await a.locator('#cardPagamentos').isVisible(), 'aba Loja com formas de pagamento / Pix');
  await a.screenshot({ path: 'tests/shots/v2-painel-loja.png' });

  ok(erros.length === 0, 'nenhum erro de JavaScript', erros);
  console.log('\n' + (falhas ? 'FALHAS: ' + falhas : 'TUDO OK ✓'));
  // limpa os agendamentos do teste do "dia cheio"
  const ago = await (await fetch(`${LOJA}/api/admin/agendamentos?status=todos`, { headers: { cookie: cheio.cookie } })).json();
  for (const a of ago.filter((x) => x.cliente_nome === 'Ocupa Dia Teste')) {
    await fetch(`${LOJA}/api/admin/agendamentos/${a.id}`, { method: 'DELETE', headers: { cookie: cheio.cookie } });
  }
  await browser.close();
  process.exit(falhas ? 1 : 0);
})();
