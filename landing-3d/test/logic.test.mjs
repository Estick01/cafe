/* Pruebas de lo que no existe en Python: ejes, buffers preasignados, encuadre, asa y progreso. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blenderEulerToThreeQuaternion, toThree, writeThree } from '../src/logic/coords.js';
import { fittedCamera, frameRect, referenceVerticalFov } from '../src/logic/framing.js';
import { handleClipValue, handleVisible } from '../src/logic/handle.js';
import {
  DISC_VERTEX_COUNT, coffeeMesh, createDiscIndex, createTubeIndex, pourPath, tubeMesh, writeDisc, writeTube, MAX_TUBE_POINTS, RING_SIDES,
  coffeeDiscParams,
} from '../src/logic/liquid.js';
import { progressAt, timeForProgress } from '../src/logic/progress.js';
import { STEAM_VERTEX_COUNT, createSteamIndex, steamMesh, writeSteam } from '../src/logic/steam.js';
import { DURATION, poseAt } from '../src/logic/timeline.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('ejes: Blender (x,y,z) pasa a Three (x,z,-y)', () => {
  assert.deepEqual(toThree([1, 2, 3]), [1, 3, -2]);
  const buffer = new Float32Array(6);
  writeThree(buffer, 3, 1, 2, 3);
  assert.deepEqual(Array.from(buffer), [0, 0, 0, 1, 3, -2]);
});

/* Aplica un cuaternion (x,y,z,w) a un vector. */
function rotate([qx, qy, qz, qw], [vx, vy, vz]) {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + qy * tz - qz * ty,
    vy + qw * ty + qz * tx - qx * tz,
    vz + qw * tz + qx * ty - qy * tx,
  ];
}

test('rotacion del grano: orden XYZ de Blender, convertido a ejes de Three', () => {
  // Blender aplica X, luego Y, luego Z. Giro de 90 grados en X y 90 en Z sobre (0,1,0):
  // X lo lleva a (0,0,1); Z no lo mueve. En Three, (0,0,1) de Blender es (0,1,0).
  const q = blenderEulerToThreeQuaternion([Math.PI / 2, 0, Math.PI / 2]);
  const rotated = rotate(q, toThree([0, 1, 0]));
  toThree([0, 0, 1]).forEach((value, index) => close(rotated[index], value));
  // Sobre (1,0,0): X no lo mueve; Z lo lleva a (0,1,0).
  const other = rotate(q, toThree([1, 0, 0]));
  toThree([0, 1, 0]).forEach((value, index) => close(other[index], value));
});

test('tubo preasignado: coincide con la malla pura y tiene normales unitarias hacia fuera', () => {
  for (const time of [1.2, 2.4, 4.3, 6.5]) {
    const points = pourPath(poseAt(time));
    const positions = new Float32Array(MAX_TUBE_POINTS * RING_SIDES * 3);
    const normals = new Float32Array(MAX_TUBE_POINTS * RING_SIDES * 3);
    const used = writeTube(points, positions, normals);
    assert.equal(used, points.length);
    const pure = tubeMesh(points);
    for (let vertex = 0; vertex < used * RING_SIDES; vertex += 1) {
      const [x, y, z] = pure.vertices.slice(vertex * 3, vertex * 3 + 3);
      close(positions[vertex * 3], x, 1e-6);
      close(positions[vertex * 3 + 1], z, 1e-6);
      close(positions[vertex * 3 + 2], -y, 1e-6);
      const length = Math.hypot(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]);
      close(length, 1, 1e-5);
    }
    assert.ok(points.length <= MAX_TUBE_POINTS, `t=${time} excede el buffer: ${points.length}`);
  }
});

test('ningun instante excede los buffers del tubo', () => {
  for (let frame = 0; frame <= 240; frame += 1) {
    const count = pourPath(poseAt(frame / 24)).length;
    assert.ok(count <= MAX_TUBE_POINTS, `frame ${frame}: ${count}`);
  }
});

test('indices: cuadrados de Python en triangulos con la misma orientacion', () => {
  const tube = createTubeIndex(3, 14);
  assert.equal(tube.length, 2 * 14 * 6);
  assert.deepEqual(Array.from(tube.slice(0, 6)), [0, 1, 15, 0, 15, 14]);
  const disc = createDiscIndex();
  assert.equal(disc.length, (72 + 35 * 72 * 2) * 3);
  assert.deepEqual(Array.from(disc.slice(0, 3)), [0, 1, 2]);
  const steam = createSteamIndex();
  assert.equal(steam.length, 6 * 55 * 11 * 6);
});

test('disco preasignado: coincide con la malla pura y normales apuntan hacia arriba', () => {
  const pose = poseAt(7);
  const positions = new Float32Array(DISC_VERTEX_COUNT * 3);
  const normals = new Float32Array(DISC_VERTEX_COUNT * 3);
  writeDisc(coffeeDiscParams(pose), positions, normals);
  const pure = coffeeMesh(pose);
  for (let vertex = 0; vertex < DISC_VERTEX_COUNT; vertex += 1) {
    close(positions[vertex * 3], pure.vertices[vertex * 3], 1e-6);
    close(positions[vertex * 3 + 1], pure.vertices[vertex * 3 + 2], 1e-6);
    close(positions[vertex * 3 + 2], -pure.vertices[vertex * 3 + 1], 1e-6);
    assert.ok(normals[vertex * 3 + 1] > 0.5, `normal v${vertex}`);
  }
});

