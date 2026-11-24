'use strict';

/**
 * AI Academy — Serviço de Inteligência Artificial do Turing.
 * Execução EXCLUSIVA com Google Gemini 3.1 Flash-Lite (@google/genai).
 * Política estrita de modelo único: sem fallbacks, sem retries em outros modelos e sem outros provedores.
 */

const { GoogleGenAI } = require('@google/genai');
const {
  config,
  iaConfigurada,
  TURING_MODEL,
  TURING_THINKING_LEVEL,
  TURING_PROVIDER
} = require('../config/aiConfig');

/** Erro de domínio seguro: transporta código estável e mensagem apropriada para o usuário. */
class ErroIA extends Error {
  constructor(codigo, status, mensagemUsuario, causa) {
    super(mensagemUsuario);
    this.name = 'ErroIA';
    this.codigo = codigo;
    this.status = status;
    if (causa) this.cause = causa;
  }
}

let clienteGemini = null;

const assegurarConfigurada = () => {
  if (!iaConfigurada()) {
    throw new ErroIA(
      'AI_NOT_CONFIGURED',
      503,
      'O mecanismo de inteligência do Turing ainda não foi configurado neste servidor. GEMINI_API_KEY ausente.'
    );
  }
};

/**
 * Retorna a instância única do cliente GoogleGenAI.
 * Utiliza o modo Gemini Developer API para chaves do Google AI Studio.
 */
const obterClienteGemini = () => {
  assegurarConfigurada();
  if (!clienteGemini) {
    clienteGemini = new GoogleGenAI({
      apiKey: config.ia.chaveApi
    });
  }
  return clienteGemini;
};

const resetarClienteGemini = () => {
  clienteGemini = null;
};

/** Mascara credenciais em mensagens técnicas para logs seguros. */
const sanitizarLog = (texto) =>
  String(texto || '')
    .replace(/AIza[A-Za-z0-9_-]{30,}/g, '[CHAVE_GEMINI_OCULTADA]')
    .replace(/sk-(proj-)?[A-Za-z0-9_-]{20,}/g, '[CHAVE_OPENAI_OCULTADA]')
    .replace(/AQ\.[A-Za-z0-9_-]{20,}/g, '[CHAVE_VERTEX_OCULTADA]');

/** Converte exceções do SDK @google/genai ou rede em ErroIA com códigos e status padronizados. */
const traduzirErro = (erro) => {
  if (erro instanceof ErroIA) return erro;

  const mensagemBruta = String(erro?.message || '');
  const mensagem = sanitizarLog(mensagemBruta);
  const statusHttp = Number(erro?.status || erro?.statusCode || erro?.code || 0);

  if (
    erro?.name === 'AbortError' ||
    erro?.name === 'TimeoutError' ||
    /timed?\s*out|aborted|deadline_exceeded/i.test(mensagem)
  ) {
    return new ErroIA('AI_TIMEOUT', 504, 'O mecanismo de inteligência demorou demais para responder.', erro);
  }

  if (
    statusHttp === 401 ||
    statusHttp === 403 ||
    /API_KEY_INVALID|UNAUTHENTICATED|PERMISSION_DENIED|invalid api key/i.test(mensagem)
  ) {
    return new ErroIA(
      'AI_AUTH_ERROR',
      503,
      'A autenticação com o mecanismo de inteligência falhou. Verifique a GEMINI_API_KEY.',
      erro
    );
  }

  if (
    statusHttp === 404 ||
    /models\/.*not found|model_unavailable|NOT_FOUND/i.test(mensagem)
  ) {
    return new ErroIA(
      'AI_MODEL_UNAVAILABLE',
      502,
      'O modelo de inteligência solicitado não está disponível no momento.',
      erro
    );
  }

  if (
    statusHttp === 429 ||
    /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(mensagem)
  ) {
    const semCota =
      erro?.code === 'insufficient_quota' ||
      /quota|billing|RESOURCE_EXHAUSTED/i.test(mensagem);
    return new ErroIA(
      semCota ? 'AI_QUOTA_EXCEEDED' : 'AI_RATE_LIMITED',
      semCota ? 503 : 429,
      semCota
        ? 'O limite de uso do mecanismo de inteligência foi atingido.'
        : 'O mecanismo de inteligência está recebendo muitas solicitações.',
      erro
    );
  }

  if (statusHttp === 400 || /INVALID_ARGUMENT|bad request/i.test(mensagem)) {
    return new ErroIA('AI_BAD_REQUEST', 502, 'O mecanismo de inteligência não conseguiu processar a solicitação.', erro);
  }

  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(mensagem)) {
    return new ErroIA('AI_UNAVAILABLE', 502, 'Não foi possível conectar ao mecanismo de inteligência.', erro);
  }

  if (statusHttp >= 500 && statusHttp < 600) {
    return new ErroIA('AI_UNAVAILABLE', 502, 'O mecanismo de inteligência está indisponível no momento.', erro);
  }

  return new ErroIA('INTERNAL_ERROR', 500, 'Ocorreu um erro inesperado ao processar a resposta.', erro);
};

