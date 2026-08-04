import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createSpeakerBlockout } from './createSpeakerModel';
import { setupStoryDirector } from './storyDirector';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Scene canvas was not found.');
const sceneCanvas: HTMLCanvasElement = canvas;
const explodeButton = document.querySelector<HTMLButtonElement>('#explode-button');
const stageBadge = document.querySelector<HTMLOutputElement>('#stage-badge');
const reviewMode = new URLSearchParams(window.location.search).get('review') === '1';
document.body.classList.toggle('review-mode', reviewMode);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
function updateRendererQuality(exploreMode: boolean): void {
  const pixelRatioCap = reviewMode
    ? 2
    : exploreMode
      ? 1.75
      : window.innerWidth <= 700 ? 1.2 : 1.5;
  const nextPixelRatio = Math.min(window.devicePixelRatio, pixelRatioCap);
  if (Math.abs(renderer.getPixelRatio() - nextPixelRatio) > 0.01) {
    renderer.setPixelRatio(nextPixelRatio);
  }
}
updateRendererQuality(reviewMode);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(reviewMode ? '#e9e7e2' : '#0c1016');
const storyFog = new THREE.FogExp2('#0c1016', reviewMode ? 0 : 0.02);
scene.fog = storyFog;

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.06).texture;
scene.environmentIntensity = 1.12;
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
controls.enabled = false;

RectAreaLightUniformsLib.init();
const key = new THREE.RectAreaLight('#fff8eb', 9, 4.5, 4);
key.position.set(-4, 5, 4);
key.lookAt(0, 0, 0);
scene.add(key);
const fill = new THREE.RectAreaLight('#f4f7ff', 6.8, 4.5, 3.5);
fill.position.set(4, 2, 3);
fill.lookAt(0, 0, 0);
scene.add(fill);
const frontFill = new THREE.RectAreaLight('#fffdf6', 4.2, 5, 3);
frontFill.position.set(0, 1.2, 6);
frontFill.lookAt(0, 0, 0.2);
scene.add(frontFill);
const rim = new THREE.RectAreaLight('#ffffff', 4.2, 3, 3);
rim.position.set(1, 4, -4);
rim.lookAt(0, 0, 0);
const sideFill = new THREE.RectAreaLight('#edf3ff', 3.4, 2.5, 4);
sideFill.position.set(-5, 1.5, 0);
sideFill.lookAt(0, 0, 0);
const rearFill = new THREE.RectAreaLight('#fff7ec', 4.6, 5, 3.5);
rearFill.position.set(0, 2.2, -6);
rearFill.lookAt(0, 0.2, 0);

// Follow the orbit camera with broad fill and rim sources so the visible side
// stays readable without flattening the fixed product-lighting hierarchy.
const viewFill = new THREE.RectAreaLight('#fffdf8', 3.2, 7, 6);
const viewRim = new THREE.RectAreaLight('#eef4ff', 2.4, 5, 5);
const viewLightDirection = new THREE.Vector3();
const viewRimPosition = new THREE.Vector3();
const hemisphere = new THREE.HemisphereLight('#f7f9ff', '#8a8379', 2.05);
const ambient = new THREE.AmbientLight('#fffaf2', 0.28);
scene.add(
  rim,
  sideFill,
  rearFill,
  viewFill,
  viewRim,
  hemisphere,
  ambient,
);

const floorMaterial = new THREE.MeshStandardMaterial({ color: reviewMode ? '#e1ded7' : '#0c0f13', roughness: 0.96, metalness: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.2;
floor.receiveShadow = true;
scene.add(floor);

const model = createSpeakerBlockout();
model.rotation.y = reviewMode ? 0 : 0.1;
scene.add(model);

// A restrained, abstract living-room set gives the scroll chapters a place to unfold
// without competing with the product or pretending to be a literal human performance.
const storySet = new THREE.Group();
storySet.name = 'Story living room';
const storyRoomMaterials: THREE.Material[] = [];
function roomMaterial(color: string, roughness = 0.92): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, transparent: true });
  storyRoomMaterials.push(material);
  return material;
}
const wallMaterial = roomMaterial('#151a20', 1);
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(34, 18), wallMaterial);
backWall.name = 'Living room wall';
backWall.position.set(0, 4.2, -5.7);
backWall.receiveShadow = true;
storySet.add(backWall);

