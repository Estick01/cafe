/*
 * Orquestacion: el scroll nativo es la unica fuente de verdad.
 * progress -> pose -> escena, capitulos, puntos e indicador, en cualquier direccion.
 * La misma estructura que la landing de imagenes; solo cambia el renderizador.
 */
import { CONFIG } from './config.js';
import { initialDprState, nextDprState } from './logic/adaptive.js';
import { aromaAnchors } from './logic/aroma.js';
import { TOTAL_DURATION, sceneAt, scrollForTotalTime, totalTimeForProgress } from './logic/epilogue.js';
import { progressAt } from './logic/progress.js';
import { createAromaChips } from './ui/aromas.js';
import { createLoader } from './ui/loader.js';
import { initMenu } from './ui/menu.js';
import { initDemoForm, initTastingCard } from './ui/secciones.js';

const NOTICES = Object.freeze({
  webgl: 'Tu navegador no pudo iniciar la animación 3D, pero aquí tienes la historia completa.',
  assets: 'La animación no se pudo cargar, pero aquí tienes la historia completa.',
});

/* Margen para que una pantalla de 60 Hz no pierda fotogramas por redondeo del temporizador. */
const FRAME_SLACK_MS = 3;

const root = document.documentElement;
const params = new URLSearchParams(window.location.search);
/* Solo en modo de pruebas (?capturas): permite ensayar los modos de reserva sin tocar el sistema. */
const forced = params.has('capturas') ? params.get('forzar') : null;
const realReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = forced === 'reducido' ? { matches: true, addEventListener() {} } : realReducedMotion;
const sideLayout = window.matchMedia(CONFIG.sideLayoutQuery);

const dom = {
  story: document.getElementById('historia'),
  stage: document.getElementById('escenario'),
  canvas: document.getElementById('lienzo'),
  poster: document.getElementById('poster'),
  hint: document.getElementById('indicacion'),
  loading: document.getElementById('carga'),
  notice: document.getElementById('aviso'),
  noticeText: document.getElementById('aviso-texto'),
  retry: document.getElementById('reintentar'),
  indicatorNumber: document.getElementById('indicador-numero'),
  indicatorTitle: document.getElementById('indicador-titulo'),
  indicatorBar: document.getElementById('indicador-barra'),
  menuButton: document.getElementById('menu-boton'),
  menuPanel: document.getElementById('menu-panel'),
  tastingCard: document.querySelector('.ficha-tarjeta'),
  bookingForm: document.getElementById('reserva'),
  bookingStatus: document.getElementById('reserva-estado'),
  aromas: document.getElementById('aromas'),
};
const aromaChips = createAromaChips(dom.aromas);
/* Las etiquetas de aroma solo en pantallas holgadas y con la calidad alta. */
const roomyScreen = window.matchMedia(CONFIG.aromaChipsQuery);

const chapters = CONFIG.chapters.map((chapter) => ({
  ...chapter,
  element: document.getElementById(chapter.id),
  dot: document.querySelector(`.puntos a[href="#${chapter.id}"]`),
}));
const chapterIds = new Set(chapters.map((chapter) => chapter.id));

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const state = {
  stage: null,
  measure: { top: 0, range: 1, width: 0, height: 0 },
  lastProgress: -1,
  lastChapterIndex: -1,
  lastActivity: 0,
  lastFrameTime: 0,
  lastRenderTime: 0,
  renderCount: 0,
  frameRequest: 0,
  visible: true,
  needsRender: true,
  skipFrame: false,
  dpr: initialDprState(1),
  failed: false,
  hasPainted: false,
  autoStartedAt: null,
  autoProgress: null,
  autoFinished: false,
  userScrolled: false,
};

const isScrubbing = () => root.classList.contains('scrub');

/* Sin progreso durante este tiempo, la carga se da por atascada y se ofrece reintentar. */
const LOAD_STALL_MS = 20000;
const loader = createLoader(root);
const loading = { controller: null, lastProgressAt: 0, stallTimer: 0, stage: null };

