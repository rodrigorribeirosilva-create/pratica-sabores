# 🟢 Comece aqui — Prática Sabores & MDN Presents

Atualizado em 30/10/2026.

---

## Endereços (guarde estes)

| O que é | Endereço |
|---|---|
| **Cardápio da marmita** (mande para os clientes) | https://loja-digital.onrender.com/l/pratica-sabores |
| **Painel da marmita** (só você) | https://loja-digital.onrender.com/l/pratica-sabores/admin |
| **Catálogo da MDN** (mande para os clientes) | https://loja-digital.onrender.com/l/mdn-presents |
| **Painel da MDN** (só a MDN) | https://loja-digital.onrender.com/l/mdn-presents/admin |
| **Painel master** (todas as lojas) | https://loja-digital.onrender.com/master |
| **Verificação técnica** | https://loja-digital.onrender.com/healthz |

Senhas atuais: marmita `pratica123` · MDN `mdn2026` · master `master123`
➡️ **Troque as três.** As duas das lojas podem ser trocadas no próprio painel do cliente (Configurações). A do master, me avise que eu troco.

> O endereço antigo `pratica-sabores.onrender.com` **ainda funciona**: ele encaminha automaticamente para o novo. Pode continuar usando links antigos que já foram enviados.

---

## O dia a dia (2 minutos)

**Adicionar um produto**
1. Entre no painel da loja (link acima).
2. Toque em **+ Novo produto**.
3. Nome, preço, categoria (pode digitar uma nova), foto.
4. **Salvar**. Em até 20 segundos aparece em todos os celulares, sem ninguém recarregar nada.

**Mudar preço** — toque no lápis do produto, troque o preço, salvar.

**Esgotou um item** — desligue a chavinha dele. Ele some do catálogo para os clientes, mas continua cadastrado.

**Não vou atender hoje** — no topo do painel, **Fechar pedidos**. O cliente vê o aviso e não consegue finalizar. Ao voltar, **Abrir pedidos**.

**Ver os pedidos** — aba **Pedidos**. Chega um pedido novo, ele aparece sozinho em até 20s. Toque em **Avisar no WhatsApp** em cada mudança de status (confirmado, preparando, saiu para entrega, entregue).

**Mudar o link para o cliente** — Configurações › **Compartilhar no WhatsApp**. A mensagem sai com o nome da sua loja e o link certo.

**QR Code** — mesma tela de Configurações, botão **Baixar QR Code**.

---

## O que está garantido hoje

- ✅ **Nada se perde:** toda alteração é enviada para a nuvem em ~1,5 segundo. Se a internet falhar, o sistema tenta de novo a cada 30s até conseguir.
- ✅ **Aparece para todos:** o cardápio/catálogo de cada celular se atualiza sozinho a cada 20s.
- ✅ **Sobrevive a reinício:** testado de verdade — mudei preço, reiniciei o servidor, o preço novo continuou lá.
- ✅ **Fotos não somem:** agora ficam guardadas na nuvem, não no servidor.
- ✅ **Lojas separadas:** cardápio e catálogo têm link, painel, senha, pedidos e carrinho próprios. Uma não aparece na outra.
- ✅ **Cada painel com a sua cara:** logo, nome, "Cardápio" na marmita e "Catálogo" na MDN.

---

## Coisas para você resolver (segurança)

1. **Trocar a senha do master** (`master123` é fraca demais).
2. **Trocar as senhas das lojas** no painel de cada uma.
3. **Revogar** a chave da API do Render e o token do GitHub que você me passou — já cumpriram a função, não precisam mais existir.
4. Me dizer se o e-mail `Pamyagathamorais89@gmail.com` é seu ou da cliente.

---

## Limite do plano gratuito

Se ninguém abrir o site por 15 minutos, a primeira visita demora **40 a 60 segundos** para carregar (o servidor "acorda"). **Nenhum dado é perdido** nisso.

Soluções, se incomodar:
- **Grátis:** criar um monitor no UptimeRobot apontando para `https://loja-digital.onrender.com/healthz` a cada 10 minutos — mantém o servidor acordado.
- **US$ 7/mês:** plano Starter no Render — sempre ligado, abre na hora, e ganha disco próprio.

---

## Quando algo parecer errado

Me diga **qual loja + qual tela + o que você esperava ver**. Exemplo: "na MDN, no painel, o produto X não aparece no catálogo".
Antes de reclamar de "sumiu", confira em `https://loja-digital.onrender.com/healthz` — se aparecer `"nuvem":true` e `"falhas":0`, o salvamento está funcionando.
