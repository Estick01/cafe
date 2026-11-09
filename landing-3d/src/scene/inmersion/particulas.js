/*
 * Elementos instanciados de la inmersion, animados enteramente en GPU (el vertex shader calcula
 * posicion y giro de cada instancia a partir de una semilla fija y de uS/uTime: cero trabajo en CPU
 * por fotograma). Granos tostados ligeros, gotas y esferas brillantes, y motas bajo la crema.
 */
import * as THREE from 'three';

import { hash01 } from '../../logic/inmersion.js';
import { GLSL_COMUN, GLSL_SALIDA } from './glsl.js';

/* Grano: elipsoide aplanado por una cara con la hendidura en S; atributo aSurco para oscurecerla. */
export function geometriaGrano(detalle = 1) {
  const base = new THREE.SphereGeometry(0.5, Math.round(36 * detalle), Math.round(26 * detalle));
  const pos = base.attributes.position;
  const surco = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    let x = pos.getX(i) * 0.7;
    let y = pos.getY(i) * 0.5;
    const z = pos.getZ(i);
    if (y < 0) y *= 0.5;
    x += 0.035 * z * z * 4;
    const s = x - 0.05 * Math.sin(z * 8);
    const borde = Math.max(0, 1 - Math.abs(z) / 0.47);
    const g = Math.exp(-((s / 0.04) ** 2)) * Math.min(1, borde * 2.5) * (y < 0.02 ? 1 : 0);
    y += g * 0.075;
    surco[i] = g;
    pos.setXYZ(i, x, y, z);
  }
  base.setAttribute('aSurco', new THREE.BufferAttribute(surco, 1));
  base.computeVertexNormals();
  return base;
}

function semillas(cantidad, canal) {
  const datos = new Float32Array(cantidad * 4);
  for (let i = 0; i < cantidad; i += 1) {
    for (let k = 0; k < 4; k += 1) datos[i * 4 + k] = hash01(i, canal * 4 + k);
  }
  return datos;
}

function instanciar(base, cantidad, canal) {
  const geometria = new THREE.InstancedBufferGeometry().copy(base);
  geometria.instanceCount = cantidad;
  geometria.setAttribute('aSemilla', new THREE.InstancedBufferAttribute(semillas(cantidad, canal), 4));
  return geometria;
}

const ROTACION_EJE = /* glsl */ `
mat3 rotEje(vec3 a, float ang) {
  float c = cos(ang);
  float s = sin(ang);
  float t = 1.0 - c;
  return mat3(
    t * a.x * a.x + c,       t * a.x * a.y + s * a.z, t * a.x * a.z - s * a.y,
    t * a.x * a.y - s * a.z, t * a.y * a.y + c,       t * a.y * a.z + s * a.x,
    t * a.x * a.z + s * a.y, t * a.y * a.z - s * a.x, t * a.z * a.z + c);
}
`;

/* Trayectoria compartida por granos y gotas: orbitas sobre la crema o caida lenta bajo ella. */
const TRAYECTORIA = /* glsl */ `
uniform vec3 uZona;
uniform vec3 uTam;
uniform float uEscala;
attribute vec4 aSemilla;
${ROTACION_EJE}
void trayectoria(vec4 s, out vec3 centro, out float escala, out mat3 giro) {
  vec3 eje = normalize(vec3(s.y - 0.5, s.z - 0.45, s.w - 0.5) + 1e-3);
#ifdef MODO_BAJO
  float k = fract(s.w + uS * 0.3 * (0.6 + s.y) + uTime * 0.006);
  centro = uZona + vec3((s.x - 0.5) * uTam.x, -k * uTam.y, (s.z - 0.5) * uTam.z);
  centro.x += sin(uTime * 0.17 + s.y * 12.0) * 0.05;
  escala = uEscala * (0.75 + 0.5 * s.y) * smoothstep(0.0, 0.07, k) * smoothstep(1.0, 0.88, k);
  float ang = s.x * 20.0 + uS * 2.4 * (0.5 + s.z) + uTime * 0.12;
#else
  float sentido = s.z > 0.5 ? 1.0 : -0.75;
  float a = s.x * 6.2831 + uS * (1.3 + 1.6 * s.y) * sentido + uTime * 0.025;
  float r = uTam.x + s.z * uTam.z;
  float h = 0.1 + s.w * uTam.y;
  centro = uZona + vec3(cos(a) * r, h + 0.15 * sin(a * 2.0 + s.y * 6.0), sin(a) * r);
  escala = uEscala * (0.55 + 0.9 * s.y * s.y);
  float ang = s.x * 30.0 + uS * 6.0 * (0.4 + s.w) + uTime * 0.2;
#endif
  giro = rotEje(eje, ang);
}
`;

