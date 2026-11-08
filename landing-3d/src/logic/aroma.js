/*
 * Particulas de aroma del epilogo: pocas motas calidas que salen del vapor, suben despacio,
 * giran un poco alrededor de tres nubes (panela, mandarina, cacao) y al final suben hacia lo alto
 * del encuadre, camino de la ficha de cata. Funcion pura del tiempo del epilogo y del tiempo
 * ambiental; la semilla es fija, asi que el mismo scroll da las mismas motas. Ejes de Blender.
 */
import { mix, smooth } from './timeline.js';

export const AROMA_MAX = 120;
export const AROMA_LOW = 44;

/* Las tres notas de la ficha. color: sRGB; center: relativo al centro del cafe (z sobre la superficie). */
export const AROMA_NOTES = Object.freeze([
  Object.freeze({ id: 'panela', label: 'Panela', color: [0.88, 0.66, 0.34], center: Object.freeze([-0.046, 0.006, 0.03]) }),
  Object.freeze({ id: 'mandarina', label: 'Mandarina', color: [0.96, 0.55, 0.22], center: Object.freeze([-0.006, 0.024, 0.036]) }),
  Object.freeze({ id: 'cacao', label: 'Cacao', color: [0.72, 0.47, 0.36], center: Object.freeze([0.03, 0.03, 0.028]) }),
]);

const BIRTH = Object.freeze([0.2, 1.7]);
const GATHER = 1.05; // segundos de epilogo que tarda cada mota en llegar a su nube
const ASCENT = Object.freeze({ start: 2.1, end: 3.0, rise: [0, 0.02, 0.018], gather: 0.15 });
const CHIP_FADE = Object.freeze({ start: 1.45, stagger: 0.14, length: 0.5 });

/* Generador determinista (mulberry32): mismas motas en cada carga. */
function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSeeds() {
  const next = random(0x7e7a);
  return Object.freeze(Array.from({ length: AROMA_MAX }, (_, index) => Object.freeze({
    note: index % AROMA_NOTES.length,
    origin: Object.freeze([(next() - 0.5) * 0.04, (next() - 0.5) * 0.022, 0.012 + next() * 0.03]),
    birth: mix(BIRTH[0], BIRTH[1], next()),
    orbit: 0.004 + next() * 0.011,
    angle: next() * Math.PI * 2,
    spin: (next() < 0.5 ? -1 : 1) * (0.5 + next() * 0.7),
    lift: 0.004 + next() * 0.012,
    size: 0.0011 + next() * 0.0015,
    glow: 0.55 + next() * 0.45,
    phase: next() * Math.PI * 2,
  })));
}

export const AROMA_SEEDS = buildSeeds();

/* Centro de cada nube en un instante: sube un poco con el tiempo y al final sube hacia lo alto. */
function cloudCenter(note, e, surfaceZ) {
  const [x, y, z] = AROMA_NOTES[note].center;
  const ascent = smooth(ASCENT.start, ASCENT.end, e);
  const climb = 0.006 * smooth(0.6, 2.4, e);
  return [
    x * (1 - ASCENT.gather * ascent) + ASCENT.rise[0] * ascent,
    y + ASCENT.rise[1] * ascent * ascent,
    surfaceZ + z + climb + ASCENT.rise[2] * ascent * ascent,
  ];
}

/*
 * Escribe la mota i: posicion (Blender), alfa y nota. ambient anade solo un vaiven lento.
 * Devuelve el alfa (0 si aun no ha nacido).
 */
export function aromaParticle(index, e, surfaceZ, ambient = 0) {
  const seed = AROMA_SEEDS[index];
  const age = e - seed.birth;
  if (age <= 0) return { position: [0, 0, surfaceZ], alpha: 0, note: seed.note, size: seed.size };
  const gather = smooth(0, GATHER, age);
  const center = cloudCenter(seed.note, e, surfaceZ);
  const angle = seed.angle + seed.spin * age + 0.18 * Math.sin(ambient * 0.35 + seed.phase);
  const wobble = 0.0012 * Math.sin(ambient * 0.6 + seed.phase * 1.7);
  const orbit = seed.orbit * (0.6 + 0.4 * gather);
  const target = [
    center[0] + orbit * Math.cos(angle) + wobble,
    center[1] + orbit * 0.7 * Math.sin(angle),
    center[2] + seed.lift * Math.sin(angle * 0.5 + seed.phase) * 0.6,
  ];
  const origin = [seed.origin[0], seed.origin[1], surfaceZ + seed.origin[2] + 0.012 * age];
  const position = origin.map((value, axis) => mix(value, target[axis], gather));
  const ascent = smooth(ASCENT.start, ASCENT.end, e);
  const twinkle = 0.8 + 0.2 * Math.sin(ambient * 1.1 + seed.phase);
  const alpha = smooth(0, 0.45, age) * seed.glow * twinkle * (1 - 0.4 * ascent);
  return { position, alpha, note: seed.note, size: seed.size };
}

/* Ancla de cada nota para su etiqueta y su opacidad (0 a 1). */
export function aromaAnchors(e, surfaceZ) {
  return AROMA_NOTES.map((note, index) => {
    const start = CHIP_FADE.start + index * CHIP_FADE.stagger;
    // La etiqueta se queda junto a su nube; en la subida final el aroma sigue sin ella.
    const center = cloudCenter(index, Math.min(e, ASCENT.start), surfaceZ);
    return Object.freeze({
      id: note.id,
      label: note.label,
      position: Object.freeze([center[0], center[1], center[2] - 0.004]),
      opacity: smooth(start, start + CHIP_FADE.length, e),
    });
  });
}
