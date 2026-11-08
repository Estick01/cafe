/*
 * Puerto de blender/liquid.py: chorro, cinta en espiral y superficies. Sin Three ni DOM.
 *
 * Las funciones `xxxMesh` son puras, usan ejes de Blender y sirven de referencia para la paridad.
 * Las funciones `writeXxx` escriben en buffers preasignados, en ejes de Three, con normales.
 */
import { writeThree } from './coords.js';
import { CUP_TOP, HANDLE_PATH, POOL_SURFACE, cupInnerRadius, cupOuterRadius } from './dimensions.js';
import { POUR_TOP } from './timeline.js';

const STREAM_RADIUS = 0.0031;
const STREAM_BACK_Y = 0.023; // el chorro pasa por detras del grano
const HELIX_PITCH = 0.0075;
/* Fuera de la taza la cinta cuelga un poco por su peso y se acumula al final, donde se recoge. */
const HELIX_SAG = 0.0012;
const HELIX_POOL = 0.35;
const HELIX_POINTS = 150;
export const RING_SIDES = 14;
const DISC_RINGS = 36;
const DISC_SIDES = 72;
const WAVE_FREQUENCY = 620;
const WAVE_SPEED = 16;
const WAVE_DECAY = 42;

/* Cafe que recorre el asa por fuera: lamina pegada a la cara exterior del tubo del asa. */
const STREAK_POINTS = 20;
export const STREAK_END = 0.58; // fraccion del asa desde la que salta el chorro
const STREAK_CLEARANCE = 0.0005;
const STREAK_WIDTH = 0.0030; // semiancho, a lo largo de y
const STREAK_THICK = 0.0016; // semigrosor, hacia fuera del asa
/* Chorro que salta del asa a la taza: curva de Bezier que se convierte en el chorro de arriba. */
const JET_POINTS = 64;
const JET_BLEND_POINTS = 8; // puntos en los que la lamina del asa se vuelve redonda
const JET_APEX = 0.09; // altura de la cima de la parabola sobre el borde
/* Adelgazamiento por gravedad: con caudal constante, radio ~ (v0 / v) ^ 1/2 y v^2 = v0^2 + 2 g h. */
const GRAVITY = 9.81;
const FALL_V0 = 0.8; // velocidad (m/s) del chorro en POUR_TOP, fuera de cuadro
const FALL_REFERENCE_Z = 0.2; // a esta altura el chorro tiene STREAM_RADIUS
const JET_THINNING = 0.125; // exponente suavizado del arco: el salto es corto y no debe quedar en hilo
const Y_AXIS = Object.freeze([0, 1, 0]); // eje de referencia del anillo: el chorro nunca va paralelo a y

export const MAX_TUBE_POINTS = 270;
export const DISC_VERTEX_COUNT = 1 + DISC_RINGS * DISC_SIDES;

const wobble = (z, time) => 0.0011 * Math.sin(14 * z + 7 * time) * Math.min(1, Math.abs(z) * 18);

/* Factor del radio de un chorro en caida libre desde POUR_TOP: 1 en FALL_REFERENCE_Z. */
export function fallScale(z) {
  const reference = FALL_V0 * FALL_V0 + 2 * GRAVITY * (POUR_TOP - FALL_REFERENCE_Z);
  const speed = FALL_V0 * FALL_V0 + 2 * GRAVITY * Math.max(0, POUR_TOP - z);
  return (reference / speed) ** 0.25;
}

/* Tramo vertical del chorro entre dos alturas; se adelgaza al acelerar. */
function straight(topZ, bottomZ, startY, endY, time) {
  if (topZ <= bottomZ) return [];
  const count = Math.max(2, Math.trunc((topZ - bottomZ) / 0.004));
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const ratio = index / count;
    const z = topZ + (bottomZ - topZ) * ratio;
    const y = startY + (endY - startY) * ratio ** 3;
    const radius = STREAM_RADIUS * fallScale(z);
    points.push([[wobble(z, time), y, z], radius, radius]);
  }
  return points;
}

