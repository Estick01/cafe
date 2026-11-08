/*
 * Puerto de blender/steam.py: hilos ondulados que suben mirando a la camara. Sin Three ni DOM.
 * Cada hilo es una lamina fina con una densidad por vertice, que el material usa como opacidad.
 */
import { writeThree } from './coords.js';

const ROWS = 56;
const COLUMNS = 12;

/* [desplazamiento lateral, altura, fase, velocidad, opacidad relativa] */
const STRANDS = [
  [-0.024, 0.108, 0.3, 0.085, 0.65],
  [-0.008, 0.132, 2.1, 0.11, 1.0],
  [0.007, 0.12, 4.0, 0.095, 0.9],
  [0.022, 0.102, 5.4, 0.08, 0.7],
  [-0.015, 0.085, 1.2, 0.12, 0.55],
  [0.014, 0.092, 3.1, 0.105, 0.6],
];

export const STEAM_VERTEX_COUNT = STRANDS.length * ROWS * COLUMNS;

function smooth(start, end, value) {
  const ratio = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return ratio * ratio * (3 - 2 * ratio);
}

/* Ondulacion lateral: crece al subir y viaja hacia arriba. */
function centerOffset(heightRatio, phase, speed, time) {
  const amplitude = 0.001 + 0.0085 * heightRatio;
  const slow = Math.sin(2 * Math.PI * (0.85 * heightRatio - speed * time) + phase);
  const gentle = 0.25 * Math.sin(2 * Math.PI * (1.7 * heightRatio - speed * 1.3 * time) + phase * 1.7);
  return amplitude * (slow + gentle);
}

/* Recorre vertices y densidades; `time` puede llevar un extra de tiempo ambiental. */
function visitSteam(pose, time, visit) {
  const dx = pose.cameraPosition[0] - pose.cameraTarget[0];
  const dy = pose.cameraPosition[1] - pose.cameraTarget[1];
  const length = Math.hypot(dx, dy) || 1;
  const depthX = dx / length;
  const depthY = dy / length;
  const rightX = depthY;
  const rightY = -depthX;
  const base = pose.coffeeLevel;
  const decay = Math.exp(-2.4);
  let vertex = 0;
  for (let index = 0; index < STRANDS.length; index += 1) {
    const [offset, height, phase, speed, strength] = STRANDS[index];
    const breathing = 0.82 + 0.18 * Math.sin(time * speed * 5 + phase);
    const front = (index - STRANDS.length / 2) * 0.0035;
    for (let row = 0; row < ROWS; row += 1) {
      const ratio = row / (ROWS - 1);
      const center = offset + centerOffset(ratio, phase, speed, time);
      const halfWidth = 0.0085 + 0.03 * ratio; // ancho desde abajo: nube suave, no un chorro
      const fade = smooth(0, 0.3, ratio) * (1 - smooth(0.32, 1, ratio));
      for (let column = 0; column < COLUMNS; column += 1) {
        const across = (column / (COLUMNS - 1)) * 2 - 1;
        const side = center + across * halfWidth;
        const profile = Math.max(0, Math.exp(-2.4 * across * across) - decay);
        visit(
          vertex,
          rightX * side + depthX * front,
          rightY * side + depthY * front,
          base + ratio * height,
          Math.min(1, profile * fade * strength * breathing * pose.steamAmount),
        );
        vertex += 1;
      }
    }
  }
}

function steamFaces() {
  const faces = [];
  for (let strand = 0; strand < STRANDS.length; strand += 1) {
    const start = strand * ROWS * COLUMNS;
    for (let row = 0; row < ROWS - 1; row += 1) {
      for (let column = 0; column < COLUMNS - 1; column += 1) {
        const corner = start + row * COLUMNS + column;
        faces.push([corner, corner + 1, corner + COLUMNS + 1, corner + COLUMNS]);
      }
    }
  }
  return faces;
}

/* Malla pura en ejes de Blender; vacia si aun no hay vapor. */
export function steamMesh(pose) {
  if (pose.steamAmount <= 0.001) return { vertices: [], faces: [], densities: [] };
  const vertices = [];
  const densities = [];
  visitSteam(pose, pose.time, (index, x, y, z, density) => {
    vertices[index * 3] = x;
    vertices[index * 3 + 1] = y;
    vertices[index * 3 + 2] = z;
    densities[index] = density;
  });
  return { vertices, faces: steamFaces(), densities };
}

export function writeSteam(pose, positions, densities, ambientTime = 0) {
  visitSteam(pose, pose.time + ambientTime, (index, x, y, z, density) => {
    writeThree(positions, index * 3, x, y, z);
    densities[index] = density;
  });
}

export function createSteamIndex() {
  return Uint16Array.from(steamFaces().flatMap(([a, b, c, d]) => [a, b, c, a, c, d]));
}
