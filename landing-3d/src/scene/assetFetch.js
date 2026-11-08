/*
 * Descarga de los recursos de la escena contando bytes con ReadableStream. El glb se analiza desde
 * memoria y sus texturas externas se sirven al GLTFLoader como blob: nada se descarga dos veces.
 */
import { createLoadPlan, downloadFraction } from '../logic/loadProgress.js';

const TYPES = Object.freeze({ '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' });

const typeFor = (name) => TYPES[name.slice(name.lastIndexOf('.')).toLowerCase()] ?? 'application/octet-stream';

async function streamFile(url, onBytes, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const header = Number(response.headers.get('Content-Length')) || 0;
  if (!response.body?.getReader) {
    const buffer = await response.arrayBuffer();
    onBytes(buffer.byteLength, buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onBytes(received, header);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return bytes.buffer;
}

/*
 * Descarga en paralelo el glb y sus texturas. onFraction recibe 0..1 de bytes. Devuelve el
 * ArrayBuffer del glb y un mapa nombre -> URL blob (llamar a release() al terminar).
 */
export async function fetchSceneAssets(manifest, baseUrl, onFraction, signal) {
  const plan = createLoadPlan(manifest);
  const loaded = {};
  const totals = {};
  const report = () => onFraction(downloadFraction(plan, loaded, totals));
  const buffers = await Promise.all(plan.map(({ name }) => streamFile(new URL(name, baseUrl).href, (bytes, total) => {
    loaded[name] = bytes;
    if (total) totals[name] = total;
    report();
  }, signal)));
  const blobUrls = new Map();
  plan.forEach(({ name }, index) => {
    if (name === manifest.glb) return;
    blobUrls.set(name, URL.createObjectURL(new Blob([buffers[index]], { type: typeFor(name) })));
  });
  return {
    glb: buffers[plan.findIndex(({ name }) => name === manifest.glb)],
    blobUrls,
    release: () => blobUrls.forEach((url) => URL.revokeObjectURL(url)),
  };
}
