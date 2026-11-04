'use strict';
/* Adapta o painel e o cardápio exclusivamente ao renderizar a loja AGEO. */
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '../public');
const telefone = fs.readFileSync(path.join(raiz, 'ageo-telefone.js'), 'utf8');
function trocar(texto, antes, depois, nome) {
  if (!texto.includes(antes)) throw new Error('Trecho da AGEO não encontrado: ' + nome);
  return texto.replace(antes, depois);
}
function painel() {
  let js = fs.readFileSync(path.join(raiz, 'assets/admin.js'), 'utf8');
  const waAntes = `  function waNumber(raw) {
    let d = onlyDigits(raw);
    if (!d) return '';
    if (d.length <= 11 && !d.startsWith('55')) d = '55' + d;
    return d;
  }`;
  js = trocar(js, waAntes, `  function waNumber(raw) { return window.AgeoTelefone.numero(raw); }`, 'telefone do WhatsApp');
  js = trocar(js, `  function openNotify(order, kind = 'out_for_delivery') {
    const num = waNumber(order.phone);
    if (!num) return toast('Este pedido não tem telefone válido.', 'err');`, `  function openNotify(order, kind = 'out_for_delivery', mensagemPersonalizada = '') {`, 'abrir aviso');
  js = trocar(js, `    el('notifyText').value = buildCustomerMessage(order, kind);
    refreshNotifyLink(order);
    el('notifyText').oninput = () => refreshNotifyLink(order);`, `    el('notifyPhone').value = order.phone || '';
    el('notifyText').value = mensagemPersonalizada || buildCustomerMessage(order, kind);
    el('notifyPhone').oninput = () => refreshNotifyLink(order);
    el('notifyText').oninput = () => refreshNotifyLink(order);
    el('notifySavePhone').onclick = async () => {
      const telefone = el('notifyPhone').value.trim();
      if (!waNumber(telefone)) { toast('Confira o WhatsApp completo com DDD.', 'err'); return; }
      const botao = el('notifySavePhone');
      botao.disabled = true;
      try {
        const salvo = await api('/api/admin/orders/' + encodeURIComponent(order.id) + '/phone', {
          method: 'PATCH', body: JSON.stringify({ phone: telefone }),
        });
        order.phone = salvo.phone;
        const atual = state.orders.find((o) => String(o.id) === String(order.id));
        if (atual) atual.phone = salvo.phone;
        el('notifyWho').innerHTML = esc(order.customer_name) + ' · ' + esc(order.phone) + '<span>Pedido ' + esc(order.code) + '</span>';
        renderOrders();
        refreshNotifyLink(order);
        toast('WhatsApp corrigido neste pedido.', 'ok');
      } catch (err) { toast(err.message || 'Não foi possível salvar o número.', 'err'); refreshNotifyLink(order); }
    };
    refreshNotifyLink(order);`, 'editar telefone no aviso');
  const refreshAntes = `  function refreshNotifyLink(order) {
    const num = waNumber(order.phone);
    const text = encodeURIComponent(el('notifyText').value);
    el('notifySend').href = \`https://wa.me/\${num}?text=\${text}\`;
  }`;
  const refreshDepois = `  function refreshNotifyLink(order) {
    const raw = el('notifyPhone').value.trim();
    const num = waNumber(raw);
    const mudou = raw !== String(order.phone || '').trim();
    const pronto = !!num && !mudou;
    const botao = el('notifySend');
    const aviso = el('notifyPhoneHint');
    el('notifySavePhone').disabled = !num || !mudou;
    if (!num) aviso.textContent = 'Número incompleto ou inválido. Confirme com o cliente o DDD e todos os dígitos.';
    else if (mudou) aviso.textContent = 'Toque em Salvar número antes de abrir o WhatsApp.';
    else aviso.textContent = 'Confira se este número está cadastrado no WhatsApp.';
    if (pronto) botao.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(el('notifyText').value);
    else botao.removeAttribute('href');
    botao.setAttribute('aria-disabled', pronto ? 'false' : 'true');
    botao.style.opacity = pronto ? '' : '.45';
  }`;
  js = trocar(js, refreshAntes, refreshDepois, 'link do WhatsApp');
  const linhaComprovante = js.split('\n').find((l) => l.includes('window.open(`https://wa.me/55${String(o.phone'));
  if (!linhaComprovante) throw new Error('Trecho da AGEO não encontrado: comprovante');
  js = js.replace(linhaComprovante, `        openNotify(o, 'confirmed', msg);`);
  return telefone + '\n' + js;
}
function cardapio() {
  let js = fs.readFileSync(path.join(raiz, 'assets/menu.js'), 'utf8');
  const mascara = `    // máscara de telefone
    const phone = el('fPhone');
    phone.addEventListener('input', () => {
      let v = phone.value.replace(/\\D/g, '').slice(0, 11);
      if (v.length > 6) v = \`(\${v.slice(0, 2)}) \${v.slice(2, v.length - 4)}-\${v.slice(-4)}\`;
      else if (v.length > 2) v = \`(\${v.slice(0, 2)}) \${v.slice(2)}\`;
      phone.value = v;
    });`;
  js = trocar(js, mascara, `    // Permite DDD com ou sem +55, sem cortar nenhum dígito.
    const phone = el('fPhone');
    phone.setAttribute('type', 'tel');
    phone.setAttribute('inputmode', 'tel');`, 'máscara do checkout');
  js = trocar(js, `if (payload.phone.replace(/\\D/g, '').length < 10) flag('fPhone', 'Informe um telefone com DDD.');`, `if (!window.AgeoTelefone.numero(payload.phone)) flag('fPhone', 'Informe o WhatsApp completo com DDD, com ou sem +55.');`, 'validação do checkout');
  js = trocar(js, `if (nome.length < 2 || tel.length < 10) {`, `if (nome.length < 2 || !window.AgeoTelefone.numero(dados.get('phone'))) {`, 'validação do pagamento');
  return telefone + '\n' + js;
}
function painelHtml(html) {
  const alvo = '<div class="notify-who" id="notifyWho"></div>';
  const novo = alvo + `<div class="field" style="margin-top:12px"><label for="notifyPhone">WhatsApp do cliente</label><input class="input" id="notifyPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(48) 99999-9999" maxlength="30"><div class="hint" id="notifyPhoneHint"></div><button type="button" class="btn btn-ghost btn-sm" id="notifySavePhone" style="margin-top:8px">Salvar número</button></div>`;
  html = trocar(html, alvo, novo, 'campo no painel');
  return html.replace('</head>', '<style>@media(max-width:520px){#notifyModal .modal-foot{flex-direction:column-reverse}#notifyModal .modal-foot .btn{width:100%;justify-content:center;text-align:center}}</style></head>');
}
module.exports = { painel, cardapio, painelHtml };
