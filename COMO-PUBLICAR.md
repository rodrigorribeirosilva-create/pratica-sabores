# 🚀 Publicar o Prática Sabores — passo a passo (sem terminal)

Você vai precisar de duas contas gratuitas: **GitHub** (guarda o código) e **Render** (mantém o site no ar).
Todo o processo é por navegador, com cliques. Tempo: ~15 minutos.

O arquivo que você vai usar é o **`pratica-sabores-publicar.zip`**.

---

## ⚠️ Antes de tudo: escolha o plano (importante)

O plano gratuito do Render **não permite disco permanente**. Isso significa que, no plano free, o
banco de dados (produtos, pedidos) e as fotos enviadas pelo painel **são apagados** sempre que o site
reinicia — e ele reinicia sozinho após 15 minutos sem visitas. Serve para você conhecer o sistema,
não para vender de verdade.

| Caminho | Custo | Dados ficam salvos? | Indicado para |
|---------|-------|--------------------|----------------|
| **A. Render free** | R$ 0 | ❌ apaga no reinício | testar hoje, mostrar para alguém |
| **B. Render pago + disco** | ~US$ 7,25/mês (~R$ 40) | ✅ | **recomendado para vender** |
| **C. Oracle Cloud Always Free** | R$ 0 | ✅ | quem tem paciência de configurar um servidor |
| **D. Fly.io / Railway** | ~US$ 2–5/mês | ✅ | alternativa ao Render pago |

Comece pelo **A** para ver funcionando; quando for vender, suba para o **B** (é só trocar o plano e
adicionar o disco, sem refazer nada).

---

## Passo 1 — Baixar e descompactar

1. Baixe `pratica-sabores-publicar.zip` (está no seu workspace).
2. Clique com o botão direito → **Extrair tudo**. Você verá uma pasta com `server.js`, `package.json`,
   `public/`, `src/`, etc.

---

## Passo 2 — Criar o repositório no GitHub (pelo navegador)

1. Acesse <https://github.com> → **Sign up** (e-mail, senha, usuário). Confirme o e-mail.
2. Já logado, clique no **+** (canto superior direito) → **New repository**.
3. Preencha:
   - **Repository name:** `pratica-sabores`
   - **Public** (deixe público — o Render lê repositórios públicos no plano free)
   - **Não** marque "Add a README file"
4. **Create repository**.
5. Na página que abrir, clique no link **“uploading an existing file”**.
6. Abra a pasta descompactada no seu computador e **arraste todo o conteúdo** dela para dentro da área
   do navegador (selecione tudo com Ctrl+A / Cmd+A, incluindo as pastas `public` e `src`).
   > Não arraste a pasta `node_modules` (não existe no zip) nem a pasta `data` (o banco é criado sozinho).
7. Espere os arquivos subirem e clique no botão verde **Commit changes**.
8. Confira: você deve ver `server.js`, `package.json`, `Dockerfile`, `render.yaml` e as pastas
   `public/` e `src/` na lista.

---

## Passo 3 — Publicar no Render

1. Acesse <https://render.com> → **Get Started** → **Sign in with GitHub** → autorize.
2. No painel do Render: **New +** → **Web Service**.
3. Em **Git Provider**, escolha o repositório `pratica-sabores` → **Connect**.
4. Preencha assim:

   | Campo | Valor |
   |-------|-------|
   | **Name** | `pratica-sabores` (vira parte do link) |
   | **Language / Runtime** | `Node` |
   | **Region** | `Ohio (US East)` ou a mais próxima |
   | **Branch** | `main` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |
   | **Instance Type** | `Free` (para testar) ou `0.5 CPU / 512 MB` US$ 7/mês (para vender) |

5. Abra **Advanced** e adicione a variável de ambiente:

   | Key | Value |
   |-----|-------|
   | `ADMIN_PASSWORD` | uma senha forte só sua (ex.: `Ps-Frango-2026!`) |
   | `NODE_ENV` | `production` |

   > A `ADMIN_PASSWORD` só é aplicada no primeiro boot. Depois disso, a senha é a que você definiu no
   > painel — trocá-la aqui não altera nada.

