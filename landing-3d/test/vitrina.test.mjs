/* Vitrina: poses deterministas y validas, anillo, granos, seleccion y anclas. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MARCA } from '../src/marca.js';
import {
  BOLSA, FASES, VITRINA_CAMERA, acabadoBolsa, anclaInto, anclas, anillo, anilloInto, crearAnillo, crearPose,
  granoInto, mallaBolsa, nivelTueste, pesoSeleccion, poses, posesInto, seleccionValida, suavizarSeleccion, tintaSobre,
} from '../src/logic/vitrina.js';

const N = MARCA.lotes.length;
const PS = [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1];
const TIMES = [0, 1.3, 47.9];
const finite = (obj) => Object.entries(obj).forEach(([k, v]) => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} = ${v}`);
});

test('vitrina: poses deterministas', () => {
  for (const fase of FASES) {
    for (const p of PS) {
      assert.deepEqual(poses(fase, p, 1, 3.2, N), poses(fase, p, 1, 3.2, N));
      assert.deepEqual(anillo(fase, p, 1, 3.2, N), anillo(fase, p, 1, 3.2, N));
    }
  }
});

test('vitrina: poses validas para p en [0,1] y fuera de rango', () => {
  for (const fase of FASES) {
    for (const p of [...PS, -1, 2, NaN]) {
      for (const time of TIMES) {
        for (let sel = 0; sel < N; sel += 1) {
          const list = poses(fase, p, sel, time, N);
          assert.equal(list.length, N);
          list.forEach((pose) => {
            finite(pose);
            assert.ok(pose.escala > 0.9 && pose.escala < 1.2);
            assert.ok(Math.abs(pose.x) < 0.5 && Math.abs(pose.z) < 0.3);
            assert.ok(pose.y > -0.3 && pose.y < 0.1);
            assert.ok(pose.resalte >= 0 && pose.resalte <= 1);
          });
          finite(anillo(fase, p, sel, time, N));
        }
      }
    }
  }
});

test('vitrina: hero centro adelantado y bolsas apoyadas en el suelo', () => {
  const [a, b, c] = poses('hero', 1, 0, 0, 3);
  assert.ok(b.z > a.z && b.z > c.z);
  assert.ok(a.x < b.x && b.x < c.x);
  [a, b, c].forEach((pose) => assert.ok(Math.abs(pose.y) < 0.003));
  const cuatro = poses('hero', 1, 0, 0, 4);
  assert.ok(cuatro[1].z > cuatro[0].z && cuatro[2].z > cuatro[3].z);
  assert.ok(Math.abs(cuatro[0].x + cuatro[3].x) < 1e-12);
  const ring = anillo('hero', 1, 0, 0, 4);
  assert.ok(ring.radio > Math.abs(cuatro[0].x) + BOLSA.ancho / 2);
});

test('vitrina: emerge solo muestra la elegida y sube con p', () => {
  const low = poses('emerge', 0, 2, 0, 3);
  const high = poses('emerge', 1, 2, 0, 3);
  assert.deepEqual(low.map((pose) => pose.visible), [false, false, true]);
  assert.ok(low[2].y < -BOLSA.alto * 0.9);
  assert.ok(high[2].y > 0);
  assert.ok(high[2].rotY > low[2].rotY);
});

test('vitrina: tienda levanta la elegida y el anillo la sigue', () => {
  for (let sel = 0; sel < N; sel += 1) {
    const list = poses('tienda', 1, sel, 0, N);
    const top = list.reduce((best, pose, i) => (pose.y > list[best].y ? i : best), 0);
    assert.equal(top, sel);
    assert.equal(list[sel].resalte, 1);
    const ring = anillo('tienda', 1, sel, 0, N);
    assert.ok(Math.abs(ring.cx - list[sel].x) < 1e-9);
  }
  const mid = poses('tienda', 1, 0.5, 0, N);
  assert.ok(mid[0].resalte > 0 && mid[1].resalte > 0 && mid[0].resalte < 1);
});

test('vitrina: seleccion acotada', () => {
  assert.equal(seleccionValida(-3, N), 0);
  assert.equal(seleccionValida(99, N), N - 1);
  assert.equal(seleccionValida(1.4, N), 1);
  assert.equal(seleccionValida('x', N), 0);
  assert.equal(seleccionValida(2, 0), 0);
  assert.equal(pesoSeleccion(1, 1), 1);
  assert.equal(pesoSeleccion(0, 1), 0);
  let s = 0;
  for (let i = 0; i < 120; i += 1) s = suavizarSeleccion(s, 2, 1 / 60);
  assert.equal(s, 2);
  assert.equal(suavizarSeleccion(1, 2, NaN), 1);
  assert.ok(suavizarSeleccion(0, 2, 10) <= 2);
});

test('vitrina: anillo en hero crece con p y siempre tiene radio', () => {
  const a = anillo('hero', 0, 0, 0, N);
  const b = anillo('hero', 0.5, 0, 0, N);
  const c = anillo('hero', 1, 0, 0, N);
  assert.ok(a.barrido < b.barrido && b.barrido <= c.barrido);
  assert.ok(Math.abs(c.barrido - Math.PI * 2) < 1e-9);
  assert.ok(a.intensidad < c.intensidad);
  [a, b, c].forEach((ring) => assert.ok(ring.radio > 0.05));
  const reused = crearAnillo();
  assert.equal(anilloInto(reused, 'emerge', 0.4, 0, 1, N), reused);
});

test('vitrina: granos deterministas, sobre el liquido y mas con p', () => {
  const g = {};
  const count = (p) => {
    let visible = 0;
    for (let i = 0; i < 14; i += 1) {
      if (granoInto(g, i, 14, p, 2.5)) {
        visible += 1;
        assert.ok(g.y >= -0.01 && g.y <= 0.5);
        finite(g);
      }
    }
    return visible;
  };
  assert.equal(count(0), 0);
  assert.ok(count(1) > count(0.3));
  const a = {}; const b = {};
  granoInto(a, 3, 14, 0.8, 1.1);
  granoInto(b, 3, 14, 0.8, 1.1);
  assert.deepEqual(a, b);
});

test('vitrina: una ancla por lote, sobre cada bolsa', () => {
  for (const fase of FASES) {
    const list = poses(fase, 1, 0, 0, N);
    const points = anclas(list);
    assert.equal(points.length, MARCA.lotes.length);
    points.forEach((point, i) => assert.ok(point.y > list[i].y + BOLSA.alto));
  }
  const out = { x: 0, y: 0, z: 0 };
  assert.equal(anclaInto(out, crearPose()), out);
});

test('vitrina: posesInto reutiliza los objetos', () => {
  const out = [crearPose(), crearPose(), crearPose()];
  const first = out[0];
  assert.equal(posesInto(out, 'hero', 0.5, 0, 0), out);
  assert.equal(out[0], first);
});

test('vitrina: camara por fase, acabados y calidad', () => {
  for (const fase of FASES) {
    const cam = VITRINA_CAMERA[fase];
    assert.equal(cam.position.length, 3);
    assert.equal(cam.target.length, 3);
    assert.ok(cam.fov > 10 && cam.fov < 60);
  }
  assert.equal(acabadoBolsa('#f2efe9'), 'blanco');
  assert.equal(acabadoBolsa('#c8b08a'), 'kraft');
  assert.equal(acabadoBolsa('#1d1611'), 'oscuro');
  assert.equal(tintaSobre('#c8202f'), '#f2e6d3');
  assert.equal(tintaSobre('#f2efe9'), '#2a1a10');
  assert.equal(acabadoBolsa(MARCA.bolsa.color), 'oscuro');
  MARCA.lotes.forEach((lote) => {
    assert.match(lote.etiqueta, /^#[0-9a-f]{6}$/i);
    assert.match(lote.textoEtiqueta, /^#[0-9a-f]{6}$/i);
  });
  assert.equal(nivelTueste('Medio'), 3);
  assert.equal(nivelTueste('Medio claro'), 2);
  assert.equal(nivelTueste(null), null);
  assert.equal(nivelTueste('raro'), null);
  const alta = mallaBolsa('alta');
  const baja = mallaBolsa('baja');
  assert.ok(alta.columnas * alta.filas * 2 < 8000);
  assert.ok(baja.etiqueta < alta.etiqueta && baja.columnas < alta.columnas);
});
