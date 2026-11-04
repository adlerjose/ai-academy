'use strict';

/** Cenários que exigem configuração própria (processo separado do node:test). */

const test = require('node:test');
const assert = require('node:assert/strict');
const { iniciarApp, postarChat } = require('./helpers');

let app;

test.before(async () => {
  process.env.OPENAI_API_KEY = '';
  process.env.RATE_LIMIT_MAX = '3';
  process.env.RATE_LIMIT_WINDOW_MS = '60000';
  app = await iniciarApp();
});

test.after(async () => {
  await app?.fechar();
});

test('sem OPENAI_API_KEY: health indica pendência e chat retorna AI_NOT_CONFIGURED (sem simular resposta)', async () => {
  const saude = await (await fetch(`${app.url}/api/health`)).json();
  assert.equal(saude.iaConfigurada, false);

  const r = await postarChat(app.url, { mensagem: 'Olá' });
  assert.equal(r.status, 503);
  const dados = await r.json();
  assert.equal(dados.erro.codigo, 'AI_NOT_CONFIGURED');
  assert.equal(dados.resposta, undefined);
});

test('rate limiting: excede o limite por janela e recebe 429 RATE_LIMITED', async () => {
  // Uma requisição já foi consumida no teste anterior (limite = 3).
  await postarChat(app.url, { mensagem: 'a' });
  await postarChat(app.url, { mensagem: 'b' });
  const r = await postarChat(app.url, { mensagem: 'c' });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).erro.codigo, 'RATE_LIMITED');
  assert.ok(r.headers.get('ratelimit') || r.headers.get('ratelimit-policy'), 'cabeçalhos padrão de rate limit');
});

