/**
 * Gera um PDF por loja: "como ativar o recebimento (crédito, débito e Pix)".
 * Feito para o dono da loja receber no WhatsApp e seguir sozinho.
 *
 * Uso: node scripts/gerar-pdfs-pagamento.js
 * Saída: guias/<loja>-como-receber.pdf
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'https://loja-digital.onrender.com';
const SAIDA = path.join(__dirname, '..', 'guias');

const LOJAS = [
  { slug: 'pratica-sabores', nome: 'Prática Sabores', senha: 'pratica123', cor: '#1e6b4f', whatsapp: '(55) 99702-3507', ramo: 'marmitas' },
  { slug: 'ageo-confeitaria', nome: 'AGEO Confeitaria', senha: 'ageo2026', cor: '#3b2416', whatsapp: '(48) 99646-8360', ramo: 'doces e barras' },
  { slug: 'mdn-presents', nome: 'MDN Presents', senha: 'mdn2026', cor: '#8a5f2c', whatsapp: '(48) 99138-9307', ramo: 'perfumes e presentes' },
  { slug: 'mimo-de-linha', nome: 'Mimo de Linha', senha: 'mimo2026', cor: '#8a4a5c', whatsapp: '(48) 99208-8730', ramo: 'laços de crochê' },
  { slug: 'imperio-barber', nome: 'Império Barber', senha: 'imperio2026', cor: '#0d0d0d', whatsapp: '(48) 8826-4675', ramo: 'barbearia' },
];

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pagina(l) {
  const painel = `${BASE}/l/${l.slug}/admin`;
  const site = `${BASE}/l/${l.slug}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #1d2a24; font-size: 11.5pt; line-height: 1.5; margin: 0; }
  h1 { font-size: 21pt; margin: 0 0 2mm; letter-spacing: -.01em; }
  h2 { font-size: 13.5pt; margin: 7mm 0 2mm; color: ${l.cor}; }
  h3 { font-size: 11.5pt; margin: 4mm 0 1mm; }
  p  { margin: 0 0 2.5mm; }
  .capa { border: 2px solid ${l.cor}; border-radius: 5mm; padding: 8mm 7mm; margin-bottom: 6mm; }
  .capa .kicker { font-size: 9pt; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: ${l.cor}; }
  .capa .sub { font-size: 11pt; color: #5b6a63; margin-top: 3mm; }
  .capa .box { margin-top: 5mm; background: #f6f3ec; border-radius: 3mm; padding: 4mm 5mm; font-size: 10.5pt; }
  .capa .box b { color: ${l.cor}; }
  .passo { border-left: 3px solid ${l.cor}; padding-left: 5mm; margin: 0 0 5mm; page-break-inside: avoid; }
  .passo .n { display: inline-block; background: ${l.cor}; color: #fff; width: 7mm; height: 7mm; line-height: 7mm;
              text-align: center; border-radius: 50%; font-size: 10pt; font-weight: 800; margin-right: 2mm; }
  .passo h3 { display: inline; }
  ul, ol { margin: 1mm 0 2.5mm; padding-left: 6mm; }
  li { margin-bottom: 1.2mm; }
  .tela { border: 1px dashed #c9c2b4; border-radius: 3mm; padding: 3.5mm 4mm; background: #fbfaf6;
          font-size: 9.8pt; color: #4b5a53; margin: 2mm 0 3mm; }
  .tela b { color: #1d2a24; }
  .tela .barra { display: flex; gap: 2mm; margin-bottom: 2mm; }
  .tela .barra span { background: #e9e4d8; border-radius: 1.5mm; padding: .8mm 2.4mm; font-size: 8.6pt; font-weight: 700; }
  .ok { background: #eaf5ee; border: 1px solid #b9dfc8; border-radius: 3mm; padding: 3.5mm 4mm; margin: 3mm 0; }
  .atencao { background: #fdf3e3; border: 1px solid #f0d9a8; border-radius: 3mm; padding: 3.5mm 4mm; margin: 3mm 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 2mm 0 3mm; }
  th, td { text-align: left; padding: 2mm 2.5mm; border-bottom: 1px solid #e6e0d3; vertical-align: top; }
  th { background: #f4f1e9; font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; color: #5b6a63; }
  .rodape { margin-top: 7mm; padding-top: 3mm; border-top: 1px solid #e6e0d3; font-size: 8.8pt; color: #7b8a83; }
  .quebra { page-break-before: always; }
  code { background: #f2efe7; padding: .6mm 1.6mm; border-radius: 1.2mm; font-size: 9.6pt; }
</style></head><body>

<div class="capa">
  <div class="kicker">Guia rápido · ${esc(l.nome)}</div>
  <h1>Como receber pagamento<br>no crédito, no débito e no Pix</h1>
  <div class="sub">Sua loja online já está pronta. Falta só ligar o recebimento na <strong>sua conta</strong>
  do Mercado Pago. Leva uns 10 minutos e é grátis para criar.</div>
  <div class="box">
    <b>Seu painel:</b> ${esc(painel)}<br>
    <b>Senha:</b> ${esc(l.senha)}<br>
    <b>Seu site:</b> ${esc(site)}
  </div>
</div>

<h2>O que o cliente vai poder escolher</h2>
<table>
  <tr><th>Forma</th><th>Como funciona</th><th>O dinheiro cai</th></tr>
  <tr><td><strong>Crédito</strong></td><td>O cliente paga na hora, no site, com cartão (à vista ou parcelado)</td><td>na sua conta Mercado Pago</td></tr>
  <tr><td><strong>Débito</strong></td><td>Débito Virtual CAIXA na página do Mercado Pago — é o único débito que existe em pagamento online</td><td>na sua conta Mercado Pago</td></tr>
  <tr><td><strong>Pix</strong></td><td>Paga na hora e o pedido é confirmado automaticamente</td><td>na sua conta Mercado Pago</td></tr>
  <tr><td><strong>Cartão na entrega</strong></td><td>Igual iFood: você leva a maquininha e passa <strong>crédito ou débito</strong> na porta do cliente</td><td>direto na sua maquininha</td></tr>
  <tr><td><strong>Dinheiro</strong></td><td>Cliente escolhe se precisa de troco e para quanto</td><td>na entrega</td></tr>
</table>

<h2>Passo a passo (10 minutos)</h2>

<div class="passo">
  <span class="n">1</span><h3>Tenha uma conta Mercado Pago no seu nome</h3>
  <p>Se ainda não tem, baixe o app <strong>Mercado Pago</strong> e crie com o seu CPF (ou CNPJ, se a loja é
  registrada). Conta grátis, sem mensalidade.</p>
  <p>É <strong>essa conta</strong> que vai receber as vendas — o dinheiro não passa por terceiros.</p>
</div>

<div class="passo">
  <span class="n">2</span><h3>Pegue o Access Token (credencial de produção)</h3>
  <p>No computador, entre em <code>mercadopago.com.br</code> e faça login:</p>
  <ul>
    <li><strong>Seu negócio</strong> → <strong>Configurações</strong></li>
    <li>Menu da esquerda: <strong>Gestão e administração</strong> → <strong>Credenciais</strong></li>
    <li>Confira se está em <strong>Credenciais de produção</strong> (não use as "de teste" para receber de verdade)</li>
    <li>Clique em <strong>Ver detalhes</strong> e copie o <strong>Access Token</strong> (começa com <code>APP_USR-</code>)</li>
  </ul>
  <div class="tela">
    <div class="barra"><span>Seu negócio</span><span>Configurações</span><span>Credenciais</span></div>
    <b>Credenciais de integração</b><br>
    Public Key: <b>APP_USR-xxxx-xxxx</b><br>
    Access Token: <b>APP_USR-1234…  [Ver detalhes] [Copiar]</b>
  </div>
</div>

<div class="passo">
  <span class="n">3</span><h3>Cole no seu painel</h3>
  <ul>
    <li>Abra <code>${esc(painel)}</code> e entre com a senha <strong>${esc(l.senha)}</strong></li>
    <li>Vá em <strong>Configurações</strong> → seção <strong>Mercado Pago</strong></li>
    <li>Cole o <strong>Access Token</strong> no campo indicado e salve</li>
    <li>O <strong>Public Key</strong> é opcional: só serve para o cliente digitar o cartão dentro do
        site, sem sair para a página do Mercado Pago</li>
    <li>Clique em <strong>Testar conexão</strong> — tem de aparecer “conexão ok”</li>
  </ul>
  <div class="ok"><strong>Pronto.</strong> A partir daqui o botão <strong>“💳 Pagar no Mercado Pago”</strong>
  aparece para os seus clientes no site.</div>
</div>

<div class="passo">
  <span class="n">4</span><h3>Faça um pedido de teste</h3>
  <ul>
    <li>Abra o seu site: <code>${esc(site)}</code></li>
    <li>Coloque um item no carrinho e finalize escolhendo <strong>Cartão</strong></li>
    <li>Vai abrir a página do Mercado Pago para você pagar (crédito, débito ou Pix)</li>
    <li>Depois de pagar, o pedido aparece como <strong>PAGO</strong> no painel</li>
    <li>Confira o <strong>comprovante</strong>: botão “🧾 Comprovante” em cada pedido</li>
  </ul>
  <p>Na dúvida, comece com um pedido de valor baixo e depois devolva o valor para você mesmo.</p>
</div>

<div class="passo">
  <span class="n">5</span><h3>Deixe o cartão na entrega ligado</h3>
  <p>Em <strong>Configurações → Pagamentos</strong>, no item do cartão, mantenha marcado
  <strong>“Aceita crédito no local”</strong> e <strong>“Aceita débito no local”</strong>.
  É assim que o cliente que preferir pagar na porta recebe a maquininha, como no iFood.</p>
  <p>No pedido, o cliente vê a forma escolhida e o detalhe (“débito na entrega”,
  “crédito na entrega”, “troco para R$ 100”).</p>
</div>

<div class="quebra"></div>
<h2>Segurança — leia com atenção</h2>
<div class="atencao">
  <p><strong>O Access Token é a chave do seu dinheiro.</strong> Quem tem esse código consegue
  criar cobranças e estornos na sua conta.</p>
  <ul>
    <li>Cole o token <strong>apenas dentro do seu painel</strong>. Nunca mande por WhatsApp, print ou e-mail.</li>
    <li>Ative a <strong>verificação em duas etapas</strong> no Mercado Pago (app → Segurança).</li>
    <li>Use uma senha forte e só sua no painel da loja.</li>
    <li>Se desconfiar de algo, vá no Mercado Pago e <strong>gere um novo Access Token</strong> —
        o antigo para de funcionar na hora. Depois cole o novo no painel.</li>
  </ul>
</div>

<h2>Perguntas que todo lojista faz</h2>
<table>
  <tr>
    <th style="width:38%">Pergunta</th><th>Resposta</th>
  </tr>
  <tr><td>Quanto custa?</td>
      <td>Criar a conta e usar o painel é grátis. O Mercado Pago cobra só por venda aprovada
      (Pix a partir de ~0,99%; crédito a partir de ~3,99% — confira a tabela da sua conta).</td></tr>
  <tr><td>Quando o dinheiro cai?</td>
      <td>Pix e cartão caindo na conta Mercado Pago; o prazo de saque para o seu banco você
      define no app (na hora ou em alguns dias).</td></tr>
  <tr><td>Preciso de máquina?</td>
      <td>Não para vender online. A maquininha só é necessária para o cliente que escolher
      pagar <strong>na entrega</strong>.</td></tr>
  <tr><td>O cliente precisa de conta no Mercado Pago?</td>
      <td>Não. Ele paga como convidado, com cartão ou Pix, sem instalar nada.</td></tr>
  <tr><td>Dá para parcelar?</td>
      <td>Sim, no crédito. O limite de parcelas e quem paga os juros é configurado na sua conta.</td></tr>
  <tr><td>E o comprovante?</td>
      <td>Cada pedido tem um comprovante com número, itens, forma de pagamento e situação.
      Você pode enviar o link para o cliente pelo botão “Enviar comprovante” no painel.</td></tr>
  <tr><td>Posso usar outro banco/maquininha?</td>
      <td>Pode. Em cada forma de pagamento existe o campo <strong>Link de pagamento</strong>
      (InfinitePay, PagBank, Stone, Asaas…): cole o seu link e o cliente paga por ele.</td></tr>
</table>

<h2>Se algo não funcionar</h2>
<ol>
  <li><strong>O botão de pagar não aparece no site:</strong> o Access Token não foi salvo ou a
      conexão falhou. Volte em Configurações → Mercado Pago e clique em “Testar conexão”.</li>
  <li><strong>Paguei e o pedido continua pendente:</strong> pode levar 1 ou 2 minutos. Se não
      atualizar, confira se o pagamento aparece na sua conta Mercado Pago.</li>
  <li><strong>Quero desligar o pagamento online:</strong> desmarque “ativo” no Mercado Pago do
      painel — o cartão na entrega e o Pix continuam funcionando.</li>
</ol>

<div class="rodape">
  Guia de ativação · ${esc(l.nome)} · WhatsApp da loja ${esc(l.whatsapp)}<br>
  Dúvidas sobre o sistema: fale com o Rodrigo no WhatsApp (48) 98854-5558.
</div>

</body></html>`;
}

(async () => {
  if (!fs.existsSync(SAIDA)) fs.mkdirSync(SAIDA, { recursive: true });
  const b = await chromium.launch();
  for (const l of LOJAS) {
    const p = await b.newPage();
    await p.setContent(pagina(l), { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const destino = path.join(SAIDA, `${l.slug}-como-receber.pdf`);
    await p.pdf({
      path: destino,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font-size:8px;color:#9aa39d;width:100%;text-align:center;font-family:Arial">' +
        esc(l.nome) +
        ' · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>',
    });
    console.log('✓', path.basename(destino), (fs.statSync(destino).size / 1024).toFixed(0) + ' KB');
    // prévia em imagem (para conferir o layout sem abrir o PDF)
    if (process.env.PREVIA) {
      const png = path.join(__dirname, '..', 'tests', 'shots', `guia-${l.slug}-p1.png`);
      await p.setViewportSize({ width: 820, height: 1160 });
      await p.screenshot({ path: png });
      console.log('   prévia:', path.basename(png));
    }
    await p.close();
  }
  await b.close();
})();
