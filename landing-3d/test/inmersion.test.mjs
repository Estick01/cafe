/* Inmersion en la crema: camara continua, determinista y textos solo con datos reales de marca. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ANCLA_BOLSA, CLAVES_CAMARA, INMERSION_DURACION, PALABRA_CREMA, camaraInmersion, focoInmersion, hash01,
  ladosVisibles, palabrasCintas, progresoInmersion, smoothstep,
} from '../src/logic/inmersion.js';
import { MARCA } from '../src/marca.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const CANALES = ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'fov'];
const barrido = (n) => Array.from({ length: n + 1 }, (_, i) => i / n);

test('duraciones sugeridas: crema y bajo positivas y cortas', () => {
  assert.ok(INMERSION_DURACION.crema > 0 && INMERSION_DURACION.crema <= 5);
  assert.ok(INMERSION_DURACION.bajo > 0 && INMERSION_DURACION.bajo <= 5);
  assert.ok(Object.isFrozen(INMERSION_DURACION));
});

test('progreso: crema 0..1, bajo 1..2, acotado y tolerante a valores invalidos', () => {
  assert.equal(progresoInmersion('crema', 0), 0);
  assert.equal(progresoInmersion('crema', 1), 1);
  assert.equal(progresoInmersion('bajo', 0), 1);
  assert.equal(progresoInmersion('bajo', 1), 2);
  assert.equal(progresoInmersion('bajo', 7), 2);
  assert.equal(progresoInmersion('crema', -3), 0);
  assert.equal(progresoInmersion('crema', Number.NaN), 0);
});

test('camara: empieza cenital sobre el remolino para empalmar con el plano de la taza', () => {
  const pose = camaraInmersion('crema', 0);
  close(pose.pitch, -Math.PI / 2, 1e-6);
  close(pose.x, 0, 1e-6);
  close(pose.z, 0, 1e-6);
  assert.ok(pose.y > 4);
  close(pose.yaw, 0);
});

test('camara: continua al cruzar de crema a bajo (mismo cuadro en p=1 y p=0)', () => {
  const fin = camaraInmersion('crema', 1, {});
  const inicio = camaraInmersion('bajo', 0, {});
  for (const canal of CANALES) close(fin[canal], inicio[canal], 1e-9);
  assert.ok(fin.y < 0, 'en p=1 ya cruzo la superficie');
});

test('camara: sin saltos ni NaN en todo el recorrido y determinista', () => {
  let previa = null;
  for (const fase of ['crema', 'bajo']) {
    for (const p of barrido(400)) {
      const pose = camaraInmersion(fase, p, {});
      for (const canal of CANALES) assert.ok(Number.isFinite(pose[canal]), `${fase} ${p} ${canal}`);
      assert.deepEqual(camaraInmersion(fase, p, {}), pose);
      if (previa) {
        const salto = Math.hypot(pose.x - previa.x, pose.y - previa.y, pose.z - previa.z);
        assert.ok(salto < 0.06, `salto de posicion ${salto} en ${fase} ${p}`);
        assert.ok(Math.abs(pose.pitch - previa.pitch) < 0.05, `salto de pitch en ${fase} ${p}`);
      }
      previa = pose;
    }
  }
});

test('camara: arriba de la crema durante casi toda la fase crema y abajo en toda la fase bajo', () => {
  for (const p of barrido(100)) {
    if (p <= 0.95) assert.ok(camaraInmersion('crema', p).y > 0.05, `crema ${p}`);
    assert.ok(camaraInmersion('bajo', p).y < -0.1, `bajo ${p}`);
  }
  const arriba = ladosVisibles('crema', 0.5);
  assert.equal(arriba.arriba, true);
  assert.equal(arriba.abajo, false);
  const abajo = ladosVisibles('bajo', 0.5);
  assert.equal(abajo.arriba, false);
  assert.equal(abajo.abajo, true);
});

test('camara: reutiliza el objeto de salida (sin asignar memoria por fotograma)', () => {
  const out = {};
  assert.equal(camaraInmersion('crema', 0.3, out), out);
  assert.equal(focoInmersion('bajo', 0.3, out), out);
});

test('claves: ordenadas en s y cubren 0..2', () => {
  assert.equal(CLAVES_CAMARA[0].s, 0);
  assert.equal(CLAVES_CAMARA.at(-1).s, 2);
  for (let i = 1; i < CLAVES_CAMARA.length; i += 1) assert.ok(CLAVES_CAMARA[i].s > CLAVES_CAMARA[i - 1].s);
});

test('foco: distancia positiva y apertura 0..1; nitido en el cenital inicial', () => {
  for (const fase of ['crema', 'bajo']) {
    for (const p of barrido(50)) {
      const foco = focoInmersion(fase, p, {});
      assert.ok(foco.distance >= 0.2 && foco.distance < 10, `${fase} ${p} ${foco.distance}`);
      assert.ok(foco.aperture >= 0 && foco.aperture <= 1);
    }
  }
  assert.equal(focoInmersion('crema', 0).aperture, 0);
});

test('anclas: palabra al fondo sobre la superficie y bolsa bajo el agua delante de la camara final', () => {
  assert.ok(PALABRA_CREMA.y > 0);
  assert.ok(Math.hypot(PALABRA_CREMA.x, PALABRA_CREMA.z) > 8);
  const final = camaraInmersion('bajo', 1);
  assert.ok(ANCLA_BOLSA.y < 0);
  const dx = ANCLA_BOLSA.x - final.x;
  const dz = ANCLA_BOLSA.z - final.z;
  const delante = dx * -Math.sin(final.yaw) + dz * -Math.cos(final.yaw);
  assert.ok(delante > 2, 'la bolsa queda delante de la camara');
});

test('cintas: textos desde la marca, en mayusculas, sin inventar notas', () => {
  const up = (t) => t.toLocaleUpperCase('es-CO');
  MARCA.lotes.forEach((lote, i) => {
    const palabras = palabrasCintas(MARCA, i);
    assert.equal(palabras.length, 4);
    for (const palabra of palabras) {
      assert.ok(palabra.length > 0);
      assert.equal(palabra, up(palabra));
      assert.ok(!palabra.includes('NULL') && !palabra.includes('UNDEFINED'));
    }
    assert.ok(palabras[1].includes(up(lote.nombre)));
    assert.ok(palabras[1].includes(up(lote.proceso)));
    if (lote.notas.length) assert.equal(palabras[2], lote.notas.map(up).join(' · '));
  });
  const sinNotas = { ciudad: 'Pasto, Nariño', lotes: [{ nombre: 'Chiroso', proceso: 'Lavado', variedad: 'Chiroso', origen: null, notas: [] }] };
  assert.deepEqual(palabrasCintas(sinNotas, 0), ['TOSTADO EN CASA', 'CHIROSO · LAVADO', 'LABORATORIO DE CAFÉ', 'PASTO, NARIÑO']);
  const conVariedad = { lotes: [{ nombre: 'X', proceso: 'Lavado', variedad: 'Caturra', origen: 'Huila', notas: ['Panela'] }] };
  assert.deepEqual(palabrasCintas(conVariedad, 0).slice(2), ['PANELA', 'VARIEDAD CATURRA · ORIGEN HUILA']);
  assert.equal(palabrasCintas(MARCA, 99)[1], palabrasCintas(MARCA, MARCA.lotes.length - 1)[1]);
  assert.equal(palabrasCintas({ nombre: 'Lab', lotes: [] }, 0).length, 4);
});

test('utilidades: hash determinista en 0..1 y smoothstep acotado', () => {
  for (let i = 0; i < 200; i += 1) {
    const h = hash01(i, 3);
    assert.ok(h >= 0 && h < 1);
    assert.equal(hash01(i, 3), h);
  }
  assert.notEqual(hash01(1, 0), hash01(2, 0));
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  close(smoothstep(0, 1, 0.5), 0.5);
});
