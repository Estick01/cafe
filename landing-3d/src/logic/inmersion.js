/*
 * Inmersion en la crema: tiempos, camara, foco y textos de las cintas. Funciones puras (sin three):
 * todo depende solo de (fase, p); `time` lo agrega la escena como vaiven ambiental minimo.
 *
 * Espacio local del grupo de inmersion: la superficie de la crema es el plano y = 0, el remolino
 * esta centrado en el origen, arriba (y > 0) es aire y abajo (y < 0) es cafe.
 * Parametro continuo s: 'crema' p -> s = p (0..1), 'bajo' p -> s = 1 + p (1..2).
 */

/* Segundos de scroll sugeridos para cada fase. */
export const INMERSION_DURACION = Object.freeze({ crema: 3, bajo: 2 });

export const FASES = Object.freeze(['crema', 'bajo']);
export const SUPERFICIE_Y = 0;
const GRADOS = Math.PI / 180;

export const clamp01 = (value) => (value <= 0 ? 0 : value >= 1 ? 1 : value);
export const mix = (a, b, t) => a + (b - a) * t;
export function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/* Progreso continuo de toda la inmersion: 0 al empezar la crema, 1 al cruzar, 2 al final. */
export function progresoInmersion(fase, p) {
  const q = clamp01(Number.isFinite(p) ? p : 0);
  return fase === 'bajo' ? 1 + q : q;
}

