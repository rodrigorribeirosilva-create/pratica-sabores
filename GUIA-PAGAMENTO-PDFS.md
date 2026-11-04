# PDFs de ativação de pagamento — um por loja

Gerados em `guias/` e também publicados em `public/guias/` (baixáveis pelo celular).

| Loja | Arquivo | Link direto |
|---|---|---|
| Prática Sabores | `pratica-sabores-como-receber.pdf` | https://loja-digital.onrender.com/guias/pratica-sabores-como-receber.pdf |
| AGEO Confeitaria | `ageo-confeitaria-como-receber.pdf` | https://loja-digital.onrender.com/guias/ageo-confeitaria-como-receber.pdf |
| MDN Presents | `mdn-presents-como-receber.pdf` | https://loja-digital.onrender.com/guias/mdn-presents-como-receber.pdf |
| Mimo de Linha | `mimo-de-linha-como-receber.pdf` | https://loja-digital.onrender.com/guias/mimo-de-linha-como-receber.pdf |

## O que tem dentro (2 páginas, A4)
1. Capa com **link do painel, senha e link do site** daquela loja
2. Tabela do que o cliente poderá escolher: crédito, débito (virtual CAIXA), Pix,
   **cartão na entrega (crédito/débito na maquininha, igual iFood)** e dinheiro com troco
3. Passo a passo em 5 etapas: criar conta Mercado Pago → pegar o **Access Token** →
   colar no painel → pedido de teste → manter o cartão na entrega ligado
4. Página 2: **segurança** (o token é a chave do dinheiro), 7 perguntas frequentes
   (taxas, prazo, precisa de máquina, parcelar, comprovante, outro banco) e
   o que fazer se algo não funcionar

## Como gerar de novo
```bash
node scripts/gerar-pdfs-pagamento.js          # só os PDFs
PREVIA=1 node scripts/gerar-pdfs-pagamento.js # PDFs + imagem da 1ª página
```
O conteúdo é montado a partir da lista de lojas no topo do script
(nome, senha, cor, WhatsApp). Para mudar o texto, edite o template `pagina(l)`.

## Mensagem pronta para enviar no WhatsApp
> Oi, [nome]! Sua loja já está no ar e agora dá para receber **crédito, débito e Pix**
> direto no site, além do **cartão na entrega** (crédito ou débito na maquininha, igual iFood).
> Para ativar, é só seguir este guia de 2 páginas — usa a **sua conta** do Mercado Pago,
> o dinheiro cai direto para você. Qualquer dúvida me chama.
