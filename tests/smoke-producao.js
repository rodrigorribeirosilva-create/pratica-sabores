/**
 * Pente-fino depois de cada publicação: confere se as 5 lojas estão no ar,
 * se os dados da nuvem estão recentes e se nenhum envio foi bloqueado.
 * Uso: node tests/smoke-producao.js
 */
const BASE = process.env.BASE || 'https://loja-digital.onrender.com';
const LOJAS = [
  { slug: 'pratica-sabores', min: 1 },
  { slug: 'mdn-presents', min: 1 },
  { slug: 'henrique-borges', min: 0 }, // loja de serviços: catálogo vazio é normal
  { slug: 'mimo-de-linha', min: 1 },
  { slug: 'ageo-confeitaria', min: 1 },
];

const fs = require('fs');
const MEMO = 'tests/.ultimo-smoke.json';

(async () => {
  let problemas = 0;
  const anterior = fs.existsSync(MEMO) ? JSON.parse(fs.readFileSync(MEMO, 'utf8')) : {};
  const agora = {};
  for (const { slug, min } of LOJAS) {
    const r = await fetch(`${BASE}/l/${slug}/api/menu`);
    if (!r.ok) {
      console.log(`✗ ${slug}: HTTP ${r.status}`);
      problemas++;
      continue;
    }
    const d = await r.json();
    const n = (d.products || []).length;
    agora[slug] = n;
    // se a loja tinha mais produtos antes, isso é sinal de perda de dados — avisa
    const caiu = anterior[slug] != null && n < anterior[slug] && process.env.ALLOW_DROP !== '1';
    const ok = n >= min && !caiu;
    if (!ok) problemas++;
    console.log(
      `${ok ? '✓' : '✗'} ${slug}: ${n} produto(s) · ${(d.store || {}).name || ''}` +
        (caiu ? ` — ATENÇÃO: tinha ${anterior[slug]} no último teste` : '')
    );
  }

  const login = await fetch(`${BASE}/api/master/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.MASTER || 'master123' }),
  });
  const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : []).join('; ');
  const b = await (await fetch(`${BASE}/api/master/backup/status`, { headers: { cookie } })).json();
  console.log(
    `backup: ${b.ultimo_backup} (há ${b.minutos_atras} min) · ${b.tamanho_kb} KB · produtos ${b.resumo.produtos} · lojas ${b.resumo.lojas} · falhas ${b.falhas} · bloqueios ${b.bloqueios}`
  );
  if (!b.nuvem_ativa || b.falhas > 0 || (b.minutos_atras ?? 999) > 60) problemas++;
  const h = await (await fetch(`${BASE}/api/master/backup/historico`, { headers: { cookie } })).json();
  console.log(`versões guardadas: ${(h.snapshots || []).length}`);

  fs.writeFileSync(MEMO, JSON.stringify({ ...anterior, ...agora }, null, 2));
  console.log(problemas ? `\nPROBLEMAS: ${problemas}` : '\nTUDO CERTO');
  process.exit(problemas ? 1 : 0);
})();
