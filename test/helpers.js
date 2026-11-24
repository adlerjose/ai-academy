'use strict';

/**
 * Utilitários de teste:
 * Mock oficial e rigoroso do SDK @google/genai com asserção global
 * que garante o uso exclusivo do modelo gemini-3.1-flash-lite.
 */

const { GoogleGenAI } = require('@google/genai');
require('dotenv').config({ quiet: true });

const MODELO_EXCLUSIVO = 'gemini-3.1-flash-lite';

/**
 * Instala mock no protótipo do SDK do Google GenAI com asserção global.
 * Qualquer tentativa de chamada com outro modelo dispara um erro imediato.
 */
const instalarMockGemini = () => {
  const estado = {
    modo: 'ok', // ok | erro500 | erro401 | cota | lento | vazio | erro404
    requisicoes: [],
    atrasoMs: 0
  };

  const clientExemplo = new GoogleGenAI({ apiKey: 'AIzaSyChaveTemporariaParaObterProto12345' });
  const proto = Object.getPrototypeOf(clientExemplo.models);

  const originalGenerate = proto.generateContentInternal;
  const originalStream = proto.generateContentStreamInternal;

  const asserirModeloExclusivo = (model) => {
    if (model !== MODELO_EXCLUSIVO) {
      throw new Error(
        `Violação de política: tentativa de uso de modelo não autorizado "${model}". Apenas "${MODELO_EXCLUSIVO}" é permitido.`
      );
    }
  };

  proto.generateContentInternal = async function (params) {
    asserirModeloExclusivo(params.model);
    estado.requisicoes.push({
      metodo: 'generateContent',
      model: params.model,
      contents: params.contents,
      config: params.config
    });

    if (params.config?.abortSignal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }

    if (estado.atrasoMs > 0) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, estado.atrasoMs);
        params.config?.abortSignal?.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }

    switch (estado.modo) {
      case 'erro500': {
        const err = new Error('falha interna do provedor');
        err.status = 500;
        throw err;
      }
      case 'erro401': {
        const err = new Error('API_KEY_INVALID: User not authenticated');
        err.status = 401;
        throw err;
      }
      case 'cota': {
        const err = new Error('RESOURCE_EXHAUSTED: You exceeded your current quota');
        err.status = 429;
        throw err;
      }
      case 'erro404': {
        const err = new Error('models/gemini-inexistente is not found for API version v1beta');
        err.status = 404;
        throw err;
      }
      case 'vazio':
        return {
          text: '',
          modelVersion: MODELO_EXCLUSIVO,
          candidates: [{ finishReason: 'STOP' }]
        };
      default: {
        const ultParte = params.contents?.at(-1)?.parts?.at(-1)?.text || '';
        const matchEstudante = ultParte.match(/Resposta do estudante:\s*(.+)$/s);
        const textoUsuario = matchEstudante ? matchEstudante[1] : ultParte;
        return {
          text: `Resposta simulada para: ${textoUsuario}`,
          modelVersion: MODELO_EXCLUSIVO,
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
        };
      }
    }
  };

  proto.generateContentStreamInternal = async function* (params) {
    asserirModeloExclusivo(params.model);
    estado.requisicoes.push({
      metodo: 'generateContentStream',
      model: params.model,
      contents: params.contents,
      config: params.config
    });

    if (params.config?.abortSignal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }

    switch (estado.modo) {
      case 'erro500': {
        const err = new Error('falha interna do provedor');
        err.status = 500;
        throw err;
      }
      case 'erro401': {
        const err = new Error('API_KEY_INVALID: User not authenticated');
        err.status = 401;
        throw err;
      }
      case 'cota': {
        const err = new Error('RESOURCE_EXHAUSTED: You exceeded your current quota');
        err.status = 429;
        throw err;
      }
      case 'erro404': {
        const err = new Error('models/gemini-inexistente is not found');
        err.status = 404;
        throw err;
      }
      default: {
        const ultParte = params.contents?.at(-1)?.parts?.at(-1)?.text || '';
        const matchEstudante = ultParte.match(/Resposta do estudante:\s*(.+)$/s);
        const textoUsuario = matchEstudante ? matchEstudante[1] : ultParte;

        yield {
          text: 'Resposta simulada para: ',
          modelVersion: MODELO_EXCLUSIVO
        };

        if (estado.atrasoMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, estado.atrasoMs));
        }

        yield {
          text: textoUsuario,
          modelVersion: MODELO_EXCLUSIVO,
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
        };
      }
    }
  };

  const restaurar = () => {
    proto.generateContentInternal = originalGenerate;
    proto.generateContentStreamInternal = originalStream;
  };

  return {
    estado,
    fechar: restaurar,
    restaurar
  };
};

const iniciarProvedorFalso = async () => instalarMockGemini();

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
    fechar: () =>
      new Promise((resolve) => {
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

module.exports = {
  instalarMockGemini,
  iniciarProvedorFalso,
  iniciarApp,
  postarChat,
  MODELO_EXCLUSIVO
};
