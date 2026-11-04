'use strict';
// Seção pública exclusiva da Império; os dados vêm da mesma base do painel.
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(path.join(__dirname, '../public/imperio-planos-site.js'), 'utf8');
function aplicar(html) {
  const estilo = `<style id="imperio-site-planos-estilo">
    #imperioPlanosPublicos[hidden], [data-imperio-atalho-planos][hidden]{display:none!important}
    #imperioPlanosPublicos{background:linear-gradient(145deg,#211b11 0%,#10100f 65%);color:#f5efe3;border:1px solid #80683b;border-radius:18px;padding:24px;margin:0 0 18px;box-shadow:0 12px 32px rgba(0,0,0,.18)}
    #imperioPlanosPublicos .sec-head{margin:0;text-align:left}
    #imperioPlanosPublicos .sec-head h2{font-family:Georgia,serif;font-size:clamp(24px,4vw,31px);line-height:1.16;letter-spacing:.01em;color:#fff7e8;margin:8px 0 10px}
    #imperioPlanosPublicos .sec-head p{color:#e2d3b8;font-size:15px;line-height:1.5;margin:0 0 16px}
    #imperioPlanosPublicos .eyebrow{font-size:10px;letter-spacing:.19em;color:#d6b46a;font-weight:800}
    .imperio-promo-banner{position:relative;display:flex;align-items:center;width:100%;min-height:230px;border:1px solid #9d804c;border-radius:14px;padding:23px;text-align:left;cursor:pointer;background:#141414;background-image:linear-gradient(90deg,rgba(12,12,13,.97) 0%,rgba(12,12,13,.92) 45%,rgba(12,12,13,.18) 100%),url('/img/imperio-planos/banner-assinaturas.jpg');background-size:cover;background-position:center;color:#fff7e8;overflow:hidden;box-shadow:0 9px 24px rgba(0,0,0,.22)}
    .imperio-promo-banner:focus-visible{outline:3px solid #fff;outline-offset:3px}.imperio-promo-banner:hover{border-color:#efcc83}
    .imperio-promo-conteudo{display:flex;flex-direction:column;align-items:flex-start;gap:9px;max-width:66%;position:relative;z-index:1}
    .imperio-promo-marca{font:800 11px Arial,sans-serif;letter-spacing:.18em;color:#e6c178}.imperio-promo-titulo{font:700 clamp(22px,3.5vw,32px)/1.12 Georgia,serif;color:#fff9ed}.imperio-promo-descricao{font:400 14px/1.4 Arial,sans-serif;color:#eadcc2}.imperio-promo-cta{display:inline-block;margin-top:4px;padding:10px 12px;border-radius:7px;background:#e0bd70;color:#181208;font:800 10px/1.2 Arial,sans-serif;letter-spacing:.025em}
    @media(max-width:420px){.imperio-promo-banner{min-height:205px;padding:17px;background-position:57% center}.imperio-promo-conteudo{max-width:70%;gap:7px}.imperio-promo-titulo{font-size:21px}.imperio-promo-descricao{font-size:13px}.imperio-promo-cta{font-size:9px;padding:9px}}
    #imperioPlanosArea{margin-top:18px}
    .imperio-site-planos-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .imperio-site-plano{background:linear-gradient(155deg,#292319,#171613 70%);border:1px solid #6a5531;border-radius:14px;padding:20px;display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-width:0;box-shadow:inset 0 1px 0 rgba(255,229,173,.07)}
    .imperio-site-plano h3{font-family:Georgia,serif;color:#fff7e8;font-size:20px;line-height:1.3;margin:0;overflow-wrap:anywhere}.imperio-site-plano-tag{display:inline-block;color:#e0bb70;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
    .imperio-site-plano-foto{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:11px;background:#292722;display:block}.imperio-site-plano-foto[hidden]{display:none!important}
    .imperio-site-plano-legenda{font-size:11px;color:#bbae97;margin-top:-6px}
    #imperioPlanosArea[hidden]{display:none!important}
    #imperioAbrirPlanos{margin:0;max-width:100%}
    .imperio-site-plano-valor{color:#efcc83;font-size:25px;font-weight:800;line-height:1.15;letter-spacing:-.02em}
    .imperio-site-plano-detalhe{margin:0;color:#dfd5c3;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere}
    .imperio-site-plano-acoes{display:flex;gap:8px;flex-wrap:wrap;width:100%;margin-top:auto}
    .imperio-site-plano-botao{display:inline-block;background:#dab86e;color:#17120b;border:1px solid #dab86e;border-radius:9px;padding:11px 15px;text-decoration:none;font-weight:800;font-size:13px;text-align:center;cursor:pointer}
    .imperio-site-plano-botao.secundario{background:transparent;color:#e9c77f}
    .imperio-site-plano-botao:hover{background:#efd18f;color:#17120b}
    .imperio-site-plano-botao:focus-visible,#imperioPlanoDialog select:focus-visible{outline:3px solid #fff;outline-offset:3px}
    #imperioPlanoDialog{box-sizing:border-box;width:min(460px,calc(100% - 28px));max-height:calc(100dvh - 28px);overflow:auto;border:1px solid #75603b;border-radius:16px;background:#1c1b19;color:#f5eddd;padding:24px;font-family:inherit}
    #imperioPlanoDialog::backdrop{background:rgba(0,0,0,.8)}
    #imperioPlanoDialog h3{font-family:Georgia,serif;font-size:24px;margin:0 36px 8px 0}
    #imperioPlanoDialogDetalhe{color:#e9c77f;font-weight:700;line-height:1.4;overflow-wrap:anywhere}
    #imperioPlanoDialog label{display:block;font-size:14px;font-weight:700;margin:18px 0 6px}
    #imperioPlanoDialog select{box-sizing:border-box;width:100%;padding:12px;background:#2e2b27;color:#fff;border:1px solid #65553b;border-radius:9px;font-size:16px}
    #imperioPlanoFechar{position:absolute;right:18px;top:15px;border:0;background:transparent;color:#fff;font-size:27px;cursor:pointer}
    #imperioPlanoPix{background:#28251e;border:1px solid #5b4d33;border-radius:10px;padding:12px;margin-top:14px;font-size:14px}
    #imperioPlanoPix[hidden],#imperioPlanoWhats[hidden],#imperioPlanoCopiar[hidden]{display:none!important}
    #imperioPlanoChave{display:block;overflow-wrap:anywhere;user-select:all;color:#f4dfac;margin:6px 0}
    #imperioPlanoCopiar{background:transparent;border:1px solid #ab8a4e;color:#e9c77f;border-radius:7px;padding:6px 10px;cursor:pointer}
    #imperioPlanoNota{font-size:13px;line-height:1.5;color:#d4c9b6;margin:14px 0}
    #imperioPlanoWhats{box-sizing:border-box;display:block;width:100%}
    @media(max-width:600px){.imperio-site-planos-grid{grid-template-columns:1fr}.imperio-site-plano-acoes>*{flex:1;min-width:120px;box-sizing:border-box}}
  </style>`;
  const secao = `<section id="imperioPlanosPublicos" aria-label="Planos e assinaturas" hidden><button type="button" class="imperio-promo-banner" id="imperioAbrirPlanos" aria-expanded="false" aria-controls="imperioPlanosArea"><span class="imperio-promo-conteudo"><span class="imperio-promo-marca">IMPÉRIO BARBER</span><span class="imperio-promo-titulo">Venha conferir nossas promoções</span><span class="imperio-promo-descricao">Economize com nossos planos e assinaturas.</span><span class="imperio-promo-cta">VER PLANOS E ASSINATURAS →</span></span></button><div id="imperioPlanosArea" hidden><p id="imperioPlanosPublicosAviso" aria-live="polite"></p><div id="imperioPlanosPublicosLista" class="imperio-site-planos-grid"></div></div>
    <dialog id="imperioPlanoDialog" aria-labelledby="imperioPlanoDialogTitulo"><button type="button" id="imperioPlanoFechar" aria-label="Fechar">×</button><h3 id="imperioPlanoDialogTitulo">Plano</h3><div id="imperioPlanoDialogDetalhe"></div>
      <label for="imperioPlanoBarbeiro">Escolha o barbeiro</label><select id="imperioPlanoBarbeiro"><option value="">Selecione o barbeiro</option></select>
      <label for="imperioPlanoForma">Forma de pagamento na barbearia</label><select id="imperioPlanoForma"><option value="">Selecione a forma de pagamento</option><option value="pix">Pix na barbearia</option><option value="cartao">Cartão na barbearia</option><option value="dinheiro">Dinheiro na barbearia</option></select>
      <label for="imperioPlanoDestino">Enviar mensagem para</label><select id="imperioPlanoDestino"><option value="">Selecione o WhatsApp</option></select>
      <p id="imperioPlanoNota" aria-live="polite"></p><a id="imperioPlanoWhats" class="imperio-site-plano-botao" target="_blank" rel="noopener noreferrer" hidden>Continuar no WhatsApp</a>
    </dialog></section>\n`;
  const posicao = '<div id="listaServicos"></div>';
  if (!html.includes(posicao)) throw new Error('Lista de serviços não encontrada para planos públicos.');
  html = html.replace('</head>', estilo + '</head>');
  html = html.split('<a href="#servicos">Serviços</a>').join('<a href="#servicos">Serviços</a><a href="#imperioPlanosPublicos" data-imperio-atalho-planos hidden>Planos</a>');
  html = html.replace(posicao, secao + posicao);
  return html.replace('</body>', '<script>' + script + '</script></body>');
}
module.exports = { aplicar };
