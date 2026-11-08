/*
 * Salpicaduras y gotas del chorro como funciones puras del tiempo. Sin Three ni DOM.
 *
 * Todo se precalcula una vez con una semilla fija: trayectorias balisticas con gravedad para
 * las gotas que saltan del impacto, y gotas que se separan de la cola cuando se corta el chorro.
 * Las ventanas de tiempo salen de timeline.js y liquid.js; no se duplica ninguna formula suya.
 * Ejes de Blender (z hacia arriba), metros y segundos.
 */
import { POOL_SURFACE, cupInnerRadius } from './dimensions.js';
import { pourPath } from './liquid.js';
import { CUT_START, DURATION, FILL_START, POUR_END, poseAt } from './timeline.js';

export const GRAVITY = 9.81;
export const SPLASH_STRIDE = 8; // x, y, z, vx, vy, vz, radio, ventana
const DROP_STRIDE = 6; // tiempo, vx, vy, vz, radio, ventana
const EPSILON = 1e-6;
/* Distancia del origen del grano a su punto mas bajo ya tumbado (como en timeline.js). */
const BEAN_BOTTOM = 0.0087;

/* Generador determinista (mulberry32). */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/* Primer instante en [low, high] en que se cumple predicate (monotono a partir de ahi). */
function firstTime(predicate, low, high, step = 0.01) {
  let previous = low;
  for (let time = low; time <= high + EPSILON; time += step) {
    const clamped = Math.min(time, high);
    if (predicate(poseAt(clamped))) {
      let a = previous;
      let b = clamped;
      for (let iteration = 0; iteration < 40; iteration += 1) {
        const middle = (a + b) / 2;
        if (predicate(poseAt(middle))) b = middle;
        else a = middle;
      }
      return b;
    }
    previous = clamped;
  }
  return high;
}

const poolSurface = (pose) => pose.saucerZ + POOL_SURFACE;

/*
 * Al cortarse, la cola se estrangula en una cadena de gotas de tamanos distintos, con gotas
 * satelite pequenas entre las grandes: [retraso tras la cola en s, radio, desvio lateral].
 */
const TAIL_DROPS = Object.freeze([
  [0.03, 0.0019, 0.0002], [0.047, 0.0006, -0.0001], [0.062, 0.0014, -0.0003],
  [0.078, 0.0005, 0.0003], [0.095, 0.0011, 0.0004], [0.13, 0.0008, -0.0002],
]);

/* Instante en que el grano toca el cafe y su velocidad, para escalar el golpe. */
const BEAN_TIME = firstTime((pose) => pose.time > 5.0 && pose.beanZ - BEAN_BOTTOM <= pose.coffeeLevel, 5.0, 6.0);
const BEAN_SPEED = (poseAt(BEAN_TIME - 0.01).beanZ - poseAt(BEAN_TIME).beanZ) / 0.01;
export const BEAN_ENERGY = Math.min(1.5, Math.max(0.7, BEAN_SPEED / 0.3));

/*
 * Ventanas en que algo golpea una superficie: 0 el chorro en el charco del platillo, 1 el chorro
 * (primero el arco desde el asa, despues el vertical) en el cafe de la taza, 2 el grano al caer
 * en el cafe (solo corona).
 */
export const IMPACT_WINDOWS = Object.freeze([
  Object.freeze({
    id: 'pool',
    start: firstTime((pose) => pose.pouring && pose.pourHeadZ <= poolSurface(pose) + EPSILON, 0.9, 2.5),
    // Cuando el chorro empieza a enroscarse en la taza deja de caer en el charco.
    end: firstTime((pose) => pose.helixBlend > 0, 1.5, 3.0),
  }),
  Object.freeze({ id: 'cup', start: FILL_START, end: POUR_END }),
  Object.freeze({ id: 'bean', start: BEAN_TIME, end: BEAN_TIME + 0.03 }),
  // Cada gota de la cola hace su propia corona pequena al caer en el cafe.
  ...TAIL_DROPS.map(([lag]) => Object.freeze({ id: 'tail', start: POUR_END + lag, end: POUR_END + lag + 0.01 })),
]);

