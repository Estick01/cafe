/*
 * Ajusta los materiales que trae el glb (GLTFLoader ya asigna mapas, colorSpace y clearcoat):
 * recorte de la taza, crecimiento del asa, sombras, oclusion y fondos.
 */
import * as THREE from 'three';

import { createHandleGrowth } from './handleGrowth.js';
import { averageColorLinear, averageRoughness } from './textureStats.js';
import { createCupOcclusion, createFocus, createSaucerOcclusion, patchCeramicGlaze } from './shaderPatches.js';

export const REQUIRED_OBJECTS = Object.freeze([
  'GEO-platillo', 'GEO-taza', 'GEO-asa', 'GEO-grano', 'GEO-cascarilla', 'GEO-base_piedra', 'GEO-suelo', 'GEO-pared',
]);

const CASTERS = Object.freeze(['GEO-platillo', 'GEO-taza', 'GEO-asa', 'GEO-grano', 'GEO-base_piedra']);
const CERAMIC = Object.freeze(['GEO-platillo', 'GEO-taza', 'GEO-asa']);
const ANISOTROPY = 8;

const linear = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

const TUNING = Object.freeze({
  ceramic: {
    clearcoat: 0.5,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.85,
    ior: 1.46,
    roughness: 0.82,
    metalness: 0,
    normalScale: 0.32,
    // El esmalte recoge la luz del estudio; la ceramica no emite luz propia.
    tint: linear(1.025, 1.0, 0.955),
    emissive: linear(0, 0, 0),
  },
  bean: { clearcoat: 0.22, clearcoatRoughness: 0.32, envMapIntensity: 0.9 },
  chaff: { envMapIntensity: 0.8 },
  /* Piedra con 'Specular IOR Level' 0.3 en Blender: reflejo mas debil que un dielectrico normal. */
  floor: { specularIntensity: 0.6, envMapIntensity: 0.55 },
  wall: { specularIntensity: 0.6, envMapIntensity: 0.5 },
  stone: { specularIntensity: 0.6, envMapIntensity: 0.75 },
});

function improveTextures(material, anisotropy) {
  for (const key of ['map', 'normalMap', 'roughnessMap']) {
    if (material[key]) material[key].anisotropy = anisotropy;
  }
}

/* MeshStandardMaterial no tiene specularIntensity: se pasa a fisico con los mismos mapas. */
function toStone(mesh, tuning) {
  const { map, roughnessMap, name } = mesh.material;
  const previous = mesh.material;
  mesh.material = new THREE.MeshPhysicalMaterial({ name, map, roughnessMap, metalness: 0, roughness: 1, ...tuning });
  previous.dispose();
  return mesh.material;
}

function tuneCeramic(mesh, { normalScale, tint, emissive, ...values }) {
  Object.assign(mesh.material, values);
  mesh.material.normalScale.setScalar(normalScale);
  mesh.material.color.copy(tint);
  mesh.material.emissive.copy(emissive);
  mesh.material.emissiveMap = null;
  patchCeramicGlaze(mesh.material);
  // Cada pieza encadena parches distintos (oclusion o crecimiento del asa).
  mesh.material.customProgramCacheKey = () => `ceramic-glaze-v1-${mesh.name}`;
}

/* Media de los dos marmoles: el color y la rugosidad que comparten en la union. */
function seamMaterial(floor, wall) {
  const fallbackColor = [0.02, 0.018, 0.016];
  const [a, b] = [floor, wall].map((material) => averageColorLinear(material.map, fallbackColor));
  const [ra, rb] = [floor, wall].map((material) => averageRoughness(material.roughnessMap, 0.5));
  return [a.map((value, index) => (value + b[index]) / 2), (ra + rb) / 2];
}

export function applySolidMaterials({ objects, renderer }) {
  const anisotropy = Math.min(ANISOTROPY, renderer.capabilities.getMaxAnisotropy());
  Object.values(objects).forEach((object) => improveTextures(object.material, anisotropy));
  CASTERS.forEach((name) => { objects[name].castShadow = true; });
  Object.values(objects).forEach((object) => { object.receiveShadow = true; });

  CERAMIC.forEach((name) => tuneCeramic(objects[name], TUNING.ceramic));
  Object.assign(objects['GEO-grano'].material, TUNING.bean);
  Object.assign(objects['GEO-cascarilla'].material, TUNING.chaff);
  toStone(objects['GEO-base_piedra'], TUNING.stone);
  const focus = createFocus();
  const floor = toStone(objects['GEO-suelo'], TUNING.floor);
  focus.patch(floor, 'floor');
  const wall = toStone(objects['GEO-pared'], TUNING.wall);
  focus.patch(wall, 'wall');
  focus.setSeamMaterial(...seamMaterial(floor, wall));

  // Taza: se ve solo por debajo del plano; las caras traseras tapan el corte hueco.
  const cupClipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const cup = objects['GEO-taza'].material;
  cup.side = THREE.DoubleSide;
  cup.clippingPlanes = [cupClipPlane];
  cup.clipShadows = true;
  const setCoffeeLine = createCupOcclusion(cup);
  const setCupPresence = createSaucerOcclusion(objects['GEO-platillo'].material);
  // El asa no usa el plano: se encoge y se cierra en la propia geometria (handleGrowth.js).
  const handle = createHandleGrowth(objects['GEO-asa']);

  return {
    cupClipPlane,
    floorMaterial: floor,
    updateHandle: handle.update,
    setFocusDistance: focus.setDistance,
    setCoffeeLine,
    setCupPresence,
  };
}
