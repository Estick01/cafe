/*
 * Superficie de crema: disco grande con remolino procedural (flujo con dominio deformado, bandas
 * "tiger-stripe" advectadas en espiral, burbujas finas y brillo especular). Vista desde abajo es
 * el techo dorado del cafe con la ventana de Snell. Incluye la palabra gigante CREMA en contorno.
 */
import * as THREE from 'three';

import { PALABRA_CREMA } from '../../logic/inmersion.js';
import { GLSL_COMUN, GLSL_SALIDA } from './glsl.js';

const RADIO_SUPERFICIE = 42;

const VERTEX = /* glsl */ `
varying vec3 vLocal;
varying vec3 vMundo;
void main() {
  vLocal = position;
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vMundo = mundo.xyz;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`;

const FRAGMENT = /* glsl */ `
${GLSL_COMUN}
varying vec3 vLocal;
varying vec3 vMundo;

/* Burbujas: celdas con circulos de radio aleatorio. x = anillo, y = cupula, z = destello. */
vec3 burbujas(vec2 p, float escala, float densidad) {
  vec2 q = p * escala;
  vec2 i = floor(q);
  vec2 f = fract(q) - 0.5;
  vec2 h = hash22(i);
  float radio = mix(0.12, 0.38, h.x) * step(1.0 - densidad, h.y);
  vec2 c = (h - 0.5) * (0.9 - 2.0 * radio);
  float d = length(f - c);
  float aa = fwidth(q.x) * 1.2 + 1e-4;
  float dentro = 1.0 - smoothstep(radio - aa, radio + aa, d);
  float anillo = dentro * smoothstep(radio * 0.55, radio, d);
  float cupula = dentro * sqrt(max(0.0, 1.0 - (d * d) / max(radio * radio, 1e-4)));
  float destello = dentro * (1.0 - smoothstep(0.0, radio * 0.35, length(f - c - vec2(-0.3, 0.3) * radio)));
  float desvanecer = 1.0 - smoothstep(0.25, 0.7, aa);
  return vec3(anillo, cupula, destello) * desvanecer;
}

void main() {
  vec2 p = vLocal.xz;
  float r = length(p);
  float fase = uS * 2.6 + uTime * 0.035;
  /* Rotacion diferencial: el centro gira mas que el borde -> espiral que se enrosca con el scroll. */
  vec2 q = rot2(fase * 1.4 / (0.35 + r * 0.55)) * p;
  vec2 w = vec2(fbm(q * 0.85 + vec2(1.7, 9.2)), fbm(q * 0.85 + vec2(8.3, 2.8)));
  vec2 qw = q + (w - 0.5) * 1.5;
  float th = atan(qw.y, qw.x);
  float lr = log(length(qw) + 0.06);
  float f = fbm(qw * 2.1 + w * 2.2);
  float espiral = th * 2.0 + lr * 3.6 + f * 5.5 + r * 1.6;
  float tigre = sin(espiral);
  float bandas = smoothstep(-0.15, 0.75, tigre);
  float vetas = smoothstep(0.62, 0.92, sin(espiral * 3.0 + f * 9.0)) * bandas;
  float motas = smoothstep(0.52, 0.78, fbm(qw * 6.5 + f * 3.0));

  vec3 oscuro = vec3(0.075, 0.03, 0.012);
  vec3 caramelo = vec3(0.42, 0.18, 0.055);
  vec3 dorado = vec3(0.78, 0.43, 0.15);
  vec3 espuma = vec3(0.96, 0.72, 0.42);
  vec3 color = mix(dorado, caramelo, bandas);
  color = mix(color, oscuro, clamp(vetas * 0.85 + motas * bandas * 0.55, 0.0, 1.0));
  color = mix(color, espuma, smoothstep(-0.55, -0.95, tigre) * 0.7 * (1.0 - motas));
  /* Mas oscuro hacia el borde de la taza imaginaria, mas claro en el corazon del remolino. */
  color *= mix(1.12, 0.7, smoothstep(0.5, 6.0, r));

  float altura = bandas * 0.012 + vetas * 0.006;
  vec3 b1 = burbujas(qw, 9.0, 0.35);
  vec3 b2 = burbujas(qw + 7.3, 23.0, 0.55);
#ifndef CALIDAD_BAJA
  vec3 b3 = burbujas(qw + 3.1, 61.0, 0.7);
#else
  vec3 b3 = vec3(0.0);
#endif
  altura += b1.y * 0.02 + b2.y * 0.009 + b3.y * 0.004;
  color = mix(color, color * 0.55, clamp(b1.x + b2.x * 0.8 + b3.x * 0.6, 0.0, 1.0));

  vec3 v = normalize(cameraPosition - vMundo);
  if (!gl_FrontFacing) {
    /* Desde abajo: techo dorado, el remolino se adivina como luz filtrada; fuera de la ventana de
       Snell (rasante) la superficie refleja el fondo oscuro. */
    float arriba = clamp(-v.y, 0.0, 1.0);
    float snell = smoothstep(0.55, 0.85, arriba);
    vec3 luz = AGUA_CLARO * (1.25 + 0.6 * (1.0 - bandas)) + vec3(0.6, 0.38, 0.12) * causticas(p * 0.8, uTime * 0.4 + uS * 3.0);
    vec3 techo = mix(colorAgua(vec3(0.0, -0.2, 0.0)) * 1.6, luz, snell);
    techo *= 0.75 + 0.25 * ruido(qw * 3.0);
    gl_FragColor = vec4(niebla(techo, vMundo), 1.0);
    ${GLSL_SALIDA}
    return;
  }

  /* Normal por derivadas de pantalla (sin evaluar el ruido mas veces). */
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 dpx = dFdx(vMundo);
  vec3 dpy = dFdy(vMundo);
  float dhx = dFdx(altura);
  float dhy = dFdy(altura);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  n = normalize(abs(det) * n - grad * 1.6);

  vec3 l = normalize(LUZ_DIR);
  float nl = max(dot(n, l), 0.0);
  vec3 h = normalize(l + v);
  float espec = pow(max(dot(n, h), 0.0), 140.0) * 2.4;
  float fresnel = 0.035 + 0.965 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 refl = reflect(-v, n);
  vec3 entorno = mix(vec3(0.05, 0.03, 0.02), vec3(1.1, 0.88, 0.66), smoothstep(0.55, 0.98, dot(refl, l)));
  vec3 difusa = color * (0.38 + 0.85 * nl);
  vec3 brillo = LUZ_COLOR * espec * (0.3 + b1.z * 3.0 + b2.z * 1.5 + b3.z) + entorno * fresnel * 0.9;
  vec3 final = difusa + brillo + LUZ_COLOR * (b1.z * 0.5 + b2.z * 0.25) * nl;
  gl_FragColor = vec4(niebla(final, vMundo), 1.0);
  ${GLSL_SALIDA}
}
`;

