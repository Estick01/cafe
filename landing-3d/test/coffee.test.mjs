/* Ondas, salpicaduras y gotas de la cola: deterministas, solo alrededor de los impactos y con gravedad. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ambientHeight, dropHeight, impactHeight, pourEnvelope, surfaceHeight } from '../src/logic/ripples.js';
import { cupInnerRadius } from '../src/logic/dimensions.js';
import { jetLanding, pourPath } from '../src/logic/liquid.js';
import {
  BEAN_LANDING, CUT_WINDOWS, GRAVITY, IMPACT_WINDOWS, MAX_FLIGHT, SPLASH_COUNT, SPLASH_STRIDE, TAIL_DROP_COUNT,
  TAIL_LANDINGS, seededRandom, surfaceForWindow, writeSplashes, writeTailDroplets,
} from '../src/logic/splash.js';
import { DURATION, FILL_START, POUR_END, poseAt } from '../src/logic/timeline.js';

const CUP = { x: -0.026, z: -0.012, start: IMPACT_WINDOWS[1].start, end: IMPACT_WINDOWS[1].end };
const DROPS = [BEAN_LANDING, ...TAIL_LANDINGS];
const times = Array.from({ length: 401 }, (_, index) => (index / 400) * DURATION);

function splashesAt(time) {
  const out = new Float32Array(SPLASH_COUNT * SPLASH_STRIDE);
  const count = writeSplashes(poseAt(time), out);
  return { count, out: Array.from(out.slice(0, count * SPLASH_STRIDE)) };
}

test('ventanas de impacto: charco, chorro en la taza y grano, en orden', () => {
  const [pool, cup, bean] = IMPACT_WINDOWS;
  assert.ok(pool.start > 1.0 && pool.start < pool.end && pool.end < 3.2, JSON.stringify(pool));
  assert.equal(cup.start, FILL_START);
  assert.equal(cup.end, POUR_END);
  assert.ok(bean.start > 5.0 && bean.start < 5.7, JSON.stringify(bean));
  // Al empezar, la punta del arco llega a la superficie del cafe.
  const atStart = poseAt(cup.start);
  const tip = pourPath(atStart).at(-1)[0];
  assert.ok(Math.abs(tip[2] - atStart.coffeeLevel) < 1e-9);
  assert.equal(CUT_WINDOWS.length, 1);
});

test('chorro: entra en el cafe siempre en el mismo punto, lejos de la pared', () => {
  for (const time of [5.6, 6.5, 8.0]) {
    const pose = poseAt(time);
    const [x, y] = jetLanding(pose);
    const tip = pourPath(pose).at(-1)[0];
    assert.ok(Math.hypot(tip[0] - x, tip[1] - y) < 1e-9);
    assert.ok(Math.hypot(x, y) < cupInnerRadius(pose.coffeeLevel - pose.cupZ) - 0.004);
  }
});

test('ondas: mismo instante, misma superficie; nada antes del chorro', () => {
  for (const time of [6.0, 6.5, 7.3, 8.4, 8.9]) {
    for (const [x, z] of [[-0.024, -0.01], [-0.012, 0.02], [0.03, -0.01]]) {
      assert.equal(surfaceHeight(x, z, time, CUP, DROPS), surfaceHeight(x, z, time, CUP, DROPS));
    }
  }
  assert.equal(pourEnvelope(CUP.start - 0.01, CUP.start, CUP.end), 0);
  assert.equal(impactHeight(-0.025, -0.012, CUP.start - 0.01, CUP), 0);
});

test('ondas: viajan hacia fuera y se apagan tras cortar el chorro', () => {
  const peak = (time, radius) => Math.max(...Array.from({ length: 64 }, (_, index) => {
    const angle = (index / 64) * 2 * Math.PI;
    return Math.abs(impactHeight(CUP.x + radius * Math.cos(angle), CUP.z + radius * Math.sin(angle), time, CUP));
  }));
  // Al principio el borde aun no ha recibido la onda; el centro si.
  assert.ok(peak(CUP.start + 0.25, 0.003) > 0);
  assert.equal(peak(CUP.start + 0.1, 0.035), 0);
  // Tras el corte, el centro se calma antes que el borde.
  assert.equal(peak(CUP.end + 0.05, 0.002), 0);
  assert.ok(peak(CUP.end + 0.05, 0.02) > 0);
  // Despues de que la ultima onda haya cruzado la taza solo queda el ambiente.
  assert.equal(peak(CUP.end + 1.4, 0.07), 0);
  const ambient = Math.abs(ambientHeight(0.01, 0.01, 9.5));
  assert.ok(ambient < 0.00002);
});

test('gotas de la cola: anillos solo despues de tocar la superficie y amortiguados', () => {
  const [first] = TAIL_LANDINGS;
  assert.equal(dropHeight(first.x + 0.001, first.z, first.time - 0.01, TAIL_LANDINGS), 0);
  const early = Math.abs(dropHeight(first.x + 0.075 * 0.05, first.z, first.time + 0.05, [first]));
  const late = Math.abs(dropHeight(first.x + 0.075 * 0.8, first.z, first.time + 0.8, [first]));
  assert.ok(early > late);
});

test('generador con semilla: misma secuencia en cada uso', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  for (let index = 0; index < 20; index += 1) assert.equal(a(), b());
});

test('salpicaduras: deterministas, solo cerca de los impactos y nunca antes ni despues', () => {
  for (const time of times) {
    const { count, out } = splashesAt(time);
    assert.deepEqual(splashesAt(time).out, out);
    if (count === 0) continue;
    const near = IMPACT_WINDOWS.some(({ start, end }) => time >= start && time <= end + MAX_FLIGHT);
    assert.ok(near, `gotas fuera de ventana en t=${time}`);
    const pose = poseAt(time);
    for (let index = 0; index < count; index += 1) {
      const [x, y, z, , , , radius, windowIndex] = out.slice(index * SPLASH_STRIDE, (index + 1) * SPLASH_STRIDE);
      assert.ok(Math.hypot(x, y) < 0.045, 'fuera de la taza o del platillo');
      assert.ok(z >= surfaceForWindow(pose, windowIndex) - 1e-6, 'bajo la superficie');
      assert.ok(radius > 0 && radius < 0.002);
    }
  }
  assert.equal(splashesAt(IMPACT_WINDOWS[0].start - 0.01).count, 0);
  const lastEnd = Math.max(...IMPACT_WINDOWS.map(({ end }) => end));
  assert.equal(splashesAt(Math.min(DURATION, lastEnd + MAX_FLIGHT + 0.01)).count, 0);
  assert.ok(splashesAt(IMPACT_WINDOWS[1].start + 0.03).count > 3, 'falta la corona del impacto');
});

test('salpicaduras: caen con la gravedad', () => {
  const start = IMPACT_WINDOWS[0].start + 0.06;
  const dt = 0.004;
  const a = splashesAt(start);
  const b = splashesAt(start + dt);
  const c = splashesAt(start + 2 * dt);
  assert.ok(a.count > 0);
  // Misma gota en los tres instantes: la primera escrita, si sigue en vuelo.
  const vzA = a.out[5];
  const vzC = c.out[5];
  if (a.count === c.count) close((vzC - vzA) / (2 * dt), -GRAVITY, 1e-3);
  // Aceleracion vertical por diferencias (con la superficie casi quieta en 8 ms).
  const surface = (time) => surfaceForWindow(poseAt(time), a.out[7]);
  if (a.count === b.count && b.count === c.count) {
    const za = a.out[2] - surface(start);
    const zb = b.out[2] - surface(start + dt);
    const zc = c.out[2] - surface(start + 2 * dt);
    close((za - 2 * zb + zc) / (dt * dt), -GRAVITY, 0.05);
  }
});

function close(a, b, eps) {
  assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
}

test('gotas de la cola: solo durante el corte, nunca suben y acaban en el cafe', () => {
  const out = new Float32Array(TAIL_DROP_COUNT * SPLASH_STRIDE);
  for (const time of times) {
    const count = writeTailDroplets(time, out);
    const inCut = CUT_WINDOWS.some(({ start, end }) => time > start && time < end + 0.2);
    if (!inCut) assert.equal(count, 0, `gotas de cola en t=${time}`);
    for (let index = 0; index < count; index += 1) {
      assert.ok(out[index * SPLASH_STRIDE + 5] <= 1e-6, 'la gota sube');
    }
  }
  const pose = poseAt(POUR_END);
  for (const landing of TAIL_LANDINGS) {
    const radius = Math.hypot(landing.x, landing.z);
    assert.ok(radius < cupInnerRadius(pose.coffeeLevel - pose.cupZ), 'la gota cae fuera de la taza');
  }
  const before = writeTailDroplets(CUT_WINDOWS[0].start - 0.001, out);
  assert.equal(before, 0);
  assert.ok(writeTailDroplets(CUT_WINDOWS[0].start + 0.2, out) > 0);
  assert.equal(writeTailDroplets(DURATION, out), 0);
});
