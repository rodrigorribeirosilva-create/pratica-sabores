'use strict';
/**
 * Prática Sabores — Cardápio Digital Inteligente (MULTI-LOJA)
 *
 * Endereços:
 *   /                        → cardápio da loja principal
 *   /l/<slug>                → cardápio de uma loja
 *   /l/<slug>/admin          → painel do dono da loja (só a loja dele)
 *   /master                  → painel do administrador do sistema (todas as lojas)
 *
 * Persistência: se SUPABASE_URL e SUPABASE_KEY estiverem definidas, o banco é
 * restaurado da nuvem ao iniciar e salvo na nuvem a cada alteração. Assim os
 * dados sobrevivem a reinícios mesmo sem disco persistente.
 */
const path = require('path');
const express = require('express');

const { DB_FILE } = require('./src/paths');
const remote = require('./src/remote');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ------------------------------------------------------------------ */
/* Inicialização: restaura o banco da nuvem e só então abre o SQLite.   */
/* ------------------------------------------------------------------ */
/**
 * Modo "encaminhador": quando REDIRECT_HOST está definido, esta instância NÃO
 * usa banco nenhum — só manda todo mundo para o endereço oficial (301).
 * Serve para os links antigos continuarem funcionando.
 */
/**
 * Mantém o serviço acordado no plano gratuito.
 *
 * O Render "dorme" o servidor após 15 minutos sem nenhuma requisição — e aí o
 * cliente vê aquela tela preta "CARREGANDO APLICATIVO" por ~40s. Aqui o próprio
 * app acessa o seu endereço público de tempos em tempos; cada acesso conta como
 * visita e o relógio do sono zera.
 *
 * Ordem de preferência do endereço:
 *   1. KEEP_ALIVE_URL (definida por você)
 *   2. RENDER_EXTERNAL_URL (o Render injeta sozinho)
 */
function iniciarKeepAlive() {
  const alvo = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (!alvo) return;
  const minutos = Math.max(4, Number(process.env.KEEP_ALIVE_MINUTES || 10));
  const bater = async () => {
    try {
      const t0 = Date.now();
      const r = await fetch(alvo + '/healthz', { cache: 'no-store' });
      console.log(`[keep-alive] ${new Date().toISOString()} -> ${r.status} (${Date.now() - t0} ms)`);
    } catch (err) {
      console.warn('[keep-alive] falhou:', err.message);
    }
  };
  setTimeout(bater, 45 * 1000); // uma logo depois de subir
  const t = setInterval(bater, minutos * 60 * 1000);
  t.unref?.();
  console.log(`[keep-alive] ativo: ${alvo} a cada ${minutos} min`);
}

function modoEncaminhador(destino) {
  const alvo = destino.replace(/\/$/, '');
  app.use((req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const path = req.path === '/' ? '/' : req.path;
    res.redirect(301, `${alvo}${path}${qs}`);
  });
  app.listen(PORT, HOST, () => {
    console.log(`↪️  encaminhando tudo para ${alvo} (http://${HOST}:${PORT})`);
    iniciarKeepAlive();
  });
}

