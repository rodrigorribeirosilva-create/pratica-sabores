# Guia do modo multi-loja (revenda)

Uma única instalação atende **várias empresas**. Cada uma tem cardápio, painel, senha, produtos e pedidos **separados**.

## Os dois painéis

| Painel | Endereço | Quem usa | O que vê |
|---|---|---|---|
| **Master** | `/master` | Você (dono do sistema) | Todas as lojas |
| **Da loja** | `/l/<endereco>/admin` | O cliente | Só a loja dele |

O cliente **nunca** vê o painel master nem as outras lojas.

## Endereços de cada loja

```
/l/pratica-sabores            → cardápio público (manda no WhatsApp)
/l/pratica-sabores/admin      → painel do cliente
/l/nome-da-loja               → outro cliente
```

A loja principal também responde na raiz (`/`), então links antigos continuam funcionando.

## Como cadastrar um cliente novo

1. Abra `/master` e entre com a **senha do master**.
2. Aba **Nova loja**: nome da empresa, WhatsApp que recebe os pedidos, **senha do painel do cliente** e descrição curta.
3. Clique em **Criar loja**.
4. Na aba **Lojas**, use:
   - **Copiar link do cardápio** → é esse link que você envia no WhatsApp, Instagram e QR code.
   - **Avisar por WhatsApp** → abre o WhatsApp já com o link do cardápio e do painel para o cliente.
   - **Redefinir senha** → quando o cliente esquecer.
   - **Desativar** → tira o site do ar sem apagar nada.
   - **Excluir** → apaga a loja e os dados dela (pede confirmação digitando o endereço).

## O que o cliente faz sozinho

No painel dele: cadastra produtos, preços, fotos, categorias, taxa de entrega, horários, formas de pagamento (Pix/chave, link de pagamento), mensagens de WhatsApp, abre/fecha pedidos, vê e atualiza pedidos e baixa backup em JSON.

## Personalizar a cara de cada cliente

No painel do cliente → **Configurações › Dados do negócio**: nome, logo (upload), foto de capa, Instagram, endereço, cor principal. A logo e as cores aparecem no cardápio **e** na tela de login do painel dele — assim cada empresa parece ter sistema próprio.

## Custos

Um único serviço no Render (Starter ~US$ 7 + disco 1 GB US$ 0,25) atende todas as lojas — o valor **não** é por cliente. Limite do plano Hobby: **25 serviços** e **5 GB de banda/mês** (fotos). Passando disso, o workspace Pro (US$ 25) aumenta a banda para 25 GB.

## Backup

- **Master:** `/master › Segurança › Baixar backup completo` (banco inteiro, todas as lojas).
- **Cliente:** painel dele → botão de backup (JSON só da loja dele).

## Segurança

- Cada loja só autentica na própria sessão: o cookie de uma loja **não** abre o painel de outra (testado: 401).
- O master é a única porta que enxerga todas as lojas — use senha longa e diferente.
- Troque a senha padrão do master em `/master › Segurança` no primeiro acesso.
