'use strict';

/**
 * Serviço de integração com o provedor de IA.
 * Suporta:
 *  - Google Gemini / Vertex AI via SDK oficial `@google/genai` (chaves `AQ....` ou `AIza...`);
 *  - OpenAI (e compatíveis) via SDK oficial `openai` (chaves `sk-...`).
 *
 * Responsável por montar a requisição, aplicar timeout e traduzir erros do
 * provedor em erros internos seguros (sem vazar detalhes ao cliente).
 */

const OpenAI = require('openai');
const { GoogleGenAI, ThinkingLevel } = require('@google/genai');
const { config, iaConfigurada } = require('../config/aiConfig');

/** Erro de domínio com código estável e status HTTP; a mensagem é segura para o usuário. */
class ErroIA extends Error {
  constructor(codigo, status, mensagemUsuario, causa) {
    super(mensagemUsuario);
    this.name = 'ErroIA';
    this.codigo = codigo;
    this.status = status;
    if (causa) this.cause = causa;
  }
}

let clienteOpenai = null;
const clientesGemini = new Map();

const assegurarConfigurada = () => {
  if (!iaConfigurada()) {
    throw new ErroIA(
      'AI_NOT_CONFIGURED',
      503,
      'O mecanismo de inteligência do Turing ainda não foi configurado neste servidor.'
    );
  }
};

const obterClienteOpenai = () => {
  assegurarConfigurada();
  if (!clienteOpenai) {
    clienteOpenai = new OpenAI({
      apiKey: config.ia.chaveApi,
      baseURL: config.ia.baseUrl,
      timeout: config.ia.timeoutMs,
      maxRetries: config.ia.maxRetries
    });
  }
  return clienteOpenai;
};

const obterClienteGemini = (vertexai = config.ia.vertexAi) => {
  assegurarConfigurada();
  const chaveCache = `${vertexai ? 'vertex' : 'dev'}:${config.ia.chaveApi}`;
  if (!clientesGemini.has(chaveCache)) {
    clientesGemini.set(
      chaveCache,
      new GoogleGenAI({
        apiKey: config.ia.chaveApi,
        vertexai
      })
    );
  }
  return clientesGemini.get(chaveCache);
};

// Modelos de raciocínio (série o*, gpt-5*) não aceitam o parâmetro `temperature`.
const aceitaTemperatura = (modelo) => !/^(o\d|gpt-5)/i.test(modelo);

/** Remove credenciais ou dados sensíveis de mensagens de log ou causas de erro. */
const sanitizarLog = (texto) =>
  String(texto || '')
    .replace(/AIza[A-Za-z0-9_-]{30,}/g, '[CHAVE_GEMINI_OCULTADA]')
    .replace(/sk-(proj-)?[A-Za-z0-9_-]{20,}/g, '[CHAVE_OPENAI_OCULTADA]')
    .replace(/AQ\.[A-Za-z0-9_-]{20,}/g, '[CHAVE_VERTEX_OCULTADA]');

