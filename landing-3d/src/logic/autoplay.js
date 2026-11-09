/*
 * Reproduccion automatica de la entrada (sin scroll del visitante), a prueba de reinicios.
 *
 * El fallo de antes: al terminar, la reproduccion se apagaba y la imagen volvia a la posicion del
 * scroll, que seguia en 0: la animacion "se reiniciaba". Aqui, al terminar, se pasa a 'sosteniendo'
 * con el ultimo instante; quien llama mueve el scroll (sin animar) a la posicion de ese instante, y
 * solo cuando el scroll ya coincide se entrega el control: 'libre'. Si el visitante desliza a mitad
 * de reproduccion, se sostiene el instante actual de la misma forma. La imagen nunca retrocede sola.
 *
 * Estados: inactivo -> reproduciendo -> sosteniendo -> libre. Inmutables, sin DOM.
 */
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/* Diferencia (en segundos de G) por debajo de la cual el scroll ya coincide con la imagen. */
export const AUTOPLAY_SYNC_EPSILON = 0.02;

export const AUTOPLAY_IDLE = Object.freeze({ phase: 'inactivo', G: 0, startedAt: 0, fromG: 0, toG: 0, seconds: 0 });

export function startAutoplay(now, { fromG = 0, toG, seconds }) {
  if (!(toG > fromG) || !(seconds > 0)) return AUTOPLAY_IDLE;
  return Object.freeze({ phase: 'reproduciendo', G: fromG, startedAt: now, fromG, toG, seconds });
}

/* Avanza con el reloj. Al llegar al final: 'sosteniendo' en toG (nunca vuelve a fromG). */
export function stepAutoplay(state, now) {
  if (state.phase !== 'reproduciendo') return state;
  const u = clamp((now - state.startedAt) / (state.seconds * 1000), 0, 1);
  const G = state.fromG + (state.toG - state.fromG) * u;
  return Object.freeze({ ...state, G, phase: u >= 1 ? 'sosteniendo' : 'reproduciendo' });
}

/* El visitante desliza: se congela el instante actual hasta que el scroll lo alcance. */
export function interruptAutoplay(state) {
  if (state.phase !== 'reproduciendo') return state;
  return Object.freeze({ ...state, phase: 'sosteniendo' });
}

/* Con el scroll ya en su sitio, se entrega el control al scroll. */
export function releaseAutoplay(state, scrollG, epsilon = AUTOPLAY_SYNC_EPSILON) {
  if (state.phase !== 'sosteniendo') return state;
  return Math.abs(scrollG - state.G) <= epsilon ? Object.freeze({ ...state, phase: 'libre' }) : state;
}

/* G que se dibuja: el de la reproduccion mientras manda; despues, siempre el del scroll. */
export const renderedG = (state, scrollG) => (
  state.phase === 'reproduciendo' || state.phase === 'sosteniendo' ? state.G : scrollG
);

/* Mientras sostiene, el scroll debe llevarse (sin animar) a la posicion de este instante. */
export const needsScrollSync = (state) => state.phase === 'sosteniendo';
export const isAutoplaying = (state) => state.phase === 'reproduciendo';
