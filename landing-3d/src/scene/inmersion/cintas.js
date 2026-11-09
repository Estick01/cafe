/*
 * Cintas de texto cinetico: tiras curvas (arcos sobre un cono, con ondulacion) que orbitan el
 * remolino con profundidad. El texto sale de la marca (palabrasCintas) y se dibuja en CanvasTextures
 * cacheadas por lote; cambiar de lote solo cambia la textura, nunca la geometria.
 */
import * as THREE from 'three';

import { palabrasCintas } from '../../logic/inmersion.js';
import { GLSL_COMUN, GLSL_SALIDA } from './glsl.js';

const SEGMENTOS = 220;
const FUENTE = 'Impact, "Haettenschweiler", "Arial Narrow Bold", "Arial Black", sans-serif';

/*
 * Forma de cada cinta (espacio del grupo). radio, semiancho, cono (0 = anillo plano, 90 = cilindro),
 * arco (radianes), ola (amplitud y frecuencia), inclinacion del eje, giro con el scroll.
 */
const FORMAS = Object.freeze([
  { radio: 2.1, semiancho: 0.2, cono: 52, inicio: 0.2, arco: 4.6, ola: 0.22, frecuencia: 2, centro: [0.35, 0.95, -0.35], inclX: 0.32, inclZ: -0.18, giro: 0.9, desfase: 0.0 },
  { radio: 1.45, semiancho: 0.16, cono: 38, inicio: 2.4, arco: 4.2, ola: 0.16, frecuencia: 3, centro: [0.45, 0.55, -0.3], inclX: -0.22, inclZ: 0.28, giro: -1.25, desfase: 1.1 },
  { radio: 2.9, semiancho: 0.24, cono: 62, inicio: 4.1, arco: 4.4, ola: 0.3, frecuencia: 2, centro: [0.6, 1.25, -0.45], inclX: 0.12, inclZ: 0.36, giro: 0.6, desfase: 2.3 },
  { radio: 1.05, semiancho: 0.12, cono: 30, inicio: 1.0, arco: 3.6, ola: 0.1, frecuencia: 3, centro: [0.5, 0.32, -0.42], inclX: -0.35, inclZ: -0.1, giro: 1.6, desfase: 3.7 },
]);