/** Converte erros dos SDKs (OpenAI ou Google GenAI) / rede em ErroIA com mensagens amigáveis. */
const traduzirErro = (erro) => {
  if (erro instanceof ErroIA) return erro;

  const mensagem = sanitizarLog(erro?.message || '');
  const statusHttp = Number(erro?.status || erro?.statusCode || erro?.code || 0);

  if (
    erro instanceof OpenAI.APIConnectionTimeoutError ||
    erro?.name === 'AbortError' ||
    erro?.name === 'TimeoutError' ||
    /timed?\s*out|aborted|deadline_exceeded/i.test(mensagem)
  ) {
    return new ErroIA('AI_TIMEOUT', 504, 'O mecanismo de inteligência demorou demais para responder.', erro);
  }

  if (
    erro instanceof OpenAI.AuthenticationError ||
    erro instanceof OpenAI.PermissionDeniedError ||
    statusHttp === 401 ||
    statusHttp === 403 ||
    /API_KEY_INVALID|UNAUTHENTICATED|PERMISSION_DENIED|invalid api key/i.test(mensagem)
  ) {
    return new ErroIA(
      'AI_AUTH_ERROR',
      503,
      'O mecanismo de inteligência está com a configuração de acesso inválida.',
      erro
    );
  }

  if (
    erro instanceof OpenAI.RateLimitError ||
    statusHttp === 429 ||
    /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(mensagem)
  ) {
    const semCota =
      erro?.code === 'insufficient_quota' ||
      erro?.error?.code === 'insufficient_quota' ||
      /quota|billing/i.test(mensagem);
    return new ErroIA(
      semCota ? 'AI_QUOTA_EXCEEDED' : 'AI_RATE_LIMITED',
      semCota ? 503 : 429,
      semCota
        ? 'O limite de uso do mecanismo de inteligência foi atingido.'
        : 'O mecanismo de inteligência está recebendo muitas solicitações.',
      erro
    );
  }

  if (
    erro instanceof OpenAI.NotFoundError ||
    erro instanceof OpenAI.BadRequestError ||
    statusHttp === 400 ||
    statusHttp === 404
  ) {
    return new ErroIA('AI_BAD_REQUEST', 502, 'O mecanismo de inteligência não conseguiu processar a solicitação.', erro);
  }

  if (
    erro instanceof OpenAI.APIConnectionError ||
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(mensagem)
  ) {
    return new ErroIA('AI_UNAVAILABLE', 502, 'Não foi possível conectar ao mecanismo de inteligência.', erro);
  }

  if (erro instanceof OpenAI.APIError || (statusHttp >= 500 && statusHttp < 600)) {
    return new ErroIA('AI_UNAVAILABLE', 502, 'O mecanismo de inteligência está indisponível no momento.', erro);
  }

  return new ErroIA('INTERNAL_ERROR', 500, 'Ocorreu um erro inesperado ao processar a resposta.', erro);
};

/**
 * Converte a lista de mensagens `{ role: 'user'|'assistant', content }` para o
 * formato `contents` esperado pelo SDK `@google/genai`, garantindo que a
 * conversa comece com uma mensagem de `user` (a saudação inicial do assistente,
 * se presente no início, é preservada como contexto na primeira mensagem).
 */
const converterMensagensParaGemini = (mensagens) => {
  const conteudos = [];
  let prefixoAssistente = '';

  for (const item of mensagens) {
    if (conteudos.length === 0 && item.role === 'assistant') {
      prefixoAssistente = item.content;
      continue;
    }
    const role = item.role === 'assistant' ? 'model' : 'user';
    const texto =
      conteudos.length === 0 && prefixoAssistente
        ? `[Mensagem inicial já exibida por você ao estudante: "${prefixoAssistente}"]\n\nResposta do estudante: ${item.content}`
        : item.content;

    const anterior = conteudos[conteudos.length - 1];
    if (anterior && anterior.role === role) {
      anterior.parts.push({ text: texto });
    } else {
      conteudos.push({ role, parts: [{ text: texto }] });
    }
  }

  return conteudos;
};

const MODELOS_FALLBACK_GEMINI = [
  'gemini-2.5-flash'
];

/**
 * Retorna a configuração de raciocínio officially suportada pelo Gemini 3.1 Flash-Lite.
 * Utiliza exclusivamente thinkingLevel: 'MINIMAL' para priorizar a menor latência.
 * Nenhum parâmetro extra não suportado (ex.: includeThoughts) é enviado.
 */
const obterThinkingConfig = (modelo = '') => {
  return {
    thinkingLevel: 'MINIMAL'
  };
};

