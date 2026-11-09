/*
 * Historia global del scroll: G (segundos de scroll) -> que se ve, en que fase y como se mezcla.
 * Funcion pura, sin Three ni DOM: mismo G, misma imagen, en cualquier direccion.
 *
 *   hero ........ vitrina 'hero': la linea de productos              0    -> 2.5
 *   transicion .. anillo dorado que se abre en espiral               2.5  -> 3.3
 *   historia .... la historia de 10 s de timeline.js (t = G - 3.3)   3.3  -> 13.3
 *   crema ....... inmersion 'crema' (entra fundiendo el plano final de la taza)
 *   bajo ........ inmersion 'bajo' (bajo el cafe)
 *   emerge ...... vitrina 'emerge': la bolsa elegida sale del cafe
 *   tienda ...... vitrina 'tienda': la linea final, quieta al final (sin bucle ni reinicio)
 *
 * Las duraciones de crema y bajo vienen de INMERSION_DURACION (modulo de inmersion); si faltan,
 * se usan las de DURACIONES_BASE.
 */
import { DURATION } from './timeline.js';

export const DURACIONES_BASE = Object.freeze({
  hero: 2.5,
  transicion: 0.8,
  historia: DURATION,
  crema: 2.0,
  bajo: 3.0,
  emerge: 1.75,
  tienda: 3.0,
});

export const SEGMENTOS = Object.freeze(['hero', 'transicion', 'historia', 'crema', 'bajo', 'emerge', 'tienda']);

/* Secciones que ve la interfaz (anclas #vitrina, #historia, #inmersion, #tienda). */
export const SECCIONES = Object.freeze({
  vitrina: Object.freeze(['hero', 'transicion']),
  historia: Object.freeze(['historia']),
  inmersion: Object.freeze(['crema', 'bajo']),
  tienda: Object.freeze(['emerge', 'tienda']),
});

/*
 * Momentos de la historia de 10 s (segundos de timeline.js), uno por beat de texto del DOM
 * (#historia .beat, en orden). Se solapan para que un texto entre mientras el anterior sale.
 *   tostado ... el grano flota y cae el primer chorro
 *   agua ...... la taza crece con la cinta de cafe
 *   chorro .... el chorro salta del asa y la taza se llena
 *   borde ..... taza llena y vapor
 */
export const HISTORIA_BEATS = Object.freeze([
  Object.freeze({ id: 'tostado', start: 0, end: 2.7 }),
  Object.freeze({ id: 'agua', start: 2.3, end: 5.0 }),
  Object.freeze({ id: 'chorro', start: 4.5, end: 7.8 }),
  Object.freeze({ id: 'borde', start: 7.4, end: DURATION }),
]);

/*
 * Mezclas en los cambios de seccion (segundos):
 *   anillo.cambio .... fraccion de la transicion en que el fondo pasa de vitrina a historia,
 *                      con la pantalla ya a oscuras: el cambio nunca se ve.
 *   buceo ............ al entrar en crema, el ultimo plano de la taza se funde con la inmersion
 *                      mientras su camara baja hacia el cafe.
 *   emerge ........... el ultimo fotograma bajo el cafe se funde con la bolsa que emerge.
 *   camaraTienda ..... la camara pasa de la de 'emerge' a la de 'tienda'.
 */