6. **Se você escolheu o plano pago (recomendado para vender):** ainda em **Advanced** → **Add Disk**:
   - **Name:** `dados`
   - **Mount Path:** `/var/data`
   - **Size:** `1 GB`
   Depois adicione mais duas variáveis:

   | Key | Value |
   |-----|-------|
   | `DATA_DIR` | `/var/data` |
   | `UPLOAD_DIR` | `/var/data/uploads` |

7. Clique em **Deploy Web Service**. Acompanhe os logs: quando aparecer
   `✅ Prática Sabores rodando`, está no ar.
8. No topo da página o Render mostra seu link, algo como
   **`https://pratica-sabores-xxxx.onrender.com`**.

---

## Passo 4 — Configurar o negócio (5 minutos, uma vez só)

1. Abra **`https://seu-link.onrender.com/admin`**
2. Entre com a senha que você definiu em `ADMIN_PASSWORD` (ou `pratica123`, se não definiu).
3. **Configurações › Segurança**: troque a senha.
4. **Configurações › Dados do negócio**: nome, slogan, endereço, **WhatsApp que recebe os pedidos**
   (com DDD — ex.: `48 98888-7777`). Sem isso os pedidos vão para um número de exemplo.
5. **Configurações › Entrega**: taxa (ex.: `7,00`), pedido mínimo, períodos (`11h30 às 12h30` etc.).
6. **Configurações › Pagamentos**: confira Pix/Dinheiro/Cartão e escreva a chave Pix nas instruções.
7. **Cardápio**: cadastre suas marmitas reais com foto (pode ser foto tirada com o celular),
   descrição e preço. Use o interruptor para mostrar/ocultar.
8. **Teste final**: abra o cardápio no celular, faça um pedido de teste e confirme que a mensagem
   chega no seu WhatsApp.

---

## Passo 5 — O link para mandar no WhatsApp

No painel, **Configurações › Seu link do cardápio** tem:

- o **link** com botão **Copiar**;
- **Compartilhar no WhatsApp** (abre o WhatsApp com a mensagem pronta);
- **QR Code** para baixar e imprimir (ótimo para colar na marmita ou no balcão).

Sugestão de mensagem para seus clientes:

> Oi! 😊 Agora você pode fazer seu pedido por aqui, em 1 minuto:
> https://seu-link.onrender.com
> Marmitas feitas no dia, entrega das 11h30 às 13h30. Pagamento no Pix, dinheiro ou cartão.

---

## Passo 6 — Domínio próprio (opcional, ~R$ 40/ano)

1. Compre `praticasabores.com.br` no [Registro.br](https://registro.br).
2. No Render: seu serviço → **Settings** → **Custom Domains** → **Add Custom Domain** →
   digite `cardapio.praticasabores.com.br`.
3. O Render mostra o apontamento a criar. No Registro.br → **DNS** → adicione:
   - Tipo **CNAME**, nome `cardapio`, valor `pratica-sabores-xxxx.onrender.com`
4. Aguarde de minutos a algumas horas. O HTTPS é emitido automaticamente pelo Render.

Seu link final fica: `https://cardapio.praticasabores.com.br` 🎉

---

## Atualizar o site depois de publicado

O Render publica automaticamente a cada alteração no GitHub:
GitHub → seu repositório → abrir o arquivo → ✏️ (lápis) → editar → **Commit changes** → o Render
faz o deploy sozinho em ~2 minutos.

> **Produtos, preços e fotos você NÃO altera no GitHub** — isso é tudo pelo painel `/admin`, e aparece
> na hora para os clientes.

---

## Problemas comuns

| Sintoma | Solução |
|---------|---------|
| "Deploy failed" nos logs | Confira se o **Start Command** é exatamente `npm start` e o **Build** é `npm install`. |
| Site demora ~1 min para abrir | Normal no plano free: ele "dorme" após 15 min sem visitas. Some no plano pago. |
| Produtos voltaram ao padrão | Plano free sem disco: os dados são apagados no reinício. Use plano pago + disco (`DATA_DIR`). |
| Fotos somem depois de um tempo | Mesmo motivo — `UPLOAD_DIR` precisa apontar para o disco. |
| Pedido abre o WhatsApp com número errado | Configurações › WhatsApp: precisa ter DDD e ser o número que usa WhatsApp. |
| Esqueci a senha do painel | Só é possível redefinir apagando o banco (perde produtos). Anote a senha. |
