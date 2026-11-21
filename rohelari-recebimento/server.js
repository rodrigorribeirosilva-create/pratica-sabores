'use strict';
// ROHELARI RECEBIMENTO — servidor HTTP
const { app, ready } = require('./src/app');
const { dbMode } = require('./src/db');

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[erro]', err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: 'erro_interno', message: process.env.NODE_ENV === 'production' ? 'Erro interno. Tente novamente.' : String(err.message || err) });
});

const PORT = Number(process.env.PORT || 3100);
ready.then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ROHELARI RECEBIMENTO em http://0.0.0.0:${PORT} (db: ${dbMode()})`);
  });
}).catch(e => { console.error('[boot] falha na migração:', e); process.exit(1); });
