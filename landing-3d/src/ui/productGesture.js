// Un dedo gira; dos dedos cambian la distancia sin desplazar la página.
export function productGesture(element, { rotate, zoom, reset = () => {} }) {
  const pointers = new Map();
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  function down(event) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    element.focus({ preventScroll: true });
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    element.setPointerCapture(event.pointerId); element.classList.add('agarrado');
  }
  function move(event) {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const before = distance();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) rotate((event.clientX - previous.x) * 0.012, (event.clientY - previous.y) * 0.005);
    else if (before > 0) zoom(distance() / before);
  }
  function up(event) {
    pointers.delete(event.pointerId);
    element.classList.toggle('agarrado', pointers.size > 0);
  }
  function wheel(event) {
    event.preventDefault(); event.stopPropagation();
    zoom(Math.exp(-Math.max(-120, Math.min(120, event.deltaY)) * 0.002));
  }
  function key(event) {
    const steps = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };
    if (steps[event.key]) rotate(...steps[event.key]);
    else if (event.key === '+' || event.key === '=') zoom(1.12);
    else if (event.key === '-') zoom(1 / 1.12);
    else if (event.key === 'Home') reset();
    else return;
    event.preventDefault(); event.stopPropagation();
  }
  const events = { pointerdown: down, pointermove: move, pointerup: up, pointercancel: up, lostpointercapture: up, wheel, keydown: key, dblclick: reset };
  Object.entries(events).forEach(([type, handler]) => element.addEventListener(type, handler, { passive: false }));
  return {
    active: () => pointers.size > 0,
    clear() { pointers.clear(); element.classList.remove('agarrado'); },
    dispose() { Object.entries(events).forEach(([type, handler]) => element.removeEventListener(type, handler)); pointers.clear(); },
  };
}
