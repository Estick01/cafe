/*
 * Vitrina de producto: poses de las bolsas, del anillo orbital y de los granos por fase y progreso.
 * Funciones puras, sin Three ni DOM. Unidades en metros, ejes de Three (Y arriba, Z hacia camara).
 *
 * Las funciones `...Into` escriben en objetos preasignados para no crear basura por fotograma; las
 * variantes sin sufijo devuelven objetos nuevos y existen para pruebas y depuracion.
 */

export const FASES = Object.freeze(['hero', 'emerge', 'tienda']);

/* Bolsa stand-up de 250 g: ancho x alto x fondo maximo (con fuelle abierto). */
export const BOLSA = Object.freeze({ ancho: 0.12, alto: 0.2, fondo: 0.07 });
/* Las etiquetas DOM se anclan sobre la bolsa, a esta altura sobre su borde superior. */
export const ANCLA_SOBRE_BOLSA = 0.035;

/* Taza de espresso sin asa, ceramica mate con filo dorado: radio de boca, de base y alto. */
export const TAZA = Object.freeze({ radio: 0.033, base: 0.027, alto: 0.06, platillo: 0.052 });

/* Superficie del liquido de la fase emerge (y = 0 en el espacio del grupo). */
export const LIQUIDO = Object.freeze({ y: 0, radio: 0.55 });
export const GRANOS = Object.freeze({ alta: 14, baja: 8, alturaMax: 0.46, radioMin: 0.07, radioMax: 0.2 });

/* Camara sugerida por fase (posicion, objetivo, fov vertical en grados), para 4 bolsas en 16:10. */
export const VITRINA_CAMERA = Object.freeze({
  hero: Object.freeze({ position: Object.freeze([0, 0.2, 0.92]), target: Object.freeze([0, 0.095, 0]), fov: 30 }),
  emerge: Object.freeze({ position: Object.freeze([0, 0.15, 0.62]), target: Object.freeze([0, 0.09, 0]), fov: 30 }),
  tienda: Object.freeze({ position: Object.freeze([0, 0.15, 0.74]), target: Object.freeze([0, 0.05, 0]), fov: 30 }),
});

const TAU = Math.PI * 2;
const ARCO = Object.freeze({ separacion: 0.152, profundidad: 0.04, giro: 0.26 });
/* Medio ancho de la fila (centro de la bolsa extrema). */
export const medioAncho = (n) => ((n - 1) / 2) * ARCO.separacion;

export const clamp01 = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) ** 3;
const fract = (x) => x - Math.floor(x);

export function normalizarFase(fase) {
  return FASES.includes(fase) ? fase : 'hero';
}

/* Seleccion entera valida en [0, n-1]; cualquier entrada rara cae en 0. */
export function seleccionValida(seleccion, n) {
  if (!(n > 0)) return 0;
  const value = Math.round(Number(seleccion));
  if (!Number.isFinite(value)) return 0;
  return Math.min(n - 1, Math.max(0, value));
}

/* Acerca la seleccion suavizada (flotante) a la objetivo con amortiguacion exponencial. */
export function suavizarSeleccion(actual, objetivo, dt, rapidez = 7) {
  if (!Number.isFinite(actual)) return objetivo;
  const paso = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  const k = 1 - Math.exp(-rapidez * paso);
  const next = actual + (objetivo - actual) * k;
  return Math.abs(next - objetivo) < 1e-4 ? objetivo : next;
}

/* Peso de resalte de la bolsa i para una seleccion flotante: 1 en la elegida, 0 a una de distancia. */
export const pesoSeleccion = (i, seleccionF) => Math.max(0, 1 - Math.abs(i - seleccionF));

/* Hash determinista en [0,1). */
export function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return fract(x);
}

/* Huecos de la fila en arco: la del centro adelantada, las de los lados giradas hacia dentro. */
export function ranuraInto(out, i, n) {
  const mid = (n - 1) / 2;
  const k = n > 1 ? (i - mid) / Math.max(mid, 1) : 0; // -1..1
  out.x = (i - mid) * ARCO.separacion;
  out.z = ARCO.profundidad * (1 - k * k) - ARCO.profundidad * 0.5;
  out.rotY = -k * ARCO.giro;
  return out;
}

/* Tazas a los lados de la fila. */
export function tazasInto(out, n) {
  const borde = medioAncho(n) + 0.118;
  out[0].x = -borde; out[0].z = 0.045; out[0].rotY = 0;
  out[1].x = borde; out[1].z = 0.03; out[1].rotY = 0;
  return out;
}

export function crearPose() {
  return { x: 0, y: 0, z: 0, rotY: 0, inclinacion: 0, escala: 1, visible: true, resalte: 0, brillo: 1 };
}

