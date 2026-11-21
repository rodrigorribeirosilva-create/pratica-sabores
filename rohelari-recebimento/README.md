# ROHELARI RECEBIMENTO

**Sistema Inteligente de Agendamento de Recebimento para Redes de Supermercados.**
Agenda de docas por loja, controle de chegada/conferência e trilha completa de
recebimento — multiempresa (rede), multiloja, com perfis de acesso aplicados no
backend (não apenas na interface).

> Ambiente de **demonstração** incluso (dados fictícios). Produção usa
> **PostgreSQL real** via `DATABASE_URL`. Em desenvolvimento, o app embute o
> engine PostgreSQL (PGlite) persistido em `data/pgdata`.

## Requisitos

- Node.js >= 18 (recomendado 20+)
- npm

## Início rápido (demo)

```bash
npm install
SEED_DEMO=true npm run seed:demo   # cria a rede de demonstração (idempotente)
npm start                          # http://0.0.0.0:3100
```

Credenciais **da demo** (senha `demo12345` — veja `src/seed-demo.js`):

| Perfil | E-mail | Visão |
|---|---|---|
| Administrador da rede | `rede@demo.rohelari.com.br` | Todas as lojas |
| Gerente da loja | `gerente.centro@demo.rohelari.com.br` | Loja Centro |
| Equipe de recebimento | `recebimento.centro@demo.rohelari.com.br` | Loja Centro |
| Fornecedor / transportadora | `fornecedor@demo.rohelari.com.br` | Próprios agendamentos |

Código de convite para cadastro externo de fornecedores na demo: `DEMO-ROHELARI`.

## Produção (PostgreSQL)

```bash
export DATABASE_URL="postgres://usuario:senha@host:5432/rohelari_recebimento"
export PGSSL=false            # se o provedor exigir SSL com CA própria, ajuste
npm start                     # aplica o schema automaticamente no boot (idempotente)
```

Variáveis de ambiente:

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3100` | Porta HTTP |
| `DATABASE_URL` | — | DSN PostgreSQL. Sem ela, usa PGlite em `DATA_DIR` |
| `PGSSL` | `true` | `false` desliga SSL no pool `pg` |
| `DATA_DIR` | `./data` | Onde o PGlite persiste (dev) |
| `UPLOAD_DIR` | `./data/uploads` | Anexos de conferência |
| `SEED_DEMO` | — | `true` só para semear a demo |
| `NOTIFY_WEBHOOK_URL` | — | Webhook opcional p/ integrações de notificação |

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor |
| `npm test` | Testes unitários + integração ponta-a-ponta da API (PGlite descartável) |
| `npm run smoke:ui` | Smoke da UI em jsdom: faz login real e percorre todas as views procurando erros de runtime (requer demo rodando) |
| `npm run migrate` | Aplica o schema manualmente |
| `npm run seed:demo` | Semeia dados de demonstração (**não** usar em produção) |
| `npm run bootstrap` | Bootstrap inicial de rede (ver `scripts/bootstrap-network.js`) |

## Arquitetura e fases

F1 Fundação (schema, auth, multiempresa/multiloja) → F2 Cadastros (lojas,
usuários, fornecedores, transportadoras, docas, capacidade por faixa, bloqueios) →
F3 Agenda de 30 minutos + disponibilidade + agendamentos → F4 Dashboard +
indicadores + painel do fornecedor → F5 Chegada/fila/docas/conferência →
F6 Relatórios (CSV/PDF), notificações, auditoria → F7 Preparação Sysmo S1
(**somente estrutura**: campos NF-e/integração + fila `integration_outbox`;
nada é enviado — sem endpoints inventados — enquanto não houver documentação e
autorização oficial do Sysmo).

Decisões relevantes:

- **Permissões no backend** em todas as rotas (RBAC por rede/loja/papel).
- **Isolamento por rede e loja**: usuários de uma loja não veem dados de outra
  sem autorização; fornecedores veem apenas os próprios agendamentos e dados
  públicos das lojas.
- **Sem baixa automática de estoque** na v1.
- **Capacidade por faixa horária** configurável por unidade e por intervalo
  (não assume 1 entrega = 1 doca), com lock consultivo anti-overbooking.
- **Status**: solicitado → confirmado → chegada_registrada → aguardando_doca →
  em_recebimento → concluido/parcial (+ recusado, cancelado, atrasado,
  nao_compareceu), com histórico automático (quem, quando, o quê).
- **LGPD/segurança**: senhas com scrypt, cookie httpOnly + token SHA-256,
  rate limit de login, validação de CNPJ/CPF/placa com dígitos verificadores,
  trilha de auditoria, headers de segurança (CSP, X-Frame-Options…).

## Estrutura

```
db/schema.sql          DDL completo (constraints, índices, FKs)
src/db.js              Camada de dados (pg ⇄ PGlite)
src/auth.js            Sessões, RBAC, hashing scrypt, rate limit
src/routes/            auth · cadastros (F2) · appointments (F3/F5) · insights (F4/F6/F7) · files
src/seed-demo.js       Dados de demonstração (idempotente, só com SEED_DEMO=true)
public/                SPA vanilla (login + app), mobile-first
scripts/smoke-ui.js    Smoke de UI em jsdom
tests/                 Testes (node:test)
```

## Limitações conhecidas (v1)

- Sysmo S1 **não** integrado (bloqueado até documentação/autorização oficial).
- Notificações por e-mail/WhatsApp preparadas (`notifications` + webhook
  opcional), envio efetivo pendente de provedor configurado.
- Anexos de conferência: upload local com política de acesso por rede/loja;
  sem antivírus embutido.
