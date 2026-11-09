/*
 * ?ui-demo: emisor falso de historia:progreso para probar la interfaz sin la escena 3D.
 * Imita a la orquestacion: mide cada seccion, calcula p con el scroll nativo y manda anclajes
 * inventados (orbita en la vitrina, fila en la tienda). Dibuja bolsas de carton piedra para ver
 * donde caen las etiquetas.
 *
 * Parametros: &s=<seccion>&p=<0..1> salta a ese punto; &lote=<i> elige lote; &limpio oculta el
 * panel; &precarga deja la pantalla de carga a medias; &3d carga ademas app.js.
 * Consola: window.__uiDemo.ir('tienda', 0.5), window.__uiDemo.seleccionar(2).
 */
import { MARCA } from '../marca.js';
import { createLoader } from '../ui/loader.js';
import { SECCIONES, clamp } from '../ui/util.js';

const params = new URLSearchParams(location.search);
const root = document.documentElement;
const conEscena = params.has('3d');
let seleccion = 0;

function cargarEstilos() {
  const enlace = document.createElement('link');
  enlace.rel = 'stylesheet';
  enlace.href = 'css/demo.css';
  document.head.appendChild(enlace);
}

function simularCarga() {
  if (conEscena) return Promise.resolve();
  const loader = createLoader(root);
  if (params.has('precarga')) {
    loader.setProgress(Number(params.get('progreso') ?? 0.46), 'download');
    return new Promise(() => {});
  }
  return new Promise((resolve) => {
    let fraccion = 0;
    const paso = setInterval(() => {
      fraccion = Math.min(1, fraccion + 0.34);
      loader.setProgress(fraccion, fraccion < 1 ? 'download' : 'compile');
      if (fraccion >= 1) {
        clearInterval(paso);
        clearTimeout(window.__cafeLoadWatchdog);
        document.getElementById('escenario')?.setAttribute('aria-busy', 'false');
        document.getElementById('carga')?.classList.add('oculto');
        loader.finish({ painted: false });
        resolve();
      }
    }, 60);
  });
}

function medir() {
  const alto = window.innerHeight;
  return SECCIONES.map((id) => {
    const rect = document.getElementById(id).getBoundingClientRect();
    return { id, rect, p: clamp(-rect.top / Math.max(1, rect.height - alto)) };
  });
}

function seccionActiva(medidas) {
  const centro = window.innerHeight / 2;
  return medidas.find(({ rect }) => rect.top <= centro && rect.bottom > centro)
    ?? (medidas[0].rect.top > centro ? medidas[0] : medidas[medidas.length - 1]);
}

/* Anclajes falsos en px de la ventana. */
function anclajes(seccion, p) {
  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  const n = MARCA.lotes.length;
  const estrecho = ancho < 760;
  if (seccion === 'vitrina') {
    const radioX = ancho * (estrecho ? 0.3 : 0.2);
    const radioY = alto * 0.07;
    return MARCA.lotes.map((lote, i) => {
      const angulo = p * Math.PI * 0.8 + (i / n) * Math.PI * 2 + 0.4;
      const profundidad = Math.sin(angulo);
      return {
        id: lote.id,
        x: ancho / 2 + Math.cos(angulo) * radioX,
        y: alto * (estrecho ? 0.36 : 0.42) + profundidad * radioY - alto * 0.08,
        visible: true,
        escala: 0.75 + (profundidad + 1) * 0.15,
      };
    });
  }
  if (seccion === 'tienda') {
    const centro = estrecho ? ancho / 2 : ancho * 0.5;
    const paso = estrecho ? ancho * 0.24 : ancho * 0.085;
    return MARCA.lotes.map((lote, i) => {
      const relativo = i - seleccion;
      return {
        id: lote.id,
        x: centro + relativo * paso,
        y: alto * (estrecho ? 0.3 : 0.4) - (relativo === 0 ? alto * 0.06 : 0),
        visible: Math.abs(relativo) <= (estrecho ? 1 : 3),
        escala: relativo === 0 ? 1.1 : 0.72,
      };
    });
  }
  return [];
}

