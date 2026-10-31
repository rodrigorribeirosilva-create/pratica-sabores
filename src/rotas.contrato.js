'use strict';
/**
 * Contratos de mensalidade: tela para o cliente assinar + PDF assinado.
 *
 *  • GET  /contrato/:token          → página do contrato (abre no celular)
 *  • POST /contrato/:token/assinar  → registra a assinatura digital
 *  • GET  /contrato/:token/pdf      → contrato em PDF (com a assinatura)
 */
const express = require('express');
const PDFDocument = require('pdfkit');
const { db, getStoreById, getSetting } = require('./db');
const { montarContrato, gerarHash, textoPlano, brl, dataBR } = require('./contrato');

/** 5548988545558 → (48) 98854-5558 */
function formatarNumeroBR(v) {
  let n = String(v || '').replace(/\D/g, '');
  if (n.startsWith('55') && n.length > 11) n = n.slice(2);
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return n;
}

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function req_proto(req) {
  return (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
}

function buscar(token) {
  return db.prepare('SELECT * FROM contratos WHERE token = ?').get(String(token || ''));
}

function dados(token) {
  const c = buscar(token);
  if (!c) return null;
  const loja = getStoreById(c.store_id);
  if (!loja) return null;
  const business = getSetting(c.store_id, 'business', {});
  const nomeLoja = business.name || loja.name;
  const doc = montarContrato({
    loja: nomeLoja,
    segmento: loja.segment || 'food',
    valorCents: c.valor_cents,
    implantacaoCents: c.implantacao_cents,
    diaVencimento: c.dia_vencimento,
    inicio: c.inicio,
    clausulasExtras: c.extras,
  });
  return { c, loja, business, nomeLoja, doc };
}

/* ------------------------------ página ------------------------------ */
function pagina(req, res) {
  const d = dados(req.params.token);
  if (!d) return res.status(404).type('html').send('<h1>Contrato não encontrado</h1><p>O link pode ter expirado. Peça um novo ao responsável.</p>');

  const { c, business, nomeLoja, doc } = d;
  const assinado = c.status === 'assinado';
  const cor = business.theme_color || '#1e6b4f';
  const logo = business.logo_url ? `<img src="${esc(business.logo_url)}" alt="" class="logo">` : '';
  const baseSite = (process.env.PUBLIC_URL || `${req_proto(req)}://${req.get('host')}`).replace(/\/$/, '');
  const logoAbs = business.logo_url
    ? (String(business.logo_url).startsWith('http') ? business.logo_url : baseSite + business.logo_url)
    : '';
  const corLoja = business.theme_color || '#1e6b4f';
  const corDestaque = business.accent_color || '#e7cf9b';
  const inicialLoja = (nomeLoja || '·').trim().charAt(0).toUpperCase();
  const iconeNeutro =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${corLoja}"/><text x="50" y="52" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-size="54" fill="#ffffff">${inicialLoja}</text></svg>`
    );
  const descricaoContrato = `Contrato de prestação de serviços de manutenção do link de ${nomeLoja}: ${doc.implantacaoTexto} de produção + ${doc.valorTexto}/mês. Assine digitalmente pelo celular.`;

  const cancelado = c.status === 'cancelado';
  const pediuCancelamento = !cancelado && !!c.cancelamento_solicitado_em;
  const bannerCancelado = cancelado
    ? `<div class="aviso-cancelado">
         <strong>Contrato cancelado</strong><br>
         ${c.cancelado_por === 'cliente' ? 'Cancelado a seu pedido' : c.cancelado_por === 'master' ? 'Cancelado pelo prestador do serviço' : 'Cancelado'} em ${esc(dataBR(c.cancelado_em))}.
         ${c.motivo_cancelamento ? `<br>Motivo: ${esc(c.motivo_cancelamento)}` : ''}
         <br><span>O histórico da assinatura continua registrado abaixo.</span>
       </div>`
    : pediuCancelamento
    ? `<div class="aviso-pedido">
         <strong>Cancelamento solicitado</strong><br>
         Pedido registrado em ${esc(dataBR(c.cancelamento_solicitado_em))}. Aguardando a confirmação do prestador.
         ${c.cancelamento_motivo_cliente ? `<br>Motivo informado: ${esc(c.cancelamento_motivo_cliente)}` : ''}
       </div>`
    : '';
  const servicos = doc.servicos.map((t) => `<li>${esc(t)}</li>`).join('');
  const extras = doc.extras ? `<p style="font-size:14px;color:#3b423a">${esc(doc.extras)}</p>` : '';

  const base = (process.env.PUBLIC_URL || `${req_proto(req)}://${req.get('host')}`).replace(/\/$/, '');
  const pdfLink = `${base}/contrato/${c.token}/pdf`;
  const numero = (doc.contratadoDados.whatsapp || '').replace(/\D/g, '');
  const whatsUrl = numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(
        `Olá, ${doc.contratado}! Assinei o contrato de prestação de serviços (manutenção do ${doc.subtitulo.toLowerCase().replace('manutenção do ', '')}) da ${nomeLoja}.\n\n` +
          `Assinado por: ${c.signatario}\nCPF/CNPJ: ${c.documento}\nData: ${new Date(c.assinado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\nCódigo de autenticação: ${c.hash}\n\n` +
          `Contrato assinado (PDF):\n${pdfLink}`
      )}`
    : '';

  res.type('html').send(`<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contrato · ${esc(nomeLoja)}</title>
