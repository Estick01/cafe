/*
 * Anillo orbital luminoso: tubo fino aditivo generado en el shader (radio y grosor son uniformes,
 * asi cambiar de fase no reconstruye geometria) con una cola que se revela y un destello viajero.
 * Dos capas: nucleo brillante y halo suave con caida por angulo de vista.
 */
import * as THREE from 'three';

const ORO = new THREE.Color().setRGB(1.0, 0.62, 0.24, THREE.LinearSRGBColorSpace);
const ORO_CLARO = new THREE.Color().setRGB(1.0, 0.86, 0.6, THREE.LinearSRGBColorSpace);

const VERTEX = /* glsl */ `
  attribute float angulo;
  attribute vec2 seccion;
  uniform float uRadio;
  uniform float uGrosor;
  varying float vAngulo;
  varying float vBorde;
  void main() {
    vec3 radial = vec3(cos(angulo), 0.0, sin(angulo));
    vec3 nrm = radial * seccion.x + vec3(0.0, seccion.y, 0.0);
    vec3 pos = radial * uRadio + nrm * uGrosor;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec3 n = normalize(normalMatrix * nrm);
    vBorde = abs(dot(n, normalize(-mv.xyz)));
    vAngulo = angulo;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColorCabeza;
  uniform float uCabeza;
  uniform float uBarrido;
  uniform float uIntensidad;
  uniform float uHalo;
  varying float vAngulo;
  varying float vBorde;
  const float TAU = 6.28318530718;
  void main() {
    float d = mod(uCabeza - vAngulo, TAU);
    float completo = step(TAU - 0.001, uBarrido);
    float cola = mix(smoothstep(uBarrido, uBarrido * 0.7, d), 1.0, completo);
    if (cola <= 0.0) discard;
    float estela = 0.32 + 0.68 * exp(-d / 1.1);
    float delante = (TAU - d) * completo + 10.0 * (1.0 - completo);
    float destello = exp(-d * d / 0.0035) + 0.5 * exp(-d * d / 0.03) + exp(-delante * delante / 0.0008);
    float segundo = 0.45 * exp(-pow(mod(uCabeza * 0.63 + 2.4 - vAngulo, TAU) - 3.14159, 2.0) / 0.01);
    float perfil = uHalo > 0.5 ? pow(vBorde, 2.2) * 0.32 : 0.55 + 0.45 * vBorde;
    vec3 color = uColor * estela + uColorCabeza * (destello * 3.2 + segundo);
    gl_FragColor = vec4(color * perfil * cola * uIntensidad, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function geometria(segmentos, lados) {
  const ring = lados + 1;
  const count = (segmentos + 1) * ring;
  const angulo = new Float32Array(count);
  const seccion = new Float32Array(count * 2);
  const position = new Float32Array(count * 3);
  for (let i = 0; i <= segmentos; i += 1) {
    const a = (i / segmentos) * Math.PI * 2;
    for (let j = 0; j <= lados; j += 1) {
      const b = (j / lados) * Math.PI * 2;
      const k = i * ring + j;
      angulo[k] = a;
      seccion[k * 2] = Math.cos(b);
      seccion[k * 2 + 1] = Math.sin(b);
    }
  }
  const index = [];
  for (let i = 0; i < segmentos; i += 1) {
    for (let j = 0; j < lados; j += 1) {
      const a = i * ring + j;
      const b = a + ring;
      index.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('angulo', new THREE.BufferAttribute(angulo, 1));
  geometry.setAttribute('seccion', new THREE.BufferAttribute(seccion, 2));
  geometry.setIndex(index);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.6);
  return geometry;
}

function material(halo) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRadio: { value: 0.3 },
      uGrosor: { value: halo ? 0.0075 : 0.00085 },
      uColor: { value: ORO.clone() },
      uColorCabeza: { value: ORO_CLARO.clone() },
      uCabeza: { value: 0 },
      uBarrido: { value: Math.PI * 2 },
      uIntensidad: { value: 1 },
      uHalo: { value: halo ? 1 : 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });
}

export function crearAnilloOrbital({ tubo, ladosTubo }) {
  const grupo = new THREE.Group();
  grupo.name = 'vitrina-anillo';
  grupo.rotation.order = 'YXZ';
  const geometry = geometria(tubo, ladosTubo);
  const nucleo = new THREE.Mesh(geometry, material(false));
  const halo = new THREE.Mesh(geometry, material(true));
  nucleo.renderOrder = 6;
  halo.renderOrder = 5;
  nucleo.frustumCulled = false;
  halo.frustumCulled = false;
  grupo.add(halo, nucleo);
  const mats = [nucleo.material, halo.material];

  function aplicar(estado) {
    grupo.position.set(estado.cx, estado.cy, estado.cz);
    grupo.rotation.set(estado.inclinacion, estado.giro, 0);
    for (const m of mats) {
      m.uniforms.uRadio.value = estado.radio;
      m.uniforms.uCabeza.value = estado.cabeza;
      m.uniforms.uBarrido.value = estado.barrido;
      m.uniforms.uIntensidad.value = estado.intensidad;
    }
    nucleo.material.uniforms.uGrosor.value = 0.00085 * estado.grosor;
    halo.material.uniforms.uGrosor.value = 0.0075 * estado.grosor;
  }

  function dispose() {
    geometry.dispose();
    mats.forEach((m) => m.dispose());
  }

  return { grupo, aplicar, dispose };
}