const VERTEX_SOLIDO = /* glsl */ `
${GLSL_COMUN}
${TRAYECTORIA}
attribute float aSurco;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vMundo;
varying vec3 vObjeto;
varying float vSurco;
varying vec4 vSemilla;
void main() {
  vec3 centro;
  float escala;
  mat3 giro;
  trayectoria(aSemilla, centro, escala, giro);
  vec3 p = giro * (position * escala) + centro;
  vNormal = normalize(mat3(modelMatrix) * (giro * normal));
  vLocal = p;
  vObjeto = position;
  vSurco = aSurco;
  vSemilla = aSemilla;
  vec4 mundo = modelMatrix * vec4(p, 1.0);
  vMundo = mundo.xyz;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`;

const FRAGMENT_GRANO = /* glsl */ `
${GLSL_COMUN}
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vMundo;
varying vec3 vObjeto;
varying float vSurco;
varying vec4 vSemilla;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vMundo);
  vec3 l = normalize(LUZ_DIR);
  float tono = vSemilla.y;
  vec3 base = mix(vec3(0.085, 0.036, 0.016), vec3(0.2, 0.088, 0.036), tono);
  base *= 0.8 + 0.35 * ruido(vObjeto.xz * 22.0 + vSemilla.x * 40.0);
  base *= 1.0 - vSurco * 0.8;
  float nl = max(dot(n, l), 0.0);
  float espec = pow(max(dot(n, normalize(l + v)), 0.0), 36.0) * 0.55;
  float borde = pow(1.0 - max(dot(n, v), 0.0), 3.0);
#ifdef MODO_BAJO
  float luzSup = smoothstep(-7.0, -0.2, vLocal.y);
  float c = causticas(vLocal.xz * 1.4, uTime * 0.45 + uS * 2.2) * max(n.y, 0.0) * luzSup;
  vec3 color = base * (colorAgua(n) * 1.4 + AGUA_CLARO * (0.5 * max(n.y, 0.0) + 1.3 * c))
    + AGUA_CLARO * (espec * 0.6 + borde * 0.18);
#else
  vec3 color = base * (0.18 + 1.1 * nl * LUZ_COLOR) + LUZ_COLOR * espec + vec3(0.5, 0.3, 0.16) * borde * 0.25;
#endif
  gl_FragColor = vec4(niebla(color, vMundo), 1.0);
  ${GLSL_SALIDA}
}
`;

const FRAGMENT_GOTA = /* glsl */ `
${GLSL_COMUN}
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vMundo;
varying vec3 vObjeto;
varying float vSurco;
varying vec4 vSemilla;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vMundo);
  vec3 l = normalize(LUZ_DIR);
  float ndv = max(dot(n, v), 0.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  vec3 h = normalize(l + v);
  float espec = pow(max(dot(n, h), 0.0), 320.0) * 7.0;
  vec3 h2 = normalize(normalize(vec3(-0.6, 0.5, 0.3)) + v);
  espec += pow(max(dot(n, h2), 0.0), 120.0) * 1.2;
  vec3 refl = reflect(-v, n);
  vec3 entorno = colorAire(refl) * 2.0 + vec3(1.0, 0.8, 0.6) * smoothstep(0.6, 0.95, dot(refl, l)) * 1.5;
  vec3 cuerpo;
  if (vSemilla.y > 0.62) {
    /* Esfera brillante de caramelo. */
    cuerpo = mix(vec3(0.62, 0.32, 0.11), vec3(0.85, 0.55, 0.28), vSemilla.w) * (0.25 + 0.9 * max(dot(n, l), 0.0));
  } else {
    /* Gota de cafe: ambar oscuro con brillo interno opuesto a la luz (transmision fingida). */
    float interno = pow(max(dot(-n, l), 0.0) * (1.0 - ndv * 0.4), 2.0);
    cuerpo = mix(vec3(0.02, 0.008, 0.003), vec3(0.5, 0.2, 0.05), pow(1.0 - ndv, 1.6)) + vec3(1.0, 0.5, 0.15) * interno * 0.9;
  }
  vec3 color = cuerpo * (1.0 - fresnel) + entorno * fresnel + LUZ_COLOR * espec;
  gl_FragColor = vec4(niebla(color, vMundo), 1.0);
  ${GLSL_SALIDA}
}
`;

function materialSolido(nombre, uniforms, defines, fragmentShader, zona) {
  return new THREE.ShaderMaterial({
    name: nombre,
    defines,
    uniforms: {
      ...uniforms,
      uZona: { value: new THREE.Vector3().fromArray(zona.centro) },
      uTam: { value: new THREE.Vector3().fromArray(zona.tam) },
      uEscala: { value: zona.escala },
    },
    vertexShader: VERTEX_SOLIDO,
    fragmentShader,
  });
}

function mallaInstanciada(geometria, material, nombre) {
  const malla = new THREE.Mesh(geometria, material);
  malla.name = nombre;
  malla.frustumCulled = false;
  return malla;
}

