/*
 * Etiquetas de vidrio del epilogo (Panela, Mandarina, Cacao): siguen a su nube de aroma
 * proyectando el ancla 3D a la pantalla. Decorativas: la ficha de cata repite las notas.
 */
const SHOWN = 0.01;
/* Margen para no meterse bajo la pildora de navegacion ni salirse por los lados. */
const SAFE_TOP_PX = 104;
const SAFE_SIDE_PX = 72;

export function createAromaChips(container) {
  const chips = container
    ? Array.from(container.querySelectorAll('[data-nota]'), (element) => ({ id: element.dataset.nota, element }))
    : [];
  let visible = true;

  function hide() {
    if (!visible) return;
    visible = false;
    chips.forEach(({ element }) => {
      element.style.opacity = '0';
      element.style.visibility = 'hidden';
    });
  }

  /* anchors: de logic/aroma.js; project: punto Blender -> {x, y, visible} en px del escenario. */
  function update(anchors, project, enabled, width = window.innerWidth) {
    if (!chips.length || !enabled || !project) {
      hide();
      return;
    }
    visible = true;
    chips.forEach(({ id, element }) => {
      const anchor = anchors.find((item) => item.id === id);
      const point = anchor && project(anchor.position);
      const opacity = point?.visible ? anchor.opacity : 0;
      element.style.opacity = opacity.toFixed(3);
      element.style.visibility = opacity > SHOWN ? 'visible' : 'hidden';
      if (opacity > SHOWN) {
        const x = Math.min(width - SAFE_SIDE_PX, Math.max(SAFE_SIDE_PX, point.x));
        const y = Math.max(SAFE_TOP_PX, point.y);
        element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    });
  }

  return { update, hide };
}
