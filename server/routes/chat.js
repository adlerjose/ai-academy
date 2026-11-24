'use strict';

/**
 * Rota POST /api/chat
 *
 * Contrato:
 *   Requisição:  { "mensagem": string, "historico": [{ "role": "user"|"assistant", "content": string }] }
 *   Sucesso 200: { "resposta": string, "modelo": string }
 *   Erro 4xx/5xx:{ "erro": { "codigo": string, "mensagem": string } }
 */

const express = require('express');
const { rateLimit } = require('express-rate-limit');

const { config } = require('../config/aiConfig');
const { gerarResposta, ErroIA, traduzirErro } = require('../services/aiService');

const LIMITE_ABSOLUTO_ITENS_HISTORICO = 200; // acima disso a requisição é rejeitada sem processamento
const FATOR_TAMANHO_ASSISTENTE = 6; // respostas do Turing podem ser mais longas que as do usuário

// Remove caracteres de controle (exceto \n e \t) e normaliza quebras de linha.
const sanitizar = (texto) =>
  texto
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

const erroValidacao = (codigo, mensagem) => new ErroIA(codigo, 400, mensagem);

/**
 * Otimiza o histórico da conversa para manter a menor latência e consumo de tokens:
 * 1. Preserva a âncora inicial da conversa (mensagem diagnóstica com background do usuário).
 * 2. Mantém a janela deslizante mais recente para garantir coerência no diálogo atual.
 * 3. Encurta mensagens intermediárias do assistente excessivamente prolixas.
 * 4. Garante que o total de mensagens e caracteres respeite os limites configurados.
 */
const otimizarHistorico = (historico, mensagemAtual, maxMensagens, maxCaracteres) => {
  if (!historico.length) return [];

  const limiteMensagensHistorico = Math.max(1, maxMensagens - 1);
  let totalCaracteres = mensagemAtual.length;

  // Se o histórico cabe confortavelmente, apenas verifica limite de caracteres
  if (historico.length <= limiteMensagensHistorico) {
    const selecionadas = [];
    for (let i = historico.length - 1; i >= 0; i -= 1) {
      if (totalCaracteres + historico[i].content.length > maxCaracteres) break;
      totalCaracteres += historico[i].content.length;
      selecionadas.unshift(historico[i]);
    }
    return selecionadas;
  }

  // Histórico longo: preserva a âncora inicial (1ª mensagem de diagnóstico) e a janela recente
  const indicePrimeiroUsuario = historico.findIndex((item) => item.role === 'user');
  const ancoras = [];

  if (indicePrimeiroUsuario !== -1) {
    if (indicePrimeiroUsuario === 1 && historico[0].role === 'assistant') {
      ancoras.push(historico[0], historico[1]);
    } else {
      ancoras.push(historico[indicePrimeiroUsuario]);
    }
  } else if (historico.length > 0) {
    ancoras.push(historico[0]);
  }

  const vagasRestantes = Math.max(1, limiteMensagensHistorico - ancoras.length);
  const candidatosRecentes = historico.slice(Math.max(ancoras.length, historico.length - vagasRestantes));

  const resultado = [...ancoras];
  for (const item of candidatosRecentes) {
    if (item.role === 'assistant' && item.content.length > 600) {
      resultado.push({
        role: 'assistant',
        content: `${item.content.slice(0, 500)}... [continuação resumida pelo Turing]`
      });
    } else {
      resultado.push(item);
    }
  }

  // Aplica limite de caracteres do recorte
  while (resultado.length > 1) {
    const somaChars = resultado.reduce((acc, m) => acc + m.content.length, mensagemAtual.length);
    if (somaChars <= maxCaracteres) break;
    if (resultado.length > ancoras.length + 1) {
      resultado.splice(ancoras.length, 1);
    } else {
      resultado.shift();
    }
  }

  return resultado;
};

/**
 * Valida o corpo da requisição e retorna a lista de mensagens pronta para o modelo.
 * O histórico é otimizado para equilibrar continuidade diagnóstica e baixa latência.
 */
