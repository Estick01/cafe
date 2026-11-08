/*
 * Puerto de blender/timeline.py: convierte segundos en una pose inmutable. Sin Three ni DOM.
 *
 * Fases (segundos):
 *   0.0-1.0   el grano flota sobre el platillo y la base de piedra
 *   1.0-2.3   cae el chorro y se forma un charco en el platillo
 *   1.9-2.5   la base se hunde y el platillo baja al suelo
 *   2.4-4.2   la taza crece desde abajo, con una cinta de cafe en el borde de crecimiento
 *   4.2-4.6   la cola del chorro de arriba cae en la cinta; la cinta frena con su extremo en el asa
 *   4.5-4.8   la cinta baja por fuera de la taza hasta la mitad inferior
 *   4.75-5.15 el cafe recorre el asa pegado a ella, por fuera
 *   5.15-5.6  un chorro sale de lo alto del asa, describe un arco y cae dentro de la taza
 *   5.0-5.6   el grano cae dentro de la taza y salpica el cafe
 *   5.6-8.4   la taza se llena de cafe solo
 *   5.75-6.5  el origen del arco se levanta y se convierte en el chorro vertical de arriba
 *   5.8-8.0   la camara se acerca y mira hacia dentro
 *   8.4-8.75  se corta el chorro arriba y la cola cae en la taza en gotas
 *   6.8-8.6   aparece el vapor, que sigue subiendo hasta el final
 *   8.75-10.0 plano final: la superficie se calma
 */
import { CUP_INNER_FLOOR, CUP_SEAT, CUP_TOP, PEDESTAL_TOP, POOL_SURFACE } from './dimensions.js';

export const DURATION = 10.0;
export const FPS = 24;
export const TOTAL_FRAMES = Math.trunc(DURATION * FPS);

export const POUR_TOP = 0.42; // altura desde la que cae el chorro, fuera de cuadro
const COFFEE_START = CUP_INNER_FLOOR + 0.0065; // alturas locales de la taza
const COFFEE_FULL = CUP_TOP - 0.0107; // deja el mismo margen bajo el borde que la referencia
const POOL_MAX_RADIUS = 0.034; // cabe en el suelo plano del pocillo

/* Tras formar la taza: la cinta baja por fuera, recorre el asa y salta dentro de la taza. */
const RIBBON_SPIN = 6.5; // rad/s mientras la taza crece
const RIBBON_TURNS = 1.55;
const RIBBON_GATHER_TURNS = 0.8; // la cinta se recoge hacia el asa: menos de una vuelta
export const SPIN_START = 4.2;
/*
 * La cinta frena con su extremo justo delante de la union inferior del asa (angulo 0): la
 * integral de (1 - smooth) vale la mitad del tramo, asi que el angulo final es el inicial
 * menos SPIN * tramo / 2.
 */
const RIBBON_END_ANGLE = -6 * Math.PI - 0.2;
const SPIN_ANGLE_AT_START = -RIBBON_SPIN * SPIN_START + 2 * Math.PI * RIBBON_TURNS;
export const SPIN_SPAN = (2 * (SPIN_ANGLE_AT_START - RIBBON_END_ANGLE)) / RIBBON_SPIN;
const RIBBON_DROP = [4.5, 4.8]; // la cinta baja por fuera de la taza
const RIBBON_LOW = 0.024; // altura local final del principio de la cinta
const TAIL_FALL = [4.2, 4.5]; // la cola del chorro de arriba cae hasta la cinta
const FEED_TAIL = 0.75; // fraccion del recorrido previo al salto que se lleva esa caida
const FEED_END = 5.75; // para entonces la cinta y el asa ya han pasado al chorro
const STREAK = [4.75, 5.15]; // el cafe sube por el asa
export const JET = [5.15, 5.6]; // el chorro sale del asa y llega a la taza
export const MORPH = [5.75, 6.5]; // el origen del arco se convierte en el chorro de arriba
export const FILL_START = JET[1];
const FILL_END = 8.5;
export const CUT_START = 8.4;
export const POUR_END = 8.75; // la cola llega a la taza: no queda chorro

/* Punto de caida en la taza (ejes de Blender): a la izquierda del grano y algo por detras. */
export const POUR_LANDING = Object.freeze([-0.026, 0.012]);

const BEAN_BOB = 0.0016;
const BEAN_HOVER_BASE = 0.14;
const BEAN_HOVER_CUP = 0.105; // su base flota 3 mm por encima del borde, incluso en lo mas bajo
const BEAN_SETTLED_BELOW = 0.0087; // distancia del origen del grano a su punto mas bajo ya tumbado
const BEAN_SETTLED = CUP_SEAT + CUP_INNER_FLOOR + BEAN_SETTLED_BELOW + 0.0025;

/* Planos de camara: [posicion, objetivo], en ejes de Blender. */
export const SHOT_BASE = [[0.0, -0.74, 0.172], [0.0, 0.0, 0.08]];
export const SHOT_CUP = [[0.0, -0.535, 0.137], [0.01, 0.0, 0.058]];
export const SHOT_INSIDE = [[0.012, -0.25, 0.266], [0.006, 0.0, 0.049]];

const CAMERA_KEYS = [
  [0.0, ...SHOT_BASE],
  [1.9, ...SHOT_BASE],
  [4.4, ...SHOT_CUP],
  [5.8, ...SHOT_CUP],
  [8.0, ...SHOT_INSIDE],
  [10.0, ...SHOT_INSIDE],
];

const radians = (degrees) => (degrees * Math.PI) / 180;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/* Interpolacion suave de 0 a 1 entre start y end. */
export function smooth(start, end, value) {
  if (end <= start) return value >= end ? 1 : 0;
  const ratio = clamp01((value - start) / (end - start));
  return ratio * ratio * (3 - 2 * ratio);
}

