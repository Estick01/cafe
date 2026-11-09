/*
 * Ajustes de la experiencia. Los tiempos estan en segundos de scroll G (logic/story.js):
 *   0-2.5 vitrina (hero) · 2.5-3.3 anillo · 3.3-13.3 historia (timeline.js) · inmersion (crema y
 *   bajo, INMERSION_DURACION) · emerge · tienda, quieta al final.
 */
export const CONFIG = Object.freeze({
  /*
   * Ritmo del scroll: vh de recorrido por segundo de G. Cada seccion del DOM (#vitrina, #historia,
   * #inmersion, #tienda) mide su tramo de G por este ritmo; la ultima suma una pantalla. Con las
   * duraciones base (23,05 s) son unos 1480 vh en total.
   */
  vhPerSecond: 60,

  /* Secciones del DOM, en orden; sus anclas llevan al instante map.anclas[id] de story.js. */
  sections: Object.freeze(['vitrina', 'historia', 'inmersion', 'tienda']),

  /*
   * Entrada automatica: si la pagina abre arriba y sin scroll, la vitrina hace su entrada sola hasta
   * este G y se queda ahi (sin reinicio); el scroll se coloca en ese punto y sigue desde alli.
   */
  autoplay: Object.freeze({ toG: 2.4, secondsPerG: 1 }),

  /* Debe coincidir con la media query de la distribucion lateral en css/escena.css. */
  sideLayoutQuery: '(min-width: 1200px) and (min-aspect-ratio: 5/4), (max-height: 520px) and (min-aspect-ratio: 3/2)',

  /* Lenis: suavizado de la rueda (lerp por fotograma a 60 Hz). El tacto queda nativo. */
  smoothScroll: Object.freeze({ lerp: 0.11, wheelMultiplier: 1 }),

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
