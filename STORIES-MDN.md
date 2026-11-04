# Sessão de stories — MDN Presents

7 imagens **1080×1920** (tamanho do Stories), feitas com as **fotos reais do catálogo**.
Todas deixam a **faixa de baixo livre** — é ali que entra o adesivo de link do Instagram,
sem cobrir preço nem nome do produto.

- **Página com tudo pronto (abrir no celular):** https://loja-digital.onrender.com/STORIES-MDN.html
- **Arquivos:** `public/stories-mdn/` (JPG leve) e `artes/` (PNG)

## Ordem de postagem e o link de cada story

| # | Imagem | Chamada | Link para o adesivo | Abre em |
|---|---|---|---|---|
| 1 | `mdn-story-1-capa.jpg` | Escolha o seu perfume | `/l/mdn-presents?utm_source=instagram&utm_medium=story&utm_campaign=nov-2026-mdn&utm_content=story-capa` | catálogo inteiro |
| 2 | `mdn-story-2-femininos.jpg` | Raneen Asdaaf · R$ 269,90 | `…?cat=femininos&…&utm_content=story-raneen` | Perfumes femininos |
| 3 | `mdn-story-3-now-women.jpg` | Now Women · R$ 249,90 | `…?cat=femininos&…&utm_content=story-now-women` | Perfumes femininos |
| 4 | `mdn-story-4-masculinos.jpg` | Khamrah Dukhan · R$ 269,90 | `…?cat=masculinos&…&utm_content=story-khamrah` | Perfumes masculinos |
| 5 | `mdn-story-5-kit.jpg` | Kit Lattafa Pride · R$ 269,90 | `…?cat=kits&…&utm_content=story-kit` | Kits e presentes |
| 6 | `mdn-story-6-miniaturas.jpg` | Miniaturas · R$ 79,90 | `…?cat=miniaturas&…&utm_content=story-miniaturas` | Miniaturas |
| 7 | `mdn-story-7-corpo.jpg` | Body splash e hidratante | `…&utm_content=story-corpo` | catálogo inteiro |

Base: `https://loja-digital.onrender.com/l/mdn-presents`

## O clique cai direto na seção (novo)

O catálogo agora aceita **`?cat=`** no link:

- `?cat=femininos` → abre só Perfumes femininos
- `?cat=masculinos`, `?cat=kits`, `?cat=miniaturas`, `?cat=body`
- também aceita o nome exato: `?cat=Perfumes%20femininos`
- aparece uma faixa **"Você está vendo Perfumes femininos — Ver tudo"**

Testado em produção: chip certo, produtos filtrados, **ERROS: 0**.

## Por que o link "pega" no tráfego pago

O rastreio da loja já grava `utm_source`, `utm_medium`, `utm_campaign` e `utm_content`
em **cada visita**, e guarda a campanha em cada **pedido**. Então:

- story orgânico → `utm_medium=story`
- anúncio pago → `utm_medium=paid`

Use o **mesmo** `utm_campaign=nov-2026-mdn` nos dois. No painel da MDN (aba de tráfego)
dá para ver quantas visitas cada `utm_content` trouxe e quantos pedidos fecharam.

## Fotos usadas (são as do catálogo, não inventei nada)

Now Women · Raneen Asdaaf · Khamrah Dukhan · Kit Lattafa Pride · Miniatura Brand
Collection Nº 132 · Body splash 300 ml. Preços iguais aos do site.
