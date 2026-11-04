# Pagamento no débito e no crédito — o que é possível de verdade

## Resposta curta (sem promessa que não dá para cumprir)

| O que você quer | Dá? | Como fica |
|---|---|---|
| Cliente paga **crédito dentro do link** | ✅ **sim** | Mercado Pago do lojista (já configurado por loja) — o dinheiro cai na conta **dele** |
| Cliente paga **débito dentro do link** | ⚠️ **limitado** | Cartão de débito comum **não passa** em pagamento online. Online, débito só existe no **"Cartão de Débito Virtual CAIXA"** |
| **Comprovante** para o cliente e para a loja | ✅ **sim** | página de comprovante + envio no WhatsApp + botão no painel |

**Por que o débito não passa online:** o débito exige o chip/senha na maquininha.
No Brasil, quem aceita débito *online* é só o **Débito Virtual CAIXA** (Mercado Pago aceita).
Todo o resto de "débito" no e-commerce é na verdade crédito à vista.

### Caminhos reais para o débito
1. **Link de pagamento do banco/maquininha do lojista** (Mercado Pago, InfinitePay,
   PagBank, Stone…) — é onde o débito virtual aparece. O painel já tem o campo
   **"Link de pagamento (opcional)"** em cada forma de pagamento: cola ali e o cliente
   paga dentro do link da loja.
2. **Débito na entrega/retirada** na maquininha — já funciona hoje.
3. **Pix** — cai na hora na conta do lojista e é o mais barato (0,99%).

## O que foi entregue agora

### 1. Conta de recebimento por loja (já existia, ficou mais claro no painel)
Painel → **Configurações → Pagamentos**:
- **Chave Pix** da loja (cliente vê e copia)
- **Link de pagamento** do banco/maquininha (Mercado Pago, InfinitePay, PagBank…)
- **Mercado Pago** com Public Key + Access Token → aí o **crédito é cobrado dentro do link**,
  com parcelamento, e cai na conta do lojista
- Marcar **aceita crédito / aceita débito** em cada forma

### 2. Comprovante de pagamento (novo)
Página pública, sem login, protegida pelo código do pedido:

```
https://loja-digital.onrender.com/l/<loja>/comprovante/<CODIGO>
```

Mostra: loja, data, cliente, forma de pagamento, situação (pago / aguardando),
código da transação, itens com os sabores escolhidos e total.
Tem botão **Salvar/imprimir** — o cliente pode guardar em PDF ou foto.

Onde ele aparece:
- **Cliente:** botão "🧾 Ver comprovante" na tela de pedido concluído
- **Painel:** botão "🧾 Comprovante" em cada pedido
- **Painel:** botão "**Enviar comprovante**" → abre o WhatsApp do cliente já com o link
- **Banco/maquininha:** o comprovante oficial continua sendo o do gateway
  (Mercado Pago, banco). O nosso é o comprovante da **loja**, com o pedido dela.

## O que ainda depende de você (não é código)
1. Ter conta **Mercado Pago** (ou outro gateway) **no nome da loja** e colar as chaves
   no painel — é a conta **dele** que recebe, não a nossa.
2. No gateway, ativar **cartão de crédito** e, se quiser, **débito virtual CAIXA**.
3. Para débito "de verdade" na maquininha, manter a opção **débito na entrega**.

## Testes
`/l/ageo-confeitaria/comprovante/AC261101-016` → 200, mostra os sabores escolhidos
(`1× Branco · 1× Pistache`), total e situação. Código inexistente → 404.