const windowGroup = new THREE.Group();
windowGroup.position.set(-7.2, 2.45, -5.56);
const windowMaterial = new THREE.MeshBasicMaterial({ color: '#9eb1c8', transparent: true, opacity: 0.07, depthWrite: false });
const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 6.4), windowMaterial);
const frameMaterial = roomMaterial('#080b0f', 0.76);
const windowVertical = new THREE.Mesh(new THREE.BoxGeometry(0.08, 6.5, 0.08), frameMaterial);
const windowHorizontal = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.08, 0.08), frameMaterial);
windowGroup.add(windowPane, windowVertical, windowHorizontal);
const cityPositions: number[] = [];
for (let index = 0; index < 46; index += 1) {
  const x = ((index * 37) % 97) / 97 * 5.1 - 2.55;
  const y = ((index * 61) % 89) / 89 * 5.8 - 2.9;
  cityPositions.push(x, y, 0.06);
}
const cityGeometry = new THREE.BufferGeometry();
cityGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cityPositions, 3));
const cityMaterial = new THREE.PointsMaterial({ color: '#d5b47b', size: 0.035, transparent: true, opacity: 0.34, depthWrite: false });
const cityLights = new THREE.Points(cityGeometry, cityMaterial);
windowGroup.add(cityLights);
storySet.add(windowGroup);

const sofaMaterial = roomMaterial('#17181b', 0.98);
const sofa = new THREE.Group();
sofa.name = 'Abstract sofa silhouette';
const sofaSeat = new THREE.Mesh(new RoundedBoxGeometry(5.6, 0.72, 2.25, 5, 0.18), sofaMaterial);
sofaSeat.position.set(-4.9, -1.45, -1.75);
const sofaBack = new THREE.Mesh(new RoundedBoxGeometry(5.6, 2.35, 0.58, 5, 0.2), sofaMaterial);
sofaBack.position.set(-4.9, -0.25, -2.56);
const sofaArm = new THREE.Mesh(new RoundedBoxGeometry(0.58, 1.45, 2.25, 5, 0.18), sofaMaterial);
sofaArm.position.set(-2.3, -0.93, -1.74);
sofa.add(sofaSeat, sofaBack, sofaArm);
storySet.add(sofa);

const figureMaterial = new THREE.MeshStandardMaterial({
  color: '#07090b',
  roughness: 0.98,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const figure = new THREE.Group();
figure.name = 'Resting figure abstraction';
const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), figureMaterial);
head.position.set(-5.38, 1.04, -1.62);
function figureStroke(points: THREE.Vector3[], radius: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, radius, 8, false), figureMaterial);
}
const spine = figureStroke([
  new THREE.Vector3(-5.32, 0.74, -1.66),
  new THREE.Vector3(-5.12, 0.18, -1.61),
  new THREE.Vector3(-4.72, -0.52, -1.5),
], 0.18);
const legs = figureStroke([
  new THREE.Vector3(-4.72, -0.5, -1.5),
  new THREE.Vector3(-3.95, -0.72, -1.12),
  new THREE.Vector3(-3.35, -1.48, -0.78),
], 0.16);
const arm = figureStroke([
  new THREE.Vector3(-5.18, 0.42, -1.42),
  new THREE.Vector3(-4.62, 0.03, -1.04),
  new THREE.Vector3(-4.18, -0.2, -0.86),
], 0.1);
figure.add(head, spine, legs, arm);
storySet.add(figure);

const roomGlow = new THREE.PointLight('#df9f56', 0, 12, 2);
roomGlow.position.set(-3.2, 3.6, 1.6);
storySet.add(roomGlow);
scene.add(storySet);

