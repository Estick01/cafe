/*
 * Tienda: pestañas + flechas para elegir lote y una ficha por lote (patron de pestañas ARIA).
 * Todo sale de src/marca.js; los campos vacios (null o listas vacias) no se muestran.
 *
 * La seleccion va del DOM al 3D con `tienda:seleccion` { index, id, fuente: 'ui' }. Si otro
 * modulo (p. ej. la escena) lanza el mismo evento con otra fuente, la interfaz se sincroniza.
 */
import { MARCA, enlacePedido } from '../marca.js';
import { crearTaza } from './marcaLogo.js';
import { alProgreso, crear, crearEscritor, dosCifras } from './util.js';

const CAMPOS = Object.freeze([
  ['variedad', 'Variedad'],
  ['proceso', 'Proceso'],
  ['tueste', 'Tueste'],
  ['altitud', 'Altitud'],
  ['presentacion', 'Presentación'],
]);

const formatoPrecio = (() => {
  try {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: MARCA.moneda, maximumFractionDigits: 0 });
  } catch {
    return null;
  }
})();

export function textoPrecio(precio) {
  if (typeof precio !== 'number' || !Number.isFinite(precio) || precio <= 0) return 'Consultar precio';
  return formatoPrecio ? formatoPrecio.format(precio) : `${precio} ${MARCA.moneda}`;
}

export const canalPedido = () => (MARCA.whatsapp ? 'WhatsApp' : 'Instagram');

const tieneValor = (valor) => valor !== null && valor !== undefined && String(valor).trim() !== '';

function lugarDe(lote) {
  return [...new Set([lote.finca, lote.origen, MARCA.pais].filter(tieneValor))].join(', ');
}

function crearPestana(lote, indice) {
  const pestana = crear('button', 'pestana');
  pestana.type = 'button';
  pestana.id = `pestana-${lote.id}`;
  pestana.setAttribute('role', 'tab');
  pestana.setAttribute('aria-controls', `ficha-${lote.id}`);
  pestana.style.setProperty('--color-lote', lote.etiqueta);
  pestana.append(
    crear('span', 'pestana-num', dosCifras(indice + 1)),
    crear('span', 'pestana-nombre', lote.nombre),
    crear('span', 'pestana-detalle', lote.proceso),
  );
  return pestana;
}

function crearDatos(lote) {
  const lista = crear('dl', 'ficha-datos');
  CAMPOS.filter(([clave]) => tieneValor(lote[clave])).forEach(([clave, rotulo]) => {
    const fila = crear('div');
    fila.append(crear('dt', null, rotulo), crear('dd', null, lote[clave]));
    lista.appendChild(fila);
  });
  return lista;
}

function crearNotas(lote) {
  if (!lote.notas?.length) return null;
  const bloque = crear('div', 'ficha-notas');
  bloque.appendChild(crear('p', 'ficha-rotulo', 'Notas en taza'));
  const chips = crear('ul', 'chips');
  chips.setAttribute('aria-label', 'Notas en taza');
  lote.notas.forEach((nota) => chips.appendChild(crear('li', 'chip', nota)));
  bloque.appendChild(chips);
  return bloque;
}

function crearCompra(lote) {
  const compra = crear('div', 'ficha-compra');
  const precio = crear('p', 'ficha-precio');
  precio.append(crear('span', 'ficha-rotulo', 'Precio'), crear('span', 'ficha-precio-valor', textoPrecio(lote.precio)));
  const boton = crear('a', 'boton boton--primario boton--brillo boton--pedir');
  boton.href = enlacePedido(lote);
  boton.target = '_blank';
  boton.rel = 'noopener noreferrer';
  boton.append(crear('span', null, 'Pedir'), crear('span', 'sr', ` ${lote.nombre}`), crear('span', null, ` por ${canalPedido()}`));
  boton.appendChild(crear('span', 'sr', ' (se abre en una pestaña nueva)'));
  const flecha = crear('span', 'boton-flecha', '→');
  flecha.setAttribute('aria-hidden', 'true');
  boton.appendChild(flecha);
  const canal = crear('p', 'ficha-canal', MARCA.whatsapp
    ? 'Se abre WhatsApp con tu pedido ya escrito.'
    : 'Te respondemos por mensaje directo.');
  compra.append(precio, boton, canal);
  return compra;
}

/* Franja vertical como la etiqueta de la bolsa: bloque verde "Tostado por:" + bloque del lote. */
function crearFranja(lote) {
  const { bolsa } = MARCA;
  const franja = crear('div', 'ficha-franja');
  franja.setAttribute('aria-hidden', 'true');
  franja.style.setProperty('--franja-superior', bolsa?.franjaSuperior ?? 'var(--verde)');
  franja.style.setProperty('--texto-lote', lote.textoEtiqueta ?? '#ffffff');
  const arriba = crear('span', 'ficha-franja-arriba');
  arriba.append(crear('span', 'ficha-franja-rotulo', bolsa?.textoFranja ?? ''), crearTaza('ficha-franja-taza'));
  const abajo = crear('span', 'ficha-franja-lote');
  abajo.appendChild(crear('span', 'ficha-franja-nombre', lote.nombre));
  franja.append(arriba, abajo);
  return franja;
}

