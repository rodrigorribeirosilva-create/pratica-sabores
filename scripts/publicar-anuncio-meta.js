#!/usr/bin/env node
/**
 * Cria uma campanha de anúncio no Meta (Instagram + Facebook, Stories) pela API.
 *
 * ⚠️  A campanha é criada PAUSADA. Nada é cobrado até você conferir no
 *     Gerenciador de Anúncios e clicar em "Ativar".
 *
 * Uso (exemplo):
 *   META_TOKEN="EAAG..." \
 *   AD_ACCOUNT="act_1234567890" \
 *   PAGE_ID="123456789" \
 *   IG_ID="17841400000000000" \
 *   LINK="https://loja-digital.onrender.com/l/ageo-confeitaria?utm_source=instagram&utm_medium=paid&utm_campaign=nov-2026-ageo" \
 *   IMAGEM="anuncio-story.png" \
 *   TEXTO="Caixa de docinhos montada do seu jeito..." \
 *   TITULO="Monte sua caixa de chocolate" \
 *   DESCRICAO="A partir de R$ 14" \
 *   CIDADE="Florianópolis" \
 *   ORCAMENTO_CENTAVOS=1200 \
 *   node scripts/publicar-anuncio-meta.js
 *
 * Precisa de um token com as permissões: ads_management, ads_read, business_management.
 */
const fs = require('fs');
const path = require('path');

const V = process.env.META_VERSION || 'v21.0';
const API = `https://graph.facebook.com/${V}`;

const cfg = {
  token: process.env.META_TOKEN || '',
  conta: process.env.AD_ACCOUNT || '',
  pageId: process.env.PAGE_ID || '',
  igId: process.env.IG_ID || '',
  link: process.env.LINK || '',
  imagem: process.env.IMAGEM || '',
  texto: process.env.TEXTO || 'Conheça nossos produtos',
  titulo: process.env.TITULO || 'Saiba mais',
  descricao: process.env.DESCRICAO || '',
  cidade: process.env.CIDADE || 'Florianópolis',
  orcamento: Math.max(600, Number(process.env.ORCAMENTO_CENTAVOS || 1200)), // R$ 12/dia
  nome: process.env.NOME_CAMPANHA || `Campanha ${new Date().toISOString().slice(0, 10)}`,
  posicionamentos: (process.env.POSICIONAMENTOS || 'story,reels').split(','),
};

const faltando = [];
if (!cfg.token) faltando.push('META_TOKEN');
if (!cfg.conta) faltando.push('AD_ACCOUNT');
if (!cfg.pageId) faltando.push('PAGE_ID');
if (!cfg.link) faltando.push('LINK');
if (!cfg.imagem || !fs.existsSync(path.resolve(cfg.imagem))) faltando.push('IMAGEM (arquivo .jpg/.png)');

if (faltando.length) {
  console.error('\n❌ Falta configurar:\n   ' + faltando.join('\n   '));
  console.error('\nVeja o passo a passo em ANUNCIO-PELA-API.md\n');
  process.exit(1);
}

