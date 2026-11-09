/*
 * GLSL compartido de la inmersion: ruido, causticas, agua (niebla por direccion) y luz clave.
 * Todos los materiales leen los mismos uniformes (uS, uTime, uBajo), asi un solo update los mueve.
 */

/* Paleta lineal: arriba (aire sobre la crema) y abajo (cafe iluminado desde la superficie). */
export const PALETA = Object.freeze({
  aireOscuro: [0.012, 0.007, 0.004],
  aireCalido: [0.11, 0.05, 0.018],
  aguaHondo: [0.035, 0.012, 0.004],
  aguaMedio: [0.36, 0.15, 0.035],
  aguaClaro: [1.05, 0.62, 0.22],
});

/* Densidad de la niebla bajo la crema (formula exp2, igual que THREE.FogExp2). */
export const DENSIDAD_AGUA = 0.16;
export const DENSIDAD_AIRE = 0.035;

const vec3 = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(', ')})`;

export const GLSL_COMUN = /* glsl */ `
uniform float uS;
uniform float uTime;
uniform float uBajo;

#ifdef CALIDAD_BAJA
  #define OCTAVAS 3
#else
  #define OCTAVAS 5
#endif

const vec3 AIRE_OSCURO = ${vec3(PALETA.aireOscuro)};
const vec3 AIRE_CALIDO = ${vec3(PALETA.aireCalido)};
const vec3 AGUA_HONDO = ${vec3(PALETA.aguaHondo)};
const vec3 AGUA_MEDIO = ${vec3(PALETA.aguaMedio)};
const vec3 AGUA_CLARO = ${vec3(PALETA.aguaClaro)};
const vec3 LUZ_DIR = vec3(0.42, 0.78, 0.46);
const vec3 LUZ_COLOR = vec3(1.0, 0.86, 0.68);
const float DENSIDAD_AGUA = ${DENSIDAD_AGUA.toFixed(4)};
const float DENSIDAD_AIRE = ${DENSIDAD_AIRE.toFixed(4)};

/* Hash sin seno (estable en GPU moviles). */
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

/* Ruido de valor suavizado (quintico) y fbm con rotacion entre octavas. */
float ruido(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < OCTAVAS; i++) {
    v += a * ruido(p);
    p = r * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}
mat2 rot2(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

/* Distancia al borde de celda (F2 - F1) con puntos animados: base de las causticas. */
float bordeCelda(vec2 p, float t) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash22(i + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
/* Red brillante de causticas en el plano xz; 0..~1.5. */
float causticas(vec2 p, float t) {
  float a = bordeCelda(p * 1.6, t);
  float b = bordeCelda(p * 2.3 + vec2(3.1, 1.7), t * 1.21 + 2.0);
  float e = min(a, b);
  return pow(1.0 - smoothstep(0.0, 0.32, e), 4.0) * 1.5;
}

/* Color del cafe en una direccion de vista (de abajo hacia arriba: hondo -> dorado). */
vec3 colorAgua(vec3 dir) {
  vec3 c = mix(AGUA_HONDO, AGUA_MEDIO, smoothstep(-0.75, 0.15, dir.y));
  return mix(c, AGUA_CLARO, smoothstep(0.25, 1.0, dir.y));
}
vec3 colorAire(vec3 dir) {
  return mix(AIRE_OSCURO, AIRE_CALIDO, smoothstep(-0.1, 0.5, dir.y) * 0.9);
}
/* Niebla exp2 dependiente del lado de la superficie donde esta la camara. */
vec3 niebla(vec3 color, vec3 posMundo) {
  vec3 v = posMundo - cameraPosition;
  float d = length(v);
  vec3 dir = v / max(d, 1e-4);
  float dens = mix(DENSIDAD_AIRE, DENSIDAD_AGUA, uBajo);
  float f = 1.0 - exp(-dens * dens * d * d);
  return mix(color, mix(colorAire(dir), colorAgua(dir), uBajo), f);
}
`;

/* Salida comun: tone mapping solo cuando three lo aplica a pantalla, y espacio de color. */
export const GLSL_SALIDA = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
