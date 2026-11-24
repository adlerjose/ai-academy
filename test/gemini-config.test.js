'use strict';

/**
 * Testes unitários e de integração da configuração do Gemini 3.1 Flash-Lite:
 * - Modelo principal exatamente gemini-3.1-flash-lite
 * - Precedência de GEMINI_MODEL e AI_MODEL com descarte de modelos legados (ex.: gemini-3.5-flash)
 * - Configuração do Thinking Level exclusivamente como { thinkingLevel: 'MINIMAL' }
 * - Correção e validação do uso de Vertex AI conforme o tipo de chave (AIza vs AQ.)
 * - Estratégia de fallback resiliente e diagnóstico seguro de erros sem vazamento de chave
 * - Testes com pergunta simples, histórico, timeout, chave inválida e modelo inexistente
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { GoogleGenAI } = require('@google/genai');
const { lerConfig, recarregarConfig } = require('../server/config/aiConfig');
const {
  obterThinkingConfig,
  MODELOS_FALLBACK_GEMINI,
  converterMensagensParaGemini,
  traduzirErro
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
    recarregarConfig();
  }
});

test('Gemini: GEMINI_MODEL tem precedência sobre AI_MODEL', () => {
  const origEnv = { ...process.env };
  try {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyFakeKeyForTest1234567890';
    process.env.GEMINI_MODEL = 'gemini-3.1-flash-lite';
    process.env.AI_MODEL = 'gemini-3.5-flash'; // Configuração legada comum na Vercel

    const cfg = lerConfig();
    assert.equal(cfg.ia.modelo, 'gemini-3.1-flash-lite', 'GEMINI_MODEL deve prevalecer sobre AI_MODEL antigo');
  } finally {
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Gemini: modelos obsoletos herdados de versões anteriores são descartados em favor de gemini-3.1-flash-lite', () => {
  const origEnv = { ...process.env };
  try {
    delete process.env.GEMINI_MODEL;
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyFakeKeyForTest1234567890';
    process.env.AI_MODEL = 'gemini-3.5-flash';

    const cfg = lerConfig();
    assert.equal(cfg.ia.modelo, 'gemini-3.1-flash-lite', 'deve descartar gemini-3.5-flash e usar gemini-3.1-flash-lite');
  } finally {
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Gemini: AI_MODEL válido (ex.: gemini-2.5-flash) é respeitado quando não for obsoleto', () => {
  const origEnv = { ...process.env };
  try {
    delete process.env.GEMINI_MODEL;
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyFakeKeyForTest1234567890';
    process.env.AI_MODEL = 'gemini-2.5-flash';

    const cfg = lerConfig();
    assert.equal(cfg.ia.modelo, 'gemini-2.5-flash', 'modelo válido explícito deve ser respeitado');
  } finally {
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Gemini: chave do Google AI Studio (AIza...) nunca utiliza Vertex AI mesmo com flag ativada', () => {
  const origEnv = { ...process.env };
  try {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyChaveGoogleStudioValida12345';
    process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';

    const cfg = lerConfig();
    assert.equal(cfg.ia.vertexAi, false, 'chaves AIza devem utilizar Gemini Developer API');
  } finally {
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Gemini: chave do Vertex AI Express Mode (AQ...) ativa Vertex AI', () => {
  const origEnv = { ...process.env };
  try {
    delete process.env.GEMINI_API_KEY;
    process.env.AI_PROVIDER = 'gemini';
    process.env.AI_API_KEY = 'AQ.ExpressModeVertexKeySample12345';

    const cfg = lerConfig();
    assert.equal(cfg.ia.vertexAi, true, 'chaves AQ. devem utilizar Vertex AI');
  } finally {
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Gemini: Thinking Level configurado exclusivamente como { thinkingLevel: "MINIMAL" }', () => {
  const thinkingConfig = obterThinkingConfig('gemini-3.1-flash-lite');
  assert.deepEqual(thinkingConfig, { thinkingLevel: 'MINIMAL' });
  assert.equal(thinkingConfig.thinkingBudget, undefined, 'thinkingBudget não deve ser enviado');
  assert.equal(thinkingConfig.includeThoughts, undefined, 'includeThoughts não deve ser enviado');
});

test('Gemini: lista de fallbacks contém apenas contingência de emergência pontual (evita cascata lenta)', () => {
  assert.deepEqual(MODELOS_FALLBACK_GEMINI, ['gemini-2.5-flash']);
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

test('Tratamento de erros: API key inválida (401/UNAUTHENTICATED) traduz para AI_AUTH_ERROR (503)', () => {
  const erro401 = new Error('API_KEY_INVALID: User not authenticated');
  erro401.status = 401;
  const traduzido = traduzirErro(erro401);
  assert.equal(traduzido.codigo, 'AI_AUTH_ERROR');
  assert.equal(traduzido.status, 503);
  assert.ok(!traduzido.message.includes('API_KEY_INVALID'), 'mensagem segura para usuário');
});

test('Tratamento de erros: modelo inexistente (404/NOT_FOUND) traduz para AI_BAD_REQUEST (502)', () => {
  const erro404 = new Error('models/gemini-inexistente is not found for API version v1beta');
  erro404.status = 404;
  const traduzido = traduzirErro(erro404);
  assert.equal(traduzido.codigo, 'AI_BAD_REQUEST');
  assert.equal(traduzido.status, 502);
});

test('Tratamento de erros: timeout / abort traduz para AI_TIMEOUT (504)', () => {
  const erroTimeout = new Error('The operation was aborted');
  erroTimeout.name = 'AbortError';
  const traduzido = traduzirErro(erroTimeout);
  assert.equal(traduzido.codigo, 'AI_TIMEOUT');
  assert.equal(traduzido.status, 504);
});

test('Integração Gemini: chamada à geração utiliza exatamente gemini-3.1-flash-lite e thinkingLevel MINIMAL', async () => {
  const origEnv = { ...process.env };
  const client = new GoogleGenAI({ apiKey: 'AIzaSyChaveTesteValida12345' });
  const ModelsProto = Object.getPrototypeOf(client.models);
  const chamadas = [];

  const originalGenerate = ModelsProto.generateContentInternal;
  const originalStream = ModelsProto.generateContentStreamInternal;

  try {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyChaveTesteValida12345';
    delete process.env.AI_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    recarregarConfig();

    ModelsProto.generateContentInternal = async function (params) {
      chamadas.push({ method: 'generateContent', params });
      return {
        text: 'Olá! Sou Turing da AI Academy.',
        modelVersion: params.model,
        candidates: [{ finishReason: 'STOP' }]
      };
    };

    ModelsProto.generateContentStreamInternal = async function* (params) {
      chamadas.push({ method: 'generateContentStream', params });
      yield { text: 'Olá! ', modelVersion: params.model };
      yield { text: 'Sou Turing.', modelVersion: params.model };
    };

    const { gerarResposta } = require('../server/services/aiService');

    // 1. Pergunta simples síncrona
    const resultado = await gerarResposta({
      systemPrompt: 'Você é Turing',
      mensagens: [{ role: 'user', content: 'Olá' }]
    });

    assert.equal(resultado.resposta, 'Olá! Sou Turing da AI Academy.');
    assert.equal(resultado.modelo, 'gemini-3.1-flash-lite');
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].params.model, 'gemini-3.1-flash-lite');
    assert.deepEqual(chamadas[0].params.config.thinkingConfig, { thinkingLevel: 'MINIMAL' });

    // 2. Pergunta com streaming
    const pedacos = [];
    const resultadoStream = await gerarResposta({
      systemPrompt: 'Você é Turing',
      mensagens: [{ role: 'user', content: 'Quero um curso' }],
      onChunk: (p) => pedacos.push(p)
    });

    assert.equal(resultadoStream.resposta, 'Olá! Sou Turing.');
    assert.equal(resultadoStream.modelo, 'gemini-3.1-flash-lite');
    assert.deepEqual(pedacos, ['Olá! ', 'Sou Turing.']);
    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[1].params.model, 'gemini-3.1-flash-lite');
    assert.deepEqual(chamadas[1].params.config.thinkingConfig, { thinkingLevel: 'MINIMAL' });
  } finally {
    ModelsProto.generateContentInternal = originalGenerate;
    ModelsProto.generateContentStreamInternal = originalStream;
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Integração Gemini: erro 400 ou 401 não aciona fallback desnecessário', async () => {
  const origEnv = { ...process.env };
  const client = new GoogleGenAI({ apiKey: 'AIzaSyChaveTesteValida12345' });
  const ModelsProto = Object.getPrototypeOf(client.models);
  const chamadas = [];

  const originalGenerate = ModelsProto.generateContentInternal;
  try {
    process.env.AI_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'AIzaSyChaveTesteValida12345';
    delete process.env.AI_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    recarregarConfig();

    ModelsProto.generateContentInternal = async function (params) {
      chamadas.push(params.model);
      const erro = new Error('API_KEY_INVALID');
      erro.status = 401;
      throw erro;
    };

    const { gerarResposta } = require('../server/services/aiService');

    await assert.rejects(
      async () => {
        await gerarResposta({
          systemPrompt: 'Você é Turing',
          mensagens: [{ role: 'user', content: 'Olá' }]
        });
      },
      (erro) => {
        assert.equal(erro.codigo, 'AI_AUTH_ERROR');
        assert.equal(erro.status, 503);
        return true;
      }
    );

    // Garante que tentou apenas o modelo principal e não fez tentativas em fallbacks
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0], 'gemini-3.1-flash-lite');
  } finally {
    ModelsProto.generateContentInternal = originalGenerate;
    process.env = origEnv;
    recarregarConfig();
  }
});
