/*
 * Parches de material de los solidos (crecimiento del asa).
 */
import { handleClipValue } from '../logic/handle.js';

/* Los materiales del cafe viven en coffeeMaterials.js; se reexportan por compatibilidad. */
export { createCoffeeMaterial, createDropletMaterial, createStreamMaterial } from './coffeeMaterials.js';

/*
 * Parche del asa: descarta lo que aun no ha crecido desde las dos uniones. Se aplica igual al
 * material visible y al de sombras. La comparacion es la de logic/handle.js.
 */
export function patchHandleGrowth(material, uniforms) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.uAsaLimite = uniforms.uAsaLimite;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float _asa_avance;\nvarying float vAsaAvance;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAsaAvance = _asa_avance;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAsaAvance;\nuniform float uAsaLimite;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (min(vAsaAvance, 1.0 - vAsaAvance) >= uAsaLimite) discard;`);
  };
}

export const createHandleUniforms = () => ({ uAsaLimite: { value: 0 } });
export const setHandleGrowth = (uniforms, growth) => {
  uniforms.uAsaLimite.value = handleClipValue(growth) / 2;
};
