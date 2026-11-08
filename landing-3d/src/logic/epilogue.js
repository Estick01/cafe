/*
 * Epilogo de la historia, despues de los 10 s de timeline.js: la cuchara de cata entra, recoge
 * cafe, lo acerca a la camara, suelta una gota y se queda arriba a la derecha.
 *
 * El scroll cubre [0, TOTAL_DURATION]: la historia recibe min(t, 10) y el epilogo t - 10.
 * Todo es funcion pura del tiempo (y de la superficie del cafe): mismo scroll, misma imagen, en
 * cualquier direccion. Ejes de Blender (z arriba). Sin Three ni DOM.
 */
import { DURATION, mix, poseAt, smooth } from './timeline.js';

export const STORY_END = DURATION;
export const EPILOGUE_DURATION = 3.0;
export const TOTAL_DURATION = STORY_END + EPILOGUE_DURATION;

/* Medidas de la cuchara de cata (m): cuenco hondo de 4,5 cm y mango largo de unos 15 cm. */
export const SPOON = Object.freeze({
  bowlRadius: 0.0225,
  bowlDepth: 0.0115,
  wall: 0.0009,
  handleLength: 0.152,
  /* La cuchara llena deja el cafe a este margen bajo el borde del cuenco. */
  fillMargin: 0.0018,
});

/* Radio interior de la taza a la altura del cafe lleno (CUP_INNER de dimensions, ~7 cm). */
export const CUP_INNER_RADIUS = 0.0436;

/* Punto donde moja: delante del vapor (hacia la camara), con el mango saliendo por la derecha. */
export const DIP = Object.freeze([-0.002, -0.012]);

const deg = (value) => (value * Math.PI) / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/*
 * Fotogramas clave de la cuchara: [e, dx, dy, dz, giro, cabeceo, rumbo].
 * dx, dy relativos a DIP; dz relativo a la superficie del cafe; angulos en grados (Euler XYZ de
 * Blender sobre la cuchara en reposo: cuenco abierto hacia +z, mango hacia +x).
 *   giro (x) > 0 inclina la boca del cuenco hacia -y local (hacia la camara con el rumbo usado);
 *   cabeceo (y) < 0 baja la punta del cuenco y levanta el mango; rumbo (z) gira en planta.
 * Al subir, el cuenco queda por delante de las laminas del vapor (y < -0,035) para no cortarlas,
 * y se inclina un poco hacia la izquierda y atras: la gota cuelga en el perfil visible del
 * cuenco y cae dentro de la taza.
 */
const SPOON_KEYS = Object.freeze([
  [0.0, 0.27, 0.06, 0.135, 0, 6, 22],
  [0.8, 0.0, 0.0, 0.02, 0, -4, 15],
  [1.1, 0.0, 0.0, -0.0008, 0, -10, 14],
  [1.35, 0.0, 0.0, -0.0008, 0, -10, 14],
  [1.65, 0.004, -0.01, 0.018, -3, -6, 12],
  [2.1, 0.016, -0.025, 0.045, -4, -9, 10],
  [3.0, 0.062, -0.012, 0.056, -4, 2, 12],
]);

/* Llenado del cuenco (fraccion de su profundidad util). */
const FILL = Object.freeze([1.02, 1.32]);
/* La gota: crece en el labio, se suelta y cae hasta el cafe. */
const DROP = Object.freeze({ grow: [1.72, 2.02], release: 2.06, land: 2.34, radius: 0.0025 });
/* Ondas propias sobre el cafe: [inicio, duracion, radio inicial, radio final, intensidad]. */
const DIP_RING = Object.freeze([1.02, 0.95, 0.024, 0.041, 0.85]);
const DROP_RING = Object.freeze([DROP.land, 0.62, 0.0015, 0.018, 0.85]);
/* La camara retrocede un poco para que lean la cuchara y la taza. */
const CAMERA_PULL = Object.freeze({ dolly: 1.24, lift: [0.006, 0.004, 0.008], until: 0.9 });

/* ---------- Scroll ---------- */

export const totalTimeForProgress = (progress) => clamp(progress, 0, 1) * TOTAL_DURATION;
export const progressForTotalTime = (time) => clamp(time / TOTAL_DURATION, 0, 1);
export const scrollForTotalTime = (time, { top, range }) => top + progressForTotalTime(time) * range;
export const storyTimeAt = (time) => clamp(time, 0, STORY_END);
export const epilogueTimeAt = (time) => clamp(time - STORY_END, 0, EPILOGUE_DURATION);

/* ---------- Rotacion (Euler XYZ de Blender, q = Rz * Ry * Rx) ---------- */

export function rotateEuler([rx, ry, rz], [x, y, z]) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  const y1 = cx * y - sx * z;
  const z1 = sx * y + cx * z;
  const x2 = cy * x + sy * z1;
  const z2 = -sy * x + cy * z1;
  return [cz * x2 - sz * y1, sz * x2 + cz * y1, z2];
}

const add = (a, b) => a.map((value, index) => value + b[index]);
const scale = (a, s) => a.map((value) => value * s);
const length = (a) => Math.hypot(...a);
const normalize = (a) => scale(a, 1 / (length(a) || 1));
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

/* ---------- Cuchara ---------- */

