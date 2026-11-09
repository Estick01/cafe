/*
 * Bolsa de fondo plano (box pouch) procedural: seccion de rectangulo redondeado con fuelles
 * laterales que se pliegan hacia el sello termico recto de arriba, paneles ligeramente abombados,
 * muesca de apertura y arrugas de hombro. Origen en el centro de la base, Y arriba, frente hacia +Z.
 *
 * UV por paneles (ver DISPOSICION): cada panel ocupa un tramo de u y se recorre de esquina media a
 * esquina media, asi el arte del frente, los laterales y la espalda queda recto y sin estirar.
 */
import * as THREE from 'three';

import { BOLSA } from '../../logic/vitrina.js';

/* Fraccion de altura donde empieza el sello plano superior (lo usa tambien el dibujo). */
export const SELLO_DESDE = 0.93;
export const MUESCA = Object.freeze({ v: 0.962, alto: 0.008, hondo: 0.004 });

/*
 * Reparto del lienzo: [frente, lateral derecho, espalda, lateral izquierdo]. El frente recibe la
 * mitad de la textura porque es lo que se mira; los laterales casi nada.
 */
export const DISPOSICION = Object.freeze([
  Object.freeze({ id: 'frente', u0: 0, u1: 0.5, ancho: BOLSA.ancho }),
  Object.freeze({ id: 'derecho', u0: 0.5, u1: 0.6, ancho: BOLSA.fondo }),
  Object.freeze({ id: 'espalda', u0: 0.6, u1: 0.9, ancho: BOLSA.ancho }),
  Object.freeze({ id: 'izquierdo', u0: 0.9, u1: 1, ancho: BOLSA.fondo }),
]);

const W = BOLSA.ancho;
const H = BOLSA.alto;
const D = BOLSA.fondo;
const RADIO_ESQUINA = 0.0065;
const ABOMBADO = Object.freeze({ frente: 0.0042, lado: 0.0018 });

function perfil(claves, v) {
  if (v <= claves[0][0]) return claves[0][1];
  for (let i = 1; i < claves.length; i += 1) {
    const [v1, y1] = claves[i];
    if (v <= v1) {
      const [v0, y0] = claves[i - 1];
      const t = (v - v0) / (v1 - v0);
      return y0 + (y1 - y0) * t * t * (3 - 2 * t);
    }
  }
  return claves[claves.length - 1][1];
}

/* Medio fondo relativo: fuelles abiertos casi hasta arriba, luego se pliegan hacia el sello. */
const FONDO = [[0, 0.95], [0.012, 0.99], [0.04, 1], [0.66, 0.985], [0.77, 0.88], [0.85, 0.55], [0.905, 0.16], [SELLO_DESDE, 0.025], [1, 0.02]];
const ANCHO = [[0, 0.965], [0.012, 0.992], [0.04, 1], [1, 1]];
/* Cuanto abomban los paneles con la altura (lleno abajo y en medio, plano en el sello). */
const LLENO = [[0, 0.3], [0.08, 0.9], [0.45, 1], [0.75, 0.75], [0.88, 0.25], [SELLO_DESDE, 0], [1, 0]];

/* Esquinas en orden [frente-izq, frente-der, espalda-der, espalda-izq]: signo del centro y angulo inicial. */
const ESQUINAS = [
  { sx: -1, sz: 1, phi: Math.PI },
  { sx: 1, sz: 1, phi: Math.PI / 2 },
  { sx: 1, sz: -1, phi: 0 },
  { sx: -1, sz: -1, phi: -Math.PI / 2 },
];

function muesca(v) {
  const d = Math.abs(v - MUESCA.v) / (MUESCA.alto / H);
  return d < 1 ? MUESCA.hondo * (1 - d) : 0;
}

/* Arrugas de hombro donde los fuelles se pliegan. */
function arruga(x, v) {
  const hombro = Math.max(0, 1 - Math.abs(v - 0.86) / 0.07);
  if (hombro <= 0) return 0;
  const lado = x / (W / 2);
  const pliegues = Math.sin(lado * 8.0 + v * 37) * 0.6 + Math.sin(lado * 15.0 - v * 59) * 0.4;
  return pliegues * hombro * hombro * 0.0011 * (0.35 + Math.abs(lado));
}

