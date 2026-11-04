/**
 * AI Academy — Assistente Virtual Turing (frontend)
 *
 * Responsável apenas pela interface e pelo histórico da sessão. Toda a
 * comunicação com o modelo de IA acontece no backend (POST /api/chat);
 * nenhuma credencial existe ou trafega neste arquivo.
 */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const widget = document.getElementById('turing-widget');
  if (!widget) return;

  /* ------------------------------------------------------------------
     Configuração
     ------------------------------------------------------------------ */
  // Quando a página é aberta direto do disco (file://), a API é acessada no
  // backend local padrão. Para outro servidor estático (ex.: Live Server),
  // defina o atributo data-api-base="http://localhost:3000" em #turing-widget.
  const URL_SERVIDOR_LOCAL = 'http://localhost:3000';
  const BASE_API = (widget.dataset.apiBase || (window.location.protocol === 'file:' ? URL_SERVIDOR_LOCAL : ''))
    .replace(/\/+$/, '');

  const CONFIG = Object.freeze({
    urlChat: `${BASE_API}/api/chat`,
    urlSaude: `${BASE_API}/api/health`,
    maxCaracteres: 1000,           // espelha CHAT_MAX_MESSAGE_CHARS do backend
    maxMensagensHistorico: 20,     // mensagens anteriores enviadas como contexto
    maxCaracteresHistorico: 12000, // soma máxima de caracteres do contexto
    maxMensagensSessao: 60,        // após isso, sugere iniciar nova conversa
    timeoutMs: 60000,
    chaveSessao: 'ai-academy:turing:historico'
  });

  const MENSAGEM_INICIAL =
    'Olá! Sou Turing, seu assistente virtual da AI Academy. Estou aqui para ajudar você a descobrir sua próxima etapa no universo da Inteligência Artificial e Engenharia de Software. Para começar, gostaria de conhecer um pouco sobre sua experiência com tecnologia.';

  const MENSAGENS_ERRO = {
    REDE: 'Não consegui me conectar ao servidor da AI Academy. Verifique sua conexão com a internet e tente novamente.',
    IA_INDISPONIVEL: 'Não consegui estabelecer uma conexão com meu mecanismo de inteligência neste momento. Tente novamente em alguns instantes.',
    NAO_CONFIGURADO: 'Meu mecanismo de inteligência ainda não foi configurado neste servidor. Enquanto isso, você pode falar com a equipe pelo formulário "Inscreva-se".',
    COTA: 'O limite de uso do meu mecanismo de inteligência foi atingido. Tente novamente mais tarde ou fale com a equipe pelo formulário "Inscreva-se".',
    LIMITE: 'Você enviou muitas mensagens em pouco tempo. Aguarde cerca de um minuto e tente novamente.',
    OCUPADO: 'Estou atendendo muitas pessoas agora. Tente novamente em alguns instantes.',
    SIMULTANEA: 'Ainda estou processando sua mensagem anterior. Aguarde a resposta antes de enviar outra.',
    TIMEOUT: 'O tempo de resposta excedeu o limite. Tente novamente — se possível, com uma mensagem mais curta.',
    MUITO_GRANDE: 'Nossa conversa ficou extensa demais. Inicie uma nova conversa para continuar.',
    VAZIA: 'Escreva uma mensagem antes de enviar.',
    LONGA: `Sua mensagem ultrapassa o limite de ${CONFIG.maxCaracteres} caracteres.`,
    GENERICO: 'Algo não saiu como esperado ao processar sua mensagem. Tente novamente em instantes.'
  };

  const ERRO_POR_CODIGO = {
    AI_UNAVAILABLE: 'IA_INDISPONIVEL',
    AI_BAD_REQUEST: 'IA_INDISPONIVEL',
    AI_EMPTY_RESPONSE: 'IA_INDISPONIVEL',
    INTERNAL_ERROR: 'IA_INDISPONIVEL',
    AI_NOT_CONFIGURED: 'NAO_CONFIGURADO',
    AI_AUTH_ERROR: 'NAO_CONFIGURADO',
    AI_QUOTA_EXCEEDED: 'COTA',
    RATE_LIMITED: 'LIMITE',
    AI_RATE_LIMITED: 'OCUPADO',
    SERVER_BUSY: 'OCUPADO',
    CONCURRENT_REQUEST: 'SIMULTANEA',
    AI_TIMEOUT: 'TIMEOUT',
    PAYLOAD_TOO_LARGE: 'MUITO_GRANDE',
    EMPTY_MESSAGE: 'VAZIA',
    MESSAGE_TOO_LONG: 'LONGA'
  };

  /* ------------------------------------------------------------------
     Elementos
     ------------------------------------------------------------------ */
  const lancador = document.getElementById('turing-lancador');
  const painel = document.getElementById('turing-chat');
  const corpo = document.getElementById('turing-chat-corpo');
  const lista = document.getElementById('turing-mensagens');
  const sugestoes = document.getElementById('turing-sugestoes');
  const formulario = document.getElementById('turing-formulario');
  const campo = document.getElementById('turing-campo');
  const botaoEnviar = document.getElementById('turing-enviar');
  const botaoFechar = document.getElementById('turing-fechar');
  const botaoNovaConversa = document.getElementById('turing-nova-conversa');
  const status = document.getElementById('turing-chat-status');
  const statusTexto = status.querySelector('.turing-status-texto');
  const dica = document.getElementById('turing-dica');
  const contador = document.getElementById('turing-contador');
  const contadorValor = document.getElementById('turing-contador-valor');

  const DICA_PADRAO = dica.textContent;
  const consultaMobile = window.matchMedia('(max-width: 639.98px)');

  /* ------------------------------------------------------------------
     Estado
     ------------------------------------------------------------------ */
  const estado = {
    aberto: false,
    processando: false,
    historico: [],          // [{ role: 'user'|'assistant', content: string }]
    controlador: null,      // AbortController da requisição em andamento
    saudeVerificada: false,
    elementoOrigemFoco: null,
    temporizadorFechamento: null
  };

  /* ------------------------------------------------------------------
     Persistência na sessão (sessionStorage — apagado ao fechar a aba)
     ------------------------------------------------------------------ */
  const salvarHistorico = () => {
    try {
      sessionStorage.setItem(CONFIG.chaveSessao, JSON.stringify(estado.historico));
    } catch {
      /* armazenamento indisponível (modo privado, cota): segue apenas em memória */
    }
  };

  const restaurarHistorico = () => {
    try {
      const bruto = JSON.parse(sessionStorage.getItem(CONFIG.chaveSessao) || '[]');
      if (!Array.isArray(bruto)) return [];
      return bruto
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-CONFIG.maxMensagensSessao);
    } catch {
      return [];
    }
  };

  /* ------------------------------------------------------------------
     Renderização segura de Markdown simples (negrito, código, listas).
     Construída com nós DOM — nunca usa innerHTML com conteúdo da IA.
     ------------------------------------------------------------------ */
  const renderizarInline = (texto, destino) => {
    const padrao = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let ultimo = 0;
    let resultado;
    while ((resultado = padrao.exec(texto)) !== null) {
      if (resultado.index > ultimo) {
        destino.appendChild(document.createTextNode(texto.slice(ultimo, resultado.index)));
      }
      const token = resultado[0];
      const elemento = document.createElement(token.startsWith('**') ? 'strong' : 'code');
      elemento.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
      destino.appendChild(elemento);
      ultimo = padrao.lastIndex;
    }
    if (ultimo < texto.length) {
      destino.appendChild(document.createTextNode(texto.slice(ultimo)));
    }
  };

  const renderizarMarkdown = (texto, destino) => {
    const linhas = texto.replace(/\r\n?/g, '\n').split('\n');
    let paragrafo = [];
    let listaAtual = null;
    let tipoLista = null;

    const fecharParagrafo = () => {
      if (!paragrafo.length) return;
      const p = document.createElement('p');
      paragrafo.forEach((linha, i) => {
        if (i > 0) p.appendChild(document.createElement('br'));
        renderizarInline(linha, p);
      });
      destino.appendChild(p);
      paragrafo = [];
    };

    const fecharLista = () => {
      listaAtual = null;
      tipoLista = null;
    };

    linhas.forEach((linhaBruta) => {
      const linha = linhaBruta.trim();
      const itemNaoOrdenado = linha.match(/^[-*•]\s+(.*)$/);
      const itemOrdenado = linha.match(/^(\d+)[.)]\s+(.*)$/);

      if (!linha) {
        fecharParagrafo();
        fecharLista();
        return;
      }

      if (itemNaoOrdenado || itemOrdenado) {
        fecharParagrafo();
        const tipo = itemOrdenado ? 'ol' : 'ul';
        if (!listaAtual || tipoLista !== tipo) {
          listaAtual = document.createElement(tipo);
          tipoLista = tipo;
          destino.appendChild(listaAtual);
        }
        const li = document.createElement('li');
        renderizarInline(itemOrdenado ? itemOrdenado[2] : itemNaoOrdenado[1], li);
        listaAtual.appendChild(li);
        return;
      }

      // Remove marcadores de cabeçalho (#) caso o modelo os utilize.
      fecharLista();
      paragrafo.push(linha.replace(/^#{1,6}\s+/, ''));
    });

    fecharParagrafo();
  };

  /* ------------------------------------------------------------------
     Mensagens na interface
     ------------------------------------------------------------------ */
  const rolarParaFim = (suave = true) => {
    const prefereReducao = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    corpo.scrollTo({ top: corpo.scrollHeight, behavior: suave && !prefereReducao ? 'smooth' : 'auto' });
  };

  const criarMensagem = (tipo, rotulo) => {
    const item = document.createElement('li');
    item.className = `turing-msg turing-msg-${tipo}`;

    const autor = document.createElement('span');
    autor.className = 'turing-msg-autor';
    autor.textContent = rotulo;

    const balao = document.createElement('div');
    balao.className = 'turing-msg-balao';

    item.append(autor, balao);
    return { item, balao };
  };

  const adicionarMensagem = (role, conteudo, { animar = true } = {}) => {
    const ehUsuario = role === 'user';
    const { item, balao } = criarMensagem(ehUsuario ? 'usuario' : 'assistente', ehUsuario ? 'Você' : 'Turing');

    if (ehUsuario) {
      balao.textContent = conteudo;
    } else {
      renderizarMarkdown(conteudo, balao);
    }
    if (!animar) item.style.animation = 'none';

    lista.appendChild(item);
    rolarParaFim(animar);
    return item;
  };

  let indicadorDigitacao = null;

  const mostrarDigitacao = () => {
    removerDigitacao();
    const { item, balao } = criarMensagem('assistente', 'Turing');
    item.classList.add('turing-digitando');
    balao.setAttribute('role', 'status');
    balao.setAttribute('aria-label', 'Turing está digitando');
    for (let i = 0; i < 3; i += 1) {
      const ponto = document.createElement('span');
      ponto.className = 'turing-digitando-ponto';
      ponto.setAttribute('aria-hidden', 'true');
      balao.appendChild(ponto);
    }
    indicadorDigitacao = item;
    lista.appendChild(item);
    rolarParaFim();
  };

  const removerDigitacao = () => {
    if (indicadorDigitacao) {
      indicadorDigitacao.remove();
      indicadorDigitacao = null;
    }
  };

  const mostrarErro = (chave, { aoTentarNovamente } = {}) => {
    const { item, balao } = criarMensagem('erro', 'Aviso');
    item.setAttribute('role', 'alert');

    const texto = document.createElement('p');
    texto.textContent = MENSAGENS_ERRO[chave] || MENSAGENS_ERRO.GENERICO;
    balao.appendChild(texto);

    const acoes = document.createElement('div');
    acoes.className = 'turing-erro-acoes';

    if (aoTentarNovamente) {
      const tentar = document.createElement('button');
      tentar.type = 'button';
      tentar.className = 'turing-erro-botao';
      tentar.textContent = 'Tentar novamente';
      tentar.addEventListener('click', () => {
        item.remove();
        aoTentarNovamente();
      });
      acoes.appendChild(tentar);
    }

    if (chave === 'MUITO_GRANDE' || chave === 'NAO_CONFIGURADO' || chave === 'COTA') {
      const nova = document.createElement('button');
      nova.type = 'button';
      nova.className = 'turing-erro-botao';
      nova.textContent = chave === 'MUITO_GRANDE' ? 'Nova conversa' : 'Falar com a equipe';
      nova.addEventListener('click', () => {
        if (chave === 'MUITO_GRANDE') {
          novaConversa();
        } else {
          fechar();
          window.location.hash = 'contato';
        }
      });
      acoes.appendChild(nova);
    }

    if (acoes.childElementCount) balao.appendChild(acoes);
    lista.appendChild(item);
    rolarParaFim();
  };

  /* ------------------------------------------------------------------
     Status, dica e contador
     ------------------------------------------------------------------ */
  const definirStatus = (estadoStatus, texto) => {
    status.dataset.estado = estadoStatus;
    statusTexto.textContent = texto;
  };

  const definirDica = (texto, tipo) => {
    dica.textContent = texto || DICA_PADRAO;
    if (tipo) dica.dataset.tipo = tipo;
    else delete dica.dataset.tipo;
    campo.setAttribute('aria-invalid', tipo === 'erro' ? 'true' : 'false');
  };

  const atualizarContador = () => {
    const tamanho = campo.value.length;
    contadorValor.textContent = String(tamanho);
    contador.dataset.alerta = String(tamanho > CONFIG.maxCaracteres * 0.9);
  };

  const ajustarAlturaCampo = () => {
    campo.style.height = 'auto';
    campo.style.height = `${Math.min(campo.scrollHeight, 140)}px`;
  };

  const atualizarControles = () => {
    botaoEnviar.disabled = estado.processando || campo.value.trim().length === 0;
    botaoEnviar.setAttribute('aria-label', estado.processando ? 'Aguardando resposta do Turing' : 'Enviar mensagem');
    formulario.setAttribute('aria-busy', String(estado.processando));
  };

  const verificarSaude = async () => {
    if (estado.saudeVerificada) return;
    estado.saudeVerificada = true;
    definirStatus('verificando', 'Verificando conexão…');
    try {
      const resposta = await fetch(CONFIG.urlSaude, { headers: { Accept: 'application/json' } });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error('indisponível');
      if (dados.iaConfigurada) definirStatus('online', 'Online · Orientação acadêmica com IA');
      else definirStatus('pendente', 'Configuração pendente');
    } catch {
      estado.saudeVerificada = false; // tenta novamente na próxima abertura
      definirStatus('offline', 'Offline · Sem conexão com o servidor');
    }
  };

  /* ------------------------------------------------------------------
     Contexto enviado ao backend (com limites de quantidade e tamanho)
     ------------------------------------------------------------------ */
  const montarContexto = () => {
    const recorte = [];
    let total = 0;
    for (let i = estado.historico.length - 1; i >= 0; i -= 1) {
      const mensagem = estado.historico[i];
      if (recorte.length >= CONFIG.maxMensagensHistorico) break;
      total += mensagem.content.length;
      if (total > CONFIG.maxCaracteresHistorico) break;
      recorte.unshift(mensagem);
    }
    return recorte;
  };

  /* ------------------------------------------------------------------
     Comunicação com o backend
     ------------------------------------------------------------------ */
  const solicitarResposta = async (mensagem, elementoUsuario) => {
    estado.processando = true;
    atualizarControles();
    definirStatus('processando', 'Analisando sua mensagem…');
    mostrarDigitacao();

    const controlador = new AbortController();
    estado.controlador = controlador;
    let estourouTempo = false;
    const temporizador = window.setTimeout(() => {
      estourouTempo = true;
      controlador.abort();
    }, CONFIG.timeoutMs);

    let chaveErro = null;

    try {
      const resposta = await fetch(CONFIG.urlChat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mensagem, historico: montarContexto() }),
        signal: controlador.signal
      });

      let dados = null;
      try {
        dados = await resposta.json();
      } catch {
        dados = null;
      }

      if (!resposta.ok || !dados || typeof dados.resposta !== 'string') {
        const codigo = dados?.erro?.codigo;
        chaveErro = ERRO_POR_CODIGO[codigo] || (resposta.status === 429 ? 'LIMITE' : 'IA_INDISPONIVEL');
      } else {
        // Sucesso: a mensagem do usuário e a resposta entram no histórico juntas.
        estado.historico.push({ role: 'user', content: mensagem }, { role: 'assistant', content: dados.resposta });
        estado.historico = estado.historico.slice(-CONFIG.maxMensagensSessao);
        salvarHistorico();
        removerDigitacao();
        adicionarMensagem('assistant', dados.resposta);
        definirStatus('online', 'Online · Orientação acadêmica com IA');
      }
    } catch (erro) {
      if (erro.name === 'AbortError' && !estourouTempo) {
        // Cancelado intencionalmente (ex.: nova conversa). Nada a exibir.
        chaveErro = null;
        elementoUsuario?.remove();
      } else {
        chaveErro = estourouTempo ? 'TIMEOUT' : 'REDE';
      }
    } finally {
      window.clearTimeout(temporizador);
      if (estado.controlador === controlador) estado.controlador = null;
      removerDigitacao();
      estado.processando = false;
      atualizarControles();
    }

    if (chaveErro) {
      definirStatus(
        chaveErro === 'REDE' ? 'offline' : chaveErro === 'NAO_CONFIGURADO' ? 'pendente' : 'online',
        chaveErro === 'REDE'
          ? 'Offline · Sem conexão com o servidor'
          : chaveErro === 'NAO_CONFIGURADO'
            ? 'Configuração pendente'
            : 'Online · Orientação acadêmica com IA'
      );

      if (elementoUsuario && !elementoUsuario.querySelector('.turing-msg-nota')) {
        elementoUsuario.classList.add('turing-msg-nao-enviada');
        const nota = document.createElement('span');
        nota.className = 'turing-msg-nota';
        nota.textContent = 'Não enviada';
        elementoUsuario.appendChild(nota);
      }

      const podeTentar = !['VAZIA', 'LONGA', 'MUITO_GRANDE', 'NAO_CONFIGURADO'].includes(chaveErro);
      mostrarErro(chaveErro, {
        aoTentarNovamente: podeTentar
          ? () => {
              if (estado.processando) return;
              elementoUsuario?.classList.remove('turing-msg-nao-enviada');
              elementoUsuario?.querySelector('.turing-msg-nota')?.remove();
              solicitarResposta(mensagem, elementoUsuario);
            }
          : null
      });
    }
  };

  const enviarMensagem = (textoBruto) => {
    if (estado.processando) {
      definirDica(MENSAGENS_ERRO.SIMULTANEA, 'erro');
      return;
    }

    const mensagem = String(textoBruto ?? '').trim();
    if (!mensagem) {
      definirDica(MENSAGENS_ERRO.VAZIA, 'erro');
      campo.focus();
      return;
    }
    if (mensagem.length > CONFIG.maxCaracteres) {
      definirDica(MENSAGENS_ERRO.LONGA, 'erro');
      campo.focus();
      return;
    }

    definirDica();
    sugestoes.hidden = true;
    campo.value = '';
    atualizarContador();
    ajustarAlturaCampo();

    const elementoUsuario = adicionarMensagem('user', mensagem);
    solicitarResposta(mensagem, elementoUsuario);
  };

  /* ------------------------------------------------------------------
     Conversa: início, restauração e reinício
     ------------------------------------------------------------------ */
  const renderizarConversa = () => {
    lista.replaceChildren();
    estado.historico.forEach((m) => adicionarMensagem(m.role, m.content, { animar: false }));
    sugestoes.hidden = estado.historico.some((m) => m.role === 'user');
    rolarParaFim(false);
  };

  const iniciarConversa = () => {
    estado.historico = [{ role: 'assistant', content: MENSAGEM_INICIAL }];
    salvarHistorico();
    renderizarConversa();
  };

  function novaConversa() {
    if (estado.controlador) estado.controlador.abort();
    removerDigitacao();
    estado.processando = false;
    campo.value = '';
    definirDica();
    atualizarContador();
    ajustarAlturaCampo();
    iniciarConversa();
    atualizarControles();
    campo.focus();
  }

  /* ------------------------------------------------------------------
     Abertura e fechamento
     ------------------------------------------------------------------ */
  const aplicarBloqueioMobile = () => {
    const bloquear = estado.aberto && consultaMobile.matches;
    document.body.classList.toggle('turing-aberto-bloqueio', bloquear);
    painel.setAttribute('aria-modal', String(bloquear));
  };

  const abrir = ({ origem } = {}) => {
    if (estado.aberto) {
      campo.focus();
      return;
    }
    window.clearTimeout(estado.temporizadorFechamento);
    estado.aberto = true;
    estado.elementoOrigemFoco = origem || document.activeElement;

    painel.hidden = false;
    widget.classList.add('turing-aberto');
    lancador.setAttribute('aria-expanded', 'true');
    lancador.setAttribute('aria-label', 'Fechar conversa com o Turing');
    aplicarBloqueioMobile();

    // Força o reflow para que a transição de entrada seja aplicada.
    void painel.offsetWidth;
    painel.classList.add('turing-chat-visivel');

    rolarParaFim(false);
    verificarSaude();
    window.setTimeout(() => campo.focus({ preventScroll: true }), 60);
  };

  function fechar() {
    if (!estado.aberto) return;
    estado.aberto = false;

    painel.classList.remove('turing-chat-visivel');
    widget.classList.remove('turing-aberto');
    lancador.setAttribute('aria-expanded', 'false');
    lancador.setAttribute('aria-label', 'Abrir conversa com o Turing, assistente virtual');
    aplicarBloqueioMobile();

    const duracao = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260;
    estado.temporizadorFechamento = window.setTimeout(() => {
      if (!estado.aberto) painel.hidden = true;
    }, duracao);

    const destinoFoco =
      estado.elementoOrigemFoco && document.contains(estado.elementoOrigemFoco) && estado.elementoOrigemFoco !== document.body
        ? estado.elementoOrigemFoco
        : lancador;
    destinoFoco.focus({ preventScroll: true });
  }

  /* ------------------------------------------------------------------
     Eventos
     ------------------------------------------------------------------ */
  lancador.addEventListener('click', () => (estado.aberto ? fechar() : abrir({ origem: lancador })));
  botaoFechar.addEventListener('click', fechar);
  botaoNovaConversa.addEventListener('click', novaConversa);

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    enviarMensagem(campo.value);
  });

  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter' && !evento.shiftKey && !evento.isComposing) {
      evento.preventDefault();
      enviarMensagem(campo.value);
    }
  });

  campo.addEventListener('input', () => {
    if (dica.dataset.tipo === 'erro') definirDica();
    atualizarContador();
    ajustarAlturaCampo();
    atualizarControles();
  });

  sugestoes.addEventListener('click', (evento) => {
    const botao = evento.target.closest('.turing-sugestao');
    if (botao) enviarMensagem(botao.textContent);
  });

  // Escape fecha o chat quando o foco está dentro dele; Tab fica contido no modo tela cheia.
  painel.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      fechar();
      return;
    }
    if (evento.key === 'Tab' && consultaMobile.matches) {
      const focaveis = [...painel.querySelectorAll('button:not([disabled]), textarea, [href], [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }
  });

  consultaMobile.addEventListener('change', aplicarBloqueioMobile);

  // Integração com a página: seção #turing e links "Consultar Pré-requisitos" dos cards.
  document.querySelectorAll('[data-turing-abrir]').forEach((botao) => {
    botao.hidden = false;
    botao.addEventListener('click', () => abrir({ origem: botao }));
  });

  document.querySelectorAll('.cartao-curso .cartao-link[href="#turing"]').forEach((link) => {
    link.addEventListener('click', (evento) => {
      const titulo = link.closest('.cartao-curso')?.querySelector('.cartao-titulo')?.textContent.trim();
      if (!titulo) return;
      evento.preventDefault();
      abrir({ origem: link });
      if (!estado.processando) {
        campo.value = `Quais conhecimentos prévios são recomendados para a formação "${titulo}"? Ela é adequada ao meu perfil?`;
        atualizarContador();
        ajustarAlturaCampo();
        atualizarControles();
        definirDica('Revise a pergunta e pressione Enter para enviar.');
      }
    });
  });

  /* ------------------------------------------------------------------
     Inicialização
     ------------------------------------------------------------------ */
  const historicoSalvo = restaurarHistorico();
  if (historicoSalvo.length) {
    estado.historico = historicoSalvo;
    renderizarConversa();
  } else {
    iniciarConversa();
  }

  campo.maxLength = CONFIG.maxCaracteres;
  atualizarContador();
  atualizarControles();
  widget.hidden = false;
});