/*
 * Cinta alrededor de la taza; las primeras vueltas se unen al chorro central.
 * El angulo se mide desde el extremo final de la cinta, que frena hasta quedar en el asa.
 */
function helix(pose, startPoint) {
  const points = [];
  for (let index = 0; index < HELIX_POINTS; index += 1) {
    const ratio = index / (HELIX_POINTS - 1);
    const angle = pose.ribbonAngle - (1 - ratio) * 2 * Math.PI * pose.helixTurns;
    const hanging = pose.ribbonOutside;
    const z = pose.ribbonZ - ratio * HELIX_PITCH - HELIX_SAG * Math.sin(Math.PI * ratio) * hanging;
    const localZ = z - pose.cupZ;
    const outer = cupOuterRadius(localZ);
    // Primero tapa el borde de crecimiento (pared de 3.8 mm); despues se pega por fuera.
    const center = outer + (-0.0016 + (0.002 + 0.0016) * pose.ribbonOutside);
    const halfRadial = 0.0042 + (0.0017 - 0.0042) * pose.ribbonOutside;
    const halfHeight = (0.0048 + (0.0034 - 0.0048) * pose.ribbonOutside) * (1 + HELIX_POOL * ratio ** 3 * hanging);
    const join = Math.min(1, ratio / 0.26);
    const radius = center * pose.helixBlend;
    const position = [radius * Math.cos(angle), radius * Math.sin(angle), z];
    const blended = startPoint.map((start, axis) => start + (position[axis] - start) * join);
    // La union de la cinta parte del grosor que trae el chorro.
    const stream = STREAM_RADIUS * fallScale(startPoint[2]);
    const radial = stream + (halfRadial - stream) * join;
    const vertical = stream + (halfHeight - stream) * join;
    points.push([blended, radial, vertical]);
  }
  return points;
}

/* Punto [x, z, radio] de la linea central del asa; la tabla esta a pasos de arco iguales. */
function handleSample(fraction) {
  const last = HANDLE_PATH.length - 1;
  const position = Math.min(1, Math.max(0, fraction)) * last;
  const index = Math.min(last - 1, Math.trunc(position));
  const ratio = position - index;
  const a = HANDLE_PATH[index];
  const b = HANDLE_PATH[index + 1];
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * ratio);
}

/*
 * Punto a `gap` metros por fuera de la superficie del asa, en el marco de la taza: [x, z, tx, tz].
 * El asa se recorre en sentido antihorario en el plano XZ: la normal exterior es (tz, -tx).
 */
export function handleSurface(fraction, gap) {
  const [x, z, radius] = handleSample(fraction);
  const [ax, az] = handleSample(fraction - 0.02);
  const [bx, bz] = handleSample(fraction + 0.02);
  const length = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
  const tx = (bx - ax) / length;
  const tz = (bz - az) / length;
  const offset = radius + gap;
  return [x + tz * offset, z - tx * offset, tx, tz];
}

/* Lamina de cafe que sube pegada a la cara exterior del asa. */
function streak(pose) {
  if (pose.streak <= 0) return [];
  const end = STREAK_END * pose.streak;
  const points = [];
  for (let index = 0; index <= STREAK_POINTS; index += 1) {
    const [x, z] = handleSurface((end * index) / STREAK_POINTS, STREAK_CLEARANCE + STREAK_THICK);
    points.push([[x, 0, pose.cupZ + z], STREAK_WIDTH, STREAK_THICK, Y_AXIS]);
  }
  return points;
}

/* Punto (ejes de Blender) donde el chorro entra en el cafe. */
export const jetLanding = (pose) => [pose.pourX, pose.pourY, pose.coffeeLevel];

function jetRoot(pose) {
  const [x, z] = handleSurface(STREAK_END, STREAK_CLEARANCE + STREAK_THICK);
  return [x, 0, pose.cupZ + z];
}

/*
 * Punto u del salto: parabola balistica desde el asa mezclada con el chorro vertical.
 * En la parabola la velocidad horizontal es constante, asi que v^2 / c^2 = 1 + (dz/dx)^2 y el
 * radio sigue (c / v) ^ (2 * JET_THINNING). Devuelve [posicion, radio].
 */
