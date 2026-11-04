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
    saboresEdit: [],
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

    /* Loja de doces (ex.: confeitaria) tem as suas próprias palavras.
       Todo o resto continua exatamente como era. */
    const ehDoces = ((state.business && state.business.ramo) || '') === 'doces';
    if (ehDoces) {
      setText('productsSub', 'Cadastre, edite e organize os doces. O cardápio online atualiza na hora.');
    }
    const catsDaLoja = ehDoces ? ((state.menu && state.menu.categories) || []).filter(Boolean) : [];
    const primeira = catsDaLoja[0] || '';

    setPlaceholder('pName', SEG.namePlaceholder);
    setPlaceholder('pCategory', primeira || SEG.categoryPlaceholder);
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
    const sugestoes = Array.from(new Set([...catsDaLoja, ...SEG.categories]));
    if (dl) dl.innerHTML = sugestoes.map((c) => `<option value="${esc(c)}"></option>`).join('');

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
    if (view === 'vendas') loadVendas();
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
    aplicarVisibilidadeSabores(null); // loja sem sabores não mostra o recurso (ex.: perfumes)
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
        <h3>${state.products.length ? 'Nenhum produto encontrado' : (state.segment === 'catalogo' ? 'Seu catálogo está vazio' : 'Seu cardápio está vazio')}</h3>
        <p>${state.products.length ? 'Tente outro termo de busca.' : (state.segment === 'catalogo' ? 'Cadastre seu primeiro produto para começar a vender.' : 'Cadastre sua primeira marmita para começar a vender.')}</p>
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
            ${
              p.opcoes && p.opcoes.ativo
                ? `<span class="tag" style="background:#eef4ff;border-color:#cfe0ff;color:#1d4ed8">cliente escolhe · ${p.opcoes.unidades || 0} un.</span>`
                : ''
            }
          </div>
        </div>
        <div class="p-actions">
          <label class="switch" title="${p.active ? `Visível no ${SEG.word}` : 'Oculto'}">
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
          toast(chk.checked ? `Produto visível no ${SEG.word}.` : `Produto oculto do ${SEG.word}.`, 'ok');
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
        const ok = await showConfirm(`Excluir "${p.name}" do ${SEG.word}? Essa ação não pode ser desfeita.`, 'Excluir produto');
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
    // novo produto: se a loja já tem categorias, deixa em branco (ela escolhe);
    // se é loja nova, sugere a categoria do tipo de negócio
    el('pCategory').value = product ? product.category : '';
    el('pDesc').value = product ? product.description : '';
    el('pOrder').value = product ? product.sort_order : state.products.length + 1;
    el('pActive').value = product ? String(product.active) : '1';
    el('pImageUrl').value = product && product.image_url && !product.image_url.startsWith('/uploads') ? product.image_url : '';
    setPreview(product ? product.image_url : '');

    // montagem de caixa (sabores)
    aplicarVisibilidadeSabores(product);
    if (el('pMontagemAtiva')) {
      const op = (product && product.opcoes) || null;
      el('pMontagemAtiva').checked = !!(op && op.ativo);
      el('pMontagemBox').hidden = !(op && op.ativo);
      el('pMontagemTitulo').value = (op && op.titulo) || 'Escolha os sabores';
      el('pMontagemUnidades').value = (op && op.unidades) || 12;
      if (el('pMontagemBarras')) el('pMontagemBarras').value = (op && op.barras) || 1;
      const modoSalvo = (op && op.modo) === 'sabores' ? 'sabores' : 'partes';
      qsa('input[name="pMontagemModo"]').forEach((r) => (r.checked = r.value === modoSalvo));
      aplicarRotulosModo();
      state.saboresEdit = (op && op.sabores ? op.sabores : []).map((sb) => ({ ...sb }));
      renderSabores(state.saboresEdit);
    }
    openModal('productModal');
    setTimeout(() => el('pName').focus(), 100);
  }

  el('newProductBtn').addEventListener('click', () => openProductModal(null));

  // atalho: já abre o formulário com a montagem ligada, pronto para colar os sabores
  if (el('newBoxBtn')) {
    el('newBoxBtn').addEventListener('click', () => {
      openProductModal(null);
      el('productModalTitle').textContent = 'Nova caixa com sabores';
      el('pName').value = 'Caixa de bombons';
      el('pMontagemAtiva').checked = true;
      el('pMontagemBox').hidden = false;
      el('pMontagemTitulo').value = 'Escolha os sabores';
      el('pMontagemUnidades').value = 12;
      qsa('input[name="pMontagemModo"]').forEach((r) => (r.checked = r.value === 'partes'));
      aplicarRotulosModo();
      state.saboresEdit = state.saboresEdit.length ? state.saboresEdit : [];
      renderSabores(state.saboresEdit);
      setTimeout(() => {
        el('pSaboresCola')?.focus();
        atualizarPreviewMontagem();
      }, 120);
    });
  }

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


  /* ---------------- montagem de caixa (sabores) ---------------- */
  function renderSabores(sabores) {
    const box = el('pSaboresLista');
    if (!box) return;
    box.innerHTML = (sabores || [])
      .map(
        (sb, i) => `<div class="sabor-row" data-sabor="${i}" style="display:grid;grid-template-columns:1fr 120px auto;gap:6px;align-items:center">
          <input class="input" data-sabor-nome="${i}" value="${esc(sb.nome || '')}" placeholder="Ex.: Beijinho">
          <input class="input" data-sabor-extra="${i}" inputmode="decimal" value="${sb.extra_cents ? (sb.extra_cents / 100).toFixed(2).replace('.', ',') : ''}" placeholder="+ R$ (0,00)">
          <button type="button" class="icon-btn danger" data-sabor-del="${i}" title="Remover">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>`
      )
      .join('');

    box.querySelectorAll('[data-sabor-nome]').forEach((inp) =>
      inp.addEventListener('input', () => {
        state.saboresEdit[Number(inp.dataset.saborNome)].nome = inp.value;
        atualizarPreviewMontagem();
      })
    );
    box.querySelectorAll('[data-sabor-extra]').forEach((inp) =>
      inp.addEventListener('input', () => {
        const bruto = String(inp.value || '').replace(/\./g, '').replace(',', '.');
        state.saboresEdit[Number(inp.dataset.saborExtra)].extra_cents = Math.max(
          0,
          Math.round(Number(bruto || 0) * 100)
        );
      })
    );
    box.querySelectorAll('[data-sabor-del]').forEach((b) =>
      b.addEventListener('click', () => {
        state.saboresEdit.splice(Number(b.dataset.saborDel), 1);
        renderSabores(state.saboresEdit);
      })
    );
    atualizarPreviewMontagem();
  }

  /**
   * A loja trabalha com sabores (caixas de doces, bombons, barras)?
   * Só nesse caso o painel mostra o bloco "Cliente escolhe os sabores".
   * Loja de perfumes, presentes ou serviços nunca vê essa opção.
   */
  function lojaUsaSabores(produto) {
    if (state.segment === 'food') return true;
    if (produto && produto.opcoes && produto.opcoes.ativo) return true;
    return (state.products || []).some((p) => p.opcoes && p.opcoes.ativo);
  }

  /** Mostra/esconde o bloco de sabores e o botão "Nova caixa com sabores". */
  function aplicarVisibilidadeSabores(produto) {
    const usa = lojaUsaSabores(produto);
    if (el('pMontagemWrap')) el('pMontagemWrap').hidden = !usa;
    if (el('newBoxBtn')) el('newBoxBtn').hidden = !usa;
    if (!usa && el('pMontagemAtiva')) {
      el('pMontagemAtiva').checked = false;
      if (el('pMontagemBox')) el('pMontagemBox').hidden = true;
    }
    return usa;
  }

  /** Modo da escolha: "partes" (quantidade por sabor) ou "sabores" (barra: até N sabores). */
  function montagemModoAtual() {
    const marcado = qsa('input[name="pMontagemModo"]').find((r) => r.checked);
    return marcado ? marcado.value : 'partes';
  }

  function aplicarRotulosModo() {
    const modo = montagemModoAtual();
    const label = el('pMontagemUnidadesLabel');
    const hint = el('pMontagemHint');
    const wrapBarras = el('pMontagemBarrasWrap');
    if (wrapBarras) wrapBarras.hidden = modo !== 'sabores';
    if (label) label.textContent = modo === 'sabores' ? 'Quantos sabores o cliente pode escolher?' : 'Quantas unidades vêm na caixa?';
    if (hint) {
      hint.innerHTML =
        modo === 'sabores'
          ? 'Ex.: barra grande dividida em 4 pedaços → <strong>4</strong> sabores. O cliente escolhe de 1 até esse número.'
          : 'A quantidade é o que o cliente vê no cardápio. Ex.: caixa de 12 → ele pode escolher 10 de um sabor + 2 de outro; o total precisa fechar em <strong id="pMontagemQtdHint">' +
            (Number(el('pMontagemUnidades')?.value) || 0) +
            '</strong>.';
    }
  }

  /** Mostra, em tempo real, o que o cliente vai ver no cardápio. */
  function atualizarPreviewMontagem() {
    const box = el('pMontagemPreview');
    const hintQtd = el('pMontagemQtdHint');
    if (!box) return;
    const unidades = Math.max(0, Number(el('pMontagemUnidades')?.value) || 0);
    if (hintQtd) hintQtd.textContent = String(unidades || 0);
    if (!el('pMontagemAtiva')?.checked) {
      box.textContent = 'Desligado — este produto não pede escolha de sabores.';
      return;
    }
    const titulo = (el('pMontagemTitulo').value || 'Escolha os sabores').trim();
    const sabores = (state.saboresEdit || []).map((sb) => String(sb.nome || '').trim()).filter(Boolean);
    if (!unidades || !sabores.length) {
      box.innerHTML = '<span style="color:#b3261e">Preencha a quantidade e pelo menos 1 sabor para o cliente poder montar a caixa.</span>';
      return;
    }
    const modo = montagemModoAtual();
    const exemplo = (() => {
      if (modo === 'sabores') {
        const quantos = Math.min(unidades, sabores.length);
        return sabores.slice(0, quantos).join(' + ') || sabores[0];
      }
      if (sabores.length === 1) return `${unidades} ${sabores[0]}`;
      const primeiro = Math.max(1, unidades - 2);
      return `${primeiro} ${sabores[0]} + ${unidades - primeiro} ${sabores[1]}`;
    })();
    const barras = Math.max(1, Number(el('pMontagemBarras')?.value) || 1);
    const legenda =
      modo === 'sabores'
        ? `${barras} ${barras === 1 ? 'barra' : 'barras'} · até ${unidades} sabores`
        : `${unidades} unidade${unidades > 1 ? 's' : ''}`;
    box.innerHTML = `
      <div><strong>${esc(titulo)}</strong> · ${legenda}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin:6px 0">
        ${sabores.map((n) => `<span style="background:#f3eee2;border:1px solid #e2dac6;border-radius:999px;padding:2px 9px;font-size:12px">${esc(n)}</span>`).join('')}
      </div>
      <div style="color:#6b6355;font-size:12.5px">${modo === 'sabores' ? 'O cliente escolhe assim' : 'O cliente monta assim'}: <strong style="color:#3f3a30">${esc(exemplo)}</strong></div>`;
  }

  function montagemDoFormulario() {
    if (!el('pMontagemAtiva').checked) return null;
    const modo = montagemModoAtual();
    const unidades = Number(el('pMontagemUnidades').value) || 0;
    return {
      ativo: true,
      modo,
      titulo: el('pMontagemTitulo').value.trim(),
      unidades,
      barras: modo === 'sabores' ? Math.max(1, Number(el('pMontagemBarras').value) || 1) : 1,
      // barra: pode escolher de 1 até "unidades" sabores; caixa: fecha o total
      minimo: modo === 'sabores' ? Math.min(2, unidades) : unidades,
      sabores: state.saboresEdit.filter((sb) => String(sb.nome || '').trim()),
    };
  }

  if (el('pMontagemAtiva')) {
    el('pMontagemAtiva').addEventListener('change', () => {
      el('pMontagemBox').hidden = !el('pMontagemAtiva').checked;
      if (el('pMontagemAtiva').checked && !state.saboresEdit.length) {
        state.saboresEdit = [{ nome: '', extra_cents: 0 }];
        renderSabores(state.saboresEdit);
      }
      atualizarPreviewMontagem();
    });
    qsa('input[name="pMontagemModo"]').forEach((r) =>
      r.addEventListener('change', () => {
        aplicarRotulosModo();
        atualizarPreviewMontagem();
      })
    );
    el('pMontagemTitulo').addEventListener('input', atualizarPreviewMontagem);
    el('pMontagemUnidades').addEventListener('input', atualizarPreviewMontagem);
    if (el('pMontagemBarras')) el('pMontagemBarras').addEventListener('input', atualizarPreviewMontagem);
    el('pSaborAdd').addEventListener('click', () => {
      state.saboresEdit.push({ nome: '', extra_cents: 0 });
      renderSabores(state.saboresEdit);
    });

    // colar vários sabores de uma vez: "Prestígio, Brigadeiro, Beijinho"
    const preencherLista = () => {
      const bruto = String(el('pSaboresCola').value || '').trim();
      if (!bruto) return;
      const nomes = bruto
        .split(/[,;\n]+/)
        .map((n) => n.trim())
        .filter(Boolean);
      const jaTem = new Set(state.saboresEdit.map((sb) => String(sb.nome || '').trim().toLowerCase()));
      for (const nome of nomes) {
        if (jaTem.has(nome.toLowerCase())) continue;
        state.saboresEdit.push({ nome, extra_cents: 0 });
        jaTem.add(nome.toLowerCase());
      }
      // remove linhas vazias que sobraram
      state.saboresEdit = state.saboresEdit.filter((sb) => String(sb.nome || '').trim());
      el('pSaboresCola').value = '';
      renderSabores(state.saboresEdit);
      toast(`${nomes.length} sabor(es) adicionado(s).`, 'ok');
    };
    el('pSaboresColaBtn').addEventListener('click', preencherLista);
    el('pSaboresCola').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        preencherLista();
      }
    });
  }

  el('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    // confere a caixa antes de salvar
    if (el('pMontagemAtiva') && el('pMontagemAtiva').checked) {
      const unidades = Number(el('pMontagemUnidades').value) || 0;
      const sabores = (state.saboresEdit || []).map((sb) => String(sb.nome || '').trim()).filter(Boolean);
      const iguais = new Set(sabores.map((n) => n.toLowerCase()));
      if (iguais.size !== sabores.length) return toast('Tem sabor repetido na lista. Tire o repetido para continuar.', 'err');
      if (montagemModoAtual() === 'sabores' && sabores.length < 2)
        return toast('Cadastre pelo menos 2 sabores para a barra — o cliente escolhe entre eles.', 'err');
      if (unidades < 2) return toast('Coloque quantas unidades vêm na caixa (2 ou mais).', 'err');
      if (sabores.length < 2) return toast('Cadastre pelo menos 2 sabores para o cliente poder montar.', 'err');
    }
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
      opcoes: montagemDoFormulario(),
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

  /* ------------------------------- vendas ------------------------------- */
  let vendas = null;
  let vendasPeriodo = 'today';

  const nomeMes = (d) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  function desenharVendas() {
    if (!vendas || !el('vendasCards')) return;
    const dados = vendas[vendasPeriodo] || { pedidos: 0, itens: 0, total_cents: 0, ticket_cents: 0 };
    const rotulo = { today: 'hoje', week: 'nos últimos 7 dias', month: 'neste mês' }[vendasPeriodo];
    const variacao = (() => {
      if (vendasPeriodo !== 'month') return '';
      const antes = vendas.mes_anterior ? vendas.mes_anterior.total_cents : 0;
      if (!antes) return dados.total_cents ? 'primeiro mês com venda' : '';
      const dif = ((dados.total_cents - antes) / antes) * 100;
      const sinal = dif >= 0 ? '+' : '';
      return `${sinal}${dif.toFixed(0)}% vs. mês passado (${brl.format(antes / 100)})`;
    })();

    el('vendasCards').innerHTML = `
      <div class="stat">
        <div class="k">Faturamento ${rotulo}</div>
        <div class="v">${brl.format(dados.total_cents / 100)}</div>
        <div class="s">${variacao || `ticket médio ${brl.format(dados.ticket_cents / 100)}`}</div>
      </div>
      <div class="stat">
        <div class="k">Pedidos ${rotulo}</div>
        <div class="v">${dados.pedidos}</div>
        <div class="s">${vendas.pending} em aberto agora</div>
      </div>
      <div class="stat">
        <div class="k">Itens vendidos ${rotulo}</div>
        <div class="v">${dados.itens}</div>
        <div class="s">soma das quantidades dos pedidos</div>
      </div>
      <div class="stat">
        <div class="k">Ticket médio</div>
        <div class="v">${brl.format(dados.ticket_cents / 100)}</div>
        <div class="s">por pedido</div>
      </div>`;

    // mais vendidos do mês
    const top = vendas.mais_vendidos || [];
    el('mesNome').textContent = nomeMes(new Date());
    el('maisVendidos').innerHTML = top.length
      ? top
          .map((t, i) => {
            const max = top[0].qtd || 1;
            const pct = Math.max(6, Math.round((t.qtd / max) * 100));
            return `<div style="margin-bottom:9px">
              <div style="display:flex;justify-content:space-between;gap:10px;font-size:13.5px">
                <span>${i + 1}. ${esc(t.nome)}</span>
                <strong>${t.qtd} un · ${brl.format(t.total_cents / 100)}</strong>
              </div>
              <div style="height:6px;background:#f0ece2;border-radius:99px;margin-top:4px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:#8a6d3b;border-radius:99px"></div>
              </div>
            </div>`;
          })
          .join('')
      : '<em>Ainda não há vendas neste mês.</em>';

    // gráfico dos 14 dias
    const serie = vendas.serie_14_dias || [];
    const maior = Math.max(1, ...serie.map((d) => d.total_cents));
    el('grafico14').innerHTML = serie
      .map((d) => {
        const alt = Math.max(3, Math.round((d.total_cents / maior) * 100));
        const rotuloDia = d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7);
        const cheio = d.total_cents > 0;
        return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%" title="${rotuloDia}: ${brl.format(d.total_cents / 100)} · ${d.itens} item(ns)">
          <div style="width:100%;height:${alt}%;background:${cheio ? '#8a6d3b' : '#eee8dc'};border-radius:5px 5px 2px 2px"></div>
        </div>`;
      })
      .join('');
    const primeiro = serie.length ? serie[0].dia.slice(8, 10) + '/' + serie[0].dia.slice(5, 7) : '';
    const ultimo = serie.length ? serie[serie.length - 1].dia.slice(8, 10) + '/' + serie[serie.length - 1].dia.slice(5, 7) : '';
    el('grafico14Legenda').innerHTML = `<span>${primeiro}</span><span>${ultimo}</span>`;
  }

  async function loadVendas() {
    try {
      vendas = await api('/api/admin/stats');
      desenharVendas();
    } catch (err) {
      if (el('vendasCards')) el('vendasCards').innerHTML = `<div class="hint">Não foi possível carregar: ${esc(err.message)}</div>`;
    }
  }

  qsa('#vendasPeriodo [data-periodo]').forEach((b) =>
    b.addEventListener('click', () => {
      vendasPeriodo = b.dataset.periodo;
      qsa('#vendasPeriodo [data-periodo]').forEach((x) => x.classList.toggle('active', x === b));
      desenharVendas();
    })
  );
  if (el('refreshVendas')) el('refreshVendas').addEventListener('click', loadVendas);
  if (el('baixarRelatorio'))
    el('baixarRelatorio').setAttribute('href', apiUrl('/api/admin/vendas/relatorio.csv'));

  /** Resumo do topo (aba Cardápio): hoje e semana, com itens vendidos. */
  async function updateStats() {
    try {
      const s = await api('/api/admin/stats');
      el('statRow').innerHTML = `
        <div class="stat"><div class="k">Faturamento hoje</div><div class="v">${brl.format(s.today.total_cents / 100)}</div><div class="s">${brl.format(s.week.total_cents / 100)} nos últimos 7 dias</div></div>
        <div class="stat"><div class="k">Pedidos hoje</div><div class="v">${s.today.pedidos}</div><div class="s">${s.week.pedidos} nos últimos 7 dias</div></div>
        <div class="stat"><div class="k">Itens vendidos hoje</div><div class="v">${s.today.itens}</div><div class="s">${s.week.itens} nos últimos 7 dias</div></div>
        <div class="stat"><div class="k">Faturamento no mês</div><div class="v">${brl.format(s.month.total_cents / 100)}</div><div class="s">${s.month.itens} itens · ${s.month.pedidos} pedidos</div></div>
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
              <div><span class="lab">Pagamento</span><br>${esc(o.payment_method)}${
                o.payment_status
                  ? ` <span class="pay-badge ${esc(o.payment_status)}">${esc(
                      { pago: 'PAGO', em_analise: 'EM ANÁLISE', recusado: 'RECUSADO', estornado: 'ESTORNADO', cancelado: 'CANCELADO', autorizado: 'AUTORIZADO' }[
                        o.payment_status
                      ] || String(o.payment_status).toUpperCase()
                    )}</span>`
                  : ''
              }</div>
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
            <a class="btn btn-sm btn-ghost" href="${API_PREFIX}/comprovante/${encodeURIComponent(o.code)}" target="_blank" rel="noopener"
               title="Comprovante de pagamento deste pedido">🧾 Comprovante</a>
            <button class="btn btn-sm btn-ghost" data-comprovante-wa="${o.id}" title="Mandar o comprovante no WhatsApp do cliente">Enviar comprovante</button>
            <button class="btn btn-sm btn-wa" data-notify="${o.id}" data-kind="${
              o.status === 'concluido' ? 'delivered' : o.status === 'em_preparo' ? 'preparing' : o.status === 'saiu_entrega' ? 'out_for_delivery' : 'confirmed'
            }">💬 Avisar cliente no WhatsApp</button>
            <a class="btn btn-sm btn-ghost" href="tel:${esc(o.phone.replace(/\D/g, ''))}">Ligar</a>
          </div>
        </article>`;
      })
      .join('');

    qsa('[data-comprovante-wa]', box).forEach((b) =>
      b.addEventListener('click', () => {
        const o = state.orders.find((x) => String(x.id) === String(b.dataset.comprovanteWa));
        if (!o) return;
        const link = `${location.origin}${API_PREFIX}/comprovante/${encodeURIComponent(o.code)}`;
        const negocio = ((state.settings.business || {}).name || '').trim();
        const msg = `Comprovante do seu pedido ${o.code}${negocio ? ' — ' + negocio : ''}\n${link}`;
        window.open(`https://wa.me/55${String(o.phone || '').replace(/\D/g, '').replace(/^55/, '')}?text=${encodeURIComponent(msg)}`, '_blank');
      })
    );

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
      if (el('bTipo')) el('bTipo').value = b.tipo || '';
      if (el('bRamo')) el('bRamo').value = b.ramo || '';
      if (el('bChamada')) el('bChamada').value = b.hero_chamada || '';
      el('bTagline').value = b.tagline || '';
      el('bWhatsapp').value = b.whatsapp || '';
      el('bInstagram').value = b.instagram || '';
      el('bAddress').value = b.address || '';
      el('bAbout').value = b.about || '';
      state.business = {
        cover_url: b.cover_url || '',
        logo_url: b.logo_url || '',
        watermark_url: b.watermark_url || '',
        tipo: b.tipo || '',
        ramo: b.ramo || '',
        hero_chamada: b.hero_chamada || '',
      };
      // reaplica os textos com o ramo da loja (doces ≠ marmitas) — só nesta loja
      applySegment(state.segment);
      el('logoPreview').src = b.logo_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
      if (el('watermarkPreview')) {
        el('watermarkPreview').src = b.watermark_url || b.logo_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E';
      }

      el('sideBusinessName').textContent = b.name || 'Painel';
      el('pwdBanner').hidden = !s.must_change;

      if (el('payModo')) el('payModo').value = (s.checkout && s.checkout.modo) === 'online' ? 'online' : 'todos';
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

      // ---- Mercado Pago (cartão online) ----
      state.mercadopago = s.mercadopago || {};
      renderMercadoPago();

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
            tipo: el('bTipo') ? el('bTipo').value : state.business.tipo || '',
            ramo: el('bRamo') ? el('bRamo').value : state.business.ramo || '',
            hero_chamada: el('bChamada') ? el('bChamada').value : state.business.hero_chamada || '',
          },
        }),
      });
      toast('Dados do negócio salvos.', 'ok');
      el('sideBusinessName').textContent = el('bName').value || 'Painel';
      await loadSettings();
      // aplica na hora o "Cardápio" x "Catálogo" (só nesta loja)
      try {
        const menu = await api('/api/menu');
        state.menu = menu;
        applySegment((menu.store && menu.store.segment) || 'food');
        aplicarVisibilidadeSabores(null);
      } catch {
        /* ignora */
      }
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
    // Só exige link quem for pagamento ONLINE e não estiver ligado ao Mercado Pago.
    const mp = state.mercadopago || {};
    const mpLigado = !!(mp.ativo !== false && mp.public_key && mp.tem_token);
    // Opções de CARTÃO online são tratadas pelo bloco do Mercado Pago (não por link).
    const ehCartaoOnlinePay = (p) => /cart/i.test(p.label || '') && /online|cr[eé]dito/i.test(p.label || '');
    const online = (state.payments || []).filter(
      (p) =>
        p.active &&
        /online|link|pix autom|checkout/i.test(p.label || '') &&
        !p.pay_url &&
        !ehCartaoOnlinePay(p)
    );
    const box = el('payWarn');
    if (!box) return;

    // cartão online sem Mercado Pago configurado: aviso específico
    const cartaoSemMP = (state.payments || []).filter((p) => p.active && ehCartaoOnlinePay(p) && !mpLigado);

    if (!online.length && !cartaoSemMP.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    const partes = [];
    if (cartaoSemMP.length) {
      partes.push(
        `⚠️ <strong>${cartaoSemMP.map((p) => esc(p.label)).join(', ')}</strong> está ativo, mas o <strong>Mercado Pago ainda não está configurado</strong>. ` +
          `O cliente vê “em ativação”. Configure no bloco <strong>Cartão de crédito online (Mercado Pago)</strong> aqui embaixo — ou desative essa forma.`
      );
    }
    if (online.length) {
      partes.push(
        `⚠️ <strong>${online.map((p) => esc(p.label)).join(', ')}</strong> está ativo mas <strong>sem link de pagamento</strong>. ` +
          `O cliente verá só a instrução. Cole o link abaixo (ou desative essa forma de pagamento).`
      );
    }
    box.innerHTML = partes.join('<br><br>');
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
        <input class="input" data-pay-url="${i}" value="${esc(p.pay_url || '')}" placeholder="Link de pagamento (opcional) — Mercado Pago, InfinitePay, PagBank…">
        ${
          /cart/i.test(p.label || '')
            ? `<div class="hint" style="margin:-4px 0 2px">
                 <strong>Crédito:</strong> pague dentro do próprio link (Mercado Pago configurado abaixo).<br>
                 <strong>Débito:</strong> o cartão de débito comum não passa em pagamento online —
                 use o <em>link de pagamento</em> do seu banco/maquininha ou receba no débito na entrega.
               </div>`
            : ''
        }
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
        body: JSON.stringify({
          payments: state.payments.filter((p) => p.label.trim()),
          checkout: { modo: el('payModo') ? el('payModo').value : 'todos' },
        }),
      });
      const soOnline = el('payModo') && el('payModo').value === 'online';
      const mp = state.mercadopago || {};
      const temLink = (state.payments || []).some((p) => (p.pay_url || '').trim());
      if (soOnline && !mp.tem_token && !temLink) {
        // avisa antes de o lojista achar que já está funcionando
        toast(
          'Modo "somente online" salvo, mas falta a conta de recebimento: cole o Access Token do Mercado Pago ou um link de pagamento. Até lá o cliente continua vendo as formas antigas.',
          'err'
        );
      } else {
        toast(soOnline ? 'Salvo: o site agora mostra só o pagamento online.' : 'Formas de pagamento salvas.', 'ok');
      }
      loadSettings();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  /* --- Mercado Pago: cartão de crédito online --- */
  function renderMercadoPago() {
    const mp = state.mercadopago || {};
    if (el('mpAtivo')) el('mpAtivo').checked = mp.ativo !== false;
    if (el('mpPublicKey')) el('mpPublicKey').value = mp.public_key || '';
    if (el('mpNomeFatura')) el('mpNomeFatura').value = mp.nome_fatura || '';
    if (el('mpAccessToken')) {
      el('mpAccessToken').value = '';
      el('mpAccessToken').placeholder = mp.tem_token
        ? `Guardado: ${mp.access_token_mask} (deixe em branco para manter)`
        : 'Cole aqui o Access Token';
    }
    const box = el('mpStatus');
    if (!box) return;
    const conectado = !!(mp.public_key && mp.tem_token);
    const ativo = mp.ativo !== false;
    if (conectado && ativo) {
      box.style.background = '#e7f6ec';
      box.style.color = '#14532d';
      box.innerHTML = `✅ <strong>Cartão online ativo.</strong> O cliente digita o cartão no checkout e o valor cai na sua conta do Mercado Pago.`;
    } else if (conectado && !ativo) {
      box.style.background = '#fdf1dd';
      box.style.color = '#6b4a10';
      box.innerHTML = `⚠️ Chaves salvas, mas a opção está <strong>desligada</strong>. Ligue o botão acima para aceitar cartão.`;
    } else {
      box.style.background = '#fdf1dd';
      box.style.color = '#6b4a10';
      box.innerHTML = `⚠️ <strong>Não configurado.</strong> Sem as chaves, o cliente vê “Cartão de crédito (online) — em ativação”.`;
    }
  }

  async function salvarMercadoPago() {
    const corpo = {
      mercadopago: {
        ativo: el('mpAtivo').checked,
        public_key: el('mpPublicKey').value.trim(),
        nome_fatura: el('mpNomeFatura').value.trim(),
      },
    };
    const token = el('mpAccessToken').value.trim();
    if (token) corpo.mercadopago.access_token = token;
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify(corpo) });
    toast('Cartão online salvo.', 'ok');
    await loadSettings();
    return corpo;
  }

  if (el('mpSalvarBtn')) {
    el('mpSalvarBtn').addEventListener('click', async () => {
      const btn = el('mpSalvarBtn');
      btn.disabled = true;
      try {
        await salvarMercadoPago();
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (el('mpTestarBtn')) {
    el('mpTestarBtn').addEventListener('click', async () => {
      const btn = el('mpTestarBtn');
      btn.disabled = true;
      const antes = btn.textContent;
      btn.textContent = 'Testando…';
      try {
        // salva primeiro para testar o que está na tela
        await salvarMercadoPago();
        const r = await api('/api/admin/mercadopago/testar', { method: 'POST' });
        toast(`Conectado! Conta: ${r.apelido || r.email || 'Mercado Pago'}${r.producao ? '' : ' (modo teste)'}`, 'ok');
        if (!r.public_key_valida) toast('Falta a Public Key para o cliente digitar o cartão.', 'err');
      } catch (err) {
        toast(err.message || 'Não foi possível conectar.', 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = antes;
      }
    });
  }

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
    state.shareMsg = msg;
    state.shareUrl = url;
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

  /* ---------------- compartilhar o link nas redes ---------------- */
  function linkDaLoja() {
    return state.shareUrl || el('menuLink') ? state.shareUrl || el('menuLink').value : location.href;
  }
  function mensagemDaLoja() {
    const loja = ((state.settings && state.settings.business && state.settings.business.name) || '').trim();
    return state.shareMsg || `${loja} — ${SEG.brandSuffix} 😊\nConfira e peça por aqui: ${linkDaLoja()}`;
  }
  function copiarTexto(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    } catch {
      /* cai no fallback */
    }
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  function ligarCompartilhar() {
    // WhatsApp: abre a conversa já com a mensagem e o link
    const whats = el('shareWhats');
    if (whats)
      whats.addEventListener('click', () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(mensagemDaLoja())}`, '_blank');
      });

    // Instagram: copia o link (o Instagram não aceita link por fora) e abre o app
    const insta = el('shareInstagram');
    if (insta)
      insta.addEventListener('click', async () => {
        // abre o Instagram primeiro (o navegador pode bloquear se demorar)
        window.open('https://www.instagram.com/', '_blank');
        let copiou = true;
        try {
          await copiarTexto(linkDaLoja());
        } catch {
          copiou = false;
        }
        toast(
          copiou
            ? 'Link copiado! Cole no story (adesivo de link) ou na bio do Instagram.'
            : `Copie o link manualmente: ${linkDaLoja()}`,
          copiou ? 'ok' : 'err'
        );
      });

    // Facebook: abre a janela de publicação com o link da loja
    const face = el('shareFacebook');
    if (face)
      face.addEventListener('click', () => {
        const u = encodeURIComponent(linkDaLoja());
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${u}`, '_blank', 'width=680,height=640');
      });

    // Mais: usa o compartilhamento do próprio celular (Instagram, WhatsApp, Telegram…)
    const mais = el('shareMais');
    if (mais)
      mais.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: (state.settings.business || {}).name || 'Minha loja', text: mensagemDaLoja(), url: linkDaLoja() });
          } catch {
            /* o cliente cancelou */
          }
        } else {
          await copiarTexto(`${mensagemDaLoja()}`);
          toast('Link copiado! Cole onde quiser.', 'ok');
        }
      });
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
    // código novo a cada cópia: o WhatsApp busca a prévia atualizada
    const url = el('menuLink').value + '?v=' + Math.random().toString(36).slice(2, 6);
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copiado!', 'ok');
    } catch {
      const tmp = document.createElement('textarea');
      tmp.value = url;
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
    ligarCompartilhar();
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
