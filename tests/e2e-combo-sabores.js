/**
 * COMBO + 1 SABOR — teste ponta a ponta (servidor + banco temporários).
 *
 * Cobre os dois pedidos da Agel:
 *   1. barra recheada de 1 unidade, cliente escolhe 1 sabor (branco OU ao leite);
 *   2. combo 2 rosquinhas + 8 panitos, cada parte com sua lista de sabores.
 *
 * Sobe o servidor num PORT livre com DATA_DIR/DB_FILE temporários, salva os
 * produtos pelo painel (API real) e faz o pedido pelo checkout público.
 *
 * Uso: node tests/e2e-combo-sabores.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORTA = process.env.PORT_TESTE || '3991';
const BASE = `http://127.0.0.1:${PORTA}`;
const SLUG = 'agel-doceria-teste';
const SENHA = 'agel2026';
const MASTER = 'master123';

let falhas = 0;
const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '✅' : '❌'} ${msg}${extra ? ` — ${extra}` : ''}`);
  if (!cond) falhas++;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'combo-teste-'));
const env = {
  ...process.env,
  PORT: PORTA,
  DATA_DIR: tmp,
  DB_FILE: path.join(tmp, 'menu.db'),
  NODE_ENV: 'test',
  MASTER_PASSWORD: MASTER,
};
delete env.SUPABASE_URL;
delete env.SUPABASE_SERVICE_KEY;

/** Sessão do painel (cookie) + helpers de chamada. */
function criarCliente() {
  let cookie = '';
  const chamar = async (url, opts = {}) => {
    const res = await fetch(BASE + url, {
      ...opts,
      headers: {
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(opts.headers || {}),
      },
      redirect: 'manual',
    });
    const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of setCookie) {
      const par = c.split(';')[0];
      if (/^[^=]+=/.test(par)) {
        const nome = par.split('=')[0];
        const outros = cookie.split('; ').filter((x) => x && !x.startsWith(nome + '='));
        outros.push(par);
        cookie = outros.join('; ');
      }
    }
    const texto = await res.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {}
    return { status: res.status, texto, json, headers: res.headers };
  };
  return { chamar, get cookie() { return cookie; } };
}

async function esperarServidor(tentativas = 60) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(BASE + '/l/' + SLUG + '/api/menu');
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

