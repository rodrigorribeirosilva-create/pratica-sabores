# Cardápio digital ou catálogo digital — por loja

Cada loja escolhe **como quer aparecer**, e a escolha vale **só para ela**.
Fica em: **Painel → Configurações → Dados do negócio → "Sua loja aparece como"**.

| Opção | O que muda |
|---|---|
| Automático | segue o tipo cadastrado quando a loja foi criada |
| **Cardápio digital** | menus e textos de cardápio ("Cardápio", "Ver cardápio", "Cardápio de hoje"), categoria de exemplo do ramo de comida |
| **Catálogo digital** | "Catálogo", "Ver catálogo", "Nosso catálogo" |

Como é guardado: dentro das configurações da própria loja (`business.tipo`).
Mexer numa loja **nunca** muda as outras.

## Situação atual das 5 lojas (conferida no painel e no site)

| Loja | Aparece como | Observação |
|---|---|---|
| AGEO Confeitaria | **Cardápio digital** | mudou agora, a pedido |
| Prática Sabores | Cardápio digital | igual |
| MDN Presents | Catálogo digital | igual |
| Mimo de Linha | Catálogo digital | igual |
| Henrique Borges | Agenda (serviços) | não entra nessa escolha |

## Outros ajustes que vieram junto

- Texto do painel ficou neutro: "Cadastre, edite e organize os **itens do cardápio**"
  (antes dizia "as marmitas", o que não serve para confeitaria).
- As **categorias sugeridas** agora começam pelas categorias reais da loja —
  na AGEO aparecem Bombons, Rosquinhas, Barras… em vez de Marmitas/Bebidas.
- O bloco "Cliente escolhe os sabores" continua aparecendo na AGEO (ela usa sabores).

Teste feito em produção nas 4 lojas de cardápio/catálogo: **ERROS: 0**.

## O que o CLIENTE vê (ajustado)

Antes a escolha só valia dentro do painel: o site e a **prévia do WhatsApp** continuavam
usando o tipo antigo do cadastro. Agora vale para o cliente também.

| Onde | AGEO hoje |
|---|---|
| Título da aba | AGEO Confeitaria · **Cardápio digital** |
| Prévia do link no WhatsApp | AGEO Confeitaria — **Cardápio Digital** |
| Seção da vitrine | **Cardápio de hoje** |
| Carrinho vazio | "Escolha um **item do cardápio** para começar" |
| Voltar do item | "**Voltar ao cardápio**" |
| Nome ao instalar no celular | AGEO Confeitaria (manifest) |

As lojas de catálogo (MDN, Mimo) continuam exatamente como estavam: "Catálogo digital"
e "Nosso catálogo".

Teste automático: `node tests/verifica-catalogo-cliente.js` → **ERROS: 0**.

## Regra de ouro: cada loja fala a sua língua (sem mexer nas outras)

Toda palavra é decidida **dentro da loja**, por dois campos em
Configurações → Dados do negócio:

| Campo | Valores | Efeito |
|---|---|---|
| Sua loja aparece como | automático / cardápio / catálogo | "Cardápio" x "Catálogo" nas telas e na prévia do WhatsApp |
| Ramo da loja | comida em geral / **doces e confeitaria** | troca "marmitas" por "doces"/"item do cardápio" |

### O que cada loja mostra hoje

| Loja | Aparece como | Ramo | Texto do painel |
|---|---|---|---|
| AGEO Confeitaria | Cardápio digital | Doces | "organize os **doces**" · carrinho "escolha um **item do cardápio**" |
| Prática Sabores | Cardápio digital | Comida (padrão) | "organize **as marmitas**" · carrinho "escolha uma **marmita**" (como era) |
| MDN Presents | Catálogo digital | — | "os produtos do catálogo" (como era) |
| Mimo de Linha | Catálogo digital | — | idem |

Nada de palavra nova vaza de uma loja para outra: os textos antigos só mudam quando
o campo "Ramo" está em **doces**.
