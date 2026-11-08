/*
 * Encuadre: decide donde cae el "fotograma de referencia" 16:9 de Cycles en la pantalla y lo
 * traduce a camara. Mismos fotogramas clave que la landing de imagenes. Sin Three ni DOM.
 */
import { CAMERA_LENS } from './dimensions.js';

const SENSOR_WIDTH = 36;
export const REFERENCE_ASPECT = 16 / 9;
export const FRAME = Object.freeze({ width: 1920, height: 1080 });
/* Por encima de este campo vertical la camara retrocede en lugar de abrir mas el angulo. */
export const MAX_VERTICAL_FOV = 38;

const SIDE = Object.freeze({
  minVisibleY: 0.82,
  keyframes: [
    { time: 0, scale: 1, centerX: 0.6, centerY: 0.5 },
    { time: 5.6, scale: 1, centerX: 0.6, centerY: 0.5 },
    { time: 8.6, scale: 0.84, centerX: 0.62, centerY: 0.55 },
    { time: 10, scale: 0.84, centerX: 0.62, centerY: 0.55 },
  ],
});

/* Mas ancho que en la landing de imagenes: en 3D no hay borde del fotograma que esconder. */
const STACKED = Object.freeze({ minVisibleX: 0.84, centerX: 0.5, areaTopPx: 72, areaHeight: 0.62 });

const lerp = (from, to, amount) => from + (to - from) * amount;

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
  const width = FRAME.width * scale;
  const height = FRAME.height * scale;
  return { x: centerX - width / 2, y: centerY - height / 2, width, height };
}

/* Rectangulo del fotograma de referencia en pixeles CSS de la pantalla. */
export function frameRect({ width, height, side, time }) {
  if (side) {
    const cover = Math.max(width / FRAME.width, height / FRAME.height);
    const base = Math.min(cover, height / (FRAME.height * SIDE.minVisibleY));
    const key = interpolateKeyframes(SIDE.keyframes, time);
    return rectFromCenter(base * key.scale, key.centerX * width, key.centerY * height);
  }
  const areaHeight = height * STACKED.areaHeight;
  const scale = Math.min(width / (FRAME.width * STACKED.minVisibleX), areaHeight / FRAME.height);
  return rectFromCenter(scale, width * STACKED.centerX, STACKED.areaTopPx + areaHeight / 2);
}

const fovFromTangent = (tangent) => (2 * Math.atan(tangent) * 180) / Math.PI;

/* Campo vertical del objetivo de Blender para un formato dado (sensor ajustado en horizontal). */
export const referenceVerticalFov = (aspect) => fovFromTangent(SENSOR_WIDTH / (2 * CAMERA_LENS) / aspect);

/*
 * Traduce el rectangulo a camara: campo vertical, retroceso (dolly, multiplica la distancia al
 * objetivo) y desplazamiento de la vista para que el centro optico caiga en el centro del rectangulo.
 */
export function fittedCamera({ width, height, rect }) {
  const focalPx = (rect.width * CAMERA_LENS) / SENSOR_WIDTH;
  const wantedTangent = height / 2 / focalPx;
  const maxTangent = Math.tan((MAX_VERTICAL_FOV * Math.PI) / 360);
  const tangent = Math.min(wantedTangent, maxTangent);
  return {
    verticalFov: fovFromTangent(tangent),
    dolly: wantedTangent / tangent,
    viewOffsetX: width / 2 - (rect.x + rect.width / 2),
    viewOffsetY: height / 2 - (rect.y + rect.height / 2),
  };
}
