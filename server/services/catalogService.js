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
  const html = fs.readFileSync(caminho, 'utf8');
  const cursos = extrairCursosDoHtml(html);

  const incompletos = cursos.filter((c) => !c.titulo || !c.nivel || !c.cargaHoraria || !c.ementa);
  if (cursos.length === 0 || incompletos.length > 0) {
    throw new Error(
      `Catálogo de cursos inválido: ${cursos.length} card(s) encontrado(s), ${incompletos.length} incompleto(s).`
    );
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

