'use strict';

/**
 * Configuração centralizada do backend e da integração com o provedor de IA.
 * Todos os valores sensíveis ou ajustáveis vêm de variáveis de ambiente.
 */

const inteiro = (valor, padrao, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const numero = Number.parseInt(valor, 10);
  if (Number.isNaN(numero)) return padrao;
  return Math.min(Math.max(numero, min), max);
};

const decimal = (valor, padrao, { min, max }) => {
  const numero = Number.parseFloat(valor);
  if (Number.isNaN(numero)) return padrao;
  return Math.min(Math.max(numero, min), max);
};

const listaOrigens = (valor) =>
  String(valor || '')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean);

const porta = inteiro(process.env.PORT, 3000, { min: 1, max: 65535 });

const config = Object.freeze({
  servidor: Object.freeze({
    porta,
    host: process.env.HOST || '127.0.0.1',
    ambiente: process.env.NODE_ENV || 'development',
    // Origens adicionais autorizadas via CORS (o próprio servidor sempre é same-origin).
    origensPermitidas: listaOrigens(process.env.CORS_ORIGINS),
    // Necessário atrás de proxies reversos (Codespaces, Render, Nginx) para identificar o IP real no rate limiting.
    confiarProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === 'true' : process.env.CODESPACES === 'true'
  }),

  ia: Object.freeze({
    // A chave NUNCA é enviada ao navegador; é lida apenas aqui, no processo Node.
    chaveApi: (process.env.OPENAI_API_KEY || '').trim(),
    modelo: (process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim(),
    baseUrl: (process.env.OPENAI_BASE_URL || '').trim() || undefined,
    timeoutMs: inteiro(process.env.OPENAI_TIMEOUT_MS, 25000, { min: 1000, max: 120000 }),
    maxRetries: inteiro(process.env.OPENAI_MAX_RETRIES, 1, { min: 0, max: 5 }),
    maxTokensResposta: inteiro(process.env.OPENAI_MAX_OUTPUT_TOKENS, 700, { min: 64, max: 4000 }),
    temperatura: decimal(process.env.OPENAI_TEMPERATURE, 0.6, { min: 0, max: 1.5 })
  }),

  limites: Object.freeze({
    // Tamanho máximo de uma mensagem individual (caracteres).
    maxCaracteresMensagem: inteiro(process.env.CHAT_MAX_MESSAGE_CHARS, 1000, { min: 50, max: 8000 }),
    // Quantidade máxima de mensagens do histórico aceitas por requisição.
    maxMensagensHistorico: inteiro(process.env.CHAT_MAX_HISTORY_MESSAGES, 20, { min: 2, max: 60 }),
    // Soma máxima de caracteres de todo o histórico enviado.
    maxCaracteresHistorico: inteiro(process.env.CHAT_MAX_HISTORY_CHARS, 12000, { min: 1000, max: 60000 }),
    // Rate limiting por IP.
    janelaRateLimitMs: inteiro(process.env.RATE_LIMIT_WINDOW_MS, 60000, { min: 1000 }),
    maxRequisicoesJanela: inteiro(process.env.RATE_LIMIT_MAX, 15, { min: 1 }),
    // Requisições simultâneas ao provedor (global e por IP).
    maxConcorrenciaGlobal: inteiro(process.env.CHAT_MAX_CONCURRENT, 8, { min: 1, max: 200 }),
    maxConcorrenciaPorIp: inteiro(process.env.CHAT_MAX_CONCURRENT_PER_IP, 1, { min: 1, max: 10 })
  })
});

const iaConfigurada = () => config.ia.chaveApi.length > 0;

module.exports = { config, iaConfigurada };
