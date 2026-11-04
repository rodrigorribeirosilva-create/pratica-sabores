# Modo "somente pagamento online" (por loja)

Cada loja escolhe, no painel, **o que o cliente vê** na hora de pagar:

| Modo | O que aparece no site |
|---|---|
| **Todas as formas** (padrão) | a lista que a loja montou: Pix, dinheiro, cartão na entrega, etc. |
| **Somente pagamento online** | **um botão só**: "Ir para o pagamento" → página segura, onde o cliente escolhe **Pix, boleto ou cartão (crédito/débito)** |

Onde fica: **Painel → Configurações → Formas de pagamento → "O que aparece para o cliente no site"**.

## Como funciona por dentro
- O modo é gravado **dentro da loja** (`store_settings.checkout.modo`) — não afeta outras lojas.
- Em "somente online" o site devolve **uma única forma**: `Pagamento online`
  (Pix, boleto ou cartão na página segura), usando:
  1. o **Mercado Pago** da loja (Access Token), ou
  2. o **link de pagamento** colado em qualquer forma (Mercado Pago, InfinitePay, PagBank, Stone…).
- As outras formas **não são apagadas**: voltam na hora em que a loja escolher "Todas".
- **Trava de segurança:** se a loja escolher "somente online" mas **não tiver** nem Mercado Pago
  nem link de pagamento, o sistema mantém a lista antiga (para o cliente não ficar sem
  nenhuma opção) e o painel avisa o lojista com uma mensagem clara.

## Testes (produção, AGEO)
`node tests/verifica-modo-online.js`

```
✓ modo online aplicado
✓ cliente vê só 1 forma de pagamento
✓ a forma é "Pagamento online"
✓ sem conta de recebimento, mantém a lista original
✓ modo "todos" restaurado
ERROS: 0
```
(no fim do teste a loja volta para o modo "todas", como estava)
