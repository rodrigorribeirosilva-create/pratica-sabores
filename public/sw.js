/* Service worker do catálogo/cardápio.
 *
 * Para que serve:
 *  1. deixa o site instalável no celular (PWA);
 *  2. ABRE A LOJA NA HORA, mesmo quando o Render está acordando o servidor.
 *
 * Como: a página da loja é guardada no celular do cliente. Quando ele abre o
 * link, a gente tenta a rede por 4 segundos; se o Render estiver mostrando
 * aquela tela preta de "CARREGANDO APLICATIVO", o site abre na hora com a
 * cópia guardada e se atualiza sozinho em seguida.
 */
const CACHE = 'ps-shell-v4'; // v4: descarta as páginas velhas guardadas no celular
const CACHE_META = 'ps-loja-meta'; // cor e nome de cada loja (para a tela "Abrindo…")
const LIMITE_REDE = 4000; // ms que esperamos o servidor responder

/** A tela que o Render mostra quando a instância está subindo. */
const ehTelaDoRender = (texto) =>
  /CARREGANDO APLICATIVO|Comece a construir no Render|Preparando a inst/i.test(texto || '');

self.addEventListener('install', (e) => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(
        nomes.filter((n) => n !== CACHE && n !== CACHE_META).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/** fetch com prazo: se o servidor não responder rápido, desistimos. */
async function comPrazo(req, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(req, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Guarda a cor e o nome da loja para a tela "Abrindo…" sair com a cara dela. */
async function guardarIdentidade(caminho, html) {
  const m = String(caminho).match(/^\/l\/([^/]+)/);
  if (!m) return;
  const cor = (html.match(/<meta name="theme-color" content="([^"]+)"/i) || [])[1];
  const nome = (html.match(/<meta property="og:site_name" content="([^"]+)"/i) || [])[1];
  if (!cor && !nome) return;
  const c = await caches.open(CACHE_META);
  await c.put(new Request(`/__ps-loja/${m[1]}`), new Response(JSON.stringify({ cor, nome })));
}

async function lerIdentidade(slug) {
  try {
    const c = await caches.open(CACHE_META);
    const r = await c.match(new Request(`/__ps-loja/${slug}`));
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

/** Página de espera nas cores da loja (substitui a tela preta do Render). */
const paginaAbrindo = (slug, cor) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Abrindo…</title>
<style>
  :root{color-scheme:light dark}
  body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
       background:${cor || '#14532d'};color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px}
  .anel{width:56px;height:56px;border-radius:50%;border:4px solid rgba(255,255,255,.25);border-top-color:#fff;animation:g 1s linear infinite}
  @keyframes g{to{transform:rotate(360deg)}}
  h1{font-size:20px;margin:0;font-weight:700;letter-spacing:.01em}
  p{margin:0;opacity:.85;font-size:15px;max-width:26ch;line-height:1.5}
</style></head>
<body>
  <div class="anel"></div>
  <h1>Abrindo ${slug || 'a loja'}…</h1>
  <p>Só um instante, estamos te levando ao catálogo.</p>
  <script>
    // tenta de novo sozinho até conseguir
    let n = 0;
    const tenta = async () => {
      n++;
      try {
        const r = await fetch(location.href, { cache: 'no-store' });
        const txt = await r.text();
        if (r.ok && !/CARREGANDO APLICATIVO|Comece a construir no Render/i.test(txt)) return location.reload();
      } catch (e) {}
      setTimeout(tenta, Math.min(1000 * n, 4000));
    };
    setTimeout(tenta, 1200);
  </script>
</body></html>`;

/** Monta a tela "Abrindo…" com a cor e o nome da loja, quando conhecidos. */
async function respostaAbrindo(url) {
  const slugBruto = url.pathname.split('/').filter(Boolean)[1] || '';
  const meta = slugBruto ? await lerIdentidade(slugBruto) : null;
  const nome =
    (meta && meta.nome) ||
    slugBruto
      .split('-')
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(' ');
  const cor = (meta && meta.cor) || '#1f2421';
  return new Response(paginaAbrindo(nome, cor), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Pedido, cardápio, painel, saúde do servidor: SEMPRE da rede.
  // Nunca servir dado velho (preço, pedido, disponibilidade).
  if (url.pathname.includes('/api/') || url.pathname === '/healthz' || url.pathname === '/status') return;
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/master') || url.pathname.endsWith('/admin')) return;

  /* -------- páginas: rede primeiro (4 s), cópia guardada como plano B -------- */
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const r = await comPrazo(req, LIMITE_REDE);
          const corpo = await r.clone().text();
          if (r.ok && !ehTelaDoRender(corpo)) {
            cache.put(req, r.clone());
            guardarIdentidade(url.pathname, corpo);
            return r;
          }
          // Render ainda subindo: usa a cópia do celular, se existir
          const guardada = await cache.match(req);
          if (guardada) return guardada;
          return respostaAbrindo(url);
        } catch {
          const guardada = await cache.match(req);
          if (guardada) return guardada;
          return respostaAbrindo(url);
        }
      })()
    );
    return;
  }

  /* -------- arquivos (css, js, fotos): cópia na hora + atualiza em segundo plano -------- */
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req);
      const daRede = fetch(req)
        .then((r) => {
          if (r && r.ok) cache.put(req, r.clone());
          return r;
        })
        .catch(() => null);
      return guardado || (await daRede) || new Response('', { status: 504 });
    })()
  );
});
