/*
 * Cuchara de cata procedural: cuenco hondo torneado (LatheGeometry) con labio redondeado y un
 * mango barrido a lo largo de una curva suave, ancho al final y fino en el cuello. Acero pulido.
 * Ejes locales de Three: la boca del cuenco en el origen, abierta hacia +y; el mango hacia +x.
 * (Equivale a +z arriba y mango hacia +x en ejes de Blender, como en logic/epilogue.js.)
 */
import * as THREE from 'three';

import { SPOON } from '../logic/epilogue.js';

const BOWL_SEGMENTS = 64;
const BOWL_RINGS = 22;
const HANDLE_SAMPLES = 72;
const HANDLE_SIDES = 18;
const STEEL = new THREE.Color().setRGB(0.62, 0.62, 0.6, THREE.LinearSRGBColorSpace);

/* Perfil del cuenco (radio, altura): por dentro del centro al labio y por fuera de vuelta. */
function bowlProfile() {
  const { bowlRadius: radius, bowlDepth: depth, wall } = SPOON;
  const points = [];
  for (let step = 0; step <= BOWL_RINGS; step += 1) {
    const angle = (step / BOWL_RINGS) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.max(1e-5, (radius - wall) * Math.sin(angle)), -(depth - wall) * Math.cos(angle)));
  }
  // Labio enrollado: medio circulo del borde interior al exterior.
  for (let step = 1; step < 8; step += 1) {
    const angle = Math.PI - (step / 8) * Math.PI;
    points.push(new THREE.Vector2(radius - wall / 2 + (wall / 2) * Math.cos(angle) * 1.1, (wall * 0.7) * Math.sin(angle)));
  }
  for (let step = BOWL_RINGS; step >= 0; step -= 1) {
    const angle = (step / BOWL_RINGS) * (Math.PI / 2);
    points.push(new THREE.Vector2(Math.max(1e-5, radius * Math.sin(angle)), -depth * Math.cos(angle)));
  }
  return points;
}

/* Eje del mango en el plano xy local: sube en el cuello y se aplana hacia el final. */
function handleCurve() {
  const r = SPOON.bowlRadius;
  const points = [
    [r - 0.0012, 0.0002], [r + 0.008, 0.0042], [r + 0.022, 0.0118], [r + 0.045, 0.0215],
    [r + 0.075, 0.0292], [r + 0.105, 0.0335], [r + 0.13, 0.0352],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0));
  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

/* Anchura y grosor del mango a lo largo de s en [0, 1]: cuello fino, paleta ancha, punta redonda. */
function handleSection(s) {
  const neck = 0.0062 - 0.0022 * Math.min(1, s / 0.22);
  const blade = THREE.MathUtils.smoothstep(s, 0.3, 0.84);
  let width = neck + (0.0108 - neck) * blade;
  let thickness = 0.0026 - 0.0005 * blade;
  const tipStart = 0.88;
  if (s > tipStart) {
    const u = (s - tipStart) / (1 - tipStart);
    const round = Math.sqrt(Math.max(0, 1 - u * u));
    width *= round;
    thickness *= 0.4 + 0.6 * round;
  }
  return [Math.max(width, 1e-5), Math.max(thickness, 1e-5)];
}

function handleGeometry() {
  const curve = handleCurve();
  const positions = [];
  const uvs = [];
  const indices = [];
  const side = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3();
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  for (let i = 0; i <= HANDLE_SAMPLES; i += 1) {
    const s = i / HANDLE_SAMPLES;
    curve.getPointAt(s, point);
    curve.getTangentAt(s, tangent);
    up.crossVectors(side, tangent).normalize();
    const [width, thickness] = handleSection(s);
    for (let j = 0; j < HANDLE_SIDES; j += 1) {
      const a = (j / HANDLE_SIDES) * Math.PI * 2;
      // Superelipse: seccion plana con cantos redondeados, como una cuchara estampada.
      const c = Math.cos(a);
      const n = Math.sin(a);
      const across = Math.sign(c) * Math.abs(c) ** 0.6 * (width / 2);
      const height = Math.sign(n) * Math.abs(n) ** 0.6 * (thickness / 2);
      positions.push(point.x + up.x * height, point.y + up.y * height, point.z + across);
      uvs.push(s, j / HANDLE_SIDES);
    }
  }
  for (let i = 0; i < HANDLE_SAMPLES; i += 1) {
    for (let j = 0; j < HANDLE_SIDES; j += 1) {
      const a = i * HANDLE_SIDES + j;
      const b = i * HANDLE_SIDES + ((j + 1) % HANDLE_SIDES);
      const c = a + HANDLE_SIDES;
      const d = b + HANDLE_SIDES;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Tapa del arranque, metida bajo el labio del cuenco.
  const center = positions.length / 3;
  curve.getPointAt(0, point);
  positions.push(point.x, point.y, point.z);
  uvs.push(0, 0);
  for (let j = 0; j < HANDLE_SIDES; j += 1) indices.push(center, j, (j + 1) % HANDLE_SIDES);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createSteelMaterial() {
  return new THREE.MeshPhysicalMaterial({
    name: 'acero-cuchara',
    color: STEEL,
    metalness: 1,
    roughness: 0.17,
    anisotropy: 0.35,
    envMapIntensity: 1.6,
    side: THREE.DoubleSide,
  });
}

/* Grupo de la cuchara; la transformacion la pone quien la usa. */
export function createSpoon() {
  const material = createSteelMaterial();
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile(), BOWL_SEGMENTS), material);
  const handle = new THREE.Mesh(handleGeometry(), material);
  const group = new THREE.Group();
  group.name = 'cuchara-cata';
  for (const mesh of [bowl, handle]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, material };
}

/* Radio interior del cuenco a una altura local y (negativa, bajo la boca). */
export function bowlInnerRadius(y) {
  const depth = SPOON.bowlDepth - SPOON.wall;
  const ratio = Math.min(1, Math.max(0, -y / depth));
  return (SPOON.bowlRadius - SPOON.wall) * Math.sqrt(1 - ratio * ratio);
}
