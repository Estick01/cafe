/*
 * Etiquetas flotantes de los lotes (nombre + resumen) que apuntan a cada bolsa 3D.
 * La posicion llega en `anchors` de historia:progreso: [{ id, x, y, visible, opacity? }] en px de
 * la ventana; id = lote.id de src/marca.js. Solo se muestran en la vitrina y en la tienda.
 */
import { MARCA, resumenLote } from '../marca.js';
import { alProgreso, clamp, crear } from './util.js';

const SECCIONES_CON_ETIQUETAS = new Set(['vitrina', 'tienda']);
/* Margen para no meterse bajo la navegacion ni salirse por los lados. */
const MARGEN_SUPERIOR = 96;
const MARGEN_LATERAL = 16;

function crearEtiqueta(lote) {
  const etiqueta = crear('div', 'etiqueta');
  etiqueta.dataset.id = lote.id;
  etiqueta.style.setProperty('--color-lote', lote.etiqueta);
  const caja = crear('span', 'etiqueta-caja');
  caja.append(crear('span', 'etiqueta-nombre', lote.nombre), crear('span', 'etiqueta-resumen', resumenLote(lote)));
  etiqueta.append(crear('span', 'etiqueta-punto'), crear('span', 'etiqueta-linea'), caja);
  return { id: lote.id, elemento: etiqueta, ultimo: '', visible: false };
}

export function initEtiquetas(contenedor = document.getElementById('etiquetas-lotes')) {
  if (!contenedor) return null;
  const etiquetas = MARCA.lotes.map(crearEtiqueta);
  contenedor.replaceChildren(...etiquetas.map(({ elemento }) => elemento));
  let seccionActual = '';

  function ocultar(etiqueta) {
    if (!etiqueta.visible) return;
    etiqueta.visible = false;
    etiqueta.elemento.classList.remove('visible');
  }

  function colocar(etiqueta, anchor) {
    const ancho = window.innerWidth;
    const x = clamp(anchor.x, MARGEN_LATERAL, ancho - MARGEN_LATERAL);
    const y = Math.max(MARGEN_SUPERIOR, anchor.y);
    const lado = anchor.x < ancho / 2 ? 'izq' : 'der';
    const opacidad = Number.isFinite(anchor.opacity) ? clamp(anchor.opacity) : 1;
    const firma = `${x.toFixed(1)}|${y.toFixed(1)}|${lado}|${opacidad.toFixed(2)}`;
    if (!etiqueta.visible) {
      etiqueta.visible = true;
      etiqueta.elemento.classList.add('visible');
    }
    if (firma === etiqueta.ultimo) return;
    etiqueta.ultimo = firma;
    const { style, dataset } = etiqueta.elemento;
    style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    style.setProperty('--opacidad', opacidad.toFixed(2));
    dataset.lado = lado;
  }

  alProgreso(({ seccion, anchors }) => {
    if (seccion !== seccionActual) {
      seccionActual = seccion;
      contenedor.dataset.seccion = seccion;
    }
    const activa = SECCIONES_CON_ETIQUETAS.has(seccion);
    etiquetas.forEach((etiqueta) => {
      const anchor = activa ? anchors.find((item) => item?.id === etiqueta.id) : null;
      const valido = anchor && anchor.visible !== false && Number.isFinite(anchor.x) && Number.isFinite(anchor.y);
      if (valido) colocar(etiqueta, anchor);
      else ocultar(etiqueta);
    });
  });

  document.addEventListener('tienda:seleccion', (evento) => {
    const { id } = evento.detail ?? {};
    etiquetas.forEach(({ id: propio, elemento }) => elemento.classList.toggle('seleccionada', propio === id));
  });

  return Object.freeze({ ocultarTodas: () => etiquetas.forEach(ocultar) });
}
