/*
 * Arranque de la interfaz. Se carga como modulo propio desde index.html y no depende de app.js:
 * pinta marca y catalogo desde src/marca.js y escucha historia:progreso / tienda:seleccion.
 */
import { HAY_CONTENIDO_DE_EJEMPLO, MARCA } from '../marca.js';
import { initBuscador } from './buscador.js';
import { initCapitulos } from './capitulos.js';
import { initEtiquetas } from './etiquetas.js';
import { pintarLogos } from './marcaLogo.js';
import { initMenu } from './menu.js';
import { canalPedido, initTienda } from './tienda.js';
import { alProgreso } from './util.js';
import { initProducto } from './producto.js';

const root = document.documentElement;

function aplicarColores() {
  const { fondo, crema, acento, caramelo } = MARCA.colores;
  const valores = {
    '--fondo': fondo,
    '--crema': crema,
    '--acento': acento,
    '--caramelo': caramelo,
    '--azul': MARCA.bolsa?.color,
    '--verde': MARCA.bolsa?.franjaSuperior,
  };
  Object.entries(valores).forEach(([nombre, valor]) => {
    if (/^#[0-9a-f]{3,8}$/i.test(valor ?? '')) root.style.setProperty(nombre, valor);
  });
}

const rellenar = (selector, texto) => {
  document.querySelectorAll(selector).forEach((elemento) => { elemento.textContent = texto; });
};

function usuarioInstagram(url) {
  try {
    const [usuario] = new URL(url).pathname.split('/').filter(Boolean);
    return usuario ? `@${usuario}` : 'Instagram';
  } catch {
    return 'Instagram';
  }
}

function pintarMarca() {
  pintarLogos();
  rellenar('[data-marca-nombre]', MARCA.nombre);
  rellenar('[data-marca-corto]', MARCA.nombreCorto);
  rellenar('[data-marca-lema]', MARCA.lema);
  rellenar('[data-marca-ciudad]', MARCA.ciudad ?? MARCA.pais);
  rellenar('[data-marca-ciudad-corta]', (MARCA.ciudad ?? MARCA.pais).split(',')[0].trim());
  rellenar('[data-marca-descripcion]', MARCA.descripcion ?? '');
  rellenar('[data-canal]', canalPedido());
  rellenar('[data-pie-legal]', `© ${new Date().getFullYear()} ${MARCA.nombre} · ${MARCA.ciudad ?? MARCA.pais}, ${MARCA.pais}`);
  const n = MARCA.lotes.length;
  rellenar('[data-lotes-cuenta]', `${n} ${n === 1 ? 'lote' : 'lotes'} exclusivos`);

  document.querySelectorAll('[data-instagram]').forEach((enlace) => {
    if (!MARCA.instagram) return;
    enlace.href = MARCA.instagram;
    enlace.hidden = false;
    if (enlace.hasAttribute('data-instagram-usuario')) enlace.firstChild.textContent = usuarioInstagram(MARCA.instagram);
  });
  document.querySelectorAll('[data-aviso-muestra]').forEach((aviso) => { aviso.hidden = !HAY_CONTENIDO_DE_EJEMPLO; });
}

/* Enlace de la navegacion activo segun la seccion del progreso. */
function initNavActiva() {
  const enlaces = Array.from(document.querySelectorAll('[data-nav]'));
  const destino = { vitrina: '', historia: 'historia', inmersion: 'historia', tienda: 'tienda' };
  let actual = null;
  alProgreso(({ seccion }) => {
    if (seccion === actual) return;
    actual = seccion;
    root.dataset.seccion = seccion;
    enlaces.forEach((enlace) => {
      if (enlace.dataset.nav === destino[seccion]) enlace.setAttribute('aria-current', 'true');
      else enlace.removeAttribute('aria-current');
    });
  });
}

/* La entrada del titular arranca cuando se va la pantalla de carga. */
function initEntrada() {
  const listo = () => root.classList.add('ui-listo');
  if (!root.classList.contains('cargando')) {
    listo();
    return;
  }
  const observador = new MutationObserver(() => {
    if (root.classList.contains('cargando')) return;
    observador.disconnect();
    listo();
  });
  observador.observe(root, { attributes: true, attributeFilter: ['class'] });
}

function init() {
  aplicarColores();
  pintarMarca();
  initMenu({ button: document.getElementById('menu-boton'), panel: document.getElementById('menu-panel') });
  initEtiquetas();
  initCapitulos();
  initNavActiva();
  const tienda = initTienda();
  initBuscador({ boton: document.getElementById('buscar-boton'), formulario: document.getElementById('buscador'), tienda });
  initEntrada();
  const producto = initProducto();
  window.__co2ui = Object.freeze({ tienda, producto });
}

try {
  init();
} catch (error) {
  console.error('[co2] La interfaz no se pudo iniciar', error);
}
