'use strict';
// Cartaz da Império: configuração isolada por loja. Sem afetar planos, clientes ou pagamentos.
const express = require('express');
const { db, getSetting, setSetting } = require('./db');
const { requireAuth, requireDono } = require('./auth');
const storage = require('./storage');
const admin = express.Router(), publico = express.Router();
const chave = 'imperio_cartaz_assinaturas';
const padrao = Object.freeze({ marca:'IMPÉRIO BARBER', titulo:'Venha conferir nossas promoções', descricao:'Economize com nossos planos e assinaturas.', botao:'VER PLANOS E ASSINATURAS →', imagem:'/img/imperio-planos/banner-assinaturas.jpg', revisao:0 });
function soImperio(req,res,next){if(req.store.slug!=='imperio-barber')return res.status(404).json({error:'Não encontrado.'});next();}
function imagemValida(v){
  if(typeof v!=='string'||v.length>1000)return false;
  if(v===''||v===padrao.imagem)return true;
  const nome=v.split('/').pop();
  if(!/^\d+-[a-f0-9]{12}\.(?:jpg|png|webp|gif|avif)$/.test(nome))return false;
  return v==='/uploads/imperio-barber/'+nome||(storage.ATIVO&&v===storage.publicUrl('imperio-barber/'+nome));
}
function ler(sid){const c=getSetting(sid,chave,null);return c&&typeof c==='object'?{...padrao,...c}: {...padrao};}
publico.use(soImperio);
publico.get('/',(req,res)=>{res.set('Cache-Control','no-store');res.json(ler(req.store.id));});
admin.use(requireAuth,requireDono,soImperio);
admin.get('/',(req,res)=>{res.set('Cache-Control','no-store');res.json(ler(req.store.id));});
admin.put('/',(req,res)=>{
  const b=req.body||{}, campos=[['marca',60],['titulo',100],['descricao',160],['botao',48]];
  if(!Number.isSafeInteger(b.revisao)||b.revisao<0||!campos.every(([k,max])=>typeof b[k]==='string'&&b[k].trim().length>0&&b[k].trim().length<=max)||!imagemValida(b.imagem))return res.status(400).json({error:'Confira os textos e a imagem do cartaz.'});
  try{
    const salvar=db.transaction(()=>{const atual=ler(req.store.id);if(atual.revisao!==b.revisao)return null;const novo={};campos.forEach(([k])=>{novo[k]=b[k].trim();});novo.imagem=b.imagem;novo.revisao=atual.revisao+1;setSetting(req.store.id,chave,novo);return novo;});
    const novo=salvar();if(!novo)return res.status(409).json({error:'O cartaz foi alterado em outra tela. Feche e abra novamente para atualizar antes de salvar.'});
    res.set('Cache-Control','no-store');res.json(novo);
  }catch(e){console.error('[imperio-cartaz]',e.message);res.status(500).json({error:'Não foi possível salvar o cartaz. Tente novamente.'});}
});
module.exports={admin,publico};