const gerarComGemini = async ({ systemPrompt, mensagens, signal, onChunk }) => {
  const conteudos = converterMensagensParaGemini(mensagens);
  const controladorTotal = new AbortController();
  const timerTotal = setTimeout(() => controladorTotal.abort(), config.ia.timeoutMs);
  const aoAbortarExterno = () => controladorTotal.abort();
  signal?.addEventListener('aborted', aoAbortarExterno, { once: true });
  signal?.addEventListener('abort', aoAbortarExterno, { once: true });

  const modelosParaTentar = [
    config.ia.modelo,
    ...MODELOS_FALLBACK_GEMINI.filter((m) => m !== config.ia.modelo)
  ];

  // Limite individual por tentativa para evitar que uma única chamada bloqueie o tempo limite.
  const timeoutPorTentativa = Math.min(config.ia.timeoutMs, Math.max(12000, Math.floor(config.ia.timeoutMs / 2)));

  const chamar = async (modelo, vertexai) => {
    const ai = obterClienteGemini(vertexai);
    const ctrlTentativa = new AbortController();
    const timerTentativa = setTimeout(() => ctrlTentativa.abort(), timeoutPorTentativa);
    const propagarAbort = () => ctrlTentativa.abort();
    controladorTotal.signal.addEventListener('abort', propagarAbort, { once: true });

    const configChamada = {
      systemInstruction: systemPrompt,
      maxOutputTokens: config.ia.maxTokensResposta,
      temperature: config.ia.temperatura,
      abortSignal: ctrlTentativa.signal
    };

    const thinkingConfig = obterThinkingConfig(modelo);
    if (thinkingConfig) {
      configChamada.thinkingConfig = thinkingConfig;
    }

    try {
      if (typeof onChunk === 'function') {
        const stream = await ai.models.generateContentStream({
          model: modelo,
          contents: conteudos,
          config: configChamada
        });

        let textoAcumulado = '';
        let motivoFinal = null;
        let metadataUso = null;
        let versaoModelo = modelo;

        for await (const chunk of stream) {
          if (controladorTotal.signal.aborted) break;
          const pedaco = chunk.text || '';
          if (pedaco) {
            textoAcumulado += pedaco;
            onChunk(pedaco);
          }
          if (chunk.candidates?.[0]?.finishReason) {
            motivoFinal = chunk.candidates[0].finishReason;
          }
          if (chunk.usageMetadata) {
            metadataUso = chunk.usageMetadata;
          }
          if (chunk.modelVersion) {
            versaoModelo = chunk.modelVersion;
          }
        }

        return {
          text: textoAcumulado,
          modelVersion: versaoModelo,
          candidates: [{ finishReason: motivoFinal }],
          usageMetadata: metadataUso
        };
      }

      return await ai.models.generateContent({
        model: modelo,
        contents: conteudos,
        config: configChamada
      });
    } catch (erroTentativa) {
      const msg = String(erroTentativa?.message || '');
      // Se um modelo legado de fallback não aceitar thinkingConfig, remove thinkingConfig (nunca injeta thinkingBudget: 0)
      if (configChamada.thinkingConfig && /thinkingLevel|thinkingConfig|unknown field/i.test(msg)) {
        delete configChamada.thinkingConfig;
        if (typeof onChunk === 'function') {
          const stream = await ai.models.generateContentStream({
            model: modelo,
            contents: conteudos,
            config: configChamada
          });
          let textoAcumulado = '';
          for await (const chunk of stream) {
            const pedaco = chunk.text || '';
            if (pedaco) {
              textoAcumulado += pedaco;
              onChunk(pedaco);
            }
          }
          return { text: textoAcumulado, modelVersion: modelo };
        }
        return await ai.models.generateContent({
          model: modelo,
          contents: conteudos,
          config: configChamada
        });
      }
      throw erroTentativa;
    } finally {
      clearTimeout(timerTentativa);
      controladorTotal.signal.removeEventListener('abort', propagarAbort);
    }
  };

  try {
    let respostaBruta;
    let modeloUsado = config.ia.modelo;
    let ultimoErro;

    for (const modeloCandidato of modelosParaTentar) {
      if (controladorTotal.signal.aborted) break;
      try {
        respostaBruta = await chamar(modeloCandidato, config.ia.vertexAi);
        modeloUsado = modeloCandidato;
        break;
      } catch (erroModelo) {
        ultimoErro = erroModelo;
        const msg = String(erroModelo?.message || '');
        const status = Number(erroModelo?.status || erroModelo?.statusCode || erroModelo?.code || 0);
        const msgLimpa = sanitizarLog(msg);

        // Registro interno técnico seguro (sem credenciais) para diagnóstico em observabilidade/Vercel
        console.error(
          `[gemini:erro] modelo=${modeloCandidato} status=${status || 'desconhecido'} detalhe=${msgLimpa}`
        );

        // Apenas erros transitórios de sobrecarga de serviço (503 / 429 com alta demanda) justificam fallback.
        // Erros de configuração, credenciais (401), permissão (403), parâmetros inválidos (400) ou cancelamento falham imediatamente.
        const ehTransitorio =
          status === 503 ||
          status === 429 ||
          /RESOURCE_EXHAUSTED|UNAVAILABLE|high demand/i.test(msg);

        if (!ehTransitorio || controladorTotal.signal.aborted) {
          throw erroModelo;
        }
        // Se for erro transitório de serviço, tenta no máximo o modelo de contingência
        continue;
      }
    }

    if (!respostaBruta && ultimoErro) throw ultimoErro;

    const texto = (respostaBruta?.text || '').trim();
    if (!texto) {
      throw new ErroIA('AI_EMPTY_RESPONSE', 502, 'O mecanismo de inteligência retornou uma resposta vazia.');
    }

    const candidato = respostaBruta?.candidates?.[0];
    const uso = respostaBruta?.usageMetadata
      ? {
          prompt_tokens: respostaBruta.usageMetadata.promptTokenCount,
          completion_tokens: respostaBruta.usageMetadata.candidatesTokenCount,
          total_tokens: respostaBruta.usageMetadata.totalTokenCount
        }
      : undefined;

    return {
      resposta: texto,
      modelo: respostaBruta?.modelVersion || modeloUsado,
      uso,
      truncada: candidato?.finishReason === 'MAX_TOKENS'
    };
  } finally {
    clearTimeout(timerTotal);
    signal?.removeEventListener('abort', aoAbortarExterno);
  }
};