export const surfaceForWindow = (pose, windowIndex) => (windowIndex === 0 ? poolSurface(pose) : pose.coffeeLevel);
/* Ventanas que caen donde cae el chorro (el resto: charco en el eje y grano en el centro). */
const atPourPoint = (windowIndex) => windowIndex === 1 || windowIndex >= 3;

/* Las gotas del cafe no pasan de aqui hacia la pared. */
const WALL_MARGIN = 0.0015;

/* Corte del chorro: la cola recorre el mismo camino hasta entrar en la taza. */
export const CUT_WINDOWS = Object.freeze([Object.freeze({ start: CUT_START, end: POUR_END })]);

/*
 * Por ventana: corona (cantidad), energia relativa, rocio por segundo y radio de salida.
 * El grano es ancho: corona mas abierta.
 */
const WINDOW_SPLASH = Object.freeze([
  Object.freeze({ crown: 9, energy: 1.0, rate: 9, emit: 0.0031 }),
  Object.freeze({ crown: 11, energy: 0.8, rate: 7, emit: 0.0031 }),
  Object.freeze({ crown: 18, energy: 0.85 * BEAN_ENERGY, rate: 0, emit: 0.011 }),
  ...TAIL_DROPS.map(([, radius]) => Object.freeze({ crown: radius > 0.001 ? 5 : 3, energy: 0.3 + 120 * radius, rate: 0, emit: 0.0012 })),
]);
const CROWN = Object.freeze({ spread: 0.05, radial: [0.1, 0.22], up: [0.3, 0.52], radius: [0.0006, 0.0012] });
const SPRAY = Object.freeze({ radial: [0.035, 0.13], up: [0.16, 0.36], radius: [0.00045, 0.0009] });
export const MAX_FLIGHT = (2 * Math.max(CROWN.up[1], SPRAY.up[1])) / GRAVITY;

const between = (random, [low, high]) => low + (high - low) * random();

function pushDroplet(list, random, time, windowIndex, spec, angle) {
  const { energy } = WINDOW_SPLASH[windowIndex];
  const radial = between(random, spec.radial) * energy;
  list.push(time, radial * Math.cos(angle), radial * Math.sin(angle), between(random, spec.up) * energy,
    between(random, spec.radius), windowIndex);
}

/* Lista plana de gotas de salpicadura, ordenadas por instante de salida. */
function buildDroplets(seed) {
  const random = seededRandom(seed);
  const list = [];
  IMPACT_WINDOWS.forEach(({ start, end }, windowIndex) => {
    // Corona: el frente del chorro llega a la superficie.
    const { crown, rate } = WINDOW_SPLASH[windowIndex];
    for (let index = 0; index < crown; index += 1) {
      const angle = ((index + random() * 0.6) / crown) * 2 * Math.PI;
      pushDroplet(list, random, start + random() * CROWN.spread, windowIndex, CROWN, angle);
    }
    // Rocio esporadico mientras el chorro sigue entrando.
    const count = Math.round((end - start) * rate);
    for (let index = 0; index < count; index += 1) {
      const time = start + CROWN.spread + ((index + random()) / count) * (end - start - 2 * CROWN.spread);
      pushDroplet(list, random, time, windowIndex, SPRAY, random() * 2 * Math.PI);
    }
  });
  const rows = [];
  for (let index = 0; index < list.length; index += DROP_STRIDE) rows.push(list.slice(index, index + DROP_STRIDE));
  rows.sort((a, b) => a[0] - b[0]);
  return Float32Array.from(rows.flat());
}

const DROPLETS = buildDroplets(0x5eed);
export const SPLASH_COUNT = DROPLETS.length / DROP_STRIDE;

/*
 * Escribe en out las gotas en vuelo en el instante pose.time, alrededor de su punto de impacto.
 * La altura es relativa a la superficie actual, que sube o baja con su pieza. En la taza las
 * gotas no salen hacia la pared ni la atraviesan. Escribe a partir de la gota offset y devuelve
 * cuantas escribio (como mucho maxCount). No asigna memoria.
 */
