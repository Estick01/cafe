/*
 * Chorro, cinta, charco, superficie del cafe y gotas. Cada malla reutiliza un BufferGeometry
 * preasignado: en cada fotograma solo se reescriben posiciones, normales y uniformes.
 * Las ondas, la crema y las gotas son funciones puras del tiempo del scroll.
 */
import * as THREE from 'three';

import {
  DISC_VERTEX_COUNT, MAX_TUBE_POINTS, RING_SIDES, coffeeDiscParams, createDiscIndex, createTubeIndex,
  poolDiscParams, pourPath, tubeIndexCount, writeDisc, writeTube,
} from '../logic/liquid.js';
import { SLOSH, modeFrequency } from '../logic/slosh.js';
import { BEAN_LANDING, IMPACT_WINDOWS, SLOSH_EVENTS, TAIL_LANDINGS } from '../logic/splash.js';
import { smooth } from '../logic/timeline.js';
import { createCoffeeMaterial, createStreamMaterial } from './coffeeMaterials.js';
import { refineSurface, refineStream } from './liquidSurface.js';
import { createSplashes } from './splashes.js';
import { createWetWall } from './wetWall.js';

/* Lo bastante grande para no recalcular volumenes cada fotograma ni que se recorte al moverse. */
const SCENE_BOUNDS = new THREE.Sphere(new THREE.Vector3(0, 0.2, 0), 0.6);
/* La crema se forma mientras entra el chorro y despues sigue girando despacio (rad/s). */
const CREMA = Object.freeze({ start: 5.0, full: 8.8, swirl: 0.3 });

function dynamicGeometry(vertexCount, index) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normals = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('normal', normals);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = SCENE_BOUNDS;
  return geometry;
}

function markWritten(geometry, usedVertices) {
  for (const attribute of [geometry.attributes.position, geometry.attributes.normal]) {
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, usedVertices * 3);
    attribute.needsUpdate = true;
  }
}

function createDisc(material) {
  const mesh = new THREE.Mesh(dynamicGeometry(DISC_VERTEX_COUNT, createDiscIndex()), material);
  mesh.receiveShadow = true;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

function updateDisc(mesh, params, kind) {
  mesh.visible = params !== null;
  if (!params) return;
  // Disco plano: las ondas las pone el shader. params es un objeto nuevo de cada fotograma.
  params.ripple = 0;
  const { position, normal } = mesh.geometry.attributes;
  writeDisc(params, position.array, normal.array);
  refineSurface(params, position.array, normal.array, kind);
  markWritten(mesh.geometry, DISC_VERTEX_COUNT);
}

/* Uniformes comunes de una superficie; el punto de impacto llega en ejes de Blender. */
function setSurface(uniforms, params, time, window, impactX, impactY) {
  uniforms.uCafeRadius.value = params.radius;
  uniforms.uCafeTime.value = time;
  uniforms.uCafeImpact.value.set(impactX, -impactY);
  uniforms.uCafePour.value.set(window.start, window.end);
}

/*
 * Calidad adaptativa: si app.js ha bajado la resolucion por fotogramas lentos, se usa la version
 * barata (menos ondas, sin brillo del chorro, menos gotas). Se lee del propio renderizador.
 */
function createQualityProbe() {
  const state = { maxRatio: 0, cheap: false };
  const probe = (renderer) => {
    const ratio = renderer.getPixelRatio();
    if (ratio > state.maxRatio) state.maxRatio = ratio;
    state.cheap = ratio < state.maxRatio - 0.01;
  };
  return { state, probe };
}

export function createLiquids(scene) {
  const streamMaterial = createStreamMaterial();
  const stream = new THREE.Mesh(dynamicGeometry(MAX_TUBE_POINTS * RING_SIDES, createTubeIndex()), streamMaterial);
  stream.castShadow = true;
  stream.receiveShadow = true;
  stream.frustumCulled = false;
  stream.visible = false;

  const poolMaterial = createCoffeeMaterial('pool');
  const pool = createDisc(poolMaterial);
  const coffeeMaterial = createCoffeeMaterial('cup');
  const coffee = createDisc(coffeeMaterial);
  const splashes = createSplashes(scene);
  const wetWall = createWetWall(scene);
  scene.add(stream, pool, coffee);

  const coffeeUniforms = coffeeMaterial.userData.uniforms;
  const poolUniforms = poolMaterial.userData.uniforms;
  const streamUniforms = streamMaterial.userData.uniforms;
  [BEAN_LANDING, ...TAIL_LANDINGS].forEach((drop, index) => {
    coffeeUniforms.uCafeDrops.value[index]?.set(drop.x, drop.z, drop.time, drop.amplitude);
  });
  SLOSH_EVENTS.forEach((event, index) => {
    coffeeUniforms.uSlosh.value[index].set(event.x, event.z, event.time, event.amplitude);
  });

  const quality = createQualityProbe();
  [stream, pool, coffee].forEach((mesh) => { mesh.onBeforeRender = quality.probe; });

  function updateStream(pose) {
    const { position, normal } = stream.geometry.attributes;
    const points = refineStream(pourPath(pose), pose);
    const rings = writeTube(points, position.array, normal.array);
    stream.visible = rings > 1;
    if (!stream.visible) return;
    stream.geometry.setDrawRange(0, tubeIndexCount(rings));
    markWritten(stream.geometry, rings * RING_SIDES);
  }

  function update(pose) {
    const { time } = pose;
    const cheapValue = quality.state.cheap ? 0 : 1;
    streamUniforms.uCafeTime.value = time;
    streamUniforms.uCafeQuality.value = cheapValue;
    updateStream(pose);

    const poolParams = poolDiscParams(pose);
    updateDisc(pool, poolParams, 'pool');
    if (poolParams) {
      setSurface(poolUniforms, poolParams, time, IMPACT_WINDOWS[0], 0, 0);
      poolUniforms.uCafeQuality.value = cheapValue;
    }

    const coffeeParams = coffeeDiscParams(pose);
    updateDisc(coffee, coffeeParams, 'cup');
    if (coffeeParams) {
      setSurface(coffeeUniforms, coffeeParams, time, IMPACT_WINDOWS[1], pose.pourX, pose.pourY);
      coffeeUniforms.uCafeQuality.value = cheapValue;
      coffeeUniforms.uCafeCrema.value = smooth(CREMA.start, CREMA.full, time);
      coffeeUniforms.uCafeSwirl.value = CREMA.swirl * Math.max(0, time - CREMA.start);
      // Frecuencias de los modos del recipiente para el radio de la superficie en este instante.
      coffeeUniforms.uSloshFreq.value.set(
        modeFrequency(SLOSH.k01, coffeeParams.radius),
        modeFrequency(SLOSH.k11, coffeeParams.radius),
      );
    }
    wetWall.update(pose);

    splashes.update(pose, quality.state.cheap);
  }

  return { update };
}
