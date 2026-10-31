# Deixar o painel (e o catálogo) na tela inicial do celular

O sistema agora é um **app instalável** (PWA). Não precisa baixar nada de loja de aplicativo:
ele abre em tela cheia, com ícone próprio na tela inicial, e continua funcionando pela internet.

## No Android (Chrome)
1. Abra o link no **Chrome**:
   - Painel master: `https://loja-digital.onrender.com/master`
   - Painel da loja: `https://loja-digital.onrender.com/l/NOME-DA-LOJA/admin`
   - Catálogo/cardápio: `https://loja-digital.onrender.com/l/NOME-DA-LOJA`
2. Toque no botão **“Instalar”** que aparece no topo do painel **ou** no menu ⋮ → **“Instalar aplicativo”** / **“Adicionar à tela inicial”**.
3. Confirme. O ícone aparece junto dos outros apps e abre sem a barra do navegador.

## No iPhone (Safari)
1. Abra o link no **Safari**.
2. Toque em **Compartilhar** (quadrado com a seta para cima).
3. Escolha **“Adicionar à Tela de Início”** → **Adicionar**.

## O que muda depois de instalado
- Abre em tela cheia (sem endereço e sem barra do navegador).
- Aparece com o **nome e o logo da loja** (cada loja tem o seu) — o painel master usa o nome **Jeová** e a foto que você escolher.
- O login continua salvo, então você entra direto no painel.

## Onde trocar o nome e a foto do master
`/master` → aba **Segurança** → “Seu nome e sua foto” → escolher a imagem → **Salvar**.
A imagem fica guardada na nuvem (Supabase), então não some em atualização/deploy.

## Observação técnica
- `public/manifest.json` e `public/manifest-master.json`: nomes/ícones padrão.
- `public/sw.js`: service worker mínimo (só repassa as requisições para a rede, não guarda página velha).
- `GET /l/:slug/manifest.json` e `GET /l/:slug/admin/manifest.json`: manifest gerado na hora com **nome, logo e cor da loja**.
- `POST /api/master/upload` + `POST /api/master/profile {photo_url}`: foto do master.
