'use strict';

/**
 * Utilitários de teste: servidor HTTP que imita a API de Chat Completions da
 * OpenAI. Permite exercitar o SDK oficial e todo o fluxo do backend sem
 * consumir créditos nem depender de rede.
 */

const http = require('node:http');

const iniciarProvedorFalso = async () => {
  const estado = {
    modo: 'ok', // ok | erro500 | erro401 | cota | lento | vazio
    requisicoes: [],
    atrasoMs: 0
  };

  const servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (parte) => { corpo += parte; });
    req.on('end', () => {
      const json = corpo ? JSON.parse(corpo) : {};
      estado.requisicoes.push({ url: req.url, headers: req.headers, corpo: json });

      const responder = (status, dados) => {
        if (res.writableEnded || res.destroyed) return;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(dados));
      };

      const sucesso = (conteudo) => responder(200, {
        id: 'chatcmpl-teste',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: json.model,
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: conteudo } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });

      switch (estado.modo) {
        case 'erro500':
          return responder(500, { error: { message: 'falha interna do provedor', type: 'server_error' } });
        case 'erro401':
          return responder(401, { error: { message: 'Incorrect API key provided: sk-xxx', type: 'invalid_request_error', code: 'invalid_api_key' } });
        case 'cota':
          return responder(429, { error: { message: 'You exceeded your current quota', type: 'insufficient_quota', code: 'insufficient_quota' } });
        case 'vazio':
          return sucesso('');
        case 'lento':
          return setTimeout(() => sucesso('resposta tardia'), estado.atrasoMs);
        default: {
          const ultima = json.messages?.[json.messages.length - 1]?.content || '';
          return setTimeout(() => sucesso(`Resposta simulada para: ${ultima}`), estado.atrasoMs);
        }
      }
    });
  });

  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const { port } = servidor.address();

  return {
    estado,
    baseUrl: `http://127.0.0.1:${port}/v1`,
    fechar: () => new Promise((resolve) => {
      servidor.closeAllConnections?.();
      servidor.close(resolve);
    })
  };
};

/** Sobe o app Express em uma porta aleatória. */
const iniciarApp = async () => {
  const { criarApp } = require('../server/server');
  const logs = [];
  const registrar = {
    info: (m) => logs.push(['info', m]),
    warn: (m) => logs.push(['warn', m]),
    error: (m) => logs.push(['error', m])
  };
  const app = criarApp({ registrar });
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${port}`,
    logs,
    fechar: () => new Promise((resolve) => {
      servidor.closeAllConnections?.();
      servidor.close(resolve);
    })
  };
};

const postarChat = (url, corpo, headers = {}) =>
  fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
  });

module.exports = { iniciarProvedorFalso, iniciarApp, postarChat };