function finishPreload(painted = false) {
  if (loader.isFinished()) return;
  clearTimeout(window.__cafeLoadWatchdog);
  clearInterval(loading.stallTimer);
  dom.stage.setAttribute('aria-busy', 'false');
  loader.finish({ painted });
}

/* ---------- Medidas ---------- */

function measureLayout() {
  const rect = dom.story.getBoundingClientRect();
  const stageRect = dom.stage.getBoundingClientRect();
  state.measure = {
    top: rect.top + window.scrollY,
    range: Math.max(1, rect.height - stageRect.height),
    width: stageRect.width,
    height: stageRect.height,
  };
}

/* ---------- Capitulos e indicador ---------- */

function chapterIndexAt(time) {
  const found = chapters.findIndex((chapter) => time < chapter.end);
  return found === -1 ? chapters.length - 1 : found;
}

function chapterOpacity(chapter, index, time) {
  const fade = CONFIG.chapterFade;
  const fadeIn = index === 0 ? 1 : clamp((time - chapter.start) / fade, 0, 1);
  const fadeOut = index === chapters.length - 1 ? 1 : clamp((chapter.end - time) / fade, 0, 1);
  return Math.min(fadeIn, fadeOut);
}

/*
 * Solo la tarjeta visible queda con visibility: visible; las demas no se componen, asi el
 * backdrop-filter del vidrio cuesta una sola capa. --avance llena el hilo de la etapa.
 */
function renderChapters(time) {
  chapters.forEach((chapter, index) => {
    const opacity = chapterOpacity(chapter, index, time);
    const direction = time < chapter.start + CONFIG.chapterFade ? 1 : -1;
    const { style } = chapter.element;
    style.opacity = opacity.toFixed(3);
    style.visibility = opacity > 0.001 ? 'visible' : 'hidden';
    style.setProperty('--desplazamiento', `${(direction * (1 - opacity) * CONFIG.chapterShiftPx).toFixed(1)}px`);
    style.setProperty('--avance', clamp((time - chapter.start) / (chapter.end - chapter.start), 0, 1).toFixed(3));
  });
}

function renderActiveChapter(index) {
  if (index === state.lastChapterIndex) return;
  state.lastChapterIndex = index;
  chapters.forEach((chapter, i) => {
    if (i === index) chapter.dot.setAttribute('aria-current', 'step');
    else chapter.dot.removeAttribute('aria-current');
  });
  dom.indicatorNumber.textContent = String(index + 1).padStart(2, '0');
  dom.indicatorTitle.textContent = chapters[index].element.dataset.titulo;
}

function renderInterface(progress) {
  const time = totalTimeForProgress(progress);
  renderChapters(time);
  renderActiveChapter(chapterIndexAt(time));
  dom.indicatorBar.style.transform = `scaleY(${progress.toFixed(4)})`;
  dom.hint.classList.toggle('oculto', progress > CONFIG.scrollHintUntil);
  dom.stage.dataset.progress = progress.toFixed(4);
}

/* ---------- Bucle de dibujo ---------- */

function markPainted() {
  if (state.failed) return;
  if (state.hasPainted) return;
  state.hasPainted = true;
  root.classList.add('frame-pintado');
  finishPreload(true);
}

function adaptResolution(frameMs) {
  const next = nextDprState(state.dpr, frameMs, CONFIG.dpr);
  if (next.dpr !== state.dpr.dpr) state.stage.setPixelRatio(next.dpr);
  state.dpr = next;
}

