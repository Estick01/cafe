/*
 * Ondas analiticas de la superficie del cafe. Sin Three ni DOM.
 *
 * Todo es funcion pura del tiempo del scroll: el mismo instante da siempre la misma superficie.
 * El shader (scene/coffeeMaterials.js) evalua exactamente estas formulas con estas constantes;
 * esta version en JS es la referencia para las pruebas.
 *
 * Coordenadas: plano horizontal local de la superficie, en metros (x, z de Three).
 */

/*
 * Ondas circulares desde el punto de impacto. La envolvente se evalua en el tiempo retardado
 * t - r / SPEED: cuando el chorro se corta, las ultimas ondas siguen viajando hacia el borde y
 * se apagan solas, sin cortes bruscos.
 */
export const RIPPLE = Object.freeze({
  /* [numero de onda 1/m, frecuencia angular rad/s, peso]. Fase ~0.06 m/s, lenta para el scrub. */
  waves: Object.freeze([
    Object.freeze([540, 33, 1.0]),
    Object.freeze([830, 48, 0.42]),
    Object.freeze([1270, 70, 0.18]),
  ]),
  speed: 0.06,
  amplitude: 0.000075,
  decay: 30,
  /* Radio de regularizacion bajo el chorro: evita la singularidad de cos(kr) en el centro. */
  core: 0.0022,
  fadeIn: 0.18,
  fadeOut: 0.22,
  /* Asimetria angular: un impacto real no es perfectamente concentrico. */
  lobes: Object.freeze([[3, 0.22, 1.3], [5, 0.12, -0.7]]),
});

/* Falda del chorro al entrar: un anillo levantado alrededor del punto de impacto. */
export const SKIRT = Object.freeze({ amplitude: 0.00022, radius: 0.0055, width: 0.0022 });

/* Movimiento ambiental: dos trenes de onda largos y casi imperceptibles que se cruzan. */
export const AMBIENT = Object.freeze({
  amplitude: 0.0000065,
  trains: Object.freeze([
    Object.freeze([0.83, 0.56, 260, 1.7]),
    Object.freeze([-0.42, 0.91, 340, -2.3]),
  ]),
});

/* Gotas sueltas que caen de la cola del chorro: paquetes de onda en anillo. */
export const DROP_RING = Object.freeze({
  amplitude: 0.00005,
  speed: 0.075,
  width: 0.0035,
  wavenumber: 900,
  damping: 2.4,
  maxDrops: 8,
});

const smoothstep = (edge0, edge1, value) => {
  const ratio = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return ratio * ratio * (3 - 2 * ratio);
};

/* Intensidad del impacto en el tiempo (retardado). 0 fuera de la ventana del chorro. */
export function pourEnvelope(time, start, end) {
  if (!(end > start)) return 0;
  return smoothstep(start, start + RIPPLE.fadeIn, time) * (1 - smoothstep(end - RIPPLE.fadeOut, end, time));
}

function lobeFactor(dx, dz) {
  const angle = Math.atan2(dz, dx);
  return RIPPLE.lobes.reduce((sum, [order, weight, phase]) => sum + weight * Math.sin(order * angle + phase), 1);
}

/* Altura de las ondas del impacto (sin ambiente). window = { x, z, start, end }. */
export function impactHeight(x, z, time, window) {
  const dx = x - window.x;
  const dz = z - window.z;
  const r = Math.hypot(dx, dz);
  const envelope = pourEnvelope(time - r / RIPPLE.speed, window.start, window.end);
  if (envelope === 0) return 0;
  const rr = Math.sqrt(r * r + RIPPLE.core * RIPPLE.core);
  const base = RIPPLE.amplitude * envelope * Math.exp(-RIPPLE.decay * r) * lobeFactor(dx, dz);
  const skirt = SKIRT.amplitude * pourEnvelope(time, window.start, window.end)
    * Math.exp(-(((r - SKIRT.radius) / SKIRT.width) ** 2));
  return skirt + RIPPLE.waves.reduce((sum, [k, omega, weight]) => sum + base * weight * Math.sin(k * rr - omega * time), 0);
}

export function ambientHeight(x, z, time) {
  return AMBIENT.trains.reduce(
    (sum, [dx, dz, k, omega]) => sum + AMBIENT.amplitude * Math.sin(k * (dx * x + dz * z) + omega * time),
    0,
  );
}

/* drops: lista de { x, z, time, amplitude } con el instante en que la gota toca la superficie. */
export function dropHeight(x, z, time, drops) {
  let height = 0;
  for (const drop of drops) {
    const age = time - drop.time;
    if (age <= 0) continue;
    const s = Math.hypot(x - drop.x, z - drop.z) - DROP_RING.speed * age;
    height += DROP_RING.amplitude * drop.amplitude * Math.exp(-(s * s) / (DROP_RING.width ** 2))
      * Math.sin(DROP_RING.wavenumber * s) * Math.exp(-DROP_RING.damping * age);
  }
  return height;
}

export const surfaceHeight = (x, z, time, window, drops = []) => impactHeight(x, z, time, window)
  + ambientHeight(x, z, time) + dropHeight(x, z, time, drops);
