/*
 * Postproceso: escena + DoF (lineal, HalfFloat) -> bloom suave (lineal) -> OutputPass (tone mapping
 * y sRGB segun el renderer, una sola vez) -> grano y vineta (espacio de pantalla).
 *
 * El renderer conserva su toneMapping/outputColorSpace: three solo los aplica al dibujar a pantalla,
 * por eso dentro de los render targets no hay doble tone mapping y OutputPass los aplica al final.
 * Saltar el post es seguro: basta con llamar renderer.render(scene, camera) en su lugar.
 *
 * quality 'baja': sin MSAA, sin DoF, bloom a media resolucion y grano mas suave.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { EscenaDofPass } from './escenaDof.js';
import { EdgeAA } from './edgeAA.js';

const GRANO_VINETA = Object.freeze({
  name: 'GranoVinetaShader',
  uniforms: {
    tDiffuse: { value: null },
    uGrano: { value: 0.035 },
    uVineta: { value: 0.35 },
    uSemilla: { value: 0 },
    uAspecto: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uGrano;
    uniform float uVineta;
    uniform float uSemilla;
    uniform float uAspecto;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = (vUv - 0.5) * vec2(uAspecto, 1.0);
      float v = 1.0 - uVineta * smoothstep(0.35, 1.05, length(d) * 1.25);
      /* Grano de pelicula: mas visible en medios tonos, casi nada en negros y luces. */
      float g = hash(gl_FragCoord.xy + uSemilla * 91.7) + hash(gl_FragCoord.xy * 1.37 - uSemilla * 13.1) - 1.0;
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float medio = 4.0 * l * (1.0 - l);
      vec3 color = c.rgb * v + g * uGrano * (0.35 + 0.65 * medio);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), c.a);
    }
  `,
});

const PERFILES = Object.freeze({
  alta: { samples: 4, dof: true, muestras: 32, bloomEscala: 1, grano: 0.012, vineta: 0.22 },
  baja: { samples: 0, dof: false, muestras: 12, bloomEscala: 0.5, grano: 0.008, vineta: 0.18 },
});

export function createPost({ renderer, scene, camera, quality = 'alta' }) {
  const perfil = PERFILES[quality === 'baja' ? 'baja' : 'alta'];
  const objetivo = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  objetivo.texture.name = 'post-composer';
  const composer = new EffectComposer(renderer, objetivo);

  const escena = new EscenaDofPass(scene, camera, { samples: perfil.samples, muestras: perfil.muestras, dof: perfil.dof });
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.09, 0.35, 1.15);
  /* Bloom a la escala del perfil (media resolucion en 'baja'). */
  const setSizeBloom = bloom.setSize.bind(bloom);
  bloom.setSize = (w, h) => setSizeBloom(Math.max(1, Math.round(w * perfil.bloomEscala)), Math.max(1, Math.round(h * perfil.bloomEscala)));
  const output = new OutputPass();
  const grano = new ShaderPass(GRANO_VINETA);
  const antialias = new ShaderPass(EdgeAA);
  grano.uniforms.uGrano.value = perfil.grano;
  grano.uniforms.uVineta.value = perfil.vineta;

  composer.addPass(escena);
  composer.addPass(bloom);
  composer.addPass(output);
  composer.addPass(antialias);
  composer.addPass(grano);

  let fotograma = 0;
  const tamano = new THREE.Vector2();
  renderer.getSize(tamano);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(Math.max(1, tamano.x), Math.max(1, tamano.y));
  grano.uniforms.uAspecto.value = tamano.x / Math.max(1, tamano.y);
  antialias.uniforms.texel.value.set(1 / (tamano.x * renderer.getPixelRatio()), 1 / (tamano.y * renderer.getPixelRatio()));

  return {
    composer,
    setTime(time) { fotograma = Math.floor(time * 24) % 64; },
    render() {
      grano.uniforms.uSemilla.value = fotograma;
      composer.render(0);
    },
    setSize(width, height, dpr = renderer.getPixelRatio()) {
      composer.setPixelRatio(dpr);
      composer.setSize(Math.max(1, width), Math.max(1, height));
      grano.uniforms.uAspecto.value = width / Math.max(1, height);
      antialias.uniforms.texel.value.set(1 / (width * dpr), 1 / (height * dpr));
    },
    setCamera(nueva) {
      if (nueva) escena.camera = nueva;
    },
    /* distance en unidades de la escena desde la camara; aperture 0 (nitido) .. 1 (muy abierto). */
    setFocus({ distance, aperture } = {}) {
      escena.setFocus(distance, aperture);
    },
    setStrength({ bloom: fuerzaBloom, grain, vignette } = {}) {
      if (Number.isFinite(fuerzaBloom)) bloom.strength = Math.max(0, fuerzaBloom);
      if (Number.isFinite(grain)) grano.uniforms.uGrano.value = Math.max(0, grain);
      if (Number.isFinite(vignette)) grano.uniforms.uVineta.value = Math.min(1, Math.max(0, vignette));
    },
    dispose() {
      escena.dispose();
      bloom.dispose();
      output.dispose();
      antialias.dispose();
      grano.dispose();
      composer.dispose();
      objetivo.dispose();
    },
  };
}
