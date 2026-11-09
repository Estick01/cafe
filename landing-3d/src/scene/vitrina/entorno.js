/*
 * Entorno propio de la vitrina: suelo oscuro que se funde con el fondo, sombras de contacto
 * falsas, reflejo calido del anillo en el suelo, superficie de liquido de la fase emerge y luces de
 * contorno calidas. Todo barato: degradados en canvas y luces sin sombra.
 */
import * as THREE from 'three';

import { LIQUIDO } from '../../logic/vitrina.js';

function radial(size, stops) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  // alphaMap lee el canal verde, no el alfa del lienzo.
  stops.forEach(([s, v]) => { const c = Math.round(v * 255); g.addColorStop(s, `rgb(${c},${c},${c})`); });
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export function crearRecursosEntorno() {
  const fundido = radial(256, [[0, 1], [0.35, 0.95], [0.7, 0.4], [1, 0]]);
  const sombra = radial(128, [[0, 1], [0.45, 0.85], [0.75, 0.3], [1, 0]]);
  const aro = radial(256, [[0, 0], [0.8, 0], [0.9, 0.55], [0.94, 1], [0.97, 0.4], [1, 0]]);
  const charco = radial(256, [[0, 0.9], [0.5, 0.35], [1, 0]]);
  const plano = new THREE.PlaneGeometry(1, 1);
  plano.rotateX(-Math.PI / 2);
  const texturas = [fundido, sombra, aro, charco];
  return {
    fundido, sombra, aro, charco, plano,
    dispose() { texturas.forEach((t) => t.dispose()); plano.dispose(); },
  };
}

export function crearSuelo(recursos, segmentos) {
  const geometry = new THREE.CircleGeometry(1.1, segmentos);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshStandardMaterial({
    color: 0x17120f, roughness: 0.62, metalness: 0, alphaMap: recursos.fundido, transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'vitrina-suelo';
  mesh.renderOrder = 0;
  return mesh;
}

export function crearSombra(recursos, ancho, fondo, opacidad) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, alphaMap: recursos.sombra, transparent: true, opacity: opacidad, depthWrite: false,
  });
  const mesh = new THREE.Mesh(recursos.plano, material);
  mesh.scale.set(ancho, 1, fondo);
  mesh.position.y = 0.0008;
  mesh.renderOrder = 1;
  mesh.userData.opacidad = opacidad;
  return mesh;
}

/* Reflejo aditivo del anillo en el suelo o el liquido; y un charco de luz bajo la elegida. */
export function crearBrillos(recursos) {
  const aro = new THREE.Mesh(recursos.plano, new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.5, 0.26, 0.08, THREE.LinearSRGBColorSpace),
    alphaMap: recursos.aro, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aro.position.y = 0.0012;
  aro.renderOrder = 2;
  const charco = new THREE.Mesh(recursos.plano, new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(0.16, 0.085, 0.035, THREE.LinearSRGBColorSpace),
    alphaMap: recursos.charco, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  charco.position.y = 0.0011;
  charco.renderOrder = 2;
  return { aro, charco };
}

/* Liquido: disco oscuro brillante que se funde con el fondo por el borde. */
export function crearLiquido(recursos, segmentos) {
  const geometry = new THREE.CircleGeometry(LIQUIDO.radio, segmentos);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x1a0c05, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04,
    alphaMap: recursos.fundido, transparent: true, depthWrite: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'vitrina-liquido';
  mesh.position.y = LIQUIDO.y;
  mesh.renderOrder = 3;
  return mesh;
}

const calido = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

/*
 * Luces de la vitrina. Dos contraluces calidos detras (el canto dorado de las bolsas), una clave
 * suave delante y un foco cenital que sigue a la bolsa elegida en la tienda.
 */
export function crearLuces() {
  const grupo = new THREE.Group();
  grupo.name = 'vitrina-luces';
  const rimIzq = new THREE.SpotLight(calido(1, 0.66, 0.36), 2.4, 0, 0.75, 0.9, 2);
  rimIzq.position.set(-0.55, 0.42, -0.55);
  const rimDer = new THREE.SpotLight(calido(1, 0.6, 0.3), 2.2, 0, 0.75, 0.9, 2);
  rimDer.position.set(0.6, 0.3, -0.5);
  const clave = new THREE.SpotLight(calido(1, 0.93, 0.85), 1.2, 0, 0.9, 1, 2);
  clave.position.set(-0.45, 0.65, 0.75);
  const relleno = new THREE.SpotLight(calido(0.75, 0.82, 1), 0.3, 0, 1, 1, 2);
  relleno.position.set(0.7, 0.25, 0.55);
  const foco = new THREE.SpotLight(calido(1, 0.86, 0.66), 0, 0, 0.32, 0.85, 2);
  foco.position.set(0, 0.6, 0.15);
  const objetivo = new THREE.Object3D();
  objetivo.position.set(0, 0.08, 0);
  [rimIzq, rimDer, clave, relleno].forEach((l) => { l.target = objetivo; });
  foco.target.position.set(0, 0.06, 0);
  grupo.add(objetivo, foco.target, rimIzq, rimDer, clave, relleno, foco);
  const base = { rimIzq: rimIzq.intensity, rimDer: rimDer.intensity, clave: clave.intensity, relleno: relleno.intensity };
  return {
    grupo, foco,
    /* nivel: multiplicador de clave y relleno; contra: de los contraluces; focoNivel: del cenital. */
    ajustar(nivel, contra, focoNivel, fx, fz) {
      clave.intensity = base.clave * nivel;
      relleno.intensity = base.relleno * nivel;
      rimIzq.intensity = base.rimIzq * contra;
      rimDer.intensity = base.rimDer * contra;
      foco.intensity = 1.6 * focoNivel;
      foco.position.set(fx, 0.62, fz + 0.12);
      foco.target.position.set(fx, 0.05, fz);
    },
    dispose() { [rimIzq, rimDer, clave, relleno, foco].forEach((l) => l.dispose()); },
  };
}
