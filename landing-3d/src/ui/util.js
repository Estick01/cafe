/*
 * Utilidades de la interfaz: escucha del progreso, curvas y escritura de variables CSS solo cuando
 * cambian (el evento llega en cada fotograma, asi que el DOM no se toca si no hace falta).
 */
export const SECCIONES = Object.freeze(['vitrina', 'historia', 'inmersion', 'tienda']);

export const clamp = (valor, min = 0, max = 1) => Math.min(max, Math.max(min, valor));

export function suave(desde, hasta, valor) {
  const t = clamp((valor - desde) / (hasta - desde));
  return t * t * (3 - 2 * t);
}

/* Normaliza y valida el detalle de historia:progreso; devuelve null si no sirve. */
export function leerProgreso(detalle) {
  if (!detalle || !SECCIONES.includes(detalle.seccion)) return null;
  const p = Number(detalle.p);
  return Object.freeze({
    seccion: detalle.seccion,
    p: Number.isFinite(p) ? clamp(p) : 0,
    G: Number.isFinite(Number(detalle.G)) ? Number(detalle.G) : 0,
    beats: Array.isArray(detalle.beats) ? detalle.beats : null,
    anchors: Array.isArray(detalle.anchors) ? detalle.anchors : [],
  });
}

/* Suscribe un manejador al progreso ya validado. Devuelve la funcion para desuscribirse. */
export function alProgreso(manejador) {
  const escuchar = (evento) => {
    const progreso = leerProgreso(evento.detail);
    if (progreso) manejador(progreso);
  };
  document.addEventListener('historia:progreso', escuchar);
  return () => document.removeEventListener('historia:progreso', escuchar);
}

/* Escritor de variables CSS con cache por elemento: solo escribe si el valor redondeado cambia. */
export function crearEscritor(elemento) {
  const cache = new Map();
  return function escribir(nombre, valor, decimales = 3) {
    if (!elemento) return;
    const texto = typeof valor === 'number' ? valor.toFixed(decimales) : String(valor);
    if (cache.get(nombre) === texto) return;
    cache.set(nombre, texto);
    elemento.style.setProperty(nombre, texto);
  };
}

export const dosCifras = (n) => String(n).padStart(2, '0');

export const movimientoReducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Crea un elemento con clase y texto opcionales (sin innerHTML: los datos nunca se interpretan). */
export function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined && texto !== null) elemento.textContent = texto;
  return elemento;
}

/*
 * Navega a un ancla. Lanza ui:navegar (cancelable) para que la orquestacion pueda hacerlo con su
 * scroll suave (Lenis); si nadie lo cancela, usa scrollIntoView.
 */
export function navegarA(selector) {
  const destino = document.querySelector(selector);
  if (!destino) return;
  const evento = new CustomEvent('ui:navegar', { detail: { destino: selector }, cancelable: true });
  if (!document.dispatchEvent(evento)) return;
  destino.scrollIntoView({ behavior: movimientoReducido() ? 'auto' : 'smooth', block: 'start' });
}