const gerarComOpenai = async ({ systemPrompt, mensagens, signal, onChunk }) => {
  const openai = obterClienteOpenai();

  const corpo = {
    model: config.ia.modelo,
    messages: [{ role: 'system', content: systemPrompt }, ...mensagens],
    max_completion_tokens: config.ia.maxTokensResposta
  };
  if (aceitaTemperatura(config.ia.modelo)) corpo.temperature = config.ia.temperatura;

  if (typeof onChunk === 'function') {
    const stream = await openai.chat.completions.create(
      { ...corpo, stream: true },
      { signal }
    );
    let textoCompleto = '';
    let modelUsado = config.ia.modelo;
    for await (const parte of stream) {
      if (signal?.aborted) break;
      const delta = parte.choices?.[0]?.delta?.content || '';
      if (delta) {
        textoCompleto += delta;
        onChunk(delta);
      }
      if (parte.model) modelUsado = parte.model;
    }
    const textoLimpo = textoCompleto.trim();
    if (!textoLimpo) {
      throw new ErroIA('AI_EMPTY_RESPONSE', 502, 'O mecanismo de inteligência retornou uma resposta vazia.');
    }
    return {
      resposta: textoLimpo,
      modelo: modelUsado
    };
  }

  const conclusao = await openai.chat.completions.create(corpo, { signal });
  const escolha = conclusao.choices?.[0];
  const resposta = (escolha?.message?.content || '').trim();

  if (!resposta) {
    throw new ErroIA('AI_EMPTY_RESPONSE', 502, 'O mecanismo de inteligência retornou uma resposta vazia.');
  }

  return {
    resposta,
    modelo: conclusao.model,
    uso: conclusao.usage,
    truncada: escolha.finish_reason === 'length'
  };
};

/**
 * Envia a conversa ao modelo e retorna o texto da resposta.
 * Se onChunk for fornecido, executa via streaming chamando o callback a cada fragmento gerado.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array<{role:'user'|'assistant', content:string}>} params.mensagens Histórico já validado.
 * @param {AbortSignal} [params.signal] Cancelamento (ex.: cliente desconectou).
 * @param {(chunk: string) => void} [params.onChunk] Callback de streaming para visualização antecipada.
 * @returns {Promise<{resposta:string, modelo:string, uso?:object}>}
 */
const gerarResposta = async ({ systemPrompt, mensagens, signal, onChunk }) => {
  assegurarConfigurada();
  try {
    if (config.ia.provedor === 'gemini') {
      return await gerarComGemini({ systemPrompt, mensagens, signal, onChunk });
    }
    return await gerarComOpenai({ systemPrompt, mensagens, signal, onChunk });
  } catch (erro) {
    throw traduzirErro(erro);
  }
};

module.exports = {
  gerarResposta,
  ErroIA,
  traduzirErro,
  converterMensagensParaGemini,
  obterThinkingConfig,
  MODELOS_FALLBACK_GEMINI
};
