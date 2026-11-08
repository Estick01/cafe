/*
 * Pared interior mojada justo por encima del cafe: una pelicula fina pegada a la pared, oscura y
 * brillante, que aparece con cada salpicadura y se seca en un par de segundos (logic/splash.js).
 * Malla preasignada: en cada fotograma solo se reescriben posiciones y alfa.
 */
import * as THREE from 'three';

import { cupInnerRadius } from '../logic/dimensions.js';
import { wetness } from '../logic/splash.js';
import { createWetWallMaterial } from './coffeeMaterials.js';

const SIDES = 64;
const ROWS = 8;
const HEIGHT = 0.014; // altura de la franja mojada sobre el cafe
const BELOW = 0.001; // empieza un poco por debajo para cubrir el menisco
const INSET = 0.00025; // separacion de la pared para que no parpadee
const OPACITY = 0.55;

function createIndex() {
  const index = [];
  for (let row = 0; row < ROWS - 1; row += 1) {
    for (let side = 0; side < SIDES; side += 1) {
      const next = (side + 1) % SIDES;
      const a = row * SIDES + side;
      const b = row * SIDES + next;
      const c = (row + 1) * SIDES + next;
      const d = (row + 1) * SIDES + side;
      index.push(a, b, c, a, c, d);
    }
  }
  return index;
}

export function createWetWall(scene) {
  const count = SIDES * ROWS;
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normals = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
  const colors = new THREE.BufferAttribute(new Float32Array(count * 4), 4).setUsage(THREE.DynamicDrawUsage);
  for (let row = 0; row < ROWS; row += 1) {
    for (let side = 0; side < SIDES; side += 1) {
      const angle = (2 * Math.PI * side) / SIDES;
      // Normal hacia el eje: la cara que se ve desde dentro de la taza.
      normals.setXYZ(row * SIDES + side, -Math.cos(angle), 0, -Math.sin(angle));
    }
  }
  geometry.setAttribute('position', positions);
  geometry.setAttribute('normal', normals);
  geometry.setAttribute('color', colors);
  geometry.setIndex(createIndex());
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.05, 0), 0.1);

  const mesh = new THREE.Mesh(geometry, createWetWallMaterial());
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;
  scene.add(mesh);

  function update(pose) {
    const wet = pose.coffeeVisible ? wetness(pose.time) : 0;
    mesh.visible = wet > 0.01;
    if (!mesh.visible) return;
    const position = positions.array;
    const color = colors.array;
    for (let row = 0; row < ROWS; row += 1) {
      const ratio = row / (ROWS - 1);
      const z = pose.coffeeLevel - BELOW + (HEIGHT + BELOW) * ratio;
      const radius = cupInnerRadius(z - pose.cupZ) - INSET;
      // Mas mojado junto al cafe y nada en el borde superior de la franja.
      const alpha = OPACITY * wet * (1 - ratio) ** 1.6;
      for (let side = 0; side < SIDES; side += 1) {
        const angle = (2 * Math.PI * side) / SIDES;
        const vertex = row * SIDES + side;
        position[vertex * 3] = radius * Math.cos(angle);
        position[vertex * 3 + 1] = z;
        position[vertex * 3 + 2] = radius * Math.sin(angle);
        color[vertex * 4] = 1;
        color[vertex * 4 + 1] = 1;
        color[vertex * 4 + 2] = 1;
        color[vertex * 4 + 3] = alpha;
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  return { update, mesh };
}
