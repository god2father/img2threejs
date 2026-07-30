import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { createSpeakerBlockout } from './createSpeakerModel';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Scene canvas was not found.');
const sceneCanvas: HTMLCanvasElement = canvas;
const explodeButton = document.querySelector<HTMLButtonElement>('#explode-button');
const stageBadge = document.querySelector<HTMLOutputElement>('#stage-badge');
const reviewMode = new URLSearchParams(window.location.search).get('review') === '1';
document.body.classList.toggle('review-mode', reviewMode);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e9e7e2');

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.06).texture;
room.dispose();
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.1, 100);
if (reviewMode) camera.position.set(0, 0.2, 8.4);
else camera.position.set(5.8, 3.8, 17.2);
const assembledCamera = new THREE.Vector3(5.8, 3.8, 17.2);
// Mirrors the supplied exploded reference: a slightly elevated front-right product view
// with a moderate product lens, visible right cabinet side, and front layers expanding down-left.
const explodedCamera = new THREE.Vector3(23, 9, 34);
const assembledTarget = new THREE.Vector3(0, 0.2, 0);
const explodedTarget = new THREE.Vector3(1, 0.45, 0);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.enableRotate = true;
controls.enableZoom = true;
controls.minDistance = 6;
controls.maxDistance = 55;
controls.minPolarAngle = Math.PI * 0.24;
controls.maxPolarAngle = Math.PI * 0.62;
controls.enabled = !reviewMode;

RectAreaLightUniformsLib.init();
const key = new THREE.RectAreaLight('#fff8eb', 8, 4.5, 4);
key.position.set(-4, 5, 4);
key.lookAt(0, 0, 0);
scene.add(key);
const fill = new THREE.RectAreaLight('#f4f7ff', 5.5, 4.5, 3.5);
fill.position.set(4, 2, 3);
fill.lookAt(0, 0, 0);
scene.add(fill);
const frontFill = new THREE.RectAreaLight('#fffdf6', 3.2, 5, 3);
frontFill.position.set(0, 1.2, 6);
frontFill.lookAt(0, 0, 0.2);
scene.add(frontFill);
const rim = new THREE.RectAreaLight('#ffffff', 3.4, 3, 3);
rim.position.set(1, 4, -4);
rim.lookAt(0, 0, 0);
const sideFill = new THREE.RectAreaLight('#edf3ff', 2.4, 2.5, 4);
sideFill.position.set(-5, 1.5, 0);
sideFill.lookAt(0, 0, 0);
scene.add(rim, sideFill, new THREE.HemisphereLight('#edf3ff', '#5b554d', 1.55));

const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: '#1f1c18', opacity: 0.16 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.2;
floor.receiveShadow = true;
scene.add(floor);

const model = createSpeakerBlockout();
model.rotation.y = reviewMode ? 0 : 0.1;
scene.add(model);