function crearSuperficie(uniforms, defines) {
  const geometria = new THREE.CircleGeometry(RADIO_SUPERFICIE, 96);
  geometria.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    name: 'inmersion-crema', uniforms, defines, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
  });
  const malla = new THREE.Mesh(geometria, material);
  malla.name = 'inmersion-superficie';
  malla.renderOrder = -1;
  return malla;
}

/* Textura de la palabra en contorno (trazo, sin relleno) dibujada una sola vez. */
function texturaPalabra(texto, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 560;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '900 470px Impact, "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '18px';
  const ancho = ctx.measureText(texto).width;
  if (ancho > canvas.width * 0.96) {
    const escala = (canvas.width * 0.96) / ancho;
    ctx.setTransform(escala, 0, 0, 1, canvas.width * (1 - escala) * 0.5, 0);
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.strokeText(texto, canvas.width / 2, canvas.height / 2 + 18);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.anisotropy = 4;
  return textura;
}

const VERTEX_PALABRA = /* glsl */ `
varying vec2 vUv;
varying vec3 vMundo;
void main() {
  vUv = uv;
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vMundo = mundo.xyz;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`;

const FRAGMENT_PALABRA = /* glsl */ `
${GLSL_COMUN}
uniform sampler2D uMapa;
varying vec2 vUv;
varying vec3 vMundo;
void main() {
  vec4 t = texture2D(uMapa, vUv);
  if (t.a < 0.02) discard;
  vec3 color = t.rgb * 1.35;
  gl_FragColor = vec4(niebla(color, vMundo), t.a * 0.9);
  ${GLSL_SALIDA}
}
`;

function crearPalabra(uniforms, color) {
  const mapa = texturaPalabra('CREMA', color);
  const alto = PALABRA_CREMA.ancho * (560 / 2048);
  const geometria = new THREE.PlaneGeometry(PALABRA_CREMA.ancho, alto);
  const material = new THREE.ShaderMaterial({
    name: 'inmersion-palabra',
    uniforms: { ...uniforms, uMapa: { value: mapa } },
    vertexShader: VERTEX_PALABRA,
    fragmentShader: FRAGMENT_PALABRA,
    transparent: true,
    depthWrite: false,
  });
  const malla = new THREE.Mesh(geometria, material);
  malla.name = 'inmersion-palabra-crema';
  malla.position.set(PALABRA_CREMA.x, PALABRA_CREMA.y, PALABRA_CREMA.z);
  malla.rotation.set(0, PALABRA_CREMA.yaw, 0);
  return { malla, mapa };
}

export function createCrema({ uniforms, defines, marca }) {
  const superficie = crearSuperficie(uniforms, defines);
  const palabra = crearPalabra(uniforms, marca?.colores?.crema ?? '#f4f1ec');
  return {
    superficie,
    palabra: palabra.malla,
    dispose() {
      superficie.geometry.dispose();
      superficie.material.dispose();
      palabra.malla.geometry.dispose();
      palabra.malla.material.dispose();
      palabra.mapa.dispose();
    },
  };
}
