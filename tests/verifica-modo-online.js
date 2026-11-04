/**
 * Modo "somente pagamento online" por loja:
 * - ligado (com link de pagamento) → o cliente vê só "Pagamento online"
 * - desligado → volta a lista completa
 * - loja sem conta de recebimento → modo não é aplicado (evita tela vazia)
 */
const B = 'https://loja-digital.onrender.com/l/ageo-confeitaria/api';
async function api(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(B + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
  return { json: await r.json(), cookie: cookie || cookies };
}
(async () => {
  let erros = 0;
  // a dona da AGEO trocou a senha (é dela): o teste usa a senha atual
  const SENHA = process.env.SENHA_AGEO || 'anaisa2026';
  const login = await api('/admin/login', { method: 'POST', body: { password: SENHA } });
  const cookie = login.cookie;
  const cfg = (await api('/admin/settings', { cookie })).json;
  const pays = JSON.parse(JSON.stringify(cfg.payments));

  const checa = (nome, ok) => { if (!ok) erros++; console.log(`${ok ? '✓' : '✗'} ${nome}`); };

  // 1) modo online COM link de pagamento
  const comLink = pays.map((p) => ({ ...p, pay_url: /cart/i.test(p.label) ? 'https://mpago.la/teste' : p.pay_url || '' }));
  await api('/admin/settings', { method: 'PUT', cookie, body: { payments: comLink, checkout: { modo: 'online' } } });
  let menu = await (await fetch('https://loja-digital.onrender.com/l/ageo-confeitaria/api/menu')).json();
  checa('modo online aplicado', menu.checkout_modo === 'online');
  checa('cliente vê só 1 forma de pagamento', menu.payments.length === 1);
  checa('a forma é "Pagamento online"', (menu.payments[0] || {}).label === 'Pagamento online');

  // 2) modo online SEM conta/link → tem de voltar para a lista normal
  const semLink = pays.map((p) => ({ ...p, pay_url: '' }));
  await api('/admin/settings', { method: 'PUT', cookie, body: { payments: semLink, checkout: { modo: 'online' } } });
  menu = await (await fetch('https://loja-digital.onrender.com/l/ageo-confeitaria/api/menu')).json();
  checa('sem conta de recebimento, mantém a lista original', menu.payments.length > 1);

  // 3) volta para "todas"
  await api('/admin/settings', { method: 'PUT', cookie, body: { payments: semLink, checkout: { modo: 'todos' } } });
  menu = await (await fetch('https://loja-digital.onrender.com/l/ageo-confeitaria/api/menu')).json();
  checa('modo "todos" restaurado', menu.checkout_modo === 'todos' && menu.payments.length > 1);

  console.log('\nERROS:', erros);
  process.exit(erros ? 1 : 0);
})();
