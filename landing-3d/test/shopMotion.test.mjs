import test from 'node:test';
import assert from 'node:assert/strict';
import { createShopMotion, spinAt, SPIN_MS } from '../src/logic/shopMotion.js';
test('cambio de lote: conserva el anterior, cambia a mitad del giro y termina una vuelta', () => {
  const change = { from: 0, to: 3, yaw: 0.15, start: 100 };
  assert.equal(spinAt(change, 100).index, 0);
  assert.equal(spinAt(change, 100 + SPIN_MS * .49).index, 0);
  assert.equal(spinAt(change, 100 + SPIN_MS * .5).index, 3);
  assert.equal(spinAt(change, 100 + SPIN_MS).active, false);
  assert.ok(Math.abs(spinAt(change, 100 + SPIN_MS).yaw - .15 - Math.PI * 2) < 1e-9);
});
test('cambios rápidos continúan desde el ángulo visible y acaban en el último lote', () => {
  const motion = createShopMotion();
  motion.select(1, 0);
  const before = motion.at(340);
  motion.select(2, 340);
  assert.equal(motion.at(340).yaw, before.yaw);
  assert.equal(motion.at(340).index, before.index);
  assert.equal(motion.at(340 + SPIN_MS).index, 2);
  assert.equal(motion.at(340 + SPIN_MS + 100).active, false);
});
test('arrastrar interrumpe el giro sin cambiar el lote elegido, limita inclinación y permite centrar', () => {
  const motion = createShopMotion();
  motion.select(3, 0); motion.at(300); motion.rotate(.4, 10);
  assert.equal(motion.at(400).index, 3);
  assert.equal(motion.at(400).active, false);
  assert.equal(motion.at(400).pitch, .5);
  motion.reset(); assert.equal(motion.at(500).yaw, .15); assert.equal(motion.at(500).pitch, 0);
});
