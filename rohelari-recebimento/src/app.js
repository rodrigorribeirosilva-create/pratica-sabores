'use strict';
// Monta o Express app (sem escutar porta) — usado por server.js e pelos testes.
const path = require('path');
const express = require('express');
const { ready } = require('./migrate-run');
const { dbMode } = require('./db');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  next();
});
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'rohelari-recebimento', db: dbMode() }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/cadastros'));
app.use('/api', require('./routes/appointments'));
app.use('/api', require('./routes/insights'));
app.use('/api', require('./routes/files'));
app.use('/api', (req, res) => res.status(404).json({ error: 'rota_nao_encontrada' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));
// eslint-disable-next-line no-unused-vars
app.use('/api', (err, req, res, next) => { console.error('[erro]', err); res.status(err.status || 500).json({ error: 'erro_interno' }); });
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

module.exports = { app, ready };
