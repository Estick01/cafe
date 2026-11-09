/* Historia global (G) y reproduccion automatica de la entrada sin reinicio. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTOPLAY_IDLE, interruptAutoplay, needsScrollSync, releaseAutoplay, renderedG, startAutoplay, stepAutoplay,
} from '../src/logic/autoplay.js';
import {
  DURACIONES_BASE, HISTORIA_BEATS, MEZCLAS, SEGMENTOS, createStoryMap, duracionesInmersion, gForScroll,
  progressForG, scrollForG, scrollVhFor,
} from '../src/logic/story.js';
import { DURATION } from '../src/logic/timeline.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const map = createStoryMap();
const steps = (from, to, count) => Array.from({ length: count + 1 }, (_, i) => from + ((to - from) * i) / count);

test('mapa: segmentos contiguos en el orden pedido y total coherente', () => {
  assert.deepEqual(map.segmentos.map((s) => s.name), SEGMENTOS);
  assert.equal(map.segmentos[0].start, 0);
  map.segmentos.slice(1).forEach((segment, i) => close(segment.start, map.segmentos[i].end));
  close(map.segment('historia').start, 3.3);
  close(map.segment('historia').end, 13.3);
  const expected = Object.values(DURACIONES_BASE).reduce((sum, value) => sum + value, 0);
  close(map.total, expected);
});

test('mapa: duraciones de la inmersion desde INMERSION_DURACION', () => {
  const custom = createStoryMap(duracionesInmersion({ crema: 1.5, bajo: 2.5 }));
  close(custom.segment('crema').start, 13.3);
  close(custom.segment('bajo').end, 13.3 + 4);
  assert.deepEqual(duracionesInmersion(5), { crema: 2, bajo: 3 });
  assert.deepEqual(duracionesInmersion(null), { crema: DURACIONES_BASE.crema, bajo: DURACIONES_BASE.bajo });
  assert.deepEqual(duracionesInmersion({ crema: -1, bajo: 'x' }), { crema: DURACIONES_BASE.crema, bajo: DURACIONES_BASE.bajo });
  // La historia no se puede alargar ni acortar: es timeline.js.
  assert.equal(createStoryMap({ historia: 3 }).duraciones.historia, DURATION);
});

test('historia: t = G - 3.3, limitado a [0, 10]', () => {
  for (const t of [0, 1.234, 5, 9.99]) {
    const state = map.at(3.3 + t);
    assert.equal(state.segmento, 'historia');
    assert.equal(state.vista.escena, 'historia');
    close(state.vista.t, t, 1e-9);
    close(state.t, t, 1e-9);
  }
  assert.equal(map.at(0).t, 0);
  assert.equal(map.at(map.total).t, DURATION);
});

test('secciones y p de la interfaz', () => {
  assert.equal(map.at(0).seccion, 'vitrina');
  assert.equal(map.at(2.9).seccion, 'vitrina');
  assert.equal(map.at(4).seccion, 'historia');
  assert.equal(map.at(13.4).seccion, 'inmersion');
  assert.equal(map.at(map.segment('emerge').start + 0.1).seccion, 'tienda');
  assert.equal(map.at(map.total).seccion, 'tienda');
  close(map.at(8.3).p, 0.5);
  assert.equal(map.at(map.total).p, 1);
  for (const G of steps(0, map.total, 400)) {
    const { p } = map.at(G);
    assert.ok(p >= 0 && p <= 1);
  }
});

test('transicion: el fondo cambia solo con la pantalla ya oscura', () => {
  const { start, end } = map.segment('transicion');
  const switchG = start + (end - start) * MEZCLAS.anillo.cambio;
  assert.equal(map.at(switchG - 1e-6).vista.escena, 'vitrina');
  assert.equal(map.at(switchG + 1e-6).vista.escena, 'historia');
  assert.ok(MEZCLAS.anillo.oscuro < MEZCLAS.anillo.cambio);
  assert.equal(map.at(start + 0.01).anillo !== null, true);
  assert.equal(map.at(end + 0.01).anillo, null);
  // A ambos lados del cambio de historia, la historia esta en t = 0: sin salto.
  assert.equal(map.at(end - 1e-6).vista.t, 0);
  close(map.at(end + 1e-6).vista.t, 1e-6, 1e-9);
});

test('inmersion: entra fundiendo el plano final de la historia, sin corte', () => {
  const { start } = map.segment('crema');
  const before = map.at(start - 1e-6);
  const after = map.at(start + 1e-6);
  assert.equal(before.vista.escena, 'historia');
  assert.equal(after.desde.escena, 'historia');
  assert.equal(after.desde.t, DURATION);
  close(after.desde.peso, 1, 1e-6);
  close(after.desde.buceo, 0, 1e-6);
  assert.equal(map.at(start + MEZCLAS.buceo + 0.01).desde, null);
  // El peso del plano anterior solo baja.
  const weights = steps(start, start + MEZCLAS.buceo, 60).map((G) => map.at(G).desde?.peso ?? 0);
  weights.slice(1).forEach((w, i) => assert.ok(w <= weights[i] + 1e-12));
});

test('emerge y tienda: fundido desde bajo el cafe y camara continua', () => {
  const emerge = map.segment('emerge');
  const tienda = map.segment('tienda');
  const first = map.at(emerge.start + 1e-6);
  assert.equal(first.desde.escena, 'inmersion');
  assert.equal(first.desde.fase, 'bajo');
  assert.equal(first.desde.p, 1);
  close(first.desde.peso, 1, 1e-6);
  const endEmerge = map.at(tienda.start - 1e-6);
  const startTienda = map.at(tienda.start + 1e-6);
  assert.equal(endEmerge.vista.camara.a, 'emerge');
  assert.equal(startTienda.vista.camara.de, 'emerge');
  close(startTienda.vista.camara.k, 0, 1e-6);
  assert.equal(map.at(map.total).vista.camara.k, 1);
});

test('final: quieto en la tienda, sin bucle ni reinicio', () => {
  const end = map.at(map.total);
  assert.equal(end.final, true);
  assert.deepEqual(map.at(map.total + 50), end);
  assert.deepEqual(map.at(Number.POSITIVE_INFINITY).vista, map.at(0).vista); // no finito -> 0, no "fin"
  assert.equal(map.at(Number.NaN).G, 0);
  assert.equal(end.vista.escena, 'vitrina');
  assert.equal(end.vista.fase, 'tienda');
  assert.equal(end.vista.p, 1);
});

test('mismo G, mismo estado, en cualquier direccion', () => {
  const Gs = steps(0, map.total, 300);
  const forward = Gs.map((G) => map.at(G));
  const backward = [...Gs].reverse().map((G) => map.at(G)).reverse();
  assert.deepEqual(forward, backward);
  assert.ok(Object.isFrozen(forward[100]));
  assert.ok(Object.isFrozen(forward[100].vista));
});

test('beats: un tramo t por beat de texto, en orden', () => {
  const state = map.at(3.3 + 6);
  assert.deepEqual(state.beats.map((b) => b.id), HISTORIA_BEATS.map((b) => b.id));
  assert.equal(state.beats.find((b) => b.activo).id, 'chorro');
  assert.equal(state.beats.filter((b) => b.activo).length, 1);
  assert.equal(map.at(3.3).beats[0].t, 0);
  assert.equal(map.at(map.total).beats.at(-1).t, 1);
  assert.equal(map.at(map.total).beats.find((b) => b.activo).id, 'borde');
  state.beats.forEach((b) => assert.ok(b.t >= 0 && b.t <= 1));
});

test('anclas dentro del recorrido y en su seccion', () => {
  for (const [id, G] of Object.entries(map.anclas)) {
    assert.ok(G >= 0 && G <= map.total);
    assert.equal(map.at(G + 1e-6).seccion, id);
  }
});

test('scroll <-> G: ida y vuelta exacta', () => {
  const measure = { top: 120, range: 9000 };
  for (const G of steps(0, map.total, 50)) close(gForScroll(scrollForG(G, map.total, measure), map.total, measure), G, 1e-9);
  assert.equal(progressForG(-3, map.total), 0);
  assert.equal(progressForG(1e6, map.total), 1);
  assert.equal(scrollVhFor(10, 60), 700);
});

/* ---------- Reproduccion automatica: el fallo de "se reinicia al terminar" ---------- */

