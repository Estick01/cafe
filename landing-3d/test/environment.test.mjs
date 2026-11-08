/* Pruebas de la punta del asa y del progreso de carga (logica pura, sin DOM ni WebGL). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import {
  buildHandleRings, growthCapRadius, handleCapScale, handleClipValue, solveHandle, writeHandle,
} from '../src/logic/handle.js';
import { createLoadPlan, displayPercent, downloadFraction, DOWNLOAD_SHARE } from '../src/logic/loadProgress.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* Tubo sintetico: semicirculo de radio 0.03 en el plano XY, 21 anillos de 8 vertices. */
function syntheticTube({ rings = 21, sides = 8, tube = 0.004, arc = 0.03 } = {}) {
  const positions = [];
  const normals = [];
  const advance = [];
  for (let ring = 0; ring < rings; ring += 1) {
    const a = ring / (rings - 1);
    const angle = Math.PI * a - Math.PI / 2;
    const centre = [arc * Math.cos(angle), arc * Math.sin(angle) + arc, 0];
    const radial = [Math.cos(angle), Math.sin(angle), 0];
    for (let side = 0; side < sides; side += 1) {
      const phi = (2 * Math.PI * side) / sides;
      const n = [radial[0] * Math.cos(phi), radial[1] * Math.cos(phi), Math.sin(phi)];
      positions.push(centre[0] + n[0] * tube, centre[1] + n[1] * tube, centre[2] + n[2] * tube);
      normals.push(...n);
      advance.push(a);
    }
  }
  return { positions: Float32Array.from(positions), normals: Float32Array.from(normals), advance: Float32Array.from(advance) };
}

test('asa: perfil de media esfera de la punta', () => {
  assert.equal(handleCapScale(0), 0);
  assert.equal(handleCapScale(-1), 0);
  assert.equal(handleCapScale(1), 1);
  assert.equal(handleCapScale(3), 1);
  close(handleCapScale(0.5), Math.sqrt(0.75));
  for (let x = 0.05; x < 1; x += 0.05) assert.ok(handleCapScale(x) > handleCapScale(x - 0.05));
  close(growthCapRadius(0.004, 0.5), 0.004);
  close(growthCapRadius(0.004, 1), 0);
});

test('asa: los anillos se agrupan por avance, con centro, longitud y radio', () => {
  const tube = syntheticTube();
  const model = buildHandleRings(tube.positions, tube.advance);
  assert.equal(model.rings.length, 21);
  close(model.length, Math.PI * 0.03, 0.0005);
  close(model.radius, 0.004, 1e-6);
  model.rings.forEach((ring, index) => assert.ok(index === 0 || ring.advance > model.rings[index - 1].advance));
});

test('asa: a medio crecer, las puntas quedan cerradas y redondas', () => {
  const tube = syntheticTube();
  const model = buildHandleRings(tube.positions, tube.advance);
  const growth = 0.5;
  const solution = solveHandle(model, growth, 10);
  assert.equal(solution.visible, true);
  const out = { positions: new Float32Array(tube.positions.length), normals: new Float32Array(tube.normals.length) };
  writeHandle(model, solution, tube, out.positions, out.normals);
  const limit = handleClipValue(growth) / 2;
  model.rings.forEach((ring, index) => {
    const state = solution.rings[index];
    const fromJoint = Math.min(ring.advance, 1 - ring.advance);
    if (fromJoint >= limit) {
      // Oculto: todos sus vertices en un mismo punto del eje (triangulos de area cero).
      assert.ok(state.target, `anillo ${index} deberia juntarse en la punta`);
      ring.indices.forEach((vertex) => {
        close(distance([...out.positions.slice(vertex * 3, vertex * 3 + 3)], state.target), 0, 1e-6);
      });
    } else {
      assert.equal(state.target, null);
      ring.indices.forEach((vertex) => {
        const radius = distance([...out.positions.slice(vertex * 3, vertex * 3 + 3)], ring.centre);
        close(radius, 0.004 * state.scale, 1e-5);
      });
    }
  });
  // La punta esta en el eje, entre el ultimo anillo visible y el primero oculto de cada rama.
  const hidden = solution.rings.filter((state) => state.target);
  hidden.forEach((state) => assert.ok(distance(state.target, [0, 0.03, 0]) > 0.029 - 1e-6, 'punta sobre el arco'));
  // Los anillos lejos de la punta no cambian; el ultimo visible antes de la punta se estrecha.
  assert.equal(solution.rings[0].scale, 1);
  const lastVisible = solution.rings.findIndex((state) => state.target) - 1;
  assert.ok(solution.rings[lastVisible].scale < 1);
  // Normales unitarias.
  for (let vertex = 0; vertex < out.normals.length / 3; vertex += 1) {
    close(Math.hypot(...out.normals.slice(vertex * 3, vertex * 3 + 3)), 1, 1e-5);
  }
});

