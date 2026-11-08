/*
 * Escena en tiempo real: renderizador, carga del glb y aplicacion de cada pose
 * (el equivalente de animate_scene.apply_pose). La pose entra siempre desde fuera.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { blenderEulerToThreeQuaternion, toThree } from '../logic/coords.js';
import { FRAME, fittedCamera, frameRect } from '../logic/framing.js';
import { sceneAt } from '../logic/epilogue.js';
import { smooth } from '../logic/timeline.js';
import { fetchSceneAssets } from './assetFetch.js';
import { createContactShadows } from './contactShadows.js';
import { createEpilogue } from './epilogue.js';
import { createFloorReflection } from './floorReflection.js';
import { createLiquids } from './liquids.js';
import { addEnvironment, addLights } from './lighting.js';
import { createParallax } from './parallax.js';
import { REQUIRED_OBJECTS, applySolidMaterials } from './solids.js';
import { createSteam } from './steamSheets.js';

const TONE_MAPPING_EXPOSURE = 1.0;
const BACKGROUND = 0x0e0c0b;
const NEAR = 0.02;
const FAR = 8;
const AMBIENT_BOB = 0.0005;
const AMBIENT_SWAY = 0.012;
const WAKE_STEAM = 0.001;
/* Movil o pantalla pequeña: reflejo barato desde el principio. */
const LOW_QUALITY_QUERY = '(pointer: coarse), (max-width: 760px)';

function createRenderer(canvas) {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('Sin contexto WebGL');
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = TONE_MAPPING_EXPOSURE;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.localClippingEnabled = true;
    renderer.setClearColor(BACKGROUND, 1);
    return renderer;
  } catch (error) {
    throw Object.assign(new Error('No se pudo crear el contexto WebGL', { cause: error }), { code: 'webgl' });
  }
}

