/**
 * UI da MONTAGEM no cardápio (combo + barra de 1 sabor) — jsdom.
 *
 * Carrega o public/index.html + public/assets/menu.js de verdade, alimenta a
 * API /api/menu com um catálogo de teste e clica na tela de montagem.
 *
 * Uso: node tests/ui-montagem-combo.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const MENU = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/menu-combo.json'), 'utf8'));

let falhas = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${extra ? ` — ${extra}` : ''}`);
  if (!cond) falhas++;
};

const menuJs = fs.readFileSync(path.join(ROOT, 'public/assets/menu.js'), 'utf8');

const htmlOriginal = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

async function montar(mutate) {
  const html = htmlOriginal.replace(
    /<script[^>]+src="\/assets\/menu\.js"[^>]*><\/script>/,
    ''
  );
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (!/Could not parse CSS|Not implemented/.test(e.message)) console.log('jsdom:', e.message.slice(0, 200));
  });
  const dom = new JSDOM(html, {
    url: 'https://loja.test/l/agel-doceria',
    runScripts: 'dangerously',
    virtualConsole,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

  // servidor fake
  window.fetch = async (url) => {
    const u = String(url);
    const json = (obj) =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => JSON.parse(JSON.stringify(obj)),
        text: async () => JSON.stringify(obj),
      });
    if (/\/api\/menu/.test(u)) return json(MENU);
    if (/\/healthz/.test(u)) return json({ ok: true });
    return json({ ok: true, order: { code: 'TESTE-1' } });
  };
  window.navigator.serviceWorker = { register: () => Promise.resolve() };

  // roda o menu.js no contexto da página
  window.eval(menuJs);
  await new Promise((r) => setTimeout(r, 120));
  if (mutate) await mutate(window);
  return window;
}

const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
const clicar = async (window, sel) => {
  const node = window.document.querySelector(sel);
  if (!node) throw new Error('não achei ' + sel);
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 60));
};

(async () => {
  /* ---------------- 1) BARRA RECHEADA: escolher 1 sabor ---------------- */
  console.log('\n— BARRA RECHEADA (1 unidade, escolhe 1 recheio) —');
  let w = await montar();
  const cardBarra = w.document.querySelector('[data-montar="201"]');
  ok(!!cardBarra, 'card da barra tem o botão de montagem');
  ok(/Escolher 1 sabor/.test(txt(cardBarra)), 'botão diz "Escolher 1 sabor"', txt(cardBarra));

  await clicar(w, '[data-montar="201"]');
  ok(/Escolha os sabores/.test(txt(w.document.getElementById('drawerTitle'))), 'título do painel', txt(w.document.getElementById('drawerTitle')));
  ok(/Escolha o recheio · escolha 1 sabor/.test(txt(w.document.querySelector('.montar-sub'))), 'subtítulo explica 1 sabor', txt(w.document.querySelector('.montar-sub')));
  ok(w.document.querySelectorAll('.montar-item').length === 2, 'mostra os 2 recheios');
  ok(w.document.getElementById('montarAdd').disabled, 'sem escolher, "Adicionar" fica bloqueado');

  await clicar(w, '[data-montar-inc="0::Chocolate branco"]');
  ok(/Tudo certo/.test(txt(w.document.querySelector('.montar-contador'))), 'contador confirma 1 sabor escolhido', txt(w.document.querySelector('.montar-contador')));
  ok(!w.document.getElementById('montarAdd').disabled, 'liberou o botão de adicionar');
  const chipOutro = w.document.querySelector('[data-montar-inc="0::Chocolate ao leite"]');
  ok(chipOutro && chipOutro.disabled, 'o outro recheio fica travado (só 1 sabor)');

  // troca o sabor
  await clicar(w, '[data-montar-dec="0::Chocolate branco"]');
  await clicar(w, '[data-montar-inc="0::Chocolate ao leite"]');
  await clicar(w, '#montarAdd');
  const drawer = txt(w.document.getElementById('drawerBody'));
  ok(/Barra recheada/.test(drawer) && /Chocolate ao leite/.test(drawer), 'carrinho mostra o recheio escolhido', drawer.slice(0, 160));

  /* ---------------- 2) COMBO: 2 rosquinhas + 8 panitos ---------------- */
  console.log('\n— COMBO (2 rosquinhas + 8 panitos) —');
  w = await montar();
  const cardCombo = w.document.querySelector('[data-montar="202"]');
  ok(/Montar combo/.test(txt(cardCombo)), 'botão diz "Montar combo"', txt(cardCombo));

  await clicar(w, '[data-montar="202"]');
  ok(/Monte seu combo/.test(txt(w.document.getElementById('drawerTitle'))), 'título "Monte seu combo"', txt(w.document.getElementById('drawerTitle')));
  const secoes = w.document.querySelectorAll('.montar-grupo');
  ok(secoes.length === 2, 'duas seções (rosquinhas e panitos)', String(secoes.length));
  ok(/Rosquinhas/.test(txt(secoes[0])) && /2 unidades/.test(txt(secoes[0])), 'seção 1 = Rosquinhas, 2 un.', txt(secoes[0]).slice(0, 90));
  ok(/Panitos/.test(txt(secoes[1])) && /8 unidades/.test(txt(secoes[1])), 'seção 2 = Panitos, 8 un.', txt(secoes[1]).slice(0, 90));
  ok(w.document.querySelectorAll('.montar-contador').length === 2, 'um contador por grupo');
  ok(w.document.getElementById('montarAdd').disabled, 'combo começa bloqueado');

  // rosquinhas: 1 de cada
  await clicar(w, '[data-montar-inc="0::Rosquinha de coco"]');
  await clicar(w, '[data-montar-inc="0::Rosquinha de chocolate"]');
  ok(/Tudo certo/.test(txt(w.document.querySelectorAll('.montar-contador')[0])), 'rosquinhas fechadas', txt(w.document.querySelectorAll('.montar-contador')[0]));
  ok(/Escolha mais 8 unidades/.test(txt(w.document.querySelectorAll('.montar-contador')[1])), 'panitos ainda pendentes');
  ok(w.document.getElementById('montarAdd').disabled, 'ainda não deixa adicionar (falta panito)');

  // panitos: 5 queijo + 3 doce de leite
  for (let i = 0; i < 5; i++) await clicar(w, '[data-montar-inc="1::Panito de queijo"]');
  for (let i = 0; i < 3; i++) await clicar(w, '[data-montar-inc="1::Panito de doce de leite"]');
  ok(/Tudo certo/.test(txt(w.document.querySelectorAll('.montar-contador')[1])), 'panitos fechados', txt(w.document.querySelectorAll('.montar-contador')[1]));
  ok(!w.document.getElementById('montarAdd').disabled, 'liberou adicionar o combo');
  const botaoAdd = txt(w.document.getElementById('montarAdd'));
  ok(/42,00/.test(botaoAdd), 'preço com o acréscimo do panito (R$ 42,00)', botaoAdd);

  await clicar(w, '#montarAdd');
  const carrinho = txt(w.document.getElementById('drawerBody'));
  ok(/Rosquinhas: Rosquinha de coco, Rosquinha de chocolate/.test(carrinho), 'carrinho: rosquinhas agrupadas', carrinho.slice(0, 200));
  ok(/Panitos: 5 Panito de queijo, 3 Panito de doce de leite/.test(carrinho), 'carrinho: panitos agrupados');
  ok(/R\$ 42,00/.test(carrinho), 'carrinho com o preço certo');

  console.log(`\n${falhas ? `❌ ${falhas} falha(s)` : '✅ tudo certo'}`);
  // a vitrine tem setInterval (atualização): encerra na mão
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('❌ erro:', e.message, e.stack && e.stack.split('\n')[1]);
  process.exit(1);
});
