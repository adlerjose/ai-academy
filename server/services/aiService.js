'use strict';

/**
 * Serviço de integração com o provedor de IA (OpenAI, SDK oficial `openai`).
 * Responsável por montar a requisição, aplicar timeout e traduzir erros do
 * provedor em erros internos seguros (sem vazar detalhes ao cliente).
 */

const OpenAI = require('openai');
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

let cliente = null;

const obterCliente = () => {
  if (!iaConfigurada()) {
    throw new ErroIA(
      'AI_NOT_CONFIGURED',
      503,
      'O mecanismo de inteligência do Turing ainda não foi configurado neste servidor.'
    );
  }
  if (!cliente) {
    cliente = new OpenAI({
      apiKey: config.ia.chaveApi,
      baseURL: config.ia.baseUrl,
      timeout: config.ia.timeoutMs,
      maxRetries: config.ia.maxRetries
    });
  }
  return cliente;
};

// Modelos de raciocínio (série o*, gpt-5*) não aceitam o parâmetro `temperature`.
const aceitaTemperatura = (modelo) => !/^(o\d|gpt-5)/i.test(modelo);

/** Converte erros do SDK / rede em ErroIA com mensagens amigáveis. */
const traduzirErro = (erro) => {
  if (erro instanceof ErroIA) return erro;

  if (erro instanceof OpenAI.APIConnectionTimeoutError || erro?.name === 'AbortError') {
    return new ErroIA('AI_TIMEOUT', 504, 'O mecanismo de inteligência demorou demais para responder.', erro);
  }
  if (erro instanceof OpenAI.AuthenticationError || erro instanceof OpenAI.PermissionDeniedError) {
    return new ErroIA('AI_AUTH_ERROR', 503, 'O mecanismo de inteligência está com a configuração de acesso inválida.', erro);
  }
  if (erro instanceof OpenAI.RateLimitError) {
    const semCota = erro?.code === 'insufficient_quota' || erro?.error?.code === 'insufficient_quota';
    return new ErroIA(
      semCota ? 'AI_QUOTA_EXCEEDED' : 'AI_RATE_LIMITED',
      semCota ? 503 : 429,
      semCota
        ? 'O limite de uso do mecanismo de inteligência foi atingido.'
        : 'O mecanismo de inteligência está recebendo muitas solicitações.',
      erro
    );
  }
  if (erro instanceof OpenAI.NotFoundError || erro instanceof OpenAI.BadRequestError) {
    return new ErroIA('AI_BAD_REQUEST', 502, 'O mecanismo de inteligência não conseguiu processar a solicitação.', erro);
  }
  if (erro instanceof OpenAI.APIConnectionError) {
    return new ErroIA('AI_UNAVAILABLE', 502, 'Não foi possível conectar ao mecanismo de inteligência.', erro);
  }
  if (erro instanceof OpenAI.APIError) {
    return new ErroIA('AI_UNAVAILABLE', 502, 'O mecanismo de inteligência está indisponível no momento.', erro);
  }
  return new ErroIA('INTERNAL_ERROR', 500, 'Ocorreu um erro inesperado ao processar a resposta.', erro);
};

/**
 * Envia a conversa ao modelo e retorna o texto da resposta.
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array<{role:'user'|'assistant', content:string}>} params.mensagens Histórico já validado.
 * @param {AbortSignal} [params.signal] Cancelamento (ex.: cliente desconectou).
 * @returns {Promise<{resposta:string, modelo:string, uso?:object}>}
 */
const gerarResposta = async ({ systemPrompt, mensagens, signal }) => {
  const openai = obterCliente();

  const corpo = {
    model: config.ia.modelo,
    messages: [{ role: 'system', content: systemPrompt }, ...mensagens],
    max_completion_tokens: config.ia.maxTokensResposta
  };
  if (aceitaTemperatura(config.ia.modelo)) corpo.temperature = config.ia.temperatura;

  try {
    const conclusao = await openai.chat.completions.create(corpo, { signal });
    const escolha = conclusao.choices?.[0];
    const resposta = (escolha?.message?.content || '').trim();

    if (!resposta) {
      throw new ErroIA('AI_EMPTY_RESPONSE', 502, 'O mecanismo de inteligência retornou uma resposta vazia.');
    }

    return { resposta, modelo: conclusao.model, uso: conclusao.usage, truncada: escolha.finish_reason === 'length' };
  } catch (erro) {
    throw traduzirErro(erro);
  }
};

module.exports = { gerarResposta, ErroIA, traduzirErro };

