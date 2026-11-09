import { CONFIG } from './config.js';
import { MARCA } from './marca.js';
import { createStoryMap, duracionesInmersion, sectionHeightsVh, knotsFromSections, gForScrollKnots, scrollForGKnots } from './logic/story.js';
import { AUTOPLAY_IDLE, startAutoplay, stepAutoplay, interruptAutoplay, releaseAutoplay, renderedG, needsScrollSync } from './logic/autoplay.js';
import { createSmoothScroll } from './smoothScroll.js';
import { createLoader } from './ui/loader.js';
import { initialDprState, nextDprState } from './logic/adaptive.js';
import { createShopInteraction } from './ui/shopInteraction.js';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
const forced = params.has('capturas') ? params.get('forzar') : null;
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const side = matchMedia(CONFIG.sideLayoutQuery);
const reduced = () => motion.matches || forced === 'reducido';
const canvas = document.getElementById('lienzo');
const container = document.getElementById('escenario');
const sections = CONFIG.sections.map(id => document.getElementById(id));
document.querySelector('#tienda .fijo').setAttribute('data-lenis-prevent', '');
const loader = createLoader(root);
const smooth = createSmoothScroll({ enabled: !reduced(), options: CONFIG.smoothScroll });
let map = createStoryMap();
let stage, director, controller, stallTimer;
let knots = [], frame = 0, lastDraw = 0, currentG = 0, dirty = true, failed = false;
let autoplay = AUTOPLAY_IDLE, entered = false, interacted = false, lastProgress = 0;
let resolution = null;
let inspecting = false;
const shopControls = createShopInteraction(() => director, () => { dirty = true; wake(); });

