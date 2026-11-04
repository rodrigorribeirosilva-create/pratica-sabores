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

/* Versão do que está no ar. O painel mostra esse número no rodapé: assim o dono
   sabe na hora se o navegador dele está vendo a versão nova ou uma velha. */
const APP_VERSAO = (() => {
  try {
    const fs = require('fs');
    const p = require('path');
    const h = require('crypto').createHash('md5');
    ['public/servicos.html', 'public/servicos-admin.html', 'public/imperio-horarios-hoje.html', 'public/imperio-painel-premium.css', 'public/imperio-busca-agenda.js', 'public/imperio-menu-painel.js', 'public/imperio-clientes.js', 'public/imperio-referencia.js', 'public/imperio-bloqueios.js', 'public/imperio-recorrencia.js', 'public/imperio-cores.js', 'public/imperio-planos.js', 'public/imperio-planos-site.js', 'public/imperio-painel-sw.js', 'src/imperio-painel-premium.js', 'src/imperio-site-planos.js', 'public/index.html', 'public/admin.html'].forEach((f) => {
      try {
        h.update(fs.readFileSync(p.join(__dirname, f)));
      } catch {}
    });
    return h.digest('hex').slice(0, 8);
  } catch {
    return process.env.APP_VERSAO || require('./package.json').version || 'v1';
  }
})();

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
/** Estado do keep-alive, exposto no /healthz para conferir se está mesmo batendo. */
const keepAliveInfo = {
  ativo: false,
  alvo: '',
  minutos: 0,
  ultimo_em: null,
  ultimo_status: null,
  subiu_em: new Date().toISOString(),
  pings_ok: 0,
  falhas: 0,
  historico: [], // últimos 8 pings, para conferir no /healthz
};

