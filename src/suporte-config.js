'use strict';

/**
 * Configuração compartilhada pela interface da loja e pela caixa Master.
 * Os segredos permanecem no servidor; os chamadores só expõem se a
 * configuração está completa, nunca os valores.
 */
function obterConfiguracao(env = process.env) {
  const raw = String(env.ROHELARI_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const anon = String(env.ROHELARI_SUPABASE_ANON_KEY || '').trim();
  const chave = String(env.ROHELARI_SUPORTE_CHAVE || '').trim();
  let base;

  try {
    base = new URL(raw);
  } catch {
    return null;
  }

  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/' ||
    !anon ||
    !chave
  ) {
    return null;
  }

  return { origin: base.origin, anon, chave };
}

/**
 * URL pública para links de fotos no fallback de disco persistente.
 * O domínio do Render é usado automaticamente se não houver override.
 */
function obterBaseUpload(env = process.env) {
  const raw = String(env.SUPORTE_UPLOAD_BASE_URL || env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '')
    .trim()
    .replace(/\/+$/, '');
  let base;

  try {
    base = new URL(raw);
  } catch {
    return null;
  }

  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== '/'
  ) {
    return null;
  }

  return base.origin;
}

module.exports = { obterConfiguracao, obterBaseUpload };
