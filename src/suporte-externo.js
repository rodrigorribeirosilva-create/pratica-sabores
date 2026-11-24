'use strict';
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const storage = require('./storage');
const {resolveUploadDir, PERSISTENTE} = require('./paths');
const {requireAuth, requireDono} = require('./auth');
const {obterConfiguracao, obterBaseUpload} = require('./suporte-config');
const vinculo = require('./suporte-vinculo');
const router = express.Router();
const upload = multer({storage: multer.memoryStorage(), limits: {files: 3, fileSize: 5 * 1024 * 1024, fields: 2, fieldSize: 8192}}).array('fotos', 3);
const disponivel = () => Boolean(obterConfiguracao());
function proteger(req, res, next) {
  if (!disponivel()) return res.status(404).json({error:'Suporte indisponível no momento.'});
  if (req.method === 'POST') {
    const origin = req.get('origin');
    if (req.get('sec-fetch-site') === 'cross-site' || (origin && (() => { try { return new URL(origin).host !== req.get('host'); } catch { return true; } })()))
      return res.status(403).json({error:'Requisição não permitida.'});
  }
  next();
}
router.get('/suporte/config', requireAuth, requireDono, (req, res) => res.json({disponivel: disponivel()}));
router.use('/suporte', requireAuth, requireDono, proteger);
async function chamar(nome, dados) {
  const cfg = obterConfiguracao();
  if (!cfg) throw new Error('O atendimento está temporariamente indisponível.');
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(`${cfg.origin}/rest/v1/rpc/${nome}`, {method:'POST', headers:{apikey:cfg.anon, Authorization:`Bearer ${cfg.anon}`, 'Content-Type':'application/json'}, body:JSON.stringify({...dados,p_chave:cfg.chave}),signal:ctrl.signal,redirect:'error'});
    const j = await r.json().catch(() => null);
    if (!r.ok || (j && j.ok === false)) {
      const msg = j && typeof j.message === 'string' ? j.message.slice(0,500) : 'Não foi possível concluir o pedido agora.';
      throw new Error(msg);
    }
    return j;
  } finally {clearTimeout(timer);}
}
function erro(res, e, envio) {
  const msg = e.name === 'AbortError' || e instanceof TypeError ? (envio ? 'Não foi possível confirmar o envio. Confira seus pedidos antes de tentar novamente.' : 'Não foi possível carregar seus pedidos agora.') : e.message;
  return res.status(502).json({error:msg || 'Não foi possível concluir agora.'});
}
/* ---------------------------------------------------------------------
   VÍNCULO COM O MASTER
   O chamado aberto aqui passa a ficar ligado a esta loja (store_id). O
   Master enxerga de qual cardápio é o chamado e a resposta dele aparece
   neste painel imediatamente.
   --------------------------------------------------------------------- */
router.get('/suporte/vinculo', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const chamados = vinculo.chamadosDaLoja(req.store.id);
  res.json({
    loja: { id: req.store.id, slug: req.store.slug, name: req.store.name },
    novas: vinculo.respostasNovas(req.store.id),
    chamados,
  });
});

router.post('/suporte/vinculo/:id/visto', (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Chamado inválido.' });
  vinculo.marcarVisto(req.store.id, id);
  res.json({ ok: true, novas: vinculo.respostasNovas(req.store.id) });
});

router.get('/suporte/pedidos', async (req,res) => {
  try {const data = await chamar('suporte_externo_listar',{p_loja:req.store.slug}); if (!Array.isArray(data)) throw new Error('Não foi possível carregar seus pedidos agora.'); res.json(data);}
  catch(e) {erro(res,e,false);}
});
router.post('/suporte/pedidos', (req,res) => {
  upload(req,res,async (err) => {
    if (err) return res.status(400).json({error: err.code === 'LIMIT_FILE_SIZE' ? 'Cada foto deve ter até 5 MB.' : 'Envie no máximo 3 fotos válidas.'});
    const title = typeof req.body.titulo === 'string' ? req.body.titulo.trim() : '';
    const desc = typeof req.body.descricao === 'string' ? req.body.descricao.trim() : '';
    if ([...title].length < 3 || [...title].length > 120 || [...desc].length > 2000) return res.status(400).json({error:'Informe um título de 3 a 120 caracteres e um relato de até 2000 caracteres.'});
    const fotos = [];
    try {
      // Valida o conteúdo real e reprocessa a imagem, removendo metadados e conteúdo ativo.
      const processadas = [];
      for (const file of (req.files || [])) {
        const image = sharp(file.buffer, {limitInputPixels: 40000000, animated:false});
        let meta; try { meta = await image.metadata(); } catch { throw new Error('Envie apenas fotos JPG, PNG, WEBP, GIF ou AVIF válidas.'); }
        if (!['jpeg','png','webp','gif','avif','heif'].includes(meta.format)) throw new Error('Envie apenas fotos JPG, PNG, WEBP, GIF ou AVIF válidas.');
        try { processadas.push(await image.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer()); } catch { throw new Error('Envie apenas fotos JPG, PNG, WEBP, GIF ou AVIF válidas.'); }
      }
      for (const image of processadas) {
        const name = `suporte-${Date.now()}-${crypto.randomBytes(12).toString('hex')}.jpg`;
        let url;
        if (storage.ATIVO) url = await storage.salvarImagem(image,name,req.store.slug,'image/jpeg');
        else {
          if (!PERSISTENTE) throw new Error('Não foi possível salvar as fotos de forma permanente. Tente sem fotos ou procure atendimento.');
          const base = obterBaseUpload();
          if (!base) throw new Error('Não foi possível salvar as fotos de forma permanente. Tente sem fotos ou procure atendimento.');
          const dir=path.join(resolveUploadDir(),req.store.slug); await fs.mkdir(dir,{recursive:true}); await fs.writeFile(path.join(dir,name),image,{flag:'wx'});
          url=`${base}/uploads/${encodeURIComponent(req.store.slug)}/${name}`;
        }
        if (!/^https:\/\//i.test(url)) throw new Error('Não foi possível preparar as fotos para envio.');
        fotos.push(url);
      }
      const j=await chamar('suporte_externo_abrir',{p_loja:req.store.slug,p_titulo:title,p_descricao:desc,p_fotos:fotos});
      if (!j || j.ok !== true || !j.id) throw new Error('Não foi possível confirmar o envio. Confira seus pedidos antes de tentar novamente.');
      // Liga o chamado a esta loja: é isso que permite o Master responder
      // direto para o cardápio certo e a resposta aparecer aqui.
      try { vinculo.registrarChamado(req.store.id, j.id, {titulo:title, status:'aberta'}); }
      catch (e) { console.error('[suporte/vinculo]', e.message); }
      res.status(201).json({ok:true,id:j.id});
    } catch(e) {erro(res,e,true);}
  });
});
module.exports = router;
