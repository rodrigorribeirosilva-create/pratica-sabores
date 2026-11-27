/**
 * PAINEL — editor de grupos de sabores (jsdom, sem navegador).
 *
 * Carrega o public/admin.html + public/assets/admin.js de verdade, loga com um
 * /api/admin/session fake e exercita o que a Agel vai fazer na mão:
 *   1. criar uma BARRA de 1 unidade com 2 recheios (escolhe 1);
 *   2. criar um COMBO de 2 grupos (Rosquinhas 2 un. + Panitos 8 un.);
 *   3. conferir o payload enviado ao salvar.
 *
 * Uso: node tests/ui-painel-grupos.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PRODUTOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/produtos-painel.json'), 'utf8'));

let falhas = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${extra ? ` — ${extra}` : ''}`);
  if (!cond) falhas++;
};
const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');

const adminHtml = fs.readFileSync(path.join(ROOT, 'public/admin.html'), 'utf8')
  .replace(/<script[^>]+src="\/assets\/admin\.js"[^>]*><\/script>/, '')
  .replace(/<script[^>]+src="\/assets\/[^"]+"[^>]*><\/script>/g, '');
const adminJs = fs.readFileSync(path.join(ROOT, 'public/assets/admin.js'), 'utf8');

(async () => {
  const enviados = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    if (!/Could not parse CSS|Not implemented/.test(e.message)) console.log('jsdom:', e.message.slice(0, 160));
  });
  const dom = new JSDOM(adminHtml, {
    url: 'https://loja.test/l/agel-doceria/admin',
    runScripts: 'dangerously',
    virtualConsole,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.alert = () => {};
  window.confirm = () => true;

  const json = (obj, status = 200) =>
    Promise.resolve({
      ok: status < 400,
      status,
      headers: { get: () => 'application/json' },
      json: async () => JSON.parse(JSON.stringify(obj)),
      text: async () => JSON.stringify(obj),
    });

  window.fetch = async (url, opts = {}) => {
    const u = String(url);
    const metodo = (opts.method || 'GET').toUpperCase();
    if (/\/api\/admin\/session/.test(u)) return json({ logged: true, role: 'admin', store: { slug: 'agel-doceria', name: 'Agel Doceria' } });
    if (/\/api\/menu/.test(u)) return json({ store: { slug: 'agel-doceria', segment: 'food' }, business: { name: 'Agel Doceria' }, products: [] });
    if (/\/api\/admin\/products/.test(u) && metodo === 'POST') {
      enviados.push(JSON.parse(opts.body || '{}'));
      return json({ id: 999, name: 'novo' }, 201);
    }
    if (/\/api\/admin\/products/.test(u) && metodo === 'GET') return json(PRODUTOS);
    if (/\/api\/admin\/products/.test(u) && metodo === 'PUT') {
      enviados.push(JSON.parse(opts.body || '{}'));
      return json({ id: 201, name: 'editado' });
    }
    if (/\/api\/admin\/settings/.test(u)) return json({ business: {}, delivery: {}, payments: [] });
    if (/\/api\/admin\/orders/.test(u)) return json([]);
    return json({ ok: true });
  };
  window.navigator.serviceWorker = { register: () => Promise.resolve() };

  window.eval(adminJs);
  await new Promise((r) => setTimeout(r, 400));

  const $ = (sel) => window.document.querySelector(sel);
  const event = (node, tipo) =>
    node.dispatchEvent(new window.Event(tipo, { bubbles: true }));
  const input = (node, valor) => {
    node.value = valor;
    event(node, 'input');
    event(node, 'change');
  };
  const clicar = async (sel) => {
    const n = typeof sel === 'string' ? $(sel) : sel;
    if (!n) throw new Error('não achei ' + sel);
    n.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
  };

  /* ---------------- abre o formulário de novo produto ---------------- */
  console.log('\n— NOVO PRODUTO —');
  ok(!!$('#newProductBtn'), 'painel carregou com o botão "Novo produto"');
  await clicar('#newProductBtn');
  ok(!!$('#productModal') && !$('#productModal').hidden, 'modal de produto abriu');
  input($('#pName'), 'Barra recheada');
  input($('#pPrice'), '15,00');

  // liga "cliente escolhe os sabores"
  const chk = $('#pMontagemAtiva');
  chk.checked = true;
  event(chk, 'change');
  await new Promise((r) => setTimeout(r, 100));
  ok(!$('#pMontagemBox').hidden, 'bloco de sabores apareceu');
  ok(!!$('#pGrupoAdd'), 'existe o botão "+ Adicionar grupo (combo)"');
  ok(window.document.querySelectorAll('.grupo-card').length === 1, 'começa com 1 grupo');

  /* ---------------- BARRA: 1 unidade, escolhe 1 sabor ---------------- */
  const grupo0 = $('[data-grupo="0"]');
  input(grupo0.querySelector('[data-grupo-titulo="0"]'), 'Escolha o recheio');
  input(grupo0.querySelector('[data-grupo-unidades="0"]'), '1');
  ok(Number(grupo0.querySelector('[data-grupo-unidades="0"]').value) === 1, 'aceita 1 unidade (o pedido da Agel)');

  // modo "sabores da barra"
  const radioSabores = grupo0.querySelector('input[name="pMontagemModo-0"][value="sabores"]');
  radioSabores.checked = true;
  event(radioSabores, 'change');
  await new Promise((r) => setTimeout(r, 100));
  const grupo0b = $('[data-grupo="0"]');
  ok(!!grupo0b.querySelector('[data-grupo-barras="0"]'), 'campo "quantas barras" apareceu');
  ok(/Quantos sabores/.test(txt($('[data-grupo-unidades-label="0"]'))), 'rótulo virou "Quantos sabores…"', txt($('[data-grupo-unidades-label="0"]')));

  // cola os sabores
  const cola = grupo0b.querySelector('[data-grupo-cola="0"]');
  cola.value = 'Chocolate branco, Chocolate ao leite';
  await clicar(grupo0b.querySelector('[data-grupo-cola-btn="0"]'));
  const linhas = window.document.querySelectorAll('[data-grupo-sabores="0"] .sabor-row');
  ok(linhas.length === 2, '2 sabores cadastrados pelo campo "colar lista"', String(linhas.length));

  /* ---------------- salvar a barra ---------------- */
  $('#productForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 250));
  const barra = enviados[enviados.length - 1];
  ok(!!barra, 'formulário enviou o produto');
  if (barra) {
    const op = barra.opcoes || {};
    ok(op.ativo === true, 'montagem salva como ativa');
    ok(Number(op.unidades) === 1, 'unidades = 1 salvo', String(op.unidades));
    ok(Number(op.minimo) === 1, 'mínimo = 1 sabor salvo', String(op.minimo));
    ok(op.modo === 'sabores', 'modo = sabores', op.modo);
    ok((op.sabores || []).length === 2, '2 sabores no payload');
    ok(Array.isArray(op.grupos) && op.grupos.length === 1, 'grupos[] com 1 grupo (compatível)');
    ok((op.grupos[0].sabores || []).length === 2, 'grupo 1 com os 2 sabores');
  }

  /* ---------------- COMBO: 2 grupos ---------------- */
  console.log('\n— COMBO (2 rosquinhas + 8 panitos) —');
  window.document.getElementById('productModal').hidden = true;
  await clicar('#newProductBtn');
  input($('#pName'), 'Combo de Natal');
  input($('#pPrice'), '39,00');
  const chk2 = $('#pMontagemAtiva');
  chk2.checked = true;
  event(chk2, 'change');
  await new Promise((r) => setTimeout(r, 100));

  // grupo 1 = rosquinhas, 2 unidades
  let g0 = $('[data-grupo="0"]');
  input(g0.querySelector('[data-grupo-titulo="0"]'), 'Rosquinhas');
  input(g0.querySelector('[data-grupo-unidades="0"]'), '2');
  g0.querySelector('[data-grupo-cola="0"]').value = 'Rosquinha de coco, Rosquinha de chocolate';
  await clicar(g0.querySelector('[data-grupo-cola-btn="0"]'));

  // adiciona o 2º grupo
  await clicar('#pGrupoAdd');
  ok(window.document.querySelectorAll('.grupo-card').length === 2, 'agora tem 2 grupos');
  let g1 = $('[data-grupo="1"]');
  ok(!!g1.querySelector('[data-grupo-cola="1"]'), 'grupo 2 criado com campo de sabores próprio');
  input(g1.querySelector('[data-grupo-titulo="1"]'), 'Panitos');
  input(g1.querySelector('[data-grupo-unidades="1"]'), '8');
  g1.querySelector('[data-grupo-cola="1"]').value = 'Panito de queijo, Panito de doce de leite';
  await clicar(g1.querySelector('[data-grupo-cola-btn="1"]'));
  ok(window.document.querySelectorAll('[data-grupo-sabores="1"] .sabor-row').length === 2, 'panitos com 2 sabores');

  // preview mostra os dois
  const preview = txt($('#pMontagemPreview'));
  ok(/Rosquinhas/.test(preview) && /Panitos/.test(preview), 'prévia mostra os dois grupos', preview.slice(0, 140));
  ok(/8 unidades/.test(preview), 'prévia do panito mostra 8 unidades');

  // remove grupo e volta (garante que dá para desmontar)
  await clicar($('[data-grupo="1"]').querySelector('[data-grupo-del="1"]'));
  ok(window.document.querySelectorAll('.grupo-card').length === 1, 'consegue remover um grupo');
  await clicar('#pGrupoAdd');
  g1 = $('[data-grupo="1"]');
  input(g1.querySelector('[data-grupo-titulo="1"]'), 'Panitos');
  input(g1.querySelector('[data-grupo-unidades="1"]'), '8');
  g1.querySelector('[data-grupo-cola="1"]').value = 'Panito de queijo, Panito de doce de leite';
  await clicar(g1.querySelector('[data-grupo-cola-btn="1"]'));

  $('#productForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 250));
  const combo = enviados[enviados.length - 1];
  ok(!!combo && combo.opcoes, 'combo enviado');
  if (combo && combo.opcoes) {
    const op = combo.opcoes;
    ok(Array.isArray(op.grupos) && op.grupos.length === 2, '2 grupos no payload', String((op.grupos || []).length));
    const [a, b] = op.grupos || [];
    ok(a && a.titulo === 'Rosquinhas' && Number(a.unidades) === 2, 'grupo 1: Rosquinhas / 2 un.', JSON.stringify({ t: a && a.titulo, u: a && a.unidades }));
    ok(b && b.titulo === 'Panitos' && Number(b.unidades) === 8, 'grupo 2: Panitos / 8 un.', JSON.stringify({ t: b && b.titulo, u: b && b.unidades }));
    ok((b && b.sabores.length) === 2, 'grupo 2 com 2 sabores');
    ok(op.titulo === 'Rosquinhas' && Number(op.unidades) === 2, 'espelho do grupo 1 nos campos antigos (compat)');
  }


  /* ---------------- CAIXA DE 9: um sabor só ---------------- */
  console.log('\n— CAIXA DE 9 (um sabor só, vale para as 9) —');
  window.document.getElementById('productModal').hidden = true;
  await clicar('#newProductBtn');
  input($('#pName'), 'Caixa de 9 docinhos');
  input($('#pPrice'), '29,00');
  const chk4 = $('#pMontagemAtiva');
  chk4.checked = true;
  event(chk4, 'change');
  await new Promise((r) => setTimeout(r, 100));

  const g9 = $('[data-grupo="0"]');
  input(g9.querySelector('[data-grupo-titulo="0"]'), 'Escolha o sabor');
  input(g9.querySelector('[data-grupo-unidades="0"]'), '9');
  const radioUnico = g9.querySelector('input[name="pMontagemModo-0"][value="unico"]');
  ok(!!radioUnico, 'existe a opção "Um sabor só, para todas as unidades"');
  radioUnico.checked = true;
  event(radioUnico, 'change');
  await new Promise((r) => setTimeout(r, 100));
  const g9b = $('[data-grupo="0"]');
  ok(/Quantas unidades vêm com esse sabor/.test(txt($('[data-grupo-unidades-label="0"]'))), 'rótulo: "Quantas unidades vêm com esse sabor?"', txt($('[data-grupo-unidades-label="0"]')));
  ok(g9b.querySelector('[data-grupo-barras-wrap="0"]').hidden, 'campo de barras continua escondido');

  g9b.querySelector('[data-grupo-cola="0"]').value = 'Brigadeiro, Morango, Ninho, Beijinho';
  await clicar(g9b.querySelector('[data-grupo-cola-btn="0"]'));
  ok(window.document.querySelectorAll('[data-grupo-sabores="0"] .sabor-row').length === 4, '4 sabores cadastrados');

  const preview9 = txt($('#pMontagemPreview'));
  ok(/9 unidades · 1 sabor só/.test(preview9), 'prévia: "9 unidades · 1 sabor só"', preview9.slice(0, 120));
  ok(/9 Brigadeiro/.test(preview9), 'prévia mostra "9 Brigadeiro" (o cliente não monta 3 de cada)');

  $('#productForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 250));
  const caixa9 = enviados[enviados.length - 1];
  ok(!!caixa9 && caixa9.opcoes, 'caixa de 9 enviada');
  if (caixa9 && caixa9.opcoes) {
    const op = caixa9.opcoes;
    ok(op.modo === 'unico', 'modo = unico', op.modo);
    ok(Number(op.unidades) === 9, 'unidades = 9', String(op.unidades));
    ok(Number(op.minimo) === 1, 'mínimo = 1 sabor', String(op.minimo));
    ok((op.sabores || []).length === 4, '4 sabores no payload');
    ok(op.grupos && op.grupos[0].modo === 'unico', 'grupo salvo com modo unico');
  }

  /* ---------------- validação: 1 sabor só é recusado com aviso ---------------- */
  console.log('\n— VALIDAÇÃO —');
  window.document.getElementById('productModal').hidden = true;
  await clicar('#newProductBtn');
  input($('#pName'), 'Teste inválido');
  input($('#pPrice'), '10,00');
  const chk3 = $('#pMontagemAtiva');
  chk3.checked = true;
  event(chk3, 'change');
  await new Promise((r) => setTimeout(r, 100));
  const antes = enviados.length;
  $('#productForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 200));
  ok(enviados.length === antes, 'não enviou produto sem sabor cadastrado');

  console.log(`\n${falhas ? `❌ ${falhas} falha(s)` : '✅ tudo certo'}`);
  // o painel tem setInterval (atualização automática): encerra na mão
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('❌ erro:', e.message, e.stack && e.stack.split('\n')[1]);
  process.exit(1);
});
