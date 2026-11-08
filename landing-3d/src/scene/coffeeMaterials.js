/*
 * Materiales del cafe: superficie de la taza, charco del platillo, chorro/cinta y gotas.
 *
 * Base fisica de Three (Fresnel de un dielectrico con ior 1.333 contra el entorno PMREM) con
 * parches de shader baratos:
 *   - tinte por profundidad: centro casi negro y un rojizo calido solo donde la capa es fina;
 *   - ondas analiticas de logic/ripples.js aplicadas como perturbacion de la normal por pixel;
 *   - crema tenue y de bajo contraste que se forma con el chorro y gira despacio;
 *   - oclusion especular junto a la pared, que evita la banda gris del fondo.
 * Todo depende del tiempo del scroll: el mismo instante da la misma imagen.
 */
import * as THREE from 'three';

import { AMBIENT, DROP_RING, RIPPLE, SKIRT } from '../logic/ripples.js';
import { BESSEL, SLOSH } from '../logic/slosh.js';

const linear = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const f = (value) => {
  const text = Number(value).toPrecision(7);
  return text.includes('.') || text.includes('e') ? text : `${text}.0`;
};
const vec3 = (color) => `vec3(${f(color.r)}, ${f(color.g)}, ${f(color.b)})`;

const COFFEE = Object.freeze({
  deep: linear(0.0032, 0.0012, 0.00045),
  rim: linear(0.05, 0.016, 0.0042),
  poolBody: linear(0.012, 0.0039, 0.0012),
  glow: linear(0.004, 0.0012, 0.0003),
  crema: linear(0.036, 0.017, 0.0065),
  stream: linear(0.0085, 0.0025, 0.0007),
  streamGlow: linear(0.05, 0.0135, 0.0026),
});


const SURFACE = Object.freeze({
  roughness: 0.045,
  envMapIntensity: 2.4,
  /* Escala en metros de la capa fina junto a la pared y en el borde del charco. */
  thinCup: 0.0022,
  thinPool: 0.0045,
  /* Distancia a la pared en la que la propia taza tapa el reflejo del estudio. */
  occlusion: 0.011,
  occlusionFloor: 0.22,
  cremaMax: 0.32,
  cremaRoughness: 0.32,
  swirl: 0.32,
});

/*
 * Chorro: vetas alargadas en la direccion de caida (escala vertical menor que la horizontal) que
 * bajan con el flujo y giran con la altura, para que el brillo se enrosque. Una segunda capa mas
 * fina y rapida da el brillo estirado por la velocidad.
 */
const STREAM = Object.freeze({
  roughness: 0.045,
  envMapIntensity: 2.0,
  across: 200,
  along: 30,
  speed: 7,
  twist: 14,
  spin: 1.5,
  shimmerSpeed: 16,
  strength: 0.07,
  epsilon: 0.0008,
  glowPower: 2.5,
});

const NOISE_GLSL = /* glsl */ `
  float cafeHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float cafeNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    return mix(mix(cafeHash(i), cafeHash(i + vec2(1, 0)), u.x),
               mix(cafeHash(i + vec2(0, 1)), cafeHash(i + vec2(1, 1)), u.x), u.y);
  }
  float cafeFbm(vec2 p) {
    return cafeNoise(p) * 0.55 + cafeNoise(p * 2.3 + 11.0) * 0.3 + cafeNoise(p * 5.1 + 23.0) * 0.15;
  }
`;

const NOISE3_GLSL = /* glsl */ `
  float cafeHash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float cafeNoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 u = fract(p);
    u = u * u * (3.0 - 2.0 * u);
    return mix(
      mix(mix(cafeHash3(i), cafeHash3(i + vec3(1, 0, 0)), u.x), mix(cafeHash3(i + vec3(0, 1, 0)), cafeHash3(i + vec3(1, 1, 0)), u.x), u.y),
      mix(mix(cafeHash3(i + vec3(0, 0, 1)), cafeHash3(i + vec3(1, 0, 1)), u.x), mix(cafeHash3(i + vec3(0, 1, 1)), cafeHash3(i + vec3(1, 1, 1)), u.x), u.y),
      u.z);
  }
`;

