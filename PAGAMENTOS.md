# Meios de pagamento no pedido — como usar

## 1. Cadastrar no painel da loja (sem programar)
Painel do administrador → **Configurações → Formas de pagamento**.

Para cada forma você define:

| Campo | Para que serve |
|---|---|
| **Nome** | O que o cliente vê: `Pix`, `Dinheiro na entrega`, `Cartão na entrega`, `Cartão de crédito (online)` |
| **Observação** | Texto curto abaixo do nome (ex.: "Levo a maquininha") |
| **Chave Pix** | Chave da loja (e-mail, telefone, CPF/CNPJ ou aleatória). O cliente vê e tem botão **Copiar** |
| **Link de pagamento** | Link do Mercado Pago / Asaas / PagSeguro. Aceita `{valor}`, `{total}` e `{codigo}` (nº do pedido) |
| **Aceita crédito / Aceita débito** | Aparecem quando o nome tem "Cartão" — controla as opções dadas ao cliente |

## 2. O que o cliente vê no pedido
- **Pix** → chave na tela com botão **Copiar** ("Pague e mande o comprovante no WhatsApp").
- **Dinheiro** → "Precisa de troco?" → "Não preciso" / "Sim, preciso" → campo de valor com cálculo automático (`Total R$ 54,00 · Troco R$ 46,00`). Bloqueia se o valor for menor que o total.
- **Cartão** → **crédito** ou **débito**; se houver link de pagamento, aparece o botão **"Abrir o pagamento online"**; se não houver, fica "pagar na entrega/retirada".

## 3. O que chega para o administrador
- **Cartão do pedido no painel** → linha **PAGAMENTO** com tudo, por exemplo:
  `Dinheiro na entrega (Informe se precisa de troco.) — troco para R$ 100,00 (troco de R$ 69,00)`
  `Cartão na entrega (Levo a maquininha.) — débito na entrega`
- **Mensagem do WhatsApp** → bloco `*PAGAMENTO*` com a forma, o detalhe (troco / crédito / débito), a **chave Pix** e o **link de pagamento** quando existirem.

## 4. Onde está no código
- `src/routes.public.js` — recebe `payment_id` + `payment_detail` (até 140 caracteres), recalcula o preço e monta o rótulo gravado no pedido.
- `src/helpers.js` — `buildWhatsappMessage()` imprime pagamento, chave Pix e link.
- `src/routes.admin.js` — grava `aceita_credito` / `aceita_debito` junto das formas de pagamento.
- `public/assets/menu.js` — bloco do checkout (`extrasPagamento`, `detalhePagamento`).
- `public/assets/admin.js` + `admin.html` + `admin.css` — cadastro das formas de pagamento.