function esquina(c, a, b, rc, phi, out) {
  out.x = c.sx * (a - rc) + rc * Math.cos(phi);
  out.z = c.sz * (b - rc) + rc * Math.sin(phi);
}

/*
 * Punto del panel `i` en el parametro s (0..1, de esquina media a esquina media) y altura v.
 * Escribe tambien la normal exterior del tramo en out.nx/out.nz (aprox.).
 */
function punto(i, s, v, out) {
  const a = (W / 2) * perfil(ANCHO, v);
  const b = Math.max(0.0006, (D / 2) * perfil(FONDO, v));
  const rc = Math.min(RADIO_ESQUINA, b * 0.92, a * 0.5);
  const q = (Math.PI * rc) / 2;
  const c0 = ESQUINAS[i];
  const c1 = ESQUINAS[(i + 1) % 4];
  const lateral = i % 2 === 1;
  const L = lateral ? 2 * (b - rc) : 2 * (a - rc);
  const d = s * (q + L);
  let recto = -1;
  if (d < q / 2) {
    const phi = c0.phi - Math.PI / 4 - (q > 0 ? (d / (q / 2)) * (Math.PI / 4) : 0);
    esquina(c0, a, b, rc, phi, out);
  } else if (d <= q / 2 + L) {
    recto = L > 0 ? (d - q / 2) / L : 0.5;
    const ex = c0.sx * (a - rc) + rc * Math.cos(c0.phi - Math.PI / 2);
    const ez = c0.sz * (b - rc) + rc * Math.sin(c0.phi - Math.PI / 2);
    const sx = c1.sx * (a - rc) + rc * Math.cos(c1.phi);
    const sz = c1.sz * (b - rc) + rc * Math.sin(c1.phi);
    out.x = ex + (sx - ex) * recto;
    out.z = ez + (sz - ez) * recto;
  } else {
    const phi = c1.phi - (q > 0 ? ((d - q / 2 - L) / (q / 2)) * (Math.PI / 4) : Math.PI / 4);
    esquina(c1, a, b, rc, phi, out);
  }
  /* Abombado solo en el tramo recto, nulo en sus extremos para no romper la esquina. */
  if (recto >= 0) {
    const lleno = perfil(LLENO, v);
    const t = 2 * recto - 1;
    const bulto = (1 - t * t) * lleno * (lateral ? ABOMBADO.lado : ABOMBADO.frente);
    if (i === 0) out.z += bulto + arruga(out.x, v);
    else if (i === 2) out.z -= bulto + arruga(out.x, v);
    else if (i === 1) out.x += bulto;
    else out.x -= bulto;
  }
  const m = muesca(v);
  if (m > 0 && out.x > a - 0.006) out.x -= m * Math.min(1, (out.x - (a - 0.006)) / 0.006);
  out.y = v * H;
  return out;
}

/* Parametros de columna: mas densos cerca de las esquinas. */
function columnas(n) {
  const list = [];
  for (let k = 0; k < n; k += 1) {
    const s = k / n;
    list.push(s - (Math.sin(2 * Math.PI * s) / (2 * Math.PI)) * 0.55);
  }
  return list;
}

function filas(total) {
  const base = [0, 0.006, 0.016, 0.03];
  const cuerpo = Math.round(total * 0.5);
  const hombro = Math.round(total * 0.36);
  const sello = Math.max(3, total - base.length - cuerpo - hombro);
  const list = [...base];
  for (let i = 0; i < cuerpo; i += 1) list.push(0.045 + ((0.74 - 0.045) * i) / cuerpo);
  for (let i = 0; i < hombro; i += 1) list.push(0.74 + ((0.95 - 0.74) * i) / hombro);
  for (let i = 0; i <= sello; i += 1) list.push(0.95 + (0.05 * i) / sello);
  return list;
}

