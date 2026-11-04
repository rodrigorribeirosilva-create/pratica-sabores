/**
 * Loja desativada: link do cliente e painel fora do ar, outras lojas normais,
 * e o Master continua vendo/tendo o botão Ativar.
 */
const B = 'https://loja-digital.onrender.com';
async function status(u) {
  const r = await fetch(B + u, { redirect: 'manual' });
  return r.status;
}
(async () => {
  let erros = 0;
  const checa = (nome, obtido, esperado) => {
    const ok = obtido === esperado;
    if (!ok) erros++;
    console.log(`${ok ? '✓' : '✗'} ${nome.padEnd(42)} ${obtido} (esperado ${esperado})`);
  };
  checa('henrique site', await status('/l/henrique-borges'), 503);
  checa('henrique painel', await status('/l/henrique-borges/admin'), 503);
  checa('henrique api', await status('/l/henrique-borges/api/menu'), 503);
  checa('prática site (intacta)', await status('/l/pratica-sabores'), 200);
  checa('ageo site (intacta)', await status('/l/ageo-confeitaria'), 200);
  checa('mdn site (intacta)', await status('/l/mdn-presents'), 200);
  checa('mimo site (intacta)', await status('/l/mimo-de-linha'), 200);

  // Master continua enxergando a loja
  const login = await fetch(B + '/api/master/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'master123' }),
  });
  const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : []).map((c) => c.split(';')[0]).join('; ');
  const lojas = await (await fetch(B + '/api/master/stores', { headers: { cookie } })).json();
  const hen = (lojas.stores || []).find((s) => s.slug === 'henrique-borges');
  const okMaster = !!hen && hen.active === false;
  if (!okMaster) erros++;
  console.log(`${okMaster ? '✓' : '✗'} master ainda vê a loja (para reativar)   active=${hen ? hen.active : 'não achou'}`);
  console.log('ERROS:', erros);
  process.exit(erros ? 1 : 0);
})();
