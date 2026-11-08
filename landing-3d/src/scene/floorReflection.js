/*
 * Reflejo suave del bodegon en el marmol pulido del suelo.
 *
 * Una camara espejo (como Reflector de three) dibuja solo los objetos en un render target pequeño
 * con alfa 0 de fondo; el suelo lo lee en proyeccion, con mipmaps y cuatro muestras para el
 * desenfoque, mas borroso donde el marmol es mas rugoso, con Fresnel y desvaneciendolo lejos de
 * los objetos. Suelo, pared, sombras falsas y vapor no se dibujan en el espejo.
 *
 * Calidad alta: target a la mitad de la resolucion CSS, con el grano. Baja (movil o cuando la
 * resolucion adaptativa ya bajo): un tercio mas pequeño y sin grano ni cascarilla (35 000
 * triangulos menos). Desactivado: el suelo no muestrea nada (strength 0).
 */
import * as THREE from 'three';

import { chainPatch } from './shaderPatches.js';

export const REFLECTION_QUALITY = Object.freeze({
  high: Object.freeze({ scale: 0.5, maxSize: 1024, includeBean: true }),
  low: Object.freeze({ scale: 0.3, maxSize: 384, includeBean: false }),
});

const LOOK = Object.freeze({
  strength: 0.55,
  /* Nivel de mipmap minimo y extra por rugosidad: el marmol no es un espejo. */
  lodBias: 2.0,
  lodPerRoughness: 3.5,
  tapSpread: 0.01,
  fadeStart: 0.16,
  fadeEnd: 0.5,
  /* Las piezas tapan el reflejo del estudio en el suelo: un poco de oscurecimiento donde hay reflejo. */
  occlusion: 1.5,
  specularF0: 0.04 * 0.6,
});

const CLIP_BIAS = 0.0005;
const ORIGIN = Object.freeze(new THREE.Vector3(0, 0, 0));

function createTarget() {
  return new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
}

function patchFloor(material, uniforms) {
  chainPatch(material, (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uReflectMatrix;\nvarying vec4 vReflectCoord;\nvarying vec2 vReflectXZ;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 reflectWorld = modelMatrix * vec4(transformed, 1.0);
        vReflectCoord = uReflectMatrix * reflectWorld;
        vReflectXZ = reflectWorld.xz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uReflectMap;
        uniform float uReflectStrength;
        uniform vec2 uReflectTexel;
        varying vec4 vReflectCoord;
        varying vec2 vReflectXZ;`)
      .replace('#include <opaque_fragment>', `
        if (uReflectStrength > 0.0) {
          vec2 reflectUv = vReflectCoord.xy / vReflectCoord.w;
          float reflectLod = ${LOOK.lodBias.toFixed(3)} + ${LOOK.lodPerRoughness.toFixed(3)} * roughnessFactor;
          vec2 reflectStep = ${LOOK.tapSpread.toFixed(4)} * (0.5 + roughnessFactor) * vec2(1.0, uReflectTexel.y / uReflectTexel.x);
          vec4 reflected = 0.25 * (
            texture2D(uReflectMap, reflectUv + reflectStep * vec2(0.38, 0.92), reflectLod) +
            texture2D(uReflectMap, reflectUv + reflectStep * vec2(-0.92, 0.38), reflectLod) +
            texture2D(uReflectMap, reflectUv + reflectStep * vec2(-0.38, -0.92), reflectLod) +
            texture2D(uReflectMap, reflectUv + reflectStep * vec2(0.92, -0.38), reflectLod));
          float reflectNdotV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float reflectFresnel = ${LOOK.specularF0.toFixed(4)} + (1.0 - ${LOOK.specularF0.toFixed(4)}) * pow(1.0 - reflectNdotV, 5.0);
          float reflectGloss = (1.0 - roughnessFactor) * (1.0 - roughnessFactor);
          float reflectFade = 1.0 - smoothstep(${LOOK.fadeStart.toFixed(3)}, ${LOOK.fadeEnd.toFixed(3)}, length(vReflectXZ));
          float reflectAmount = uReflectStrength * reflectFresnel * mix(0.25, 1.0, reflectGloss) * reflectFade;
          outgoingLight = outgoingLight * (1.0 - min(1.0, ${LOOK.occlusion.toFixed(3)} * reflected.a * reflectAmount))
            + reflected.rgb * reflectAmount;
        }
        #include <opaque_fragment>`);
  });
  material.customProgramCacheKey = () => 'focus-v3-floor-reflect-v1';
}

