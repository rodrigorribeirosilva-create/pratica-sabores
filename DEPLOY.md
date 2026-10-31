# 🌍 Como publicar o Prática Sabores na internet

O objetivo final é ter um link assim para mandar no WhatsApp:

```
https://cardapio.praticasabores.com.br
```

Abaixo, três caminhos. **Recomendado para começar: Opção A (Render)** — leva ~10 minutos e não
exige saber nada de servidor. Leia o aviso sobre disco persistente nessa opção antes de publicar.

---

## Antes de publicar: 2 ajustes obrigatórios

### 1. Coloque seu WhatsApp de verdade
Painel → **Configurações › Dados do negócio › WhatsApp que recebe os pedidos**.
Digite com DDD (ex.: `48 98888-7777`). O sistema converte para `5548988887777` automaticamente.
Enquanto estiver o número de exemplo (`5548999999999`), os pedidos vão para um número inexistente.

### 2. Troque a senha do painel
Painel → **Configurações › Segurança** → senha atual `pratica123` → nova senha.
(Se preferir definir a senha inicial antes do primeiro acesso, use a variável
`ADMIN_PASSWORD` no deploy.)

---

## Opção A — Render.com (mais fácil) 💙

Atenção (verificado em out/2026): **instâncias free do Render não aceitam disco persistente** — o
sistema de arquivos é apagado a cada deploy, reinício ou "spin-down" (que ocorre após 15 min sem
visitas). Na prática, no plano free o SQLite e as fotos são zerados. Duas saídas:

- **A1 (recomendado para vender):** usar uma instância paga — **US$ 7/mês** (0.5 CPU / 512 MB) — e
  anexar um **disco de 1 GB** por **US$ 0,25/mês**. Total ~US$ 7,25/mês (~R$ 40). Sem spin-down.
- **A2 (grátis, só para testar):** plano free, ciente de que os dados são temporários.
  Limites do free: 750 horas/mês por workspace, 1 instância, spin-down após 15 min de inatividade
  (a primeira visita depois disso demora ~1 min).

### Passo a passo

1. Crie uma conta em <https://render.com> (pode entrar com GitHub).
2. Suba o projeto para um repositório no GitHub:
   ```bash
   cd pratica-sabores
   git init && git add . && git commit -m "cardápio digital"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/pratica-sabores.git
   git push -u origin main
   ```
   (O arquivo `.gitignore` já impede o envio de `node_modules`, `data/` e `uploads/`.)
3. No Render: **New ▸ Web Service** → conecte o repositório.
4. Preencha:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (teste) ou **0.5 CPU / 512 MB** (US$ 7/mês — o antigo "Starter", renomeado em ago/2026)
5. **Environment Variables** (opcional, mas recomendado):
   | Chave | Valor |
   |-------|-------|
   | `ADMIN_PASSWORD` | uma senha forte (só vale no primeiro boot) |
   | `NODE_ENV` | `production` |
6. **Advanced ▸ Disks** (somente na Opção A1): adicione um disco com **Mount Path** `/var/data`
   (1 GB é mais que suficiente) e duas variáveis apontando o banco e as fotos para ele:
   | Chave | Valor |
   |-------|-------|
   | `DATA_DIR` | `/var/data` |
   | `UPLOAD_DIR` | `/var/data/uploads` |
7. **Create Web Service**. Em ~2 minutos o Render te dá uma URL tipo
   `https://loja-digital.onrender.com`.
8. Abra `/admin`, faça login, troque a senha e cadastre o WhatsApp. Pronto: esse é o link para o WhatsApp.

> No plano free o serviço "dorme" após 15 min sem acesso e a primeira visita demora ~1 minuto
> para carregar. No plano pago isso não acontece.
> Atalho: o projeto já inclui `render.yaml` — em **New ▸ Blueprint** o Render lê esse arquivo e
> configura plano, disco e variáveis sozinho.

---

## Opção B — Fly.io (volume persistente, bom custo)

```bash
npm install -g flyctl
fly auth signup
cd pratica-sabores
fly launch --no-deploy          # aceite o Dockerfile já incluído no projeto
fly volumes create dados --size 1
```

Edite o `fly.toml` gerado para montar o volume:

```toml
[mounts]
  source = "dados"
  destination = "/app/data"
```

Defina a senha inicial e publique:

```bash
fly secrets set ADMIN_PASSWORD="SuaSenhaForte" DATA_DIR=/app/data UPLOAD_DIR=/app/uploads
fly deploy
```

Link final: `https://SEU-APP.fly.dev`. Domínio próprio: `fly certs add cardapio.seudominio.com.br`.

---

## Opção C — VPS gratuita para sempre (Oracle Cloud Always Free)

Melhor combinação de "grátis + dados permanentes", porém exige uns 20 minutos de configuração:

1. Crie uma conta em <https://www.oracle.com/cloud/free> e uma instância **Always Free**
   (Ubuntu 22.04, 1 GB RAM é suficiente).
