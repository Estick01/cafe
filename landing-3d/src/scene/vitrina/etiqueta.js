/*
 * Arte impreso de la bolsa, dibujado en canvas a partir de MARCA: franja vertical de color con el
 * nombre del lote en mayusculas verticales, insignia circular de la marca, ficha y sello "Muestra".
 * Ademas, un mapa de superficie compartido: relieve en R (sello rizado, fuelle, arrugas, borde de la
 * pegatina) y rugosidad en G (pelicula mate, franja e insignia satinadas).
 *
 * Medidas en centimetros sobre el panel (12 x 20 cm). El lienzo lleva frente (izquierda) y espalda
 * (derecha), como reparte la UV de bolsa.js.
 */
import { BOLSA, acabadoBolsa, tintaSobre } from '../../logic/vitrina.js';
import { MUESCA, SELLO_DESDE } from './bolsa.js';

export const FUENTES = Object.freeze({
  texto: '"Inter", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  titulo: '"Cormorant Garamond", Georgia, "Times New Roman", serif',
});

const PANEL = Object.freeze({ ancho: BOLSA.ancho * 100, alto: BOLSA.alto * 100 });
const SELLO_CM = (1 - SELLO_DESDE) * PANEL.alto;
export const FRANJA = Object.freeze({ x: 1.35, y: SELLO_CM + 0.55, ancho: 4.0, alto: 0 });
const FRANJA_FIN = 17.55;
const INSIGNIA = Object.freeze({ x: 8.75, y: 5.55, r: 1.85 });
/* Valvula impresa: la geometria 3D se coloca en este punto (cm desde arriba a la izquierda del frente). */
export const VALVULA_CM = Object.freeze({ x: 8.75, y: 9.05 });
const FUELLE_CM = 18.3;

export function tamanoLienzo(ancho) {
  return { ancho, alto: Math.round((ancho * BOLSA.alto) / (2 * BOLSA.ancho)) };
}

function lienzo(ancho, alto) {
  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  return canvas;
}

const hash = (n) => {
  const x = Math.sin(n * 91.345 + 47.853) * 43758.5453;
  return x - Math.floor(x);
};

