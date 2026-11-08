import { POOL_SURFACE } from '../logic/dimensions.js';
import { POUR_TOP } from '../logic/timeline.js';

/*
 * Detalle geometrico suave de las superficies y del chorro, en metros. Las ondas ya no estan en
 * la malla (daban anillos escalonados): las pone el shader por pixel (logic/ripples.js). Aqui solo
 * queda el menisco junto a la pared de la taza y el borde redondeado del charco.
 */
const EDGE = Object.freeze({
  cup: { amplitude: 0.0008, sharpness: 34 },
  pool: { amplitude: -0.00032, sharpness: 13 },
});

/* Reescribe alturas y normales del disco (ejes de Three, ya escritos por writeDisc). */
export function refineSurface(params, positions, normals, kind) {
  const { radius, height } = params;
  const { amplitude, sharpness } = EDGE[kind];
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    const r = Math.hypot(x, z);
    const rise = amplitude * Math.exp((r / radius - 1) * sharpness);
    positions[i + 1] = height + rise;
    const slope = (rise * sharpness) / radius;
    const dx = r > 1e-7 ? (slope * x) / r : 0;
    const dz = r > 1e-7 ? (slope * z) / r : 0;
    const length = Math.hypot(dx, 1, dz);
    normals[i] = -dx / length;
    normals[i + 1] = 1 / length;
    normals[i + 2] = -dz / length;
  }
}

/* Debe coincidir con taperEnds de logic/liquid.js. */
const TAPER_LENGTH = 10;
const STREAM_LIFE = Object.freeze({
  /* Ondas varicosas (cuellos y abultamientos) que bajan y crecen con la caida. */
  neckBase: 0.02,
  neckFall: 0.07,
  neckWave: 260,
  neckSpeed: 30,
  fallSpan: 0.32,
  /* Vaiven lateral lento; se anula junto al impacto para no mover el punto de entrada. */
  sway: [0.0011, 0.0008],
  swayFree: [0.004, 0.05],
  /* Falda donde el chorro entra en el liquido. */
  flare: 0.9,
  flareHeight: 0.0025,
  sink: 0.0025,
});

const smoothstep = (edge0, edge1, value) => {
  const ratio = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return ratio * ratio * (3 - 2 * ratio);
};

/* El chorro acaba sobre una superficie (cafe o charco) y no en el aire. */
function landsOnSurface(pose, endZ) {
  if (pose.coffeeVisible && Math.abs(endZ - pose.coffeeLevel) < 1e-6) return true;
  return pose.helixBlend <= 0 && Math.abs(endZ - (pose.saucerZ + POOL_SURFACE)) < 1e-6;
}

/*
 * Chorro vivo, todo en funcion del tiempo del scroll: ondas varicosas que bajan con el flujo y
 * crecen cerca del final de una caida larga, vaiven lateral lento y una falda ensanchada donde
 * entra en el liquido. pourPath devuelve arrays nuevos en cada llamada, asi que se ajustan en el
 * sitio para no asignar memoria.
 */
export function refineStream(points, pose) {
  const total = points.length;
  if (total < 2) return points;
  const { time } = pose;
  const endZ = points[total - 1][0][2];
  const landed = landsOnSurface(pose, endZ);
  const life = STREAM_LIFE;
  for (let index = 0; index < total; index += 1) {
    const point = points[index];
    const position = point[0];
    const z = position[2];
    const round = Math.abs(point[1] - point[2]) < 1e-7;
    const fall = Math.min(1, Math.max(0, (POUR_TOP - z) / life.fallSpan));
    const neck = round ? life.neckBase + life.neckFall * fall * fall : life.neckBase;
    const phase = z * life.neckWave + time * life.neckSpeed;
    let flow = 1 + neck * Math.sin(phase) * (0.6 + 0.4 * Math.sin(phase * 0.37 + 1.3))
      + 0.02 * Math.sin(z * 52 + time * 6.5);
    if (round) {
      const free = smoothstep(endZ + life.swayFree[0], endZ + life.swayFree[1], z);
      position[0] += free * life.sway[0] * Math.sin(z * 11 + time * 1.7);
      position[1] += free * life.sway[1] * Math.sin(z * 8.3 - time * 1.3 + 0.7);
    }
    const fromEnd = total - 1 - index;
    if (landed && fromEnd <= index) {
      // Sin afinar la punta: el chorro se abre en una falda al entrar en el liquido.
      if (fromEnd < TAPER_LENGTH) flow /= Math.sqrt(Math.min(1, (fromEnd + 0.15) / TAPER_LENGTH));
      flow *= 1 + life.flare * Math.exp(-(z - endZ) / life.flareHeight);
    }
    point[1] *= flow;
    point[2] *= flow;
  }
  if (landed) points[total - 1][0][2] -= life.sink;
  return points;
}
