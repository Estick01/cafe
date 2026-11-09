/*
 * Director: compone en una sola escena y un solo renderizador la vitrina, la historia, la
 * inmersion y las transiciones, a partir del estado puro de logic/story.js (map.at(G)).
 *
 * Cada fotograma: se restaura el entorno base (niebla, fondo, exposicion), se dibuja si hace falta
 * el fotograma que se funde (en una textura), se deja visible solo la seccion activa y se dibuja con
 * su camara, por el post-proceso si lo hay. Si un modulo falta o falla, su seccion cae en la
 * historia (t = 0 para la vitrina de entrada, t = 10 para la inmersion y la tienda).
 */
import { DURATION, poseAt } from '../logic/timeline.js';
import { createTransitions } from './transition.js';

/* Portrait: se conserva esta parte del ancho de cuadro pensado para pantalla ancha. */
const VITRINA_FIT = Object.freeze({ designAspect: 16 / 9, keepWidth: 0.85, maxFov: 52 });
const DEFAULT_VITRINA_CAMERA = Object.freeze({ position: [0, 0.25, 1.6], target: [0, 0.18, 0], fov: 30 });

async function importOptional(url, label) {
  try {
    return await import(url);
  } catch (error) {
    console.error(`[co2] El modulo ${label} no se pudo cargar; su seccion usa la historia`, error);
    return null;
  }
}

function createOptional(label, factory) {
  try {
    return factory();
  } catch (error) {
    console.error(`[co2] El modulo ${label} fallo al crearse; su seccion usa la historia`, error);
    return null;
  }
}

/* Carga en paralelo los modulos de los otros equipos; ninguno es imprescindible. */
export async function loadModules() {
  const [vitrina, inmersion, post] = await Promise.all([
    importOptional('./vitrina/index.js', 'vitrina'),
    importOptional('./inmersion/index.js', 'inmersion'),
    importOptional('./post/index.js', 'post'),
  ]);
  return { vitrina, inmersion, post };
}

const toVector = (THREE, value, fallback) => {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value)) return new THREE.Vector3().fromArray(value);
  if (value && Number.isFinite(value.x)) return new THREE.Vector3(value.x, value.y, value.z);
  return new THREE.Vector3().fromArray(fallback);
};

function cameraSpec(THREE, VITRINA_CAMERA, fase) {
  const spec = VITRINA_CAMERA?.[fase] ?? VITRINA_CAMERA?.hero ?? DEFAULT_VITRINA_CAMERA;
  return {
    position: toVector(THREE, spec.position, DEFAULT_VITRINA_CAMERA.position),
    target: toVector(THREE, spec.target, DEFAULT_VITRINA_CAMERA.target),
    fov: Number.isFinite(spec.fov) ? spec.fov : DEFAULT_VITRINA_CAMERA.fov,
  };
}