const ranura = { x: 0, z: 0, rotY: 0 };

function poseFila(out, i, n, p, seleccionF, time, tienda) {
  ranuraInto(ranura, i, n);
  const fase = i * 1.7;
  const vaiven = Math.sin(time * 0.9 + fase);
  const entrada = tienda ? 1 : easeOut(clamp01(p * 1.6));
  const peso = tienda ? smooth(pesoSeleccion(i, seleccionF)) : 0;
  out.x = ranura.x * (tienda ? 1.08 : 1);
  out.z = ranura.z + (1 - entrada) * -0.06 + peso * 0.05;
  out.y = peso * 0.028 + Math.sin(time * 1.3 + fase) * 0.0016;
  out.rotY = ranura.rotY * (1 - peso * 0.85) + vaiven * 0.035 + (1 - entrada) * 0.35 * (i - (n - 1) / 2);
  out.inclinacion = Math.sin(time * 0.7 + fase * 1.3) * 0.012;
  out.escala = 1 + peso * 0.06;
  out.visible = true;
  out.resalte = peso;
  out.brillo = tienda ? 0.82 + peso * 0.3 : 0.55 + 0.45 * entrada;
  return out;
}

/* Profundidad a la que empieza sumergida la bolsa en emerge: su copete apenas asoma. */
const HUNDIDA = -BOLSA.alto * 1.02;

function poseEmerge(out, i, seleccion, p, time) {
  const elegida = i === seleccion;
  const subida = easeOut(clamp01(p / 0.85));
  out.x = 0;
  out.z = 0;
  out.y = lerp(HUNDIDA, 0.012, subida) + (elegida ? Math.sin(time * 1.1) * 0.002 * subida : 0);
  out.rotY = lerp(-1.1, 0.22, smooth(clamp01(p))) + Math.sin(time * 0.6) * 0.03;
  out.inclinacion = (1 - subida) * 0.07 + Math.sin(time * 0.8) * 0.01;
  out.escala = 1;
  out.visible = elegida;
  out.resalte = elegida ? 1 : 0;
  out.brillo = 0.6 + 0.4 * subida;
  return out;
}

/*
 * Pose de cada bolsa. `seleccionF` puede ser flotante (seleccion suavizada); en emerge se usa la
 * entera mas cercana porque solo aparece una bolsa.
 */
export function posesInto(out, fase, p, seleccionF, time, n = out.length) {
  const f = normalizarFase(fase);
  const pp = clamp01(p);
  const t = Number.isFinite(time) ? time : 0;
  const sel = Number.isFinite(seleccionF) ? Math.min(n - 1, Math.max(0, seleccionF)) : 0;
  for (let i = 0; i < n; i += 1) {
    if (f === 'emerge') poseEmerge(out[i], i, seleccionValida(sel, n), pp, t);
    else poseFila(out[i], i, n, pp, sel, t, f === 'tienda');
  }
  return out;
}

export function poses(fase, p, seleccion, time, n) {
  const out = Array.from({ length: n }, crearPose);
  return posesInto(out, fase, p, seleccion, time, n);
}

/*
 * Anillo orbital. Arco visible de longitud `barrido` (radianes) que termina en `cabeza`, donde
 * esta el destello. El shader decide la luminosidad con estos numeros.
 */
export function crearAnillo() {
  return { radio: 0.3, cx: 0, cy: 0.1, cz: 0, inclinacion: 0.22, giro: 0, cabeza: 0, barrido: TAU, intensidad: 1, grosor: 1 };
}

export function anilloInto(out, fase, p, seleccionF, time, n) {
  const f = normalizarFase(fase);
  const pp = clamp01(p);
  const t = Number.isFinite(time) ? time : 0;
  const deriva = t * 0.55;
  if (f === 'emerge') {
    const sube = easeOut(clamp01(p / 0.85));
    out.radio = lerp(0.07, 0.19, sube);
    out.cx = 0; out.cy = LIQUIDO.y + 0.002; out.cz = 0;
    out.inclinacion = 0; out.giro = 0;
    out.barrido = TAU;
    out.cabeza = 1.2 + deriva * 1.4;
    out.intensidad = 0.25 + 0.55 * sube;
    out.grosor = 0.8;
    return out;
  }
  if (f === 'tienda') {
    const sel = Number.isFinite(seleccionF) ? Math.min(n - 1, Math.max(0, seleccionF)) : 0;
    const i0 = Math.floor(sel);
    const i1 = Math.min(n - 1, i0 + 1);
    const a = ranuraInto(ranura, i0, n);
    const ax = a.x; const az = a.z;
    ranuraInto(a, i1, n);
    const k = sel - i0;
    out.radio = 0.118;
    out.cx = lerp(ax, a.x, k) * 1.08;
    out.cz = lerp(az, a.z, k) + 0.05;
    out.cy = 0.03 + 0.022;
    out.inclinacion = 0.16;
    out.giro = 0;
    out.barrido = TAU;
    out.cabeza = 0.6 + deriva * 1.6;
    out.intensidad = 1.15;
    out.grosor = 1;
    return out;
  }
  const entra = easeOut(clamp01(pp / 0.8));
  out.radio = medioAncho(n) + 0.19;
  out.cx = 0; out.cy = 0.085; out.cz = 0.005;
  out.inclinacion = 0.2;
  out.giro = -0.18;
  out.barrido = Math.max(0.02, entra * TAU);
  out.cabeza = -Math.PI / 2 + 0.5 + entra * TAU + deriva * entra;
  out.intensidad = 0.35 + 0.85 * smooth(clamp01(pp * 1.4));
  out.grosor = 1;
  return out;
}