/* Pendiente de las ondas: derivada analitica de logic/ripples.js (sin la de la envolvente). */
function rippleGlsl() {
  const [w0, w1, w2] = RIPPLE.waves;
  const wave = ([k, omega, weight]) => `${f(weight * k)} * cos(${f(k)} * rr - ${f(omega)} * uCafeTime)`;
  const lobes = RIPPLE.lobes.map(([order, weight, phase]) => `${f(weight)} * sin(${f(order)} * angle + ${f(phase)})`).join(' + ');
  const ambient = AMBIENT.trains.map(([dx, dz, k, omega]) => `
      slope += vec2(${f(dx)}, ${f(dz)}) * ${f(AMBIENT.amplitude * k)} * cos(${f(k)} * dot(vec2(${f(dx)}, ${f(dz)}), p) + ${f(omega)} * uCafeTime);`).join('');
  return /* glsl */ `
  float cafeEnvelope(float t) {
    return smoothstep(uCafePour.x, uCafePour.x + ${f(RIPPLE.fadeIn)}, t)
      * (1.0 - smoothstep(uCafePour.y - ${f(RIPPLE.fadeOut)}, uCafePour.y, t));
  }
  vec2 cafeRippleSlope(vec2 p) {
    vec2 slope = vec2(0.0);
    vec2 d = p - uCafeImpact;
    float r = length(d);
    float envelope = uCafePour.y > uCafePour.x ? cafeEnvelope(uCafeTime - r / ${f(RIPPLE.speed)}) : 0.0;
    if (envelope > 0.0) {
      float rr = sqrt(r * r + ${f(RIPPLE.core * RIPPLE.core)});
      float angle = atan(d.y, d.x + 1e-7);
      float base = ${f(RIPPLE.amplitude)} * envelope * exp(-${f(RIPPLE.decay)} * r) * (1.0 + ${lobes});
      float dr = ${wave(w0)};
      if (uCafeQuality > 0.5) dr += ${wave(w1)} + ${wave(w2)};
      slope += d / rr * base * dr;
    }
    if (uCafePour.y > uCafePour.x) {
      // Falda del chorro: anillo levantado alrededor del impacto mientras entra el cafe.
      float skirtR = (r - ${f(SKIRT.radius)}) / ${f(SKIRT.width)};
      float skirt = ${f(SKIRT.amplitude)} * cafeEnvelope(uCafeTime) * exp(-skirtR * skirtR);
      slope += d / max(r, 1e-5) * skirt * (-2.0 * skirtR / ${f(SKIRT.width)});
    }
    ${ambient}
    for (int i = 0; i < ${DROP_RING.maxDrops}; i++) {
      vec4 drop = uCafeDrops[i];
      float age = uCafeTime - drop.z;
      if (drop.w <= 0.0 || age <= 0.0) continue;
      vec2 dd = p - drop.xy;
      float dist = length(dd);
      float s = dist - ${f(DROP_RING.speed)} * age;
      float packet = exp(-(s * s) / ${f(DROP_RING.width ** 2)}) * exp(-${f(DROP_RING.damping)} * age);
      slope += dd / max(dist, 1e-5) * ${f(DROP_RING.amplitude * DROP_RING.wavenumber)} * drop.w * packet * cos(${f(DROP_RING.wavenumber)} * s);
    }
    return slope;
  }
`;
}

/* Polinomio de Horner en y = (x/2)^2 con los coeficientes de logic/slosh.js. */
const horner = (coefficients) => coefficients.reduceRight((inner, c) => (inner ? `(${f(c)} + y * ${inner})` : f(c)), '');

/*
 * Oleaje (logic/slosh.js): modos (0,1) y (1,1) del recipiente con su gradiente analitico,
 * abultamiento e inclinacion bajo el chorro y ondas del impacto reflejadas en la pared.
 */
