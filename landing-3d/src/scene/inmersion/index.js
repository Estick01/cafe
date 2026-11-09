/*
 * Inmersion en la crema ("dive"): superficie de crema macro con remolino, cintas de texto que
 * orbitan, gotas y granos; al cruzar, cafe dorado con causticas, rayos, granos que caen y motas.
 *
 * Todo es funcion determinista de (fase, p): el mismo scroll da el mismo cuadro; `time` solo anade
 * vaiven ambiental. Sin asignaciones por fotograma; los materiales son propios (no usan luces ni
 * scene.fog de la escena) y aplican tone mapping/espacio de color de three al dibujar a pantalla.
 *
 * Uso (orquestador):
 *   const inm = createInmersion({ scene, renderer, marca: MARCA, quality: 'alta' });
 *   inm.update({ fase: 'crema', p, time, lote });  renderer.render(scene, inm.camera);
 */
import * as THREE from 'three';

import {
  ANCLA_BOLSA, INMERSION_DURACION, camaraInmersion, focoInmersion,
} from '../../logic/inmersion.js';
import { createBajo } from './bajo.js';
import { createCintas } from './cintas.js';
import { createCrema } from './crema.js';
import { DENSIDAD_AGUA, PALETA } from './glsl.js';
import { createParticulas } from './particulas.js';

export { INMERSION_DURACION };

/* Lejos de la taza: el fondo envolvente (radio 60) tapa el resto de la escena. */
const ORIGEN_POR_DEFECTO = Object.freeze([0, -400, 0]);

export function createInmersion({ scene, renderer, marca, quality = 'alta', origen = ORIGEN_POR_DEFECTO } = {}) {
  const calidad = quality === 'baja' || quality === 'low' ? 'baja' : 'alta';
  const defines = calidad === 'baja' ? { CALIDAD_BAJA: '' } : {};
  const uniforms = { uS: { value: 0 }, uTime: { value: 0 }, uBajo: { value: 0 } };

  const group = new THREE.Group();
  group.name = 'inmersion';
  group.position.fromArray(origen);
  const arriba = new THREE.Group();
  arriba.name = 'inmersion-arriba';
  const abajo = new THREE.Group();
  abajo.name = 'inmersion-abajo';

  const bajo = createBajo({ uniforms, defines, quality: calidad });
  const crema = createCrema({ uniforms, defines, marca });
  const cintas = createCintas({ uniforms, marca, quality: calidad });
  const particulas = createParticulas({ uniforms, defines, quality: calidad });

  group.add(bajo.fondo, crema.superficie, arriba, abajo);
  arriba.add(crema.palabra, cintas.grupo, ...particulas.arriba);
  abajo.add(bajo.rayos, ...particulas.abajo);

  /* Punto donde el modulo de vitrina debe colocar la bolsa que emerge (espacio del grupo). */
  const anclaBolsa = new THREE.Object3D();
  anclaBolsa.name = 'inmersion-ancla-bolsa';
  anclaBolsa.position.set(ANCLA_BOLSA.x, ANCLA_BOLSA.y, ANCLA_BOLSA.z);
  anclaBolsa.rotation.set(0, ANCLA_BOLSA.yaw, 0);
  group.add(anclaBolsa);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.02, 150);
  camera.name = 'inmersion-camara';
  camera.rotation.order = 'YXZ';
  group.add(camera);

  /* Niebla equivalente a la del shader, para que el orquestador la ponga en scene.fog en 'bajo'. */
  const fog = new THREE.FogExp2(new THREE.Color().fromArray(PALETA.aguaMedio), DENSIDAD_AGUA);

  if (scene) scene.add(group);

  const pose = {};
  const focus = { distance: 3, aperture: 0 };
  const tamano = new THREE.Vector2();
  let ultimoAncho = 0;
  let ultimoAlto = 0;
  let ultimoFov = 0;

  function ajustarProyeccion() {
    if (renderer) renderer.getDrawingBufferSize(tamano);
    const ancho = tamano.x || 16;
    const alto = tamano.y || 9;
    if (ancho === ultimoAncho && alto === ultimoAlto && pose.fov === ultimoFov) return;
    ultimoAncho = ancho;
    ultimoAlto = alto;
    ultimoFov = pose.fov;
    camera.aspect = ancho / alto;
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    particulas.setEscalaPx(alto / (2 * Math.tan((pose.fov * Math.PI) / 360)));
  }

  function update(state = {}) {
    const fase = state.fase === 'bajo' ? 'bajo' : 'crema';
    const p = Number.isFinite(state.p) ? state.p : 0;
    const time = Number.isFinite(state.time) ? state.time : 0;
    camaraInmersion(fase, p, pose);
    const s = pose.s;
    /* Vaiven ambiental minimo (no cambia el encuadre): respiracion de la camara. */
    const vaiven = 0.006;
    camera.position.set(
      pose.x + Math.sin(time * 0.53) * vaiven,
      pose.y + Math.sin(time * 0.41 + 1.3) * vaiven * 0.6,
      pose.z + Math.cos(time * 0.47) * vaiven,
    );
    camera.rotation.set(pose.pitch, pose.yaw, pose.roll + Math.sin(time * 0.29) * 0.004);
    ajustarProyeccion();

    uniforms.uS.value = s;
    uniforms.uTime.value = time;
    const bajoAgua = THREE.MathUtils.smoothstep(-pose.y, -0.02, 0.02);
    uniforms.uBajo.value = bajoAgua;
    arriba.visible = pose.y > -0.08;
    abajo.visible = pose.y < 0.08;

    cintas.setLote(Number.isFinite(state.lote) ? state.lote : 0);
    cintas.update(s, time);

    focoInmersion(fase, p, pose);
    focus.distance = pose.distance;
    focus.aperture = pose.aperture;
  }

  update({ fase: 'crema', p: 0, time: 0, lote: 0 });

  return {
    group,
    camera,
    /* Foco sugerido para post.setFocus (se actualiza en cada update). */
    focus,
    /* Niebla para scene.fog mientras dure 'bajo' (solo afecta a materiales con fog, p. ej. la bolsa). */
    fog,
    anclaBolsa,
    update,
    dispose() {
      if (group.parent) group.parent.remove(group);
      bajo.dispose();
      crema.dispose();
      cintas.dispose();
      particulas.dispose();
    },
  };
}