function iniciarKeepAlive() {
  const alvo = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
  if (!alvo) return;
  keepAliveInfo.alvo = alvo;
  // 2 min: o Render só dorme depois de 15 min sem acesso — folga de 7x.
  const minutos = Math.max(2, Number(process.env.KEEP_ALIVE_MINUTES || 2));
  const bater = async () => {
    try {
      const t0 = Date.now();
      const r = await fetch(alvo + '/healthz', { cache: 'no-store', headers: { 'user-agent': 'keep-alive' } });
      const agora = new Date().toISOString();
      keepAliveInfo.ultimo_em = agora;
      keepAliveInfo.ultimo_status = r.status;
      if (r.ok) keepAliveInfo.pings_ok += 1;
      else keepAliveInfo.falhas += 1;
      keepAliveInfo.historico.unshift({ em: agora, status: r.status, ms: Date.now() - t0 });
      keepAliveInfo.historico = keepAliveInfo.historico.slice(0, 8);
      console.log(`[keep-alive] ${agora} -> ${r.status} (${Date.now() - t0} ms)`);
      // se falhou, tenta de novo em 45s (não espera o próximo ciclo)
      if (!r.ok) setTimeout(bater, 45 * 1000).unref?.();
    } catch (err) {
      keepAliveInfo.falhas += 1;
      console.warn('[keep-alive] falhou:', err.message);
      setTimeout(bater, 45 * 1000).unref?.();
    }
  };
  keepAliveInfo.ativo = true;
  keepAliveInfo.minutos = minutos;
  setTimeout(bater, 20 * 1000); // uma logo depois de subir
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

  /* ------------------------------------------------------------------ */
  /* Domínio próprio por loja                                            */
  /* ------------------------------------------------------------------ */
  /**
   * Cada loja pode ter o seu endereço (ex.: ageo.praticasabores.com.br).
   * Quando a requisição chega por esse domínio, o servidor entrega a loja
   * na raiz — o cliente vê "ageo.praticasabores.com.br" e não "/l/ageo-…".
   *
   * Como cadastrar o domínio de uma loja:
   *   1) no DNS, aponte o subdomínio (CNAME) para loja-digital.onrender.com;
   *   2) no Render → Settings → Custom Domains, adicione o mesmo domínio;
   *   3) no painel master → PATCH /api/master/stores/<id>/dominio { "dominio": "..." }
   *      (ou pela variável DOMINIOS_LOJA="dominio=slug,outro=slug").
   */
  let cacheDominios = { em: 0, mapa: {} };
  // o painel master avisa quando um domínio muda, para valer na hora
  global.__psLimparCacheDominios = () => {
    cacheDominios.em = 0;
  };
  function mapaDeDominios() {
    if (Date.now() - cacheDominios.em < 60000) return cacheDominios.mapa;
    const mapa = {};
    const limpar = (d) =>
      String(d || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./, '');
    // 1) variável de ambiente
    for (const par of String(process.env.DOMINIOS_LOJA || '').split(',')) {
      const [d, slug] = par.split('=').map((x) => (x || '').trim());
      if (d && slug) mapa[limpar(d)] = slug;
    }
    // 2) domínio salvo no painel de cada loja
    try {
      const { getSetting } = require('./src/db');
      for (const st of listStores()) {
        const b = getSetting(st.id, 'business', {}) || {};
        const d = limpar(b.dominio);
        if (d) mapa[d] = st.slug;
      }
    } catch {
      /* segue só com a variável de ambiente */
    }
    cacheDominios = { em: Date.now(), mapa };
    return mapa;
  }

  app.use((req, res, next) => {
    const host = String(req.hostname || '').toLowerCase();
    if (!host) return next();
    const slug = mapaDeDominios()[host];
    if (!slug) return next();
    const p = req.path || '/';
    // nessas rotas não mexe: já valem para o site inteiro
    const livre =
      p.startsWith('/l/') ||
      p.startsWith('/api/master') ||
      p.startsWith('/assets/') ||
      p.startsWith('/uploads/') ||
      p.startsWith('/img/') ||
      p.startsWith('/contrato') ||
      p === '/master' ||
      p === '/status' ||
      p === '/healthz' ||
      p === '/sw.js' ||
      p === '/manifest.webmanifest';
    if (livre) return next();
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = `/l/${slug}${p === '/' ? '' : p}${qs}`;
    next();
  });


  app.use('/uploads', express.static(resolveUploadDir(), { maxAge: '7d' }));

  // Código (JS/CSS) nunca fica preso no cache: após cada atualização o cliente
  // recebe a versão nova. Imagens continuam com cache longo.
  app.use((req, res, next) => {
    if (/\.(js|css|html)$/i.test(req.path)) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    next();
  });
  // O service worker NUNCA pode ser guardado pelo navegador: se ficar em cache,
  // o celular continua usando a versão antiga (e a tela preta volta).
  app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('application/javascript');
    res.sendFile(path.join(PUBLIC_DIR, 'sw.js'));
  });

  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));

  app.get('/healthz', (req, res) =>
    res.json({
      ok: true,
      uptime: Math.round(process.uptime()),
      versao: APP_VERSAO,
      stores: listStores().length,
      nuvem: remote.ATIVO,
      backup: remote.status ? remote.status() : undefined,
      keep_alive: keepAliveInfo, // se estiver ativo, o servidor não deveria dormir
    })
  );

  /* Página pública de status: "o site está no ar?" respondido em 2 segundos. */
  app.get('/status', (req, res) => {
    const u = Math.round(process.uptime());
    const h = Math.floor(u / 3600);
    const m = Math.floor((u % 3600) / 60);
    const desde = new Date(Date.now() - u * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const b = remote.status ? remote.status() : {};
    const ka = keepAliveInfo;
    const linha = (ok, texto) =>
      `<li><span class="dot ${ok ? 'ok' : 'bad'}"></span>${texto}</li>`;
    res.set('Cache-Control', 'no-store');
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Status — Prática Sabores</title>
<style>
 body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:#0f1a15;color:#f2efe6;
      display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
 .card{background:#16241d;border:1px solid #26382f;border-radius:18px;padding:26px;max-width:520px;width:100%}
 h1{margin:0 0 4px;font-size:20px;letter-spacing:-.01em}
 p.sub{margin:0 0 18px;color:#a9b8b1;font-size:13.5px}
 ul{list-style:none;padding:0;margin:0 0 18px}
 li{display:flex;align-items:center;gap:9px;padding:7px 0;font-size:14px;border-bottom:1px solid #22322a}
 li:last-child{border:0}
 .dot{width:9px;height:9px;border-radius:50%;flex:0 0 auto}
 .dot.ok{background:#3fbf7f}.dot.bad{background:#e05d4b}
 .big{font-size:34px;font-weight:800;letter-spacing:-.02em;margin:0 0 2px}
 small{color:#8fa39a;font-size:12.5px;display:block;margin-top:10px;line-height:1.5}
 a{color:#e0b062}
</style></head><body><div class="card">
 <h1>Prática Sabores · status</h1>
 <p class="sub">${u >= 60 ? 'Todos os links e painéis estão no ar.' : 'Servidor acabou de ligar.'}</p>
 <p class="big">${h > 0 ? `${h}h ` : ''}${m}min${h > 0 ? '' : ' '}no ar</p>
 <small style="margin:0 0 16px">ligado desde ${desde}</small>
 <ul>
   ${linha(true, 'Site, links das lojas e painéis respondendo')}
   ${linha(!!b.ativo, b.ativo ? 'Backup automático na nuvem ativo' : 'Backup na nuvem DESLIGADO')}
   ${linha(!!ka.ativo, ka.ativo ? `Anti-sono ativo (batida a cada ${ka.minutos} min)` : 'Anti-sono desligado')}
   ${linha(!b.falhas, b.falhas ? `${b.falhas} falha(s) de backup` : 'Nenhuma falha de backup')}
 </ul>
 <small>Último backup: ${b.ultimo_backup ? new Date(b.ultimo_backup).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'} ·
 Última batida anti-sono: ${ka.ultimo_em ? new Date(ka.ultimo_em).toLocaleTimeString('pt-BR') : '—'} ·
 ${listStores().length} lojas<br>
 <a href="/">Ir para o site</a></small>
</div></body></html>`);
  });


  /* ------------------------------------------------------------------ */
  /* Página da loja com título/prévia corretos (catálogo ≠ cardápio)      */
  /* ------------------------------------------------------------------ */
  const fs = require('fs');
  const esc = (t) =>
    String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** largura aproximada de um texto em 27px (só para dimensionar a pílula do SVG) */
  /** Clareia (f > 0) ou escurece (f < 0) uma cor #rrggbb, mantendo o tom da loja. */
  function tom(hex, f) {
    const h = String(hex || '#12352a').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const canais = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const alvo = f < 0 ? 0 : 255;
      const v2 = Math.round(v + (alvo - v) * Math.abs(f));
      return Math.max(0, Math.min(255, v2)).toString(16).padStart(2, '0');
    });
    return `#${canais.join('')}`;
  }

  function numeroLargura(t) {
    // 27px em negrito no DejaVu Sans ≈ 17px por caractere
    return String(t || '').length * 17;
  }

  function renderStorePage(res, store, page) {
    // "Cardápio" x "Catálogo" é escolha DA LOJA (Configurações → Dados do negócio),
    // então a prévia do WhatsApp e o título seguem essa escolha, não o cadastro antigo.
    const segmento = require('./src/db').segmentoEfetivo(store);
    const ehServicos = segmento === 'servicos';
    const arquivo = page === 'admin'
      ? (ehServicos ? 'servicos-admin.html' : 'admin.html')
      : (ehServicos ? 'servicos.html' : 'index.html');
    const file = path.join(PUBLIC_DIR, arquivo);
    let html = fs.readFileSync(file, 'utf8');
    const business = require('./src/db').getSetting(store.id, 'business', {}) || {};

    /* ------------------------------------------------------------------
       LOJA DE SERVIÇO QUE NÃO É A HENRIQUE (ex.: barbearia):
       o HTML do módulo de serviços nasceu com os textos e as imagens da
       Henrique Borges. Aqui as sobras são trocadas JÁ NO SERVIDOR, antes de
       a página sair — assim nada da outra loja pisca na tela do cliente.
       A Henrique continua recebendo o HTML original, sem nenhuma mudança.
       ------------------------------------------------------------------ */
    /* Barbearia: o painel nasceu no módulo da Henrique (ar-condicionado).
       As sobras saem do HTML antes de o painel sair do servidor: o lojista da
       barbearia nunca vê "Climatização", "Aparelhos" nem "ar precisando de limpeza".
       (Escondemos com CSS, no <head>, para não haver nenhum piscar na tela e para
       não quebrar o JavaScript que ainda procura esses blocos.) */
    if (ehServicos && page === 'admin' && business.perfil_agenda === 'barbearia') {
      html = html
        .replace(/<div class="sub" id="topoSub">Climatização<\/div>/, '<div class="sub" id="topoSub">Agendamentos</div>')
        .replace(
          '</head>',
          '<style>#cardVencendo,button[data-tab="equipamentos"],[data-tab="equipamentos"],.so-ar{display:none!important}</style></head>'
        );
    }

    if (ehServicos && store.slug !== 'henrique-borges' && page === 'admin') {
      const nomeLojaA = esc(business.name || store.name || '');
      html = html
        .replace(/<link rel="icon" href="\/img\/hb-logo\.jpg">/g, '')
        .replace(/<link rel="apple-touch-icon" href="\/img\/hb-logo\.jpg">/g, '')
        .replace(/src="\/img\/hb-logo\.jpg"/g, business.logo_url ? `src="${esc(business.logo_url)}"` : 'src="" data-sem-logo="1"')
        .replace(/<title>[^<]*<\/title>/g, `<title>${nomeLojaA} · Painel</title>`);
    }

    if (ehServicos && store.slug !== 'henrique-borges') {
      const nomeLoja = esc(business.name || store.name || '');
      const frase = esc(business.tagline || business.hero_chamada || 'Agende seu horário');
      const logoLoja = business.logo_url ? esc(business.logo_url) : '';
      html = html
        // favicon / ícones
        .replace(/<link rel="icon" href="\/img\/hb-logo\.jpg">/g, '')
        .replace(/<link rel="apple-touch-icon" href="\/img\/hb-logo\.jpg">/g, '')
        // logo e fotos da outra loja
        .replace(/src="\/img\/hb-logo\.jpg"/g, logoLoja ? `src="${logoLoja}"` : 'src="" data-sem-logo="1"')
        .replace(/src="\/img\/hb-hero\.jpg"/g, 'src="" data-sem-foto="1"')
        // textos
        .replace(/<span class="nome" id="nomeEmpresa">Henrique Borges<\/span>/g, `<span class="nome" id="nomeEmpresa">${nomeLoja}</span>`)
        .replace(/<span class="sub" id="tagline">Climatização e soluções residenciais<\/span>/g, `<span class="sub" id="tagline">${frase}</span>`)
        .replace(/<img class="foto" id="fotoHero"[^>]*alt="Ambiente climatizado">/g, '')
        // comentários do código não vão para o cliente
        .replace(/\/\* blocos que só fazem sentido em loja de climatização \*\//g, '')
        .replace(/\/\*\* Textos do topo para loja de barbearia \(a Henrique continua com os dela\)\. \*\//g, '')
        .replace(/nem equipamento \(esses campos são de ar-condicionado, de outra loja\)\. \*\//g, 'campos de equipamento de outra loja). */')
        .replace(/<div><strong id="rodapeNome">Henrique Borges<\/strong> · Climatização e soluções residenciais<\/div>/g,
                 `<div><strong id="rodapeNome">${nomeLoja}</strong> · ${frase}</div>`)
        .replace(/Por que escolher a Henrique Borges/g, `Por que escolher a ${nomeLoja}`)
        .replace(/Climatização premium/g, '')
        .replace(/Soluções completas em <em>ar&#8209;condicionado<\/em>/g, nomeLoja)
        .replace(/Instalação, limpeza e manutenção com atendimento em domicílio e orçamento sem compromisso\./g, frase)
        .replace(/Tudo o que seu ar-condicionado precisa/g, 'Nossos serviços')
        .replace(/Escolha o serviço e agende em menos de 1 minuto\. O valor final é confirmado na visita, sem surpresa\./g,
                 'Escolha o serviço, o profissional e o horário. Leva menos de 1 minuto.')
        // blocos e textos de ar-condicionado saem do HTML (não só escondidos)
        .replace(/<section class="sec faixa-valores" id="valores" data-ramo="climatizacao">[\s\S]*?<\/section>/g, '')
        .replace(/<section class="sec" id="diferenciais" data-ramo="climatizacao">[\s\S]*?<\/section>/g, '')
        .replace(/<span class="selo" id="selo1"><i>✓<\/i> Orçamento gratuito<\/span>/g, '<span class="selo" id="selo1"><i>✓</i> Escolha seu profissional</span>')
        .replace(/<span class="selo" id="selo2"><i>⌂<\/i> Atendimento em domicílio<\/span>/g, '<span class="selo" id="selo2"><i>⌂</i> Atendimento no local</span>')
        .replace(/<span class="selo" id="selo3"><i>★<\/i> Garantia no serviço<\/span>/g, '<span class="selo" id="selo3"><i>★</i> Horário garantido</span>')
        .replace(/<div class="n" id="faixa1">Em domicílio<\/div><div class="l">Atendimento<\/div>/g,
                 '<div class="n" id="faixa1">No local</div><div class="l">Atendimento</div>')
        .replace(/<div class="n" id="faixa2">Sem compromisso<\/div><div class="l">Orçamento<\/div>/g,
                 '<div class="n" id="faixa2">Na hora</div><div class="l">Pagamento</div>')
        .replace(/<div class="n" id="faixa3">Todos os dias<\/div><div class="l">Agendamento<\/div>/g,
                 '<div class="n" id="faixa3">Seg a Sáb</div><div class="l">Agenda</div>')
        .replace(/>Agendar serviço</g, '>Agendar horário<')
        .replace(/id="btnOrcamento">Solicitar orçamento</g, 'id="btnOrcamento">Agendar horário<');
    }
    const isCatalog = segmento === 'catalogo';
    const isServicos = segmento === 'servicos';
    const nome = business.name || store.name;
    const palavra = isCatalog ? 'Catálogo' : isServicos ? 'Serviços' : 'Cardápio';
    const ehPainel = page === 'admin';

    // O texto de exemplo do HTML ("Marmitas caseiras") não pode aparecer em outra
    // loja nem por um segundo: trocamos aqui, já no servidor, pela frase da loja.
    if (!ehPainel) {
      const fraseLoja = esc(business.tagline || business.hero_chamada || '');
      html = html
        .replace(/>Marmitas caseiras<\/div>/, `>${fraseLoja}</div>`)
        .replace(/>Marmitas caseiras, feitas no dia<\/p>/, `>${fraseLoja}</p>`);
    }

    // Barbearia: a prévia fala só do horário da loja (sem citar a plataforma).
    const ehBarbeariaLoja = business.perfil_agenda === 'barbearia';

    // Texto da prévia no WhatsApp: no painel fala de "área do administrador";
    // no catálogo/cardápio, do pedido do cliente.
    const descricao = ehPainel
      ? ehBarbeariaLoja
        ? `Área exclusiva de ${nome}. Entre com sua senha para ver a agenda, os clientes, os serviços e o faturamento.`
        : `Área exclusiva de ${nome}. Entre com sua senha para cadastrar produtos, mudar preços e acompanhar os pedidos do ${palavra.toLowerCase()}.`
      : ehBarbeariaLoja
      ? business.hero_chamada ||
        business.tagline ||
        `Escolha o serviço, o barbeiro e o horário. Leva menos de 1 minuto.`
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
    const origemBase = origem;
    /* Link do PAINEL: a prévia mostra SÓ o logotipo da loja — sem cartão
       montado, sem nome da plataforma, sem nenhum outro desenho. */
    const previaSoLogo = ehPainel && ehBarbeariaLoja && !!business.logo_url;
    // (função: o cartão com o logo é montado depois, mais abaixo no arquivo)
    const imagemPrevia = () =>
      previaSoLogo && business.logo_url
        ? business.logo_url.startsWith('http')
          ? business.logo_url
          : origem + business.logo_url
        : origemBase + `/l/${store.slug}/og-card.png?v=${versaoOg}`;

    const titulo = ehPainel
      ? `${nome} — Painel do administrador`
      : ehBarbeariaLoja
      ? `Agende seu horário com ${nome}`
      : isServicos
      ? `${nome} · Instalação e manutenção de ar condicionado`
      : `${nome} · ${palavra} digital`;
    const tituloPreview = ehPainel
      ? `${nome} — Painel do administrador`
      : ehBarbeariaLoja && !ehPainel
      ? `Agende seu horário com ${nome}`
      : isServicos
      ? `${nome} — Agende sua instalação ou limpeza`
      : `${nome} — ${palavra} Digital`;
    const url = `${origem}/l/${store.slug}${page === 'admin' ? '/admin' : ''}`;

    const stamp = String(Date.now());
    // versão ESTÁVEL do cartão de compartilhamento: só muda quando o nome,
    // o tipo (cardápio/catálogo) ou o logo mudam — assim o WhatsApp não
    // guarda uma prévia antiga para sempre.
    const versaoOg = require('crypto')
      .createHash('md5')
      .update(`${nome}|${palavra}|${(business.logo_url || '')}|${business.perfil_agenda || ''}|cartao-v4`)
      .digest('hex')
      .slice(0, 8);
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
        // Cartão 1200x630 (o formato que Instagram, Facebook e WhatsApp mostram).
        // O ?v= muda quando o nome/tipo mudam, então a prévia é atualizada sozinha.
        `<meta property="og:image" content="${esc(imagemPrevia())}">`,
        `<meta property="og:image:secure_url" content="${esc(imagemPrevia())}">`,
        `<meta property="og:image:type" content="image/png">`,
        ...(previaSoLogo ? [] : [`<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`]),
        `<meta property="og:image:alt" content="${esc(ehBarbeariaLoja ? nome : `${nome} — ${palavra} digital`)}">`,
        `<meta property="og:url" content="${esc(url)}">`,
        `<meta property="og:site_name" content="${esc(nome)}">`,
        `<meta property="og:locale" content="pt_BR">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${esc(tituloPreview)}">`,
        `<meta name="twitter:description" content="${esc(descricao)}">`,
        `<meta name="twitter:image" content="${esc(imagemPrevia())}">`,
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

    // Formatação e correção de WhatsApp somente para a AGEO.
    if (store.slug === 'ageo-confeitaria' && !ehServicos) {
      if (page === 'admin') {
        html = require('./src/ageo-whatsapp').painelHtml(html)
          .replace('/assets/admin.js?v=', '/l/ageo-confeitaria/ageo-admin.js?v=');
      } else {
        html = html.replace('/assets/menu.js?v=', '/l/ageo-confeitaria/ageo-menu.js?v=');
      }
    }

    // não deixa o robô de busca indexar o painel
    if (page === 'admin') html = html.replace('</head>', '<meta name="robots" content="noindex, nofollow"></head>');

    /* A página (site E painel) NUNCA pode ser guardada pelo navegador nem pelo
       celular: ao atualizar, o dono vê exatamente a mesma versão que está no ar.
       (HTML velho em cache era o que fazia aparecer o painel antigo, com cara de
       outra loja, depois de cada atualização.) */
    /* Aparência da loja já na PRIMEIRA pintura da tela.
       Antes, a cor e o tema só eram aplicados depois de a página buscar
       /api/servicos: nesses 1–2 segundos o cliente e o dono viam o layout
       antigo (claro/azul, do módulo da Henrique). Agora a cor, a fonte e o
       tema da loja já vêm dentro do HTML. */
    const ehBarbeariaAgora = business.perfil_agenda === 'barbearia';
    const varsLoja = [
      business.theme_color ? `--navy:${String(business.theme_color).replace(/[^#0-9a-zA-Z(),.% -]/g, '')};--azul:${String(business.theme_color).replace(/[^#0-9a-zA-Z(),.% -]/g, '')}` : '',
      business.accent_color ? `--gold:${String(business.accent_color).replace(/[^#0-9a-zA-Z(),.% -]/g, '')}` : '',
    ].filter(Boolean).join(';');
    const estiloLoja =
      `<style id="ps-tema-loja">${varsLoja ? `:root{${varsLoja}}` : ''}` +
      (ehBarbeariaAgora
        ? `body{background:#0b0b0d;color:#f4efe4}body #login{background:radial-gradient(circle at 50% 18%,#1c1a12,#0b0b0d 65%)}`
        : '') +
      `</style>`;
    html = html.replace('</head>', `${estiloLoja}<meta name="ps-versao" content="${APP_VERSAO}"></head>`);
    if (ehBarbeariaAgora) {
      /* Barbearia: já sai do servidor com o layout dela.
         - data-ramo="outro"  -> o topo é SÓ o logotipo redondo e grande, sem os
           textos de ar-condicionado (antes isso só acontecia depois de a página
           buscar a API, e era o "pisca" de outra tela ao atualizar);
         - se a loja tem equipe cadastrada, a seção dos barbeiros já vem aberta. */
      const attrsBody = ehPainel ? 'class="tema-imperio"' : 'class="tema-imperio" data-ramo="outro"';
      html = html.replace(/<body>/, `<body ${attrsBody}>`);
      if (ehPainel) {
        // blocos que a barbearia usa e que antes só apareciam depois da API
        html = html
          .replace(/<div class="hoje-atalhos oculto" id="hojeAtalhos">/, '<div class="hoje-atalhos" id="hojeAtalhos">')
          .replace(/<div class="card oculto" id="cardHorariosHoje">/, '<div class="card" id="cardHorariosHoje">')
          .replace(/<div class="card oculto" id="cardPagamentos">/, '<div class="card" id="cardPagamentos">');
      }
      // Só no painel da Império: a lista de horários de hoje começa recolhida.
      if (ehPainel && store.slug === 'imperio-barber') {
        const fs = require('fs');
        const fragmento = fs.readFileSync(path.join(PUBLIC_DIR, 'imperio-horarios-hoje.html'), 'utf8');
        const conteudo = /<h2>🕐 Horários de hoje <span class="qtd" id="qLivresHoje">0<\/span><\/h2>\s*<div id="gradeHoje" class="grade-horas"><\/div>\s*<div class="legenda-grade"><span><i class="lg-livre"><\/i>livre<\/span><span><i class="lg-ocupado"><\/i>já agendado<\/span><\/div>/;
        html = html.replace(conteudo, () => fragmento);
        html = html.replace('href="admin/manifest.json"', 'href="/l/imperio-barber/admin/manifest.json"');
        html = require('./src/imperio-painel-premium').aplicar(html);
      }
      if (!ehPainel && store.slug === 'imperio-barber') {
        html = require('./src/imperio-site-planos').aplicar(html);
      }
      if (!ehPainel) {
        try {
          const nProf = require('./src/db').db
            .prepare('SELECT COUNT(*) AS n FROM profissionais WHERE store_id = ? AND ativo = 1')
            .get(store.id).n;
          if (nProf > 0) html = html.replace(/<section class="sec oculto" id="equipe">/, '<section class="sec" id="equipe">');
        } catch {}
      }
      // sobras escritas em JavaScript (não aparecem em barbearia, mas ficam prontas)
      html = html.replace(/: 'Climatização'/, ": 'Agendamentos'");
    }
    /* no-cache + must-revalidate: o navegador SEMPRE pergunta ao servidor antes
       de mostrar a página (F5 traz a versão que está no ar, nunca uma velha) e,
       ao mesmo tempo, o service worker continua podendo guardar a cópia que faz
       a loja abrir na hora quando o Render está acordando.
       (no-store não pode ser usado: ele impede essa cópia no celular.) */
    res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    res.set('Expires', '0');
    res.set('X-Painel-Versao', APP_VERSAO);
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
    // getStoreBySlug ignora lojas desativadas; aqui queremos encontrá-la mesmo assim
    // para mostrar "em manutenção" (e não "não encontrada").
    const store =
      getStoreBySlug(req.params.slug) ||
      require('./src/db')
        .listStores()
        .find((x) => String(x.slug).toLowerCase() === String(req.params.slug).toLowerCase()) ||
      null;
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
    // Loja desativada no Master: o link do cliente e o painel saem do ar.
    // Basta reativar para voltar tudo como estava (nada é apagado).
    if (store.active === 0 || store.active === false) {
      if (req.originalUrl.includes('/api/')) {
        return res.status(503).json({ error: 'Esta loja está temporariamente fora do ar.' });
      }
      return res
        .status(503)
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
            '<title>Loja fora do ar</title>' +
            '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:56px 24px;text-align:center;max-width:520px;margin:0 auto">' +
            '<div style="font-size:44px">🔧</div>' +
            '<h1 style="font-size:22px;margin:14px 0 8px">Estamos fazendo uma manutenção</h1>' +
            '<p style="color:#666;line-height:1.55;margin:0">Esta página voltará ao ar em breve. ' +
            'Se precisar falar com a loja agora, chame no WhatsApp.</p>' +
            '</div>'
        );
    }
    req.store = store;
    next();
  }

  app.use('/l/:slug/api/admin', resolveStoreFromParam, require('./src/routes.admin'));
  // Importação isolada de clientes da Império: não altera clientes existentes.
  app.use('/l/:slug/api/admin', resolveStoreFromParam, require('./src/imperio-importar-clientes').router);
  app.use('/l/:slug/api/admin', resolveStoreFromParam, require('./src/imperio-planos').router);
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
      short_name: painel && store.slug === 'imperio-barber' ? 'Painel Império' : (nome.length <= 14 ? nome : nome.split(' ')[0].slice(0, 14)),
      description: painel
        ? `Painel de ${nome}: produtos, pedidos e configurações.`
        : business.tagline || business.about || `Peça pelo WhatsApp em ${nome}.`,
      start_url: `/l/${store.slug}${painel ? '/admin' : ''}`,
      ...(painel && store.slug === 'imperio-barber' ? { id: `/l/${store.slug}/admin`, scope: `/l/${store.slug}/admin` } : { scope: '/' }),
      display: 'standalone',
      background_color: painel && store.slug === 'imperio-barber' ? '#0b0b0b' : '#fbf6ee',
      theme_color: business.theme_color || '#1e6b4f',
      ...(painel && store.slug === 'imperio-barber' ? {} : { orientation: 'portrait' }),
      lang: 'pt-BR',
      icons: painel && store.slug === 'imperio-barber'
        ? [192, 512].map((size) => ({ src: `/l/imperio-barber/painel-icone-${size}.png?v=${require('crypto').createHash('sha256').update(String(business.logo_url || '')).digest('hex').slice(0, 12)}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }))
        : [
          { src: `${origem}/img/app-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: icone, sizes: '512x512', type: tipoImagem(icone), purpose: 'any' },
          { src: icone, sizes: '512x512', type: tipoImagem(icone), purpose: 'maskable' },
        ],
    });
  }

  // Instalação isolada do painel Império: não intercepta outras lojas nem guarda dados.
  app.get('/l/imperio-barber/imperio-painel-sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, max-age=0, must-revalidate');
    res.type('application/javascript').sendFile(path.join(PUBLIC_DIR, 'imperio-painel-sw.js'));
  });
  app.get('/l/:slug/painel-icone-:size.png', resolveStoreFromParam, async (req, res) => {
    if (req.store.slug !== 'imperio-barber') return res.sendStatus(404);
    const size = Number(req.params.size);
    if (![192, 512].includes(size)) return res.sendStatus(404);
    const logo = String((require('./src/db').getSetting(req.store.id, 'business', {}) || {}).logo_url || '');
    const backup = path.join(PUBLIC_DIR, `img/imperio-painel-${size}.png`);
    try {
      let bytes = null;
      if (/^https?:\/\//i.test(logo) && process.env.SUPABASE_URL) {
        const remote = new URL(logo), permitido = new URL(process.env.SUPABASE_URL);
        if (remote.origin === permitido.origin && remote.pathname.startsWith('/storage/v1/object/public/')) {
          const r = await fetch(remote, { signal: AbortSignal.timeout(5000), redirect: 'error' });
          if (r.ok && Number(r.headers.get('content-length') || 0) <= 8000000) {
            const b = Buffer.from(await r.arrayBuffer());
            if (b.length <= 8000000) bytes = b;
          }
        }
      } else if (logo.startsWith('/uploads/')) {
        const base = path.resolve(resolveUploadDir());
        const arquivo = path.resolve(base, logo.slice('/uploads/'.length));
        if (arquivo.startsWith(base + path.sep) && fs.existsSync(arquivo)) bytes = fs.readFileSync(arquivo);
      } else if (logo.startsWith('/img/')) {
        const base = path.resolve(PUBLIC_DIR, 'img');
        const arquivo = path.resolve(base, logo.slice('/img/'.length));
        if (arquivo.startsWith(base + path.sep) && fs.existsSync(arquivo)) bytes = fs.readFileSync(arquivo);
      }
      if (!bytes) return res.set('Cache-Control', 'public, max-age=300').type('png').sendFile(backup);
      const imagem = await require('sharp')(bytes, { limitInputPixels: 25000000 }).resize(size, size, { fit: 'contain', background: '#0b0b0b' }).png().toBuffer();
      res.set('Cache-Control', 'public, max-age=3600').type('png').send(imagem);
    } catch (err) {
      res.set('Cache-Control', 'public, max-age=300').type('png').sendFile(backup);
    }
  });
  app.get('/l/:slug/manifest.json', resolveStoreFromParam, (req, res) => renderManifest(req, res, 'menu'));
  app.get('/l/:slug/admin/manifest.json', resolveStoreFromParam, (req, res) => renderManifest(req, res, 'admin'));


  /**
   * Imagem de prévia do link (WhatsApp/Instagram): pega o LOGO da loja e
   * entrega um JPEG leve, quadrado, servido pelo nosso domínio.
   * Assim a prévia nunca cai na imagem "de outra loja" nem demora a carregar.
   */
  /**
   * Cartão de compartilhamento 1200x630 — é a imagem que aparece no Instagram,
   * Facebook, WhatsApp e Telegram quando alguém cola o link da loja.
   * Monta: fundo na cor da loja + logo + nome + "Cardápio/Catálogo digital".
   */
  app.get('/l/:slug/og-card.png', resolveStoreFromParam, async (req, res) => {
    try {
      const store = req.store;
      const db = require('./src/db');
      const business = db.getSetting(store.id, 'business', {}) || {};
      const seg = db.segmentoEfetivo(store);
      const nome = (business.name || store.name || '').trim();
      const tipo = seg === 'catalogo' ? 'Catálogo digital' : seg === 'servicos' ? 'Agendamento online' : 'Cardápio digital';
      const chamada = (business.hero_chamada || business.tagline || '').trim();
      const cor = /^#[0-9a-f]{6}$/i.test(business.theme_color || '') ? business.theme_color : '#12352a';
      const ouro = /^#[0-9a-f]{6}$/i.test(business.accent_color || '') ? business.accent_color : '#e7cf9b';
      const dominio = (req.get('host') || 'loja-digital.onrender.com').replace(/^www\./, '');
      // barbearia mostra o logotipo REDONDO também na prévia do link
      const redondo = String(business.perfil_agenda || '') === 'barbearia';

      // usa as fontes do projeto (sem elas o texto vira quadradinho no servidor)
      try {
        const m = require('./src/routes.master');
        if (typeof m.prepararFontes === 'function') m.prepararFontes();
      } catch {
        /* segue com a fonte padrão */
      }
      const sharp = require('sharp');
      const crypto = require('crypto');
      const cacheDir = path.join(require('os').tmpdir(), 'ps-ogcard');
      const chave = crypto.createHash('md5').update(`${nome}|${tipo}|${chamada}|${cor}|${business.logo_url || ''}|${redondo}`).digest('hex');
      const cacheFile = path.join(cacheDir, `${store.slug}-${chave}.png`);

      if (!fs.existsSync(cacheFile)) {
        // logo (ou inicial) em base64 para entrar no SVG
        let logoUri = '';
        try {
          const fonte = business.logo_url || '';
          let buf = null;
          if (fonte && /^https?:/i.test(fonte)) {
            const r = await fetch(fonte);
            if (r.ok) buf = Buffer.from(await r.arrayBuffer());
          } else if (fonte) {
            const tentativas = [
              path.join(resolveUploadDir(), String(fonte).replace(/^\/uploads\//, '')),
              path.join(PUBLIC_DIR, String(fonte).replace(/^\//, '')),
            ];
            for (const arq of tentativas) if (fs.existsSync(arq)) { buf = fs.readFileSync(arq); break; }
          }
          if (buf) {
            const quadrado = await sharp(buf).resize(300, 300, { fit: 'cover' }).png().toBuffer();
            logoUri = `data:image/png;base64,${quadrado.toString('base64')}`;
          }
        } catch {
          logoUri = '';
        }

        const inicial = esc((nome || '?').charAt(0).toUpperCase());

        // Barbearia: a prévia do link mostra SÓ o logotipo redondo, grande e centralizado.
        if (redondo) {
          const svgSimples = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="luz" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="${esc(tom(cor, 0.18))}"/>
      <stop offset="0.55" stop-color="${cor}"/>
      <stop offset="1" stop-color="${esc(tom(cor, -0.55))}"/>
    </radialGradient>
    <clipPath id="bola"><circle cx="600" cy="315" r="196"/></clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#luz)"/>
  <circle cx="600" cy="315" r="214" fill="#0b0b0b" fill-opacity=".55"/>
  ${logoUri
    ? `<image href="${logoUri}" x="404" y="119" width="392" height="392" preserveAspectRatio="xMidYMid slice" clip-path="url(#bola)"/>`
    : `<circle cx="600" cy="315" r="196" fill="#f7f2e6"/>
       <text x="600" y="388" text-anchor="middle" font-family="DejaVu Serif, serif" font-size="190" font-weight="700" fill="${cor}">${inicial}</text>`}
  <circle cx="600" cy="315" r="200" fill="none" stroke="${ouro}" stroke-opacity=".9" stroke-width="6"/>
  <circle cx="600" cy="315" r="212" fill="none" stroke="${ouro}" stroke-opacity=".35" stroke-width="2"/>
</svg>`;
          fs.mkdirSync(cacheDir, { recursive: true });
          await sharp(Buffer.from(svgSimples)).png().toFile(cacheFile);
          res.set('Content-Type', 'image/png');
          res.set('Cache-Control', 'public, max-age=3600');
          return res.sendFile(cacheFile);
        }

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${cor}"/>
      <stop offset="0.62" stop-color="${esc(tom(cor, -0.42))}"/>
      <stop offset="1" stop-color="${esc(tom(cor, -0.62))}"/>
    </linearGradient>
    <clipPath id="recorte">${
      redondo
        ? '<circle cx="230" cy="315" r="150"/>'
        : '<rect x="80" y="165" width="300" height="300" rx="42"/>'
    }</clipPath>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="26" y="26" width="1148" height="578" rx="30" fill="none" stroke="${ouro}" stroke-opacity=".45" stroke-width="3"/>
  ${
    logoUri
      ? `${redondo
            ? '<circle cx="230" cy="315" r="150" fill="#f7f2e6"/>'
            : '<rect x="80" y="165" width="300" height="300" rx="42" fill="#f7f2e6"/>'}
         <image href="${logoUri}" x="80" y="165" width="300" height="300" preserveAspectRatio="xMidYMid slice" clip-path="url(#recorte)"/>
         ${redondo ? `<circle cx="230" cy="315" r="154" fill="none" stroke="${ouro}" stroke-opacity=".85" stroke-width="5"/>` : ''}`
      : `${redondo
            ? '<circle cx="230" cy="315" r="150" fill="#f7f2e6"/>'
            : '<rect x="80" y="165" width="300" height="300" rx="42" fill="#f7f2e6"/>'}
         <text x="230" y="370" text-anchor="middle" font-family="DejaVu Serif, serif" font-size="170" font-weight="700" fill="${cor}">${inicial}</text>`
  }
  <text x="430" y="255" font-family="DejaVu Sans, sans-serif" font-size="26" font-weight="700"
        letter-spacing="4" fill="${ouro}">${esc(redondo ? 'AGENDE SEU HORÁRIO' : tipo.toUpperCase())}</text>
  <text x="430" y="330" font-family="DejaVu Serif, serif" font-size="62" font-weight="700" fill="#f7f2e6">${esc(nome.slice(0, 22))}</text>
  <text x="430" y="392" font-family="DejaVu Sans, sans-serif" font-size="30" fill="#d9e2dc">${esc(chamada.slice(0, 44))}</text>
  ${redondo
    ? `<text x="430" y="462" font-family="DejaVu Sans, sans-serif" font-size="27" font-weight="700" fill="${ouro}">Escolha o barbeiro e o horário</text>`
    : `<rect x="430" y="440" width="${Math.min(720, 340 + numeroLargura(`${dominio}/l/${store.slug}`))}" height="62" rx="31" fill="${ouro}" fill-opacity=".16" stroke="${ouro}" stroke-opacity=".5" stroke-width="2"/>
  <text x="460" y="481" font-family="DejaVu Sans, sans-serif" font-size="26" font-weight="700" fill="${ouro}">${esc(dominio)}/l/${esc(store.slug)}</text>`}
  <text x="80" y="560" font-family="DejaVu Sans, sans-serif" font-size="25" fill="#a9bab1">${esc(
    redondo
      ? 'Leva menos de 1 minuto · pagamento na hora, Pix ou cartão'
      : seg === 'servicos'
      ? 'Agende pelo site · escolha o profissional e o horário'
      : seg === 'catalogo'
        ? 'Veja o catálogo · peça pelo site ou pelo WhatsApp'
        : 'Peça pelo site · pagamento online ou na entrega'
  )}</text>
</svg>`;
        fs.mkdirSync(cacheDir, { recursive: true });
        await sharp(Buffer.from(svg)).png().toFile(cacheFile);
      }
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=3600');
      res.sendFile(cacheFile);
    } catch (e) {
      console.error('[og-card]', e.message);
      res.status(500).end();
    }
  });

  app.get('/l/:slug/og.jpg', resolveStoreFromParam, async (req, res) => {
    const store = req.store;
    const business = require('./src/db').getSetting(store.id, 'business', {}) || {};
    const origem = business.logo_url || business.cover_url || '';
    const cacheDir = path.join(require('os').tmpdir(), 'ps-og');
    const cacheFile = path.join(cacheDir, `${store.slug}-${require('crypto').createHash('md5').update(origem).digest('hex')}-v2.jpg`);
    try {
      if (!fs.existsSync(cacheFile)) {
        const sharp = require('sharp');
        let buf = null;
        if (origem && /^https?:/i.test(origem)) {
          const r = await fetch(origem);
          if (r.ok) buf = Buffer.from(await r.arrayBuffer());
        } else if (origem) {
          // logo pode estar na nuvem (/uploads/...) ou no próprio site (/img/...)
          const rel = String(origem).replace(/^\/uploads\//, '');
          const tentativas = [
            path.join(resolveUploadDir(), rel),
            path.join(PUBLIC_DIR, String(origem).replace(/^\//, '')),
            path.join(resolveUploadDir(), path.basename(rel)),
          ];
          for (const arq of tentativas) {
            if (fs.existsSync(arq)) {
              buf = fs.readFileSync(arq);
              break;
            }
          }
        }
        if (!buf) {
          // sem logo: cartão neutro com a inicial da loja
          const inicial = String(business.name || store.name || '?').trim().charAt(0).toUpperCase();
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#12352a"/><text x="300" y="330" text-anchor="middle" font-family="DejaVu Serif, serif" font-size="240" font-weight="700" fill="#e7cf9b">${inicial}</text></svg>`;
          buf = await sharp(Buffer.from(svg)).png().toBuffer();
        }
        fs.mkdirSync(cacheDir, { recursive: true });
        await sharp(buf)
          .resize(600, 600, { fit: 'contain', background: { r: 247, g: 242, b: 230, alpha: 1 } })
          .flatten({ background: '#f7f2e6' })
          .jpeg({ quality: 80, progressive: false, mozjpeg: true })
          .toFile(cacheFile);
      }
      const dados = fs.readFileSync(cacheFile);
      res.set('Content-Type', 'image/jpeg');
      res.set('Content-Length', String(dados.length));
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('Access-Control-Allow-Origin', '*');
      res.send(dados);
    } catch (e) {
      console.error('[og]', e.message);
      res.status(404).end();
    }
  });

  /**
   * Comprovante de pagamento (público, protegido pelo código do pedido).
   * /l/<loja>/comprovante/<codigo>
   * Serve para o cliente guardar e para a loja conferir — o mesmo link vai no WhatsApp.
   */
  app.get('/l/:slug/comprovante/:code', resolveStoreFromParam, (req, res) => {
    try {
      const db = require('./src/db');
      const business = db.getSetting(req.store.id, 'business', {}) || {};
      const order = db.db
        .prepare('SELECT * FROM orders WHERE code = ? AND store_id = ?')
        .get(String(req.params.code).toUpperCase(), req.store.id);
      if (!order) return res.status(404).type('html').send('<h1>Comprovante não encontrado</h1>');
      const itens = JSON.parse(order.items_json || '[]');
      const brl = (c) => 'R$ ' + (Number(c || 0) / 100).toFixed(2).replace('.', ',');
      const data = new Date(order.created_at + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const pago = order.payment_status === 'pago';
      const cor = /^#[0-9a-f]{6}$/i.test(business.theme_color || '') ? business.theme_color : '#12352a';
      const nome = business.name || req.store.name;
      // escolhas vêm como lista de {nome, qtd}: monta um texto legível
      const detalheEscolhas = (e) => {
        if (!e) return '';
        if (typeof e === 'string') return e;
        const lista = Array.isArray(e) ? e : Object.entries(e).map(([nome, qtd]) => ({ nome, qtd }));
        return lista
          .filter((x) => x && x.nome)
          .map((x) => `${Number(x.qtd) || 1}× ${x.nome}`)
          .join(' · ');
      };
      const linhas = itens
        .map(
          (i) =>
            `<tr><td>${esc(i.qty)}x ${esc(i.name)}${i.escolhas ? `<div style="font-size:12px;color:#777">${esc(detalheEscolhas(i.escolhas))}</div>` : ''}</td>
                 <td style="text-align:right">${brl(i.total_cents ?? (i.price_cents || 0) * (i.qty || 1))}</td></tr>`
        )
        .join('');
      const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comprovante ${esc(order.code)} · ${esc(nome)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f3efe6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1e2b24;padding:20px}
  .folha{max-width:520px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.08)}
  .topo{background:${cor};color:#fff;padding:22px 22px 18px}
  .loja{font-size:20px;font-weight:800;margin:0}
  .sub{opacity:.85;font-size:13px;margin-top:4px}
  .selo{display:inline-block;margin-top:12px;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:800;
        background:${pago ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.14)'};color:#fff}
  .corpo{padding:20px 22px 24px}
  .linha{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:7px 0;border-bottom:1px dashed #e6e0d4}
  .linha:last-of-type{border-bottom:0}
  .rot{color:#6b7a72}
  table{width:100%;border-collapse:collapse;margin:14px 0 6px;font-size:14px}
  td{padding:8px 0;border-bottom:1px solid #f0ece2;vertical-align:top}
  .total{display:flex;justify-content:space-between;font-size:20px;font-weight:800;margin-top:14px;padding-top:14px;border-top:2px solid #e6e0d4}
  .pe{margin-top:18px;font-size:12px;color:#8a968f;text-align:center;line-height:1.5}
  .acoes{display:flex;gap:10px;margin-top:18px}
  button,a.btn{flex:1;text-align:center;border:1px solid #1e2b24;background:#1e2b24;color:#fff;border-radius:999px;
        padding:12px;font-weight:700;font-size:14px;text-decoration:none;cursor:pointer;font-family:inherit}
  a.btn.ghost{background:#fff;color:#1e2b24}
  @media print{body{background:#fff;padding:0}.acoes{display:none}.folha{box-shadow:none}}
</style></head><body>
<div class="folha">
  <div class="topo">
    <p class="loja">${esc(nome)}</p>
    <div class="sub">${esc(business.whatsapp ? 'WhatsApp ' + business.whatsapp : '')}</div>
    <span class="selo">${pago ? '✓ Pagamento confirmado' : '⏳ Aguardando confirmação do pagamento'}</span>
  </div>
  <div class="corpo">
    <div class="linha"><span class="rot">Comprovante</span><strong>${esc(order.code)}</strong></div>
    <div class="linha"><span class="rot">Data</span><span>${esc(data)}</span></div>
    <div class="linha"><span class="rot">Cliente</span><span>${esc(order.customer_name || '')}</span></div>
    <div class="linha"><span class="rot">Pagamento</span><span>${esc(order.payment_method || '—')}</span></div>
    <div class="linha"><span class="rot">Situação</span><span>${esc(order.payment_status || 'pendente')}</span></div>
    ${order.payment_gateway_id ? `<div class="linha"><span class="rot">Código da transação</span><span>${esc(order.payment_gateway_id)}</span></div>` : ''}
    <table>${linhas}</table>
    <div class="total"><span>Total</span><span>${brl(order.total_cents)}</span></div>
    <div class="acoes">
      <button onclick="window.print()">Salvar / imprimir</button>
      <a class="btn ghost" href="/l/${esc(req.store.slug)}">Voltar à loja</a>
    </div>
    <p class="pe">Este comprovante é gerado automaticamente pela loja.<br>O valor é recebido na conta de pagamento cadastrada pelo lojista.</p>
  </div>
</div>
</body></html>`;
      res.type('html').send(html);
    } catch (e) {
      console.error('[comprovante]', e.message);
      res.status(500).send('Não foi possível gerar o comprovante.');
    }
  });

  // Scripts derivados específicos da AGEO; o painel e cardápio das outras lojas permanecem iguais.
  app.get('/l/ageo-confeitaria/ageo-admin.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('application/javascript').send(require('./src/ageo-whatsapp').painel());
  });
  app.get('/l/ageo-confeitaria/ageo-menu.js', (req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.type('application/javascript').send(require('./src/ageo-whatsapp').cardapio());
  });

  app.get('/l/:slug/admin', resolveStoreFromParam, (req, res) => renderStorePage(res, req.store, 'admin'));

  /* Central de Tráfego: cada abertura da página pública entra no relatório */
  app.get(
    '/l/:slug',
    resolveStoreFromParam,
    (req, res, next) => {
      try {
        require('./src/rastreio').registrarVisita(req, res, req.store);
      } catch (e) {
        console.error('[visita]', e.message);
      }
      next();
    },
    (req, res) => renderStorePage(res, req.store, 'menu')
  );

  /* --------------------- loja principal (raiz "/") -------------------- */
  function withDefaultStore(req, res, next) {
    const store = getStoreBySlug(req.query.loja) || defaultStore();
    if (!store) return res.status(500).json({ error: 'Nenhuma loja configurada.' });
    req.store = store;
    next();
  }

  app.use('/api/admin', withDefaultStore, require('./src/routes.admin'));
  app.use('/api', withDefaultStore, require('./src/routes.public'));

  /**
   * Apelidos curtos: /ageo, /mimo, /mdn, /pratica, /henrique
   * Servem para mandar um link bonito no WhatsApp. Redirecionam (301) para
   * o cardápio da loja. O apelido sai do painel (business.atalho) ou, se não
   * houver, da primeira palavra do nome da loja.
   */
  function atalhosDaLoja() {
    const mapa = {};
    try {
      const { getSetting } = require('./src/db');
      for (const st of listStores()) {
        const b = getSetting(st.id, 'business', {}) || {};
        const curto = String(b.atalho || st.slug.split('-')[0] || '').toLowerCase();
        if (curto) mapa[curto] = st.slug;
      }
    } catch {
      /* sem atalhos */
    }
    return mapa;
  }
  app.use((req, res, next) => {
    const p = String(req.path || '');
    if (p === '/' || p.includes('.') || p.split('/').filter(Boolean).length !== 1) return next();
    const slug = atalhosDaLoja()[p.slice(1).toLowerCase()];
    if (!slug) return next();
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, `/l/${slug}${qs}`);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
  app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

  app.use((err, req, res, next) => {
    console.error('[erro]', err);
    res.status(500).json({ error: 'Erro interno.' });
  });

  /**
   * Aquece as imagens de prévia (og.jpg) de todas as lojas assim que o servidor
   * sobe. Sem isso, a PRIMEIRA leitura do WhatsApp pode estourar o tempo e a
   * prévia aparece vazia.
   */
  async function aquecerPrevias() {
    try {
      const lojas = listStores();
      const sharp = require('sharp');
      const dir = path.join(require('os').tmpdir(), 'ps-og');
      fs.mkdirSync(dir, { recursive: true });
      for (const loja of lojas) {
        try {
          const b = require('./src/db').getSetting(loja.id, 'business', {}) || {};
          const origem = b.logo_url || b.cover_url || '';
          const cacheFile = path.join(
            dir,
            `${loja.slug}-${require('crypto').createHash('md5').update(origem).digest('hex')}-v2.jpg`
          );
          if (fs.existsSync(cacheFile)) continue;
          let buf = null;
          if (origem && /^https?:/i.test(origem)) {
            const r = await fetch(origem);
            if (r.ok) buf = Buffer.from(await r.arrayBuffer());
          } else if (origem) {
            const rel = String(origem).replace(/^\/uploads\//, '');
            const tentativas = [
              path.join(resolveUploadDir(), rel),
              path.join(PUBLIC_DIR, String(origem).replace(/^\//, '')),
            ];
            const arq = tentativas.find((f) => fs.existsSync(f));
            if (arq) buf = fs.readFileSync(arq);
          }
          if (!buf) continue;
          await sharp(buf)
            .resize(600, 600, { fit: 'contain', background: { r: 247, g: 242, b: 230, alpha: 1 } })
            .flatten({ background: '#f7f2e6' })
            .jpeg({ quality: 80, progressive: false, mozjpeg: true })
            .toFile(cacheFile);
          console.log(`[prévia] ${loja.slug} pronta`);
        } catch {}
      }
    } catch {}
  }

  iniciarKeepAlive();
  setTimeout(aquecerPrevias, 800);

  app.listen(PORT, HOST, () => {
    console.log(`✅ Prática Sabores (multi-loja) em http://${HOST}:${PORT}`);
    for (const s of listStores()) console.log(`   /l/${s.slug}  →  ${s.name}`);
    console.log(`   Painel master: http://localhost:${PORT}/master`);
    console.log(`   Persistência na nuvem: ${remote.ATIVO ? 'ATIVA' : 'desligada (sem SUPABASE_URL/KEY)'}`);
    setTimeout(aquecerPrevias, 800);
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