test('vapor preasignado: coincide con la malla pura', () => {
  const pose = poseAt(9);
  const positions = new Float32Array(STEAM_VERTEX_COUNT * 3);
  const densities = new Float32Array(STEAM_VERTEX_COUNT);
  writeSteam(pose, positions, densities);
  const pure = steamMesh(pose);
  for (let vertex = 0; vertex < STEAM_VERTEX_COUNT; vertex += 1) {
    close(positions[vertex * 3], pure.vertices[vertex * 3], 1e-6);
    close(positions[vertex * 3 + 1], pure.vertices[vertex * 3 + 2], 1e-6);
    close(positions[vertex * 3 + 2], -pure.vertices[vertex * 3 + 1], 1e-6);
    close(densities[vertex], pure.densities[vertex], 1e-6);
  }
});

test('asa: crece desde las dos uniones y cierra en el centro', () => {
  assert.equal(handleVisible(0.01, 0), false);
  assert.equal(handleVisible(0.5, 0), false);
  const partial = 0.5;
  assert.equal(handleVisible(0.1, partial), true);
  assert.equal(handleVisible(0.9, partial), true);
  assert.equal(handleVisible(0.5, partial), false);
  for (const advance of [0, 0.25, 0.5, 0.75, 1]) assert.equal(handleVisible(advance, 1), true);
  assert.ok(handleClipValue(0) < 0);
  assert.ok(handleClipValue(1) > 0.5);
});

test('progreso: el mismo scroll da la misma pose, en cualquier orden', () => {
  const measure = { top: 0, range: 5000 };
  const forward = [0, 1000, 2500, 4999, 5000].map((scrollY) => poseAt(timeForProgress(progressAt(scrollY, measure))));
  const backward = [5000, 4999, 2500, 1000, 0].map((scrollY) => poseAt(timeForProgress(progressAt(scrollY, measure))));
  assert.deepEqual(forward, backward.reverse());
  assert.equal(progressAt(-300, measure), 0);
  assert.equal(progressAt(99999, measure), 1);
  assert.equal(timeForProgress(1), DURATION);
});

test('encuadre: el formato de referencia reproduce el objetivo de 55 mm sobre 36 mm', () => {
  const fov = referenceVerticalFov(16 / 9);
  close(fov, (2 * Math.atan(18 / 55 / (16 / 9)) * 180) / Math.PI);
  const camera = fittedCamera({ width: 1920, height: 1080, rect: { x: 0, y: 0, width: 1920, height: 1080 } });
  close(camera.verticalFov, fov);
  close(camera.dolly, 1);
  close(camera.viewOffsetX, 0);
  close(camera.viewOffsetY, 0);
});

test('encuadre: en pantalla estrecha la camara se aleja en lugar de abrir el campo sin limite', () => {
  const width = 375;
  const height = 812;
  const rect = frameRect({ width, height, side: false, time: 5 });
  const camera = fittedCamera({ width, height, rect });
  assert.ok(camera.dolly > 1, `dolly ${camera.dolly}`);
  assert.ok(camera.verticalFov <= 40, `fov ${camera.verticalFov}`);
  // Mismo tamano aparente en el plano del sujeto que el rectangulo pedido.
  const px = height / (2 * Math.tan((camera.verticalFov * Math.PI) / 360));
  close((px / camera.dolly) * (36 / 55), rect.width, 1e-6);
});

test('encuadre lateral: el sujeto se aparta del texto y mantiene los fotogramas clave', () => {
  const start = frameRect({ width: 1440, height: 900, side: true, time: 0 });
  close(start.x + start.width / 2, 1440 * 0.6);
  close(start.y + start.height / 2, 450);
  const end = frameRect({ width: 1440, height: 900, side: true, time: 10 });
  close(end.x + end.width / 2, 1440 * 0.62);
  close(end.y + end.height / 2, 900 * 0.55);
  // En el plano final el asa (85 % del fotograma de referencia) no se corta contra el borde.
  assert.ok(end.x + end.width * 0.85 < 1440, 'asa dentro de pantalla');
});

test('resolucion adaptativa: baja con fotogramas lentos y no sube ni baja de sus limites', async () => {
  const { initialDprState, nextDprState } = await import('../src/logic/adaptive.js');
  const options = { min: 1, step: 0.25, slowFrameMs: 24, sampleSize: 3, settleFrames: 1 };
  const feed = (state, values) => values.reduce((current, value) => nextDprState(current, value, options), state);
  const fast = feed(initialDprState(2), [10, 10, 10]);
  assert.equal(fast.dpr, 2);
  const slow = feed(initialDprState(2), [40, 40, 40]);
  assert.equal(slow.dpr, 1.75);
  const floor = feed(initialDprState(1), [90, 90, 90, 90]);
  assert.equal(floor.dpr, 1);
  const initial = initialDprState(2);
  nextDprState(initial, 40, options);
  assert.equal(initial.samples.length, 0);
});

test('rotacion del grano: reproduce el cuaternion exportado en el manifest para t = 0', () => {
  const expected = [0.04097, 0.05616, 0.11982, 0.99036];
  const actual = blenderEulerToThreeQuaternion(poseAt(0).beanRotation);
  expected.forEach((value, index) => close(actual[index], value, 1e-4));
});
