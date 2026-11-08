/*
 * Secciones posteriores a la historia: revelado de la ficha de cata al entrar en pantalla y el
 * formulario de reserva, que es solo una demostracion y no envia nada a ningun sitio.
 */
const DEMO_MESSAGE = 'Gracias. Esto es una demostración: no se envió ni se guardó ningún dato.';

export function initTastingCard(card) {
  if (!card) return;
  if (!('IntersectionObserver' in window)) {
    card.classList.add('revelado');
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    card.classList.add('revelado');
    observer.disconnect();
  }, { threshold: 0.25 });
  observer.observe(card);
}

export function initDemoForm(form, status) {
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (status) status.textContent = DEMO_MESSAGE;
  });
}
