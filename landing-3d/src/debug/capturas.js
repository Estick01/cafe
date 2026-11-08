/*
 * Solo con ?capturas y el servidor en modo --capturas: guarda comparaciones contra Cycles en
 * assets/_checks y mide tiempos. No se carga nunca en el uso normal de la pagina.
 */
const CAPTURE_SIZE = Object.freeze({ width: 1280, height: 720 });

const loadImage = (url) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`No se pudo leer ${url}`));
  image.src = url;
});

function drawLabel(context, text, x, y) {
  context.font = '600 20px "Segoe UI", sans-serif';
  const width = context.measureText(text).width + 24;
  context.fillStyle = 'rgba(0,0,0,0.65)';
  context.fillRect(x, y, width, 34);
  context.fillStyle = '#f1e7d6';
  context.fillText(text, x + 12, y + 24);
}

async function saveComposite(name, realtime, reference, time, { width, height } = CAPTURE_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = reference ? width * 2 : width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(realtime, 0, 0, width, height);
  drawLabel(context, `Tiempo real, t = ${time.toFixed(3)} s`, 16, 16);
  if (reference) {
    context.drawImage(reference.image, width, 0, width, height);
    drawLabel(context, `Cycles, ${reference.label}`, width + 16, 16);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const response = await fetch(`/__check/${name}`, { method: 'POST', body: blob });
  if (!response.ok) throw new Error(`No se pudo guardar ${name}: ${response.status}`);
  return `${name}.png (${blob.size} bytes)`;
}

/* Promedia intervalos de requestAnimationFrame durante una muestra corta, con la pagina tal cual. */
async function sampleFrames(durationMs = 2500) {
  const deltas = [];
  await new Promise((resolve) => {
    let last = performance.now();
    const started = last;
    const step = (now) => {
      deltas.push(now - last);
      last = now;
      if (now - started < durationMs) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  deltas.shift();
  const sorted = [...deltas].sort((a, b) => a - b);
  const pick = (ratio) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
  return {
    frames: deltas.length,
    meanMs: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
  };
}

export function installCaptures(stage, getState) {
  window.__cafe3d = Object.freeze({
    /* t: segundos; ref: nombre de fotograma de Cycles, p. ej. 'f_0012.png'; size opcional. */
    async capture(name, time, ref = null, size = CAPTURE_SIZE) {
      const realtime = await stage.captureReference(time, size.width, size.height);
      const reference = ref ? { image: await loadImage(`/__ref/${ref}`), label: ref } : null;
      return saveComposite(name, realtime, reference, time, size);
    },
    sampleFrames,
    /* Calidad del reflejo del suelo: 'high' o 'low' (la ruta de movil). */
    setQuality: (name) => stage.setQuality?.(name),
    measureRender(time, count = 24, ratio = 1) {
      const samples = stage.measureRender(time, count, ratio).sort((a, b) => a - b);
      return {
        time,
        ratio,
        medianMs: samples[Math.floor(samples.length / 2)],
        maxMs: samples[samples.length - 1],
      };
    },
    info: () => ({ ...stage.info(), ...getState() }),
  });
}
