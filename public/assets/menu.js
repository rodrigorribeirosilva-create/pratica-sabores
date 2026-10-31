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
    if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
    return data;
  }

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
      Object.keys(raw).forEach((k) => {
        const q = Number(raw[k]);
        if (Number.isInteger(q) && q > 0 && q < 100) state.cart[k] = q;
      });
    } catch {
      state.cart = {};
    }
  }
  const saveCart = () => localStorage.setItem(CART_KEY, JSON.stringify(state.cart));

  const productById = (id) => state.products.find((p) => String(p.id) === String(id));
  const cartEntries = () =>
    Object.entries(state.cart)
      .map(([id, qty]) => {
        const p = productById(id);
        return p ? { ...p, qty } : null;
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
    el('brandSub').textContent = b.tagline || (isCatalog ? 'Catálogo digital' : 'Marmitas caseiras');
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
    if (state.delivery.periods?.length) chips.push(`${state.delivery.periods.length} horários`);
    if (state.payments?.length) chips.push(state.payments.map((p) => p.label).join(' · '));
    el('heroChips').innerHTML = chips.map((c) => `<span class="chip-glass">${esc(c)}</span>`).join('');
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
        const qty = state.cart[p.id] || 0;
        const action = qty
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

  function changeQty(id, delta) {
    const current = state.cart[id] || 0;
    const next = Math.max(0, Math.min(99, current + delta));
    if (next === 0) delete state.cart[id];
    else state.cart[id] = next;
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
      state.view === 'checkout' ? 'Finalizar pedido' : state.view === 'success' ? 'Pedido enviado' : 'Seu carrinho';

    if (state.view === 'success') return renderSuccess(body, foot);
    if (state.view === 'checkout') return renderCheckout(body, foot);

    /* ---- carrinho ---- */
    const t = totals();
    if (!t.items.length) {
      body.innerHTML = `<div class="empty">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2.5l2.3 12.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21 7H6"/></svg>
        <p>Seu carrinho está vazio.</p>
        <p style="font-size:13px;margin-top:6px">Escolha uma marmita no cardápio para começar.</p>
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
          <div class="ci-price">${brl.format(i.price_cents / 100)} cada</div>
          <div style="margin-top:6px">
            <div class="stepper">
              <button data-dec="${i.id}" aria-label="Remover um">−</button>
              <span class="qty">${i.qty}</span>
              <button data-inc="${i.id}" aria-label="Adicionar um">+</button>
            </div>
          </div>
        </div>
        <div class="ci-right">
          <div class="ci-total">${brl.format((i.price_cents * i.qty) / 100)}</div>
          <button class="remove-x" data-remove="${i.id}">remover</button>
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
                        <span>${icone} ${esc(p.label)}${p.instructions ? `<span class="pay-note">${esc(p.instructions)}</span>` : ''}</span>
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
      Enviar pedido no WhatsApp
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm5.8 14.02c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.44-.72-2.9-1.15-4.72-4.15-4.86-4.34-.14-.19-1.14-1.52-1.14-2.9 0-1.38.72-2.06.98-2.34.26-.29.56-.36.75-.36.19 0 .38 0 .55.01.17.01.43-.07.67.51.24.58.82 2 .89 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.14.17-.3.38-.43.51-.14.14-.29.29-.12.58.17.29.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.44.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.38-.24.65-.14.27.1 1.7.8 1.99.95.29.14.48.22.55.34.07.12.07.7-.17 1.38Z"/></svg>
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

    if (tipo === 'cartao') {
      const aceitaCredito = p.aceita_credito !== false;
      const aceitaDebito = p.aceita_debito !== false;
      const online = !!p.pay_url;
      const opcoes = [];
      if (online) opcoes.push(['credito_online', '💳 Crédito — pagar online agora']);
      if (aceitaCredito && !online) opcoes.push(['credito_local', '💳 Crédito na entrega/retirada']);
      if (aceitaDebito) opcoes.push(['debito_local', '💳 Débito na entrega/retirada']);
      if (!opcoes.length) opcoes.push(['credito_local', '💳 Cartão na entrega']);
      return `<div class="pay-sub">
        <div class="pay-sub-title">Como você quer pagar?</div>
        <div class="pay-choice" style="flex-direction:column;align-items:stretch">
          ${opcoes
            .map(
              ([v, t], i) =>
                `<label class="pay-chip"><input type="radio" name="cartao_tipo" value="${v}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`
            )
            .join('')}
        </div>
        ${online
          ? `<a class="btn btn-gold btn-block" href="${esc(p.pay_url)}" target="_blank" rel="noopener" id="payNowLink" style="margin-top:10px">
               💳 Abrir o pagamento online
             </a>
             <div class="hint" style="margin-top:6px">Abre o pagamento seguro. O pedido é confirmado após a aprovação.</div>`
          : `<div class="hint" style="margin-top:8px">O motoboy/atendente leva a maquininha.</div>`}
      </div>`;
    }

    return p.key
      ? `<div class="pix-box"><div class="pix-label">Chave</div>
           <div class="pix-key"><code>${esc(p.key)}</code></div></div>`
      : '';
  }

  async function submitOrder(formEl) {
    if (state.busy) return;
    const form = new FormData(el('checkoutForm'));
    const payload = {
      customer_name: String(form.get('customer_name') || '').trim(),
      phone: String(form.get('phone') || '').trim(),
      fulfillment: String(form.get('fulfillment') || 'delivery'),
      address: String(form.get('address') || '').trim(),
      neighborhood: String(form.get('neighborhood') || '').trim(),
      complement: String(form.get('complement') || '').trim(),
      period: String(form.get('period') || '').trim(),
      payment_method: String(form.get('payment_method') || '').trim(),
      payment_id: (() => {
        const c = el('checkoutForm').querySelector('input[name="payment_method"]:checked');
        return c ? c.dataset.payId || '' : '';
      })(),
      payment_detail: detalhePagamento(),
      notes: String(form.get('notes') || '').trim(),
      items: cartEntries().map((i) => ({ id: i.id, qty: i.qty })),
    };

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

    state.busy = true;
    const btn = el('submitOrder');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Enviando…';

    try {
      const res = await api('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
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
      toast(err.message || 'Não foi possível enviar o pedido.', 'err');
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
    body.innerHTML = `
      <div class="success">
        <div class="check">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </div>
        <h2>Pedido registrado!</h2>
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
      state.accepting = data.accepting_orders !== false;
      state.closedMessage = data.closed_message || '';

      Object.keys(state.cart).forEach((id) => {
        if (!productById(id)) delete state.cart[id];
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
      state.accepting = data.accepting_orders !== false;
      state.closedMessage = data.closed_message || '';

      // limpa itens do carrinho que não existem mais
      Object.keys(state.cart).forEach((id) => {
        if (!productById(id)) delete state.cart[id];
      });
      saveCart();

      applyBusiness();
      renderCategories();
      renderProducts();
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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
