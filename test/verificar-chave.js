'use strict';

/**
 * Verificação de segurança: garante que nenhuma credencial está presente nos
 * arquivos entregues ao navegador e que o .env está protegido pelo .gitignore.
 * Uso: npm run check:seguranca
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const PUBLICOS = ['index.html', 'css', 'js'];
const PADROES = [
  [/sk-(proj-)?[A-Za-z0-9_-]{20,}/, 'formato de chave da OpenAI'],
  [/OPENAI_API_KEY/, 'referência à variável da chave'],
  [/Authorization\s*:\s*['"`]Bearer/i, 'cabeçalho Authorization no frontend'],
  [/api\.openai\.com/, 'chamada direta ao provedor a partir do navegador']
];

const listar = (alvo) => {
  const completo = path.join(RAIZ, alvo);
  if (fs.statSync(completo).isFile()) return [completo];
  return fs.readdirSync(completo).flatMap((nome) => listar(path.join(alvo, nome)));
};

let falhas = 0;
const falhar = (mensagem) => { falhas += 1; console.error(`  ✖ ${mensagem}`); };
const ok = (mensagem) => console.log(`  ✔ ${mensagem}`);

console.log('\nVerificando arquivos públicos (servidos ao navegador):');
for (const arquivo of PUBLICOS.flatMap(listar)) {
  const conteudo = fs.readFileSync(arquivo, 'utf8');
  const relativo = path.relative(RAIZ, arquivo);
  const encontrados = PADROES.filter(([regex]) => regex.test(conteudo));
  if (encontrados.length) encontrados.forEach(([, descricao]) => falhar(`${relativo}: ${descricao}`));
  else ok(relativo);
}

console.log('\nVerificando proteção do .env:');
try {
  execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: RAIZ });
  ok('.env está listado no .gitignore');
} catch {
  falhar('.env NÃO está ignorado pelo Git');
}
try {
  const rastreados = execFileSync('git', ['ls-files', '.env'], { cwd: RAIZ, encoding: 'utf8' }).trim();
  if (rastreados) falhar('.env está versionado no repositório!');
  else ok('.env não está versionado');
} catch {
  console.log('  - Git indisponível; verificação de versionamento ignorada.');
}

const exemplo = fs.readFileSync(path.join(RAIZ, '.env.example'), 'utf8');
if (/^OPENAI_API_KEY=\s*$/m.test(exemplo)) ok('.env.example não contém credencial');
else falhar('.env.example parece conter uma chave preenchida');

console.log(falhas ? `\n${falhas} problema(s) encontrado(s).\n` : '\nNenhuma credencial exposta.\n');
process.exit(falhas ? 1 : 0);

