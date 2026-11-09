/*
 * Capas a pantalla completa sobre la escena, dentro de la propia escena (asi el post-proceso, si lo
 * hay, tambien les da bloom y grano):
 *   - anillo: la pantalla se oscurece, un hilo de cafe dorado nace en el centro y se abre en espiral;
 *     dentro de la espiral aparece la escena siguiente.
 *   - fundido: un fotograma anterior (textura) que se desvanece sobre la escena nueva, para los
 *     cambios de seccion sin salto (historia -> inmersion, inmersion -> emerge).
 *
 * Los vertices van directos a clip space: valen con cualquier camara y desplazamiento de vista.
 * Hay que ocultarlas en renders auxiliares (reflejo del suelo, captura del fotograma anterior).
 */
import * as THREE from 'three';

import { MEZCLAS } from '../logic/story.js';

const ON_TOP = 1e6;
/* Oro liquido, en lineal y por encima de 1 para que el bloom lo recoja. */
const GOLD = new THREE.Color().setRGB(2.4, 1.45, 0.55, THREE.LinearSRGBColorSpace);
const DARK = new THREE.Color().setRGB(0.002, 0.0016, 0.0013, THREE.LinearSRGBColorSpace);

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uU;
  uniform float uAspect;
  uniform float uTime;
  uniform float uDark;
  uniform float uSwitch;
  uniform vec3 uGold;
  uniform vec3 uDarkColor;
  varying vec2 vUv;

  const float TAU = 6.28318530718;

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    float turn = fract(atan(p.y, p.x) / TAU + 0.25 + uTime * 0.05);
    float maxR = 0.5 * sqrt(uAspect * uAspect + 1.0);

    // Frente de la espiral: nace en el centro (pantalla ya oscura) y sale mas alla de las esquinas.
    float grow = smoothstep(0.0, uSwitch, uU);
    float open = clamp((uU - uSwitch) / (1.0 - uSwitch), 0.0, 1.0);
    open = open * open * (3.0 - 2.0 * open);
    float pitch = mix(0.035, 0.22, open);
    float front = mix(0.0, 0.11, grow) + open * (maxR + pitch + 0.08);

    // Lineas de la espiral: k = 0 es la vuelta exterior; las interiores se apagan.
    float x = (front - r) / pitch - (1.0 - turn);
    float k = floor(x + 0.5);
    float wobble = 0.5 + 0.5 * sin(turn * TAU * 3.0 + uTime * 2.3);
    float width = mix(0.0026, 0.0055, wobble) * (1.0 + open * 1.6);
    float d = abs(x - k) * pitch;
    float trail = k < 0.0 || k > 2.0 ? 0.0 : exp(-k * 1.1) * (1.0 - open * 0.55 * k);
    float line = smoothstep(width, width * 0.25, d) * trail * smoothstep(0.004, 0.02, r);
    line *= 1.0 - smoothstep(0.82, 1.0, uU);
    // Brillo suave alrededor del hilo, como liquido con luz.
    float glow = exp(-d / (width * 5.0)) * trail * 0.35 * (1.0 - smoothstep(0.82, 1.0, uU));

    // Mascara de revelado: dentro de la vuelta exterior se ve la escena nueva.
    float edge = front - pitch * (1.0 - turn);
    float reveal = uU >= uSwitch ? smoothstep(edge + 0.012, edge - 0.012, r) : 0.0;
    float darkAlpha = uDark * (1.0 - reveal);

    float alpha = clamp(max(darkAlpha, line + glow), 0.0, 1.0);
    vec3 color = mix(uDarkColor, uGold, clamp(line + glow, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const FADE_FRAGMENT = /* glsl */ `
  uniform sampler2D tFrame;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 texel = texture2D(tFrame, vUv);
    gl_FragColor = vec4(texel.rgb, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function overlayMaterial(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: true,
  });
}

function overlayMesh(material, order) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = ON_TOP + order;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

const easeIn = (value) => {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
};

export function createTransitions({ scene, renderer, quality = 'high' }) {
  const group = new THREE.Group();
  group.name = 'CO2-transiciones';
  const ringUniforms = {
    uU: { value: 0 },
    uAspect: { value: 1 },
    uTime: { value: 0 },
    uDark: { value: 0 },
    uSwitch: { value: MEZCLAS.anillo.cambio },
    uGold: { value: GOLD.clone() },
    uDarkColor: { value: DARK.clone() },
  };
  const ring = overlayMesh(overlayMaterial(RING_FRAGMENT, ringUniforms), 1);
  ring.name = 'CO2-anillo';

  const target = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    samples: quality === 'low' ? 0 : 4,
    depthBuffer: true,
  });
  const fadeUniforms = { tFrame: { value: target.texture }, uOpacity: { value: 0 } };
  const fade = overlayMesh(overlayMaterial(FADE_FRAGMENT, fadeUniforms), 0);
  fade.name = 'CO2-fundido';

  group.add(fade, ring);
  scene.add(group);

  let size = { width: 1, height: 1, ratio: 1 };

  return {
    group,
    setSize(width, height, ratio) {
      size = { width, height, ratio };
      ringUniforms.uAspect.value = width / Math.max(1, height);
      const scale = quality === 'low' ? 0.75 : 1;
      target.setSize(Math.max(2, Math.round(width * ratio * scale)), Math.max(2, Math.round(height * ratio * scale)));
    },
    /* anillo = { u } de story.js o null. */
    setRing(anillo, time = 0) {
      ring.visible = Boolean(anillo);
      if (!anillo) return;
      ringUniforms.uU.value = anillo.u;
      ringUniforms.uTime.value = time;
      ringUniforms.uDark.value = easeIn(anillo.u / MEZCLAS.anillo.oscuro);
    },
    /*
     * Dibuja el fotograma anterior en la textura con drawPrevious(): la funcion deja la escena
     * como la quiera, renderiza y la restaura. Las capas se ocultan mientras tanto.
     */
    captureFrame(drawPrevious) {
      const previous = renderer.getRenderTarget();
      group.visible = false;
      renderer.setRenderTarget(target);
      renderer.clear();
      drawPrevious(target);
      renderer.setRenderTarget(previous);
      group.visible = true;
    },
    setFade(weight) {
      fade.visible = weight > 0.001;
      fadeUniforms.uOpacity.value = weight;
    },
    hideAll() {
      ring.visible = false;
      fade.visible = false;
    },
    /* Para renders auxiliares (reflejo del suelo): oculta las capas y devuelve como restaurarlas. */
    suspend() {
      const was = group.visible;
      group.visible = false;
      return () => { group.visible = was; };
    },
    get size() { return size; },
    dispose() {
      scene.remove(group);
      target.dispose();
      ring.geometry.dispose();
      ring.material.dispose();
      fade.geometry.dispose();
      fade.material.dispose();
    },
  };
}