export function anillo(fase, p, seleccion, time, n) {
  return anilloInto(crearAnillo(), fase, p, seleccion, time, n);
}

/*
 * Grano que cae en emerge. Ciclo en bucle por tiempo; la cantidad visible crece con p.
 * Devuelve false si el grano no se dibuja.
 */
export function granoInto(out, i, total, p, time) {
  const pp = clamp01(p);
  const visibles = Math.round(total * smooth(clamp01((pp - 0.05) / 0.5)));
  const semilla = i + 1;
  const angulo = hash01(semilla) * TAU;
  const radio = lerp(GRANOS.radioMin, GRANOS.radioMax, hash01(semilla * 3.1));
  const periodo = lerp(1.6, 2.6, hash01(semilla * 5.7));
  const ciclo = fract((Number.isFinite(time) ? time : 0) / periodo + hash01(semilla * 9.2));
  const caida = ciclo * ciclo; // aceleracion constante
  out.x = Math.cos(angulo) * radio;
  out.z = Math.sin(angulo) * radio * 0.8;
  out.y = GRANOS.alturaMax * (1 - caida) - 0.02;
  out.rx = hash01(semilla * 2.3) * TAU + ciclo * 7;
  out.ry = hash01(semilla * 4.1) * TAU;
  out.rz = hash01(semilla * 6.3) * TAU + ciclo * 5;
  out.escala = lerp(0.85, 1.15, hash01(semilla * 8.8));
  out.visible = i < visibles && out.y > LIQUIDO.y - 0.01;
  return out.visible;
}

/* Punto de anclaje (espacio del grupo) de la etiqueta DOM de una bolsa. */
export function anclaInto(out, pose) {
  out.x = pose.x;
  out.y = pose.y + BOLSA.alto * pose.escala + ANCLA_SOBRE_BOLSA;
  out.z = pose.z;
  return out;
}

export function anclas(posesActuales) {
  return posesActuales.map((pose) => anclaInto({ x: 0, y: 0, z: 0 }, pose));
}

/* Luminancia relativa aproximada de un color '#rrggbb' (sRGB, sin linealizar del todo). */
export function luminancia(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
}

/*
 * Acabado de la bolsa segun su color: pelicula blanca mate (la bolsa real de la marca), kraft para
 * tonos medios calidos y pelicula soft-touch para los oscuros.
 */
export function acabadoBolsa(hex) {
  const l = luminancia(hex);
  if (l > 0.6) return 'blanco';
  if (l > 0.18) return 'kraft';
  return 'oscuro';
}

/* Tinta del texto sobre la bolsa: crema sobre oscuro, tostado oscuro sobre kraft. */
export const tintaSobre = (hex, clara = '#f2e6d3', oscura = '#2a1a10') => (luminancia(hex) > 0.25 ? oscura : clara);

/* Parametros de malla por calidad. */
export function mallaBolsa(quality) {
  return quality === 'baja'
    ? Object.freeze({ columnas: 40, filas: 34, etiqueta: 1024, relieve: 512, tubo: 220, ladosTubo: 6 })
    : Object.freeze({ columnas: 72, filas: 54, etiqueta: 2048, relieve: 1024, tubo: 480, ladosTubo: 8 });
}

/* Nivel de tueste en 5 granos (como la etiqueta trasera real); null si no hay dato. */
const TUESTES = Object.freeze({ claro: 1, 'medio claro': 2, medio: 3, 'medio oscuro': 4, oscuro: 5 });
export function nivelTueste(tueste) {
  if (!tueste) return null;
  return TUESTES[String(tueste).trim().toLowerCase()] ?? null;
}
