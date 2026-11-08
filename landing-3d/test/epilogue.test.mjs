/* Epilogo (cuchara, gota, ondas, camara) y aroma: deterministas, acotados y reversibles. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AROMA_LOW, AROMA_MAX, AROMA_NOTES, aromaAnchors, aromaParticle } from '../src/logic/aroma.js';
import { blenderEulerToThreeQuaternion, toThree } from '../src/logic/coords.js';
import {
  CUP_INNER_RADIUS, DIP, EPILOGUE_DURATION, SPOON, STORY_END, TOTAL_DURATION, dropLanding, epilogueAt, epilogueTimeAt,
  lowestLipPoint, progressForTotalTime, rotateEuler, sceneAt, scrollForTotalTime, spoonAt, storyTimeAt,
  totalTimeForProgress, withEpilogueCamera,
} from '../src/logic/epilogue.js';
import { DURATION, poseAt } from '../src/logic/timeline.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const SURFACE = poseAt(DURATION).coffeeLevel;
const steps = (count) => Array.from({ length: count + 1 }, (_, index) => (index / count) * EPILOGUE_DURATION);

test('epilogo: el scroll cubre la historia y despues unos 3 s mas, sin tocar DURATION', () => {
  assert.equal(STORY_END, DURATION);
  assert.ok(EPILOGUE_DURATION >= 2.5 && EPILOGUE_DURATION <= 3.5);
  close(TOTAL_DURATION, DURATION + EPILOGUE_DURATION);
  assert.equal(totalTimeForProgress(0), 0);
  assert.equal(totalTimeForProgress(1), TOTAL_DURATION);
  assert.equal(totalTimeForProgress(-2), 0);
  assert.equal(totalTimeForProgress(9), TOTAL_DURATION);
  close(progressForTotalTime(totalTimeForProgress(0.37)), 0.37);
  const measure = { top: 300, range: 6000 };
  close(scrollForTotalTime(TOTAL_DURATION, measure), 6300);
  close(scrollForTotalTime(DURATION, measure), 300 + (6000 * DURATION) / TOTAL_DURATION);
  assert.equal(storyTimeAt(12.3), DURATION);
  assert.equal(storyTimeAt(4.2), 4.2);
  assert.equal(epilogueTimeAt(4.2), 0);
  close(epilogueTimeAt(11.5), 1.5);
  assert.equal(epilogueTimeAt(99), EPILOGUE_DURATION);
});

test('epilogo: la historia recibe min(t, 10) y la pose queda igual hasta el final de la historia', () => {
  for (const time of [0, 3.3, 7.9, DURATION]) assert.deepEqual(sceneAt(time).pose, poseAt(time));
  const after = sceneAt(12);
  assert.equal(after.pose.time, DURATION);
  assert.equal(after.pose.coffeeLevel, poseAt(DURATION).coffeeLevel);
  assert.equal(sceneAt(-1).epilogue.time, 0);
  assert.equal(sceneAt(Number.NaN).epilogue.time, 0);
  assert.equal(sceneAt(1e9).epilogue.time, EPILOGUE_DURATION);
});

test('epilogo: determinista y reversible, mismo tiempo mismo estado en cualquier orden', () => {
  const times = steps(60).map((e) => STORY_END + e);
  const forward = times.map((time) => sceneAt(time));
  const backward = [...times].reverse().map((time) => sceneAt(time)).reverse();
  assert.deepEqual(forward, backward);
  assert.deepEqual(epilogueAt(1.7, SURFACE), epilogueAt(1.7, SURFACE));
  assert.ok(Object.isFrozen(epilogueAt(1.7, SURFACE)));
});

test('rotacion de la cuchara: misma convencion XYZ que el cuaternion de Three', () => {
  const euler = [0.3, -0.2, 0.9];
  const [qx, qy, qz, qw] = blenderEulerToThreeQuaternion(euler);
  const vector = [0.4, -0.1, 0.25];
  const [vx, vy, vz] = toThree(vector);
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  const viaQuaternion = [vx + qw * tx + qy * tz - qz * ty, vy + qw * ty + qz * tx - qx * tz, vz + qw * tz + qx * ty - qy * tx];
  toThree(rotateEuler(euler, vector)).forEach((value, index) => close(value, viaQuaternion[index], 1e-12));
});

test('cuchara: entra desde fuera de cuadro, moja en el cafe y termina arriba a la derecha', () => {
  const start = spoonAt(0, SURFACE);
  assert.ok(start.position[0] > 0.2, 'empieza a la derecha, fuera del plano');
  assert.ok(start.position[2] > SURFACE + 0.1, 'empieza por encima de la taza');
  const dipped = spoonAt(1.2, SURFACE);
  close(dipped.position[0], DIP[0], 1e-6);
  assert.ok(dipped.position[2] < SURFACE, 'la boca del cuenco baja de la superficie');
  assert.ok(lowestLipPoint(dipped)[2] < SURFACE - 0.003, 'el labio entra en el cafe');
  assert.ok(Math.hypot(DIP[0], DIP[1]) + SPOON.bowlRadius < CUP_INNER_RADIUS, 'el cuenco cabe en la taza');
  const end = spoonAt(EPILOGUE_DURATION, SURFACE);
  assert.ok(end.position[0] > 0.04 && end.position[2] > SURFACE + 0.045, 'queda arriba a la derecha');
  // Movimiento continuo: sin saltos entre muestras cercanas.
  const samples = steps(600).map((e) => spoonAt(e, SURFACE).position);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(Math.hypot(...samples[index].map((v, axis) => v - samples[index - 1][axis])) < 0.004);
  }
});

test('cuchara: se llena al mojar y sigue llena', () => {
  assert.equal(epilogueAt(0.5, SURFACE).fill, 0);
  assert.equal(epilogueAt(1.5, SURFACE).fill, 1);
  assert.equal(epilogueAt(EPILOGUE_DURATION, SURFACE).fill, 1);
  const fills = steps(120).map((e) => epilogueAt(e, SURFACE).fill);
  fills.slice(1).forEach((value, index) => assert.ok(value >= fills[index] && value <= 1));
});

test('gota: nace en el labio, cae dentro de la taza y deja una onda', () => {
  assert.equal(epilogueAt(1.0, SURFACE).drop, null);
  const forming = epilogueAt(1.9, SURFACE).drop;
  assert.ok(forming && forming.position[2] > SURFACE + 0.025);
  const falling = epilogueAt(2.25, SURFACE).drop;
  assert.ok(falling.position[2] < forming.position[2] && falling.position[2] >= SURFACE);
  assert.equal(epilogueAt(2.5, SURFACE).drop, null);
  const landing = dropLanding(SURFACE);
  assert.ok(Math.hypot(...landing) < CUP_INNER_RADIUS - 0.008, 'cae dentro, lejos de la pared');
  const ring = epilogueAt(2.5, SURFACE).rings.find((item) => item.radius < 0.02);
  assert.ok(ring && ring.strength > 0);
  assert.deepEqual(ring.center, [...landing]);
  assert.equal(epilogueAt(EPILOGUE_DURATION, SURFACE).rings.length, 0);
});

test('camara: retrocede suave en el epilogo sin tocar la pose de la historia', () => {
  const pose = poseAt(DURATION);
  assert.equal(withEpilogueCamera(pose, 0), pose);
  const pulled = withEpilogueCamera(pose, EPILOGUE_DURATION);
  const distance = (p) => Math.hypot(...p.cameraPosition.map((v, i) => v - p.cameraTarget[i]));
  assert.ok(distance(pulled) > distance(pose) * 1.15);
  assert.ok(distance(pulled) < distance(pose) * 1.35);
  assert.equal(pulled.time, pose.time);
  const tiny = withEpilogueCamera(pose, 0.01);
  assert.ok(distance(tiny) - distance(pose) < 0.001, 'arranca sin salto');
});

test('vista estatica: cuchara en reposo, sin gota ni ondas, aroma quieto', () => {
  const view = sceneAt(TOTAL_DURATION, { staticView: true }).epilogue;
  assert.equal(view.drop, null);
  assert.equal(view.rings.length, 0);
  assert.deepEqual(view.spoon, spoonAt(EPILOGUE_DURATION, SURFACE));
  assert.ok(view.aromaTime > 1 && view.aromaTime < EPILOGUE_DURATION);
});

test('aroma: pocas motas, deterministas, acotadas y con las tres notas', () => {
  assert.ok(AROMA_MAX <= 120 && AROMA_LOW < AROMA_MAX);
  assert.deepEqual(AROMA_NOTES.map((note) => note.id), ['panela', 'mandarina', 'cacao']);
  for (let index = 0; index < AROMA_MAX; index += 1) {
    assert.equal(aromaParticle(index, 0, SURFACE).alpha, 0, 'nada antes de empezar');
    const a = aromaParticle(index, 1.8, SURFACE, 4.2);
    assert.deepEqual(a, aromaParticle(index, 1.8, SURFACE, 4.2));
    assert.ok(a.alpha >= 0 && a.alpha <= 1);
    assert.ok(a.position.every(Number.isFinite));
    assert.ok(a.position[2] >= SURFACE, 'siempre por encima del cafe');
  }
  const visible = (e) => Array.from({ length: AROMA_MAX }, (_, i) => aromaParticle(i, e, SURFACE)).filter((p) => p.alpha > 0.01);
  assert.ok(visible(1.9).length > AROMA_MAX * 0.8);
  // Al final suben: la altura media crece entre 2,1 s y 3 s.
  const meanZ = (e) => visible(e).reduce((sum, p) => sum + p.position[2], 0) / visible(e).length;
  assert.ok(meanZ(3) > meanZ(2.1) + 0.012);
});

test('aroma: anclas de las etiquetas aparecen escalonadas y quedan visibles', () => {
  const early = aromaAnchors(1.0, SURFACE);
  assert.ok(early.every((anchor) => anchor.opacity === 0));
  const late = aromaAnchors(EPILOGUE_DURATION, SURFACE);
  assert.ok(late.every((anchor) => anchor.opacity === 1));
  const mid = aromaAnchors(1.75, SURFACE).map((anchor) => anchor.opacity);
  assert.ok(mid[0] > mid[1] && mid[1] > mid[2]);
});
