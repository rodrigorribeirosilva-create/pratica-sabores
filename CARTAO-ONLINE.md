# Cartão de crédito online (Mercado Pago) — guia rápido

O cliente digita o cartão **dentro do seu site**, na tela de finalizar pedido.
O valor cai direto na **sua conta do Mercado Pago** — o dinheiro não passa por
nós nem pela plataforma.

---

## 1. O que você precisa fazer (uma vez só)

1. Entre em **mercadopago.com.br** e faça login na sua conta (a mesma que você usa para receber).
2. Menu **Seu negócio** → **Suas integrações** (ou *Configurações → Desenvolvedores*).
3. Clique em **Criar aplicação**.
   - Nome: pode ser o nome da sua loja.
   - Em *Produtos*, marque **Pagamentos online** / **Checkout transparente**.
4. Abra a aplicação criada → aba **Credenciais de produção**.
5. Copie os dois códigos:
   - **Public Key** (começa com `APP_USR-`)
   - **Access Token** (também começa com `APP_USR-`) — trate como senha, ninguém deve ver.
6. No painel da loja: **Configurações → Cartão de crédito online (Mercado Pago)**
   - Ligue o botão **Aceitar cartão de crédito online nesta loja**.
   - Cole a **Public Key** e o **Access Token**.
   - (Opcional) escreva o **nome na fatura**, ex.: `NOME DA LOJA`.
   - Clique em **Salvar cartão online** e depois em **Testar conexão**.
   - Se aparecer “Conectado!”, está pronto. 🎉

> Enquanto as chaves não estiverem salvas, o cliente vê a opção
> **“Cartão de crédito (online) — Em ativação”**, e o pedido só é enviado com
> Pix, dinheiro ou cartão na entrega.

---

## 2. Como o cliente paga

1. Escolhe **Cartão de crédito (online)** no checkout.
2. Aparece o formulário: número do cartão, nome impresso, validade, CVV,
   **CPF do titular**, **parcelas** (as reais, com juros se houver) e e-mail opcional.
3. Toca em **“Pagar R$ X com cartão”**.
4. O cartão é aprovado na hora:
   - **Aprovado** → tela verde “Pedido pago!” e o pedido segue para a loja no WhatsApp.
   - **Em análise** → o banco está avaliando; a loja vê “EM ANÁLISE”.
   - **Recusado** → aparece o motivo em português (“saldo insuficiente”, “CVV incorreto”…)
     e o cliente pode tentar outro cartão **no mesmo pedido** (não duplica).
5. Se o Mercado Pago estiver fora do ar, há o botão
   **“Prefiro pagar na página segura do Mercado Pago”** — abre o checkout oficial.

**Segurança:** o número do cartão e o CVV vão do navegador direto para o
Mercado Pago (`sdk.mercadopago.com`). O nosso servidor recebe apenas um
**token** de uso único + o valor recalculado no servidor (o cliente não
consegue alterar o preço).

---

## 3. Onde você vê o dinheiro e o status

- **Painel → Pedidos**: cada pedido mostra a forma de pagamento com um selo
  **PAGO**, **EM ANÁLISE**, **RECUSADO** ou **ESTORNADO**.
- **Mercado Pago → Seu negócio → Cobranças**: o valor, o cliente e a parcela.
- O Mercado Pago avisa o sistema por **webhook** (`/l/<sua-loja>/api/pagamentos/webhook`)
  sempre que o status muda — inclusive **estorno/chargeback**.

---

## 4. Taxas (2026)

| Meio | Taxa aproximada |
|---|---|
| Crédito à vista | ~4,98% (varia por conta e prazo de recebimento) |
| Crédito parcelado | ~4,98% + juros do parcelamento (quem paga é definido nas suas preferências) |
| Pix | ~0,99% |

A taxa é descontada pelo Mercado Pago; a loja recebe o líquido conforme o
**prazo de liberação da sua conta** (na hora, 14 dias ou 30 dias).

---

## 5. Para quem mexe no sistema

- `src/pagamentos.js` — integração (cobrar, consultar, traduzir status, link de emergência).
- `src/routes.public.js` — `POST /api/orders` (com `cartao`), `POST /api/orders/:code/pagar-cartao`,
  `POST /api/orders/:code/link-pagamento`, `POST|GET /api/pagamentos/webhook`,
  e `pagamentos_online` dentro de `GET /api/menu`.
- `public/assets/menu.js` — formulário do cartão no checkout (`ligarFormCartao`,
  `tokenizarCartao`, `carregarParcelas`, `problemasDoCartao`).
- `public/assets/admin.js` + `admin.html` — bloco “Cartão de crédito online”.
- Colunas novas em `orders`: `payment_status`, `payment_gateway`, `payment_gateway_id`, `payment_detail`.
- Para testar sem dinheiro real: `MP_API_BASE=http://127.0.0.1:3999 node server.js`
  junto com `node tests/mock-mercadopago.js` e as chaves de **teste** do Mercado Pago.

---

## 6. Situação das lojas (01/11/2026)

A forma **“Cartão de crédito (online)”** já está criada e **ativa** em:
Prática Sabores, MDN Presents, Mimo de Linha e AGEO Confeitaria
(Henrique Borges é de serviços/agenda e não tem checkout de pedido).

Enquanto cada loja não colar as **suas** chaves, o cliente vê
*“Em ativação — escolha outra forma”* e o pedido é bloqueado nessa opção
(Pix / dinheiro / cartão na entrega continuam funcionando normalmente).
No painel aparece o aviso: *“Cartão de crédito (online) está ativo, mas o
Mercado Pago ainda não está configurado”*.

Para esconder a opção enquanto não usar: **Configurações → Formas de pagamento**
→ desligue o botão da linha “Cartão de crédito (online)” → **Salvar pagamentos**.
