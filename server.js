'use strict';

/**
 * Ponto de entrada principal da AI Academy para execução local e serverless (Vercel).
 * Importa a factory criarApp de ./server/server e exporta a instância Express via CommonJS.
 */

const { criarApp } = require('./server/server');
const { config, iaConfigurada } = require('./server/config/aiConfig');

const app = criarApp();

// Inicia o servidor HTTP apenas quando executado diretamente (ex.: node server.js ou npm start).
// Em ambientes serverless como a Vercel, o arquivo é importado como módulo e o Express é executado sob demanda.
if (require.main === module) {
  const { porta, host } = config.servidor;
  const servidor = app.listen(porta, host, () => {
    console.log(`\n  AI Academy rodando em http://${host === '0.0.0.0' ? 'localhost' : host}:${porta}`);
    console.log(`  Catálogo: ${app.locals.cursos?.length ?? 6} formações carregadas de index.html`);
    console.log(`  Provedor de IA: Google Gemini (${config.ia.modelo})`);
    if (!iaConfigurada()) {
      console.warn('  [aviso] Chave de API não configurada. Defina GEMINI_API_KEY no arquivo .env.\n');
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

module.exports = app;