const PLAY = { fromG: 0, toG: 2.2, seconds: 2.2 };

test('autoplay: avanza con el reloj y, al terminar, sostiene el ultimo instante', () => {
  let state = startAutoplay(1000, PLAY);
  assert.equal(state.phase, 'reproduciendo');
  state = stepAutoplay(state, 2100);
  close(state.G, 1.1);
  state = stepAutoplay(state, 1000 + 2200 + 500);
  assert.equal(state.phase, 'sosteniendo');
  assert.equal(state.G, PLAY.toG);
  // El scroll sigue en 0: la imagen NO vuelve al principio.
  assert.equal(renderedG(state, 0), PLAY.toG);
  assert.equal(needsScrollSync(state), true);
  // Pasos posteriores no lo mueven.
  assert.equal(stepAutoplay(state, 99999), state);
});

test('autoplay: solo suelta el control cuando el scroll ya coincide', () => {
  let state = stepAutoplay(startAutoplay(0, PLAY), 1e6);
  state = releaseAutoplay(state, 0);
  assert.equal(state.phase, 'sosteniendo');
  assert.equal(renderedG(state, 0), PLAY.toG);
  state = releaseAutoplay(state, PLAY.toG + 0.001);
  assert.equal(state.phase, 'libre');
  // Ya libre: manda el scroll, que empieza donde estaba la imagen.
  close(renderedG(state, PLAY.toG + 0.001), PLAY.toG + 0.001);
});

