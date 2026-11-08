/*
 * Progreso real de la carga, sin DOM: bytes recibidos de cada archivo contra el total conocido del
 * manifest (el servidor no manda Content-Length). La descarga ocupa hasta DOWNLOAD_SHARE del
 * porcentaje; preparar la escena y el primer fotograma completan el resto.
 */
export const DOWNLOAD_SHARE = 0.9;

export const LOAD_PHASES = Object.freeze({
  download: 0,
  parse: 0.93,
  compile: 0.97,
  painted: 1,
});

/* Archivos a descargar con su tamano esperado. Sin dato en el manifest, total = 0 (se usa el real). */
export function createLoadPlan(manifest) {
  const sizes = manifest?.sizeBytes?.files ?? {};
  const textures = manifest?.externalTextures?.files ?? [];
  const names = [manifest.glb, ...textures].filter(Boolean);
  return Object.freeze(names.map((name) => Object.freeze({ name, total: Math.max(0, Number(sizes[name]) || 0) })));
}

/*
 * Fraccion 0..1 descargada. loaded: { nombre: bytes }. Si un archivo resulta mayor de lo anunciado,
 * se usa el mayor de los dos para no pasar nunca de 1.
 */
export function downloadFraction(plan, loaded, actualTotals = {}) {
  let done = 0;
  let total = 0;
  plan.forEach(({ name, total: expected }) => {
    const bytes = Math.max(0, loaded[name] ?? 0);
    const size = Math.max(expected, actualTotals[name] ?? 0, bytes);
    done += Math.min(bytes, size);
    total += size;
  });
  return total > 0 ? Math.min(1, done / total) : 0;
}

/* Porcentaje entero que se muestra: nunca retrocede y solo llega a 100 con el primer fotograma. */
export function displayPercent(previous, phase, fraction = 0) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const value = phase === 'download' ? clamped * DOWNLOAD_SHARE : (LOAD_PHASES[phase] ?? 0);
  const percent = Math.floor(value * 100);
  const ceiling = phase === 'painted' ? 100 : 99;
  return Math.min(ceiling, Math.max(previous, percent));
}
