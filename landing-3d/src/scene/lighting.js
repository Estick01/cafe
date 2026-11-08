/*
 * Luces de build_scene.build_lights traducidas a tiempo real.
 *
 * Una luz de area de Blender da en el eje una irradiancia E = P / (pi * d^2) y un resplandor
 * L = P / (A * pi). Los focos usan E; los paneles del entorno PMREM usan L, y son lo que da los
 * reflejos anchos que un foco puntual no puede dar.
 * Las posiciones estan en ejes de Blender y se convierten con el unico helper de ejes.
 */
import * as THREE from 'three';

import { toThree } from '../logic/coords.js';

const RIG = Object.freeze({
  key: { position: [-0.42, -0.36, 0.52], target: [0, 0, 0.07], size: 0.55, power: 9.0, color: [1.0, 0.93, 0.84] },
  fill: { position: [0.55, -0.42, 0.2], target: [0, 0, 0.06], size: 0.7, power: 1.0, color: [0.86, 0.92, 1.0] },
  rim: { position: [0.26, 0.28, 0.46], target: [0, 0, 0.08], size: 0.32, power: 5.0, color: [1.0, 0.86, 0.7] },
  wall: { position: [0.0, -0.06, 0.82], target: [0, 0.34, 0.26], size: 0.9, power: 0.6, color: [1.0, 0.96, 0.9] },
});

/* Reparto entre luz directa (con sombra) y paneles del entorno (difusa suave y reflejos). */
const DIRECT_SCALE = Object.freeze({ key: 0.62, fill: 0.5, rim: 0.5, wall: 1.7 });
const ENV_PANEL_SCALE = Object.freeze({ key: 1.0, fill: 1.0, rim: 0.8, wall: 1.0 });
const ROOM_RADIANCE = new THREE.Color().setRGB(0.05, 0.047, 0.044, THREE.LinearSRGBColorSpace);
const COFFEE_REFLECTOR = Object.freeze({ position: [-0.02, 0.6, 0.55], size: 0.5, radiance: 0.2 });
const ENV_INTENSITY = 0.7;
/* Cono ancho con penumbra total: imita la caida de brillo de un panel lambertiano. */
const CONE_ANGLE = 1.15;
const CONE_PENUMBRA = 1;
const PMREM_BLUR = 0.015;

/* VSM con mucho desenfoque: penumbra ancha como la de una luz de area de 55 cm. */
const SHADOW = Object.freeze({ mapSize: 1024, focus: 0.42, near: 0.25, far: 1.6, radius: 11, blurSamples: 16, normalBias: 0.0012, bias: -0.0004 });

const linearColor = ([r, g, b]) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const radiance = ({ power, size }) => power / (size * size * Math.PI);

/* Con caida 1/d^2, la intensidad en candelas que da E = P / (pi d^2) es simplemente P / pi. */
function spot(spec, scale) {
  const light = new THREE.SpotLight(linearColor(spec.color), (spec.power / Math.PI) * scale, 0, CONE_ANGLE, CONE_PENUMBRA, 2);
  light.position.fromArray(toThree(spec.position));
  light.target.position.fromArray(toThree(spec.target));
  return light;
}

function configureShadow(light) {
  light.castShadow = true;
  const { mapSize, focus, near, far, radius, blurSamples, normalBias, bias } = SHADOW;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.focus = focus;
  Object.assign(light.shadow.camera, { near, far });
  light.shadow.radius = radius;
  light.shadow.blurSamples = blurSamples;
  light.shadow.normalBias = normalBias;
  light.shadow.bias = bias;
}

export function addLights(scene) {
  const key = spot(RIG.key, DIRECT_SCALE.key);
  configureShadow(key);
  const fill = spot(RIG.fill, DIRECT_SCALE.fill);
  const rim = spot(RIG.rim, DIRECT_SCALE.rim);
  const wall = spot(RIG.wall, DIRECT_SCALE.wall);
  [key, fill, rim, wall].forEach((light) => scene.add(light, light.target));
  return { key, fill, rim, wall };
}

function panel(spec, scale) {
  const radianceValue = radiance(spec) * scale;
  const color = linearColor(spec.color).multiplyScalar(radianceValue);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(spec.size, spec.size),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  mesh.position.fromArray(toThree(spec.position));
  mesh.lookAt(new THREE.Vector3().fromArray(toThree(spec.target)));
  return mesh;
}

/* Sala de estudio pequena: paneles emisivos en la misma posicion que las luces de area. */
function buildStudioScene() {
  const studio = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(3, 2.2, 3),
    new THREE.MeshBasicMaterial({ color: ROOM_RADIANCE, side: THREE.BackSide }),
  );
  room.position.y = 0.9;
  studio.add(room);
  Object.entries(RIG).forEach(([name, spec]) => studio.add(panel(spec, ENV_PANEL_SCALE[name])));
  studio.add(coffeeReflector());
  return studio;
}

function softTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.45, '#8a8a8a');
  gradient.addColorStop(1, '#000000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/*
 * Panel difuso en la direccion que refleja la superficie del cafe en el plano final. Sin el, un
 * liquido oscuro y brillante no tendria nada que reflejar y se veria mate.
 */
function coffeeReflector() {
  const { position, size, radiance: value } = COFFEE_REFLECTOR;
  const map = softTexture();
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({
      map,
      color: linearColor([1, 0.9, 0.76]).multiplyScalar(value),
      side: THREE.DoubleSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.position.fromArray(toThree(position));
  mesh.lookAt(0, 0.07, 0);
  return mesh;
}

function disposeScene(scene) {
  scene.traverse((object) => {
    object.geometry?.dispose();
    object.material?.map?.dispose();
    object.material?.dispose();
  });
}

export function addEnvironment(renderer, scene) {
  const generator = new THREE.PMREMGenerator(renderer);
  const studio = buildStudioScene();
  const target = generator.fromScene(studio, PMREM_BLUR, 0.05, 10);
  disposeScene(studio);
  generator.dispose();
  scene.environment = target.texture;
  scene.environmentIntensity = ENV_INTENSITY;
  return target;
}
