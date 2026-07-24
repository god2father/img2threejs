import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {
  createClearTumblerModel,
  updateLiquidSlosh,
  type GlassBuildStage,
} from './createGlassModel';
import { createCupTiltController } from './liquidSlosh';
import './style.css';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) throw new Error('Scene canvas was not found.');

const params = new URLSearchParams(window.location.search);
const validStages: GlassBuildStage[] = [
  'blockout',
  'structural-pass',
  'form-refinement',
  'material-pass',
  'surface-pass',
  'lighting-pass',
  'interaction-pass',
  'optimization-pass',
];
const requestedStage = params.get('stage') as GlassBuildStage | null;
const stage = requestedStage && validStages.includes(requestedStage)
  ? requestedStage
  : 'optimization-pass';
const reviewMode = params.get('review') === '1';
const darkReview = params.get('backdrop') === 'dark';
const liquidParam = params.get('liquid');
const parsedLiquidLevel = liquidParam === null ? Number.NaN : Number(liquidParam);
const liquidEnabled = liquidParam !== 'off' && liquidParam !== '0';
const liquidLevel = Number.isFinite(parsedLiquidLevel)
  ? THREE.MathUtils.clamp(parsedLiquidLevel, 0.08, 0.92)
  : 0.58;
document.body.classList.toggle('review-mode', reviewMode);

const stageBadge = document.querySelector<HTMLOutputElement>('#stage-badge');
if (stageBadge) stageBadge.value = stage.replace('-', ' ');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = stage === 'blockout' ? 1.0 : 1.32;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#020303');
scene.fog = new THREE.FogExp2('#020303', 0.035);

const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room, 0.04).texture;
room.dispose();
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(28, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 0.9, 5.7);
camera.lookAt(0, -0.12, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.enableRotate = false;
controls.minDistance = 3.3;
controls.maxDistance = 8;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.68;
controls.target.set(0, -0.12, 0);

RectAreaLightUniformsLib.init();
const useFullLighting = !['blockout', 'structural-pass', 'form-refinement'].includes(stage);

const key = new THREE.RectAreaLight('#f7fbff', useFullLighting ? 7 : 3.2, 2.2, 4.5);
key.position.set(-3.2, 3.2, 2.6);
key.lookAt(0, 0.1, 0);
scene.add(key);

const fill = new THREE.RectAreaLight('#d9efff', useFullLighting ? 4.2 : 2.1, 1.4, 3.8);
fill.position.set(3.1, 1.1, 2.1);
fill.lookAt(0, -0.1, 0);
scene.add(fill);

const rim = new THREE.RectAreaLight('#ffffff', useFullLighting ? 8.5 : 2.5, 1.1, 4.8);
rim.position.set(0.2, 2.5, -3.4);
rim.lookAt(0, 0.2, 0);
scene.add(rim);

const overhead = new THREE.RectAreaLight('#ffffff', useFullLighting ? 5.5 : 2.2, 3.6, 1.2);
overhead.position.set(0, 4.4, 0.2);
overhead.lookAt(0, 0, 0);
scene.add(overhead);

scene.add(new THREE.HemisphereLight('#b9d4df', '#050607', useFullLighting ? 0.85 : 1.4));

const model = createClearTumblerModel({
  stage,
  castShadow: true,
  liquid: liquidEnabled,
  liquidLevel,
});
model.rotation.y = -0.08;
model.scale.y = 0.93;
model.position.y = -0.055;
scene.add(model);
model.updateMatrixWorld(true);
const cupTiltController = createCupTiltController(canvas, model);

if (reviewMode && useFullLighting && !darkReview) {
  const checkerCanvas = document.createElement('canvas');
  checkerCanvas.width = 128;
  checkerCanvas.height = 128;
  const context = checkerCanvas.getContext('2d');
  if (context) {
    context.fillStyle = '#f2f2f2';
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#d7d7d7';
    context.fillRect(0, 0, 64, 64);
    context.fillRect(64, 64, 64, 64);
  }
  const checkerTexture = new THREE.CanvasTexture(checkerCanvas);
  checkerTexture.colorSpace = THREE.SRGBColorSpace;
  checkerTexture.wrapS = THREE.RepeatWrapping;
  checkerTexture.wrapT = THREE.RepeatWrapping;
  checkerTexture.repeat.set(24, 24);
  const reviewBackdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshBasicMaterial({ map: checkerTexture, fog: false }),
  );
  reviewBackdrop.name = 'material-review-checkerboard';
  reviewBackdrop.position.set(0, 0, -2.1);
  scene.add(reviewBackdrop);
}

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1.18, 128),
  new THREE.ShadowMaterial({ color: '#000000', transparent: true, opacity: 0.15 }),
);
ground.name = 'ground';
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.085;
ground.receiveShadow = true;
ground.visible = !(reviewMode && useFullLighting && !darkReview);
scene.add(ground);

const glow = new THREE.Mesh(
  new THREE.RingGeometry(0.38, 0.92, 128),
  new THREE.MeshBasicMaterial({ color: '#cdeeff', transparent: true, opacity: useFullLighting ? 0.055 : 0.025, side: THREE.DoubleSide, depthWrite: false }),
);
glow.rotation.x = -Math.PI / 2;
glow.position.y = -1.075;
scene.add(glow);

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);

let previousFrameTime = performance.now();
let smoothedFps = 60;

function animate(): void {
  const currentFrameTime = performance.now();
  const frameDuration = Math.max(1, currentFrameTime - previousFrameTime);
  const deltaSeconds = Math.min(frameDuration / 1000, 1 / 30);
  previousFrameTime = currentFrameTime;
  smoothedFps += (1000 / frameDuration - smoothedFps) * 0.08;
  cupTiltController.update(deltaSeconds);
  updateLiquidSlosh(model, deltaSeconds);
  controls.update();
  renderer.render(scene, camera);
  if (reviewMode) {
    renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls);
    renderer.domElement.dataset.triangles = String(renderer.info.render.triangles);
    renderer.domElement.dataset.fps = smoothedFps.toFixed(1);
    renderer.domElement.dataset.radialSegments = String(model.userData.optimization.radialSegments);
  }
}

window.addEventListener('beforeunload', () => cupTiltController.dispose());
renderer.setAnimationLoop(animate);