2. Acesse por SSH e instale Node:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git
   sudo npm i -g pm2
   ```
3. Envie o projeto (git clone) e rode:
   ```bash
   cd pratica-sabores && npm install
   ADMIN_PASSWORD="SuaSenhaForte" pm2 start server.js --name cardapio
   pm2 startup && pm2 save
   ```
4. Libere a porta 80/443 no *Security List* da Oracle e coloque o Nginx na frente:
   ```bash
   sudo apt-get install -y nginx
   sudo tee /etc/nginx/sites-available/cardapio >/dev/null <<'EOF'
   server {
     listen 80;
     server_name cardapio.seudominio.com.br;
     client_max_body_size 10M;
     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
     }
   }
   EOF
   sudo ln -s /etc/nginx/sites-available/cardapio /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d cardapio.seudominio.com.br   # HTTPS grátis
   ```

---

## 🔗 Domínio próprio (opcional, ~R$ 40/ano)

1. Compre o domínio no [Registro.br](https://registro.br) (ex.: `praticasabores.com.br`).
2. No provedor de hospedagem, adicione o domínio customizado (`cardapio.praticasabores.com.br`).
3. No Registro.br, crie o apontamento que o provedor indicar:
   - Render: um registro **CNAME** `cardapio` → `loja-digital.onrender.com`
   - Fly.io: **CNAME** `cardapio` → `SEU-APP.fly.dev`
   - VPS: **A** `cardapio` → IP da máquina
4. Aguarde a propagação (minutos até algumas horas). O HTTPS é emitido automaticamente
   (Render/Fly) ou via Certbot (VPS).

> Sem domínio próprio o sistema funciona igual, só que o link fica menos bonito
> (`loja-digital.onrender.com`). Você pode começar assim e migrar depois.

---

## 📱 Depois de publicado: checklist de 5 minutos

- [ ] Login em `/admin` com senha nova
- [ ] WhatsApp correto em Configurações
- [ ] Taxa de entrega e períodos de entrega do seu bairro/horário
- [ ] Formas de pagamento + chave Pix nas instruções
- [ ] Produtos reais com fotos (fotos tiradas com o celular funcionam bem: luz natural, fundo limpo)
- [ ] Pedido de teste: adicionar item → finalizar → conferir a mensagem que chega no WhatsApp
- [ ] Copiar o link em **Configurações › Seu link do cardápio** e salvar nos contatos/status
- [ ] Baixar o QR Code e colar na embalagem/troféu do balcão

---

## 🆘 Problemas comuns

| Sintoma | Causa / solução |
|---------|-----------------|
| "Sessão expirada" ao salvar | O cookie expira em 12h. Faça login novamente. |
| Produtos voltaram ao padrão depois do deploy | Disco temporário (ver Opção A1) — `DATA_DIR` precisa apontar para o disco persistente. |
| Fotos somem após deploy | Mesmo motivo: configure `UPLOAD_DIR` no disco persistente. |
| Pedido abre o WhatsApp mas o número está errado | Configurações › WhatsApp: precisa ter DDD e ser o número que usa WhatsApp. |
| Cliente diz que não abre o WhatsApp | Alguns navegadores bloqueiam pop-up; a tela de sucesso tem o botão "Enviar no WhatsApp". |
| Upload recusado | Imagem acima de 5 MB ou formato não suportado — use JPG/PNG/WEBP. |

---

# 🛡️ "Nunca sair do ar" — o que é possível de verdade

Nenhum site do mundo fica 100% no ar (até grandes serviços caem). Mas dá para eliminar as causas
que derrubam este projeto. Hoje, no plano **free** do Render, o site:

1. **Hiberna após 15 min sem visitas** → a primeira visita depois disso demora ~1 min
2. **Perde os dados a cada reinício** (sem disco persistente)
3. Pode ser **suspenso** se o workspace estourar as 750 horas/mês

## Opção 1 — Plano pago + disco (recomendado, ~US$ 7,25/mês)

1. Render → seu serviço → **Settings** → **Instance Type** → `0.5 CPU / 512 MB`
2. **Disks** → **Add Disk**: `/var/data`, 1 GB
3. **Environment**: `DATA_DIR=/var/data` e `UPLOAD_DIR=/var/data/uploads`
4. **Manual Deploy**

Resultado: **não hiberna, não perde dados, não tem limite de horas.** É a única opção que resolve tudo.

## Opção 2 — Grátis: manter acordado com ping externo

1. Crie conta grátis em <https://uptimerobot.com> (ou cron-job.org)
2. **New Monitor** → tipo **HTTP(s)** → URL `https://SEU-SITE.onrender.com/healthz`
3. Intervalo: **5 minutos**
4. Salve

Isso evita a hibernação (o monitor gera tráfego constante). **Não** resolve a perda de dados:
faça **backup** pelo painel (Configurações › Segurança › Baixar backup) de vez em quando.

> **Atenção:** o keep-alive *interno* (`KEEP_ALIVE_URL`) **não resolve sozinho** — quando o Render
> hiberna, ele mata o processo, então não há ninguém para pingar. Só um monitor **externo**
> (UptimeRobot, cron-job.org, BetterStack) mantém o serviço acordado. A variável interna serve
> apenas para registrar atividade enquanto o app já está de pé.

> Atenção: manter acordado consome as 750 h/mês do workspace — um serviço sempre ligado gasta
> ~744 h, ou seja, fica no limite. Um segundo serviço free no mesmo workspace pode ser suspenso.

## Opção 3 — Grátis para sempre: VPS Oracle Cloud Always Free

Servidor próprio na nuvem, sempre ligado, com disco permanente (seção "Opção C" acima).
É a melhor combinação grátis + permanente, com ~40 min de configuração inicial.

## Opção 4 — Rodar em casa (celular velho ou PC)

Um celular Android velho ou mini PC + `node server.js` + **Cloudflare Tunnel** (grátis) expõe o site
com HTTPS. Depende da sua internet e energia elétrica — se cair a luz, o site cai junto.

## Resumo

| Opção | Custo | Hiberna? | Dados persistem? | Esforço |
|-------|-------|----------|------------------|---------|
| Render free | R$ 0 | Sim (15 min) | Não | pronto |
| Render free + UptimeRobot | R$ 0 | Não | Não (use backup) | 5 min |
| **Render pago + disco** | ~R$ 40/mês | **Não** | **Sim** | 5 min |
| Oracle Always Free | R$ 0 | Não | Sim | ~40 min |
