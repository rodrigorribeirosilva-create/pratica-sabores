# Como a loja aparece no Painel Master (cardápio × catálogo)

Tudo fica em **`/master` › aba Lojas**. Cada loja continua dona das próprias
palavras: o que muda em uma **não** muda nas outras.

## 1. Filtro por tipo (novo)

No topo da aba Lojas aparecem os botões com contagem:

```
Todas as lojas 6   Cardápios 2   Catálogos 2   Agenda de serviços 2
```

- O filtro fica no endereço (`/master?tipo=catalogo`) — recarregar mantém.
- Só aparecem os botões dos tipos que existem hoje; loja desativada continua na lista.
- Filtro sem nenhuma loja mostra o atalho **Ver todas as lojas**.

## 2. Trocar cardápio ↔ catálogo sem sair do Master (novo)

Cada loja de cardápio/catálogo tem a linha **"Aparece como"**:

```
Aparece como  [ cardápio digital ▾ ]   automático
```

- Trocar ali vale **na hora** para o cliente também: título da aba, prévia do
  WhatsApp, seção da vitrine, carrinho e manifest do celular.
- Depois de escolher manualmente aparece a etiqueta como o campo do painel da
  loja (Configurações › Dados do negócio), então cliente e master veem o mesmo.
- Para voltar a seguir o tipo do cadastro: PATCH com `tipo: ""`
  (o seletor mostra a opção marcada e a etiqueta `automático`).
- Loja de **agenda de serviços** não entra nessa escolha (mostra só a etiqueta
  `agenda de serviços`; a API responde 400 se alguém tentar).

## 3. Nova loja já no tipo certo (novo)

No formulário **Nova loja** há o campo opcional
**"Como essa loja aparece para o cliente"**: automático, cardápio digital ou
catálogo digital. Também melhoramos o texto de "O que essa loja vende?" para
dizer que comida vira cardápio e catálogo vira catálogo.

## Onde ficou guardado

| Campo | Onde | Quem usa |
|---|---|---|
| `segment` | tabela `stores` | tipo em que a loja foi criada (food / catalogo / servicos) |
| `business.tipo` | configuração da loja | `cardapio`, `catalogo` ou vazio (automático) |

`segmentoEfetivo()` (em `src/db.js`) continua sendo a única regra: se
`business.tipo` estiver preenchido ele manda, senão vale o `segment`.
Nada novo foi criado no banco — o painel do cliente já grava nesse mesmo campo.

## API usada

```
PATCH /api/master/stores/:id   { "tipo": "catalogo" | "cardapio" | "" }
POST  /api/master/stores       { ..., "tipo": "catalogo" }   (opcional)
GET   /api/master/stores       → cada loja traz tipo, tipo_efetivo, categorias
```

## Teste

```
node tests/verifica-master-tipo-loja.js     → ERROS: 0
```

Sobe um servidor com banco temporário, cria lojas, troca o tipo, confere a
vitrine do cliente e garante que a troca não vaza para as outras lojas.