export function writeSplashes(pose, out, maxCount = SPLASH_COUNT, offset = 0) {
  const { time } = pose;
  const wallLimit = cupInnerRadius(pose.coffeeLevel - pose.cupZ) - WALL_MARGIN;
  // El chorro cae en pose.pourX/pourY (se mueve al dibujar el corazon).
  const landingLength = Math.hypot(pose.pourX, pose.pourY) || 1;
  const nx = pose.pourX / landingLength;
  const ny = pose.pourY / landingLength;
  let count = 0;
  for (let index = 0; index < SPLASH_COUNT && count < maxCount; index += 1) {
    const base = index * DROP_STRIDE;
    const emitted = DROPLETS[base];
    if (emitted > time) break;
    const age = time - emitted;
    const vz = DROPLETS[base + 3];
    const height = vz * age - 0.5 * GRAVITY * age * age;
    if (height < 0) continue;
    let vx = DROPLETS[base + 1];
    let vy = DROPLETS[base + 2];
    const windowIndex = DROPLETS[base + 5];
    let cx = 0;
    let cy = 0;
    if (atPourPoint(windowIndex)) {
      cx = pose.pourX;
      cy = pose.pourY;
      const outward = vx * nx + vy * ny;
      if (outward > 0) {
        vx -= 2 * outward * nx;
        vy -= 2 * outward * ny;
      }
    }
    const speed = Math.hypot(vx, vy) || 1;
    const { emit } = WINDOW_SPLASH[windowIndex];
    const px = cx + (vx / speed) * emit + vx * age;
    const py = cy + (vy / speed) * emit + vy * age;
    if (windowIndex !== 0 && Math.hypot(px, py) > wallLimit) continue;
    const target = (offset + count) * SPLASH_STRIDE;
    out[target] = px;
    out[target + 1] = py;
    out[target + 2] = surfaceForWindow(pose, windowIndex) + height;
    out[target + 3] = vx;
    out[target + 4] = vy;
    out[target + 5] = vz - GRAVITY * age;
    out[target + 6] = DROPLETS[base + 4];
    out[target + 7] = windowIndex;
    count += 1;
  }
  return count;
}

/* ---------- Gotas de la cola ---------- */

const TAIL_SAMPLES = 64;
export const TAIL_DROP_COUNT = TAIL_DROPS.length * CUT_WINDOWS.length;

/* Tabla [x, y, z] de la cola del chorro durante el corte, muestreada de pourPath. */
const TAIL_TABLES = CUT_WINDOWS.map(({ start, end }) => {
  const table = new Float32Array(TAIL_SAMPLES * 3);
  const last = end - 1e-3;
  for (let sample = 0; sample < TAIL_SAMPLES; sample += 1) {
    const pose = poseAt(start + ((last - start) * sample) / (TAIL_SAMPLES - 1));
    const tail = pourPath(pose)[0];
    for (let axis = 0; axis < 3; axis += 1) table[sample * 3 + axis] = tail ? tail[0][axis] : 0;
  }
  return table;
});

/* Impactos en el cafe (ejes de Three, para las ondas): el grano y las gotas de la cola. */
const BEAN_RING = 2.5;
export const BEAN_LANDING = Object.freeze({ x: 0, z: 0, time: BEAN_TIME, amplitude: BEAN_RING * BEAN_ENERGY });
export const TAIL_LANDINGS = Object.freeze(TAIL_DROPS.map(([lag, radius, side]) => {
  const table = TAIL_TABLES[0];
  const last = (TAIL_SAMPLES - 1) * 3;
  return Object.freeze({
    x: table[last] + side,
    z: -table[last + 1],
    time: CUT_WINDOWS[0].end + lag,
    amplitude: radius / TAIL_DROPS[0][1],
  });
}));

