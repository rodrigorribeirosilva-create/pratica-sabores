# MDN Presents — só perfumes, presentes e brinquedos

A MDN nasceu como **catálogo** (perfumes e presentes), mas o recurso de **sabores**
(criado para as caixas de doces da AGEO) aparecia também no painel dela.
Isso foi corrigido — **só na MDN**, sem tocar nas outras lojas.

## O que saiu da MDN

| Item | Antes | Agora |
|---|---|---|
| Bloco **"Cliente escolhe os sabores"** no editar produto | aparecia em todo produto | **não aparece** |
| Botão **"Nova caixa com sabores"** no topo do catálogo | aparecia | **não aparece** |
| Textos de comida no painel | "Cardápio", "marmita", "Nova caixa" | "Catálogo", "produto", "Novo produto" |
| Tela de carrinho vazio no site | "Escolha uma **marmita** no cardápio" | "Escolha um **produto** no catálogo" |
| Avisos do painel | "Produto visível no **cardápio**" | "Produto visível no **catálogo**" |

Nada de produto, preço ou foto foi alterado. Os 10 perfumes/miniaturas continuam iguais.

## Como funciona a regra (por loja, automática)

O bloco de sabores aparece **somente** quando:

1. a loja é do tipo **comida** (Prática Sabores), **ou**
2. algum produto **daquela loja** tem a montagem de sabores ligada.

Resultado hoje, loja por loja:

| Loja | Tipo | Sabores |
|---|---|---|
| Prática Sabores | comida | **sim** |
| AGEO Confeitaria | catálogo, mas tem barras com sabores | **sim** |
| MDN Presents | perfumes e presentes | **não** |
| Mimo de Linha | laços | **não** |
| Henrique Borges | serviços | **não** |

Ligar/desligar em uma loja **não muda nada nas outras**: a decisão é tomada
produto por produto, dentro de cada loja.

## Teste automático

`tests/verificar-sabores-visiveis.js` entra no painel das 4 lojas e confere
o bloco e o botão. Rodar com:

```bash
node tests/verificar-sabores-visiveis.js
```

Resultado esperado (última execução): **ERROS: 0**.

## Diagnóstico de versões (novo)

Para ver o que mudou numa loja em relação a uma versão antiga do banco:

```
GET /api/master/backup/historico
GET /api/master/backup/comparar?slug=mdn-presents&id=121
GET /api/master/stores/2/configuracoes
```

## Categorias padronizadas (01/11)

Antes os nomes estavam misturados (caixa alta e baixa). Agora são 6 categorias, todas
com o mesmo padrão — só a primeira palavra maiúscula:

| Categoria | Itens | Antes estava |
|---|---|---|
| Perfumes femininos | 3 | "Perfumes Femininos" |
| Perfumes masculinos | 2 | igual |
| Body splash | 1 | "body splash" |
| Hidratantes | 1 | igual |
| Miniaturas | 2 | "miniaturas" |
| Kits e presentes | 1 | igual |

Nenhum preço, foto, descrição ou nome de produto foi alterado (conferido item por item:
R$ 119,90 · 249,90 · 269,90 · 249,90 · 269,90 · 269,90 · 79,90 · 79,90 · 269,90 · 139,90).

## Ordem do catálogo (01/11)

Reordenado por grupo, mantendo a ordem interna de cada um. Nada de conteúdo mudou —
só a posição na vitrine.

| # | Categoria | Produto | Preço |
|---|---|---|---|
| 1 | Perfumes femininos | Now Women Lattafa | R$ 249,90 |
| 2 | Perfumes femininos | Raneen Asdaaf | R$ 269,90 |
| 3 | Perfumes femininos | Aisha Queen Bidaya | R$ 269,90 |
| 4 | Perfumes masculinos | Suqraat Lattafa | R$ 249,90 |
| 5 | Perfumes masculinos | Khamrah Dukhan Lattafa | R$ 269,90 |
| 6 | Kits e presentes | Kit Lattafa Pride | R$ 269,90 |
| 7 | Miniaturas | Brand Collection Nº 132 | R$ 79,90 |
| 8 | Miniaturas | Onlyou Nº 8214 | R$ 79,90 |
| 9 | Body splash | Body splash 300 ml | R$ 119,90 |
| 10 | Hidratantes | Hidratante Amber Romance | R$ 139,90 |

Conferido no site público: os 10 cards saem nessa ordem, todas as fotos carregando,
**ERROS: 0** de JavaScript.
