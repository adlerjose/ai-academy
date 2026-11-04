'use strict';

/**
 * Teste de ponta a ponta com a API REAL de IA (consome créditos).
 * Sobe o servidor em memória, simula uma conversa de diagnóstico com
 * múltiplas trocas pelo endpoint POST /api/chat e verifica:
 *   - respostas válidas do modelo;
 *   - preservação de contexto (o modelo lembra informações anteriores);
 *   - recomendação de cursos existentes no catálogo, sem inventar formações.
 *
 * Uso: npm run test:ia   (requer OPENAI_API_KEY no .env)
 */

require('dotenv').config({ quiet: true });

const { iniciarApp, postarChat } = require('./helpers');
const { config } = require('../server/config/aiConfig');

const MENSAGEM_INICIAL =
  'Olá! Sou Turing, seu assistente virtual da AI Academy. Estou aqui para ajudar você a descobrir sua próxima etapa no universo da Inteligência Artificial e Engenharia de Software. Para começar, gostaria de conhecer um pouco sobre sua experiência com tecnologia.';

const ROTEIRO = [
  'Oi! Sou desenvolvedor backend há 3 anos, trabalho principalmente com Node.js e já usei Python em alguns scripts.',
  'Nunca trabalhei com IA de verdade, só usei o ChatGPT. Matemática e estatística eu lembro o básico da faculdade.',
  'Meu objetivo é construir produtos com LLMs na empresa onde trabalho, como um chatbot que consulta documentos internos. Tenho umas 6 horas por semana.',
  'Pode me recomendar as formações e uma sequência? E me lembre: em qual linguagem eu disse que trabalho principalmente?'
];

const executar = async () => {
  if (!config.ia.chaveApi) {
    console.error('\n✖ OPENAI_API_KEY não configurada. Preencha o arquivo .env antes de executar este teste.\n');
    process.exit(2);
  }

  const app = await iniciarApp();
  const historico = [{ role: 'assistant', content: MENSAGEM_INICIAL }];
  const cursos = require('../server/services/catalogService').carregarCatalogo();
  let falhas = 0;

  console.log(`\nModelo: ${config.ia.modelo}\n${'='.repeat(70)}`);
  console.log(`TURING: ${MENSAGEM_INICIAL}\n`);

  try {
    for (const mensagem of ROTEIRO) {
      console.log(`ESTUDANTE: ${mensagem}\n`);
      const inicio = Date.now();
      const r = await postarChat(app.url, { mensagem, historico });
      const dados = await r.json();
      if (!r.ok) {
        console.error(`✖ Erro ${r.status}: ${dados?.erro?.codigo} — ${dados?.erro?.mensagem}`);
        app.logs.filter(([n]) => n === 'error').forEach(([, m]) => console.error(`  log: ${m}`));
        process.exitCode = 1;
        return;
      }
      console.log(`TURING (${Date.now() - inicio}ms): ${dados.resposta}\n${'-'.repeat(70)}`);
      historico.push({ role: 'user', content: mensagem }, { role: 'assistant', content: dados.resposta });
    }

    const final = historico.at(-1).content;
    const citados = cursos.filter((c) => final.includes(c.titulo.split(':')[0].split('(')[0].trim()));

    console.log('\nVerificações:');
    const verificar = (condicao, texto) => {
      console.log(`  ${condicao ? '✔' : '✖'} ${texto}`);
      if (!condicao) falhas += 1;
    };
    verificar(historico.length === ROTEIRO.length * 2 + 1, `${ROTEIRO.length} respostas reais recebidas do modelo`);
    verificar(/node/i.test(final), 'contexto preservado (lembrou de Node.js mencionado na 1ª mensagem)');
    verificar(citados.length > 0, `recomendou curso(s) do catálogo: ${citados.map((c) => `"${c.titulo}"`).join(', ') || 'nenhum'}`);
    verificar(
      citados.some((c) => /LLMs|RAG/.test(c.titulo)),
      'recomendação coerente com o perfil (LLMs / RAG para chatbot sobre documentos)'
    );
    verificar(/\b(80|70)\s?h/i.test(final), 'informou carga horária real de ao menos uma formação recomendada');
  } finally {
    await app.fechar();
  }

  console.log(falhas ? `\n${falhas} verificação(ões) falharam.\n` : '\nIntegração com a IA real funcionando.\n');
  process.exitCode = falhas ? 1 : 0;
};

executar().catch((erro) => {
  console.error('Falha inesperada:', erro.message);
  process.exit(1);
});

