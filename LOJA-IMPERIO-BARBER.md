# Império Barber — loja de agendamento com equipe

## Endereços
- Cliente agenda: **https://loja-digital.onrender.com/l/imperio-barber**
- Painel do dono: **https://loja-digital.onrender.com/l/imperio-barber/admin** (senha `imperio2026`)
- WhatsApp da loja: **48 8826-4675**

## O que essa loja tem de diferente

### 1. Dois barbeiros, cada um com a própria agenda
- O cliente vê os cards dos barbeiros (foto + nome), escolhe um e o horário.
- **Um horário ocupado por um barbeiro não bloqueia o outro.**
- Se alguém tentar o mesmo barbeiro no mesmo horário, o sistema recusa e já
  oferece quem está livre.
- Cada barbeiro atende **1 cliente por período** (Manhã / Tarde / Noite).

### 2. Painel → aba **Equipe**
- `+ Novo barbeiro`: nome, apelido, frase curta e **foto** (upload pelo celular).
- Botões: Editar · Foto · Ativar/Desativar.
- **Nada é apagado**: barbeiro que já atendeu alguém é só desativado, o
  histórico continua no painel.

### 3. Cruzamento de dados (no painel, aba Equipe)
Por barbeiro: **hoje**, **últimos 7 dias** e **este mês** — quantidade de
agendamentos e valor.
> É a base do "quem atende e quanto rende". Comparativo lado a lado dos dois
> barbeiros fica na mesma aba.

### 4. Pagamento
O cliente vê as formas aceitas pela loja (as do painel de Pagamentos):
Pix · Dinheiro na hora · Cartão na hora.
O **cartão online** só aparece quando a loja tiver a conta de pagamento
(Mercado Pago) ligada — o guia de ativação é o mesmo das outras lojas
(`/guias/imperio-barber-como-receber.pdf` quando gerado).

### 5. Sem campos de ar-condicionado
Loja de barbearia não pede endereço nem dados do aparelho: o atendimento é na
barbearia. (Esses campos continuam existindo na loja de climatização.)

## Como mexer depois (tudo pelo painel)
| Quero | Onde |
|---|---|
| Trocar foto/nome do barbeiro | Painel → Equipe → ✏️ Editar / 📷 Foto |
| Mudar preço ou serviço | Painel → Serviços |
| Dias e horários de funcionamento | Painel → Agenda |
| Nome, logo, cor, WhatsApp, endereço | Painel → Engrenagem → Dados da empresa |
| Senha | Painel → Dados da empresa → Senha do painel |

## Serviços cadastrados (todos os dos prints, com foto)
| Serviço | Preço | Duração |
|---|---|---|
| Cortes tradicional | R$ 49,90 | 30 min |
| Barba | R$ 34,90 | 30 min |
| Barbaterapia | R$ 49,90 | 45 min |
| Sobrancelha | R$ 14,90 | 15 min |
| Esfoliação | R$ 29,90 | 15 min |
| Remoção de pelos (cera) | R$ 24,90 | 15 min |
| Acabamento | R$ 19,90 | 15 min |
| Luzes platinada | R$ 99,90 | 1h30 |
| Sobrancelha na navalha | R$ 34,90 | 20 min |
| Corte - 1 pente | R$ 25,00 | 30 min |
| **Cabelo + barba (combo)** — etiqueta COMBO | R$ 99,90 | 1h |
| Corte kids | R$ 45,00 | 30 min |
| **Cabelo + sobrancelha (combo)** — etiqueta COMBO | R$ 64,90 | 45 min |

## Promoções e combos (pelo painel)
Painel → **Serviços** → Editar serviço. Dois campos novos:
- **Promoção / combo (etiqueta)** — aparece em cima da foto do serviço (ex.: `COMBO`, `-20%`, `Só esta semana`)
- **Preço antigo (de)** — com este campo preenchido, o card mostra o preço velho riscado e o novo preço.

Também dá para subir **foto do serviço** ali mesmo, trocar preço e duração.

## Nada disso toca nas outras lojas
Tudo o que foi feito é **ligado por loja**:
- A tabela de equipe e a coluna do barbeiro são novas e só a Império usa.
- Loja que não tem equipe cadastrada continua **exatamente** como era:
  na Henrique Borges, a agenda por período segue igual, e "Aparelhos" continua lá.
- Os textos de ar-condicionado só são escondidos na loja com perfil `barbearia`.
- Prática Sabores, MDN, Mimo e AGEO (cardápios) não foram tocados.

## Teste automático (produção)
```
node tests/verifica-imperio-barber.js
✓ 2 barbeiros na tela
✓ não pede endereço / não pede equipamento de ar
✓ barbeiro escolhido marcado e mostrado no formulário
✓ agendamento criado
✓ mesmo barbeiro no mesmo horário é bloqueado (409)
✓ oferece o outro barbeiro livre
✓ agenda do barbeiro 1 ocupada / barbeiro 2 livre
✓ sem escolher barbeiro é recusado
ERROS: 0
```

