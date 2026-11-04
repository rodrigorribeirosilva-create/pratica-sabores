# Ativar os anúncios da Mimo e da Prática — o caminho mais rápido

## Por que eu não consigo clicar em "Ativar" por você
Ativar anúncio = entrar na **sua conta do Meta**, cadastrar **seu cartão** e gastar **seu dinheiro**.
Eu não tenho (e não devo ter) acesso a isso. Não é limitação técnica do site — é do dinheiro e da conta.

**Dois caminhos.** O 2 é o mais rápido e eu faço o trabalho pesado.

---

## Caminho 1 — você mesmo, 15 minutos (sem depender de mim)

### Mimo de Linha
1. `business.facebook.com` → conta de anúncios → **cartão de crédito** + limite de gasto **R$ 200**
2. `adsmanager.facebook.com` → **Criar** → objetivo **Tráfego**
3. Nome `Mimo — stories — nov2026` · **R$ 10/dia**
4. Público: **Florianópolis + 20 km** · **25 a 45 anos** · mães, moda infantil, crochê, artesanato
5. Posicionamentos: marcar **só** Stories do Instagram + Stories do Facebook + Reels
6. Imagem: `artes/mimo-stories-1.png`
7. Texto: *Laços feitos à mão, um por um. Crochê e tecido, do R$ 10 ao R$ 20, com edição de Natal 🎀*
8. Título: *Laços artesanais feitos à mão* · Botão **Saiba mais**
9. Link: `https://loja-digital.onrender.com/l/mimo-de-linha?utm_source=instagram&utm_medium=paid&utm_campaign=nov-2026-mimo`
10. **Publicar**

### Prática Sabores
1. Mesma conta de anúncios (pode ser a mesma!)
2. Campanha `Pratica — stories — nov2026` · **R$ 12/dia**
3. Público: **Florianópolis + 8 km** · **25 a 55 anos** · almoço no trabalho, comida caseira, delivery
4. Posicionamentos: Stories Instagram + Facebook + Reels (almoço/janta rende muito no Stories)
5. Imagem: `artes/pratica-stories-1.png`
6. Texto: *Almoço caseiro por R$ 15, feito no dia e entregue quentinho. Estrogonofe, macarrão, panqueca — escolha o seu 🍱*
7. Título: *Almoço caseiro a R$ 15* · Botão **Saiba mais**
8. Link: `https://loja-digital.onrender.com/l/pratica-sabores?utm_source=instagram&utm_medium=paid&utm_campaign=nov-2026-pratica`
9. **Publicar**

> Ative **uma de cada vez**. Se as duas rodarem juntas com R$ 10, nenhuma sai da fase de aprendizado.

---

## Caminho 2 — eu crio as campanhas pela API (você só clica em Ativar)

Já está tudo programado: `scripts/publicar-anuncio-meta.js`. Ele cria **campanha + público + anúncio PAUSADOS**
(nada é cobrado) e te devolve o link do Gerenciador para você revisar e ativar.

### O que eu preciso que você me mande (4 valores)
| O que | Onde achar |
|---|---|
| `META_TOKEN` | developers.facebook.com → seu app → *Ferramentas* → **Graph API Explorer** → marcar `ads_management`, `ads_read`, `business_management` → *Generate Access Token* |
| `AD_ACCOUNT` | Gerenciador de Anúncios → canto superior esquerdo mostra `act_1234567890` |
| `PAGE_ID` | Página do Facebook da loja → *Sobre* → *Transparência da página* → ID |
| `IG_ID` (opcional) | Instagram profissional vinculado à página (sem ele o anúncio roda só no Facebook) |

> ⚠️ O token é como uma senha: dá poder sobre a conta de anúncios. Se me mandar, revogue depois em
> Configurações do negócio → Usuários → Apps. Eu uso, crio a campanha pausada e não guardo em arquivo.

### O que acontece depois que você mandar
1. Eu envio as imagens (`artes/…`) para a sua conta
2. Crio as duas campanhas pausadas (Mimo e Prática)
3. Te mando os IDs + o link do Gerenciador
4. **Você confere e clica em Ativar** — o gasto começa no seu cartão, com o limite que você definiu

---

## O que já está pronto (nada mais falta)
- Artes: `artes/mimo-stories-1.png`, `mimo-stories-2.png`, `mimo-feed-1.png`, `mimo-quadrado-1.png`
- Artes: `artes/pratica-stories-1.png`, `pratica-stories-2.png`, `pratica-feed-1.png`, `pratica-quadrado-1.png`
- Textos, títulos, públicos e links com etiqueta: `/CAMPANHAS.html`
- Robô de publicação: `scripts/publicar-anuncio-meta.js`
- Controle de resultado: `/master → aba Tráfego`

## Depois de ativar (o que eu faço para você)
Você me diz "rodando" e eu acompanho pelo painel: visitas, cliques e pedidos por loja,
e aviso no 3º dia se vale trocar a imagem, o público ou aumentar o orçamento.