async function fetchManifest(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Manifest ${url}: HTTP ${response.status}`);
  return response.json();
}

function findObjects(root) {
  const objects = Object.fromEntries(REQUIRED_OBJECTS.map((name) => [name, root.getObjectByName(name)]));
  const missing = REQUIRED_OBJECTS.filter((name) => !objects[name]);
  if (missing.length) throw new Error(`Faltan objetos en el glb: ${missing.join(', ')}`);
  return objects;
}

function restoreSize(renderer, width, height, ratio) {
  renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, false);
}

export function createStage(canvas, config) {
  const renderer = createRenderer(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const camera = new THREE.PerspectiveCamera(25, 1, NEAR, FAR);
  const parallax = createParallax(config.parallax);
  const beanQuaternion = new THREE.Quaternion();
  const swayQuaternion = new THREE.Quaternion();
  const swayAxis = new THREE.Vector3(0, 1, 0);
  const cameraTarget = new THREE.Vector3();
  const projected = new THREE.Vector3();

  let size = { width: 1, height: 1 };
  let ambientSeconds = 0;
  let parts = null;
  /* Baja una vez y no vuelve a subir: igual que la resolucion adaptativa, sin saltos de ida y vuelta. */
  let quality = window.matchMedia(LOW_QUALITY_QUERY).matches ? 'low' : 'high';
  const deviceRatio = () => Math.min(window.devicePixelRatio || 1, config.dpr.max);

  function applyQuality() {
    parts?.reflection.setQuality(quality);
  }

  function resizeRenderer(ratio) {
    renderer.setPixelRatio(ratio);
    renderer.setSize(size.width, size.height, false);
    parts?.reflection.setSize(size.width, size.height);
  }

  /* Llamado por la resolucion adaptativa: si baja, el reflejo tambien pasa a la calidad baja. */
  function setPixelRatio(ratio) {
    if (ratio < deviceRatio() - 0.01 && quality !== 'low') {
      quality = 'low';
      applyQuality();
    }
    resizeRenderer(ratio);
  }

  function setSize(width, height) {
    size = { width, height };
    resizeRenderer(deviceRatio());
  }

  /* Descarga contando bytes y analiza el glb desde memoria; sus texturas salen de URL blob. */
  async function loadModel(manifest, manifestUrl, onProgress, signal) {
    const baseUrl = new URL(manifestUrl, window.location.href);
    const assets = await fetchSceneAssets(manifest, baseUrl, (fraction) => onProgress(fraction, 'download'), signal);
    onProgress(1, 'parse');
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => assets.blobUrls.get(decodeURIComponent(url.split('/').pop())) ?? url);
    try {
      return await new GLTFLoader(manager).parseAsync(assets.glb, new URL('.', baseUrl).href);
    } finally {
      assets.release();
    }
  }

  async function load(manifestUrl, onProgress = () => {}, { signal } = {}) {
    if (parts) return;
    const manifest = await fetchManifest(manifestUrl, signal);
    if (manifest.status !== 'ready' || !manifest.glb) throw new Error('El manifest no esta listo');
    onProgress(0, 'download');
    const gltf = await loadModel(manifest, manifestUrl, onProgress, signal);
    signal?.throwIfAborted?.();
    gltf.scene.updateMatrixWorld(true);
    scene.add(gltf.scene);
    const objects = findObjects(gltf.scene);
    const solids = applySolidMaterials({ objects, renderer });
    addLights(scene);
    addEnvironment(renderer, scene);
    const steam = createSteam(scene);
    const contact = createContactShadows(scene);
    const epilogue = createEpilogue(scene);
    const reflection = createFloorReflection({
      renderer,
      scene,
      floorMaterial: solids.floorMaterial,
      hidden: [objects['GEO-suelo'], objects['GEO-pared'], steam.mesh, ...contact.meshes, ...epilogue.reflectionHidden],
      beanParts: [objects['GEO-grano']],
    });
    parts = {
      objects,
      solids,
      liquids: createLiquids(scene),
      steam,
      contact,
      reflection,
      epilogue,
    };
    applyQuality();
    reflection.setSize(size.width, size.height);
    onProgress(1, 'compile');
    renderer.compile(scene, camera);
    onProgress(1, 'compile');
  }

  /* Reflejo del suelo y render principal, con la camara ya colocada. */
  function draw() {
    parts.reflection.update(camera);
    renderer.render(scene, camera);
  }

  function applyPose(pose, ambient) {
    const { objects, solids, liquids, steam, contact } = parts;
    objects['GEO-platillo'].position.y = pose.saucerZ;
    objects['GEO-base_piedra'].position.y = pose.pedestalZ;
    objects['GEO-base_piedra'].visible = pose.pedestalVisible;
    objects['GEO-taza'].position.y = pose.cupZ;
    objects['GEO-taza'].visible = pose.reveal > 0;
    solids.cupClipPlane.constant = pose.cupZ + pose.reveal;
    objects['GEO-asa'].position.y = pose.cupZ;
    // Fija visible segun quede algo del asa por debajo del plano y del crecimiento.
    solids.updateHandle(pose.handleGrowth, pose.reveal);
    solids.setCoffeeLine(pose.coffeeVisible ? pose.coffeeLevel - pose.cupZ : -1);
    solids.setCupPresence(smooth(0, 0.02, pose.reveal));

    const floating = 1 - smooth(4.8, 5.0, pose.time);
    const bean = objects['GEO-grano'];
    bean.position.set(0, pose.beanZ + AMBIENT_BOB * Math.sin(ambient * 1.3) * floating, 0);
    beanQuaternion.fromArray(blenderEulerToThreeQuaternion(pose.beanRotation));
    swayQuaternion.setFromAxisAngle(swayAxis, AMBIENT_SWAY * Math.sin(ambient * 0.8) * floating);
    bean.quaternion.copy(swayQuaternion).multiply(beanQuaternion);

    liquids.update(pose);
    steam.update(pose, ambient);
    contact.update(pose);
  }

  /* Con rectangulo de referencia a pantalla completa, reproduce el encuadre de Cycles. */
  function applyCamera(pose, width, height, rect, useParallax) {
    const fit = fittedCamera({ width, height, rect });
    const [tx, ty, tz] = toThree(pose.cameraTarget);
    const [px, py, pz] = toThree(pose.cameraPosition);
    cameraTarget.set(tx, ty, tz);
    camera.position.set(tx + (px - tx) * fit.dolly, ty + (py - ty) * fit.dolly, tz + (pz - tz) * fit.dolly);
    if (useParallax) parallax.apply(camera.position, cameraTarget);
    camera.lookAt(cameraTarget);
    camera.aspect = width / height;
    camera.fov = fit.verticalFov;
    camera.setViewOffset(width, height, fit.viewOffsetX, fit.viewOffsetY, width, height);
    camera.updateProjectionMatrix();
    parts.solids.setFocusDistance(camera.position.distanceTo(cameraTarget), width * renderer.getPixelRatio());
  }

  /* Epilogo (cuchara y aroma), con la camara ya colocada: el tamano de las motas depende de ella. */
  function applyEpilogue(epilogue, ambient, height) {
    const projScale = (height * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    parts.epilogue.update(epilogue, ambient, { lowQuality: quality === 'low', projScale });
  }

  function render(pose, sideLayoutActive, epilogue = null) {
    if (!parts) return;
    const rect = frameRect({ ...size, side: sideLayoutActive, time: pose.time });
    applyPose(pose, ambientSeconds);
    applyCamera(pose, size.width, size.height, rect, true);
    applyEpilogue(epilogue, ambientSeconds, size.height);
    draw();
  }

  /* Punto en ejes de Blender -> pixeles CSS del lienzo, con la camara del ultimo render. */
  function projectToScreen(point) {
    const [x, y, z] = toThree(point);
    const ndc = projected.set(x, y, z).project(camera);
    return { x: ((ndc.x + 1) / 2) * size.width, y: ((1 - ndc.y) / 2) * size.height, visible: ndc.z < 1 };
  }

  function renderStatic(pose, epilogue = null) {
    if (!parts) return;
    const scale = Math.max(size.width / FRAME.width, size.height / FRAME.height);
    const width = FRAME.width * scale;
    const height = FRAME.height * scale;
    const rect = { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
    applyPose(pose, 0);
    applyCamera(pose, size.width, size.height, rect, false);
    applyEpilogue(epilogue, 0, size.height);
    draw();
  }

  /* Avanza el tiempo ambiental y dice si hay algo vivo que dibujar aunque el scroll este parado. */
  function tickAmbient(deltaMs, pose) {
    const moving = parallax.tick(deltaMs);
    const hasAmbient = pose.time < 5.0 || pose.steamAmount > WAKE_STEAM;
    if (hasAmbient) ambientSeconds += Math.min(deltaMs, 100) / 1000;
    return moving || hasAmbient;
  }

  /* Render a tamano fijo con el encuadre exacto de Cycles; devuelve un lienzo 2D con la copia. */
  async function captureReference(time, width, height) {
    const ratio = renderer.getPixelRatio();
    const previous = size;
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    const { pose, epilogue } = sceneAt(time);
    applyPose(pose, 0);
    applyCamera(pose, width, height, { x: 0, y: 0, width, height }, false);
    applyEpilogue(epilogue, 0, height);
    draw();
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    copy.getContext('2d').drawImage(renderer.domElement, 0, 0);
    restoreSize(renderer, previous.width, previous.height, ratio);
    return copy;
  }

  /* Solo para pruebas: tiempo real de CPU + GPU, sin vsync, forzando a terminar con readPixels. */
  function measureRender(time, count, ratio) {
    const previousRatio = renderer.getPixelRatio();
    resizeRenderer(ratio);
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    const { pose, epilogue } = sceneAt(time);
    const rect = { x: 0, y: 0, width: size.width, height: size.height };
    const samples = [];
    for (let index = 0; index < count; index += 1) {
      const start = performance.now();
      applyPose(pose, index * 0.016);
      applyCamera(pose, size.width, size.height, rect, false);
      applyEpilogue(epilogue, index * 0.016, size.height);
      draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      samples.push(performance.now() - start);
    }
    resizeRenderer(previousRatio);
    return samples.slice(3);
  }

  return {
    load,
    measureRender,
    render,
    renderStatic,
    projectToScreen,
    setSize,
    setPixelRatio,
    getPixelRatio: () => renderer.getPixelRatio(),
    tickAmbient,
    setParallaxEnabled: (enabled) => parallax.setEnabled(enabled),
    captureReference,
    /* Solo para pruebas: fuerza la calidad del reflejo ('high' o 'low'). */
    setQuality(name) {
      quality = name;
      applyQuality();
    },
    getQuality: () => quality,
    info: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0,
      drawingBuffer: [renderer.domElement.width, renderer.domElement.height],
      quality,
    }),
  };
}
