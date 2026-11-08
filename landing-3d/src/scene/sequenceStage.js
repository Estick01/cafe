/* Cycles frames: native scroll selects the exact image in either direction.
 * Bounded decoded cache and cancellable requests keep mobile memory predictable.
 */
import { frameRect } from '../logic/framing.js';
import { DURATION } from '../logic/timeline.js';

export function frameForTime(time, count) {
  return Math.round(Math.max(0, Math.min(1, time / DURATION)) * (count - 1));
}

export function createStage(canvas, config, { onFrame = () => {}, onError = () => {} } = {}) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D no disponible');
  const cache = new Map();
  const pending = new Map();
  const failed = new Set();
  const limit = 16;
  let urls = [];
  let width = 1, height = 1, ratio = 1;
  let target = 0;
  let view = { time: 0, side: false, static: false };
  let disposed = false;
  let visible = true;

  function evict() {
    while (cache.size > limit) {
      const candidate = [...cache.keys()].filter(index => index !== target)
        .sort((a, b) => Math.abs(b - target) - Math.abs(a - target))[0];
      cache.get(candidate).close();
      cache.delete(candidate);
    }
  }

  function draw() {
    const bitmap = cache.get(target);
    if (!bitmap || disposed || !visible || document.hidden) return false;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#0e0c0b';
    context.fillRect(0, 0, width, height);
    const rect = view.static
      ? (() => {
        const scale = Math.min(width / bitmap.width, height / bitmap.height);
        return { x: (width - bitmap.width * scale) / 2, y: (height - bitmap.height * scale) / 2,
          width: bitmap.width * scale, height: bitmap.height * scale };
      })()
      : frameRect({ width, height, side: view.side, time: view.time });
    context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height);
    onFrame();
    return true;
  }

  async function fetchFrame(index) {
    if (cache.has(index)) return;
    if (pending.has(index)) return pending.get(index).promise;
    const controller = new AbortController();
    const request = { controller, promise: null };
    request.promise = (async () => {
      const response = await fetch(urls[index], { signal: controller.signal });
      if (!response.ok) throw new Error(`Fotograma ${index}: HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob());
      if (disposed || controller.signal.aborted) { bitmap.close(); return; }
      cache.set(index, bitmap);
      failed.delete(index);
      evict();
      if (target === index) draw();
    })().finally(() => { if (pending.get(index) === request) pending.delete(index); });
    pending.set(index, request);
    return request.promise;
  }

  function requestWindow() {
    if (disposed || !visible || document.hidden) return;
    for (const [index, request] of pending) {
      if (Math.abs(index - target) > 6) request.controller.abort();
    }
    const candidates = [target, target + 1, target - 1, target + 2, target - 2, target + 3];
    for (const index of candidates) {
      if (index < 0 || index >= urls.length || cache.has(index) || pending.has(index) || failed.has(index)) continue;
      if (pending.size >= 4) break;
      fetchFrame(index).catch(error => {
        if (error.name === 'AbortError') return;
        failed.add(index);
        if (index === target) onError(error);
      }).finally(() => requestWindow());
    }
  }

  /* El tercer argumento (estado del epilogo) no aplica a la secuencia de imagenes. */
  function render(pose, side = false, _epilogue = null, staticView = false) {
    target = frameForTime(pose.time, urls.length);
    view = { time: pose.time, side, static: staticView };
    const painted = draw();
    requestWindow();
    if (failed.has(target)) onError(new Error(`No se pudo cargar el fotograma ${target}`));
    return painted;
  }

  function setPixelRatio(value) {
    ratio = Math.max(1, Math.min(2, value));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    draw();
  }

  function setVisible(value) {
    visible = value;
    if (value) { draw(); requestWindow(); }
    else for (const request of pending.values()) request.controller.abort();
  }

  function dispose() {
    disposed = true;
    for (const request of pending.values()) request.controller.abort();
    for (const bitmap of cache.values()) bitmap.close();
    cache.clear();
  }

  return {
    async load(manifestUrl, progress) {
      const response = await fetch(manifestUrl);
      if (!response.ok) throw new Error(`Secuencia: HTTP ${response.status}`);
      const manifest = await response.json();
      if (manifest.status !== 'ready' || !Array.isArray(manifest.frames) || manifest.frames.length < 2) {
        throw new Error('La secuencia no esta lista');
      }
      const base = new URL(manifestUrl, window.location.href);
      urls = manifest.frames.map(file => new URL(file, base).href);
      progress(0.5);
      await fetchFrame(0);
      progress(1);
    },
    render,
    renderStatic: pose => render(pose, false, null, true),
    setSize(w, h) { width = Math.max(1, w); height = Math.max(1, h); setPixelRatio(Math.min(window.devicePixelRatio || 1, config.dpr.max)); },
    setPixelRatio,
    getPixelRatio: () => ratio,
    setParallaxEnabled() {},
    tickAmbient: () => false,
    setVisible,
    dispose,
    info: () => ({ renderer: 'cycles-sequence', frames: urls.length, cached: cache.size, pending: pending.size }),
  };
}
