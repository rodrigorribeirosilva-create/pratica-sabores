# ROHELARI · suporte das lojas (página de entrada)

`index.html` aqui é a página publicada em **https://rohelari-suporte.vercel.app/** —
o endereço de atendimento que aparece no topo do projeto `rohelari-suporte` no Vercel.

## Por que ela existe

O deploy do `rohelari-suporte` no Vercel tinha apenas `src/index.html` e
`src/lojas.html` — **nada na raiz**. Sem arquivo na raiz, o Vercel responde
`404 NOT_FOUND` ao abrir o domínio principal (era o print de 23/11, 21:32).

Esta página resolve isso: abre na raiz, explica o que é o endereço e leva ao
painel com um botão.

## Como publicar de novo

```bash
# no painel do Vercel: projeto rohelari-suporte → Deploy
# ou pela API/CLI usando este index.html como arquivo raiz
```

O projeto está com `outputDirectory = "."` para servir os arquivos como estão,
sem build.

## Pendências do lado da base (Supabase ROHELARI DIGITAL)

O painel do Master só lista um chamado quando existe a ligação
`suporte_externo_lojas (empresa_id, loja_slug, origem)`. Situação em 24/11:

- 4 lojas que usavam a base não tinham ligação: **Império Barber, Império
  Navalha, Patroas Lanches, Mercado Modelo** — criadas na origem
  `pratica-sabores`;
- o chamado "Hj jbn" estava gravado com a origem `painel-barbearia` (inexistente
  em `suporte_externo_origens`), por isso não aparecia para o Master. Corrigido
  para `origem = pratica-sabores` e `loja = imperio-navalha`.

Toda loja nova criada no Master precisa de uma linha em `suporte_externo_lojas`
para o suporte funcionar.
