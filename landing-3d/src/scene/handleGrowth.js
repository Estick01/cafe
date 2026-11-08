/*
 * Asa que crece con puntas redondas y cerradas (ver logic/handle.js). Reescribe posiciones y
 * normales solo cuando cambian el crecimiento o el plano de aparicion: fuera de t 3.0-4.2 no cuesta
 * nada. Sin descartes ni planos de recorte, la sombra sale de la misma geometria.
 */
import * as THREE from 'three';

import { buildHandleRings, solveHandle, writeHandle } from '../logic/handle.js';

const ADVANCE_ATTRIBUTE = '_asa_avance';
const EPSILON = 1e-6;

export function createHandleGrowth(handle) {
  const geometry = handle.geometry;
  const advance = geometry.getAttribute(ADVANCE_ATTRIBUTE);
  if (!advance) throw new Error(`GEO-asa no trae el atributo ${ADVANCE_ATTRIBUTE}`);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const rest = Object.freeze({ positions: Float32Array.from(position.array), normals: Float32Array.from(normal.array) });
  const model = buildHandleRings(rest.positions, advance.array);
  position.setUsage(THREE.DynamicDrawUsage);
  normal.setUsage(THREE.DynamicDrawUsage);
  // La geometria solo encoge: la esfera de reposo sigue sirviendo para el recorte de camara.
  geometry.computeBoundingSphere();

  // Tubo cerrado por las puntas: las caras traseras no tienen nada que mostrar.
  handle.material.side = THREE.FrontSide;
  handle.material.clippingPlanes = null;

  let last = { growth: -1, planeY: -1 };

  /* planeY: altura del plano de aparicion en el marco local de la taza (pose.reveal). */
  function update(growth, planeY) {
    if (Math.abs(growth - last.growth) < EPSILON && Math.abs(planeY - last.planeY) < EPSILON) return;
    last = { growth, planeY };
    const solution = solveHandle(model, growth, planeY);
    handle.visible = solution.visible;
    if (!solution.visible) return;
    writeHandle(model, solution, rest, position.array, normal.array);
    position.needsUpdate = true;
    normal.needsUpdate = true;
  }

  return { update, model };
}
