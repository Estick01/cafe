/*
 * Pase de escena con profundidad de campo barata: dibuja la escena en un render target propio
 * (HalfFloat con DepthTexture, sin MSAA) y luego hace un desenfoque por disco segun el
 * circulo de confusion calculado desde la profundidad. Con apertura 0 o sin DoF solo copia.
 * Trabaja en lineal (antes de OutputPass): sin tone mapping aqui.
 */
import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

const DOF_FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform float uFoco;
uniform float uApertura;
uniform float uMaxPx;
uniform float uDof;
varying vec2 vUv;

float distanciaVista(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(z, uNear, uFar);
}
/* Radio de desenfoque en px: 0 en el plano de foco, crece hacia delante y hacia atras. */
float coc(float d) {
  return clamp(uApertura * abs(1.0 - uFoco / max(d, 1e-3)) * uMaxPx, 0.0, uMaxPx);
}

void main() {
  vec4 centro = texture2D(tColor, vUv);
  if (uDof < 0.5 || uApertura <= 0.0) { gl_FragColor = centro; return; }
  float dc = distanciaVista(vUv);
  float rc = coc(dc);
  vec3 suma = centro.rgb;
  float peso = 1.0;
  const float ORO = 2.39996323;
  for (int i = 1; i < MUESTRAS; i++) {
    float t = float(i) / float(MUESTRAS);
    float r = sqrt(t) * uMaxPx;
    vec2 o = vec2(cos(float(i) * ORO), sin(float(i) * ORO)) * r * uTexel;
    vec2 uv = vUv + o;
    float ds = distanciaVista(uv);
    float rs = coc(ds);
    /* La muestra cuenta si su propio disco (o el del centro, si esta detras) alcanza este pixel:
       evita que el fondo borroso se coma un primer plano nitido. */
    float alcance = ds < dc ? rs : min(rc, rs);
    float w = smoothstep(r - 1.5, r, alcance);
    suma += texture2D(tColor, uv).rgb * w;
    peso += w;
  }
  gl_FragColor = vec4(suma / peso, centro.a);
}
`;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export class EscenaDofPass extends Pass {
  constructor(scene, camera, { muestras = 32, dof = true } = {}) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;
    this.dofActivo = dof;
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.objetivo = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      // Una profundidad sin MSAA evita oclusiones incorrectas en las superficies transparentes.
      samples: 0,
      depthTexture,
      depthBuffer: true,
    });
    this.objetivo.texture.name = 'post-escena';
    this.material = new THREE.ShaderMaterial({
      name: 'post-dof',
      defines: { MUESTRAS: muestras },
      uniforms: {
        tColor: { value: this.objetivo.texture },
        tDepth: { value: depthTexture },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uFoco: { value: 3 },
        uApertura: { value: 0 },
        uMaxPx: { value: 10 },
        uDof: { value: dof ? 1 : 0 },
      },
      vertexShader: VERTEX,
      fragmentShader: DOF_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setFocus(distance, aperture) {
    const u = this.material.uniforms;
    if (Number.isFinite(distance)) u.uFoco.value = Math.max(0.01, distance);
    if (Number.isFinite(aperture)) u.uApertura.value = Math.min(1, Math.max(0, aperture));
  }

  setSize(width, height) {
    this.objetivo.setSize(width, height);
    this.material.uniforms.uTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
    /* Radio maximo proporcional a la altura (unos 9 px a 900 px de alto). */
    this.material.uniforms.uMaxPx.value = Math.max(3, height * 0.01);
  }

  render(renderer, writeBuffer) {
    const u = this.material.uniforms;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uDof.value = this.dofActivo ? 1 : 0;
    const previo = renderer.getRenderTarget();
    renderer.setRenderTarget(this.objetivo);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
    renderer.setRenderTarget(previo);
  }

  dispose() {
    this.objetivo.depthTexture?.dispose();
    this.objetivo.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}
