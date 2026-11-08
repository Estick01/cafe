/* Paridad con los modulos Python de blender/: el fixture lo genera scripts/generar_fixture.py. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as dimensions from '../src/logic/dimensions.js';
import { coffeeMesh, poolMesh, pourPath, tubeMesh } from '../src/logic/liquid.js';
import { steamMesh } from '../src/logic/steam.js';
import { poseAt } from '../src/logic/timeline.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/parity.json', import.meta.url), 'utf8'));
const TOLERANCE = 1e-9;

function assertClose(actual, expected, label) {
  if (typeof expected === 'boolean') {
    assert.equal(actual, expected, label);
    return;
  }
  assert.ok(Math.abs(actual - expected) <= TOLERANCE, `${label}: JS ${actual} vs Python ${expected}`);
}

function assertArrayClose(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: longitud`);
  expected.forEach((value, index) => assertClose(actual[index], value, `${label}[${index}]`));
}

const POSE_FIELDS = {
  time: 'time', saucer_z: 'saucerZ', pedestal_z: 'pedestalZ', pedestal_visible: 'pedestalVisible',
  cup_z: 'cupZ', reveal: 'reveal', handle_growth: 'handleGrowth', bean_z: 'beanZ',
  bean_rotation: 'beanRotation', camera_position: 'cameraPosition', camera_target: 'cameraTarget',
  pouring: 'pouring', pour_head_z: 'pourHeadZ', feed_cut: 'feedCut', pour_cut: 'pourCut',
  helix_blend: 'helixBlend', helix_turns: 'helixTurns', ribbon_z: 'ribbonZ', ribbon_angle: 'ribbonAngle',
  ribbon_outside: 'ribbonOutside', streak: 'streak', jet_head: 'jetHead', jet_morph: 'jetMorph',
  pool_radius: 'poolRadius', coffee_level: 'coffeeLevel', coffee_visible: 'coffeeVisible', steam_amount: 'steamAmount',
  pour_x: 'pourX', pour_y: 'pourY',
};

test('poses: todos los campos en todos los instantes', () => {
  for (const expected of fixture.poses) {
    const pose = poseAt(expected.time);
    for (const [pythonName, jsName] of Object.entries(POSE_FIELDS)) {
      const label = `t=${expected.time} ${jsName}`;
      if (Array.isArray(expected[pythonName])) assertArrayClose(pose[jsName], expected[pythonName], label);
      else assertClose(pose[jsName], expected[pythonName], label);
    }
  }
});

test('poses: fuera de rango lanza error, como en Python', () => {
  for (const time of fixture.outOfRange) assert.throws(() => poseAt(time), RangeError);
});

test('recorrido del chorro: mismos puntos, misma cantidad', () => {
  for (const { time, points } of fixture.paths) {
    const actual = pourPath(poseAt(time));
    assert.equal(actual.length, points.length, `t=${time} cantidad de puntos`);
    points.forEach(([position, radial, vertical], index) => {
      assertArrayClose(actual[index][0], position, `t=${time} punto ${index}`);
      assertClose(actual[index][1], radial, `t=${time} radial ${index}`);
      assertClose(actual[index][2], vertical, `t=${time} vertical ${index}`);
    });
  }
});

test('malla de tubo: vertices y caras', () => {
  for (const { time, vertices, faces, firstFaces, lastFace } of fixture.tubes) {
    const mesh = tubeMesh(pourPath(poseAt(time)));
    assertArrayClose(mesh.vertices, vertices, `tubo t=${time}`);
    assert.equal(mesh.faces.length, faces);
    assert.deepEqual(mesh.faces.slice(0, 3), firstFaces);
    assert.deepEqual(mesh.faces.at(-1), lastFace);
  }
});

function assertDisc(mesh, expected, label) {
  assert.equal(mesh.vertices.length, expected.count * 3, `${label}: vertices`);
  assert.equal(mesh.faces.length, expected.faces, `${label}: caras`);
  for (const [index, vertex] of Object.entries(expected.samples)) {
    const start = Number(index) * 3;
    assertArrayClose(Array.from(mesh.vertices.slice(start, start + 3)), vertex, `${label} v${index}`);
  }
}

test('charco y superficie del cafe', () => {
  for (const { time, pool, coffee } of fixture.discs) {
    assertDisc(poolMesh(poseAt(time)), pool, `charco t=${time}`);
    assertDisc(coffeeMesh(poseAt(time)), coffee, `cafe t=${time}`);
  }
});

test('vapor: vertices, caras y densidades', () => {
  for (const { time, count, faces, samples, densities } of fixture.steam) {
    const mesh = steamMesh(poseAt(time));
    assert.equal(mesh.vertices.length, count * 3);
    assert.equal(mesh.faces.length, faces);
    for (const [index, vertex] of Object.entries(samples)) {
      const start = Number(index) * 3;
      assertArrayClose(Array.from(mesh.vertices.slice(start, start + 3)), vertex, `vapor t=${time} v${index}`);
    }
    for (const [index, density] of Object.entries(densities)) {
      assertClose(mesh.densities[Number(index)], density, `densidad t=${time} v${index}`);
    }
  }
});

test('tablas de radios de dimensions', () => {
  const { heights, outer, inner, radii, saucer } = fixture.radii;
  heights.forEach((height, index) => {
    assertClose(dimensions.cupOuterRadius(height), outer[index], `exterior h=${height}`);
    assertClose(dimensions.cupInnerRadius(height), inner[index], `interior h=${height}`);
  });
  radii.forEach((radius, index) => {
    assertClose(dimensions.saucerTopHeight(radius), saucer[index], `platillo r=${radius}`);
  });
});
