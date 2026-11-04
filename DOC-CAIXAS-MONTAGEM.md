# Caixas montáveis (escolher sabor e quantidade)

A dona escolhe no painel → produto → **“Cliente escolhe os sabores”**.
O cliente, no site, toca em **“Escolher sabores”**, monta a caixa (ex.: 2 pistache + 2 ao leite)
e o pedido chega no WhatsApp já escrito: `Caixa de bombons (4 un.) (2 Pistache, 2 Ao leite)`.

- Quantidade da caixa é fixa (4, 6, 12, 24…). O total precisa fechar; o servidor revalida.
- Cada sabor pode ter **acréscimo por unidade** (ex.: pistache + R$ 1,00).
- Produtos comuns continuam com o botão “+ Adicionar” de sempre.

## Atalho novo no painel: "Nova caixa com sabores"
No topo da aba **Cardápio** tem o botão **Nova caixa com sabores**. Ele já abre o formulário com:
- nome sugerido ("Caixa de bombons") e o campo de sabores pronto para **colar a lista de uma vez**;
- **Quantas unidades vêm na caixa?** → esse número é o que o cliente vê e o total que ele precisa fechar;
- **prévia "Como o cliente vai ver"**, que mostra o título, os sabores em etiquetas e um exemplo
  (ex.: *13 Prestígio + 2 Brigadeiro*) enquanto a pessoa digita.

Antes de salvar o painel confere: no mínimo 2 sabores, quantidade ≥ 2 e nenhum sabor repetido.
Na lista de produtos, cada caixa aparece com o selo azul **"cliente escolhe · N un."**.

O que o cliente faz na loja: toca em **Escolher sabores**, usa `−`/`+` em cada sabor, e o botão
**Adicionar ao carrinho** só libera quando o total fecha (ex.: 10 de um sabor + 2 de outro em uma
caixa de 12). No carrinho aparece **"Caixa de docinhos (12 un.) — 10 Beijinho, 2 Brigadeiro"** e
o mesmo texto vai para o WhatsApp da loja.

## Barra de chocolate: cliente escolhe os sabores
No painel, ao marcar **Cliente escolhe os sabores**, aparece a pergunta
**"Como o cliente escolhe?"** com duas opções:

| Opção | Para quê | O que o cliente faz |
|---|---|---|
| **Quantidade de cada sabor** | caixa de docinhos, bombom, pizza meio a meio | usa −/+ e o total precisa fechar (ex.: 10 de um + 2 de outro) |
| **Sabores da barra / do tablete** | barra grande, barra média, tablete | toca em **escolher** nos sabores que quer, até o número definido (ex.: 4) — sem preencher quantidade |

Na opção de barra aparecem dois campos, os dois escolhidos por você no painel:
- **Quantos sabores o cliente pode escolher?** (ex.: 4 na barra grande, 2 na média);
- **Quantas barras vêm?** (ex.: `1` barra grande, ou `8` num pacote de mini barras);
- o cliente vê no cardápio **"Escolher sabores (até 4)"** e, ao abrir, *"Monte sua barra · 8 barras · escolha até 4 sabores"*;
- cada sabor escolhido entra 1 vez; o botão de um sabor já escolhido vira **✓ escolhido** (toca para tirar);
- o servidor recusa pedido com mais sabores que o limite (erro 400) e exige no mínimo 2.

No carrinho e no WhatsApp a barra aparece como
**"Barra grande (200g) — Meio-amargo, Branco, Brigadeiro"**.
