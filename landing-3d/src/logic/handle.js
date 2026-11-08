/*
 * Crecimiento del asa desde sus dos uniones hacia el centro, de modo que cierra como un arco.
 * `advance` es el atributo _asa_avance (0..1 a lo largo del arco) y `growth`, pose.handleGrowth.
 *
 * El asa es un tubo de anillos (todos los vertices de un anillo comparten _asa_avance). En vez de
 * descartar fragmentos, que deja a la vista el tubo hueco cortado, cada anillo se encoge hacia el
 * eje con un perfil de media esfera al acercarse a un corte (la punta que crece o el plano de
 * aparicion de la taza), y los anillos ocultos se juntan en la punta: el extremo queda redondo y
 * cerrado. Todo es CPU y sin DOM: 37 anillos, menos de mil vertices.
 */

/* Igual que ceramic.handle_clip_value: con growth = 1 ya se ve todo; con 0, nada. */
export const handleClipValue = (growth) => -0.001 + 1.002 * growth;

export const handleVisible = (advance, growth) => Math.min(advance, 1 - advance) < handleClipValue(growth) / 2;

/* La punta redonda se abre del todo al final, para que el arco cerrado no quede estrangulado. */
export const CAP_FADE = Object.freeze({ from: 0.85, to: 1 });
const RING_KEY_DIGITS = 5;
const CAP_SPACING_MARGIN = 1.1;

