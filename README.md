# AI Academy

> Plataforma educacional de ponta dedicada ao ensino avançado de Inteligência Artificial e Engenharia de Software.

A **AI Academy** une rigor científico e desenvolvimento prático de software para preencher a lacuna entre a teoria acadêmica e as demandas de produção. Projetada para transformar estudantes e programadores em arquitetos de soluções inteligentes, a plataforma oferece uma experiência moderna, acessível e focada em resultados reais.

---

## Integrantes do Projeto

Espaço reservado para identificação da equipe responsável pelo desenvolvimento:

* **Adler José da Silva Oliveira** - [GitHub](https://github.com/adlerjose)
* **Enio Jones de Sousa Porto** - [GitHub](https://github.com/eniojones)
* **Mateus Oliveira Nunes** - [GitHub](https://github.com/DevNunes-tech)

---

## Tecnologias Utilizadas

O projeto combina uma interface leve em **Vanilla Stack** com um backend em **Node.js** para integração segura com modelos de linguagem:

* **Frontend:**
  * **HTML5 Semântico:** Estruturação orientada a padrões W3C e acessibilidade (tags semânticas, regiões `aria-live`, diálogo acessível e navegação por teclado).
  * **CSS3 Moderno:**
    * Metodologia Mobile First para responsividade fluida em computadores, tablets e smartphones.
    * Variáveis CSS customizadas (`:root`) baseadas em um Design System exclusivo.
    * Layout flexível e bidimensional utilizando CSS Grid e Flexbox.
    * Tipografia fluida com função `clamp()` e fontes do Google Fonts (*Plus Jakarta Sans* e *JetBrains Mono*).
  * **JavaScript Vanilla (ES6+):** Interações da interface, menu mobile, revelação dos cards de cursos, validação do formulário e cliente do chatbot via Fetch API.
* **Backend e Inteligência Artificial:**
  * **Node.js + Express:** Servidor HTTP que entrega os arquivos públicos do frontend e expõe o endpoint `POST /api/chat`.
  * **SDKs Oficiais de IA (`@google/genai` e `openai`):** Comunicação com modelos Google Gemini (padrão `gemini-3.6-flash` com fallback automático para `gemini-3.5-flash`) ou OpenAI (`gpt-4.1-mini`), configuráveis por variável de ambiente.
  * **`dotenv` e `express-rate-limit`:** Gerenciamento de variáveis de ambiente e proteção contra abuso do endpoint.

---

## Funcionalidades Principais

1. **Landing Page Institucional:**
   * Seção **Início (Hero):** Mensagem de impacto, proposta de valor persuasiva e chamadas diretas para conversão.
   * Seção **Sobre:** Apresentação da proposta pedagógica baseada em primeiros princípios, autoridade acadêmica e metodologia prática (*hands-on*).
2. **Cards de Cursos Responsivos:**
   * Vitrine estruturada com 6 formações de IA e desenvolvimento moderno.
   * Exibição clara de títulos, ementas resumidas, níveis de proficiência e carga horária.
   * Integração direta dos botões **"Consultar Pré-requisitos"** com o assistente Turing.
3. **Formulário de Contato e Atendimento:**
   * Formulário responsivo para inscrição, orientação sobre cursos, parcerias e contato com a equipe pedagógica.
   * Campos de nome, e-mail e mensagem com preenchimento obrigatório, validação de formato do e-mail e indicação visual dos campos inválidos.
   * O envio utiliza `mailto:contato@aiacademy.edu.br` e depende de um aplicativo de e-mail configurado no dispositivo.
4. **Assistente Virtual Turing (Chatbot com IA real):**
   * Botão flutuante e chamadas na página para abrir e fechar a janela de conversação.
   * Diagnóstico conversacional progressivo do estudante (programação, IA, Python, matemática/estatística, interesses, objetivo profissional e disponibilidade), classificando o perfil em **Iniciante**, **Intermediário** ou **Avançado**.
   * Recomendação fundamentada exclusivamente nas **6 formações reais** da plataforma, extraídas automaticamente de `index.html`, com explicação do motivo, carga horária, nível e sugestão de sequência de aprendizagem.
   * Preservação do contexto durante a sessão (`sessionStorage`), opção de iniciar nova conversa, envio com `Enter` (`Shift+Enter` para nova linha), indicador de digitação e tratamento amigável de falhas com botão **"Tentar novamente"**.

---

## Instalação e Execução

### Pré-requisitos

* **Node.js** 20 ou superior (`node -v`).
* **npm** (`npm -v`).
* Uma **chave de API da OpenAI** (ou de um provedor compatível com a API da OpenAI).

### 1. Instalar as dependências

Na pasta raiz do projeto, execute:

```bash
npm install
```

### 2. Obter e configurar a chave da API

1. Obtenha uma chave de API do provedor desejado:
   * **Google Gemini / Google AI Studio:** [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   * **OpenAI (opcional):** [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Crie o arquivo `.env` na raiz do projeto copiando o modelo `.env.example`:

   ```bash
   cp .env.example .env
   ```

### 3. Preencher o arquivo `.env`

Abra o arquivo `.env` em um editor de texto e preencha a chave da API (`GEMINI_API_KEY` ou `OPENAI_API_KEY`):

```env
GEMINI_API_KEY=sua-chave-real-aqui
AI_MODEL=gemini-3.6-flash
PORT=3000
HOST=127.0.0.1
```

> **Segurança:** A chave permanece exclusivamente no backend e nunca é enviada ao navegador. O arquivo `.env` está listado no `.gitignore` e não deve ser versionado.

#### Variáveis de ambiente disponíveis

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | *(obrigatória se usar Gemini)* | Chave de autenticação da API Google Gemini / Vertex AI. |
| `OPENAI_API_KEY` | *(obrigatória se usar OpenAI)* | Chave de autenticação da API da OpenAI. |
| `AI_PROVIDER` | *(auto-detectado)* | Define explicitamente o provedor (`gemini` ou `openai`). |
| `AI_MODEL` / `OPENAI_MODEL` | `gemini-3.6-flash` / `gpt-4.1-mini` | Modelo utilizado pelo Turing. |
| `OPENAI_BASE_URL` | *(oficial OpenAI)* | Endpoint customizado caso utilize um provedor compatível com OpenAI. |
| `OPENAI_TIMEOUT_MS` | `45000` | Tempo limite (ms) da chamada ao provedor de IA. |
| `OPENAI_MAX_RETRIES` | `1` | Tentativas automáticas em falhas transitórias do provedor. |
| `OPENAI_MAX_OUTPUT_TOKENS` | `1200` | Limite de tokens por resposta do assistente. |
| `OPENAI_TEMPERATURE` | `0.6` | Temperatura de geração (aplicada a modelos que suportam o parâmetro). |
| `PORT` | `3000` | Porta HTTP do servidor. |
| `HOST` | `127.0.0.1` | Endereço de escuta (`0.0.0.0` para aceitar conexões externas/containers). |
| `CORS_ORIGINS` | *(vazio)* | Origens extras autorizadas em `/api`, separadas por vírgula (ex.: `http://localhost:5500`). |
| `CHAT_MAX_MESSAGE_CHARS` | `1000` | Tamanho máximo de cada mensagem enviada pelo usuário. |
| `CHAT_MAX_HISTORY_MESSAGES` | `20` | Quantidade máxima de mensagens enviadas como contexto. |
| `CHAT_MAX_HISTORY_CHARS` | `12000` | Soma máxima de caracteres do histórico enviado ao modelo. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Janela do rate limit por IP (ms). |
| `RATE_LIMIT_MAX` | `15` | Máximo de requisições por IP dentro da janela. |
| `CHAT_MAX_CONCURRENT` | `8` | Máximo global de chamadas simultâneas ao modelo. |
| `CHAT_MAX_CONCURRENT_PER_IP` | `1` | Máximo de chamadas simultâneas por IP. |

### 4. Iniciar o servidor

Para desenvolvimento (com reinício automático ao alterar arquivos do servidor):

```bash
npm run dev
```

Ou em modo padrão:

```bash
npm start
```

### 5. Acessar a plataforma

Com o servidor em execução, abra no navegador:

```text
http://localhost:3000
```

> **Visualização estática:** O `index.html` continua podendo ser aberto diretamente para inspecionar a landing page, mas o chatbot Turing precisa do servidor Node.js rodando para conversar com o modelo de IA.

### 6. Como testar o chatbot

* **Pela interface:** Clique no botão flutuante **Turing** (canto inferior direito), no botão **"Conversar com o Turing"** na seção *Tutor Turing*, ou em **"Consultar Pré-requisitos"** em qualquer card de curso. Conte sua experiência com programação/Python e seus objetivos para receber o diagnóstico e a recomendação de trilha.
* **Testes automatizados (validação, segurança, rate limit, timeout, CORS e catálogo):**
  ```bash
  npm test
  ```
* **Verificação de proteção da chave de API:**
  ```bash
  npm run check:seguranca
  ```
* **Teste de ponta a ponta com a API real da OpenAI** (requer `OPENAI_API_KEY` configurada no `.env`):
  ```bash
  npm run test:ia
  ```
* **Verificação rápida de saúde do servidor:**
  ```bash
  curl http://localhost:3000/api/health
  ```

### 7. Identificação e correção de problemas comuns

| Sintoma | Causa provável | Como resolver |
| :--- | :--- | :--- |
| Status **"Configuração pendente"** ou mensagem *"Meu mecanismo de inteligência ainda não foi configurado"* | `OPENAI_API_KEY` ausente, vazia ou inválida no `.env`. | Crie o arquivo `.env` na raiz (`cp .env.example .env`), preencha `OPENAI_API_KEY=sk-...` com uma chave válida e reinicie o servidor (`npm run dev`). |
| Status **"Offline"** ou *"Não consegui me conectar ao servidor da AI Academy"* | O servidor Node.js não está rodando ou a página foi aberta em outro endereço sem CORS configurado. | Inicie o servidor com `npm run dev` e acesse a plataforma por `http://localhost:3000`. Se usar outro servidor estático (como Live Server na porta `5500`), adicione `CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500` ao `.env` e defina `data-api-base="http://localhost:3000"` em `#turing-widget`. |
| *"O limite de uso do meu mecanismo de inteligência foi atingido"* | A conta da OpenAI está sem créditos/cota (`insufficient_quota`). | Verifique os créditos e limites em [https://platform.openai.com/settings/organization/billing](https://platform.openai.com/settings/organization/billing). |
| *"Você enviou muitas mensagens em pouco tempo"* | Rate limit atingido (`RATE_LIMIT_MAX` por minuto). | Aguarde cerca de 1 minuto ou ajuste `RATE_LIMIT_MAX` no `.env` em ambiente de desenvolvimento. |
| *"Não consegui estabelecer uma conexão com meu mecanismo de inteligência"* | Modelo inexistente na conta (`OPENAI_MODEL`) ou instabilidade na API. | Confira o nome em `OPENAI_MODEL` no `.env` (padrão: `gpt-4.1-mini`) e os logs do terminal do servidor. |
| Erro `A porta 3000 já está em uso` ao iniciar | Outro processo já ocupa a porta `3000`. | Altere `PORT=3001` no `.env` (ou finalize o processo que está usando a porta `3000`). |

---

## Estrutura de Pastas

```text
ai-academy/
├── index.html                  # Página principal e marcação semântica do chatbot
├── css/
│   ├── style.css               # Design System (:root) e estilos da landing page
│   └── chatbot.css             # Estilos responsivos do assistente Turing
├── js/
│   ├── ui.js                   # Menu mobile, revelação dos cards e formulário
│   └── chatbot.js              # Interface, sessão e comunicação do Turing
├── server/
│   ├── server.js               # Servidor Express, segurança, CORS e arquivos públicos
│   ├── config/
│   │   ├── aiConfig.js         # Leitura e validação das variáveis de ambiente
│   │   └── turingPrompt.js     # System Prompt e mensagem inicial do Turing
│   ├── routes/
│   │   └── chat.js             # Endpoint POST /api/chat, validação e limites
│   └── services/
│       ├── aiService.js        # Integração com a OpenAI e tradução de erros
│       └── catalogService.js   # Extração dos 6 cursos reais de index.html
├── test/
│   ├── catalogo.test.js        # Testes do catálogo e do System Prompt
│   ├── chat.test.js            # Testes do endpoint /api/chat e segurança
│   ├── configuracao.test.js    # Testes de ausência de chave e rate limiting
│   ├── smoke-ia.js             # Teste de conversa real com a OpenAI
│   ├── verificar-chave.js      # Auditoria contra exposição de credenciais
│   └── helpers.js              # Utilitários de teste
├── .env.example                # Modelo de variáveis de ambiente (sem credenciais)
├── .gitignore                  # Regras de exclusão do Git (inclui .env e node_modules)
├── package.json                # Dependências e scripts npm
└── README.md                   # Documentação do projeto
```

---

## Integração com Inteligência Artificial

* **Provedor e modelo:** Integração via SDK oficial `openai` no backend Node.js. O modelo padrão é `gpt-4.1-mini`, configurável pela variável `OPENAI_MODEL` (compatível também com `gpt-4.1`, `gpt-4o-mini`, série `o*` e `gpt-5*`, ou provedores compatíveis via `OPENAI_BASE_URL`).
* **Arquitetura de prompt (System Prompt):** Definido em `server/config/turingPrompt.js`. Incorpora as diretrizes de personalidade e restrições do Turing, as regras de diagnóstico progressivo (classificação em *Iniciante*, *Intermediário* ou *Avançado*) e o catálogo oficial das 6 formações extraído diretamente de `index.html` por `server/services/catalogService.js` na inicialização do servidor.
* **Fluxo de requisição e resposta:**
  1. O usuário envia uma mensagem na interface (`js/chatbot.js`).
  2. O frontend faz `POST /api/chat` com `{ mensagem, historico }` (recortado aos limites de quantidade e caracteres).
  3. `server/routes/chat.js` aplica rate limiting, controle de concorrência por IP e global, sanitização e validação estrita (apenas papéis `user` e `assistant` são aceitos, impedindo injeção de prompts de sistema pelo cliente).
  4. `server/services/aiService.js` combina o System Prompt com o histórico e chama a API da OpenAI com timeout configurável e cancelamento caso o cliente desconecte.
  5. A resposta é devolvida em JSON (`{ resposta, modelo }`) e renderizada no frontend com criação segura de nós DOM (sem `innerHTML`).
* **Privacidade e segurança:** A `OPENAI_API_KEY` reside apenas no servidor; o Express serve exclusivamente `index.html`, `css/` e `js/` (bloqueando `.env`, `server/`, `package.json` etc.); erros do provedor são traduzidos para códigos internos sem expor stack traces ou chaves; e o histórico da conversa fica apenas no `sessionStorage` da aba do usuário.

---

## Licença e Direitos

Projeto desenvolvido para fins educacionais e profissionais pela equipe da **AI Academy**. Todos os direitos reservados.
