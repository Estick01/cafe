/*
 * Epilogo en escena: cuchara de cata, el cafe que recoge, la gota, unas ondas propias sobre la
 * superficie (sin tocar liquids.js) y las motas de aroma. Todo llega ya calculado desde
 * logic/epilogue.js y logic/aroma.js; aqui solo se aplica.
 */
import * as THREE from 'three';

import { AROMA_LOW, AROMA_MAX } from '../logic/aroma.js';
import { blenderEulerToThreeQuaternion, toThree } from '../logic/coords.js';
import { CUP_INNER_RADIUS, SPOON } from '../logic/epilogue.js';
import { createAroma } from './aroma.js';
import { bowlInnerRadius, createSpoon } from './spoon.js';

const COFFEE = new THREE.Color().setRGB(0.012, 0.0055, 0.003, THREE.LinearSRGBColorSpace);
const MAX_RINGS = 2;
/* Las ondas flotan un pelo sobre el cafe para no pelearse con su profundidad. */
const RING_LIFT = 0.0004;

const RING_VERTEX = /* glsl */ `
  varying vec2 vPlane;
  void main() {
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/* Cada onda: una cresta clara (reflejo) y un valle oscuro por dentro. Recortada a la taza. */
const RING_FRAGMENT = /* glsl */ `
  uniform vec4 uRings[${MAX_RINGS}];
  uniform float uCupRadius;
  varying vec2 vPlane;
  void main() {
    if (length(vPlane) > uCupRadius) discard;
    float light = 0.0;
    float dark = 0.0;
    for (int i = 0; i < ${MAX_RINGS}; i++) {
      vec4 ring = uRings[i];
      if (ring.w <= 0.0) continue;
      float d = length(vPlane - ring.xy) - ring.z;
      float width = 0.0006 + ring.z * 0.035;
      light += ring.w * exp(-pow(d / width, 2.0));
      dark += ring.w * exp(-pow((d + width * 1.8) / width, 2.0));
    }
    float alpha = clamp(light * 0.2 + dark * 0.22, 0.0, 0.45);
    if (alpha < 0.002) discard;
    vec3 color = vec3(0.92, 0.8, 0.66) * light / max(light + dark, 1e-4);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createRings(scene) {
  const material = new THREE.ShaderMaterial({
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uRings: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4()) },
      uCupRadius: { value: CUP_INNER_RADIUS },
    },
  });
  // Plano en xy de Blender: en Three se tumba sobre xz con -y de Blender hacia +z.
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CUP_INNER_RADIUS * 2, CUP_INNER_RADIUS * 2), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 9;
  mesh.visible = false;
  scene.add(mesh);

  function update(rings, surfaceZ) {
    mesh.visible = rings.length > 0;
    if (!mesh.visible) return;
    mesh.position.y = surfaceZ + RING_LIFT;
    material.uniforms.uRings.value.forEach((vector, index) => {
      const ring = rings[index];
      // Con rotation.x = -90 grados, el y local del plano es el y de Blender.
      if (ring) vector.set(ring.center[0], ring.center[1], ring.radius, ring.strength);
      else vector.set(0, 0, 0, 0);
    });
  }
  return { update, mesh };
}

function createCoffeeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    name: 'cafe-cuchara',
    color: COFFEE,
    roughness: 0.03,
    metalness: 0,
    ior: 1.34,
    envMapIntensity: 0.32,
  });
}

/* La gota necesita su brillo para leerse sobre el cafe oscuro. */
function createDropMaterial(coffee) {
  const material = coffee.clone();
  material.name = 'gota-cuchara';
  material.envMapIntensity = 4.5;
  return material;
}

export function createEpilogue(scene) {
  const { group: spoon } = createSpoon();
  spoon.visible = false;
  scene.add(spoon);

  const coffeeMaterial = createCoffeeMaterial();
  // Cafe en el cuenco: hijo de la cuchara, pero siempre horizontal en el mundo.
  const bowlCoffee = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), coffeeMaterial);
  bowlCoffee.receiveShadow = true;
  spoon.add(bowlCoffee);

  const drop = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), createDropMaterial(coffeeMaterial));
  drop.visible = false;
  scene.add(drop);

  const rings = createRings(scene);
  const up = new THREE.Vector3();
  const aroma = createAroma(scene);

  function updateBowlCoffee(fill) {
    bowlCoffee.visible = fill > 0.001;
    if (!bowlCoffee.visible) return;
    const usable = SPOON.bowlDepth - SPOON.wall - SPOON.fillMargin;
    // Con el cuenco inclinado, el cafe no puede pasar del punto mas bajo del borde.
    const tilt = Math.acos(Math.min(1, up.set(0, 1, 0).applyQuaternion(spoon.quaternion).y));
    const spill = -SPOON.bowlRadius * Math.sin(tilt) - SPOON.fillMargin;
    const level = Math.min(-(SPOON.bowlDepth - SPOON.wall) + 0.0012 + usable * fill, spill);
    const radius = bowlInnerRadius(level) * 0.93;
    bowlCoffee.position.set(0, level, 0);
    bowlCoffee.scale.set(radius, 1, radius);
    // Superficie nivelada: deshace la rotacion de la cuchara.
    bowlCoffee.quaternion.copy(spoon.quaternion).invert();
  }

  function updateDrop(state) {
    drop.visible = state !== null;
    if (!drop.visible) return;
    drop.position.fromArray(toThree(state.position));
    drop.scale.set(state.radius, state.radius * state.stretch, state.radius);
  }

  /* epilogue: estado de logic/epilogue.js; projScale: px por metro a 1 m de la camara. */
  function update(epilogue, ambient, { lowQuality, projScale }) {
    const active = Boolean(epilogue?.active);
    spoon.visible = active;
    if (!active) {
      drop.visible = false;
      rings.mesh.visible = false;
      aroma.update(0, 0, 0, 0, projScale);
      return;
    }
    const { spoon: pose, surfaceZ } = epilogue;
    spoon.position.fromArray(toThree(pose.position));
    spoon.quaternion.fromArray(blenderEulerToThreeQuaternion(pose.rotation));
    updateBowlCoffee(epilogue.fill);
    updateDrop(epilogue.drop);
    rings.update(epilogue.rings, surfaceZ);
    const motionAmbient = epilogue.staticView ? 0 : ambient;
    aroma.update(epilogue.aromaTime, surfaceZ, motionAmbient, lowQuality ? AROMA_LOW : AROMA_MAX, projScale);
  }

  return {
    update,
    /* Lo que no debe salir en el reflejo del suelo. */
    reflectionHidden: [rings.mesh, aroma.points, drop],
  };
}
