'use strict';
/**
 * RÓTULOS POR LOJA ("como o sistema chama as pessoas e o lugar").
 *
 * Uma barbearia fala "barbeiro" e "barbearia". Um estúdio de estética fala
 * "profissional" e "estúdio". O resto do sistema (agenda por pessoa, equipe,
 * comissões) é igual — muda só a palavra que aparece na tela.
 *
 * A escolha fica DENTRO da loja (business.rotulo_profissional / rotulo_local),
 * então mexer numa loja nunca muda as outras. Sem escolha salva, o padrão
 * continua sendo barbeiro/barbearia (nada muda na Império Barber).
 */

const PADRAO_PROFISSIONAL = 'barbeiro';
const PADRAO_LOCAL = 'barbearia';

/** Palavra de cada linha, pronta para texto (sem plural). */
function tabela(singular, plural, pluralFem) {
  return {
    singular,
    plural,
    // "o barbeiro" / "a esteticista" — o artigo aparece nas frases montadas
    artigo: pluralFem ? 'a' : 'o',
    pluralFem: !!pluralFem,
  };
}

const PALAVRAS = {
  barbeiro: tabela('barbeiro', 'barbeiros', false),
  profissional: tabela('profissional', 'profissionais', false),
  esteticista: tabela('esteticista', 'esteticistas', true),
  cabeleireiro: tabela('cabeleireiro', 'cabeleireiros', false),
  manicure: tabela('manicure', 'manicures', true),
  massagista: tabela('massagista', 'massagistas', false),
  terapeuta: tabela('terapeuta', 'terapeutas', false),
  tatuador: tabela('tatuador', 'tatuadores', false),
  veterinario: tabela('veterinário', 'veterinários', false),
  atendente: tabela('atendente', 'atendentes', false),
};

const LOCAIS = {
  // chave sem acento (é assim que a escolha é comparada) → texto bonito
  barbearia: { singular: 'barbearia', artigo: 'a' },
  'salao de beleza': { singular: 'salão de beleza', artigo: 'o' },
  salao: { singular: 'salão', artigo: 'o' },
  estudio: { singular: 'estúdio', artigo: 'o' },
  clinica: { singular: 'clínica', artigo: 'a' },
  espaco: { singular: 'espaço', artigo: 'o' },
  loja: { singular: 'loja', artigo: 'a' },
  consultorio: { singular: 'consultório', artigo: 'o' },
  domicilio: { singular: 'domicílio', artigo: 'o' },
  atelier: { singular: 'ateliê', artigo: 'o' },
  studio: { singular: 'studio', artigo: 'o' },
};

const chave = (v) =>
  String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // "salao-de-beleza" e "salao de beleza" são a mesma escolha
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ');

/** Texto curto e seguro vindo do painel (vira uma palavra/chave). */
function limpar(valor, max = 24) {
  return String(valor || '')
    .replace(/[<>{}\\]/g, '')
    .trim()
    .slice(0, max);
}

/**
 * Devolve as palavras da loja já prontas para montar frases.
 * Uso: const r = rotulos(business); `Escolha ${r.artigo} ${r.singular}`
 */
function rotulos(business = {}) {
  const nomeProf = limpar(business.rotulo_profissional, 24);
  const chaveProf = chave(nomeProf) || chave(PADRAO_PROFISSIONAL);
  const prof = PALAVRAS[chaveProf] || null;
  const livre = nomeProf.replace(/[-_]+/g, ' ').trim();
  const p = prof || {
    singular: livre || PADRAO_PROFISSIONAL,
    plural: `${livre || PADRAO_PROFISSIONAL}s`,
    artigo: 'o',
    pluralFem: false,
  };

  const nomeLocal = limpar(business.rotulo_local, 24);
  // "salao-de-beleza" vira "salão de beleza"; palavra livre fica como foi escrita
  const chaveLocal = chave(nomeLocal) || chave(PADRAO_LOCAL);
  const local =
    LOCAIS[chaveLocal] || { singular: nomeLocal.replace(/[-_]+/g, ' ').trim() || PADRAO_LOCAL, artigo: 'a' };

  // "o barbeiro" / "a esteticista" / "os profissionais" / "as esteticistas"
  const comArtigo = (s) => `${p.artigo} ${s}`;
  const pluralArtigo = `${p.pluralFem ? 'as' : 'os'} ${p.plural}`;

  return {
    profissional: p.singular,
    profissionais: p.plural,
    Profissional: p.singular.charAt(0).toUpperCase() + p.singular.slice(1),
    Profissionais: p.plural.charAt(0).toUpperCase() + p.plural.slice(1),
    artigo: p.artigo,
    oProfissional: comArtigo(p.singular),
    osProfissionais: pluralArtigo,
    sobreProfissional: p.artigo === 'a' ? 'sobre a' : 'sobre o',
    doProfissional: p.artigo === 'a' ? 'da' : 'do',
    // lugar
    local: local.singular,
    Local: local.singular.charAt(0).toUpperCase() + local.singular.slice(1),
    artigoLocal: local.artigo,
    noLocal: local.artigo === 'a' ? `na ${local.singular}` : `no ${local.singular}`,
    doLocal: local.artigo === 'a' ? `da ${local.singular}` : `do ${local.singular}`,
    aoLocal: local.artigo === 'a' ? `à ${local.singular}` : `ao ${local.singular}`,
    // flag prática usada onde o texto muda de verdade (ex.: "corte")
    ehBarbearia: chaveProf === chave(PADRAO_PROFISSIONAL) && chaveLocal === chave(PADRAO_LOCAL),
  };
}

/** Lista para montar o seletor do painel/master. */
const opcoesProfissional = () => Object.entries(PALAVRAS).map(([id, p]) => ({ id, singular: p.singular, plural: p.plural }));
const opcoesLocal = () => Object.entries(LOCAIS)
  .filter(([id]) => id === chave(id))
  .map(([id, l]) => ({ id, singular: l.singular }));

module.exports = { rotulos, limpar, chave, opcoesProfissional, opcoesLocal, PADRAO_PROFISSIONAL, PADRAO_LOCAL };
