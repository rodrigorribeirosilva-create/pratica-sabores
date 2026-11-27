/**
 * COMPATIBILIDADE — produto antigo (sem `grupos`) continua funcionando igual.
 *
 * Salva um produto no formato VELHO (só modo/titulo/unidades/sabores) e faz um
 * pedido no formato VELHO (escolhas sem `grupo`). Também garante que um produto
 * antigo já gravado no banco (sem passar pelo painel novo) ainda vende.
 *
 * Uso: node tests/e2e-compat-montagem.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORTA = '3992';
const BASE = `http://127.0.0.1:${PORTA}`;
const SLUG = 'compat-montagem';
const SENHA = 'compat2026';
const MASTER = 'master123';

let falhas = 0;
const ok = (c, m, e = '') => {
  console.log(`${c ? '✅' : '❌'} ${m}${e ? ` — ${e}` : ''}`);
  if (!c) falhas++;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'compat-'));
const env = { ...process.env, PORT: PORTA, DATA_DIR: tmp, DB_FILE: path.join(tmp, 'menu.db'), NODE_ENV: 'test', MASTER_PASSWORD: MASTER };

function cliente() {
  let cookie = '';
  return async (url, opts = {}) => {
    const res = await fetch(BASE + url, {
      ...opts,
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
    for (const c of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const par = c.split(';')[0];
      cookie = cookie.split('; ').filter((x) => x && !x.startsWith(par.split('=')[0] + '=')).concat(par).join('; ');
    }
    const texto = await res.text();
    let json = null;
    try { json = JSON.parse(texto); } catch {}
    return { status: res.status, json, texto };
  };
}

(async () => {
  const srv = spawn(process.execPath, ['-r', path.join(ROOT, 'tests/_registrar-shim.js'), 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  srv.stdout.on('data', (d) => (log += d));
  srv.stderr.on('data', (d) => (log += d));
  try {
    let subiu = false;
    for (let i = 0; i < 60 && !subiu; i++) {
      try { const r = await fetch(`${BASE}/l/${SLUG}/api/menu`); if (r.status < 500) subiu = true; } catch {}
      if (!subiu) await new Promise((r) => setTimeout(r, 400));
    }
    if (!subiu) throw new Error('servidor não subiu: ' + log.slice(-800));

    const master = cliente();
    await master('/api/master/login', { method: 'POST', body: JSON.stringify({ password: MASTER }) });
    let r = await master('/api/master/stores', { method: 'POST', body: JSON.stringify({ name: 'Compat', slug: SLUG, password: SENHA, whatsapp: '5548999999999', segment: 'food', withSeedProducts: false }) });
    ok(r.status < 400, 'loja de teste criada', `HTTP ${r.status}`);

    const loja = cliente();
    r = await loja(`/l/${SLUG}/api/admin/login`, { method: 'POST', body: JSON.stringify({ password: SENHA }) });
    ok(r.status < 400, 'login da loja', `HTTP ${r.status}`);

    // --- formato ANTIGO salvo pelo painel (sem grupos) ---
    r = await loja(`/l/${SLUG}/api/admin/products`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Caixa de docinhos (12 un.)', price_cents: 32, category: 'Doces', active: true, in_stock: true,
        opcoes: {
          ativo: true, modo: 'partes', titulo: 'Escolha os doces', unidades: 12, minimo: 12, barras: 1,
          sabores: [{ nome: 'Brigadeiro', extra_cents: 0 }, { nome: 'Beijinho', extra_cents: 0 }],
        },
      }),
    });
    ok(r.status < 400, 'produto no formato antigo salvo', `HTTP ${r.status} ${r.texto.slice(0, 120)}`);
    const caixa = r.json;

    const menu = await (await fetch(`${BASE}/l/${SLUG}/api/menu`)).json();
    const op = (menu.products.find((p) => p.id === caixa.id) || {}).opcoes || {};
    ok(Array.isArray(op.grupos) && op.grupos.length === 1, 'grupos[] espelhado (1 grupo) para compatibilidade');
    ok(op.titulo === 'Escolha os doces' && Number(op.unidades) === 12, 'campos antigos preservados');
    ok(op.grupos && op.grupos[0].titulo === 'Escolha os doces', 'título do grupo antigo', op.grupos && op.grupos[0].titulo);

    // --- pedido no formato ANTIGO (escolhas sem grupo) ---
    r = await fetch(`${BASE}/l/${SLUG}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Cliente Antigo', phone: '48999999999', fulfillment: 'pickup', payment_method: 'dinheiro',
        items: [{ id: caixa.id, qty: 1, escolhas: [{ nome: 'Brigadeiro', qtd: 10 }, { nome: 'Beijinho', qtd: 2 }] }],
      }),
    });
    const pedido = await r.json().catch(() => ({}));
    ok(r.status < 400, 'pedido no formato antigo aceito', `HTTP ${r.status} ${JSON.stringify(pedido).slice(0, 160)}`);
    const code1 = (pedido.order || {}).code;
    const listaAdmin = await (await loja(`/l/${SLUG}/api/admin/orders`)).json;
    const pedidoSalvo = (Array.isArray(listaAdmin) ? listaAdmin : []).find((o) => o.code === code1) || {};
    const item = (pedidoSalvo.items || [])[0];
    ok(item && /10 Brigadeiro, 2 Beijinho/.test(item.name || ''), 'nome do item igual ao de antes', item && item.name);
    ok(item && !(item.escolhas || []).some((e) => e.grupo), 'escolhas sem "grupo" (formato antigo)', JSON.stringify(item && item.escolhas));

    // --- produto antigo direto no banco (sem `grupos`), vitrine + checkout ---
    r = await fetch(`${BASE}/l/${SLUG}/api/admin/products`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: '' },
      body: JSON.stringify({ name: 'x', price_cents: 1 }),
    }).catch(() => ({}));
    // insere via API antiga de opções
    const inserir = await loja(`/l/${SLUG}/api/admin/products`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Barra antiga', price_cents: 25, category: 'Doces', active: true, in_stock: true }),
    });
    const barraAntiga = inserir.json;
    const patch = await loja(`/l/${SLUG}/api/admin/products/${barraAntiga.id}/opcoes`, {
      method: 'PATCH',
      body: JSON.stringify({ opcoes: { ativo: true, modo: 'sabores', titulo: 'Sabores da barra', unidades: 4, minimo: 1, sabores: [{ nome: 'Meio-amargo' }, { nome: 'Branco' }, { nome: 'Ao leite' }, { nome: 'Pistache' }] } }),
    });
    ok(patch.status < 400, 'PATCH /products/:id/opcoes (rota antiga) aceita 1 sabor', `HTTP ${patch.status}`);

    const menu2 = await (await fetch(`${BASE}/l/${SLUG}/api/menu`)).json();
    const barraMenu = menu2.products.find((p) => p.id === barraAntiga.id);
    ok(barraMenu && Number(barraMenu.opcoes.minimo) === 1, 'mínimo 1 sabor preservado', barraMenu && String(barraMenu.opcoes.minimo));

    r = await fetch(`${BASE}/l/${SLUG}/api/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_name: 'Cliente Antigo', phone: '48999999999', fulfillment: 'pickup', payment_method: 'dinheiro',
        items: [{ id: barraAntiga.id, qty: 1, escolhas: [{ nome: 'Branco', qtd: 1 }] }],
      }),
    });
    const p2 = await r.json().catch(() => ({}));
    ok(r.status < 400, 'barra antiga: escolher 1 sabor de 4 continua funcionando', `HTTP ${r.status}`);
    const code2 = (p2.order || {}).code;
    const listaAdmin2 = await (await loja(`/l/${SLUG}/api/admin/orders`)).json;
    const pedidoSalvo2 = (Array.isArray(listaAdmin2) ? listaAdmin2 : []).find((o) => o.code === code2) || {};
    const item2 = (pedidoSalvo2.items || [])[0];
    ok(item2 && /Barra antiga \(Branco\)/.test(item2.name || ''), 'nome com o sabor', item2 && item2.name);

    console.log(`\n${falhas ? `❌ ${falhas} falha(s)` : '✅ tudo certo'}`);
    process.exitCode = falhas ? 1 : 0;
  } catch (e) {
    console.error('❌ erro:', e.message);
    console.error(log.slice(-1200));
    process.exitCode = 1;
  } finally {
    srv.kill('SIGKILL');
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
})();
