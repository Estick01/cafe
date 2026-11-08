/*
 * Ajustes de la experiencia, heredados de la landing de imagenes.
 * Todos los tiempos estan en segundos del scroll: 0-10 la historia (timeline.js) y 10-13 el
 * epilogo de la cuchara y el aroma (logic/epilogue.js).
 */
export const CONFIG = Object.freeze({
  /*
   * Altura total de la seccion con scroll, en vh. El recorrido util es scrollVh - 100: 780 vh para
   * 13 s, el mismo ritmo de antes (60 vh por segundo) con el epilogo al final.
   */
  scrollVh: 880,

  /* Debe coincidir con la media query de la distribucion lateral en css/escena.css. */
  sideLayoutQuery: '(min-width: 1200px) and (min-aspect-ratio: 5/4), (max-height: 520px) and (min-aspect-ratio: 3/2)',

  /*
   * Las cinco etapas de la catacion, sincronizadas con logic/timeline.js. start/end delimitan el
   * capitulo; anchor es el instante al que lleva su punto del riel.
   *   cap-1 Origen ............... el grano flota (0-1,6 s)
   *   cap-2 Molienda y fragancia . cae el chorro y forma el charco (1,6-3,2 s)
   *   cap-3 Infusion y aroma ..... la taza crece con la cinta de cafe (3,2-5 s)
   *   cap-4 Quiebre de la costra . el chorro salta del asa y el grano cae dentro (5-7,2 s)
   *   cap-5 Sorbo y notas ........ taza llena y vapor; la cuchara sorbe y sube el aroma (7,2-13 s)
   */
  chapters: Object.freeze([
    { id: 'cap-1', start: 0, end: 1.6, anchor: 0 },
    { id: 'cap-2', start: 1.6, end: 3.2, anchor: 2.2 },
    { id: 'cap-3', start: 3.2, end: 5, anchor: 4 },
    { id: 'cap-4', start: 5, end: 7.2, anchor: 5.3 },
    { id: 'cap-5', start: 7.2, end: 13, anchor: 8.8 },
  ]),
  chapterFade: 0.28,
  chapterShiftPx: 18,
  /* Etiquetas de aroma del epilogo: solo con sitio de sobra (en movil y calidad baja, no). */
  aromaChipsQuery: '(min-width: 761px) and (pointer: fine)',

  /* Fraccion del recorrido tras la que desaparece la indicacion de deslizar. */
  scrollHintUntil: 0.03,

  assets: Object.freeze({
    manifest: 'assets/models/manifest.json',
    posterFinal: 'assets/poster-final.webp',
  }),

  dpr: Object.freeze({
    max: 2,
    min: 1,
    step: 0.25,
    /* Se baja la resolucion si la mediana de una muestra de fotogramas supera este tiempo. */
    slowFrameMs: 24,
    sampleSize: 40,
    /* Tiempo de gracia tras cada cambio, para no medir el coste del propio cambio. */
    settleFrames: 15,
  }),

  /* Limite de dibujo: en pantallas de 120-144 Hz evita cargar la GPU sin ganancia visible. */
  maxFps: 60,

  /* Tras este tiempo sin scroll ni raton, el movimiento ambiental se dibuja a la mitad de frecuencia. */
  idleAfterMs: 1500,

  parallax: Object.freeze({
    /* Grados de giro de la camara alrededor del objetivo en el borde de la pantalla. */
    yawDegrees: 2.4,
    pitchDegrees: 1.2,
    /* Mayor es mas rapido; independiente de la frecuencia de fotogramas. */
    smoothing: 3.5,
  }),
});