const pulseGroup = new THREE.Group();
pulseGroup.name = 'Visual bass pulse';
const pulseRings = Array.from({ length: 4 }, (_, index) => {
  const material = new THREE.MeshBasicMaterial({
    color: index % 2 ? '#d0a15f' : '#f1d6a2',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.012, 8, 96), material);
  ring.position.set(0, -0.08, 2.15);
  ring.scale.set(1.26, 0.78, 1);
  pulseGroup.add(ring);
  return { ring, material };
});
scene.add(pulseGroup);

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
  'rear-io-plate': new THREE.Vector3(7, -1.3, -2.8),
};
const partButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-part-id]'));
const selectablePartNodes = new Map<THREE.Object3D, PartId>();
if (runtime) partIds.forEach((id) => {
  const node = runtime.nodes[id];
  if (node) selectablePartNodes.set(node, id);
});
const partRenderables = new Map<THREE.Object3D, PartId>();
const originalRenderableVisibility = new Map<THREE.Object3D, boolean>();
model.traverse((object) => {
  if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points)) return;
  let ancestor: THREE.Object3D | null = object;
  while (ancestor && ancestor !== model) {
    const owner = selectablePartNodes.get(ancestor);
    if (owner) {
      partRenderables.set(object, owner);
      originalRenderableVisibility.set(object, object.visible);
      return;
    }
    ancestor = ancestor.parent;
  }
});
let powerOn = false;
function setPowerState(powered: boolean): void {
  powerOn = powered;
  runtime?.powerToggle.setPowered(powered);
}
function isPowerToggle(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current && current !== model) {
    if (current === runtime?.powerToggle.node) return true;
    current = current.parent;
  }
  return false;
}
const homePositions = new Map<string, THREE.Vector3>();
if (runtime) Object.entries(explodeOffsets).forEach(([id]) => {
  const node = runtime.nodes[id];
  if (node) homePositions.set(id, node.position.clone());
});
let exploded = new URLSearchParams(window.location.search).get('explode') === '1';
let framingAmount = 1;
let selectedPart: PartId | undefined;
const focusedCamera = new THREE.Vector3();
const focusedTarget = new THREE.Vector3();
const focusBounds = new THREE.Box3();
const focusSize = new THREE.Vector3();
const focusViewDirection = new THREE.Vector3();
const focusScreenRight = new THREE.Vector3();
const focusViewDirections: Record<PartId, THREE.Vector3> = {
  grille: new THREE.Vector3(0.24, 0.16, 1),
  'driver-baffle': new THREE.Vector3(0.24, 0.16, 1),
  'acoustic-chamber': new THREE.Vector3(0.42, 0.26, 1),
  'amplifier-board': new THREE.Vector3(0.3, 0.82, 0.72),
  'top-control-deck': new THREE.Vector3(0.32, 0.88, 0.58),
  'rear-panel': new THREE.Vector3(-0.22, 0.16, -1),
  'rear-io-plate': new THREE.Vector3(-0.18, 0.12, -1),
  'isolation-feet': new THREE.Vector3(0.3, -0.22, 1),
};

function updateExplodedPresentation(next: boolean): void {
  exploded = next;
  framingAmount = 1;
  explodeButton?.setAttribute('aria-pressed', String(next));
  if (explodeButton) explodeButton.querySelector('span')!.textContent = next ? 'REASSEMBLE' : 'EXPLODE VIEW';
  if (stageBadge) stageBadge.value = next ? 'EXPLODED · 8 COMPONENTS' : 'ASSEMBLED · 8 COMPONENTS';
}

function setSelectedPart(id: PartId | undefined): void {
  const nextSelectedPart = selectedPart === id ? undefined : id;
  selectedPart = nextSelectedPart;
  partButtons.forEach((button) => {
    const selected = button.dataset.partId === selectedPart;
    button.setAttribute('aria-pressed', String(selected));
  });
  for (const [renderable, owner] of partRenderables) {
    const originallyVisible = originalRenderableVisibility.get(renderable) ?? true;
    renderable.visible = originallyVisible && (!selectedPart || owner === selectedPart);
  }

  if (!selectedPart || !runtime) {
    controls.minDistance = 6;
    framingAmount = 1;
    if (stageBadge) stageBadge.value = exploded ? 'EXPLODED · 8 COMPONENTS' : 'ASSEMBLED · 8 COMPONENTS';
    return;
  }

  updateExplodedPresentation(false);
  for (const [partId, home] of homePositions) {
    runtime.nodes[partId]?.position.copy(home);
  }
  model.updateMatrixWorld(true);
  focusBounds.makeEmpty();
  for (const [renderable, owner] of partRenderables) {
    if (owner === selectedPart && (originalRenderableVisibility.get(renderable) ?? true)) {
      focusBounds.expandByObject(renderable, true);
    }
  }
  if (focusBounds.isEmpty()) return;
  focusBounds.getCenter(focusedTarget);
  focusBounds.getSize(focusSize);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const largePanelPart = selectedPart === 'grille'
    || selectedPart === 'driver-baffle'
    || selectedPart === 'acoustic-chamber'
    || selectedPart === 'rear-panel';
  const focusWidthFraction = largePanelPart ? 0.45 : 0.62;
  // Reserve the left and right columns for the copy and component controls.
  // The focused object stays large without colliding with either UI region.
  const heightDistance = focusSize.y / (2 * Math.tan(verticalFov / 2) * 0.62);
  const widthDistance = focusSize.x / (2 * Math.tan(verticalFov / 2) * camera.aspect * focusWidthFraction);
  const focusDistance = THREE.MathUtils.clamp(
    Math.max(heightDistance, widthDistance) * 1.08 + focusSize.z * 0.7,
    1.8,
    28,
  );
  // Present each part from its useful service side. Rear modules otherwise show
  // only their blank inner shell when focus is entered from the default front view.
  focusViewDirection.copy(focusViewDirections[selectedPart]).normalize();
  focusedCamera.copy(focusedTarget).addScaledVector(focusViewDirection, focusDistance);
  if (window.innerWidth >= 900) {
    focusScreenRight.crossVectors(camera.up, focusViewDirection).normalize();
    const horizontalPresentationOffset = focusDistance * 0.035;
    focusedTarget.addScaledVector(focusScreenRight, -horizontalPresentationOffset);
    focusedCamera.addScaledVector(focusScreenRight, -horizontalPresentationOffset);
  }
  controls.minDistance = Math.max(1.2, focusDistance * 0.45);
  framingAmount = 1;
  const selectedButton = partButtons.find((button) => button.dataset.partId === selectedPart);
  const selectedLabel = selectedButton?.textContent?.replace(/^\s*\d+\s*/, '').trim().toUpperCase() ?? selectedPart.toUpperCase();
  if (stageBadge) stageBadge.value = `FOCUS · ${selectedLabel}`;
}

