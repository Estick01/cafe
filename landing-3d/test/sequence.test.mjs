import test from 'node:test';
import assert from 'node:assert/strict';
import { createStage, frameForTime } from '../src/scene/sequenceStage.js';

test('secuencia: limites y scroll reversible eligen el mismo fotograma', () => {
  assert.equal(frameForTime(-1, 120), 0);
  assert.equal(frameForTime(11, 120), 119);
  for (const time of [0, 2.5, 7, 10, 7, 2.5, 0]) {
    assert.equal(frameForTime(time, 120), Math.round(time / 10 * 119));
  }
});

test('una carga atrasada nunca pinta un fotograma que ya se dejo atras', async () => {
  const originals = Object.fromEntries(['window', 'document', 'fetch', 'createImageBitmap'].map(key => [key, globalThis[key]]));
  const pending = new Map();
  const painted = [];
  const closed = [];
  globalThis.window = { location: { href: 'http://localhost/' }, devicePixelRatio: 1 };
  globalThis.document = { hidden: false };
  globalThis.createImageBitmap = async blob => ({ id: blob, width: 1280, height: 720, close() { closed.push(this.id); } });
  globalThis.fetch = async url => {
    if (url === '/manifest') return { ok: true, json: async () => ({ status: 'ready', frames: ['0.webp', '1.webp', '2.webp', '3.webp'] }) };
    const index = Number(new URL(url).pathname[1]);
    if (index === 0) return { ok: true, blob: async () => index };
    return new Promise(resolve => pending.set(index, () => resolve({ ok: true, blob: async () => index })));
  };
  const context = { setTransform() {}, fillRect() {}, drawImage(bitmap) { painted.push(bitmap.id); } };
  const stage = createStage({ getContext: () => context }, { dpr: { max: 2 } });
  try {
    await stage.load('/manifest', () => {});
    stage.render({ time: 10 });
    stage.render({ time: 0 });
    pending.get(3)();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(painted.at(-1), 0);
    assert(!painted.includes(3));
    stage.render({ time: 10 });
    assert.equal(painted.at(-1), 3);
    stage.dispose();
    assert(closed.includes(0) && closed.includes(3));
  } finally {
    stage.dispose();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
