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

O projeto foi construído utilizando tecnologias web fundamentais (Vanilla Stack), sem dependência de frameworks pesados, garantindo máxima performance, controle de layout e acessibilidade:

* **HTML5 Semântico:** Estruturação orientada a padrões W3C e acessibilidade (tags semânticas e conformidade com leitores de tela).
* **CSS3 Moderno:**
  * Metodologia Mobile First para responsividade fluida em todas as resoluções.
  * Variáveis CSS customizadas (`:root`) baseadas em um Design System exclusivo.
  * Layout flexível e bidimensional utilizando CSS Grid e Flexbox.
  * Tipografia fluida com função `clamp()` e fontes do Google Fonts (*Plus Jakarta Sans* e *JetBrains Mono*).
* **JavaScript Vanilla (ES6+):** Interações da interface, navegação mobile, revelação dos cards de cursos e validação do formulário.

---

## Funcionalidades Principais

1. **Landing Page Institucional:**
   * Seção **Início (Hero):** Mensagem de impacto, proposta de valor persuasiva e chamadas diretas para conversão.
   * Seção **Sobre:** Apresentação da proposta pedagógica baseada em primeiros princípios, autoridade acadêmica e metodologia prática (*hands-on*).
2. **Cards de Cursos Responsivos:**
   * Vitrine estruturada com 6 formações de IA e desenvolvimento moderno.
   * Exibição clara de títulos, ementas resumidas, níveis de proficiência e carga horária.
3. **Formulário de Contato e Atendimento:**
   * Formulário responsivo para inscrição, orientação sobre cursos, parcerias e contato com a equipe pedagógica.
   * Campos de nome, e-mail e mensagem com preenchimento obrigatório, validação de formato do e-mail e indicação visual dos campos inválidos.
   * O envio utiliza `mailto:contato@aiacademy.edu.br` e depende de um aplicativo de e-mail configurado no dispositivo. O projeto não possui integração com servidor para receber os dados automaticamente.
4. **Assistente Virtual (Turing):**
   * Interface de acolhimento baseada na persona de Alan Turing, criada para diagnosticar a bagagem técnica do estudante e indicar a trilha de cursos ideal sem sobrecarga de informações.

---

## Instalação e Execução

Como o projeto é construído em tecnologia web nativa (HTML, CSS e JS), não é necessária a instalação de compiladores ou gerenciadores de pacotes para sua visualização básica.

### Passo a passo:

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/ai-academy.git
   ```

2. **Acessar a pasta do projeto:**
   ```bash
   cd ai-academy
   ```

3. **Executar a aplicação:**
   * Basta abrir o arquivo `index.html` em qualquer navegador web moderno (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari).
   * *Opcional (Ambiente de desenvolvimento com Live Reload):* Abra o projeto no VS Code e inicie a extensão **Live Server**, ou utilize o utilitário npx:
     ```bash
     npx serve .
     ```

---

## Estrutura de Pastas

A arquitetura de arquivos foi organizada seguindo as melhores práticas de projetos web:

```text
ai-academy/
├── index.html              # Ponto de entrada e estrutura HTML semântica
├── README.md               # Documentação técnica do projeto
├── .gitignore              # Regras de exclusão do Git
├── css/
│   └── style.css           # Estilos, variáveis :root e regras de layout
└── js/
    └── ui.js               # Menu mobile, animações dos cards e validação do formulário
```

---

## Integração com Inteligência Artificial

<!--
  SEÇÃO RESERVADA:
  Este espaço deve ser preenchido pelo integrante responsável pela integração do assistente virtual ou modelos de IA.
  
  Tópicos sugeridos para preenchimento:
  - Modelo ou API utilizada (ex: Google Gemini, OpenAI, Claude ou modelo local)
  - Arquitetura de prompt / System Instructions do assistente Turing
  - Fluxo de requisição e resposta (streaming / webhooks / backend intermediário)
  - Regras de tratamento de dados e privacidade
-->

*(Seção a ser documentada pelo responsável pela integração técnica do modelo de Inteligência Artificial).*

---

## Licença e Direitos

Projeto desenvolvido para fins educacionais e profissionais pela equipe da **AI Academy**. Todos os direitos reservados.