test('autoplay: a lo largo de toda la secuencia, el G dibujado nunca retrocede solo', () => {
  let state = startAutoplay(0, PLAY);
  let scrollG = 0;
  let last = -Infinity;
  for (let now = 0; now <= 4000; now += 16) {
    state = stepAutoplay(state, now);
    if (needsScrollSync(state) && now > 3000) scrollG = state.G; // el scroll llega un poco despues
    state = releaseAutoplay(state, scrollG);
    const G = renderedG(state, scrollG);
    assert.ok(G >= last - 1e-12, `retrocede en ${now} ms: ${G} < ${last}`);
    last = G;
  }
  assert.equal(state.phase, 'libre');
  assert.equal(last, PLAY.toG);
});

test('autoplay: si el visitante desliza a mitad, se sostiene el instante actual', () => {
  let state = stepAutoplay(startAutoplay(0, PLAY), 1000);
  state = interruptAutoplay(state);
  assert.equal(state.phase, 'sosteniendo');
  close(renderedG(state, 0), 1);
  assert.equal(stepAutoplay(state, 5000).G, state.G);
});

test('autoplay: entradas no validas no arrancan nada', () => {
  assert.equal(startAutoplay(0, { fromG: 2, toG: 1, seconds: 1 }), AUTOPLAY_IDLE);
  assert.equal(startAutoplay(0, { toG: 1, seconds: 0 }), AUTOPLAY_IDLE);
  assert.equal(renderedG(AUTOPLAY_IDLE, 3), 3);
});

/* ---------- Secciones del DOM: nudos scroll -> G ---------- */
import { gForScrollKnots, knotsFromSections, scrollForGKnots, sectionHeightsVh } from '../src/logic/story.js';

test('secciones del DOM: alturas proporcionales y nudos en los bordes', () => {
  const heights = sectionHeightsVh(map, 60);
  close(heights.historia, 600);
  close(heights.vitrina, Math.round(3.3 * 60));
  assert.equal(heights.tienda, Math.round((map.secciones.tienda.end - map.secciones.tienda.start) * 60) + 100);
  const vh = 900;
  let y = 0;
  const tops = {};
  for (const id of ['vitrina', 'historia', 'inmersion', 'tienda']) {
    tops[id] = y;
    y += (heights[id] / 100) * vh;
  }
  const knots = knotsFromSections(map, tops, y - vh);
  assert.equal(gForScrollKnots(tops.historia, knots), map.segment('historia').start);
  assert.equal(gForScrollKnots(tops.inmersion, knots), map.segment('crema').start);
  assert.equal(gForScrollKnots(y - vh, knots), map.total);
  assert.equal(gForScrollKnots(y + 5000, knots), map.total); // mas abajo: quieto al final
  assert.equal(gForScrollKnots(-100, knots), 0);
  for (const G of steps(0, map.total, 80)) close(gForScrollKnots(scrollForGKnots(G, knots), knots), G, 1e-9);
  // Monotono: bajar nunca hace retroceder la historia.
  let last = -1;
  for (const s of steps(-200, y + 200, 500)) {
    const G = gForScrollKnots(s, knots);
    assert.ok(G >= last);
    last = G;
  }
  assert.equal(gForScrollKnots(10, [{ y: 0, G: 0 }]), 0);
});
