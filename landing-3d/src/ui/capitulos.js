/*
 * Coreografia de las secciones con scroll, guiada solo por historia:progreso (determinista: el
 * mismo progreso da siempre la misma imagen, hacia delante o hacia atras).
 *
 *  - vitrina: el texto sale al final (--salida) y la indicacion de deslizar se oculta.
 *  - historia: cada beat tiene un tramo local t = 0..1. Por defecto t sale de p y de los
 *    data-desde/data-hasta del beat; si el evento trae `beats` (array de numeros 0..1, uno por
 *    beat y en orden), se usa ese t directamente. CSS lee --entra y --sale de cada beat.
 *  - inmersion: dos palabras gigantes (CREMA -> ORIGEN) y una linea corta.
 */
import { alProgreso, clamp, crearEscritor, dosCifras, suave } from './util.js';

const ENTRADA = Object.freeze([0, 0.24]);
const SALIDA = Object.freeze([0.8, 1]);
const VISIBLE = 0.001;

function prepararBeats(seccion) {
  return Array.from(seccion.querySelectorAll('.beat'), (elemento, indice, todos) => ({
    elemento,
    escribir: crearEscritor(elemento),
    desde: Number(elemento.dataset.desde ?? indice / todos.length),
    hasta: Number(elemento.dataset.hasta ?? (indice + 1) / todos.length),
    visible: null,
  }));
}

function tramoLocal(beat, indice, p, beatsExternos) {
  const externo = beatsExternos?.[indice];
  const valor = typeof externo === 'object' && externo !== null ? externo.t : externo;
  if (Number.isFinite(valor)) return clamp(valor);
  return clamp((p - beat.desde) / Math.max(0.0001, beat.hasta - beat.desde));
}

function initHistoria(seccion) {
  if (!seccion) return;
  const beats = prepararBeats(seccion);
  const numero = seccion.querySelector('[data-beat-numero]');
  const escribir = crearEscritor(seccion);
  let activo = -1;

  alProgreso(({ seccion: nombre, p, beats: externos }) => {
    if (nombre !== 'historia') return;
    escribir('--p', p);
    let mejor = 0;
    let mejorPeso = -1;
    beats.forEach((beat, indice) => {
      const t = tramoLocal(beat, indice, p, externos);
      // El primero ya esta dentro al empezar y el ultimo no sale: no hay hueco vacio en los bordes.
      const entra = indice === 0 ? 1 : suave(ENTRADA[0], ENTRADA[1], t);
      const sale = indice === beats.length - 1 ? 0 : suave(SALIDA[0], SALIDA[1], t);
      beat.escribir('--entra', entra);
      beat.escribir('--sale', sale);
      const visible = entra > VISIBLE && sale < 1 - VISIBLE;
      if (visible !== beat.visible) {
        beat.visible = visible;
        beat.elemento.classList.toggle('activo', visible);
      }
      const peso = entra * (1 - sale);
      if (peso > mejorPeso) { mejorPeso = peso; mejor = indice; }
    });
    if (mejor !== activo) {
      activo = mejor;
      if (numero) numero.textContent = dosCifras(activo + 1);
    }
  });
}

function initVitrina(seccion) {
  if (!seccion) return;
  const escribir = crearEscritor(seccion);
  const indicacion = document.getElementById('indicacion');
  alProgreso(({ seccion: nombre, p }) => {
    if (nombre !== 'vitrina') return;
    escribir('--p', p);
    escribir('--salida', suave(0.78, 0.99, p));
    indicacion?.classList.toggle('oculto', p > 0.04);
  });
}

function initInmersion(seccion) {
  if (!seccion) return;
  const escribir = crearEscritor(seccion);
  alProgreso(({ seccion: nombre, p }) => {
    if (nombre !== 'inmersion') return;
    escribir('--p', p);
    escribir('--crema', suave(0, 0.12, p) * (1 - suave(0.36, 0.52, p)));
    escribir('--origen', suave(0.46, 0.62, p) * (1 - suave(0.9, 1, p)));
    escribir('--linea', suave(0.56, 0.7, p) * (1 - suave(0.92, 1, p)));
  });
}

export function initCapitulos() {
  initVitrina(document.getElementById('vitrina'));
  initHistoria(document.getElementById('historia'));
  initInmersion(document.getElementById('inmersion'));
}