test('asa: el plano de aparicion tambien cierra el tubo, y completa no cambia nada', () => {
  const tube = syntheticTube();
  const model = buildHandleRings(tube.positions, tube.advance);
  const planeY = 0.045;
  const cut = solveHandle(model, 1, planeY);
  model.rings.forEach((ring, index) => {
    if (ring.centre[1] >= planeY) assert.ok(cut.rings[index].target, `anillo ${index} sobre el plano`);
    if (cut.rings[index].target) close(cut.rings[index].target[1], planeY, 1e-9);
  });
  const full = solveHandle(model, 1, 10);
  const out = { positions: new Float32Array(tube.positions.length), normals: new Float32Array(tube.normals.length) };
  writeHandle(model, full, tube, out.positions, out.normals);
  out.positions.forEach((value, index) => close(value, tube.positions[index], 1e-7));
  out.normals.forEach((value, index) => close(value, tube.normals[index], 1e-6));
  assert.equal(solveHandle(model, 0, 10).visible, false);
});

/* Lee GEO-asa del glb real, sin dependencias: comprueba que el modelo de anillos encaja. */
function readHandleFromGlb() {
  const url = new URL('../assets/models/cafe.glb', import.meta.url);
  if (!fs.existsSync(url)) return null;
  const buffer = fs.readFileSync(url);
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
  const binary = 20 + jsonLength + 8;
  const node = json.nodes.find((item) => item.name === 'GEO-asa');
  const primitive = json.meshes[node.mesh].primitives[0];
  const read = (index) => {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const components = { SCALAR: 1, VEC3: 3 }[accessor.type];
    const start = binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return new Float32Array(buffer.buffer.slice(buffer.byteOffset + start, buffer.byteOffset + start + accessor.count * components * 4));
  };
  return { positions: read(primitive.attributes.POSITION), advance: read(primitive.attributes._ASA_AVANCE) };
}

test('asa del glb: 37 anillos de 25 vertices y cierra en todo el tramo de crecimiento', () => {
  const handle = readHandleFromGlb();
  if (!handle) return;
  const model = buildHandleRings(handle.positions, handle.advance);
  assert.equal(model.rings.length, 37);
  model.rings.forEach((ring) => assert.equal(ring.indices.length, 25));
  assert.ok(model.length > 0.08 && model.length < 0.16, `longitud ${model.length}`);
  assert.ok(model.radius > 0.003 && model.radius < 0.006, `radio ${model.radius}`);
  for (let growth = 0.05; growth < 1; growth += 0.05) {
    for (const planeY of [0.05, 0.062, 0.066, 0.07, 1]) {
      const solution = solveHandle(model, growth, planeY);
      solution.rings.forEach((state, index) => {
        const next = solution.rings[index + 1];
        // Entre un anillo visible y uno oculto, el visible ya esta estrechado: no hay boca abierta.
        const previous = solution.rings[index - 1];
        const atTip = (next && !state.target && next.target) || (previous && !state.target && previous.target);
        // Las puntas de crecimiento se abren al final a proposito (CAP_FADE): ahi se cierran en cono.
        if (atTip && growth <= 0.85) assert.ok(state.scale < 1, `g=${growth} y=${planeY} anillo ${index}`);
      });
    }
  }
});

test('carga: plan desde el manifest y fraccion por bytes', () => {
  const manifest = {
    glb: 'cafe.glb',
    sizeBytes: { files: { 'cafe.glb': 800, 'a.jpg': 100, 'b.jpg': 100 } },
    externalTextures: { files: ['a.jpg', 'b.jpg'] },
  };
  const plan = createLoadPlan(manifest);
  assert.deepEqual(plan.map((file) => file.name), ['cafe.glb', 'a.jpg', 'b.jpg']);
  assert.equal(downloadFraction(plan, {}), 0);
  close(downloadFraction(plan, { 'cafe.glb': 400 }), 0.4);
  close(downloadFraction(plan, { 'cafe.glb': 800, 'a.jpg': 100, 'b.jpg': 100 }), 1);
  // Un archivo mayor de lo anunciado no lleva nunca la fraccion por encima de 1.
  assert.ok(downloadFraction(plan, { 'cafe.glb': 2000, 'a.jpg': 100, 'b.jpg': 100 }) <= 1);
  // Sin tamanos en el manifest se usa la cabecera real.
  const blind = createLoadPlan({ glb: 'x.glb' });
  close(downloadFraction(blind, { 'x.glb': 50 }, { 'x.glb': 200 }), 0.25);
});

test('carga: el porcentaje no retrocede y solo llega a 100 con el primer fotograma', () => {
  assert.equal(displayPercent(0, 'download', 0.5), Math.floor(50 * DOWNLOAD_SHARE));
  assert.equal(displayPercent(60, 'download', 0.1), 60);
  assert.equal(displayPercent(0, 'download', 1), Math.floor(100 * DOWNLOAD_SHARE));
  assert.ok(displayPercent(90, 'parse') > 90);
  assert.ok(displayPercent(93, 'compile') < 100);
  assert.equal(displayPercent(97, 'painted'), 100);
  assert.equal(displayPercent(0, 'download', Number.NaN), 0);
  assert.equal(displayPercent(0, 'download', 7), Math.floor(100 * DOWNLOAD_SHARE));
});