function tick(now) {
  state.frameRequest = 0;
  if (!isScrubbing() || !state.stage || !state.visible) return;
  scheduleTick();

  const delta = state.lastFrameTime ? now - state.lastFrameTime : 16;
  state.lastFrameTime = now;

  const progress = progressAt(window.scrollY, state.measure);
  const automatic = state.autoProgress !== null;
  const currentProgress = automatic ? state.autoProgress : progress;
  const scrolled = currentProgress !== state.lastProgress;
  if (scrolled) {
    state.lastProgress = currentProgress;
    state.lastActivity = now;
    state.needsRender = true;
    renderInterface(currentProgress);
  }

  const { pose, epilogue } = sceneAt(totalTimeForProgress(currentProgress));
  const animated = state.stage.tickAmbient(delta, pose);
  const idle = now - state.lastActivity > CONFIG.idleAfterMs;
  // Parado, el movimiento ambiental va a la mitad de frecuencia para no cargar la GPU sin motivo.
  state.skipFrame = idle && !state.skipFrame;
  if (!state.needsRender && (!animated || state.skipFrame) && !automatic) return;
  const sinceRender = now - state.lastRenderTime;
  if (sinceRender < 1000 / CONFIG.maxFps - FRAME_SLACK_MS) return;

  const painted = state.stage.render(pose, sideLayout.matches, epilogue);
  renderAromaChips(epilogue);
  state.lastRenderTime = now;
  state.renderCount += 1;
  state.needsRender = false;
  if (painted !== false) markPainted();
  if (!idle && !state.stage.setVisible) adaptResolution(sinceRender);
  if (automatic) {
    state.autoProgress = Math.min(1, Math.max(0, (now - state.autoStartedAt) / (TOTAL_DURATION * 1000)));
    state.needsRender = true;
    if (state.autoProgress >= 1) {
      state.autoProgress = null;
      state.autoFinished = true;
      state.lastProgress = -1;
    }
  }
}

/* Etiquetas Panela, Mandarina y Cacao sobre sus nubes de aroma, con la camara del ultimo render. */
function renderAromaChips(epilogue) {
  const enabled = epilogue.active && !epilogue.staticView && roomyScreen.matches
    && state.stage.getQuality?.() !== 'low' && Boolean(state.stage.projectToScreen);
  const anchors = enabled ? aromaAnchors(epilogue.time, epilogue.surfaceZ) : [];
  aromaChips.update(anchors, state.stage.projectToScreen, enabled, state.measure.width);
}

function scheduleTick() {
  if (!state.frameRequest) state.frameRequest = requestAnimationFrame(tick);
}

function wake() {
  state.lastActivity = performance.now();
  state.lastFrameTime = 0;
  scheduleTick();
}

/* ---------- Modos ---------- */

function showNotice(reason) {
  dom.noticeText.textContent = NOTICES[reason];
  dom.notice.hidden = false;
}

function enterFallback(reason, error) {
  console.error(`[vetamora] Modo estatico (${reason})`, error);
  state.failed = true;
  finishPreload();
  stopScrubbing();
  root.classList.remove('estatico-3d');
  dom.poster.src = CONFIG.assets.posterFinal;
  dom.loading.classList.add('oculto');
  showNotice(reason);
}

function stopScrubbing() {
  root.classList.remove('scrub', 'frame-pintado');
  aromaChips.hide();
  state.hasPainted = false;
  chapters.forEach(({ element }) => {
    element.style.removeProperty('opacity');
    element.style.removeProperty('visibility');
    element.style.removeProperty('--desplazamiento');
    element.style.removeProperty('--avance');
  });
}

/* Movimiento reducido: el estado final, una sola vez, sin scrub ni bucle. */
function renderStaticFinal() {
  if (!state.stage) return;
  root.classList.add('estatico-3d');
  const { width, height } = dom.canvas.getBoundingClientRect();
  if (width < 1 || height < 1) return;
  state.stage.setSize(width, height);
  // Composicion final quieta: la cuchara en reposo y el aroma detenido.
  const { pose, epilogue } = sceneAt(TOTAL_DURATION, { staticView: true });
  const painted = state.stage.renderStatic(pose, epilogue);
  if (painted !== false) markPainted();
}

