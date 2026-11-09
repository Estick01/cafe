import * as THREE from 'three';
import { crearGeometriaBolsa } from './vitrina/bolsa.js';
import { crearTexturaBolsa } from './vitrina/textura.js';
import { crearGeometriaGrano, crearMaterialGrano } from './vitrina/piezas.js';
import { mallaBolsa, hash01 } from '../logic/vitrina.js';

// Visor independiente: se crea al abrir y libera sus recursos al cerrar.
export function createProductViewer(canvas, lote, marca, { reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 1.5), 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 10);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const ambient = new THREE.HemisphereLight(0xe5eeff, 0x413020, 2.1);
  const key = new THREE.DirectionalLight(0xfff2df, 3.2); key.position.set(-1, 2, 3);
  const rim = new THREE.DirectionalLight(0xb5cfff, 1.8); rim.position.set(2, 1, -1);
  scene.add(ambient, key, rim);
  const source = crearGeometriaBolsa(mallaBolsa('baja'));
  const base = source.attributes.position.array.slice();
  const bodyGeometry = source.clone();
  const sealGeometry = source.clone();
  const bodyIndices = [], sealIndices = [];
  const indices = source.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.slice(i, i + 3));
    (triangle.some(index => base[index * 3 + 1] > 0.1861) ? sealIndices : bodyIndices).push(...triangle);
  }
  bodyGeometry.setIndex(bodyIndices); sealGeometry.setIndex(sealIndices);
  const texture = crearTexturaBolsa(lote, marca, 2048);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.62, metalness: 0.02 });
  const lining = new THREE.MeshStandardMaterial({ color: 0x927b59, roughness: 0.9, side: THREE.BackSide });
  const body = new THREE.Mesh(bodyGeometry, material);
  const inside = new THREE.Mesh(bodyGeometry, lining);
  const seal = new THREE.Mesh(sealGeometry, material);
  const contents = new THREE.Group();
  [body, inside, seal, contents].forEach(object => { object.position.y = -0.1; pivot.add(object); });
  const beansGeometry = crearGeometriaGrano(16);
  const beansMaterial = crearMaterialGrano();
  beansMaterial.roughness = 0.65; beansMaterial.clearcoat = 0.12;
  for (let i = 0; i < 66; i++) {
    const bean = new THREE.Mesh(beansGeometry, beansMaterial);
    const angle = hash01(i + 1) * Math.PI * 2;
    const radius = Math.sqrt(hash01(i * 3.7 + 2));
    bean.position.set(Math.cos(angle) * radius * 0.046, 0.166 + hash01(i * 2.1) * 0.008, Math.sin(angle) * radius * 0.019);
    bean.rotation.set(hash01(i * 1.3) * 2, hash01(i * 4.7) * 6, hash01(i * 8.1) * 2);
    bean.scale.setScalar(0.75 + hash01(i * 5.3) * 0.2);
    contents.add(bean);
  }
  let yaw = 0.15, pitch = 0, wantedYaw = yaw, wantedPitch = 0;
  let opened = 0, wantedOpen = 0, request = 0, last = 0, disposed = false;
  let drag = null;
  function reshape(amount) {
    const positions = bodyGeometry.attributes.position;
    const uv = bodyGeometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const y = base[i * 3 + 1];
      const weight = THREE.MathUtils.smoothstep(y, 0.145, 0.185) * amount;
      const u = uv.getX(i);
      const edge = u <= 0.5 ? 1 : u < 0.6 ? 1 - (u - 0.5) / 0.1 * 2 : u <= 0.9 ? -1 : -1 + (u - 0.9) / 0.1 * 2;
      const z = base[i * 3 + 2];
      positions.setXYZ(i, base[i * 3] * (1 - weight * 0.07), y, z + (edge * 0.024 - z) * weight);
    }
    positions.needsUpdate = true;
    bodyGeometry.computeVertexNormals();
    seal.position.set(amount * 0.035, -0.1 + amount * 0.048, -amount * 0.025);
    seal.rotation.z = -amount * 0.22;
    seal.visible = amount < 0.98;
    contents.visible = amount > 0.03;
  }
  function render(now) {
    request = 0;
    if (disposed) return;
    const delta = Math.min((now - (last || now - 16)) / 1000, 0.05); last = now;
    const ease = reduced ? 1 : 1 - Math.exp(-delta * 12);
    yaw += (wantedYaw - yaw) * ease; pitch += (wantedPitch - pitch) * ease;
    const next = opened + (wantedOpen - opened) * ease;
    if (Math.abs(next - opened) > 0.00001) { opened = next; reshape(opened); }
    pivot.rotation.set(pitch, yaw, 0);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const distance = rect.width / rect.height < 0.8 ? 0.52 : 0.43;
    camera.position.set(0, 0.035 + opened * 0.24, distance);
    camera.lookAt(0, 0.005, 0);
    renderer.render(scene, camera);
    if (Math.abs(wantedYaw - yaw) + Math.abs(wantedPitch - pitch) + Math.abs(wantedOpen - opened) > 0.0001) wake();
  }
  function wake() { if (!request && !disposed) request = requestAnimationFrame(render); }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = rect.width / Math.max(1, rect.height); camera.updateProjectionMatrix(); wake();
  }
  function down(event) {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId); canvas.classList.add('agarrado');
  }
  function move(event) {
    if (!drag || event.pointerId !== drag.id) return;
    wantedYaw += (event.clientX - drag.x) * 0.012;
    wantedPitch = THREE.MathUtils.clamp(wantedPitch + (event.clientY - drag.y) * 0.006, -0.6, 0.6);
    drag.x = event.clientX; drag.y = event.clientY; wake();
  }
  function up() { drag = null; canvas.classList.remove('agarrado'); }
  function keyboard(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') wantedYaw -= 0.3;
    if (event.key === 'ArrowRight') wantedYaw += 0.3;
    if (event.key === 'ArrowUp') wantedPitch = Math.max(-0.6, wantedPitch - 0.15);
    if (event.key === 'ArrowDown') wantedPitch = Math.min(0.6, wantedPitch + 0.15);
    wake();
  }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up); canvas.addEventListener('keydown', keyboard);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  reshape(0); resize();
  return {
    front() { wantedYaw = Math.round(yaw / (Math.PI * 2)) * Math.PI * 2; wantedPitch = 0; wake(); },
    back() { wantedYaw = Math.round((yaw - Math.PI) / (Math.PI * 2)) * Math.PI * 2 + Math.PI; wantedPitch = 0; wake(); },
    open(value) { wantedOpen = value ? 1 : 0; wantedPitch = 0; wake(); },
    state: () => ({ yaw, pitch, opened }),
    dispose() {
      disposed = true; cancelAnimationFrame(request); observer.disconnect();
      for (const [type, handler] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up], ['keydown', keyboard]]) canvas.removeEventListener(type, handler);
      [source, bodyGeometry, sealGeometry, beansGeometry].forEach(g => g.dispose());
      [material, lining, beansMaterial].forEach(m => m.dispose()); texture.dispose();
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