/* Hash determinista 0..1 para semillas de instancias (mismo indice -> mismo valor). */
export function hash01(index, canal = 0) {
  let h = Math.imul((index | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((canal | 0) + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/* Direccion horizontal hacia la que mira una camara con yaw (convencion three, orden 'YXZ'). */
const adelanteX = (yaw) => -Math.sin(yaw);
const adelanteZ = (yaw) => -Math.cos(yaw);

/*
 * Clave de camara que mira a un punto (tx, tz) de la superficie desde la altura y con pitch < 0.
 * Por encima de la crema la camara siempre "apunta" al remolino, asi el plano llena el cuadro.
 */
function miraSuperficie(s, tx, tz, y, yawDeg, pitchDeg, rollDeg, fov, apertura) {
  const yaw = yawDeg * GRADOS;
  const pitch = pitchDeg * GRADOS;
  const horizontal = y / Math.tan(-pitch);
  const distancia = y / Math.sin(-pitch);
  return {
    s, x: tx - adelanteX(yaw) * horizontal, y, z: tz - adelanteZ(yaw) * horizontal,
    yaw, pitch, roll: rollDeg * GRADOS, fov, foco: distancia * 0.72, apertura,
  };
}

function libre(s, x, y, z, yawDeg, pitchDeg, rollDeg, fov, foco, apertura) {
  return { s, x, y, z, yaw: yawDeg * GRADOS, pitch: pitchDeg * GRADOS, roll: rollDeg * GRADOS, fov, foco, apertura };
}

/*
 * Guion de camara. s 0: plano cenital (empalma con el plano cenital de la taza), baja en espiral
 * siguiendo el remolino, se inclina hasta rasante para descubrir la palabra CREMA, cabecea y cruza
 * la superficie en s = 1; abajo mira hacia arriba (superficie y rayos) y termina frente a la bolsa.
 */
export const CLAVES_CAMARA = Object.freeze([
  miraSuperficie(0.0, 0, 0, 5.2, 0, -90, 0, 40, 0.0),
  miraSuperficie(0.28, 0.1, -0.1, 3.0, -22, -70, -2, 41, 0.2),
  miraSuperficie(0.55, 0.35, -0.35, 1.45, -44, -36, 2, 44, 0.32),
  miraSuperficie(0.8, 0.9, -0.5, 0.62, -58, -15, 3.5, 46, 0.36),
  miraSuperficie(0.92, 0.75, -0.55, 0.3, -64, -42, 1, 47, 0.3),
  libre(1.0, 0.62, -0.16, -0.42, -68, -72, 0, 48, 0.8, 0.25),
  libre(1.15, 0.7, -0.95, -0.55, -72, -42, -1, 50, 1.6, 0.25),
  libre(1.38, 0.9, -1.85, -0.75, -78, 20, -2, 52, 2.2, 0.32),
  libre(1.68, 1.4, -2.75, -1.05, -84, 2, 0, 48, 3.0, 0.42),
  libre(2.0, 1.85, -3.05, -1.25, -88, -3, 0, 44, 2.6, 0.5),
]);

const CANALES = Object.freeze(['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'fov', 'foco', 'apertura']);

/* Tangentes de Hermite no uniformes (Catmull-Rom cardinal) para un movimiento C1 sin frenazos. */
function tangente(claves, i, canal) {
  const a = claves[Math.max(0, i - 1)];
  const b = claves[Math.min(claves.length - 1, i + 1)];
  if (i === 0 || i === claves.length - 1) return 0;
  return (b[canal] - a[canal]) / (b.s - a.s);
}

const TANGENTES = Object.freeze(CLAVES_CAMARA.map((_, i) => Object.freeze(
  Object.fromEntries(CANALES.map((canal) => [canal, tangente(CLAVES_CAMARA, i, canal)])),
)));

function segmento(s) {
  let i = 0;
  while (i < CLAVES_CAMARA.length - 2 && s > CLAVES_CAMARA[i + 1].s) i += 1;
  return i;
}

/* Rellena `out` (sin asignar memoria) con la pose de camara para (fase, p). */
export function camaraInmersion(fase, p, out = {}) {
  const s = Math.min(2, Math.max(0, progresoInmersion(fase, p)));
  const i = segmento(s);
  const a = CLAVES_CAMARA[i];
  const b = CLAVES_CAMARA[i + 1];
  const h = b.s - a.s;
  const t = clamp01((s - a.s) / h);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const ta = TANGENTES[i];
  const tb = TANGENTES[i + 1];
  for (const canal of CANALES) {
    out[canal] = h00 * a[canal] + h10 * h * ta[canal] + h01 * b[canal] + h11 * h * tb[canal];
  }
  out.s = s;
  out.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, out.pitch));
  out.apertura = Math.max(0, out.apertura);
  return out;
}

/* Foco para el postproceso: distancia (unidades del grupo) y apertura 0..1. */
export function focoInmersion(fase, p, out = {}) {
  const pose = camaraInmersion(fase, p, out);
  out.distance = Math.max(0.2, pose.foco);
  out.aperture = pose.apertura;
  return out;
}

/* Lugar de la palabra gigante CREMA: al fondo, en la direccion de la mirada rasante (s = 0.8). */
const RASANTE = CLAVES_CAMARA[3];
export const PALABRA_CREMA = Object.freeze({
  x: RASANTE.x + adelanteX(RASANTE.yaw) * 13,
  y: 1.6,
  z: RASANTE.z + adelanteZ(RASANTE.yaw) * 13,
  yaw: RASANTE.yaw,
  ancho: 22,
});

/* Donde debe aparecer la bolsa (modulo vitrina): unos 3 m delante de la camara final. */
const FINAL = CLAVES_CAMARA[CLAVES_CAMARA.length - 1];
export const ANCLA_BOLSA = Object.freeze({
  x: FINAL.x + adelanteX(FINAL.yaw) * 2.6,
  y: FINAL.y - 0.15,
  z: FINAL.z + adelanteZ(FINAL.yaw) * 2.6,
  yaw: FINAL.yaw,
});

/* Lado de la superficie en que esta la camara: decide que mitad de la escena se dibuja. */
export function ladosVisibles(fase, p, out = {}) {
  const y = camaraInmersion(fase, p, out).y;
  out.arriba = y > -0.05;
  out.abajo = y < 0.05;
  return out;
}

const mayus = (texto) => String(texto).toLocaleUpperCase('es-CO');
const valido = (valor) => typeof valor === 'string' && valor.trim().length > 0;


/*
 * Palabras de las cintas, en espanol y solo con datos que existen en la marca (nunca inventa notas
 * de cata). Devuelve 4 textos: 0 sello de la casa (acento rojo), 1 lote y proceso, 2 notas o el
 * lema del laboratorio (azul de la bolsa), 3 variedad y origen.
 */
export function palabrasCintas(marca, indiceLote = 0) {
  const lotes = marca?.lotes ?? [];
  const lote = lotes.length ? lotes[Math.min(lotes.length - 1, Math.max(0, indiceLote | 0))] : null;
  const loteTexto = lote
    ? [lote.nombre, lote.proceso].filter(valido).map(mayus).join(' · ')
    : mayus(marca?.nombre ?? 'CAFÉ DE ESPECIALIDAD');
  const notas = lote?.notas?.filter(valido) ?? [];
  const lab = 'LABORATORIO DE CAFÉ';
  const segunda = notas.length ? notas.map(mayus).join(' · ') : lab;
  const variedad = lote && valido(lote.variedad) && mayus(lote.variedad) !== mayus(lote.nombre)
    ? `VARIEDAD ${mayus(lote.variedad)}`
    : null;
  const origen = valido(lote?.origen) ? `ORIGEN ${mayus(lote.origen)}` : null;
  const relleno = notas.length ? lab : (valido(marca?.ciudad) ? mayus(marca.ciudad) : mayus(marca?.pais ?? 'COLOMBIA'));
  const partes = [variedad, origen].filter(Boolean);
  if (partes.length < 2) partes.push(relleno);
  return Object.freeze(['TOSTADO EN CASA', loteTexto, segunda, partes.join(' · ')]);
}
