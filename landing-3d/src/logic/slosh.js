/*
 * Oleaje del cafe en la taza: modos propios de un recipiente circular, sin simulacion. Sin Three.
 *
 * Cada golpe (el chorro al llegar, el grano al caer) excita dos modos estacionarios amortiguados:
 *   (0,1)  J0(k01 r / R): sube y baja el centro frente al borde;
 *   (1,1)  J1(k11 r / R) cos(theta): la superficie se inclina hacia el golpe y se balancea.
 * k01 y k11 son ceros de J0' y J1': la pendiente radial es nula en la pared, asi que la onda se
 * refleja en ella. Mientras cae el chorro hay ademas un abultamiento bajo el impacto y una leve
 * inclinacion, y las ondas del impacto rebotan en la pared (fuente imagen).
 *
 * El shader (scene/coffeeMaterials.js) evalua estas formulas con estas constantes; esta version
 * es la referencia de las pruebas. Plano horizontal local en metros (x, z de Three).
 */
import { RIPPLE, pourEnvelope } from './ripples.js';

export const SLOSH = Object.freeze({
  k01: 3.8317,
  k11: 1.8412,
  gravity: 9.81,
  depth: 0.04,
  /* Las frecuencias reales (3-5 Hz) se ralentizan un poco para que el vaiven se lea al hacer scroll. */
  slow: 0.65,
  decay: 0.9, // s
  /* Abultamiento e inclinacion mientras entra el chorro. */
  bulge: 0.0004,
  bulgeRadius: 0.009,
  tilt: 0.0005,
  /* Rebote de las ondas del impacto en la pared. */
  reflection: 0.5,
  maxEvents: 2,
});

const SERIES_TERMS = 9;
const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

/* Coeficientes en potencias de y = (x / 2)^2. */
export const BESSEL = Object.freeze({
  j0: Object.freeze(Array.from({ length: SERIES_TERMS }, (_, m) => (-1) ** m / factorial(m) ** 2)),
  /* G(x) = J1(x) / x */
  g: Object.freeze(Array.from({ length: SERIES_TERMS }, (_, m) => (0.5 * (-1) ** m) / (factorial(m) * factorial(m + 1)))),
  /* H(x) = G'(x) / x */
  h: Object.freeze(Array.from({ length: SERIES_TERMS }, (_, n) => {
    const m = n + 1;
    return ((-1) ** m * m) / (4 * factorial(m) * factorial(m + 1));
  })),
});

function series(coefficients, x) {
  const y = (x * x) / 4;
  let sum = 0;
  for (let index = coefficients.length - 1; index >= 0; index -= 1) sum = sum * y + coefficients[index];
  return sum;
}

export const besselJ0 = (x) => series(BESSEL.j0, x);
export const besselJ1 = (x) => x * series(BESSEL.g, x);

/* Frecuencia angular de un modo en un recipiente de radio R (ondas de gravedad, fondo finito). */
export function modeFrequency(k, radius) {
  const wave = k / radius;
  return SLOSH.slow * Math.sqrt(SLOSH.gravity * wave * Math.tanh(wave * SLOSH.depth));
}

/* events: [{ x, z, time, amplitude }]: golpes con su instante; radius: radio actual de la superficie. */
export function sloshHeight(x, z, time, radius, events) {
  let height = 0;
  const r = Math.hypot(x, z);
  const w01 = modeFrequency(SLOSH.k01, radius);
  const w11 = modeFrequency(SLOSH.k11, radius);
  for (const event of events) {
    const age = time - event.time;
    if (age <= 0) continue;
    const envelope = event.amplitude * Math.exp(-age / SLOSH.decay);
    const offset = Math.hypot(event.x, event.z);
    const tilt = Math.min(1, offset / (0.6 * radius));
    height += envelope * (1 - 0.6 * tilt) * besselJ0((SLOSH.k01 * r) / radius) * Math.sin(w01 * age);
    if (offset > 1e-6) {
      const along = (x * event.x + z * event.z) / offset;
      const k = SLOSH.k11 / radius;
      height += envelope * tilt * series(BESSEL.g, k * r) * k * along * Math.sin(w11 * age);
    }
  }
  return height;
}

/* Abultamiento e inclinacion hacia el impacto mientras entra el chorro. window = { x, z, start, end }. */
export function pourBulge(x, z, time, radius, window) {
  const envelope = pourEnvelope(time, window.start, window.end);
  if (envelope === 0) return 0;
  const dx = x - window.x;
  const dz = z - window.z;
  const bump = SLOSH.bulge * Math.exp(-(dx * dx + dz * dz) / SLOSH.bulgeRadius ** 2);
  const offset = Math.hypot(window.x, window.z);
  if (offset < 1e-6) return envelope * bump;
  const k = SLOSH.k11 / radius;
  const along = (x * window.x + z * window.z) / offset;
  return envelope * (bump + SLOSH.tilt * series(BESSEL.g, k * Math.hypot(x, z)) * k * along);
}

/* Ondas del impacto reflejadas en la pared: fuente imagen fuera de la taza (inversion en el circulo). */
export function reflectedHeight(x, z, time, radius, window) {
  const offset2 = window.x * window.x + window.z * window.z;
  if (offset2 < 1e-10) return 0;
  const scale = (radius * radius) / offset2;
  const ix = window.x * scale;
  const iz = window.z * scale;
  const distance = Math.hypot(x - ix, z - iz);
  const envelope = pourEnvelope(time - distance / RIPPLE.speed, window.start, window.end);
  if (envelope === 0) return 0;
  const [k, omega, weight] = RIPPLE.waves[0];
  return SLOSH.reflection * RIPPLE.amplitude * weight * envelope * Math.exp(-RIPPLE.decay * distance)
    * Math.sin(k * distance - omega * time);
}
