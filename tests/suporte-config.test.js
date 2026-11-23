'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { obterConfiguracao, obterBaseUpload } = require('../src/suporte-config');

const configuracaoCompleta = {
  ROHELARI_SUPABASE_URL: 'https://nozmydlgpnorqmqhlfpm.supabase.co',
  ROHELARI_SUPABASE_ANON_KEY: 'test-anon-key',
  ROHELARI_SUPORTE_CHAVE: 'test-support-secret',
};

test('a integração só fica disponível com as três variáveis válidas', () => {
  assert.equal(obterConfiguracao({}), null);
  assert.equal(obterConfiguracao({ ...configuracaoCompleta, ROHELARI_SUPABASE_URL: 'http://nozmydlgpnorqmqhlfpm.supabase.co' }), null);
  assert.equal(obterConfiguracao({ ...configuracaoCompleta, ROHELARI_SUPABASE_URL: 'https://usuario@nozmydlgpnorqmqhlfpm.supabase.co' }), null);
  assert.equal(obterConfiguracao({ ...configuracaoCompleta, ROHELARI_SUPABASE_ANON_KEY: '' }), null);
  assert.equal(obterConfiguracao({ ...configuracaoCompleta, ROHELARI_SUPORTE_CHAVE: '  ' }), null);
});

test('normaliza a URL e não aceita caminhos, query strings ou fragmentos', () => {
  assert.deepEqual(
    obterConfiguracao({
      ...configuracaoCompleta,
      ROHELARI_SUPABASE_URL: '  https://nozmydlgpnorqmqhlfpm.supabase.co///  ',
      ROHELARI_SUPABASE_ANON_KEY: '  test-anon-key  ',
      ROHELARI_SUPORTE_CHAVE: '  test-support-secret  ',
    }),
    {
      origin: 'https://nozmydlgpnorqmqhlfpm.supabase.co',
      anon: 'test-anon-key',
      chave: 'test-support-secret',
    }
  );

  assert.equal(obterConfiguracao({ ...configuracaoCompleta, ROHELARI_SUPABASE_URL: 'https://example.supabase.co/rest/v1' }), null);
  assert.equal(obterConfiguracao({ ...configuracaoCompleta, ROHELARI_SUPABASE_URL: 'https://example.supabase.co?query=1' }), null);
  assert.equal(obterConfiguracao({ ...configuracaoCompleta, ROHELARI_SUPABASE_URL: 'https://example.supabase.co#fragment' }), null);
});

test('resolve uma base HTTPS para fotos no disco e usa a URL do Render como fallback', () => {
  assert.equal(obterBaseUpload({ SUPORTE_UPLOAD_BASE_URL: 'https://custom.example///' }), 'https://custom.example');
  assert.equal(obterBaseUpload({ PUBLIC_URL: 'https://public.example/' }), 'https://public.example');
  assert.equal(obterBaseUpload({ RENDER_EXTERNAL_URL: 'https://pratica-sabores.onrender.com' }), 'https://pratica-sabores.onrender.com');
  assert.equal(obterBaseUpload({ RENDER_EXTERNAL_URL: 'http://pratica-sabores.onrender.com' }), null);
  assert.equal(obterBaseUpload({ SUPORTE_UPLOAD_BASE_URL: 'https://custom.example/path' }), null);
});
