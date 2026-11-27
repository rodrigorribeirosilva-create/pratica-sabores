# Sabores, barras e combos — como montar tudo no painel

Vale para **Agel Doceria** e para qualquer loja com cardápio de doces.
Não precisa de programador: tudo é feito no painel, em **Cardápio → editar o produto**,
no bloco **“Cliente escolhe os sabores”**.

---

## 1) Barra recheada: **1 unidade, cliente escolhe 1 sabor**

Exemplo: barra recheada, **chocolate branco OU chocolate ao leite**.

1. Painel → **Cardápio** → **Novo produto** (ou editar a barra).
2. Nome, preço e categoria como sempre.
3. Marque **Cliente escolhe os sabores**.
4. No **Grupo 1**:
   - **Título do grupo**: `Escolha o recheio`
   - **Como o cliente escolhe?** → **Sabores da barra / do tablete**
   - **Quantos sabores o cliente pode escolher?** → `1`
   - **Quantas barras vêm?** → `1`
   - Cole os sabores: `Chocolate branco, Chocolate ao leite` (botão **Preencher**)
5. **Salvar**.

**O que o cliente vê:** o botão do card fica **“Escolher 1 sabor”**; ao escolher um,
o outro fica travado; não fecha o pedido sem escolher. No carrinho aparece
`Barra recheada (Chocolate branco)`.

> Quer que ele possa escolher **até 2** sabores na barra de 1 unidade? Basta colocar **2**
> em “Quantos sabores…”. Quer **4 pedaços, 4 sabores diferentes**? Coloque `4`.

---

## 2) Combo: **2 rosquinhas + 8 panitos**, cada parte com seus sabores

Exemplo: combo de Natal com **2 rosquinhas** e **8 panitos**, o cliente escolhe
os sabores de cada parte (inclusive “1 de cada”).

1. Painel → **Cardápio** → **Novo produto**.
2. Nome: `Combo de Natal`; preço do combo inteiro.
3. Marque **Cliente escolhe os sabores**.
4. **Grupo 1** (as rosquinhas):
   - **Título do grupo**: `Rosquinhas`
   - **Como o cliente escolhe?** → **Quantidade de cada sabor**
   - **Quantas unidades vêm neste grupo?** → `2`
   - Sabores: `Rosquinha de coco, Rosquinha de chocolate`
5. Clique em **+ Adicionar grupo (combo)** e preencha o **Grupo 2** (os panitos):
   - **Título do grupo**: `Panitos`
   - **Quantas unidades vêm neste grupo?** → `8`
   - Sabores: `Panito de queijo, Panito de doce de leite`
6. **Salvar**.

**O que o cliente vê:** botão **“Montar combo”**; a tela abre em **duas seções**
(Rosquinhas · 2 unidades / Panitos · 8 unidades), cada uma com seu contador.
Ele só consegue adicionar ao carrinho quando as duas partes fecham.
No carrinho e na comanda aparece:

```
Combo de Natal — Rosquinhas: Rosquinha de coco, Rosquinha de chocolate ·
Panitos: 5 Panito de queijo, 3 Panito de doce de leite
```

---

## 3) Regras simples (para não travar na hora de salvar)

| Campo | O que significa |
|---|---|
| **Título do grupo** | Nome que aparece na tela do cliente (`Rosquinhas`, `Panitos`, `Escolha o recheio`) |
| **Modo “Quantidade de cada sabor”** | O cliente distribui as unidades entre os sabores e o total precisa fechar. Ex.: caixa de 12 → 10 de um + 2 de outro; grupo de 2 → 1 de cada |
| **Modo “Sabores da barra”** | O cliente escolhe **até N sabores diferentes**, um de cada (barra). N = “Quantos sabores o cliente pode escolher?” |
| **Quantas unidades / sabores** | Aceita **1**. Em barra de 1 unidade, “1” = escolhe um sabor só; em caixa, é o total que precisa fechar |
| **Quantas barras vêm** | Só aparece no modo barra. Ex.: `1` barra grande ou `8` mini barras |
| **Acréscimo (R$)** | Valor extra **por unidade** daquele sabor. Deixe `0` se todos custam o mesmo |

- Pode ter **até 5 grupos** por produto (combo de várias partes).
- Dá para **remover um grupo** no botão “Remover grupo” e voltar atrás — nada é salvo até clicar em Salvar.
- Cada grupo precisa de **pelo menos 2 sabores** (senão não há escolha) e títulos diferentes entre si.
- A **prévia “Como o cliente vai ver”** mostra, em tempo real, cada grupo e um exemplo de montagem.

---

## 4) O que já existia continua igual

- Produtos **sem** escolha de sabores: nada muda.
- Produtos antigos (caixa de 12, bombons, barras) continuam com o mesmo comportamento e o
  mesmo texto nos pedidos. O painel só passou a aceitar **1 unidade** e **mais de um grupo**.
- Pedidos antigos, comandas e o comprovante continuam iguais; quando o produto tem grupos,
  a comanda mostra os grupos separados por `·`.

---

## 5) Testes (para conferir antes de publicar)

```bash
node tests/e2e-combo-sabores.js     # servidor + banco temporários: barra 1 sabor e combo 2 grupos
node tests/e2e-compat-montagem.js   # produto/pedido no formato antigo continua funcionando
node tests/ui-montagem-combo.js     # tela do cliente (cardápio) com jsdom
node tests/ui-painel-grupos.js      # painel: montar a barra e o combo clicando
```

Os de servidor (`e2e-*`) usam `node -r tests/_registrar-shim.js` quando o sandbox não
consegue compilar o `better-sqlite3` (shim local sobre o `node:sqlite`).
Os de tela (`ui-*`) precisam de `jsdom` (`npm i -D jsdom`).