/* Gotas que siguen a la cola con un pequeno retraso. Mismo formato que writeSplashes. */
export function writeTailDroplets(time, out, offset = 0) {
  let count = 0;
  CUT_WINDOWS.forEach(({ start, end }, cut) => {
    const table = TAIL_TABLES[cut];
    for (const [lag, radius, side] of TAIL_DROPS) {
      const lagged = time - lag;
      if (lagged <= start || lagged >= end) continue;
      const position = ((lagged - start) / (end - start)) * (TAIL_SAMPLES - 1);
      const low = Math.min(TAIL_SAMPLES - 2, Math.floor(position));
      const ratio = position - low;
      const target = (offset + count) * SPLASH_STRIDE;
      for (let axis = 0; axis < 3; axis += 1) {
        const a = table[low * 3 + axis];
        out[target + axis] = a + (table[(low + 1) * 3 + axis] - a) * ratio;
      }
      out[target] += side;
      const step = (end - start) / (TAIL_SAMPLES - 1);
      for (let axis = 0; axis < 3; axis += 1) {
        out[target + 3 + axis] = (table[(low + 1) * 3 + axis] - table[low * 3 + axis]) / step;
      }
      out[target + 6] = radius;
      out[target + 7] = 3 + cut;
      count += 1;
    }
  });
  return count;
}

export const lastSplashTime = () => Math.min(DURATION, Math.max(...IMPACT_WINDOWS.map(({ end }) => end)) + MAX_FLIGHT);

/* ---------- Oleaje: golpes que hacen oscilar toda la superficie (ejes de Three) ---------- */

const JET_SLOSH = 0.001;
const BEAN_SLOSH = 0.0016;
const landingPose = poseAt(FILL_START);
export const SLOSH_EVENTS = Object.freeze([
  Object.freeze({ x: landingPose.pourX, z: -landingPose.pourY, time: FILL_START, amplitude: JET_SLOSH }),
  Object.freeze({ x: 0, z: 0, time: BEAN_TIME, amplitude: BEAN_SLOSH * BEAN_ENERGY }),
]);

/* ---------- Chorro de Worthington: columna que rebota tras caer el grano ---------- */

const WORTHINGTON = Object.freeze({ delay: 0.06, duration: 0.32, height: 0.011, radius: 0.0021, stretch: 2.6, topAt: 0.45, topSpeed: 0.25 });
export const WORTHINGTON_COUNT = 2;

/*
 * Columna central que sube y se desploma, y la gota que se separa de su punta. Mismo formato que
 * writeSplashes; la columna se estira con la velocidad codificada en vz (ver scene/splashes.js).
 */
export function writeWorthington(pose, out, offset = 0) {
  const { delay, duration, height, radius, stretch, topAt, topSpeed } = WORTHINGTON;
  const age = pose.time - BEAN_TIME - delay;
  let count = 0;
  if (age > 0 && age < duration) {
    const columnHeight = height * BEAN_ENERGY * Math.sin((Math.PI * age) / duration);
    const columnRadius = radius * (1 - 0.3 * (age / duration));
    const elongation = Math.max(1, (0.5 * columnHeight) / columnRadius);
    const target = offset * SPLASH_STRIDE;
    out[target] = 0;
    out[target + 1] = 0;
    out[target + 2] = pose.coffeeLevel + 0.5 * columnHeight;
    out[target + 3] = 0;
    out[target + 4] = 0;
    out[target + 5] = (elongation - 1) / stretch;
    out[target + 6] = columnRadius;
    out[target + 7] = 2;
    count += 1;
  }
  const launch = topAt * duration;
  const flight = age - launch;
  if (flight > 0) {
    const start = height * BEAN_ENERGY * Math.sin(Math.PI * topAt);
    const rise = start + topSpeed * flight - 0.5 * GRAVITY * flight * flight;
    if (rise > 0) {
      const target = (offset + count) * SPLASH_STRIDE;
      out[target] = 0;
      out[target + 1] = 0;
      out[target + 2] = pose.coffeeLevel + rise;
      out[target + 3] = 0;
      out[target + 4] = 0;
      out[target + 5] = topSpeed - GRAVITY * flight;
      out[target + 6] = 0.0012;
      out[target + 7] = 2;
      count += 1;
    }
  }
  return count;
}

/* ---------- Burbujas de aire arrastradas por el chorro ---------- */

const BUBBLES = Object.freeze({
  count: 56,
  life: [0.5, 1.4],
  radius: [0.0004, 0.0011],
  speed: [0.012, 0.035], // m/s de deriva hacia fuera
  spawn: 0.003, // dispersion inicial alrededor del impacto
  margin: 0.002, // no se acercan mas a la pared
});
const BUBBLE_STRIDE = 6; // instante, vida, angulo, velocidad, radio, desvio
export const BUBBLE_COUNT = BUBBLES.count;

