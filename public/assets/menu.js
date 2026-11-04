/* ============================================================
   Cardápio público — carrinho, checkout e envio ao WhatsApp
   ============================================================ */
(() => {
  'use strict';

  /* Carrinho e dados do cliente são separados POR LOJA (nada se mistura). */
  const STORE_SLUG = (() => {
    const m = location.pathname.match(/^\/l\/([a-z0-9-]+)/i);
    return m ? m[1].toLowerCase() : 'principal';
  })();
  const CART_KEY = `ps_cart_v2_${STORE_SLUG}`;
  const CUSTOMER_KEY = `ps_customer_v2_${STORE_SLUG}`;

  /* Prefixo da loja na URL: /l/<slug> (cardápio e painel de cada cliente) */
  const API_PREFIX = (() => {
    const m = location.pathname.match(/^\/l\/([a-z0-9-]+)/i);
    return m ? `/l/${m[1]}` : '';
  })();
  const apiUrl = (u) => (API_PREFIX && String(u).startsWith('/api/') ? API_PREFIX + u : u);

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const $ = (sel) => document.querySelector(sel);
  const el = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    menu: null,
    accepting: true,
    closedMessage: '',
    products: [],
    cart: {},
    category: 'TODOS',
    view: 'cart',
    delivery: { fee_cents: 0, free_above_cents: 0, min_order_cents: 0, pickup_enabled: true, periods: [], periods_note: '' },
    payments: [],
    mpCartao: { disponivel: false, public_key: '' },
    checkoutModo: 'todos',
    pedidoCartao: '',
    business: {},
    segment: 'food',
    lastOrder: null,
    busy: false,
  };

  /* ------------------------------ utilidades ------------------------------ */
  function toast(msg, type = '') {
    const stack = el('toasts');
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = msg;
    stack.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      div.style.transform = 'translateY(8px)';
      div.style.transition = 'all .25s';
      setTimeout(() => div.remove(), 260);
    }, 3200);
  }

  async function api(url, opts = {}) {
    // cache: 'no-store' → o celular nunca mostra cardápio velho guardado
    const res = await fetch(apiUrl(url), { cache: 'no-store', headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.error || 'Erro inesperado.');
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      Object.keys(raw).forEach((k) => {
        const bruto = raw[k];
        if (bruto && typeof bruto === 'object') {
          const q = Number(bruto.qty);
          if (Number.isInteger(q) && q > 0 && q < 100) {
            state.cart[k] = { qty: q, escolhas: Array.isArray(bruto.escolhas) ? bruto.escolhas : null };
          }
          return;
        }
        const q = Number(bruto);
        if (Number.isInteger(q) && q > 0 && q < 100) state.cart[k] = q;
      });
    } catch {
      state.cart = {};
    }
  }
  const saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify(state.cart));

  const productById = (id) => state.products.find((p) => String(p.id) === String(id));

  /** Chave do carrinho: id do produto + a montagem escolhida (sabores). */
  function chaveItem(produtoId, escolhas) {
    if (!escolhas || !escolhas.length) return String(produtoId);
    const assinatura = escolhas
      .slice()
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
      .map((e) => `${e.nome}:${e.qtd}`)
      .join('|');
    return `${produtoId}#${assinatura}`;
  }

  /** "4 Beijinho, 8 Brigadeiro" */
  const resumoEscolhas = (escolhas) => {
    const validas = (escolhas || []).filter((e) => Number(e.qtd) > 0);
    if (!validas.length) return '';
    // barra (1 de cada sabor) fica mais limpo só com os nomes
    const umaDeCada = validas.every((e) => Number(e.qtd) === 1);
    return validas.map((e) => (umaDeCada ? e.nome : `${e.qtd} ${e.nome}`)).join(', ');
  };

  /** Preço de uma unidade já com os acréscimos dos sabores. */
  function precoUnitario(produto, escolhas) {
    let extra = 0;
    for (const e of escolhas || []) {
      const sabor = ((produto.opcoes && produto.opcoes.sabores) || []).find((s) => s.nome === e.nome);
      if (sabor) extra += Number(sabor.extra_cents || 0) * Number(e.qtd || 0);
    }
    return Number(produto.price_cents || 0) + extra;
  }

  const cartEntries = () =>
    Object.entries(state.cart)
      .map(([chave, valor]) => {
        const qtd = typeof valor === 'number' ? valor : Number(valor && valor.qty) || 0;
        const escolhas = (valor && valor.escolhas) || null;
        const idProduto = String(chave).split('#')[0];
        const p = productById(idProduto);
        if (!p || qtd <= 0) return null;
        const preco = precoUnitario(p, escolhas);
        const resumo = resumoEscolhas(escolhas);
        return {
          ...p,
          chave,
          qty: qtd,
          escolhas,
          price_cents: preco,
          nomeCompleto: resumo ? `${p.name} (${resumo})` : p.name,
        };
      })
      .filter(Boolean);

  function totals() {
    const items = cartEntries();
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.price_cents * i.qty, 0);
    const feeCfg = Number(state.delivery.fee_cents || 0);
    const freeAbove = Number(state.delivery.free_above_cents || 0);
    const fee = freeAbove > 0 && subtotal >= freeAbove ? 0 : feeCfg;
    return { items, count, subtotal, fee, total: subtotal + fee, freeAbove };
  }


  /* Escurece uma cor hex (para o degradê do topo seguir a cor da loja) */
  function shade(hex, factor = 0.68) {
    const m = String(hex || '').replace('#', '');
    if (m.length !== 6) return hex;
    const n = parseInt(m, 16);
    const r = Math.round(((n >> 16) & 255) * factor);
    const g = Math.round(((n >> 8) & 255) * factor);
    const b = Math.round((n & 255) * factor);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /* ------------------------------- render menu ------------------------------ */
  function applyBusiness() {
    const b = state.business;
    // Cores da marca (cada loja pode ter as suas, definidas no painel)
    if (b.theme_color) {
      document.documentElement.style.setProperty('--green', b.theme_color);
      document.documentElement.style.setProperty('--green-dark', shade(b.theme_color, 0.62));
    }
    if (b.accent_color) document.documentElement.style.setProperty('--gold', b.accent_color);
    document.title = `${b.name || 'Cardápio'} · ${state.segment === 'catalogo' ? 'Catálogo digital' : 'Cardápio digital'}`;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', b.about || `${b.name || ''} — pedidos pelo WhatsApp.`);
    el('brandName').textContent = b.name || 'Cardápio';
    const isCatalog = state.segment === 'catalogo';
    const doces = (b.ramo || '') === 'doces'; // confeitaria fala diferente de marmita
    el('brandSub').textContent = b.tagline || (isCatalog ? 'Catálogo digital' : doces ? 'Cardápio digital' : 'Marmitas caseiras');
    el('heroTitle').textContent = b.name || 'Cardápio';
    el('heroTagline').textContent = b.tagline || '';
    // Textos neutros para catálogos (perfumes, presentes…)
    const listTitle = el('menuTitle');
    if (listTitle) listTitle.textContent = isCatalog ? 'Nosso catálogo' : 'Cardápio de hoje';
    el('footerName').textContent = b.name || '';
    el('footerAddr').textContent = b.address || '';
    if (b.logo_url) {
      el('brandLogo').innerHTML = `<img src="${esc(b.logo_url)}" alt="">`;
      el('brandLogo').classList.add('has-img');
    }
    // O topo do cardápio/catálogo NÃO usa foto de capa: fica só o logotipo
    // da loja (na barra de cima) e o quadro com nome/avisos, sem imagem.
    const hero = el('heroCard');
    const antiga = hero.querySelector('.hero-img');
    if (antiga) antiga.remove();
    // Marca d'água com o logotipo da própria loja (canto do quadro escuro)
    const marca = el('heroWatermark');
    if (marca) {
      const fonteMarca = b.watermark_url || b.logo_url;
      if (fonteMarca) {
        // imagem do logotipo do jeito que ela é, grande, atrás do texto
        marca.src = fonteMarca;
        marca.hidden = false;
      } else {
        marca.hidden = true;
        marca.removeAttribute('src');
      }
    }
    // No lugar da foto de capa, aparece o logotipo da loja
    const heroLogo = el('heroLogo');
    if (heroLogo) {
      if (b.logo_url) {
        heroLogo.src = b.logo_url;
        heroLogo.hidden = false;
      } else {
        heroLogo.hidden = true;
      }
    }
    el('heroBadge').textContent = !state.accepting
      ? 'Pedidos fechados agora'
      : state.delivery.periods?.length
      ? `Entregas a partir das ${state.delivery.periods[0].label.split(' ')[0]}`
      : state.segment === 'catalogo' ? 'Pedidos abertos' : 'Aberto hoje';
    document.querySelector('.hero-badge .dot').style.background = state.accepting ? '#6ee7a8' : '#ffb4a3';
    const box = el('closedBanner');
    if (box) {
      box.hidden = state.accepting;
      if (!state.accepting) {
        box.innerHTML = `<strong>Estamos fechados para novos pedidos.</strong><span>${esc(
          state.closedMessage || 'Volte em breve!'
        )}</span>`;
      }
    }

    const chips = [];
    if (state.delivery.fee_cents > 0) chips.push(`Entrega ${brl.format(state.delivery.fee_cents / 100)}`);
    else chips.push('Entrega grátis');
    if (state.delivery.periods?.length) {
      const n = state.delivery.periods.length;
      chips.push(n === 1 ? '1 horário' : `${n} horários`);
    }
    if (state.payments?.length) chips.push(state.payments.map((p) => p.label).join(' · '));
    el('heroChips').innerHTML = chips.map((c) => `<span class="chip-glass">${esc(c)}</span>`).join('');

    // chamada curta definida pela loja (ex.: "Encomendas até as 16h")
    const chamada = (b.hero_chamada || '').trim();
    const elChamada = el('heroChamada');
    if (elChamada) {
      elChamada.hidden = !chamada;
      elChamada.textContent = chamada;
    }
    const note = state.delivery.periods_note;
    el('heroNote').hidden = !note;
    el('heroNote').innerHTML = note
      ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg> ${esc(note)}`
      : '';
  }

  function renderCategories() {
    const cats = ['TODOS', ...state.menu.categories];
    const nav = el('cats');
    nav.hidden = cats.length <= 2;
    el('catsScroll').innerHTML = cats
      .map(
        (c) =>
          `<button class="cat ${state.category === c ? 'active' : ''}" data-cat="${esc(c)}">${
            c === 'TODOS' ? 'Ver tudo' : esc(c)
          }</button>`
      )
      .join('');
    el('catsScroll')
      .querySelectorAll('[data-cat]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          state.category = b.dataset.cat;
          renderCategories();
          renderProducts();
        })
      );
  }

  /**
   * Link de campanha: /l/<loja>?cat=Perfumes%20femininos
   * (também aceita ?secao= e ?categoria=, e atalhos como ?cat=femininos)
   * Abre a loja já filtrada na seção e mostra de onde a pessoa veio.
   */
  function normalizaTexto(t) {
    return String(t || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function acharCategoria(alvo) {
    const cats = (state.menu && state.menu.categories) || [];
    const n = normalizaTexto(alvo);
    if (!n) return null;
    return (
      cats.find((c) => normalizaTexto(c) === n) ||
      cats.find((c) => normalizaTexto(c).includes(n)) ||
      cats.find((c) => n.includes(normalizaTexto(c))) ||
      null
    );
  }

  function aplicarSessaoDoLink() {
    let qs;
    try {
      qs = new URLSearchParams(location.search);
    } catch {
      return;
    }
    const alvo = qs.get('cat') || qs.get('secao') || qs.get('categoria');
    if (!alvo) return;
    const cat = acharCategoria(alvo);
    if (!cat) return;
    state.category = cat;
    renderCategories();
    renderProducts();

    // faixa avisando qual seção está aberta (e como ver tudo)
    const nav = el('cats');
    if (nav && nav.parentNode && !el('sessaoAviso')) {
      const faixa = document.createElement('div');
      faixa.id = 'sessaoAviso';
      faixa.style.cssText =
        'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 2px;' +
        'padding:9px 12px;border-radius:999px;background:rgba(0,0,0,.05);font-size:13px';
      faixa.innerHTML =
        `Você está vendo <strong>${esc(cat)}</strong>` +
        ` <button class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:12px" id="verTudoSessao">Ver tudo</button>`;
      nav.parentNode.insertBefore(faixa, nav.nextSibling);
      const bt = el('verTudoSessao');
      if (bt)
        bt.addEventListener('click', () => {
          state.category = 'TODOS';
          renderCategories();
          renderProducts();
          faixa.remove();
        });
    }
    // leva a pessoa direto na vitrine
    setTimeout(() => {
      const alvoRolagem = el('cats') || el('grid');
      if (alvoRolagem && alvoRolagem.scrollIntoView) {
        alvoRolagem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 350);
  }

  const PLACEHOLDER = `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M3 9.5h18"/></svg>`;

  function renderProducts() {
    const grid = el('grid');
    const list =
      state.category === 'TODOS' ? state.products : state.products.filter((p) => p.category === state.category);

    el('countLabel').textContent = list.length ? `${list.length} ${list.length === 1 ? 'item' : 'itens'}` : '';

    if (!list.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>
        <p>Nenhum item disponível nesta categoria agora.</p>
      </div>`;
      return;
    }

    grid.innerHTML = list
      .map((p) => {
        const qty = qtdNoCarrinho(p.id);
        const temMontagem = !!(p.opcoes && p.opcoes.ativo && (p.opcoes.sabores || []).length);
        const action = temMontagem
          ? `<div class="montar-wrap">
               ${qty ? `<div class="montar-badge">${qty} no carrinho</div>` : ''}
               <button class="add-btn montar-btn" data-montar="${p.id}">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                 ${qty
                   ? 'Montar outro'
                   : p.opcoes.modo === 'sabores'
                     ? Number(p.opcoes.unidades) === 1
                       ? 'Escolher 1 sabor'
                       : `Escolher sabores${p.opcoes.unidades ? ` (até ${p.opcoes.unidades})` : ''}`
                     : 'Escolher sabores'}
               </button>
             </div>`
          : qty
          ? `<div class="stepper" data-stepper="${p.id}">
               <button data-dec="${p.id}" aria-label="Remover um">−</button>
               <span class="qty">${qty}</span>
               <button data-inc="${p.id}" aria-label="Adicionar um">+</button>
             </div>`
          : `<button class="add-btn" data-inc="${p.id}">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
               Adicionar
             </button>`;
        const waBtn =
          state.segment === 'catalogo' && state.business.whatsapp
            ? `<a class="wa-item" href="https://wa.me/${esc(state.business.whatsapp)}?text=${encodeURIComponent(
                `Olá! Tenho interesse neste item do catálogo: ${p.name} — ${brl.format(p.price_cents / 100)}`
              )}" target="_blank" rel="noopener">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.2 1.1-1.7 1.1-.5.1-1 .1-1.7-.1-1.6-.5-3.5-1.6-4.9-3.3-.9-1-1.5-2.2-1.5-3.1 0-.6.3-1.2.6-1.5.2-.2.4-.2.6-.2h.4c.2 0 .3 0 .5.4l.6 1.5c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3-.1.5.3.6.9 1.3 1.6 1.8.6.4 1 .5 1.2.6.2.1.4 0 .5-.1l.6-.7c.1-.2.3-.2.5-.1l1.4.7c.2.1.4.2.4.3.1.2.1.5-.1.9Z"/></svg>
                 Pedir este no WhatsApp
               </a>`
            : '';
        return `<article class="card">
          <div class="card-media${p.image_url ? '' : ' sem-foto'}">
            ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : `<div class="placeholder">${PLACEHOLDER}</div>`}
            ${p.category ? `<span class="card-tag">${esc(p.category)}</span>` : ''}
          </div>
          <div class="card-body">
            <h3>${esc(p.name)}</h3>
            <p class="desc">${esc(p.description || '')}</p>
            <div class="card-foot">
              <div class="price">${brl.format(p.price_cents / 100)}</div>
              ${action}
            </div>
            ${waBtn}
          </div>
        </article>`;
      })
      .join('');

    grid.querySelectorAll('.card-media img').forEach((img) =>
      img.addEventListener('click', () => abrirFoto(img.getAttribute('src'), img.getAttribute('alt') || ''))
    );

    grid.querySelectorAll('[data-montar]').forEach((b) =>
      b.addEventListener('click', () => abrirMontagem(b.dataset.montar))
    );
    grid.querySelectorAll('[data-inc]').forEach((b) =>
      b.addEventListener('click', () => changeQty(b.dataset.inc, 1))
    );
    grid.querySelectorAll('[data-dec]').forEach((b) =>
      b.addEventListener('click', () => changeQty(b.dataset.dec, -1))
    );
  }

  /** Mostra a foto inteira, em tela cheia (nada cortado). */
  function abrirFoto(src, nome) {
    if (!src) return;
    let lb = document.getElementById('fotoLb');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'fotoLb';
      lb.className = 'foto-lb';
      lb.innerHTML =
        '<div class="lb-topo"><span class="lb-nome"></span>' +
        '<button type="button" class="lb-x" aria-label="Fechar">✕</button></div>' +
        '<img alt="">' +
        '<div class="lb-dica">Toque fora da foto para fechar</div>';
      document.body.appendChild(lb);
      const fechar = () => lb.classList.remove('open');
      lb.querySelector('.lb-x').addEventListener('click', fechar);
      lb.addEventListener('click', (ev) => {
        if (ev.target === lb || ev.target.classList.contains('lb-dica')) fechar();
      });
      document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') fechar();
      });
    }
    lb.querySelector('.lb-nome').textContent = nome;
    lb.querySelector('img').src = src;
    lb.querySelector('img').alt = nome;
    lb.classList.add('open');
  }

  /** Quantas unidades desse produto já estão no carrinho (somando montagens). */
  function qtdNoCarrinho(produtoId) {
    return Object.entries(state.cart).reduce((soma, [chave, valor]) => {
      if (String(chave).split('#')[0] !== String(produtoId)) return soma;
      const q = typeof valor === 'number' ? valor : Number(valor && valor.qty) || 0;
      return soma + q;
    }, 0);
  }

  /* --------------------- montagem (caixa de doces etc.) --------------------- */
  function abrirMontagem(produtoId) {
    const p = productById(produtoId);
    if (!p || !p.opcoes) return;
    state.montando = { produto_id: String(produtoId), qtd: {} };
    state.view = 'montar';
    openDrawer('montar');
  }

  function renderMontar(body, foot) {
    const p = productById((state.montando || {}).produto_id);
    if (!p) {
      state.view = 'cart';
      return renderDrawer();
    }
    const op = p.opcoes || {};
    const sabores = (op.sabores || []).filter((s) => s.ativo !== false);
    const precisa = Number(op.unidades) || 1;
    // barra: conta sabores diferentes; caixa: soma as unidades
    const porSabores = op.modo === 'sabores';
    const escolhidas = porSabores
      ? sabores.filter((sb) => Number(state.montando.qtd[sb.nome]) > 0).length
      : sabores.reduce((s, sb) => s + (Number(state.montando.qtd[sb.nome]) || 0), 0);
    const extras = sabores.reduce(
      (s, sb) => s + (Number(state.montando.qtd[sb.nome]) || 0) * Number(sb.extra_cents || 0),
      0
    );
    const preco = Number(p.price_cents || 0) + extras;
    const minimo = porSabores ? Math.min(Math.max(1, Number(op.minimo) || 2), precisa) : precisa;
    const falta = porSabores ? Math.max(0, minimo - escolhidas) : Math.max(0, precisa - escolhidas);
    const sobrando = porSabores ? Math.max(0, precisa - escolhidas) : 0;

    body.innerHTML = `
      ${p.image_url ? `<img class="montar-img" src="${esc(p.image_url)}" alt="">` : ''}
      <div class="montar-head">
        <div class="montar-titulo">${esc(p.name)}</div>
        <div class="montar-sub">${esc(op.titulo || 'Escolha os sabores')} · ${
          porSabores
            ? `${Number(op.barras) > 1 ? `${Number(op.barras)} barras · ` : ''}${
                precisa === 1 ? 'escolha 1 sabor' : `escolha até ${precisa} sabores`
              }`
            : `${precisa} ${precisa === 1 ? 'unidade' : 'unidades'}`
        }</div>
      </div>
      <div class="montar-lista">
        ${sabores
          .map((sb) => {
            const n = Number(state.montando.qtd[sb.nome]) || 0;
            const extra = Number(sb.extra_cents || 0);
            if (porSabores) {
              return `<div class="montar-item ${n ? 'on' : ''}">
                <div class="mi-txt">
                  <span class="mi-nome">${esc(sb.nome)}</span>
                  ${extra ? `<span class="mi-extra">+ ${brl.format(extra / 100)}</span>` : ''}
                </div>
                <div class="mi-acao">
                  ${
                    n
                      ? `<button class="mi-chip on" data-montar-dec="${esc(sb.nome)}" aria-label="Tirar este sabor">✓ escolhido</button>`
                      : `<button class="mi-chip" data-montar-inc="${esc(sb.nome)}" aria-label="Escolher este sabor" ${escolhidas >= precisa ? 'disabled' : ''}>escolher</button>`
                  }
                </div>
              </div>`;
            }
            return `<div class="montar-item ${n ? 'on' : ''}">
              <div class="mi-txt">
                <span class="mi-nome">${esc(sb.nome)}</span>
                ${extra ? `<span class="mi-extra">+ ${brl.format(extra / 100)} por unidade</span>` : ''}
              </div>
              <div class="stepper">
                <button data-montar-dec="${esc(sb.nome)}" aria-label="Menos um" ${n ? '' : 'disabled'}>−</button>
                <span class="qty">${n}</span>
                <button data-montar-inc="${esc(sb.nome)}" aria-label="Mais um" ${escolhidas >= precisa ? 'disabled' : ''}>+</button>
              </div>
            </div>`;
          })
          .join('')}
      </div>
      <div class="montar-contador ${falta ? '' : 'ok'}">
        ${
          porSabores
            ? falta
              ? `Escolha mais <strong>${falta}</strong> ${falta === 1 ? 'sabor' : 'sabores'} · ${escolhidas} de até ${precisa}`
              : `Tudo certo: <strong>${escolhidas} ${escolhidas === 1 ? 'sabor escolhido' : 'sabores escolhidos'}</strong>${sobrando ? ` · pode escolher mais ${sobrando}` : ''}`
            : falta
            ? `Escolha mais <strong>${falta}</strong> ${falta === 1 ? 'unidade' : 'unidades'} · ${escolhidas} de ${precisa}`
            : `Tudo certo: <strong>${precisa} ${precisa === 1 ? 'unidade escolhida' : 'unidades escolhidas'}</strong>`
        }
      </div>`;

    foot.innerHTML = `
      <button class="btn btn-primary btn-block" id="montarAdd" ${falta ? 'disabled' : ''}>
        Adicionar ao carrinho · ${brl.format(preco / 100)}
      </button>
      <button class="btn btn-ghost btn-block" id="montarVoltar" style="margin-top:8px">Voltar aos produtos</button>`;

    body.querySelectorAll('[data-montar-inc]').forEach((b) =>
      b.addEventListener('click', () => {
        const nome = b.dataset.montarInc;
        const atual = Number(state.montando.qtd[nome]) || 0;
        if (porSabores) {
          if (escolhidas >= precisa) {
            return toast(
              precisa === 1 ? 'Essa barra leva 1 sabor só. Toque no sabor escolhido para trocar.' : `Essa barra leva no máximo ${precisa} sabores.`,
              'err'
            );
          }
          state.montando.qtd[nome] = 1;
        } else {
          if (escolhidas >= precisa) return toast(`Essa caixa tem ${precisa} unidades.`, 'err');
          state.montando.qtd[nome] = atual + 1;
        }
        renderDrawer();
      })
    );
    body.querySelectorAll('[data-montar-dec]').forEach((b) =>
      b.addEventListener('click', () => {
        const nome = b.dataset.montarDec;
        const atual = Number(state.montando.qtd[nome]) || 0;
        if (atual <= 0) return;
        state.montando.qtd[nome] = atual - 1;
        renderDrawer();
      })
    );

    el('montarVoltar').addEventListener('click', () => {
      state.view = 'cart';
      closeDrawer();
    });

    el('montarAdd').addEventListener('click', () => {
      const escolhas = sabores
        .map((sb) => ({ nome: sb.nome, qtd: Number(state.montando.qtd[sb.nome]) || 0 }))
        .filter((e) => e.qtd > 0);
      const chave = chaveItem(p.id, escolhas);
      const valor = state.cart[chave];
      const atual = typeof valor === 'number' ? valor : Number(valor && valor.qty) || 0;
      state.cart[chave] = { qty: atual + 1, escolhas };
      saveCart();
      state.view = 'cart';
      state.montando = null;
      renderProducts();
      renderCartBar();
      renderDrawer();
      toast('Adicionado ao carrinho!', 'ok');
    });
  }

  function changeQty(chave, delta) {
    const valor = state.cart[chave];
    const atual = typeof valor === 'number' ? valor : Number(valor && valor.qty) || 0;
    const proximo = Math.max(0, Math.min(99, atual + delta));
    if (proximo === 0) delete state.cart[chave];
    else if (valor && typeof valor === 'object') state.cart[chave] = { ...valor, qty: proximo };
    else state.cart[chave] = proximo;
    saveCart();
    renderProducts();
    renderCartBar();
    if (state.view === 'cart' && el('drawer').classList.contains('open')) renderDrawer();
  }

  function renderCartBar() {
    const t = totals();
    const bar = el('cartBar');
    el('headerCount').hidden = t.count === 0;
    el('headerCount').textContent = t.count;
    bar.classList.toggle('show', t.count > 0);
    el('cartBarCount').textContent = `${t.count} ${t.count === 1 ? 'item' : 'itens'} · ${brl.format(t.subtotal / 100)}`;
    el('cartBarTotal').textContent = brl.format(t.total / 100);
  }

  /* --------------------------------- drawer -------------------------------- */
  function openDrawer(view = 'cart') {
    state.view = view;
    el('drawer').classList.add('open');
    el('drawerBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
    renderDrawer();
  }
  function closeDrawer() {
    el('drawer').classList.remove('open');
    el('drawerBackdrop').classList.remove('open');
    document.body.style.overflow = '';
  }

  function renderDrawer() {
    const body = el('drawerBody');
    const foot = el('drawerFoot');
    body.scrollTop = 0;
    el('drawerTitle').textContent =
      state.view === 'checkout'
        ? 'Finalizar pedido'
        : state.view === 'success'
        ? 'Pedido enviado'
        : state.view === 'montar'
        ? ((state.montando && (productById(state.montando.produto_id) || {}).opcoes || {}).modo === 'sabores'
            ? 'Escolha os sabores'
            : 'Monte sua caixa')
        : 'Seu carrinho';

    if (state.view === 'success') return renderSuccess(body, foot);
    if (state.view === 'checkout') return renderCheckout(body, foot);
    if (state.view === 'montar') return renderMontar(body, foot);

    /* ---- carrinho ---- */
    const t = totals();
    if (!t.items.length) {
      body.innerHTML = `<div class="empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.5l2.3 12.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 7H6"/></svg>
        <p>Seu carrinho está vazio.</p>
        <p style="font-size:13px;margin-top:6px">${state.segment === 'catalogo' ? 'Escolha um produto no catálogo para começar.' : (state.business.ramo === 'doces' ? 'Escolha um item do cardápio para começar.' : 'Escolha uma marmita no cardápio para começar.')}</p>
      </div>`;
      foot.innerHTML = `<button class="btn btn-ghost btn-block" data-close>${
        state.segment === 'catalogo' ? 'Voltar ao catálogo' : 'Voltar ao cardápio'
      }</button>`;
      return bindFootClose();
    }

    body.innerHTML =
      t.items
        .map(
          (i) => `<div class="cart-item">
        ${i.image_url ? `<img class="cart-thumb" src="${esc(i.image_url)}" alt="">` : `<div class="cart-thumb"></div>`}
        <div class="ci-main">
          <div class="ci-name">${esc(i.name)}</div>
          ${i.escolhas ? `<div class="ci-sabores">${esc(resumoEscolhas(i.escolhas))}</div>` : ''}
          <div class="ci-price">${brl.format(i.price_cents / 100)} cada</div>
          <div style="margin-top:6px">
            <div class="stepper">
              <button data-dec="${esc(i.chave)}" aria-label="Remover um">−</button>
              <span class="qty">${i.qty}</span>
              <button data-inc="${esc(i.chave)}" aria-label="Adicionar um">+</button>
            </div>
          </div>
        </div>
        <div class="ci-right">
          <div class="ci-total">${brl.format((i.price_cents * i.qty) / 100)}</div>
          <button class="remove-x" data-remove="${esc(i.chave)}">remover</button>
        </div>
      </div>`
        )
        .join('') +
      `<div style="margin-top:16px">
        <div class="summary-line"><span>Subtotal</span><span>${brl.format(t.subtotal / 100)}</span></div>
        <div class="summary-line"><span>Entrega</span><span>${t.fee ? brl.format(t.fee / 100) : 'Grátis'}</span></div>
        <div class="summary-line total"><span>Total</span><span>${brl.format(t.total / 100)}</span></div>
        ${freeRemainingHtml(t)}
      </div>`;

    foot.innerHTML = !state.accepting
      ? `<div class="closed-note">${esc(state.closedMessage || 'Estamos fechados para novos pedidos agora.')}</div>
         <button class="btn btn-ghost btn-block" disabled>Pedidos fechados</button>`
      : `<button class="btn btn-primary btn-block" data-go-checkout>
      Continuar · ${brl.format(t.total / 100)}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </button>`;

    if (el('submitOrder')) {} // noop
    body.querySelectorAll('[data-inc]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.inc, 1)));
    body.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', () => changeQty(b.dataset.dec, -1)));
    body.querySelectorAll('[data-remove]').forEach((b) =>
      b.addEventListener('click', () => {
        delete state.cart[b.dataset.remove];
        saveCart();
        renderProducts();
        renderCartBar();
        renderDrawer();
      })
    );
    const goBtn = foot.querySelector('[data-go-checkout]');
    if (goBtn) goBtn.addEventListener('click', () => {
      state.view = 'checkout';
      renderDrawer();
    });
  }

  function bindFootClose() {
    el('drawerFoot')
      .querySelectorAll('[data-close]')
      .forEach((b) => b.addEventListener('click', closeDrawer));
  }

  function freeRemainingHtml(t) {
    if (!t.freeAbove) return '';
    if (t.subtotal >= t.freeAbove) return `<div class="free-hint">🎉 Você ganhou entrega grátis!</div>`;
    const falta = (t.freeAbove - t.subtotal) / 100;
    return `<div class="free-hint">Faltam ${brl.format(falta)} para ganhar entrega grátis.</div>`;
  }

  /* -------------------------------- checkout ------------------------------- */
  function renderCheckout(body, foot) {
    const t = totals();
    if (!t.items.length) {
      state.view = 'cart';
      return renderDrawer();
    }
    const d = state.delivery;
    const saved = JSON.parse(localStorage.getItem(CUSTOMER_KEY) || '{}');

    body.innerHTML = `
      <div class="steps"><div class="step-dot on"></div><div class="step-dot on"></div><div class="step-dot on"></div></div>

      <form id="checkoutForm" novalidate>
        <div class="form-block">
          <h4>Seus dados</h4>
          <div class="field">
            <label for="fName">Nome completo *</label>
            <input class="input" id="fName" name="customer_name" autocomplete="name" placeholder="Ex.: João Silva" value="${esc(saved.customer_name || '')}">
          </div>
          <div class="field">
            <label for="fPhone">WhatsApp / telefone *</label>
            <input class="input" id="fPhone" name="phone" inputmode="numeric" autocomplete="tel" placeholder="(48) 99999-9999" value="${esc(saved.phone || '')}">
          </div>
        </div>

        ${
          d.pickup_enabled
            ? `<div class="form-block">
                <h4>Como quer receber</h4>
                <div class="seg">
                  <label><input type="radio" name="fulfillment" value="delivery" checked><span>🛵 Entrega</span></label>
                  <label><input type="radio" name="fulfillment" value="pickup"><span>🏠 Retirada</span></label>
                </div>
              </div>`
            : `<input type="hidden" name="fulfillment" value="delivery">`
        }

        <div class="form-block" id="addressBlock">
          <h4>Endereço de entrega</h4>
          <div class="field">
            <label for="fAddress">Rua e número *</label>
            <input class="input" id="fAddress" name="address" autocomplete="street-address" placeholder="Ex.: Rua das Palmeiras, 120" value="${esc(saved.address || '')}">
          </div>
          <div class="row two">
            <div class="field">
              <label for="fNeighborhood">Bairro</label>
              <input class="input" id="fNeighborhood" name="neighborhood" placeholder="Ex.: Centro" value="${esc(saved.neighborhood || '')}">
            </div>
            <div class="field">
              <label for="fComplement">Complemento</label>
              <input class="input" id="fComplement" name="complement" placeholder="Apto, bloco, referência" value="${esc(saved.complement || '')}">
            </div>
          </div>
        </div>

        <div class="form-block">
          <h4>Horário</h4>
          ${
            d.periods.length
              ? `<div class="pay-list">
                  ${d.periods
                    .map(
                      (p, i) => `<label class="pay-opt">
                        <input type="radio" name="period" value="${esc(p.label)}" ${i === 0 ? 'checked' : ''}>
                        <span>${esc(p.label)}</span>
                      </label>`
                    )
                    .join('')}
                </div>
                ${d.periods_note ? `<div class="hint">${esc(d.periods_note)}</div>` : ''}`
              : state.segment === 'catalogo'
              ? `<div class="field"><label for="fPeriod">Quando prefere receber? (opcional)</label>
                 <input class="input" id="fPeriod" name="period" placeholder="Ex.: esta semana, dia 10 pela manhã…"></div>`
              : `<div class="field"><label for="fPeriod">Horário desejado *</label>
                 <input class="input" id="fPeriod" name="period" placeholder="Ex.: 12h00"></div>`
          }
        </div>

        <div class="form-block">
          <h4>Forma de pagamento</h4>
          ${
            state.payments.length
              ? `<div class="pay-list">
                  ${state.payments
                    .map((p, i) => {
                      const tipo = tipoPagamento(p);
                      const icone = tipo === 'pix' ? '⚡' : tipo === 'dinheiro' ? '💵' : tipo === 'cartao' ? '💳' : '💰';
                      return `<label class="pay-opt">
                        <input type="radio" name="payment_method" value="${esc(p.label)}" data-pay-id="${esc(p.id)}" ${i === 0 ? 'checked' : ''}>
                        <span>${icone} ${esc(p.label)}${notaPagamento(p)}</span>
                      </label>`;
                    })
                    .join('')}
                </div>`
              : `<div class="field"><label for="fPay">Forma de pagamento *</label>
                 <input class="input" id="fPay" name="payment_method" placeholder="Ex.: Pix"></div>`
          }
        </div>

        <div class="form-block" id="payInfoBlock" hidden>
          <h4>Pagamento</h4>
          <div id="payInfo"></div>
        </div>

        <div class="form-block">
          <h4>Observações</h4>
          <textarea class="textarea" name="notes" id="fNotes" placeholder="Ex.: sem cebola, troco para R$ 100, entregar na portaria"></textarea>
        </div>

        <div class="form-block">
          <h4>Resumo</h4>
          ${t.items
            .map(
              (i) =>
                `<div class="summary-line"><span>${i.qty}× ${esc(i.name)}</span><span>${brl.format(
                  (i.price_cents * i.qty) / 100
                )}</span></div>`
            )
            .join('')}
          <div class="summary-line"><span>Subtotal</span><span>${brl.format(t.subtotal / 100)}</span></div>
          <div class="summary-line" id="feeLine"><span>Taxa de entrega</span><span>${t.fee ? brl.format(t.fee / 100) : 'Grátis'}</span></div>
          <div class="summary-line total" id="totalLine"><span>Total</span><span>${brl.format(t.total / 100)}</span></div>
          ${freeRemainingHtml(t)}
        </div>
      </form>`;

    foot.innerHTML = !state.accepting
      ? `<div class="closed-note">${esc(state.closedMessage || 'Estamos fechados para novos pedidos agora.')}</div>
         <button class="btn btn-ghost btn-block" disabled>Pedidos fechados</button>`
      : `<button class="btn btn-primary btn-block" id="submitOrder">
      <span id="submitLabel">Enviar pedido no WhatsApp</span>
      <svg id="submitIcon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.44-.72-2.9-1.15-4.72-4.15-4.86-4.34-.14-.19-1.14-1.52-1.14-2.9 0-1.38.72-2.06.98-2.34.26-.29.56-.36.75-.36.19 0 .38 0 .55.01.17.01.43-.07.67.51.24.58.82 2 .89 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.29-.12.58.17.29.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.44.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.65-.14.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.7-.17 1.38Z"/></svg>
    </button>`;

    // máscara de telefone
    const phone = el('fPhone');
    phone.addEventListener('input', () => {
      let v = phone.value.replace(/\D/g, '').slice(0, 11);
      if (v.length > 6) v = `(${v.slice(0, 2)}) ${v.slice(2, v.length - 4)}-${v.slice(-4)}`;
      else if (v.length > 2) v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
      phone.value = v;
    });

    // informações/opções do pagamento escolhido
    const payInfoBlock = el('payInfoBlock');
    const payInfo = el('payInfo');

    function atualizarTroco() {
      const campo = el('trocoValor');
      const calcBox = el('trocoCalc');
      if (!campo) return;
      const valor = Number((campo.value || '').replace(/\./g, '').replace(',', '.'));
      const t = totals().total;
      if (!valor) {
        calcBox.textContent = `Total do pedido: ${brl.format(t / 100)}`;
        return;
      }
      const troco = Math.round(valor * 100) - t;
      calcBox.innerHTML = troco > 0
        ? `Total: <strong>${brl.format(t / 100)}</strong> · Troco: <strong>${brl.format(troco / 100)}</strong>`
        : troco === 0
        ? 'Valor exato, não precisa de troco.'
        : 'O valor é menor que o total do pedido.';
    }

    const renderPayInfo = () => {
      const pay = pagamentoEscolhido();
      if (!pay) {
        payInfoBlock.hidden = true;
        payInfo.innerHTML = '';
        return;
      }
      const html = extrasPagamento(pay, totals().total);
      payInfoBlock.hidden = !html;
      payInfo.innerHTML = html;
      ligarFormCartao();

      // o botão principal muda quando o pagamento é no cartão online
      const rotulo = el('submitLabel');
      if (rotulo) {
        const online = ehCartaoOnline(pay) && (state.mpCartao || {}).disponivel;
        rotulo.textContent = online
          ? `Pagar ${brl.format(totals().total / 100)} com cartão`
          : 'Enviar pedido no WhatsApp';
        if (el('submitIcon')) el('submitIcon').style.display = online ? 'none' : '';
      }

      const cp = el('copyPix');
      if (cp) cp.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(pay.key); toast('Chave Pix copiada!', 'ok'); }
        catch { toast('Selecione e copie a chave: ' + pay.key); }
      });

      const sim = body.querySelector('input[name="troco_tipo"][value="sim"]');
      const nao = body.querySelector('input[name="troco_tipo"][value="nao"]');
      const box = el('trocoBox');
      const atualizarBox = () => { if (box) box.hidden = !(sim && sim.checked); };
      if (sim) sim.addEventListener('change', atualizarBox);
      if (nao) nao.addEventListener('change', atualizarBox);
      const campo = el('trocoValor');
      if (campo) {
        campo.addEventListener('input', atualizarTroco);
        atualizarTroco();
      }
    };
    body.querySelectorAll('input[name="payment_method"]').forEach((r) => r.addEventListener('change', renderPayInfo));
    renderPayInfo();

    // alternar entrega / retirada
    const addressBlock = el('addressBlock');
    body.querySelectorAll('input[name="fulfillment"]').forEach((r) =>
      r.addEventListener('change', () => {
        const pickup = body.querySelector('input[name="fulfillment"]:checked').value === 'pickup';
        addressBlock.hidden = pickup;
        const feeValue = pickup ? 0 : t.fee;
        el('feeLine').lastElementChild.textContent = feeValue ? brl.format(feeValue / 100) : 'Grátis';
        el('totalLine').lastElementChild.textContent = brl.format((t.subtotal + feeValue) / 100);
      })
    );

    if (el('submitOrder')) el('submitOrder').addEventListener('click', () => submitOrder(body));
  }


  /** Descobre o tipo de uma forma de pagamento pelo texto/id. */
  /** Forma de pagamento escolhida no checkout (funciona fora do drawer também). */
  function pagamentoEscolhido() {
    const form = el('checkoutForm');
    if (!form) return null;
    const chosen = form.querySelector('input[name="payment_method"]:checked');
    if (!chosen) return null;
    return state.payments.find((p) => p.id === chosen.dataset.payId || p.label === chosen.value) || null;
  }

  /** Texto pequeno embaixo do nome da forma de pagamento. */
  function notaPagamento(p) {
    if (ehCartaoOnline(p)) {
      const mp = state.mpCartao || {};
      if (mp.disponivel) return '<span class="pay-note">Cartão na hora, aprovado na hora.</span>';
      return '<span class="pay-note">Em ativação — escolha outra forma.</span>';
    }
    return p.instructions ? `<span class="pay-note">${esc(p.instructions)}</span>` : '';
  }

  /** "troco para R$ 100,00", "crédito na entrega", "—" etc. Vai junto do pedido. */
  function detalhePagamento() {
    const p = pagamentoEscolhido();
    const form = el('checkoutForm');
    if (!p || !form) return '';
    const tipo = tipoPagamento(p);
    if (tipo === 'dinheiro') {
      const sim = form.querySelector('input[name="troco_tipo"][value="sim"]');
      if (sim && sim.checked) {
        const campo = el('trocoValor');
        const bruto = campo ? (campo.value || '').trim() : '';
        const valor = Number(bruto.replace(/\./g, '').replace(',', '.'));
        if (!valor) return 'precisa de troco';
        const t = totals().total;
        const troco = Math.max(0, Math.round(valor * 100) - t);
        return `troco para ${brl.format(valor)}${troco > 0 ? ` (troco de ${brl.format(troco / 100)})` : ''}`;
      }
      return 'sem troco';
    }
    if (tipo === 'cartao' && ehCartaoOnline(p)) {
      const parcelas = el('mpParcelas');
      return `${(parcelas && parcelas.value) || 1}x cartão de crédito`;
    }
    if (tipo === 'cartao') {
      const c = form.querySelector('input[name="cartao_tipo"]:checked');
      if (!c) return '';
      return {
        credito_online: 'crédito — pagamento online',
        credito_local: 'crédito na entrega',
        debito_local: 'débito na entrega',
      }[c.value] || '';
    }
    return '';
  }

  function tipoPagamento(p) {
    const t = `${p.id || ''} ${p.label || ''}`.toLowerCase();
    if (t.includes('pix')) return 'pix';
    if (t.includes('dinheiro') || t.includes('especie') || t.includes('espécie')) return 'dinheiro';
    if (t.includes('cart')) return 'cartao';
    return 'outro';
  }

  /* --------------------- cartão de crédito online (Mercado Pago) --------------------- */
  /** A forma escolhida é a de cartão ONLINE (cobrança na hora)? */
  function ehCartaoOnline(p) {
    const t = `${(p && p.id) || ''} ${(p && p.label) || ''}`.toLowerCase();
    if (/pix|dinheiro|esp[eé]cie/.test(t)) return false;
    if (!/cart/.test(t)) return false;
    if (/entrega|retirada|maquininha|presencial/.test(t)) return false;
    return /online|na hora|agora|cr[eé]dito/.test(t) || (p && p.id === 'cartao_online');
  }

  const soDigitos = (v) => String(v || '').replace(/\D/g, '');

  /** Carrega o SDK do Mercado Pago (só quando o cliente escolhe cartão). */
  let mpSdkPromise = null;
  function carregarMPSdk(publicKey) {
    if (!publicKey) return Promise.reject(new Error('Pagamento online não configurado.'));
    if (window.MercadoPago) return Promise.resolve(new window.MercadoPago(publicKey, { locale: 'pt-BR' }));
    if (mpSdkPromise) return mpSdkPromise;
    mpSdkPromise = new Promise((resolve, reject) => {
      const sc = document.createElement('script');
      sc.src = 'https://sdk.mercadopago.com/js/v2';
      sc.async = true;
      sc.onload = () => {
        if (!window.MercadoPago) return reject(new Error('Não foi possível abrir o pagamento.'));
        resolve(new window.MercadoPago(publicKey, { locale: 'pt-BR' }));
      };
      sc.onerror = () => {
        mpSdkPromise = null;
        reject(new Error('Sem conexão com o Mercado Pago. Tente de novo.'));
      };
      document.head.appendChild(sc);
    });
    return mpSdkPromise;
  }

  /** Consulta as parcelas reais do cartão (já com juros, se houver). */
  async function carregarParcelas(numero, totalCents) {
    const sel = el('mpParcelas');
    if (!sel) return;
    const bin = soDigitos(numero).slice(0, 8);
    if (bin.length < 6) return;
    const mp = state.mpCartao || {};
    try {
      const sdk = await carregarMPSdk(mp.public_key);
      const metodos = await sdk.getPaymentMethods({ bin });
      const cartao = (metodos.results || [])[0];
      if (!cartao) return;
      const r = await sdk.getInstallments({
        amount: String((totalCents / 100).toFixed(2)),
        bin,
        paymentTypeId: 'credit_card',
      });
      const opcoes = (r && r[0] && r[0].payer_costs) || [];
      if (!opcoes.length) return;
      sel.innerHTML = opcoes
        .filter((o) => Number(o.installments) >= 1 && Number(o.installments) <= 12)
        .map((o) => {
          const n = Number(o.installments);
          const valor = Number(o.installment_amount || 0);
          const comJuros = Number(o.total_amount || 0) > Number(totalCents) / 100 + 0.001;
          const texto = valor
            ? `${n}x de ${brl.format(valor)}${comJuros && n > 1 ? ' c/ juros' : ''}`
            : o.recommended_message || `${n}x`;
          return `<option value="${n}">${esc(texto)}</option>`;
        })
        .join('');
    } catch (e) {
      /* sem internet ou cartão já reconhecido: fica só o à vista */
    }
  }

  /** Liga máscaras e busca de parcelas no formulário do cartão. */
  function ligarFormCartao() {
    const num = el('mpNumero');
    if (!num) return;
    const total = totals().total;

    num.addEventListener('input', () => {
      const v = soDigitos(num.value).slice(0, 16);
      num.value = v.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
      clearTimeout(num._t);
      num._t = setTimeout(() => carregarParcelas(num.value, total), 500);
    });

    const val = el('mpValidade');
    val.addEventListener('input', () => {
      const v = soDigitos(val.value).slice(0, 4);
      val.value = v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v;
    });

    const cpf = el('mpCpf');
    cpf.addEventListener('input', () => {
      const v = soDigitos(cpf.value).slice(0, 11);
      cpf.value = v
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    });

    const cvv = el('mpCvv');
    cvv.addEventListener('input', () => (cvv.value = soDigitos(cvv.value).slice(0, 4)));

    // link de emergência: página segura do Mercado Pago
    const linkSeguro = el('mpLinkSeguro');
    if (linkSeguro) linkSeguro.addEventListener('click', () => pagarNaPaginaSegura());

    // botão principal: pagar no Mercado Pago (crédito, débito ou Pix)
    const pagarAgora = el('mpPagarAgora');
    if (pagarAgora) pagarAgora.addEventListener('click', () => pagarNaPaginaSegura('mpPagarAgora'));

    // quem preferir digitar o cartão no site abre o formulário
    const verFormulario = el('mpVerFormulario');
    if (verFormulario)
      verFormulario.addEventListener('click', () => {
        const box = el('mpCardBox');
        if (box) {
          box.hidden = false;
          verFormulario.hidden = true;
          const primeiro = el('mpNumero');
          if (primeiro) primeiro.focus();
        }
      });
  }

  function problemasDoCartao() {
    const num = el('mpNumero');
    if (!num) return '';
    const marca = (id) => el(id) && el(id).classList.add('error');
    ['mpNumero', 'mpNome', 'mpValidade', 'mpCvv', 'mpCpf'].forEach((id) => el(id) && el(id).classList.remove('error'));

    const numero = soDigitos(num.value);
    if (numero.length < 13) return marca('mpNumero'), 'Confira o número do cartão.';
    if ((el('mpNome').value || '').trim().length < 3) return marca('mpNome'), 'Informe o nome impresso no cartão.';
    const validade = soDigitos(el('mpValidade').value);
    const mes = Number(validade.slice(0, 2));
    if (validade.length !== 4 || mes < 1 || mes > 12) return marca('mpValidade'), 'Confira a validade (MM/AA).';
    const cvv = soDigitos(el('mpCvv').value);
    if (cvv.length < 3) return marca('mpCvv'), 'Confira o código de segurança (CVV).';
    const cpf = soDigitos(el('mpCpf').value);
    if (cpf.length !== 11) return marca('mpCpf'), 'Informe o CPF do titular do cartão.';
    return '';
  }

  /** Troca os dados do cartão por um token seguro direto no Mercado Pago. */
  async function tokenizarCartao(paySel) {
    const mp = state.mpCartao || {};
    const sdk = await carregarMPSdk(mp.public_key);
    const numero = soDigitos(el('mpNumero').value);
    const validade = soDigitos(el('mpValidade').value);
    const cpf = soDigitos(el('mpCpf').value);
    const nome = (el('mpNome').value || '').trim();

    const token = await sdk.createCardToken({
      cardNumber: numero,
      cardholderName: nome,
      cardExpirationMonth: validade.slice(0, 2),
      cardExpirationYear: `20${validade.slice(2)}`,
      securityCode: soDigitos(el('mpCvv').value),
      identificationType: 'CPF',
      identificationNumber: cpf,
    });
    if (!token || !token.id) throw new Error('Não foi possível validar o cartão. Confira os dados.');

    let paymentMethodId = token.payment_method_id || '';
    let issuerId = '';
    try {
      const metodos = await sdk.getPaymentMethods({ bin: numero.slice(0, 8) });
      const cartao = (metodos.results || [])[0];
      if (cartao) {
        paymentMethodId = cartao.id || paymentMethodId;
        issuerId = cartao.issuer_id || '';
      }
    } catch (e) {
      /* segue com a bandeira que o token já trouxe */
    }
    if (!paymentMethodId) throw new Error('Bandeira do cartão não identificada.');

    return {
      token: token.id,
      payment_method_id: paymentMethodId,
      issuer_id: issuerId,
      installments: Number((el('mpParcelas') && el('mpParcelas').value) || 1),
      cpf,
      nome_titular: nome,
      email: (el('mpEmail') && el('mpEmail').value.trim()) || '',
      pay_label: (paySel && paySel.label) || 'Cartão de crédito (online)',
    };
  }

  /** Manda o cliente para a página segura do Mercado Pago (crédito/débito/Pix). */
  async function pagarNaPaginaSegura(qual) {
    const btn = el(qual || 'mpLinkSeguro');
    const formEl = el('checkoutForm');
    if (!formEl) return;
    const dados = new FormData(formEl);
    const nome = String(dados.get('customer_name') || '').trim();
    const tel = String(dados.get('phone') || '').replace(/\D/g, '');
    if (nome.length < 2 || tel.length < 10) {
      toast('Preencha nome e WhatsApp antes de pagar.', 'err');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Abrindo o Mercado Pago…'; }
    try {
      const payload = montarPayload(formEl);
      delete payload.cartao;
      const res = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      const link = await api(`/api/orders/${encodeURIComponent(res.order.code)}/link-pagamento`, { method: 'POST' });
      res.order.payment_url = link.url;
      state.lastOrder = res;
      state.cart = {};
      saveCart();
      state.view = 'success';
      renderProducts();
      renderCartBar();
      renderDrawer();
      if (link.url) window.open(link.url, '_blank');
    } catch (err) {
      toast(err.message || 'Não foi possível abrir o pagamento.', 'err');
      if (btn) {
        btn.disabled = false;
        btn.textContent = qual === 'mpPagarAgora' ? '💳 Pagar no Mercado Pago' : 'Prefiro pagar na página segura do Mercado Pago';
      }
    }
  }

  /** Bloco extra do checkout de acordo com a forma escolhida. */
  function extrasPagamento(p, totalCents) {
    const tipo = tipoPagamento(p);
    if (tipo === 'pix') {
      return p.key
        ? `<div class="pix-box">
             <div class="pix-label">Chave Pix</div>
             <div class="pix-key"><code id="pixKeyValue">${esc(p.key)}</code>
               <button type="button" class="btn btn-sm btn-ghost" id="copyPix">Copiar</button></div>
             <div class="hint">Pague e mande o comprovante no WhatsApp. O pedido já vai registrado.</div>
           </div>`
        : `<div class="hint">💬 A chave Pix será enviada no WhatsApp junto com a confirmação do pedido.</div>`;
    }

    if (tipo === 'dinheiro') {
      return `<div class="pay-sub">
        <div class="pay-sub-title">Precisa de troco?</div>
        <div class="pay-choice">
          <label class="pay-chip"><input type="radio" name="troco_tipo" value="nao" checked><span>Não preciso</span></label>
          <label class="pay-chip"><input type="radio" name="troco_tipo" value="sim"><span>Sim, preciso</span></label>
        </div>
        <div id="trocoBox" hidden>
          <div class="field" style="margin-top:10px">
            <label for="trocoValor">Troco para quanto?</label>
            <input class="input" id="trocoValor" inputmode="decimal" placeholder="Ex.: 100,00">
            <div class="hint" id="trocoCalc"></div>
          </div>
        </div>
      </div>`;
    }

    if (tipo === 'cartao' && ehCartaoOnline(p)) {
      const mp = state.mpCartao || {};
      if (!mp.disponivel && !mp.checkout) {
        return `<div class="pay-sub">
          <div class="hint">⏳ O pagamento com cartão <strong>online</strong> está <strong>em ativação</strong> nesta loja.
          Escolha <strong>Pix</strong>, <strong>dinheiro</strong> ou <strong>cartão na entrega</strong> — ou fale com a gente no WhatsApp.</div>
        </div>`;
      }
      // Sem formulário no site: o pagamento acontece na página do Mercado Pago.
      if (!mp.disponivel) {
        return `<div class="pay-sub">
          <div class="hint">💳 Ao finalizar, você vai para a <strong>página segura do Mercado Pago</strong> para
          pagar com <strong>crédito</strong>, <strong>débito</strong> ou <strong>Pix</strong>.</div>
        </div>`;
      }
      const umX = `1x de ${brl.format(totalCents / 100)} à vista`;
      return `<div class="pay-sub" id="mpCardBox" ${mp.checkout ? 'hidden' : ''}>
        <div class="pay-sub-title">Dados do cartão de crédito</div>
        <div class="card-form">
          <div class="field card-full">
            <label for="mpNumero">Número do cartão</label>
            <input class="input" id="mpNumero" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="19">
          </div>
          <div class="field card-full">
            <label for="mpNome">Nome impresso no cartão</label>
            <input class="input" id="mpNome" autocomplete="cc-name" placeholder="Como está escrito no cartão" maxlength="60">
          </div>
          <div class="field">
            <label for="mpValidade">Validade</label>
            <input class="input" id="mpValidade" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5">
          </div>
          <div class="field">
            <label for="mpCvv">CVV</label>
            <input class="input" id="mpCvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4">
          </div>
          <div class="field">
            <label for="mpCpf">CPF do titular</label>
            <input class="input" id="mpCpf" inputmode="numeric" placeholder="000.000.000-00" maxlength="14">
          </div>
          <div class="field">
            <label for="mpParcelas">Parcelas</label>
            <select class="input" id="mpParcelas"><option value="1">${umX}</option></select>
          </div>
          <div class="field card-full">
            <label for="mpEmail">E-mail (opcional)</label>
            <input class="input" id="mpEmail" type="email" autocomplete="email" placeholder="para receber o comprovante">
          </div>
        </div>
        <div class="hint" style="margin-top:10px">🔒 Pagamento processado pelo <strong>Mercado Pago</strong>. O número do cartão não passa pelo servidor da loja.</div>
        <button type="button" class="btn btn-ghost btn-block" id="mpLinkSeguro" style="margin-top:8px;font-size:13px">
          Prefiro pagar na página segura do Mercado Pago
        </button>
      </div>`;
    }

    // Loja que escolheu "somente pagamento online": um botão só, sem as outras opções
    if (tipo === 'cartao' && state.checkoutModo === 'online') {
      const mp = state.mpCartao || {};
      return `<div class="pay-sub">
        <div class="pay-sub-title">Pagamento online</div>
        <div class="hint" style="margin:0 0 10px">
          Você paga na página segura e escolhe <strong>Pix</strong>, <strong>boleto</strong> ou
          <strong>cartão (crédito/débito)</strong>.
        </div>
        <button type="button" class="btn btn-gold btn-block" id="mpPagarAgora">
          💳 Ir para o pagamento
        </button>
      </div>`;
    }

    if (tipo === 'cartao') {
      const aceitaCredito = p.aceita_credito !== false;
      const aceitaDebito = p.aceita_debito !== false;
      const mp = state.mpCartao || {};
      const noMercadoPago = !!mp.checkout; // loja tem Mercado Pago configurado
      const noSite = !!mp.disponivel; // dá para digitar o cartão aqui

      // 1) caminho principal: pagar na página do Mercado Pago (crédito, débito virtual ou Pix)
      const blocoMP = noMercadoPago
        ? `<div class="pay-sub">
             <div class="pay-sub-title">Pagar com cartão</div>
             <div class="hint" style="margin:0 0 10px">
               Você escolhe <strong>crédito</strong>, <strong>débito</strong> (Débito Virtual CAIXA)
               ou <strong>Pix</strong> na página segura do Mercado Pago — igual comprar no Mercado Livre.
             </div>
             <button type="button" class="btn btn-gold btn-block" id="mpPagarAgora">
               💳 Pagar no Mercado Pago
             </button>
             ${
               noSite
                 ? `<button type="button" class="btn btn-ghost btn-block" id="mpVerFormulario" style="margin-top:8px;font-size:13px">
                      ou digitar o cartão aqui no site
                    </button>`
                 : ''
             }
           </div>`
        : '';

      // 2) cartão na entrega/retirada (maquininha) — sempre disponível
      const local = [];
      if (aceitaCredito) local.push(['credito_local', '💳 Crédito na entrega/retirada']);
      if (aceitaDebito) local.push(['debito_local', '💳 Débito na entrega/retirada']);
      if (!local.length && !noMercadoPago) local.push(['credito_local', '💳 Cartão na entrega']);

      const blocoLocal = local.length
        ? `<div class="pay-sub" ${noMercadoPago ? 'style="margin-top:14px"' : ''}>
             <div class="pay-sub-title">${noMercadoPago ? 'Ou pague na entrega' : 'Como você quer pagar?'}</div>
             <div class="pay-choice" style="flex-direction:column;align-items:stretch">
               ${local
                 .map(
                   ([v, t], i) =>
                     `<label class="pay-chip"><input type="radio" name="cartao_tipo" value="${v}" ${
                       !noMercadoPago && i === 0 ? 'checked' : ''
                     }><span>${t}</span></label>`
                 )
                 .join('')}
             </div>
             <div class="hint" style="margin-top:8px">O motoboy/atendente leva a maquininha.</div>
           </div>`
        : '';

      // 3) link de pagamento externo (banco/maquininha do lojista)
      const blocoLink = p.pay_url
        ? `<a class="btn btn-ghost btn-block" href="${esc(p.pay_url)}" target="_blank" rel="noopener" id="payNowLink" style="margin-top:10px">
             💳 Abrir o link de pagamento da loja
           </a>`
        : '';

      return `${blocoMP}${blocoLocal}${blocoLink}`;
    }

    return p.key
      ? `<div class="pix-box"><div class="pix-label">Chave</div>
           <div class="pix-key"><code>${esc(p.key)}</code></div></div>`
      : '';
  }

  /** Junta o que o cliente digitou no formulário (não valida nada). */
  function montarPayload(formEl) {
    const alvo = el('checkoutForm') || formEl;
    const form = new FormData(alvo);
    const escolhido = alvo.querySelector('input[name="payment_method"]:checked');
    return {
      customer_name: String(form.get('customer_name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      fulfillment: String(form.get('fulfillment') || 'delivery'),
      address: String(form.get('address') || '').trim(),
      neighborhood: String(form.get('neighborhood') || '').trim(),
      complement: String(form.get('complement') || '').trim(),
      period: String(form.get('period') || '').trim(),
      payment_method: String(form.get('payment_method') || '').trim(),
      payment_id: escolhido ? escolhido.dataset.payId || '' : '',
      payment_detail: detalhePagamento(),
      notes: String(form.get('notes') || '').trim(),
      items: cartEntries().map((i) => ({ id: i.id, qty: i.qty, escolhas: i.escolhas || undefined })),
    };
  }

  async function submitOrder(formEl) {
    if (state.busy) return;
    const payload = montarPayload(formEl);

    // validação local amigável
    const problems = [];
    formEl.querySelectorAll('.input, .textarea').forEach((i) => i.classList.remove('error'));
    const flag = (id, msg) => {
      const node = el(id);
      if (node) node.classList.add('error');
      problems.push(msg);
    };
    if (payload.customer_name.length < 2) flag('fName', 'Informe seu nome.');
    if (payload.phone.replace(/\D/g, '').length < 10) flag('fPhone', 'Informe um telefone com DDD.');
    if (payload.fulfillment === 'delivery' && payload.address.length < 3) flag('fAddress', 'Informe o endereço.');
    if (!payload.period && state.segment !== 'catalogo') problems.push('Escolha o horário.');
    if (!payload.payment_method) problems.push('Escolha a forma de pagamento.');

    const paySel = pagamentoEscolhido();
    const cartaoOnline = !!(paySel && ehCartaoOnline(paySel));

    if (cartaoOnline && !(state.mpCartao || {}).disponivel && !(state.mpCartao || {}).checkout) {
      toast('Cartão online está em ativação nesta loja. Escolha Pix, dinheiro ou cartão na entrega.', 'err');
      return;
    }

    if (paySel && tipoPagamento(paySel) === 'dinheiro') {
      const sim = el('checkoutForm').querySelector('input[name="troco_tipo"][value="sim"]');
      if (sim && sim.checked) {
        const v = Number((el('trocoValor').value || '').replace(/\./g, '').replace(',', '.'));
        if (!v) problems.push('Informe para quanto precisa de troco.');
        else if (Math.round(v * 100) < totals().total) problems.push('O valor do troco é menor que o total do pedido.');
      }
    }
    if (problems.length) {
      toast(problems[0], 'err');
      const first = formEl.querySelector('.error');
      if (first) first.focus();
      return;
    }

    if (cartaoOnline) {
      // caminho principal: pagar na página do Mercado Pago (crédito, débito ou Pix)
      const mp = state.mpCartao || {};
      const usaFormulario = el('mpCardBox') && !el('mpCardBox').hidden;
      // se marcou "na entrega", o pedido segue normal (maquininha leva o cartão)
      const sub = formEl.querySelector('input[name="cartao_tipo"]:checked');
      const naEntrega = sub && /_local$/.test(sub.value);
      if (mp.checkout && !usaFormulario && !naEntrega) {
        return pagarNaPaginaSegura('mpPagarAgora');
      }
      const problema = problemasDoCartao();
      if (problema) {
        toast(problema, 'err');
        return;
      }
    }

    state.busy = true;
    const btn = el('submitOrder');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = cartaoOnline ? 'Validando cartão…' : 'Enviando…';

    try {
      if (cartaoOnline) {
        payload.cartao = await tokenizarCartao(paySel);
        payload.payment_detail = `${payload.cartao.installments}x cartão de crédito`;
        btn.innerHTML = 'Cobrando no cartão…';
      }

      let res;
      if (cartaoOnline && state.pedidoCartao) {
        // tentativa de novo no mesmo pedido (antes o cartão foi recusado)
        const r = await api(`/api/orders/${encodeURIComponent(state.pedidoCartao)}/pagar-cartao`, {
          method: 'POST',
          body: JSON.stringify({ cartao: payload.cartao }),
        });
        res = {
          order: {
            code: r.code,
            total_cents: totals().total,
            fulfillment: payload.fulfillment,
            period: payload.period,
            payment_method: `Cartão de crédito (online) — ${payload.cartao.installments}x · ${r.payment.rotulo}`,
            payment_status: r.payment.chave,
          },
          payment: r.payment,
          whatsapp_url: r.whatsapp_url,
          message: r.message,
        };
      } else {
        res = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
      }

      state.pedidoCartao = '';
      localStorage.setItem(
        CUSTOMER_KEY,
        JSON.stringify({
          customer_name: payload.customer_name,
          phone: payload.phone,
          address: payload.address,
          neighborhood: payload.neighborhood,
          complement: payload.complement,
        })
      );
      state.lastOrder = res;
      state.cart = {};
      saveCart();
      state.view = 'success';
      renderProducts();
      renderCartBar();
      renderDrawer();
      // tenta abrir o WhatsApp imediatamente (pode ser bloqueado pelo navegador)
      if (res.whatsapp_url) {
        const win = window.open(res.whatsapp_url, '_blank');
        if (!win) toast('Toque em "Enviar no WhatsApp" para concluir.', 'ok');
      }
    } catch (err) {
      // cartão recusado: guarda o pedido para tentar de novo sem duplicar
      if (cartaoOnline && err.status === 402) {
        state.pedidoCartao = (err.data && err.data.code) || state.pedidoCartao;
        toast(err.message || 'Cartão recusado. Confira os dados e tente de novo.', 'err');
      } else {
        toast(err.message || 'Não foi possível enviar o pedido.', 'err');
      }
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    } finally {
      state.busy = false;
    }
  }

  function renderSuccess(body, foot) {
    const o = state.lastOrder;
    if (!o) {
      state.view = 'cart';
      return renderDrawer();
    }
    const order = o.order;
    const pag = o.payment || null;
    let faixaPag = '';
    if (pag) {
      const ok = pag.chave === 'pago' || pag.chave === 'autorizado';
      const analise = pag.chave === 'em_analise';
      faixaPag = `<div class="pay-result ${ok ? 'ok' : analise ? 'warn' : 'bad'}">
        <strong>${ok ? 'Pagamento aprovado ✅' : analise ? 'Pagamento em análise ⏳' : 'Pagamento não aprovado'}</strong>
        <span>${ok
          ? `${esc(String(pag.parcelas || 1))}x · ${esc(String(pag.bandeira || '').toUpperCase())}`
          : analise
          ? 'O banco está analisando. A loja confirma assim que liberar.'
          : esc(pag.motivo || 'Tente outro cartão ou outra forma de pagamento.')}</span>
      </div>`;
    }
    body.innerHTML = `
      <div class="success">
        <div class="check">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <h2>${o.payment && (o.payment.chave === 'pago' || o.payment.chave === 'autorizado') ? 'Pedido pago!' : 'Pedido registrado!'}</h2>
        <a class="btn btn-ghost" style="margin:6px 0 10px;display:inline-block;text-decoration:none"
           href="${API_PREFIX}/comprovante/${encodeURIComponent(order.code)}" target="_blank" rel="noopener">
          🧾 Ver comprovante
        </a>
        <p>Falta só um passo: envie a mensagem no WhatsApp para confirmar com a gente.</p>
        <div class="order-box">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div>
              <div style="font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Pedido</div>
              <div class="code">${esc(order.code)}</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Total</div>
              <div style="font-size:18px;font-weight:820">${brl.format(order.total_cents / 100)}</div>
            </div>
          </div>
          <div style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--line);font-size:13.5px;color:var(--ink-soft)">
            ${esc(order.fulfillment === 'pickup' ? 'Retirada' : 'Entrega')} · ${esc(order.period || '')} · ${esc(
      order.payment_method
    )}
          </div>
        </div>
        ${faixaPag}
      </div>`;
    const payBtn = order.payment_url
      ? `<a class="btn btn-gold btn-block" style="margin-bottom:8px" href="${esc(order.payment_url)}" target="_blank" rel="noopener">💳 Pagar agora no cartão</a>`
      : order.payment_key
      ? `<div class="pix-box" style="margin-bottom:8px"><div class="pix-label">Pague com Pix nesta chave</div>
           <div class="pix-key"><code>${esc(order.payment_key)}</code>
           <button class="btn btn-sm btn-ghost" id="copyPixOk">Copiar</button></div></div>`
      : '';
    foot.innerHTML = `
      ${payBtn}
      <a class="btn btn-primary btn-block" href="${esc(o.whatsapp_url)}" target="_blank" rel="noopener" id="waLink">
        Enviar no WhatsApp
      </a>
      <button class="btn btn-ghost btn-block" style="margin-top:8px" data-close>${
        state.segment === 'catalogo' ? 'Voltar ao catálogo' : 'Voltar ao cardápio'
      }</button>`;
    bindFootClose();
    const cpOk = el('copyPixOk');
    if (cpOk) cpOk.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(order.payment_key); toast('Chave Pix copiada!', 'ok'); }
      catch { toast('Chave: ' + order.payment_key); }
    });
    const wa = el('waLink');
    if (!o.whatsapp_url || !o.whatsapp_url.startsWith('http')) {
      wa.removeAttribute('href');
      wa.textContent = 'WhatsApp do vendedor não configurado';
      wa.style.pointerEvents = 'none';
      wa.style.opacity = '0.6';
    }
  }

  /* ---------------- Central de Tráfego: clique no WhatsApp ---------------- */
  function avisarClique(onde) {
    try {
      const url = apiUrl('/api/eventos');
      const corpo = JSON.stringify({ tipo: 'whatsapp', detalhe: onde || '' });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([corpo], { type: 'application/json' }));
      } else {
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true });
      }
    } catch {
      /* estatística não pode atrapalhar o pedido */
    }
  }
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest && e.target.closest('a[href*="wa.me"], a[href*="api.whatsapp.com"], a[href*="whatsapp.com/send"]');
      if (!a) return;
      avisarClique(a.id || a.className || 'whatsapp');
    },
    true
  );

  /* --------------------------------- eventos ------------------------------- */
  el('drawerClose').addEventListener('click', () => {
    if (state.view === 'success') {
      state.view = 'cart';
      closeDrawer();
    } else closeDrawer();
  });
  el('drawerBackdrop').addEventListener('click', closeDrawer);
  el('cartBarBtn').addEventListener('click', () => openDrawer('cart'));
  el('headerCartBtn').addEventListener('click', () => openDrawer('cart'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  /* ------------------------------- inicialização --------------------------- */
  /**
   * Atualização automática: a cada 20s o celular do cliente procura novidades.
   * O que o dono altera no painel (preço, produto novo, esgotado, abrir/fechar
   * pedidos) aparece em todos os celulares sem precisar recarregar.
   */
  let assinaturaAtual = '';
  function assinatura(d) {
    return JSON.stringify([
      (d.products || []).map((p) => [p.id, p.name, p.price_cents, p.active, p.image_url, p.category, p.description, p.sort_order]),
      d.business, d.delivery, d.payments, d.accepting_orders, d.closed_message, d.store && d.store.segment,
    ]);
  }

  async function atualizarSilencioso() {
    if (document.hidden) return; // aba em segundo plano: nem gasta dados
    try {
      const data = await api('/api/menu');
      const nova = assinatura(data);
      if (nova === assinaturaAtual) return; // nada mudou
      assinaturaAtual = nova;

      state.menu = data;
      state.products = data.products;
      state.business = data.business;
      state.segment = (data.store && data.store.segment) || state.segment;
      state.delivery = data.delivery;
      state.payments = data.payments;
      state.mpCartao = (data.pagamentos_online && data.pagamentos_online.cartao) || { disponivel: false, public_key: '' };
      state.checkoutModo = data.checkout_modo === 'online' ? 'online' : 'todos';
      state.accepting = data.accepting_orders !== false;
      state.closedMessage = data.closed_message || '';

      Object.keys(state.cart).forEach((id) => {
        if (!productById(String(id).split('#')[0])) delete state.cart[id];
      });
      saveCart();

      applyBusiness();
      renderCategories();
      renderProducts();
      renderCartBar();
    } catch {
      /* sem internet agora: tenta no próximo ciclo */
    }
  }

  async function init() {
    loadCart();
    try {
      const data = await api('/api/menu');
      assinaturaAtual = assinatura(data);
      state.menu = data;
      state.products = data.products;
      state.business = data.business;
      state.segment = (data.store && data.store.segment) || 'food';
      state.delivery = data.delivery;
      state.payments = data.payments;
      state.mpCartao = (data.pagamentos_online && data.pagamentos_online.cartao) || { disponivel: false, public_key: '' };
      state.checkoutModo = data.checkout_modo === 'online' ? 'online' : 'todos';
      state.accepting = data.accepting_orders !== false;
      state.closedMessage = data.closed_message || '';

      // limpa itens do carrinho que não existem mais
      Object.keys(state.cart).forEach((id) => {
        if (!productById(String(id).split('#')[0])) delete state.cart[id];
      });
      saveCart();

      applyBusiness();
      renderCategories();
      renderProducts();
      aplicarSessaoDoLink();
      renderCartBar();
    } catch (err) {
      el('grid').innerHTML = `<div class="empty" style="grid-column:1/-1">
        <p><strong>Não foi possível carregar o cardápio.</strong></p>
        <p style="font-size:13px;margin-top:6px">${esc(err.message)}</p>
        <button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="location.reload()">Tentar novamente</button>
      </div>`;
    }
  }

  init();
  setInterval(atualizarSilencioso, 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizarSilencioso();
  });
  // Deixa o catálogo/cardápio instalável na tela inicial do celular
  // e faz a loja abrir na hora, mesmo com o servidor acordando.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {}));
  }
  // Enquanto alguém está com a loja aberta, o servidor não dorme.
  const acordar = () => fetch('/healthz', { cache: 'no-store' }).catch(() => {});
  acordar();
  setInterval(acordar, 4 * 60 * 1000);
})();
