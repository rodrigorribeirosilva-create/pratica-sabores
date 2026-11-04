# Endereço próprio para cada loja (sem risco para os links atuais)

## Regra de ouro
**O link atual nunca é apagado.** `https://loja-digital.onrender.com/l/pratica-sabores` continua
funcionando para sempre, mesmo depois de existir um endereço novo. O que a gente faz é
**somar** um endereço, nunca trocar.

## O que NÃO dá para fazer (por isso não faço)
Renomear o serviço no Render troca o endereço `loja-digital.onrender.com` — e aí todo link já
impresso, mandado no WhatsApp ou salvo no celular do cliente para de funcionar. **Isso tem risco,
então não foi feito.**

## O que dá (risco zero)
Comprar um domínio (ex.: `praticasabores.com.br`) e apontar para o mesmo servidor. Aí:

| Endereço | Situação |
|---|---|
| `loja-digital.onrender.com/l/pratica-sabores` | continua funcionando (nunca sai) |
| `/pratica` (atalho curto) | continua funcionando |
| `pratica.praticasabores.com.br` | novo, bonito, com HTTPS grátis |

Os dois caminhos entregam exatamente a mesma loja.

## Passo a passo (quando você comprar o domínio)
1. **Comprar**: registro.br (`.com.br`, ~R$ 40/ano) ou Cloudflare/Namecheap (`.com`, ~US$ 12/ano).
2. **Criar o subdomínio** no painel do domínio (DNS):
   - tipo `CNAME`
   - nome `ageo` (para `ageo.praticasabores.com.br`)
   - valor `loja-digital.onrender.com`
3. **No Render**: serviço → *Settings* → *Custom Domains* → *Add Custom Domain* → digite
   `ageo.praticasabores.com.br`. O certificado HTTPS sai sozinho em minutos.
4. **Avisar o sistema** (para ele entregar a loja certa na raiz do domínio):
   ```
   PATCH /api/master/stores/<id_da_loja>/dominio
   { "dominio": "ageo.praticasabores.com.br" }
   ```
   O agente pode fazer isso pelo painel master em 1 minuto.
5. **Conferir**: abrir `https://ageo.praticasabores.com.br` → tem que cair no catálogo da AGEO,
   e `.../admin` no painel dela. Os links antigos seguem funcionando (testar com
   `node tests/verificar-links.js`).

## Enquanto não existe domínio próprio
Use os atalhos curtos, que já estão no ar e são mais fáceis de ditar:

- `loja-digital.onrender.com/ageo`
- `loja-digital.onrender.com/mimo`
- `loja-digital.onrender.com/mdn`
- `loja-digital.onrender.com/pratica`
- `loja-digital.onrender.com/henrique`

Cada um abre a loja da marca; o endereço `/l/...` continua valendo.

## Vigia de links
`node tests/verificar-links.js` confere as 5 lojas, os 5 painéis, os 5 atalhos, o master e o
status. Se algum parar de funcionar, o teste acusa na hora.
