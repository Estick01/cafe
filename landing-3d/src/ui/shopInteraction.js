export function createShopInteraction(getDirector, onChange) {
  const surface = document.createElement('div');
  surface.className = 'tienda-manipular';
  surface.dataset.shopDrag = '';
  surface.tabIndex = 0;
  surface.setAttribute('role', 'group');
  surface.setAttribute('aria-label', 'Girar bolsa: arrastra o usa las flechas del teclado. Inicio restablece el frente.');
  surface.innerHTML = '<span>Arrastra para girar · Doble clic para centrar</span>';
  surface.hidden = true;
  document.querySelector('#tienda .fijo').append(surface);
  let drag = null;
  surface.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    surface.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    surface.setPointerCapture(event.pointerId); surface.classList.add('agarrado');
  });
  surface.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    getDirector()?.rotateProduct((event.clientX - drag.x) * 0.012, (event.clientY - drag.y) * 0.005);
    drag.x = event.clientX; drag.y = event.clientY; onChange();
  });
  const stop = () => { drag = null; surface.classList.remove('agarrado'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => surface.addEventListener(type, stop));
  surface.addEventListener('click', event => event.stopPropagation());
  surface.addEventListener('dblclick', () => { getDirector()?.resetProduct(); onChange(); });
  surface.addEventListener('keydown', event => {
    const steps = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };
    if (event.key === 'Home') getDirector()?.resetProduct();
    else if (steps[event.key]) getDirector()?.rotateProduct(...steps[event.key]);
    else return;
    event.preventDefault(); event.stopPropagation(); onChange();
  });
  return {
    sync(active) {
      const director = getDirector();
      const box = active ? director?.productOrigin(director.visibleProduct()) : null;
      surface.hidden = !box;
      if (!box) { stop(); return; }
      // La zona permanece estable durante el arrastre y el cambio de material.
      if (drag) return;
      const width = Math.max(110, box.width + 12), height = Math.max(150, box.height + 12);
      Object.assign(surface.style, { left: `${box.x - width / 2}px`, top: `${box.y - height / 2}px`, width: `${width}px`, height: `${height}px` });
    },
  };
}
