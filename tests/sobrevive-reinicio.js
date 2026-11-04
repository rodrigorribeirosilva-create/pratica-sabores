/**
 * Teste decisivo de persistência:
 *   1. faz várias alterações seguidas (preços 16, 17, 18, 19, 20)
 *   2. espera o backup subir para a nuvem
 *   3. reinicia o servidor (deploy)
 *   4. confere se o ÚLTIMO preço (20,00) voltou
 */
const BASE = 'https://loja-digital.onrender.com';
const SLUG = 'pratica-sabores', SENHA = 'pratica123', ID = 1;
const RND = process.env.RND;
const SID = 'srv-dbhvkcek1f9s73ecakog';

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function cookie() {
  const r = await fetch(`${BASE}/l/${SLUG}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: SENHA }) });
  return (r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
}
async function precoNoAr() {
  const m = await (await fetch(`${BASE}/l/${SLUG}/api/menu`)).json();
  return m.products.find((p) => p.id === ID).price_cents;
}
async function definirPreco(ck, reais, base) {
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const body = { name: base.name, description: base.description, price: reais, category: base.category, active: base.active, sort_order: base.sort_order, image_url: base.image_url };
  await fetch(`${BASE}/l/${SLUG}/api/admin/products/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
}
async function reiniciar() {
  const r = await fetch(`https://api.render.com/v1/services/${SID}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clearCache: 'do_not_clear' }),
  });
  const j = await r.json();
  console.log('  deploy disparado:', j.id);
  for (let i = 0; i < 60; i++) {
    await dormir(10000);
    const d = await (await fetch(`https://api.render.com/v1/services/${SID}/deploys/${j.id}`, { headers: { Authorization: `Bearer ${RND}` } })).json();
    if (d.status === 'live') return true;
    if (d.status === 'build_failed' || d.status === 'canceled') return false;
  }
  return false;
}

(async () => {
  const ck = await cookie();
  const lista = await (await fetch(`${BASE}/l/${SLUG}/api/admin/products`, { headers: { Cookie: ck } })).json();
  const base = (Array.isArray(lista) ? lista : lista.products).find((p) => p.id === ID);
  console.log('1) preço inicial:', (await precoNoAr()) / 100);

  for (const reais of ['16,00', '17,00', '18,00', '19,00', '20,00']) await definirPreco(ck, reais, base);
  console.log('2) 5 alterações seguidas — última: 20,00');

  await dormir(8000);
  console.log('3) no ar agora:', (await precoNoAr()) / 100);

  console.log('4) reiniciando o servidor…');
  const ok = await reiniciar();
  console.log('   deploy final:', ok ? 'live' : 'FALHOU');
  if (!ok) return;

  for (let i = 0; i < 12; i++) {
    try {
      const p = await precoNoAr();
      console.log('5) DEPOIS do reinício:', p / 100, p === 2000 ? '✅ sobreviveu' : '❌ perdeu');
      break;
    } catch { await dormir(5000); }
  }

  // volta ao preço de verdade (15,00)
  const ck2 = await cookie();
  await definirPreco(ck2, '15,00', base);
  await dormir(3000);
  console.log('6) preço restaurado para:', (await precoNoAr()) / 100);
})();
