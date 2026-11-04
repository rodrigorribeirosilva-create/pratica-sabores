# Por que aparecia a tela preta do Render — e como ficou

## O que era

A tela preta com **"CARREGANDO APLICATIVO"**, o desenho de "água" e
*"Preparando a instância para inicialização"* **não é do nosso site**: é do Render,
enquanto ele liga o servidor. Aparece em dois momentos:

1. **Depois de 15 minutos sem ninguém acessar** — no plano gratuito o Render
   "dorme" e leva ~40 s para acordar.
2. **Quando eu publico uma alteração** — o servidor reinicia para carregar a
   versão nova (~40 s).

Não dá para mudar o visual dessa tela (ela vem do Render, antes do nosso código
rodar). O que dá — e foi feito — é **não deixar mais o cliente ver ela**.

## O que mudou

### 1. A loja abre na hora, mesmo com o servidor acordando
O catálogo/cardápio agora é **guardado no celular de quem já visitou**. Quando
alguém abre o link:

- o site tenta o servidor por **4 segundos**;
- se o servidor estiver acordando, a loja **abre imediatamente** com a cópia
  guardada — cardápio, logo, cores, tudo;
- e os preços/pedidos continuam vindo sempre atualizados (a parte de dados
  **nunca** é guardada).

Resultado: quem já abriu a loja uma vez **não vê mais a tela preta**.

### 2. Quem nunca abriu vê "Abrindo [nome da loja]…"
Em vez da tela preta, aparece uma tela nas **cores da própria loja** com
"🔄 Abrindo Mimo de Linha… Só um instante" — e ela se recarrega sozinha até
entrar. Vale também para o **painel**.

### 3. O servidor não dorme mais
O próprio sistema acessa o site **a cada 2 minutos** (antes eram 3). O Render só
dorme após 15 minutos sem acesso, então sobram 7x de folga. Conferir em
`/healthz` → `keep_alive`.

### 4. Enquanto alguém está com a loja aberta, o servidor também não dorme
A página faz um "oi" ao servidor a cada 4 minutos.

### 5. Bônus: acabou o vazamento de "Marmitas caseiras"
O texto de exemplo do HTML aparecia por um instante em lojas como a Mimo
("Marmitas caseiras" na MDN/Mimo). Agora o servidor já entrega a frase da
própria loja: Mimo → "Laços e acessórios de crochê"; AGEO → "Doces e
confeitaria artesanal".

## Teste automático (produção)
```
node tests/verifica-abertura-instantanea.js
✓ 1ª visita: loja abriu normal
✓ service worker instalado
✓ página guardada no celular
✓ API do cardápio NÃO é guardada (preço sempre novo)
✓ sem servidor: NÃO aparece a tela do Render
✓ sem servidor: cliente vê a loja (cópia guardada)
✓ celular novo sem servidor: mostra "Abrindo…"
✓ celular novo: sem a tela preta do Render
✓ tela "Abrindo…" com o nome certo da loja
ERROS: 0
```

## O que ainda vai acontecer (e é normal)
- **Logo depois de uma publicação minha**, quem abrir naquele minuto pode ver a
  tela "Abrindo…" (quem já visitou vê a cópia e nem percebe).
- **Primeira visita de um celular novo + servidor dormindo** = tela "Abrindo…"
  por ~30 s, depois entra sozinha.

## Se quiser blindagem extra (opcional, grátis, sem cartão)
Cadastre o endereço `https://loja-digital.onrender.com/healthz` num monitor
gratuito (cron-job.org ou UptimeRobot, a cada 5 min). Aí o servidor é acordado
**de fora**, mesmo que o Render reinicie a instância por conta própria.