function hexRgb(hex) {
  const v = parseInt(String(hex).replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
function mezclar(hex, otro, t) {
  const a = hexRgb(hex); const b = hexRgb(otro);
  return `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(',')})`;
}

function texto(ctx, str, x, y, { size, peso = 500, familia = FUENTES.texto, color, alinear = 'left', espaciado = 0, estilo = '' }) {
  ctx.font = `${estilo} ${peso} ${size}px ${familia}`.trim();
  ctx.fillStyle = color;
  ctx.textAlign = alinear;
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = `${espaciado}px`;
  ctx.fillText(str, x, y);
  ctx.letterSpacing = '0px';
}

/* Parte un texto en lineas que caben en `ancho`. */
function lineas(ctx, str, ancho) {
  const palabras = String(str).split(/\s+/).filter(Boolean);
  const out = [];
  let actual = '';
  palabras.forEach((palabra) => {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > ancho && actual) { out.push(actual); actual = palabra; } else actual = prueba;
  });
  if (actual) out.push(actual);
  return out;
}

function parrafo(ctx, str, x, y, ancho, interlinea, estiloTexto) {
  ctx.font = `${estiloTexto.estilo ?? ''} ${estiloTexto.peso ?? 500} ${estiloTexto.size}px ${estiloTexto.familia ?? FUENTES.texto}`.trim();
  ctx.letterSpacing = `${estiloTexto.espaciado ?? 0}px`;
  const list = lineas(ctx, str, ancho);
  ctx.letterSpacing = '0px';
  list.forEach((linea, i) => texto(ctx, linea, x, y + i * interlinea, estiloTexto));
  return y + list.length * interlinea;
}

function textoCurvo(ctx, str, cx, cy, r, centro, { size, color, peso = 600, espaciado = 0.12, abajo = false }) {
  ctx.save();
  ctx.font = `${peso} ${size}px ${FUENTES.texto}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...str];
  const anchos = chars.map((c) => ctx.measureText(c).width + size * espaciado);
  const total = anchos.reduce((s, w) => s + w, 0);
  let ang = centro - (abajo ? -1 : 1) * (total / r) / 2;
  chars.forEach((c, i) => {
    const paso = anchos[i] / r;
    const a = ang + (abajo ? -1 : 1) * paso / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + (abajo ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(c, 0, 0);
    ctx.restore();
    ang += (abajo ? -1 : 1) * paso;
  });
  ctx.restore();
}

/* Insignia provisional: circulo negro, taza de linea blanca y texto curvo. Se sustituye por `logo`. */
export function dibujarInsignia(ctx, cx, cy, r, marca, logo = null) {
  ctx.save();
  if (logo) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logo, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  const blanco = '#f6f3ee';
  ctx.strokeStyle = blanco;
  ctx.lineWidth = r * 0.022;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
  /* Taza de linea */
  const lw = r * 0.045;
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tw = r * 0.62; const th = r * 0.42; const ty = cy + r * 0.02;
  ctx.beginPath();
  ctx.moveTo(cx - tw / 2, ty - th / 2);
  ctx.lineTo(cx + tw / 2, ty - th / 2);
  ctx.bezierCurveTo(cx + tw / 2, ty + th * 0.35, cx + tw * 0.28, ty + th / 2, cx, ty + th / 2);
  ctx.bezierCurveTo(cx - tw * 0.28, ty + th / 2, cx - tw / 2, ty + th * 0.35, cx - tw / 2, ty - th / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx + tw / 2 + r * 0.07, ty - th * 0.05, r * 0.1, r * 0.12, 0, -Math.PI * 0.55, Math.PI * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - tw * 0.72, ty + th / 2 + r * 0.09);
  ctx.lineTo(cx + tw * 0.72, ty + th / 2 + r * 0.09);
  ctx.stroke();
  for (let i = -1; i <= 1; i += 1) {
    const sx = cx + i * r * 0.15;
    ctx.beginPath();
    ctx.moveTo(sx, ty - th / 2 - r * 0.06);
    ctx.bezierCurveTo(sx - r * 0.07, ty - th / 2 - r * 0.15, sx + r * 0.07, ty - th / 2 - r * 0.22, sx, ty - th / 2 - r * 0.32);
    ctx.stroke();
  }
  const resto = marca.nombre.slice(marca.nombreCorto.length).trim();
  textoCurvo(ctx, `${marca.nombreCorto} · ${resto}`.toUpperCase(), cx, cy, r * 0.73, -Math.PI / 2, { size: r * 0.15, color: blanco });
  textoCurvo(ctx, `· ${marca.pais} ·`.toUpperCase(), cx, cy, r * 0.73, Math.PI / 2, { size: r * 0.11, color: blanco, peso: 500, abajo: true });
  ctx.restore();
}

/* Nombre del lote vertical (de abajo arriba), ajustado al largo de la franja; parte en dos si no cabe. */
function nombreVertical(ctx, nombre, x, y, ancho, alto, color) {
  const mayus = nombre.toUpperCase();
  ctx.save();
  ctx.translate(x + ancho / 2, y + alto);
  ctx.rotate(-Math.PI / 2);
  const medir = (str, size) => {
    ctx.font = `700 ${size}px ${FUENTES.texto}`;
    ctx.letterSpacing = `${size * 0.04}px`;
    return ctx.measureText(str).width;
  };
  const largo = alto * 0.9;
  const una = Math.min(ancho * 0.66, (largo / medir(mayus, 100)) * 100);
  const palabras = mayus.split(/\s+/);
  let renglones = [mayus];
  let size = una;
  if (palabras.length > 1 && una < ancho * 0.5) {
    const corte = Math.ceil(palabras.length / 2);
    const dos = [palabras.slice(0, corte).join(' '), palabras.slice(corte).join(' ')];
    const sizeDos = Math.min(ancho * 0.4, ...dos.map((s) => (largo / medir(s, 100)) * 100));
    if (sizeDos > una * 1.05) { renglones = dos; size = sizeDos; }
  }
  ctx.font = `700 ${size}px ${FUENTES.texto}`;
  ctx.letterSpacing = `${size * 0.04}px`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const paso = size * 0.98;
  renglones.forEach((linea, i) => {
    const offset = (i - (renglones.length - 1) / 2) * paso;
    ctx.fillText(linea, alto * 0.05, offset + size * 0.04);
  });
  ctx.letterSpacing = '0px';
  ctx.restore();
}

function grano(ctx, x0, y0, w, h, densidad, semilla, claro, oscuro) {
  const n = Math.round(w * h * densidad);
  for (let i = 0; i < n; i += 1) {
    const r = hash(semilla + i * 1.37);
    ctx.fillStyle = r > 0.5 ? claro : oscuro;
    ctx.fillRect(x0 + hash(semilla + i * 7.1) * w, y0 + hash(semilla + i * 3.3) * h, 1.2, 1.2);
  }
}

function sello(ctx, x0, ancho, k, colorBolsa) {
  const alto = SELLO_CM * k;
  ctx.fillStyle = mezclar(colorBolsa, '#000000', 0.035);
  ctx.fillRect(x0, 0, ancho, alto);
  /* Rizado del sello termico: estrias verticales finas. */
  const paso = 0.075 * k;
  for (let x = x0; x < x0 + ancho; x += paso) {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, alto * 0.18, paso * 0.4, alto * 0.64);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(x + paso * 0.5, alto * 0.18, paso * 0.3, alto * 0.64);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(x0, alto - 0.05 * k, ancho, 0.05 * k);
  /* Linea de rasgado a la altura de la muesca. */
  const yMuesca = (1 - MUESCA.v) * PANEL.alto * k;
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 0.02 * k;
  ctx.setLineDash([0.12 * k, 0.1 * k]);
  ctx.beginPath(); ctx.moveTo(x0 + 0.3 * k, yMuesca); ctx.lineTo(x0 + ancho - 0.3 * k, yMuesca); ctx.stroke();
  ctx.setLineDash([]);
}

function fuelle(ctx, x0, ancho, k) {
  const y = FUELLE_CM * k;
  ctx.strokeStyle = 'rgba(0,0,0,0.07)';
  ctx.lineWidth = 0.05 * k;
  ctx.beginPath();
  ctx.moveTo(x0 + 0.1 * k, y + 1.5 * k);
  ctx.quadraticCurveTo(x0 + ancho / 2, y - 0.9 * k, x0 + ancho - 0.1 * k, y + 1.5 * k);
  ctx.stroke();
}

function marcaMuestra(ctx, x0, k) {
  const esquina = { x: x0 + PANEL.ancho * k, y: SELLO_CM * k };
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, esquina.y, PANEL.ancho * k, PANEL.alto * k); ctx.clip();
  ctx.translate(esquina.x, esquina.y);
  ctx.rotate(Math.PI / 4);
  const d = 1.75 * k;
  ctx.fillStyle = '#111111';
  ctx.fillRect(-d * 1.3, d - 0.34 * k, d * 2.6, 0.68 * k);
  ctx.fillStyle = '#c8202f';
  ctx.fillRect(-d * 1.3, d + 0.34 * k - 0.07 * k, d * 2.6, 0.07 * k);
  texto(ctx, 'MUESTRA', 0, d + 0.13 * k, { size: 0.36 * k, peso: 700, color: '#f6f3ee', alinear: 'center', espaciado: 0.08 * k });
  ctx.restore();
}

function filasFicha(lote) {
  const conNotas = lote.notas.length > 0;
  return [
    ['Origen', lote.origen],
    ['Variedad', conNotas ? lote.variedad : null],
    ['Proceso', conNotas ? lote.proceso : null],
    ['Tueste', lote.tueste],
    ['Altitud', lote.altitud],
  ].filter(([, valor]) => valor);
}

function frente(ctx, k, lote, marca, resumen, logo) {
  const cm = value => value * k;
  const x = cm(2.1), y = cm(2.5), w = cm(7.8), head = cm(4.5), h = cm(14.7);
  ctx.fillStyle = marca.bolsa.franjaSuperior;
  ctx.fillRect(x, y, w, head);
  texto(ctx, marca.bolsa.textoFranja, x + w / 2, y + cm(0.65), { size: cm(0.35), color: '#ffffff', alinear: 'center' });
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = cm(0.08);
  ctx.beginPath();
  ctx.moveTo(x + cm(2.5), y + cm(1.25)); ctx.lineTo(x + cm(2.7), y + cm(2.5));
  ctx.quadraticCurveTo(x + cm(3.9), y + cm(3.3), x + cm(5.1), y + cm(2.5));
  ctx.lineTo(x + cm(5.3), y + cm(1.25)); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + cm(5.4), y + cm(1.8), cm(0.55), -Math.PI / 2, Math.PI / 2); ctx.stroke();
  texto(ctx, 'Coffee Lab', x + w / 2, y + cm(3.8), { size: cm(0.65), color: '#ffffff', alinear: 'center' });
  ctx.fillStyle = lote.etiqueta; ctx.fillRect(x, y + head, w, h - head);
  nombreVertical(ctx, lote.nombre, x + cm(0.35), y + head + cm(0.4), w - cm(1.2), h - head - cm(1.7), lote.textoEtiqueta);
  texto(ctx, 'Exotic Colombian coffee varieties!', x + w / 2, y + h - cm(0.4), { size: cm(0.22), color: lote.textoEtiqueta, alinear: 'center' });
  if (lote.ejemplo) marcaMuestra(ctx, 0, k);
}

function espalda(ctx, x0, k, lote, marca, logo) {
  const tinta = tintaSobre(lote.color);
  const cm = (v) => v * k;
  const cx = x0 + cm(PANEL.ancho / 2);
  ctx.fillStyle = lote.etiqueta;
  ctx.fillRect(x0 + cm(1.2), cm(SELLO_CM + 0.5), cm(PANEL.ancho - 2.4), cm(0.12));
  dibujarInsignia(ctx, cx, cm(5.3), cm(1.35), marca, logo);
  texto(ctx, marca.nombre, cx, cm(8.0), { size: cm(0.78), peso: 500, familia: FUENTES.titulo, color: tinta, alinear: 'center' });
  let y = parrafo(ctx, marca.lema.toUpperCase(), cx, cm(8.65), cm(9), cm(0.4), { size: cm(0.23), peso: 600, color: rgba(tinta, 0.6), alinear: 'center', espaciado: cm(0.05) });
  if (marca.descripcion) {
    y = parrafo(ctx, marca.descripcion, cx, y + cm(0.45), cm(8.4), cm(0.5), { size: cm(0.32), peso: 400, color: rgba(tinta, 0.82), alinear: 'center' });
  }
  y += cm(0.5);
  ctx.fillStyle = rgba(tinta, 0.2);
  ctx.fillRect(x0 + cm(2), y, cm(PANEL.ancho - 4), cm(0.02));
  y += cm(0.8);
  [['Lote', lote.nombre], ['Variedad', lote.variedad], ['Proceso', lote.proceso], ['Origen', lote.origen], ['Tueste', lote.tueste], ['Contenido', lote.presentacion]]
    .filter(([, v]) => v)
    .forEach(([etiqueta, valor]) => {
      texto(ctx, etiqueta.toUpperCase(), x0 + cm(2), y, { size: cm(0.22), peso: 600, color: rgba(tinta, 0.55), espaciado: cm(0.04) });
      texto(ctx, valor, x0 + cm(PANEL.ancho - 2), y, { size: cm(0.3), peso: 500, color: tinta, alinear: 'right' });
      y += cm(0.58);
    });
  const lugar = [marca.ciudad, marca.pais].filter(Boolean).join(' · ');
  texto(ctx, lugar, cx, cm(16.6), { size: cm(0.28), peso: 500, color: rgba(tinta, 0.75), alinear: 'center' });
  const usuario = /instagram\.com\/([^/?#]+)/.exec(marca.instagram ?? '')?.[1];
  if (usuario) texto(ctx, `@${usuario}`, cx, cm(17.15), { size: cm(0.28), peso: 600, color: tinta, alinear: 'center' });
  if (lote.ejemplo) {
    texto(ctx, 'MUESTRA · DATOS POR CONFIRMAR', cx, cm(17.75), { size: cm(0.2), peso: 700, color: '#c8202f', alinear: 'center', espaciado: cm(0.04) });
  }
}

/* Dibuja (o redibuja) la etiqueta de un lote en `canvas`. */
export function dibujarEtiqueta(canvas, { lote, marca, resumen, logo = null }) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width; const h = canvas.height;
  const k = (w / 2) / PANEL.ancho; // px por cm
  const base = lote.color;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const brillo = ctx.createLinearGradient(0, 0, 0, h);
  brillo.addColorStop(0, 'rgba(255,255,255,0.05)');
  brillo.addColorStop(0.6, 'rgba(0,0,0,0)');
  brillo.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = brillo;
  ctx.fillRect(0, 0, w, h);
  const acabado = acabadoBolsa(base);
  if (acabado === 'kraft') grano(ctx, 0, 0, w, h, 0.02, 3, 'rgba(255,240,210,0.16)', 'rgba(60,35,10,0.16)');
  else grano(ctx, 0, 0, w, h, 0.004, 3, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.05)');
  sello(ctx, 0, w, k, base);
  fuelle(ctx, 0, w / 2, k);
  fuelle(ctx, w / 2, w / 2, k);
  frente(ctx, k, lote, marca, resumen, logo);
  espalda(ctx, w / 2, k, lote, marca, logo);
  return canvas;
}

export function crearLienzoEtiqueta(ancho) {
  const { ancho: w, alto: h } = tamanoLienzo(ancho);
  return lienzo(w, h);
}

/*
 * Mapa de superficie: R = altura del relieve, G = rugosidad. Igual para todos los lotes de un
 * mismo acabado porque la maqueta (franja, insignia, sellos) es comun.
 */
export function crearSuperficie(ancho, acabado) {
  const { ancho: w, alto: h } = tamanoLienzo(ancho);
  const k = (w / 2) / PANEL.ancho;
  const cm = (v) => v * k;
  const relieve = lienzo(w, h).getContext('2d');
  relieve.fillStyle = 'rgb(128,128,128)';
  relieve.fillRect(0, 0, w, h);
  const ruido = acabado === 'kraft' ? 0.06 : 0.025;
  grano(relieve, 0, 0, w, h, ruido, 11, 'rgba(255,255,255,0.35)', 'rgba(0,0,0,0.35)');
  /* Arrugas suaves: trazos curvos difuminados en los hombros y el fuelle. */
  relieve.filter = `blur(${Math.max(1, cm(0.06))}px)`;
  for (let i = 0; i < 26; i += 1) {
    const lado = hash(i * 5.1) < 0.5 ? 0 : w / 2;
    const x = lado + hash(i * 2.7) * w / 2;
    const y = cm(2.6 + hash(i * 3.9) * 3.4) + (i % 3 === 0 ? cm(12.5) : 0);
    relieve.strokeStyle = hash(i * 8.3) > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
    relieve.lineWidth = cm(0.05 + hash(i) * 0.08);
    relieve.beginPath();
    relieve.moveTo(x, y);
    relieve.quadraticCurveTo(x + cm(0.8 * (hash(i * 4.4) - 0.5)), y + cm(0.9), x + cm(1.6 * (hash(i * 6.6) - 0.5)), y + cm(1.8 + hash(i * 1.1)));
    relieve.stroke();
  }
  relieve.filter = 'none';
  /* Rizado del sello: estrias muy marcadas. */
  const alto = SELLO_CM * k;
  for (let x = 0; x < w; x += cm(0.075)) {
    relieve.fillStyle = 'rgb(225,225,225)';
    relieve.fillRect(x, alto * 0.16, cm(0.035), alto * 0.68);
    relieve.fillStyle = 'rgb(40,40,40)';
    relieve.fillRect(x + cm(0.04), alto * 0.16, cm(0.03), alto * 0.68);
  }
  relieve.fillStyle = 'rgb(70,70,70)';
  relieve.fillRect(0, alto - cm(0.06), w, cm(0.06));
  /* Costura del fuelle y borde de la pegatina. */
  relieve.strokeStyle = 'rgb(60,60,60)';
  relieve.lineWidth = cm(0.07);
  [0, w / 2].forEach((x0) => {
    relieve.beginPath();
    relieve.moveTo(x0 + cm(0.1), cm(FUELLE_CM + 1.5));
    relieve.quadraticCurveTo(x0 + w / 4, cm(FUELLE_CM - 0.9), x0 + w / 2 - cm(0.1), cm(FUELLE_CM + 1.5));
    relieve.stroke();
  });
  relieve.strokeStyle = 'rgb(175,175,175)';
  relieve.lineWidth = cm(0.035);
  relieve.strokeRect(cm(FRANJA.x), cm(FRANJA.y), cm(FRANJA.ancho), cm(FRANJA_FIN - FRANJA.y));

  const rugosidad = lienzo(w, h).getContext('2d');
  const mate = acabado === 'kraft' ? 0.86 : acabado === 'oscuro' ? 0.58 : 0.5;
  const gris = (r) => `rgb(${Math.round(r * 255)},${Math.round(r * 255)},${Math.round(r * 255)})`;
  rugosidad.fillStyle = gris(mate);
  rugosidad.fillRect(0, 0, w, h);
  rugosidad.fillStyle = gris(0.42);
  rugosidad.fillRect(0, 0, w, alto);
  rugosidad.fillStyle = gris(0.24);
  rugosidad.fillRect(cm(FRANJA.x), cm(FRANJA.y), cm(FRANJA.ancho), cm(FRANJA_FIN - FRANJA.y));
  rugosidad.beginPath(); rugosidad.arc(cm(INSIGNIA.x), cm(INSIGNIA.y), cm(INSIGNIA.r), 0, Math.PI * 2); rugosidad.fill();

  const a = relieve.getImageData(0, 0, w, h);
  const b = rugosidad.getImageData(0, 0, w, h);
  for (let i = 0; i < a.data.length; i += 4) {
    a.data[i + 1] = b.data[i + 1];
    a.data[i + 2] = 0;
    a.data[i + 3] = 255;
  }
  const salida = lienzo(w, h);
  salida.getContext('2d').putImageData(a, 0, 0);
  return salida;
}

/* Centro de la valvula en coordenadas del modelo (x en metros, v en [0,1]). */
export function valvulaEnModelo() {
  return { x: VALVULA_CM.x / 100 - BOLSA.ancho / 2, v: 1 - VALVULA_CM.y / PANEL.alto };
}
