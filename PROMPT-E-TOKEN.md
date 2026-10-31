# 📋 Prompt + Token: como criar o projeto no GitHub e depois me deixar ajustar

Você tem dois caminhos. O **A** (manual) é o mais rápido e não exige nada além do navegador.
O **B** (prompt para agente de IA) serve se você tiver um agente com acesso ao GitHub.
O **C** explica o token — o "touch" — para eu poder editar o repositório por você.

---

## A) Caminho mais rápido: upload pelo navegador (6 cliques, sem token)

1. `github.com` → **Sign up** → e-mail, senha, usuário → confirme o código do e-mail.
2. Logado: **+** (canto superior direito) → **New repository**.
   - **Repository name:** `pratica-sabores`
   - Marque **Public**
   - **Não** marque "Add a README file"
   - **Create repository**
3. Na página que abre, clique em **“uploading an existing file”**.
4. Descompacte o `pratica-sabores-publicar.zip` e **selecione todo o conteúdo** da pasta
   (Ctrl+A / Cmd+A) → arraste para a área do navegador.
   > Não precisa incluir `node_modules` (não existe no zip) nem `data/` (o banco é criado sozinho).
5. Escreva em "Commit changes": `Projeto inicial — cardápio digital`.
6. **Commit changes**. Confira se aparecem `server.js`, `package.json`, `Dockerfile`,
   `render.yaml`, `public/` e `src/`.

Pronto. Me mande o link do repositório (ex.: `github.com/seuusuario/pratica-sabores`) e eu sigo
com o deploy no Render junto com você.

---

## B) Prompt pronto (para colar em um agente de IA com acesso ao GitHub)

Se você usa um agente que já tem acesso ao seu GitHub (Copilot agent, Cursor, Claude com MCP do
GitHub etc.), cole o bloco abaixo **inteiro**:

```
Crie um repositório público no meu GitHub com o nome "pratica-sabores" e envie para ele o conteúdo
do arquivo pratica-sabores-publicar.zip que estou anexando (é o código de um cardápio digital em
Node.js + Express + SQLite).

Regras:
1. Não envie as pastas node_modules, data/ e uploads/ (o .gitignore já as exclui; o banco é criado
   automaticamente no primeiro boot).
2. Mantenha a estrutura exatamente como está: server.js, src/, public/, package.json,
   package-lock.json, Dockerfile, render.yaml, .gitignore, README.md, DEPLOY.md, COMO-PUBLICAR.md.
3. Use como mensagem do commit: "Projeto inicial — cardápio digital com painel administrativo".
4. Não altere nenhum código e não crie um README novo (já existe um).
5. Ao terminar, me devolva: a URL do repositório, a lista de arquivos enviados e confirmação de
   que a branch principal se chama "main".

Contexto: depois desse passo o projeto será publicado no Render como Web Service, com
Build Command "npm install" e Start Command "npm start".
```

Se preferir um prompt **para você mesmo seguir** (sem agente), use o caminho A acima — ele é o mesmo
resultado, sem risco de o agente reescrever arquivos.

---

## C) O "touch" (token): como criar e o que eu faço com ele

Um **token** é uma senha temporária que permite a um programa (eu) escrever no seu repositório sem
usar a sua senha. Se você quiser que eu suba e ajuste os arquivos direto, é assim:

### Criar (2 minutos)

1. GitHub → foto no canto superior direito → **Settings**
2. Menu esquerdo, no fim: **Developer settings**
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
4. Preencha:
   - **Token name:** `arena-pratica-sabores`
   - **Expiration:** `7 days` (curto de propósito)
   - **Repository access:** `Only select repositories` → escolha **apenas** `pratica-sabores`
   - **Permissions → Repository permissions:**
     - **Contents:** `Read and write`  ← é o único que preciso
     - **Metadata:** `Read-only` (vem marcado sozinho)
     - Deixe todo o resto em **No access**
5. **Generate token** → copie o valor (começa com `github_pat_...`) — ele aparece **uma única vez**.

### O que eu faria com ele

- Enviar o projeto completo para o repositório (sem precisar do upload manual).
- Corrigir arquivos, ajustar textos do cardápio, trocar preços/produtos iniciais.
- Criar commits sempre que você pedir uma alteração, sem você tocar em nada.

### Antes de me enviar, saiba disto

⚠️ Tudo que você cola neste chat fica registrado na conversa. Por isso:

- use **expiração de 7 dias** e permissão **apenas naquele repositório** (como acima);
- quando terminarmos, **revogue** o token: Settings → Developer settings → Fine-grained tokens →
  o token → **Delete**;
- nunca me envie sua senha do GitHub, nem um token "clássico" com acesso a tudo (escopo `repo`
  amplo) — o fine-grained limitado ao repositório já resolve.

Se preferir **não** compartilhar token nenhum, tudo bem: eu escrevo os arquivos aqui no workspace e
você cola no editor do GitHub (ícone ✏️ em cada arquivo). É mais clico, mas funciona igual.

---

## D) Depois do repositório criado, me manda só isto

```
Repo criado: https://github.com/SEU-USUARIO/pratica-sabores
Token: github_pat_...   (opcional, se quiser que você mesmo faça os ajustes)
```

Com isso eu: (1) confiro se todos os arquivos subiram, (2) te guio no Render tela por tela com os
campos exatos, (3) ajusto o cardápio inicial com seus dados (WhatsApp, nome, taxa, horários) antes
do deploy.
