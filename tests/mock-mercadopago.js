'use strict';
/* Mercado Pago de mentira, só para testar o checkout localmente. */
const http = require('http');

const estado = { pagamentos: [], preferencias: 0 };

const server = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    const json = corpo ? JSON.parse(corpo || '{}') : {};
    res.setHeader('Content-Type', 'application/json');

    if (req.url.startsWith('/v1/payments') && req.method === 'POST') {
      const id = 9000 + estado.pagamentos.length + 1;
      const recusar = /RECUSADO/i.test(json.token || '') || /skip/i.test(json.token || '');
      const pag = {
        id,
        status: recusar ? 'rejected' : 'approved',
        status_detail: recusar ? 'cc_rejected_insufficient_amount' : 'accredited',
        transaction_amount: json.transaction_amount,
        installments: json.installments,
        payment_method_id: json.payment_method_id || 'visa',
        external_reference: json.external_reference,
        payer: json.payer,
      };
      estado.pagamentos.push(pag);
      console.log('[mock] cobrança', id, pag.status, json.transaction_amount, json.token, 'ref', json.external_reference);
      res.statusCode = 201;
      return res.end(JSON.stringify(pag));
    }

    if (req.url.match(/^\/v1\/payments\/\d+/) && req.method === 'GET') {
      const id = Number(req.url.split('/')[3]);
      const pag = estado.pagamentos.find((p) => p.id === id) || estado.pagamentos[0];
      return res.end(JSON.stringify(pag || {}));
    }

    if (req.url.startsWith('/mock/set/')) {
      // /mock/set/9005?status=refunded
      const id = Number(req.url.split('/')[3].split('?')[0]);
      const novo = new URL(req.url, 'http://x').searchParams.get('status') || 'refunded';
      const pag = estado.pagamentos.find((p) => p.id === id);
      if (pag) { pag.status = novo; pag.status_detail = novo; }
      return res.end(JSON.stringify(pag || {}));
    }

    if (req.url.startsWith('/users/me')) {
      return res.end(JSON.stringify({ id: 123, nickname: 'LOJA-TESTE', email: 'teste@loja.com', site_id: 'MLB' }));
    }

    if (req.url.startsWith('/checkout/preferences')) {
      estado.preferencias++;
      return res.end(JSON.stringify({ init_point: 'https://mp.test/pagar/pref' + estado.preferencias }));
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'rota não existe no mock: ' + req.url }));
  });
});

server.listen(3999, '127.0.0.1', () => console.log('mock MP em 3999'));
