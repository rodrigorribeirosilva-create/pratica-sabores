/* ============================================================
   Painel administrativo — produtos, pedidos e configurações
   ============================================================ */
(() => {
  'use strict';

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  /* Prefixo da loja na URL: /l/<slug> (cardápio e painel de cada cliente) */
  const API_PREFIX = (() => {
    const m = location.pathname.match(/^\/l\/([a-z0-9-]+)/i);
    return m ? `/l/${m[1]}` : '';
  })();
  const apiUrl = (u) => (API_PREFIX && String(u).startsWith('/api/') ? API_PREFIX + u : u);

  const el = (id) => document.getElementById(id);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = {
    products: [],
    orders: [],
    orderStatus: 'todos',
    settings: { business: {}, delivery: {}, payments: [] },
    periods: [],
    payments: [],
    segment: 'food',
    editingId: null,
    pendingImage: '',
    imageMode: 'file',
  };

  /* ------------------------------- helpers ------------------------------- */
  function toast(msg, type = '') {
    const d = document.createElement('div');
    d.className = `toast ${type}`;
    d.textContent = msg;
    el('toasts').appendChild(d);
    setTimeout(() => {
      d.style.opacity = '0';
      d.style.transition = 'all .25s';
      setTimeout(() => d.remove(), 260);
    }, 3000);
  }

  async function api(url, opts = {}) {
    const res = await fetch(apiUrl(url), { headers: { 'Content-Type': 'application/json' }, ...opts });
    if (res.status === 401) {
      showLogin();
      throw new Error('Sessão expirada. Entre novamente.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro inesperado.');
    return data;
  }


  /* Marca da loja na tela de login (cada loja tem a sua) */
  function applyBranding(menu) {
    if (!menu || !menu.business) return;
    const b = menu.business;
    applySegment((menu.store && menu.store.segment) || 'food');
    const nameEl = el('loginBrandName');
    if (nameEl) nameEl.textContent = `${b.name || 'Cardápio'} · ${SEG.brandSuffix}`;
    // --- logotipo: sempre o da própria loja (marmita ≠ catálogo) ---
    const inicial = (b.name || '·').trim().charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="#12352a"/><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="46" fill="#e7cf9b">${inicial}</text></svg>`;
    const semLogo = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    for (const id of ['loginLogo', 'sideLogo', 'mobLogo']) {
      const img = el(id);
      if (img) {
        img.src = b.logo_url || semLogo;
        img.style.display = '';
      }
    }
    // nome e tipo da loja na barra do topo (celular)
    setText('mobName', b.name || 'Painel');
    setText('mobSegment', SEG.nav);
    const back = el('loginBackLink');
    if (back) back.href = `${API_PREFIX}/`;
    if (b.theme_color) document.documentElement.style.setProperty('--green', b.theme_color);
    if (b.accent_color) document.documentElement.style.setProperty('--gold', b.accent_color);
    document.title = `Painel · ${b.name || 'Cardápio'}`;
  }

  const moneyInput = (v) => (Number(v || 0) / 100).toFixed(2).replace('.', ',');


  /* ============================================================
     Tipo de loja: cardápio (comida) x catálogo (perfumes/presentes)
     Mesmas funções, textos e exemplos diferentes.
     ============================================================ */
  const SEGMENT_TEXTS = {
    food: {
      nav: 'Cardápio',
      sideMenu: 'Ver cardápio',
      productsTitle: 'Cardápio',
      productsSub: 'Cadastre, edite e organize as marmitas. O cardápio online atualiza na hora.',
      viewMenu: 'Ver cardápio',
      ordersSub: 'Pedidos enviados pelo cardápio. Atualize o status conforme avança.',
      configSub: 'Dados do negócio, entrega, pagamentos e link do cardápio.',
      linkTitle: 'Seu link do cardápio',
      qr: 'Imprima e cole na embalagem ou no balcão. O cliente escaneia e cai direto no cardápio.',
      pActive: 'Disponível no cardápio',
      namePlaceholder: 'Ex.: Marmita de frango',
      categoryPlaceholder: 'Marmitas',
      descPlaceholder: 'Ingredientes, acompanhamentos, tamanho…',
      taglinePlaceholder: 'Marmitas caseiras, feitas no dia',
      categories: ['Marmitas', 'Bebidas', 'Sobremesas', 'Combos', 'Saladas'],
      openLink: 'Abrir cardápio',
      word: 'cardápio',
      backLink: '← Ver o cardápio público',
      statusOpen: 'Os clientes estão conseguindo pedir no cardápio',
      brandSuffix: 'Cardápio Digital',
    },
    catalogo: {
      nav: 'Catálogo',
      sideMenu: 'Ver catálogo',
      productsTitle: 'Catálogo',
      productsSub: 'Cadastre, edite e organize os produtos do catálogo — perfumes, presentes, brinquedos. O catálogo online atualiza na hora.',
      viewMenu: 'Ver catálogo',
      ordersSub: 'Pedidos enviados pelo catálogo. Atualize o status conforme avança.',
      configSub: 'Dados da loja, entrega, pagamentos e link do catálogo.',
      linkTitle: 'Seu link do catálogo',
      qr: 'Imprima e cole na embalagem, na sacola ou no balcão. O cliente escaneia e cai direto no catálogo.',
      pActive: 'Disponível no catálogo',
      namePlaceholder: 'Ex.: Perfume Essence Noir 100ml',
      categoryPlaceholder: 'Perfumes',
      descPlaceholder: 'Notas do perfume, tamanho, embalagem, prazo de entrega…',
      taglinePlaceholder: 'Perfumes, presentes e brinquedos',
      categories: ['Perfumes', 'Kits e presentes', 'Presentes', 'Brinquedos', 'Corpo e banho', 'Velas e aromas'],
      openLink: 'Abrir catálogo',
      word: 'catálogo',
      backLink: '← Ver o catálogo público',
      statusOpen: 'Os clientes estão conseguindo fazer pedidos no catálogo',
      brandSuffix: 'Catálogo Digital',
    },
  };

  let SEG = SEGMENT_TEXTS.food;

  function setText(id, value) {
    const node = el(id);
    if (node && value) node.textContent = value;
  }
  function setPlaceholder(id, value) {
    const node = el(id);
    if (node && value) node.placeholder = value;
  }

  function applySegment(segment) {
    state.segment = segment === 'catalogo' ? 'catalogo' : 'food';
    SEG = SEGMENT_TEXTS[state.segment];

    setText('navMenuLabel', SEG.nav);
    setText('navMenuLabelMobile', SEG.nav);
    setText('sideMenuLabel', SEG.sideMenu);
    setText('productsTitle', SEG.productsTitle);
    setText('productsSub', SEG.productsSub);
    setText('viewMenuBtn', SEG.viewMenu);
    setText('ordersSub', SEG.ordersSub);
    setText('configSub', SEG.configSub);
    setText('linkCardTitle', SEG.linkTitle);
    setText('openLinkLabel', SEG.openLink);
    setText('waShareLabel', 'Compartilhar no WhatsApp');
    const qrDl = el('qrDownload');
    if (qrDl) qrDl.setAttribute('download', `qrcode-${SEG.word}.png`);
    setText('qrCaption', SEG.qr);
    setText('pActiveLabel', SEG.pActive);
    setText('loginBackLink', SEG.backLink);

    setPlaceholder('pName', SEG.namePlaceholder);
    setPlaceholder('pCategory', SEG.categoryPlaceholder);
    const catInput = el('pCategory');
    // se o campo estiver com valor de exemplo de outro tipo, troca
    if (catInput && /^(Marmitas|Perfumes)$/.test(catInput.value) && catInput.value !== SEG.categoryPlaceholder) {
      catInput.value = SEG.categoryPlaceholder;
    }
    const priceInput = el('pPrice');
    if (priceInput && state.segment === 'catalogo' && (priceInput.value === '25,00' || !priceInput.value)) {
      priceInput.value = '199,00';
    }
    setPlaceholder('pDesc', SEG.descPlaceholder);
    setPlaceholder('bTagline', SEG.taglinePlaceholder);

    // categorias sugeridas
    const dl = el('categoryOptions');
    if (dl) dl.innerHTML = SEG.categories.map((c) => `<option value="${esc(c)}"></option>`).join('');

    // links "ver catálogo/cardápio" apontam para a loja certa
    const url = `${API_PREFIX}/`;
    for (const id of ['sideMenuLink', 'viewMenuBtn', 'mobOpenMenu']) {
      const a = el(id);
      if (a) a.href = url;
    }
  }

  /* ------------------ mensagens para o cliente (WhatsApp) ------------------ */
  const FALLBACK_MSG = {
    out_for_delivery:
      'Olá, {nome}! Seu pedido {codigo} saiu para entrega 🛵\nPrevisão: {horario}.\nTotal: {total} ({pagamento}).\nQualquer coisa é só chamar aqui! — {negocio}',
    confirmed:
      'Olá, {nome}! Recebemos seu pedido {codigo} ✅\nItens: {itens}\nTotal: {total} — {pagamento}.\nEntrega prevista: {horario}. Obrigado! — {negocio}',
    preparing: 'Olá, {nome}! Seu pedido {codigo} já está sendo preparado 👩‍🍳\nPrevisão de entrega: {horario}. — {negocio}',
    delivered: 'Olá, {nome}! Seu pedido {codigo} foi entregue ✅\nEspero que goste! Obrigado pela preferência! — {negocio}',
  };

  const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

  function waNumber(raw) {
    let d = onlyDigits(raw);
    if (!d) return '';
    if (d.length <= 11 && !d.startsWith('55')) d = '55' + d;
    return d;
  }

  function buildCustomerMessage(order, kind) {
    const tpl = (state.settings.messages && state.settings.messages[kind]) || FALLBACK_MSG[kind] || '';
    const itens = (order.items || []).map((i) => `${i.qty}x ${i.name}`).join(', ');
    const biz = (state.settings.business && state.settings.business.name) || 'Prática Sabores';
    return tpl
      .replace(/{nome}/g, (order.customer_name || '').split(' ')[0] || 'cliente')
      .replace(/{codigo}/g, order.code || '')
      .replace(/{horario}/g, order.period || '')
      .replace(/{total}/g, brl.format((order.total_cents || 0) / 100))
      .replace(/{pagamento}/g, order.payment_method || '')
      .replace(/{itens}/g, itens)
      .replace(/{negocio}/g, biz);
  }

  function openNotify(order, kind = 'out_for_delivery') {
    const num = waNumber(order.phone);
    if (!num) return toast('Este pedido não tem telefone válido.', 'err');
    const titles = {
      out_for_delivery: 'Avisar: saiu para entrega',
      preparing: 'Avisar: em preparo',
      confirmed: 'Avisar: pedido confirmado',
      delivered: 'Avisar: pedido entregue',
    };
    el('notifyTitle').textContent = titles[kind] || 'Avisar o cliente';
    el('notifyWho').innerHTML = `${esc(order.customer_name)} · ${esc(order.phone)}<span>Pedido ${esc(order.code)}</span>`;
    el('notifyText').value = buildCustomerMessage(order, kind);
    refreshNotifyLink(order);
    el('notifyText').oninput = () => refreshNotifyLink(order);
    openModal('notifyModal');
  }

  function refreshNotifyLink(order) {
    const num = waNumber(order.phone);
    const text = encodeURIComponent(el('notifyText').value);
    el('notifySend').href = `https://wa.me/${num}?text=${text}`;
  }

  function showLogin() {
    el('app').hidden = true;
    el('loginWrap').hidden = false;
    setTimeout(() => el('loginPass').focus(), 80);
  }
  function showApp() {
    el('loginWrap').hidden = true;
    el('app').hidden = false;
  }

  function openModal(id) {
    el(id).hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    el(id).hidden = true;
    document.body.style.overflow = '';
  }
  qsa('[data-close-modal]').forEach((b) =>
    b.addEventListener('click', () => closeModal(b.dataset.closeModal))
  );
  qsa('.modal-backdrop').forEach((bd) =>
    bd.addEventListener('click', (e) => {
      if (e.target === bd) closeModal(bd.id);
    })
  );

  let confirmResolve = null;
  function showConfirm(text, title = 'Confirmar') {
    el('confirmTitle').textContent = title;
    el('confirmText').textContent = text;
    openModal('confirmModal');
    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }
  el('confirmYes').addEventListener('click', () => {
    closeModal('confirmModal');
    if (confirmResolve) confirmResolve(true);
    confirmResolve = null;
  });
  el('confirmModal').addEventListener('click', (e) => {
    if (e.target === el('confirmModal') || e.target.closest('[data-close-modal]')) {
      if (confirmResolve) confirmResolve(false);
      confirmResolve = null;
    }
  });

  /* ------------------------------- login ------------------------------- */
  el('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      const res = await fetch(apiUrl('/api/admin/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: el('loginPass').value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível entrar.');
      el('loginPass').value = '';
      showApp();
      await start();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar no painel';
    }
  });

  el('logoutBtn').addEventListener('click', async () => {
    await fetch(apiUrl('/api/admin/logout'), { method: 'POST' });
    showLogin();
  });

  /* ----------------------------- navegação ----------------------------- */
  function setView(view) {
    qsa('.view').forEach((s) => (s.hidden = s.id !== `view-${view}`));
    qsa('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    if (view === 'pedidos') loadOrders();
    if (view === 'config') loadSettings();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  qsa('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  el('bannerGoSecurity').addEventListener('click', () => {
    setView('config');
    setTimeout(() => el('panelSecurity').scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  });

  /* ====================== ABERTO / FECHADO PARA PEDIDOS ====================== */
  let accepting = true;
  let closedMessage = '';

  function renderStatusCard() {
    const card = el('statusCard');
    if (!card) return;
    card.classList.toggle('closed', !accepting);
    el('scTitle').textContent = accepting ? 'Aberto para pedidos' : 'Fechado para pedidos';
    el('scSub').textContent = accepting
      ? SEG.statusOpen
      : closedMessage || `Clientes veem o ${SEG.nav.toLowerCase()}, mas não conseguem finalizar`;
    el('scToggle').textContent = accepting ? 'Fechar pedidos' : 'Abrir pedidos';
    el('scToggle').disabled = false;
    const msg = el('scMessage');
    msg.hidden = accepting;
    msg.value = closedMessage;
  }

  async function setAccepting(value) {
    const previous = accepting;
    accepting = value;
    renderStatusCard();
    el('scToggle').disabled = true;
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          delivery: {
            ...state.settings.delivery,
            accepting_orders: accepting,
            closed_message: closedMessage,
          },
        }),
      });
      state.settings.delivery = { ...(state.settings.delivery || {}), accepting_orders: accepting, closed_message: closedMessage };
      toast(accepting ? 'Pedidos ABERTOS — o cardápio já está aceitando.' : 'Pedidos FECHADOS — clientes não conseguem finalizar.', 'ok');
    } catch (err) {
      accepting = previous;
      renderStatusCard();
      toast(err.message, 'err');
    } finally {
      el('scToggle').disabled = false;
    }
  }

  if (el('scToggle')) {
    el('scToggle').addEventListener('click', () => setAccepting(!accepting));
    el('scMessage').addEventListener('change', async () => {
      closedMessage = el('scMessage').value.trim();
      await setAccepting(false);
      toast('Mensagem de fechado atualizada.', 'ok');
    });
  }

  /* ============================== PRODUTOS ============================== */
  async function loadProducts() {
    state.products = await api('/api/admin/products');
    renderProducts();
  }

  function renderProducts() {
    const q = el('productSearch').value.trim().toLowerCase();
    const list = state.products.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)
    );
    el('productCountLabel').textContent = `${state.products.length} produto(s) cadastrado(s)`;

    const box = el('productList');
    if (!list.length) {
      box.innerHTML = `<div class="empty-state">
        <h3>${state.products.length ? 'Nenhum produto encontrado' : 'Seu cardápio está vazio'}</h3>
        <p>${state.products.length ? 'Tente outro termo de busca.' : 'Cadastre sua primeira marmita para começar a vender.'}</p>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('newProductBtn').click()">Cadastrar produto</button>
      </div>`;
      return;
    }

    box.innerHTML = list
      .map(
        (p) => `<div class="p-row" data-id="${p.id}">
        <div class="p-thumb">${
          p.image_url
            ? `<img src="${esc(p.image_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
            : `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-4 3 2 3-3 5 5"/></svg>`
        }</div>
        <div class="p-main">
          <div class="p-name">${esc(p.name)} ${p.active ? '' : '<span class="tag off">oculto</span>'}</div>
          <div class="p-desc">${esc(p.description || 'Sem descrição')}</div>
          <div class="p-meta">
            <span class="p-price">${brl.format(p.price_cents / 100)}</span>
            <span class="tag">${esc(p.category || 'Sem categoria')}</span>
          </div>
        </div>
        <div class="p-actions">
          <label class="switch" title="${p.active ? 'Visível no cardápio' : 'Oculto'}">
            <input type="checkbox" data-toggle="${p.id}" ${p.active ? 'checked' : ''}>
            <span class="track"></span>
          </label>
          <button class="icon-btn" data-foto="${p.id}" title="Trocar a foto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.2"/></svg>
          </button>
          <button class="icon-btn" data-edit="${p.id}" title="Editar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button class="icon-btn danger" data-del="${p.id}" title="Excluir">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
          </button>
        </div>
      </div>`
      )
      .join('');

    qsa('[data-foto]', box).forEach((b) =>
      b.addEventListener('click', () => {
        state.editingId = b.dataset.foto;
        trocarFotoDoProduto();
      })
    );

    qsa('[data-toggle]', box).forEach((chk) =>
      chk.addEventListener('change', async () => {
        try {
          await api(`/api/admin/products/${chk.dataset.toggle}/active`, {
            method: 'PATCH',
            body: JSON.stringify({ active: chk.checked }),
          });
          const p = state.products.find((x) => String(x.id) === chk.dataset.toggle);
          if (p) p.active = chk.checked ? 1 : 0;
          renderProducts();
          toast(chk.checked ? 'Produto visível no cardápio.' : 'Produto oculto do cardápio.', 'ok');
        } catch (err) {
          toast(err.message, 'err');
          chk.checked = !chk.checked;
        }
      })
    );

    qsa('[data-edit]', box).forEach((b) =>
      b.addEventListener('click', () => openProductModal(state.products.find((p) => String(p.id) === b.dataset.edit)))
    );

    qsa('[data-del]', box).forEach((b) =>
      b.addEventListener('click', async () => {
        const p = state.products.find((x) => String(x.id) === b.dataset.del);
        const ok = await showConfirm(`Excluir "${p.name}" do cardápio? Essa ação não pode ser desfeita.`, 'Excluir produto');
        if (!ok) return;
        try {
          await api(`/api/admin/products/${b.dataset.del}`, { method: 'DELETE' });
          toast('Produto excluído.', 'ok');
          loadProducts();
        } catch (err) {
          toast(err.message, 'err');
        }
      })
    );
  }

  el('productSearch').addEventListener('input', renderProducts);

  function fillCategoryOptions() {
    const cats = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
    el('categoryOptions').innerHTML = cats.map((c) => `<option value="${esc(c)}">`).join('');
  }

  function setPreview(url) {
    state.pendingImage = url || '';
    const box = el('pUploadBox');
    box.classList.toggle('has-image', !!url);
    el('pPreview').src = url || '';
  }

  function openProductModal(product) {
    fillCategoryOptions();
    state.editingId = product ? product.id : null;
    el('productModalTitle').textContent = product ? 'Editar produto' : 'Novo produto';
    el('pName').value = product ? product.name : '';
    el('pPrice').value = product ? moneyInput(product.price_cents) : '';
    // novo produto já vem com a categoria do tipo da loja (Marmitas x Perfumes)
    el('pCategory').value = product ? product.category : SEG.categoryPlaceholder;
    el('pDesc').value = product ? product.description : '';
    el('pOrder').value = product ? product.sort_order : state.products.length + 1;
    el('pActive').value = product ? String(product.active) : '1';
    el('pImageUrl').value = product && product.image_url && !product.image_url.startsWith('/uploads') ? product.image_url : '';
    setPreview(product ? product.image_url : '');
    openModal('productModal');
    setTimeout(() => el('pName').focus(), 100);
  }

  el('newProductBtn').addEventListener('click', () => openProductModal(null));

  el('pFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await uploadImage(file, (url) => {
      setPreview(url);
      el('pImageUrl').value = '';
    });
    e.target.value = '';
  });
  qsa('[data-pick-image]').forEach((b) => b.addEventListener('click', () => el('pFile').click()));
  el('pRemoveImage').addEventListener('click', () => {
    setPreview('');
    el('pImageUrl').value = '';
  });
  el('pImageUrl').addEventListener('input', () => setPreview(el('pImageUrl').value.trim()));

  async function uploadImage(file, cb) {
    if (file.size > 5 * 1024 * 1024) return toast('Imagem acima de 5 MB. Escolha uma menor.', 'err');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await fetch(apiUrl('/api/admin/upload'), { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no upload.');
      cb(data.url);
      toast('Imagem enviada.', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  el('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el('pSaveBtn');
    btn.disabled = true;
    const payload = {
      name: el('pName').value.trim(),
      price_cents: el('pPrice').value,
      description: el('pDesc').value.trim(),
      category: el('pCategory').value.trim(),
      image_url: state.pendingImage,
      sort_order: Number(el('pOrder').value) || 0,
      active: el('pActive').value === '1',
    };
    try {
      if (state.editingId) {
        await api(`/api/admin/products/${state.editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast('Produto atualizado.', 'ok');
      } else {
        await api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
        toast('Produto cadastrado.', 'ok');
      }
      closeModal('productModal');
      await loadProducts();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });

  /* ============================== PEDIDOS ============================== */
  const STATUS = {
    novo: 'Novo',
    em_preparo: 'Em preparo',
    saiu_entrega: 'Saiu para entrega',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  };
  const NEXT_STATUS = {
    novo: ['em_preparo', 'cancelado'],
    em_preparo: ['saiu_entrega', 'cancelado'],
    saiu_entrega: ['concluido'],
    concluido: [],
    cancelado: ['novo'],
  };

  qsa('#orderFilters [data-status]').forEach((b) =>
    b.addEventListener('click', () => {
      state.orderStatus = b.dataset.status;
      qsa('#orderFilters [data-status]').forEach((x) => x.classList.toggle('active', x === b));
      renderOrders();
    })
  );
  el('refreshOrders').addEventListener('click', () => loadOrders());

  async function loadOrders() {
    try {
      state.orders = await api('/api/admin/orders');
      renderOrders();
      updateStats();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  async function updateStats() {
    try {
      const s = await api('/api/admin/stats');
      el('statRow').innerHTML = `
        <div class="stat"><div class="k">Pedidos hoje</div><div class="v">${s.today.pedidos}</div><div class="s">${s.week.pedidos} nos últimos 7 dias</div></div>
        <div class="stat"><div class="k">Faturamento hoje</div><div class="v">${brl.format(s.today.total / 100)}</div><div class="s">${brl.format(s.week.total / 100)} na semana</div></div>
        <div class="stat"><div class="k">Em aberto</div><div class="v">${s.pending}</div><div class="s">novos + em preparo</div></div>`;
      const badge = el('navOrdersBadge');
      badge.hidden = s.pending === 0;
      badge.textContent = s.pending;
    } catch {
      /* silencioso */
    }
  }

  function renderOrders() {
    const list =
      state.orderStatus === 'todos'
        ? state.orders
        : state.orders.filter((o) => o.status === state.orderStatus);
    const box = el('ordersList');

    if (!list.length) {
      box.innerHTML = `<div class="empty-state">
        <h3>Nenhum pedido aqui</h3>
        <p>Os pedidos enviados pelo cardápio aparecem nesta tela automaticamente.</p>
        <a class="btn btn-ghost btn-sm" href="${API_PREFIX}/" target="_blank" rel="noopener">${esc(SEG.viewMenu)}</a>
      </div>`;
      return;
    }

    box.innerHTML = list
      .map((o) => {
        const items = o.items || [];
        return `<article class="order-card ${o.status}">
          <div class="oc-head">
            <span class="oc-code">${esc(o.code)}</span>
            <span class="oc-time">${esc(o.created_at_br)}</span>
            <span class="oc-status ${o.status}">${STATUS[o.status] || o.status}</span>
          </div>
          <div class="oc-body">
            <div>
              <div class="oc-items">
                ${items.map((i) => `<div class="oc-item"><span><strong>${i.qty}×</strong> ${esc(i.name)}</span><span>${brl.format((i.price_cents * i.qty) / 100)}</span></div>`).join('')}
              </div>
              <div class="oc-total"><span>Total</span><span>${brl.format(o.total_cents / 100)}</span></div>
              <div class="muted-sm" style="margin-top:4px">Subtotal ${brl.format(o.subtotal_cents / 100)} · ${
                o.fulfillment === 'pickup' ? 'Retirada' : `Entrega ${o.fee_cents ? brl.format(o.fee_cents / 100) : 'grátis'}`
              }</div>
            </div>
            <div class="oc-info">
              <div><span class="lab">Cliente</span><br>${esc(o.customer_name)} · ${esc(o.phone)}</div>
              ${
                o.fulfillment === 'delivery'
                  ? `<div><span class="lab">Endereço</span><br>${esc([o.address, o.complement].filter(Boolean).join(' - '))}${
                      o.neighborhood ? `<br><span class="muted-sm">${esc(o.neighborhood)}</span>` : ''
                    }</div>`
                  : `<div><span class="lab">Retirada</span><br>${esc(state.settings.business.address || 'No local')}</div>`
              }
              <div><span class="lab">Horário</span><br>${esc(o.period || '—')}</div>
              <div><span class="lab">Pagamento</span><br>${esc(o.payment_method)}</div>
              ${o.notes ? `<div><span class="lab">Observações</span><br>${esc(o.notes)}</div>` : ''}
            </div>
          </div>
          <div class="oc-actions">
            ${(NEXT_STATUS[o.status] || [])
              .map(
                (s) =>
                  `<button class="btn btn-sm ${s === 'cancelado' ? 'btn-ghost' : 'btn-primary'}" data-set-status="${o.id}" data-status="${s}">${
                    s === 'em_preparo'
                      ? 'Iniciar preparo'
                      : s === 'saiu_entrega'
                      ? 'Saiu para entrega'
                      : s === 'concluido'
                      ? 'Marcar como entregue'
                      : 'Cancelar'
                  }</button>`
              )
              .join('')}
            <button class="btn btn-sm btn-ghost" data-copy="${o.id}">Copiar resumo</button>
            <button class="btn btn-sm btn-wa" data-notify="${o.id}" data-kind="${
              o.status === 'concluido' ? 'delivered' : o.status === 'em_preparo' ? 'preparing' : o.status === 'saiu_entrega' ? 'out_for_delivery' : 'confirmed'
            }">💬 Avisar cliente no WhatsApp</button>
            <a class="btn btn-sm btn-ghost" href="tel:${esc(o.phone.replace(/\D/g, ''))}">Ligar</a>
          </div>
        </article>`;
      })
      .join('');

    qsa('[data-set-status]', box).forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          const orderId = b.dataset.setStatus;
          const newStatus = b.dataset.status;
          await api(`/api/admin/orders/${orderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus }),
          });
          toast('Status atualizado.', 'ok');
          const order = state.orders.find((x) => String(x.id) === String(orderId));
          await loadOrders();
          const KIND_BY_STATUS = {
            em_preparo: 'preparing',
            saiu_entrega: 'out_for_delivery',
            concluido: 'delivered',
            novo: 'confirmed',
          };
          // em qualquer mudança de status: convida a avisar o cliente no WhatsApp dele
          if (KIND_BY_STATUS[newStatus] && order) {
            const fresh = state.orders.find((x) => String(x.id) === String(orderId)) || order;
            openNotify(fresh, KIND_BY_STATUS[newStatus]);
          }
        } catch (err) {
          toast(err.message, 'err');
        }
      })
    );

    qsa('[data-notify]', box).forEach((b) =>
      b.addEventListener('click', () => {
        const o = state.orders.find((x) => String(x.id) === b.dataset.notify);
        if (o) openNotify(o, b.dataset.kind || 'out_for_delivery');
      })
    );

    qsa('[data-copy]', box).forEach((b) =>
      b.addEventListener('click', () => {
        const o = state.orders.find((x) => String(x.id) === b.dataset.copy);
        const txt = [
          `Pedido ${o.code} — ${o.customer_name}`,
          ...(o.items || []).map((i) => `${i.qty}x ${i.name}`),
          `Total: ${brl.format(o.total_cents / 100)}`,
          `${o.fulfillment === 'pickup' ? 'Retirada' : 'Entrega'} ${o.address || ''} - ${o.period}`,
        ].join('\n');
        navigator.clipboard.writeText(txt).then(
          () => toast('Resumo copiado.', 'ok'),
          () => toast('Não foi possível copiar.', 'err')
        );
      })
    );
  }

  /* ============================ CONFIGURAÇÕES ============================ */
  async function loadSettings() {
    try {
      const s = await api('/api/admin/settings');
      state.settings = s;
      const b = s.business || {};
      const d = s.delivery || {};

      el('bName').value = b.name || '';
      el('bTagline').value = b.tagline || '';
      el('bWhatsapp').value = b.whatsapp || '';
      el('bInstagram').value = b.instagram || '';
      el('bAddress').value = b.address || '';
      el('bAbout').value = b.about || '';
      state.business = { cover_url: b.cover_url || '', logo_url: b.logo_url || '', watermark_url: b.watermark_url || '' };
      el('logoPreview').src = b.logo_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
      if (el('watermarkPreview')) {
        el('watermarkPreview').src = b.watermark_url || b.logo_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
      }

      el('sideBusinessName').textContent = b.name || 'Painel';
      el('pwdBanner').hidden = !s.must_change;

      el('dFee').value = moneyInput(d.fee_cents);
      el('dFreeAbove').value = d.free_above_cents ? moneyInput(d.free_above_cents) : '';
      el('dPickup').value = d.pickup_enabled === false ? '0' : '1';
      accepting = d.accepting_orders !== false;
      closedMessage = d.closed_message || '';
      renderStatusCard();
      if (el('dAccepting')) {
        el('dAccepting').checked = accepting;
        el('dAcceptingText').textContent = accepting
          ? 'Aberto — clientes podem fazer pedidos'
          : 'Fechado — cardápio visível, pedidos bloqueados';
      }
      if (el('dClosedMsg')) el('dClosedMsg').value = closedMessage;
      el('dNote').value = d.periods_note || '';

      state.periods = (d.periods || []).map((p) => ({ ...p }));
      if (!state.periods.length) state.periods = [{ id: 'p1', label: '', active: true }];
      renderPeriods();

      state.settings.messages = s.messages || {};
      if (el('mOutForDelivery')) {
        el('mOutForDelivery').value = (s.messages && s.messages.out_for_delivery) || FALLBACK_MSG.out_for_delivery;
        el('mConfirmed').value = (s.messages && s.messages.confirmed) || FALLBACK_MSG.confirmed;
        el('mPreparing').value = (s.messages && s.messages.preparing) || FALLBACK_MSG.preparing;
        if (el('mDelivered')) el('mDelivered').value = (s.messages && s.messages.delivered) || FALLBACK_MSG.delivered;
      }

      state.payments = (s.payments || []).map((p) => ({ ...p }));
      renderPayments();

      renderLink();
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  if (el('dAccepting')) {
    el('dAccepting').addEventListener('change', () => {
      el('dAcceptingText').textContent = el('dAccepting').checked
        ? 'Aberto — clientes podem fazer pedidos'
        : 'Fechado — cardápio visível, pedidos bloqueados';
    });
  }

  /* --- períodos --- */
  function renderPeriods() {
    el('periodList').innerHTML = state.periods
      .map(
        (p, i) => `<div class="period-row">
        <input class="input" data-period-label="${i}" value="${esc(p.label)}" placeholder="Ex.: 12h30 às 13h30">
        <label class="switch" title="Ativo">
          <input type="checkbox" data-period-active="${i}" ${p.active ? 'checked' : ''}>
          <span class="track"></span>
        </label>
        <button type="button" class="icon-btn danger" data-period-del="${i}" title="Remover">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>`
      )
      .join('');

    qsa('[data-period-label]').forEach((inp) =>
      inp.addEventListener('input', () => {
        state.periods[Number(inp.dataset.periodLabel)].label = inp.value;
      })
    );
    qsa('[data-period-active]').forEach((chk) =>
      chk.addEventListener('change', () => {
        state.periods[Number(chk.dataset.periodActive)].active = chk.checked;
      })
    );
    qsa('[data-period-del]').forEach((b) =>
      b.addEventListener('click', () => {
        state.periods.splice(Number(b.dataset.periodDel), 1);
        renderPeriods();
      })
    );
  }
  el('addPeriodBtn').addEventListener('click', () => {
    state.periods.push({ id: `p${Date.now()}`, label: '', active: true });
    renderPeriods();
  });

  el('formBusiness').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          business: {
            name: el('bName').value,
            tagline: el('bTagline').value,
            whatsapp: el('bWhatsapp').value,
            instagram: el('bInstagram').value,
            address: el('bAddress').value,
            about: el('bAbout').value,
            logo_url: state.business.logo_url || '',
            cover_url: state.business.cover_url || '',
            watermark_url: state.business.watermark_url || '',
          },
        }),
      });
      toast('Dados do negócio salvos.', 'ok');
      el('sideBusinessName').textContent = el('bName').value || 'Painel';
      loadSettings();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  el('formDelivery').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({
          delivery: {
            fee_cents: el('dFee').value,
            free_above_cents: el('dFreeAbove').value,
            pickup_enabled: el('dPickup').value === '1',
            accepting_orders: el('dAccepting') ? el('dAccepting').checked : true,
            closed_message: el('dClosedMsg') ? el('dClosedMsg').value : '',
            periods: state.periods.filter((p) => p.label.trim()),
            periods_note: el('dNote').value,
          },
        }),
      });
      toast('Configurações de entrega salvas.', 'ok');
      loadSettings();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  /* --- pagamentos --- */
  function paymentWarnings() {
    // só exige link quem for pagamento ONLINE (na entrega não precisa)
    const online = (state.payments || []).filter(
      (p) => p.active && /online|link|pix autom|checkout/i.test(p.label || '') && !p.pay_url
    );
    const box = el('payWarn');
    if (!box) return;
    if (!online.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    box.innerHTML = `⚠️ <strong>${online.map((p) => esc(p.label)).join(', ')}</strong> está ativo mas <strong>sem link de pagamento</strong>.
      O cliente verá só a instrução. Cole o link abaixo (ou desative essa forma de pagamento).`;
  }

  function renderPayments() {
    el('payEditList').innerHTML = state.payments
      .map(
        (p, i) => `<div class="pay-edit-row">
        <div class="top">
          <input class="input" data-pay-label="${i}" value="${esc(p.label)}" placeholder="Ex.: Pix">
          <label class="switch" title="Ativo">
            <input type="checkbox" data-pay-active="${i}" ${p.active ? 'checked' : ''}>
            <span class="track"></span>
          </label>
          <button type="button" class="icon-btn danger" data-pay-del="${i}" title="Remover">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <input class="input" data-pay-note="${i}" value="${esc(p.instructions || '')}" placeholder="Instrução (opcional): troco, aviso, etc.">
        <input class="input" data-pay-key="${i}" value="${esc(p.key || '')}" placeholder="Chave Pix (e-mail, telefone, CPF/CNPJ ou aleatória) — o cliente vê e copia">
        <input class="input" data-pay-url="${i}" value="${esc(p.pay_url || '')}" placeholder="Link de pagamento online (opcional) — Mercado Pago, Asaas…">
        ${
          /cart/i.test(p.label || '')
            ? `<div class="pay-card-opts">
                 <label class="pay-check"><input type="checkbox" data-pay-credito="${i}" ${p.aceita_credito !== false ? 'checked' : ''}> Aceita crédito no local</label>
                 <label class="pay-check"><input type="checkbox" data-pay-debito="${i}" ${p.aceita_debito !== false ? 'checked' : ''}> Aceita débito no local</label>
               </div>`
            : ''
        }
        ${/dinheiro/i.test(p.label || '') ? `<div class="hint" style="margin:-2px 0 2px">O cliente escolhe no pedido se precisa de troco e para quanto.</div>` : ''}
      </div>`
      )
      .join('');

    qsa('[data-pay-label]').forEach((inp) =>
      inp.addEventListener('input', () => (state.payments[Number(inp.dataset.payLabel)].label = inp.value))
    );
    qsa('[data-pay-note]').forEach((inp) =>
      inp.addEventListener('input', () => (state.payments[Number(inp.dataset.payNote)].instructions = inp.value))
    );
    qsa('[data-pay-key]').forEach((inp) =>
      inp.addEventListener('input', () => (state.payments[Number(inp.dataset.payKey)].key = inp.value))
    );
    qsa('[data-pay-url]').forEach((inp) =>
      inp.addEventListener('input', () => (state.payments[Number(inp.dataset.payUrl)].pay_url = inp.value))
    );
    qsa('[data-pay-credito]').forEach((chk) =>
      chk.addEventListener('change', () => (state.payments[Number(chk.dataset.payCredito)].aceita_credito = chk.checked))
    );
    qsa('[data-pay-debito]').forEach((chk) =>
      chk.addEventListener('change', () => (state.payments[Number(chk.dataset.payDebito)].aceita_debito = chk.checked))
    );
    qsa('[data-pay-active]').forEach((chk) =>
      chk.addEventListener('change', () => (state.payments[Number(chk.dataset.payActive)].active = chk.checked))
    );
    paymentWarnings();

    qsa('[data-pay-del]').forEach((b) =>
      b.addEventListener('click', () => {
        state.payments.splice(Number(b.dataset.payDel), 1);
        renderPayments();
      })
    );
  }
  el('addPaymentBtn').addEventListener('click', () => {
    state.payments.push({ id: `pay${Date.now()}`, label: '', instructions: '', key: '', pay_url: '', active: true });
    renderPayments();
  });
  el('savePaymentsBtn').addEventListener('click', async () => {
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ payments: state.payments.filter((p) => p.label.trim()) }),
      });
      toast('Formas de pagamento salvas.', 'ok');
      loadSettings();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  if (el('saveMessagesBtn')) {
    el('saveMessagesBtn').addEventListener('click', async () => {
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            messages: {
              out_for_delivery: el('mOutForDelivery').value,
              confirmed: el('mConfirmed').value,
              preparing: el('mPreparing').value,
              delivered: el('mDelivered') ? el('mDelivered').value : '',
            },
          }),
        });
        state.settings.messages = {
          out_for_delivery: el('mOutForDelivery').value,
          confirmed: el('mConfirmed').value,
          preparing: el('mPreparing').value,
          delivered: el('mDelivered') ? el('mDelivered').value : '',
        };
        toast('Mensagens salvas.', 'ok');
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  }

  /* --- upload do logo da loja --- */
  qsa('[data-upload]').forEach((b) => b.addEventListener('click', () => el('logoFile').click()));
  el('logoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    await uploadImage(f, async (url) => {
      state.business.logo_url = url;
      el('logoPreview').src = url;
      // atualiza na hora o logo do topo do painel e a foto pronta para enviar
      for (const id of ['sideLogo', 'loginLogo', 'mobLogo']) {
        const img = el(id);
        if (img) img.src = url;
      }
      await saveBusinessImages();
      atualizarCartao();
      toast('Logo atualizada! Já aparece no cardápio de todos os clientes.', 'ok');
    });
    e.target.value = '';
  });

  /* --- marca d'água do topo: a loja escolhe a imagem que quiser --- */
  if (el('watermarkBtn')) {
    el('watermarkBtn').addEventListener('click', () => el('watermarkFile').click());
    el('watermarkFile').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      await uploadImage(f, async (url) => {
        state.business.watermark_url = url;
        el('watermarkPreview').src = url;
        await saveBusinessImages();
        toast("Marca d'água atualizada! Já aparece no topo da página dos clientes.", 'ok');
      });
      e.target.value = '';
    });
    el('watermarkRemover').addEventListener('click', async () => {
      state.business.watermark_url = '';
      if (state.business.logo_url) el('watermarkPreview').src = state.business.logo_url;
      await saveBusinessImages();
      toast("Voltou a usar o seu logo como marca d'água.", 'ok');
    });
  }

  /**
   * Trocar a foto de um produto direto na lista do painel
   * (sem abrir o formulário inteiro).
   */
  async function trocarFotoDoProduto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const id = state.editingId;
      try {
        const url = await new Promise((resolve, reject) => {
          const fd = new FormData();
          fd.append('image', f);
          fetch(apiUrl('/api/admin/upload'), { method: 'POST', body: fd })
            .then((r) => r.json().then((j) => (r.ok ? resolve(j.url) : reject(new Error(j.error || 'Falha no envio')))))
            .catch(reject);
        });
        const atual = state.products.find((x) => String(x.id) === String(id));
        if (!atual) return;
        await api(`/api/admin/products/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: atual.name,
            description: atual.description,
            price_cents: atual.price_cents,
            category: atual.category,
            active: atual.active,
            sort_order: atual.sort_order,
            image_url: url,
          }),
        });
        await loadProducts();
        toast('Foto do produto atualizada! Já aparece para todos os clientes.', 'ok');
      } catch (err) {
        toast(err.message, 'err');
      }
    };
    input.click();
  }
  async function saveBusinessImages() {
    try {
      await api('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ business: { ...state.settings.business, ...state.business } }),
      });
      toast('Imagem atualizada no cardápio.', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    }
  }

  /* --- link e QR --- */
  function renderLink() {
    const url = `${location.origin}${API_PREFIX}/`;
    el('menuLink').value = url;
    el('openLinkBtn').href = url;

    // mostra o endereço completo (sem cortar) e de quem é o link
    const loja = (state.settings.business.name || '').trim() || document.title.replace('Painel ·', '').trim();
    const dono = el('linkStoreName');
    if (dono) dono.textContent = loja;
    const hint = el('linkPathHint');
    if (hint) hint.textContent = `· link do ${SEG.word} desta loja`;
    const txt = el('menuLinkText');
    if (txt) {
      const curto = `${location.host}${API_PREFIX}/`;
      txt.innerHTML = `${esc(location.protocol + '//')}<b>${esc(curto)}</b>`;
    }
    const msg = `${loja} — ${SEG.brandSuffix} 😊\nConfira e peça por aqui: ${url}`;
    el('waShareBtn').href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    el('qrImg').src = `/api/admin/qr?url=${encodeURIComponent(url)}&t=${Date.now()}`;
    el('qrDownload').href = el('qrImg').src;
    atualizarCartao();
  }
  /* ---------------- cartão pronto para enviar (foto + link) ---------------- */
  function carregarImagem(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function quebrarTexto(ctx, texto, larguraMax) {
    const palavras = String(texto).split(' ');
    const linhas = [];
    let linha = '';
    for (const p of palavras) {
      const teste = linha ? linha + ' ' + p : p;
      if (ctx.measureText(teste).width > larguraMax && linha) {
        linhas.push(linha);
        linha = p;
      } else {
        linha = teste;
      }
    }
    if (linha) linhas.push(linha);
    return linhas;
  }

  function rredondo(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Desenha o cartão (1080x1350 — formato de foto do WhatsApp). */
  async function desenharCartao() {
    const url = el('menuLink').value;
    const b = state.settings.business || {};
    const nome = (b.name || document.title.replace('Painel ·', '')).trim();
    const frase = (b.tagline || b.about || SEG.taglinePlaceholder || '').trim();
    const W = 1080;
    const H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');

    // fundo
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#12352a');
    grd.addColorStop(0.55, '#0d2a21');
    grd.addColorStop(1, '#081b15');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    // brilho dourado no topo
    const brilho = ctx.createRadialGradient(W / 2, 120, 40, W / 2, 120, 700);
    brilho.addColorStop(0, 'rgba(231,207,155,.30)');
    brilho.addColorStop(1, 'rgba(231,207,155,0)');
    ctx.fillStyle = brilho;
    ctx.fillRect(0, 0, W, 780);

    // moldura
    ctx.strokeStyle = 'rgba(231,207,155,.5)';
    ctx.lineWidth = 4;
    rredondo(ctx, 30, 30, W - 60, H - 60, 34);
    ctx.stroke();

    ctx.textAlign = 'center';

    // logo
    const logoUrl = b.logo_url || '';
    const logo = logoUrl ? await carregarImagem(logoUrl) : null;
    if (logo) {
      const L = 210;
      ctx.save();
      rredondo(ctx, W / 2 - L / 2, 88, L, L, 105);
      ctx.clip();
      ctx.drawImage(logo, W / 2 - L / 2, 88, L, L);
      ctx.restore();
      ctx.strokeStyle = 'rgba(231,207,155,.85)';
      ctx.lineWidth = 5;
      rredondo(ctx, W / 2 - L / 2, 88, L, L, 105);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(231,207,155,.16)';
      ctx.beginPath();
      ctx.arc(W / 2, 193, 105, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e7cf9b';
      ctx.font = '700 96px Georgia, serif';
      ctx.fillText((nome || '·').charAt(0).toUpperCase(), W / 2, 230);
    }

    // nome da loja
    ctx.fillStyle = '#f7f2e6';
    ctx.font = '700 74px Georgia, "Times New Roman", serif';
    let linhasNome = quebrarTexto(ctx, nome, W - 180);
    let y = 380;
    for (const l of linhasNome.slice(0, 2)) {
      ctx.fillText(l, W / 2, y);
      y += 84;
    }

    // tipo (Cardápio / Catálogo)
    ctx.fillStyle = '#e7cf9b';
    ctx.font = '600 40px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText(SEG.brandSuffix, W / 2, y + 10);
    y += 62;

    // frase
    if (frase) {
      ctx.fillStyle = 'rgba(247,242,230,.78)';
      ctx.font = '400 32px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      const fl = quebrarTexto(ctx, frase, W - 240);
      for (const l of fl.slice(0, 2)) {
        ctx.fillText(l, W / 2, y + 16);
        y += 44;
      }
    }

    // painel branco com o QR Code
    const qrPx = 380;
    const painelW = 620;
    const painelH = qrPx + 100;
    const py = 640;
    const px = (W - painelW) / 2;
    ctx.fillStyle = '#f7f2e6';
    rredondo(ctx, px, py, painelW, painelH, 40);
    ctx.fill();

    const qr = await carregarImagem(`/api/admin/qr?url=${encodeURIComponent(url)}&t=${Date.now()}`);
    const qx = W / 2 - qrPx / 2;
    const qy = py + 50;
    if (qr) {
      ctx.drawImage(qr, qx, qy, qrPx, qrPx);
    } else {
      ctx.fillStyle = '#12352a';
      ctx.font = '500 28px system-ui, sans-serif';
      ctx.fillText('QR Code indisponível', W / 2, qy + qrPx / 2);
    }

    // instrução
    ctx.fillStyle = 'rgba(247,242,230,.85)';
    ctx.font = '400 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillText('Aponte a câmera do celular', W / 2, py + painelH + 62);

    // rodapé com o WhatsApp
    const wpp = String(b.whatsapp || '').replace(/\D/g, '').replace(/^55/, '');
    if (wpp.length >= 10) {
      const fmt = `WhatsApp ${wpp.slice(0, 2)} ${wpp.slice(2, 7)}-${wpp.slice(7)}`;
      ctx.fillStyle = 'rgba(247,242,230,.8)';
      ctx.font = '600 30px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillText(fmt, W / 2, H - 54);
    }

    return cv;
  }

  async function atualizarCartao() {
    const prev = el('cardPreview');
    if (!prev) return;
    try {
      const cv = await desenharCartao();
      prev.src = cv.toDataURL('image/png');
    } catch {
      prev.alt = 'Não foi possível montar a foto agora';
    }
  }

  async function baixarCartao() {
    try {
      const cv = await desenharCartao();
      const nome = ((state.settings.business || {}).name || 'loja')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const a = document.createElement('a');
      a.download = `${nome}-${SEG.word}.png`;
      a.href = cv.toDataURL('image/png');
      a.click();
      toast('Foto baixada! Agora é só enviar no WhatsApp junto com o link.', 'ok');
    } catch (err) {
      toast('Não foi possível gerar a foto: ' + err.message, 'err');
    }
  }

  async function copiarCartao() {
    try {
      const cv = await desenharCartao();
      const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Imagem copiada! Cole no WhatsApp.', 'ok');
    } catch {
      toast('Seu navegador não permite copiar imagem. Use "Baixar foto com o link".', 'err');
    }
  }

  el('downloadCardBtn').addEventListener('click', baixarCartao);
  el('copyImgBtn').addEventListener('click', copiarCartao);

  el('copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el('menuLink').value);
      toast('Link copiado!', 'ok');
    } catch {
      const tmp = document.createElement('textarea');
      tmp.value = el('menuLink').value;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      tmp.remove();
      toast('Link copiado!', 'ok');
    }
  });

  /* --- senha --- */
  el('formPassword').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: el('pCurrent').value,
          new_password: el('pNew').value,
        }),
      });
      toast('Senha alterada com sucesso.', 'ok');
      el('pCurrent').value = '';
      el('pNew').value = '';
      el('pwdBanner').hidden = true;
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  /* ------------------------------ start ------------------------------ */
  async function start() {
    await Promise.all([loadProducts(), loadSettings()]);
    updateStats();
    ligarAtualizacaoAutomatica();
  }

  /**
   * O painel se atualiza sozinho: pedido novo que chegou pelo celular de um
   * cliente aparece aqui em até 20s, sem apertar nada.
   * (Não recarrega enquanto o dono está com o formulário de produto aberto,
   * para não apagar o que ele está digitando.)
   */
  let atualizacaoLigada = false;
  function ligarAtualizacaoAutomatica() {
    if (atualizacaoLigada) return;
    atualizacaoLigada = true;
    setInterval(async () => {
      if (document.hidden) return;
      const modalAberto = document.querySelector('.modal-backdrop:not([hidden]), .modal[style*="flex"]');
      if (modalAberto || state.editingId) return;
      try {
        state.orders = await api('/api/admin/orders');
        renderOrders();
        updateStats();
      } catch {
        /* tenta de novo depois */
      }
    }, 20000);
  }

  (async function boot() {
    try {
      const [s, menu] = await Promise.all([
        fetch(apiUrl('/api/admin/session')).then((r) => r.json()).catch(() => ({})),
        fetch(apiUrl('/api/menu')).then((r) => r.json()).catch(() => null),
      ]);
      applyBranding(menu);
      if (s.logged || s.authenticated) {
        showApp();
        await start();
      } else {
        showLogin();
      }
    } catch {
      showLogin();
    }
  })();
})();
