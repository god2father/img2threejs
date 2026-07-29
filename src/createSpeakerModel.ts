import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
  const baffleMat = referenceMaterial('driver-composite', '#141516', [1.5, 1.5], 0.12, 0.4, 0.36);
  const grilleDark = referenceMaterial('driver-composite', '#191714', [2.2, 2.2], 0.08, 0.78, 0.32);
  const brass = referenceMaterial('brushed-brass', '#b89451', [2.8, 1.6], 0.9, 0.28, 0.22);
  const brassDark = referenceMaterial('brushed-brass', '#5f421d', [3.8, 2.1], 0.78, 0.41, 0.18);
  let refreshFrontFramePbr = () => undefined;
  const frontFrameAlbedo = materialTexture('front-frame-leather', 'albedo', [1.55, 1], true, 'lychee-v4', () => refreshFrontFramePbr());
  const frontFrameNormal = materialTexture('front-frame-leather', 'normal', [1.55, 1], false, 'lychee-v4', () => refreshFrontFramePbr());
  const frontFrameRoughness = materialTexture('front-frame-leather', 'roughness', [1.55, 1], false, 'lychee-v4', () => refreshFrontFramePbr());
  const frontFrameLeather = new THREE.MeshStandardMaterial({
    color: '#ffffff', map: frontFrameAlbedo, normalMap: frontFrameNormal, normalScale: new THREE.Vector2(0.3, 0.3),
    roughnessMap: frontFrameRoughness, roughness: 0.84, metalness: 0.02,
  });
  frontFrameLeather.userData.pbrChannels = {
    albedo: '/materials/front-frame-leather/front-frame-leather_albedo.png?v=lychee-v4',
    normal: '/materials/front-frame-leather/front-frame-leather_normal.png?v=lychee-v4',
    roughness: '/materials/front-frame-leather/front-frame-leather_roughness.png?v=lychee-v4',
    provenance: 'Generated bitmap PBR set, constrained by the approved #02 front-frame reference; not an original photographed leather scan.',
  };
  frontFrameLeather.needsUpdate = true;
  refreshFrontFramePbr = () => { frontFrameLeather.needsUpdate = true; };
  const frontFramePiping = new THREE.MeshStandardMaterial({ color: '#8b632f', metalness: 0.8, roughness: 0.48 });
  const rubber = referenceMaterial('rubber', '#090a0b', [2.4, 2.4], 0, 0.86, 0.22);
  const wood = referenceMaterial('mdf-wood', '#5c351c', [1.5, 1.5], 0.02, 0.8, 0.32);
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
  baffleMat.envMapIntensity = 0.12;
  brass.envMapIntensity = 0.42;
  brassDark.envMapIntensity = 0.26;
  frontFrameLeather.envMapIntensity = 0.16;
  frontFramePiping.envMapIntensity = 0.24;
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

  function appendRoundedRectangle(path: THREE.Shape | THREE.Path, width: number, height: number, radius: number, clockwise = false): void {
    const left = -width / 2;
    const right = width / 2;
    const bottom = -height / 2;
    const top = height / 2;
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

  // Black vinyl only covers the outer shell. The separately visible brown MDF below is confined
  // to the front opening, inner walls and bracing rather than leaking onto exterior surfaces.
  const cabinetShell = new THREE.Group();
  cabinetShell.name = 'Hollow wrapped cabinet shell';
  const shellPieces = [
    [rounded(4.8, 0.46, 2.05, 0.18, vinyl), [0, 1.27, 0]],
    [rounded(4.8, 0.46, 2.05, 0.18, vinyl), [0, -1.27, 0]],
    [rounded(0.46, 2.54, 2.05, 0.16, vinyl), [-2.17, 0, 0]],
    [rounded(0.46, 2.54, 2.05, 0.16, vinyl), [2.17, 0, 0]],
  ] as const;
  shellPieces.forEach(([piece, position]) => {
    piece.position.set(position[0], position[1], position[2]);
    cabinetShell.add(piece);
  });
  const cabinet = addPart('acoustic-chamber', 'Hollow MDF acoustic chamber', root, cabinetShell, { detachable: true, explodeGroup: 'acoustic-chamber' });
  const cabinetSeams = new THREE.Group();
  for (const [x, y, width, height] of [
    [0, 1.31, 4.3, 0.028], [0, -1.31, 4.3, 0.028], [-2.15, 0, 0.028, 2.48], [2.15, 0, 0.028, 2.48],
  ] as const) {
    const seam = rounded(width, height, 0.018, 0.008, vinylEdge);
    seam.position.set(x, y, 1.035);
    cabinetSeams.add(seam);
  }
  cabinet.add(cabinetSeams);

  // Explicit sockets keep every detachable assembly anchored to an inspectable contact point.
  socket('front-seat', cabinet, [0, 0, 1.02]);
  socket('rear-seat', cabinet, [0, 0, -1.02]);
  socket('top-seat', cabinet, [0, 1.6, 0]);
  socket('base-seat', cabinet, [0, -1.6, 0]);
  socket('baffle-seat', cabinet, [0, 0, 1.04]);

  const chamberGroup = new THREE.Group();
  chamberGroup.name = 'MDF chamber inner walls and bracing';
  // These four front liners make the cavity's wall thickness legible after the front three
  // assemblies move away. The material is MDF only; the exterior remains the vinyl shell above.
  for (const [x, y, width, height] of [
    [0, 0.93, 3.72, 0.14], [0, -0.93, 3.72, 0.14], [-1.74, 0, 0.14, 1.72], [1.74, 0, 0.14, 1.72],
  ] as const) {
    const liner = rounded(width, height, 0.16, 0.025, wood);
    liner.position.set(x, y, 0.78);
    chamberGroup.add(liner);
  }
  // Recess the back board to the rear inner wall. This leaves a real front-to-back void
  // between the opening liner and the back board, with the surrounding MDF walls exposed.
  const chamberBack = rounded(3.38, 1.7, 0.12, 0.035, wood);
  chamberBack.position.z = -0.65;
  chamberGroup.add(chamberBack);
  for (const [x, y, width, height, depth] of [
    [-1.78, 0, 0.16, 2.08, 1.45], [1.78, 0, 0.16, 2.08, 1.45],
    [0, 1.0, 3.72, 0.16, 1.45], [0, -1.0, 3.72, 0.16, 1.45],
  ] as const) {
    const wall = rounded(width, height, depth, 0.025, wood);
    wall.position.set(x, y, 0.02);
    chamberGroup.add(wall);
  }
  const verticalBrace = rounded(0.16, 1.78, 0.62, 0.025, wood);
  verticalBrace.position.set(0, 0.16, 0.25);
  const lowerShelf = rounded(3.36, 0.12, 0.7, 0.025, wood);
  lowerShelf.position.set(0, -0.58, 0.34);
  const port = rounded(0.74, 0.42, 0.15, 0.035, vinylEdge);
  port.position.set(0.86, -0.05, -0.575);
  chamberGroup.add(verticalBrace, lowerShelf, port);
  cabinet.add(chamberGroup);

  const frameGroup = new THREE.Group();
  // One extruded Shape makes the front frame a genuinely continuous rounded ring.
  // Its hole is part of the topology, so no panel can fill the clean central opening.
  const frameOuterWidth = 4.42;
  const frameOuterHeight = 2.54;
  const frameWall = 0.11;
  const frameShape = new THREE.Shape();
  appendRoundedRectangle(frameShape, frameOuterWidth, frameOuterHeight, 0.16);
  const frameHole = new THREE.Path();
  appendRoundedRectangle(frameHole, frameOuterWidth - frameWall * 2, frameOuterHeight - frameWall * 2, 0.07, true);
  frameShape.holes.push(frameHole);
  const frameGeometry = new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.09, bevelEnabled: true, bevelSegments: 3, bevelSize: 0.012, bevelThickness: 0.008, curveSegments: 12,
  });
  frameGeometry.translate(0, 0, -0.045);
  frameGroup.add(new THREE.Mesh(frameGeometry, frontFrameLeather));
  // The piping is a second continuous annular extrusion, built from the same rounded-
  // rectangle path as the aperture. This guarantees a closed curve, matched corner radii,
  // and no TubeGeometry seam or straight-ended segment in the default product view.
  const pipingOuter = new THREE.Shape();
  appendRoundedRectangle(pipingOuter, frameOuterWidth - frameWall * 2 + 0.018, frameOuterHeight - frameWall * 2 + 0.018, 0.079);
  const pipingInner = new THREE.Path();
  appendRoundedRectangle(pipingInner, frameOuterWidth - frameWall * 2 - 0.022, frameOuterHeight - frameWall * 2 - 0.022, 0.061, true);
  pipingOuter.holes.push(pipingInner);
  const pipingGeometry = new THREE.ExtrudeGeometry(pipingOuter, {
    depth: 0.016, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.003, bevelThickness: 0.003, curveSegments: 12,
  });
  pipingGeometry.translate(0, 0, 0.047);
  frameGroup.add(new THREE.Mesh(pipingGeometry, frontFramePiping));
  const frontFrame = addPart('front-frame', 'Front frame with gold piping', cabinet, frameGroup, { detachable: true, explodeGroup: 'front-stack' });
  frontFrame.position.z = 1.055;

  const baffleGroup = new THREE.Group();
  const baffleFace = rounded(4.08, 2.32, 0.09, 0.06, baffleMat);
  baffleFace.position.z = -0.16;
  baffleGroup.add(baffleFace);
  const baffle = addPart('driver-baffle', 'Driver baffle and speaker drivers', cabinet, baffleGroup, { detachable: true, explodeGroup: 'front-stack' });
  baffle.position.z = 1.055;

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
  grille.position.z = 1.055;

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
  top.position.y = 1.52;

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
  amplifier.position.set(0, 0.68, -0.25);

  const rearGroup = new THREE.Group();
  const rearPanelMesh = rounded(4.04, 2.0, 0.12, 0.08, vinylEdge);
  rearGroup.add(rearPanelMesh);
  const rear = addPart('rear-panel', 'Rear cover panel', cabinet, rearGroup, { detachable: true, explodeGroup: 'rear-stack' });
  rear.position.z = -1.06;
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
  io.position.set(0, -0.38, -1.23);

  const feetGroup = new THREE.Group();
  for (const x of [-1.82, 1.82]) for (const z of [-0.66, 0.66]) {
    const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.025, 24), brassDark);
    washer.position.set(x, -1.57, z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.15, 0.18, 24), rubber);
    foot.position.set(x, -1.66, z);
    feetGroup.add(washer, foot);
  }
  // The exposed perimeter hardware is fixed to this service part, so it cannot create a
  // separate explosion layer from the feet and washers shown in the reference.
  for (const x of [-2.06, -1.35, 0, 1.35, 2.06]) for (const y of [-1.2, 1.2]) {
    const fastener = cylinder(0.035, 0.035, 0.04, brassDark);
    fastener.position.set(x, y, 0.97);
    feetGroup.add(fastener);
  }
  addPart('isolation-feet', 'Rubber feet and fasteners', cabinet, feetGroup, { detachable: true, explodeGroup: 'feet-hardware' });

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies SpeakerRuntime;
  root.userData.stage = 'structural-pass';
  return root;
}
