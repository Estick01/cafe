/* Puerto de las funciones de blender/dimensions.py. Las tablas estan en dimensions.generated.js. */
import { CUP_INNER, CUP_OUTER, SAUCER_TOP } from './dimensions.generated.js';

export * from './dimensions.generated.js';

/* Interpola el primer valor segun el segundo, que debe ser ascendente. */
function interpolate(points, height) {
  if (height <= points[0][1]) return points[0][0];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [rLow, zLow] = points[index];
    const [rHigh, zHigh] = points[index + 1];
    if (height <= zHigh) {
      const span = zHigh - zLow;
      const ratio = span <= 0 ? 0 : (height - zLow) / span;
      return rLow + (rHigh - rLow) * ratio;
    }
  }
  return points[points.length - 1][0];
}

export const cupOuterRadius = (localZ) => interpolate(CUP_OUTER, localZ);
export const cupInnerRadius = (localZ) => interpolate(CUP_INNER, localZ);
/* Altura local de la cara superior del platillo a un radio dado. */
export const saucerTopHeight = (radius) => interpolate(SAUCER_TOP, radius);