function maxSpacing(rings) {
  let spacing = 0;
  for (let index = 1; index < rings.length; index += 1) {
    const [a, b] = [rings[index - 1].centre, rings[index].centre];
    spacing = Math.max(spacing, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return spacing;
}

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/* Radio relativo de media esfera: x = profundidad / radio. 0 en la punta, 1 a un radio del corte. */
export function handleCapScale(x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const along = 1 - x;
  return Math.sqrt(1 - along * along);
}

/* Radio de la punta de crecimiento: completo mientras crece, cero cuando el arco ya esta cerrado. */
export const growthCapRadius = (radius, growth) => radius * (1 - smooth(CAP_FADE.from, CAP_FADE.to, growth));

/*
 * Agrupa los vertices por anillo. Devuelve los anillos ordenados por avance, con su centro, la
 * longitud del arco y el radio medio del tubo. positions es un Float32Array xyz en el marco local.
 */
export function buildHandleRings(positions, advance) {
  const groups = new Map();
  for (let vertex = 0; vertex < advance.length; vertex += 1) {
    const key = advance[vertex].toFixed(RING_KEY_DIGITS);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(vertex);
  }
  const rings = [...groups.values()]
    .map((indices) => {
      const centre = [0, 0, 0];
      indices.forEach((vertex) => {
        for (let axis = 0; axis < 3; axis += 1) centre[axis] += positions[vertex * 3 + axis] / indices.length;
      });
      const radius = Math.max(...indices.map((vertex) => Math.hypot(
        positions[vertex * 3] - centre[0], positions[vertex * 3 + 1] - centre[1], positions[vertex * 3 + 2] - centre[2],
      )));
      return Object.freeze({ advance: advance[indices[0]], centre: Object.freeze(centre), radius, indices: Object.freeze(indices) });
    })
    .sort((a, b) => a.advance - b.advance);
  let length = 0;
  for (let index = 1; index < rings.length; index += 1) {
    const [a, b] = [rings[index - 1].centre, rings[index].centre];
    length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const radius = rings.reduce((sum, ring) => sum + ring.radius, 0) / Math.max(1, rings.length);
  // Con anillos mas separados que el radio, una media esfera no cabe en un tramo: la cupula se
  // alarga hasta el anillo siguiente para que el ultimo anillo visible siempre se estreche.
  const capRadius = Math.max(radius, maxSpacing(rings) * CAP_SPACING_MARGIN);
  return Object.freeze({ rings: Object.freeze(rings), length, radius, capRadius });
}

/*
 * Profundidad en metros de cada anillo dentro de la parte visible: positiva se ve, negativa no.
 * Es el minimo entre la distancia por el arco a la punta que crece y la altura bajo el plano.
 */
export function handleDepths(model, growth, planeY) {
  const limit = handleClipValue(growth) / 2;
  return model.rings.map((ring) => {
    const byGrowth = (limit - Math.min(ring.advance, 1 - ring.advance)) * model.length;
    const byPlane = planeY - ring.centre[1];
    return Math.min(byGrowth, byPlane);
  });
}

const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/* Un anillo justo en la punta no tiene direccion propia: se usa la vertical. */
const normalize3 = (v) => {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 1e-9 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0];
};

/* Puntos del eje donde la profundidad cruza cero, interpolando entre anillos vecinos. */
function crossings(model, depths) {
  const found = [];
  for (let index = 1; index < depths.length; index += 1) {
    const [d0, d1] = [depths[index - 1], depths[index]];
    if ((d0 > 0) === (d1 > 0)) continue;
    const f = d0 / (d0 - d1);
    const [r0, r1] = [model.rings[index - 1], model.rings[index]];
    found.push({ advance: r0.advance + (r1.advance - r0.advance) * f, point: lerp3(r0.centre, r1.centre, f) });
  }
  return found;
}

const nearestCut = (cuts, advance) => cuts.reduce(
  (best, cut) => (!best || Math.abs(cut.advance - advance) < Math.abs(best.advance - advance) ? cut : best),
  null,
);

/*
 * Estado de cada anillo para un instante: escala hacia el eje, punta a la que se junta si esta
 * oculto y direccion de la punta (para las normales de la cupula). visible = false si no queda nada.
 */
export function solveHandle(model, growth, planeY) {
  const depths = handleDepths(model, growth, planeY);
  const cuts = crossings(model, depths);
  const growthRadius = growthCapRadius(model.capRadius, growth);
  const limit = handleClipValue(growth) / 2;
  const rings = model.rings.map((ring, index) => {
    const depth = depths[index];
    const nearest = nearestCut(cuts, ring.advance);
    const tipDirection = nearest
      ? normalize3([nearest.point[0] - ring.centre[0], nearest.point[1] - ring.centre[1], nearest.point[2] - ring.centre[2]])
      : [0, 1, 0];
    if (depth <= 0) {
      return Object.freeze({ scale: 0, along: 1, depth, target: nearest ? nearest.point : ring.centre, tipDirection });
    }
    const byGrowth = (limit - Math.min(ring.advance, 1 - ring.advance)) * model.length;
    const radius = byGrowth <= depth + 1e-9 ? growthRadius : model.capRadius;
    const scale = radius > 0 ? handleCapScale(depth / radius) : 1;
    const along = radius > 0 ? Math.max(0, 1 - depth / radius) : 0;
    return Object.freeze({ scale, along, depth, target: null, tipDirection });
  });
  return Object.freeze({ visible: depths.some((depth) => depth > 0), rings: Object.freeze(rings) });
}

/* Escribe posiciones y normales de un instante a partir de las de reposo (sin asignar memoria). */
export function writeHandle(model, solution, rest, outPositions, outNormals) {
  solution.rings.forEach((state, index) => {
    const ring = model.rings[index];
    const [cx, cy, cz] = ring.centre;
    const [tx, ty, tz] = state.tipDirection;
    const { scale: s, along: a, target } = state;
    ring.indices.forEach((vertex) => {
      const o = vertex * 3;
      if (target) {
        outPositions[o] = target[0];
        outPositions[o + 1] = target[1];
        outPositions[o + 2] = target[2];
        outNormals[o] = tx;
        outNormals[o + 1] = ty;
        outNormals[o + 2] = tz;
        return;
      }
      outPositions[o] = cx + (rest.positions[o] - cx) * s;
      outPositions[o + 1] = cy + (rest.positions[o + 1] - cy) * s;
      outPositions[o + 2] = cz + (rest.positions[o + 2] - cz) * s;
      const nx = rest.normals[o] * s + tx * a;
      const ny = rest.normals[o + 1] * s + ty * a;
      const nz = rest.normals[o + 2] * s + tz * a;
      const length = Math.hypot(nx, ny, nz) || 1;
      outNormals[o] = nx / length;
      outNormals[o + 1] = ny / length;
      outNormals[o + 2] = nz / length;
    });
  });
}
