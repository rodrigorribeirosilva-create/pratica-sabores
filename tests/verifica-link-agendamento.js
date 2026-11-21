/**
 * Link de agendamento da loja: o que você manda no WhatsApp / imprime no QR.
 *
 * Confere, sem navegador:
 *   • o link público abre (e abre também com ?profissional=… e ?v=…)
 *   • o QR Code do painel e o do master saem em PNG de verdade
 *   • o QR do master exige a senha do master e recusa endereço que não é http(s)
 *   • o card "Link de agendamento" existe no painel (link, QR, mensagem e links da equipe)
 *
 * Uso (servidor rodando):
 *   PORT=3977 node server.js
 *   node tests/verifica-link-agendamento.js
 */
const assert = require('assert');

const BASE = process.env.BASE || 'http://127.0.0.1:3977';
const MASTER_PASS = process.env.MASTER_PASS || 'master123';
const PNG = [0x89, 0x50, 0x4e, 0x47]; // cabeçalho de um PNG de verdade

let falhas = 0;
function checa(nome, ok, detalhe = '') {
  if (ok) console.log('  ✓', nome, detalhe);
  else {
    falhas += 1;
    console.log('  ✗', nome, detalhe);
  }
}

function sessao(url, prefixo = '') {
  let cookie = '';
  async function req(caminho, { method = 'GET', body } = {}) {
    const r = await fetch(url + prefixo + caminho, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const buf = Buffer.from(await r.arrayBuffer());
    let json = null;
    try {
      json = JSON.parse(buf.toString('utf8'));
    } catch {
      /* html/png */
    }
    return { status: r.status, tipo: r.headers.get('content-type') || '', buf, json };
  }
  return { req };
}

(async () => {
  const master = sessao(BASE, '/api/master');
  const login = await master.req('/login', { method: 'POST', body: { password: MASTER_PASS } });
  if (login.status !== 200) {
    console.error('Não consegui entrar no master em', BASE, '- suba o servidor antes de rodar este teste.');
    process.exit(2);
  }

  const sufixo = Date.now().toString(36).slice(-5);
  const slug = 'link-' + sufixo;
  const criada = await master.req('/stores', {
    method: 'POST',
    body: { name: 'Estúdio ' + sufixo, slug, password: 'link12345', segment: 'servicos', rotulo_profissional: 'esteticista', rotulo_local: 'estudio' },
  });
  checa('loja de teste criada', criada.status === 201, criada.json && criada.json.error);
  const id = criada.json.store.id;
  const link = `${BASE}/l/${slug}`;

  /* ---------- 1. o link abre ---------- */
  const pagina = await fetch(link);
  const html = await pagina.text();
  checa('link público abre (200)', pagina.status === 200);
  checa('é a página de agendamento da loja', /id="listaServicos"/.test(html) && /id="equipe"/.test(html));
  checa('mostra o nome da loja no título', html.includes('Estúdio ' + sufixo), '');

  for (const extra of ['?v=ab12', '?profissional=1', '?profissional=1&v=xy99', '?servico=3']) {
    const r = await fetch(link + extra);
    checa('abre com ' + extra, r.status === 200);
  }

  /* ---------- 2. painel: card completo do link ---------- */
  const painel = sessao(`${BASE}/l/${slug}/api/admin`);
  await painel.req('/login', { method: 'POST', body: { password: 'link12345' } });
  // a página do painel é servida em /l/<slug>/admin (não em /l/<slug>/)
  const painelHtml = (await fetch(`${BASE}/l/${slug}/admin`)).status === 200
    ? await (await fetch(`${BASE}/l/${slug}/admin`)).text()
    : (await painel.req('/')).buf.toString('utf8');
  for (const id of ['linkTitulo', 'linkPublico', 'btnCopiarLink', 'btnEnviarLink', 'qrLink', 'btnBaixarQr', 'msgLink', 'btnCopiarMsg', 'linksEquipe']) {
    checa('painel tem #' + id, painelHtml.includes('id="' + id + '"'));
  }

  /* ---------- 3. QR do painel ---------- */
  const url = encodeURIComponent(link);
  const qrPainel = await painel.req('/qr?url=' + url);
  checa('QR do painel responde PNG', qrPainel.status === 200 && qrPainel.tipo.includes('image/png'), qrPainel.tipo);
  checa('QR do painel é uma imagem válida', PNG.every((b, i) => qrPainel.buf[i] === b), qrPainel.buf.length + ' bytes');
  // a rota usa a sessão quando existe; sem sessão ela só gera o QR do link informado
  const semSessao = await fetch(`${BASE}/l/${slug}/api/admin/qr?url=${url}`);
  checa('QR do painel gera sem sessão (link público, sem dados da loja)', semSessao.status === 200 && (semSessao.headers.get('content-type') || '').includes('image/png'), String(semSessao.status));
  const sessaoRuim = await fetch(`${BASE}/l/${slug}/api/admin/clientes`);
  checa('os dados do painel seguem protegidos', sessaoRuim.status === 401, String(sessaoRuim.status));
  const ruim = await painel.req('/qr?url=javascript:alert(1)');
  checa('QR recusa endereço que não é http(s)', ruim.status === 400, String(ruim.status));

  /* ---------- 4. QR pelo master (para imprimir sem entrar na loja) ---------- */
  const qrMaster = await master.req(`/stores/${id}/qr?url=${url}`);
  checa('QR do master responde PNG', qrMaster.status === 200 && qrMaster.tipo.includes('image/png'), qrMaster.buf.length + ' bytes');
  checa('QR do master é imagem válida', PNG.every((b, i) => qrMaster.buf[i] === b), qrMaster.buf.length + ' bytes');
  const qrSemMaster = await fetch(`${BASE}/api/master/stores/${id}/qr?url=${url}`);
  checa('QR do master exige a senha do master', qrSemMaster.status === 401, String(qrSemMaster.status));

  /* ---------- 5. a mensagem pronta usa a palavra da loja ---------- */
  const rot = await painel.req('/rotulos');
  checa('painel sabe que a loja não é barbearia', rot.json.ehBarbearia === false);
  checa('e chama de esteticista', rot.json.profissional === 'esteticista', rot.json.oProfissional);

  /* ---------- 6. limpeza ---------- */
  await master.req(`/stores/${id}`, { method: 'DELETE', body: { confirm: slug } });

  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nLink de agendamento: tudo certo.');
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