function sloshGlsl() {
  const [k, omega, weight] = RIPPLE.waves[0];
  return /* glsl */ `
  float cafeJ0(float x) { float y = 0.25 * x * x; return ${horner(BESSEL.j0)}; }
  float cafeG(float x) { float y = 0.25 * x * x; return ${horner(BESSEL.g)}; }
  float cafeH(float x) { float y = 0.25 * x * x; return ${horner(BESSEL.h)}; }
  // Gradiente de G(K r) * K * (p . u), con u unitario.
  vec2 cafeTiltSlope(vec2 p, vec2 u, float K) {
    float x = K * length(p);
    return K * (cafeG(x) * u + dot(p, u) * cafeH(x) * K * K * p);
  }
  vec2 cafeSloshSlope(vec2 p) {
    vec2 slope = vec2(0.0);
    float k01 = ${f(SLOSH.k01)} / uCafeRadius;
    float k11 = ${f(SLOSH.k11)} / uCafeRadius;
    for (int i = 0; i < ${SLOSH.maxEvents}; i++) {
      vec4 e = uSlosh[i];
      float age = uCafeTime - e.z;
      if (e.w <= 0.0 || age <= 0.0) continue;
      float envelope = e.w * exp(-age / ${f(SLOSH.decay)});
      float offset = length(e.xy);
      float tilt = min(1.0, offset / (0.6 * uCafeRadius));
      // J0'(x) = -x G(x): gradiente de J0(k r) = -G(k r) k^2 p.
      slope += envelope * (1.0 - 0.6 * tilt) * sin(uSloshFreq.x * age) * (-cafeG(k01 * length(p)) * k01 * k01 * p);
      if (offset > 1e-6) slope += envelope * tilt * sin(uSloshFreq.y * age) * cafeTiltSlope(p, e.xy / offset, k11);
    }
    if (uCafePour.y > uCafePour.x) {
      float pour = cafeEnvelope(uCafeTime);
      vec2 d = p - uCafeImpact;
      slope += pour * ${f(SLOSH.bulge)} * exp(-dot(d, d) / ${f(SLOSH.bulgeRadius ** 2)}) * (-2.0 / ${f(SLOSH.bulgeRadius ** 2)}) * d;
      float offset = length(uCafeImpact);
      if (offset > 1e-6) slope += pour * ${f(SLOSH.tilt)} * cafeTiltSlope(p, uCafeImpact / offset, k11);
      if (uCafeQuality > 0.5 && offset > 1e-6) {
        // Fuente imagen: el impacto reflejado en la pared (inversion en el circulo).
        vec2 image = uCafeImpact * (uCafeRadius * uCafeRadius) / (offset * offset);
        vec2 di = p - image;
        float distance = length(di);
        float envelope = cafeEnvelope(uCafeTime - distance / ${f(RIPPLE.speed)});
        slope += di / max(distance, 1e-5) * ${f(SLOSH.reflection * RIPPLE.amplitude * weight * k)} * envelope
          * exp(-${f(RIPPLE.decay)} * distance) * cos(${f(k)} * distance - ${f(omega)} * uCafeTime);
      }
    }
    return slope;
  }
`;
}

function createSurfaceUniforms(isCup) {
  return {
    uCafeRadius: { value: 0.04 },
    uCafeTime: { value: 0 },
    uCafeCrema: { value: 0 },
    uCafeSwirl: { value: 0 },
    uCafeImpact: { value: new THREE.Vector2() },
    uCafePour: { value: new THREE.Vector2() },
    uCafeDrops: { value: Array.from({ length: DROP_RING.maxDrops }, () => new THREE.Vector4()) },
    // Golpes que hacen oscilar la superficie (x, z de Three, instante, amplitud) y sus frecuencias.
    uSlosh: { value: Array.from({ length: SLOSH.maxEvents }, () => new THREE.Vector4()) },
    uSloshFreq: { value: new THREE.Vector2() },
    uCafeQuality: { value: 1 },
    uCafeWall: { value: isCup ? 1 : 0 },
  };
}

