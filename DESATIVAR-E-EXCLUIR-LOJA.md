# Desativar e excluir uma loja (Master)

## O que foi feito agora com a Henrique Borges

Loja **desativada**. Efeito imediato:

| Endereço | Antes | Agora |
|---|---|---|
| `/l/henrique-borges` (link do cliente) | página de agendamento | **"Estamos fazendo uma manutenção"** (503) |
| `/l/henrique-borges/admin` (painel) | abria | **fora do ar** (503) |
| `/l/henrique-borges/api/…` | respondia | **fora do ar** (503) |

- O link **continua existindo no Master**, com o selo **"desativada"**.
- **Nada foi apagado**: 10 serviços, 3 agendamentos, cliente, senha e configurações
  continuam guardados. Ao clicar em **Ativar**, volta exatamente como estava.
- As outras lojas (Prática, AGEO, MDN, Mimo) seguem no ar, sem alteração —
  conferido: **ERROS: 0** em `tests/verifica-loja-desativada.js`.

> Importante: o link não é "quebrado" nem apagado. Ele mostra uma página de
> manutenção — se um dia voltar, o mesmo link volta a funcionar.

## Como reativar depois

Master → card da loja → botão **Ativar**.
Ou pela API: `PATCH /api/master/stores/3` com `{"active": true}`.

## Excluir de vez (quando quiser)

Master → card da loja → **Excluir** → digite o endereço `henrique-borges` para confirmar.

A exclusão agora apaga **tudo** que pertence à loja, em ordem segura:

```
orders · products · agendamentos · equipamentos · clientes · servicos
mensalidades · contratos · visitas · eventos · campanhas · store_settings
→ por último a própria loja
```

(antes ficavam sobrando agenda, clientes, aparelhos, contrato e visitas órfãos)
O sistema não deixa excluir a última loja que existe.

## Antes de excluir, se quiser guardar

O backup é automático na nuvem (Supabase), a cada alteração, e as últimas 20 versões
ficam no histórico. Dá para baixar uma cópia antes:
`GET /api/master/backup/historico` → escolher a versão → `POST /api/master/backup/restaurar`.
