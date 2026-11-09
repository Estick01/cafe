/*
 * Desplazamiento suave con Lenis (vendor/lenis-1.1.13). La fuente de verdad sigue siendo la
 * posicion de scroll del documento: Lenis solo suaviza la rueda y mueve window.scrollY; el teclado,
 * las barras y el tacto siguen siendo nativos. Sin Lenis (movimiento reducido, fallo de carga), las
 * mismas funciones caen en window.scrollTo.
 *
 * Lenis no tiene bucle propio: app.js llama a raf(now) desde el mismo requestAnimationFrame que
 * dibuja la escena.
 */
const LENIS_URL = '../vendor/lenis-1.1.13/lenis.mjs';
const LENIS_CSS = new URL('../vendor/lenis-1.1.13/lenis.css', import.meta.url).href;

function addStylesheet() {
  if (document.querySelector(`link[href="${LENIS_CSS}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = LENIS_CSS;
  document.head.append(link);
}

const nativeScrollTo = (top, immediate) => window.scrollTo({ top, behavior: immediate ? 'instant' : 'smooth' });

export function createSmoothScroll({ enabled, options = {}, onScroll = () => {} }) {
  let lenis = null;
  let wanted = enabled;

  async function start() {
    if (!wanted || lenis) return;
    try {
      const { default: Lenis } = await import(LENIS_URL);
      if (!wanted || lenis) return;
      addStylesheet();
      lenis = new Lenis({ smoothWheel: true, syncTouch: false, ...options });
      lenis.on('scroll', onScroll);
    } catch (error) {
      console.error('[co2] Lenis no se pudo cargar; queda el scroll nativo', error);
      lenis = null;
    }
  }

  function stop() {
    wanted = false;
    lenis?.destroy();
    lenis = null;
  }

  return {
    start,
    /* Activa o quita Lenis (p. ej. al cambiar prefers-reduced-motion). */
    async setEnabled(value) {
      if (value) {
        wanted = true;
        await start();
      } else stop();
    },
    raf(now) {
      lenis?.raf(now);
    },
    /* true mientras Lenis anima: el bucle de dibujo debe seguir vivo. */
    isAnimating: () => Boolean(lenis && lenis.isScrolling === 'smooth'),
    /* immediate: salta sin animar (sincronizar scroll e imagen); si no, suave (puntos del riel). */
    scrollTo(top, { immediate = false } = {}) {
      if (lenis) lenis.scrollTo(top, { immediate, force: true, lock: false });
      else nativeScrollTo(top, immediate || !wanted);
    },
    /* Tras cambiar la altura de la pagina, Lenis debe volver a medir su limite. */
    resize: () => lenis?.resize(),
    isActive: () => Boolean(lenis),
    destroy: stop,
  };
}