export const MEZCLAS = Object.freeze({
  anillo: Object.freeze({ oscuro: 0.32, cambio: 0.36 }),
  buceo: 0.7,
  emerge: 0.5,
  camaraTienda: 0.8,
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clamp01 = (value) => clamp(value, 0, 1);
/* Smoothstep cubico, como smooth() de timeline.js pero con extremos ya normalizados. */
const ease = (value) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/* INMERSION_DURACION puede ser { crema, bajo } o un numero (total, repartido 40/60). */
export function duracionesInmersion(valor) {
  if (Number.isFinite(valor) && valor > 0) return { crema: valor * 0.4, bajo: valor * 0.6 };
  if (valor && typeof valor === 'object') {
    return {
      crema: positive(Number(valor.crema), DURACIONES_BASE.crema),
      bajo: positive(Number(valor.bajo), DURACIONES_BASE.bajo),
    };
  }
  return { crema: DURACIONES_BASE.crema, bajo: DURACIONES_BASE.bajo };
}

export function createStoryMap(overrides = {}) {
  const duraciones = Object.freeze(Object.fromEntries(SEGMENTOS.map((name) => (
    [name, name === 'historia' ? DURATION : positive(overrides[name], DURACIONES_BASE[name])]
  ))));
  let cursor = 0;
  const segmentos = Object.freeze(SEGMENTOS.map((name) => {
    const segment = Object.freeze({ name, start: cursor, end: cursor + duraciones[name] });
    cursor = segment.end;
    return segment;
  }));
  const total = cursor;
  const byName = Object.fromEntries(segmentos.map((segment) => [segment.name, segment]));
  const secciones = Object.freeze(Object.fromEntries(Object.entries(SECCIONES).map(([id, names]) => (
    [id, Object.freeze({ id, start: byName[names[0]].start, end: byName[names[names.length - 1]].end })]
  ))));

  /* Instante al que lleva cada ancla: el principio de la seccion, salvo tienda (ya asentada). */
  const anclas = Object.freeze({
    vitrina: 0,
    historia: byName.historia.start,
    inmersion: byName.crema.start,
    tienda: Math.min(total, byName.tienda.start + MEZCLAS.camaraTienda),
  });

  function segmentAt(G) {
    return segmentos.find((segment) => G < segment.end) ?? segmentos[segmentos.length - 1];
  }

  function seccionAt(name) {
    return Object.keys(SECCIONES).find((id) => SECCIONES[id].includes(name));
  }

  /* t de cada beat (0-1, lo que lee la interfaz); activo = el beat mas reciente que ya empezo. */
  function beatsAt(t) {
    const actual = HISTORIA_BEATS.reduce((found, beat, index) => (t >= beat.start ? index : found), 0);
    return Object.freeze(HISTORIA_BEATS.map((beat, index) => Object.freeze({
      id: beat.id,
      t: clamp01((t - beat.start) / (beat.end - beat.start)),
      activo: index === actual,
    })));
  }

  /* Que dibujar: vista principal, vista que se funde por encima (desde) y el anillo. */
  function viewsAt(name, local, duration) {
    const p = clamp01(local / duration);
    switch (name) {
      case 'hero':
        return { vista: { escena: 'vitrina', fase: 'hero', p }, desde: null, anillo: null };
      case 'transicion': {
        const cambio = p >= MEZCLAS.anillo.cambio;
        return {
          vista: cambio ? { escena: 'historia', t: 0 } : { escena: 'vitrina', fase: 'hero', p: 1 },
          desde: null,
          anillo: { u: p },
        };
      }
      case 'historia':
        return { vista: { escena: 'historia', t: clamp(local, 0, DURATION) }, desde: null, anillo: null };
      case 'crema': {
        const k = ease(local / MEZCLAS.buceo);
        return {
          vista: { escena: 'inmersion', fase: 'crema', p },
          desde: k < 1 ? { escena: 'historia', t: DURATION, buceo: k, peso: 1 - k } : null,
          anillo: null,
        };
      }
      case 'bajo':
        return { vista: { escena: 'inmersion', fase: 'bajo', p }, desde: null, anillo: null };
      case 'emerge': {
        const k = ease(local / MEZCLAS.emerge);
        return {
          vista: { escena: 'vitrina', fase: 'emerge', p, camara: { de: 'emerge', a: 'emerge', k: 0 } },
          desde: k < 1 ? { escena: 'inmersion', fase: 'bajo', p: 1, peso: 1 - k } : null,
          anillo: null,
        };
      }
      default: // tienda
        return {
          vista: { escena: 'vitrina', fase: 'tienda', p, camara: { de: 'emerge', a: 'tienda', k: ease(local / MEZCLAS.camaraTienda) } },
          desde: null,
          anillo: null,
        };
    }
  }

  /* Estado completo para un instante G. Inmutable. */
  function at(value) {
    const G = clamp(Number.isFinite(value) ? value : 0, 0, total);
    const segment = segmentAt(G);
    const local = G - segment.start;
    const seccion = seccionAt(segment.name);
    const range = secciones[seccion];
    const historiaT = clamp(G - byName.historia.start, 0, DURATION);
    const views = viewsAt(segment.name, local, segment.end - segment.start);
    const freeze = (view) => (view ? Object.freeze({ ...view, camara: view.camara && Object.freeze({ ...view.camara }) }) : null);
    return Object.freeze({
      G,
      segmento: segment.name,
      local,
      seccion,
      p: clamp01((G - range.start) / (range.end - range.start)),
      t: historiaT,
      beats: beatsAt(historiaT),
      vista: freeze(views.vista),
      desde: freeze(views.desde),
      anillo: views.anillo && Object.freeze(views.anillo),
      final: G >= total,
    });
  }

  return Object.freeze({
    duraciones,
    segmentos,
    secciones,
    anclas,
    total,
    at,
    segment: (name) => byName[name],
  });
}

/* ---------- Scroll <-> G ---------- */

export const gForProgress = (progress, total) => clamp01(progress) * total;
export const progressForG = (G, total) => clamp01(G / total);
export const scrollForG = (G, total, { top, range }) => top + progressForG(G, total) * range;
export const gForScroll = (scrollY, total, { top, range }) => gForProgress((scrollY - top) / Math.max(1, range), total);

/* Altura de la seccion con scroll (vh): recorrido util a vhPorSegundo, mas una pantalla. */
export const scrollVhFor = (total, vhPorSegundo) => Math.round(total * vhPorSegundo) + 100;

/*
 * Alturas (vh) de las cuatro secciones del DOM a vhPorSegundo. El tramo G de cada seccion va de su
 * borde superior al de la siguiente; la ultima suma una pantalla para quedarse fija al final.
 */
export function sectionHeightsVh(map, vhPorSegundo) {
  const ids = Object.keys(SECCIONES);
  return Object.freeze(Object.fromEntries(ids.map((id, index) => {
    const { start, end } = map.secciones[id];
    const extra = index === ids.length - 1 ? 100 : 0;
    return [id, Math.round((end - start) * vhPorSegundo) + extra];
  })));
}

/*
 * Nudos scroll -> G: [{ y, G }] crecientes en y y en G. Con las secciones del DOM:
 * borde superior de cada seccion -> su inicio en G, y el final util de la ultima -> total.
 */
export function knotsFromSections(map, tops, lastEnd) {
  const ids = Object.keys(SECCIONES);
  const knots = ids.map((id) => ({ y: tops[id], G: map.secciones[id].start }));
  knots.push({ y: lastEnd, G: map.total });
  return Object.freeze(knots.map((knot) => Object.freeze(knot)));
}

function validKnots(knots) {
  return Array.isArray(knots) && knots.length >= 2
    && knots.every((k, i) => Number.isFinite(k.y) && Number.isFinite(k.G) && (i === 0 || k.y > knots[i - 1].y));
}

/* Interpolacion lineal por tramos, limitada a los extremos. */
function piecewise(value, knots, from, to) {
  if (value <= knots[0][from]) return knots[0][to];
  for (let i = 1; i < knots.length; i += 1) {
    const a = knots[i - 1];
    const b = knots[i];
    if (value <= b[from]) return b[from] === a[from] ? b[to] : a[to] + ((value - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return knots[knots.length - 1][to];
}

export function gForScrollKnots(scrollY, knots) {
  if (!validKnots(knots)) return 0;
  return piecewise(scrollY, knots, 'y', 'G');
}

export function scrollForGKnots(G, knots) {
  if (!validKnots(knots)) return 0;
  return piecewise(G, knots, 'G', 'y');
}
