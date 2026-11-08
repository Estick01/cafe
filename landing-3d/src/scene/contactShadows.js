/*
 * Sombras de contacto falsas: discos con degradado radial bajo la base y el platillo (la de la
 * taza sobre el platillo es un parche de su shader, para seguir su curvatura).
 * Dan el oscurecimiento suave que Cycles obtiene con rebotes de luz, por muy poco coste.
 *
 * Encima, un anillo calido aditivo: en Cycles la luz que atraviesa y rebota en la ceramica crema
 * tiñe de marron rojizo la sombra bajo el borde del platillo, en la base de piedra y en el suelo.
 */
import * as THREE from 'three';

import { toThree } from '../logic/coords.js';
import { PEDESTAL_RADIUS, PEDESTAL_TOP, SAUCER_RADIUS } from '../logic/dimensions.js';
import { smooth } from '../logic/timeline.js';

const TEXTURE_SIZE = 128;
const LIFT = 0.0006; // sobre la superficie, para no pelear con su profundidad
const FLOOR_SAUCER = Object.freeze({ scale: 1.24, opacity: 0.86 });
const FLOOR_PEDESTAL = Object.freeze({ scale: 1.26, opacity: 0.7 });
/* Rebote calido, en lineal y sin tono: se suma a lo que haya debajo. */
const WARM_COLOR = Object.freeze([0.105, 0.036, 0.012]);
/* Anillos: nada en el centro (tapado por el platillo), maximo justo bajo el borde, se apaga enseguida. */
const WARM_FLOOR = Object.freeze({
  scale: 1.2, strength: 0.22, stops: [[0, 0], [0.62, 0], [0.8, 0.7], [0.86, 1], [0.93, 0.35], [1, 0]],
});
const WARM_PEDESTAL = Object.freeze({
  scale: 1.16, strength: 0.32, stops: [[0, 0], [0.7, 0], [0.83, 0.6], [0.88, 1], [0.94, 0.3], [1, 0]],
});

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  const center = TEXTURE_SIZE / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.62, 'rgba(0,0,0,0.92)');
  gradient.addColorStop(0.8, 'rgba(0,0,0,0.42)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function warmRingTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext('2d');
  const center = TEXTURE_SIZE / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  stops.forEach(([stop, value]) => {
    const level = Math.round(255 * value);
    gradient.addColorStop(stop, `rgb(${level},${level},${level})`);
  });
  context.fillStyle = gradient;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function warmRing(texture, radius, sharedGeometry) {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(...WARM_COLOR, THREE.LinearSRGBColorSpace),
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(sharedGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.renderOrder = 2;
  return mesh;
}

function blob(texture, radius, sharedGeometry) {
  const material = new THREE.MeshBasicMaterial({
    // La mascara esta en alfa: alphaMap leeria el verde (negro en toda la imagen).
    color: 0x090403, map: texture, transparent: true, depthWrite: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(sharedGeometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.renderOrder = 1;
  return mesh;
}

export function createContactShadows(scene) {
  const texture = radialTexture();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const underPedestal = blob(texture, PEDESTAL_RADIUS * FLOOR_PEDESTAL.scale, geometry);
  const underSaucer = blob(texture, SAUCER_RADIUS * FLOOR_SAUCER.scale, geometry);
  const warmFloor = warmRing(warmRingTexture(WARM_FLOOR.stops), SAUCER_RADIUS * WARM_FLOOR.scale, geometry);
  const warmPedestal = warmRing(warmRingTexture(WARM_PEDESTAL.stops), SAUCER_RADIUS * WARM_PEDESTAL.scale, geometry);
  [underPedestal, underSaucer, warmFloor].forEach((mesh) => {
    mesh.position.fromArray(toThree([0, 0, LIFT]));
  });
  const meshes = Object.freeze([underPedestal, underSaucer, warmFloor, warmPedestal]);
  scene.add(...meshes);

  function update(pose) {
    const landing = smooth(1.9, 2.5, pose.time);
    underPedestal.visible = pose.pedestalVisible;
    underPedestal.material.opacity = FLOOR_PEDESTAL.opacity * (1 - landing);
    underSaucer.visible = landing > 0.001;
    underSaucer.material.opacity = FLOOR_SAUCER.opacity * landing;
    warmFloor.visible = underSaucer.visible;
    warmFloor.material.opacity = WARM_FLOOR.strength * landing;
    // Sobre la base mientras el platillo descansa en ella; se va con ella al hundirse en el suelo.
    const pedestalTop = pose.pedestalZ + PEDESTAL_TOP;
    const resting = 1 - smooth(0.0005, 0.006, Math.abs(pose.saucerZ - pedestalTop));
    warmPedestal.visible = pose.pedestalVisible && pedestalTop > LIFT && resting > 0.001;
    warmPedestal.position.y = pedestalTop + LIFT;
    warmPedestal.material.opacity = WARM_PEDESTAL.strength * resting * (1 - landing);
  }

  return { update, meshes };
}
