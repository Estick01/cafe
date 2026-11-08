/*
 * Pantalla de carga: progreso real, estado de error con reintento y salida con fundido cuando la
 * escena ya pinto su primer fotograma. Solo DOM; el porcentaje lo calcula logic/loadProgress.js.
 */
import { displayPercent } from '../logic/loadProgress.js';

const FADE_MS = 700;
const PRESENT_FALLBACK_MS = 400;
const STATUS = Object.freeze({
  download: 'Moliendo el lote…',
  parse: 'Calentando el agua…',
  compile: 'Sirviendo la primera taza…',
  painted: 'Mesa lista.',
  retry: 'Lo intentamos de nuevo…',
});

export function createLoader(root) {
  const element = (id) => document.getElementById(id);
  const dom = {
    screen: element('precarga'),
    status: element('precarga-estado'),
    progress: element('precarga-progreso'),
    bar: element('precarga-barra'),
    percent: element('precarga-porcentaje'),
    error: element('precarga-error'),
    errorText: element('precarga-error-texto'),
    retry: element('precarga-reintentar'),
    skip: element('precarga-saltar'),
  };
  const background = [...document.body.children]
    .filter((child) => child !== dom.screen && child.tagName !== 'SCRIPT')
    .map((child) => ({ child, inert: child.inert }));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let percent = 0;
  let phase = '';
  let finished = false;

  const active = () => root.classList.contains('cargando');

  function render() {
    dom.screen.style.setProperty('--progreso', (percent / 100).toFixed(3));
    dom.bar.style.transform = `scaleX(${(percent / 100).toFixed(3)})`;
    dom.percent.textContent = `${percent} %`;
    dom.progress.setAttribute('aria-valuenow', String(percent));
    dom.progress.setAttribute('aria-valuetext', `${percent} %`);
  }

  /* Durante la carga, el resto de la pagina no recibe foco ni clics: no hay nada que ver aun. */
  function lockBackground() {
    if (!active()) return;
    background.forEach(({ child }) => { child.inert = true; });
  }

  function unlockBackground() {
    background.forEach(({ child, inert }) => { child.inert = inert; });
  }

  function setProgress(fraction, nextPhase = 'download') {
    if (finished) return;
    percent = displayPercent(percent, nextPhase, fraction);
    if (nextPhase !== phase) {
      phase = nextPhase;
      dom.status.textContent = STATUS[nextPhase] ?? STATUS.download;
    }
    render();
  }

  function showError(message) {
    if (finished) return;
    root.classList.add('precarga-fallo');
    dom.status.textContent = 'La carga se detuvo.';
    if (message) dom.errorText.textContent = message;
    dom.error.hidden = false;
    dom.retry.focus({ preventScroll: true });
  }

  function resetForRetry() {
    root.classList.remove('precarga-fallo');
    dom.error.hidden = true;
    percent = 0;
    phase = 'retry';
    dom.status.textContent = STATUS.retry;
    render();
  }

  /*
   * Fin de la carga. Con exito espera a que el navegador presente el fotograma y funde la pantalla;
   * sin exito (modo estatico) la quita sin mas. Devuelve el foco a la pagina si estaba dentro.
   */
  function finish({ painted }) {
    if (finished) return;
    finished = true;
    if (painted) {
      percent = displayPercent(percent, 'painted');
      dom.status.textContent = STATUS.painted;
      render();
    }
    const hadFocus = dom.screen.contains(document.activeElement);
    const close = () => {
      unlockBackground();
      const fade = painted && !reducedMotion.matches && active();
      root.classList.remove('cargando', 'precarga-fallo');
      if (fade) {
        root.classList.add('precarga-saliendo');
        setTimeout(() => root.classList.remove('precarga-saliendo'), FADE_MS + 50);
      }
      if (hadFocus) document.querySelector('.marca')?.focus({ preventScroll: true });
    };
    if (!painted) {
      close();
      return;
    }
    // Dos rAF: el fotograma ya se presento. El temporizador cubre pestañas en segundo plano.
    let closed = false;
    const closeOnce = () => {
      if (closed) return;
      closed = true;
      close();
    };
    requestAnimationFrame(() => requestAnimationFrame(closeOnce));
    setTimeout(closeOnce, PRESENT_FALLBACK_MS);
  }

  lockBackground();
  render();

  return {
    setProgress,
    showError,
    resetForRetry,
    finish,
    isFinished: () => finished,
    onRetry: (handler) => dom.retry.addEventListener('click', handler),
    onSkip: (handler) => dom.skip.addEventListener('click', handler),
    percent: () => percent,
  };
}