/**
 * Converte histórico de mensagens para o formato de contents do Gemini,
 * garantindo alternância correta de turnos (user / model).
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

/**
 * Executa a chamada à API do Gemini utilizando EXCLUSIVAMENTE o modelo gemini-3.1-flash-lite.
 * Política de Modelo Único: Nenhuma tentativa em outro modelo é realizada em hipótese alguma.
 *
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array<{role:'user'|'assistant', content:string}>} params.mensagens
 * @param {AbortSignal} [params.signal]
 * @param {(chunk: string) => void} [params.onChunk]
 * @returns {Promise<{resposta:string, modelo:string, uso?:object, truncada?:boolean}>}
 */
const gerarResposta = async ({ systemPrompt, mensagens, signal, onChunk }) => {
  assegurarConfigurada();

  const ai = obterClienteGemini();
  const conteudos = converterMensagensParaGemini(mensagens);
  const inicio = Date.now();

  const configChamada = {
    systemInstruction: systemPrompt,
    maxOutputTokens: config.ia.maxTokensResposta,
    temperature: config.ia.temperatura,
    thinkingConfig: {
      thinkingLevel: TURING_THINKING_LEVEL
    },
    abortSignal: signal
  };

  try {
    if (typeof onChunk === 'function') {
      const stream = await ai.models.generateContentStream({
        model: TURING_MODEL,
        contents: conteudos,
        config: configChamada
      });

      let textoAcumulado = '';
      let motivoFinal = null;
      let metadataUso = null;
      let versaoModelo = TURING_MODEL;

      for await (const chunk of stream) {
        if (signal?.aborted) break;
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

      const duracao = Date.now() - inicio;
      const textoLimpo = textoAcumulado.trim();
      if (!textoLimpo) {
        throw new ErroIA('AI_EMPTY_RESPONSE', 502, 'O mecanismo de inteligência retornou uma resposta vazia.');
      }

      return {
        resposta: textoLimpo,
        modelo: versaoModelo || TURING_MODEL,
        uso: metadataUso
          ? {
              prompt_tokens: metadataUso.promptTokenCount,
              completion_tokens: metadataUso.candidatesTokenCount,
              total_tokens: metadataUso.totalTokenCount
            }
          : undefined,
        truncada: motivoFinal === 'MAX_TOKENS',
        duracaoMs: duracao
      };
    }

    const respostaBruta = await ai.models.generateContent({
      model: TURING_MODEL,
      contents: conteudos,
      config: configChamada
    });

    const duracao = Date.now() - inicio;
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
      modelo: respostaBruta?.modelVersion || TURING_MODEL,
      uso,
      truncada: candidato?.finishReason === 'MAX_TOKENS',
      duracaoMs: duracao
    };
  } catch (erro) {
    const duracao = Date.now() - inicio;
    const statusHttp = Number(erro?.status || erro?.statusCode || erro?.code || 0);
    const msgLimpa = sanitizarLog(erro?.message || '');

    // Registro interno técnico estruturado para diagnóstico sem vazamento de segredos
    console.error(
      `[gemini:erro] operacao=${typeof onChunk === 'function' ? 'stream' : 'sync'} ` +
        `modelo=${TURING_MODEL} status=${statusHttp || 'desconhecido'} ` +
        `duracao=${duracao}ms detalhe=${msgLimpa}`
    );

    // POLÍTICA DE MODELO ÚNICO: Falha imediata, sem tentar nenhum outro modelo
    throw traduzirErro(erro);
  }
};

/**
 * Retorna a configuração de raciocínio suportada pelo Gemini 3.1 Flash-Lite.
 */
const obterThinkingConfig = () => ({
  thinkingLevel: TURING_THINKING_LEVEL
});

module.exports = {
  gerarResposta,
  ErroIA,
  traduzirErro,
  converterMensagensParaGemini,
  obterThinkingConfig,
  obterClienteGemini,
  resetarClienteGemini,
  TURING_MODEL,
  TURING_THINKING_LEVEL,
  TURING_PROVIDER
};
