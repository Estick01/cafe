/*
 * Gotas de cafe: salpicaduras del impacto y gotas que se separan de la cola del chorro.
 * Una sola InstancedMesh con esferas estiradas segun la velocidad; las trayectorias son las
 * funciones puras de logic/splash.js. Sin asignaciones por fotograma.
 */
import * as THREE from 'three';

import {
  BUBBLE_COUNT, SPLASH_STRIDE, writeBubbles, writeSplashes, writeTailDroplets, writeWorthington,
} from '../logic/splash.js';
import { createBubbleMaterial, createDropletMaterial } from './coffeeMaterials.js';

const CAPACITY = 40;
const CHEAP_CAPACITY = 14;
const CHEAP_BUBBLES = 8;
const BUBBLE_FLATTEN = 0.55;
/* Estiramiento por velocidad (m/s -> factor) y su limite. */
const STRETCH = Object.freeze({ perSpeed: 2.6, max: 3.2 });

/* Matriz de escala anisotropa: eje largo en la direccion de la velocidad (ejes de Three). */
function writeInstance(array, offset, px, py, pz, vx, vy, vz, radius) {
  const speed = Math.hypot(vx, vy, vz);
  const stretch = 1 + Math.min(STRETCH.max - 1, speed * STRETCH.perSpeed);
  const width = radius / Math.sqrt(stretch);
  let ax = 0;
  let ay = 1;
  let az = 0;
  if (speed > 1e-6) {
    ax = vx / speed;
    ay = vy / speed;
    az = vz / speed;
  }
  // Base ortonormal: b perpendicular a a, c = a x b.
  let bx = ay * 0 - az * 1;
  let by = az * 0 - ax * 0;
  let bz = ax * 1 - ay * 0;
  let bLength = Math.hypot(bx, by, bz);
  if (bLength < 1e-4) {
    bx = 0; by = -az; bz = ay;
    bLength = Math.hypot(bx, by, bz) || 1;
  }
  bx /= bLength; by /= bLength; bz /= bLength;
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const length = radius * stretch;
  array[offset] = ax * length; array[offset + 1] = ay * length; array[offset + 2] = az * length; array[offset + 3] = 0;
  array[offset + 4] = bx * width; array[offset + 5] = by * width; array[offset + 6] = bz * width; array[offset + 7] = 0;
  array[offset + 8] = cx * width; array[offset + 9] = cy * width; array[offset + 10] = cz * width; array[offset + 11] = 0;
  array[offset + 12] = px; array[offset + 13] = py; array[offset + 14] = pz; array[offset + 15] = 1;
}

function dynamicInstances(scene, geometry, material, capacity) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.count = 0;
  scene.add(mesh);
  return mesh;
}

function commit(mesh, count) {
  mesh.count = count;
  mesh.visible = count > 0;
  if (count === 0) return;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, count * 16);
  mesh.instanceMatrix.needsUpdate = true;
}

/* Burbuja: casquete aplastado sobre la superficie (ejes de Three). */
function writeBubble(array, offset, x, y, z, radius) {
  array.fill(0, offset, offset + 16);
  array[offset] = radius;
  array[offset + 5] = radius * BUBBLE_FLATTEN;
  array[offset + 10] = radius;
  array[offset + 12] = x;
  array[offset + 13] = y;
  array[offset + 14] = z;
  array[offset + 15] = 1;
}

export function createSplashes(scene) {
  const mesh = dynamicInstances(scene, new THREE.IcosahedronGeometry(1, 1), createDropletMaterial(), CAPACITY);
  const bubbles = dynamicInstances(scene, new THREE.IcosahedronGeometry(1, 1), createBubbleMaterial(), BUBBLE_COUNT);
  const buffer = new Float32Array(Math.max(CAPACITY, BUBBLE_COUNT) * SPLASH_STRIDE);

  /* Gotas: cola del chorro, columna de Worthington y salpicaduras, por ese orden de prioridad. */
  function updateDroplets(pose, cheap) {
    const capacity = cheap ? CHEAP_CAPACITY : CAPACITY;
    let count = writeTailDroplets(pose.time, buffer, 0);
    count += writeWorthington(pose, buffer, count);
    count += writeSplashes(pose, buffer, Math.max(0, capacity - count), count);
    count = Math.min(capacity, count);
    const array = mesh.instanceMatrix.array;
    for (let index = 0; index < count; index += 1) {
      const base = index * SPLASH_STRIDE;
      // Blender (x, y, z) -> Three (x, z, -y), tambien para la velocidad.
      writeInstance(array, index * 16, buffer[base], buffer[base + 2], -buffer[base + 1],
        buffer[base + 3], buffer[base + 5], -buffer[base + 4], buffer[base + 6]);
    }
    commit(mesh, count);
  }

  function updateBubbles(pose, cheap) {
    const count = writeBubbles(pose, buffer, cheap ? CHEAP_BUBBLES : BUBBLE_COUNT);
    const array = bubbles.instanceMatrix.array;
    for (let index = 0; index < count; index += 1) {
      const base = index * SPLASH_STRIDE;
      writeBubble(array, index * 16, buffer[base], buffer[base + 2], -buffer[base + 1], buffer[base + 6]);
    }
    commit(bubbles, count);
  }

  function update(pose, cheap) {
    updateDroplets(pose, cheap);
    updateBubbles(pose, cheap);
  }

  return { update, mesh };
}