function crearFicha(lote, indice, total) {
  const ficha = crear('article', 'ficha vidrio');
  ficha.id = `ficha-${lote.id}`;
  ficha.setAttribute('role', 'tabpanel');
  ficha.setAttribute('aria-labelledby', `ficha-nombre-${lote.id}`);
  ficha.tabIndex = 0;
  ficha.style.setProperty('--color-lote', lote.etiqueta);

  const cabeza = crear('header', 'ficha-cabeza');
  const meta = crear('p', 'ficha-meta');
  meta.appendChild(crear('span', 'ficha-num', `${dosCifras(indice + 1)} / ${dosCifras(total)}`));
  if (lote.ejemplo) meta.appendChild(crear('span', 'etiqueta-muestra', 'Muestra'));
  if (lote.ejemplo && lote.notas?.length) meta.appendChild(crear('span', 'ficha-meta-nota', 'Notas ilustrativas'));
  const nombre = crear('h3', 'ficha-nombre', lote.nombre);
  nombre.id = `ficha-nombre-${lote.id}`;
  cabeza.append(meta, nombre, crear('p', 'ficha-origen', lugarDe(lote)));

  const cuerpo = crear('div', 'ficha-cuerpo');
  cuerpo.append(...[cabeza, crearNotas(lote), crearDatos(lote), crearCompra(lote)].filter(Boolean));
  const explorar = crear('button', 'boton-explorar', 'Tomar y explorar la bolsa ↗');
  explorar.type = 'button';
  explorar.addEventListener('click', () => document.dispatchEvent(new CustomEvent('producto:abrir', { detail: { index: indice } })));
  cuerpo.append(explorar);
  ficha.append(crearFranja(lote), cuerpo);
  return ficha;
}

export function initTienda(seccion = document.getElementById('tienda')) {
  const lotes = MARCA.lotes;
  const contPestanas = seccion?.querySelector('[data-pestanas]');
  const contFichas = seccion?.querySelector('[data-fichas]');
  if (!seccion || !contPestanas || !contFichas || !lotes.length) return null;

  const pestanas = lotes.map(crearPestana);
  const fichas = lotes.map((lote, i) => crearFicha(lote, i, lotes.length));
  contPestanas.replaceChildren(...pestanas);
  contFichas.replaceChildren(...fichas);

  const palabra = seccion.querySelector('[data-tienda-palabra]');
  const cuenta = seccion.querySelector('[data-cuenta]');
  const escribir = crearEscritor(seccion);
  let actual = -1;

  function pintar(indice) {
    pestanas.forEach((pestana, i) => {
      const activa = i === indice;
      pestana.setAttribute('aria-selected', String(activa));
      pestana.tabIndex = activa ? 0 : -1;
    });
    fichas.forEach((ficha, i) => { ficha.hidden = i !== indice; });
    const lote = lotes[indice];
    if (palabra) {
      palabra.textContent = lote.nombre;
      palabra.style.setProperty('--letras', String(Math.max(4, lote.nombre.length)));
    }
    if (cuenta) cuenta.textContent = `${dosCifras(indice + 1)} / ${dosCifras(lotes.length)}`;
    seccion.style.setProperty('--color-lote', lote.etiqueta);
    seccion.dataset.lote = lote.id;
  }

  function seleccionar(indice, { enfocar = false, emitir = true } = {}) {
    const siguiente = ((Math.round(indice) % lotes.length) + lotes.length) % lotes.length;
    if (siguiente !== actual) {
      actual = siguiente;
      pintar(actual);
      if (emitir) {
        document.dispatchEvent(new CustomEvent('tienda:seleccion', {
          detail: { index: actual, id: lotes[actual].id, fuente: 'ui' },
        }));
      }
    }
    if (enfocar) pestanas[actual].focus();
  }

  contPestanas.addEventListener('click', (evento) => {
    const pestana = evento.target.closest('[role="tab"]');
    if (pestana) seleccionar(pestanas.indexOf(pestana));
  });

  contPestanas.addEventListener('keydown', (evento) => {
    const pasos = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (evento.key in pasos) seleccionar(actual + pasos[evento.key], { enfocar: true });
    else if (evento.key === 'Home') seleccionar(0, { enfocar: true });
    else if (evento.key === 'End') seleccionar(lotes.length - 1, { enfocar: true });
    else return;
    evento.preventDefault();
  });

  seccion.querySelectorAll('[data-flecha]').forEach((boton) => {
    boton.addEventListener('click', () => seleccionar(actual + Number(boton.dataset.flecha)));
  });

  document.addEventListener('tienda:seleccion', (evento) => {
    const { index, fuente } = evento.detail ?? {};
    if (fuente === 'ui' || !Number.isInteger(index)) return;
    seleccionar(index, { emitir: false });
  });

  // La escena puede cargar despues: con 'tienda:consultar' pide que se repita la seleccion actual.
  document.addEventListener('tienda:consultar', () => {
    document.dispatchEvent(new CustomEvent('tienda:seleccion', {
      detail: { index: actual, id: lotes[actual].id, fuente: 'ui' },
    }));
  });

  alProgreso(({ seccion: nombre, p }) => {
    if (nombre === 'tienda') escribir('--p', p);
  });

  // Estado inicial: la escena recibe el lote 0 para alinear su fila.
  seleccionar(0);
  return Object.freeze({ seleccionar, indice: () => actual, lotes });
}
