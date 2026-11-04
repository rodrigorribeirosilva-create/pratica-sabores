# Por que os produtos sumiram e o que foi corrigido

## O que aconteceu
Em 01/11/2026, depois de publicar a montagem de caixas na AGEO, três itens do catálogo
(Cenoura com chocolate, Caixa de docinhos 12 un., Caixinha Prestígio 4 un.) desapareceram
em produção.

Motivo: no deploy o Render derruba a instância antiga e sobe a nova ao mesmo tempo. A
instância nova restaurava os dados da nuvem **antes** do último envio da instância antiga
terminar — ou seja, lia um retrato velho — e esse retrato velho acabava voltando para a nuvem.

## O que foi corrigido (código, `src/remote.js`)
1. **Espera o snapshot assentar**: no boot, o sistema lê o backup e só usa depois que a
   data do snapshot para de mudar (até 6 leituras / ~7 s). Isso elimina a corrida do deploy.
2. **Trava anti-apagamento**: se o banco local estiver vazio e a nuvem tiver dados, o
   envio é **bloqueado** e avisado no log — um processo vazio nunca mais sobrescreve o bom.
3. **Versões anteriores**: agora ficam guardadas as últimas **20** versões dos dados
   (mesma tabela do backup, ids 101–120). Isso já existe desde o primeiro envio após a
   correção.
4. **Painel master → Sistema → Backup → "Versões anteriores"**: lista com data e hora e o
   botão **"Voltar para esta"**. Rotas: `GET /api/master/backup/historico` e
   `POST /api/master/backup/restaurar {id}`.

5. **Contador de bloqueios**: o painel mostra um aviso quando a trava anti-apagamento
   entrou em ação (campo `bloqueios` em `GET /api/master/backup/status`).
6. **Pente-fino de publicação**: `node tests/smoke-producao.js` confere as 5 lojas, a
   idade do backup, o número de versões e os bloqueios. Sai com código 1 se algo estiver errado.

## Como testar de verdade
```
node tests/_recriar-ageo-produtos.js      # cria itens que faltam (idempotente)
node tests/verificar-ageo-12.js           # montagem da caixa de 12 na tela
node tests/verificar-prestigio.js         # montagem da caixinha Prestígio
node tests/_verificar-versoes.js          # lista de versões no painel master
node tests/smoke-producao.js              # pente-fino de todas as lojas + backup
```
Em 01/11/2026 foram feitos **5 deploys seguidos** depois da correção: os 9 produtos da
AGEO (32–38, 42, 43) continuaram no ar em todos.
