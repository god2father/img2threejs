import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export type SpeakerRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, THREE.Box3>;
  destructionGroups: Record<string, THREE.Object3D[]>;
  powerToggle: {
    node: THREE.Object3D;
    setPowered: (powered: boolean) => void;
  };
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

  function brushedBrassResponseMaps(): {
    albedo: THREE.CanvasTexture;
    normal: THREE.CanvasTexture;
    roughness: THREE.CanvasTexture;
  } {
    const width = 1024;
    const height = 256;
    const albedoCanvas = document.createElement('canvas');
    const normalCanvas = document.createElement('canvas');
    const roughnessCanvas = document.createElement('canvas');
    albedoCanvas.width = normalCanvas.width = roughnessCanvas.width = width;
    albedoCanvas.height = normalCanvas.height = roughnessCanvas.height = height;
    const albedoContext = albedoCanvas.getContext('2d');
    const normalContext = normalCanvas.getContext('2d');
    const roughnessContext = roughnessCanvas.getContext('2d');
    if (!albedoContext || !normalContext || !roughnessContext) {
      return {
        albedo: new THREE.CanvasTexture(albedoCanvas),
        normal: new THREE.CanvasTexture(normalCanvas),
        roughness: new THREE.CanvasTexture(roughnessCanvas),
      };
    }
    let seed = 971;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const rowHeight = new Float32Array(height);
    for (let y = 0; y < height; y += 1) {
      rowHeight[y] =
        Math.sin(y * 0.74) * 0.42
        + Math.sin(y * 2.17 + 0.7) * 0.2
        + (random() - 0.5) * 0.42;
    }
    const albedoPixels = albedoContext.createImageData(width, height);
    const normalPixels = normalContext.createImageData(width, height);
    const roughnessPixels = roughnessContext.createImageData(width, height);
    for (let y = 0; y < height; y += 1) {
      const previous = rowHeight[(y - 1 + height) % height];
      const next = rowHeight[(y + 1) % height];
      const slope = (next - previous) * 0.44;
      const normalLength = Math.hypot(slope, 1);
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        const streak = rowHeight[y] * 8 + Math.sin(x * 0.025 + y * 0.12) * 1.8;
        const fineNoise = (random() - 0.5) * 3;
        albedoPixels.data[index] = Math.round(216 + streak * 0.72 + fineNoise);
        albedoPixels.data[index + 1] = Math.round(185 + streak * 0.58 + fineNoise);
        albedoPixels.data[index + 2] = Math.round(122 + streak * 0.38 + fineNoise);
        albedoPixels.data[index + 3] = 255;
        normalPixels.data[index] = 128;
        normalPixels.data[index + 1] = Math.round(128 - (slope / normalLength) * 72);
        normalPixels.data[index + 2] = Math.round(128 + (1 / normalLength) * 127);
        normalPixels.data[index + 3] = 255;
        const roughness = Math.max(68, Math.min(118, 90 + rowHeight[y] * 13 + fineNoise * 2));
        roughnessPixels.data[index] = roughness;
        roughnessPixels.data[index + 1] = roughness;
        roughnessPixels.data[index + 2] = roughness;
        roughnessPixels.data[index + 3] = 255;
      }
    }
    albedoContext.putImageData(albedoPixels, 0, 0);
    normalContext.putImageData(normalPixels, 0, 0);
    roughnessContext.putImageData(roughnessPixels, 0, 0);
    const albedo = new THREE.CanvasTexture(albedoCanvas);
    const normal = new THREE.CanvasTexture(normalCanvas);
    const roughness = new THREE.CanvasTexture(roughnessCanvas);
    albedo.colorSpace = THREE.SRGBColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    roughness.colorSpace = THREE.NoColorSpace;
    for (const texture of [albedo, normal, roughness]) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
    }
    return { albedo, normal, roughness };
  }

  function controlPanelMarkingsTexture(config: {
    width: number;
    knobXs: readonly number[];
    leftJackX: number;
    leftButtonX: number;
    rightButtonX: number;
    toggleX: number;
  }): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return new THREE.CanvasTexture(canvas);
    const toCanvasX = (worldX: number) => ((worldX / config.width) + 0.5) * canvas.width;
    const black = '#15130f';
    const red = '#b32328';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = black;
    context.font = "700 42px 'Arial Narrow', Arial, sans-serif";
    context.fillText('ACTON II', toCanvasX(-1.83), 82);
    context.fillText('VOLUME', toCanvasX(config.knobXs[0]), 72);
    context.fillText('BASS', toCanvasX(config.knobXs[1]), 72);
    context.fillText('TREBLE', toCanvasX(config.knobXs[2]), 72);
    context.fillText('POWER', toCanvasX(config.toggleX), 72);
    context.font = "700 31px 'Arial Narrow', Arial, sans-serif";
    context.fillText('AUX', toCanvasX(config.leftJackX), 422);
    context.fillText('SOURCE', toCanvasX(config.leftButtonX), 422);
    context.fillText('▶Ⅱ', toCanvasX(config.rightButtonX), 116);
    context.fillText('I◀   ▶I', toCanvasX(config.rightButtonX), 420);
    context.fillText('0', toCanvasX(config.toggleX), 420);
    context.font = "700 23px 'Arial Narrow', Arial, sans-serif";
    context.textAlign = 'left';
    context.fillText('AUX', toCanvasX(-1.48), 205);
    context.fillText('RCA', toCanvasX(-1.48), 252);
    context.fillText('BT', toCanvasX(-1.48), 158);
    for (const [labelIndex, labelY] of [158, 205, 252].entries()) {
      context.fillStyle = labelIndex === 0 ? red : black;
      context.beginPath();
      context.arc(toCanvasX(-1.59), labelY, 7, 0, Math.PI * 2);
      context.fill();
    }
    context.textAlign = 'center';
    for (const knobX of config.knobXs) {
      const centerX = toCanvasX(knobX);
      const centerY = 256;
      for (let tick = 0; tick < 13; tick += 1) {
        const angle = Math.PI * (0.72 + (tick / 12) * 1.56);
        const innerRadius = 105;
        const outerRadius = tick % 3 === 0 ? 129 : 120;
        context.strokeStyle = tick === 2 || tick === 10 ? red : black;
        context.lineWidth = tick % 3 === 0 ? 7 : 5;
        context.beginPath();
        context.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
        context.lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
        context.stroke();
      }
      context.fillStyle = black;
      context.font = "700 24px 'Arial Narrow', Arial, sans-serif";
      context.fillText('0', centerX - 76, 410);
      context.fillText('10', centerX + 76, 410);
    }
    context.fillStyle = red;
    context.beginPath();
    context.arc(toCanvasX(config.toggleX), 113, 7, 0, Math.PI * 2);
    context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
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

  function enableTriplanarLeather(
    material: THREE.MeshStandardMaterial,
    tileWorldSize: number,
    cacheKey: string,
  ): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.triplanarScale = { value: 1 / tileWorldSize };
      shader.uniforms.triplanarSharpness = { value: 4 };

      const triplanarVaryings = `
varying vec3 vTriplanarPosition;
varying vec3 vTriplanarNormal;
varying vec3 vTriplanarAxisX;
varying vec3 vTriplanarAxisY;
varying vec3 vTriplanarAxisZ;
`;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${triplanarVaryings}`)
        .replace(
          '#include <normal_vertex>',
          `#include <normal_vertex>
vTriplanarNormal = normalize( objectNormal );
vTriplanarAxisX = normalize( normalMatrix * vec3( 1.0, 0.0, 0.0 ) );
vTriplanarAxisY = normalize( normalMatrix * vec3( 0.0, 1.0, 0.0 ) );
vTriplanarAxisZ = normalize( normalMatrix * vec3( 0.0, 0.0, 1.0 ) );`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
vTriplanarPosition = transformed;`,
        );

      const triplanarFragmentHelpers = `
${triplanarVaryings}
uniform float triplanarScale;
uniform float triplanarSharpness;

vec3 triplanarWeights() {
  vec3 weights = pow( max( abs( normalize( vTriplanarNormal ) ), vec3( 0.0001 ) ), vec3( triplanarSharpness ) );
  return weights / max( weights.x + weights.y + weights.z, 0.0001 );
}

void triplanarUvs( out vec2 uvX, out vec2 uvY, out vec2 uvZ ) {
  vec3 position = vTriplanarPosition * triplanarScale;
  uvX = vec2( -position.z, position.y );
  uvY = vec2( position.x, -position.z );
  uvZ = vec2( position.x, position.y );
}
`;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${triplanarFragmentHelpers}`)
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
  vec2 triplanarUvX;
  vec2 triplanarUvY;
  vec2 triplanarUvZ;
  triplanarUvs( triplanarUvX, triplanarUvY, triplanarUvZ );
  vec3 triplanarBlend = triplanarWeights();
  vec4 sampledDiffuseColor =
      texture2D( map, triplanarUvX ) * triplanarBlend.x
    + texture2D( map, triplanarUvY ) * triplanarBlend.y
    + texture2D( map, triplanarUvZ ) * triplanarBlend.z;
  diffuseColor *= sampledDiffuseColor;
#endif`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec2 triplanarRoughnessUvX;
  vec2 triplanarRoughnessUvY;
  vec2 triplanarRoughnessUvZ;
  triplanarUvs( triplanarRoughnessUvX, triplanarRoughnessUvY, triplanarRoughnessUvZ );
  vec3 triplanarRoughnessBlend = triplanarWeights();
  float triplanarRoughness =
      texture2D( roughnessMap, triplanarRoughnessUvX ).g * triplanarRoughnessBlend.x
    + texture2D( roughnessMap, triplanarRoughnessUvY ).g * triplanarRoughnessBlend.y
    + texture2D( roughnessMap, triplanarRoughnessUvZ ).g * triplanarRoughnessBlend.z;
  roughnessFactor *= triplanarRoughness;