/* Matriz de proyeccion oblicua: el plano cercano es el suelo, nada de debajo sale en el espejo. */
function clipProjection(camera, plane) {
  const clipPlane = new THREE.Vector4();
  const q = new THREE.Vector4();
  const projection = camera.projectionMatrix;
  clipPlane.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  q.x = (Math.sign(clipPlane.x) + projection.elements[8]) / projection.elements[0];
  q.y = (Math.sign(clipPlane.y) + projection.elements[9]) / projection.elements[5];
  q.z = -1.0;
  q.w = (1.0 + projection.elements[10]) / projection.elements[14];
  clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
  projection.elements[2] = clipPlane.x;
  projection.elements[6] = clipPlane.y;
  projection.elements[10] = clipPlane.z + 1.0 - CLIP_BIAS;
  projection.elements[14] = clipPlane.w;
}

/*
 * floor: material del suelo. hidden: mallas que no van en el espejo. beanParts: grano y cascarilla,
 * que se omiten en calidad baja.
 */
export function createFloorReflection({ renderer, scene, floorMaterial, hidden, beanParts }) {
  const target = createTarget();
  const uniforms = {
    uReflectMap: { value: target.texture },
    uReflectMatrix: { value: new THREE.Matrix4() },
    uReflectStrength: { value: LOOK.strength },
    uReflectTexel: { value: new THREE.Vector2(0.5, 0.5) },
  };
  patchFloor(floorMaterial, uniforms);

  const virtualCamera = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0);
  const cameraPosition = new THREE.Vector3();
  const rotation = new THREE.Matrix4();
  const lookAt = new THREE.Vector3(0, 0, -1);
  const view = new THREE.Vector3();
  const targetPoint = new THREE.Vector3();
  const plane = new THREE.Plane();
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  const clearColor = new THREE.Color();

  let quality = REFLECTION_QUALITY.high;
  let enabled = true;
  let cssSize = { width: 1, height: 1 };

  function resizeTarget() {
    const { scale, maxSize } = quality;
    const fit = Math.min(1, maxSize / Math.max(cssSize.width * scale, cssSize.height * scale));
    const width = Math.max(16, Math.round(cssSize.width * scale * fit));
    const height = Math.max(16, Math.round(cssSize.height * scale * fit));
    if (target.width !== width || target.height !== height) target.setSize(width, height);
    uniforms.uReflectTexel.value.set(1 / width, 1 / height);
  }

  function updateVirtualCamera(camera) {
    camera.updateMatrixWorld();
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    rotation.extractRotation(camera.matrixWorld);
    view.copy(cameraPosition).negate().reflect(normal).negate();
    lookAt.set(0, 0, -1).applyMatrix4(rotation).add(cameraPosition);
    targetPoint.copy(lookAt).negate().reflect(normal).negate();
    virtualCamera.position.copy(view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
    virtualCamera.lookAt(targetPoint);
    virtualCamera.far = camera.far;
    virtualCamera.updateMatrixWorld();
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    uniforms.uReflectMatrix.value.copy(bias)
      .multiply(virtualCamera.projectionMatrix)
      .multiply(virtualCamera.matrixWorldInverse);
    plane.setFromNormalAndCoplanarPoint(normal, ORIGIN).applyMatrix4(virtualCamera.matrixWorldInverse);
    clipProjection(virtualCamera, plane);
  }

  function setVisibility(list, visible) {
    const previous = list.map((object) => object.visible);
    list.forEach((object) => { object.visible = visible; });
    return previous;
  }

  /* Llamar justo antes del render principal, con la camara ya colocada. */
  function update(camera) {
    if (!enabled) return;
    camera.updateMatrixWorld();
    cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    if (cameraPosition.y <= 0) return;
    updateVirtualCamera(camera);

    const excluded = quality.includeBean ? hidden : [...hidden, ...beanParts];
    const previousVisible = setVisibility(excluded, false);
    const previousTarget = renderer.getRenderTarget();
    const previousAutoUpdate = renderer.shadowMap.autoUpdate;
    const previousBackground = scene.background;
    const previousAlpha = renderer.getClearAlpha();
    renderer.getClearColor(clearColor);

    // La sombra del fotograma anterior basta para el reflejo: no se recalcula dos veces.
    renderer.shadowMap.autoUpdate = false;
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, virtualCamera);

    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(clearColor, previousAlpha);
    scene.background = previousBackground;
    renderer.shadowMap.autoUpdate = previousAutoUpdate;
    excluded.forEach((object, index) => { object.visible = previousVisible[index]; });
  }

  return {
    update,
    setSize(width, height) {
      cssSize = { width, height };
      resizeTarget();
    },
    setQuality(name) {
      const next = REFLECTION_QUALITY[name];
      if (!next || next === quality) return;
      quality = next;
      resizeTarget();
    },
    setEnabled(value) {
      enabled = value;
      uniforms.uReflectStrength.value = value ? LOOK.strength : 0;
    },
    getQuality: () => Object.keys(REFLECTION_QUALITY).find((key) => REFLECTION_QUALITY[key] === quality),
    dispose: () => target.dispose(),
    initialStrength: LOOK.strength,
    uniforms,
  };
}
