/*
 * Orquestación: el scroll nativo es la única fuente de verdad.
 * progress -> frame, encuadre, capítulos, puntos e indicador, en cualquier dirección.
 */
(function () {
  'use strict';

  const config = window.CafeConfig;
  const { frames } = config;
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sideLayout = window.matchMedia(config.sideLayoutQuery);

  const dom = {
    story: document.getElementById('historia'),
    stage: document.getElementById('escenario'),
    canvas: document.getElementById('lienzo'),
    poster: document.getElementById('poster'),
    hint: document.getElementById('indicacion'),
    loading: document.getElementById('carga'),
    notice: document.getElementById('aviso'),
    retry: document.getElementById('reintentar'),
    indicatorNumber: document.getElementById('indicador-numero'),
    indicatorTitle: document.getElementById('indicador-titulo'),
    indicatorBar: document.getElementById('indicador-barra'),
    menuButton: document.getElementById('menu-boton'),
    menuPanel: document.getElementById('menu-panel'),
  };

  const chapters = config.chapters.map((chapter) => ({
    ...chapter,
    element: document.getElementById(chapter.id),
    dot: document.querySelector(`.puntos a[href="#${chapter.id}"]`),
  }));
  const chapterIds = new Set(chapters.map((chapter) => chapter.id));

  let store = null;
  let renderer = null;
  let measure = { top: 0, range: 1, width: 0, height: 0 };
  let lastDrawKey = '';
  let lastChapterIndex = -1;
  let frameQueued = false;
  let failedPermanently = false;
  let hasPainted = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const isScrubbing = () => root.classList.contains('scrub');

  /* ---------- Medidas y progreso ---------- */

  function measureLayout() {
    const rect = dom.story.getBoundingClientRect();
    const stageRect = dom.stage.getBoundingClientRect();
    measure = {
      top: rect.top + window.scrollY,
      range: Math.max(1, rect.height - stageRect.height),
      width: stageRect.width,
      height: stageRect.height,
    };
  }

  function readProgress() {
    return clamp((window.scrollY - measure.top) / measure.range, 0, 1);
  }

  function scrollForTime(time) {
    return measure.top + (time / frames.duration) * measure.range;
  }

  /* ---------- Encuadre ---------- */

  function interpolateKeyframes(keyframes, time) {
    const nextIndex = keyframes.findIndex((key) => key.time >= time);
    if (nextIndex === -1) return keyframes[keyframes.length - 1];
    if (nextIndex === 0) return keyframes[0];
    const previous = keyframes[nextIndex - 1];
    const next = keyframes[nextIndex];
    const amount = (time - previous.time) / (next.time - previous.time);
    return {
      scale: lerp(previous.scale, next.scale, amount),
      centerX: lerp(previous.centerX, next.centerX, amount),
      centerY: lerp(previous.centerY, next.centerY, amount),
    };
  }

  function rectFromCenter(scale, centerX, centerY) {
    const width = frames.width * scale;
    const height = frames.height * scale;
    return { x: centerX - width / 2, y: centerY - height / 2, width, height };
  }

  function sideRect(time) {
    const { side } = config.framing;
    const { width: vw, height: vh } = measure;
    const cover = Math.max(vw / frames.width, vh / frames.height);
    const base = Math.min(cover, vh / (frames.height * side.minVisibleY));
    const key = interpolateKeyframes(side.keyframes, time);
    return rectFromCenter(base * key.scale, key.centerX * vw, key.centerY * vh);
  }

  function stackedRect() {
    const { stacked } = config.framing;
    const { width: vw, height: vh } = measure;
    const areaHeight = vh * stacked.areaHeight;
    const scale = Math.min(vw / (frames.width * stacked.minVisibleX), areaHeight / frames.height);
    return rectFromCenter(scale, vw * stacked.centerX, stacked.areaTopPx + areaHeight / 2);
  }

  function frameRect(progress) {
    return sideLayout.matches ? sideRect(progress * frames.duration) : stackedRect();
  }

  /* ---------- Render por progreso ---------- */

  function placePoster(rect) {
    Object.assign(dom.poster.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
  }

  function clearPosterPlacement() {
    ['left', 'top', 'width', 'height'].forEach((prop) => dom.poster.style.removeProperty(prop));
  }

  function renderFrame(progress) {
    const wantedFrame = Math.round(progress * (frames.count - 1));
    store.setTarget(wantedFrame);
    const rect = frameRect(progress);
    if (!hasPainted) placePoster(rect);
    const readyFrame = store.nearestReady(wantedFrame);
    if (readyFrame === -1) return;
    const key = `${readyFrame}|${rect.x.toFixed(1)}|${rect.y.toFixed(1)}|${rect.width.toFixed(1)}`;
    if (key === lastDrawKey) return;
    lastDrawKey = key;
    renderer.draw(store.imageAt(readyFrame), rect);
    dom.stage.dataset.frame = String(readyFrame);
    if (!hasPainted) {
      hasPainted = true;
      root.classList.add('frame-pintado');
    }
  }

  function chapterIndexAt(time) {
    const found = chapters.findIndex((chapter) => time < chapter.end);
    return found === -1 ? chapters.length - 1 : found;
  }

  function chapterOpacity(chapter, index, time) {
    const fade = config.chapterFade;
    const fadeIn = index === 0 ? 1 : clamp((time - chapter.start) / fade, 0, 1);
    const fadeOut = index === chapters.length - 1 ? 1 : clamp((chapter.end - time) / fade, 0, 1);
    return Math.min(fadeIn, fadeOut);
  }

  function renderChapters(time) {
    chapters.forEach((chapter, index) => {
      const opacity = chapterOpacity(chapter, index, time);
      const entering = time < chapter.start + config.chapterFade;
      const direction = entering ? 1 : -1;
      chapter.element.style.opacity = opacity.toFixed(3);
      chapter.element.style.setProperty('--desplazamiento', `${(direction * (1 - opacity) * config.chapterShiftPx).toFixed(1)}px`);
    });
  }

  function renderActiveChapter(index) {
    if (index === lastChapterIndex) return;
    lastChapterIndex = index;
    chapters.forEach((chapter, i) => {
      if (i === index) chapter.dot.setAttribute('aria-current', 'step');
      else chapter.dot.removeAttribute('aria-current');
    });
    const active = chapters[index].element;
    dom.indicatorNumber.textContent = String(index + 1).padStart(2, '0');
    dom.indicatorTitle.textContent = active.dataset.titulo;
  }

  function update() {
    frameQueued = false;
    if (!isScrubbing()) return;
    const progress = readProgress();
    const time = progress * frames.duration;
    renderFrame(progress);
    renderChapters(time);
    renderActiveChapter(chapterIndexAt(time));
    dom.indicatorBar.style.transform = `scaleX(${progress.toFixed(4)})`;
    dom.hint.classList.toggle('oculto', progress > config.scrollHintUntil);
    dom.stage.dataset.progress = progress.toFixed(4);
  }

  function scheduleUpdate() {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(update);
  }

  /* ---------- Carga y modos ---------- */

  function showLoadProgress(fraction) {
    const percent = Math.round(fraction * 100);
    dom.loading.textContent = `Preparando animación ${percent} %`;
    dom.loading.classList.toggle('oculto', percent >= 100);
    scheduleUpdate();
  }

  function enterFallback() {
    failedPermanently = true;
    stopScrubbing();
    dom.poster.src = 'assets/poster-final.webp';
    dom.notice.hidden = false;
  }

  function startScrubbing() {
    root.classList.add('scrub');
    if (!store) {
      renderer = window.CafeSecuencia.createRenderer(dom.canvas, config.framing, frames);
      store = window.CafeSecuencia.createFrameStore(frames, config.loader, {
        onFrameReady: showLoadProgress,
        onFatal: enterFallback,
      });
    }
    handleResize();
    jumpToHashChapter();
  }

  function stopScrubbing() {
    root.classList.remove('scrub', 'frame-pintado');
    hasPainted = false;
    lastDrawKey = '';
    clearPosterPlacement();
    chapters.forEach(({ element }) => {
      element.style.removeProperty('opacity');
      element.style.removeProperty('--desplazamiento');
    });
  }

  function syncMode() {
    if (reducedMotion.matches || failedPermanently) stopScrubbing();
    else startScrubbing();
  }

  function handleResize() {
    measureLayout();
    if (!isScrubbing() || !renderer) return;
    renderer.resize(measure.width, measure.height);
    lastDrawKey = '';
    scheduleUpdate();
  }

  /* ---------- Navegación ---------- */

  function goToChapter(id) {
    const chapter = chapters.find((item) => item.id === id);
    window.scrollTo({ top: scrollForTime(chapter.anchor) });
  }

  function jumpToHashChapter() {
    const id = window.location.hash.slice(1);
    if (chapterIds.has(id)) window.scrollTo({ top: scrollForTime(chapters.find((c) => c.id === id).anchor), behavior: 'instant' });
  }

  function handleChapterLinks(event) {
    const link = event.target.closest('a[href^="#cap-"]');
    if (!link || !isScrubbing()) return;
    const id = link.getAttribute('href').slice(1);
    if (!chapterIds.has(id)) return;
    event.preventDefault();
    goToChapter(id);
  }

  /* ---------- Menú ---------- */

  function setMenuOpen(open) {
    dom.menuButton.setAttribute('aria-expanded', String(open));
    dom.menuButton.textContent = open ? 'CERRAR' : 'MENÚ';
    dom.menuPanel.hidden = !open;
  }

  function isMenuOpen() {
    return dom.menuButton.getAttribute('aria-expanded') === 'true';
  }

  function initMenu() {
    dom.menuButton.addEventListener('click', () => setMenuOpen(!isMenuOpen()));
    dom.menuPanel.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenuOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isMenuOpen()) {
        setMenuOpen(false);
        dom.menuButton.focus();
      }
    });
    document.addEventListener('click', (event) => {
      const inside = event.target.closest('#menu-panel, #menu-boton');
      if (!inside && isMenuOpen()) setMenuOpen(false);
    });
  }

  /* ---------- Arranque ---------- */

  function init() {
    dom.poster.addEventListener('error', () => dom.poster.classList.add('roto'), { once: true });
    dom.retry.addEventListener('click', () => window.location.reload());
    document.addEventListener('click', handleChapterLinks);
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', handleResize);
    window.addEventListener('load', handleResize);
    sideLayout.addEventListener('change', handleResize);
    reducedMotion.addEventListener('change', syncMode);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(handleResize);
    new ResizeObserver(handleResize).observe(dom.stage);
    dom.story.style.setProperty('--altura-historia', `${config.scrollVh}vh`);
    initMenu();
    syncMode();
  }

  init();
})();
