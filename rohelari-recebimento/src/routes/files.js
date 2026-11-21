'use strict';
// Anexos e fotos de conferência — armazenamento FORA do público, acesso só autenticado e autorizado.
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db');
const auth = require('../auth');
const { audit } = require('../services');
const { cleanString } = require('../validate');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(String(file.originalname || '').toLowerCase()).slice(0, 8)),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED.has(file.mimetype)),
});

const router = express.Router();
router.use(auth.requireAuth);

async function loadApptScoped(req) {
  const { rows } = await db.query('SELECT * FROM appointments WHERE id=$1 AND network_id=$2', [req.params.id, req.ctx.networkId]);
  if (!rows.length) return null;
  const a = rows[0];
  const ok = req.ctx.isRedeAdmin || req.ctx.storeIds.includes(a.store_id) || req.ctx.supplierIds.includes(a.supplier_id);
  return ok ? a : false;
}

router.post('/appointments/:id/attachments', upload.array('files', 5), async (req, res, next) => {
  try {
    const a = await loadApptScoped(req); if (!a) return res.status(a === null ? 404 : 403).json({ error: 'sem_permissao' });
    if (!req.files?.length) return res.status(400).json({ error: 'nenhum_arquivo', message: 'Envie imagens (JPG/PNG/WEBP) ou PDF, até 10 MB cada.' });
    const { rows: rec } = await db.query('SELECT id FROM receiving_records WHERE appointment_id=$1', [a.id]);
    const inserted = [];
    for (const f of req.files) {
      const { rows } = await db.query(
        `INSERT INTO attachments(network_id, store_id, appointment_id, receiving_id, filename, mime, size_bytes, storage_key, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, filename, mime, size_bytes, created_at`,
        [req.ctx.networkId, a.store_id, a.id, rec[0]?.id || null, String(f.originalname || 'arquivo').slice(0, 200), f.mimetype, f.size, f.filename, req.ctx.user.id]);
      inserted.push(rows[0]);
    }
    await audit(req, 'anexo_enviado', 'attachments', a.id, { count: inserted.length, store_id: a.store_id });
    res.status(201).json({ attachments: inserted });
  } catch (e) { next(e); }
});

router.get('/attachments/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT * FROM attachments WHERE id=$1 AND network_id=$2', [req.params.id, req.ctx.networkId]);
    if (!rows.length) return res.status(404).json({ error: 'anexo_nao_encontrado' });
    const att = rows[0];
    let allowed = req.ctx.isRedeAdmin || req.ctx.storeIds.includes(att.store_id);
    if (!allowed && att.appointment_id) {
      const { rows: a } = await db.query('SELECT supplier_id, store_id FROM appointments WHERE id=$1', [att.appointment_id]);
      allowed = !!(a.length && (req.ctx.supplierIds.includes(a[0].supplier_id) || req.ctx.storeIds.includes(a[0].store_id)));
    }
    if (!allowed) return res.status(403).json({ error: 'sem_permissao' });
    const filePath = path.join(UPLOAD_DIR, path.basename(att.storage_key));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'arquivo_indisponivel' });
    res.setHeader('Content-Type', att.mime);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.filename)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
});

module.exports = router;