(async () => {
  // -r tests/_registrar-shim.js: usa o node:sqlite no lugar do better-sqlite3 (sandbox sem gyp)
  const servidor = spawn(process.execPath, ['-r', path.join(ROOT, 'tests/_registrar-shim.js'), 'server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logServidor = '';
  servidor.stdout.on('data', (d) => (logServidor += d.toString()));
  servidor.stderr.on('data', (d) => (logServidor += d.toString()));

  try {
    if (!(await esperarServidor())) throw new Error('servidor não subiu:\n' + logServidor.slice(-1500));
    console.log(`servidor de teste em ${BASE} (banco ${tmp})\n`);

    // ---- cria a loja pelo painel master ----
    const master = criarCliente();
    let r = await master.chamar('/api/master/login', { method: 'POST', body: JSON.stringify({ password: MASTER }) });
    ok(r.status < 400, 'login do master', `HTTP ${r.status} ${r.texto.slice(0, 120)}`);
    r = await master.chamar('/api/master/stores', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Agel Doceria',
        slug: SLUG,
        password: SENHA,
        whatsapp: '5548999999999',
        segment: 'food',
        withSeedProducts: false,
      }),
    });
    ok(r.status < 400, 'loja de teste criada', `HTTP ${r.status} ${r.texto.slice(0, 160)}`);

    const loja = criarCliente();
    r = await loja.chamar(`/l/${SLUG}/api/admin/login`, { method: 'POST', body: JSON.stringify({ password: SENHA }) });
    ok(r.status < 400, 'login do painel da loja', `HTTP ${r.status} ${r.texto.slice(0, 160)}`);

    // ---- 1) BARRA RECHEADA: 1 unidade, 1 sabor ----
    r = await loja.chamar(`/l/${SLUG}/api/admin/products`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Barra recheada (1 un.)',
        price_cents: 15,
        description: 'Escolha o recheio',
        category: 'Natal',
        active: true,
        in_stock: true,
        opcoes: {
          ativo: true,
          modo: 'sabores',
          titulo: 'Escolha o recheio',
          unidades: 1,
          barras: 1,
          minimo: 1,
          sabores: [
            { nome: 'Chocolate branco', extra_cents: 0 },
            { nome: 'Chocolate ao leite', extra_cents: 0 },
          ],
        },
      }),
    });
    ok(r.status < 400, 'salvou barra de 1 unidade / escolhe 1 sabor', `HTTP ${r.status} ${r.texto.slice(0, 200)}`);
    const barra = r.json || null;
    const barraId = barra && barra.id;

    // ---- 2) COMBO: 2 rosquinhas + 8 panitos ----
    r = await loja.chamar(`/l/${SLUG}/api/admin/products`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Combo de Natal (2 rosquinhas + 8 panitos)',
        price_cents: 39,
        description: 'Monte os sabores',
        category: 'Natal',
        active: true,
        in_stock: true,
        opcoes: {
          ativo: true,
          modo: 'partes',
          titulo: 'Rosquinhas',
          unidades: 2,
          minimo: 2,
          sabores: [
            { nome: 'Rosquinha de coco', extra_cents: 0 },
            { nome: 'Rosquinha de chocolate', extra_cents: 0 },
          ],
          grupos: [
            {
              titulo: 'Rosquinhas',
              modo: 'partes',
              unidades: 2,
              minimo: 2,
              sabores: [
                { nome: 'Rosquinha de coco', extra_cents: 0 },
                { nome: 'Rosquinha de chocolate', extra_cents: 0 },
              ],
            },
            {
              titulo: 'Panitos',
              modo: 'partes',
              unidades: 8,
              minimo: 8,
              sabores: [
                { nome: 'Panito de queijo', extra_cents: 0 },
                { nome: 'Panito de doce de leite', extra_cents: 100 },
              ],
            },
          ],
        },
      }),
    });
    ok(r.status < 400, 'salvou combo com 2 grupos', `HTTP ${r.status} ${r.texto.slice(0, 200)}`);
    const combo = r.json || null;
    const comboId = combo && combo.id;

    // ---- o que a vitrine recebe ----
    const respMenu = await fetch(`${BASE}/l/${SLUG}/api/menu`);
    const publico = await respMenu.json().catch(() => null);
    const produtos = (publico && publico.products) || [];
    const pBarra = produtos.find((p) => p.id === barraId) || produtos.find((p) => /Barra recheada/.test(p.name));
    const pCombo = produtos.find((p) => p.id === comboId) || produtos.find((p) => /Combo de Natal/.test(p.name));
    ok(!!pBarra, 'catálogo devolve a barra');
    ok(!!pCombo, 'catálogo devolve o combo');
    if (pBarra) {
      const op = pBarra.opcoes || {};
      ok(Number(op.unidades) === 1 && (op.sabores || []).length === 2, 'barra: 1 unidade e 2 sabores', JSON.stringify({ u: op.unidades, s: (op.sabores || []).length }));
      ok(Number(op.minimo) === 1, 'barra: mínimo 1 sabor');
    }
    if (pCombo) {
      const grupos = (pCombo.opcoes && pCombo.opcoes.grupos) || [];
      ok(grupos.length === 2, 'combo: 2 grupos no catálogo', `tem ${grupos.length}`);
      ok(grupos[0] && grupos[0].titulo === 'Rosquinhas' && Number(grupos[0].unidades) === 2, 'combo: grupo Rosquinhas com 2 un.');
      ok(grupos[1] && grupos[1].titulo === 'Panitos' && Number(grupos[1].unidades) === 8, 'combo: grupo Panitos com 8 un.');
    }

    // ---- checkout: 1 barra (1 sabor) ----
    const pedido = async (itens) =>
      fetch(`${BASE}/l/${SLUG}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: 'Cliente Teste',
          phone: '48999999999',
          fulfillment: 'pickup',
          payment_method: 'dinheiro',
          items: itens,
        }),
      });

    let resp = await pedido([{ id: barraId, qty: 1, escolhas: [{ nome: 'Chocolate branco', qtd: 1 }] }]);
    let corpo = await resp.json().catch(() => ({}));
    ok(resp.status < 400, 'pedido com barra de 1 sabor passou', `HTTP ${resp.status} ${JSON.stringify(corpo).slice(0, 200)}`);
    const pedidoBarra = corpo && (corpo.order || corpo);
    const itemBarra = pedidoBarra && (pedidoBarra.items || [])[0];
    if (itemBarra) ok(/Chocolate branco/.test(itemBarra.name || ''), 'comanda mostra o sabor escolhido', itemBarra.name);

    // ---- checkout: combo com os dois grupos ----
    resp = await pedido([
      {
        id: comboId,
        qty: 1,
        escolhas: [
          { grupo: 'Rosquinhas', nome: 'Rosquinha de coco', qtd: 1 },
          { grupo: 'Rosquinhas', nome: 'Rosquinha de chocolate', qtd: 1 },
          { grupo: 'Panitos', nome: 'Panito de queijo', qtd: 5 },
          { grupo: 'Panitos', nome: 'Panito de doce de leite', qtd: 3 },
        ],
      },
    ]);
    corpo = await resp.json().catch(() => ({}));
    ok(resp.status < 400, 'pedido do combo passou', `HTTP ${resp.status} ${JSON.stringify(corpo).slice(0, 200)}`);
    const pedidoCombo = corpo && (corpo.order || corpo);
    const itemCombo = pedidoCombo && (pedidoCombo.items || [])[0];
    if (itemCombo) {
      console.log('   comanda:', itemCombo.name);
      ok(/Rosquinhas:/.test(itemCombo.name) && /Panitos:/.test(itemCombo.name), 'comanda mostra os dois grupos');
      ok(Number(itemCombo.price_cents) === 3900 + 300, 'preço somou o acréscimo do panito (R$ 3,00)', String(itemCombo.price_cents));
    }

    // ---- recusas que DEVEM continuar acontecendo ----
    resp = await pedido([
      {
        id: comboId,
        qty: 1,
        escolhas: [
          { grupo: 'Rosquinhas', nome: 'Rosquinha de coco', qtd: 1 },
          { grupo: 'Rosquinhas', nome: 'Rosquinha de chocolate', qtd: 1 },
          { grupo: 'Panitos', nome: 'Panito de queijo', qtd: 4 },
        ],
      },
    ]);
    ok(resp.status === 400, 'combo com panitos faltando é recusado', `HTTP ${resp.status}`);

    resp = await pedido([{ id: barraId, qty: 1, escolhas: [] }]);
    ok(resp.status === 400, 'barra sem escolher sabor é recusada', `HTTP ${resp.status}`);

    resp = await pedido([{ id: comboId, qty: 1, escolhas: [{ grupo: 'Rosquinhas', nome: 'Rosquinha de coco', qtd: 3 }, { grupo: 'Panitos', nome: 'Panito de queijo', qtd: 8 }] }]);
    ok(resp.status === 400, 'combo com rosquinha a mais é recusado', `HTTP ${resp.status}`);

    console.log(`\n${falhas ? `❌ ${falhas} falha(s)` : '✅ tudo certo'}`);
    process.exitCode = falhas ? 1 : 0;
  } catch (e) {
    console.error('❌ erro no teste:', e.message);
    console.error(logServidor.slice(-2000));
    process.exitCode = 1;
  } finally {
    servidor.kill('SIGKILL');
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
})();
