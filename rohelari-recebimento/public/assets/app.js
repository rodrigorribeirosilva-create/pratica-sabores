'use strict';
/* ==========================================================================
   ROHELARI RECEBIMENTO — SPA do painel (vanilla JS, sem build)
   ========================================================================== */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ROLE_LABELS = { rede_admin: 'Administrador da rede', loja_gerente: 'Gerente da loja', recebimento: 'Equipe de recebimento', fornecedor: 'Fornecedor / Transportadora' };
const STATUS_LABELS = {
  solicitado: 'Solicitado', confirmado: 'Confirmado', chegada_registrada: 'Chegada registrada',
  aguardando_doca: 'Aguardando doca', em_recebimento: 'Em recebimento', concluido: 'Concluído',
  parcial: 'Recebimento parcial', recusado: 'Recusado', cancelado: 'Cancelado', atrasado: 'Atrasado', nao_compareceu: 'Não compareceu',
};
const VEHICLE_LABELS = { carreta: 'Carreta', truck: 'Truck', toco: 'Toco', van: 'Van', utilitario: 'Utilitário', outro: 'Outro' };
const DAY_LABELS = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

const state = {
  me: null, stores: [], suppliers: [], carriers: [], categories: [], docks: [],
  view: 'dashboard', dashDate: null,
};

/* ---------------- API ---------------- */
async function api(path, { method = 'GET', body, raw } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    if (body instanceof FormData) opts.body = body;
    else { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  }
  const r = await fetch('/api' + path, opts);
  if (r.status === 401) { window.location.href = '/'; throw new Error('sessão expirada'); }
  if (raw) { if (!r.ok) throw new Error('falha na requisição'); return r; }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || data.error || 'Erro na operação'), { status: r.status, code: data.error, body: data });
  return data;
}

/* ---------------- util ---------------- */
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDate = (iso) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
const fmtTime = (t) => (t || '').slice(0, 5);
const fmtDateTime = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fmtCNPJ = (c) => { const d = String(c || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '—'); };
const money = (v) => v === null || v === undefined || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const chip = (map, value) => `<span class="chip chip-${esc(value)}">${esc(map[value] || value)}</span>`;
const statusChip = (s) => chip(STATUS_LABELS, s);
const niceError = (e) => e?.body?.message || e?.message || 'Algo deu errado';

/* ---------------- toast / modal ---------------- */
function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toastRoot').appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
let modalEscHandler = null;
function closeModal() {
  const root = $('#modalRoot');
  root.classList.remove('open'); root.innerHTML = '';
  if (modalEscHandler) { document.removeEventListener('keydown', modalEscHandler); modalEscHandler = null; }
}
function openModal({ title, body, actions = [], large = false, onOpen }) {
  const root = $('#modalRoot');
  const buttons = actions.map((a, i) => `<button class="btn ${a.kind || 'btn-ghost'}" data-modal-action="${i}">${esc(a.label)}</button>`).join('');
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-close></div>
    <div class="modal-panel ${large ? 'modal-large' : ''}">
      <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-modal-close aria-label="Fechar"><svg><use href="#i-close"/></svg></button></div>
      <div class="modal-body">${body}</div>
      ${buttons ? `<div class="modal-foot">${buttons}</div>` : ''}
    </div>`;
  root.classList.add('open');
  root.querySelectorAll('[data-modal-close]').forEach(el => el.addEventListener('click', closeModal));
  actions.forEach((a, i) => { const btn = root.querySelector(`[data-modal-action="${i}"]`); btn.addEventListener('click', () => a.onClick && a.onClick(closeModal, btn)); });
  modalEscHandler = (ev) => { if (ev.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', modalEscHandler);
  if (onOpen) onOpen(root.querySelector('.modal-panel'));
}
function confirmModal(title, message, confirmLabel, onConfirm, danger = false) {
  openModal({ title, body: `<p style="margin:0;font-size:14px">${esc(message)}</p>`, actions: [
    { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
    { label: confirmLabel || 'Confirmar', kind: danger ? 'btn-danger' : 'btn-primary', onClick: async (close) => { await onConfirm(); close(); } },
  ] });
}

/* ---------------- boot / nav ---------------- */
const VIEW_TITLES = {
  dashboard: 'Painel operacional', agenda: 'Agenda de recebimento — 30 minutos', agendamentos: 'Agendamentos',
  lojas: 'Lojas da rede', docas: 'Docas & bloqueios', fornecedores: 'Fornecedores', transportadoras: 'Transportadoras',
  usuarios: 'Usuários & acessos', relatorios: 'Relatórios', notificacoes: 'Notificações',
  auditoria: 'Trilha de auditoria', integracao: 'Integração Sysmo S1', configuracoes: 'Configurações',
};

function applyRoleNav() {
  const roles = state.me.roleLabels || [];
  $$('#nav .nav-item').forEach(btn => {
    const need = (btn.dataset.roles || '').split(',').filter(Boolean);
    btn.style.display = need.some(r => roles.includes(r)) ? '' : 'none';
  });
  $$('#nav .nav-label').forEach(lbl => {
    const need = (lbl.dataset.roles || '').split(',').filter(Boolean);
    if (need.length) lbl.style.display = need.some(r => roles.includes(r)) ? '' : 'none';
  });
}

async function loadCaches() {
  const isSupplier = state.me.roleLabels.includes('fornecedor') && !state.me.isRedeAdmin && !state.me.storeIds.length;
  const [stores, suppliers, carriers, categories, docks] = await Promise.all([
    api('/stores').catch(() => ({ stores: [] })),
    api('/suppliers').catch(() => ({ suppliers: [] })),
    api('/carriers').catch(() => ({ carriers: [] })),
    api('/categories').catch(() => ({ categories: [] })),
    api('/docks').catch(() => ({ docks: [] })),
  ]);
  state.stores = stores.stores || [];
  state.suppliers = suppliers.suppliers || [];
  state.carriers = carriers.carriers || [];
  state.categories = categories.categories || [];
  state.docks = docks.docks || [];
  state.isSupplier = isSupplier;
}

function storeOptions(selected) {
  return state.stores.map(s => `<option value="${esc(s.id)}" ${selected === s.id ? 'selected' : ''}>${esc(s.name)}${s.code ? ` (${esc(s.code)})` : ''}</option>`).join('');
}
function supplierOptions(selected) {
  return state.suppliers.filter(s => s.status === 'ativo').map(s => `<option value="${esc(s.id)}" ${selected === s.id ? 'selected' : ''}>${esc(s.trade_name || s.legal_name)}</option>`).join('');
}
function carrierOptions(selected) {
  return '<option value="">— sem transportadora —</option>' + state.carriers.filter(c => c.status === 'ativo').map(c => `<option value="${esc(c.id)}" ${selected === c.id ? 'selected' : ''}>${esc(c.trade_name || c.legal_name)}</option>`).join('');
}
function categoryOptions(selected) {
  return '<option value="">— categoria —</option>' + state.categories.map(c => `<option value="${esc(c.id)}" ${selected === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}

function showView(name) {
  state.view = name;
  $('#viewTitle').textContent = VIEW_TITLES[name] || name;
  $$('#nav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  closeSidebar();
  const render = { dashboard: renderDashboard, agenda: renderAgenda, agendamentos: renderAgendamentos, lojas: renderLojas, docas: renderDocas, fornecedores: renderFornecedores, transportadoras: renderTransportadoras, usuarios: renderUsuarios, relatorios: renderRelatorios, notificacoes: renderNotificacoes, auditoria: renderAuditoria, integracao: renderIntegracao, configuracoes: renderConfiguracoes }[name];
  if (render) render().catch(e => { $('#content').innerHTML = `<div class="alert alert-warn">Não foi possível carregar: ${esc(niceError(e))}</div>`; });
}
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#overlay').classList.remove('show'); }

async function refreshBadge() {
  try {
    const { unread } = await api('/notifications');
    const show = unread > 0;
    $('#bellBadge').hidden = !show; $('#bellBadge').textContent = unread;
    $('#navUnread').hidden = !show; $('#navUnread').textContent = unread;
  } catch (_) {}
}

async function boot() {
  try { state.me = await api('/auth/me'); }
  catch (_) { window.location.href = '/'; return; }
  $('#userName').textContent = state.me.user.name;
  $('#userRole').textContent = state.me.roleLabels.map(r => ROLE_LABELS[r] || r).join(' · ');
  $('#userAvatar').textContent = (state.me.user.name || 'U').trim().charAt(0).toUpperCase();
  try { const net = await api('/network'); $('#sidebarNetwork').textContent = net.network?.name || 'Rede'; } catch (_) {}
  applyRoleNav();
  await loadCaches();
  document.addEventListener('click', (e) => { const nav = e.target.closest('[data-nav]'); if (nav) showView(nav.dataset.nav); });
  $('#btnHamburger').addEventListener('click', () => { $('#sidebar').classList.toggle('open'); $('#overlay').classList.toggle('show', $('#sidebar').classList.contains('open')); });
  $('#overlay').addEventListener('click', closeSidebar);
  $('#btnBell').addEventListener('click', () => showView('notificacoes'));
  $('#btnLogout').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); window.location.href = '/'; });
  showView('dashboard');
  refreshBadge();
  setInterval(refreshBadge, 60000);
}

/* ==========================================================================
   DASHBOARD
   ========================================================================== */
