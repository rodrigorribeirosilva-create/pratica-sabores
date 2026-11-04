'use strict';
// Seção pública exclusiva da Império; os dados vêm da mesma base do painel.
const fs = require('fs');
const path = require('path');
const script = fs.readFileSync(path.join(__dirname, '../public/imperio-planos-site.js'), 'utf8');
function aplicar(html) {
  const estilo = `<style id="imperio-site-planos-estilo">
    #imperioPlanosPublicos[hidden], [data-imperio-atalho-planos][hidden]{display:none!important}
    #imperioPlanosPublicos{background:#1c1a14;color:#f4efe4;border:1px solid #806c3b;border-radius:15px;padding:18px 20px;margin:0 0 18px}
    #imperioPlanosPublicos .sec-head{margin:0;text-align:left}
    #imperioPlanosPublicos .sec-head h2{font-size:clamp(20px,3vw,26px);line-height:1.25;margin:5px 0 7px}
    #imperioPlanosPublicos .sec-head p{color:#c7bdab;margin:0 0 12px}
    #imperioPlanosPublicos .eyebrow{font-size:11px}
    #imperioPlanosArea{margin-top:18px}
    .imperio-site-planos-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .imperio-site-plano{background:#1c1b19;border:1px solid #50422c;border-radius:16px;padding:20px;display:flex;flex-direction:column;align-items:flex-start;gap:12px;min-width:0}
    .imperio-site-plano h3{font-family:Georgia,serif;color:#f5eddd;font-size:20px;line-height:1.3;margin:0;overflow-wrap:anywhere}
    .imperio-site-plano-foto{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:11px;background:#292722;display:block}.imperio-site-plano-foto[hidden]{display:none!important}
    .imperio-site-plano-legenda{font-size:11px;color:#bbae97;margin-top:-6px}
    #imperioPlanosArea[hidden]{display:none!important}
    #imperioAbrirPlanos{margin:0;max-width:100%}
    .imperio-site-plano-valor{color:#e9c77f;font-size:21px;font-weight:800}
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
  const secao = `<section id="imperioPlanosPublicos" hidden><div class="sec-head"><span class="eyebrow">IMPÉRIO BARBER</span><h2>Venha ser assinante dos nossos planos mensais</h2><p>Conheça os planos e escolha o ideal para você.</p><button type="button" class="imperio-site-plano-botao" id="imperioAbrirPlanos" aria-expanded="false" aria-controls="imperioPlanosArea">Ver planos mensais</button></div><div id="imperioPlanosArea" hidden><p id="imperioPlanosPublicosAviso" aria-live="polite"></p><div id="imperioPlanosPublicosLista" class="imperio-site-planos-grid"></div></div>
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
