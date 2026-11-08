/* Fisica del liquido: oleaje, rebote en la pared, burbujas, columna del grano, gotas de la cola y pared mojada. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cupInnerRadius } from '../src/logic/dimensions.js';
import { SLOSH, besselJ0, besselJ1, pourBulge, reflectedHeight, sloshHeight } from '../src/logic/slosh.js';
import {
  BEAN_ENERGY, BUBBLE_COUNT, IMPACT_WINDOWS, SLOSH_EVENTS, SPLASH_COUNT, SPLASH_STRIDE, WORTHINGTON_COUNT,
  writeBubbles, writeSplashes, writeWorthington, wetness,
} from '../src/logic/splash.js';
import { DURATION, FILL_START, POUR_END, poseAt } from '../src/logic/timeline.js';

const R = 0.043;
const CUP = { x: -0.026, z: -0.012, start: FILL_START, end: POUR_END };
const close = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('Bessel: modos con pendiente nula en la pared (la onda se refleja)', () => {
  const e = 1e-5;
  close((besselJ0(SLOSH.k01 + e) - besselJ0(SLOSH.k01 - e)) / (2 * e), 0, 1e-4);
  close((besselJ1(SLOSH.k11 + e) - besselJ1(SLOSH.k11 - e)) / (2 * e), 0, 1e-4);
  close(besselJ0(0), 1, 1e-12);
  close(besselJ0(2.4048), 0, 1e-4);
});

test('oleaje: nada antes del golpe, determinista y se calma', () => {
  const point = [0.01, -0.02];
  const first = Math.min(...SLOSH_EVENTS.map(({ time }) => time));
  assert.equal(sloshHeight(...point, first - 0.01, R, SLOSH_EVENTS), 0);
  const peak = (start) => Math.max(...Array.from({ length: 40 }, (_, i) => Math.abs(sloshHeight(...point, start + i * 0.01, R, SLOSH_EVENTS))));
  assert.equal(sloshHeight(...point, 6.0, R, SLOSH_EVENTS), sloshHeight(...point, 6.0, R, SLOSH_EVENTS));
  assert.ok(peak(5.7) > 0.0001, 'se mueve tras los golpes');
  assert.ok(peak(9.5) < peak(5.7) * 0.05, 'y se calma al final');
});

test('oleaje: el golpe descentrado inclina la superficie hacia el', () => {
  const event = [{ x: 0.02, z: 0, time: 0, amplitude: 0.001 }];
  const quarter = Math.PI / 2 / (SLOSH.slow * Math.sqrt(9.81 * (SLOSH.k11 / R) * Math.tanh((SLOSH.k11 / R) * SLOSH.depth)));
  const near = sloshHeight(0.03, 0, quarter, R, event);
  const far = sloshHeight(-0.03, 0, quarter, R, event);
  assert.ok(near > far, `${near} vs ${far}`);
});

test('abultamiento y rebote en la pared solo mientras cae el chorro', () => {
  assert.equal(pourBulge(CUP.x, CUP.z, FILL_START - 0.01, R, CUP), 0);
  assert.ok(pourBulge(CUP.x, CUP.z, 7.0, R, CUP) > 0);
  assert.equal(pourBulge(CUP.x, CUP.z, POUR_END + 0.01, R, CUP), 0);
  assert.equal(reflectedHeight(0.02, 0.01, FILL_START - 0.01, R, CUP), 0);
  const reflected = Array.from({ length: 30 }, (_, i) => Math.abs(reflectedHeight(-0.035, -0.016, 6.0 + i * 0.01, R, CUP)));
  assert.ok(Math.max(...reflected) > 0, 'llega la onda reflejada');
});

test('burbujas: nacen con el chorro, se quedan dentro de la taza y revientan', () => {
  const out = new Float32Array(BUBBLE_COUNT * SPLASH_STRIDE);
  assert.equal(writeBubbles(poseAt(FILL_START - 0.05), out), 0);
  for (const time of [5.8, 6.5, 7.5, 8.3]) {
    const pose = poseAt(time);
    const count = writeBubbles(pose, out);
    assert.ok(count > 0, `t=${time}`);
    const again = new Float32Array(out.length);
    assert.equal(writeBubbles(pose, again), count);
    assert.deepEqual(Array.from(again.slice(0, count * SPLASH_STRIDE)), Array.from(out.slice(0, count * SPLASH_STRIDE)));
    const wall = cupInnerRadius(pose.coffeeLevel - pose.cupZ);
    for (let i = 0; i < count; i += 1) {
      assert.ok(Math.hypot(out[i * SPLASH_STRIDE], out[i * SPLASH_STRIDE + 1]) < wall);
      assert.ok(out[i * SPLASH_STRIDE + 6] > 0);
    }
  }
  assert.equal(writeBubbles(poseAt(DURATION), out), 0);
});

test('columna de Worthington: solo tras caer el grano, sube y se desploma', () => {
  const out = new Float32Array(WORTHINGTON_COUNT * SPLASH_STRIDE);
  const bean = IMPACT_WINDOWS[2].start;
  assert.equal(writeWorthington(poseAt(bean - 0.01), out), 0);
  const heights = [0.1, 0.2, 0.3].map((delay) => {
    const pose = poseAt(bean + delay);
    return writeWorthington(pose, out) > 0 ? out[2] - pose.coffeeLevel : 0;
  });
  assert.ok(heights[1] > heights[0] * 0.9 && heights[1] > 0, JSON.stringify(heights));
  assert.equal(writeWorthington(poseAt(bean + 0.9), out), 0);
  assert.ok(BEAN_ENERGY >= 0.7 && BEAN_ENERGY <= 1.5);
});

test('gotas de la cola: cada una hace su corona al caer', () => {
  const out = new Float32Array(SPLASH_COUNT * SPLASH_STRIDE);
  const tails = IMPACT_WINDOWS.map((window, index) => ({ ...window, index })).filter(({ id }) => id === 'tail');
  assert.ok(tails.length >= 4);
  for (const { start, index } of tails) {
    // La corona sale a lo largo de unos 50 ms: alguna de sus gotas vuela en ese tramo.
    const seen = [0.01, 0.025, 0.04, 0.055].some((delay) => {
      const count = writeSplashes(poseAt(start + delay), out);
      return Array.from({ length: count }, (_, i) => out[i * SPLASH_STRIDE + 7]).includes(index);
    });
    assert.ok(seen, `corona en t=${start}`);
  }
});

test('pared mojada: seca antes del chorro, se moja con los golpes y se seca despues', () => {
  assert.equal(wetness(FILL_START - 0.1), 0);
  assert.ok(wetness(FILL_START + 0.2) > 0.5);
  assert.ok(wetness(DURATION) < wetness(POUR_END + 0.15));
  for (let time = 0; time <= DURATION; time += 0.05) {
    const value = wetness(time);
    assert.ok(value >= 0 && value <= 1);
  }
});
