# 🍱 Prática Sabores — Cardápio Digital Inteligente

Sistema completo (e **funcional**, não só visual) para vender marmitas: cardápio online com fotos,
carrinho, cálculo automático de entrega e envio do pedido pronto para o **WhatsApp do vendedor** —
tudo administrado por um painel privado, sem precisar programar.

Stack 100% gratuita: **Node.js + Express + SQLite** (banco em arquivo, sem mensalidade) e front-end
em HTML/CSS/JavaScript puro (sem build, sem framework).

---

## ✅ O que está pronto

| # | Requisito | Como funciona |
|---|-----------|----------------|
| 1 | **Painel administrativo privado** | `/admin` com senha, sessão assinada (cookie httpOnly), bloqueio após 8 tentativas. CRUD completo de produtos com upload de fotos. |
| 2 | **Configurações** | Formas de pagamento (com instruções, ex.: chave Pix), períodos de entrega, taxa, entrega grátis acima de X, pedido mínimo, retirada, dados do negócio, logo e capa. |
| 3 | **Cardápio online + link** | Link público (`https://seu-site.com/`) com fotos, preços, categorias e botão de adicionar ao carrinho. Botão "Compartilhar no WhatsApp" e **QR Code** gerado na hora. |
| 4 | **Finalização do pedido** | Nome, telefone (com máscara), endereço/bairro/complemento, entrega ou retirada, forma de pagamento, horário e observações. |
| 5 | **Cálculo automático** | Subtotal, taxa de entrega (ou grátis) e total atualizados em tempo real — e **recalculados no servidor** (o navegador não define preço). |
| 6 | **WhatsApp** | Ao finalizar, gera mensagem organizada (itens, quantidades, endereço, total, pagamento) e abre `wa.me` com o texto pronto para o número do vendedor. |
| 7 | **Atualização automática** | O cardápio lê os dados do banco a cada acesso: mudou preço, foto ou produto no painel → aparece na hora para o cliente. |
| 8 | **Sem programação** | Tudo pelo painel: produtos, preços, fotos, horários, taxas, pagamentos e senha. |

Bônus já incluídos: painel de pedidos com status (novo → em preparo → saiu para entrega → entregue),
faturamento do dia/semana, histórico de pedidos, QR Code para imprimir, e layout mobile-first.

---

## 🚀 Rodar no seu computador

Pré-requisito: [Node.js 18+](https://nodejs.org) instalado.

```bash
cd pratica-sabores
npm install
npm start
```

- Cardápio: http://localhost:3000
- Painel: http://localhost:3000/admin — **senha inicial: `pratica123`**

> Troque a senha em **Configurações › Segurança** no primeiro acesso.
> Para rodar em outra porta: `PORT=8080 npm start`.

---

## 🗂 Estrutura do projeto

```
pratica-sabores/
├── server.js                 # servidor Express (rotas de página + estáticos)
├── src/
│   ├── db.js                 # SQLite, criação das tabelas e dados iniciais
│   ├── helpers.js            # dinheiro, telefone, código do pedido, mensagem do WhatsApp
│   ├── auth.js               # sessão do painel (HMAC + cookie httpOnly)
│   ├── routes.public.js      # GET /api/menu · POST /api/orders
│   └── routes.admin.js       # login, produtos, upload, settings, pedidos, QR
├── public/
│   ├── index.html            # cardápio (mobile-first)
│   ├── admin.html            # painel administrativo
│   ├── assets/               # css e js separados (base, menu, admin)
│   └── img/                  # imagens de exemplo
├── data/menu.db              # ⚠️ banco criado automaticamente (não versionar)
├── uploads/                  # ⚠️ fotos enviadas pelo painel (não versionar)
├── tests/ui-test.js          # teste automatizado da interface (Playwright)
└── DEPLOY.md                 # passo a passo de publicação
```

---

## 🔌 API (resumo)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/menu` | Cardápio público (produtos ativos + configurações) |
| POST | `/api/orders` | Cria o pedido, valida, recalcula preços e devolve a URL do WhatsApp |
| GET | `/api/orders/:code` | Status de um pedido pelo código (ex.: `PS261027-001`) |
| POST | `/api/admin/login` · `/logout` · GET `/session` | Autenticação do painel |
| GET/POST/PUT/DELETE | `/api/admin/products…` | CRUD de produtos |
| PATCH | `/api/admin/products/:id/active` | Mostrar/ocultar no cardápio |
| POST | `/api/admin/upload` | Upload de imagem (JPG/PNG/WEBP/GIF/AVIF, até 5 MB) |
| GET/PUT | `/api/admin/settings` | Dados do negócio, entrega e pagamentos |
| POST | `/api/admin/password` | Troca de senha |
| GET | `/api/admin/orders` · PATCH `/:id/status` · GET `/stats` | Gestão de pedidos |
| GET | `/api/admin/qr?url=…` | PNG do QR Code do cardápio |

---

## 🧪 Teste automatizado (opcional, para desenvolvimento)

Com o servidor rodando em outra aba:

```bash
npm i -D playwright
node tests/ui-test.js
```

O script percorre o fluxo real (adicionar ao carrinho → checkout → pedido → WhatsApp) e o painel
(criar, editar preço, ocultar, excluir produto, salvar taxa de entrega), tirando prints em
`tests/shots/`.

---

## 💾 Backup

O sistema inteiro são dois itens:

1. `data/menu.db` — produtos, configurações, senha e pedidos
2. `uploads/` — fotos enviadas

Copie esses dois para um pen drive/Drive de vez em quando:

```bash
tar -czf backup-$(date +%F).tar.gz data uploads
```

---

## ➡️ Publicar na internet

Comece pelo **[COMO-PUBLICAR.md](COMO-PUBLICAR.md)** — passo a passo sem terminal (GitHub + Render),
com o que configurar em cada tela e como gerar o link para o WhatsApp.
Detalhes de custos, alternativas (Fly.io, Oracle Always Free) e domínio próprio estão em
**[DEPLOY.md](DEPLOY.md)**.

## 🏪 Multi-loja (revenda para vários clientes)

O sistema atende **várias empresas** numa única instalação:

- `/master` — **seu** painel (cria lojas, redefine senhas, vê todas) — protegido pela senha `MASTER_PASSWORD`
- `/l/<endereco>` — cardápio público de cada loja (é o link que vai no WhatsApp)
- `/l/<endereco>/admin` — painel **do cliente** (só a loja dele)

Leia o guia completo em [GUIA-MULTI-LOJA.md](GUIA-MULTI-LOJA.md).