function jetPoint(pose, [rx, ry, rz], [tx, ty, tz], u) {
  const apex = pose.cupZ + CUP_TOP + JET_APEX;
  const bulge = apex - 0.5 * (rz + tz);
  const arcZ = (1 - u) * rz + u * tz + 4 * bulge * u * (1 - u);
  const arcX = rx + (tx - rx) * u;
  const arcY = ry + (ty - ry) * u;
  const span = Math.sqrt((tx - rx) ** 2 + (ty - ry) ** 2);
  const slope = ((tz - rz) + 4 * bulge * (1 - 2 * u)) / span;
  const arcRadius = STREAM_RADIUS * (1 + slope * slope) ** -JET_THINNING;
  const verticalZ = POUR_TOP + (tz - POUR_TOP) * u;
  const verticalRadius = STREAM_RADIUS * fallScale(verticalZ);
  const m = pose.jetMorph;
  const position = [arcX + (tx - arcX) * m, arcY + (ty - arcY) * m, arcZ + (verticalZ - arcZ) * m];
  return [position, arcRadius + (verticalRadius - arcRadius) * m];
}

/* Salto desde lo alto del asa hasta la taza; crece desde su origen hasta tocar el cafe. */
function jet(pose) {
  if (pose.jetHead <= 0) return [];
  const root = jetRoot(pose);
  const tip = jetLanding(pose);
  const points = [];
  for (let index = 0; index <= JET_POINTS; index += 1) {
    const [position, radius] = jetPoint(pose, root, tip, (pose.jetHead * index) / JET_POINTS);
    // Junto al asa conserva la forma plana de la lamina; despues es redondo.
    const round = Math.min(1, index / JET_BLEND_POINTS + pose.jetMorph);
    const radial = STREAK_WIDTH + (radius - STREAK_WIDTH) * round;
    const vertical = STREAK_THICK + (radius - STREAK_THICK) * round;
    points.push([position, radial, vertical, Y_AXIS]);
  }
  return points;
}

/* Quita la parte del recorrido que la cola ya ha dejado atras, con el corte interpolado. */
function cut(points, fraction) {
  if (fraction <= 0 || points.length < 2) return points;
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1][0];
    const b = points[index][0];
    let sum = 0;
    for (let axis = 0; axis < 3; axis += 1) sum += (a[axis] - b[axis]) ** 2;
    lengths.push(lengths[index - 1] + Math.sqrt(sum));
  }
  const total = lengths[lengths.length - 1];
  const target = fraction * total;
  if (target >= total) return [];
  const index = lengths.findIndex((length) => length > target);
  const span = lengths[index] - lengths[index - 1];
  const ratio = span > 0 ? (target - lengths[index - 1]) / span : 0;
  const a = points[index - 1];
  const b = points[index];
  const first = [a[0].map((p, axis) => p + (b[0][axis] - p) * ratio), a[1] + (b[1] - a[1]) * ratio,
    a[2] + (b[2] - a[2]) * ratio, ...b.slice(3)];
  const rest = [first, ...points.slice(index)];
  return rest.length >= 2 ? rest : [];
}

/* Afina los extremos del tubo para cerrarlo sin tapas visibles. */
function taperEnds(points, length = 10) {
  const total = points.length;
  return points.map((point, index) => {
    const edge = Math.min(index, total - 1 - index);
    const factor = Math.sqrt(Math.max(0, Math.min(1, (edge + 0.15) / length)));
    return [point[0], point[1] * factor, point[2] * factor, ...point.slice(3)];
  });
}

/*
 * Puntos del chorro: lista de [posicion, semiejeRadial, semiejeVertical, ejeReferencia?].
 * Cae desde arriba y se enrosca en el borde mientras crece la taza. Despues la cinta baja por
 * fuera, recorre el asa y salta dentro de la taza; el origen de ese salto sube hasta
 * convertirse en el chorro vertical que la llena.
 */
