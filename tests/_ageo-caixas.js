/** Configura as caixas de doces da AGEO com escolha de sabores (usa a API do painel). */
const BASE = process.env.BASE || 'http://127.0.0.1:3978';
const SENHA = 'ageo2026';

(async () => {
  // login
  const login = await fetch(`${BASE}/l/ageo-confeitaria/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: SENHA }),
  });
  const cookie = (login.headers.getSetCookie ? login.headers.getSetCookie() : []).join('; ');

  const cab = { 'Content-Type': 'application/json', cookie };
  const produtos = await (await fetch(`${BASE}/l/ageo-confeitaria/api/admin/products`, { headers: cab })).json();
  console.log('produtos hoje:', produtos.map((p) => `${p.id} ${p.name} R$${(p.price_cents / 100).toFixed(2)}`));

  const doces = ['Brigadeiro', 'Beijinho', 'Ninho com Nutella', 'Bem-casado', 'Churros', 'Morango do amor'];

  // caixas que passam a ter escolha de sabores
  const planos = [
    { chave: '12 un', nome: 'Caixa de docinhos (12 un.)', unidades: 12, preco: 3200, desc: 'Monte sua caixa com 12 docinhos gourmet. Escolha os sabores e as quantidades.' },
    { chave: '24 un', nome: 'Caixa de docinhos (24 un.)', unidades: 24, preco: 6000, desc: 'Caixa com 24 docinhos gourmet para festa. Escolha os sabores e as quantidades.' },
  ];

  for (const plano of planos) {
    const existente = produtos.find((p) => p.name.trim().toLowerCase() === plano.nome.toLowerCase());
    const corpo = {
      name: plano.nome,
      price_cents: plano.preco,
      description: plano.desc,
      category: 'Docinhos',
      active: true,
      sort_order: 0,
      image_url: existente ? existente.image_url : '',
      opcoes: {
        ativo: true,
        titulo: 'Escolha os doces',
        unidades: plano.unidades,
        minimo: plano.unidades,
        sabores: doces.map((n) => ({ nome: n, extra_cents: 0, ativo: true })),
      },
    };
    const url = existente ? `${BASE}/l/ageo-confeitaria/api/admin/products/${existente.id}` : `${BASE}/l/ageo-confeitaria/api/admin/products`;
    const r = await fetch(url, { method: existente ? 'PUT' : 'POST', headers: cab, body: JSON.stringify(corpo) });
    const d = await r.json();
    console.log(r.status, plano.nome, '->', d.id || d.error);
  }

  // as caixas antigas de 6 unidades também ganham escolha
  for (const p of produtos.filter((x) => /\(6 un\.\)|\( 6 un\.\)|\(4 un\.\)/i.test(x.name))) {
    const unidades = Number((p.name.match(/(\d+)\s*un/i) || [])[1]) || 6;
    const corpo = {
      name: p.name,
      price_cents: p.price_cents,
      description: p.description,
      category: p.category,
      active: !!p.active,
      sort_order: p.sort_order,
      image_url: p.image_url,
      opcoes: {
        ativo: true,
        titulo: 'Escolha os doces',
        unidades,
        minimo: unidades,
        sabores: doces.map((n) => ({ nome: n, extra_cents: 0, ativo: true })),
      },
    };
    const r = await fetch(`${BASE}/l/ageo-confeitaria/api/admin/products/${p.id}`, {
      method: 'PUT',
      headers: cab,
      body: JSON.stringify(corpo),
    });
    console.log(r.status, 'montagem na', p.name, '->', unidades, 'unidades');
  }
})();