function syncMode() {
  if (state.failed) return;
  if (reducedMotion.matches) {
    stopScrubbing();
    state.stage?.setParallaxEnabled(false);
    renderStaticFinal();
    return;
  }
  root.classList.remove('estatico-3d');
  root.classList.add('scrub');
  state.stage?.setParallaxEnabled(true);
  handleResize();
  jumpToHashChapter();
  const openedOnStoryStart = window.scrollY <= state.measure.top + 2
    && !window.location.hash.startsWith('#cap-');
  if (openedOnStoryStart && !state.userScrolled && !state.autoFinished) {
    state.autoStartedAt = performance.now();
    state.autoProgress = 0;
  }
  wake();
}

function handleResize() {
  measureLayout();
  if (!state.stage) return;
  if (!isScrubbing()) {
    if (reducedMotion.matches) renderStaticFinal();
    return;
  }
  state.stage.setSize(state.measure.width, state.measure.height);
  state.lastProgress = -1;
  state.needsRender = true;
  scheduleTick();
}

/* ---------- Navegacion ---------- */

function jumpToHashChapter() {
  const id = window.location.hash.slice(1);
  if (!chapterIds.has(id)) return;
  const chapter = chapters.find((item) => item.id === id);
  window.scrollTo({ top: scrollForTotalTime(chapter.anchor, state.measure), behavior: 'instant' });
}

function handleChapterLinks(event) {
  const link = event.target.closest('a[href^="#cap-"]');
  if (!link || !isScrubbing()) return;
  const id = link.getAttribute('href').slice(1);
  if (!chapterIds.has(id)) return;
  event.preventDefault();
  const chapter = chapters.find((item) => item.id === id);
  window.scrollTo({ top: scrollForTotalTime(chapter.anchor, state.measure) });
}

/* ---------- Carga ---------- */

function showLoadProgress(fraction, phase = 'download') {
  loading.lastProgressAt = performance.now();
  dom.loading.textContent = `Preparando animación ${Math.round(fraction * 100)} %`;
  loader.setProgress(fraction, phase);
}

/* Error de descarga con la pantalla de carga aun visible: se ofrece reintentar sin recargar. */
function showLoadError(error) {
  console.error('[vetamora] La carga de la escena fallo', error);
  clearInterval(loading.stallTimer);
  loading.controller?.abort();
  loader.showError();
}

function watchStall() {
  clearInterval(loading.stallTimer);
  loading.lastProgressAt = performance.now();
  loading.stallTimer = setInterval(() => {
    if (performance.now() - loading.lastProgressAt < LOAD_STALL_MS) return;
    showLoadError(new Error('La descarga no avanza'));
  }, 2000);
}

function supportsWebGL2() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

async function loadStage() {
  const useSequence = CONFIG.renderer === 'sequence' || params.get('render') === 'sequence';
  if (!useSequence && (forced === 'sinwebgl' || !supportsWebGL2())) {
    enterFallback('webgl', new Error('WebGL2 no disponible'));
    return;
  }
  let stage = loading.stage;
  loading.controller = new AbortController();
  watchStall();
  try {
    if (!stage) {
      const { createStage } = await import(useSequence ? './scene/sequenceStage.js' : './scene/stage.js');
      stage = createStage(dom.canvas, CONFIG, {
        onFrame: markPainted,
        onError: error => enterFallback('assets', error),
      });
      loading.stage = stage;
    }
    stage.setSize(state.measure.width || window.innerWidth, state.measure.height || window.innerHeight);
    if (forced === 'precarga') { // solo pruebas: deja la pantalla de carga quieta a medio camino
      clearInterval(loading.stallTimer);
      showLoadProgress(Number(params.get('progreso') ?? 0.46), 'download');
      return;
    }
    await stage.load(forced === 'sinassets' ? 'assets/models/no-existe.json'
      : useSequence ? 'assets/sequence/manifest.json' : CONFIG.assets.manifest, showLoadProgress,
    { signal: loading.controller.signal });
    clearInterval(loading.stallTimer);
    if (state.failed) { stage.dispose?.(); return; }
    dom.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      enterFallback('webgl', new Error('Contexto WebGL perdido'));
    });
    state.stage = stage;
    state.dpr = initialDprState(stage.getPixelRatio());
    dom.loading.classList.add('oculto');
    syncMode();
    // Una URL con ancla puede abrir fuera de la historia: dibujar sin esperar al scroll.
    if (!state.hasPainted && !reducedMotion.matches) {
      const { pose, epilogue } = sceneAt(totalTimeForProgress(progressAt(window.scrollY, state.measure)));
      if (stage.render(pose, sideLayout.matches, epilogue) !== false) markPainted();
    }
    if (params.has('capturas') && stage.captureReference) {
      const { installCaptures } = await import('./debug/capturas.js');
      installCaptures(stage, () => ({ dpr: state.dpr.dpr, renders: state.renderCount }));
    }
  } catch (error) {
    clearInterval(loading.stallTimer);
    if (state.failed) return;
    // Sin WebGL no hay reintento posible; un fallo de red, mientras se ve la carga, si.
    if (error?.code !== 'webgl' && !loader.isFinished()) showLoadError(error);
    else enterFallback(error?.code === 'webgl' ? 'webgl' : 'assets', error);
  }
}

