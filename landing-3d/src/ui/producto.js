import { MARCA, enlacePedido } from '../marca.js';
import { crear, movimientoReducido } from './util.js';

export function initProducto() {
  const dialog = crear('section', 'producto');
  dialog.hidden = true; dialog.id = 'producto'; dialog.setAttribute('aria-labelledby', 'producto-titulo');
  dialog.setAttribute('data-lenis-prevent', '');
  dialog.innerHTML = `<div class="producto-barra"><span>CO2 / EXPLORA TU LOTE</span><button type="button" class="producto-cerrar" aria-label="Cerrar vista del producto">Volver a los lotes <span aria-hidden="true">×</span></button></div>
    <div class="producto-layout"><div class="producto-visual"><canvas class="producto-canvas" tabindex="0" role="img" aria-label="Bolsa 3D. Arrastra para girar o utiliza las teclas de dirección."></canvas><p class="producto-ayuda" role="status">Preparando tu bolsa…</p><div class="producto-controles"><button type="button" data-vista="frente">Frente</button><button type="button" data-vista="reverso">Ver reverso</button><button type="button" data-abrir aria-pressed="false">Abrir bolsa</button></div></div>
    <div class="producto-info producto-glass"><p class="sobretitulo">Café de especialidad · 250 g</p><h2 id="producto-titulo"></h2><p class="producto-muestra">Lote de muestra · Datos y notas ilustrativos</p><h3>Ficha técnica</h3><dl class="producto-datos"></dl><h3>Notas en taza</h3><p class="producto-notas"></p><a class="boton boton--primario" target="_blank" rel="noopener noreferrer">Pedir por WhatsApp ↗</a><p class="producto-precio">Consulta precio y disponibilidad al pedir.</p></div></div>`;
  document.body.append(dialog);
  let canvas = dialog.querySelector('canvas');
  const status = dialog.querySelector('.producto-ayuda');
  const openButton = dialog.querySelector('[data-abrir]');
  const controls = [...dialog.querySelectorAll('.producto-controles button')];
  let viewer = null, opened = false, generation = 0, returnFocus = null;
  let background = [], entering = null, originTransform = 'none', closing = false;
  async function show(index) {
    const lote = MARCA.lotes[index]; if (!lote) return;
    if (!dialog.hidden) return;
    returnFocus = document.activeElement;
    const token = ++generation;
    dialog.querySelector('h2').textContent = lote.nombre;
    dialog.style.setProperty('--color-lote', lote.etiqueta);
    const data = dialog.querySelector('dl'); data.replaceChildren();
    for (const [key, label] of [['origen','Origen'],['variedad','Variedad'],['proceso','Proceso'],['tueste','Tueste'],['presentacion','Presentación']]) {
      if (!lote[key]) continue;
      const row = crear('div'); row.append(crear('dt', null, label), crear('dd', null, lote[key])); data.append(row);
    }
    dialog.querySelector('.producto-notas').textContent = lote.notas.join(' · ');
    dialog.querySelector('.producto-info a').href = enlacePedido(lote);
    controls.forEach(button => { button.disabled = true; });
    opened = false; openButton.textContent = 'Abrir bolsa'; openButton.setAttribute('aria-pressed', 'false');
    status.textContent = 'Preparando tu bolsa…';
    const detail = { index, origin: null };
    document.dispatchEvent(new CustomEvent('producto:preparar', { detail }));
    background = [...document.body.children].filter(el => el !== dialog && el.tagName !== 'SCRIPT').map(el => ({ el, inert: el.inert }));
    background.forEach(({ el }) => { el.inert = true; });
    dialog.hidden = false; dialog.classList.remove('producto-listo', 'producto-saliendo');
    canvas.style.opacity = '0';
    document.documentElement.classList.add('producto-abierto');
    dialog.querySelector('.producto-cerrar').focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('producto:estado', { detail: { abierto: true } }));
    try {
      const { createProductViewer } = await import('../scene/productViewer.js');
      if (token !== generation || dialog.hidden) return;
      viewer = createProductViewer(canvas, lote, MARCA, { reduced: movimientoReducido() });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (token !== generation || dialog.hidden) return;
      const rect = canvas.getBoundingClientRect();
      const origin = detail.origin;
      const scale = origin ? Math.max(0.12, Math.min(1, origin.height / (rect.height * 0.74))) : 0.72;
      originTransform = origin ? `translate(${origin.x - rect.x - rect.width / 2}px, ${origin.y - rect.y - rect.height / 2}px) scale(${scale})` : `scale(${scale})`;
      canvas.style.opacity = '1';
      entering = canvas.animate([{ transform: originTransform }, { transform: 'none' }], { duration: movimientoReducido() ? 0 : 760, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'both' });
      dialog.classList.add('producto-listo');
      controls.forEach(button => { button.disabled = false; });
      status.textContent = 'Arrastra para girar · Abre la bolsa para ver los granos';
    } catch (error) {
      console.error('[co2] Visor de producto no disponible', error);
      status.textContent = 'La vista 3D no está disponible. Puedes consultar la ficha y hacer tu pedido.';
    }
  }
  async function close() {
    if (dialog.hidden || closing) return;
    closing = true; generation++;
    dialog.classList.add('producto-saliendo');
    entering?.cancel();
    if (viewer && !movimientoReducido()) {
      const exit = canvas.animate([{ transform: 'none', opacity: 1 }, { transform: originTransform, opacity: 0 }], { duration: 400, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
      await exit.finished.catch(() => {}); exit.cancel();
    }
    viewer?.dispose(); viewer = null;
    const freshCanvas = canvas.cloneNode(false); freshCanvas.style.opacity = '';
    canvas.replaceWith(freshCanvas); canvas = freshCanvas;
    dialog.hidden = true;
    background.forEach(({ el, inert }) => { el.inert = inert; });
    document.documentElement.classList.remove('producto-abierto');
    document.dispatchEvent(new CustomEvent('producto:estado', { detail: { abierto: false } }));
    returnFocus?.focus({ preventScroll: true }); closing = false;
  }
  dialog.querySelector('.producto-cerrar').addEventListener('click', close);
  document.addEventListener('keydown', event => {
    if (dialog.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href], canvas')];
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  dialog.querySelector('[data-vista="frente"]').addEventListener('click', () => { viewer?.front(); status.textContent = 'Frente de la bolsa · Arrastra para explorar'; });
  dialog.querySelector('[data-vista="reverso"]').addEventListener('click', () => { viewer?.back(); status.textContent = 'Reverso de la bolsa · Ficha técnica del lote'; });
  openButton.addEventListener('click', () => {
    opened = !opened; viewer?.open(opened);
    openButton.setAttribute('aria-pressed', String(opened)); openButton.textContent = opened ? 'Cerrar bolsa' : 'Abrir bolsa';
    status.textContent = opened ? 'Bolsa abierta · Inclina y gira para mirar los granos' : 'Bolsa cerrada · Arrastra para girar';
  });
  document.addEventListener('producto:abrir', event => show(event.detail.index));
  return { show, state: () => viewer?.state() };
}
