'use strict';

/**
 * Ponto de entrada da função serverless na Vercel (/api).
 * Repassa as requisições para a aplicação Express exportada em server.js.
 */
const app = require('../server');

module.exports = app;
