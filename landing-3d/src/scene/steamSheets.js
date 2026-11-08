/*
 * Vapor: laminas de steam.js con un ruido suave en shader. Nubes lentas y finas, no un chorro.
 * Se mezcla por transparencia normal y no escribe profundidad.
 */
import * as THREE from 'three';

import { STEAM_VERTEX_COUNT, createSteamIndex, writeSteam } from '../logic/steam.js';
import { SHOT_INSIDE, smooth } from '../logic/timeline.js';

/* El plano final mira mas desde arriba y el vapor se ve de canto: necesita algo mas de opacidad. */
const OPACITY_SIDE = 0.34;
const OPACITY_TOP = 0.62;
const RISE_SPEED = 0.012;
const NOISE_DRIFT = 0.08;
const STEAM_COLOR = new THREE.Color().setRGB(0.95, 0.92, 0.87, THREE.LinearSRGBColorSpace);
const STEAM_GLOW = 0.62;

const VERTEX_SHADER = /* glsl */ `
  attribute float aDensity;
  varying float vDensity;
  varying vec3 vLocal;
  void main() {
    vDensity = aDensity;
    vLocal = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDrift;
  uniform float uRise;
  varying float vDensity;
  varying vec3 vLocal;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  void main() {
    if (vDensity < 0.002) discard;
    vec3 p = vec3(vLocal.x, vLocal.y * 0.55 - uRise, vLocal.z) * 58.0 + vec3(0.0, 0.0, uDrift);
    float value = noise(p) * 0.62 + noise(p * 2.1 + 3.7) * 0.28 + noise(p * 4.3 + 7.1) * 0.10;
    float wisps = smoothstep(0.26, 0.72, value);
    float alpha = clamp(vDensity * wisps * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(uColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSteam(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(STEAM_VERTEX_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const densities = new THREE.BufferAttribute(new Float32Array(STEAM_VERTEX_COUNT), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('aDensity', densities);
  geometry.setIndex(new THREE.BufferAttribute(createSteamIndex(), 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: STEAM_COLOR.clone().multiplyScalar(STEAM_GLOW) },
      uOpacity: { value: OPACITY_SIDE },
      uDrift: { value: 0 },
      uRise: { value: 0 },
    },
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.visible = false;
  scene.add(mesh);

  function update(pose, ambientSeconds) {
    mesh.visible = pose.steamAmount > 0.001;
    if (!mesh.visible) return;
    writeSteam(pose, positions.array, densities.array, ambientSeconds);
    positions.needsUpdate = true;
    densities.needsUpdate = true;
    const elapsed = pose.time + ambientSeconds;
    material.uniforms.uDrift.value = elapsed * NOISE_DRIFT * 7;
    material.uniforms.uRise.value = elapsed * RISE_SPEED;
    const overhead = smooth(SHOT_INSIDE[0][2] * 0.5, SHOT_INSIDE[0][2], pose.cameraPosition[2]);
    material.uniforms.uOpacity.value = OPACITY_SIDE + (OPACITY_TOP - OPACITY_SIDE) * overhead;
  }

  return { update, mesh };
}