export function createDirector({ stage, modules, marca, quality, sideLayout }) {
  const { scene, renderer, THREE } = stage.three;
  const transitions = createTransitions({ scene, renderer, quality });
  stage.setOverlaySuspender(transitions.suspend);

  const base = {
    fog: scene.fog,
    background: scene.background,
    environment: scene.environment,
    exposure: renderer.toneMappingExposure,
    clearColor: renderer.getClearColor(new THREE.Color()),
    clearAlpha: renderer.getClearAlpha(),
  };

  const vitrina = modules.vitrina && createOptional('vitrina', () => modules.vitrina.createVitrina({ scene, renderer, marca, quality }));
  const inmersion = modules.inmersion && createOptional('inmersion', () => modules.inmersion.createInmersion({ scene, renderer, marca, quality }));
  const VITRINA_CAMERA = modules.vitrina?.VITRINA_CAMERA ?? null;
  const vitrinaCamera = new THREE.PerspectiveCamera(DEFAULT_VITRINA_CAMERA.fov, 1, 0.01, 100);
  const vitrinaTarget = new THREE.Vector3();
  const specs = Object.fromEntries(['hero', 'emerge', 'tienda'].map((fase) => [fase, cameraSpec(THREE, VITRINA_CAMERA, fase)]));
  const projected = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  [vitrina, inmersion].forEach((module) => { if (module?.group) module.group.visible = false; });

  /* Post-proceso solo en calidad alta; si la calidad baja, se vuelve a renderer.render. */
  let post = null;
  if (modules.post && quality === 'high') {
    post = createOptional('post', () => modules.post.createPost({ renderer, scene, camera: stage.three.camera, quality }));
  }
  let usingPost = false;
  let size = { width: 1, height: 1, ratio: 1 };
  let activeCamera = stage.three.camera;
  let seleccion = 0;
  let failedUpdate = new Set();

  function syncDrawer() {
    const want = Boolean(post) && stage.getQuality() !== 'low';
    if (want === usingPost) return;
    usingPost = want;
    stage.setDrawer(want ? (camera) => { post.setCamera(camera); post.render(); } : null);
  }

  function resetEnvironment() {
    scene.fog = base.fog;
    scene.background = base.background;
    scene.environment = base.environment;
    renderer.toneMappingExposure = base.exposure;
    renderer.setClearColor(base.clearColor, base.clearAlpha);
  }

  function safeUpdate(label, module, args) {
    if (!module || failedUpdate.has(label)) return false;
    try {
      module.update(args);
      return true;
    } catch (error) {
      failedUpdate = new Set([...failedUpdate, label]);
      console.error(`[co2] ${label}.update fallo; su seccion usa la historia`, error);
      return false;
    }
  }

  function showOnly(escena) {
    stage.setStoryVisible(escena === 'historia');
    if (vitrina?.group) vitrina.group.visible = escena === 'vitrina';
    if (inmersion?.group) inmersion.group.visible = escena === 'inmersion';
  }

  /* Camara de la vitrina: la de su fase (o mezcla de dos), ajustada al formato de pantalla. */
  function placeVitrinaCamera(view) {
    const from = specs[view.camara?.de ?? view.fase] ?? specs.hero;
    const to = specs[view.camara?.a ?? view.fase] ?? from;
    const k = view.camara?.k ?? 0;
    vitrinaCamera.position.lerpVectors(from.position, to.position, k);
    vitrinaTarget.lerpVectors(from.target, to.target, k);
    const fov = from.fov + (to.fov - from.fov) * k;
    const aspect = size.width / size.height;
    const { designAspect, keepWidth, maxFov } = VITRINA_FIT;
    const tanDesign = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const tanWanted = aspect >= designAspect ? tanDesign : tanDesign * Math.max(1, (designAspect / aspect) * keepWidth);
    const tanMax = Math.tan(THREE.MathUtils.degToRad(maxFov) / 2);
    const tan = Math.min(tanWanted, tanMax);
    const dolly = tanWanted / tan;
    vitrinaCamera.position.sub(vitrinaTarget).multiplyScalar(dolly).add(vitrinaTarget);
    const desktop = size.width > 1000;
    const scale = desktop ? (view.fase === 'hero' ? 1.65 : 1.05) : view.fase === 'tienda' ? 0.95 : 1;
    vitrinaCamera.position.sub(vitrinaTarget).multiplyScalar(scale).add(vitrinaTarget);
    vitrinaCamera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tan));
    vitrinaCamera.aspect = aspect;
    vitrinaCamera.lookAt(vitrinaTarget);
    vitrinaCamera.setViewOffset(size.width, size.height,
      desktop && view.fase === 'hero' ? -size.width * 0.17 : 0,
      view.fase === 'hero' ? -size.height * 0.06 : 0, size.width, size.height);
    vitrinaCamera.updateProjectionMatrix();
    vitrinaCamera.updateMatrixWorld();
    return vitrinaCamera.position.distanceTo(vitrinaTarget);
  }

  const historiaFallback = (view) => {
    if (view.escena === 'inmersion') return { escena: 'historia', t: DURATION, buceo: view.fase === 'crema' ? 0.2 + 0.3 * view.p : 0.5 };
    if (view.fase === 'hero') return { escena: 'historia', t: 0 };
    return { escena: 'historia', t: DURATION };
  };

  /* Deja la escena lista para una vista y devuelve con que camara dibujarla. */
  function applyView(view, time, lote) {
    if (view.escena === 'vitrina') {
      if (safeUpdate('vitrina', vitrina, { fase: view.fase, p: view.p, seleccion, time })) {
        showOnly('vitrina');
        const distance = placeVitrinaCamera(view);
        post?.setFocus?.({ distance, aperture: 0.2 });
        return { camera: vitrinaCamera, kind: 'vitrina' };
      }
      return applyView(historiaFallback(view), time, lote);
    }
    if (view.escena === 'inmersion') {
      if (safeUpdate('inmersion', inmersion, { fase: view.fase, p: view.p, time, lote })) {
        showOnly('inmersion');
        const { camera } = inmersion;
        camera.aspect = size.width / size.height;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        return { camera, kind: 'inmersion' };
      }
      return applyView(historiaFallback(view), time, lote);
    }
    showOnly('historia');
    stage.prepare(poseAt(view.t), sideLayout(), { dive: view.buceo ?? 0 });
    const { camera } = stage.three;
    post?.setFocus?.({ distance: camera.position.length(), aperture: 0.4 });
    return { camera, kind: 'historia' };
  }

  function drawView(applied, { directly = false } = {}) {
    if (applied.kind === 'historia') stage.draw(directly);
    else if (directly || !usingPost) renderer.render(scene, applied.camera);
    else {
      post.setCamera(applied.camera);
      post.render();
    }
  }

  /*
   * Dibuja un estado de story.js. Devuelve las anclas de la vitrina proyectadas a la pantalla
   * (pixeles CSS del lienzo) cuando la vitrina es la vista activa.
   */
  function render(state, { time = 0, lote = null } = {}) {
    if (!stage.isLoaded()) return { painted: false, anchors: [] };
    post?.setTime?.(time);
    syncDrawer();
    resetEnvironment();
    if (state.desde) {
      transitions.captureFrame(() => {
        const previous = applyView(state.desde, time, lote);
        drawView(previous, { directly: true });
        resetEnvironment();
      });
      transitions.setFade(state.desde.peso);
    } else transitions.setFade(0);
    transitions.setRing(state.anillo, time);
    const applied = applyView(state.vista, time, lote);
    activeCamera = applied.camera;
    drawView(applied);
    return { painted: true, anchors: applied.kind === 'vitrina' ? projectAnchors() : [] };
  }

  function projectAnchors() {
    let list = [];
    try {
      list = vitrina?.anchors?.() ?? [];
    } catch (error) {
      console.error('[co2] vitrina.anchors fallo', error);
    }
    return list.map(({ id, position }) => {
      const point = toVector(THREE, position, [0, 0, 0]);
      projected.copy(point).project(vitrinaCamera);
      const inFront = projected.z > -1 && projected.z < 1;
      const x = ((projected.x + 1) / 2) * size.width;
      const y = ((1 - projected.y) / 2) * size.height;
      const onScreen = x >= 0 && x <= size.width && y >= 0 && y <= size.height;
      return Object.freeze({ id, x, y, visible: inFront && onScreen });
    });
  }

  return {
    render,
    rotateProduct: (dx, dy) => vitrina?.rotate(dx, dy),
    resetProduct: () => vitrina?.resetRotation(),
    shopInteraction: () => vitrina?.interaction(),
    visibleProduct: () => vitrina?.selectedIndex(),
    pickProduct(x, y) {
      if (!vitrina?.group.visible || activeCamera !== vitrinaCamera) return -1;
      pointer.set(x / size.width * 2 - 1, 1 - y / size.height * 2);
      raycaster.setFromCamera(pointer, vitrinaCamera);
      const hit = raycaster.intersectObjects(vitrina.pickable(), false)[0];
      return hit ? marca.lotes.findIndex(lote => lote.id === hit.object.name) : -1;
    },
    productOrigin(index) {
      if (!vitrina?.group.visible) return null;
      const bag = vitrina.pickable().find(object => object.name === marca.lotes[index]?.id);
      if (!bag) return null;
      const box = new THREE.Box3().setFromObject(bag);
      let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(vitrinaCamera);
        const px = (point.x + 1) * size.width / 2, py = (1 - point.y) * size.height / 2;
        left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
      }
      return { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top };
    },
    setSize(width, height, ratio) {
      size = { width, height, ratio };
      transitions.setSize(width, height, ratio);
      post?.setSize?.(width, height, ratio);
    },
    setSeleccion(index) {
      const count = marca?.lotes?.length ?? 0;
      if (Number.isInteger(index) && index >= 0 && (count === 0 || index < count)) seleccion = index;
    },
    getSeleccion: () => seleccion,
    getActiveCamera: () => activeCamera,
    usesPost: () => usingPost,
    modules: () => ({ vitrina: Boolean(vitrina), inmersion: Boolean(inmersion), post: Boolean(post) }),
    dispose() {
      transitions.dispose();
      vitrina?.dispose?.();
      inmersion?.dispose?.();
      post?.dispose?.();
    },
  };
}
