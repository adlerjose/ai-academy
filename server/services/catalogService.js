'use strict';

/**
 * Catálogo oficial de cursos da AI Academy.
 *
 * A fonte da verdade é a vitrine em `index.html` (seção #cursos). O catálogo é
 * extraído diretamente do HTML na inicialização do servidor, garantindo que o
 * Turing recomende apenas formações que realmente existem na página — se um
 * card for alterado, o assistente passa a usar a nova informação automaticamente.
 */

const fs = require('node:fs');
const path = require('node:path');

const CAMINHO_INDEX = path.join(__dirname, '..', '..', 'index.html');

const resolverCaminhoIndex = (caminho) => {
  if (caminho && fs.existsSync(caminho)) return caminho;

  const candidatos = [
    caminho,
    path.join(process.cwd(), 'index.html'),
    path.join(__dirname, '..', '..', 'index.html'),
    path.join(__dirname, '..', 'index.html')
  ].filter(Boolean);

  for (const cand of candidatos) {
    if (fs.existsSync(cand)) return cand;
  }
  return caminho || path.join(__dirname, '..', '..', 'index.html');
};

const CATALOGO_PADRAO = Object.freeze([
  Object.freeze({
    id: 1,
    titulo: 'Fundamentos de Machine Learning & Álgebra Computacional',
    nivel: 'Iniciante a Intermediário',
    cargaHoraria: '60h',
    ementa: 'Desmistifique a matemática essencial por trás dos modelos preditivos. Domine vetores, matrizes, gradiente descendente e algoritmos clássicos de regressão e classificação, implementando cada conceito em Python puro e Scikit-Learn antes de abstraí-los em bibliotecas de alto nível.'
  }),
  Object.freeze({
    id: 2,
    titulo: 'Engenharia de Prompts Avançada e Raciocínio Estruturado',
    nivel: 'Iniciante a Intermediário',
    cargaHoraria: '40h',
    ementa: 'Vá além de instruções triviais e domine a modelagem formal de contexto. Aprenda técnicas como Chain-of-Thought, ReAct, decomposição sistemática de tarefas complexas, mitigação sistemática de alucinações e geração de saídas estruturadas com esquemas JSON/Pydantic para integração em sistemas corporativos determinísticos.'
  }),
  Object.freeze({
    id: 3,
    titulo: 'Desenvolvimento de Aplicações com LLMs: Da API ao Produto',
    nivel: 'Intermediário',
    cargaHoraria: '80h',
    ementa: 'A ponte definitiva entre o desenvolvimento de software moderno e os Foundation Models. Aprenda a integrar APIs de ponta (OpenAI, Anthropic, Google Gemini), gerenciar contexto, memória e sessões, manipular streaming em tempo real e arquitetar backends resilientes prontos para tráfego real.'
  }),
  Object.freeze({
    id: 4,
    titulo: 'Sistemas RAG de Alta Precisão (Retrieval-Augmented Generation)',
    nivel: 'Intermediário a Avançado',
    cargaHoraria: '70h',
    ementa: 'Construa sistemas de busca semântica e recuperação contextual corporativa com precisão auditável. Explore técnicas de embeddings vetoriais, bancos de dados vetoriais (Chroma, Pinecone, Qdrant), estratégias avançadas de chunking, reranking semântico e pipelines de avaliação quantitativa com Ragas.'
  }),
  Object.freeze({
    id: 5,
    titulo: 'Engenharia de Agentes Autônomos e Sistemas Multiagente',
    nivel: 'Avançado',
    cargaHoraria: '90h',
    ementa: 'Projete e implemente ecossistemas de agentes autônomos orientados a objetivos. Domine o uso de ferramentas externas (Tool Use / Function Calling), memória de curto e longo prazo, planejamento hierárquico e coordenação de equipes de agentes cooperativos com LangGraph e CrewAI.'
  }),
  Object.freeze({
    id: 6,
    titulo: 'Fine-Tuning, Otimização e Deploy Local de Modelos Abertos',
    nivel: 'Avançado',
    cargaHoraria: '85h',
    ementa: 'Conquiste total soberania e eficiência computacional adaptando modelos open-source (Llama, Mistral, Qwen). Aprenda técnicas de quantização (GGUF, AWQ), ajuste eficiente de parâmetros via LoRA/QLoRA, alinhamento por preferências (DPO) e orquestração de inferência em alta performance com vLLM e Ollama.'
  })
]);

const ENTIDADES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' '
};

const limparTexto = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entidade) => ENTIDADES[entidade] || entidade)
    .replace(/\s+/g, ' ')
    .trim();

const extrair = (bloco, regex) => {
  const resultado = bloco.match(regex);
  return resultado ? limparTexto(resultado[1]) : '';
};

/**
 * Faz o parsing dos cards `<article class="cartao-curso">` do HTML.
 * @param {string} html
 * @returns {Array<{id:number,titulo:string,nivel:string,cargaHoraria:string,ementa:string}>}
 */
const extrairCursosDoHtml = (html) => {
  const blocos = html.match(/<article\s+class="cartao-curso"[\s\S]*?<\/article>/g) || [];

  return blocos.map((bloco, indice) => ({
    id: indice + 1,
    titulo: extrair(bloco, /<h3[^>]*class="cartao-titulo"[^>]*>([\s\S]*?)<\/h3>/),
    nivel: extrair(bloco, /<span[^>]*class="etiqueta-nivel[^"]*"[^>]*>([\s\S]*?)<\/span>/),
    cargaHoraria: extrair(bloco, /<span[^>]*class="etiqueta-carga"[^>]*>([\s\S]*?)<\/span>/),
    ementa: extrair(bloco, /<p[^>]*class="cartao-ementa"[^>]*>([\s\S]*?)<\/p>/)
  }));
};

const carregarCatalogo = (caminho = CAMINHO_INDEX) => {
  const caminhoFinal = resolverCaminhoIndex(caminho);
  let html;
  try {
    html = fs.readFileSync(caminhoFinal, 'utf8');
  } catch {
    // Se o arquivo index.html não foi encontrado ou não pôde ser lido (ex.: bundle serverless estrito),
    // utiliza o catálogo canônico das 6 formações como fallback seguro para não impedir a inicialização.
    return CATALOGO_PADRAO;
  }
  const cursos = extrairCursosDoHtml(html);

  const incompletos = cursos.filter((c) => !c.titulo || !c.nivel || !c.cargaHoraria || !c.ementa);
  if (cursos.length === 0 || incompletos.length > 0) {
    return CATALOGO_PADRAO;
  }

  return Object.freeze(cursos.map((curso) => Object.freeze(curso)));
};

/** Formata o catálogo como texto para ser injetado no System Prompt. */
const formatarCatalogoParaPrompt = (cursos) =>
  cursos
    .map(
      (c) =>
        `${c.id}. "${c.titulo}"\n` +
        `   - Nível: ${c.nivel}\n` +
        `   - Carga horária: ${c.cargaHoraria}\n` +
        `   - Ementa: ${c.ementa}`
    )
    .join('\n\n');

module.exports = { carregarCatalogo, extrairCursosDoHtml, formatarCatalogoParaPrompt };

