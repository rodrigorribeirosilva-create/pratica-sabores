# Aba "Vendas" no painel de cada loja

Cada loja vê os próprios números. Nada é compartilhado entre lojas.

## O que aparece
Na aba **Vendas** (menu lateral, ícone de barras):

| Cartão | O que significa |
|---|---|
| **Faturamento** | soma do total dos pedidos do período |
| **Pedidos** | quantidade de pedidos do período |
| **Itens vendidos** | soma das quantidades (ex.: 2 caixas + 1 bolo = 3 itens) |
| **Ticket médio** | faturamento ÷ pedidos |

Três períodos: **Hoje**, **Últimos 7 dias** e **Este mês** (no mês também aparece a comparação
com o mês passado, ex.: `+18% vs. mês passado (R$ 845,00)`).

Abaixo:
- **Mais vendidos no mês** — ranking por quantidade, com barra e valor de cada item.
- **Últimos 14 dias** — faturamento por dia, uma barrinha por dia.

No topo da aba **Cardápio** ficam 5 cartões fixos: faturamento de hoje, pedidos de hoje, itens
vendidos hoje, faturamento do mês e pedidos em aberto.

## Regras
- **Pedido cancelado não entra** em nenhuma conta.
- Tudo é contado no **horário de Brasília** (um pedido das 22h não cai no dia seguinte).
- Itens montados (ex.: caixa de 12 com 4 sabores diferentes) contam como **1 item** — a caixa
  vendida — e ficam agrupados no ranking pelo nome da caixa.

## API
`GET /l/<loja>/api/admin/stats` →

```json
{
  "today":  { "pedidos": 2, "itens": 4, "total_cents": 15600, "ticket_cents": 7800 },
  "week":   { ... }, "month": { ... }, "mes_anterior": { ... },
  "mais_vendidos": [{ "nome": "Caixa de docinhos (12 un.)", "qtd": 3, "total_cents": 9600 }],
  "serie_14_dias": [{ "dia": "2026-11-01", "pedidos": 2, "itens": 4, "total_cents": 15600 }],
  "pending": 1
}
```

## Teste
```
node tests/verificar-vendas.js        # LOCAL=http://127.0.0.1:3980
BASE=https://loja-digital.onrender.com node tests/verificar-vendas.js
```

## Loja de serviços (ex.: Henrique Borges)
Não existe "pedido": a venda é o **serviço concluído**. No topo do painel aparecem 5 números:
na agenda hoje · serviços a fazer · concluídos hoje (com valor) · últimos 7 dias (com valor) · no mês (com valor).
Atendimento ainda `solicitado`/`agendado` não entra como venda — só quando é marcado **Concluído**.

## Master: vendas das 5 lojas juntas
Na aba **Lojas** do `/master` há uma faixa no topo com faturamento do mês de todas as lojas,
pedidos do mês, itens vendidos e o total de hoje. Cada loja mostra as etiquetas
`mês R$ X · N itens` e `hoje R$ Y` (ou "sem vendas no mês").

## Planilha do mês
No painel da loja → aba **Vendas** → botão **Baixar planilha do mês (CSV)**.
Uma linha por pedido (cliente, telefone, bairro, pagamento, itens, valores) + linha de TOTAL.
Abre direto no Excel / Google Planilhas.