const SURFACE_COMMON = (isCup) => /* glsl */ `
  varying vec2 vCafeXZ;
  uniform float uCafeRadius;
  uniform float uCafeTime;
  uniform float uCafeCrema;
  uniform float uCafeSwirl;
  uniform vec2 uCafeImpact;
  uniform vec2 uCafePour;
  uniform vec4 uCafeDrops[${DROP_RING.maxDrops}];
  uniform vec4 uSlosh[${SLOSH.maxEvents}];
  uniform vec2 uSloshFreq;
  uniform float uCafeQuality;
  uniform float uCafeWall;
  ${NOISE_GLSL}
  ${rippleGlsl()}
  ${isCup ? sloshGlsl() : 'vec2 cafeSloshSlope(vec2 p) { return vec2(0.0); }'}

  float cafeCremaMask(vec2 xz) {
    ${isCup ? '' : 'return 0.0;'}
    vec2 uv = xz / uCafeRadius;
    float rn = length(uv);
    // Giro diferencial: el centro gira algo mas que el borde y estira la espuma en espirales.
    float angle = uCafeSwirl * (1.35 - rn * rn);
    vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv * 2.4;
    vec2 warp = vec2(cafeFbm(q + 3.1), cafeFbm(q.yx + 7.7));
    float foam = cafeFbm(q * 1.6 + warp * 1.7);
    float gather = smoothstep(0.5, 1.0, rn);
    float mask = smoothstep(0.38, 0.9, foam + gather * 0.22) * (0.3 + 0.7 * gather);
    float nearImpact = exp(-dot(xz - uCafeImpact, xz - uCafeImpact) / 0.00006) * cafeEnvelope(uCafeTime);
    mask = max(mask * uCafeCrema, nearImpact * 0.5 * smoothstep(0.35, 0.75, foam));
    if (uCafeQuality > 0.5) mask *= 0.82 + 0.18 * cafeNoise(q * 38.0);
    return mask * ${f(SURFACE.cremaMax)};
  }
`;

function patchSurface(material, uniforms, isCup) {
  const thin = isCup ? SURFACE.thinCup : SURFACE.thinPool;
  const body = isCup ? COFFEE.deep : COFFEE.poolBody;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCafeXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCafeXZ = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_COMMON(isCup)}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cafeWallDistance = max(uCafeRadius - length(vCafeXZ), 0.0);
        float cafeThin = exp(-cafeWallDistance / ${f(thin)});
        float cafeCrema = cafeCremaMask(vCafeXZ);
        vec3 cafeColor = mix(${vec3(body)}, ${vec3(COFFEE.rim)}, cafeThin);
        cafeColor = mix(cafeColor, ${vec3(COFFEE.crema)}, cafeCrema);
        diffuseColor.rgb = cafeColor;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${f(SURFACE.cremaRoughness)}, cafeCrema);
