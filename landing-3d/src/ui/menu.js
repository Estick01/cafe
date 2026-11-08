/*
 * Menu de la pildora de navegacion. En movil abre un panel; en escritorio los enlaces ya estan a
 * la vista (CSS) y el boton no se muestra. Escape y un clic fuera lo cierran.
 */
export function initMenu({ button, panel }) {
  if (!button || !panel) return;
  const label = button.querySelector('.menu-boton-texto');
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';

  function setOpen(open) {
    button.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Cerrar' : 'Menú';
    panel.hidden = !open;
  }

  button.addEventListener('click', () => setOpen(!isOpen()));
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a') && isOpen()) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (isOpen() && !event.target.closest('#menu-panel, #menu-boton')) setOpen(false);
  });
}
