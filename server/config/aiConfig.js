'use strict';

/**
 * Configuração centralizada do backend e da integração com o provedor de IA.
 * Suporta Google Gemini / Vertex AI (@google/genai) e OpenAI (openai),
 * detectando automaticamente o provedor pela variável configurada ou pelo
 * formato da chave (ex.: "AQ...." → Vertex AI Express Mode; "AIza..." → Gemini API; "sk-..." → OpenAI).
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

const detectarProvedor = (provedorExplicito, chaveGemini, chaveOpenai, baseUrl) => {
  const explicito = (provedorExplicito || '').trim().toLowerCase();
  if (explicito === 'gemini' || explicito === 'google' || explicito === 'vertex') return 'gemini';
  if (explicito === 'openai') return 'openai';

  // Se houver baseURL customizada (ex.: testes locais ou proxy OpenAI-compatible), usa o cliente OpenAI.
  if (baseUrl) return 'openai';

  const chaveCandidata = chaveGemini || chaveOpenai;
  if (/^(AQ\.|AIza)/i.test(chaveCandidata)) return 'gemini';
  if (chaveGemini && !chaveOpenai) return 'gemini';
  return 'openai';
};

const lerConfig = () => {
  const porta = inteiro(process.env.PORT, 3000, { min: 1, max: 65535 });
  const chaveGemini = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const chaveOpenai = (process.env.OPENAI_API_KEY || '').trim();
  const chaveGenerica = (process.env.AI_API_KEY || '').trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || '').trim() || undefined;

  const provedor = detectarProvedor(
    process.env.AI_PROVIDER,
    chaveGemini || (/^(AQ\.|AIza)/i.test(chaveGenerica) ? chaveGenerica : ''),
    chaveOpenai || chaveGenerica,
    baseUrl
  );

  const chaveApi =
    provedor === 'gemini'
      ? chaveGemini || chaveGenerica || chaveOpenai
      : chaveOpenai || chaveGenerica || chaveGemini;

  const modeloPadrao = provedor === 'gemini' ? 'gemini-3.6-flash' : 'gpt-4.1-mini';
  const modeloEnv = (
    (provedor === 'gemini'
      ? process.env.GEMINI_MODEL || process.env.AI_MODEL || process.env.OPENAI_MODEL
      : process.env.OPENAI_MODEL || process.env.AI_MODEL || process.env.GEMINI_MODEL) || ''
  ).trim();

  // Se o provedor é Gemini mas o modelo ficou com um nome de GPT (ou vice-versa), usa o padrão do provedor.
  const modelo =
    modeloEnv && !(provedor === 'gemini' && /^(gpt-|o\d)/i.test(modeloEnv))
      ? modeloEnv
      : modeloPadrao;

  const vertexAi = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

  return Object.freeze({
    servidor: Object.freeze({
      porta,
      host: process.env.HOST || '127.0.0.1',
      ambiente: process.env.NODE_ENV || 'development',
      origensPermitidas: listaOrigens(process.env.CORS_ORIGINS),
      confiarProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === 'true' : process.env.CODESPACES === 'true'
    }),

    ia: Object.freeze({
      provedor,
      vertexAi,
      // A chave NUNCA é enviada ao navegador; é lida apenas aqui, no processo Node.
      chaveApi,
      modelo,
      baseUrl,
      timeoutMs: inteiro(process.env.AI_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS, 45000, {
        min: 1000,
        max: 120000
      }),
      maxRetries: inteiro(process.env.AI_MAX_RETRIES ?? process.env.OPENAI_MAX_RETRIES, 1, { min: 0, max: 5 }),
      maxTokensResposta: inteiro(
        process.env.AI_MAX_OUTPUT_TOKENS || process.env.OPENAI_MAX_OUTPUT_TOKENS,
        1200,
        { min: 64, max: 4000 }
      ),
      temperatura: decimal(process.env.AI_TEMPERATURE ?? process.env.OPENAI_TEMPERATURE, 0.6, {
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

const config = lerConfig();
const iaConfigurada = () => config.ia.chaveApi.length > 0;

module.exports = { config, iaConfigurada, lerConfig };
