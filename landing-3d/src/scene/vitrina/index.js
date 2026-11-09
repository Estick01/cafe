import * as THREE from 'three';
import { createShopMotion } from '../../logic/shopMotion.js';
import { VITRINA_CAMERA, mallaBolsa, crearPose, posesInto, crearAnillo, anilloInto, anclaInto, tazasInto, granoInto, GRANOS } from '../../logic/vitrina.js';
import { crearGeometriaBolsa } from './bolsa.js';
import { crearTexturaBolsa } from './textura.js';
import { crearAnilloOrbital } from './anillo.js';
import { crearRecursosTaza, crearTaza, crearGeometriaGrano, crearMaterialGrano } from './piezas.js';
import { crearRecursosEntorno, crearSuelo, crearSombra, crearBrillos, crearLiquido, crearLuces } from './entorno.js';

export { VITRINA_CAMERA };

export function createVitrina({ scene, marca, quality }) {
  const low = quality === 'low' || quality === 'baja';
  const meshConfig = mallaBolsa(low ? 'baja' : 'alta');
  const group = new THREE.Group();
  group.name = 'vitrina';
  const geometry = crearGeometriaBolsa(meshConfig);
  const poses = marca.lotes.map(crearPose);
  const textures = [];
  const bags = marca.lotes.map(lote => {
    const map = crearTexturaBolsa(lote, marca, meshConfig.etiqueta);
    textures.push(map);
    const material = new THREE.MeshPhysicalMaterial({ map, roughness: 0.48, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.35 });
    const bag = new THREE.Mesh(geometry, material);
    bag.name = lote.id; group.add(bag); return bag;
  });
  const resources = crearRecursosEntorno();
  const floor = crearSuelo(resources, 64);
  floor.material.dispose();
  floor.material = new THREE.MeshBasicMaterial({ color: 0x10100f, alphaMap: resources.fundido, transparent: true, depthWrite: false });
  const liquid = crearLiquido(resources, 64);
  const glow = crearBrillos(resources);
  glow.aro.material.opacity = 0.12;
  glow.charco.material.opacity = 0.1;
  const shadows = bags.map(() => crearSombra(resources, 0.18, 0.13, 0.7));
  const lights = crearLuces();
  const ambient = new THREE.HemisphereLight(0xc9dcff, 0x3c2515, 1.4);
  const ring = crearAnilloOrbital(meshConfig);
  const ringPose = crearAnillo();
  const cupsResources = crearRecursosTaza(low ? 32 : 64);
  const cups = [crearTaza(cupsResources), crearTaza(cupsResources)];
  const cupPoses = tazasInto([{}, {}], bags.length);
  cups.forEach((cup, i) => cup.position.set(cupPoses[i].x, 0, cupPoses[i].z));
  const beanGeometry = crearGeometriaGrano(low ? 12 : 20);
  const beanMaterial = crearMaterialGrano();
  const beans = Array.from({ length: low ? GRANOS.baja : GRANOS.alta }, () => new THREE.Mesh(beanGeometry, beanMaterial));
  const beanPose = {};
  const shop = createShopMotion();
  let shopActive = false;
  group.add(floor, liquid, glow.aro, glow.charco, lights.grupo, ambient, ring.grupo, ...shadows, ...cups, ...beans);
  scene.add(group);

  function update({ fase, p, seleccion = 0, time = 0 }) {
    shopActive = fase === 'tienda' || fase === 'emerge';
    const now = performance.now();
    shop.select(seleccion, now, shopActive);
    const interactive = shop.at(now);
    scene.background = new THREE.Color(0x0a0a0a);
    scene.fog = null;
    posesInto(poses, fase, p, seleccion, time, bags.length);
    if (shopActive) poses.forEach((pose, index) => {
      pose.visible = index === interactive.index;
      pose.x = 0; pose.z = 0;
      pose.y = (fase === 'emerge' ? pose.y : 0.012) + interactive.lift;
      pose.rotY = interactive.yaw;
      pose.inclinacion = interactive.pitch;
      pose.escala = interactive.scale;
    });
    bags.forEach((bag, i) => {
      const pose = poses[i];
      bag.position.set(pose.x, pose.y, pose.z);
      bag.rotation.set(pose.inclinacion, pose.rotY, 0);
      bag.scale.setScalar(pose.escala); bag.visible = pose.visible;
      shadows[i].position.set(pose.x, 0.0008, pose.z);
      shadows[i].visible = pose.visible && fase !== 'emerge';
    });
    floor.visible = fase !== 'emerge'; liquid.visible = fase === 'emerge';
    cups.forEach(cup => { cup.visible = !shopActive; });
    anilloInto(ringPose, shopActive ? 'emerge' : fase, shopActive ? 1 : p, seleccion, shopActive ? now / 1000 : time, bags.length); ring.aplicar(ringPose);
    glow.aro.scale.setScalar(ringPose.radio * 2.2);
    glow.aro.position.set(ringPose.cx, 0.0012, ringPose.cz);
    glow.charco.scale.setScalar(0.4);
    glow.charco.position.set(ringPose.cx, 0.0011, ringPose.cz);
    lights.ajustar(1, 1, fase === 'tienda' ? 0.25 : 0, ringPose.cx, ringPose.cz);
    beans.forEach((bean, i) => {
      granoInto(beanPose, i, beans.length, fase === 'emerge' ? p : 1, shopActive ? now / 1000 : time);
      bean.visible = shopActive && beanPose.visible;
      bean.position.set(beanPose.x, beanPose.y, beanPose.z);
      bean.rotation.set(beanPose.rx, beanPose.ry, beanPose.rz);
      bean.scale.setScalar(beanPose.escala);
    });
  }
  return {
    group, update,
    rotate: (dx, dy) => shop.rotate(dx, dy),
    resetRotation: () => shop.reset(),
    interaction: () => shop.at(performance.now()),
    selectedIndex: () => shop.at(performance.now()).index,
    pickable: () => bags.filter(bag => bag.visible),
    anchors: () => poses.flatMap((pose, i) => pose.visible ? [{ id: marca.lotes[i].id, position: anclaInto({}, pose) }] : []),
    dispose() {
      group.removeFromParent();
      const geometries = new Set(), materials = new Set();
      group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose()); resources.dispose(); cupsResources.dispose(); lights.dispose();
    },
  };
}