function crearBolsas() {
  const capa = document.createElement('div');
  capa.className = 'demo-bolsas';
  capa.setAttribute('aria-hidden', 'true');
  const bolsas = MARCA.lotes.map((lote) => {
    const bolsa = document.createElement('div');
    bolsa.className = 'demo-bolsa';
    bolsa.style.setProperty('--bolsa', MARCA.bolsa?.color ?? '#1f3fa0');
    bolsa.style.setProperty('--franja', MARCA.bolsa?.franjaSuperior ?? '#1f7a5a');
    bolsa.style.setProperty('--lote', lote.etiqueta);
    bolsa.style.setProperty('--lote-texto', lote.textoEtiqueta ?? '#fff');
    const nombre = document.createElement('span');
    nombre.textContent = lote.nombre;
    bolsa.appendChild(nombre);
    capa.appendChild(bolsa);
    return { id: lote.id, bolsa };
  });
  document.getElementById('escenario').appendChild(capa);
  return bolsas;
}

function crearPanel(irA) {
  const panel = document.createElement('div');
  panel.className = 'demo-panel';
  panel.innerHTML = '<label>Progreso global <input type="range" min="0" max="1000" value="0"></label><output>—</output>';
  const rango = panel.querySelector('input');
  const salida = panel.querySelector('output');
  rango.addEventListener('input', () => {
    const maximo = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: (Number(rango.value) / 1000) * maximo, behavior: 'instant' });
  });
  document.body.appendChild(panel);
  return {
    actualizar(seccion, p) {
      salida.textContent = `${seccion} · p ${p.toFixed(2)} · lote ${seleccion}`;
      const maximo = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (document.activeElement !== rango) rango.value = String(Math.round((window.scrollY / maximo) * 1000));
    },
    irA,
  };
}

function iniciar() {
  cargarEstilos();
  root.classList.add('ui-demo');
  const bolsas = conEscena ? [] : crearBolsas();
  let panel = null;
  let pedido = 0;

  function emitir() {
    pedido = 0;
    const medidas = medir();
    const activa = seccionActiva(medidas);
    const lista = anclajes(activa.id, activa.p);
    if (!conEscena) {
      document.dispatchEvent(new CustomEvent('historia:progreso', {
        detail: { seccion: activa.id, p: activa.p, G: window.scrollY / window.innerHeight, beats: null, anchors: lista },
      }));
    }
    bolsas.forEach(({ id, bolsa }) => {
      const anchor = lista.find((item) => item.id === id);
      bolsa.classList.toggle('visible', Boolean(anchor?.visible));
      if (anchor) bolsa.style.transform = `translate3d(${anchor.x.toFixed(1)}px, ${anchor.y.toFixed(1)}px, 0) translate(-50%, 8%) scale(${anchor.escala.toFixed(3)})`;
    });
    panel?.actualizar(activa.id, activa.p);
  }
  const programar = () => { if (!pedido) pedido = requestAnimationFrame(emitir); };

  function ir(seccion, p = 0) {
    const elemento = document.getElementById(seccion);
    if (!elemento) return;
    const top = elemento.getBoundingClientRect().top + window.scrollY;
    const recorrido = Math.max(0, elemento.offsetHeight - window.innerHeight);
    window.scrollTo({ top: top + clamp(p) * recorrido, behavior: 'instant' });
    programar();
  }

  function seleccionarLote(indice) {
    const pestanas = document.querySelectorAll('#tienda [role="tab"]');
    pestanas[indice]?.click();
  }

  document.addEventListener('tienda:seleccion', (evento) => {
    seleccion = evento.detail?.index ?? 0;
    programar();
  });
  window.addEventListener('scroll', programar, { passive: true });
  window.addEventListener('resize', programar);
  if (!params.has('limpio')) panel = crearPanel(ir);

  window.__uiDemo = Object.freeze({ ir, seleccionar: seleccionarLote, emitir });
  root.style.scrollBehavior = 'auto';
  if (params.has('lote')) seleccionarLote(Number(params.get('lote')));
  if (params.has('s')) ir(params.get('s'), Number(params.get('p') ?? 0));
  emitir();
  // Las fuentes cambian las alturas: se vuelve a medir y a saltar cuando llegan.
  document.fonts?.ready.then(() => {
    if (params.has('s')) ir(params.get('s'), Number(params.get('p') ?? 0));
    programar();
    root.dataset.demoListo = '1';
  });
}

simularCarga().then(iniciar).catch((error) => console.error('[co2] ui-demo', error));
