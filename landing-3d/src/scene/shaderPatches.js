/*
 * Parches de shader de los solidos. Dan por poco coste lo que en Cycles sale de los rebotes de
 * luz: oclusion de contacto en taza y platillo, y desenfoque de profundidad en los fondos.
 */
import { CUP_TOP } from '../logic/dimensions.js';

/* Parametros opticos de la camara de Blender: 55 mm a f/5.6 sobre sensor de 36 mm, en metros. */
const LENS = Object.freeze({ focal: 0.055, fstop: 5.6, sensor: 0.036 });
const MAX_BLUR_LOD = 5.5;
const REFERENCE_WIDTH_PX = 1280;
const TEXTURE_TEXELS = 2048;

const glslFloat = (value) => value.toFixed(5);

/*
 * Desenfoque de profundidad solo en los mapas de suelo y pared, sin pasada extra: se calcula el
 * circulo de confusion de la lente y se lee un nivel de mipmap mas alto con cuatro muestras.
 *
 * La union suelo-pared es una arista geometrica que ningun mipmap suaviza. Se funde como lo haria
 * el desenfoque: en una banda del ancho del circulo de confusion (medida en pixeles, para que el
 * suelo rasante no la comprima), a ambos lados, el color base y la rugosidad convergen a la media
 * de los dos marmoles y la luz final a un mismo tono de esquina en sombra. Los dos lados dan
 * exactamente el mismo color en la union, asi que no queda corte.
 */
/* occlusion: luz que llega a la arista respecto a la de fuera (la esquina se ve algo mas oscura). */
/* Bandas en pixeles de un fotograma de 1280 de ancho. */
export const SEAM = Object.freeze({ wallZ: -0.34, minBand: 8, cocToBand: 3.2, maxBand: 90, color: Object.freeze([0.0105, 0.0094, 0.0086]) });

const SEAM_SURFACES = Object.freeze({
  floor: { distance: `vSeamWorld.z - (${glslFloat(SEAM.wallZ)})` },
  wall: { distance: 'vSeamWorld.y' },
});

export function createFocus() {
  const uniforms = {
    uFocusDistance: { value: 0.75 },
    uCocScale: { value: 0 },
    uTexelSpread: { value: 0.55 },
    uPixelScale: { value: 1 },
    uSeamAlbedo: { value: [0.02, 0.018, 0.016] },
    uSeamRoughness: { value: 0.5 },
    uSeamColor: { value: SEAM.color },
  };

  function patch(material, surface) {
    const seam = SEAM_SURFACES[surface];
    material.customProgramCacheKey = () => `focus-v3-${surface}`;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          varying vec3 vSeamWorld;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vSeamWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vSeamWorld;
          uniform float uFocusDistance;
          uniform float uCocScale;
          uniform float uTexelSpread;
          uniform float uPixelScale;
          uniform vec3 uSeamAlbedo;
          uniform float uSeamRoughness;
          uniform vec3 uSeamColor;`)
        .replace('#include <map_fragment>', `
          float dofDistance = length(vViewPosition);
          float dofCoc = uCocScale * abs(dofDistance - uFocusDistance) / max(dofDistance, 0.001);
          float dofLod = min(log2(1.0 + dofCoc), ${glslFloat(MAX_BLUR_LOD)});
          vec2 dofTexel = uTexelSpread * pow(2.0, dofLod) * vec2(${glslFloat(1 / TEXTURE_TEXELS)});
          vec4 sampledDiffuseColor = 0.25 * (
            texture2D(map, vMapUv + dofTexel * vec2(0.38, 0.92), dofLod) +
            texture2D(map, vMapUv + dofTexel * vec2(-0.92, 0.38), dofLod) +
            texture2D(map, vMapUv + dofTexel * vec2(-0.38, -0.92), dofLod) +
            texture2D(map, vMapUv + dofTexel * vec2(0.92, -0.38), dofLod));
          diffuseColor *= sampledDiffuseColor;
          // En pixeles de pantalla: el suelo visto casi rasante comprime la banda; asi mide igual
          // a los dos lados de la arista.
          float seamWorld = max(${seam.distance}, 0.0);
          float seamPixels = seamWorld / max(fwidth(${seam.distance}), 1e-7);
          float seamBand = clamp(${glslFloat(SEAM.cocToBand)} * dofCoc, ${glslFloat(SEAM.minBand)}, ${glslFloat(SEAM.maxBand)}) * uPixelScale;
          float seamDistance = seamPixels / seamBand;
          float seamWeight = 1.0 - smoothstep(0.0, 1.0, seamDistance);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSeamAlbedo, seamWeight);`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            roughnessFactor *= texture2D(roughnessMap, vRoughnessMapUv, dofLod).g;
          #endif
          roughnessFactor = mix(roughnessFactor, uSeamRoughness, seamWeight);`)
        .replace('#include <opaque_fragment>', `
          outgoingLight = mix(outgoingLight, uSeamColor, seamWeight);
          #include <opaque_fragment>`);
    };
  }

  /* drawingWidth: ancho real en pixeles del fotograma, para pasar la banda a pixeles reales. */
  function setDistance(distance, drawingWidth = REFERENCE_WIDTH_PX) {
    const aperture = LENS.focal / LENS.fstop;
    const onSensor = (aperture * LENS.focal) / Math.max(distance - LENS.focal, 0.01);
    uniforms.uFocusDistance.value = distance;
    uniforms.uCocScale.value = (onSensor / LENS.sensor) * REFERENCE_WIDTH_PX;
    uniforms.uPixelScale.value = Math.max(0.25, drawingWidth / REFERENCE_WIDTH_PX);
  }

  /* Color base y rugosidad medios de los dos marmoles, en lineal: el valor comun de la union. */
  function setSeamMaterial(albedo, roughnessValue) {
    uniforms.uSeamAlbedo.value = albedo;
    uniforms.uSeamRoughness.value = roughnessValue;
  }

  return { patch, setDistance, setSeamMaterial };
}

