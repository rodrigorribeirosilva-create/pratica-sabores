'use strict';
/**
 * Contrato de prestação de serviços de manutenção (modelo enxuto).
 *
 * Contratante: a loja (ex.: Prática Sabores)
 * Contratado:  Rodrigo Ribeiro
 * Valores: R$ 100,00 de produção/implantação do link (pagamento único)
 *          + R$ 40,00/mês de manutenção · vencimento todo dia 10
 *
 * A assinatura é eletrônica simples (Lei 14.063/2020): registramos nome,
 * documento, data/hora, IP e um código de autenticação (hash) do conteúdo.
 */
const crypto = require('crypto');

const PADRAO_CONTRATADO = {
  nome: process.env.CONTRATADO_NOME || 'Rodrigo Ribeiro',
  doc: process.env.CONTRATADO_DOC || '',
  cidade: process.env.CONTRATADO_CIDADE || 'Florianópolis/SC',
  // número que recebe as assinaturas (o seu). Pode ser trocado por env var.
  // padrão: o número do Rodrigo (pode ser trocado no painel master → Segurança)
  whatsapp: (process.env.CONTRATADO_WHATSAPP || '5548988545558').replace(/\D/g, ''),
  email: process.env.CONTRATADO_EMAIL || '',
};

/**
 * Dados do CONTRATADO (você). O painel master manda por cima do padrão:
 * assim o nome, o documento e o WhatsApp que recebe a assinatura mudam
 * pelo painel, sem mexer no código.
 */
function dadosContratado() {
  let doPainel = {};
  try {
    const { getAppSetting } = require('./db');
    doPainel = getAppSetting('contratado', {}) || {};
  } catch {}
  const numero = String(doPainel.whatsapp || PADRAO_CONTRATADO.whatsapp || '').replace(/\D/g, '');
  return {
    nome: String(doPainel.nome || PADRAO_CONTRATADO.nome).trim(),
    doc: String(doPainel.doc || PADRAO_CONTRATADO.doc).trim(),
    cidade: String(doPainel.cidade || PADRAO_CONTRATADO.cidade).trim(),
    whatsapp: numero,
    email: String(doPainel.email || PADRAO_CONTRATADO.email).trim(),
  };
}

const CONTRATADO = PADRAO_CONTRATADO; // compatibilidade

const SERVICOS = [
  'Manutenção e funcionamento do link.',
  'Correção de possíveis erros.',
  'Suporte técnico.',
  'Pequenos ajustes e atualizações na plataforma.',
];

function brl(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBR(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Estrutura do contrato (usada na tela e no PDF). */
function montarContrato({ loja, segmento, valorCents, implantacaoCents, diaVencimento, inicio, clausulasExtras }) {
  const palavra =
    segmento === 'catalogo' ? 'catálogo digital' : segmento === 'servicos' ? 'site de agendamento' : 'cardápio digital';
  const implantacao = Number(implantacaoCents == null ? 10000 : implantacaoCents);
  return {
    titulo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO',
    subtitulo: `Manutenção do ${palavra}`,
    contratante: loja,
    contratado: dadosContratado().nome,
    servicos: SERVICOS,
    valorCents,
    valorTexto: brl(valorCents),
    implantacaoCents: implantacao,
    implantacaoTexto: brl(implantacao),
    textoImplantacao:
      `Produção e implantação do link (site, painel e cadastro inicial): ${brl(implantacao)}, em pagamento único.`,
    textoMensalidade: `Manutenção mensal do link: ${brl(valorCents)} por mês, com vencimento todo dia ${diaVencimento}.`,
    diaVencimento,
    inicio,
    extras: (clausulasExtras || '').trim(),
    textoRenovacao:
      'O contrato terá renovação mensal, podendo ser cancelado por qualquer uma das partes mediante aviso prévio.',
    textoAceite:
      'Ao aceitar este contrato, a contratante declara estar de acordo com os serviços e valores estabelecidos.',
    contratadoDados: dadosContratado(),
  };
}

/** Código de autenticação da assinatura. */
function gerarHash({ contratoTexto, loja, nome, documento, assinadoEm }) {
  return crypto
    .createHash('sha256')
    .update([contratoTexto, loja, nome, documento, assinadoEm].join('|'))
    .digest('hex')
    .slice(0, 32)
    .toUpperCase()
    .replace(/(.{8})(?=.)/g, '$1-');
}

/** Texto puro — é isso que fica registrado e "lacrado" pelo hash. */
function textoPlano(c) {
  return [
    c.titulo,
    c.subtitulo,
    `Contratante: ${c.contratante}`,
    `Contratado: ${c.contratado}`,
    'Serviços: ' + c.servicos.join(' '),
    c.textoImplantacao,
    c.textoMensalidade,
    c.textoRenovacao,
    c.extras || '',
    c.textoAceite,
  ]
    .filter(Boolean)
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { montarContrato, gerarHash, textoPlano, brl, dataBR, CONTRATADO, SERVICOS, dadosContratado };
