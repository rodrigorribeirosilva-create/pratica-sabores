# Prévia do link (Instagram, Facebook, WhatsApp, Telegram, TikTok, LinkedIn)

## O que mudou

Antes: a prévia usava o **logo quadrado** (`og.jpg` 600×600) e o texto vinha do
cadastro antigo — por isso o status da AGEO aparecia como *"AGEO Confeitaria —
Catálogo Digital"*, mesmo depois de a loja virar cardápio.

Agora existe um **cartão próprio de compartilhamento**, gerado pelo sistema:

```
https://loja-digital.onrender.com/l/<loja>/og-card.png
```

- **1200 × 630 px** (formato que Instagram, Facebook, WhatsApp e Telegram mostram grande)
- Fundo na **cor da loja** + **logo** + **nome** + ** Cardápio digital / Catálogo digital**
- A **chamada** da loja (ex.: "Encomendas até as 16h")
- O **endereço da loja** escrito, para quem vê o story sem clicar
- Rodapé: "Peça pelo site · pagamento online ou na entrega"

E o título/descrição passaram a seguir a escolha da loja (cardápio ou catálogo).

## Onde isso aparece

| Onde | O que mostra |
|---|---|
| **WhatsApp** (status, conversa, bio) | cartão grande com logo + nome + link |
| **Instagram** — story com adesivo de link | cartão grande |
| **Instagram** — DM / link na bio | cartão grande |
| **Facebook** — post com link | cartão grande (usar "Inspecionar novamente" se estiver antigo) |
| **Telegram, LinkedIn, TikTok** | cartão grande |

## Por que o status antigo mostrava "Catálogo Digital"

Duas coisas:
1. A prévia foi criada **antes** da correção e o WhatsApp **guarda em cache** o card antigo.
2. O texto vinha do cadastro antigo (que era "catálogo").

**Corrigido no código.** Para atualizar as prévias que já existem:

- **WhatsApp:** mande o link para um contato (ou no seu próprio status) — em poucos
  minutos ele recria a prévia. Se continuar antiga, adicione algo no fim do link
  (`?v=2`) e ela é recriada na hora.
- **Facebook:** [Sharing Debugger](https://developers.facebook.com/tools/debug/) →
  cole o link → **Scrape Again**.
- **Instagram:** o story é sempre montado na hora, então já sai com o cartão novo.

> Dica: o cartão tem um `?v=` que muda sozinho quando o nome, o tipo (cardápio/catálogo)
> ou o logo mudam — então isso não volta a acontecer.

## Instagram — o que dá e o que não dá

- **Abertura automática do app do Instagram com a imagem:** o Instagram **não** permite
  que outro site publique um story. O caminho é: baixar a imagem → abrir o Instagram →
  Stories → escolher a imagem → **adesivo de link** com o endereço da loja.
- **Imagem fixa na bio:** a foto da bio do Instagram é do **perfil**, não do link.
  Deixe o **logo da loja** como foto do perfil (é o que o cartão já usa).
- **Link na bio:** campo "Site" do perfil → cole `https://loja-digital.onrender.com/l/<loja>`.
  Quem toca cai no cardápio com a prévia acima.

## Stories prontos por loja (já gerados)
- MDN Presents: `/STORIES-MDN.html` (7 imagens com o link de cada uma)
- Para as outras lojas: `node scripts/gerar-pdfs-pagamento.js` gera os PDFs, e as artes
  seguem o mesmo padrão do criador: `/CRIADOR-DE-ANUNCIO.html`

## Testes (produção)
```
/l/ageo-confeitaria/og-card.png  → 200, 1200×630
/l/mdn-presents/og-card.png      → 200
/l/pratica-sabores/og-card.png   → 200
/l/mimo-de-linha/og-card.png     → 200
og:title AGEO  → "AGEO Confeitaria — Cardápio Digital"
```
