/*
 * Piezas de atrezo: taza de espresso con platillo (torno procedural) y grano de cafe tostado.
 */
import * as THREE from 'three';

import { TAZA } from '../../logic/vitrina.js';

const v2 = (x, y) => new THREE.Vector2(x, y);

function perfilTaza() {
  const { radio: r, alto: h } = TAZA;
  const e = 0.0028;
  return [
    v2(0, 0.0005), v2(r * 0.55, 0.0005), v2(r * 0.6, 0.0), v2(r * 0.66, 0.002),
    v2(r * 0.8, h * 0.18), v2(r * 0.93, h * 0.48), v2(r * 0.99, h * 0.8), v2(r, h * 0.97),
    v2(r - e * 0.4, h), v2(r - e, h * 0.985), v2(r - e, h * 0.8), v2(r * 0.9 - e, h * 0.48),
    v2(r * 0.72 - e, h * 0.2), v2(r * 0.4, h * 0.12), v2(0, h * 0.11),
  ];
}

function perfilPlatillo() {
  const r = TAZA.platillo;
  return [
    v2(0, 0.0012), v2(r * 0.3, 0.0012), v2(r * 0.36, 0.0), v2(r * 0.46, 0.001),
    v2(r * 0.55, 0.0035), v2(r * 0.82, 0.0055), v2(r, 0.0098), v2(r * 0.985, 0.0108),
    v2(r * 0.8, 0.0078), v2(r * 0.56, 0.0062), v2(r * 0.42, 0.0052), v2(0, 0.0052),
  ];
}

function texturaCrema(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c * 1.04, c * 0.96, 0, c, c, c);
  g.addColorStop(0, '#d9a066');
  g.addColorStop(0.45, '#b97a45');
  g.addColorStop(0.82, '#7b4a26');
  g.addColorStop(1, '#3a2010');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    const a = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const b = (Math.sin(i * 78.233) * 43758.5453) % 1;
    ctx.fillStyle = `rgba(250,220,170,${0.05 + Math.abs(a) * 0.08})`;
    ctx.beginPath();
    ctx.arc(c + a * c * 0.8, c + b * c * 0.8, 1 + Math.abs(b) * size * 0.01, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* Recursos compartidos por todas las tazas de la vitrina. */
export function crearRecursosTaza(segmentos) {
  const ceramica = new THREE.MeshPhysicalMaterial({
    color: 0x111111, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1,
  });
  const crema = texturaCrema(256);
  const cafe = new THREE.MeshPhysicalMaterial({ map: crema, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const taza = new THREE.LatheGeometry(perfilTaza(), segmentos);
  const platillo = new THREE.LatheGeometry(perfilPlatillo(), segmentos);
  const asa = new THREE.TorusGeometry(0.0115, 0.0033, 8, Math.max(10, segmentos / 3), Math.PI * 1.25);
  const superficie = new THREE.CircleGeometry(TAZA.radio * 0.9, segmentos);
  superficie.rotateX(-Math.PI / 2);
  const geometrias = [taza, platillo, asa, superficie];
  return {
    ceramica, cafe, taza, platillo, asa, superficie,
    dispose() {
      geometrias.forEach((g) => g.dispose());
      ceramica.dispose(); cafe.dispose(); crema.dispose();
    },
  };
}

export function crearTaza(recursos) {
  const grupo = new THREE.Group();
  grupo.name = 'vitrina-taza';
  const platillo = new THREE.Mesh(recursos.platillo, recursos.ceramica);
  const taza = new THREE.Mesh(recursos.taza, recursos.ceramica);
  taza.position.y = 0.0052;
  const asa = new THREE.Mesh(recursos.asa, recursos.ceramica);
  asa.position.set(TAZA.radio * 0.96, 0.0052 + TAZA.alto * 0.56, 0);
  asa.rotation.z = -Math.PI * 0.62;
  const cafe = new THREE.Mesh(recursos.superficie, recursos.cafe);
  cafe.position.y = 0.0052 + TAZA.alto * 0.8;
  grupo.add(platillo, taza, asa, cafe);
  return grupo;
}

/* Grano tostado: elipsoide con surco central en la cara plana. */
export function crearGeometriaGrano(detalle) {
  const geometry = new THREE.SphereGeometry(1, detalle, Math.round(detalle * 0.75));
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i); let y = pos.getY(i); const z = pos.getZ(i);
    if (y > 0) y *= 0.62 - 0.4 * Math.exp(-((x / 0.16) ** 2)) * (1 - Math.abs(z) ** 4);
    pos.setXYZ(i, x * 0.0062, y * 0.0055, z * 0.0088);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function crearMaterialGrano() {
  return new THREE.MeshPhysicalMaterial({ color: 0x3b2212, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 });
}