const validarCorpo = (corpo) => {
  const { maxCaracteresMensagem, maxMensagensHistorico, maxCaracteresHistorico } = config.limites;

  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw erroValidacao('INVALID_BODY', 'Formato de requisição inválido.');
  }

  if (typeof corpo.mensagem !== 'string') {
    throw erroValidacao('INVALID_MESSAGE', 'A mensagem deve ser um texto.');
  }
  const mensagem = sanitizar(corpo.mensagem);
  if (!mensagem) {
    throw erroValidacao('EMPTY_MESSAGE', 'Escreva uma mensagem antes de enviar.');
  }
  if (mensagem.length > maxCaracteresMensagem) {
    throw erroValidacao(
      'MESSAGE_TOO_LONG',
      `Sua mensagem ultrapassa o limite de ${maxCaracteresMensagem} caracteres.`
    );
  }

  const historicoBruto = corpo.historico ?? [];
  if (!Array.isArray(historicoBruto) || historicoBruto.length > LIMITE_ABSOLUTO_ITENS_HISTORICO) {
    throw erroValidacao('INVALID_HISTORY', 'O histórico da conversa é inválido.');
  }

  const historico = historicoBruto.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      (item.role !== 'user' && item.role !== 'assistant') ||
      typeof item.content !== 'string'
    ) {
      throw erroValidacao('INVALID_HISTORY', 'O histórico da conversa é inválido.');
    }
    const limite =
      item.role === 'user' ? maxCaracteresMensagem : maxCaracteresMensagem * FATOR_TAMANHO_ASSISTENTE;
    // Apenas os papéis user/assistant são aceitos: o cliente não pode injetar mensagens de sistema.
    return { role: item.role, content: sanitizar(item.content).slice(0, limite) };
  }).filter((item) => item.content);

  const recorte = otimizarHistorico(
    historico,
    mensagem,
    maxMensagensHistorico,
    maxCaracteresHistorico
  );

  return [...recorte, { role: 'user', content: mensagem }];
};

/** Controle de requisições simultâneas ao provedor (global e por IP). */
const criarControleConcorrencia = () => {
  const porIp = new Map();
  let global = 0;

  return (req, res, next) => {
    const ip = req.ip || 'desconhecido';
    const atuaisIp = porIp.get(ip) || 0;

    if (atuaisIp >= config.limites.maxConcorrenciaPorIp) {
      return next(new ErroIA('CONCURRENT_REQUEST', 429, 'Aguarde a resposta anterior antes de enviar outra mensagem.'));
    }
    if (global >= config.limites.maxConcorrenciaGlobal) {
      return next(new ErroIA('SERVER_BUSY', 503, 'O Turing está atendendo muitas pessoas agora.'));
    }

    global += 1;
    porIp.set(ip, atuaisIp + 1);

    let liberado = false;
    const liberar = () => {
      if (liberado) return;
      liberado = true;
      global -= 1;
      const restante = (porIp.get(ip) || 1) - 1;
      if (restante <= 0) porIp.delete(ip);
      else porIp.set(ip, restante);
    };
    res.on('finish', liberar);
    res.on('close', liberar);
    return next();
  };
};

const criarRotaChat = ({ systemPrompt, registrar = console }) => {
  const rota = express.Router();

  const limitador = rateLimit({
    windowMs: config.limites.janelaRateLimitMs,
    limit: config.limites.maxRequisicoesJanela,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new ErroIA('RATE_LIMITED', 429, 'Você atingiu o limite de mensagens por minuto.'))
  });

  rota.post('/chat', limitador, criarControleConcorrencia(), async (req, res, next) => {
    try {
      const mensagens = validarCorpo(req.body);
      const querStream =
        req.body?.stream === true ||
        Boolean(req.headers.accept && req.headers.accept.includes('text/event-stream'));

      // Cancela a chamada ao provedor se o cliente desconectar antes da resposta.
      const controlador = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) controlador.abort();
      });

      const inicio = Date.now();

      if (querStream) {
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        let primeiroTokenMs = null;
        const onChunk = (chunk) => {
          if (primeiroTokenMs === null) {
            primeiroTokenMs = Date.now() - inicio;
          }
          if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
          }
        };

        const { resposta, modelo, uso, truncada } = await gerarResposta({
          systemPrompt,
          mensagens,
          signal: controlador.signal,
          onChunk
        });

        const tempoTotal = Date.now() - inicio;
        registrar.info(
          `[chat:stream] ok modelo=${modelo} mensagens=${mensagens.length} ` +
            `ttft=${primeiroTokenMs ?? tempoTotal}ms tempoTotal=${tempoTotal}ms${truncada ? ' (truncada)' : ''}`
        );

        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({
              done: true,
              resposta,
              modelo,
              uso,
              ttft: primeiroTokenMs ?? tempoTotal,
              tempoTotal
            })}\n\n`
          );
          res.end();
        }
        return undefined;
      }

      const { resposta, modelo, uso, truncada } = await gerarResposta({
        systemPrompt,
        mensagens,
        signal: controlador.signal
      });

      registrar.info(
        `[chat] ok modelo=${modelo} mensagens=${mensagens.length} ` +
          `tokens=${uso?.total_tokens ?? '?'} tempo=${Date.now() - inicio}ms${truncada ? ' (truncada)' : ''}`
      );

      if (res.writableEnded || controlador.signal.aborted) return undefined;
      return res.json({ resposta, modelo });
    } catch (erro) {
      if (res.headersSent) {
        if (!res.writableEnded) {
          const erroIA = traduzirErro ? traduzirErro(erro) : erro;
          res.write(
            `data: ${JSON.stringify({
              erro: {
                codigo: erroIA.codigo || 'INTERNAL_ERROR',
                mensagem: erroIA.message || 'Erro no processamento da resposta.'
              }
            })}\n\n`
          );
          res.end();
        }
        return undefined;
      }
      return next(erro);
    }
  });

  return rota;
};

module.exports = { criarRotaChat, validarCorpo };

