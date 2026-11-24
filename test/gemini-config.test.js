'use strict';

/**
 * Testes unitários da migração para o Gemini 3.1 Flash-Lite:
 * - Validação do modelo padrão como gemini-3.1-flash-lite
 * - Respeito à variável de ambiente AI_MODEL
 * - Configuração do Thinking Level como MINIMAL (@google/genai ThinkingLevel.MINIMAL)
 * - Compatibilidade do SDK @google/genai
 * - Otimização de contexto e preservação de histórico
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { ThinkingLevel, GoogleGenAI } = require('@google/genai');
const { lerConfig } = require('../server/config/aiConfig');
const {
  obterThinkingConfig,
  MODELOS_FALLBACK_GEMINI,
  converterMensagensParaGemini
} = require('../server/services/aiService');
const { validarCorpo } = require('../server/routes/chat');

test('Gemini: modelo padrão é gemini-3.1-flash-lite quando AI_PROVIDER=gemini', () => {
  const origEnv = { ...process.env };
  try {
    delete process.env.AI_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyFakeKeyForTest1234567890';

    const cfg = lerConfig();
    assert.equal(cfg.ia.provedor, 'gemini');
    assert.equal(cfg.ia.modelo, 'gemini-3.1-flash-lite', 'deve adotar gemini-3.1-flash-lite como padrão');
  } finally {
    process.env = origEnv;
  }
});

test('Gemini: AI_MODEL é estritamente respeitada como variável de ambiente', () => {
  const origEnv = { ...process.env };
  try {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyFakeKeyForTest1234567890';
    process.env.AI_MODEL = 'gemini-2.5-flash';

    const cfg = lerConfig();
    assert.equal(cfg.ia.modelo, 'gemini-2.5-flash', 'AI_MODEL customizado deve prevalecer');
  } finally {
    process.env = origEnv;
  }
});

test('Gemini: lista de fallbacks prioriza gemini-3.1-flash-lite e variantes de baixa latência', () => {
  assert.equal(MODELOS_FALLBACK_GEMINI[0], 'gemini-3.1-flash-lite');
  assert.ok(MODELOS_FALLBACK_GEMINI.includes('gemini-2.5-flash'));
  assert.ok(MODELOS_FALLBACK_GEMINI.includes('gemini-1.5-flash'));
});

test('Gemini: Thinking Level configurado como MINIMAL sem inclusão de pensamentos', () => {
  const thinkingConfig = obterThinkingConfig('gemini-3.1-flash-lite');
  assert.equal(ThinkingLevel.MINIMAL, 'MINIMAL');
  assert.equal(thinkingConfig.thinkingLevel, ThinkingLevel.MINIMAL);
  assert.equal(thinkingConfig.includeThoughts, false, 'pensamentos internos devem ser omitidos para menor latência');
});

test('Gemini SDK: instanciação e configuração de parâmetros suportada sem erros', () => {
  const cliente = new GoogleGenAI({ apiKey: 'AIzaSyFakeKeyTest' });
  assert.ok(cliente.models, 'models está presente no SDK');
  assert.equal(typeof cliente.models.generateContent, 'function');
  assert.equal(typeof cliente.models.generateContentStream, 'function');
});

test('Gemini: conversão de mensagens formata histórico adequadamente', () => {
  const mensagens = [
    { role: 'assistant', content: 'Olá! Sou Turing...' },
    { role: 'user', content: 'Tenho interesse em IA.' },
    { role: 'assistant', content: 'Qual seu nível com Python?' },
    { role: 'user', content: 'Intermediário.' }
  ];

  const conteudos = converterMensagensParaGemini(mensagens);
  assert.equal(conteudos[0].role, 'user', 'primeira mensagem deve ser user');
  assert.match(conteudos[0].parts[0].text, /Mensagem inicial já exibida/);
  assert.match(conteudos[0].parts[0].text, /Tenho interesse em IA/);
  assert.equal(conteudos[1].role, 'model');
  assert.equal(conteudos[2].role, 'user');
});

test('Contexto: perguntas simples e complexas preservam limite e continuidade', () => {
  // Pergunta simples
  const corpoSimples = { mensagem: 'Oi', historico: [] };
  const resSimples = validarCorpo(corpoSimples);
  assert.equal(resSimples.length, 1);
  assert.equal(resSimples[0].content, 'Oi');

  // Pergunta complexa com histórico extenso
  const historicoComplexo = [
    { role: 'assistant', content: 'Olá! Sou Turing...' },
    { role: 'user', content: 'Sou programador backend com 4 anos de experiência em Python e FastAPI.' },
    ...Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 ? 'user' : 'assistant',
      content: `Mensagem de diagnóstico número ${i} sobre tópicos pedagógicos e cursos.`
    }))
  ];

  const corpoComplexo = {
    mensagem: 'Qual formação do catálogo aborda agentes e qual a carga horária recomendada?',
    historico: historicoComplexo
  };

  const resComplexo = validarCorpo(corpoComplexo);
  assert.ok(resComplexo.length <= 20, 'número de mensagens deve respeitar o limite');

  // Garante que o perfil inicial do usuário permaneceu como âncora
  const encontrouPython = resComplexo.some((m) => /Python e FastAPI/.test(m.content));
  assert.ok(encontrouPython, 'deve preservar o perfil do estudante (Python e FastAPI)');

  // Garante que a mensagem atual é a última
  assert.equal(resComplexo.at(-1).content, corpoComplexo.mensagem);
});
