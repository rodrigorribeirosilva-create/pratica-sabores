# Por que às vezes aparece "CARREGANDO APLICATIVO"

Aquela tela preta com o logo do **Render** não é o nosso site: é o Render
**ligando o servidor**. Acontece em dois momentos:

1. **Depois de cada publicação** (todo deploy reinicia o servidor) → ~30 a 40 segundos.
2. **Depois de ~15 minutos sem ninguém acessar** (o plano gratuito "dorme") → a
   primeira visita do dia espera o servidor acordar.

## O que já está feito para minimizar
- **Keep-alive interno**: o próprio app bate no seu endereço (`/healthz`) a cada
  **3 minutos** (e, se uma batida falhar, tenta de novo em 45 segundos). Cada batida conta como acesso e o relógio do sono zera — então o
  servidor não deveria mais dormir.
  Para conferir: abra `https://loja-digital.onrender.com/healthz` e veja
  `"keep_alive": { "ativo": true, "minutos": 5, "ultimo_em": "...", "ultimo_status": 200 }`.
- **Um deploy por publicação**: o Render já publica sozinho quando o código chega
  no GitHub. Antes a gente publicava duas vezes (push + pedido manual), o que
  reiniciava o servidor duas vezes seguidas — daí a tela aparecer várias vezes
  seguidas. Agora é só `bash scripts/publicar.sh` (um deploy só).
- **Aviso no rodapé do master**: se o servidor acabou de subir, o painel abre normal
  assim que o boot termina — nada de erro.

## Se quiser zero espera
Só existe um jeito de eliminar de vez: trocar o plano do Render de **Free** para
**Starter** (US$ 7/mês ≈ R$ 38). O servidor fica sempre ligado, sem dormir e sem
tela de carregamento em deploy (o Render sobe a nova versão antes de derrubar a antiga).

Enquanto ficar no Free, a regra é: **evite publicar em horário de pico** (almoço e
jantar) — a publicação derruba o site por ~40 segundos.

## Como conferir em 2 segundos
- **Página pública:** https://loja-digital.onrender.com/status — mostra há quanto tempo o
  servidor está no ar, se o backup está ativo, se o anti-sono está ligado e o último backup.
- **Técnico:** https://loja-digital.onrender.com/healthz — JSON com `uptime`,
  `keep_alive.historico` (últimas 8 batidas) e o estado do backup.
- **No /master:** a faixa verde no topo da aba **Lojas** já diz *"Servidor no ar há 2h 14min ·
  anti-sono ligado (3 min) · backup na nuvem OK"*. Se algo estiver errado, a faixa fica amarela.

## Teste que já foi feito
Em 01/11/2026 ficamos **17 minutos sem nenhum acesso externo** (o Render dorme com 15) e o
`uptime` continuou subindo (474s → 1494s), ou seja: **não dormiu**. Todos os links das 5 lojas
e todos os painéis respondendo em ~0,1s.

## Links: nunca são trocados, só somados
`https://loja-digital.onrender.com/l/<loja>` é permanente. Endereço novo (domínio próprio)
entra **junto**, sem desligar o antigo. Regra detalhada em `DOMINIO-PROPRIO.md`.
Confira com `node tests/verificar-links.js` (5 lojas, 5 painéis, 5 atalhos, master e status).
