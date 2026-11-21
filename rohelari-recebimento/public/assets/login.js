'use strict';
// Login / cadastro externo / recuperação de senha
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

// Já logado? Vai direto para o painel
fetch('/api/auth/me').then(r => { if (r.ok) window.location.href = '/app.html'; }).catch(() => {});

$$('.auth-tab').forEach(btn => btn.addEventListener('click', () => {
  $$('.auth-tab').forEach(b => b.classList.toggle('active', b === btn));
  const tab = btn.dataset.tab;
  $('#form-login').hidden = tab !== 'login';
  $('#form-register').hidden = tab !== 'register';
  $('#form-forgot').hidden = tab !== 'forgot';
}));

function showError(form, msg) { const box = $('[data-error]', form); box.textContent = msg; box.hidden = false; const ok = $('[data-ok]', form); if (ok) ok.hidden = true; }
function showOk(form, msg) { const box = $('[data-ok]', form); if (box) { box.textContent = msg; box.hidden = false; } const err = $('[data-error]', form); if (err) err.hidden = true; }

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = $('button[type=submit]', form);
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('[name=email]', form).value.trim(), password: $('[name=password]', form).value }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { showError(form, body.error === 'muitas_tentativas' ? 'Muitas tentativas. Aguarde 15 minutos.' : 'E-mail ou senha incorretos.'); return; }
    window.location.href = '/app.html';
  } catch (_) {
    showError(form, 'Falha de conexão. Tente novamente.');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar no sistema';
  }
});

$('#form-register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = $('button[type=submit]', form);
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const data = Object.fromEntries(new FormData(form).entries());
    const r = await fetch('/api/auth/register-supplier', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { showError(form, body.message || ({ codigo_convite_invalido: 'Código de convite inválido. Peça à rede responsável.', cnpj_ja_cadastrado: 'Este CNPJ já está cadastrado nesta rede.' }[body.error] || 'Não foi possível enviar. Confira os dados.')); return; }
    form.querySelectorAll('input').forEach(i => { i.value = ''; });
    showOk(form, body.message || 'Cadastro enviado! Aguarde a aprovação da rede.');
  } catch (_) {
    showError(form, 'Falha de conexão. Tente novamente.');
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar cadastro para aprovação';
  }
});

$('#form-forgot').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const email = $('[name=email]', form).value.trim();
  const r = await fetch('/api/auth/forgot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const body = await r.json().catch(() => ({}));
  showOk(form, body.message || 'Se o e-mail existir, as instruções serão enviadas.');
});

$('#btn-reset').addEventListener('click', async () => {
  const form = $('#form-forgot');
  const email = $('[name=email]', form).value.trim();
  const code = $('[name=code]', form).value.trim();
  const newPassword = $('[name=newPassword]', form).value;
  if (!email || !code || newPassword.length < 8) { showError(form, 'Preencha e-mail, código e nova senha (mín. 8).'); return; }
  const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, newPassword }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { showError(form, 'Código inválido ou expirado.'); return; }
  showOk(form, 'Senha redefinida! Entre com a nova senha na aba "Entrar".');
});
