/*
 * Logo de la marca como un unico componente: la taza de linea del cliente (MARCA.logo, un SVG que
 * pinta con currentColor) + el nombre tipografico. El SVG se carga una vez y se incrusta para que
 * herede el color del texto; si no llega, queda solo el nombre. Para cambiar el logo basta con
 * cambiar MARCA.logo en src/marca.js.
 */
import { MARCA } from '../marca.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PERMITIDOS = new Set(['svg', 'g', 'path', 'ellipse', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'defs', 'use', 'textPath']);
let cargaLogo = null;

/* Copia solo elementos y atributos de dibujo: el archivo nunca puede colar scripts ni eventos. */
function limpiar(origen) {
  const nombre = origen.localName;
  if (!PERMITIDOS.has(nombre) || nombre === 'title') return null;
  const copia = document.createElementNS(SVG_NS, nombre);
  Array.from(origen.attributes).forEach(({ name, value }) => {
    if (/^on/i.test(name) || /javascript:/i.test(value) || name === 'role' || name === 'aria-label') return;
    copia.setAttribute(name, value);
  });
  origen.childNodes.forEach((hijo) => {
    if (hijo.nodeType === Node.TEXT_NODE) copia.appendChild(document.createTextNode(hijo.textContent));
    else if (hijo.nodeType === Node.ELEMENT_NODE) {
      const limpio = limpiar(hijo);
      if (limpio) copia.appendChild(limpio);
    }
  });
  return copia;
}

function cargarLogo() {
  if (!MARCA.logo) return Promise.resolve(null);
  cargaLogo ??= fetch(MARCA.logo)
    .then((respuesta) => {
      if (!respuesta.ok) throw new Error(`Logo ${respuesta.status}`);
      return respuesta.text();
    })
    .then((texto) => {
      const documento = new DOMParser().parseFromString(texto, 'image/svg+xml');
      const svg = documento.documentElement;
      if (svg.localName !== 'svg' || documento.querySelector('parsererror')) throw new Error('Logo no es SVG');
      return limpiar(svg);
    })
    .catch((error) => {
      console.warn('[co2] Logo no disponible; se usa solo el nombre', error);
      return null;
    });
  return cargaLogo;
}

/* Inserta la taza en un hueco (decorativa: el nombre accesible lo da el enlace o el texto). */
function ponerTaza(hueco) {
  cargarLogo().then((svg) => {
    if (!svg) return;
    const copia = svg.cloneNode(true);
    copia.setAttribute('class', 'logo-taza');
    copia.setAttribute('aria-hidden', 'true');
    copia.setAttribute('focusable', 'false');
    hueco.replaceChildren(copia);
  });
}

/* "CO2 Coffee Lab" -> "Coffee Lab" (lo que acompana al nombre corto). */
function nombreSinCorto() {
  const { nombre, nombreCorto } = MARCA;
  return nombre.startsWith(nombreCorto) ? nombre.slice(nombreCorto.length).trim() || nombre : nombre;
}

/* Logo completo: taza + nombre. El "2" de CO2 va como subindice (solo visual). */
export function crearLogo() {
  const logo = document.createElement('span');
  logo.className = 'logo';
  const taza = document.createElement('span');
  taza.className = 'logo-insignia';
  ponerTaza(taza);
  const texto = document.createElement('span');
  texto.className = 'logo-texto';
  const corto = document.createElement('span');
  corto.className = 'logo-corto';
  const partes = /^(.*?)(\d+)$/.exec(MARCA.nombreCorto);
  if (partes) {
    corto.append(partes[1]);
    const sub = document.createElement('sub');
    sub.textContent = partes[2];
    corto.appendChild(sub);
  } else {
    corto.textContent = MARCA.nombreCorto;
  }
  const resto = document.createElement('span');
  resto.className = 'logo-resto';
  resto.textContent = nombreSinCorto();
  texto.append(corto, resto);
  logo.append(taza, texto);
  return logo;
}

/* Hueco con solo la taza (pantalla de carga, ficha de producto). */
export function crearTaza(clase = 'taza-suelta') {
  const hueco = document.createElement('span');
  hueco.className = clase;
  hueco.setAttribute('aria-hidden', 'true');
  ponerTaza(hueco);
  return hueco;
}

/* Sustituye cada [data-logo] por el componente; el enlace que lo contiene lleva el nombre real. */
export function pintarLogos(raiz = document) {
  raiz.querySelectorAll('[data-logo]').forEach((hueco) => {
    const logo = crearLogo();
    logo.setAttribute('aria-hidden', 'true');
    hueco.replaceWith(logo);
  });
  raiz.querySelectorAll('[data-marca-enlace]').forEach((enlace) => {
    enlace.setAttribute('aria-label', `${MARCA.nombre}, volver al inicio`);
  });
  raiz.querySelectorAll('[data-insignia]').forEach((hueco) => ponerTaza(hueco));
}
