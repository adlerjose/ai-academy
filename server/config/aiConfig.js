'use strict';

/**
 * AI Academy — Configuração Centralizada do Assistente Turing.
 * Modelo Exclusivo: Gemini 3.1 Flash-Lite (@google/genai).
 * Regra absoluta: sem provedores alternativos, sem fallbacks e sem troca de modelo.
 */

const TURING_MODEL = 'gemini-3.1-flash-lite';
const TURING_THINKING_LEVEL = 'MINIMAL';
const TURING_PROVIDER = 'gemini';

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

const lerConfig = () => {
  const porta = inteiro(process.env.PORT, 3000, { min: 1, max: 65535 });

  // A única credencial de IA aceita no projeto é GEMINI_API_KEY (lida exclusivamente no backend).
  const chaveApi = (process.env.GEMINI_API_KEY || '').trim();

  return Object.freeze({
    servidor: Object.freeze({
      porta,
      host: process.env.HOST || '127.0.0.1',
      ambiente: process.env.NODE_ENV || 'development',
      origensPermitidas: listaOrigens(process.env.CORS_ORIGINS),
      confiarProxy: process.env.TRUST_PROXY
        ? process.env.TRUST_PROXY === 'true'
        : process.env.CODESPACES === 'true' || process.env.VERCEL === '1'
    }),

    ia: Object.freeze({
      // Regra absoluta: modelo e provedor estritamente fixos.
      provedor: TURING_PROVIDER,
      modelo: TURING_MODEL,
      thinkingLevel: TURING_THINKING_LEVEL,
      // A chave NUNCA é enviada ao navegador; reside exclusivamente no processo Node.
      chaveApi,
      timeoutMs: inteiro(process.env.CHAT_TIMEOUT_MS, 30000, {
        min: 1000,
        max: 60000
      }),
      maxTokensResposta: inteiro(
        process.env.CHAT_MAX_OUTPUT_TOKENS,
        1200,
        { min: 64, max: 4000 }
      ),
      temperatura: decimal(process.env.CHAT_TEMPERATURE, 0.6, {
        min: 0,
        max: 1.5
      })
    }),

    limites: Object.freeze({
      maxCaracteresMensagem: inteiro(process.env.CHAT_MAX_MESSAGE_CHARS, 1000, { min: 50, max: 8000 }),
      maxMensagensHistorico: inteiro(process.env.CHAT_MAX_HISTORY_MESSAGES, 20, { min: 2, max: 60 }),
      maxCaracteresHistorico: inteiro(process.env.CHAT_MAX_HISTORY_CHARS, 12000, { min: 1000, max: 60000 }),
      janelaRateLimitMs: inteiro(process.env.RATE_LIMIT_WINDOW_MS, 60000, { min: 1000 }),
      maxRequisicoesJanela: inteiro(process.env.RATE_LIMIT_MAX, 15, { min: 1 }),
      maxConcorrenciaGlobal: inteiro(process.env.CHAT_MAX_CONCURRENT, 8, { min: 1, max: 200 }),
      maxConcorrenciaPorIp: inteiro(process.env.CHAT_MAX_CONCURRENT_PER_IP, 1, { min: 1, max: 10 })
    })
  });
};

let configAtual = lerConfig();
const recarregarConfig = () => {
  configAtual = lerConfig();
  return configAtual;
};
const iaConfigurada = () => configAtual.ia.chaveApi.length > 0;

const config = new Proxy({}, {
  get(target, prop) {
    return configAtual[prop];
  }
});

module.exports = {
  config,
  iaConfigurada,
  lerConfig,
  recarregarConfig,
  TURING_MODEL,
  TURING_THINKING_LEVEL,
  TURING_PROVIDER
};
