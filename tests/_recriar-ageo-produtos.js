/**
 * Recria os produtos que sumiram do catálogo da AGEO (perda por corrida no deploy).
 * Uso: BASE=https://loja-digital.onrender.com node tests/_recriar-ageo-produtos.js
 * Preço SEMPRE em string brasileira ("40,00") — número é tratado como reais na API.
 */
const BASE = process.env.BASE || 'https://loja-digital.onrender.com';
const SENHA = 'ageo2026';

const IMG = 'https://nozmydlgpnorqmqhlfpm.supabase.co/storage/v1/object/public/ps-uploads/ageo-confeitaria';

const PRODUTOS = [
  {
    name: 'Caixa de docinhos (12 un.)',
    price: '40,00',
    category: 'Docinhos',
    description: 'Monte sua caixa com 12 docinhos gourmet. Escolha os sabores e as quantidades.',
    image_url: `${IMG}/1793542190073-fe0f6b28e2ed.jpg`,
    opcoes: {
      ativo: true,
      titulo: 'Escolha os doces',
      unidades: 12,
      minimo: 12,
      sabores: [
        'Beijinho',
        'Brigadeiro',
        'Ninho com Nutella',
        'Bem-casado',
        'Churros',
        'Morango do amor',
        'Cajuzinho',
        'Paçoca',
      ].map((nome) => ({ nome, extra_cents: 0, ativo: true })),
    },
  },
  {
    name: 'Caixinha de bombom Prestígio (4 un.)',
    price: '16,00',
    category: 'Bombons',
    description: 'Caixinha com 4 bombons. Escolha os sabores e as quantidades.',
    image_url: `${IMG}/1793542190737-5377387dc9b1.jpg`,
    opcoes: {
      ativo: true,
      titulo: 'Escolha os bombons',
      unidades: 4,
      minimo: 4,
      sabores: ['Prestígio', 'Brigadeiro', 'Beijinho', 'Ninho com Nutella', 'Meio-amargo', 'Ao leite'].map(
        (nome) => ({ nome, extra_cents: 0, ativo: true })
      ),
    },
  },
];

(async () => {
  const login = await fetch(`${BASE}/l/ageo-confeitaria/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: SENHA }),
  });
  const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : []).join('; ');
  if (!cookie) throw new Error('login falhou');
  const cab = { 'Content-Type': 'application/json', cookie };

  const atuais = await (await fetch(`${BASE}/l/ageo-confeitaria/api/admin/products`, { headers: cab })).json();
  console.log('antes:', atuais.map((p) => p.id).join(','));

  for (const p of PRODUTOS) {
    const ja = atuais.find((x) => x.name.trim().toLowerCase() === p.name.toLowerCase());
    if (ja) {
      console.log('já existe:', ja.id, ja.name);
      continue;
    }
    const r = await fetch(`${BASE}/l/ageo-confeitaria/api/admin/products`, {
      method: 'POST',
      headers: cab,
      body: JSON.stringify({ ...p, active: true, sort_order: 0 }),
    });
    const corpo = await r.text();
    console.log(r.status, p.name, corpo.slice(0, 160));
  }

  const menu = await (await fetch(`${BASE}/l/ageo-confeitaria/api/menu`)).json();
  console.log('categorias:', menu.categories);
  for (const p of menu.products) {
    console.log(p.id, p.name, (p.price_cents / 100).toFixed(2), p.category, p.opcoes ? p.opcoes.sabores.length + ' sabores' : '');
  }
})();