export function reparto(totalColumnas) {
  const lado = Math.max(4, Math.round(totalColumnas * 0.15));
  const espalda = Math.max(8, Math.round(totalColumnas * 0.3));
  const frente = Math.max(10, totalColumnas - 2 * lado - espalda);
  return [frente, lado, espalda, lado];
}

export function crearGeometriaBolsa({ columnas: totalColumnas, filas: totalFilas }) {
  const vs = filas(totalFilas);
  const porPanel = reparto(totalColumnas);
  const cols = [];
  porPanel.forEach((n, i) => columnas(n).forEach((s) => cols.push([i, s])));
  cols.push([3, 1]); // cierre de la costura (misma posicion que la primera columna)
  const ring = cols.length;
  const lateral = vs.length * ring;
  const pos = new Float32Array((lateral + 2) * 3);
  const uv = new Float32Array((lateral + 2) * 2);
  const p = { x: 0, y: 0, z: 0 };
  vs.forEach((v, r) => {
    cols.forEach(([i, s], j) => {
      punto(i, s, v, p);
      const k = r * ring + j;
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      const panel = DISPOSICION[i];
      uv[k * 2] = panel.u0 + (panel.u1 - panel.u0) * s;
      uv[k * 2 + 1] = v;
    });
  });
  const base = lateral;
  const techo = lateral + 1;
  pos.set([0, 0, 0], base * 3);
  uv.set([0.25, 0], base * 2);
  pos.set([0, H, 0], techo * 3);
  uv.set([0.25, 1], techo * 2);

  const index = [];
  for (let r = 0; r < vs.length - 1; r += 1) {
    for (let j = 0; j < ring - 1; j += 1) {
      const a = r * ring + j;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const top = (vs.length - 1) * ring;
  for (let j = 0; j < ring - 1; j += 1) {
    index.push(base, j + 1, j);
    index.push(top + j, top + j + 1, techo);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  soldarCostura(geometry, vs.length, ring);
  geometry.computeBoundingSphere();
  return geometry;
}

function soldarCostura(geometry, rows, ring) {
  const n = geometry.attributes.normal;
  for (let r = 0; r < rows; r += 1) {
    const a = r * ring;
    const b = a + ring - 1;
    const x = n.getX(a) + n.getX(b);
    const y = n.getY(a) + n.getY(b);
    const z = n.getZ(a) + n.getZ(b);
    const len = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / len, y / len, z / len);
    n.setXYZ(b, x / len, y / len, z / len);
  }
}

/*
 * Punto y normal sobre un panel: s en [0,1] a lo ancho del panel (como el arte), v en [0,1].
 * Sirve para posar la valvula sobre la superficie abombada.
 */
export function puntoEnPanel(panel, s, v, outPos, outNormal) {
  const i = DISPOSICION.findIndex((d) => d.id === panel);
  const p = { x: 0, y: 0, z: 0 };
  const q = { x: 0, y: 0, z: 0 };
  const r = { x: 0, y: 0, z: 0 };
  punto(i, s, v, p);
  punto(i, s + 0.01, v, q);
  punto(i, s, v + 0.01, r);
  outPos.set(p.x, p.y, p.z);
  const tu = new THREE.Vector3(q.x - p.x, q.y - p.y, q.z - p.z);
  const tv = new THREE.Vector3(r.x - p.x, r.y - p.y, r.z - p.z);
  outNormal.crossVectors(tu, tv).normalize();
  return outPos;
}

/* Valvula desgasificadora: disco con aro, eje hacia +Z. */
export function crearValvula(segmentos) {
  const perfilValvula = [
    new THREE.Vector2(0, 0.0017),
    new THREE.Vector2(0.0048, 0.0017),
    new THREE.Vector2(0.0054, 0.0023),
    new THREE.Vector2(0.0066, 0.0023),
    new THREE.Vector2(0.0075, 0.0015),
    new THREE.Vector2(0.0102, 0.0009),
    new THREE.Vector2(0.0112, 0.0),
  ];
  const geometry = new THREE.LatheGeometry(perfilValvula, segmentos);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}