async function chamar(caminho, { metodo = 'GET', corpo, form } = {}) {
  let url = `${API}${caminho}`;
  const opcoes = { method: metodo, headers: {} };
  let body;

  if (form) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(form)) fd.append(k, v);
    fd.append('access_token', cfg.token);
    body = fd;
  } else {
    const dados = { ...(corpo || {}), access_token: cfg.token };
    if (metodo === 'GET') {
      url += '?' + new URLSearchParams(dados).toString();
    } else {
      body = new URLSearchParams(dados);
      opcoes.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }
  if (body) opcoes.body = body;

  const r = await fetch(url, opcoes);
  const texto = await r.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    json = { raw: texto };
  }
  if (!r.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${r.status} ${e.message || texto}` + (e.error_user_msg ? ` — ${e.error_user_msg}` : ''));
  }
  return json;
}

(async () => {
  try {
    console.log('\n🔎 1/6 conferindo o token…');
    const eu = await chamar('/me', { corpo: { fields: 'id,name' } });
    console.log(`    ok: ${eu.name || eu.id}`);

    console.log('🔎 2/6 conferindo a conta de anúncios…');
    const conta = await chamar(`/${cfg.conta}`, { corpo: { fields: 'name,currency,account_status,disable_reason' } });
    console.log(`    ${conta.name} · ${conta.currency} · status ${conta.account_status}`);
    if (conta.account_status !== 1) {
      throw new Error('A conta de anúncios não está ativa. Confira o cartão e a verificação no Gerenciador.');
    }

    console.log(`🔎 3/6 localizando "${cfg.cidade}"…`);
    const busca = await chamar('/search', {
      corpo: { type: 'adgeolocation', q: cfg.cidade, location_types: '["city"]', limit: 5 },
    });
    const cidade = (busca.data || [])[0];
    if (!cidade) throw new Error(`Não achei a cidade "${cfg.cidade}".`);
    console.log(`    ${cidade.name} (${cidade.key})`);

    console.log('🖼️  4/6 enviando a imagem…');
    const bytes = fs.readFileSync(path.resolve(cfg.imagem));
    const img = await chamar(`/${cfg.conta}/adimages`, {
      metodo: 'POST',
      form: { filename: path.basename(cfg.imagem), bytes: new Blob([bytes]) },
    });
    const imagemHash = Object.values(img.images || {})[0]?.hash;
    if (!imagemHash) throw new Error('O Meta não devolveu o hash da imagem.');
    console.log(`    hash ${imagemHash}`);

    console.log('📣 5/6 criando campanha e conjunto (PAUSADOS)…');
    const campanha = await chamar(`/${cfg.conta}/campaigns`, {
      metodo: 'POST',
      corpo: {
        name: cfg.nome,
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        special_ad_categories: '[]',
      },
    });
    const posicionamentos = {
      publisher_platforms: ['instagram', 'facebook'],
      instagram_positions: cfg.posicionamentos.filter((p) => ['story', 'reels', 'stream', 'explore'].includes(p)),
      facebook_positions: cfg.posicionamentos.includes('story') ? ['story'] : ['feed'],
    };
    const conjunto = await chamar(`/${cfg.conta}/adsets`, {
      metodo: 'POST',
      corpo: {
        name: `${cfg.nome} — Stories`,
        campaign_id: campanha.id,
        daily_budget: cfg.orcamento,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        status: 'PAUSED',
        destination_type: 'WEBSITE',
        targeting: JSON.stringify({
          geo_locations: { cities: [{ key: cidade.key }], radius: 15, distance_unit: 'kilometer' },
          age_min: Number(process.env.IDADE_MIN || 25),
          age_max: Number(process.env.IDADE_MAX || 55),
          ...posicionamentos,
        }),
      },
    });

    console.log('🎬 6/6 criando o anúncio…');
    const criativo = {
      name: `${cfg.nome} — criativo`,
      object_story_spec: {
        page_id: cfg.pageId,
        link_data: {
          link: cfg.link,
          message: cfg.texto,
          name: cfg.titulo,
          description: cfg.descricao,
          image_hash: imagemHash,
          call_to_action: { type: 'LEARN_MORE' },
        },
      },
    };
    if (cfg.igId) criativo.object_story_spec.instagram_actor_id = cfg.igId;

    const criativoCriado = await chamar(`/${cfg.conta}/adcreatives`, { metodo: 'POST', corpo: criativo });
    const anuncio = await chamar(`/${cfg.conta}/ads`, {
      metodo: 'POST',
      corpo: {
        name: `${cfg.nome} — anúncio`,
        adset_id: conjunto.id,
        creative: JSON.stringify({ creative_id: criativoCriado.id }),
        status: 'PAUSED',
      },
    });

    const idConta = cfg.conta.replace('act_', '');
    console.log('\n✅ Tudo criado e PAUSADO (nada foi cobrado).\n');
    console.log(`   campanha : ${campanha.id}`);
    console.log(`   conjunto : ${conjunto.id}`);
    console.log(`   anúncio  : ${anuncio.id}`);
    console.log(`   revisar  : https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${idConta}\n`);
    console.log('   Confira a imagem e o texto no Gerenciador e clique em ATIVAR quando quiser rodar.\n');
  } catch (err) {
    console.error('\n❌ Não deu para criar:', err.message, '\n');
    process.exit(1);
  }
})();