## Material pronto (já entregue)
| Item | Onde |
|---|---|
| Guia "como receber" em PDF (2 págs) | `/guias/imperio-barber-como-receber.pdf` (200 OK no ar) |
| Cartão de compartilhamento (WhatsApp, Instagram, Facebook) | `/l/imperio-barber/og-card.png` — 1200×630, fundo preto, filete dourado, "AGENDAMENTO ONLINE" |
| Contrato no Master | token `Pls_fVyxX71n` → `https://loja-digital.onrender.com/contrato/Pls_fVyxX71n` (R$ 100 implantação + R$ 40/mês, venc. dia 10) |
| Botão "Compartilhar" no painel | Painel → Engrenagem → Seu link (WhatsApp · Instagram · Facebook · Mais) |

Na tela do **Master** a loja já aparece como: `serviços · 2 serviços · 0 agendamentos · agenda em dia`,
com o botão "Mandar link de agendamento" (não fala cardápio, porque é loja de serviço).

## Estilo do link (igual ao print de referência)
- Card do barbeiro: **foto grande + nome embaixo + "🕐 Próxima vaga: Hoje · Manhã" + VER AGENDA**
- Ao escolher, a agenda abre como **"Agenda de [barbeiro] neste dia:"**
- **Barra flutuante** no rodapé: 📅 Agendar · 👤 Barbeiros · ✂️ Serviços
- Texto de convite no Master: *"Olá! Para agendar um horário é só clicar no link abaixo 👇 ..."*
- Painel: aba **Agenda** com seletor **"Ver a agenda de"** (todos ou um barbeiro) e o
  barbeiro aparece em cada agendamento (👤).

## O que ainda falta você me mandar
1. **Foto e nome dos dois barbeiros** (hoje estão "Barbeiro 1" e "Barbeiro 2").
2. **Logo da Império Barber** (hoje aparece a inicial "I" num quadro dourado).
3. **Endereço da barbearia** e o horário exato (hoje: Seg–Sáb, Manhã/Tarde/Noite).
4. **Lista completa de serviços** com preço e duração.

## Agenda por horário (calculada sozinha)
- No painel → **Agenda → Ajustar**: horário que a loja abre, horário que fecha e de quanto em
  quanto tempo aparece um horário novo (hoje: 09:00–19:00, a cada 30 min).
- Cada horário reserva o **tempo do serviço escolhido** (corte de 30 min ocupa 30 min).
  Ex.: cliente marcou 09:30 com 30 min → o próximo horário livre é 10:00.
- Horário com cliente fica **vermelho com o nome** e ninguém consegue selecionar (o servidor
  também recusa, mesmo por fora da tela).
- **Grade do dia** (painel → Agenda): todos os horários do dia, com o nome completo de quem
  já agendou em cada um.
- No site, o seletor de dias mostra **data + dia da semana**, com selo **Esgotado** nos dias
  lotados, setas para rolar, e o aviso "Sem horários disponíveis" quando o dia enche.

## Promoções e combos (painel → 🎯 Promoções)
- Monta a campanha que quiser: nome, etiqueta na foto, % de desconto, serviços que entram,
  data de início/fim e liga/desliga.
- Atalhos prontos: **Black Friday −20%**, **Combo do mês −15%**, **Terça do corte −10%**.
- No site: faixa da campanha em cima dos serviços, etiqueta na foto e preço antigo riscado
  com o novo valor.
- Combo individual (um serviço só) continua em **Serviços → Editar** (etiqueta + preço antigo).

## Foto dos barbeiros
Painel → **Equipe** → botão **📷 Colocar foto** (ou **Trocar foto**) → *Tirar foto* (câmera do
celular) ou *Da galeria*. A foto troca na hora no link de agendamento.

## Prévia do link no WhatsApp / Instagram
O cartão de compartilhamento mostra o **logotipo redondo** com moldura dourada e o texto
"**AGENDE SEU HORÁRIO — Império Barber**". O endereço da plataforma não aparece na imagem.

## Painel do Império (tema escuro + dourado)
Abre em `/l/imperio-barber/admin`. É o mesmo painel para todas as lojas, mas esta loja entra no
**tema Império** (fundo preto, dourado, logo redondo no topo) e com o menu enxuto:

| Aba | Para quê |
|---|---|
| 🏠 **Hoje** | 4 números grandes (clientes hoje · esperando você · faturamento hoje · no mês), **grade de horários de hoje** (livre / já agendado com o nome / já passou), agendamentos solicitados e próximos 7 dias |
| 📅 **Agenda** | grade do dia (todos os horários com o nome de quem agendou), filtro por barbeiro, vagas, remarcar |
| 👥 **Clientes** | busca, cadastro e ficha do cliente |
| 👤 **Equipe** | barbeiros, foto (câmera ou galeria) e link |
| 🛠️ **Serviços** | foto, preço, duração, promoção/combo e preço antigo |
| 🎯 **Promoções** | campanhas (Black Friday etc.), resumo do que está ligado e atalhos |
| ⚙️ (engrenagem) | **Loja**: logo, nome, chamada do topo, WhatsApp, Instagram, sobre, senha, formas de pagamento/Pix e o link para enviar |

O que **não** existe aqui (é de ar-condicionado): aba Aparelhos, alerta de limpeza de ar e
campos de equipamento.

## Guia para o dono da barbearia
`guias/imperio-barber-como-usar-o-painel.pdf` — 8 páginas com print de cada tela (link, Hoje,
Agenda/grade, definir horário, Promoções, Loja/pagamentos e a prévia do link no WhatsApp).
É o arquivo para mandar junto com o link e a senha.

## Teste automático
`node tests/verifica-imperio-v2.js` — 25 conferências (site + painel). Hoje: **TUDO OK**.
