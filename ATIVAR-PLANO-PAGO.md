# Ativar o plano que resolve (Render Starter + disco)

**Objetivo:** os dados param de apagar e o site nunca hiberna.
**Custo:** US$ 7,00 (máquina) + US$ 0,25 (disco 1 GB) = **US$ 7,25/mês ≈ R$ 39**
**Tempo:** ~5 minutos. Só você pode fazer — o cartão é da sua conta.

---

## Antes de começar

- [ ] Ter um cartão de crédito internacional (ou débito que aceite cobrança em dólar)
- [ ] Estar logado em https://dashboard.render.com
- [ ] Saber que a primeira cobrança é proporcional aos dias restantes do mês

---

## Passo 1 — Cadastrar o cartão

1. Abra https://dashboard.render.com/billing
2. Clique em **Add payment method** (ou *Add credit card*)
3. Preencha os dados do cartão e confirme

> Sem cartão cadastrado o Render não deixa trocar para o plano pago.

---

## Passo 2 — Trocar a máquina para Starter

1. Abra o serviço **pratica-sabores** em https://dashboard.render.com
2. Menu **Settings** (ou **Instance Type**)
3. Em *Instance Type*, escolha **Starter — 0.5 CPU, 512 MB — US$ 7/mês**
   (não escolha *Free*!)
4. Confirme em **Save changes**

✅ Isso já acaba com a hibernação e com a tela de "carregando aplicativo".

---

## Passo 3 — Adicionar o disco (é o que salva os dados)

1. No mesmo serviço, abra a aba **Disks**
2. Clique em **Add Disk**
3. Preencha **exatamente** assim:

| Campo | Valor |
|---|---|
| Name | `dados` |
| Mount Path | `/var/data` |
| Size | `1` GB |

4. **Save**

> O disco só existe em serviços pagos — por isso o passo 2 vem antes.

---

## Passo 4 — Apontar o app para o disco (variáveis)

Aba **Environment** → **Add Environment Variable** (uma por uma):

| Key | Value |
|---|---|
| `DATA_DIR` | `/var/data` |
| `UPLOAD_DIR` | `/var/data/uploads` |
| `MASTER_PASSWORD` | *(a senha que você quer para o /master)* |
| `ADMIN_PASSWORD` | *(senha inicial da Prática Sabores — pode ser `pratica123`)* |
| `NODE_ENV` | `production` |

**Save changes.**

> As senhas acima só são lidas quando o banco é criado (primeiro boot no disco novo).
> Depois disso, trocar senha é pelo painel.

---

## Passo 5 — Publicar

1. Aba **Manual Deploy** (canto superior direito) → **Deploy latest commit**
2. Espere o status ficar **Live** (2–3 minutos)
3. Abra https://loja-digital.onrender.com/healthz → deve responder `{"ok":true,...}` **na hora**, sem espera

---

## Passo 6 — Conferir que agora salva de verdade

Teste de 2 minutos:

1. Abra https://loja-digital.onrender.com/master → entre com a senha do master
2. Aba **Nova loja** → crie uma loja de teste (ex.: `teste`)
3. Espere **20 minutos sem mexer no site** (antes disso ele apagava)
4. Volte em `/master` → **se a loja "teste" continuar lá, está resolvido**
5. Exclua a loja de teste

---

## Depois de ativado: o que fazer

- [ ] Trocar a senha do master (`/master` → **Segurança**)
- [ ] Recriar a Prática Sabores de verdade: `/master` → **Nova loja** (nome, WhatsApp `554899997023507`, senha da dona)
- [ ] Cadastrar o cardápio real no painel dela: `/l/pratica-sabores/admin`
- [ ] Copiar o link do cardápio no `/master` e enviar no WhatsApp
- [ ] Criar as lojas dos outros clientes (quantas quiser — o valor **não** muda)
- [ ] Depois de tudo pronto: **Baixar backup completo** em `/master` → Segurança

---

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Não deixa adicionar disco | Ainda está no plano Free | Refazer o Passo 2 |
| Deploy falha com "disk" | `DATA_DIR` diferente de `/var/data` | Conferir o Passo 4 |
| Site volta vazio após deploy | Variáveis não salvas | Conferir `DATA_DIR` e refazer o deploy |
| Continua com tela de carregando | Ainda na instância Free | Conferir em Settings › Instance Type |
| Cobrança maior que US$ 7,25 | Mais de uma instância/serviço ligado | Ver *Billing › Invoices* e desligar serviços parados |

---

## O que fica em produção

```
https://loja-digital.onrender.com/master          → SEU painel (todas as lojas)
https://loja-digital.onrender.com/l/<loja>        → cardápio de cada cliente
https://loja-digital.onrender.com/l/<loja>/admin  → painel de cada cliente
```
