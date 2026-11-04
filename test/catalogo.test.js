'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { carregarCatalogo } = require('../server/services/catalogService');
const { construirSystemPrompt } = require('../server/config/turingPrompt');

// Valores conferidos manualmente na vitrine de index.html (seção #cursos).
const ESPERADO = [
  { titulo: 'Fundamentos de Machine Learning & Álgebra Computacional', nivel: 'Iniciante a Intermediário', cargaHoraria: '60h' },
  { titulo: 'Engenharia de Prompts Avançada e Raciocínio Estruturado', nivel: 'Iniciante a Intermediário', cargaHoraria: '40h' },
  { titulo: 'Desenvolvimento de Aplicações com LLMs: Da API ao Produto', nivel: 'Intermediário', cargaHoraria: '80h' },
  { titulo: 'Sistemas RAG de Alta Precisão (Retrieval-Augmented Generation)', nivel: 'Intermediário a Avançado', cargaHoraria: '70h' },
  { titulo: 'Engenharia de Agentes Autônomos e Sistemas Multiagente', nivel: 'Avançado', cargaHoraria: '90h' },
  { titulo: 'Fine-Tuning, Otimização e Deploy Local de Modelos Abertos', nivel: 'Avançado', cargaHoraria: '85h' }
];

test('catálogo extraído do index.html contém exatamente as 6 formações reais', () => {
  const cursos = carregarCatalogo();
  assert.equal(cursos.length, 6);
  cursos.forEach((curso, i) => {
    assert.equal(curso.titulo, ESPERADO[i].titulo);
    assert.equal(curso.nivel, ESPERADO[i].nivel);
    assert.equal(curso.cargaHoraria, ESPERADO[i].cargaHoraria);
    assert.ok(curso.ementa.length > 100, `ementa do curso ${i + 1} deve estar preenchida`);
    assert.doesNotMatch(curso.ementa, /<|&amp;/, 'ementa não deve conter HTML');
  });
});

test('System Prompt inclui identidade, restrições e todo o catálogo', () => {
  const prompt = construirSystemPrompt(carregarCatalogo());
  assert.match(prompt, /Você é Turing, o assistente virtual oficial da AI Academy/);
  assert.match(prompt, /Não invente cursos, preços/);
  assert.match(prompt, /Iniciante/);
  assert.match(prompt, /Intermediário/);
  assert.match(prompt, /Avançado/);
  ESPERADO.forEach(({ titulo, cargaHoraria }) => {
    assert.ok(prompt.includes(titulo), `prompt deve conter "${titulo}"`);
    assert.ok(prompt.includes(`Carga horária: ${cargaHoraria}`));
  });
});