function spoonKeyAt(e) {
  const keys = SPOON_KEYS;
  if (e <= keys[0][0]) return keys[0].slice(1);
  for (let index = 1; index < keys.length; index += 1) {
    const high = keys[index];
    if (e <= high[0]) {
      const low = keys[index - 1];
      const ratio = smooth(low[0], high[0], e);
      return low.slice(1).map((value, i) => mix(value, high[i + 1], ratio));
    }
  }
  return keys[keys.length - 1].slice(1);
}

/* Centro de la boca del cuenco y rotacion de la cuchara, en ejes de Blender. */
export function spoonAt(e, surfaceZ) {
  const [dx, dy, dz, roll, pitch, yaw] = spoonKeyAt(clamp(e, 0, EPILOGUE_DURATION));
  return Object.freeze({
    position: Object.freeze([DIP[0] + dx, DIP[1] + dy, surfaceZ + dz]),
    rotation: Object.freeze([deg(roll), deg(pitch), deg(yaw)]),
  });
}

/* Punto mas bajo del borde del cuenco: donde se forma la gota. */
export function lowestLipPoint(spoon) {
  const normal = rotateEuler(spoon.rotation, [0, 0, 1]);
  const down = [0, 0, -1];
  const along = add(down, scale(normal, -dot(down, normal)));
  const direction = length(along) < 1e-6 ? rotateEuler(spoon.rotation, [-1, 0, 0]) : normalize(along);
  return add(spoon.position, scale(direction, SPOON.bowlRadius));
}

/* Gota: forma en el labio, cae acelerando y desaparece al tocar el cafe. */
function dropAt(e, surfaceZ) {
  if (e < DROP.grow[0] || e >= DROP.land) return null;
  const releaseSpoon = spoonAt(DROP.release, surfaceZ);
  if (e < DROP.release) {
    const grow = smooth(DROP.grow[0], DROP.grow[1], e);
    const lip = lowestLipPoint(spoonAt(e, surfaceZ));
    const radius = DROP.radius * (0.35 + 0.65 * grow);
    return Object.freeze({ position: Object.freeze([lip[0], lip[1], lip[2] - radius * 0.9]), radius, stretch: 1 + 0.35 * grow });
  }
  const start = lowestLipPoint(releaseSpoon);
  const fall = ((e - DROP.release) / (DROP.land - DROP.release)) ** 2;
  const z = mix(start[2] - DROP.radius * 0.9, surfaceZ, fall);
  return Object.freeze({ position: Object.freeze([start[0], start[1], z]), radius: DROP.radius, stretch: 1.35 + 0.4 * fall });
}

/* Punto de la superficie donde cae la gota (para la onda). */
export function dropLanding(surfaceZ) {
  const start = lowestLipPoint(spoonAt(DROP.release, surfaceZ));
  return Object.freeze([start[0], start[1]]);
}

function ringAt([start, life, from, to, strength], center, e) {
  const u = (e - start) / life;
  if (u <= 0 || u >= 1) return null;
  return Object.freeze({
    center: Object.freeze([...center]),
    radius: mix(from, to, 1 - (1 - u) ** 2),
    strength: strength * smooth(0, 0.12, u) * (1 - u) ** 1.5,
  });
}

/* Estado completo del epilogo para un tiempo e en [0, EPILOGUE_DURATION]. */
export function epilogueAt(e, surfaceZ, { staticView = false } = {}) {
  const time = clamp(Number.isFinite(e) ? e : 0, 0, EPILOGUE_DURATION);
  const rings = [ringAt(DIP_RING, DIP, time), ringAt(DROP_RING, dropLanding(surfaceZ), time)].filter(Boolean);
  return Object.freeze({
    time,
    active: time > 0,
    surfaceZ,
    staticView,
    spoon: spoonAt(time, surfaceZ),
    fill: smooth(FILL[0], FILL[1], time),
    drop: staticView ? null : dropAt(time, surfaceZ),
    rings: Object.freeze(staticView ? [] : rings),
    /* Las particulas de aroma usan su propio reloj; en la vista estatica quedan a media subida. */
    aromaTime: staticView ? 1.95 : time,
  });
}

/* ---------- Camara ---------- */

/* Pose de la historia con la camara algo mas atras durante el epilogo. Nueva pose, inmutable. */
export function withEpilogueCamera(pose, e) {
  const amount = smooth(0, CAMERA_PULL.until, clamp(e, 0, EPILOGUE_DURATION));
  if (amount <= 0) return pose;
  const target = pose.cameraTarget.map((value, index) => value + CAMERA_PULL.lift[index] * amount);
  const dolly = mix(1, CAMERA_PULL.dolly, amount);
  const position = pose.cameraPosition.map((value, index) => target[index] + (value - pose.cameraTarget[index]) * dolly);
  return Object.freeze({ ...pose, cameraPosition: Object.freeze(position), cameraTarget: Object.freeze(target) });
}

/* Todo lo que la escena necesita para un tiempo total del scroll. */
export function sceneAt(totalTime, options = {}) {
  const time = clamp(Number.isFinite(totalTime) ? totalTime : 0, 0, TOTAL_DURATION);
  const e = epilogueTimeAt(time);
  const story = poseAt(storyTimeAt(time));
  return Object.freeze({
    pose: withEpilogueCamera(story, e),
    epilogue: epilogueAt(e, story.coffeeLevel, options),
  });
}