/* Burbujas que nacen donde entra el chorro (y unas pocas con el grano), con semilla fija. */
const BUBBLE_TABLE = (() => {
  const random = seededRandom(0xb0bb1e);
  const table = new Float32Array(BUBBLES.count * BUBBLE_STRIDE);
  const pourCount = BUBBLES.count - 8;
  for (let index = 0; index < BUBBLES.count; index += 1) {
    const fromBean = index >= pourCount;
    const time = fromBean
      ? BEAN_TIME + 0.05 + random() * 0.25
      : FILL_START + 0.1 + ((index + random()) / pourCount) * (POUR_END - FILL_START - 0.2);
    const base = index * BUBBLE_STRIDE;
    table[base] = time;
    table[base + 1] = between(random, BUBBLES.life);
    table[base + 2] = random() * 2 * Math.PI;
    table[base + 3] = between(random, BUBBLES.speed);
    table[base + 4] = between(random, BUBBLES.radius) * (fromBean ? 1.3 : 1);
    table[base + 5] = (fromBean ? 0.009 : BUBBLES.spawn) * Math.sqrt(random());
  }
  return table;
})();

/*
 * Escribe las burbujas vivas: [x, y, z, 0, 0, 0, radio, 1 si vienen del grano]. Derivan hacia fuera
 * frenandose, crecen al nacer y se encogen al reventar. No asigna memoria.
 */
export function writeBubbles(pose, out, maxCount = BUBBLE_COUNT) {
  if (!pose.coffeeVisible) return 0;
  const wallLimit = cupInnerRadius(pose.coffeeLevel - pose.cupZ) - BUBBLES.margin;
  let count = 0;
  for (let index = 0; index < BUBBLES.count && count < maxCount; index += 1) {
    const base = index * BUBBLE_STRIDE;
    const age = pose.time - BUBBLE_TABLE[base];
    const life = BUBBLE_TABLE[base + 1];
    if (age <= 0 || age >= life) continue;
    const fromBean = index >= BUBBLES.count - 8;
    const angle = BUBBLE_TABLE[base + 2];
    const drift = BUBBLE_TABLE[base + 3] * 0.5 * (1 - Math.exp(-age / 0.5));
    const reach = BUBBLE_TABLE[base + 5] + drift;
    let x = (fromBean ? 0 : pose.pourX) + reach * Math.cos(angle);
    let y = (fromBean ? 0 : pose.pourY) + reach * Math.sin(angle);
    const distance = Math.hypot(x, y);
    if (distance > wallLimit) {
      x *= wallLimit / distance;
      y *= wallLimit / distance;
    }
    const radius = BUBBLE_TABLE[base + 4] * Math.sqrt(Math.sin((Math.PI * age) / life));
    const target = count * SPLASH_STRIDE;
    out[target] = x;
    out[target + 1] = y;
    out[target + 2] = pose.coffeeLevel + 0.25 * radius;
    out[target + 3] = 0;
    out[target + 4] = 0;
    out[target + 5] = 0;
    out[target + 6] = radius;
    out[target + 7] = fromBean ? 1 : 0;
    count += 1;
  }
  return count;
}

/* ---------- Pared mojada sobre el nivel del cafe ---------- */

const WET = Object.freeze({ rise: 0.12, fade: 1.6, pour: 0.45 });
const WET_EVENTS = Object.freeze([[FILL_START, 0.9], [BEAN_TIME, 1.0], [POUR_END, 0.35]]);

/* Cuanto brilla de mojado la pared justo encima del cafe: sube con cada golpe y se seca despacio. */
export function wetness(time) {
  let wet = 0;
  for (const [start, amount] of WET_EVENTS) {
    const age = time - start;
    if (age <= 0) continue;
    const rise = Math.min(1, age / WET.rise);
    wet += amount * rise * Math.exp(-Math.max(0, age - WET.rise) / WET.fade);
  }
  // Mientras entra el chorro siempre salpica algo.
  const pouring = time > FILL_START && time < POUR_END ? WET.pour : 0;
  return Math.min(1, Math.max(wet, pouring));
}