export function pourPath(pose) {
  if (!pose.pouring) return [];
  let points;
  if (pose.helixBlend <= 0) {
    points = straight(POUR_TOP, pose.pourHeadZ, STREAM_BACK_Y, 0, pose.time);
  } else {
    const startZ = pose.ribbonZ + 0.012;
    const startPoint = [0, STREAM_BACK_Y, startZ];
    const feed = [...straight(POUR_TOP, startZ, STREAM_BACK_Y, STREAM_BACK_Y, pose.time), ...helix(pose, startPoint), ...streak(pose)];
    points = [...cut(feed, pose.feedCut), ...jet(pose)];
  }
  return taperEnds(cut(points, pose.pourCut));
}

function normalize(x, y, z) {
  const length = Math.sqrt(x * x + y * y + z * z);
  return length < 1e-9 ? [x, y, z] : [x / length, y / length, z / length];
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/*
 * Recorre los vertices del tubo con su normal analitica de elipse.
 * Una seccion redonda usa un eje fijo: evita que el anillo se voltee cuando la
 * ondulacion cruza el centro y el tubo se estrangule.
 */
function visitTube(points, sides, visit) {
  const total = points.length;
  for (let index = 0; index < total; index += 1) {
    const [position, radialHalf, verticalHalf, reference] = points[index];
    const before = points[Math.max(index - 1, 0)][0];
    const after = points[Math.min(index + 1, total - 1)][0];
    const tangent = normalize(after[0] - before[0], after[1] - before[1], after[2] - before[2]);
    const [x, y] = position;
    const isRound = Math.abs(radialHalf - verticalHalf) < 1e-7;
    // Los tramos que no van en vertical (asa y salto) traen su propio eje de referencia.
    let outward = reference;
    if (!outward) outward = isRound || x * x + y * y <= 1e-8 ? [1, 0, 0] : normalize(x, y, 0);
    const binormal = normalize(...cross(tangent, outward));
    const normal = normalize(...cross(binormal, tangent));
    for (let side = 0; side < sides; side += 1) {
      const angle = (2 * Math.PI * side) / sides;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const a = radialHalf * cosine;
      const b = verticalHalf * sine;
      // Normal de la elipse; se multiplica en cruz para no dividir por semiejes casi nulos.
      const shapeA = cosine * (verticalHalf || 1);
      const shapeB = sine * (radialHalf || 1);
      const shapeLength = Math.hypot(shapeA, shapeB) || 1;
      const na = shapeA / shapeLength;
      const nb = shapeB / shapeLength;
      visit(
        index * sides + side,
        position[0] + normal[0] * a + binormal[0] * b,
        position[1] + normal[1] * a + binormal[1] * b,
        position[2] + normal[2] * a + binormal[2] * b,
        normal[0] * na + binormal[0] * nb,
        normal[1] * na + binormal[1] * nb,
        normal[2] * na + binormal[2] * nb,
      );
    }
  }
}

/* Malla pura de tubo en ejes de Blender: { vertices: [x,y,z,...], faces: [[a,b,c,d],...] }. */
export function tubeMesh(points, sides = RING_SIDES) {
  if (points.length < 2) return { vertices: [], faces: [] };
  const vertices = [];
  visitTube(points, sides, (index, x, y, z) => {
    vertices[index * 3] = x;
    vertices[index * 3 + 1] = y;
    vertices[index * 3 + 2] = z;
  });
  const faces = [];
  for (let ring = 0; ring < points.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      faces.push([ring * sides + side, ring * sides + next, (ring + 1) * sides + next, (ring + 1) * sides + side]);
    }
  }
  return { vertices, faces };
}

/* Escribe el tubo en buffers preasignados (ejes de Three). Devuelve los anillos usados. */
export function writeTube(points, positions, normals, sides = RING_SIDES) {
  const count = Math.min(points.length, MAX_TUBE_POINTS);
  if (count < 2) return 0;
  const used = count === points.length ? points : points.slice(0, count);
  visitTube(used, sides, (index, x, y, z, nx, ny, nz) => {
    writeThree(positions, index * 3, x, y, z);
    writeThree(normals, index * 3, nx, ny, nz);
  });
  return count;
}

