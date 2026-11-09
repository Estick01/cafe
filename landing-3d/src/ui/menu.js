/*
 * Menu de la navegacion. En escritorio los enlaces estan a la vista (CSS) y el boton no se muestra;
 * en movil el boton abre el panel (.abierto). Escape, un clic fuera o elegir un enlace lo cierran.
 * Idempotente: si app.js y pagina.js lo inician los dos, solo se engancha una vez.
 */
export function initMenu({ button, panel }) {
  if (!button || !panel || button.dataset.menuListo) return;
  button.dataset.menuListo = '1';
  const label = button.querySelector('.menu-boton-texto');
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';

  function setOpen(open) {
    button.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Cerrar' : 'Menú';
    panel.classList.toggle('abierto', open);
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