async function renderDashboard() {
  const date = todayStr();
  const d = await api(`/dashboard?date=${date}`);
  const content = $('#content');

  if (d.role === 'fornecedor') {
    const m = d.metrics;
    content.innerHTML = `
      <div class="kpis">
        ${kpi('Próximas entregas', m.proximos, 'dark')}
        ${kpi('Aguardando aprovação', m.aguardando_aprovacao, 'amber')}
        ${kpi('Confirmadas', m.confirmados, 'green')}
        ${kpi('Concluídas (total)', m.concluidos, '')}
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="panel-head">
          <div><h2>Minhas próximas entregas</h2><p>Acompanhe o status e o protocolo</p></div>
          <button class="btn btn-primary" data-nav="agenda"><svg width="18" height="18"><use href="#i-plus"/></svg>Agendar entrega</button>
        </div>
        ${d.upcoming.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Protocolo</th><th>Loja</th><th>Data</th><th>Hora</th><th>Placa</th><th>Situação</th></tr></thead>
          <tbody>${d.upcoming.map(u => `<tr class="row-link" data-protocol="${esc(u.protocol)}" style="cursor:pointer"><td><strong>${esc(u.protocol)}</strong></td><td>${esc(u.store_name)}</td><td>${fmtDate(u.delivery_date)}</td><td>${fmtTime(u.slot_time)}</td><td>${esc(u.plate || '—')}</td><td>${statusChip(u.status)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma entrega agendada', 'Use "Agendar entrega" para solicitar o recebimento de uma carga.')}
      </div>`;
    bindProtocolRows();
    return;
  }

  const m = d.metrics;
  content.innerHTML = `
    <div class="kpis">
      ${kpi('Agendados hoje', m.agendados_hoje, 'dark')}
      ${kpi('Confirmadas hoje', m.confirmados_hoje, 'green')}
      ${kpi('Caminhões aguardando', m.aguardando_hoje, 'amber')}
      ${kpi('Em recebimento agora', m.em_recebimento_hoje, '')}
      ${kpi('Finalizados hoje', m.finalizados_hoje, 'green')}
      ${kpi('Solicitações pendentes', m.pendentes, 'amber')}
      ${kpi('Atrasados', m.atrasados, 'red')}
      ${kpi('Cancelados hoje', m.cancelados_hoje, 'red')}
    </div>
    ${Array.isArray(d.byStore) && d.byStore.length ? `
      <div class="panel" style="margin-top:14px">
        <div class="panel-head"><div><h2>Visão por loja — hoje</h2><p>Agendados, em operação e docas livres</p></div>
          <button class="btn btn-ghost btn-sm" data-nav="docas">Docas &amp; bloqueios</button></div>
        <div class="table-wrap"><table class="data"><thead><tr><th>Loja</th><th>Agendados</th><th>Em operação</th><th>Pendentes</th><th>Docas livres</th></tr></thead>
        <tbody>${d.byStore.map(s => `<tr><td><strong>${esc(s.name)}</strong> <span class="td-muted">${esc(s.code)}</span></td><td>${s.agendados}</td><td>${s.em_operacao}</td><td>${s.pendentes}</td><td>${s.docas_livres}/${s.docas_total}</td></tr>`).join('')}</tbody></table></div>
      </div>` : ''}
    <div class="panel" style="margin-top:14px">
      <div class="panel-head"><div><h2>Próximos agendamentos</h2><p>Ordenados por data e horário</p></div>
        <button class="btn btn-ghost btn-sm" data-nav="agendamentos">Ver todos</button></div>
      ${d.upcoming.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Protocolo</th><th>Loja</th><th>Fornecedor</th><th>Data</th><th>Hora</th><th>Situação</th></tr></thead>
        <tbody>${d.upcoming.map(u => `<tr class="row-link" data-protocol="${esc(u.protocol)}" style="cursor:pointer"><td><strong>${esc(u.protocol)}</strong></td><td>${esc(u.store_name)}</td><td>${esc(u.supplier_name || '')}</td><td>${fmtDate(u.delivery_date.slice(0,10))}</td><td>${fmtTime(u.slot_time)}</td><td>${statusChip(u.status)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Nada agendado à frente', 'A agenda está livre. Novos agendamentos aparecerão aqui.')}
    </div>`;
  bindProtocolRows();
}
const kpi = (label, value, tone = '') => `<div class="kpi ${tone}"><small>${esc(label)}</small><strong>${esc(value ?? 0)}</strong></div>`;
const emptyState = (title, sub) => `<div class="empty"><strong>${esc(title)}</strong>${esc(sub)}</div>`;
function bindProtocolRows() {
  $$('.row-link[data-protocol]').forEach(tr => tr.addEventListener('click', async () => {
    try {
      const list = await api(`/appointments?q=${encodeURIComponent(tr.dataset.protocol)}&pageSize=1`);
      const appt = (list.appointments || [])[0];
      if (appt) openAppointmentDetail(appt.id);
    } catch (e) { toast(niceError(e), true); }
  }));
}

/* ==========================================================================
   AGENDA — grade de 30 minutos
   ========================================================================== */
async function renderAgenda() {
  const today = todayStr();
  const isManager = state.me.isRedeAdmin || state.me.roleLabels.includes('loja_gerente');
  const multiStore = state.stores.length > 1;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <div><h2>Disponibilidade</h2><p>Horários de 30 minutos — apenas faixas disponíveis podem ser solicitadas</p></div>
        ${isManager ? '<button class="btn btn-ghost btn-sm" id="btnBlockDay">Bloquear dia inteiro</button>' : ''}
      </div>
      <div class="filters">
        ${multiStore ? `<label class="field"><span>Loja</span><select id="agendaStore">${storeOptions(state.stores[0]?.id)}</select></label>` : `<input type="hidden" id="agendaStore" value="${esc(state.stores[0]?.id || '')}">`}
        <label class="field"><span>Data</span><input type="date" id="agendaDate" value="${today}" min="${today}"></label>
        <button class="btn btn-ghost" id="btnReloadAgenda">Atualizar</button>
      </div>
      <div id="agendaMeta" style="margin:10px 0 12px"></div>
      <div class="slot-grid" id="slotGrid"></div>
      <div style="display:flex; gap:12px; margin-top:12px; flex-wrap:wrap; font-size:12px; color:var(--muted)">
        <span><span class="chip chip-confirmado">verde</span> disponível</span>
        <span><span class="chip chip-inativo">cinza</span> lotado</span>
        <span><span class="chip chip-pendente">hachurado</span> bloqueado pela loja</span>
      </div>
    </div>
    <div class="panel" id="blockedPanel" hidden>
      <div class="panel-head"><div><h2>Bloqueios desta loja</h2><p>Dias ou horários sem recebimento</p></div></div>
      <div id="blockedList"></div>
    </div>`;

  const reload = () => loadAvailability(isManager);
  $('#agendaDate').addEventListener('change', reload);
  const storeSel = $('#agendaStore');
  if (storeSel && multiStore) storeSel.addEventListener('change', reload);
  $('#btnReloadAgenda').addEventListener('click', reload);
  if (isManager) $('#btnBlockDay').addEventListener('click', () => openBlockModal(null, reload));
  await reload();
}

async function loadAvailability(isManager) {
  const storeId = $('#agendaStore').value;
  const date = $('#agendaDate').value;
  const grid = $('#slotGrid');
  grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><strong>Carregando horários…</strong></div>';
  try {
    const data = await api(`/agenda/availability?store_id=${encodeURIComponent(storeId)}&date=${date}`);
    const meta = $('#agendaMeta');
    if (!data.isOperatingDay) {
      meta.innerHTML = '<div class="alert alert-warn">A loja não recebe nesta data (dia sem operação ou configurada).</div>';
      grid.innerHTML = '';
    } else {
      meta.innerHTML = `<div class="alert alert-info">${esc(data.store.name)} — recebimento das ${fmtTime(data.store.receiving_start)} às ${fmtTime(data.store.receiving_end)} · aprovação ${data.store.approval_mode === 'auto' ? '<strong>automática</strong>' : '<strong>manual</strong>'}</div>`;
      grid.innerHTML = data.slots.map(s => {
        const cls = s.blocked ? 'blocked' : (s.available ? 'free' : 'full');
        const capTxt = s.blocked ? 'Bloqueado' : `${s.used}/${s.capacity} usado(s)`;
        return `<button class="slot ${cls}" ${s.available ? `data-slot="${s.time}"` : 'disabled'} title="${s.blocked ? esc(s.reason || 'Bloqueado') : ''}">
          <span class="slot-time">${s.time}</span><span class="slot-cap">${esc(capTxt)}</span></button>`;
      }).join('') || '<div class="empty" style="grid-column:1/-1"><strong>Sem faixas configuradas.</strong></div>';
      $$('.slot[data-slot]', grid).forEach(btn => btn.addEventListener('click', () => openAppointmentModal(storeId, date, btn.dataset.slot)));
    }
    if (isManager) { renderBlockedPanel(storeId); }
  } catch (e) {
    grid.innerHTML = `<div class="alert alert-warn" style="grid-column:1/-1">${esc(niceError(e))}</div>`;
  }
}

async function renderBlockedPanel(storeId) {
  const panel = $('#blockedPanel'); panel.hidden = false;
  try {
    const { blocked } = await api(`/blocked-slots?store_id=${encodeURIComponent(storeId)}`);
    $('#blockedList').innerHTML = blocked.length
      ? `<div class="table-wrap"><table class="data"><thead><tr><th>Data</th><th>Faixa</th><th>Motivo</th><th></th></tr></thead><tbody>${blocked.map(b => `<tr><td>${fmtDate(b.block_date.slice(0,10))}</td><td>${b.slot_time ? fmtTime(b.slot_time) : 'Dia inteiro'}</td><td>${esc(b.reason || '—')}</td><td><button class="btn btn-ghost btn-sm" data-unblock="${esc(b.id)}">Remover</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><strong>Nenhum bloqueio cadastrado</strong>Use "Bloquear dia inteiro" ou bloqueie uma faixa na agenda.</div>';
    $$('[data-unblock]', $('#blockedList')).forEach(btn => btn.addEventListener('click', async () => {
      await api(`/blocked-slots/${btn.dataset.unblock}`, { method: 'DELETE' }).catch(e => toast(niceError(e), true));
      renderBlockedPanel(storeId);
    }));
  } catch (_) { panel.hidden = true; }
}

function openBlockModal(slot, onDone, ctx = {}) {
  const date = ctx.date || ($('#agendaDate') ? $('#agendaDate').value : todayStr());
  const storeId = ctx.storeId || ($('#agendaStore') ? $('#agendaStore').value : currentDockStore());
  openModal({
    title: 'Bloquear recebimento',
    body: `<div class="grid-2">
        <label class="field"><span>Data</span><input type="date" id="blkDate" value="${date}"></label>
        <label class="field"><span>Faixa (vazio = dia inteiro)</span><input type="time" id="blkSlot" step="1800" value="${slot || ''}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Motivo</span><input type="text" id="blkReason" maxlength="300" placeholder="Ex.: inventário, manutenção das docas…"></label>
      <div class="form-error" id="blkError" hidden></div>`,
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Bloquear', kind: 'btn-amber', onClick: async (close) => {
          const errBox = $('#blkError');
          try {
            await api('/blocked-slots', { method: 'POST', body: { store_id: storeId, block_date: $('#blkDate').value, slot_time: $('#blkSlot').value || null, reason: $('#blkReason').value } });
            toast('Bloqueio registrado.'); close(); onDone && onDone();
          } catch (e) { errBox.textContent = niceError(e); errBox.hidden = false; }
        } },
    ],
  });
}

/* ==========================================================================
   CRIAR AGENDAMENTO (a partir da grade)
   ========================================================================== */
function openAppointmentModal(storeId, date, slot) {
  const supplierField = state.isSupplier
    ? `<div class="alert alert-info" style="margin-bottom:10px">Fornecedor: <strong>${esc(state.suppliers[0]?.trade_name || state.suppliers[0]?.legal_name || 'sua empresa')}</strong></div><input type="hidden" id="apSupplier" value="${esc(state.suppliers[0]?.id || '')}">`
    : `<label class="field"><span>Fornecedor *</span><select id="apSupplier" required><option value="">Selecione…</option>${supplierOptions()}</select></label>`;
  openModal({
    title: `Agendar entrega — ${fmtDate(date)} às ${slot}`,
    large: true,
    body: `
      ${supplierField}
      <div class="grid-2">
        <label class="field"><span>Transportadora</span><select id="apCarrier">${carrierOptions()}</select></label>
        <label class="field"><span>Categoria da mercadoria</span><select id="apCategory">${categoryOptions()}</select></label>
      </div>
      <div class="grid-3" style="margin-top:10px">
        <label class="field"><span>Nº da nota fiscal</span><input type="text" id="apInvoice" maxlength="60" inputmode="numeric" placeholder="Ex.: 123456"></label>
        <label class="field"><span>Série</span><input type="text" id="apSeries" maxlength="10" placeholder="1"></label>
        <label class="field"><span>Data de emissão da NF</span><input type="date" id="apIssueDate"></label>
      </div>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>Chave de acesso NF-e (44 dígitos)</span><input type="text" id="apNfeKey" inputmode="numeric" maxlength="44" placeholder="43251111222333000181550010000012341000012345"></label>
        <label class="field"><span>Valor da nota (R$)</span><input type="number" id="apNfeValue" min="0" step="0.01" placeholder="0,00"></label>
      </div>
      <div class="grid-3" style="margin-top:10px">
        <label class="field"><span>Motorista</span><input type="text" id="apDriver" maxlength="200" placeholder="Nome completo"></label>
        <label class="field"><span>CPF do motorista</span><input type="text" id="apDriverCpf" inputmode="numeric" placeholder="000.000.000-00"></label>
        <label class="field"><span>Placa do veículo</span><input type="text" id="apPlate" maxlength="8" placeholder="ABC1D23" style="text-transform:uppercase"></label>
      </div>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>Tipo de veículo</span><select id="apVehicleType">${Object.entries(VEHICLE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="field"><span>Volumes estimados</span><input type="number" id="apVolumes" min="0" max="100000" placeholder="Ex.: 24"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Observações</span><textarea id="apNotes" maxlength="1000" placeholder="Carga paletizada, necessidade de empilhadeira, etc."></textarea></label>
      <div class="form-error" id="apError" hidden></div>`,
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Confirmar solicitação', kind: 'btn-primary', onClick: async (close, btn) => {
          const errBox = $('#apError'); errBox.hidden = true;
          btn.disabled = true; btn.textContent = 'Enviando…';
          try {
            const supplierId = $('#apSupplier').value;
            if (!supplierId) { errBox.textContent = 'Selecione o fornecedor.'; errBox.hidden = false; btn.disabled = false; btn.textContent = 'Confirmar solicitação'; return; }
            const body = {
              store_id: storeId, delivery_date: date, slot_time: slot, supplier_id: supplierId,
              carrier_id: $('#apCarrier').value || null, category_id: $('#apCategory').value || null,
              invoice_number: $('#apInvoice').value.trim() || null,
              nfe_issue_date: $('#apIssueDate').value || null,
              nfe_key: $('#apNfeKey').value.replace(/\D/g, '') || null,
              nfe_value: $('#apNfeValue').value || null,
              driver_name: $('#apDriver').value.trim() || null,
              driver_cpf: $('#apDriverCpf').value.replace(/\D/g, '') || null,
              plate: $('#apPlate').value.toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
              vehicle_type: $('#apVehicleType').value,
              expected_volumes: $('#apVolumes').value === '' ? null : Number($('#apVolumes').value),
              notes: $('#apNotes').value.trim() || null,
            };
            const r = await api('/appointments', { method: 'POST', body });
            toast(`Agendamento criado! Protocolo ${r.appointment.protocol} — ${r.appointment.status === 'confirmado' ? 'confirmado automaticamente' : 'aguardando aprovação'}.`);
            close();
            loadAvailability(state.me.isRedeAdmin || state.me.roleLabels.includes('loja_gerente'));
            refreshBadge();
          } catch (e) {
            errBox.textContent = e.body?.message || niceError(e); errBox.hidden = false;
            btn.disabled = false; btn.textContent = 'Confirmar solicitação';
          }
        } },
    ],
  });
}

/* ==========================================================================
   AGENDAMENTOS — lista filtrável
   ========================================================================== */
const apptFilters = { store_id: '', status: '', date_from: '', date_to: '', plate: '', q: '', page: 1 };

async function renderAgendamentos() {
  const roles = state.me.roleLabels;
  const canFilterStore = !state.isSupplier && state.stores.length > 0;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Agendamentos</h2><p>Filtros por loja, situação, período, placa e busca livre</p></div>
        ${state.isSupplier ? '<button class="btn btn-primary btn-sm" data-nav="agenda"><svg width="16" height="16"><use href="#i-plus"/></svg>Nova entrega</button>' : ''}</div>
      <div class="filters">
        ${canFilterStore ? `<label class="field"><span>Loja</span><select id="fStore"><option value="">Todas</option>${storeOptions()}</select></label>` : ''}
        <label class="field"><span>Situação</span><select id="fStatus"><option value="">Todas</option>${Object.entries(STATUS_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
        <label class="field"><span>De</span><input type="date" id="fFrom"></label>
        <label class="field"><span>Até</span><input type="date" id="fTo"></label>
        <label class="field"><span>Placa</span><input type="text" id="fPlate" placeholder="ABC1D23" style="text-transform:uppercase"></label>
        <label class="field grow"><span>Buscar</span><input type="text" id="fQ" placeholder="Protocolo, NF, motorista, fornecedor…"></label>
        <button class="btn btn-primary" id="btnApplyFilters">Filtrar</button>
      </div>
      <div id="apptTable" style="margin-top:12px"></div>
      <div id="apptPager" style="display:flex; gap:10px; align-items:center; justify-content:flex-end; margin-top:10px"></div>
    </div>`;
  const apply = async (page = 1) => {
    apptFilters.store_id = $('#fStore')?.value || '';
    apptFilters.status = $('#fStatus').value;
    apptFilters.date_from = $('#fFrom').value;
    apptFilters.date_to = $('#fTo').value;
    apptFilters.plate = $('#fPlate').value.trim().toUpperCase();
    apptFilters.q = $('#fQ').value.trim();
    apptFilters.page = page;
    await loadAppointmentTable();
  };
  $('#btnApplyFilters').addEventListener('click', () => apply(1));
  $('#fQ').addEventListener('keydown', e => { if (e.key === 'Enter') apply(1); });
  await apply(1);
}

async function loadAppointmentTable() {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(apptFilters)) { if (v) qs.set(k, v); }
  qs.set('pageSize', 25);
  const data = await api(`/appointments?${qs}`);
  const target = $('#apptTable');
  if (!data.appointments.length) { target.innerHTML = emptyState('Nada encontrado', 'Ajuste os filtros e tente novamente.'); $('#apptPager').innerHTML = ''; return; }
  target.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Protocolo</th><th>Loja</th><th>Fornecedor</th><th>Data</th><th>Hora</th><th>Placa</th><th>NF</th><th>Situação</th></tr></thead>
    <tbody>${data.appointments.map(a => `<tr class="appt-row" data-id="${esc(a.id)}" style="cursor:pointer"><td><strong>${esc(a.protocol)}</strong></td><td>${esc(a.store_name)}</td><td>${esc(a.supplier_trade || a.supplier_name)}</td><td>${fmtDate(a.delivery_date.slice(0,10))}</td><td>${fmtTime(a.slot_time)}</td><td>${esc(a.plate || '—')}</td><td>${esc(a.invoice_number || '—')}</td><td>${statusChip(a.status)}</td></tr>`).join('')}</tbody></table></div>`;
  $$('.appt-row', target).forEach(tr => tr.addEventListener('click', () => openAppointmentDetail(tr.dataset.id)));
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  $('#apptPager').innerHTML = `<span class="td-muted">${data.total} resultado(s)</span>
    <button class="btn btn-ghost btn-sm" id="pgPrev" ${apptFilters.page <= 1 ? 'disabled' : ''}>Anterior</button>
    <span class="td-muted">Página ${data.page} de ${totalPages}</span>
    <button class="btn btn-ghost btn-sm" id="pgNext" ${apptFilters.page >= totalPages ? 'disabled' : ''}>Próxima</button>`;
  $('#pgPrev')?.addEventListener('click', () => { apptFilters.page -= 1; loadAppointmentTable(); });
  $('#pgNext')?.addEventListener('click', () => { apptFilters.page += 1; loadAppointmentTable(); });
}

/* ==========================================================================
   DETALHE DO AGENDAMENTO + FLUXO OPERACIONAL
   ========================================================================== */
async function openAppointmentDetail(id) {
  const d = await api(`/appointments/${id}`);
  const a = d.appointment;
  const st = a.status;
  const isStaff = state.me.isRedeAdmin || state.me.storeIds.includes(a.store_id);
  const isManager = state.me.isRedeAdmin || state.me.roles.some(r => r.store_id === a.store_id && r.role === 'loja_gerente');
  const isSupplierActor = state.me.supplierIds.includes(a.supplier_id) && !isStaff;

  const timeline = d.history.map(h => `<div class="timeline-item"><div><strong>${esc(STATUS_LABELS[h.to_status] || h.to_status)}</strong><br><small>${fmtDateTime(h.created_at)}${h.changed_by_name ? ' · ' + esc(h.changed_by_name) : ''}${h.note ? ' · ' + esc(h.note) : ''}</small></div></div>`).join('');
  const divs = d.divergences.length ? d.divergences.map(v => `<div class="alert alert-warn" style="margin-top:6px"><strong>${esc(v.type)}</strong> — ${esc(v.description)}${v.quantity ? ` (${esc(v.quantity)})` : ''}<br><small>${fmtDateTime(v.created_at)}</small></div>`).join('') : '<p class="td-muted">Sem divergências registradas.</p>';
  const atts = d.attachments.length ? d.attachments.map(att => `<a class="btn btn-ghost btn-sm" href="/api/attachments/${esc(att.id)}" target="_blank" rel="noopener">${esc(att.filename)}</a>`).join(' ') : '<span class="td-muted">Nenhum anexo.</span>';
  const docksForStore = state.docks.filter(dk => dk.store_id === a.store_id && dk.status !== 'manutencao');

  const actionButtons = [];
  if (isManager && st === 'solicitado') {
    actionButtons.push({ label: '✓ Aprovar', kind: 'btn-primary', onClick: async () => { await api(`/appointments/${id}/approve`, { method: 'POST' }); toast('Agendamento aprovado.'); openAppointmentDetail(id); refreshBadge(); } });
    actionButtons.push({ label: 'Recusar…', kind: 'btn-danger', onClick: (close) => openRefuseModal(id) });
  }
  if (isStaff && ['confirmado', 'atrasado'].includes(st)) {
    actionButtons.push({ label: 'Registrar chegada', kind: 'btn-primary', onClick: async () => { await api(`/appointments/${id}/arrival`, { method: 'POST' }); toast('Chegada registrada.'); openAppointmentDetail(id); } });
    actionButtons.push({ label: 'Reagendar…', kind: 'btn-ghost', onClick: () => openRescheduleModal(a) });
  }
  if (isStaff && st === 'chegada_registrada') {
    actionButtons.push({ label: 'Iniciar conferência', kind: 'btn-primary', onClick: async () => { await api(`/appointments/${id}/start-conference`, { method: 'POST' }); toast('Conferência iniciada.'); openAppointmentDetail(id); } });
  }
  if (isStaff && ['chegada_registrada', 'aguardando_doca'].includes(st) && docksForStore.length) {
    actionButtons.push({ label: 'Atribuir doca…', kind: 'btn-dark', onClick: () => openDockModal(a, docksForStore) });
  }
  if (isStaff && st === 'em_recebimento') {
    actionButtons.push({ label: '+ Divergência', kind: 'btn-amber', onClick: () => openDivergenceModal(id) });
    actionButtons.push({ label: 'Finalizar recebimento…', kind: 'btn-primary', onClick: () => openFinalizeModal(id, a) });
  }
  if (isStaff && ['solicitado', 'confirmado'].includes(st)) {
    actionButtons.push({ label: 'Marcar atrasado', kind: 'btn-ghost', onClick: async () => { await api(`/appointments/${id}/mark-delayed`, { method: 'POST', body: {} }); toast('Marcado como atrasado.'); openAppointmentDetail(id); } });
  }
  if (isStaff && ['solicitado', 'confirmado', 'atrasado'].includes(st)) {
    actionButtons.push({ label: 'Não compareceu', kind: 'btn-ghost', onClick: () => confirmModal('Não compareceu', `Registrar que ${a.protocol} não compareceu? A faixa será liberada.`, 'Registrar falta', async () => { await api(`/appointments/${id}/no-show`, { method: 'POST', body: {} }); toast('Falta registrada.'); openAppointmentDetail(id); }) });
  }
  if (['solicitado', 'confirmado', 'atrasado'].includes(st)) {
    actionButtons.push({ label: 'Cancelar…', kind: 'btn-danger', onClick: () => openCancelModal(a, isSupplierActor) });
  }
  if (isSupplierActor && ['solicitado', 'confirmado', 'atrasado'].includes(st)) {
    actionButtons.push({ label: 'Solicitar alteração', kind: 'btn-ghost', onClick: () => openRequestChangeModal(id) });
  }

  openModal({
    title: `Protocolo ${a.protocol}`,
    large: true,
    body: `
      <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px; flex-wrap:wrap">
        ${statusChip(st)}
        <span class="td-muted">Criado em ${fmtDateTime(a.created_at)}</span>
        ${d.receiving?.responsible_name ? `<span class="td-muted">Conferente: <strong>${esc(d.receiving.responsible_name)}</strong></span>` : ''}
      </div>
      <div class="grid-2">
        <div>
          <h4 style="margin:0 0 6px; font-size:12px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Entrega</h4>
          <dl class="dl">
            <dt>Loja</dt><dd>${esc(d.store?.name || '')} ${d.store?.code ? `(${esc(d.store.code)})` : ''}</dd>
            <dt>Data / horário</dt><dd>${fmtDate(a.delivery_date.slice(0,10))} · ${fmtTime(a.slot_time)} (30 min)</dd>
            <dt>Fornecedor</dt><dd>${esc(d.supplier?.legal_name || '')}<br><small class="td-muted">${fmtCNPJ(d.supplier?.cnpj)} · ${esc(d.supplier?.phone || '')}</small></dd>
            <dt>Transportadora</dt><dd>${esc(d.carrier?.trade_name || d.carrier?.legal_name || '—')}</dd>
            <dt>Categoria</dt><dd>${esc(a.category_name || '—')}</dd>
            <dt>Volumes previstos</dt><dd>${a.expected_volumes ?? '—'}</dd>
          </dl>
        </div>
        <div>
          <h4 style="margin:0 0 6px; font-size:12px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Veículo &amp; Nota Fiscal</h4>
          <dl class="dl">
            <dt>Motorista</dt><dd>${esc(a.driver_name || '—')}${a.driver_cpf ? `<br><small class="td-muted">CPF ${esc(a.driver_cpf)}</small>` : ''}</dd>
            <dt>Placa / veículo</dt><dd>${esc(a.plate || '—')} ${a.vehicle_type ? '· ' + esc(VEHICLE_LABELS[a.vehicle_type] || a.vehicle_type) : ''}</dd>
            <dt>Nota fiscal</dt><dd>${esc(a.invoice_number || '—')}${a.nfe_issue_date ? `<br><small class="td-muted">Emissão ${fmtDate(a.nfe_issue_date.slice(0,10))}</small>` : ''}${a.nfe_value ? `<br><small class="td-muted">Valor ${money(a.nfe_value)}</small>` : ''}</dd>
            <dt>Chave NF-e</dt><dd style="word-break:break-all; font-size:11px">${esc(a.nfe_key || '—')}</dd>
            <dt>Observações</dt><dd>${esc(a.notes || '—')}</dd>
          </dl>
        </div>
      </div>
      <h4 style="margin:14px 0 8px; font-size:12px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Conferência</h4>
      ${d.receiving ? `<dl class="dl"><dt>Iniciada</dt><dd>${fmtDateTime(d.receiving.started_at)}</dd><dt>Recebido</dt><dd>${d.receiving.received_volumes ?? '—'} de ${d.receiving.expected_volumes ?? a.expected_volumes ?? '—'} volumes</dd><dt>Resultado</dt><dd>${d.receiving.result === 'total' ? 'Total' : d.receiving.result === 'parcial' ? 'Parcial' : 'Em andamento'}</dd>${d.receiving.completed_at ? `<dt>Concluída</dt><dd>${fmtDateTime(d.receiving.completed_at)}</dd>` : ''}</dl>` : '<p class="td-muted">Aguardando início da conferência.</p>'}
      <h4 style="margin:14px 0 6px; font-size:12px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Divergências</h4>
      ${divs}
      <h4 style="margin:14px 0 6px; font-size:12px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Anexos &amp; fotos</h4>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">${atts}
        <label class="btn btn-ghost btn-sm" style="cursor:pointer"><svg width="16" height="16"><use href="#i-camera"/></svg>Anexar<input type="file" id="attInput" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden></label>
      </div>
      <h4 style="margin:14px 0 8px; font-size:12px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Histórico</h4>
      <div class="timeline">${timeline || '<p class="td-muted">Sem movimentações.</p>'}</div>`,
    actions: actionButtons.map(({ label, kind, onClick }) => ({ label, kind, onClick })),
    onOpen: (panel) => {
      const input = $('#attInput', panel);
      input?.addEventListener('change', async () => {
        if (!input.files.length) return;
        const fd = new FormData();
        for (const f of input.files) fd.append('files', f);
        try { await api(`/appointments/${id}/attachments`, { method: 'POST', body: fd }); toast('Anexo(s) enviado(s).'); openAppointmentDetail(id); }
        catch (e) { toast(niceError(e), true); }
      });
    },
  });
}

function openRefuseModal(id) {
  openModal({
    title: 'Recusar solicitação',
    body: `<label class="field"><span>Motivo da recusa (vai para o fornecedor)</span><textarea id="refuseNote" maxlength="500" placeholder="Ex.: agenda lotada nesta faixa; solicite outro horário…"></textarea></label><div class="form-error" id="refuseErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Recusar', kind: 'btn-danger', onClick: async (close, btn) => { try { await api(`/appointments/${id}/refuse`, { method: 'POST', body: { note: $('#refuseNote').value.trim() || 'Solicitação recusada pela loja' } }); toast('Solicitação recusada.'); close(); openAppointmentDetail(id); refreshBadge(); } catch (e) { $('#refuseErr').textContent = niceError(e); $('#refuseErr').hidden = false; } } },
    ],
  });
}
function openCancelModal(a, isSupplierActor) {
  openModal({
    title: `Cancelar ${a.protocol}`,
    body: `<p class="auth-note" style="margin-bottom:10px">${isSupplierActor ? 'Seu cancelamento libera a faixa imediatamente.' : 'A faixa será liberada e o fornecedor será notificado.'}</p>
      <label class="field"><span>Motivo *</span><textarea id="cancelReason" maxlength="500" required placeholder="Informe o motivo…"></textarea></label><div class="form-error" id="cancelErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Cancelar agendamento', kind: 'btn-danger', onClick: async (close) => { const reason = $('#cancelReason').value.trim(); if (!reason) { $('#cancelErr').textContent = 'Informe o motivo.'; $('#cancelErr').hidden = false; return; } try { await api(`/appointments/${a.id}/cancel`, { method: 'POST', body: { reason } }); toast('Agendamento cancelado.'); close(); openAppointmentDetail(a.id); refreshBadge(); } catch (e) { $('#cancelErr').textContent = niceError(e); $('#cancelErr').hidden = false; } } },
    ],
  });
}
function openRescheduleModal(a) {
  const today = todayStr();
  openModal({
    title: `Reagendar ${a.protocol}`,
    body: `<div class="grid-2"><label class="field"><span>Nova data</span><input type="date" id="rsDate" value="${a.delivery_date.slice(0,10)}" min="${today}"></label>
      <label class="field"><span>Novo horário (30 min)</span><input type="time" id="rsSlot" step="1800" value="${fmtTime(a.slot_time)}"></label></div>
      <label class="field" style="margin-top:10px"><span>Motivo</span><input type="text" id="rsReason" maxlength="500" placeholder="Ex.: caminhão do fornecedor atrasou…"></label>
      <div class="form-error" id="rsErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Salvar reagendamento', kind: 'btn-primary', onClick: async (close) => { try { const r = await api(`/appointments/${a.id}/reschedule`, { method: 'POST', body: { delivery_date: $('#rsDate').value, slot_time: $('#rsSlot').value, reason: $('#rsReason').value.trim() } }); toast('Reagendado com sucesso.'); close(); openAppointmentDetail(a.id); } catch (e) { $('#rsErr').textContent = niceError(e); $('#rsErr').hidden = false; } } },
    ],
  });
}
function openDockModal(a, docksForStore) {
  openModal({
    title: 'Atribuir doca',
    body: `<label class="field"><span>Doca disponível na loja</span><select id="dockSelect">${docksForStore.map(dk => `<option value="${esc(dk.id)}" ${a.dock_id === dk.id ? 'selected' : ''}>${esc(dk.name)} — ${dk.status === 'livre' ? 'livre' : 'ocupada'}</option>`).join('')}</select></label><div class="form-error" id="dockErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Confirmar doca', kind: 'btn-primary', onClick: async (close) => { try { await api(`/appointments/${a.id}/assign-dock`, { method: 'POST', body: { dock_id: $('#dockSelect').value } }); toast('Doca atribuída.'); close(); openAppointmentDetail(a.id); } catch (e) { $('#dockErr').textContent = niceError(e); $('#dockErr').hidden = false; } } },
    ],
  });
}
function openDivergenceModal(id) {
  openModal({
    title: 'Registrar divergência',
    body: `<div class="grid-2"><label class="field"><span>Tipo</span><select id="dvType">
        <option value="falta">Falta (volumes a menos)</option><option value="produto_faltante">Produto faltante</option>
        <option value="avaria">Avaria</option><option value="excesso">Excesso</option><option value="divergencia">Divergência de mercadoria</option></select></label>
      <label class="field"><span>Quantidade</span><input type="number" id="dvQty" min="0" step="0.001" placeholder="0"></label></div>
      <label class="field" style="margin-top:10px"><span>Descrição *</span><textarea id="dvDesc" maxlength="500" placeholder="Ex.: 3 caixas de ovos rompidas; NF diverge do físico…"></textarea></label><div class="form-error" id="dvErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Registrar divergência', kind: 'btn-amber', onClick: async (close) => { const desc = $('#dvDesc').value.trim(); if (!desc) { $('#dvErr').textContent = 'Descreva a divergência.'; $('#dvErr').hidden = false; return; } try { await api(`/appointments/${id}/divergences`, { method: 'POST', body: { type: $('#dvType').value, description: desc, quantity: $('#dvQty').value === '' ? null : Number($('#dvQty').value) } }); toast('Divergência registrada.'); close(); openAppointmentDetail(id); } catch (e) { $('#dvErr').textContent = niceError(e); $('#dvErr').hidden = false; } } },
    ],
  });
}
function openFinalizeModal(id, a) {
  openModal({
    title: 'Finalizar recebimento',
    body: `<div class="alert alert-info" style="margin-bottom:10px">Volumes previstos: <strong>${a.expected_volumes ?? '—'}</strong></div>
      <div class="grid-2"><label class="field"><span>Volumes recebidos *</span><input type="number" id="fzReceived" min="0" value="${a.expected_volumes ?? ''}"></label>
      <label class="field"><span>Resultado</span><select id="fzResult"><option value="total">Total — tudo conforme</option><option value="parcial">Parcial — com pendências</option></select></label></div>
      <label class="field" style="margin-top:10px"><span>Observações finais</span><textarea id="fzNotes" maxlength="1000" placeholder="Resumo da conferência…"></textarea></label>
      <div class="form-error" id="fzErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Concluir recebimento', kind: 'btn-primary', onClick: async (close) => { const received = Number($('#fzReceived').value); if (!Number.isFinite(received) || received < 0) { $('#fzErr').textContent = 'Informe a quantidade recebida.'; $('#fzErr').hidden = false; return; } try { await api(`/appointments/${id}/finalize`, { method: 'POST', body: { received_volumes: received, result: $('#fzResult').value, notes: $('#fzNotes').value.trim() || null } }); toast('Recebimento finalizado.'); close(); openAppointmentDetail(id); refreshBadge(); } catch (e) { $('#fzErr').textContent = niceError(e); $('#fzErr').hidden = false; } } },
    ],
  });
}
function openRequestChangeModal(id) {
  openModal({
    title: 'Solicitar alteração à loja',
    body: `<p class="auth-note" style="margin-bottom:10px">A loja recebe sua solicitação e decide. Para horário, prefira indicar a faixa desejada.</p>
      <label class="field"><span>Mensagem *</span><textarea id="rcMsg" maxlength="1000" placeholder="Ex.: caminhão quebrado; podemos sexta às 08:30?"></textarea></label><div class="form-error" id="rcErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Enviar solicitação', kind: 'btn-primary', onClick: async (close) => { const msg = $('#rcMsg').value.trim(); if (!msg) { $('#rcErr').textContent = 'Escreva a mensagem.'; $('#rcErr').hidden = false; return; } try { await api(`/appointments/${id}/request-change`, { method: 'POST', body: { message: msg } }); toast('Solicitação enviada à loja.'); close(); } catch (e) { $('#rcErr').textContent = niceError(e); $('#rcErr').hidden = false; } } },
    ],
  });
}

/* ==========================================================================
   LOJAS DA REDE (rede_admin)
   ========================================================================== */
async function renderLojas() {
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Lojas da rede</h2><p>Capacidade, horário de recebimento e aprovação por unidade</p></div>
        <button class="btn btn-primary" id="btnNewStore"><svg width="18" height="18"><use href="#i-plus"/></svg>Nova loja</button></div>
      <div id="storesTable"></div>
    </div>`;
  $('#btnNewStore').addEventListener('click', () => openStoreModal(null));
  await loadStoresTable();
}
async function loadStoresTable() {
  const { stores } = await api('/stores');
  state.stores = stores;
  $('#storesTable').innerHTML = stores.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Loja</th><th>Código</th><th>Cidade/UF</th><th>Recebimento</th><th>Docas</th><th>Capacidade/faixa</th><th>Aprovação</th><th>Situação</th><th></th></tr></thead>
    <tbody>${stores.map(s => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.code)}</td><td>${esc(s.city || '—')}/${esc(s.state || '—')}</td><td>${fmtTime(s.receiving_start)}–${fmtTime(s.receiving_end)}<br><small class="td-muted">${esc((s.weekdays || '').split(',').map(d => DAY_LABELS[d] || d).join(' '))}</small></td><td>${s.docks_registered}/${s.dock_count}</td><td>${s.capacity_per_slot}</td><td>${s.approval_mode === 'auto' ? '<span class="chip chip-confirmado">automática</span>' : '<span class="chip chip-pendente">manual</span>'}</td><td>${chip({ ativo: 'Ativo', inativo: 'Inativo' }, s.status)}</td><td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-edit-store="${esc(s.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma loja cadastrada', 'Cadastre a primeira unidade da rede.');
  $$('[data-edit-store]').forEach(btn => btn.addEventListener('click', () => openStoreModal(stores.find(s => s.id === btn.dataset.editStore))));
}
function openStoreModal(store) {
  const isEdit = !!store;
  const weekdays = (store?.weekdays || '1,2,3,4,5,6').split(',');
  openModal({
    title: isEdit ? `Editar ${store.name}` : 'Nova loja',
    large: true,
    body: `
      <div class="grid-2">
        <label class="field"><span>Nome da unidade *</span><input id="stName" maxlength="150" value="${esc(store?.name || '')}"></label>
        <label class="field"><span>Código interno *</span><input id="stCode" maxlength="30" value="${esc(store?.code || '')}" style="text-transform:uppercase"></label>
      </div>
      <div class="grid-3" style="margin-top:10px">
        <label class="field"><span>CNPJ</span><input id="stCnpj" inputmode="numeric" value="${fmtCNPJ(store?.cnpj)}" placeholder="00.000.000/0000-00"></label>
        <label class="field"><span>Telefone</span><input id="stPhone" value="${esc(store?.phone || '')}" placeholder="(48) 3000-0000"></label>
        <label class="field"><span>Responsável</span><input id="stResp" maxlength="200" value="${esc(store?.responsible_name || '')}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Endereço</span><input id="stAddr" maxlength="300" value="${esc(store?.address || '')}"></label>
      <div class="grid-3" style="margin-top:10px">
        <label class="field"><span>Cidade</span><input id="stCity" value="${esc(store?.city || '')}"></label>
        <label class="field"><span>UF</span><input id="stState" maxlength="2" value="${esc(store?.state || '')}" style="text-transform:uppercase"></label>
        <label class="field"><span>Código Sysmo (loja)</span><input id="stSysmo" value="${esc(store?.sysmo_store_code || '')}" placeholder="Somente p/ integração futura"></label>
      </div>
      <div class="grid-3" style="margin-top:10px">
        <label class="field"><span>Início do recebimento</span><input type="time" id="stStart" step="1800" value="${fmtTime(store?.receiving_start || '08:00')}"></label>
        <label class="field"><span>Fim do recebimento</span><input type="time" id="stEnd" step="1800" value="${fmtTime(store?.receiving_end || '17:00')}"></label>
        <label class="field"><span>Aprovação de agendamentos</span><select id="stApproval"><option value="manual" ${store?.approval_mode !== 'auto' ? 'selected' : ''}>Manual (gerente aprova)</option><option value="auto" ${store?.approval_mode === 'auto' ? 'selected' : ''}>Automática</option></select></label>
      </div>
      <div style="margin-top:10px"><span class="field" style="margin-bottom:6px; display:block; font-size:12px; font-weight:700; color:var(--ink-2)">Dias de recebimento</span>
        <div class="checkbox-grid" id="stWeekdays">${Object.entries(DAY_LABELS).map(([d, l]) => `<label><input type="checkbox" value="${d}" ${weekdays.includes(String(d)) ? 'checked' : ''}>${l}</label>`).join('')}</div></div>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>Nº de docas ${isEdit ? '(gerencie em Docas & bloqueios)' : ''}</span><input type="number" id="stDocks" min="0" max="50" value="${store?.dock_count ?? 2}" ${isEdit ? 'disabled' : ''}></label>
        <label class="field"><span>Capacidade padrão (caminhões/faixa)</span><input type="number" id="stCapacity" min="1" max="50" value="${store?.capacity_per_slot ?? 2}"></label>
      </div>
      <div class="form-error" id="stError" hidden></div>`,
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      ...(isEdit ? [{ label: store.status === 'ativo' ? 'Inativar loja' : 'Reativar loja', kind: 'btn-dark', onClick: async (close) => { await api(`/stores/${store.id}/status`, { method: 'PATCH', body: { status: store.status === 'ativo' ? 'inativo' : 'ativo' } }); toast('Situação atualizada.'); close(); renderLojas(); loadCaches(); } }] : []),
      { label: isEdit ? 'Salvar alterações' : 'Criar loja', kind: 'btn-primary', onClick: async (close, btn) => {
          btn.disabled = true;
          const err = $('#stError');
          try {
            const payload = {
              name: $('#stName').value.trim(), code: $('#stCode').value.trim().toUpperCase(), cnpj: $('#stCnpj').value.replace(/\D/g, '') || null,
              phone: $('#stPhone').value.trim(), responsible_name: $('#stResp').value.trim(),
              address: $('#stAddr').value.trim(), city: $('#stCity').value.trim(), state: $('#stState').value.trim().toUpperCase(),
              sysmo_store_code: $('#stSysmo').value.trim() || null,
              receiving_start: $('#stStart').value, receiving_end: $('#stEnd').value,
              weekdays: $$('#stWeekdays input:checked').map(i => i.value).join(','),
              capacity_per_slot: Number($('#stCapacity').value) || 1,
              approval_mode: $('#stApproval').value,
              dock_count: Number($('#stDocks').value) || 0,
            };
            if (!payload.name || !payload.code) { err.textContent = 'Nome e código são obrigatórios.'; err.hidden = false; btn.disabled = false; return; }
            if (isEdit) await api(`/stores/${store.id}`, { method: 'PUT', body: payload });
            else await api('/stores', { method: 'POST', body: payload });
            toast(isEdit ? 'Loja atualizada.' : 'Loja criada.'); close(); renderLojas(); loadCaches();
          } catch (e) { err.textContent = e.body?.message || niceError(e); err.hidden = false; btn.disabled = false; }
        } },
    ],
  });
}

/* ==========================================================================
   DOCAS & BLOQUEIOS
   ========================================================================== */
async function renderDocas() {
  const multiStore = state.stores.length > 1;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Docas &amp; bloqueios</h2><p>Situação operacional das docas e controle de horários por loja</p></div></div>
      ${multiStore ? `<label class="field" style="max-width:360px"><span>Loja</span><select id="dockStore">${storeOptions(state.stores[0]?.id)}</select></label>` : `<input type="hidden" id="dockStore" value="${esc(state.stores[0]?.id || '')}">`}
      <div class="grid-2" style="margin-top:12px; align-items:start">
        <div>
          <h3 style="font-size:13px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Docas</h3>
          <div id="docksList"></div>
          <div style="display:flex; gap:8px; margin-top:10px">
            <input type="text" id="newDockName" class="field" style="flex:1; border:1.5px solid var(--line-strong); border-radius:10px; padding:10px 12px" placeholder="Nome da nova doca (ex.: Doca 4)">
            <button class="btn btn-ghost" id="btnAddDock">Adicionar</button>
          </div>
        </div>
        <div>
          <h3 style="font-size:13px; text-transform:uppercase; color:var(--muted); letter-spacing:.05em">Capacidade por faixa (override)</h3>
          <div id="capList" style="margin:8px 0"></div>
          <div style="display:flex; gap:8px; align-items:end">
            <label class="field" style="flex:0 0 130px"><span>Faixa</span><input type="time" id="capSlot" step="1800"></label>
            <label class="field" style="flex:0 0 110px"><span>Capacidade</span><input type="number" id="capQty" min="0" max="50" value="1"></label>
            <button class="btn btn-ghost" id="btnSetCap">Salvar</button>
          </div>
        </div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h2>Bloqueios de agenda</h2><p>Dias ou faixas sem recebimento</p></div>
        <button class="btn btn-amber btn-sm" id="btnNewBlock">Bloquear dia/faixa</button></div>
      <div id="blockedTable"></div>
    </div>`;
  const reload = async () => { await loadDocksPanel(); await loadBlockedTable(); };
  $('#dockStore')?.addEventListener('change', reload);
  $('#btnAddDock').addEventListener('click', addDock);
  $('#btnSetCap').addEventListener('click', setSlotCapacity);
  $('#btnNewBlock').addEventListener('click', () => openBlockModal(null, reload, { storeId: currentDockStore(), date: todayStr() }));
  await reload();
}
const currentDockStore = () => $('#dockStore').value;
async function loadDocksPanel() {
  const storeId = currentDockStore();
  const [{ docks }, { capacities }] = await Promise.all([
    api(`/docks?store_id=${storeId}`),
    api(`/stores/${storeId}/slot-capacity`),
  ]);
  state.docks = docks;
  $('#docksList').innerHTML = docks.length ? docks.map(d => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid var(--line); border-radius:12px; padding:10px 12px; margin-bottom:8px; background:var(--surface-2)">
      <div><strong>${esc(d.name)}</strong><br>${chip({ livre: 'Livre', ocupada: 'Ocupada', manutencao: 'Manutenção' }, d.status)}</div>
      <button class="btn btn-ghost btn-sm" data-cycle-dock="${esc(d.id)}" data-status="${esc(d.status)}">${d.status === 'livre' ? 'Marcar ocupada' : d.status === 'ocupada' ? 'Liberar' : 'Voltar à operação'}</button>
    </div>`).join('') : '<div class="empty"><strong>Nenhuma doca</strong>Adicione a primeira doca desta loja.</div>';
  $$('[data-cycle-dock]').forEach(btn => btn.addEventListener('click', async () => {
    const order = { livre: 'ocupada', ocupada: 'livre', manutencao: 'livre' };
    await api(`/docks/${btn.dataset.cycleDock}/status`, { method: 'PATCH', body: { status: order[btn.dataset.status] || 'livre' } }).catch(e => toast(niceError(e), true));
    loadDocksPanel();
  }));
  $('#capList').innerHTML = capacities.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Faixa</th><th>Capacidade</th><th></th></tr></thead><tbody>${capacities.map(c => `<tr><td>${fmtTime(c.slot_time)}</td><td>${c.capacity}</td><td><button class="btn btn-ghost btn-sm" data-del-cap="${esc(c.slot_time)}">Remover</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="td-muted">Sem overrides — vale a capacidade padrão da loja.</p>';
  $$('[data-del-cap]').forEach(btn => btn.addEventListener('click', async () => { await api(`/stores/${storeId}/slot-capacity/${btn.dataset.delCap}`, { method: 'DELETE' }); loadDocksPanel(); }));
}
async function addDock() {
  const input = $('#newDockName');
  const name = input.value.trim();
  if (!name) return;
  try { await api('/docks', { method: 'POST', body: { store_id: currentDockStore(), name } }); input.value = ''; loadDocksPanel(); }
  catch (e) { toast(niceError(e), true); }
}
async function setSlotCapacity() {
  try { await api(`/stores/${currentDockStore()}/slot-capacity`, { method: 'PUT', body: { slot_time: $('#capSlot').value, capacity: Number($('#capQty').value) } }); toast('Capacidade salva.'); loadDocksPanel(); }
  catch (e) { toast(niceError(e), true); }
}
async function loadBlockedTable() {
  const { blocked } = await api(`/blocked-slots?store_id=${currentDockStore()}`);
  $('#blockedTable').innerHTML = blocked.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Data</th><th>Faixa</th><th>Motivo</th><th></th></tr></thead><tbody>${blocked.map(b => `<tr><td>${fmtDate(b.block_date.slice(0,10))}</td><td>${b.slot_time ? fmtTime(b.slot_time) : 'Dia inteiro'}</td><td>${esc(b.reason || '—')}</td><td><button class="btn btn-ghost btn-sm" data-unblock="${esc(b.id)}">Remover</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><strong>Nenhum bloqueio</strong>A loja está recebendo normalmente.</div>';
  $$('[data-unblock]', $('#blockedTable')).forEach(btn => btn.addEventListener('click', async () => { await api(`/blocked-slots/${btn.dataset.unblock}`, { method: 'DELETE' }); loadBlockedTable(); }));
}

/* ==========================================================================
   FORNECEDORES (rede_admin)
   ========================================================================== */
async function renderFornecedores() {
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Fornecedores &amp; transportadoras vinculadas</h2><p>Um fornecedor pode atender várias lojas da rede</p></div>
        <button class="btn btn-primary" id="btnNewSupplier"><svg width="18" height="18"><use href="#i-plus"/></svg>Novo fornecedor</button></div>
      <div class="filters"><label class="field grow"><span>Buscar</span><input type="text" id="supSearch" placeholder="Razão social, nome fantasia ou CNPJ…"></label><button class="btn btn-ghost" id="btnSearchSup">Buscar</button></div>
      <div id="suppliersTable" style="margin-top:12px"></div>
    </div>`;
  $('#btnNewSupplier').addEventListener('click', () => openSupplierModal(null));
  $('#btnSearchSup').addEventListener('click', loadSuppliersTable);
  $('#supSearch').addEventListener('keydown', e => { if (e.key === 'Enter') loadSuppliersTable(); });
  await loadSuppliersTable();
}
async function loadSuppliersTable() {
  const q = ($('#supSearch')?.value || '').trim();
  const { suppliers } = await api(`/suppliers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  state.suppliers = suppliers;
  const target = $('#suppliersTable');
  if (!suppliers.length) { target.innerHTML = emptyState('Nenhum fornecedor encontrado', 'Ajuste a busca ou cadastre um novo fornecedor.'); return; }
  const pending = suppliers.filter(s => s.status === 'pendente').length;
  target.innerHTML = (pending ? `<div class="alert alert-warn" style="margin-bottom:10px">${pending} fornecedor(es) aguardando aprovação.</div>` : '') +
    `<div class="table-wrap"><table class="data"><thead><tr><th>Fornecedor</th><th>CNPJ</th><th>Contato</th><th>Categorias</th><th>Situação</th><th></th></tr></thead>
    <tbody>${suppliers.map(s => `<tr>
      <td><strong>${esc(s.trade_name || s.legal_name)}</strong><br><small class="td-muted">${esc(s.legal_name)}</small></td>
      <td>${fmtCNPJ(s.cnpj)}</td>
      <td>${esc(s.phone || '—')}<br><small class="td-muted">${esc(s.email || '')}</small></td>
      <td>${(s.categories || []).map(c => `<span class="chip chip-inativo">${esc(c)}</span>`).join(' ')}</td>
      <td>${chip({ ativo: 'Ativo', inativo: 'Inativo', pendente: 'Pendente' }, s.status)}</td>
      <td style="white-space:nowrap">${s.status === 'pendente' ? `<button class="btn btn-primary btn-sm" data-approve-sup="${esc(s.id)}">Aprovar</button> ` : ''}<button class="btn btn-ghost btn-sm" data-edit-sup="${esc(s.id)}">Editar</button></td>
    </tr>`).join('')}</tbody></table></div>`;
  $$('[data-approve-sup]').forEach(btn => btn.addEventListener('click', () => confirmModal('Aprovar fornecedor', 'Liberar este fornecedor para fazer agendamentos nesta rede?', 'Aprovar', async () => { await api(`/suppliers/${btn.dataset.approveSup}/status`, { method: 'PATCH', body: { status: 'ativo' } }); toast('Fornecedor ativado.'); loadSuppliersTable(); })));
  $$('[data-edit-sup]').forEach(btn => btn.addEventListener('click', () => openSupplierModal(suppliers.find(s => s.id === btn.dataset.editSup))));
}
function openSupplierModal(sup) {
  const isEdit = !!sup;
  const catIds = new Set(); // categorias atuais não vêm com ids; o checkbox de categorias usa os nomes
  const currentCats = new Set((sup?.categories || []).map(String));
  const currentCarrierIds = new Set(); // transportadoras são vinculadas pelo painel de edição completo
  openModal({
    title: isEdit ? `Editar ${sup.trade_name || sup.legal_name}` : 'Novo fornecedor',
    large: true,
    body: `
      <div class="grid-2">
        <label class="field"><span>Razão social *</span><input id="supLegal" maxlength="200" value="${esc(sup?.legal_name || '')}"></label>
        <label class="field"><span>Nome fantasia</span><input id="supTrade" maxlength="200" value="${esc(sup?.trade_name || '')}"></label>
      </div>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>CNPJ *</span><input id="supCnpj" inputmode="numeric" value="${fmtCNPJ(sup?.cnpj)}" placeholder="00.000.000/0000-00"></label>
        <label class="field"><span>Representante</span><input id="supRep" maxlength="200" value="${esc(sup?.representative || '')}"></label>
      </div>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>Telefone</span><input id="supPhone" value="${esc(sup?.phone || '')}" placeholder="(48) 99999-0000"></label>
        <label class="field"><span>E-mail</span><input type="email" id="supEmail" value="${esc(sup?.email || '')}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>Endereço</span><input id="supAddr" maxlength="300" value="${esc(sup?.address || '')}"></label>
      <label class="field" style="margin-top:10px"><span>Código Sysmo (fornecedor)</span><input id="supSysmo" value="${esc(sup?.sysmo_code || '')}" placeholder="Somente p/ integração futura"></label>
      <div style="margin-top:10px"><span class="field" style="font-size:12px; font-weight:700; color:var(--ink-2); display:block; margin-bottom:6px">Categorias fornecidas</span>
        <div class="checkbox-grid" id="supCats">${state.categories.map(c => `<label><input type="checkbox" value="${esc(c.id)}" data-cat-name="${esc(c.name)}" ${currentCats.has(c.name) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')}</div>
      </div>
      <div style="margin-top:10px"><button class="btn btn-ghost btn-sm" id="btnNewCategory"><svg width="16" height="16"><use href="#i-plus"/></svg>Nova categoria</button></div>
      <div style="margin-top:10px"><span class="field" style="font-size:12px; font-weight:700; color:var(--ink-2); display:block; margin-bottom:6px">Transportadoras vinculadas</span>
        <div class="checkbox-grid" id="supCarriers">${state.carriers.map(c => `<label><input type="checkbox" value="${esc(c.id)}">${esc(c.trade_name || c.legal_name)}</label>`).join('')}</div>
        <p class="td-muted" style="margin:6px 0 0">As transportadoras marcadas ficam disponíveis no formulário de agendamento.</p>
      </div>
      <div class="form-error" id="supError" hidden></div>`,
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      ...(isEdit ? [{ label: sup.status === 'ativo' ? 'Inativar' : 'Ativar', kind: 'btn-dark', onClick: async (close) => { await api(`/suppliers/${sup.id}/status`, { method: 'PATCH', body: { status: sup.status === 'ativo' ? 'inativo' : 'ativo' } }); toast('Situação atualizada.'); close(); loadSuppliersTable(); } }] : []),
      { label: isEdit ? 'Salvar' : 'Cadastrar fornecedor', kind: 'btn-primary', onClick: async (close, btn) => {
          const err = $('#supError'); err.hidden = true; btn.disabled = true;
          try {
            const category_ids = $$('#supCats input:checked').map(i => i.value);
            const carrier_ids = $$('#supCarriers input:checked').map(i => i.value);
            const payload = {
              legal_name: $('#supLegal').value.trim(), trade_name: $('#supTrade').value.trim(),
              cnpj: $('#supCnpj').value.replace(/\D/g, ''), representative: $('#supRep').value.trim(),
              phone: $('#supPhone').value.trim(), email: $('#supEmail').value.trim(),
              address: $('#supAddr').value.trim(), sysmo_code: $('#supSysmo').value.trim() || null,
              category_ids, carrier_ids,
            };
            if (isEdit) await api(`/suppliers/${sup.id}`, { method: 'PUT', body: payload });
            else await api('/suppliers', { method: 'POST', body: payload });
            toast(isEdit ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.'); close(); loadSuppliersTable(); loadCaches();
          } catch (e) { err.textContent = e.body?.message || niceError(e); err.hidden = false; btn.disabled = false; }
        } },
    ],
    onOpen: (panel) => {
      $('#btnNewCategory', panel)?.addEventListener('click', async () => {
        const name = prompt('Nome da nova categoria:');
        if (!name?.trim()) return;
        try { const { category } = await api('/categories', { method: 'POST', body: { name: name.trim() } }); state.categories.push(category); toast('Categoria criada. Reabra o formulário para vê-la.'); } catch (e) { toast(niceError(e), true); }
      });
    },
  });
}

/* ==========================================================================
   TRANSPORTADORAS (rede_admin)
   ========================================================================== */
async function renderTransportadoras() {
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Transportadoras</h2><p>Empresas que executam o transporte das cargas</p></div>
        <button class="btn btn-primary" id="btnNewCarrier"><svg width="18" height="18"><use href="#i-plus"/></svg>Nova transportadora</button></div>
      <div id="carriersTable"></div>
    </div>`;
  $('#btnNewCarrier').addEventListener('click', () => openCarrierModal(null));
  await loadCarriersTable();
}
async function loadCarriersTable() {
  const { carriers } = await api('/carriers');
  state.carriers = carriers;
  $('#carriersTable').innerHTML = carriers.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Transportadora</th><th>CNPJ</th><th>Contato</th><th>Situação</th><th></th></tr></thead>
    <tbody>${carriers.map(c => `<tr><td><strong>${esc(c.trade_name || c.legal_name)}</strong><br><small class="td-muted">${esc(c.legal_name)}</small></td><td>${fmtCNPJ(c.cnpj)}</td><td>${esc(c.phone || '—')}<br><small class="td-muted">${esc(c.email || '')}</small></td><td>${chip({ ativo: 'Ativo', inativo: 'Inativo' }, c.status)}</td><td><button class="btn btn-ghost btn-sm" data-edit-carrier="${esc(c.id)}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma transportadora', 'Cadastre a primeira transportadora da rede.');
  $$('[data-edit-carrier]').forEach(btn => btn.addEventListener('click', () => openCarrierModal(carriers.find(c => c.id === btn.dataset.editCarrier))));
}
function openCarrierModal(c) {
  const isEdit = !!c;
  openModal({
    title: isEdit ? 'Editar transportadora' : 'Nova transportadora',
    body: `
      <label class="field"><span>Razão social *</span><input id="carLegal" maxlength="200" value="${esc(c?.legal_name || '')}"></label>
      <label class="field" style="margin-top:10px"><span>Nome fantasia</span><input id="carTrade" maxlength="200" value="${esc(c?.trade_name || '')}"></label>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>CNPJ</span><input id="carCnpj" inputmode="numeric" value="${fmtCNPJ(c?.cnpj)}"></label>
        <label class="field"><span>Telefone</span><input id="carPhone" value="${esc(c?.phone || '')}"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>E-mail</span><input type="email" id="carEmail" value="${esc(c?.email || '')}"></label>
      <div class="form-error" id="carErr" hidden></div>`,
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      ...(isEdit ? [{ label: c.status === 'ativo' ? 'Inativar' : 'Ativar', kind: 'btn-dark', onClick: async (close) => { await api(`/carriers/${c.id}`, { method: 'PUT', body: { status: c.status === 'ativo' ? 'inativo' : 'ativo' } }); toast('Situação atualizada.'); close(); loadCarriersTable(); loadCaches(); } }] : []),
      { label: isEdit ? 'Salvar' : 'Cadastrar', kind: 'btn-primary', onClick: async (close, btn) => {
          const err = $('#carErr'); err.hidden = true; btn.disabled = true;
          try {
            const payload = { legal_name: $('#carLegal').value.trim(), trade_name: $('#carTrade').value.trim(), cnpj: $('#carCnpj').value.replace(/\D/g, '') || null, phone: $('#carPhone').value.trim(), email: $('#carEmail').value.trim() };
            if (isEdit) await api(`/carriers/${c.id}`, { method: 'PUT', body: payload });
            else await api('/carriers', { method: 'POST', body: payload });
            toast('Salvo.'); close(); loadCarriersTable(); loadCaches();
          } catch (e) { err.textContent = e.body?.message || niceError(e); err.hidden = false; btn.disabled = false; }
        } },
    ],
  });
}

/* ==========================================================================
   USUÁRIOS & ACESSOS
   ========================================================================== */
async function renderUsuarios() {
  const isAdmin = state.me.isRedeAdmin;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Usuários &amp; acessos</h2><p>${isAdmin ? 'Gestão completa de acessos da rede' : 'Equipe das suas lojas (somente leitura)'}</p></div>
        ${isAdmin ? '<button class="btn btn-primary" id="btnNewUser"><svg width="18" height="18"><use href="#i-plus"/></svg>Novo usuário</button>' : ''}</div>
      <div id="usersTable"></div>
    </div>`;
  if (isAdmin) $('#btnNewUser').addEventListener('click', () => openUserModal());
  await loadUsersTable();
}
async function loadUsersTable() {
  const { users } = await api('/users');
  const isAdmin = state.me.isRedeAdmin;
  $('#usersTable').innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>Nome</th><th>E-mail</th><th>Papéis</th><th>Último acesso</th><th>Situação</th>${isAdmin ? '<th></th>' : ''}</tr></thead>
    <tbody>${users.map(u => `<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}<br><small class="td-muted">${esc(u.phone || '')}</small></td><td>${(u.roles || []).map(r => `<span class="chip chip-inativo">${esc(ROLE_LABELS[r.role] || r.role)}${r.store_name ? ' · ' + esc(r.store_name) : ''}</span>`).join(' ')}</td><td>${u.last_login_at ? fmtDateTime(u.last_login_at) : 'nunca'}</td><td>${chip({ ativo: 'Ativo', inativo: 'Inativo' }, u.status)}</td>${isAdmin ? `<td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-toggle-user="${esc(u.id)}" data-status="${esc(u.status)}">${u.status === 'ativo' ? 'Inativar' : 'Ativar'}</button> <button class="btn btn-ghost btn-sm" data-reset-user="${esc(u.id)}" data-name="${esc(u.name)}">Senha</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  $$('[data-toggle-user]').forEach(btn => btn.addEventListener('click', () => {
    const to = btn.dataset.status === 'ativo' ? 'inativo' : 'ativo';
    confirmModal(to === 'inativo' ? 'Inativar usuário' : 'Reativar usuário', to === 'inativo' ? 'O usuário perde acesso imediatamente. Continuar?' : 'Reativar acesso deste usuário?', 'Confirmar', async () => { await api(`/users/${btn.dataset.toggleUser}`, { method: 'PATCH', body: { status: to } }); toast('Atualizado.'); loadUsersTable(); }, to === 'inativo');
  }));
  $$('[data-reset-user]').forEach(btn => btn.addEventListener('click', () => openResetPasswordModal(btn.dataset.resetUser, btn.dataset.name)));
}
function openResetPasswordModal(userId, name) {
  openModal({
    title: `Redefinir senha — ${name}`,
    body: `<label class="field"><span>Nova senha (mín. 8 caracteres)</span><input type="password" id="rpNew" minlength="8" autocomplete="new-password"></label><div class="form-error" id="rpErr" hidden></div>`,
    actions: [
      { label: 'Voltar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Redefinir', kind: 'btn-primary', onClick: async (close) => { const v = $('#rpNew').value; if (v.length < 8) { $('#rpErr').textContent = 'Mínimo de 8 caracteres.'; $('#rpErr').hidden = false; return; } try { await api(`/users/${userId}`, { method: 'PATCH', body: { newPassword: v } }); toast('Senha redefinida.'); close(); } catch (e) { $('#rpErr').textContent = niceError(e); $('#rpErr').hidden = false; } } },
    ],
  });
}
function openUserModal() {
  openModal({
    title: 'Novo usuário',
    body: `
      <div class="grid-2">
        <label class="field"><span>Nome *</span><input id="nuName" maxlength="200"></label>
        <label class="field"><span>Telefone</span><input id="nuPhone" placeholder="(48) 99999-0000"></label>
      </div>
      <label class="field" style="margin-top:10px"><span>E-mail *</span><input type="email" id="nuEmail"></label>
      <label class="field" style="margin-top:10px"><span>Senha temporária (mín. 8) *</span><input type="password" id="nuPassword" minlength="8" autocomplete="new-password"></label>
      <div class="grid-2" style="margin-top:10px">
        <label class="field"><span>Papel *</span><select id="nuRole">
          <option value="loja_gerente">Gerente da loja</option>
          <option value="recebimento">Equipe de recebimento</option>
          <option value="rede_admin">Administrador da rede</option>
          <option value="fornecedor">Fornecedor / Transportadora</option></select></label>
        <label class="field" id="nuStoreWrap"><span>Loja *</span><select id="nuStore">${storeOptions()}</select></label>
      </div>
      <label class="field" id="nuSupplierWrap" hidden style="margin-top:10px"><span>Fornecedor *</span><select id="nuSupplier">${state.suppliers.map(s => `<option value="${esc(s.id)}">${esc(s.trade_name || s.legal_name)}</option>`).join('')}</select></label>
      <div class="form-error" id="nuErr" hidden></div>`,
    onOpen: (panel) => {
      const sync = () => { const role = $('#nuRole').value; $('#nuStoreWrap').hidden = !['loja_gerente', 'recebimento'].includes(role); $('#nuSupplierWrap').hidden = role !== 'fornecedor'; };
      $('#nuRole').addEventListener('change', sync); sync();
    },
    actions: [
      { label: 'Cancelar', kind: 'btn-ghost', onClick: (close) => close() },
      { label: 'Criar usuário', kind: 'btn-primary', onClick: async (close, btn) => {
          const err = $('#nuErr'); err.hidden = true; btn.disabled = true;
          const role = $('#nuRole').value;
          try {
            const payload = { name: $('#nuName').value.trim(), email: $('#nuEmail').value.trim().toLowerCase(), phone: $('#nuPhone').value.trim(), password: $('#nuPassword').value, role, store_id: ['loja_gerente', 'recebimento'].includes(role) ? $('#nuStore').value : null, supplier_id: role === 'fornecedor' ? $('#nuSupplier').value : null };
            await api('/users', { method: 'POST', body: payload });
            toast('Usuário criado.'); close(); loadUsersTable();
          } catch (e) { err.textContent = e.body?.message || niceError(e); err.hidden = false; btn.disabled = false; }
        } },
    ],
  });
}

/* ==========================================================================
   RELATÓRIOS
   ========================================================================== */
async function renderRelatorios() {
  const today = todayStr();
  const d30 = new Date(Date.now() - 29 * 86400000);
  const from = `${d30.getFullYear()}-${String(d30.getMonth() + 1).padStart(2, '0')}-${String(d30.getDate()).padStart(2, '0')}`;
  const multiStore = !state.isSupplier && state.stores.length > 1;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Relatórios operacionais</h2><p>Período, loja e fornecedor — com exportação em PDF e Excel (CSV)</p></div></div>
      <div class="filters">
        <label class="field"><span>De</span><input type="date" id="rpFrom" value="${from}"></label>
        <label class="field"><span>Até</span><input type="date" id="rpTo" value="${today}"></label>
        ${multiStore ? `<label class="field"><span>Loja</span><select id="rpStore"><option value="">Todas</option>${storeOptions()}</select></label>` : ''}
        ${!state.isSupplier ? `<label class="field"><span>Fornecedor</span><select id="rpSupplier"><option value="">Todos</option>${supplierOptions()}</select></label>` : ''}
        <button class="btn btn-primary" id="btnRunReport">Gerar relatório</button>
        <a class="btn btn-ghost" id="btnExportCsv" href="#" download>Exportar Excel (CSV)</a>
        <a class="btn btn-dark" id="btnExportPdf" href="#" download>Exportar PDF</a>
      </div>
      <div id="reportOutput" style="margin-top:14px">${emptyState('Relatório ainda não gerado', 'Escolha o período e clique em "Gerar relatório".')}</div>
    </div>`;
  const qs = () => {
    const p = new URLSearchParams({ from: $('#rpFrom').value, to: $('#rpTo').value });
    if ($('#rpStore')?.value) p.set('store_id', $('#rpStore').value);
    if ($('#rpSupplier')?.value) p.set('supplier_id', $('#rpSupplier').value);
    return p;
  };
  const syncExports = () => { $('#btnExportCsv').href = `/api/reports/export.csv?${qs()}`; $('#btnExportPdf').href = `/api/reports/export.pdf?${qs()}`; };
  const run = async () => {
    syncExports();
    $('#reportOutput').innerHTML = '<div class="empty"><strong>Calculando…</strong></div>';
    try {
      const d = await api(`/reports/summary?${qs()}`);
      const s = d.summary;
      $('#reportOutput').innerHTML = `
        <div class="kpis">
          ${kpi('Total agendado', s.total_agendados, 'dark')}
          ${kpi('Entregas recebidas', s.concluidos, 'green')}
          ${kpi('Parciais', s.parciais, '')}
          ${kpi('Pontuais', s.pontuais, 'green')}
          ${kpi('Atrasadas', s.atrasos, 'amber')}
          ${kpi('Cancelamentos', s.cancelamentos, 'red')}
          ${kpi('Faltas', s.faltas, 'red')}
          ${kpi('Recusados', s.recusados, '')}
        </div>
        <div class="kpis" style="margin-top:12px; grid-template-columns:repeat(4,1fr)">
          ${kpi('Espera média', `${s.espera_media_min} min`, '')}
          ${kpi('Recebimento médio', `${s.recebimento_medio_min} min`, '')}
          ${kpi('Índice de faltas', `${s.indice_faltas}%`, 'amber')}
          ${kpi('Pontualidade', s.taxa_pontualidade === null ? '—' : `${s.taxa_pontualidade}%`, 'green')}
        </div>
        <div class="grid-2" style="margin-top:14px; align-items:start">
          <div class="panel" style="box-shadow:none">
            <h3 style="font-size:13px; text-transform:uppercase; color:var(--muted); margin:0 0 8px">Desempenho por fornecedor</h3>
            ${d.bySupplier.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Fornecedor</th><th>Agend.</th><th>Entregas</th><th>Atrasos</th><th>Faltas</th></tr></thead><tbody>${d.bySupplier.map(r => `<tr><td>${esc(r.fornecedor)}</td><td>${r.agendados}</td><td>${r.entregas}</td><td>${r.atrasos}</td><td>${r.faltas}</td></tr>`).join('')}</tbody></table></div>` : '<p class="td-muted">Sem dados no período.</p>'}
          </div>
          <div class="panel" style="box-shadow:none">
            <h3 style="font-size:13px; text-transform:uppercase; color:var(--muted); margin:0 0 8px">Desempenho por loja</h3>
            ${d.byStore.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Loja</th><th>Agend.</th><th>Recebidos</th><th>Médio (min)</th></tr></thead><tbody>${d.byStore.map(r => `<tr><td>${esc(r.loja)} <small class="td-muted">${esc(r.codigo)}</small></td><td>${r.agendados}</td><td>${r.recebidos}</td><td>${r.recebimento_medio_min}</td></tr>`).join('')}</tbody></table></div>` : '<p class="td-muted">Sem dados no período.</p>'}
          </div>
        </div>
        <div class="panel" style="margin-top:12px; box-shadow:none">
          <h3 style="font-size:13px; text-transform:uppercase; color:var(--muted); margin:0 0 8px">Movimento por dia</h3>
          ${d.byDay.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Dia</th><th>Agendados</th><th>Recebidos</th></tr></thead><tbody>${d.byDay.map(r => `<tr><td>${fmtDate(r.dia)}</td><td>${r.agendados}</td><td>${r.recebidos}</td></tr>`).join('')}</tbody></table></div>` : '<p class="td-muted">Sem dados no período.</p>'}
        </div>`;
    } catch (e) { $('#reportOutput').innerHTML = `<div class="alert alert-warn">${esc(niceError(e))}</div>`; }
  };
  $('#btnRunReport').addEventListener('click', run);
  $('#rpFrom').addEventListener('change', syncExports); $('#rpTo').addEventListener('change', syncExports);
  syncExports();
}

/* ==========================================================================
   NOTIFICAÇÕES
   ========================================================================== */
async function renderNotificacoes() {
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Notificações</h2><p>Avisos de agendamento, aprovação, alteração, cancelamento e recuperação de senha</p></div>
        <button class="btn btn-ghost btn-sm" id="btnReadAll"><svg width="16" height="16"><use href="#i-check"/></svg>Marcar todas como lidas</button></div>
      <div id="notifList"></div>
    </div>`;
  $('#btnReadAll').addEventListener('click', async () => { await api('/notifications/read-all', { method: 'POST' }); renderNotificacoes(); refreshBadge(); });
  const { notifications } = await api('/notifications');
  $('#notifList').innerHTML = notifications.length ? notifications.map(n => `
    <div class="notif-item ${n.read_at ? '' : 'notif-unread'}" data-id="${esc(n.id)}" data-appt="${esc(n.appointment_id || '')}" style="display:flex; gap:12px; align-items:start; border:1px solid var(--line); border-left:4px solid ${n.read_at ? 'var(--line-strong)' : 'var(--green)'}; background:${n.read_at ? '#fff' : 'var(--green-soft)'}; border-radius:12px; padding:12px 14px; margin-bottom:8px; cursor:pointer">
      <div style="flex:1"><strong style="font-size:13px">${esc(n.title)}</strong><div class="td-muted" style="margin:2px 0">${esc(n.body || '')}</div><small class="td-muted">${fmtDateTime(n.created_at)} · canal ${esc(n.channel)}</small></div>
    </div>`).join('') : emptyState('Nenhuma notificação', 'Você será avisado sobre movimentos dos seus agendamentos.');
  $$('.notif-item').forEach(el => el.addEventListener('click', async () => {
    await api(`/notifications/${el.dataset.id}/read`, { method: 'POST' }).catch(() => {});
    refreshBadge();
    if (el.dataset.appt) openAppointmentDetail(el.dataset.appt); else renderNotificacoes();
  }));
}

/* ==========================================================================
   AUDITORIA
   ========================================================================== */
async function renderAuditoria() {
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Trilha de auditoria</h2><p>Registro imutável das ações — quem, quando, onde e o quê</p></div></div>
      <div id="auditTable"></div>
    </div>`;
  const { logs } = await api('/audit');
  $('#auditTable').innerHTML = logs.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Entidade</th><th>Loja</th><th>Detalhes</th></tr></thead>
    <tbody>${logs.map(l => `<tr><td>${fmtDateTime(l.created_at)}</td><td>${esc(l.user_name || 'sistema')}</td><td>${esc(l.action)}</td><td>${esc(l.entity)}${l.entity_id ? ` <span class="td-muted">#${esc(String(l.entity_id).slice(0, 8))}</span>` : ''}</td><td>${esc(l.store_name || '—')}</td><td><code style="font-size:11px; color:var(--muted)">${esc(JSON.stringify(l.details || {})).slice(0, 140)}</code></td></tr>`).join('')}</tbody></table></div>` : emptyState('Sem registros ainda', 'As ações do sistema aparecerão aqui.');
}

/* ==========================================================================
   INTEGRAÇÃO SYSMO S1 (preparada; não envia dados)
   ========================================================================== */
async function renderIntegracao() {
  const d = await api('/integration/status');
  const s = d.sysmo;
  $('#content').innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h2>Integração com Sysmo S1</h2><p>Fase 7 — arquitetura preparada, aguardando documentação oficial</p></div></div>
      <div class="alert alert-info" style="margin-bottom:12px">${esc(s.message)}</div>
      <dl class="dl">
        <dt>Estado</dt><dd>${s.enabled ? 'Habilitada' : 'Desabilitada — aguardando documentação e autorização de acesso'}</dd>
        <dt>Fila de integração (outbox)</dt><dd>${s.outbox.length ? s.outbox.map(o => `${esc(o.status)}: ${o.n}`).join(' · ') : 'vazia'}</dd>
        <dt>Últimos eventos</dt><dd>${s.latest.length ? s.latest.map(l => `${esc(l.event)} → ${esc(l.status)} (${fmtDateTime(l.created_at)})`).join('<br>') : 'nenhum'}</dd>
      </dl>
      <h3 style="font-size:13px; text-transform:uppercase; color:var(--muted); margin:16px 0 8px">Campos já preparados no agendamento</h3>
      <ul class="login-points" style="max-width:640px">
        <li>Código do fornecedor no Sysmo <code>suppliers.sysmo_code</code></li>
        <li>Código da loja no Sysmo <code>stores.sysmo_store_code</code></li>
        <li>Número, chave, data de emissão e valor da NF-e (<code>appointments</code>)</li>
        <li>Código de integração e situação (<code>integration_code</code>, <code>integration_status</code>)</li>
        <li>Fila <code>integration_outbox</code> com payload do evento <code>agendamento_criado</code></li>
      </ul>
      <p class="td-muted" style="margin-top:12px">Nenhum endpoint ou API é inventado. A integração só será ativada quando o Sysmo fornecer documentação e credenciais — o campo <code>networks.sysmo_enabled</code> permanece <strong>false</strong>.</p>
    </div>`;
}

/* ==========================================================================
   CONFIGURAÇÕES (conta + rede)
   ========================================================================== */
async function renderConfiguracoes() {
  const isAdmin = state.me.isRedeAdmin;
  let network = null;
  try { network = (await api('/network')).network; } catch (_) {}
  $('#content').innerHTML = `
    <div class="grid-2" style="align-items:start">
      <div class="panel">
        <div class="panel-head"><div><h2>Minha conta</h2><p>${esc(state.me.user.email)}</p></div></div>
        <form id="formChangePassword">
          <label class="field"><span>Senha atual</span><input type="password" name="current" required autocomplete="current-password"></label>
          <label class="field" style="margin-top:10px"><span>Nova senha (mín. 8)</span><input type="password" name="newPassword" required minlength="8" autocomplete="new-password"></label>
          <div class="form-error" id="pwErr" hidden></div>
          <div class="form-ok" id="pwOk" hidden>Senha alterada com sucesso.</div>
          <button type="submit" class="btn btn-primary" style="margin-top:12px">Alterar senha</button>
        </form>
      </div>
      ${isAdmin ? `
      <div class="panel">
        <div class="panel-head"><div><h2>Minha rede</h2><p>Dados institucionais e código de convite de fornecedores</p></div></div>
        <label class="field"><span>Nome da rede</span><input id="netName" maxlength="150" value="${esc(network?.name || '')}"></label>
        <label class="field" style="margin-top:10px"><span>Administrador principal</span><input id="netAdmin" maxlength="200" value="${esc(network?.admin_name || '')}"></label>
        <label class="field" style="margin-top:10px"><span>Código de convite de fornecedor</span>
          <div style="display:flex; gap:8px"><input id="netSignup" value="${esc(network?.supplier_signup_code || '')}" placeholder="vazio = cadastro externo desativado" style="flex:1"><button class="btn btn-ghost" id="btnRegenCode" type="button">Gerar</button></div>
          <small class="td-muted">Fornecedores externos usam este código na tela de login (aba "Sou fornecedor").</small></label>
        <label style="display:flex; gap:10px; align-items:center; margin-top:12px; min-height:44px"><input type="checkbox" id="netAuto" ${network?.auto_approve_appointments ? 'checked' : ''} style="width:20px; height:20px; accent-color:var(--green)"><span style="font-size:13px; font-weight:600">Aprovar agendamentos automaticamente (todas as lojas sem regra própria)</span></label>
        <div class="form-error" id="netErr" hidden></div>
        <button class="btn btn-primary" id="btnSaveNetwork" style="margin-top:12px">Salvar rede</button>
      </div>` : ''}
    </div>`;
  $('#formChangePassword')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = $('#pwErr'); err.hidden = true; $('#pwOk').hidden = true;
    try {
      await api('/account/password', { method: 'POST', body: { current: form.current.value, newPassword: form.newPassword.value } });
      $('#pwOk').hidden = false; form.reset();
    } catch (e2) { err.textContent = niceError(e2); err.hidden = false; }
  });
  $('#btnRegenCode')?.addEventListener('click', async () => {
    const { network: net } = await api('/network', { method: 'PUT', body: { regenerate_signup_code: true } });
    $('#netSignup').value = net.supplier_signup_code || '';
    toast('Novo código gerado.');
  });
  $('#btnSaveNetwork')?.addEventListener('click', async () => {
    const err = $('#netErr'); err.hidden = true;
    try {
      await api('/network', { method: 'PUT', body: { name: $('#netName').value.trim(), admin_name: $('#netAdmin').value.trim(), supplier_signup_code: $('#netSignup').value.trim() || null, auto_approve_appointments: $('#netAuto').checked } });
      toast('Rede atualizada.');
    } catch (e2) { err.textContent = niceError(e2); err.hidden = false; }
  });
}

boot();
