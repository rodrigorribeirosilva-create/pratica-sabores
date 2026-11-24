'use strict';
/**
 * Botão "Entrar no painel agora" na aba Lojas do master.
 *
 * Confere que o botão nasceu no card da LOJA (não em outro lugar), que ele é o
 * primeiro das ações, que o clique chama a rota certa e que a rota existe no
 * servidor criando a sessão da loja.
 *
 * Uso: node --test tests/entrar-painel-master.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const masterHtml = fs.readFileSync(path.join(__dirname, '../public/master.html'), 'utf8');
const rotasMaster = fs.readFileSync(path.join(__dirname, '../src/routes.master.js'), 'utf8');

test('o botão é o primeiro das ações do card da loja', () => {
  const acoes = masterHtml.indexOf('<div class="actions">');
  assert.ok(acoes > -1, 'o card da loja precisa ter a área de ações');

  const trecho = masterHtml.slice(acoes, acoes + 400);
  const primeiroBtn = trecho.match(/<button class="btn btn-sm[^"]*" data-act="([^"]+)"/);
  assert.ok(primeiroBtn, 'o card precisa começar com um botão');
  assert.equal(primeiroBtn[1], 'entrar');
  assert.match(trecho, /Entrar no painel agora/);
});

test('o clique chama POST /api/master/stores/:id/entrar', () => {
  assert.match(masterHtml, /if \(act === 'entrar'\)/);
  assert.match(masterHtml, /api\(`\/api\/master\/stores\/\$\{id\}\/entrar`, \{ method: 'POST' \}\)/);
  // aba aberta dentro do clique (senão o navegador bloqueia o pop-up)
  assert.match(masterHtml, /const aba = window\.open\('', '_blank'\)/);
});

test('loja desativada é avisada antes de abrir', () => {
  assert.match(masterHtml, /Se essa loja está desativada|Essa loja está desativada/);
});

test('a rota existe, exige master e cria a sessão da loja', () => {
  assert.match(rotasMaster, /router\.post\('\/stores\/:id\/entrar', requireMaster/);
  const inicio = rotasMaster.indexOf("'/stores/:id/entrar'");
  const corpo = rotasMaster.slice(inicio, rotasMaster.indexOf("\n});", inicio) + 4);
  assert.match(corpo, /setStoreSession\(res, store\.id\)/, 'precisa criar a sessão da loja');
  assert.match(corpo, /store\.active/, 'precisa recusar loja desativada');
  assert.match(corpo, /admin_path|`\/l\/\$\{store\.slug\}\/admin`/, 'devolve o endereço do painel');
});

test('a sessão da loja é importada no módulo do master', () => {
  assert.match(rotasMaster, /setStoreSession,/);
});
