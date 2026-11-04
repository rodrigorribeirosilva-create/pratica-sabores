# AGEO — barras de chocolate: 4 sabores, escolhe 1

Configurado nas **barras de chocolate** da AGEO. Os outros produtos (bombons, rosquinhas,
palitos, mini barras) **não foram alterados**.

| Produto | Antes | Agora |
|---|---|---|
| Barra de chocolate (200 g) — R$ 25,00 | até 2 sabores | **4 sabores na tela, escolhe 1** |
| Barra de chocolate (55 g) — R$ 25,00 | até 2 sabores | **4 sabores na tela, escolhe 1** |
| Mini barras (8 un.) | 8 unidades entre sabores | igual (não mexido) |

Sabores mostrados: **Meio-amargo · Ao leite · Branco · Pistache**.

## Como o cliente vê
- Botão do card: **"Escolher 1 sabor"**
- Tela de escolha: "Sabores da barra · escolha 1 sabor"
- Depois de escolher, os outros três ficam desabilitados — não dá para marcar dois
- Para trocar, toca no escolhido e escolhe outro
- O pedido **não fecha sem escolher o sabor** (mínimo 1)

## Como mudar isso depois (no painel, sem programar)
Painel da AGEO → **Cardápio** → editar a barra → bloco "Cliente escolhe os sabores":
- **Sabores da barra / do tablete**
- **Quantas unidades vêm?** = 1 (é o "só 1 sabor")
- **Mínimo** = 1 (obriga escolher)
- lista de sabores com os 4 nomes

Teste automático: `node tests/verifica-barra-1-sabor.js` → **ERROS: 0**.
