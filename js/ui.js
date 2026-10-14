document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const botaoMenu = document.getElementById('botao-menu-mobile');
  const menuNavegacao = document.getElementById('navegacao-principal');
  const linksMenu = menuNavegacao ? menuNavegacao.querySelectorAll('.cabecalho-link') : [];

  if (botaoMenu && menuNavegacao) {

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

    botaoMenu.addEventListener('click', (evento) => {
      evento.stopPropagation();
      alternarMenu();
    });

    linksMenu.forEach((link) => {
      link.addEventListener('click', () => {
        if (botaoMenu.getAttribute('aria-expanded') === 'true') {
          alternarMenu(false);
        }
      });
    });

    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape' && botaoMenu.getAttribute('aria-expanded') === 'true') {
        alternarMenu(false);
        botaoMenu.focus();
      }
    });

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

    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768 && botaoMenu.getAttribute('aria-expanded') === 'true') {
        alternarMenu(false);
      }
    });
  }

  const cartoesCursos = document.querySelectorAll('.cartao-curso');

  if (cartoesCursos.length > 0) {
    const prefereReducaoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefereReducaoMovimento || !('IntersectionObserver' in window)) {
      cartoesCursos.forEach((cartao) => {
        cartao.classList.add('revelado');
      });
    } else {
      cartoesCursos.forEach((cartao, indice) => {
        if (!cartao.style.getPropertyValue('--cartao-indice')) {
          cartao.style.setProperty('--cartao-indice', indice);
        }
      });

      const opcoesObservador = {
        root: null,
        rootMargin: '0px 0px -40px 0px',
        threshold: 0.15
      };

      const observadorCursos = new IntersectionObserver((entradas, observador) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) {
            entrada.target.classList.add('revelado');
            observador.unobserve(entrada.target);
          }
        });
      }, opcoesObservador);

      cartoesCursos.forEach((cartao) => {
        observadorCursos.observe(cartao);
      });
    }
  }
});