/* Encadena un parche con el onBeforeCompile que ya tuviera el material. */
export function chainPatch(material, patch) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    patch(shader);
  };
}

const LOCAL_VARYINGS_VERTEX = (vertexShader) => vertexShader
  .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;\nvarying vec3 vLocalNormal;')
  .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;\nvLocalNormal = normal;');

/* Variaciones suaves del esmalte sobre los mapas horneados, en unidades del objeto.
 * No usa UV: mantiene la misma escala fisica en taza, asa y platillo.
 */
export function patchCeramicGlaze(material) {
  chainPatch(material, (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlazePosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlazePosition = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGlazePosition;
        float glazeHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float glazeNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(glazeHash(i), glazeHash(i + vec3(1,0,0)), f.x),
                mix(glazeHash(i + vec3(0,1,0)), glazeHash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(glazeHash(i + vec3(0,0,1)), glazeHash(i + vec3(1,0,1)), f.x),
                mix(glazeHash(i + vec3(0,1,1)), glazeHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float glazeCloud = glazeNoise(vGlazePosition * 145.0);
        diffuseColor.rgb *= 0.98 + 0.035 * glazeCloud;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (glazeCloud - 0.5) * 0.045, 0.18, 0.65);`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoatRoughness = max(0.08, material.clearcoatRoughness + (glazeCloud - 0.5) * 0.035);
        #endif`);
  });
}

/* Taza: oscurece el pie al apoyar en el platillo, el fondo del interior y la linea del cafe. */
export function createCupOcclusion(material) {
  const uniforms = { uCoffeeLocal: { value: -1 } };
  chainPatch(material, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = LOCAL_VARYINGS_VERTEX(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNormal;
        uniform float uCoffeeLocal;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 cupRadial = vLocalPos.xz / max(length(vLocalPos.xz), 0.00001);
        float cupInner = (1.0 - smoothstep(-0.1, 0.1, dot(vLocalNormal.xz, cupRadial)))
          * smoothstep(0.1, 0.6, length(vLocalNormal.xz));
        float cupFoot = mix(0.62, 1.0, smoothstep(0.0, 0.016, vLocalPos.y));
        float cupDeep = mix(1.0, 0.58, smoothstep(0.004, 0.058, ${glslFloat(CUP_TOP)} - vLocalPos.y));
        float cupLine = mix(0.62, 1.0, smoothstep(0.0, 0.009, vLocalPos.y - uCoffeeLocal));
        float cupOuter = cupFoot;
        float cupOcclusion = mix(cupOuter, cupDeep * cupLine, cupInner);
        diffuseColor.rgb *= cupOcclusion;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= cupOcclusion;`);
  });
  return (coffeeLocal) => { uniforms.uCoffeeLocal.value = coffeeLocal; };
}

/* Platillo: sombra de contacto alrededor del pie de la taza, siguiendo su curvatura. */
export function createSaucerOcclusion(material) {
  const uniforms = { uCupPresence: { value: 0 } };
  chainPatch(material, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = LOCAL_VARYINGS_VERTEX(shader.vertexShader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLocalPos;
        varying vec3 vLocalNormal;
        uniform float uCupPresence;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float saucerRadius = length(vLocalPos.xz);
        float saucerContact = 1.0 - smoothstep(0.029, 0.043, saucerRadius);
        float saucerSoft = 1.0 - smoothstep(0.032, 0.062, saucerRadius);
        float saucerOcclusion = 1.0 - (0.48 * saucerContact + 0.16 * saucerSoft) * uCupPresence * step(0.0, vLocalNormal.y);
        diffuseColor.rgb *= saucerOcclusion;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= saucerOcclusion;`);
  });
  return (presence) => { uniforms.uCupPresence.value = presence; };
}
