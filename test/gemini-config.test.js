'use strict';

/**
 * Testes unitários e de integração da configuração exclusiva do Gemini 3.1 Flash-Lite:
 * - Modelo único: gemini-3.1-flash-lite (invariável por ambiente)
 * - Provedor único: gemini
 * - Thinking Level fixo: { thinkingLevel: 'MINIMAL' } sem thinkingBudget
 * - Política de Zero Fallbacks e Zero Modelos Alternativos
 * - Asserção global de conformidade do modelo
 * - Diagnóstico seguro de erros sem vazamento de chave
 * - Testes com pergunta simples, histórico, timeout, chave inválida e modelo inexistente
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { GoogleGenAI } = require('@google/genai');
const {
  lerConfig,
  recarregarConfig,
  TURING_MODEL,
  TURING_THINKING_LEVEL,
  TURING_PROVIDER
} = require('../server/config/aiConfig');
const {
  obterThinkingConfig,
  converterMensagensParaGemini,
  traduzirErro
} = require('../server/services/aiService');
const { validarCorpo } = require('../server/routes/chat');
const { instalarMockGemini, MODELO_EXCLUSIVO } = require('./helpers');

test('Constantes Turing: valores fixos e centralizados para o modelo único', () => {
  assert.equal(TURING_MODEL, 'gemini-3.1-flash-lite');
  assert.equal(TURING_THINKING_LEVEL, 'MINIMAL');
  assert.equal(TURING_PROVIDER, 'gemini');
});

test('Configuração imutável: variáveis de ambiente arbitrárias não alteram o modelo nem o provedor', () => {
  const origEnv = { ...process.env };
  try {
    process.env.AI_MODEL = 'gpt-4o-mini';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    process.env.OPENAI_MODEL = 'gpt-4';
    process.env.AI_PROVIDER = 'openai';
    process.env.GEMINI_API_KEY = 'AIzaSyChaveTeste12345';

    const cfg = lerConfig();
    assert.equal(cfg.ia.provedor, 'gemini', 'o provedor deve ser exclusivamente gemini');
    assert.equal(cfg.ia.modelo, 'gemini-3.1-flash-lite', 'o modelo deve ser exclusivamente gemini-3.1-flash-lite');
    assert.equal(cfg.ia.thinkingLevel, 'MINIMAL', 'thinkingLevel deve ser fixo em MINIMAL');
  } finally {
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Política de Provedor Único: apenas GEMINI_API_KEY é lida; chaves OpenAI são ignoradas', () => {
  const origEnv = { ...process.env };
  try {
    delete process.env.GEMINI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-chave-antiga-openai-que-deve-ser-ignorada';

    const cfg = lerConfig();
    assert.equal(cfg.ia.chaveApi, '', 'chave da OpenAI não deve ser aceita');
  } finally {
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Thinking Config: configurado exclusivamente como { thinkingLevel: "MINIMAL" } sem thinkingBudget', () => {
  const thinkingConfig = obterThinkingConfig();
  assert.deepEqual(thinkingConfig, { thinkingLevel: 'MINIMAL' });
  assert.equal(thinkingConfig.thinkingBudget, undefined, 'thinkingBudget não deve existir');
  assert.equal(thinkingConfig.includeThoughts, undefined, 'includeThoughts não deve existir');
});

test('Asserção global do SDK: chamadas com modelos diferentes de gemini-3.1-flash-lite são bloqueadas', async () => {
  const mock = instalarMockGemini();
  try {
    const client = new GoogleGenAI({ apiKey: 'AIzaSyTesteChave' });

    await assert.rejects(
      async () => {
        await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: 'teste'
        });
      },
      /Violação de política: tentativa de uso de modelo não autorizado "gemini-2.5-flash"/
    );

    await assert.rejects(
      async () => {
        await client.models.generateContent({
          model: 'gpt-4o-mini',
          contents: 'teste'
        });
      },
      /Violação de política: tentativa de uso de modelo não autorizado "gpt-4o-mini"/
    );
  } finally {
    mock.restaurar();
  }
});

test('Gemini SDK: instanciação e métodos oficiais presentes', () => {
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

test('Tratamento de erros: modelo inexistente (404/NOT_FOUND) traduz para AI_MODEL_UNAVAILABLE (502)', () => {
  const erro404 = new Error('models/gemini-inexistente is not found for API version v1beta');
  erro404.status = 404;
  const traduzido = traduzirErro(erro404);
  assert.equal(traduzido.codigo, 'AI_MODEL_UNAVAILABLE');
  assert.equal(traduzido.status, 502);
});

test('Tratamento de erros: cota esgotada (429/RESOURCE_EXHAUSTED) traduz para AI_QUOTA_EXCEEDED (503)', () => {
  const erro429 = new Error('RESOURCE_EXHAUSTED: Quota exceeded for quota group');
  erro429.status = 429;
  const traduzido = traduzirErro(erro429);
  assert.equal(traduzido.codigo, 'AI_QUOTA_EXCEEDED');
  assert.equal(traduzido.status, 503);
});

test('Tratamento de erros: timeout / abort traduz para AI_TIMEOUT (504)', () => {
  const erroTimeout = new Error('The operation was aborted');
  erroTimeout.name = 'AbortError';
  const traduzido = traduzirErro(erroTimeout);
  assert.equal(traduzido.codigo, 'AI_TIMEOUT');
  assert.equal(traduzido.status, 504);
});

test('Integração Gemini: chamada síncrona e stream utilizam exclusivamente gemini-3.1-flash-lite e thinkingLevel MINIMAL', async () => {
  const origEnv = { ...process.env };
  const mock = instalarMockGemini();

  try {
    process.env.GEMINI_API_KEY = 'AIzaSyChaveTesteValida12345';
    recarregarConfig();

    const { gerarResposta } = require('../server/services/aiService');

    // 1. Pergunta simples síncrona
    const resultado = await gerarResposta({
      systemPrompt: 'Você é Turing',
      mensagens: [{ role: 'user', content: 'Olá' }]
    });

    assert.equal(resultado.resposta, 'Resposta simulada para: Olá');
    assert.equal(resultado.modelo, MODELO_EXCLUSIVO);
    assert.equal(mock.estado.requisicoes.length, 1);
    assert.equal(mock.estado.requisicoes[0].model, MODELO_EXCLUSIVO);
    assert.deepEqual(mock.estado.requisicoes[0].config.thinkingConfig, { thinkingLevel: 'MINIMAL' });

    // 2. Pergunta com streaming
    const pedacos = [];
    const resultadoStream = await gerarResposta({
      systemPrompt: 'Você é Turing',
      mensagens: [{ role: 'user', content: 'Quero um curso' }],
      onChunk: (p) => pedacos.push(p)
    });

    assert.equal(resultadoStream.resposta, 'Resposta simulada para: Quero um curso');
    assert.equal(resultadoStream.modelo, MODELO_EXCLUSIVO);
    assert.deepEqual(pedacos, ['Resposta simulada para: ', 'Quero um curso']);
    assert.equal(mock.estado.requisicoes.length, 2);
    assert.equal(mock.estado.requisicoes[1].model, MODELO_EXCLUSIVO);
    assert.deepEqual(mock.estado.requisicoes[1].config.thinkingConfig, { thinkingLevel: 'MINIMAL' });
  } finally {
    mock.restaurar();
    process.env = origEnv;
    recarregarConfig();
  }
});

test('Política de Tentativa Única: falha no modelo principal lança erro sem tentar modelos secundários', async () => {
  const origEnv = { ...process.env };
  const mock = instalarMockGemini();

  try {
    process.env.GEMINI_API_KEY = 'AIzaSyChaveTesteValida12345';
    recarregarConfig();

    mock.estado.modo = 'erro500';

    const { gerarResposta } = require('../server/services/aiService');

    await assert.rejects(
      async () => {
        await gerarResposta({
          systemPrompt: 'Você é Turing',
          mensagens: [{ role: 'user', content: 'Olá' }]
        });
      },
      (erro) => {
        assert.equal(erro.codigo, 'AI_UNAVAILABLE');
        assert.equal(erro.status, 502);
        return true;
      }
    );

    // Garante que realizou exatamente 1 requisição no modelo exclusivo e nenhuma outra tentativa
    assert.equal(mock.estado.requisicoes.length, 1);
    assert.equal(mock.estado.requisicoes[0].model, MODELO_EXCLUSIVO);
  } finally {
    mock.restaurar();
    process.env = origEnv;
    recarregarConfig();
  }
});