function setExploded(next: boolean): void {
  if (selectedPart) setSelectedPart(undefined);
  updateExplodedPresentation(next);
}

updateExplodedPresentation(exploded);
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
      setPowerState(!powerOn);
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

let exploring = reviewMode;
let exploreBlend = reviewMode ? 1 : 0;
const storyTarget = controls.target;
const storyState = setupStoryDirector({
  camera,
  target: storyTarget,
  model,
  figure,
  assembledCamera,
  assembledTarget,
  reviewMode,
  setPower: setPowerState,
  setExploring: (next) => {
    exploring = next;
    controls.enabled = next && !reviewMode;
    updateRendererQuality(next);
    if (next) {
      framingAmount = 1;
      controls.minDistance = 6;
    }
  },
});

function resize(): void {
  updateRendererQuality(exploring);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

const positionTarget = new THREE.Vector3();
const clock = new THREE.Clock();
const sceneColor = scene.background as THREE.Color;
const coldBackground = new THREE.Color('#0c1016');
const warmBackground = new THREE.Color('#302820');
const exploreBackground = new THREE.Color('#e9e7e2');
const coldFloor = new THREE.Color('#0a0d11');
const warmFloor = new THREE.Color('#3b3027');
const exploreFloor = new THREE.Color('#dfdcd5');
const coldWall = new THREE.Color('#151a20');
const warmWall = new THREE.Color('#4b392b');
const colorScratch = new THREE.Color();
const grillePulseNode = runtime?.nodes.grille;
const grilleBaseScale = grillePulseNode?.scale.clone();
let lastRoomOpenCss = '';
let lastCameraFov = camera.fov;
renderer.setAnimationLoop(() => {
  if (runtime) Object.entries(explodeOffsets).forEach(([id, offset]) => {
    const node = runtime.nodes[id];
    const home = homePositions.get(id);
    if (!node || !home) return;
    positionTarget.copy(home).addScaledVector(offset, exploded && exploring ? 1 : 0);
    node.position.lerp(positionTarget, 0.11);
    if (node.position.distanceToSquared(positionTarget) < 0.000001) {
      node.position.copy(positionTarget);
    }
  });
  if (exploring && !reviewMode) model.rotation.y = THREE.MathUtils.lerp(model.rotation.y, 0.1, 0.075);
  if (exploring && !reviewMode && framingAmount > 0.001) {
    camera.position.lerp(selectedPart ? focusedCamera : exploded ? explodedCamera : assembledCamera, 0.085);
    controls.target.lerp(selectedPart ? focusedTarget : exploded ? explodedTarget : assembledTarget, 0.085);
    framingAmount *= 0.9;
  }

  exploreBlend = THREE.MathUtils.lerp(exploreBlend, exploring ? 1 : 0, 0.075);
  colorScratch.lerpColors(coldBackground, warmBackground, storyState.warm).lerp(exploreBackground, exploreBlend);
  sceneColor.copy(colorScratch);
  storyFog.color.copy(sceneColor);
  storyFog.density = (0.006 + storyState.depth * 0.016) * (1 - exploreBlend);
  colorScratch.lerpColors(coldFloor, warmFloor, storyState.warm).lerp(exploreFloor, exploreBlend);
  floorMaterial.color.copy(colorScratch);
  wallMaterial.color.lerpColors(coldWall, warmWall, storyState.warm);
  const roomVisibility = 1 - exploreBlend;
  storySet.visible = roomVisibility > 0.008 && !reviewMode;
  storyRoomMaterials.forEach((material) => {
    material.opacity = roomVisibility;
  });
  windowMaterial.opacity = (0.045 + storyState.roomOpen * 0.11) * roomVisibility;
  cityMaterial.opacity = (0.2 + storyState.roomOpen * 0.5) * roomVisibility;
  figureMaterial.opacity = storyState.figureOpacity * 0.62 * roomVisibility;
  roomGlow.intensity = storyState.warm * storyState.roomOpen * 13 * roomVisibility;
  const roomOpenCss = storyState.roomOpen.toFixed(2);
  if (roomOpenCss !== lastRoomOpenCss) {
    lastRoomOpenCss = roomOpenCss;
    document.documentElement.style.setProperty('--room-open', roomOpenCss);
  }

  const storyKey = 1.25 + storyState.warm * 5.7 + storyState.music * 0.65;
  key.intensity = THREE.MathUtils.lerp(storyKey, 9, exploreBlend);
  fill.intensity = THREE.MathUtils.lerp(0.9 + storyState.warm * 3.8, 6.8, exploreBlend);
  frontFill.intensity = THREE.MathUtils.lerp(0.65 + storyState.music * 2.7, 4.2, exploreBlend);
  rim.intensity = THREE.MathUtils.lerp(0.8 + storyState.warm * 2.5, 4.2, exploreBlend);
  sideFill.intensity = THREE.MathUtils.lerp(0.45 + storyState.roomOpen * 2.1, 3.4, exploreBlend);
  rearFill.intensity = THREE.MathUtils.lerp(0.55 + storyState.warm * 2.9, 4.6, exploreBlend);
  hemisphere.intensity = THREE.MathUtils.lerp(0.42 + storyState.warm * 0.75, 2.05, exploreBlend);
  ambient.intensity = THREE.MathUtils.lerp(0.08 + storyState.warm * 0.1, 0.28, exploreBlend);
  viewFill.intensity = THREE.MathUtils.lerp(0.55 + storyState.warm * 1.35, 3.2, exploreBlend);
  viewRim.intensity = THREE.MathUtils.lerp(0.42 + storyState.roomOpen * 1.15, 2.4, exploreBlend);
  scene.environmentIntensity = THREE.MathUtils.lerp(0.38 + storyState.warm * 0.34, 1.12, exploreBlend);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(0.76 + storyState.warm * 0.16, 1.08, exploreBlend);

  const elapsed = clock.getElapsedTime();
  pulseGroup.visible = storyState.music > 0.015 && roomVisibility > 0.008;
  pulseRings.forEach(({ ring, material }, index) => {
    const phase = (elapsed * 0.2 + index / pulseRings.length) % 1;
    const expansion = 1 + phase * 1.65;
    ring.scale.set(1.26 * expansion, 0.78 * expansion, 1);
    ring.position.z = 2.15 + phase * 0.72;
    material.opacity = (1 - phase) ** 2 * storyState.music * roomVisibility * 0.2;
  });
  if (grillePulseNode && grilleBaseScale) {
    const response = exploring ? 0 : Math.sin(elapsed * 4.2) * storyState.music * 0.004;
    grillePulseNode.scale.set(grilleBaseScale.x, grilleBaseScale.y, grilleBaseScale.z * (1 + response));
  }

  if (Math.abs(camera.fov - lastCameraFov) > 0.001) {
    camera.updateProjectionMatrix();
    lastCameraFov = camera.fov;
  }
  if (exploring) controls.update();
  else camera.lookAt(storyTarget);
  viewLightDirection.subVectors(camera.position, controls.target).normalize();
  viewFill.position.copy(camera.position);
  viewFill.lookAt(controls.target);
  viewRimPosition.copy(controls.target).addScaledVector(viewLightDirection, -8);
  viewRimPosition.y += 2.8;
  viewRim.position.copy(viewRimPosition);
  viewRim.lookAt(controls.target);
  renderer.render(scene, camera);
});
