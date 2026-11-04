'use strict';

/**
 * Servidor da AI Academy.
 * - Serve o frontend estático (index.html, css/, js/) — e somente ele.
 * - Expõe a API do assistente Turing (POST /api/chat, GET /api/health).
 */

require('dotenv').config({ quiet: true });

const path = require('node:path');
const express = require('express');

const { config, iaConfigurada } = require('./config/aiConfig');
const { carregarCatalogo } = require('./services/catalogService');
const { construirSystemPrompt } = require('./config/turingPrompt');
const { criarRotaChat } = require('./routes/chat');
const { ErroIA } = require('./services/aiService');

const RAIZ = path.join(__dirname, '..');

/** Cabeçalhos de segurança aplicados a todas as respostas. */
const cabecalhosSeguranca = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      // 'unsafe-inline' é necessário para os atributos style="--cartao-indice" dos cards existentes.
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self' mailto:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'"
    ].join('; ')
  );
  next();
};

/**
 * CORS restritivo para /api: same-origin sempre é aceito; outras origens apenas
 * se listadas em CORS_ORIGINS. Requisições de origens não autorizadas são recusadas.
 */
const corsApi = (req, res, next) => {
  const origem = req.get('origin');
  if (!origem) return next(); // chamadas same-origin GET, curl, testes

  let mesmaOrigem = false;
  try {
    mesmaOrigem = new URL(origem).host === req.get('host');
  } catch {
    mesmaOrigem = false;
  }
  const permitida = mesmaOrigem || config.servidor.origensPermitidas.includes(origem);

  if (!permitida) {
    return next(new ErroIA('CORS_FORBIDDEN', 403, 'Origem não autorizada.'));
  }

  res.setHeader('Access-Control-Allow-Origin', origem);
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    return res.sendStatus(204);
  }
  return next();
};

/** Tratador central de erros: nunca expõe stack traces ou detalhes internos. */
const criarTratadorErros = (registrar) => (erro, req, res, next) => {
  if (res.headersSent) return next(erro);

  let status = 500;
  let codigo = 'INTERNAL_ERROR';
  let mensagem = 'Ocorreu um erro inesperado. Tente novamente em instantes.';

  if (erro instanceof ErroIA) {
    ({ status, codigo, message: mensagem } = erro);
  } else if (erro?.type === 'entity.too.large') {
    status = 413;
    codigo = 'PAYLOAD_TOO_LARGE';
    mensagem = 'A conversa enviada é grande demais. Inicie uma nova conversa.';
  } else if (erro?.type === 'entity.parse.failed') {
    status = 400;
    codigo = 'INVALID_JSON';
    mensagem = 'Formato de requisição inválido.';
  }

  if (status >= 500) {
    const causa = erro.cause || erro;
    // Registra apenas metadados úteis (nunca a chave ou o corpo completo do provedor).
    registrar.error(
      `[erro] ${codigo} (${status}) em ${req.method} ${req.originalUrl}: ` +
        `${causa?.name || 'Error'} ${causa?.status ? `status=${causa.status} ` : ''}${causa?.message || ''}`.trim()
    );
  } else if (status !== 400) {
    registrar.warn(`[aviso] ${codigo} (${status}) em ${req.method} ${req.originalUrl}`);
  }

  return res.status(status).json({ erro: { codigo, mensagem } });
};

const criarApp = ({ registrar = console } = {}) => {
  const cursos = carregarCatalogo();
  const systemPrompt = construirSystemPrompt(cursos);

  const app = express();
  app.disable('x-powered-by');
  if (config.servidor.confiarProxy) app.set('trust proxy', 1);

  app.use(cabecalhosSeguranca);

  // ---------- API ----------
  const api = express.Router();
  api.use(corsApi);
  api.use(express.json({ limit: '48kb' }));

  api.get('/health', (req, res) => {
    res.json({ status: 'ok', iaConfigurada: iaConfigurada(), cursos: cursos.length });
  });

  api.use(criarRotaChat({ systemPrompt, registrar }));

  api.use((req, res, next) => next(new ErroIA('NOT_FOUND', 404, 'Recurso não encontrado.')));
  app.use('/api', api);

  // ---------- Frontend estático (apenas diretórios públicos) ----------
  const opcoesEstaticas = { index: false, dotfiles: 'deny', maxAge: config.servidor.ambiente === 'production' ? '1h' : 0 };
  app.use('/css', express.static(path.join(RAIZ, 'css'), opcoesEstaticas));
  app.use('/js', express.static(path.join(RAIZ, 'js'), opcoesEstaticas));
  app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(RAIZ, 'index.html')));

  app.use((req, res) => res.status(404).type('text/plain').send('Página não encontrada.'));
  app.use(criarTratadorErros(registrar));

  app.locals.cursos = cursos;
  return app;
};

if (require.main === module) {
  let app;
  try {
    app = criarApp();
  } catch (erro) {
    console.error(`[falha] Não foi possível iniciar o servidor: ${erro.message}`);
    process.exit(1);
  }

  const { porta, host } = config.servidor;
  const servidor = app.listen(porta, host, () => {
    console.log(`\n  AI Academy rodando em http://${host === '0.0.0.0' ? 'localhost' : host}:${porta}`);
    console.log(`  Catálogo: ${app.locals.cursos.length} formações carregadas de index.html`);
    console.log(`  Modelo de IA: ${config.ia.modelo}`);
    if (!iaConfigurada()) {
      console.warn('  [aviso] OPENAI_API_KEY não configurada. O chat retornará erro até que a chave seja definida no arquivo .env.\n');
    } else {
      console.log('  Chave da API: configurada (mantida apenas no servidor)\n');
    }
  });

  servidor.on('error', (erro) => {
    console.error(
      erro.code === 'EADDRINUSE'
        ? `[falha] A porta ${porta} já está em uso. Defina outra porta em PORT no arquivo .env.`
        : `[falha] Erro no servidor: ${erro.message}`
    );
    process.exit(1);
  });

  const encerrar = () => servidor.close(() => process.exit(0));
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

module.exports = { criarApp };