#endif`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#ifdef USE_NORMALMAP_TANGENTSPACE
  vec2 triplanarNormalUvX;
  vec2 triplanarNormalUvY;
  vec2 triplanarNormalUvZ;
  triplanarUvs( triplanarNormalUvX, triplanarNormalUvY, triplanarNormalUvZ );
  vec3 triplanarNormalBlend = triplanarWeights();
  vec3 surfaceNormal = normalize( vTriplanarNormal );
  vec3 sampledNormalX = texture2D( normalMap, triplanarNormalUvX ).xyz * 2.0 - 1.0;
  vec3 sampledNormalY = texture2D( normalMap, triplanarNormalUvY ).xyz * 2.0 - 1.0;
  vec3 sampledNormalZ = texture2D( normalMap, triplanarNormalUvZ ).xyz * 2.0 - 1.0;
  sampledNormalX.xy *= normalScale;
  sampledNormalY.xy *= normalScale;
  sampledNormalZ.xy *= normalScale;
  float normalSignX = surfaceNormal.x < 0.0 ? -1.0 : 1.0;
  float normalSignY = surfaceNormal.y < 0.0 ? -1.0 : 1.0;
  float normalSignZ = surfaceNormal.z < 0.0 ? -1.0 : 1.0;
  vec3 objectNormalX = vec3(
    normalSignX * sampledNormalX.z,
    sampledNormalX.y,
    -normalSignX * sampledNormalX.x
  );
  vec3 objectNormalY = vec3(
    sampledNormalY.x,
    normalSignY * sampledNormalY.z,
    -normalSignY * sampledNormalY.y
  );
  vec3 objectNormalZ = vec3(
    normalSignZ * sampledNormalZ.x,
    sampledNormalZ.y,
    normalSignZ * sampledNormalZ.z
  );
  vec3 triplanarObjectNormal = normalize(
      objectNormalX * triplanarNormalBlend.x
    + objectNormalY * triplanarNormalBlend.y
    + objectNormalZ * triplanarNormalBlend.z
  );
  normal = normalize(
      vTriplanarAxisX * triplanarObjectNormal.x
    + vTriplanarAxisY * triplanarObjectNormal.y
    + vTriplanarAxisZ * triplanarObjectNormal.z
  );
