/*
 * Motas de aroma: puntos suaves con mezcla aditiva y sin escribir profundidad. Buffers
 * preasignados; en cada fotograma solo se reescriben posicion y alfa (logic/aroma.js).
 */
import * as THREE from 'three';

import { AROMA_MAX, AROMA_NOTES, AROMA_SEEDS, aromaParticle } from '../logic/aroma.js';
import { writeThree } from '../logic/coords.js';

/* Brillo global: un susurro, no fuegos artificiales. */
const INTENSITY = 0.42;

const VERTEX_SHADER = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uProjScale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vAlpha = aAlpha;
    vColor = aColor;
    gl_PointSize = max(1.5, aSize * uProjScale / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uIntensity;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    if (vAlpha < 0.003) discard;
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float core = exp(-r2 * 7.0);
    float halo = exp(-r2 * 2.2) * 0.35;
    gl_FragColor = vec4(vColor * (core + halo) * vAlpha * uIntensity, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createAroma(scene) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(AROMA_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const alphas = new THREE.BufferAttribute(new Float32Array(AROMA_MAX), 1).setUsage(THREE.DynamicDrawUsage);
  const colors = new Float32Array(AROMA_MAX * 3);
  const sizes = new Float32Array(AROMA_MAX);
  const color = new THREE.Color();
  AROMA_SEEDS.forEach((seed, index) => {
    const [r, g, b] = AROMA_NOTES[seed.note].color;
    color.setRGB(r, g, b, THREE.SRGBColorSpace);
    colors.set([color.r, color.g, color.b], index * 3);
    sizes[index] = seed.size;
  });
  geometry.setAttribute('position', positions);
  geometry.setAttribute('aAlpha', alphas);
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.15, 0), 0.5);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProjScale: { value: 1000 },
      uIntensity: { value: INTENSITY },
    },
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'aroma';
  points.frustumCulled = false;
  points.renderOrder = 11;
  points.visible = false;
  scene.add(points);

  /* count: motas activas (menos en calidad baja). projScale: pixeles por metro a 1 m. */
  function update(time, surfaceZ, ambient, count, projScale) {
    points.visible = time > 0;
    if (!points.visible) return;
    const active = Math.min(count, AROMA_MAX);
    for (let index = 0; index < active; index += 1) {
      const particle = aromaParticle(index, time, surfaceZ, ambient);
      const [x, y, z] = particle.position;
      writeThree(positions.array, index * 3, x, y, z);
      alphas.array[index] = particle.alpha;
    }
    geometry.setDrawRange(0, active);
    positions.needsUpdate = true;
    alphas.needsUpdate = true;
    material.uniforms.uProjScale.value = projScale;
  }

  return { update, points };
}
