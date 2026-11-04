# Central de Tráfego — como trazer clientes para as lojas

Sua central fica em **/master → aba “Tráfego”**. Ela mostra, por loja e por campanha:
**visitas → cliques no WhatsApp → pedidos → vendas → conversão → custo por pedido**.

---

## 1. Como funciona (o caminho inteiro)

```
Anúncio (Meta/Google)  →  link rastreado  →  página da loja  →  WhatsApp  →  pedido
        você paga            gerado aqui       visita           lead        conversão
```

O sistema **não acessa sua conta de anúncios**. Ele mede o que o anúncio trouxe:
quem abriu a página, de qual campanha, quem clicou no WhatsApp e quem pediu.

---

## 2. Passo a passo (5 minutos por campanha)

1. **/master → Tráfego → Campanhas**: escolha a loja, onde vai anunciar, o nome e o
   investimento previsto. Clique em **Criar campanha e gerar link**.
2. Copie o **link do anúncio** (ele já vem com `utm_source`, `utm_medium` e `utm_campaign`).
3. No **Meta Ads** (ou Google Ads), use esse link como **endereço do anúncio**.
4. Volte na aba Tráfego: as visitas, os cliques no WhatsApp e os pedidos aparecem em tempo real.
5. Quando souber quanto gastou, clique em **Atualizar investimento** — aí o painel calcula
   o **custo por pedido** e o **custo por venda**.

> Dica: use **um link por campanha**. Se usar o mesmo link em dois anúncios diferentes,
> o painel não consegue separar os resultados.

---

## 2.1 Links prontos por canal (o jeito mais rápido)

Dentro da aba **Tráfego → “Links prontos para divulgar”** já existem, para **cada loja**, quatro
links com botão **Copiar**:

| Canal | Onde usar | Link gerado |
|---|---|---|
| **Instagram** | bio do perfil, stories, direct | `...?utm_source=instagram&utm_medium=social&utm_campaign=instagram` |
| **WhatsApp** | status, grupos, mensagem para clientes | `...?utm_source=whatsapp&utm_medium=social&utm_campaign=whatsapp-status` |
| **Google** | Google Ads (anúncio) e Google Meu Negócio | `...?utm_source=google&utm_medium=cpc&utm_campaign=google` |
| **QR / impresso** | cartaz, panfleto, sacola, cartão | `...?utm_source=qrcode&utm_medium=offline&utm_campaign=material-impresso` |

Tem também os botões **“Copiar todos: Instagram / WhatsApp / Google”**, que copiam o link de
todas as lojas de uma vez (bom para colar num documento e ir distribuindo).

> **Dica de Instagram:** o link da bio não é clicável — coloque o link do Instagram no campo
> *Site* do perfil e escreva “Peça pelo link da bio”. Nos stories, use o adesivo de link.
> **No Google:** para aparecer na busca local, cadastre a loja no **Google Meu Negócio**
> (grátis) e use o link do Google no botão “Site”. Anúncio pago do Google usa o mesmo link.

---

## 3. O que anunciar em cada loja (sugestão pronta)

| Loja | Oferta que converte | Público | Criativo |
|---|---|---|---|
| **Prática Sabores** (marmitas) | “Marmita caseira entregue quentinha — peça pelo WhatsApp” | Raio de 5 km, 25–55 anos, interesse em comida caseira/almoço | Foto da marmita aberta + preço na tela |
| **MDN Presents** (catálogo) | “Presente pronto para entregar hoje” | 25–45 anos, datas comemorativas | Foto do kit + “entrega em [cidade]” |
| **Mimo de Linha** (crochê) | “Peças de crochê feitas à mão” | Mulheres 25–50, artesanato/decoração | Fotos das peças em uso |
| **AGEO Confeitaria** | “Bolos e doces por encomenda” | 25–50 anos, festas | Vídeo curto do corte do bolo |
| **Henrique Borges** (ar) | “Instalação e limpeza de ar-condicionado — orçamento grátis” | Raio de 15 km, 30–60 anos, dono de casa | Antes/depois da limpeza |

**Ordem recomendada:** comece pela loja que já vende (Prática Sabores) com **R$ 10–15/dia
por 5 dias** (R$ 50–75 no total). Se o custo por pedido ficar **menor que o lucro da venda**,
aumente. Se ficar maior, troque o criativo antes de aumentar o dinheiro.

---

## 4. Como ler os números

| Número | O que significa | Meta saudável |
|---|---|---|
| **Visitas** | pessoas que abriram a página | — |
| **Cliques no WhatsApp** | quantos quiseram falar com você | 10–25% das visitas |
| **Pedidos** | quantos fecharam | 2–8% das visitas (comida) |
| **Conversão** | pedidos ÷ visitas | acima de 2% já é bom |
| **Custo por pedido** | investimento ÷ pedidos | **menor que o seu lucro por venda** |

Se muita gente visita e pouca chama no WhatsApp → o problema é a **página** (foto, preço, texto).
Se muita gente chama e pouca pede → o problema é o **atendimento no WhatsApp** (demora, resposta).

---

## 5. Onde ficam os dados

- Tabelas no banco: `visitas`, `eventos` (cliques no WhatsApp), `sessoes_origem`, `campanhas`.
- `orders.origem_fonte` / `orders.origem_campanha` e `agendamentos.origem_fonte` guardam de onde
  veio cada pedido, para sempre.
- Código: `src/rastreio.js` (medição), `src/routes.master.js` (`/api/master/trafego` e
  `/api/master/campanhas`), `public/master.html` (aba Tráfego),
  `public/assets/menu.js` e `public/servicos.html` (aviso de clique no WhatsApp).
- Entram no **backup** normal do banco. Bot e prévia de link (WhatsApp/Facebook) **não** contam como visita.

---

## 6. O que ainda não é automático

- **O gasto é digitado por você.** Para puxar o gasto direto do Meta/Google seria preciso
  autorizar o acesso às contas de anúncio (API do Meta/Google) — dá para fazer depois.
- **Sem disparo de campanha pelo sistema.** Nada de “publicar anúncio” por aqui: o Meta Ads e o
  Google Ads exigem a conta de anúncios e o cartão de crédito do anunciante.
- **Painel por cliente** (cada dono ver só o tráfego dele) ainda não existe — hoje tudo fica no
  seu master. É o próximo passo natural.
