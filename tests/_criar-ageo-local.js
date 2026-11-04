/** Cria a loja AGEO no banco LOCAL para testar (produção já tem). */
const m = require('../src/db');
m.init();
const existente = m.getStoreBySlug('ageo-confeitaria');
if (existente) { console.log('já existe:', existente.id); process.exit(0); }
const loja = m.createStore({
  name: 'AGEO Confeitaria',
  slug: 'ageo-confeitaria',
  password: 'ageo2026',
  whatsapp: '5548996468360',
  segment: 'catalogo',
  withSeedProducts: false,
});
console.log('criada:', loja.id, loja.slug);
const { db } = m;
const doces = ['Brigadeiro', 'Beijinho', 'Ninho com Nutella', 'Bem-casado', 'Churros', 'Morango do amor'];
const caixas = [
  { nome: 'Caixa de docinhos (12 un.)', preco: 3200, unidades: 12 },
  { nome: 'Caixa de docinhos (24 un.)', preco: 6000, unidades: 24 },
  { nome: 'Caixa de brigadeiro (6 un.)', preco: 1800, unidades: 6 },
  { nome: 'Beijinho (6 un.)', preco: 1800, unidades: 6 },
];
for (const c of caixas) {
  db.prepare(
    `INSERT INTO products (store_id, name, description, price_cents, image_url, category, active, sort_order, opcoes_json)
     VALUES (?, ?, ?, ?, '', 'Docinhos', 1, 0, ?)`
  ).run(
    loja.id,
    c.nome,
    'Monte sua caixa. Escolha os sabores e as quantidades.',
    c.preco,
    JSON.stringify({
      ativo: true,
      titulo: 'Escolha os doces',
      unidades: c.unidades,
      minimo: c.unidades,
      sabores: doces.map((n) => ({ nome: n, extra_cents: 0, ativo: true })),
    })
  );
}
console.log('caixas criadas:', db.prepare('SELECT id, name FROM products WHERE store_id = ?').all(loja.id));
