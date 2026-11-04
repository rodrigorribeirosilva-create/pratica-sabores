'use strict';
// Planos e pagamentos MANUAIS da Império. Não processa cartão nem salva dados financeiros sensíveis.
const express = require('express');
const {db} = require('./db');
const {requireAuth, requireDono} = require('./auth');
const storage = require('./storage');
const router = express.Router();
router.use('/imperio-planos', requireAuth, requireDono, (req,res,next) => req.store.slug === 'imperio-barber' ? next() : res.status(404).json({error:'Não encontrado.'}));
const validoId = x => Number.isSafeInteger(Number(x)) && Number(x) > 0;
const valorOk = (v, minimo=0) => Number.isSafeInteger(v) && v >= minimo && v <= 100000000;
const dataOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s+'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s;
const hoje = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const limpar = (v, max) => String(v || '').trim().slice(0,max);
const formas = ['pix','dinheiro','cartao_credito','cartao_debito','transferencia','outro'];
// Somente caminhos gerados pelo upload da própria Império; nunca URLs de outra loja.
function imagemValida(v) {
  if (typeof v !== 'string' || v.length > 1000) return false;
  if (!v) return true;
  if (['/img/imperio-planos/corte-barba-sobrancelha.jpg','/img/imperio-planos/cabelo-sobrancelha.jpg','/img/imperio-planos/raspar-barba-sobrancelha.jpg'].includes(v)) return true;
  const nome = String(v).split('/').pop();
  if (!/^\d+-[a-f0-9]{12}\.(?:jpg|png|webp|gif|avif)$/.test(nome)) return false;
  return v === '/uploads/imperio-barber/' + nome || (storage.ATIVO && v === storage.publicUrl('imperio-barber/' + nome));
}
function erroConflito(e,res) { if (String(e.code||'').startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({error:'Já existe um registro igual. Confira os dados antes de tentar novamente.'}); console.error('[imperio-planos]',e.message); return res.status(500).json({error:'Não foi possível salvar. Tente novamente.'}); }
router.get('/imperio-planos/dados', (req,res) => {
  const sid=req.store.id;
  const planos=db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM imperio_assinaturas a WHERE a.store_id=p.store_id AND a.plano_id=p.id AND a.status='ativa') AS assinantes FROM imperio_planos p WHERE p.store_id=? ORDER BY p.ativo DESC,p.nome`).all(sid);
  const assinaturas=db.prepare(`SELECT a.*, p.nome AS plano_nome, c.nome AS cliente_nome, c.telefone AS cliente_telefone FROM imperio_assinaturas a JOIN imperio_planos p ON p.id=a.plano_id AND p.store_id=a.store_id JOIN clientes c ON c.id=a.cliente_id AND c.store_id=a.store_id WHERE a.store_id=? ORDER BY a.status='ativa' DESC,c.nome,a.id DESC`).all(sid);
  const pagamentos=db.prepare('SELECT * FROM imperio_pagamentos_plano WHERE store_id=? ORDER BY vencimento DESC,id DESC').all(sid);
  res.set('Cache-Control','no-store');res.json({planos,assinaturas,pagamentos,hoje:hoje()});
});
router.post('/imperio-planos/planos',(req,res)=>{
 const b=req.body||{}, nome=limpar(b.nome,120), valor=b.preco_cents, imagem=b.imagem_url===undefined?'':b.imagem_url;
 const descricao=b.descricao===undefined?'':b.descricao, condicoes=b.condicoes===undefined?'':b.condicoes, quantidade=b.quantidade_servicos===undefined?null:b.quantidade_servicos;
 if(!nome || !valorOk(valor) || !imagemValida(imagem) || typeof descricao!=='string' || descricao.length>1000 || typeof condicoes!=='string' || condicoes.length>1000 || !(quantidade===null || (Number.isSafeInteger(quantidade) && quantidade>=1 && quantidade<=100)))return res.status(400).json({error:'Confira nome, valor, imagem, descrição, condições e quantidade do plano.'});
 try {let r=db.prepare('INSERT INTO imperio_planos(store_id,nome,preco_cents,imagem_url,descricao,condicoes,quantidade_servicos) VALUES(?,?,?,?,?,?,?)').run(req.store.id,nome,valor,imagem,descricao.trim(),condicoes.trim(),quantidade);res.json({ok:true,id:Number(r.lastInsertRowid)});}catch(e){return erroConflito(e,res)}
});
router.put('/imperio-planos/planos/:id',(req,res)=>{
 const sid=req.store.id,id=Number(req.params.id),p=db.prepare('SELECT * FROM imperio_planos WHERE store_id=? AND id=?').get(sid,id);if(!p)return res.status(404).json({error:'Plano não encontrado.'});
 const b=req.body||{},nome=b.nome===undefined?p.nome:limpar(b.nome,120),valor=b.preco_cents===undefined?p.preco_cents:b.preco_cents,ativo=b.ativo===undefined?p.ativo:b.ativo===true?1:b.ativo===false?0:-1,imagem=b.imagem_url===undefined?p.imagem_url:b.imagem_url;
 const descricao=b.descricao===undefined?p.descricao:b.descricao,condicoes=b.condicoes===undefined?p.condicoes:b.condicoes,quantidade=b.quantidade_servicos===undefined?p.quantidade_servicos:b.quantidade_servicos;
 if(!nome||!valorOk(valor)||ativo<0||(imagem!==p.imagem_url&&!imagemValida(imagem))||typeof descricao!=='string'||descricao.length>1000||typeof condicoes!=='string'||condicoes.length>1000||!(quantidade===null||(Number.isSafeInteger(quantidade)&&quantidade>=1&&quantidade<=100)))return res.status(400).json({error:'Confira nome, valor, imagem, status, descrição, condições e quantidade do plano.'});
 try{db.prepare("UPDATE imperio_planos SET nome=?,preco_cents=?,ativo=?,imagem_url=?,descricao=?,condicoes=?,quantidade_servicos=?,atualizado_em=datetime('now') WHERE store_id=? AND id=?").run(nome,valor,ativo,imagem,descricao.trim(),condicoes.trim(),quantidade,sid,id);res.json({ok:true});}catch(e){return erroConflito(e,res)}
});
router.post('/imperio-planos/assinaturas',(req,res)=>{
 const b=req.body||{},sid=req.store.id,plano=Number(b.plano_id),cliente=Number(b.cliente_id),valor=b.valor_cents,inicio=String(b.inicio||''),venc=String(b.proximo_vencimento||''),obs=limpar(b.observacao,500);
 if(!validoId(plano)||!validoId(cliente)||!valorOk(valor)||!dataOk(inicio)||(venc&&!dataOk(venc)))return res.status(400).json({error:'Confira cliente, plano, valor e datas.'});
 if(!db.prepare('SELECT id FROM imperio_planos WHERE id=? AND store_id=? AND ativo=1').get(plano,sid)||!db.prepare('SELECT id FROM clientes WHERE id=? AND store_id=?').get(cliente,sid))return res.status(400).json({error:'Cliente ou plano ativo não encontrado nesta loja.'});
 try{let r=db.prepare('INSERT INTO imperio_assinaturas(store_id,plano_id,cliente_id,valor_cents,inicio,proximo_vencimento,observacao) VALUES(?,?,?,?,?,?,?)').run(sid,plano,cliente,valor,inicio,venc,obs);res.json({ok:true,id:Number(r.lastInsertRowid)});}catch(e){return erroConflito(e,res)}
});
router.put('/imperio-planos/assinaturas/:id',(req,res)=>{
 const sid=req.store.id,id=Number(req.params.id),a=db.prepare('SELECT * FROM imperio_assinaturas WHERE store_id=? AND id=?').get(sid,id);if(!a)return res.status(404).json({error:'Assinatura não encontrada.'});
 const b=req.body||{},valor=b.valor_cents===undefined?a.valor_cents:b.valor_cents,inicio=b.inicio===undefined?a.inicio:String(b.inicio||''),venc=b.proximo_vencimento===undefined?a.proximo_vencimento:String(b.proximo_vencimento||''),obs=b.observacao===undefined?a.observacao:limpar(b.observacao,500),status=b.status===undefined?a.status:String(b.status);
 if(!valorOk(valor)||!dataOk(inicio)||(venc&&!dataOk(venc))||!['ativa','cancelada'].includes(status))return res.status(400).json({error:'Confira valor, datas e status.'});
 if(status==='ativa' && a.status!=='ativa' && !db.prepare('SELECT id FROM imperio_planos WHERE id=? AND store_id=? AND ativo=1').get(a.plano_id,sid))return res.status(409).json({error:'Reative o plano antes de reativar a assinatura.'});
 try{db.prepare("UPDATE imperio_assinaturas SET valor_cents=?,inicio=?,proximo_vencimento=?,observacao=?,status=?,atualizado_em=datetime('now') WHERE store_id=? AND id=?").run(valor,inicio,venc,obs,status,sid,id);res.json({ok:true});}catch(e){return erroConflito(e,res)}
});
router.post('/imperio-planos/pagamentos',(req,res)=>{
 const sid=req.store.id,b=req.body||{},id=Number(b.assinatura_id),venc=String(b.vencimento||''),valor=b.valor_cents,status=String(b.status||''),forma=String(b.forma||''),pago=String(b.pago_em||''),obs=limpar(b.observacao,500);
 const a=db.prepare('SELECT id,status FROM imperio_assinaturas WHERE store_id=? AND id=?').get(sid,id);
 if(!a)return res.status(404).json({error:'Assinatura não encontrada.'});
 if(a.status!=='ativa')return res.status(409).json({error:'A assinatura está cancelada. Reative antes de registrar outra cobrança.'});
 if(!dataOk(venc)||!valorOk(valor,1)||!['pendente','pago'].includes(status)||(forma&&!formas.includes(forma))||(status==='pago'&&(!formas.includes(forma)||!dataOk(pago)||pago>hoje()))||(status==='pendente'&&pago))return res.status(400).json({error:'Confira vencimento, valor, forma e data do recebimento.'});
 try{let r=db.prepare('INSERT INTO imperio_pagamentos_plano(store_id,assinatura_id,vencimento,valor_cents,forma,status,pago_em,observacao) VALUES(?,?,?,?,?,?,?,?)').run(sid,id,venc,valor,forma,status,pago,obs);res.json({ok:true,id:Number(r.lastInsertRowid)});}catch(e){return erroConflito(e,res)}
});
router.put('/imperio-planos/pagamentos/:id',(req,res)=>{
 const sid=req.store.id,id=Number(req.params.id),p=db.prepare('SELECT * FROM imperio_pagamentos_plano WHERE store_id=? AND id=?').get(sid,id);if(!p)return res.status(404).json({error:'Pagamento não encontrado.'});
 const b=req.body||{},status=String(b.status||''),forma=String(b.forma||p.forma||''),pago=String(b.pago_em||'');
 if(status==='pago'&&p.status==='pendente'){
  if(!formas.includes(forma)||!dataOk(pago)||pago>hoje())return res.status(400).json({error:'Informe a forma e uma data válida de recebimento.'});
  db.prepare("UPDATE imperio_pagamentos_plano SET status='pago',forma=?,pago_em=?,atualizado_em=datetime('now') WHERE store_id=? AND id=? AND status='pendente'").run(forma,pago,sid,id);return res.json({ok:true});
 }
 if(status==='cancelado'&&['pendente','pago'].includes(p.status)){db.prepare("UPDATE imperio_pagamentos_plano SET status='cancelado',atualizado_em=datetime('now') WHERE store_id=? AND id=? AND status IN ('pendente','pago')").run(sid,id);return res.json({ok:true});}
 return res.status(409).json({error:'Transição de pagamento não permitida.'});
});
module.exports = {router};