/* Motas suspendidas bajo la crema: puntos aditivos con causticas. */
const VERTEX_MOTAS = /* glsl */ `
${GLSL_COMUN}
uniform vec3 uZona;
uniform vec3 uTam;
uniform float uEscalaPx;
attribute vec4 aSemilla;
varying float vBrillo;
varying float vVisible;
void main() {
  vec4 s = aSemilla;
  float k = fract(s.w + uS * 0.06 + uTime * 0.004);
  vec3 p = uZona + vec3((s.x - 0.5) * uTam.x, -k * uTam.y, (s.z - 0.5) * uTam.z);
  p.x += sin(uTime * 0.23 + s.y * 31.0) * 0.06;
  p.z += cos(uTime * 0.19 + s.x * 27.0) * 0.06;
  vec4 mundo = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * mundo;
  float d = -mv.z;
  float c = causticas(p.xz * 1.4, uTime * 0.45 + uS * 2.2) * smoothstep(-6.0, -0.3, p.y);
  vBrillo = (0.25 + 0.9 * c) * (0.4 + s.y);
  vVisible = exp(-DENSIDAD_AGUA * DENSIDAD_AGUA * d * d * 1.6) * smoothstep(0.0, 0.05, k) * smoothstep(1.0, 0.9, k);
  gl_PointSize = clamp((0.006 + 0.014 * s.y * s.y) * uEscalaPx / max(d, 0.05), 1.0, 28.0);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT_MOTAS = /* glsl */ `
${GLSL_COMUN}
varying float vBrillo;
varying float vVisible;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(c));
  gl_FragColor = vec4(AGUA_CLARO * vBrillo * a * vVisible * 0.8, 1.0);
  ${GLSL_SALIDA}
}
`;

function crearMotas(uniforms, defines, cantidad, zona) {
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cantidad * 3), 3));
  geometria.setAttribute('aSemilla', new THREE.BufferAttribute(semillas(cantidad, 9), 4));
  const material = new THREE.ShaderMaterial({
    name: 'inmersion-motas',
    defines,
    uniforms: {
      ...uniforms,
      uZona: { value: new THREE.Vector3().fromArray(zona.centro) },
      uTam: { value: new THREE.Vector3().fromArray(zona.tam) },
      uEscalaPx: { value: 800 },
    },
    vertexShader: VERTEX_MOTAS,
    fragmentShader: FRAGMENT_MOTAS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const puntos = new THREE.Points(geometria, material);
  puntos.name = 'inmersion-motas';
  puntos.frustumCulled = false;
  return puntos;
}

/* Zonas en espacio del grupo (ver CLAVES_CAMARA en logic/inmersion.js). */
const ZONAS = Object.freeze({
  granosArriba: { centro: [0.45, 0, -0.35], tam: [1.0, 2.9, 3.6], escala: 0.16 },
  gotas: { centro: [0.45, 0, -0.35], tam: [0.75, 2.4, 2.6], escala: 0.07 },
  granosAbajo: { centro: [1.6, -0.3, -1.0], tam: [6.5, 5.5, 6.5], escala: 0.2 },
  motas: { centro: [1.4, -0.15, -0.9], tam: [7.0, 5.0, 7.0] },
});

export function createParticulas({ uniforms, defines, quality }) {
  const baja = quality === 'baja';
  const cantidades = baja
    ? { granosArriba: 9, gotas: 26, granosAbajo: 16, motas: 500 }
    : { granosArriba: 18, gotas: 64, granosAbajo: 40, motas: 1600 };
  const baseGrano = geometriaGrano(baja ? 0.7 : 1);
  const baseGota = new THREE.IcosahedronGeometry(1, baja ? 2 : 3);
  baseGota.setAttribute('aSurco', new THREE.BufferAttribute(new Float32Array(baseGota.attributes.position.count), 1));

  const definesBajo = { ...defines, MODO_BAJO: '' };
  const granosArriba = mallaInstanciada(
    instanciar(baseGrano, cantidades.granosArriba, 1),
    materialSolido('inmersion-granos-arriba', uniforms, defines, FRAGMENT_GRANO, ZONAS.granosArriba),
    'inmersion-granos-arriba',
  );
  const gotas = mallaInstanciada(
    instanciar(baseGota, cantidades.gotas, 2),
    materialSolido('inmersion-gotas', uniforms, defines, FRAGMENT_GOTA, ZONAS.gotas),
    'inmersion-gotas',
  );
  const granosAbajo = mallaInstanciada(
    instanciar(baseGrano, cantidades.granosAbajo, 3),
    materialSolido('inmersion-granos-abajo', uniforms, definesBajo, FRAGMENT_GRANO, ZONAS.granosAbajo),
    'inmersion-granos-abajo',
  );
  const motas = crearMotas(uniforms, defines, cantidades.motas, ZONAS.motas);
  baseGrano.dispose();
  baseGota.dispose();

  const mallas = [granosArriba, gotas, granosAbajo, motas];
  return {
    arriba: [granosArriba, gotas],
    abajo: [granosAbajo, motas],
    /* Escala de los puntos: alto del buffer en px / (2 tan(fov/2)). */
    setEscalaPx(valor) {
      motas.material.uniforms.uEscalaPx.value = valor;
    },
    dispose() {
      for (const malla of mallas) {
        malla.geometry.dispose();
        malla.material.dispose();
      }
    },
  };
}