export const mix = (low, high, ratio) => low + (high - low) * ratio;
const mixTuple = (low, high, ratio) => low.map((value, index) => mix(value, high[index], ratio));

function cameraAt(time) {
  for (let index = 0; index < CAMERA_KEYS.length - 1; index += 1) {
    const [tLow, posLow, tgtLow] = CAMERA_KEYS[index];
    const [tHigh, posHigh, tgtHigh] = CAMERA_KEYS[index + 1];
    if (time <= tHigh) {
      const ratio = smooth(tLow, tHigh, time);
      return [mixTuple(posLow, posHigh, ratio), mixTuple(tgtLow, tgtHigh, ratio)];
    }
  }
  const last = CAMERA_KEYS[CAMERA_KEYS.length - 1];
  return [last[1], last[2]];
}

/* Altura y rotacion del grano: flota, baja con el platillo y cae en la taza. */
function beanAt(time) {
  const hover = mix(BEAN_HOVER_BASE, BEAN_HOVER_CUP, smooth(1.9, 2.6, time));
  const bob = BEAN_BOB * Math.sin((2 * Math.PI * time) / 2.6) * (1 - smooth(4.8, 5.0, time));
  const fall = clamp01((time - 5.0) / 0.55) ** 2; // caida acelerada
  const height = mix(hover + bob, BEAN_SETTLED, fall);
  const sway = radians(9.0) * Math.sin((2 * Math.PI * time) / 4.3);
  const lieDown = smooth(5.0, 5.6, time);
  const rotation = [radians(mix(4.0, 82.0, lieDown)), radians(-14.0), radians(6.0) + sway * (1 - lieDown)];
  return [height, rotation];
}

/* Angulo del extremo de la cinta: gira con la taza y frena hasta quedar en el asa. */
function ribbonAngle(time) {
  const span = SPIN_SPAN;
  let travelled = time;
  if (time > SPIN_START) {
    const u = clamp01((time - SPIN_START) / span);
    // Integral de (1 - smooth): la velocidad cae a cero sin saltos.
    travelled = SPIN_START + (Math.min(time, SPIN_START + span) - SPIN_START) - span * (u ** 3 - 0.5 * u ** 4);
  }
  return -RIBBON_SPIN * travelled + 2 * Math.PI * RIBBON_TURNS;
}

/* Fraccion del recorrido previo al salto (chorro de arriba, cinta y asa) que ya se ha ido. */
function feedCut(time) {
  const fall = clamp01((time - TAIL_FALL[0]) / (TAIL_FALL[1] - TAIL_FALL[0]));
  return FEED_TAIL * fall * fall + (1 - FEED_TAIL) * smooth(TAIL_FALL[1], FEED_END, time);
}

export function poseAt(time) {
  if (!(time >= 0 && time <= DURATION)) throw new RangeError(`Tiempo fuera de rango: ${time}`);
  const saucerZ = PEDESTAL_TOP * (1 - smooth(1.9, 2.5, time));
  const cupZ = saucerZ + CUP_SEAT;
  const reveal = mix(-0.001, CUP_TOP + 0.002, smooth(2.4, 4.2, time));
  const coffeeLevel = mix(COFFEE_START, COFFEE_FULL, smooth(FILL_START, FILL_END, time)) + CUP_SEAT;
  const poolSurface = saucerZ + POOL_SURFACE;
  const headZ = mix(POUR_TOP, poolSurface, clamp01((time - 1.0) / 0.45) ** 2);
  const ribbonZ = mix(cupZ + Math.max(reveal, 0), cupZ + RIBBON_LOW, smooth(RIBBON_DROP[0], RIBBON_DROP[1], time));
  const [beanZ, beanRotation] = beanAt(time);
  const [cameraPosition, cameraTarget] = cameraAt(time);
  return Object.freeze({
    time,
    saucerZ,
    pedestalZ: saucerZ - PEDESTAL_TOP - 0.003 * smooth(2.3, 2.5, time),
    pedestalVisible: time < 2.55,
    cupZ,
    reveal,
    handleGrowth: smooth(3.0, 4.15, time),
    beanZ,
    beanRotation: Object.freeze(beanRotation),
    cameraPosition: Object.freeze(cameraPosition),
    cameraTarget: Object.freeze(cameraTarget),
    pouring: time >= 1.0 && time < POUR_END,
    pourHeadZ: headZ,
    feedCut: feedCut(time),
    // Fraccion del chorro final que ya ha dejado atras la cola tras el corte.
    pourCut: clamp01((time - CUT_START) / (POUR_END - CUT_START)) ** 2,
    helixBlend: smooth(2.25, 2.6, time),
    helixTurns: mix(RIBBON_TURNS, RIBBON_GATHER_TURNS, smooth(4.2, 4.5, time)),
    ribbonZ,
    ribbonAngle: ribbonAngle(time),
    ribbonOutside: smooth(4.2, 4.45, time),
    streak: smooth(STREAK[0], STREAK[1], time),
    jetHead: clamp01((time - JET[0]) / (JET[1] - JET[0])) ** 1.5,
    jetMorph: smooth(MORPH[0], MORPH[1], time),
    poolRadius: POOL_MAX_RADIUS * smooth(1.42, 2.2, time) * (1 - 0.3 * smooth(2.5, 2.95, time)),
    coffeeLevel,
    coffeeVisible: time >= FILL_START,
    pourX: POUR_LANDING[0],
    pourY: POUR_LANDING[1],
    steamAmount: smooth(6.8, 8.6, time),
  });
}
