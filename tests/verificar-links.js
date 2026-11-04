/**
 * Pente-fino de LINKS: confere se os links das lojas, os painéis e o master
 * estão respondendo. Se algum parar de funcionar, este teste acusa na hora.
 * Uso: node tests/verificar-links.js
 */
const BASE = process.env.BASE || 'https://loja-digital.onrender.com';
const LOJAS = [
  { slug: 'pratica-sabores', atalho: 'pratica' },
  { slug: 'mdn-presents', atalho: 'mdn' },
  { slug: 'henrique-borges', atalho: 'henrique' },
  { slug: 'mimo-de-linha', atalho: 'mimo' },
  { slug: 'ageo-confeitaria', atalho: 'ageo' },
];

async function checar(rotulo, url, esperado = [200]) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: 'manual' });
    const ok = esperado.includes(r.status);
    console.log(`${ok ? '✓' : '✗'} ${String(r.status).padEnd(3)} ${String(Date.now() - t0).padStart(5)}ms  ${rotulo.padEnd(34)} ${url}`);
    return ok;
  } catch (err) {
    console.log(`✗ ERRO       ${rotulo.padEnd(34)} ${url}  (${err.message})`);
    return false;
  }
}

(async () => {
  let falhas = 0;
  console.log(`\nLinks das lojas — ${BASE}\n`);
  for (const l of LOJAS) {
    if (!(await checar(`${l.slug} (loja)`, `${BASE}/l/${l.slug}`))) falhas++;
    if (!(await checar(`${l.slug} (painel)`, `${BASE}/l/${l.slug}/admin`))) falhas++;
    // atalho curto: 301 para a loja (é o que vai no WhatsApp)
    if (!(await checar(`/${l.atalho} (atalho)`, `${BASE}/${l.atalho}`, [301, 200]))) falhas++;
  }
  if (!(await checar('master', `${BASE}/master`))) falhas++;
  if (!(await checar('status', `${BASE}/status`))) falhas++;
  if (!(await checar('healthz', `${BASE}/healthz`))) falhas++;

  console.log(falhas ? `\nLINK FORA DO AR: ${falhas}` : '\nTODOS OS LINKS RESPONDENDO');
  process.exit(falhas ? 1 : 0);
})();
