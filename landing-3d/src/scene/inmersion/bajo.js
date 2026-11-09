/*
 * Fondo envolvente (aire oscuro sobre la crema / cafe dorado bajo ella, con rayos angulares) y
 * haces de luz volumetricos baratos: conos aditivos que bajan desde la superficie.
 */
import * as THREE from 'three';

import { GLSL_COMUN, GLSL_SALIDA } from './glsl.js';
import { PALABRA_CREMA } from '../../logic/inmersion.js';

const VERTEX_MUNDO = /* glsl */ `
varying vec3 vMundo;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec2 vUv;
varying float vSemillaRayo;
void main() {
  vUv = uv;
  vLocal = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vSemillaRayo = fract(modelMatrix[3].x * 3.17 + modelMatrix[3].z * 1.71);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vMundo = mundo.xyz;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`;

const FRAGMENT_FONDO = /* glsl */ `
${GLSL_COMUN}
uniform vec3 uHalo;
varying vec3 vMundo;
void main() {
  vec3 dir = normalize(vMundo - cameraPosition);
  vec3 aire = colorAire(dir) + vec3(0.22, 0.1, 0.04) * pow(max(dot(dir, uHalo), 0.0), 5.0);
  vec3 agua = colorAgua(dir);
  float phi = atan(dir.z, dir.x);
  float rayos = fbm(vec2(phi * 7.0 + uS * 0.5, uTime * 0.025 + dir.y * 0.4));
  rayos = smoothstep(0.42, 0.85, rayos) * smoothstep(-0.05, 0.85, dir.y);
  agua += AGUA_CLARO * rayos * 0.55;
  gl_FragColor = vec4(mix(aire, agua, uBajo), 1.0);
  ${GLSL_SALIDA}
}
`;

const FRAGMENT_RAYO = /* glsl */ `
${GLSL_COMUN}
uniform float uIntensidad;
varying vec3 vMundo;
varying vec3 vNormal;
varying vec2 vUv;
varying float vSemillaRayo;
void main() {
  vec3 v = normalize(cameraPosition - vMundo);
  float frente = pow(abs(dot(normalize(vNormal), v)), 2.2);
  float largo = smoothstep(1.0, 0.93, vUv.y) * pow(vUv.y, 1.3);
  float parpadeo = 0.55 + 0.45 * ruido(vec2(vSemillaRayo * 37.0, uTime * 0.35 + uS * 1.8));
  float d = length(vMundo - cameraPosition);
  float cerca = smoothstep(0.15, 0.9, d) * exp(-DENSIDAD_AGUA * DENSIDAD_AGUA * d * d * 0.8);
  float a = frente * largo * parpadeo * cerca * uIntensidad * uBajo;
  gl_FragColor = vec4(AGUA_CLARO * a, 1.0);
  ${GLSL_SALIDA}
}
`;

/* Haces: posicion xz, radio inferior, largo (espacio del grupo, cerca del recorrido bajo la crema). */
const HACES = Object.freeze([
  [0.2, -2.2, 0.55, 6.5], [1.9, -1.6, 0.8, 7.5], [3.1, -2.9, 0.6, 6.0], [0.9, -3.8, 0.9, 7.0],
  [2.6, 0.2, 0.7, 6.5], [-0.8, -0.6, 0.5, 5.5], [4.2, -1.1, 0.75, 7.0], [1.4, 0.9, 0.5, 6.0],
]);

export function createBajo({ uniforms, defines, quality }) {
  const fondo = new THREE.Mesh(
    new THREE.SphereGeometry(60, 48, 24),
    new THREE.ShaderMaterial({
      name: 'inmersion-fondo',
      defines,
      uniforms: {
        ...uniforms,
        uHalo: { value: new THREE.Vector3(-Math.sin(PALABRA_CREMA.yaw), 0.12, -Math.cos(PALABRA_CREMA.yaw)).normalize() },
      },
      vertexShader: VERTEX_MUNDO,
      fragmentShader: FRAGMENT_FONDO,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  fondo.name = 'inmersion-fondo';
  fondo.renderOrder = -10;
  fondo.frustumCulled = false;

  const haces = quality === 'baja' ? HACES.slice(0, 5) : HACES;
  const geometriaRayo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
  geometriaRayo.translate(0, -0.5, 0);
  const materialRayo = new THREE.ShaderMaterial({
    name: 'inmersion-rayos',
    defines,
    uniforms: { ...uniforms, uIntensidad: { value: 0.32 } },
    vertexShader: VERTEX_MUNDO,
    fragmentShader: FRAGMENT_RAYO,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const rayos = new THREE.Group();
  rayos.name = 'inmersion-rayos';
  for (const [x, z, radio, largo] of haces) {
    /* Cono: estrecho arriba (radio 0.12) y ancho abajo; inclinado como un sol bajo. */
    const geometria = geometriaRayo;
    const rayo = new THREE.Mesh(geometria, materialRayo);
    rayo.position.set(x, 0, z);
    rayo.scale.set(radio, largo, radio);
    rayo.rotation.set(-0.16, 0, 0.22);
    rayo.frustumCulled = false;
    rayos.add(rayo);
  }
  /* El cono es un cilindro escalado: estrechar la tapa superior en la geometria compartida. */
  const pos = geometriaRayo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const k = 0.12 + 0.88 * -pos.getY(i);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  geometriaRayo.computeVertexNormals();

  return {
    fondo,
    rayos,
    dispose() {
      fondo.geometry.dispose();
      fondo.material.dispose();
      geometriaRayo.dispose();
      materialRayo.dispose();
    },
  };
}
