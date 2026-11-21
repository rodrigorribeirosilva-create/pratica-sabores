# Palavras de cada loja (barbeiro, profissional, esteticista…)

Cada loja escolhe **como o sistema chama quem atende** e **como chama o espaço**.
O resto é igual: agenda por pessoa, equipe, comissões, relatórios.
Muda só a palavra que o cliente e o dono leem.

| Loja | Pessoa | Espaço | O cliente lê |
|---|---|---|---|
| Barbearia | barbeiro | barbearia | "Escolha seu barbeiro" · "Pagamento na barbearia" |
| Estúdio de estética | esteticista | estúdio | "Escolha sua esteticista" · "Pagamento no estúdio" |
| Salão | cabeleireiro | salão | "Escolha seu cabeleireiro" · "Pagamento no salão" |
| Clínica / espaço | terapeuta | clínica | "Escolha seu terapeuta" · "Pagamento na clínica" |

Sem escolha salva, tudo continua **barbeiro / barbearia** — igual sempre foi
(a Império Barber não muda nada).

## Onde trocar

### 1. Na loja que já existe (mais rápido, pelo master)

1. Abra `/master` e entre com a senha do master.
2. Na aba **Lojas**, ache a loja e toque em **Palavras da loja**.
3. Digite como a loja chama quem atende (ex.: `esteticista`) e depois o espaço
   (ex.: `estúdio`). Enter para confirmar cada um.
4. O card da loja passa a mostrar, por exemplo, **esteticistas · estúdio**.
5. Abra o painel da loja: já está tudo com a palavra nova.

Palavras que o sistema conhece (e já escreve no feminino/masculino certo):
`barbeiro`, `profissional`, `esteticista`, `cabeleireiro`, `manicure`,
`massagista`, `terapeuta`, `tatuador`, `veterinario`, `atendente`.
Espaços: `barbearia`, `estúdio`, `salão`, `salão de beleza`, `clínica`,
`espaço`, `consultório`, `loja`.
Uma palavra diferente dessas também funciona (o texto usa o que você digitou).

### 2. No painel da própria loja

Painel da loja → **Loja** (engrenagem/aba Loja) → card
**💬 Como o cliente chama quem atende** → escolha e **Salvar palavras**.
Só o dono da loja vê esse card; o funcionário não muda nada.

### 3. Ao criar a loja nova

No master → aba **Nova loja** → escolha **Serviços — agenda com equipe**.
Aparecem os dois campos (*Quem atende é…* e *E o espaço é…*) e a loja já nasce
com as palavras certas.

## O que muda de fato

- **Página do cliente** (`/l/nome-da-loja`): título da equipe, cards, etiqueta
  "Seu barbeiro", textos do topo, Pix e pagamento ("no estúdio", "no salão").
- **Painel**: abas, títulos, botões ("+ Nova esteticista", "Números por
  esteticista", "Comissões por esteticista"), avisos e mensagens de erro.
- **WhatsApp do dono**: a mensagem do agendamento passa a dizer
  `Esteticista: Ana Souza` e `Pagamento: no estúdio, no dia do atendimento`.
- **Master**: o card da loja mostra a palavra escolhida.

Não muda: nomes de campo, ids, classes, links (`?barbeiro=3` continua
funcionando; `?profissional=3` também), histórico, agenda e preços.

## Loja de estética com equipe (do zero)

1. Master → **Nova loja** → segmento **Serviços** → palavras
   `esteticista` / `estúdio` → criar.
2. No painel da loja, em **Loja → Dados da empresa**, preencha o **endereço**
   (o cliente vê "Atendimento no estúdio: endereço").
3. Em **Loja → Dados da empresa** escolha o perfil de agenda de atendimento no
   local (o mesmo usado por barbearia: esconde endereço do cliente e dados de
   ar-condicionado).
4. **Equipe**: cadastre cada profissional (foto, dias, horário, comissão).
5. **Serviços**: cadastre limpeza de pele, massagem, unhas etc., com duração.
6. Envie o link `/l/nome-da-loja` no WhatsApp/Instagram.

## Link de agendamento

O link, o QR Code para imprimir e o link de cada profissional ficam em
**Loja → 🔗 Link de agendamento** no painel (e no master, botão
**QR Code do link**). Passo a passo em [`LINK-DE-AGENDAMENTO.md`](LINK-DE-AGENDAMENTO.md).

## Teste automático

Com o servidor rodando (`npm start`), em outro terminal:

```bash
node tests/verifica-rotulos-por-loja.js
# ou, para outro endereço:
BASE=http://127.0.0.1:3977 node tests/verifica-rotulos-por-loja.js
```

O teste cria uma loja de estética e outra barbearia, confere as palavras no
site, no painel, na mensagem do WhatsApp, a permissão do funcionário e que uma
loja não mexe na outra. No fim apaga as duas lojas de teste.