/* ---------- Arranque ---------- */

function init() {
  if (root.classList.contains('cargando')) dom.stage.setAttribute('aria-busy', 'true');
  // El modulo arranco: la vigilancia de la pagina deja paso a la del propio cargador (watchStall).
  clearTimeout(window.__cafeLoadWatchdog);
  window.addEventListener('cafe-load-timeout', () => {
    if (!loader.isFinished()) enterFallback('assets', new Error('Tiempo de carga agotado'));
  }, { once: true });
  loader.onRetry(() => {
    // Un modulo que no llego a importarse queda fallido en esta pagina: solo recargar lo arregla.
    if (!loading.stage) {
      window.location.reload();
      return;
    }
    loader.resetForRetry();
    loadStage();
  });
  loader.onSkip(() => {
    loading.controller?.abort();
    enterFallback('assets', new Error('El visitante eligio la version estatica'));
    dom.noticeText.textContent = 'Estás viendo la versión sin animación.';
  });
  dom.poster.addEventListener('error', () => dom.poster.classList.add('roto'), { once: true });
  dom.retry.addEventListener('click', () => window.location.reload());
  document.addEventListener('click', handleChapterLinks);
  window.addEventListener('scroll', () => {
    state.userScrolled = true;
    state.autoFinished = true;
    state.autoProgress = null;
    scheduleTick();
  }, { passive: true });
  window.addEventListener('resize', handleResize);
  window.addEventListener('load', handleResize);
  sideLayout.addEventListener('change', handleResize);
  reducedMotion.addEventListener('change', syncMode);
  document.addEventListener('visibilitychange', () => {
    state.stage?.setVisible?.(!document.hidden && state.visible);
    if (!document.hidden) wake();
  });
  window.addEventListener('pointermove', () => {
    state.lastActivity = performance.now();
  }, { passive: true });
  if (document.fonts?.ready) document.fonts.ready.then(handleResize);
  new ResizeObserver(handleResize).observe(dom.stage);
  // Fuera de la historia no se dibuja nada: la GPU descansa en la parte de pedido.
  new IntersectionObserver(([entry]) => {
    state.visible = entry.isIntersecting;
    state.stage?.setVisible?.(state.visible && !document.hidden);
    if (state.visible) wake();
  }).observe(dom.story);
  window.addEventListener('pagehide', event => { if (!event.persisted) state.stage?.dispose?.(); });
  dom.story.style.setProperty('--altura-historia', `${CONFIG.scrollVh}vh`);
  initMenu({ button: dom.menuButton, panel: dom.menuPanel });
  initTastingCard(dom.tastingCard);
  initDemoForm(dom.bookingForm, dom.bookingStatus);
  measureLayout();
  renderInterface(0);
  loadStage();
}

init();
