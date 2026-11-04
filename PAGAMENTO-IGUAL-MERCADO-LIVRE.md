# Pagamento igual Mercado Livre (Mercado Pago)

## Como funciona para o cliente

1. Escolhe o produto e vai para o **checkout** no link da loja
2. Em "Forma de pagamento", escolhe **Cartão**
3. Aparece o botão **"💳 Pagar no Mercado Pago"**
4. Vai para a **página segura do Mercado Pago** e lá escolhe:
   - **Crédito** (à vista ou parcelado)
   - **Débito** (Débito Virtual CAIXA — o único débito que existe online)
   - **Pix**
   - saldo Mercado Pago / boleto, se a conta tiver
5. Paga → o Mercado Pago aprova → volta para a loja
6. O pedido muda para **PAGO** no painel e o **comprovante** fica disponível:
   `/l/<loja>/comprovante/<CODIGO>` (botão no painel e link no WhatsApp)

O dinheiro cai na **conta Mercado Pago da própria loja**. Não passa por nós.

## O que o lojista precisa fazer (uma vez)

Painel da loja → **Configurações → Pagamentos → Mercado Pago**:
1. **Public Key** (para pagar digitando o cartão no próprio site — opcional)
2. **Access Token** (obrigatório para o botão "Pagar no Mercado Pago")
3. Clicar em **Testar conexão** (já existe no painel)

Onde pegar: Mercado Pago → *Seu negócio* → *Configurações* → *Gestão e administração*
→ *Credenciais* → **Credenciais de produção** → copiar `Access Token`.

## Regras que ficaram no sistema

- Sem Mercado Pago configurado, a forma **"Cartão de crédito (online)" não aparece**
  para o cliente (antes aparecia e travava em "em ativação").
- Com Mercado Pago, o **formulário de cartão do site fica escondido** — quem quiser
  pode abrir em "ou digitar o cartão aqui no site" (só quando há Public Key).
- O **cartão na entrega/retirada** (maquininha) continua sempre disponível.
- O **link de pagamento externo** (banco/maquininha) continua como opção extra.

## O que ainda falta (e depende de você)

**Nenhuma loja tem o Mercado Pago configurado hoje.** Testei as 4: todas com
`checkout: false`. Enquanto o Access Token não for colado, o botão não aparece
(só o cartão na entrega e o Pix).

Para ativar: cole o Access Token no painel da loja, **ou** me mande o token que eu
configuro e testo de ponta a ponta (crio um pedido de teste, gero a preferência e
vejo se a página do Mercado Pago abre).

> Segurança: o Access Token dá acesso ao dinheiro da conta. O ideal é o lojista
> colar ele mesmo no painel — assim ele não passa por aqui.