/* Indices estaticos del tubo para el numero maximo de anillos; se recorta con setDrawRange. */
export function createTubeIndex(rings = MAX_TUBE_POINTS, sides = RING_SIDES) {
  const index = new Uint16Array((rings - 1) * sides * 6);
  let cursor = 0;
  for (let ring = 0; ring < rings - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const a = ring * sides + side;
      const b = ring * sides + next;
      const c = (ring + 1) * sides + next;
      const d = (ring + 1) * sides + side;
      index.set([a, b, c, a, c, d], cursor);
      cursor += 6;
    }
  }
  return index;
}

const tubeIndexCount = (rings, sides = RING_SIDES) => Math.max(0, rings - 1) * sides * 6;
export { tubeIndexCount };

function visitDisc({ height, radius, ripple, time }, visit) {
  visit(0, 0, 0, height + ripple, 0, 0, 1);
  let vertex = 1;
  for (let ring = 1; ring <= DISC_RINGS; ring += 1) {
    const distance = (radius * ring) / DISC_RINGS;
    const phase = distance * WAVE_FREQUENCY - time * WAVE_SPEED;
    const decay = Math.exp(-distance * WAVE_DECAY);
    const wave = ripple * Math.cos(phase) * decay;
    const slope = ripple * decay * (-WAVE_FREQUENCY * Math.sin(phase) - WAVE_DECAY * Math.cos(phase));
    const normalLength = Math.sqrt(1 + slope * slope);
    for (let side = 0; side < DISC_SIDES; side += 1) {
      const angle = (2 * Math.PI * side) / DISC_SIDES;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      visit(vertex, distance * cosine, distance * sine, height + wave,
        (-slope * cosine) / normalLength, (-slope * sine) / normalLength, 1 / normalLength);
      vertex += 1;
    }
  }
}

function discFaces() {
  const faces = [];
  for (let side = 0; side < DISC_SIDES; side += 1) faces.push([0, 1 + side, 1 + ((side + 1) % DISC_SIDES)]);
  for (let ring = 0; ring < DISC_RINGS - 1; ring += 1) {
    const start = 1 + ring * DISC_SIDES;
    for (let side = 0; side < DISC_SIDES; side += 1) {
      const next = (side + 1) % DISC_SIDES;
      faces.push([start + side, start + DISC_SIDES + side, start + DISC_SIDES + next, start + next]);
    }
  }
  return faces;
}

/* Parametros del disco de cada superficie; null si no se ve. */
export function poolDiscParams(pose) {
  if (pose.poolRadius <= 0.0005 || pose.time > 3.2) return null;
  return { height: pose.saucerZ + POOL_SURFACE, radius: pose.poolRadius, ripple: 0.00022, time: pose.time };
}

export function coffeeDiscParams(pose) {
  if (!pose.coffeeVisible) return null;
  return {
    height: pose.coffeeLevel,
    // El borde se apoya en la pared interior.
    radius: cupInnerRadius(pose.coffeeLevel - pose.cupZ) + 0.0004,
    ripple: pose.pouring ? 0.0009 : 0.00012,
    time: pose.time,
  };
}

function pureDisc(params) {
  if (!params) return { vertices: [], faces: [] };
  const vertices = [];
  visitDisc(params, (index, x, y, z) => {
    vertices[index * 3] = x;
    vertices[index * 3 + 1] = y;
    vertices[index * 3 + 2] = z;
  });
  return { vertices, faces: discFaces() };
}

export const poolMesh = (pose) => pureDisc(poolDiscParams(pose));
export const coffeeMesh = (pose) => pureDisc(coffeeDiscParams(pose));

export function writeDisc(params, positions, normals) {
  visitDisc(params, (index, x, y, z, nx, ny, nz) => {
    writeThree(positions, index * 3, x, y, z);
    writeThree(normals, index * 3, nx, ny, nz);
  });
}

export function createDiscIndex() {
  const triangles = discFaces().flatMap((face) => (face.length === 3
    ? face
    : [face[0], face[1], face[2], face[0], face[2], face[3]]));
  return Uint16Array.from(triangles);
}
