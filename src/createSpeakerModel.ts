import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export type SpeakerRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, THREE.Box3>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type PartOptions = { detachable?: boolean; explodeGroup?: string };

function makeBadgeMaterial(fill = '#e4c17b', stroke = '#3b2b12'): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return new THREE.MeshStandardMaterial({ color: '#d6b36f', metalness: 0.82, roughness: 0.34 });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = "italic 700 108px 'Brush Script MT', 'Snell Roundhand', cursive";
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 5;
  context.strokeStyle = stroke;
  context.strokeText('NOIR', 256, 68);
  context.fillStyle = fill;
  context.fillText('NOIR', 256, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map: texture,
    color: '#ffffff',
    metalness: 0.82,
    roughness: 0.34,
    transparent: true,
    depthWrite: false,
  });
}

export function createSpeakerBlockout(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'NOIR S1 Modular Speaker';

  const nodes: SpeakerRuntime['nodes'] = {};
  const meshes: SpeakerRuntime['meshes'] = {};
  const sockets: SpeakerRuntime['sockets'] = {};
  const colliders: SpeakerRuntime['colliders'] = {};
  const destructionGroups: SpeakerRuntime['destructionGroups'] = {};

  const textureLoader = new THREE.TextureLoader();
  const grilleReferenceTexture = textureLoader.load('/materials/grille-cloth/generated-woven-grille-albedo.png');
  grilleReferenceTexture.colorSpace = THREE.SRGBColorSpace;
  grilleReferenceTexture.wrapS = THREE.ClampToEdgeWrapping;
  grilleReferenceTexture.wrapT = THREE.ClampToEdgeWrapping;
  grilleReferenceTexture.minFilter = THREE.LinearMipmapLinearFilter;
  function proceduralAlbedo(kind: string, base: string, repeat: THREE.Vector2Tuple): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);
    context.fillStyle = base;
    context.fillRect(0, 0, 512, 512);
    let seed = 173;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    if (kind === 'vinyl-leather' || kind === 'matte-black' || kind === 'rubber') {
      for (let index = 0; index < 4200; index += 1) {
        const shade = 30 + Math.floor(random() * 45);
        context.fillStyle = `rgba(${shade},${shade},${shade},${kind === 'rubber' ? 0.12 : 0.2})`;
        const x = random() * 512;
        const y = random() * 512;
        context.fillRect(x, y, 1 + random() * 2, 1 + random() * 2);
      }
    } else if (kind === 'grille-cloth') {
      context.fillStyle = '#211c14';
      context.fillRect(0, 0, 512, 512);
      for (let index = 0; index < 96; index += 1) {
        const offset = index * 6;
        context.fillStyle = index % 2 ? '#a78d58' : '#7f683e';
        context.fillRect(offset, 0, 2, 512);
        context.fillRect(0, offset, 512, 2);
      }
    } else if (kind === 'brushed-brass') {
      for (let index = 0; index < 760; index += 1) {
        const shade = 100 + Math.floor(random() * 95);
        context.fillStyle = `rgba(${shade + 35},${shade},${Math.max(20, shade - 45)},${0.16 + random() * 0.2})`;
        context.fillRect(0, random() * 512, 512, 1 + random() * 2);
      }
    } else if (kind === 'mdf-wood') {
      for (let index = 0; index < 420; index += 1) {
        context.strokeStyle = `rgba(55,30,12,${0.08 + random() * 0.18})`;
        context.lineWidth = 1 + random() * 2;
        context.beginPath();
        context.moveTo(0, random() * 512);
        context.bezierCurveTo(160, random() * 512, 320, random() * 512, 512, random() * 512);
        context.stroke();
      }
    } else if (kind === 'pcb') {
      context.strokeStyle = '#6b9265';
      context.lineWidth = 2;
      for (let index = 0; index < 72; index += 1) {
        const y = random() * 512;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(160 + random() * 200, y);
        context.lineTo(250 + random() * 140, y + (random() - 0.5) * 80);
        context.stroke();
      }
    } else {
      for (let index = 0; index < 1200; index += 1) {
        const shade = 45 + Math.floor(random() * 45);
        context.fillStyle = `rgba(${shade},${shade},${shade},0.16)`;
        context.fillRect(random() * 512, random() * 512, 2, 2);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    return texture;
  }
  function materialTexture(
    folder: string,
    suffix: string,
    repeat: THREE.Vector2Tuple,
    color = false,
    revision = '',
    onLoad?: () => void,
  ): THREE.Texture {
    const revisionQuery = revision ? `?v=${revision}` : '';
    const texture = textureLoader.load(`/materials/${folder}/${folder}_${suffix}.png${revisionQuery}`, () => {
      texture.needsUpdate = true;
      onLoad?.();
    });
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }
  function proceduralScalar(kind: string, mode: 'roughness' | 'normal' | 'ao', repeat: THREE.Vector2Tuple): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);
    let seed = mode === 'normal' ? 401 : 719;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const roughness = kind === 'brushed-brass' ? 82 : kind === 'rubber' ? 222 : kind === 'grille-cloth' ? 196 : kind === 'driver-composite' ? 162 : 178;
    context.fillStyle = mode === 'normal' ? '#8080ff' : `rgb(${mode === 'ao' ? 224 : roughness},${mode === 'ao' ? 224 : roughness},${mode === 'ao' ? 224 : roughness})`;
    context.fillRect(0, 0, 512, 512);
    for (let index = 0; index < 2600; index += 1) {
      const delta = Math.floor((random() - 0.5) * (mode === 'normal' ? 8 : 38));
      if (mode === 'normal') context.fillStyle = `rgb(${128 + delta},${128 - delta},255)`;
      else {
        const value = Math.max(0, Math.min(255, (mode === 'ao' ? 224 : roughness) + delta));
        context.fillStyle = `rgb(${value},${value},${value})`;
      }
      context.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1 + random() * 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    return texture;
  }
  function metalGrilleAlphaMap(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#fff';
    context.lineCap = 'round';
    for (const direction of [-1, 1] as const) {
      context.lineWidth = direction === -1 ? 3.5 : 2.5;
      for (let offset = -canvas.height; offset < canvas.width + canvas.height; offset += 13) {
        context.beginPath();
        context.moveTo(offset, direction === -1 ? canvas.height : 0);
        context.lineTo(offset + canvas.height, direction === -1 ? 0 : canvas.height);
        context.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
  }
  function wovenMetalResponseMaps(): { normal: THREE.CanvasTexture; roughness: THREE.CanvasTexture } {
    const width = 720;
    const height = 405;
    const normalCanvas = document.createElement('canvas');
    const roughnessCanvas = document.createElement('canvas');
    normalCanvas.width = roughnessCanvas.width = width;
    normalCanvas.height = roughnessCanvas.height = height;
    const normalContext = normalCanvas.getContext('2d');
    const roughnessContext = roughnessCanvas.getContext('2d');
    if (!normalContext || !roughnessContext) {
      return { normal: new THREE.CanvasTexture(normalCanvas), roughness: new THREE.CanvasTexture(roughnessCanvas) };
    }
    // Raised capsule-like knots repeat in offset rows. This adds directional micro relief
    // without any baked lettering, so the weave breaks highlights at the same scale as albedo.
    const weaveHeight = (x: number, y: number): number => {
      const pitchX = 8.4;
      const pitchY = 6.2;
      const row = Math.floor(y / pitchY);
      const localX = ((((x + (row & 1 ? pitchX * 0.5 : 0)) % pitchX) + pitchX) % pitchX) - pitchX * 0.5;
      const localY = ((y % pitchY) + pitchY) % pitchY - pitchY * 0.5;
      const horizontalWire = Math.exp(-((localY / (pitchY * 0.18)) ** 2)) * 0.6;
      const crossingKnot = Math.exp(-((localX / (pitchX * 0.28)) ** 2 + (localY / (pitchY * 0.32)) ** 2)) * 0.58;
      return Math.min(1, horizontalWire + crossingKnot);
    };
    const normalPixels = normalContext.createImageData(width, height);
    const roughnessPixels = roughnessContext.createImageData(width, height);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const left = weaveHeight(x - 1, y);
      const right = weaveHeight(x + 1, y);
      const above = weaveHeight(x, y - 1);
      const below = weaveHeight(x, y + 1);
      const nx = (left - right) * 1.4;
      const ny = (above - below) * 1.4;
      const inverseLength = 1 / Math.hypot(nx, ny, 1);
      const index = (y * width + x) * 4;
      normalPixels.data[index] = Math.round((nx * inverseLength * 0.5 + 0.5) * 255);
      normalPixels.data[index + 1] = Math.round((ny * inverseLength * 0.5 + 0.5) * 255);
      normalPixels.data[index + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
      normalPixels.data[index + 3] = 255;
      const microRoughness = Math.round((0.9 - weaveHeight(x, y) * 0.42) * 255);
      roughnessPixels.data[index] = microRoughness;
      roughnessPixels.data[index + 1] = microRoughness;
      roughnessPixels.data[index + 2] = microRoughness;
      roughnessPixels.data[index + 3] = 255;
    }
    normalContext.putImageData(normalPixels, 0, 0);
    roughnessContext.putImageData(roughnessPixels, 0, 0);
    const normal = new THREE.CanvasTexture(normalCanvas);
    const roughness = new THREE.CanvasTexture(roughnessCanvas);
    normal.colorSpace = THREE.NoColorSpace;
    roughness.colorSpace = THREE.NoColorSpace;
    return { normal, roughness };
  }
  function proceduralMetalnessMap(folder: string, repeat: THREE.Vector2Tuple, metalness: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);
    const base = Math.round(178 + metalness * 74);
    context.fillStyle = `rgb(${base},${base},${base})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (folder === 'brushed-brass') {
      for (let y = 0; y < canvas.height; y += 5) {
        const variation = 12 + ((y * 17) % 21);
        const value = Math.max(0, Math.min(255, base - variation));
        context.fillStyle = `rgb(${value},${value},${value})`;
        context.fillRect(0, y, canvas.width, 1);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(...repeat);
    return texture;
  }
  function referenceMaterial(folder: string, color: string, repeat: THREE.Vector2Tuple, metalness: number, roughness: number, normalScale: number): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness,
      roughness,
      normalScale: new THREE.Vector2(normalScale * 0.12, normalScale * 0.12),
    });
    material.userData.pbrChannels = {
      albedo: `/materials/${folder}/${folder}_albedo.png`,
      roughness: `/materials/${folder}/${folder}_roughness.png`,
      normal: `/materials/${folder}/${folder}_normal.png`,
      ambientOcclusion: `/materials/${folder}/${folder}_ao.png`,
      metalness: 'independent procedural scalar map',
      visualState: 'deferred pending reference-calibrated PBR pass; clean scalar preview is active',
    };
    return material;
  }
  const vinyl = referenceMaterial('vinyl-leather', '#090a0a', [2.2, 1.4], 0.03, 0.72, 0.3);
  const vinylEdge = referenceMaterial('matte-black', '#050606', [2.4, 1.8], 0.06, 0.64, 0.2);
  let refreshCabinetLeatherPbr = () => undefined;
  const cabinetLeatherAlbedo = materialTexture('cabinet-tolex-real', 'albedo', [1, 1], true, 'tolex-v3', () => refreshCabinetLeatherPbr());
  const cabinetLeatherNormal = materialTexture('cabinet-tolex-real', 'normal', [1, 1], false, 'tolex-v3', () => refreshCabinetLeatherPbr());
  const cabinetLeatherRoughness = materialTexture('cabinet-tolex-real', 'roughness', [1, 1], false, 'tolex-v3', () => refreshCabinetLeatherPbr());
  const cabinetLeather = new THREE.MeshStandardMaterial({
    color: '#c0c0c0',
    map: cabinetLeatherAlbedo,
    normalMap: cabinetLeatherNormal,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: cabinetLeatherRoughness,
    roughness: 1,
    metalness: 0,
  });
  cabinetLeather.userData.pbrChannels = {
    albedo: '/materials/cabinet-tolex-real/cabinet-tolex-real_albedo.png?v=tolex-v3',
    normal: '/materials/cabinet-tolex-real/cabinet-tolex-real_normal.png?v=tolex-v3',
    roughness: '/materials/cabinet-tolex-real/cabinet-tolex-real_roughness.png?v=tolex-v3',
    provenance: 'Reference-guided real Tolex macro material, de-lit and made mathematically seamless.',
  };
  refreshCabinetLeatherPbr = () => { cabinetLeather.needsUpdate = true; };
  const baffleMat = referenceMaterial('driver-composite', '#141516', [1.5, 1.5], 0.12, 0.4, 0.36);
  const grilleDark = referenceMaterial('driver-composite', '#191714', [2.2, 2.2], 0.08, 0.78, 0.32);
  const brass = referenceMaterial('brushed-brass', '#b89451', [2.8, 1.6], 0.9, 0.28, 0.22);
  const brassDark = referenceMaterial('brushed-brass', '#5f421d', [3.8, 2.1], 0.78, 0.41, 0.18);
  let refreshFrontFramePbr = () => undefined;
  const frontFrameAlbedo = materialTexture('front-frame-leather', 'albedo', [6.5, 0.9], true, 'lychee-v10', () => refreshFrontFramePbr());
  const frontFrameNormal = materialTexture('front-frame-leather', 'normal', [6.5, 0.9], false, 'lychee-v10', () => refreshFrontFramePbr());
  const frontFrameRoughness = materialTexture('front-frame-leather', 'roughness', [6.5, 0.9], false, 'lychee-v10', () => refreshFrontFramePbr());
  const frontFrameLeather = new THREE.MeshStandardMaterial({
    color: '#b5aea6', map: frontFrameAlbedo, normalMap: frontFrameNormal, normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: frontFrameRoughness, roughness: 1, metalness: 0,
  });
  frontFrameLeather.userData.pbrChannels = {
    albedo: '/materials/front-frame-leather/front-frame-leather_albedo.png?v=lychee-v10',
    normal: '/materials/front-frame-leather/front-frame-leather_normal.png?v=lychee-v10',
    roughness: '/materials/front-frame-leather/front-frame-leather_roughness.png?v=lychee-v10',
    provenance: 'Generated bitmap PBR set, constrained by the approved #02 front-frame reference; not an original photographed leather scan.',
  };
  frontFrameLeather.needsUpdate = true;
  refreshFrontFramePbr = () => { frontFrameLeather.needsUpdate = true; };
  const frontFramePiping = new THREE.MeshStandardMaterial({ color: '#9d713c', metalness: 0.86, roughness: 0.36 });
  const frontFrameGasket = new THREE.MeshStandardMaterial({ color: '#070707', metalness: 0.04, roughness: 0.7 });
  const rubber = referenceMaterial('rubber', '#090a0b', [2.4, 2.4], 0, 0.86, 0.22);
  let refreshChamberMdfPbr = () => undefined;
  const chamberMdfAlbedo = materialTexture('chamber-mdf', 'albedo', [1, 1], true, 'layer04-v2', () => refreshChamberMdfPbr());
  const chamberMdfNormal = materialTexture('chamber-mdf', 'normal', [1, 1], false, 'layer04-v2', () => refreshChamberMdfPbr());
  const chamberMdfRoughness = materialTexture('chamber-mdf', 'roughness', [1, 1], false, 'layer04-v2', () => refreshChamberMdfPbr());
  const wood = new THREE.MeshStandardMaterial({
    color: '#d2b08a',
    map: chamberMdfAlbedo,
    normalMap: chamberMdfNormal,
    normalScale: new THREE.Vector2(0.38, 0.38),
    roughnessMap: chamberMdfRoughness,
    roughness: 1,
    metalness: 0,
  });
  wood.userData.pbrChannels = {
    albedo: '/materials/chamber-mdf/chamber-mdf_albedo.png?v=layer04-v2',
    normal: '/materials/chamber-mdf/chamber-mdf_normal.png?v=layer04-v2',
    roughness: '/materials/chamber-mdf/chamber-mdf_roughness.png?v=layer04-v2',
    provenance: 'Generated from a flat MDF-only crop of the approved #04 cabinet reference.',
  };
  refreshChamberMdfPbr = () => { wood.needsUpdate = true; };
  const mdfCutEdge = wood.clone();
  mdfCutEdge.name = 'Compressed MDF cut-edge material';
  mdfCutEdge.color.set('#b58d68');
  mdfCutEdge.normalScale.set(0.52, 0.52);
  mdfCutEdge.roughness = 1;
  mdfCutEdge.envMapIntensity = 0.05;
  mdfCutEdge.userData.pbrChannels = {
    ...wood.userData.pbrChannels,
    usage: 'Darker, stronger compressed-fibre response on visible board cross-sections.',
  };
  const pcb = referenceMaterial('pcb', '#244831', [2.4, 2.4], 0.28, 0.48, 0.24);
  const { normal: grilleNormalTexture, roughness: grilleRoughnessTexture } = wovenMetalResponseMaps();
  const metalGrille = new THREE.MeshStandardMaterial({
    // Reference #01 reads as a dense near-opaque black/copper metal weave at product
    // distance. The albedo supplies the microscopic loop pattern; it is not an alpha
    // window intended to reveal the drivers behind it.
    color: '#76552c',
    map: grilleReferenceTexture,
    normalMap: grilleNormalTexture,
    normalScale: new THREE.Vector2(0.48, 0.48),
    roughnessMap: grilleRoughnessTexture,
    roughness: 0.86,
    metalness: 0.66,
  });
  metalGrille.userData.pbrChannels = {
    albedo: '/materials/grille-cloth/generated-woven-grille-albedo.png',
    roughness: '/materials/grille-cloth/grille-cloth_roughness.png',
    normal: 'procedural interlaced micro-normal (no lettering)',
    ambientOcclusion: '/materials/grille-cloth/grille-cloth_ao.png',
    metalness: 'independent procedural scalar map',
    aperture: 'dense near-opaque optical weave; no intentional driver see-through',
    surfaceResponse: 'procedural interlaced normal + roughness maps at the albedo weave scale',
  };
  vinyl.envMapIntensity = 0.28;
  vinylEdge.envMapIntensity = 0.18;
  cabinetLeather.envMapIntensity = 0.08;
  baffleMat.envMapIntensity = 0.12;
  brass.envMapIntensity = 0.42;
  brassDark.envMapIntensity = 0.26;
  frontFrameLeather.envMapIntensity = 0.04;
  frontFramePiping.envMapIntensity = 0.3;
  frontFrameGasket.envMapIntensity = 0.12;
  wood.envMapIntensity = 0.08;
  metalGrille.envMapIntensity = 0.16;
  const grilleEdgeMetal = referenceMaterial('matte-black', '#17130f', [3.8, 2.1], 0.28, 0.58, 0.12);
  grilleEdgeMetal.envMapIntensity = 0.1;

  function addPart(id: string, name: string, parent: THREE.Object3D, object: THREE.Object3D, options: PartOptions = {}): THREE.Group {
    const pivot = new THREE.Group();
    pivot.name = `${name} pivot`;
    object.name = name;
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    pivot.add(object);
    parent.add(pivot);
    nodes[id] = pivot;
    if (object instanceof THREE.Mesh) meshes[id] = object;
    colliders[id] = new THREE.Box3().setFromObject(object);
    if (options.detachable) (destructionGroups[options.explodeGroup ?? 'serviceable-parts'] ??= []).push(pivot);
    return pivot;
  }

  function rounded(width: number, height: number, depth: number, radius: number, material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 6, radius), material);
  }

  function applyWorldScaleUvs(geometry: THREE.BufferGeometry, tileWorldSize: number): void {
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    if (!positions || !normals) return;
    const uv = new Float32Array(positions.count * 2);
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const nx = Math.abs(normals.getX(index));
      const ny = Math.abs(normals.getY(index));
      const nz = Math.abs(normals.getZ(index));
      if (nx >= ny && nx >= nz) {
        uv[index * 2] = z / tileWorldSize;
        uv[index * 2 + 1] = y / tileWorldSize;
      } else if (ny >= nx && ny >= nz) {
        uv[index * 2] = x / tileWorldSize;
        uv[index * 2 + 1] = z / tileWorldSize;
      } else {
        uv[index * 2] = x / tileWorldSize;
        uv[index * 2 + 1] = y / tileWorldSize;
      }
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }

  function texturedRounded(
    width: number,
    height: number,
    depth: number,
    radius: number,
    material: THREE.Material,
    tileWorldSize: number,
  ): THREE.Mesh {
    const geometry = new RoundedBoxGeometry(width, height, depth, 6, radius);
    applyWorldScaleUvs(geometry, tileWorldSize);
    return new THREE.Mesh(geometry, material);
  }

  function appendRoundedRectangle(
    path: THREE.Shape | THREE.Path,
    width: number,
    height: number,
    radius: number,
    clockwise = false,
    centerX = 0,
    centerY = 0,
  ): void {
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const bottom = centerY - height / 2;
    const top = centerY + height / 2;
    if (clockwise) {
      path.moveTo(left + radius, bottom);
      path.lineTo(left, bottom);
      path.quadraticCurveTo(left, bottom, left, bottom + radius);
      path.lineTo(left, top - radius);
      path.quadraticCurveTo(left, top, left + radius, top);
      path.lineTo(right - radius, top);
      path.quadraticCurveTo(right, top, right, top - radius);
      path.lineTo(right, bottom + radius);
      path.quadraticCurveTo(right, bottom, right - radius, bottom);
    } else {
      path.moveTo(left + radius, bottom);
      path.lineTo(right - radius, bottom);
      path.quadraticCurveTo(right, bottom, right, bottom + radius);
      path.lineTo(right, top - radius);
      path.quadraticCurveTo(right, top, right - radius, top);
      path.lineTo(left + radius, top);
      path.quadraticCurveTo(left, top, left, top - radius);
      path.lineTo(left, bottom + radius);
      path.quadraticCurveTo(left, bottom, left + radius, bottom);
    }
  }

  function appendCapsule(
    path: THREE.Shape | THREE.Path,
    width: number,
    height: number,
    centerX = 0,
    centerY = 0,
    clockwise = false,
  ): void {
    const radius = height / 2;
    const halfStraight = width / 2 - radius;
    if (clockwise) {
      path.moveTo(centerX - halfStraight, centerY + radius);
      path.lineTo(centerX + halfStraight, centerY + radius);
      path.absarc(centerX + halfStraight, centerY, radius, Math.PI / 2, -Math.PI / 2, true);
      path.lineTo(centerX - halfStraight, centerY - radius);
      path.absarc(centerX - halfStraight, centerY, radius, -Math.PI / 2, Math.PI / 2, true);
    } else {
      path.moveTo(centerX - halfStraight, centerY - radius);
      path.lineTo(centerX + halfStraight, centerY - radius);
      path.absarc(centerX + halfStraight, centerY, radius, -Math.PI / 2, Math.PI / 2, false);
      path.lineTo(centerX - halfStraight, centerY + radius);
      path.absarc(centerX - halfStraight, centerY, radius, Math.PI / 2, -Math.PI / 2, false);
    }
  }

  const CABINET = {
    width: 6.4,
    height: 4.1,
    depth: 3.5,
    outerRadius: 0.33,
    shellThickness: 0.25,
    frontOpeningWidth: 5.75,
    frontOpeningHeight: 3.35,
    frontOpeningRadius: 0.15,
    frontFrameDepth: 0.3,
    mdfThickness: 0.18,
    mdfBevel: 0.025,
    handleWidth: 2,
    handleHeight: 0.38,
    handleZ: -0.35,
    rearPortWidth: 1.25,
    rearPortHeight: 0.62,
    rearPortRadius: 0.09,
    rearPortX: 1.25,
    rearPortY: 0.1,
    leatherTileWorldSize: 1.05,
    mdfTileWorldSize: 0.82,
    footRadius: 0.12,
    footHeight: 0.12,
  } as const;

  const COMPONENT_FIT = {
    frontFrame: (CABINET.frontOpeningWidth + 0.2) / 4.42,
    driverBaffle: (CABINET.frontOpeningWidth - 0.18) / 4.08,
    grille: (CABINET.frontOpeningWidth - 0.15) / 4.1,
    topDeck: {
      x: (CABINET.width * 0.82) / 3.82,
      z: (CABINET.depth * 0.42) / 1.02,
    },
    amplifier: {
      x: (CABINET.frontOpeningWidth * 0.78) / 3.26,
      z: 1.2 / 0.86,
    },
    rearCover: {
      x: (CABINET.width - 0.45) / 4.04,
      y: (CABINET.height - 0.65) / 2,
      z: 1.3,
    },
    rearIo: {
      x: 3.45 / 2.58,
      y: 0.9 / 0.66,
      z: 1.2,
    },
  } as const;

  function socket(id: string, parent: THREE.Object3D, position: THREE.Vector3Tuple): void {
    const anchor = new THREE.Object3D();
    anchor.name = `${id} socket`;
    anchor.position.set(...position);
    parent.add(anchor);
    sockets[id] = anchor;
  }

  function cylinder(radiusTop: number, radiusBottom: number, height: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 40), material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  const outerHalfWidth = CABINET.width / 2;
  const outerHalfHeight = CABINET.height / 2;
  const outerHalfDepth = CABINET.depth / 2;
  const innerBoardDepth = CABINET.depth - CABINET.shellThickness * 2;

  const outerShell = new THREE.Group();
  outerShell.name = 'OuterShell';
  outerShell.userData.construction = 'single continuous rounded CSG shell';

  // One watertight rounded body produces all eight exterior corners. The interior,
  // front opening, handle slot and rear port are cut from this same surface, avoiding
  // the height steps and soft-strip seams caused by overlapping independent panels.
  const outerBodyBrush = new Brush(
    new RoundedBoxGeometry(
      CABINET.width,
      CABINET.height,
      CABINET.depth,
      10,
      CABINET.outerRadius,
    ),
    cabinetLeather,
  );
  outerBodyBrush.updateMatrixWorld(true);

  const cavityDepth = CABINET.depth;
  const cavityBrush = new Brush(
    new RoundedBoxGeometry(
      CABINET.frontOpeningWidth,
      CABINET.frontOpeningHeight,
      cavityDepth,
      7,
      CABINET.frontOpeningRadius,
    ),
    cabinetLeather,
  );
  cavityBrush.position.z = CABINET.shellThickness;
  cavityBrush.updateMatrixWorld(true);

  const handleCutterShape = new THREE.Shape();
  appendCapsule(handleCutterShape, CABINET.handleWidth, CABINET.handleHeight);
  const handleCutterGeometry = new THREE.ExtrudeGeometry(handleCutterShape, {
    depth: CABINET.shellThickness + CABINET.mdfThickness + 0.28,
    bevelEnabled: true,
    bevelSegments: 5,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 32,
  });
  handleCutterGeometry.rotateX(Math.PI / 2);
  const handleCutterBrush = new Brush(handleCutterGeometry, cabinetLeather);
  handleCutterBrush.position.set(0, outerHalfHeight + 0.18, CABINET.handleZ);
  handleCutterBrush.updateMatrixWorld(true);

  const rearPortCutterBrush = new Brush(
    new RoundedBoxGeometry(
      CABINET.rearPortWidth,
      CABINET.rearPortHeight,
      CABINET.shellThickness + CABINET.mdfThickness + 0.42,
      6,
      CABINET.rearPortRadius,
    ),
    cabinetLeather,
  );
  rearPortCutterBrush.position.set(
    CABINET.rearPortX,
    CABINET.rearPortY,
    -outerHalfDepth + CABINET.shellThickness / 2,
  );
  rearPortCutterBrush.updateMatrixWorld(true);

  const shellEvaluator = new Evaluator();
  shellEvaluator.useGroups = false;
  let continuousShellBrush = shellEvaluator.evaluate(outerBodyBrush, cavityBrush, SUBTRACTION);
  continuousShellBrush.material = cabinetLeather;
  continuousShellBrush.updateMatrixWorld(true);
  continuousShellBrush = shellEvaluator.evaluate(continuousShellBrush, handleCutterBrush, SUBTRACTION);
  continuousShellBrush.material = cabinetLeather;
  continuousShellBrush.updateMatrixWorld(true);
  continuousShellBrush = shellEvaluator.evaluate(continuousShellBrush, rearPortCutterBrush, SUBTRACTION);
  continuousShellBrush.material = cabinetLeather;
  continuousShellBrush.name = 'ContinuousOuterShell';
  applyWorldScaleUvs(continuousShellBrush.geometry, CABINET.leatherTileWorldSize);
  outerShell.add(continuousShellBrush);

  // Named logical surface anchors preserve the requested runtime hierarchy without
  // splitting the visible exterior back into overlapping meshes.
  for (const logicalSurfaceName of [
    'TopShell',
    'BottomShell',
    'LeftShell',
    'RightShell',
    'BackShell',
    'FrontRoundedFrame',
  ]) {
    const logicalSurface = new THREE.Object3D();
    logicalSurface.name = logicalSurfaceName;
    logicalSurface.userData.surfaceOf = 'ContinuousOuterShell';
    outerShell.add(logicalSurface);
  }

  const cabinet = addPart(
    'acoustic-chamber',
    'Hollow MDF acoustic chamber',
    root,
    outerShell,
    { detachable: true, explodeGroup: 'acoustic-chamber' },
  );
  cabinet.name = 'SpeakerCabinet';
  outerShell.name = 'OuterShell';
  cabinet.userData.dimensions = { ...CABINET };

  // Explicit sockets keep every detachable assembly anchored to an inspectable contact point.
  socket('front-seat', cabinet, [0, 0, outerHalfDepth + 0.12]);
  socket('rear-seat', cabinet, [0, 0, -outerHalfDepth - 0.03]);
  socket('top-seat', cabinet, [0, outerHalfHeight + 0.18, 0]);
  socket('base-seat', cabinet, [0, -outerHalfHeight - CABINET.footHeight, 0]);
  socket('baffle-seat', cabinet, [0, 0, outerHalfDepth + 0.1]);

  const mdfInterior = new THREE.Group();
  mdfInterior.name = 'MDFInterior';

  const innerTopShape = new THREE.Shape();
  appendRoundedRectangle(innerTopShape, CABINET.frontOpeningWidth, innerBoardDepth, 0.06);
  const innerTopHandleHole = new THREE.Path();
  appendCapsule(innerTopHandleHole, CABINET.handleWidth, CABINET.handleHeight, 0, CABINET.handleZ, true);
  innerTopShape.holes.push(innerTopHandleHole);
  const innerTopGeometry = new THREE.ExtrudeGeometry(innerTopShape, {
    depth: CABINET.mdfThickness,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: CABINET.mdfBevel,
    bevelThickness: CABINET.mdfBevel,
    curveSegments: 20,
  });
  innerTopGeometry.rotateX(Math.PI / 2);
  innerTopGeometry.translate(0, CABINET.frontOpeningHeight / 2, 0);
  applyWorldScaleUvs(innerTopGeometry, CABINET.mdfTileWorldSize);
  const innerTop = new THREE.Mesh(innerTopGeometry, [wood, mdfCutEdge]);
  innerTop.name = 'InnerTop';
  mdfInterior.add(innerTop);

  const innerBottom = texturedRounded(
    CABINET.frontOpeningWidth,
    CABINET.mdfThickness,
    innerBoardDepth,
    CABINET.mdfBevel,
    wood,
    CABINET.mdfTileWorldSize,
  );
  innerBottom.name = 'InnerBottom';
  innerBottom.position.y = -CABINET.frontOpeningHeight / 2 + CABINET.mdfThickness / 2;
  mdfInterior.add(innerBottom);

  const innerWallHeight = CABINET.frontOpeningHeight - CABINET.mdfThickness * 2;
  for (const [name, x] of [
    ['InnerLeft', -CABINET.frontOpeningWidth / 2 + CABINET.mdfThickness / 2],
    ['InnerRight', CABINET.frontOpeningWidth / 2 - CABINET.mdfThickness / 2],
  ] as const) {
    const innerWall = texturedRounded(
      CABINET.mdfThickness,
      innerWallHeight,
      innerBoardDepth,
      CABINET.mdfBevel,
      wood,
      CABINET.mdfTileWorldSize,
    );
    innerWall.name = name;
    innerWall.position.x = x;
    mdfInterior.add(innerWall);
  }

  const innerBackShape = new THREE.Shape();
  appendRoundedRectangle(
    innerBackShape,
    CABINET.frontOpeningWidth,
    CABINET.frontOpeningHeight,
    CABINET.frontOpeningRadius,
  );
  const innerRearPortHole = new THREE.Path();
  appendRoundedRectangle(
    innerRearPortHole,
    CABINET.rearPortWidth,
    CABINET.rearPortHeight,
    CABINET.rearPortRadius,
    true,
    CABINET.rearPortX,
    CABINET.rearPortY,
  );
  innerBackShape.holes.push(innerRearPortHole);
  const innerBackGeometry = new THREE.ExtrudeGeometry(innerBackShape, {
    depth: CABINET.mdfThickness,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: CABINET.mdfBevel,
    bevelThickness: CABINET.mdfBevel,
    curveSegments: 22,
  });
  innerBackGeometry.translate(0, 0, -outerHalfDepth + CABINET.shellThickness);
  applyWorldScaleUvs(innerBackGeometry, CABINET.mdfTileWorldSize);
  const innerBack = new THREE.Mesh(innerBackGeometry, [wood, mdfCutEdge]);
  innerBack.name = 'InnerBack';
  mdfInterior.add(innerBack);

  const frontMdfEdgeShape = new THREE.Shape();
  appendRoundedRectangle(
    frontMdfEdgeShape,
    CABINET.frontOpeningWidth,
    CABINET.frontOpeningHeight,
    CABINET.frontOpeningRadius,
  );
  const frontMdfEdgeOpening = new THREE.Path();
  appendRoundedRectangle(
    frontMdfEdgeOpening,
    CABINET.frontOpeningWidth - CABINET.mdfThickness * 2,
    CABINET.frontOpeningHeight - CABINET.mdfThickness * 2,
    0.11,
    true,
  );
  frontMdfEdgeShape.holes.push(frontMdfEdgeOpening);
  const frontMdfEdgeGeometry = new THREE.ExtrudeGeometry(frontMdfEdgeShape, {
    depth: CABINET.mdfThickness,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    curveSegments: 22,
  });
  frontMdfEdgeGeometry.translate(0, 0, outerHalfDepth - CABINET.shellThickness - CABINET.mdfThickness);
  applyWorldScaleUvs(frontMdfEdgeGeometry, CABINET.mdfTileWorldSize);
  const frontMdfEdge = new THREE.Mesh(frontMdfEdgeGeometry, [wood, mdfCutEdge]);
  frontMdfEdge.name = 'FrontMDFEdge';
  mdfInterior.add(frontMdfEdge);
  cabinet.add(mdfInterior);

  const internalBraces = new THREE.Group();
  internalBraces.name = 'InternalBraces';
  const bottomInteriorSurface = -CABINET.frontOpeningHeight / 2 + CABINET.mdfThickness;
  const backInteriorSurface = -outerHalfDepth + CABINET.shellThickness + CABINET.mdfThickness;

  const leftHorizontalBrace = texturedRounded(1.35, 0.16, 0.42, 0.015, wood, CABINET.mdfTileWorldSize);
  leftHorizontalBrace.name = 'LeftHorizontalBrace';
  leftHorizontalBrace.position.set(-2.095, 0.35, -0.82);
  internalBraces.add(leftHorizontalBrace);

  const centerVerticalBrace = new THREE.Group();
  centerVerticalBrace.name = 'CenterVerticalBrace';
  const centerVerticalPost = texturedRounded(
    CABINET.mdfThickness,
    innerWallHeight,
    0.5,
    0.015,
    wood,
    CABINET.mdfTileWorldSize,
  );
  centerVerticalPost.name = 'CenterVerticalBracePost';
  centerVerticalPost.position.set(-0.65, 0, backInteriorSurface + 0.25);
  const centerVerticalFoot = texturedRounded(0.34, 0.36, 0.54, 0.015, wood, CABINET.mdfTileWorldSize);
  centerVerticalFoot.name = 'CenterVerticalBraceFoot';
  centerVerticalFoot.position.set(-0.65, bottomInteriorSurface + 0.18, backInteriorSurface + 0.27);
  centerVerticalBrace.add(centerVerticalPost, centerVerticalFoot);
  internalBraces.add(centerVerticalBrace);

  const bottomBrace01 = texturedRounded(0.18, 0.16, 1.55, 0.015, wood, CABINET.mdfTileWorldSize);
  bottomBrace01.name = 'BottomBrace01';
  bottomBrace01.position.set(-0.65, bottomInteriorSurface + 0.08, -0.25);
  internalBraces.add(bottomBrace01);

  const bottomBrace02 = texturedRounded(0.18, 0.16, 1.05, 0.015, wood, CABINET.mdfTileWorldSize);
  bottomBrace02.name = 'BottomBrace02';
  bottomBrace02.position.set(1.65, bottomInteriorSurface + 0.08, 0.25);
  internalBraces.add(bottomBrace02);

  const bottomFrontBrace = texturedRounded(5.3, 0.12, 0.16, 0.015, wood, CABINET.mdfTileWorldSize);
  bottomFrontBrace.name = 'BottomFrontBrace';
  bottomFrontBrace.position.set(0, bottomInteriorSurface + 0.06, 1.36);
  internalBraces.add(bottomFrontBrace);

  const rightVerticalBrace = texturedRounded(0.18, 1.2, 0.24, 0.015, wood, CABINET.mdfTileWorldSize);
  rightVerticalBrace.name = 'RightVerticalBrace';
  rightVerticalBrace.position.set(2.35, 0.08, backInteriorSurface + 0.12);
  internalBraces.add(rightVerticalBrace);
  cabinet.add(internalBraces);

  const handleRecess = new THREE.Group();
  handleRecess.name = 'HandleRecess';
  const handleEdgeShape = new THREE.Shape();
  appendCapsule(handleEdgeShape, CABINET.handleWidth + 0.1, CABINET.handleHeight + 0.1);
  const handleEdgeOpening = new THREE.Path();
  appendCapsule(handleEdgeOpening, CABINET.handleWidth, CABINET.handleHeight, 0, 0, true);
  handleEdgeShape.holes.push(handleEdgeOpening);
  const handleEdgeGeometry = new THREE.ExtrudeGeometry(handleEdgeShape, {
    depth: 0.03,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.012,
    bevelThickness: 0.01,
    curveSegments: 28,
  });
  handleEdgeGeometry.rotateX(Math.PI / 2);
  handleEdgeGeometry.translate(0, outerHalfHeight + 0.025, CABINET.handleZ);
  applyWorldScaleUvs(handleEdgeGeometry, CABINET.leatherTileWorldSize);
  const handleEdge = new THREE.Mesh(handleEdgeGeometry, cabinetLeather);
  handleEdge.name = 'HandleRecessEdge';
  handleRecess.add(handleEdge);
  cabinet.add(handleRecess);

  const rearPort = new THREE.Group();
  rearPort.name = 'RearPort';
  const rearPortBevelShape = new THREE.Shape();
  appendRoundedRectangle(
    rearPortBevelShape,
    CABINET.rearPortWidth + 0.08,
    CABINET.rearPortHeight + 0.08,
    CABINET.rearPortRadius + 0.04,
  );
  const rearPortBevelOpening = new THREE.Path();
  appendRoundedRectangle(
    rearPortBevelOpening,
    CABINET.rearPortWidth,
    CABINET.rearPortHeight,
    CABINET.rearPortRadius,
    true,
  );
  rearPortBevelShape.holes.push(rearPortBevelOpening);
  const rearPortBevelGeometry = new THREE.ExtrudeGeometry(rearPortBevelShape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.01,
    curveSegments: 22,
  });
  rearPortBevelGeometry.translate(CABINET.rearPortX, CABINET.rearPortY, backInteriorSurface);
  applyWorldScaleUvs(rearPortBevelGeometry, CABINET.mdfTileWorldSize);
  const rearPortBevel = new THREE.Mesh(rearPortBevelGeometry, [wood, mdfCutEdge]);
  rearPortBevel.name = 'RearPortBevel';
  rearPort.add(rearPortBevel);
  cabinet.add(rearPort);

  const frameGroup = new THREE.Group();
  // The reference has a padded, continuously convex leather welt rather than a flat
  // annular face. A closed rounded-rectangle tube gives the frame a genuinely round
  // cross-section while preserving the open aperture and single-piece silhouette.
  const frameOuterWidth = 4.42;
  const frameOuterHeight = 2.64;
  const frameWall = 0.24;
  const frameCenterPath = new THREE.Shape();
  appendRoundedRectangle(
    frameCenterPath,
    frameOuterWidth - frameWall,
    frameOuterHeight - frameWall,
    0.12,
  );
  const frameCenterPoints = frameCenterPath.getSpacedPoints(224).slice(0, -1)
    .map((point) => new THREE.Vector3(point.x, point.y, 0));
  const frameCenterCurve = new THREE.CatmullRomCurve3(frameCenterPoints, true, 'centripetal');
  const frameGeometry = new THREE.TubeGeometry(frameCenterCurve, 256, frameWall / 2, 16, true);
  frameGeometry.scale(1, 1, 1.05);
  frameGroup.add(new THREE.Mesh(frameGeometry, frontFrameLeather));

  // A recessed black welt is visible immediately inside the brass piping in the
  // component reference. Keeping it separate preserves the layered upholstery read.
  const gasketOuter = new THREE.Shape();
  appendRoundedRectangle(gasketOuter, 4, 2.22, 0.115);
  const gasketInner = new THREE.Path();
  appendRoundedRectangle(gasketInner, 3.9, 2.12, 0.072, true);
  gasketOuter.holes.push(gasketInner);
  const gasketGeometry = new THREE.ExtrudeGeometry(gasketOuter, {
    depth: 0.018, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.008, bevelThickness: 0.006, curveSegments: 20,
  });
  gasketGeometry.translate(0, 0, 0.076);
  frameGroup.add(new THREE.Mesh(gasketGeometry, frontFrameGasket));

  // The brass detail is a true round tube following a closed rounded-rectangle curve,
  // giving it the cylindrical highlight and raised profile seen in the reference.
  const pipingPath = new THREE.Shape();
  appendRoundedRectangle(pipingPath, 4.03, 2.25, 0.13);
  const pipingPoints = pipingPath.getSpacedPoints(160).slice(0, -1)
    .map((point) => new THREE.Vector3(point.x, point.y, 0.104));
  const pipingCurve = new THREE.CatmullRomCurve3(pipingPoints, true, 'centripetal');
  const pipingGeometry = new THREE.TubeGeometry(pipingCurve, 192, 0.03, 12, true);
  frameGroup.add(new THREE.Mesh(pipingGeometry, frontFramePiping));
  const frontFrame = addPart('front-frame', 'Front frame with gold piping', cabinet, frameGroup, { detachable: true, explodeGroup: 'front-stack' });
  frontFrame.position.z = outerHalfDepth + 0.16;
  frontFrame.scale.setScalar(COMPONENT_FIT.frontFrame);

  const baffleGroup = new THREE.Group();
  const baffleFace = rounded(4.08, 2.32, 0.09, 0.06, baffleMat);
  baffleFace.position.z = -0.16;
  baffleGroup.add(baffleFace);
  const baffle = addPart('driver-baffle', 'Driver baffle and speaker drivers', cabinet, baffleGroup, { detachable: true, explodeGroup: 'front-stack' });
  baffle.position.z = outerHalfDepth + 0.16;
  baffle.scale.setScalar(COMPONENT_FIT.driverBaffle);

  const drivers = new THREE.Group();
  drivers.name = 'Three-driver array';
  const driverSpecs = [
    ['woofer', 0, 0.72, 0.53],
    ['tweeter-left', -1.36, 0.32, 0.17],
    ['tweeter-right', 1.36, 0.32, 0.17],
  ] as const;
  for (const [id, x, radius, dustCap] of driverSpecs) {
    const driver = new THREE.Group();
    driver.name = id;
    const surround = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.82, radius * 0.125, 12, 40), rubber);
    surround.position.set(x, 0, 0.115);
    const cone = cylinder(radius * 0.72, radius * 0.83, 0.075, grilleDark);
    cone.position.set(x, 0, 0.125);
    const cap = cylinder(dustCap, dustCap, 0.09, baffleMat);
    cap.position.set(x, 0, 0.19);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.56, radius * 0.026, 8, 36), brassDark);
    innerRing.position.set(x, 0, 0.183);
    const capRing = new THREE.Mesh(new THREE.TorusGeometry(dustCap * 1.08, dustCap * 0.03, 8, 28), grilleDark);
    capRing.position.set(x, 0, 0.238);
    driver.add(surround, cone, cap, innerRing, capRing);
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      const screw = cylinder(0.045, 0.045, 0.045, brassDark);
      screw.position.set(x + Math.cos(angle) * radius * 1.04, Math.sin(angle) * radius * 1.04, 0.15);
      driver.add(screw);
    }
    drivers.add(driver);
  }
  drivers.position.z = -0.1;
  baffleGroup.add(drivers);

  const grilleGroup = new THREE.Group();
  grilleGroup.name = 'Perforated metal grille structure';
  const grilleBacking = rounded(4.1, 2.3, 0.045, 0.06, metalGrille);
  grilleBacking.position.z = 0.23;
  grilleGroup.add(grilleBacking);
  for (const [x, y, width, height] of [
    [0, 1.12, 4.0, 0.026], [0, -1.12, 4.0, 0.026], [-1.99, 0, 0.026, 2.18], [1.99, 0, 0.026, 2.18],
  ] as const) {
    const grilleEdge = rounded(width, height, 0.028, 0.008, grilleEdgeMetal);
    grilleEdge.position.set(x, y, 0.262);
    grilleGroup.add(grilleEdge);
  }
  const grille = addPart('grille', 'Perforated metal grille', cabinet, grilleGroup, { detachable: true, explodeGroup: 'front-stack' });
  grille.position.z = outerHalfDepth + 0.16;
  grille.scale.setScalar(COMPONENT_FIT.grille);

  // The reference has a warm gold script badge raised slightly above the dense weave.
  // Two alpha-cut text layers make that relief legible without adding a rectangular decal.
  const badgeShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.4), makeBadgeMaterial('#241708', '#120b04'));
  badgeShadow.position.set(0.018, -0.018, 0.273);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.4), makeBadgeMaterial());
  badge.position.z = 0.286;
  grille.add(badgeShadow, badge);

  const topGroup = new THREE.Group();
  const topHousing = rounded(3.82, 0.1, 1.02, 0.06, vinylEdge);
  topHousing.position.y = -0.025;
  topGroup.add(topHousing);
  const controlRecess = rounded(3.58, 0.035, 0.78, 0.03, vinylEdge);
  controlRecess.position.y = 0.035;
  topGroup.add(controlRecess);
  const brassPlate = rounded(3.34, 0.035, 0.64, 0.025, brass);
  brassPlate.position.y = 0.067;
  topGroup.add(brassPlate);
  for (const x of [-1.04, -0.35, 0.35, 1.04]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 32), brass);
    knob.position.set(x, 0.12, 0);
    topGroup.add(knob);
    const indicator = rounded(0.015, 0.055, 0.024, 0.005, brassDark);
    indicator.position.set(x, 0.185, 0.08);
    topGroup.add(indicator);
    for (let ridge = 0; ridge < 12; ridge += 1) {
      const angle = (ridge / 12) * Math.PI * 2;
      const knurl = rounded(0.014, 0.055, 0.01, 0.003, brassDark);
      knurl.position.set(x + Math.cos(angle) * 0.115, 0.12, Math.sin(angle) * 0.115);
      knurl.rotation.y = -angle;
      topGroup.add(knurl);
    }
  }
  const toggle = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.17, 20), brass);
  toggle.position.set(1.52, 0.12, 0.12);
  topGroup.add(toggle);
  const top = addPart('top-control-deck', 'Top brass control deck', cabinet, topGroup, { detachable: true });
  top.position.y = outerHalfHeight + 0.08;
  top.scale.set(COMPONENT_FIT.topDeck.x, 1, COMPONENT_FIT.topDeck.z);

  const boardGroup = new THREE.Group();
  const board = rounded(3.26, 0.08, 0.86, 0.035, pcb);
  boardGroup.add(board);
  for (const [x, z, radius, height] of [[-0.98, -0.14, 0.1, 0.22], [-0.68, -0.14, 0.1, 0.22], [0.58, 0.08, 0.13, 0.26], [0.92, 0.08, 0.13, 0.26]] as const) {
    const capacitor = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), baffleMat);
    capacitor.position.set(x, height / 2 + 0.035, z);
    boardGroup.add(capacitor);
  }
  for (const [x, z] of [[-0.22, -0.18], [0.12, -0.18], [-0.2, 0.2], [0.14, 0.2]] as const) {
    const chip = rounded(0.2, 0.05, 0.15, 0.012, vinylEdge);
    chip.position.set(x, 0.065, z);
    boardGroup.add(chip);
  }
  const amplifier = addPart('amplifier-board', 'Amplifier circuit board', cabinet, boardGroup, { detachable: true, explodeGroup: 'internal-system' });
  amplifier.position.set(0, 0.78, -0.25);
  amplifier.scale.set(COMPONENT_FIT.amplifier.x, 1, COMPONENT_FIT.amplifier.z);

  const rearGroup = new THREE.Group();
  const rearPanelMesh = rounded(4.04, 2.0, 0.12, 0.08, vinylEdge);
  rearGroup.add(rearPanelMesh);
  const rear = addPart('rear-panel', 'Rear cover panel', cabinet, rearGroup, { detachable: true, explodeGroup: 'rear-stack' });
  rear.position.z = -outerHalfDepth - 0.09;
  rear.scale.set(COMPONENT_FIT.rearCover.x, COMPONENT_FIT.rearCover.y, COMPONENT_FIT.rearCover.z);
  const rearPanel = rounded(3.76, 1.72, 0.06, 0.05, vinyl);
  rearPanel.position.z = -0.1;
  rear.add(rearPanel);
  const handle = rounded(1.08, 0.3, 0.13, 0.11, rubber);
  handle.position.set(0, 0.48, -0.15);
  rear.add(handle);

  const ioGroup = new THREE.Group();
  const ioPlate = rounded(2.58, 0.66, 0.06, 0.04, brass);
  ioGroup.add(ioPlate);
  for (const x of [-0.78, -0.38, 0.02, 0.4]) {
    const socketRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 20), vinylEdge);
    socketRing.position.set(x, -0.03, -0.045);
    ioGroup.add(socketRing);
  }
  const power = rounded(0.2, 0.25, 0.035, 0.02, vinylEdge);
  power.position.set(0.9, -0.02, -0.05);
  ioGroup.add(power);
  const io = addPart('rear-io-plate', 'Rear brass connection plate', cabinet, ioGroup, { detachable: true, explodeGroup: 'rear-stack' });
  io.position.set(0, -0.38, -outerHalfDepth - 0.26);
  io.scale.set(COMPONENT_FIT.rearIo.x, COMPONENT_FIT.rearIo.y, COMPONENT_FIT.rearIo.z);

  const feetGroup = new THREE.Group();
  feetGroup.name = 'FeetAssembly';
  const footProfile = [
    new THREE.Vector2(CABINET.footRadius * 0.88, -CABINET.footHeight / 2),
    new THREE.Vector2(CABINET.footRadius * 0.97, -CABINET.footHeight * 0.38),
    new THREE.Vector2(CABINET.footRadius, -CABINET.footHeight * 0.22),
    new THREE.Vector2(CABINET.footRadius, CABINET.footHeight * 0.22),
    new THREE.Vector2(CABINET.footRadius * 0.97, CABINET.footHeight * 0.38),
    new THREE.Vector2(CABINET.footRadius * 0.88, CABINET.footHeight / 2),
  ];
  const footPositions = [
    ['FrontLeftFoot', -outerHalfWidth + 0.45, outerHalfDepth - 0.4],
    ['FrontRightFoot', outerHalfWidth - 0.45, outerHalfDepth - 0.4],
    ['RearLeftFoot', -outerHalfWidth + 0.45, -outerHalfDepth + 0.4],
    ['RearRightFoot', outerHalfWidth - 0.45, -outerHalfDepth + 0.4],
  ] as const;
  for (const [name, x, z] of footPositions) {
    const footAssembly = new THREE.Group();
    footAssembly.name = name;
    const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 32), brassDark);
    washer.name = `${name}BrassWasher`;
    washer.position.y = -outerHalfHeight - 0.0125;
    const foot = new THREE.Mesh(new THREE.LatheGeometry(footProfile, 40), rubber);
    foot.name = `${name}Rubber`;
    foot.position.y = -outerHalfHeight - 0.025 - CABINET.footHeight / 2;
    footAssembly.position.set(x, 0, z);
    footAssembly.add(washer, foot);
    feetGroup.add(footAssembly);
  }
  const feet = addPart(
    'isolation-feet',
    'Rubber feet and brass hardware',
    cabinet,
    feetGroup,
    { detachable: true, explodeGroup: 'feet-hardware' },
  );
  feet.name = 'Feet';
  feetGroup.name = 'FeetAssembly';

  root.updateMatrixWorld(true);
  for (const [id, node] of Object.entries(nodes)) {
    colliders[id] = new THREE.Box3().setFromObject(node);
  }
  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies SpeakerRuntime;
  root.userData.stage = 'structural-pass';
  return root;
}
