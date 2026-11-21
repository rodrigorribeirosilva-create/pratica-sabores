# Link de agendamento

O link é o endereço que você manda no WhatsApp/Instagram (e imprime no QR Code).
Ao abrir, o cliente vê os serviços, escolhe o profissional e o horário — e o
pedido cai na agenda do painel.

```
https://SEU-SITE/l/nome-da-loja
```

O endereço de cada loja aparece no master (aba **Lojas**, no cartão da loja) e no
painel da loja, em **Loja → Link de agendamento**.

## O que tem no card do painel (`Loja → 🔗 Link de agendamento`)

| Item | Para que serve |
|---|---|
| **Link** | o endereço da loja, com botão **Copiar link** |
| **Enviar no WhatsApp** | abre o WhatsApp com a mensagem já escrita (o texto usa a palavra da loja: barbeiro, esteticista…) |
| **QR Code para imprimir** | imagem gerada na hora; **Baixar QR Code** salva o PNG para colar no balcão, espelho ou vitrine |
| **Mensagem pronta** | texto com o link; **Copiar mensagem** para colar em bio, status ou post |
| **Link de cada profissional** | `...?profissional=3` — abre já com aquela pessoa escolhida (bio do Instagram, status do WhatsApp) |

## Pelo master (sem entrar no painel da loja)

Aba **Lojas** → botão **QR Code do link**: abre o QR para imprimir/baixar.
Botão **Copiar link de agendamento** copia o link do cliente;
**Mandar link de agendamento** abre o WhatsApp com o texto pronto.

## Detalhes que economizam dor de cabeça

- **`?v=xxxx`**: o WhatsApp guarda a prévia antiga de um link. Ao copiar, o
  sistema coloca esse código no fim para forçar a prévia nova (logo e nome
  atualizados).
- **`?profissional=3`** e **`?barbeiro=3`**: abrem a agenda daquela pessoa.
- **`?servico=12`**: abre já com o serviço escolhido.
- O QR é só um desenho do link: se a loja mudar de endereço, é só gerar outro.

## Loja de estética / salão

O link funciona igual; o texto muda sozinho para a palavra da loja
(“agendamento do estúdio”, “a esteticista”). Veja `PALAVRAS-DE-CADA-LOJA.md`.

## Teste automático

Com o servidor rodando:

```bash
BASE=http://127.0.0.1:3977 node tests/verifica-link-agendamento.js
```

Confere: o link abre (inclusive com `?profissional=` e `?v=`), o QR do painel e
o do master são PNG de verdade, o QR do master exige a senha do master e o card
do link existe no painel. No fim apaga a loja de teste.
