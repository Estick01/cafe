import { productGesture } from './productGesture.js';

export function createShopInteraction(getDirector, onChange) {
  const slot = document.querySelector('.tienda-escena');
  slot.removeAttribute('aria-hidden');
  const surface = document.createElement('div');
  surface.className = 'tienda-manipular';
  surface.dataset.shopDrag = '';
  surface.tabIndex = 0;
  surface.setAttribute('role', 'group');
  surface.setAttribute('aria-label', 'Bolsa 3D. Arrastra o usa las flechas para girar; pellizca, usa la rueda o las teclas más y menos para acercar. Inicio restablece.');
  surface.hidden = true;
  document.querySelector('#tienda .fijo').append(surface);
  const changeZoom = factor => { getDirector()?.zoomProduct(factor); onChange(); };
  const reset = () => { getDirector()?.resetProduct(); onChange(); };
  const gestures = productGesture(surface, {
    rotate: (x, y) => { getDirector()?.rotateProduct(x, y); onChange(); }, zoom: changeZoom, reset,
  });
  surface.addEventListener('click', event => event.stopPropagation());
  const controls = document.createElement('div');
  controls.className = 'tienda-zoom'; controls.hidden = true;
  controls.innerHTML = '<p>Arrastra para girar · Pellizca para acercar</p><div role="group" aria-label="Distancia de la bolsa"><button type="button" data-zoom="out" aria-label="Alejar bolsa">−</button><button type="button" data-zoom="reset" aria-label="Restablecer bolsa">Centrar</button><button type="button" data-zoom="in" aria-label="Acercar bolsa">+</button></div>';
  slot.append(controls);
  controls.addEventListener('click', event => {
    const action = event.target.closest('[data-zoom]')?.dataset.zoom;
    if (!action) return;
    event.stopPropagation();
    if (action === 'reset') reset(); else changeZoom(action === 'in' ? 1.12 : 1 / 1.12);
  });
  return {
    sync(active) {
      const director = getDirector();
      const box = active ? director?.productOrigin(director.visibleProduct()) : null;
      surface.hidden = controls.hidden = !box;
      if (!box) { gestures.clear(); return; }
      if (gestures.active()) return;
      const width = Math.max(110, box.width + 12), height = Math.max(150, box.height + 12);
      Object.assign(surface.style, { left: `${box.x - width / 2}px`, top: `${box.y - height / 2}px`, width: `${width}px`, height: `${height}px` });
    },
  };
}