async function main() {
  if (process.env.REDIRECT_HOST) return modoEncaminhador(process.env.REDIRECT_HOST);

  if (remote.ATIVO) {
    console.log('[nuvem] restaurando banco do Supabase…');
    await remote.restoreTo(DB_FILE);
  }

  // require DEPOIS do restore: o arquivo do banco já está no lugar certo.
  const { defaultStore, getStoreBySlug, listStores, resolveUploadDir } = require('./src/db');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Cabeçalhos de segurança simples (sem dependências)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    // Respostas de API nunca ficam guardadas no celular/proxy:
    // todo mundo sempre vê a última versão salva.
    if (req.path.includes('/api/')) res.setHeader('Cache-Control', 'no-store, must-revalidate');
    next();
  });

  app.use('/uploads', express.static(resolveUploadDir(), { maxAge: '7d' }));

  // Código (JS/CSS) nunca fica preso no cache: após cada atualização o cliente
  // recebe a versão nova. Imagens continuam com cache longo.
  app.use((req, res, next) => {
    if (/\.(js|css)$/i.test(req.path)) res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    next();
  });
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));

  app.get('/healthz', (req, res) =>
    res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      stores: listStores().length,
      nuvem: remote.ATIVO,
      backup: remote.status ? remote.status() : undefined,
    })
  );


  /* ------------------------------------------------------------------ */
  /* Página da loja com título/prévia corretos (catálogo ≠ cardápio)      */
  /* ------------------------------------------------------------------ */
  const fs = require('fs');
  const esc = (t) =>
    String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderStorePage(res, store, page) {
    const ehServicos = store.segment === 'servicos';
    const arquivo = page === 'admin'
      ? (ehServicos ? 'servicos-admin.html' : 'admin.html')
      : (ehServicos ? 'servicos.html' : 'index.html');
    const file = path.join(PUBLIC_DIR, arquivo);
    let html = fs.readFileSync(file, 'utf8');
    const business = require('./src/db').getSetting(store.id, 'business', {}) || {};
    const isCatalog = store.segment === 'catalogo';
    const isServicos = store.segment === 'servicos';
    const nome = business.name || store.name;
    const palavra = isCatalog ? 'Catálogo' : isServicos ? 'Serviços' : 'Cardápio';
    const ehPainel = page === 'admin';

    // Texto da prévia no WhatsApp: no painel fala de "área do administrador";
    // no catálogo/cardápio, do pedido do cliente.
    const descricao = ehPainel
      ? `Área exclusiva de ${nome}. Entre com sua senha para cadastrar produtos, mudar preços e acompanhar os pedidos do ${palavra.toLowerCase()}.`
      : isServicos
      ? business.about || business.tagline || `Instalação, limpeza e manutenção de ar condicionado. Agende o melhor dia com ${nome}.`
      : business.about ||
        business.tagline ||
        (isCatalog ? `Catálogo de ${nome}. Peça pelo WhatsApp.` : `${nome} — peça pelo cardápio online.`);

    // A prévia do WhatsApp (catálogo E painel) mostra sempre o LOGOTIPO da loja.
    // Sem logo cadastrado, cai na foto de capa e, por último, numa imagem neutra.
    const imagemRel = business.logo_url || business.cover_url || '/img/hero.jpg';

    const origem = `${req_proto(res)}://${res.req.get('host')}`;
    const imagem = imagemRel.startsWith('http') ? imagemRel : origem + imagemRel;
    const titulo = ehPainel
      ? `${nome} — Painel do administrador`
      : isServicos
      ? `${nome} · Instalação e manutenção de ar condicionado`
      : `${nome} · ${palavra} digital`;
    const tituloPreview = ehPainel
      ? `${nome} — Painel do administrador`
      : isServicos
      ? `${nome} — Agende sua instalação ou limpeza`
      : `${nome} — ${palavra} Digital`;
    const url = `${origem}/l/${store.slug}${page === 'admin' ? '/admin' : ''}`;

    const stamp = String(Date.now());
    html = html
      .replace(/(src|href)="\/assets\/([a-z]+\.(?:js|css))"/g, `$1="/assets/$2?v=${stamp}"`)
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(titulo)}</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(descricao)}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(tituloPreview)}">`)
      .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(descricao)}">`)
      .replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="website">`)
      .replace('</head>', [
        // Se a página não tinha estas etiquetas (caso do painel), cria agora:
        ...(/property="og:title"/.test(html) ? [] : [
          `<meta property="og:title" content="${esc(tituloPreview)}">`,
          `<meta property="og:description" content="${esc(descricao)}">`,
        ]),
        ...(/name="description"/.test(html) ? [] : [`<meta name="description" content="${esc(descricao)}">`]),
        `<meta property="og:site_name" content="${esc(nome)}">`,
        `<link rel="manifest" href="${ehPainel ? 'admin/manifest.json' : 'manifest.json'}">`,
        `<meta name="theme-color" content="${esc(business.theme_color || '#1e6b4f')}">`,
        `<meta property="og:image" content="${esc(imagem)}">`,
        `<meta property="og:image:alt" content="${esc(nome)}">`,
        `<meta property="og:url" content="${esc(url)}">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${esc(tituloPreview)}">`,
        `<meta name="twitter:image" content="${esc(imagem)}">`,
        '</head>',
      ].join(''));

    // Nem o nome da outra loja pode sobrar no HTML: o código-fonte servido
    // para a MDN não pode conter "Prática Sabores" em lugar nenhum.
    html = html
      .replace(/>Prática Sabores</g, `>${esc(nome)}<`)
      .replace(/placeholder="Prática Sabores"/g, `placeholder="${esc(nome)}"`);

    // Nenhum link pode "vazar" para a loja padrão (a marmita):
    // "/" e "/admin" passam a apontar sempre para a própria loja.
    html = html
      .replace(/href="\/admin"/g, `href="/l/${store.slug}/admin"`)
      .replace(/href="\/"/g, `href="/l/${store.slug}/"`);

    // Ícone da aba do navegador: logo da própria loja; sem logo, um ícone neutro
    // com a inicial dela (nunca a marca de outra empresa).
    const inicial = (nome || '·').trim().charAt(0).toUpperCase();
    const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#12352a"/><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="54" fill="#e7cf9b">${inicial}</text></svg>`;
    const icone = business.logo_url || 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgIcon);
    html = html
      .replace(/<link rel="icon" href="[^"]*">/, `<link rel="icon" href="${esc(icone)}">`)
      .replace(/<link rel="apple-touch-icon" href="[^"]*">/, `<link rel="apple-touch-icon" href="${esc(icone)}">`);

    // não deixa o robô de busca indexar o painel
    if (page === 'admin') html = html.replace('</head>', '<meta name="robots" content="noindex, nofollow"></head>');

    res.type('html').send(html);
  }

  function req_proto(res) {
    return (res.req.get('x-forwarded-proto') || res.req.protocol || 'https').split(',')[0];
  }

  /* ----------------------- master (administrador) ---------------------- */
  app.use('/api/master', require('./src/routes.master'));

  // Contratos de mensalidade (link público para o cliente assinar) + PDF
  require('./src/rotas.contrato').registrar(app);
  app.get('/master', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'master.html')));

  /* ------------- resolve a loja da requisição (req.store) ------------- */
  function resolveStoreFromParam(req, res, next) {
    const store = getStoreBySlug(req.params.slug);
    if (!store) {
      if (req.originalUrl.includes('/api/')) {
        return res.status(404).json({ error: 'Loja não encontrada.' });
      }
      return res
        .status(404)
        .send(
          '<!doctype html><meta charset="utf-8"><title>Loja não encontrada</title>' +
            '<div style="font-family:system-ui;padding:48px;text-align:center">' +
            '<h1 style="font-size:22px">Loja não encontrada</h1>' +
            '<p style="color:#666">Confira o link enviado. Se o problema continuar, fale com o responsável.</p></div>'
        );
    }
    req.store = store;
    next();
  }

  app.use('/l/:slug/api/admin', resolveStoreFromParam, require('./src/routes.admin'));
  // Módulo de serviços (climatização): agenda, clientes, aparelhos e lembretes.
  const servicosRotas = require('./src/routes.servicos');
  app.use('/l/:slug/api/admin', resolveStoreFromParam, servicosRotas.admin);
  app.use('/l/:slug/api', resolveStoreFromParam, servicosRotas.publico);
  app.use('/l/:slug/api', resolveStoreFromParam, require('./src/routes.public'));
  /* ---- "app" da loja: manifest dinâmico (nome, logo e cor de cada loja) ---- */
  function tipoImagem(url) {
    const ext = String(url).split('?')[0].split('.').pop().toLowerCase();
    return { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png', gif: 'image/gif' }[ext] || 'image/png';
  }

  function renderManifest(req, res, page) {
    const store = req.store;
    const business = require('./src/db').getSetting(store.id, 'business', {}) || {};
    const nome = business.name || store.name;
    const origem = `${req_proto(res)}://${res.req.get('host')}`;
    const icone = business.logo_url
      ? (String(business.logo_url).startsWith('http') ? business.logo_url : origem + business.logo_url)
      : `${origem}/img/app-icon-512.png`;
    const painel = page === 'admin';
    res.set('Content-Type', 'application/manifest+json');
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      name: painel ? `${nome} — Painel` : nome,
      short_name: nome.length <= 14 ? nome : nome.split(' ')[0].slice(0, 14),
      description: painel
        ? `Painel de ${nome}: produtos, pedidos e configurações.`
        : business.tagline || business.about || `Peça pelo WhatsApp em ${nome}.`,
      start_url: `/l/${store.slug}${painel ? '/admin' : ''}`,
      scope: '/',
      display: 'standalone',
      background_color: '#fbf6ee',
      theme_color: business.theme_color || '#1e6b4f',
      orientation: 'portrait',
      lang: 'pt-BR',
      icons: [
        { src: `${origem}/img/app-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icone, sizes: '512x512', type: tipoImagem(icone), purpose: 'any' },
        { src: icone, sizes: '512x512', type: tipoImagem(icone), purpose: 'maskable' },
      ],
    });
  }

  app.get('/l/:slug/manifest.json', resolveStoreFromParam, (req, res) => renderManifest(req, res, 'menu'));
  app.get('/l/:slug/admin/manifest.json', resolveStoreFromParam, (req, res) => renderManifest(req, res, 'admin'));

  app.get('/l/:slug/admin', resolveStoreFromParam, (req, res) => renderStorePage(res, req.store, 'admin'));
  app.get('/l/:slug', resolveStoreFromParam, (req, res) => renderStorePage(res, req.store, 'menu'));

  /* --------------------- loja principal (raiz "/") -------------------- */
  function withDefaultStore(req, res, next) {
    const store = getStoreBySlug(req.query.loja) || defaultStore();
    if (!store) return res.status(500).json({ error: 'Nenhuma loja configurada.' });
    req.store = store;
    next();
  }

  app.use('/api/admin', withDefaultStore, require('./src/routes.admin'));
  app.use('/api', withDefaultStore, require('./src/routes.public'));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  app.use((err, req, res, next) => {
    console.error('[erro]', err);
    res.status(500).json({ error: 'Erro interno.' });
  });

  iniciarKeepAlive();

  app.listen(PORT, HOST, () => {
    console.log(`✅ Prática Sabores (multi-loja) em http://${HOST}:${PORT}`);
    for (const s of listStores()) console.log(`   /l/${s.slug}  →  ${s.name}`);
    console.log(`   Painel master: http://localhost:${PORT}/master`);
    console.log(`   Persistência na nuvem: ${remote.ATIVO ? 'ATIVA' : 'desligada (sem SUPABASE_URL/KEY)'}`);
  });

  // Salva o estado final ao desligar (deploy/reinício)
  for (const sinal of ['SIGTERM', 'SIGINT']) {
    process.on(sinal, async () => {
      try {
        await remote.flush(DB_FILE, require('./src/db').db);
      } catch {
        /* ignora */
      }
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