`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 cafeSlope = cafeRippleSlope(vCafeXZ) * (1.0 - cafeCrema) + cafeSloshSlope(vCafeXZ);
        normal = normalize(normal - (viewMatrix * vec4(cafeSlope.x, 0.0, cafeSlope.y, 0.0)).xyz);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += ${vec3(COFFEE.glow)} * cafeThin * (1.0 - cafeCrema);`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        float cafeOcclusion = mix(${f(SURFACE.occlusionFloor)}, 1.0, smoothstep(0.0, ${f(SURFACE.occlusion)}, cafeWallDistance));
        reflectedLight.indirectSpecular *= mix(1.0, cafeOcclusion, uCafeWall);`);
  };
  material.customProgramCacheKey = () => `cafe-surface-v4-${isCup ? 'cup' : 'pool'}`;
}

/*
 * Superficie del cafe (kind 'cup') o charco del platillo (kind 'pool').
 * material.userData.uniforms se actualiza desde liquids.js sin asignar memoria.
 */
export function createCoffeeMaterial(kind = 'cup') {
  const isCup = kind === 'cup';
  const uniforms = createSurfaceUniforms(isCup);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: SURFACE.roughness,
    envMapIntensity: SURFACE.envMapIntensity,
    ior: 1.333,
  });
  patchSurface(material, uniforms, isCup);
  material.userData.uniforms = uniforms;
  return material;
}

/* Chorro y cinta: mismo cafe, con un brillo que corre hacia abajo y bordes algo mas calidos. */
export function createStreamMaterial() {
  const uniforms = { uCafeTime: { value: 0 }, uCafeQuality: { value: 1 } };
  const material = new THREE.MeshPhysicalMaterial({
    color: COFFEE.stream,
    roughness: STREAM.roughness,
    envMapIntensity: STREAM.envMapIntensity,
    ior: 1.333,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCafeWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCafeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCafeWorld;
        uniform float uCafeTime;
        uniform float uCafeQuality;
        ${NOISE3_GLSL}
        float cafeStreamField(vec3 w) {
          float angle = w.y * ${f(STREAM.twist)} + uCafeTime * ${f(STREAM.spin)};
          vec2 across = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * w.xz * ${f(STREAM.across)};
          vec3 p = vec3(across.x, w.y * ${f(STREAM.along)} + uCafeTime * ${f(STREAM.speed)}, across.y);
          vec3 q = vec3(across.x * 2.1, w.y * ${f(STREAM.along * 2.6)} + uCafeTime * ${f(STREAM.shimmerSpeed)}, across.y * 2.1);
          return cafeNoise3(p) + 0.15 * cafeNoise3(q + 17.0);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uCafeQuality > 0.5) {
          float cafeN = cafeStreamField(vCafeWorld);
          vec3 cafeGradient = vec3(
            cafeStreamField(vCafeWorld + vec3(${f(STREAM.epsilon)}, 0.0, 0.0)),
            cafeStreamField(vCafeWorld + vec3(0.0, ${f(STREAM.epsilon)}, 0.0)),
            cafeStreamField(vCafeWorld + vec3(0.0, 0.0, ${f(STREAM.epsilon)}))) - cafeN;
          // Diferencias en metros normalizadas a la escala del dibujo.
          cafeGradient *= ${f(STREAM.strength / (STREAM.epsilon * STREAM.across))};
          normal = normalize(normal + (viewMatrix * vec4(cafeGradient, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Nucleo oscuro y borde rojizo translucido: en el contorno el chorro es mas fino.
        float cafeFacing = abs(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += ${vec3(COFFEE.streamGlow)} * pow(1.0 - cafeFacing, ${f(STREAM.glowPower)});`);
  };
  material.customProgramCacheKey = () => 'cafe-stream-v4';
  material.userData.uniforms = uniforms;
  return material;
}

/* Gotas y salpicaduras: el mismo cafe del chorro, sin parches (son unos pocos pixeles). */
export const createDropletMaterial = () => new THREE.MeshPhysicalMaterial({
  color: COFFEE.stream,
  roughness: STREAM.roughness,
  envMapIntensity: STREAM.envMapIntensity,
  ior: 1.333,
});

/* Burbujas de aire en la superficie: cafe claro con reflejos fuertes, como espuma recien hecha. */
export const createBubbleMaterial = () => new THREE.MeshPhysicalMaterial({
  color: linear(0.07, 0.035, 0.014),
  roughness: 0.1,
  envMapIntensity: 1.6,
  ior: 1.333,
});

/* Pared mojada sobre el cafe: pelicula oscura y brillante, transparente segun el alfa del vertice. */
export const createWetWallMaterial = () => new THREE.MeshPhysicalMaterial({
  color: linear(0.035, 0.013, 0.004),
  roughness: 0.05,
  envMapIntensity: 2.0,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
});