<meta name="description" content="${esc(descricaoContrato)}">
<meta name="robots" content="noindex">
<link rel="icon" href="${esc(logoAbs || iconeNeutro)}">
<link rel="apple-touch-icon" href="${esc(logoAbs || iconeNeutro)}">
<meta name="theme-color" content="${esc(corLoja)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(nomeLoja)}">
<meta property="og:title" content="Contrato de prestação de serviços · ${esc(nomeLoja)}">
<meta property="og:description" content="${esc(descricaoContrato)}">
${logoAbs ? `<meta property="og:image" content="${esc(logoAbs)}">
<meta property="og:image:alt" content="${esc(nomeLoja)}">` : ''}
<meta property="og:url" content="${esc(baseSite)}/contrato/${esc(c.token)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Contrato de prestação de serviços · ${esc(nomeLoja)}">
${logoAbs ? `<meta name="twitter:image" content="${esc(logoAbs)}">` : ''}
<style>
  :root{--verde:${esc(cor)};--creme:#f7f2e6;--tinta:#20261f}
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#eef1ea;color:var(--tinta);line-height:1.55}
  .wrap{max-width:760px;margin:0 auto;padding:18px 14px 90px}
  .topo{display:flex;gap:12px;align-items:center;background:${corLoja};color:#fff;padding:16px;border-radius:16px}
  .logo{width:52px;height:52px;object-fit:contain;border-radius:12px;background:rgba(255,255,255,.1);padding:4px}
  .topo h1{font-size:16px;margin:0}
  .topo p{margin:2px 0 0;font-size:12.5px;color:${corDestaque}}
  .card{background:#fff;border-radius:16px;padding:20px;margin-top:14px;box-shadow:0 6px 20px rgba(0,0,0,.06)}
  h2{font-size:15px;letter-spacing:.4px;text-transform:uppercase;color:var(--verde);margin:0 0 10px}
  .resumo{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
  .pill{background:var(--creme);border:1px solid #e3d9c3;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:600}
  .pill.destaque{background:var(--verde);color:#fff;border-color:var(--verde)}
  .parte{margin:10px 0;font-size:14px}
  .parte b{display:block;font-size:11.5px;letter-spacing:.5px;color:#8a7f6a;text-transform:uppercase;margin-bottom:2px}
  .aviso-cancelado{background:#fbe6e2;border:1px solid #f0cfc7;color:#8f2f17;border-radius:14px;padding:14px 16px;margin-top:14px;font-size:13.5px;line-height:1.6}
  .aviso-cancelado strong{font-size:15px;display:block;margin-bottom:4px}
  .aviso-cancelado span{color:#a4644f;font-size:12.5px}
  .aviso-pedido{background:#fdf1dd;border:1px solid #ecd9b0;color:#8a6414;border-radius:14px;padding:14px 16px;margin-top:14px;font-size:13.5px;line-height:1.6}
  .aviso-pedido strong{font-size:15px;display:block;margin-bottom:4px}
  .ok-cancelado{background:#fbe6e2;border:1px solid #f0cfc7;border-radius:14px;padding:16px;font-size:13.5px;color:#8f2f17;line-height:1.6}
  .ok-cancelado b{display:block;font-size:15px;margin-bottom:6px;color:#7d2a13}
  .ok-cancelado .hash{margin-top:8px}
  .cancelar-box{margin-top:14px}
  .cancelar-box h2{color:#8f2f17}
  .cancelar-box p{color:#3b423a;font-size:13.5px}
  .link-cancelar{display:block;width:100%;margin-top:10px;padding:13px;border-radius:12px;border:1.5px solid #e6b3a8;background:#fff;color:#a32c12;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer}
  .link-cancelar:active{background:#fbe6e2}
  .valores{width:100%;border-collapse:collapse}
  .valores td{padding:11px 0;border-bottom:1px solid #e6ebe3;font-size:14px;color:#3b423a;vertical-align:top}
  .valores tr:last-child td{border-bottom:0}
  .valores td span{font-size:12.5px;color:#7a8177}
  .valores td.v{text-align:right;white-space:nowrap;font-weight:800;color:#12352a;font-size:16px}
  .valores td.v small{font-size:11px;font-weight:600;color:#7a8177}
  .lista{margin:6px 0 0;padding-left:20px}
  .lista li{font-size:14px;color:#3b423a;margin-bottom:6px}
  .cl{margin:14px 0}
  .cl h3{font-size:13.5px;margin:0 0 4px;color:var(--verde)}
  .cl p{margin:0;font-size:14px;color:#3b423a}
  .assinatura{background:#fff;border-radius:16px;padding:20px;margin-top:14px;box-shadow:0 6px 20px rgba(0,0,0,.06)}
  label{display:block;font-size:12.5px;font-weight:700;margin:12px 0 5px;color:#4a5148}
  input[type=text]{width:100%;padding:13px 14px;border:1.5px solid #d9dfd5;border-radius:12px;font-size:15px;background:#fbfcf9}
  input[type=text]:focus{outline:none;border-color:var(--verde);background:#fff}
  .aceite{display:flex;gap:10px;align-items:flex-start;margin:16px 0;font-size:13px;color:#3b423a}
  .aceite input{margin-top:3px;width:20px;height:20px}
  button{width:100%;padding:16px;border:0;border-radius:14px;background:var(--verde);color:#fff;font-size:16px;font-weight:800;cursor:pointer}
  button:disabled{opacity:.55}
  .ok{background:#e8f5ec;border:1px solid #b9e0c6;color:#14532d;border-radius:14px;padding:16px;font-size:14px}
  .ok b{display:block;font-size:15px;margin-bottom:4px}
  .hash{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f2f4ef;border-radius:8px;padding:8px;word-break:break-all;margin-top:8px}
  .botaopdf{display:block;text-align:center;margin-top:12px;padding:14px;border-radius:12px;background:#12352a;color:#fff;text-decoration:none;font-weight:700;font-size:14px}
  .botaowa{display:block;text-align:center;margin-top:10px;padding:14px;border-radius:12px;background:#25d366;color:#08331a;text-decoration:none;font-weight:800;font-size:14px}
  .rodape{text-align:center;font-size:11.5px;color:#8a8f87;margin-top:18px}
</style></head>
<body><div class="wrap">
  <div class="topo">${logo}<div><h1>${esc(doc.titulo)}</h1><p>${esc(nomeLoja)} · ${esc(doc.implantacaoTexto)} + ${esc(doc.valorTexto)}/mês</p></div></div>

  ${bannerCancelado}
  <div class="card">
    <div class="resumo">
      <span class="pill destaque">${esc(doc.valorTexto)}/mês</span>
      <span class="pill destaque">${esc(doc.implantacaoTexto)} produção do link</span>
      <span class="pill">manutenção vence todo dia ${esc(String(doc.diaVencimento))}</span>
      <span class="pill">início ${esc(dataBR(c.inicio))}</span>
      ${cancelado
        ? '<span class="pill" style="background:#fbe6e2;border-color:#f0cfc7;color:#8f2f17">cancelado</span>'
        : assinado
        ? '<span class="pill" style="background:#e8f5ec;border-color:#b9e0c6;color:#14532d">assinado</span>'
        : '<span class="pill" style="background:#fdf3e0;border-color:#f0dcb4;color:#7a5a12">aguardando assinatura</span>'}
    </div>
    <div class="parte"><b>CONTRATANTE</b>${esc(doc.contratante)}</div>
    <div class="parte"><b>CONTRATADO</b>${esc(doc.contratado)}</div>
  </div>

  <div class="card">
    <h2>Serviços incluídos</h2>
    <p style="font-size:14px;color:#3b423a;margin:0 0 8px">O presente contrato estabelece a prestação de serviços de manutenção do ${esc(doc.subtitulo.toLowerCase().replace('manutenção do ', ''))}, incluindo:</p>
    <ul class="lista">${servicos}</ul>
    ${extras}
  </div>

  <div class="card">
    <h2>Valores</h2>
    <table class="valores">
      <tr>
        <td><strong>Produção do link</strong><br><span>Site, painel e cadastro inicial — pagamento único</span></td>
        <td class="v">${esc(doc.implantacaoTexto)}</td>
      </tr>
      <tr>
        <td><strong>Manutenção do link</strong><br><span>Todos os meses, vencimento dia ${esc(String(doc.diaVencimento))}</span></td>
        <td class="v">${esc(doc.valorTexto)}<small>/mês</small></td>
      </tr>
    </table>
    <p style="font-size:14px;color:#3b423a;margin:12px 0 0">${esc(doc.textoRenovacao)}</p>
  </div>

  <div class="card">
    <p style="font-size:14px;color:#3b423a;margin:0">${esc(doc.textoAceite)}</p>
  </div>

  <div class="assinatura">
    ${cancelado
      ? `<div class="ok-cancelado">
           <b>Contrato cancelado</b>
           ${c.signatario
             ? `Este contrato havia sido assinado por <b>${esc(c.signatario)}</b>${c.documento ? ` (${esc(c.documento)})` : ''}
                em ${esc(new Date(c.assinado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}.
                <div class="hash">${esc(c.hash)}</div>
                O histórico da assinatura continua registrado e o PDF pode ser baixado.`
             : 'Este contrato foi cancelado antes de ser assinado.'}
           ${c.cancelado_em ? `<br>Cancelado em ${esc(dataBR(c.cancelado_em))}${c.cancelado_por ? ` por ${esc(c.cancelado_por)}` : ''}.` : ''}
         </div>
         <a class="botaopdf" href="/contrato/${esc(c.token)}/pdf">Baixar o PDF do contrato</a>`
      : assinado
      ? `<div class="ok">
           <b>Contrato assinado ✅</b>
           ${esc(c.signatario)}${c.documento ? ` · ${esc(c.documento)}` : ''}<br>
           Assinado em ${esc(new Date(c.assinado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}<br>
           Código de autenticação:
           <div class="hash">${esc(c.hash)}</div>
         </div>
         <a class="botaopdf" href="/contrato/${esc(c.token)}/pdf">Baixar o contrato em PDF</a>
         ${
           whatsUrl
             ? `<a class="botaowa" href="${esc(whatsUrl)}" target="_blank" rel="noopener">Enviar a assinatura no WhatsApp</a>
                <p class="rodape" style="margin-top:10px">Vai para o WhatsApp <strong>${esc(formatarNumeroBR(numero))}</strong> — ${esc(doc.contratado)}.</p>`
             : ''
         }
         <p class="rodape" style="margin-top:10px">Uma cópia assinada fica salva no painel de administração.</p>`
      : `<h2>Assinar o contrato</h2>
         <p style="font-size:13.5px;color:#5a6157;margin:0 0 6px">Ao assinar, você concorda com todas as cláusulas acima. A assinatura é eletrônica e registra data, hora, IP e um código de autenticação.</p>
         <form id="form">
           <label for="nome">Nome completo de quem assina *</label>
           <input type="text" id="nome" required placeholder="Ex.: Vanessa Maria da Silva" autocomplete="name">
           <label for="doc">CPF ou CNPJ *</label>
           <input type="text" id="doc" required placeholder="000.000.000-00" inputmode="numeric" autocomplete="off">
           <div class="aceite">
             <input type="checkbox" id="aceite">
             <label for="aceite" style="margin:0;font-weight:500">Li e concordo com os termos deste contrato de prestação de serviços.</label>
           </div>
           <button type="submit" id="btn">Assinar digitalmente</button>
           <div id="msg" style="margin-top:10px;font-size:13px"></div>
         </form>`}
  </div>

  <div class="card cancelar-box" id="boxCancelar">
    ${cancelado
      ? `<p>${c.cancelado_por === 'cliente'
            ? 'Você cancelou este contrato. Ele já foi retirado do painel do prestador. Se quiser voltar a usar o serviço, é só falar com ele.'
            : 'Este contrato está cancelado. Se quiser voltar a usar o serviço, fale com o prestador.'}</p>`
      : pediuCancelamento
      ? `<p>Seu pedido de cancelamento já foi registrado. O prestador vai confirmar com você.</p>`
      : `<h2>Cancelar contrato</h2>
         <p style="font-size:13.5px;color:#3b423a;margin:0 0 10px">O contrato pode ser cancelado por qualquer uma das partes, com aviso prévio. Se quiser encerrar, escreva o motivo (opcional) e envie o pedido.</p>
         <textarea id="motivoCancel" placeholder="Motivo (opcional)" style="width:100%;min-height:64px;padding:11px;border:1px solid #dcdfd8;border-radius:10px;font-size:14px;font-family:inherit"></textarea>
         <button class="link-cancelar" id="btnCancelar">Solicitar cancelamento do contrato</button>`}
  </div>

  <div class="rodape">Este link é pessoal. Em caso de dúvida, fale com ${esc(doc.contratado)}.</div>
</div>
${assinado || cancelado ? '' : `<script>
const f = document.getElementById('form');
f.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = document.getElementById('msg');
  const btn = document.getElementById('btn');
  const nome = document.getElementById('nome').value.trim();
  const doc = document.getElementById('doc').value.trim();
  if (nome.split(' ').length < 2) { msg.style.color = '#b42318'; msg.textContent = 'Informe o nome completo.'; return; }
  if (doc.replace(/\\D/g, '').length < 11) { msg.style.color = '#b42318'; msg.textContent = 'Informe um CPF ou CNPJ válido.'; return; }
  if (!document.getElementById('aceite').checked) { msg.style.color = '#b42318'; msg.textContent = 'Marque a caixa concordando com o contrato.'; return; }
  btn.disabled = true; btn.textContent = 'Assinando…';
  try {
    const r = await fetch(location.pathname + '/assinar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, documento: doc }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Não foi possível assinar.');
    location.reload();
  } catch (e) {
    msg.style.color = '#b42318';
    msg.textContent = e.message;
    btn.disabled = false; btn.textContent = 'Assinar digitalmente';
  }
});
</script>`}
<script>
(function () {
  var b = document.getElementById('btnCancelar');
  if (!b) return;
  b.addEventListener('click', async function () {
    var campo = document.getElementById('motivoCancel');
    var motivo = campo ? campo.value : '';
    if (!confirm('Confirmar o pedido de cancelamento do contrato?')) return;
    b.disabled = true;
    b.textContent = 'Enviando…';
    try {
      var r = await fetch(location.pathname + '/solicitar-cancelamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo })
      });
      var j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Nao foi possivel enviar.');
      location.reload();
    } catch (e) {
      alert(e.message);
      b.disabled = false;
      b.textContent = 'Solicitar cancelamento do contrato';
    }
  });
})();
</script>
</body></html>`);
}

/* ---------------------------- assinatura ---------------------------- */
function assinar(req, res) {
  const c = buscar(req.params.token);
  if (!c) return res.status(404).json({ error: 'Contrato não encontrado.' });
  if (c.status === 'assinado') return res.status(409).json({ error: 'Este contrato já foi assinado.' });

  const nome = String((req.body || {}).nome || '').trim().slice(0, 120);
  const documento = String((req.body || {}).documento || '').trim().slice(0, 24);
  if (nome.split(/\s+/).length < 2) return res.status(400).json({ error: 'Informe o nome completo.' });
  if (documento.replace(/\D/g, '').length < 11) return res.status(400).json({ error: 'Informe um CPF ou CNPJ válido.' });

  const d = dados(req.params.token);
  const plano = textoPlano(d.doc);
  const agora = new Date().toISOString();
  const hash = gerarHash({ contratoTexto: plano, loja: d.nomeLoja, nome, documento, assinadoEm: agora });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';

  db.prepare(
    `UPDATE contratos SET status='assinado', signatario=?, documento=?, assinado_em=?, ip=?, navegador=?, hash=?, texto_assinado=?
     WHERE id=?`
  ).run(nome, documento, agora, ip, String(req.headers['user-agent'] || '').slice(0, 200), hash, plano, c.id);

  res.json({ ok: true, hash, assinado_em: agora });
}

/** O cliente pede o cancelamento pelo próprio link (a cláusula permite). */
async function solicitarCancelamento(req, res) {
  const d = dados(req.params.token);
  if (!d) return res.status(404).json({ error: 'Contrato não encontrado.' });
  const { c } = d;
  if (c.status === 'cancelado') return res.status(400).json({ error: 'Este contrato já está cancelado.' });
  const motivo = String((req.body || {}).motivo || '').slice(0, 500);
  db.prepare(
    `UPDATE contratos
        SET status = 'cancelado',
            cancelado_em = datetime('now'),
            cancelado_por = 'cliente',
            motivo_cancelamento = ?,
            cancelamento_solicitado_em = datetime('now'),
            cancelamento_motivo_cliente = ?
      WHERE id = ?`
  ).run(motivo, motivo, c.id);
  res.json({ ok: true, cancelado: true });
}

/* -------------------------------- PDF -------------------------------- */
function pdf(req, res) {
  const d = dados(req.params.token);
  if (!d) return res.status(404).json({ error: 'Contrato não encontrado.' });
  const { c, nomeLoja, doc, business } = d;

  const arquivo = `contrato-${String(nomeLoja).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${arquivo}"`);

  const p = new PDFDocument({ size: 'A4', margin: 54 });
  p.pipe(res);

  // cabeçalho (cor da própria loja)
  const corPdf = (business && business.theme_color) || '#1e6b4f';
  p.rect(0, 0, p.page.width, 92).fill(corPdf);
  let xTexto = 54;
  try {
    const rel = String((business && business.logo_url) || '');
    if (rel && !rel.startsWith('http')) {
      const fs = require('fs');
      const path = require('path');
      const alvo = path.join(__dirname, '..', 'public', rel.replace(/^\//, '').split('?')[0]);
      if (fs.existsSync(alvo)) {
        p.image(alvo, 54, 24, { fit: [44, 44] });
        xTexto = 110;
      }
    }
  } catch {
    /* sem logo: segue só com o nome */
  }
  p.fill('#f2e6c9').font('Helvetica-Bold').fontSize(9).text('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', xTexto, 26, { characterSpacing: 1.2 });
  p.fill('#ffffff').font('Helvetica-Bold').fontSize(12).text(nomeLoja, xTexto, 42, { width: 490 - (xTexto - 54) });
  p.fill('#f2e6c9').font('Helvetica').fontSize(9).text(`${doc.implantacaoTexto} produção do link · ${doc.valorTexto}/mês de manutenção`, xTexto, 64);

  let y = 120;
  p.fill('#12352a').font('Helvetica-Bold').fontSize(12).text(doc.titulo, 54, y, { width: 490, align: 'center' });
  y = p.y + 6;
  p.fill('#7a6f58').font('Helvetica').fontSize(9).text(doc.subtitulo, 54, y, { width: 490, align: 'center' });
  y = p.y + 22;

  // partes
  p.fill('#20261f').font('Helvetica-Bold').fontSize(10).text('Contratante: ', 54, y, { continued: true });
  p.font('Helvetica').text(doc.contratante);
  p.font('Helvetica-Bold').text('Contratado: ', { continued: true });
  p.font('Helvetica').text(doc.contratado);
  y = p.y + 14;

  // objeto
  const palavra = doc.subtitulo.replace('Manutenção do ', '');
  p.fill('#20261f').font('Helvetica').fontSize(10).text(
    `O presente contrato estabelece a prestação de serviços de manutenção do ${palavra}, incluindo:`,
    54,
    y,
    { width: 490, align: 'justify' }
  );
  y = p.y + 8;

  for (const servico of doc.servicos) {
    p.fill('#3b423a').font('Helvetica').fontSize(10).text('•  ' + servico, 62, y, { width: 480 });
    y = p.y + 4;
  }
  y += 8;

  if (doc.extras) {
    p.fill('#3b423a').font('Helvetica').fontSize(10).text(doc.extras, 54, y, { width: 490, align: 'justify' });
    y = p.y + 10;
  }

  // valores: produção do link + manutenção mensal
  p.fill('#12352a').font('Helvetica-Bold').fontSize(10).text('VALORES', 54, y);
  y = p.y + 6;
  p.moveTo(54, y).lineTo(544, y).strokeColor('#d9dfd5').stroke();
  y += 8;

  p.fill('#20261f').font('Helvetica-Bold').fontSize(10).text('Produção do link', 54, y, { continued: true });
  p.font('Helvetica').text('  (site, painel e cadastro inicial — pagamento único)');
  p.font('Helvetica-Bold').fill('#12352a').text(doc.implantacaoTexto, 444, y, { width: 100, align: 'right' });
  y = p.y + 4;

  p.fill('#20261f').font('Helvetica-Bold').fontSize(10).text('Manutenção do link', 54, y, { continued: true });
  p.font('Helvetica').text(`  (todo mês, com vencimento no dia ${doc.diaVencimento})`);
  p.font('Helvetica-Bold').fill('#12352a').text(`${doc.valorTexto}/mês`, 414, y, { width: 130, align: 'right' });
  y = p.y + 6;
  p.moveTo(54, y).lineTo(544, y).strokeColor('#d9dfd5').stroke();
  y += 10;

  p.font('Helvetica').fill('#3b423a');
  p.font('Helvetica').fill('#3b423a').text(doc.textoRenovacao, 54, y, { width: 490, align: 'justify' });
  y = p.y + 16;
  p.fill('#20261f').text(doc.textoAceite, 54, y, { width: 490, align: 'justify' });
  y = p.y + 24;

  /* ---------- área de assinatura ---------- */
  if (y > 600) { p.addPage(); y = 60; }
  p.moveTo(54, y).lineTo(544, y).strokeColor('#d9dfd5').stroke();
  y += 16;

  if (c.status === 'assinado') {
    const quando = new Date(c.assinado_em);
    p.fill('#14532d').font('Helvetica-Bold').fontSize(10).text('ACEITE ELETRÔNICO DA CONTRATANTE', 54, y);
    y = p.y + 10;
    p.fill('#20261f').font('Helvetica').fontSize(10);
    p.text(`Data: ${quando.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, 54, y, { width: 490 });
    p.text(`Assinado por: ${c.signatario}`, 54, p.y + 2, { width: 490 });
    p.text(`CPF/CNPJ: ${c.documento}`, 54, p.y + 2, { width: 490 });
    p.text(`Hora: ${quando.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · IP: ${c.ip || 'não registrado'}`, 54, p.y + 2, { width: 490 });
    p.text(`Código de autenticação: ${c.hash}`, 54, p.y + 2, { width: 490 });
    p.moveDown(0.9);
    p.fill('#5a6157').fontSize(7.5).text(
      'Assinatura eletrônica realizada nos termos do art. 10, § 2º, da MP nº 2.200-2/2001 e da Lei nº 14.063/2020. ' +
        'O código acima permite conferir que este documento não foi alterado depois da assinatura.',
      54,
      p.y + 4,
      { width: 490, align: 'justify' }
    );
  } else {
    p.fill('#7a5a12').font('Helvetica-Bold').fontSize(10).text('Data: ____/____/________', 54, y);
    p.fill('#20261f').font('Helvetica').fontSize(10).text('Aceite eletrônico da contratante: ', 54, p.y + 16, { continued: true });
    p.fill('#9aa096').text('__________________________________');
    p.moveDown(1);
    const base = (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    p.fill('#5a6157').fontSize(8).text(`Aguardando assinatura pelo link: ${base}/contrato/${c.token}`, 54, p.y + 8);
  }

  // contrato cancelado: faixa vermelha no rodapé da página
  if (c.status === 'cancelado') {
    const yb = p.page.height - 118;
    p.rect(54, yb, 490, 44).fill('#fbe6e2').stroke('#f0cfc7');
    p.fill('#8f2f17').font('Helvetica-Bold').fontSize(10).text(
      `CONTRATO CANCELADO em ${dataBR(c.cancelado_em)}${c.cancelado_por ? ` (por ${c.cancelado_por})` : ''}`,
      64,
      yb + 9,
      { width: 470 }
    );
    p.font('Helvetica').fontSize(8).fill('#a4644f').text(
      c.motivo_cancelamento ? `Motivo: ${c.motivo_cancelamento}` : 'Histórico da assinatura preservado para consulta.',
      64,
      yb + 24,
      { width: 470 }
    );
  }

  // rodapé
  p.fill('#8a8f87').font('Helvetica').fontSize(7.5).text(
    `${doc.contratado}${doc.contratadoDados.doc ? ` · CPF/CNPJ ${doc.contratadoDados.doc}` : ''} · ${doc.contratadoDados.cidade} · documento emitido em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    54,
    p.page.height - 78,
    { width: 490, align: 'center', lineBreak: false }
  );

  p.end();
}

function registrar(app) {
  app.get('/contrato/:token', pagina);
  app.post('/contrato/:token/assinar', express.json(), assinar);
  app.get('/contrato/:token/pdf', pdf);
  app.post('/contrato/:token/solicitar-cancelamento', express.json(), solicitarCancelamento);
}

module.exports = { registrar, buscar, dados };
