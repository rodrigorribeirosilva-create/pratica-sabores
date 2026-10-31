'use strict';
/**
 * Fotos na nuvem (Supabase Storage).
 *
 * No Render o disco é temporário: toda foto salva em /uploads desaparecia no
 * próximo deploy/reinício. Aqui a imagem vai para um bucket público do Supabase
 * e o banco guarda o endereço definitivo.
 *
 * Sem SUPABASE_URL/SUPABASE_KEY, cai no disco local (uso em desenvolvimento).
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const BUCKET = process.env.SUPABASE_BUCKET || 'ps-uploads';
const ATIVO = !!(SUPABASE_URL && SUPABASE_KEY);

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };

/** Endereço público (definitivo) da imagem dentro do bucket. */
function publicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

/**
 * Sobe uma imagem e devolve a URL pública.
 * @param {Buffer} buffer conteúdo
 * @param {string} filename nome final (ex.: 1793322-abc.jpg)
 * @param {string} folder pasta da loja (ex.: slug)
 */
async function salvarImagem(buffer, filename, folder, contentType) {
  const objectPath = `${folder}/${filename}`;
  const type = contentType || MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': type,
      'x-upsert': 'true',
      'Cache-Control': 'public, max-age=31536000',
    },
    body: buffer,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Falha ao enviar a foto para a nuvem (${res.status}) ${txt.slice(0, 120)}`);
  }
  return publicUrl(objectPath);
}

/** Baixa uma imagem da nuvem (usado para migrar fotos antigas do disco). */
async function baixarImagem(objectPath) {
  const res = await fetch(publicUrl(objectPath));
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { ATIVO, BUCKET, publicUrl, salvarImagem, baixarImagem };