function geometriaCinta(forma) {
  const posiciones = new Float32Array((SEGMENTOS + 1) * 2 * 3);
  const normales = new Float32Array((SEGMENTOS + 1) * 2 * 3);
  const uvs = new Float32Array((SEGMENTOS + 1) * 2 * 2);
  const indices = [];
  const cono = (forma.cono * Math.PI) / 180;
  let largo = 0;
  let previo = null;
  for (let i = 0; i <= SEGMENTOS; i += 1) {
    const t = i / SEGMENTOS;
    const th = forma.inicio + t * forma.arco;
    const rx = Math.cos(th);
    const rz = Math.sin(th);
    const y = forma.ola * Math.sin(forma.frecuencia * th + forma.desfase);
    const punta = Math.min(1, t / 0.05, (1 - t) / 0.05);
    const ancho = forma.semiancho * (0.35 + 0.65 * Math.sqrt(Math.max(0, punta)));
    /* Direccion del ancho: mezcla radial (hacia fuera) y vertical segun el angulo del cono. */
    const bx = -Math.cos(cono) * rx;
    const by = Math.sin(cono);
    const bz = -Math.cos(cono) * rz;
    const cx = forma.radio * rx;
    const cz = forma.radio * rz;
    if (previo) largo += Math.hypot(cx - previo[0], y - previo[1], cz - previo[2]);
    previo = [cx, y, cz];
    /* Normal: tangente x direccion del ancho (u a la derecha, v arriba vistos de frente). */
    const tx = -rz;
    const tz = rx;
    const nx = -tz * by;
    const ny = tz * bx - tx * bz;
    const nz = tx * by;
    const nl = Math.hypot(nx, ny, nz) || 1;
    for (let lado = 0; lado < 2; lado += 1) {
      const v = lado === 0 ? -1 : 1;
      const k = (i * 2 + lado) * 3;
      posiciones[k] = cx + bx * ancho * v;
      posiciones[k + 1] = y + by * ancho * v;
      posiciones[k + 2] = cz + bz * ancho * v;
      normales[k] = nx / nl;
      normales[k + 1] = ny / nl;
      normales[k + 2] = nz / nl;
      const u = (i * 2 + lado) * 2;
      uvs[u] = largo;
      uvs[u + 1] = lado;
    }
    if (i < SEGMENTOS) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
  geometria.setAttribute('normal', new THREE.BufferAttribute(normales, 3));
  geometria.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometria.setIndex(indices);
  geometria.computeBoundingSphere();
  return geometria;
}

/*
 * Estilos de cada cinta a partir de la paleta de la marca: el rojo de acento solo en la primera,
 * el azul rey de la bolsa en la tercera; la del lote lleva una linea con el color de su etiqueta.
 */
function estilos(marca) {
  const c = marca?.colores ?? {};
  const crema = c.crema ?? '#f4f1ec';
  const oscuro = '#1a120c';
  return [
    { fondo: c.acento ?? '#d6362c', texto: crema },
    { fondo: crema, texto: oscuro },
    { fondo: marca?.bolsa?.color ?? '#1f3fa0', texto: crema },
    { fondo: c.caramelo ?? '#c9935f', texto: oscuro },
  ];
}

/* Dibuja una baldosa repetible "TEXTO  ●  " y devuelve textura + proporcion ancho/alto. */
function texturaTexto(texto, estilo, alto, anisotropia, linea) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const tamano = Math.round(alto * 0.66);
  const fuente = `400 ${tamano}px ${FUENTE}`;
  ctx.font = fuente;
  const espacio = Math.round(alto * 0.06);
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${espacio}px`;
  const separador = alto * 0.9;
  const anchoTexto = ctx.measureText(texto).width;
  canvas.width = Math.min(8192, Math.ceil(anchoTexto + separador));
  canvas.height = alto;
  ctx.font = fuente;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${espacio}px`;
  ctx.fillStyle = estilo.fondo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = linea ?? estilo.texto;
  const grosor = Math.max(1, Math.round(alto * 0.025));
  ctx.fillRect(0, Math.round(alto * 0.08), canvas.width, grosor);
  ctx.fillRect(0, Math.round(alto * 0.92) - grosor, canvas.width, grosor);
  ctx.fillStyle = estilo.texto;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(texto, separador * 0.5, alto * 0.53);
  ctx.beginPath();
  ctx.arc(canvas.width - separador * 0.02, alto * 0.5, alto * 0.06, 0, Math.PI * 2);
  ctx.arc(separador * 0.02, alto * 0.5, alto * 0.06, 0, Math.PI * 2);
  ctx.fill();
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  textura.wrapS = THREE.RepeatWrapping;
  textura.anisotropy = anisotropia;
  textura.generateMipmaps = true;
  textura.minFilter = THREE.LinearMipmapLinearFilter;
  return { textura, proporcion: canvas.width / canvas.height };
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vMundo;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mundo = modelMatrix * vec4(position, 1.0);
  vMundo = mundo.xyz;
  gl_Position = projectionMatrix * viewMatrix * mundo;
}
`;

const FRAGMENT = /* glsl */ `
${GLSL_COMUN}
uniform sampler2D uMapa;
uniform float uBaldosa;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vMundo;
void main() {
  /* Por detras se invierte u: el texto se lee bien desde dentro y desde fuera del anillo. */
  float u = vUv.x / uBaldosa;
  vec2 uv = gl_FrontFacing ? vec2(u, vUv.y) : vec2(-u, vUv.y);
  vec3 base = texture2D(uMapa, uv).rgb;
  vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
  vec3 v = normalize(cameraPosition - vMundo);
  vec3 l = normalize(LUZ_DIR);
  float nl = abs(dot(n, l));
  float brillo = pow(max(dot(n, normalize(l + v)), 0.0), 60.0) * 0.5;
  float curva = 0.82 + 0.18 * sin(vUv.y * 3.14159);
  vec3 color = base * (0.62 + 0.55 * nl) * curva + LUZ_COLOR * brillo;
  gl_FragColor = vec4(niebla(color, vMundo), 1.0);
  ${GLSL_SALIDA}
}
`;

export function createCintas({ uniforms, marca, quality }) {
  const alto = quality === 'baja' ? 128 : 256;
  const anisotropia = quality === 'baja' ? 4 : 8;
  const grupo = new THREE.Group();
  grupo.name = 'inmersion-cintas';
  const paleta = estilos(marca);
  const cache = new Map();

  const cintas = FORMAS.map((forma, i) => {
    const material = new THREE.ShaderMaterial({
      name: `inmersion-cinta-${i}`,
      uniforms: { ...uniforms, uMapa: { value: null }, uBaldosa: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.DoubleSide,
    });
    const malla = new THREE.Mesh(geometriaCinta(forma), material);
    malla.name = `inmersion-cinta-${i}`;
    const pivote = new THREE.Group();
    pivote.position.fromArray(forma.centro);
    pivote.rotation.set(forma.inclX, 0, forma.inclZ);
    pivote.add(malla);
    grupo.add(pivote);
    return { forma, malla, material };
  });

  function texturasLote(indice) {
    if (cache.has(indice)) return cache.get(indice);
    const palabras = palabrasCintas(marca, indice);
    const lote = marca?.lotes?.[indice];
    const juego = palabras.map((texto, i) => texturaTexto(texto, paleta[i], alto, anisotropia, i === 1 ? lote?.etiqueta : null));
    cache.set(indice, juego);
    return juego;
  }

  let loteActual = -1;
  function setLote(indice) {
    const total = Math.max(1, marca?.lotes?.length ?? 1);
    const i = Math.min(total - 1, Math.max(0, indice | 0));
    if (i === loteActual) return;
    loteActual = i;
    const juego = texturasLote(i);
    cintas.forEach((cinta, k) => {
      cinta.material.uniforms.uMapa.value = juego[k].textura;
      cinta.material.uniforms.uBaldosa.value = cinta.forma.semiancho * 2 * juego[k].proporcion;
    });
  }

  /* Orbita: cada cinta gira sobre su eje con el scroll; el tiempo solo anade un vaiven lento. */
  function update(s, time) {
    for (let i = 0; i < cintas.length; i += 1) {
      const { forma, malla } = cintas[i];
      malla.rotation.y = forma.giro * s * 1.7 + Math.sin(time * 0.21 + forma.desfase) * 0.03;
      malla.position.y = Math.sin(time * 0.33 + forma.desfase) * 0.02;
    }
  }

  setLote(0);
  return {
    grupo,
    setLote,
    update,
    dispose() {
      for (const cinta of cintas) {
        cinta.malla.geometry.dispose();
        cinta.material.dispose();
      }
      for (const juego of cache.values()) for (const t of juego) t.textura.dispose();
      cache.clear();
    },
  };
}
