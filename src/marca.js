'use strict';
/**
 * "Marca d'água limpa": recebe o logotipo da loja e devolve a arte sem o fundo
 * claro (branco/creme), para aparecer grande no quadro do topo sem mancha.
 *
 * Regras:
 *  - PNG já transparente com arte escura  -> devolve o original (nada a fazer).
 *  - Imagem com fundo claro               -> alfa = 1 - brilho (o fundo some, a arte fica).
 *  - Foto / arte clara sem contraste      -> devolve o original.
 */
const sharp = require('sharp');

async function limparMarca(buffer) {
  const img = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  const { data, info } = await img
    .resize({ width: 700, height: 700, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels } = info;
  const px = Buffer.from(data);

  // Cor de fundo = cor mais comum nas bordas da imagem (o "fundo" do logotipo)
  const borda = [];
  for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 60))) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      borda.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 60))) {
    for (const x of [0, w - 1]) {
      const i = (y * w + x) * 4;
      borda.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  // média das bordas opacas (ignora o que já é transparente)
  let sr = 0, sg = 0, sb = 0, nb = 0;
  for (const [r, g, b] of borda) { sr += r; sg += g; sb += b; nb += 1; }
  const fundo = nb ? [sr / nb, sg / nb, sb / nb] : [255, 255, 255];

  // "Chroma key": quanto mais diferente do fundo, mais visível fica o traço.
  const PISO = 30;   // diferença mínima para começar a aparecer
  const LIMIAR = 62; // diferença em que o traço fica 100% visível
  for (let i = 0; i < px.length; i += 4) {
    const dr = px[i] - fundo[0];
    const dg = px[i + 1] - fundo[1];
    const db = px[i + 2] - fundo[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const alfa = Math.min(1, Math.max(0, (dist - PISO) / LIMIAR));
    px[i + 3] = Math.round(px[i + 3] * alfa);
  }

  // se sobrou quase nada de arte, é melhor manter a imagem original
  let opacos = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 40) opacos += 1;
  if (opacos / (w * h) < 0.004) return { png: null, motivo: 'pouca-arte' };

  const png = await sharp(px, { raw: { width: w, height: h, channels } }).png().toBuffer();
  return { png, motivo: 'limpa', largura: w, altura: h, meta };
}

/** Baixa uma imagem (nuvem ou disco) e devolve o buffer. */
async function baixarImagem(url, origem, uploadDir) {
  if (/^https?:\/\//i.test(url)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error('Não consegui baixar a imagem.');
    return Buffer.from(await r.arrayBuffer());
  }
  const fs = require('fs');
  const path = require('path');
  const rel = String(url).replace(/^\/uploads\//, '');
  const file = path.join(uploadDir, rel);
  if (!file.startsWith(uploadDir)) throw new Error('Caminho inválido.');
  if (fs.existsSync(file)) return fs.readFileSync(file);
  // uploads locais antigos podem estar em /img
  const alt = path.join(__dirname, '..', 'public', String(url).replace(/^\//, ''));
  if (fs.existsSync(alt)) return fs.readFileSync(alt);
  // imagem que já mora dentro de public (ex.: /img/logo.png)
  let publicDir = path.join(__dirname, '..', 'public');
  try {
    publicDir = require('./paths').PUBLIC_DIR || publicDir;
  } catch {}
  const pub = path.join(publicDir, String(url).replace(/^\//, ''));
  if (fs.existsSync(pub)) return fs.readFileSync(pub);
  const r = await fetch(origem + url).catch(() => null);
  if (r && r.ok) return Buffer.from(await r.arrayBuffer());
  throw new Error('Imagem não encontrada.');
}

module.exports = { limparMarca, baixarImagem };
