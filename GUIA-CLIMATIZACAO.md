# Painel de Climatização — Henrique Borges

Sistema de agenda de serviços (ar condicionado) dentro da mesma base multi-loja.
Terceiro modelo, ao lado de **cardápio** (Prática Sabores) e **catálogo** (MDN Presents).

## Links

| O quê | Endereço |
|---|---|
| Página para o cliente agendar | https://loja-digital.onrender.com/l/henrique-borges |
| Painel da empresa | https://loja-digital.onrender.com/l/henrique-borges/admin |
| Senha inicial do painel | `henrique2026` |
| Contrato de mensalidade | https://loja-digital.onrender.com/contrato/2mAGUSrFPlgB |
| Master (você) | https://loja-digital.onrender.com/master |

## Como funciona o fluxo

1. **Cliente** abre o link, vê os serviços com valores e escolhe serviço, aparelho, **melhor dia** e período.
2. Ao enviar, o pedido **entra no painel como "Solicitado"** e o cliente recebe um botão para confirmar no WhatsApp da empresa.
3. **A empresa** abre o painel: vê "Pedidos novos do site", toca em **Confirmar dia** → vira **Agendado**.
4. No dia: **A caminho** → **Concluído**.
5. Ao concluir, o painel **calcula sozinho a próxima limpeza/manutenção** do aparelho (padrão: 180 dias).
6. Quando a data chega, o aparelho aparece em **"Ar precisando de limpeza/manutenção"** com o botão **Avisar cliente** (WhatsApp já escrito).

## O que tem no painel

- **Hoje** — alerta do que precisa de atenção, agenda do dia, próximos 7 dias, aparelhos vencendo, atrasados, e o botão 💬 que manda o **resumo do dia** no WhatsApp.
- **Agenda** — todos os agendamentos por status (solicitados, agendados, concluídos…).
- **Clientes** — ficha com nome, WhatsApp, endereço e aparelhos; botão para agendar direto.
- **Aparelhos** — split/cassete/janela, marca, BTUs, ambiente, última limpeza, próxima limpeza, próxima manutenção e intervalo (dias).
- **Serviços** — catálogo com preço (fixo, "a partir de" ou "sob orçamento"), duração e ordem.
- **Empresa (⚙️)** — nome, subtítulo, slogan, WhatsApp, Instagram, sobre, logotipo, troca de senha e o link para enviar aos clientes.

## Serviços que já vêm cadastrados

| Serviço | Valor |
|---|---|
| Instalação de ar condicionado | a partir de R$ 350,00 |
| Limpeza / higienização | a partir de R$ 150,00 |
| Manutenção preventiva | a partir de R$ 180,00 |
| Recarga de gás / vazamento | sob orçamento |
| Desinstalação / remoção | a partir de R$ 200,00 |
| Orçamento para outros serviços | sob orçamento |

## Onde ficam os dados

Tabelas novas no SQLite (e no backup do Supabase): `servicos`, `clientes`, `equipamentos`, `agendamentos`.
Fotos: `public/img/hb-logo.jpg` (o logotipo enviado) — pode ser trocado pelo próprio painel.

## Como criar outra empresa de serviços

No `/master` → **Nova loja** → em "O que essa loja vende?" escolher **Serviços — climatização, assistência técnica, agenda**.
A loja já nasce com os serviços de exemplo, o painel de agenda e a página de agendamento.
