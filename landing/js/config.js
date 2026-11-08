/*
 * Ajustes de la experiencia. Los datos de la fuente de frames viven en
 * js/frames-config.js (generado); aquí solo se decide cómo se usan.
 * Todos los tiempos están en segundos del video original.
 */
window.CafeConfig = Object.freeze({
  frames: window.CafeFrames,

  /* Altura total de la sección con scroll, en vh. El recorrido útil es scrollVh - 100. */
  scrollVh: 700,

  loader: {
    concurrency: 6,
    /* Frames vecinos al actual que se piden antes que el resto. */
    nearbyWindow: 12,
    retryDelayMs: 400,
    /* Con "ahorro de datos" solo se descarga 1 de cada N frames. */
    saveDataStep: 4,
    /* Se pasa al modo estático si falla esta fracción de la secuencia. */
    maxFailRatio: 0.15,
    /* ...o si fallan estos sin que haya cargado ninguno. */
    maxInitialFails: 8,
  },

  /* Debe coincidir con la media query de la distribución lateral en estilos.css. */
  sideLayoutQuery: '(min-width: 1200px) and (min-aspect-ratio: 5/4), (max-height: 520px) and (min-aspect-ratio: 3/2)',

  framing: {
    maxDpr: 2,
    /* Fundido de los bordes del frame cuando no llega al borde de la pantalla (fracción del frame). */
    feather: 0.12,
    /* Muestra de mármol (fracciones del frame) con la que se rellena lo que el frame no cubre. */
    backdrop: { x: 0, y: 0, width: 0.16, height: 0.4, dim: 0.35 },

    /* Texto a la izquierda: el frame cubre la pantalla y se aparta al acercarse la cámara. */
    side: {
      minVisibleY: 0.82,
      keyframes: [
        { time: 0, scale: 1, centerX: 0.6, centerY: 0.5 },
        { time: 5.6, scale: 1, centerX: 0.6, centerY: 0.5 },
        { time: 8.6, scale: 0.88, centerX: 0.66, centerY: 0.56 },
        { time: 10, scale: 0.88, centerX: 0.66, centerY: 0.56 },
      ],
    },

    /* Texto debajo (móvil y tableta): el frame vive en la zona superior. */
    stacked: {
      minVisibleX: 0.7,
      centerX: 0.5,
      areaTopPx: 72,
      areaHeight: 0.62,
    },
  },

  /*
   * start/end delimitan el capítulo; anchor es el instante al que lleva su punto.
   * Los ids corresponden a los <article> de index.html.
   */
  chapters: [
    { id: 'cap-1', start: 0, end: 1.6, anchor: 0 },
    { id: 'cap-2', start: 1.6, end: 3.2, anchor: 2.2 },
    { id: 'cap-3', start: 3.2, end: 5, anchor: 4 },
    { id: 'cap-4', start: 5, end: 7.2, anchor: 5.3 },
    { id: 'cap-5', start: 7.2, end: 10, anchor: 8.8 },
  ],
  chapterFade: 0.28,
  chapterShiftPx: 18,
  /* Fracción del recorrido tras la que desaparece la indicación de deslizar. */
  scrollHintUntil: 0.03,
});
