/* Paralaje ligero del raton, suavizado. Desactivado en tactil y con movimiento reducido. */
import * as THREE from 'three';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';
const SETTLED = 0.0005;

export function createParallax({ yawDegrees, pitchDegrees, smoothing }) {
  const supported = window.matchMedia(FINE_POINTER).matches;
  const maxYaw = THREE.MathUtils.degToRad(yawDegrees);
  const maxPitch = THREE.MathUtils.degToRad(pitchDegrees);
  let enabled = supported;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  window.addEventListener('pointermove', (event) => {
    if (!enabled || event.pointerType !== 'mouse') return;
    targetX = (event.clientX / window.innerWidth) * 2 - 1;
    targetY = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  return {
    setEnabled(value) {
      enabled = supported && value;
      if (!enabled) {
        targetX = 0;
        targetY = 0;
        currentX = 0;
        currentY = 0;
      }
    },
    /* Avanza el suavizado; devuelve true mientras siga moviendose. */
    tick(deltaMs) {
      const seconds = Math.min(deltaMs, 100) / 1000;
      currentX = THREE.MathUtils.damp(currentX, targetX, smoothing, seconds);
      currentY = THREE.MathUtils.damp(currentY, targetY, smoothing, seconds);
      return Math.abs(currentX - targetX) > SETTLED || Math.abs(currentY - targetY) > SETTLED;
    },
    /* Gira `position` alrededor de `target` sin asignar objetos nuevos. */
    apply(position, target) {
      if (currentX === 0 && currentY === 0) return;
      position.sub(target);
      position.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -currentX * maxYaw);
      position.y += Math.hypot(position.x, position.z) * Math.tan(currentY * maxPitch);
      position.add(target);
    },
  };
}