const runtime = model.userData.sculptRuntime as ReturnType<typeof createSpeakerBlockout>['userData']['sculptRuntime'] | undefined;
const partIds = [
  'grille', 'driver-baffle', 'acoustic-chamber', 'amplifier-board',
  'top-control-deck', 'rear-panel', 'rear-io-plate', 'isolation-feet',
] as const;
type PartId = typeof partIds[number];
const explodeOffsets: Record<PartId, THREE.Vector3> = {
  // Keep the physical separation on the speaker's depth axis, matching the reference.
  // The reference camera projects this front-to-back stack toward the lower-left.
  'acoustic-chamber': new THREE.Vector3(1.2, 0, -0.2),
  grille: new THREE.Vector3(-6.2, -0.4, 4.5),
  'driver-baffle': new THREE.Vector3(-1.7, -0.05, 1.3),
  'top-control-deck': new THREE.Vector3(-0.8, 3.2, 0.2),
  'amplifier-board': new THREE.Vector3(-0.8, 2.6, 0.4),
  'isolation-feet': new THREE.Vector3(1.8, -1.4, 1.4),
  'rear-panel': new THREE.Vector3(2.6, 0.55, -1.35),
  'rear-io-plate': new THREE.Vector3(4.7, 1.05, -2.7),
};
const partButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-part-id]'));
const selectablePartNodes = new Map<THREE.Object3D, PartId>();
if (runtime) partIds.forEach((id) => {
  const node = runtime.nodes[id];
  if (node) selectablePartNodes.set(node, id);
});
let powerOn = false;
function isPowerToggle(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current && current !== model) {
    if (current === runtime?.powerToggle.node) return true;
    current = current.parent;
  }
  return false;
}
function setSelectedPart(id: PartId | undefined): void {
  partButtons.forEach((button) => {
    const selected = button.dataset.partId === id;
    button.setAttribute('aria-pressed', String(selected));
  });
}
const homePositions = new Map<string, THREE.Vector3>();
if (runtime) Object.entries(explodeOffsets).forEach(([id]) => {
  const node = runtime.nodes[id];
  if (node) homePositions.set(id, node.position.clone());
});
let exploded = new URLSearchParams(window.location.search).get('explode') === '1';
let framingAmount = 1;
function setExploded(next: boolean): void {
  exploded = next;
  framingAmount = 1;
  explodeButton?.setAttribute('aria-pressed', String(next));
  if (explodeButton) explodeButton.querySelector('span')!.textContent = next ? 'REASSEMBLE' : 'EXPLODE VIEW';
  if (stageBadge) stageBadge.value = next ? 'EXPLODED · 8 COMPONENTS' : 'ASSEMBLED · 8 COMPONENTS';
}
setExploded(exploded);
explodeButton?.addEventListener('click', () => setExploded(!exploded));
partButtons.forEach((button) => button.addEventListener('click', () => {
  const id = button.dataset.partId as PartId | undefined;
  if (!id || !partIds.includes(id)) return;
  setSelectedPart(id);
}));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerDown = new THREE.Vector2();
function selectPartAt(clientX: number, clientY: number): void {
  const rect = sceneCanvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  for (const hit of raycaster.intersectObject(model, true)) {
    if (isPowerToggle(hit.object)) {
      powerOn = !powerOn;
      runtime?.powerToggle.setPowered(powerOn);
      return;
    }
    let object: THREE.Object3D | null = hit.object;
    while (object && object !== model) {
      const id = selectablePartNodes.get(object);
      if (id) {
        setSelectedPart(id);
        return;
      }
      object = object.parent;
    }
  }
}
sceneCanvas.addEventListener('pointerdown', (event) => pointerDown.set(event.clientX, event.clientY));
sceneCanvas.addEventListener('pointerup', (event) => {
  if (pointerDown.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
  selectPartAt(event.clientX, event.clientY);
});
sceneCanvas.addEventListener('click', (event) => {
  selectPartAt(event.clientX, event.clientY);
});

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const positionTarget = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  if (runtime) Object.entries(explodeOffsets).forEach(([id, offset]) => {
    const node = runtime.nodes[id];
    const home = homePositions.get(id);
    if (!node || !home) return;
    positionTarget.copy(home).addScaledVector(offset, exploded ? 1 : 0);
    node.position.lerp(positionTarget, 0.11);
    if (node.position.distanceToSquared(positionTarget) < 0.000001) {
      node.position.copy(positionTarget);
    }
  });
  if (!reviewMode) model.rotation.y = THREE.MathUtils.lerp(model.rotation.y, 0.1, 0.075);
  if (!reviewMode && framingAmount > 0.001) {
    camera.position.lerp(exploded ? explodedCamera : assembledCamera, 0.085);
    controls.target.lerp(exploded ? explodedTarget : assembledTarget, 0.085);
    framingAmount *= 0.9;
  }
  controls.update();
  renderer.render(scene, camera);
});
