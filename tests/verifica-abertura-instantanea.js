/**
 * A loja precisa abrir mesmo quando o Render está acordando.
 * Simula a tela preta "CARREGANDO APLICATIVO" e confere que o cliente
 * vê a loja (cópia guardada) ou a página "Abrindo…" nas cores da loja.
 */
const { chromium } = require('playwright');
const B = 'https://loja-digital.onrender.com';
const TELA_RENDER = `<!doctype html><html><body><h1>Render</h1>
<div>CARREGANDO APLICATIVO</div><div>Preparando a instância para inicialização...</div>
<div>COMECE A CONSTRUIR NO RENDER HOJE MESMO</div></body></html>`;

(async () => {
  const b = await chromium.launch();
  let erros = 0;
  const checa = (nome, ok, extra = '') => { if (!ok) erros++; console.log(`${ok ? '✓' : '✗'} ${nome} ${extra}`); };

  /* ---- 1) primeira visita: guarda a loja no celular ---- */
  const ctx = await b.newContext();
  const p1 = await ctx.newPage();
  await p1.goto(`${B}/l/mimo-de-linha`, { waitUntil: 'networkidle' });
  await p1.waitForTimeout(2500);
  checa('1ª visita: loja abriu normal', /Mimo/i.test(await p1.locator('body').innerText()));
  checa('service worker instalado', await p1.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length > 0));

  /* segunda visita = já com o service worker controlando (é o normal do dia a dia) */
  await p1.reload({ waitUntil: 'networkidle' });
  await p1.waitForTimeout(2000);
  const guardado = await p1.evaluate(async () => {
    // qualquer versão do cache do service worker (o nome muda a cada atualização)
    const nomes = await caches.keys();
    const urls = [];
    for (const n of nomes) {
      const c = await caches.open(n);
      for (const r of await c.keys()) urls.push(new URL(r.url).pathname);
    }
    return urls;
  });
  checa('página guardada no celular', guardado.includes('/l/mimo-de-linha'), JSON.stringify(guardado));
  checa('API do cardápio NÃO é guardada (preço sempre novo)', !guardado.some((u) => u.includes('/api/')), JSON.stringify(guardado));

  /* ---- 2) servidor dormindo / sem rede: cliente vê a LOJA, não a tela preta ---- */
  await ctx.setOffline(true);
  await p1.goto(`${B}/l/mimo-de-linha`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p1.waitForTimeout(2000);
  const txt2 = await p1.locator('body').innerText().catch(() => '');
  checa('sem servidor: NÃO aparece a tela do Render', !/CARREGANDO APLICATIVO|COMECE A CONSTRUIR/i.test(txt2));
  checa('sem servidor: cliente vê a loja (cópia guardada)', /Mimo/i.test(txt2), txt2.slice(0, 50).replace(/\n/g, ' '));
  await ctx.setOffline(false);

  /* ---- 3) celular novo (nunca abriu a loja) + servidor dormindo -> "Abrindo…" ---- */
  const ctx2 = await b.newContext();
  const p3 = await ctx2.newPage();
  await p3.goto(`${B}/l/mimo-de-linha`, { waitUntil: 'networkidle' });
  await p3.waitForTimeout(2500);
  await p3.reload({ waitUntil: 'networkidle' });
  await p3.waitForTimeout(1500);
  await p3.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); });
  await ctx2.setOffline(true);
  await p3.goto(`${B}/l/mimo-de-linha`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p3.waitForTimeout(2500);
  const txt3 = await p3.locator('body').innerText().catch(() => '');
  checa('celular novo sem servidor: mostra "Abrindo…"', /Abrindo/i.test(txt3), txt3.slice(0, 50).replace(/\n/g, ' '));
  checa('celular novo: sem a tela preta do Render', !/CARREGANDO APLICATIVO/i.test(txt3));
  checa('tela "Abrindo…" com o nome certo da loja', /Abrindo Mimo de Linha/i.test(txt3), txt3.slice(0, 30));
  await p3.screenshot({ path: 'tests/shots/abrindo-loja.png' });
  await p3.close();

  console.log('\nERROS:', erros);
  await b.close();
  process.exit(erros ? 1 : 0);
})();
