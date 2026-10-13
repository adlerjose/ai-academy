/**
 * ============================================================================
 * AI ACADEMY - INTERAÇÕES DE INTERFACE (UI)
 * Vanilla JavaScript puro (ES6+)
 * 
 * Funcionalidades:
 * 1. Menu Hambúrguer Mobile: Acessibilidade com estados ARIA (aria-expanded),
 *    suporte a fechamento por clique externo, tecla ESC e clique em links.
 * 2. IntersectionObserver: Revelação fluida (fade-in e slide-up) para os
 *    cards de cursos com escalonamento sequencial (staggered delay) e
 *    respeito a preferências de movimento reduzido (prefers-reduced-motion).
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // --------------------------------------------------------------------------
  // 1. MENU HAMBÚRGUER (NAVEGAÇÃO RESPONSIVA MOBILE)
  // --------------------------------------------------------------------------
  const botaoMenu = document.getElementById('botao-menu-mobile');
  const menuNavegacao = document.getElementById('navegacao-principal');
  const linksMenu = menuNavegacao ? menuNavegacao.querySelectorAll('.cabecalho-link') : [];

  if (botaoMenu && menuNavegacao) {
    /**
     * Alterna o estado de abertura do menu de navegação móvel
     * @param {boolean} [forcarEstado] - Força abertura (true) ou fechamento (false)
     */
    const alternarMenu = (forcarEstado) => {
      const estaAberto = botaoMenu.getAttribute('aria-expanded') === 'true';
      const novoEstado = typeof forcarEstado === 'boolean' ? forcarEstado : !estaAberto;

      botaoMenu.setAttribute('aria-expanded', String(novoEstado));
      botaoMenu.setAttribute(
        'aria-label',
        novoEstado ? 'Fechar menu de navegação' : 'Abrir menu de navegação'
      );

      menuNavegacao.classList.toggle('ativo', novoEstado);
      botaoMenu.classList.toggle('aberto', novoEstado);
      document.body.classList.toggle('menu-aberto-bloqueio', novoEstado);
    };

    // Clique no botão de hambúrguer
    botaoMenu.addEventListener('click', (evento) => {
      evento.stopPropagation();
      alternarMenu();
    });

    // Fecha o menu ao clicar em qualquer link de navegação interno
    linksMenu.forEach((link) => {
      link.addEventListener('click', () => {
        if (botaoMenu.getAttribute('aria-expanded') === 'true') {
          alternarMenu(false);
        }
      });
    });

    // Fecha o menu ao pressionar a tecla Escape (acessibilidade teclado)
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && botaoMenu.getAttribute('aria-expanded') === 'true') {
        alternarMenu(false);
        botaoMenu.focus();
      }
    });

    // Fecha o menu ao clicar fora da barra do cabeçalho
    document.addEventListener('click', (evento) => {
      const cabecalho = document.querySelector('.cabecalho');
      if (
        botaoMenu.getAttribute('aria-expanded') === 'true' &&
        cabecalho &&
        !cabecalho.contains(evento.target)
      ) {
        alternarMenu(false);
      }
    });

    // Redimensionamento de tela: se expandir além do breakpoint mobile (768px), reseta o menu
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768 && botaoMenu.getAttribute('aria-expanded') === 'true') {
        alternarMenu(false);
      }
    });
  }

  // --------------------------------------------------------------------------
  // 2. INTERSECTION OBSERVER (REVELAÇÃO DOS CARDS DE CURSOS)
  // --------------------------------------------------------------------------
  const cartoesCursos = document.querySelectorAll('.cartao-curso');

  if (cartoesCursos.length > 0) {
    // Detecta se o usuário configurou preferência de redução de movimento no sistema
    const prefereReducaoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Se o usuário preferir menos animação ou se a API não estiver disponível no navegador
    if (prefereReducaoMovimento || !('IntersectionObserver' in window)) {
      cartoesCursos.forEach((cartao) => {
        cartao.classList.add('revelado');
      });
    } else {
      // Garante que cada cartão tenha um índice atribuído para o delay escalonado no CSS
      cartoesCursos.forEach((cartao, indice) => {
        if (!cartao.style.getPropertyValue('--cartao-indice')) {
          cartao.style.setProperty('--cartao-indice', indice);
        }
      });

      const opcoesObservador = {
        root: null, // utiliza a viewport como referência
        rootMargin: '0px 0px -40px 0px', // antecipa a revelação antes de encostar na base
        threshold: 0.15 // dispara quando 15% do elemento estiver visível
      };

      const observadorCursos = new IntersectionObserver((entradas, observador) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            entrada.target.classList.add('revelado');
            // Remove a observação do elemento após a animação de entrada ocorrer
            observador.unobserve(entrada.target);
          }
        });
      }, opcoesObservador);

      // Inicia a observação de cada cartão de curso
      cartoesCursos.forEach((cartao) => {
        observadorCursos.observe(cartao);
      });
    }
  }
});