function finish(painted = false) {
  clearTimeout(window.__cafeLoadWatchdog);
  clearInterval(stallTimer);
  container.setAttribute('aria-busy', 'false');
  document.getElementById('carga').classList.add('oculto');
  if (painted) root.classList.add('frame-pintado');
  loader.finish({ painted });
}
function fallback(error, message = 'La animación no está disponible. Puedes explorar los lotes y hacer tu pedido.') {
  console.error('[co2] Escena no disponible', error);
  failed = true; controller?.abort(); smooth.destroy();
  cancelAnimationFrame(frame); frame = 0;
  root.classList.remove('scrub', 'frame-pintado');
  sections.forEach(el => { el.style.removeProperty('height'); el.inert = false; });
  document.getElementById('aviso-texto').textContent = message;
  document.getElementById('aviso').hidden = false;
  finish();
}
function measure() {
  if (failed || reduced()) return;
  const heights = sectionHeightsVh(map, CONFIG.vhPerSecond);
  sections.forEach(el => { el.style.height = `${heights[el.id]}vh`; });
  const tops = Object.fromEntries(sections.map(el => [el.id, el.getBoundingClientRect().top + scrollY]));
  const last = sections.at(-1);
  knots = knotsFromSections(map, tops, tops[last.id] + last.offsetHeight - innerHeight);
  stage?.setSize(innerWidth, innerHeight);
  if (resolution) stage.setPixelRatio(resolution.dpr);
  director?.setSize(innerWidth, innerHeight, stage.getPixelRatio());
  smooth.resize(); dirty = true; wake();
}
function syncAutoplay() {
  if (!needsScrollSync(autoplay)) return;
  smooth.scrollTo(scrollForGKnots(autoplay.G, knots), { immediate: true });
  autoplay = releaseAutoplay(autoplay, gForScrollKnots(scrollY, knots));
}
function tick(now) {
  frame = 0;
  if (failed || reduced() || document.hidden || inspecting) return;
  smooth.raf(now);
  if (director) {
    autoplay = stepAutoplay(autoplay, now); syncAutoplay();
    const G = renderedG(autoplay, gForScrollKnots(scrollY, knots));
    const state = map.at(G);
    const shopVisible = state.seccion === 'tienda' && scrollY < sections.at(-1).getBoundingClientRect().bottom + scrollY;
    if ((dirty || shopVisible || Math.abs(G - currentG) > 0.00001) && now - lastDraw >= 1000 / CONFIG.maxFps - 3) {
      try {
        // La historia depende del scroll; la tienda mantiene granos y cambios de lote en movimiento.
        const result = director.render(state, { time: G, lote: director.getSeleccion() });
        const beyond = scrollY > knots.at(-1).y + innerHeight * 0.5;
        document.dispatchEvent(new CustomEvent('historia:progreso', { detail: { ...state, anchors: beyond ? [] : result.anchors } }));
        sections.forEach(el => { el.inert = el.id !== state.seccion; });
        shopControls.sync(shopVisible);
        container.dataset.progress = String(G / map.total);
        if (result.painted) {
          root.classList.add('frame-pintado');
          if (!loader.isFinished()) finish(true);
        }
      } catch (error) { fallback(error); return; }
      if (lastDraw && now - lastDraw < 100 && resolution) {
        const next = nextDprState(resolution, now - lastDraw, CONFIG.dpr);
        if (next.dpr !== resolution.dpr) {
          stage.setPixelRatio(next.dpr);
          director.setSize(innerWidth, innerHeight, next.dpr);
        }
        resolution = next;
      }
      currentG = G; lastDraw = now; dirty = false;
    }
  }
  wake();
}
function wake() {
  if (!frame && !failed && !reduced() && !document.hidden && !inspecting) frame = requestAnimationFrame(tick);
}
function navigate(selector, immediate = false) {
  const target = document.getElementById(selector.replace(/^#/, ''));
  if (!target) return false;
  autoplay = AUTOPLAY_IDLE; interacted = true;
  const G = map.anclas[target.id];
  smooth.scrollTo(Number.isFinite(G) ? scrollForGKnots(G, knots) : target.getBoundingClientRect().top + scrollY, { immediate });
  dirty = true; wake(); return true;
}
function syncMode() {
  if (failed) return;
  root.classList.toggle('scrub', !reduced());
  smooth.setEnabled(!reduced()); stage?.setParallaxEnabled(false);
  if (reduced()) {
    cancelAnimationFrame(frame); frame = 0; autoplay = AUTOPLAY_IDLE;
    sections.forEach(el => { el.style.removeProperty('height'); el.inert = false; });
    finish(); return;
  }
  measure();
  if (!entered && director) {
    entered = true;
    if (location.hash) navigate(location.hash, true);
    else if (!interacted && scrollY < 2) autoplay = startAutoplay(performance.now(), {
      toG: CONFIG.autoplay.toG, seconds: CONFIG.autoplay.toG * CONFIG.autoplay.secondsPerG,
    });
  }
  wake();
}
async function load() {
  if (reduced()) { syncMode(); return; }
  controller = new AbortController(); lastProgress = performance.now();
  stallTimer = setInterval(() => {
    if (performance.now() - lastProgress > 30000) { controller.abort(); clearInterval(stallTimer); loader.showError(); }
  }, 2000);
  try {
    if (forced === 'sinwebgl') throw Object.assign(new Error('WebGL desactivado para pruebas'), { code: 'webgl' });
    const [{ createStage }, { createDirector, loadModules }] = await Promise.all([
      import('./scene/stage.js'), import('./scene/director.js'),
    ]);
    stage = createStage(canvas, CONFIG); stage.setSize(innerWidth, innerHeight);
    resolution = initialDprState(stage.getPixelRatio());
    if (forced === 'precarga') { clearInterval(stallTimer); loader.setProgress(0.46); return; }
    const [modules] = await Promise.all([
      loadModules(),
      stage.load(forced === 'sinassets' ? 'assets/models/no-existe.json' : CONFIG.assets.manifest,
        (fraction, phase) => { lastProgress = performance.now(); loader.setProgress(fraction, phase); }, { signal: controller.signal }),
    ]);
    if (failed || controller.signal.aborted) return;
    clearInterval(stallTimer);
    map = createStoryMap(duracionesInmersion(modules.inmersion?.INMERSION_DURACION));
    director = createDirector({ stage, modules, marca: MARCA, quality: stage.getQuality(), sideLayout: () => side.matches });
    document.dispatchEvent(new CustomEvent('tienda:consultar')); syncMode();
    if (params.has('capturas')) window.__co2 = {
      map, stage, director,
      go: G => { autoplay = AUTOPLAY_IDLE; smooth.scrollTo(scrollForGKnots(G, knots), { immediate: true }); dirty = true; wake(); },
      state: () => ({ G: currentG, autoplay: autoplay.phase, modules: director.modules() }),
    };
  } catch (error) {
    clearInterval(stallTimer);
    if (failed) return;
    if (error.code === 'webgl') fallback(error);
    else { console.error('[co2] Error de carga', error); loader.showError(); }
  }
}
clearTimeout(window.__cafeLoadWatchdog);
loader.onRetry(() => location.reload());
loader.onSkip(() => fallback(new Error('Vista estática solicitada'), 'Estás viendo la versión sin animación.'));
document.getElementById('reintentar').addEventListener('click', () => location.reload());
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); fallback(new Error('Contexto WebGL perdido')); });
function interrupt() { interacted = true; autoplay = interruptAutoplay(autoplay); syncAutoplay(); }
for (const event of ['wheel', 'touchstart', 'pointerdown']) window.addEventListener(event, interrupt, { passive: true });
window.addEventListener('keydown', event => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) interrupt(); });
window.addEventListener('scroll', () => { dirty = true; wake(); }, { passive: true });
window.addEventListener('resize', measure);
window.addEventListener('hashchange', () => { if (!failed && !reduced()) navigate(location.hash, true); });
document.addEventListener('visibilitychange', wake);
motion.addEventListener('change', () => { if (!stage && !reduced()) load(); else syncMode(); });
document.fonts?.ready.then(measure);
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || failed || reduced() || event.ctrlKey || event.metaKey) return;
  if (navigate(link.getAttribute('href'))) { event.preventDefault(); history.replaceState(null, '', link.getAttribute('href')); }
});
document.addEventListener('ui:navegar', event => {
  if (!failed && !reduced() && navigate(event.detail.destino)) event.preventDefault();
});
document.addEventListener('tienda:seleccion', event => { director?.setSeleccion(event.detail.index); dirty = true; wake(); });
document.addEventListener('producto:estado', event => {
  inspecting = event.detail.abierto;
  if (inspecting) { interrupt(); cancelAnimationFrame(frame); frame = 0; }
  else { dirty = true; wake(); }
});
document.addEventListener('producto:preparar', event => { event.detail.origin = director?.productOrigin(event.detail.index) ?? null; });
let productPointer = null;
document.addEventListener('pointerdown', event => { productPointer = { x: event.clientX, y: event.clientY }; }, { passive: true });
document.addEventListener('click', event => {
  if (inspecting || failed || reduced() || !productPointer || event.target.closest('a, button, input, dialog, .ficha, .selector, [data-shop-drag]')) return;
  if (map.at(currentG).seccion === 'tienda') return;
  if (Math.hypot(event.clientX - productPointer.x, event.clientY - productPointer.y) > 8) return;
  const index = director?.pickProduct(event.clientX, event.clientY) ?? -1;
  if (index >= 0) document.dispatchEvent(new CustomEvent('producto:abrir', { detail: { index } }));
});
document.addEventListener('pointermove', event => {
  const eligible = !inspecting && !failed && !reduced() && !event.target.closest('a, button, input, dialog, .ficha, .selector');
  document.body.classList.toggle('bolsa-seleccionable', eligible && (director?.pickProduct(event.clientX, event.clientY) ?? -1) >= 0);
}, { passive: true });
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  controller?.abort(); smooth.destroy(); director?.dispose(); stage?.three.renderer.dispose();
  clearInterval(stallTimer); cancelAnimationFrame(frame);
});
measure(); load();