#endif`,
        );
    };
    material.customProgramCacheKey = () => `triplanar-leather-${cacheKey}`;
    material.userData.mapping = {
      mode: 'object-space triplanar blend',
      tileWorldSize,
      blendSharpness: 4,
      purpose: 'continuous leather grain across rounded corners without dominant-axis UV seams',
    };
    material.needsUpdate = true;
  }

  const CABINET_LEATHER_TILE_WORLD_SIZE = 4;
  const vinyl = referenceMaterial('vinyl-leather', '#090a0a', [2.2, 1.4], 0.03, 0.72, 0.3);
  const vinylEdge = referenceMaterial('matte-black', '#050606', [2.4, 1.8], 0.06, 0.64, 0.2);
  let refreshCabinetLeatherPbr = () => undefined;
  const cabinetLeatherAlbedo = materialTexture('cabinet-tolex-real', 'albedo', [1, 1], true, 'physical-grain-v4', () => refreshCabinetLeatherPbr());
  const cabinetLeatherNormal = materialTexture('cabinet-tolex-real', 'normal', [1, 1], false, 'physical-grain-v4', () => refreshCabinetLeatherPbr());
  const cabinetLeatherRoughness = materialTexture('cabinet-tolex-real', 'roughness', [1, 1], false, 'physical-grain-v4', () => refreshCabinetLeatherPbr());
  const cabinetLeather = new THREE.MeshStandardMaterial({
    color: '#5d5d5d',
    map: cabinetLeatherAlbedo,
    normalMap: cabinetLeatherNormal,
    normalScale: new THREE.Vector2(0.56, 0.56),
    roughnessMap: cabinetLeatherRoughness,
    roughness: 0.98,
    metalness: 0,
    envMapIntensity: 0.06,
  });
  cabinetLeather.userData.pbrChannels = {
    albedo: '/materials/cabinet-tolex-real/cabinet-tolex-real_albedo.png?v=physical-grain-v4',
    normal: '/materials/cabinet-tolex-real/cabinet-tolex-real_normal.png?v=physical-grain-v4',
    roughness: '/materials/cabinet-tolex-real/cabinet-tolex-real_roughness.png?v=physical-grain-v4',
    provenance: 'Generated from the supplied physical amplifier close-up: dense irregular pebble cells, de-lit, contrast-clamped and mathematically seamless.',
  };
  enableTriplanarLeather(cabinetLeather, CABINET_LEATHER_TILE_WORLD_SIZE, 'cabinet-v1');
  refreshCabinetLeatherPbr = () => { cabinetLeather.needsUpdate = true; };
  const driverCompositeAlbedo = proceduralAlbedo('driver-composite', '#202122', [3.4, 2.15]);
  const driverCompositeNormal = proceduralScalar('driver-composite', 'normal', [3.4, 2.15]);
  const driverCompositeRoughness = proceduralScalar('driver-composite', 'roughness', [3.4, 2.15]);
  const baffleMat = new THREE.MeshStandardMaterial({
    color: '#7a7b7c',
    map: driverCompositeAlbedo,
    normalMap: driverCompositeNormal,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughnessMap: driverCompositeRoughness,
    roughness: 0.92,
    metalness: 0.04,
  });
  baffleMat.name = 'Textured matte baffle coating';
  baffleMat.userData.pbrChannels = {
    albedo: 'generated://driver-composite/albedo',
    normal: 'generated://driver-composite/normal',
    roughness: 'generated://driver-composite/roughness',
    provenance: 'Seamless fine-grain composite coating without baked lighting or repeated photographic features.',
  };
  const grilleDark = baffleMat.clone();
  grilleDark.name = 'Black paper cone material';
  grilleDark.color.set('#18191a');
  grilleDark.normalScale.set(0.2, 0.2);
  grilleDark.roughness = 0.92;
  const driverFrameMetal = new THREE.MeshStandardMaterial({ color: '#111315', metalness: 0.42, roughness: 0.5 });
  driverFrameMetal.name = 'Black coated driver frame';
  const driverBasketMetal = new THREE.MeshStandardMaterial({ color: '#17191b', metalness: 0.5, roughness: 0.54 });
  driverBasketMetal.name = 'Stamped black driver basket';
  const driverMagnetSteel = new THREE.MeshStandardMaterial({ color: '#292c2f', metalness: 0.66, roughness: 0.46 });
  driverMagnetSteel.name = 'Dark ferrite magnet and steel plate';
  const driverTerminal = new THREE.MeshStandardMaterial({ color: '#24201b', metalness: 0.08, roughness: 0.72 });
  driverTerminal.name = 'Driver terminal insulator';
  const dustCapMaterial = new THREE.MeshStandardMaterial({ color: '#161718', metalness: 0.02, roughness: 0.78 });
  dustCapMaterial.name = 'Pressed paper dust cap';
  const silverHardware = new THREE.MeshStandardMaterial({ color: '#c6c1b7', metalness: 0.9, roughness: 0.28 });
  silverHardware.name = 'Silver mounting hardware';
  const brass = referenceMaterial('brushed-brass', '#b89451', [2.8, 1.6], 0.9, 0.28, 0.22);
  const brassDark = referenceMaterial('brushed-brass', '#5f421d', [3.8, 2.1], 0.78, 0.41, 0.18);
  const controlPlateMaps = brushedBrassResponseMaps();
  const controlPlateBrass = new THREE.MeshStandardMaterial({
    color: '#fff6df',
    map: controlPlateMaps.albedo,
    normalMap: controlPlateMaps.normal,
    normalScale: new THREE.Vector2(0.11, 0.11),
    roughnessMap: controlPlateMaps.roughness,
    roughness: 0.46,
    metalness: 0.88,
    envMapIntensity: 0.5,
  });
  controlPlateBrass.name = 'Directional brushed brass control plate';
  controlPlateBrass.userData.pbrChannels = {
    albedo: 'generated://top-control/brushed-brass-albedo',
    normal: 'generated://top-control/brushed-brass-normal',
    roughness: 'generated://top-control/brushed-brass-roughness',
    provenance: 'Directional horizontal brushing calibrated from the supplied physical top-control reference.',
  };
  const grilleLowerAccent = new THREE.MeshStandardMaterial({ color: '#9d713c', metalness: 0.86, roughness: 0.36 });
  const rubber = referenceMaterial('rubber', '#090a0b', [2.4, 2.4], 0, 0.86, 0.22);
  let refreshChamberMdfPbr = () => undefined;
  const chamberMdfAlbedo = materialTexture('chamber-mdf', 'albedo', [1, 1], true, 'layer04-v2', () => refreshChamberMdfPbr());
  const chamberMdfNormal = materialTexture('chamber-mdf', 'normal', [1, 1], false, 'layer04-v2', () => refreshChamberMdfPbr());
  const chamberMdfRoughness = materialTexture('chamber-mdf', 'roughness', [1, 1], false, 'layer04-v2', () => refreshChamberMdfPbr());
  const wood = new THREE.MeshStandardMaterial({
    color: '#a88a6c',
    map: chamberMdfAlbedo,
    normalMap: chamberMdfNormal,
    normalScale: new THREE.Vector2(0.48, 0.48),
    roughnessMap: chamberMdfRoughness,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.08,
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
  mdfCutEdge.color.set('#967050');
  mdfCutEdge.normalScale.set(0.58, 0.58);
  mdfCutEdge.roughness = 1;
  mdfCutEdge.envMapIntensity = 0.05;
  mdfCutEdge.userData.pbrChannels = {
    ...wood.userData.pbrChannels,
    usage: 'Darker, stronger compressed-fibre response on visible board cross-sections.',
  };
  const pcbAlbedo = proceduralAlbedo('pcb', '#111416', [3.2, 1.2]);
  const pcbNormal = proceduralScalar('driver-composite', 'normal', [3.2, 1.2]);
  const pcbRoughness = proceduralScalar('driver-composite', 'roughness', [3.2, 1.2]);
  const pcb = new THREE.MeshStandardMaterial({
    color: '#a2a5a4',
    map: pcbAlbedo,
    normalMap: pcbNormal,
    normalScale: new THREE.Vector2(0.08, 0.08),
    roughnessMap: pcbRoughness,
    roughness: 0.72,
    metalness: 0.08,
  });
  pcb.name = 'Black solder-mask PCB';
  pcb.userData.pbrChannels = {
    albedo: 'generated://pcb/albedo',
    normal: 'generated://pcb/normal',
    roughness: 'generated://pcb/roughness',
    provenance: 'Seamless black solder-mask response matching the internal PCB reference.',
  };
  const electronicBlack = new THREE.MeshStandardMaterial({ color: '#111315', metalness: 0.08, roughness: 0.62 });
  const electronicGrey = new THREE.MeshStandardMaterial({ color: '#34373a', metalness: 0.18, roughness: 0.5 });
  const connectorWhite = new THREE.MeshStandardMaterial({ color: '#ddd9ca', metalness: 0.02, roughness: 0.62 });
  const capacitorSilver = new THREE.MeshStandardMaterial({ color: '#aaa9a3', metalness: 0.82, roughness: 0.32 });
  const copperPad = new THREE.MeshStandardMaterial({ color: '#bd8440', metalness: 0.82, roughness: 0.38 });
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
  grilleLowerAccent.envMapIntensity = 0.3;
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

  function appendChamferedRectangle(
    path: THREE.Shape | THREE.Path,
    width: number,
    height: number,
    chamfer: number,
    centerX = 0,
    centerY = 0,
    clockwise = false,
  ): void {
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    const bottom = centerY - height / 2;
    const top = centerY + height / 2;
    const points: THREE.Vector2Tuple[] = clockwise
      ? [
          [left + chamfer, bottom], [left, bottom + chamfer], [left, top - chamfer],
          [left + chamfer, top], [right - chamfer, top], [right, top - chamfer],
          [right, bottom + chamfer], [right - chamfer, bottom],
        ]
      : [
          [left + chamfer, bottom], [right - chamfer, bottom], [right, bottom + chamfer],
          [right, top - chamfer], [right - chamfer, top], [left + chamfer, top],
          [left, top - chamfer], [left, bottom + chamfer],
        ];
    path.moveTo(...points[0]);
    for (const point of points.slice(1)) path.lineTo(...point);
    path.closePath();
  }

  function createCapsuleRecessSlopeGeometry(
    outerWidth: number,
    outerDepth: number,
    outerRadius: number,
    innerWidth: number,
    innerDepth: number,
    innerRadius: number,
    recessDepth: number,
  ): THREE.BufferGeometry {
    const ringProfiles = [
      { inset: 0, y: 0 },
      { inset: 0.2, y: -recessDepth * 0.08 },
      { inset: 0.48, y: -recessDepth * 0.34 },
      { inset: 0.76, y: -recessDepth * 0.7 },
      { inset: 1, y: -recessDepth },
    ] as const;
    const pointCount = 128;
    const rings = ringProfiles.map(({ inset, y }) => {
      const shape = new THREE.Shape();
      appendRoundedRectangle(
        shape,
        THREE.MathUtils.lerp(outerWidth, innerWidth, inset),
        THREE.MathUtils.lerp(outerDepth, innerDepth, inset),
        THREE.MathUtils.lerp(outerRadius, innerRadius, inset),
      );
      const points = shape.getSpacedPoints(pointCount);
      if (points.length > 1 && points[0].distanceTo(points[points.length - 1]) < 0.00001) {
        points.pop();
      }
      return { points, y };
    });
    const vertices: number[] = [];
    const uvs: number[] = [];
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
      const ring = rings[ringIndex];
      for (let pointIndex = 0; pointIndex < ring.points.length; pointIndex += 1) {
        const point = ring.points[pointIndex];
        vertices.push(point.x, ring.y, point.y);
        uvs.push(pointIndex / ring.points.length, ringIndex / (rings.length - 1));
      }
    }
    const indices: number[] = [];
    const verticesPerRing = rings[0].points.length;
    for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
      const currentOffset = ringIndex * verticesPerRing;
      const nextOffset = (ringIndex + 1) * verticesPerRing;
      for (let pointIndex = 0; pointIndex < verticesPerRing; pointIndex += 1) {
        const nextPointIndex = (pointIndex + 1) % verticesPerRing;
        const outerA = currentOffset + pointIndex;
        const outerB = currentOffset + nextPointIndex;
        const innerA = nextOffset + pointIndex;
        const innerB = nextOffset + nextPointIndex;
        indices.push(outerA, innerB, outerB, outerA, innerA, innerB);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
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
    leatherTileWorldSize: CABINET_LEATHER_TILE_WORLD_SIZE,
    mdfTileWorldSize: 0.82,
    footRadius: 0.12,
    footHeight: 0.12,
  } as const;

  const TOP_CONTROL = {
    width: 4.78,
    depth: 1.02,
    radius: 0.43,
    z: -0.32,
    plateThickness: 0.035,
    recessDepth: 0.13,
    openingWidth: 5.1,
    openingDepth: 1.31,
    openingRadius: 0.58,
    slopeDepth: 0.075,
    knobXs: [-0.72, 0.08, 0.88],
    leftJackX: -1.82,
    leftButtonX: -1.42,
    rightButtonX: 1.48,
    toggleX: 2.04,
    shaftRadius: 0.055,
  } as const;

  const REAR = {
    coverWidth: CABINET.width - 0.45,
    coverHeight: CABINET.height - 0.65,
    coverDepth: 0.14,
    coverRadius: 0.16,
    handleWidth: 2,
    handleHeight: 0.52,
    handleX: -0.55,
    handleY: 0.72,
    iecWidth: 0.72,
    iecHeight: 0.9,
    iecX: 2.02,
    iecY: -0.55,
    metalWidth: 5.35,
    metalHeight: 1.72,
    metalDepth: 0.08,
    metalRadius: 0.14,
    metalY: -0.55,
  } as const;

  const ASSEMBLED_DEPTH = {
    // The highest woofer point projects about 0.31 units in front of the baffle.
    // Seating the baffle 0.41 behind the cabinet face leaves roughly 0.07 units
    // of air between that point and the rear surface of the grille.
    driverBaffle: CABINET.depth / 2 - 0.41,
    grille: CABINET.depth / 2 - 0.01,
    rearPanel: -CABINET.depth / 2 + 0.09,
    rearIo: -CABINET.depth / 2 - 0.06,
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
  // front opening, inset control well and rear port are cut from this same surface, avoiding
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

  const topControlPocketShape = new THREE.Shape();
  appendRoundedRectangle(
    topControlPocketShape,
    TOP_CONTROL.openingWidth,
    TOP_CONTROL.openingDepth,
    TOP_CONTROL.openingRadius,
  );
  const topControlPocketGeometry = new THREE.ExtrudeGeometry(topControlPocketShape, {
    depth: TOP_CONTROL.recessDepth + 0.18,
    bevelEnabled: false,
    curveSegments: 32,
  });
  topControlPocketGeometry.rotateX(Math.PI / 2);
  const topControlPocketBrush = new Brush(topControlPocketGeometry, cabinetLeather);
  topControlPocketBrush.position.set(
    0,
    outerHalfHeight + 0.04,
    TOP_CONTROL.z,
  );
  topControlPocketBrush.updateMatrixWorld(true);

  const shellEvaluator = new Evaluator();
  shellEvaluator.useGroups = false;
  let continuousShellBrush = shellEvaluator.evaluate(outerBodyBrush, cavityBrush, SUBTRACTION);
  continuousShellBrush.material = cabinetLeather;
  continuousShellBrush.updateMatrixWorld(true);
  continuousShellBrush = shellEvaluator.evaluate(continuousShellBrush, rearPortCutterBrush, SUBTRACTION);
  continuousShellBrush.material = cabinetLeather;
  continuousShellBrush.updateMatrixWorld(true);
  continuousShellBrush = shellEvaluator.evaluate(continuousShellBrush, topControlPocketBrush, SUBTRACTION);
  continuousShellBrush.material = cabinetLeather;
  for (const shaftX of [
    ...TOP_CONTROL.knobXs,
    TOP_CONTROL.leftJackX,
    TOP_CONTROL.leftButtonX,
    TOP_CONTROL.rightButtonX,
    TOP_CONTROL.toggleX,
  ]) {
    const shaftCutter = new Brush(
      new THREE.CylinderGeometry(
        shaftX === TOP_CONTROL.toggleX ? TOP_CONTROL.shaftRadius * 0.72 : TOP_CONTROL.shaftRadius,
        shaftX === TOP_CONTROL.toggleX ? TOP_CONTROL.shaftRadius * 0.72 : TOP_CONTROL.shaftRadius,
        CABINET.shellThickness + CABINET.mdfThickness + 0.4,
        32,
      ),
      cabinetLeather,
    );
    shaftCutter.position.set(shaftX, outerHalfHeight - 0.08, TOP_CONTROL.z);
    shaftCutter.updateMatrixWorld(true);
    continuousShellBrush.updateMatrixWorld(true);
    continuousShellBrush = shellEvaluator.evaluate(continuousShellBrush, shaftCutter, SUBTRACTION);
    continuousShellBrush.material = cabinetLeather;
  }
  continuousShellBrush.name = 'ContinuousOuterShell';
  applyWorldScaleUvs(continuousShellBrush.geometry, CABINET.leatherTileWorldSize);
  outerShell.add(continuousShellBrush);
  const topControlSlopeGeometry = createCapsuleRecessSlopeGeometry(
    TOP_CONTROL.openingWidth,
    TOP_CONTROL.openingDepth,
    TOP_CONTROL.openingRadius,
    TOP_CONTROL.width + 0.06,
    TOP_CONTROL.depth + 0.06,
    TOP_CONTROL.radius + 0.03,
    TOP_CONTROL.slopeDepth,
  );
  const topControlSlope = new THREE.Mesh(topControlSlopeGeometry, cabinetLeather);
  topControlSlope.name = 'TopControlLeatherRecessSlope';
  topControlSlope.position.set(0, outerHalfHeight + 0.002, TOP_CONTROL.z);
  topControlSlope.userData.construction = 'continuous leather-clad sloped cavity wall; not a separate trim frame';
  outerShell.add(topControlSlope);

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
  for (const shaftX of [
    ...TOP_CONTROL.knobXs,
    TOP_CONTROL.leftJackX,
    TOP_CONTROL.leftButtonX,
    TOP_CONTROL.rightButtonX,
    TOP_CONTROL.toggleX,
  ]) {
    const shaftHole = new THREE.Path();
    shaftHole.absarc(
      shaftX,
      TOP_CONTROL.z,
      shaftX === TOP_CONTROL.toggleX ? TOP_CONTROL.shaftRadius * 0.72 : TOP_CONTROL.shaftRadius,
      0,
      Math.PI * 2,
      true,
    );
    innerTopShape.holes.push(shaftHole);
  }
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
  const mdfBoreMaterial = new THREE.MeshStandardMaterial({
    color: '#2a1a10',
    metalness: 0,
    roughness: 1,
  });
  mdfBoreMaterial.name = 'Shadowed MDF mounting bore';

  function addMdfMountingBore(
    parent: THREE.Object3D,
    name: string,
    position: THREE.Vector3Tuple,
    axis: 'x' | 'y' | 'z',
    radius = 0.055,
  ): void {
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.92, 0.018, 32), mdfBoreMaterial);
    bore.name = `${name}Cavity`;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.009, 8, 32), mdfCutEdge);
    rim.name = `${name}CompressedRim`;
    if (axis === 'x') {
      bore.rotation.z = Math.PI / 2;
      rim.rotation.y = Math.PI / 2;
    } else if (axis === 'y') {
      rim.rotation.x = Math.PI / 2;
    } else {
      bore.rotation.x = Math.PI / 2;
    }
    bore.position.set(...position);
    rim.position.set(...position);
    parent.add(bore, rim);
  }

  const leftHorizontalBrace = texturedRounded(1.35, 0.16, 0.42, 0.015, wood, CABINET.mdfTileWorldSize);
  leftHorizontalBrace.name = 'LeftHorizontalBrace';
  leftHorizontalBrace.position.set(-2.095, 0.35, -0.82);
  internalBraces.add(leftHorizontalBrace);
  addMdfMountingBore(internalBraces, 'LeftBraceMount01', [-2.46, 0.35, -0.6], 'z', 0.035);
  addMdfMountingBore(internalBraces, 'LeftBraceMount02', [-1.74, 0.35, -0.6], 'z', 0.035);

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
  addMdfMountingBore(internalBraces, 'BottomBrace01Mount01', [-0.65, bottomInteriorSurface + 0.17, 0.08], 'y', 0.032);

  const bottomBrace02 = texturedRounded(0.18, 0.16, 1.05, 0.015, wood, CABINET.mdfTileWorldSize);
  bottomBrace02.name = 'BottomBrace02';
  bottomBrace02.position.set(1.65, bottomInteriorSurface + 0.08, 0.25);
  internalBraces.add(bottomBrace02);
  addMdfMountingBore(internalBraces, 'BottomBrace02Mount01', [1.65, bottomInteriorSurface + 0.17, 0.52], 'y', 0.032);

  const bottomFrontBrace = texturedRounded(5.3, 0.12, 0.16, 0.015, wood, CABINET.mdfTileWorldSize);
  bottomFrontBrace.name = 'BottomFrontBrace';
  bottomFrontBrace.position.set(0, bottomInteriorSurface + 0.06, 1.36);
  internalBraces.add(bottomFrontBrace);

  const rearBottomCleat = texturedRounded(5.18, 0.12, 0.14, 0.015, wood, CABINET.mdfTileWorldSize);
  rearBottomCleat.name = 'RearBottomCleat';
  rearBottomCleat.position.set(0, bottomInteriorSurface + 0.06, backInteriorSurface + 0.08);
  internalBraces.add(rearBottomCleat);

  const rightVerticalBrace = texturedRounded(0.18, 1.2, 0.24, 0.015, wood, CABINET.mdfTileWorldSize);
  rightVerticalBrace.name = 'RightVerticalBrace';
  rightVerticalBrace.position.set(2.35, 0.08, backInteriorSurface + 0.12);
  internalBraces.add(rightVerticalBrace);

  const chamberMountingDetails = new THREE.Group();
  chamberMountingDetails.name = 'ChamberMountingDetails';
  const leftWallInnerX = -CABINET.frontOpeningWidth / 2 + CABINET.mdfThickness + 0.01;
  addMdfMountingBore(chamberMountingDetails, 'LeftWallUpperBore', [leftWallInnerX, 1.17, 1.18], 'x', 0.072);
  addMdfMountingBore(chamberMountingDetails, 'LeftWallLowerBore', [leftWallInnerX, -1.12, 1.18], 'x', 0.072);
  addMdfMountingBore(chamberMountingDetails, 'LeftWallPilotBore01', [leftWallInnerX, -1.22, 0.96], 'x', 0.025);
  addMdfMountingBore(chamberMountingDetails, 'LeftWallPilotBore02', [leftWallInnerX, -1.22, 0.82], 'x', 0.025);
  addMdfMountingBore(chamberMountingDetails, 'RearBoardUpperBore', [-2.5, 1.2, backInteriorSurface + 0.01], 'z', 0.058);
  addMdfMountingBore(chamberMountingDetails, 'RearBoardLowerBore', [-2.5, -1.2, backInteriorSurface + 0.01], 'z', 0.058);
  internalBraces.add(chamberMountingDetails);
  cabinet.add(internalBraces);

  const handleRecess = new THREE.Group();
  handleRecess.name = 'HandleRecess';
  handleRecess.userData.supersededBy = 'InsetTopControlAssembly';
  handleRecess.userData.referenceDecision = 'The supplied physical-product top view replaces the earlier visible carry-slot interpretation.';
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

  // A deep open ring continues the aperture through the rear board and outer shell.
  // It preserves a genuine opening while giving the viewer visible MDF wall thickness.
  const rearPortTunnelShape = new THREE.Shape();
  appendRoundedRectangle(
    rearPortTunnelShape,
    CABINET.rearPortWidth + 0.02,
    CABINET.rearPortHeight + 0.02,
    CABINET.rearPortRadius + 0.01,
  );
  const rearPortTunnelOpening = new THREE.Path();
  appendRoundedRectangle(
    rearPortTunnelOpening,
    CABINET.rearPortWidth - 0.12,
    CABINET.rearPortHeight - 0.12,
    Math.max(0.035, CABINET.rearPortRadius - 0.035),
    true,
  );
  rearPortTunnelShape.holes.push(rearPortTunnelOpening);
  const rearPortTunnelGeometry = new THREE.ExtrudeGeometry(rearPortTunnelShape, {
    depth: CABINET.shellThickness + CABINET.mdfThickness,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.012,
    curveSegments: 24,
  });
  rearPortTunnelGeometry.translate(
    CABINET.rearPortX,
    CABINET.rearPortY,
    -outerHalfDepth - 0.012,
  );
  applyWorldScaleUvs(rearPortTunnelGeometry, CABINET.mdfTileWorldSize);
  const rearPortTunnel = new THREE.Mesh(rearPortTunnelGeometry, [mdfCutEdge, mdfBoreMaterial]);
  rearPortTunnel.name = 'RearPortOpenTunnel';
  rearPort.add(rearPortTunnel);
  cabinet.add(rearPort);

  const baffleGroup = new THREE.Group();
  baffleGroup.name = 'DriverBaffleAssembly';
  const BAFFLE = {
    width: CABINET.frontOpeningWidth - 0.18,
    height: CABINET.frontOpeningHeight - 0.16,
    depth: 0.18,
    radius: 0.16,
    cornerHoleX: (CABINET.frontOpeningWidth - 0.18) / 2 - 0.28,
    cornerHoleY: (CABINET.frontOpeningHeight - 0.16) / 2 - 0.25,
    cornerHoleRadius: 0.105,
    wooferRadius: 1.4,
    tweeterRadius: 0.67,
    tweeterX: 1.91,
    tweeterY: 0.76,
    totalAssemblyDepth: 1.14,
  } as const;
  baffleGroup.userData.dimensions = { ...BAFFLE };

  // The baffle is a real extruded board with four through holes rather than a
  // rounded slab with decorative dots. It is authored at final cabinet scale.
  const baffleShape = new THREE.Shape();
  appendRoundedRectangle(baffleShape, BAFFLE.width, BAFFLE.height, BAFFLE.radius);
  const cornerMountPositions: THREE.Vector2Tuple[] = [
    [-BAFFLE.cornerHoleX, BAFFLE.cornerHoleY],
    [BAFFLE.cornerHoleX, BAFFLE.cornerHoleY],
    [-BAFFLE.cornerHoleX, -BAFFLE.cornerHoleY],
    [BAFFLE.cornerHoleX, -BAFFLE.cornerHoleY],
  ];
  for (const [x, y] of cornerMountPositions) {
    const hole = new THREE.Path();
    hole.absarc(x, y, BAFFLE.cornerHoleRadius, 0, Math.PI * 2, true);
    baffleShape.holes.push(hole);
  }
  const baffleGeometry = new THREE.ExtrudeGeometry(baffleShape, {
    depth: BAFFLE.depth,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.022,
    bevelThickness: 0.018,
    curveSegments: 36,
  });
  baffleGeometry.translate(0, 0, -BAFFLE.depth - 0.02);
  const baffleBoard = new THREE.Mesh(baffleGeometry, [baffleMat, driverFrameMetal]);
  baffleBoard.name = 'Rounded composite baffle with through holes';
  baffleGroup.add(baffleBoard);

  const perimeterShape = new THREE.Shape();
  appendRoundedRectangle(perimeterShape, BAFFLE.width - 0.16, BAFFLE.height - 0.16, 0.125);
  const perimeterOpening = new THREE.Path();
  appendRoundedRectangle(perimeterOpening, BAFFLE.width - 0.34, BAFFLE.height - 0.34, 0.075, true);
  perimeterShape.holes.push(perimeterOpening);
  const perimeterGeometry = new THREE.ExtrudeGeometry(perimeterShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.012,
    bevelThickness: 0.009,
    curveSegments: 28,
  });
  perimeterGeometry.translate(0, 0, -0.015);
  const perimeterRim = new THREE.Mesh(perimeterGeometry, driverFrameMetal);
  perimeterRim.name = 'Raised recessed perimeter rim';
  baffleGroup.add(perimeterRim);

  const rearPerimeterGeometry = perimeterGeometry.clone();
  rearPerimeterGeometry.translate(0, 0, -BAFFLE.depth - 0.035);
  const rearPerimeterRim = new THREE.Mesh(rearPerimeterGeometry, driverBasketMetal);
  rearPerimeterRim.name = 'RearBafflePerimeterStiffeningRim';
  baffleGroup.add(rearPerimeterRim);

  for (const [name, x, y, width, height] of [
    ['RearTopStiffeningRail', 0, BAFFLE.height / 2 - 0.19, BAFFLE.width - 0.55, 0.065],
    ['RearBottomStiffeningRail', 0, -BAFFLE.height / 2 + 0.19, BAFFLE.width - 0.55, 0.065],
    ['RearLeftStiffeningRail', -BAFFLE.width / 2 + 0.19, 0, 0.065, BAFFLE.height - 0.5],
    ['RearRightStiffeningRail', BAFFLE.width / 2 - 0.19, 0, 0.065, BAFFLE.height - 0.5],
  ] as const) {
    const rail = rounded(width, height, 0.055, 0.025, driverBasketMetal);
    rail.name = name;
    rail.position.set(x, y, -BAFFLE.depth - 0.045);
    baffleGroup.add(rail);
  }

  const mountingHardware = new THREE.Group();
  mountingHardware.name = 'BaffleMountingHardware';
  for (const [index, [x, y]] of cornerMountPositions.entries()) {
    const washer = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.018, 10, 32), silverHardware);
    washer.name = `CornerMountWasher${index + 1}`;
    washer.position.set(x, y, 0.035);
    const bore = cylinder(0.052, 0.048, 0.026, driverFrameMetal);
    bore.name = `CornerMountDarkBore${index + 1}`;
    bore.position.set(x, y, 0.042);
    const slot = rounded(0.064, 0.013, 0.01, 0.005, driverFrameMetal);
    slot.name = `CornerMountBoreSlot${index + 1}`;
    slot.position.set(x, y, 0.058);
    slot.rotation.z = index % 2 ? -0.45 : 0.45;
    const rearWasher = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.018, 10, 32), driverFrameMetal);
    rearWasher.name = `RearCornerMountWasher${index + 1}`;
    rearWasher.position.set(x, y, -BAFFLE.depth - 0.045);
    mountingHardware.add(washer, bore, slot, rearWasher);
  }
  const insertPositions: THREE.Vector2Tuple[] = [
    [-1.18, 1.22], [1.18, 1.22], [-1.18, -1.22], [1.18, -1.22],
  ];
  for (const [index, [x, y]] of insertPositions.entries()) {
    const insert = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.016, 10, 28), brassDark);
    insert.name = `BrassThreadedInsert${index + 1}`;
    insert.position.set(x, y, 0.034);
    const bore = cylinder(0.026, 0.026, 0.018, driverFrameMetal);
    bore.name = `ThreadedInsertBore${index + 1}`;
    bore.position.set(x, y, 0.036);
    mountingHardware.add(insert, bore);
  }
  baffleGroup.add(mountingHardware);

  function makeDriverCone(
    outerRadius: number,
    innerRadius: number,
    depth: number,
    material: THREE.Material,
  ): THREE.Mesh {
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(innerRadius, outerRadius, depth, 72, 1, true),
      material,
    );
    cone.rotation.x = Math.PI / 2;
    return cone;
  }

  function makeDriverTerminalPair(name: string, scale = 1): THREE.Group {
    const terminals = new THREE.Group();
    terminals.name = name;
    const block = rounded(0.34 * scale, 0.13 * scale, 0.09 * scale, 0.025 * scale, driverTerminal);
    block.name = `${name}InsulatorBlock`;
    terminals.add(block);
    for (const [index, x] of [-0.09 * scale, 0.09 * scale].entries()) {
      const tab = rounded(0.055 * scale, 0.12 * scale, 0.025 * scale, 0.01 * scale, brassDark);
      tab.name = `${name}BrassTab${index + 1}`;
      tab.position.set(x, -0.015 * scale, -0.052 * scale);
      const eyelet = new THREE.Mesh(
        new THREE.TorusGeometry(0.018 * scale, 0.006 * scale, 8, 20),
        brass,
      );
      eyelet.name = `${name}Eyelet${index + 1}`;
      eyelet.position.set(x, -0.015 * scale, -0.07 * scale);
      terminals.add(tab, eyelet);
    }
    return terminals;
  }

  function makeWoofer(): THREE.Group {
    const woofer = new THREE.Group();
    woofer.name = 'WooferAssembly';

    const mountingFlange = new THREE.Mesh(new THREE.RingGeometry(1.12, BAFFLE.wooferRadius, 96), driverFrameMetal);
    mountingFlange.name = 'WooferMountingFlange';
    mountingFlange.position.z = 0.045;
    const frameLip = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.055, 16, 96), driverFrameMetal);
    frameLip.name = 'WooferFrameLip';
    frameLip.position.z = 0.07;
    const surround = new THREE.Mesh(new THREE.TorusGeometry(0.99, 0.155, 22, 96), rubber);
    surround.name = 'WooferRubberSurround';
    surround.position.z = 0.105;
    const cone = makeDriverCone(0.88, 0.43, 0.145, grilleDark);
    cone.name = 'WooferRibbedPaperCone';
    cone.position.z = 0.15;
    woofer.add(mountingFlange, frameLip, surround, cone);

    for (let index = 0; index < 7; index += 1) {
      const radius = 0.53 + index * 0.057;
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 72), dustCapMaterial);
      ridge.name = `WooferConeRidge${index + 1}`;
      ridge.position.z = 0.218 - (radius - 0.43) * 0.16;
      woofer.add(ridge);
    }

    const dustCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 72, 28, 0, Math.PI * 2, 0, Math.PI / 2),
      dustCapMaterial,
    );
    dustCap.name = 'WooferDomedDustCap';
    dustCap.rotation.x = Math.PI / 2;
    dustCap.scale.y = 0.22;
    dustCap.position.z = 0.205;
    woofer.add(dustCap);

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
      const screw = cylinder(0.039, 0.035, 0.025, brassDark);
      screw.name = `WooferMountingScrew${index + 1}`;
      screw.position.set(Math.cos(angle) * 1.29, Math.sin(angle) * 1.29, 0.072);
      woofer.add(screw);
    }

    const rearBasketRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.17, 0.065, 12, 96),
      driverBasketMetal,
    );
    rearBasketRing.name = 'WooferRearBasketRing';
    rearBasketRing.position.z = -BAFFLE.depth - 0.065;
    woofer.add(rearBasketRing);

    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + Math.PI / 8;
      const spoke = rounded(0.67, 0.11, 0.085, 0.025, driverBasketMetal);
      spoke.name = `WooferBasketSpoke${index + 1}`;
      spoke.position.set(Math.cos(angle) * 0.88, Math.sin(angle) * 0.88, -0.34);
      spoke.rotation.z = angle;
      woofer.add(spoke);

      const rearBolt = cylinder(0.032, 0.029, 0.025, driverFrameMetal);
      rearBolt.name = `WooferRearBasketBolt${index + 1}`;
      rearBolt.position.set(
        Math.cos(angle) * 1.14,
        Math.sin(angle) * 1.14,
        -BAFFLE.depth - 0.09,
      );
      woofer.add(rearBolt);
    }

    const motorShoulder = cylinder(0.76, 0.84, 0.14, driverBasketMetal);
    motorShoulder.name = 'WooferMotorShoulder';
    motorShoulder.position.z = -0.38;
    const magnet = cylinder(0.68, 0.68, 0.28, driverMagnetSteel);
    magnet.name = 'WooferFerriteMagnet';
    magnet.position.z = -0.57;
    const rearPolePlate = cylinder(0.74, 0.72, 0.11, driverFrameMetal);
    rearPolePlate.name = 'WooferRearPolePlate';
    rearPolePlate.position.z = -0.765;
    const rearCap = cylinder(0.61, 0.63, 0.09, driverMagnetSteel);
    rearCap.name = 'WooferRearMotorCap';
    rearCap.position.z = -0.865;
    const rearVent = new THREE.Mesh(
      new THREE.TorusGeometry(0.18, 0.028, 10, 40),
      driverFrameMetal,
    );
    rearVent.name = 'WooferRearVentRing';
    rearVent.position.z = -0.915;
    const ventWell = cylinder(0.15, 0.15, 0.018, dustCapMaterial);
    ventWell.name = 'WooferRearVentWell';
    ventWell.position.z = -0.92;
    woofer.add(motorShoulder, magnet, rearPolePlate, rearCap, rearVent, ventWell);

    const wooferTerminals = makeDriverTerminalPair('WooferTerminalPair', 0.9);
    wooferTerminals.position.set(0.98, -0.43, -0.45);
    wooferTerminals.rotation.z = -0.35;
    woofer.add(wooferTerminals);

    woofer.position.y = -0.06;
    return woofer;
  }

  function makeTweeter(name: string, x: number): THREE.Group {
    const tweeter = new THREE.Group();
    tweeter.name = name;
    const flange = new THREE.Mesh(new THREE.RingGeometry(0.51, BAFFLE.tweeterRadius, 72), driverFrameMetal);
    flange.name = `${name}MountingFlange`;
    flange.position.z = 0.05;
    const frameLip = new THREE.Mesh(new THREE.TorusGeometry(0.51, 0.042, 14, 72), driverFrameMetal);
    frameLip.name = `${name}FrameLip`;
    frameLip.position.z = 0.072;
    const surround = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.075, 18, 72), rubber);
    surround.name = `${name}RubberSurround`;
    surround.position.z = 0.105;
    const cone = makeDriverCone(0.35, 0.17, 0.09, grilleDark);
    cone.name = `${name}PaperCone`;
    cone.position.z = 0.145;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.185, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      dustCapMaterial,
    );
    dome.name = `${name}DomedCap`;
    dome.rotation.x = Math.PI / 2;
    dome.scale.y = 0.34;
    dome.position.z = 0.17;
    tweeter.add(flange, frameLip, surround, cone, dome);
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      const screw = cylinder(0.038, 0.034, 0.025, brassDark);
      screw.name = `${name}MountingScrew${index + 1}`;
      screw.position.set(Math.cos(angle) * 0.585, Math.sin(angle) * 0.585, 0.075);
      tweeter.add(screw);
    }

    const rearBasketRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.49, 0.045, 10, 64),
      driverBasketMetal,
    );
    rearBasketRing.name = `${name}RearBasketRing`;
    rearBasketRing.position.z = -BAFFLE.depth - 0.055;
    tweeter.add(rearBasketRing);
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2 + Math.PI / 4;
      const spoke = rounded(0.3, 0.075, 0.065, 0.02, driverBasketMetal);
      spoke.name = `${name}RearSpoke${index + 1}`;
      spoke.position.set(Math.cos(angle) * 0.35, Math.sin(angle) * 0.35, -0.285);
      spoke.rotation.z = angle;
      tweeter.add(spoke);
    }
    const rearCup = cylinder(0.4, 0.47, 0.18, driverBasketMetal);
    rearCup.name = `${name}RearCup`;
    rearCup.position.z = -0.31;
    const magnet = cylinder(0.34, 0.36, 0.19, driverMagnetSteel);
    magnet.name = `${name}FerriteMagnet`;
    magnet.position.z = -0.48;
    const rearPlate = cylinder(0.38, 0.37, 0.08, driverFrameMetal);
    rearPlate.name = `${name}RearPolePlate`;
    rearPlate.position.z = -0.615;
    tweeter.add(rearCup, magnet, rearPlate);

    const terminals = makeDriverTerminalPair(`${name}TerminalPair`, 0.72);
    terminals.position.set(0, -0.54, -0.39);
    tweeter.add(terminals);

    tweeter.position.set(x, BAFFLE.tweeterY, 0);
    return tweeter;
  }

  const drivers = new THREE.Group();
  drivers.name = 'ThreeDriverArray';
  drivers.add(
    makeWoofer(),
    makeTweeter('LeftTweeterAssembly', -BAFFLE.tweeterX),
    makeTweeter('RightTweeterAssembly', BAFFLE.tweeterX),
  );
  baffleGroup.add(drivers);

  const baffle = addPart('driver-baffle', 'Driver baffle and speaker drivers', cabinet, baffleGroup, { detachable: true, explodeGroup: 'front-stack' });
  baffle.position.z = ASSEMBLED_DEPTH.driverBaffle;

  const grilleGroup = new THREE.Group();
  grilleGroup.name = 'Perforated metal grille structure';
  const GRILLE = {
    width: CABINET.frontOpeningWidth - 0.04,
    height: CABINET.frontOpeningHeight - 0.04,
    depth: 0.055,
    radius: CABINET.frontOpeningRadius - 0.025,
    edgeInset: 0.035,
  } as const;
  grilleGroup.userData.dimensions = { ...GRILLE };

  // The first service layer fills the complete cabinet aperture. The opaque backing
  // prevents the baffle and drivers from showing through at the edges or between the
  // visual weave, while the textured front surface carries the grille appearance.
  const grilleOcclusionBacking = rounded(
    GRILLE.width,
    GRILLE.height,
    GRILLE.depth,
    GRILLE.radius,
    grilleDark,
  );
  grilleOcclusionBacking.name = 'FullApertureOpaqueGrilleBacking';
  grilleOcclusionBacking.position.z = -0.018;
  grilleGroup.add(grilleOcclusionBacking);

  const grilleBacking = rounded(GRILLE.width, GRILLE.height, 0.045, GRILLE.radius, metalGrille);
  grilleBacking.position.z = 0;
  grilleGroup.add(grilleBacking);
  const grilleEdgeX = GRILLE.width / 2 - GRILLE.edgeInset;
  const grilleEdgeY = GRILLE.height / 2 - GRILLE.edgeInset;
  for (const [x, y, width, height] of [
    [0, grilleEdgeY, GRILLE.width - 0.07, 0.026],
    [0, -grilleEdgeY, GRILLE.width - 0.07, 0.026],
    [-grilleEdgeX, 0, 0.026, GRILLE.height - 0.07],
    [grilleEdgeX, 0, 0.026, GRILLE.height - 0.07],
  ] as const) {
    const grilleEdge = rounded(width, height, 0.028, 0.008, grilleEdgeMetal);
    grilleEdge.position.set(x, y, 0.02);
    grilleGroup.add(grilleEdge);
  }
  const lowerAccent = rounded(GRILLE.width - 0.1, 0.035, 0.052, 0.016, grilleLowerAccent);
  lowerAccent.name = 'LowerBrassGrilleAccent';
  lowerAccent.position.set(0, -GRILLE.height / 2 + 0.07, 0.04);
  grilleGroup.add(lowerAccent);
  const grille = addPart('grille', 'Perforated metal grille', cabinet, grilleGroup, { detachable: true, explodeGroup: 'front-stack' });
  grille.position.z = ASSEMBLED_DEPTH.grille;

  // The reference has a warm gold script badge raised slightly above the dense weave.
  // Two alpha-cut text layers make that relief legible without adding a rectangular decal.
  const badgeShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.4), makeBadgeMaterial('#241708', '#120b04'));
  badgeShadow.position.set(0.018, -0.018, 0.048);
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.4), makeBadgeMaterial());
  badge.position.z = 0.058;
  grille.add(badgeShadow, badge);

  const topGroup = new THREE.Group();
  topGroup.name = 'InsetTopControlAssembly';
  const brassPlateShape = new THREE.Shape();
  appendRoundedRectangle(
    brassPlateShape,
    TOP_CONTROL.width,
    TOP_CONTROL.depth,
    TOP_CONTROL.radius,
  );
  const brassPlateGeometry = new THREE.ExtrudeGeometry(brassPlateShape, {
    depth: TOP_CONTROL.plateThickness,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.014,
    bevelThickness: 0.014,
    curveSegments: 32,
  });
  brassPlateGeometry.rotateX(Math.PI / 2);
  const brassPlate = new THREE.Mesh(brassPlateGeometry, controlPlateBrass);
  brassPlate.name = 'InsetBrassControlPlate';
  brassPlate.position.y = 0.025;
  topGroup.add(brassPlate);
  const panelMarkings = new THREE.Mesh(
    new THREE.PlaneGeometry(TOP_CONTROL.width - 0.1, TOP_CONTROL.depth - 0.08),
    new THREE.MeshBasicMaterial({
      map: controlPanelMarkingsTexture(TOP_CONTROL),
      transparent: true,
      alphaTest: 0.08,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    }),
  );
  panelMarkings.name = 'PhysicalControlPlateLabelsAndScale';
  panelMarkings.rotation.x = -Math.PI / 2;
  panelMarkings.position.y = 0.052;
  panelMarkings.renderOrder = 3;
  topGroup.add(panelMarkings);

  const topPlateFasteners = new THREE.Group();
  topPlateFasteners.name = 'TopPlateFasteners';
  for (const [index, [x, z]] of [
    [-2.21, 0],
    [2.21, 0],
  ].entries()) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 28), silverHardware);
    screw.name = `TopPlateScrew${index + 1}`;
    screw.position.set(x, 0.04, z);
    const slot = rounded(0.055, 0.008, 0.009, 0.002, electronicBlack);
    slot.name = `TopPlateScrewSlot${index + 1}`;
    slot.position.set(x, 0.052, z);
    topPlateFasteners.add(screw, slot);
  }
  topGroup.add(topPlateFasteners);

  const controls = new THREE.Group();
  controls.name = 'AlignedTopControls';
  for (const [knobIndex, x] of TOP_CONTROL.knobXs.entries()) {
    const blackSkirt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.148, 0.11, 48), electronicBlack);
    blackSkirt.name = `ControlKnobBlackSkirt${knobIndex + 1}`;
    blackSkirt.position.set(x, 0.098, 0);
    const goldCap = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.028, 56), brass);
    goldCap.name = `BrassControlKnobCap${knobIndex + 1}`;
    goldCap.position.set(x, 0.167, 0);
    controls.add(blackSkirt, goldCap);
    const indicator = rounded(0.014, 0.008, 0.074, 0.004, new THREE.MeshBasicMaterial({ color: '#a51f23' }));
    indicator.name = `KnobIndicator${knobIndex + 1}`;
    indicator.position.set(x, 0.184, 0.026);
    indicator.rotation.y = -0.18;
    controls.add(indicator);
    for (let ridge = 0; ridge < 24; ridge += 1) {
      const angle = (ridge / 24) * Math.PI * 2;
      const knurl = rounded(0.012, 0.074, 0.014, 0.003, vinylEdge);
      knurl.name = `Knob${knobIndex + 1}Knurl${ridge + 1}`;
      knurl.position.set(x + Math.cos(angle) * 0.147, 0.096, Math.sin(angle) * 0.147);
      knurl.rotation.y = -angle;
      controls.add(knurl);
    }
  }
  const leftInputJack = new THREE.Mesh(new THREE.TorusGeometry(0.067, 0.017, 12, 36), brassDark);
  leftInputJack.name = 'LeftInputJack';
  leftInputJack.rotation.x = Math.PI / 2;
  leftInputJack.position.set(TOP_CONTROL.leftJackX, 0.042, 0);
  const leftInputBore = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.027, 32), electronicBlack);
  leftInputBore.name = 'LeftInputJackBore';
  leftInputBore.position.set(TOP_CONTROL.leftJackX, 0.046, 0);
  const sourceButtonBase = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.027, 36), electronicBlack);
  sourceButtonBase.name = 'SourceButtonBlackBase';
  sourceButtonBase.position.set(TOP_CONTROL.leftButtonX, 0.045, 0);
  const sourceButton = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.038, 36), brass);
  sourceButton.name = 'SourceButtonBrassCap';
  sourceButton.position.set(TOP_CONTROL.leftButtonX, 0.073, 0);
  const playButtonBase = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.028, 36), electronicBlack);
  playButtonBase.name = 'PlayPauseButtonBlackBase';
  playButtonBase.position.set(TOP_CONTROL.rightButtonX, 0.046, 0);
  const playButton = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.078, 0.042, 36), brass);
  playButton.name = 'PlayPauseButtonBrassCap';
  playButton.position.set(TOP_CONTROL.rightButtonX, 0.077, 0);
  controls.add(
    leftInputJack,
    leftInputBore,
    sourceButtonBase,
    sourceButton,
    playButtonBase,
    playButton,
  );
  const toggleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.028, 40), brassDark);
  toggleBase.name = 'PowerToggleBase';
  toggleBase.position.set(TOP_CONTROL.toggleX, 0.045, 0);
  const toggleBezelOuter = new THREE.Mesh(new THREE.TorusGeometry(0.073, 0.016, 12, 40), brass);
  toggleBezelOuter.name = 'PowerToggleOuterBezel';
  toggleBezelOuter.rotation.x = Math.PI / 2;
  toggleBezelOuter.position.set(TOP_CONTROL.toggleX, 0.063, 0);
  const toggleBezelInner = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.012, 10, 36), brassDark);
  toggleBezelInner.name = 'PowerToggleInnerBezel';
  toggleBezelInner.rotation.x = Math.PI / 2;
  toggleBezelInner.position.set(TOP_CONTROL.toggleX, 0.071, 0);
  const powerToggle = new THREE.Group();
  powerToggle.name = 'PowerToggleLever';
  powerToggle.position.set(TOP_CONTROL.toggleX, 0.08, 0);
  const powerToggleStem = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.045, 4, 16), brass);
  powerToggleStem.name = 'PowerToggleStem';
  powerToggleStem.position.y = 0.035;
  const toggleTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), brass);
  toggleTip.name = 'PowerToggleTip';
  toggleTip.position.y = 0.085;
  const powerIndicatorMaterial = new THREE.MeshStandardMaterial({
    color: '#40110e',
    emissive: '#120000',
    emissiveIntensity: 0.25,
    metalness: 0.16,
    roughness: 0.42,
  });
  const powerIndicator = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), powerIndicatorMaterial);
  powerIndicator.name = 'PowerToggleIndicator';
  powerIndicator.rotation.x = -Math.PI / 2;
  powerIndicator.position.set(TOP_CONTROL.toggleX - 0.14, 0.058, 0);
  powerToggle.add(powerToggleStem, toggleTip);
  const setPowered = (powered: boolean): void => {
    powerToggle.rotation.z = powered ? -0.32 : 0.32;
    powerIndicatorMaterial.color.set(powered ? '#b5352c' : '#40110e');
    powerIndicatorMaterial.emissive.set(powered ? '#6e1109' : '#120000');
    powerIndicatorMaterial.emissiveIntensity = powered ? 1.1 : 0.25;
  };
  setPowered(false);
  controls.add(toggleBase, toggleBezelOuter, toggleBezelInner, powerIndicator, powerToggle);
  topGroup.add(controls);
  const top = addPart('top-control-deck', 'Top brass control deck', cabinet, topGroup, { detachable: true });
  top.position.set(0, outerHalfHeight - 0.095, TOP_CONTROL.z);

  const boardGroup = new THREE.Group();
  boardGroup.name = 'InternalAmplifierPCBAssembly';
  const BOARD = { width: 5.12, depth: 1.16, thickness: 0.08 } as const;
  const board = rounded(BOARD.width, BOARD.thickness, BOARD.depth, 0.055, pcb);
  board.name = 'BlackAmplifierPCB';
  boardGroup.add(board);

  const traceVertices: number[] = [];
  for (let index = 0; index < 26; index += 1) {
    const x1 = -2.3 + (index % 13) * 0.36;
    const z1 = -0.46 + Math.floor(index / 13) * 0.18;
    const x2 = x1 + 0.18 + (index % 3) * 0.07;
    const z2 = z1 + ((index % 4) - 1.5) * 0.045;
    traceVertices.push(x1, 0.046, z1, x2, 0.046, z1, x2, 0.046, z1, x2, 0.046, z2);
  }
  const traceGeometry = new THREE.BufferGeometry();
  traceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(traceVertices, 3));
  const traces = new THREE.LineSegments(traceGeometry, new THREE.LineBasicMaterial({ color: '#9c703a' }));
  traces.name = 'PCBVisibleCopperTraces';
  boardGroup.add(traces);

  const pcbMountPositions: THREE.Vector2Tuple[] = [
    [-2.34, -0.43], [-2.34, 0.43], [2.34, -0.43], [2.34, 0.43],
  ];
  for (const [index, [x, z]] of pcbMountPositions.entries()) {
    const mountRing = new THREE.Mesh(new THREE.TorusGeometry(0.067, 0.016, 10, 30), copperPad);
    mountRing.name = `PCBMountingRing${index + 1}`;
    mountRing.rotation.x = Math.PI / 2;
    mountRing.position.set(x, 0.052, z);
    const mountBore = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 28), electronicBlack);
    mountBore.name = `PCBMountingBore${index + 1}`;
    mountBore.position.set(x, 0.055, z);
    boardGroup.add(mountRing, mountBore);
  }

  function addCapacitor(
    name: string,
    x: number,
    z: number,
    radius: number,
    height: number,
    silver: boolean,
  ): void {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.02, height, 40),
      silver ? capacitorSilver : electronicGrey,
    );
    body.name = `${name}Body`;
    body.position.set(x, BOARD.thickness / 2 + height / 2, z);
    const base = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.84, radius * 0.15, 10, 36), electronicBlack);
    base.name = `${name}RubberBase`;
    base.rotation.x = Math.PI / 2;
    base.position.set(x, BOARD.thickness / 2 + 0.025, z);
    const topCap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 0.92, 0.014, 40), electronicGrey);
    topCap.name = `${name}Top`;
    topCap.position.set(x, BOARD.thickness / 2 + height + 0.007, z);
    boardGroup.add(body, base, topCap);
    if (radius > 0.18) {
      for (let score = 0; score < 4; score += 1) {
        const scoreLine = rounded(radius * 1.25, 0.008, 0.012, 0.003, electronicBlack);
        scoreLine.name = `${name}SafetyScore${score + 1}`;
        scoreLine.position.set(x, BOARD.thickness / 2 + height + 0.017, z);
        scoreLine.rotation.y = (score / 4) * Math.PI;
        boardGroup.add(scoreLine);
      }
    }
  }
  addCapacitor('MainFilterCapacitor01', 1.28, -0.06, 0.23, 0.54, true);
  addCapacitor('MainFilterCapacitor02', 1.83, -0.06, 0.23, 0.54, true);
  addCapacitor('SecondaryCapacitor01', 0.58, 0.16, 0.125, 0.34, true);
  addCapacitor('SecondaryCapacitor02', -1.4, -0.15, 0.115, 0.31, false);
  addCapacitor('SecondaryCapacitor03', -1.02, 0.13, 0.105, 0.28, false);
  addCapacitor('SecondaryCapacitor04', -0.62, -0.16, 0.115, 0.32, false);

  const relaySpecs = [
    ['InputRelay', -2.06, -0.1, 0.3, 0.32, 0.28],
    ['PowerRelay', 0.82, -0.28, 0.38, 0.34, 0.34],
    ['OutputRelay01', 2.22, -0.2, 0.32, 0.31, 0.3],
    ['OutputRelay02', 2.22, 0.22, 0.28, 0.28, 0.27],
  ] as const;
  for (const [name, x, z, width, height, depth] of relaySpecs) {
    const relay = rounded(width, height, depth, 0.025, electronicBlack);
    relay.name = name;
    relay.position.set(x, BOARD.thickness / 2 + height / 2, z);
    boardGroup.add(relay);
  }

  const heatsink = new THREE.Group();
  heatsink.name = 'FinnedVoltageRegulatorHeatsink';
  for (let fin = 0; fin < 5; fin += 1) {
    const finMesh = rounded(0.035, 0.43, 0.24, 0.008, electronicGrey);
    finMesh.name = `HeatsinkFin${fin + 1}`;
    finMesh.position.set(-1.84 + fin * 0.055, BOARD.thickness / 2 + 0.215, 0.28);
    heatsink.add(finMesh);
  }
  boardGroup.add(heatsink);

  const chipSpecs = [
    ['MainAmplifierIC', 0.05, -0.08, 0.48, 0.06, 0.28],
    ['ControllerIC', -0.38, 0.25, 0.34, 0.055, 0.2],
    ['PowerDriverIC', 0.46, -0.3, 0.3, 0.06, 0.2],
    ['InputProcessorIC', -0.8, -0.3, 0.28, 0.055, 0.18],
  ] as const;
  for (const [name, x, z, width, height, depth] of chipSpecs) {
    const chip = rounded(width, height, depth, 0.012, electronicBlack);
    chip.name = name;
    chip.position.set(x, BOARD.thickness / 2 + height / 2, z);
    boardGroup.add(chip);
    for (const side of [-1, 1]) {
      for (let pin = 0; pin < 6; pin += 1) {
        const chipPin = rounded(0.025, 0.015, 0.022, 0.004, capacitorSilver);
        chipPin.name = `${name}Pin${side === -1 ? 'L' : 'R'}${pin + 1}`;
        chipPin.position.set(
          x + side * (width / 2 + 0.014),
          BOARD.thickness / 2 + 0.012,
          z - depth * 0.38 + pin * (depth * 0.76 / 5),
        );
        boardGroup.add(chipPin);
      }
    }
  }

  function addConnector(name: string, x: number, z: number, pins: number): void {
    const housing = rounded(0.22 + pins * 0.055, 0.24, 0.24, 0.025, connectorWhite);
    housing.name = `${name}Housing`;
    housing.position.set(x, BOARD.thickness / 2 + 0.12, z);
    boardGroup.add(housing);
    for (let pin = 0; pin < pins; pin += 1) {
      const contact = rounded(0.025, 0.16, 0.025, 0.004, copperPad);
      contact.name = `${name}Contact${pin + 1}`;
      contact.position.set(
        x - ((pins - 1) * 0.055) / 2 + pin * 0.055,
        BOARD.thickness / 2 + 0.12,
        z - 0.125,
      );
      boardGroup.add(contact);
    }
  }
  addConnector('LeftPowerConnector', -2.2, 0.3, 4);
  addConnector('RightSignalConnector', 2.22, 0.31, 4);

  const smdGroup = new THREE.Group();
  smdGroup.name = 'SurfaceMountComponentField';
  for (let index = 0; index < 42; index += 1) {
    const x = -2.05 + (index % 14) * 0.29;
    const z = -0.45 + Math.floor(index / 14) * 0.18;
    if ((x > 0.95 && x < 2.1) || (x < -1.6 && z > 0.15)) continue;
    const component = rounded(
      index % 3 === 0 ? 0.075 : 0.052,
      0.025,
      0.036,
      0.006,
      index % 4 === 0 ? copperPad : electronicGrey,
    );
    component.name = `SMDComponent${index + 1}`;
    component.position.set(x, BOARD.thickness / 2 + 0.018, z);
    smdGroup.add(component);
  }
  boardGroup.add(smdGroup);

  const controlAlignment = new THREE.Group();
  controlAlignment.name = 'TopControlAlignmentAnchors';
  for (const [index, x] of TOP_CONTROL.knobXs.entries()) {
    const potentiometer = rounded(0.24, 0.12, 0.22, 0.02, electronicBlack);
    potentiometer.name = `ControlPotentiometer${index + 1}`;
    potentiometer.position.set(x, BOARD.thickness / 2 + 0.06, 0.34);
    const shaftAnchor = new THREE.Object3D();
    shaftAnchor.name = `ControlShaftAxis${index + 1}`;
    shaftAnchor.position.set(x, BOARD.thickness / 2 + 0.12, 0);
    controlAlignment.add(potentiometer, shaftAnchor);
  }
  const toggleAnchor = new THREE.Object3D();
  toggleAnchor.name = 'ToggleShaftAxis';
  toggleAnchor.position.set(TOP_CONTROL.toggleX, BOARD.thickness / 2 + 0.1, 0);
  controlAlignment.add(toggleAnchor);
  boardGroup.add(controlAlignment);

  const amplifier = addPart('amplifier-board', 'Amplifier circuit board', cabinet, boardGroup, { detachable: true, explodeGroup: 'internal-system' });
  amplifier.position.set(0, 0.78, TOP_CONTROL.z);

  const rearGroup = new THREE.Group();
  rearGroup.name = 'LeatherRearCoverAssembly';
  const rearCoverShape = new THREE.Shape();
  appendRoundedRectangle(
    rearCoverShape,
    REAR.coverWidth,
    REAR.coverHeight,
    REAR.coverRadius,
  );
  const rearHandleHole = new THREE.Path();
  appendCapsule(
    rearHandleHole,
    REAR.handleWidth,
    REAR.handleHeight,
    REAR.handleX,
    REAR.handleY,
    true,
  );
  rearCoverShape.holes.push(rearHandleHole);
  const rearIecHole = new THREE.Path();
  appendChamferedRectangle(
    rearIecHole,
    REAR.iecWidth,
    REAR.iecHeight,
    0.1,
    REAR.iecX,
    REAR.iecY,
    true,
  );
  rearCoverShape.holes.push(rearIecHole);

  const rearCoverBorePositions: THREE.Vector2Tuple[] = [
    [-2.7, 1.49], [-0.9, 1.49], [0.9, 1.49], [2.7, 1.49],
    [-2.7, 0], [2.7, 0],
    [-2.7, -1.49], [-0.9, -1.49], [0.9, -1.49], [2.7, -1.49],
  ];
  for (const [x, y] of rearCoverBorePositions) {
    const bore = new THREE.Path();
    bore.absarc(x, y, 0.07, 0, Math.PI * 2, true);
    rearCoverShape.holes.push(bore);
  }
  const rearCoverGeometry = new THREE.ExtrudeGeometry(rearCoverShape, {
    depth: REAR.coverDepth,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.025,
    bevelThickness: 0.018,
    curveSegments: 32,
  });
  rearCoverGeometry.translate(0, 0, -REAR.coverDepth);
  const rearCoverMesh = new THREE.Mesh(rearCoverGeometry, cabinetLeather);
  rearCoverMesh.name = 'LeatherRearCoverWithTrueOpenings';
  rearGroup.add(rearCoverMesh);

  const rearSurfaceZ = -REAR.coverDepth - 0.012;
  for (const [index, [x, y]] of rearCoverBorePositions.entries()) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.018, 10, 28), vinylEdge);
    ring.name = `RearCoverMountBoreRing${index + 1}`;
    ring.position.set(x, y, rearSurfaceZ);
    rearGroup.add(ring);
  }

  const handleLipShape = new THREE.Shape();
  appendCapsule(
    handleLipShape,
    REAR.handleWidth + 0.22,
    REAR.handleHeight + 0.2,
    REAR.handleX,
    REAR.handleY,
  );
  const handleLipOpening = new THREE.Path();
  appendCapsule(
    handleLipOpening,
    REAR.handleWidth,
    REAR.handleHeight,
    REAR.handleX,
    REAR.handleY,
    true,
  );
  handleLipShape.holes.push(handleLipOpening);
  const handleLipGeometry = new THREE.ExtrudeGeometry(handleLipShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.018,
    bevelThickness: 0.012,
    curveSegments: 32,
  });
  handleLipGeometry.translate(0, 0, -REAR.coverDepth - 0.045);
  const handleLip = new THREE.Mesh(handleLipGeometry, rubber);
  handleLip.name = 'RearHandleOpeningLip';
  rearGroup.add(handleLip);

  const iecFrameShape = new THREE.Shape();
  appendChamferedRectangle(
    iecFrameShape,
    REAR.iecWidth + 0.22,
    REAR.iecHeight + 0.2,
    0.14,
    REAR.iecX,
    REAR.iecY,
  );
  const iecFrameOpening = new THREE.Path();
  appendChamferedRectangle(
    iecFrameOpening,
    REAR.iecWidth,
    REAR.iecHeight,
    0.1,
    REAR.iecX,
    REAR.iecY,
    true,
  );
  iecFrameShape.holes.push(iecFrameOpening);
  const iecFrameGeometry = new THREE.ExtrudeGeometry(iecFrameShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.015,
    bevelThickness: 0.012,
    curveSegments: 18,
  });
  iecFrameGeometry.translate(0, 0, -REAR.coverDepth - 0.045);
  const rearIecFrame = new THREE.Mesh(iecFrameGeometry, rubber);
  rearIecFrame.name = 'RearCoverPowerInletFrame';
  rearGroup.add(rearIecFrame);

  const rear = addPart('rear-panel', 'Leather rear cover with handle', cabinet, rearGroup, { detachable: true, explodeGroup: 'rear-stack' });
  rear.position.z = ASSEMBLED_DEPTH.rearPanel;

  const ioGroup = new THREE.Group();
  ioGroup.name = 'OutermostBrassRearInterfaceAssembly';
  const rearMetalShape = new THREE.Shape();
  appendRoundedRectangle(
    rearMetalShape,
    REAR.metalWidth,
    REAR.metalHeight,
    REAR.metalRadius,
  );
  const rearMetalFastenerPositions: THREE.Vector2Tuple[] = [
    [-2.48, 0.68], [0, 0.68], [2.48, 0.68],
    [-2.48, -0.68], [0, -0.68], [2.48, -0.68],
  ];
  for (const [x, y] of rearMetalFastenerPositions) {
    const hole = new THREE.Path();
    hole.absarc(x, y, 0.065, 0, Math.PI * 2, true);
    rearMetalShape.holes.push(hole);
  }
  for (const [x, radius] of [
    [-2.18, 0.075], [-1.43, 0.18], [-0.48, 0.13], [0.28, 0.13], [1.12, 0.14],
  ] as const) {
    const hole = new THREE.Path();
    hole.absarc(x, 0, radius, 0, Math.PI * 2, true);
    rearMetalShape.holes.push(hole);
  }
  const rearMetalIecHole = new THREE.Path();
  appendChamferedRectangle(
    rearMetalIecHole,
    0.58,
    0.72,
    0.09,
    2.05,
    0,
    true,
  );
  rearMetalShape.holes.push(rearMetalIecHole);
  const rearMetalGeometry = new THREE.ExtrudeGeometry(rearMetalShape, {
    depth: REAR.metalDepth,
    bevelEnabled: true,
    bevelSegments: 4,
    bevelSize: 0.018,
    bevelThickness: 0.014,
    curveSegments: 28,
  });
  rearMetalGeometry.translate(0, 0, -REAR.metalDepth);
  const ioPlate = new THREE.Mesh(rearMetalGeometry, controlPlateBrass);
  ioPlate.name = 'BrushedBrassOutermostRearPanel';
  ioGroup.add(ioPlate);

  const metalSurfaceZ = -REAR.metalDepth - 0.018;
  for (const [index, [x, y]] of rearMetalFastenerPositions.entries()) {
    const material = index === 1 || index === 4 ? driverFrameMetal : silverHardware;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.017, 10, 28), material);
    ring.name = `RearMetalFastenerRing${index + 1}`;
    ring.position.set(x, y, metalSurfaceZ);
    const center = cylinder(0.038, 0.036, 0.024, index === 1 || index === 4 ? driverFrameMetal : vinylEdge);
    center.name = `RearMetalFastener${index + 1}`;
    center.position.set(x, y, metalSurfaceZ - 0.012);
    ioGroup.add(ring, center);
  }

  const rearToggleBase = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.026, 10, 30), brassDark);
  rearToggleBase.name = 'RearToggleBase';
  rearToggleBase.position.set(-2.18, 0, metalSurfaceZ);
  const toggleStem = cylinder(0.044, 0.05, 0.18, brass);
  toggleStem.name = 'RearToggleStem';
  toggleStem.position.set(-2.18, 0, metalSurfaceZ - 0.09);
  toggleStem.rotation.y = -0.18;
  ioGroup.add(rearToggleBase, toggleStem);

  const mainJackBody = cylinder(0.2, 0.2, 0.12, brassDark);
  mainJackBody.name = 'RearKnurledAudioSocket';
  mainJackBody.position.set(-1.43, 0, metalSurfaceZ - 0.055);
  const mainJackRing = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.03, 10, 32), brass);
  mainJackRing.name = 'RearKnurledAudioSocketRing';
  mainJackRing.position.set(-1.43, 0, metalSurfaceZ - 0.12);
  const mainJackWell = cylinder(0.085, 0.085, 0.025, vinylEdge);
  mainJackWell.name = 'RearKnurledAudioSocketWell';
  mainJackWell.position.set(-1.43, 0, metalSurfaceZ - 0.14);
  ioGroup.add(mainJackBody, mainJackRing, mainJackWell);

  const bindingRed = new THREE.MeshStandardMaterial({ color: '#b2261e', metalness: 0.22, roughness: 0.4 });
  const bindingBlack = new THREE.MeshStandardMaterial({ color: '#17191b', metalness: 0.26, roughness: 0.5 });
  for (const [name, x, material] of [
    ['Positive', -0.48, bindingRed],
    ['Negative', 0.28, bindingBlack],
  ] as const) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 12, 36), material);
    collar.name = `${name}BindingPostCollar`;
    collar.position.set(x, 0, metalSurfaceZ);
    const post = cylinder(0.078, 0.078, 0.11, brass);
    post.name = `${name}BindingPost`;
    post.position.set(x, 0, metalSurfaceZ - 0.055);
    const well = cylinder(0.038, 0.038, 0.025, vinylEdge);
    well.name = `${name}BindingPostWell`;
    well.position.set(x, 0, metalSurfaceZ - 0.12);
    ioGroup.add(collar, post, well);
  }

  const auxRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.028, 10, 32), brassDark);
  auxRing.name = 'RearAuxSocketRing';
  auxRing.position.set(1.12, 0, metalSurfaceZ);
  const auxWell = cylinder(0.072, 0.072, 0.035, vinylEdge);
  auxWell.name = 'RearAuxSocketWell';
  auxWell.position.set(1.12, 0, metalSurfaceZ - 0.045);
  ioGroup.add(auxRing, auxWell);

  const powerFlange = rounded(0.82, 0.9, 0.13, 0.11, rubber);
  powerFlange.name = 'RearIecPowerFlange';
  powerFlange.position.set(2.05, 0, metalSurfaceZ - 0.055);
  const powerRecess = rounded(0.52, 0.66, 0.08, 0.065, vinylEdge);
  powerRecess.name = 'RearIecPowerRecess';
  powerRecess.position.set(2.05, 0, metalSurfaceZ - 0.13);
  ioGroup.add(powerFlange, powerRecess);
  for (const [index, x] of [1.63, 2.47].entries()) {
    const screwRing = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 8, 24), driverFrameMetal);
    screwRing.name = `RearIecMountingRing${index + 1}`;
    screwRing.position.set(x, 0, metalSurfaceZ - 0.13);
    const screw = cylinder(0.028, 0.026, 0.02, driverFrameMetal);
    screw.name = `RearIecMountingScrew${index + 1}`;
    screw.position.set(x, 0, metalSurfaceZ - 0.145);
    ioGroup.add(screwRing, screw);
  }

  for (const [name, x, symbol] of [
    ['PositiveMark', -0.48, 'plus'],
    ['NegativeMark', 0.28, 'minus'],
  ] as const) {
    const horizontal = rounded(0.12, 0.018, 0.012, 0.006, vinylEdge);
    horizontal.name = name;
    horizontal.position.set(x, 0.32, metalSurfaceZ - 0.01);
    ioGroup.add(horizontal);
    if (symbol === 'plus') {
      const vertical = rounded(0.018, 0.12, 0.012, 0.006, vinylEdge);
      vertical.name = `${name}Vertical`;
      vertical.position.set(x, 0.32, metalSurfaceZ - 0.01);
      ioGroup.add(vertical);
    }
  }

  const io = addPart('rear-io-plate', 'Outermost brass rear interface panel', cabinet, ioGroup, { detachable: true, explodeGroup: 'rear-stack' });
  io.position.set(0, REAR.metalY, ASSEMBLED_DEPTH.rearIo);

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
  root.userData.sculptRuntime = {
    nodes,
    meshes,
    sockets,
    colliders,
    destructionGroups,
    powerToggle: { node: powerToggle, setPowered },
  } satisfies SpeakerRuntime;
  root.userData.stage = 'structural-pass';
  return root;
}
