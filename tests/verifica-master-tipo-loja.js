/**
 * Painel Master › aba Lojas: cada loja aparece com o tipo certo e dá para
 * trocar cardápio ↔ catálogo sem entrar no painel do cliente.
 *
 * Usa um banco temporário e um servidor próprio — não toca em produção.
 *   node tests/verifica-master-tipo-loja.js
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORTA = process.env.PORTA || '4199';
const BASE = `http://127.0.0.1:${PORTA}`;
const SENHA = 'teste-tipo-loja';
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-tipo-loja-'));

let erros = 0;
const ok = (cond, texto) => {
  if (!cond) erros++;
  console.log(`${cond ? '✓' : '✗'} ${texto}`);
};

async function json(url, op = {}, cookie = '') {
  const r = await fetch(BASE + url, {
    ...op,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
  const corpo = await r.json().catch(() => ({}));
  return { status: r.status, corpo, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}

(async () => {
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: PORTA, HOST: '127.0.0.1', DATA_DIR: dados, MASTER_PASSWORD: SENHA, ADMIN_PASSWORD: SENHA },
    stdio: 'ignore',
  });

  try {
    // espera o servidor subir
    let noAr = false;
    for (let i = 0; i < 60 && !noAr; i++) {
      try {
        const r = await fetch(`${BASE}/healthz`);
        noAr = r.ok;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!noAr) throw new Error('O servidor de teste não subiu.');

    const login = await json('/api/master/login', { method: 'POST', body: JSON.stringify({ password: SENHA }) });
    const cookie = login.cookie;
    ok(login.status === 200 && cookie, 'entrar no master');

    const ag = await json('/api/master/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'AGEO Confeitaria', password: 'ageo123', segment: 'food' }),
    }, cookie);
    ok(ag.corpo.store.tipo === '' && ag.corpo.store.rotulo_link === 'cardápio', 'loja de comida nasce como cardápio (automático)');

    const mdn = await json('/api/master/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'MDN Presents', password: 'mdn1234', segment: 'catalogo' }),
    }, cookie);
    ok(mdn.corpo.store.rotulo_link === 'catálogo', 'loja de catálogo nasce como catálogo');

    const comTipo = await json('/api/master/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Mimo de Linha', password: 'mimo123', segment: 'food', tipo: 'catalogo' }),
    }, cookie);
    ok(comTipo.corpo.store.tipo === 'catalogo', 'dá para já criar uma loja como catálogo digital');

    const idAgeo = ag.corpo.store.id;
    const virouCatalogo = await json(`/api/master/stores/${idAgeo}`, { method: 'PATCH', body: JSON.stringify({ tipo: 'catalogo' }) }, cookie);
    ok(virouCatalogo.corpo.store.tipo === 'catalogo' && virouCatalogo.corpo.store.rotulo_link === 'catálogo', 'AGEO virou catálogo pelo Master');

    const vitrine = await (await fetch(`${BASE}/l/ageo-confeitaria`)).text();
    ok(/Catálogo digital/i.test(vitrine) && !/Cardápio digital/i.test(vitrine), 'a vitrine do cliente passa a dizer "Catálogo digital"');

    const voltou = await json(`/api/master/stores/${idAgeo}`, { method: 'PATCH', body: JSON.stringify({ tipo: 'cardapio' }) }, cookie);
    ok(voltou.corpo.store.rotulo_link === 'cardápio', 'AGEO voltou para cardápio');

    const auto = await json(`/api/master/stores/${idAgeo}`, { method: 'PATCH', body: JSON.stringify({ tipo: '' }) }, cookie);
    ok(auto.corpo.store.tipo === '' && auto.corpo.store.rotulo_link === 'cardápio', 'dá para voltar ao automático');

    const lista = await json('/api/master/stores', {}, cookie);
    const daMdn = lista.corpo.stores.find((s) => s.id === mdn.corpo.store.id);
    ok(daMdn.tipo === '' && daMdn.rotulo_link === 'catálogo', 'trocar a AGEO não mexeu na MDN');

    const barbearia = await json('/api/master/stores', {
      method: 'POST',
      body: JSON.stringify({ name: 'Barbearia Teste', password: 'barb123', segment: 'servicos' }),
    }, cookie);
    const recusa = await json(`/api/master/stores/${barbearia.corpo.store.id}`, { method: 'PATCH', body: JSON.stringify({ tipo: 'catalogo' }) }, cookie);
    ok(recusa.status === 400 && /agenda/i.test(recusa.corpo.error || ''), 'loja de agenda recusa a escolha cardápio/catálogo');

    const html = await (await fetch(`${BASE}/master`)).text();
    ok(/<div id="filtrosLojas"[^>]*><\/div>/.test(html), 'aba Lojas tem o espaço dos filtros por tipo');
    ok(/data-act="trocar-tipo"/.test(html), 'cada loja tem o seletor "aparece como"');
    ok(/id="nTipo"/.test(html), 'formulário de nova loja pergunta cardápio ou catálogo');
  } catch (e) {
    erros++;
    console.log('✗ erro no teste:', e.message);
  } finally {
    servidor.kill();
    fs.rmSync(dados, { recursive: true, force: true });
  }

  console.log('ERROS:', erros);
  process.exit(erros ? 1 : 0);
})();
