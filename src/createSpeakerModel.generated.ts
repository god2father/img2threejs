import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions): THREE.MeshPhysicalMaterial {
  const textures = makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : new THREE.Color(typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F'),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clamp01(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: Math.max(1, readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: Math.max(1, readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clamp01(readLayerNumber(spec.specularIntensity, ['base'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    if (bumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = bumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    if (displacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = displacementScale;
      material.displacementBias = -displacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: NOIR S1 Modular Speaker
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createNOIRS1ModularSpeakerModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "NOIR S1 Modular Speaker";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 40, "aspect": 1, "orientation": {"yaw": 0, "pitch": 0, "roll": 0}, "positionHint": [0, 0, 3], "note": "For likeness work, solve the reference camera (forge/stage1_intake/solve_camera_pose.py) so the review render aligns with the photo and the reference can be projected. Confirm by overlay review."}, "approximationNotes": []};

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["vinyl-leather"] = createSculptMaterial(
    "vinyl-leather",
    {"id": "vinyl-leather", "name": "Black leather-like cabinet wrap", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "reference", "baseColor": "#121315", "color": "#121315", "albedo": {"dominant": "#2A2A2A", "secondary": ["#212122", "#393836", "#121212"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_albedo.png", "url": "vinyl-leather_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#2A2A2A", "#212122", "#393836", "#121212", "#98938D"], "pattern": "reference-derived pixel palette", "amplitude": 0.08, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [3, 2], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.331, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.35, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.14, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.788, "variation": 0.157, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_roughness.png", "url": "vinyl-leather_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.0, "variation": 0.08}, "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.273, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_normal.png", "url": "vinyl-leather_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_height.png", "url": "vinyl-leather_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.045, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_height.png", "url": "vinyl-leather_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_ao.png", "url": "vinyl-leather_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "leather-grain", "region": "reference-defined local region", "roughness": 0.38, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "cabinet-seam", "region": "reference-defined local region", "roughness": 0.38, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "notes": "Separate color, roughness, height/normal and AO fields represent black leather-like vinyl.", "finishClass": "worn-composite", "texturePalette": ["#F3F3F2", "#2A2929", "#282727", "#272626", "#131313"], "proceduralTexture": "mottle", "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 0.5, "referencePbr": {"version": "1.0", "sourceImage": "/Users/congt/Documents/img2threejs/assets/material-crops/leather.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.751, "estimatedFidelity": 0.751, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_albedo.png", "url": "vinyl-leather_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_roughness.png", "url": "vinyl-leather_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_height.png", "url": "vinyl-leather_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_normal.png", "url": "vinyl-leather_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/vinyl-leather/vinyl-leather_ao.png", "url": "vinyl-leather_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 180, "sourceHeight": 240, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 15, "width": 180, "height": 225}, "mask": {"backgroundColor": "#F6F6F6", "backgroundNoise": 3.464, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.9032}, "mapStats": {"valueRange": 0.1461, "heightP90Gradient": 0.09956, "roughnessBase": 0.788, "roughnessVariation": 0.157, "normalStrength": 0.273, "blurRadius": 21}, "palette": ["#2A2A2A", "#212122", "#393836", "#121212", "#98938D"]}, "warnings": ["image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak", "low value range weakens height/roughness inference"]}, "shaderNotes": ["Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."]},
    options
  );
  materialMap["grille-cloth"] = createSculptMaterial(
    "grille-cloth",
    {"id": "grille-cloth", "name": "Gold-black woven grille cloth", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "reference", "baseColor": "#3A2C1A", "color": "#3A2C1A", "albedo": {"dominant": "#27221C", "secondary": ["#110E0A", "#443E35", "#726C5C"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_albedo.png", "url": "grille-cloth_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#27221C", "#110E0A", "#443E35", "#726C5C", "#CBC1A8"], "pattern": "reference-derived pixel palette", "amplitude": 0.268, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [18, 12], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.503, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.35, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.14, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.814, "variation": 0.154, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_roughness.png", "url": "grille-cloth_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.35, "variation": 0.08}, "clearcoat": {"base": 0.6, "variation": 0.0}, "clearcoatRoughness": {"base": 0.15, "variation": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.294, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_normal.png", "url": "grille-cloth_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_height.png", "url": "grille-cloth_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.053, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_height.png", "url": "grille-cloth_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_ao.png", "url": "grille-cloth_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "woven-relief", "region": "reference-defined local region", "roughness": 0.5, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "notes": "Weave geometry is instanced; texture channels only add fibre-scale variation.", "finishClass": "candy-coat", "texturePalette": ["#39332B", "#423E35", "#595448", "#554F45", "#716B5F"], "proceduralTexture": "gradient-smoke", "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 0.7, "referencePbr": {"version": "1.0", "sourceImage": "/Users/congt/Documents/img2threejs/assets/material-crops/grille.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.909, "estimatedFidelity": 0.909, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_albedo.png", "url": "grille-cloth_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_roughness.png", "url": "grille-cloth_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_height.png", "url": "grille-cloth_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_normal.png", "url": "grille-cloth_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/grille-cloth/grille-cloth_ao.png", "url": "grille-cloth_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 275, "sourceHeight": 155, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 275, "height": 155}, "mask": {"backgroundColor": "#433F32", "backgroundNoise": 95.174, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.7273}, "mapStats": {"valueRange": 0.6374, "heightP90Gradient": 0.11781, "roughnessBase": 0.814, "roughnessVariation": 0.154, "normalStrength": 0.294, "blurRadius": 21}, "palette": ["#27221C", "#110E0A", "#443E35", "#726C5C", "#CBC1A8"]}, "warnings": []}, "shaderNotes": ["Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."]},
    options
  );
  materialMap["brushed-brass"] = createSculptMaterial(
    "brushed-brass",
    {"id": "brushed-brass", "name": "Warm brushed brass", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "reference", "baseColor": "#B88645", "color": "#B88645", "albedo": {"dominant": "#C7A882", "secondary": ["#B38F66", "#8B6B48", "#E1CEB5"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_albedo.png", "url": "brushed-brass_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#C7A882", "#B38F66", "#8B6B48", "#E1CEB5", "#31261A"], "pattern": "reference-derived pixel palette", "amplitude": 0.271, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [6, 1], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.506, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.35, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.14, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.684, "variation": 0.091, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_roughness.png", "url": "brushed-brass_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 1.0, "variation": 0.08}, "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.215, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_normal.png", "url": "brushed-brass_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_height.png", "url": "brushed-brass_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.023, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_height.png", "url": "brushed-brass_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_ao.png", "url": "brushed-brass_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "brushed-grain", "region": "reference-defined local region", "roughness": 0.11000000000000001, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "polished-knob-caps", "region": "reference-defined local region", "roughness": 0.11000000000000001, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "notes": "Directional independent roughness/normal fields give brass its brushed response.", "finishClass": "brushed-steel", "texturePalette": ["#F0EFEE", "#D5C5B2", "#D8C8B5", "#DAC9B6", "#EEE9E4"], "proceduralTexture": "brushed", "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "anisotropy": {"base": 1.0}, "referencePbr": {"version": "1.0", "sourceImage": "/Users/congt/Documents/img2threejs/assets/material-crops/brass.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.909, "estimatedFidelity": 0.909, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_albedo.png", "url": "brushed-brass_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_roughness.png", "url": "brushed-brass_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_height.png", "url": "brushed-brass_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_normal.png", "url": "brushed-brass_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/brushed-brass/brushed-brass_ao.png", "url": "brushed-brass_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 430, "sourceHeight": 130, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 43, "width": 429, "height": 87}, "mask": {"backgroundColor": "#F3F1F0", "backgroundNoise": 1.732, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.288}, "mapStats": {"valueRange": 0.645, "heightP90Gradient": 0.05025, "roughnessBase": 0.684, "roughnessVariation": 0.091, "normalStrength": 0.215, "blurRadius": 21}, "palette": ["#C7A882", "#B38F66", "#8B6B48", "#E1CEB5", "#31261A"]}, "warnings": []}, "shaderNotes": ["Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."]},
    options
  );
  materialMap["mdf-wood"] = createSculptMaterial(
    "mdf-wood",
    {"id": "mdf-wood", "name": "Warm MDF acoustic chamber", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "reference", "baseColor": "#684827", "color": "#684827", "albedo": {"dominant": "#3B2A19", "secondary": ["#2A1D0F", "#4E3A26", "#17110B"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_albedo.png", "url": "mdf-wood_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#3B2A19", "#2A1D0F", "#4E3A26", "#17110B", "#6E6357"], "pattern": "reference-derived pixel palette", "amplitude": 0.114, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [4, 4], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.375, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.35, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.14, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.715, "variation": 0.125, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_roughness.png", "url": "mdf-wood_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.0, "variation": 0.08}, "clearcoat": {"base": 1.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.05, "variation": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.238, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_normal.png", "url": "mdf-wood_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_height.png", "url": "mdf-wood_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.031, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_height.png", "url": "mdf-wood_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_ao.png", "url": "mdf-wood_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "mdf-cut-edges", "region": "reference-defined local region", "roughness": 0.65, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "mdf-shelf", "region": "reference-defined local region", "roughness": 0.65, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "notes": "Interior finish is an inferred MDF approximation from the exploded view.", "finishClass": "painted-metal", "texturePalette": ["#383735", "#352B20", "#3B2A18", "#373028", "#362D24"], "proceduralTexture": "flat-clearcoat", "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "referencePbr": {"version": "1.0", "sourceImage": "/Users/congt/Documents/img2threejs/assets/material-crops/mdf.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.857, "estimatedFidelity": 0.857, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_albedo.png", "url": "mdf-wood_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_roughness.png", "url": "mdf-wood_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_height.png", "url": "mdf-wood_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_normal.png", "url": "mdf-wood_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/mdf-wood/mdf-wood_ao.png", "url": "mdf-wood_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 275, "sourceHeight": 220, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 275, "height": 220}, "mask": {"backgroundColor": "#3B3331", "backgroundNoise": 22.847, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.6404}, "mapStats": {"valueRange": 0.271, "heightP90Gradient": 0.06934, "roughnessBase": 0.715, "roughnessVariation": 0.125, "normalStrength": 0.238, "blurRadius": 21}, "palette": ["#3B2A19", "#2A1D0F", "#4E3A26", "#17110B", "#6E6357"]}, "warnings": []}, "shaderNotes": ["Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."]},
    options
  );
  materialMap["driver-composite"] = createSculptMaterial(
    "driver-composite",
    {"id": "driver-composite", "name": "Driver cone and retaining rings", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "reference", "baseColor": "#101216", "color": "#101216", "albedo": {"dominant": "#504C46", "secondary": ["#0F0E0B", "#7B6F60", "#2D241B"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_albedo.png", "url": "driver-composite_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#504C46", "#0F0E0B", "#7B6F60", "#2D241B", "#C9B596"], "pattern": "reference-derived pixel palette", "amplitude": 0.257, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [1, 1], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.494, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.35, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.14, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.69, "variation": 0.137, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_roughness.png", "url": "driver-composite_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 0.0, "variation": 0.08}, "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.24, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_normal.png", "url": "driver-composite_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_height.png", "url": "driver-composite_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.032, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_height.png", "url": "driver-composite_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_ao.png", "url": "driver-composite_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "cone-ridges", "region": "reference-defined local region", "roughness": 0.26, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "rubber-surround", "region": "reference-defined local region", "roughness": 0.26, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "notes": "Driver profiles carry the primary concentric relief in geometry.", "finishClass": "worn-composite", "texturePalette": ["#37332E", "#37342E", "#2A2825", "#343330", "#262522"], "proceduralTexture": "mottle", "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 0.5, "referencePbr": {"version": "1.0", "sourceImage": "/Users/congt/Documents/img2threejs/assets/material-crops/drivers-refined.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.909, "estimatedFidelity": 0.909, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_albedo.png", "url": "driver-composite_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_roughness.png", "url": "driver-composite_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_height.png", "url": "driver-composite_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_normal.png", "url": "driver-composite_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/driver-composite/driver-composite_ao.png", "url": "driver-composite_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 180, "sourceHeight": 165, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 180, "height": 165}, "mask": {"backgroundColor": "#281D16", "backgroundNoise": 25.573, "transparentPixelFraction": 0.0, "foregroundCoverage": 0.2471}, "mapStats": {"valueRange": 0.612, "heightP90Gradient": 0.07142, "roughnessBase": 0.69, "roughnessVariation": 0.137, "normalStrength": 0.24, "blurRadius": 21}, "palette": ["#504C46", "#0F0E0B", "#7B6F60", "#2D241B", "#C9B596"]}, "warnings": []}, "shaderNotes": ["Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."]},
    options
  );
  materialMap["matte-black"] = createSculptMaterial(
    "matte-black",
    {"id": "matte-black", "name": "Matte black panel and fastener finish", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "reference", "baseColor": "#121416", "color": "#121416", "albedo": {"dominant": "#2A2A2B", "secondary": ["#343534", "#F4F4F4", "#0B0B0B"], "samplingNotes": "Reference-derived from foreground pixels; de-lit to reduce baked shadows/highlights.", "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_albedo.png", "url": "matte-black_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}}, "colorVariation": {"palette": ["#2A2A2B", "#343534", "#F4F4F4", "#0B0B0B", "#505050"], "pattern": "reference-derived pixel palette", "amplitude": 0.35, "heightCorrelation": 0.42}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [5, 5], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 2.0, "amplitude": 0.52, "role": "reference-derived broad albedo and height breakup"}, {"id": "meso", "frequency": 14.0, "amplitude": 0.206, "role": "reference-derived cracks, ridges, pores, grain, or leaf clusters"}, {"id": "micro", "frequency": 72.0, "amplitude": 0.087, "role": "reference-derived micro highlight breakup under grazing light"}], "roughness": {"base": 0.692, "variation": 0.05, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_roughness.png", "url": "matte-black_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "localResponse": "reference-derived roughness estimate; cavities and textured zones trend rougher, bright highlights trend smoother"}, "metalness": {"base": 1.0, "variation": 0.08}, "clearcoat": {"base": 0.0, "variation": 0.0}, "clearcoatRoughness": {"base": 0.0, "variation": 0.0}, "normal": {"pattern": "reference-derived height-gradient normal map", "strength": 0.172, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_normal.png", "url": "matte-black_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "heightSource": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_height.png", "url": "matte-black_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "space": "tangent"}, "bump": {"pattern": "reference-derived height field", "amplitude": 0.01, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_height.png", "url": "matte-black_height.png", "channel": "height", "source": "reference-pixel-extraction"}}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.38, "contactShadowBias": 0.35, "map": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_ao.png", "url": "matte-black_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}, "notes": "Reference-derived cavity estimate from local height minima; verify against grazing-light screenshot."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "fastener-wells", "region": "reference-defined local region", "roughness": 0.36, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "handle-cavity", "region": "reference-defined local region", "roughness": 0.36, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, {"id": "reference-pbr-pixel-evidence", "type": "material-map-evidence", "evidenceRefs": ["full-object"], "channels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "notes": "Use generated maps as material evidence, then refine after browser screenshot comparison."}], "notes": "Used for baffle, rear panel and fasteners with independent cavity AO.", "finishClass": "brushed-steel", "texturePalette": ["#F5F5F5", "#252425", "#2D2E2D", "#2F2F2E", "#1F1E1E"], "proceduralTexture": "brushed", "transmission": {"base": 0.0, "variation": 0.0}, "ior": {"base": 1.5, "value": 1.5}, "envMapIntensity": 1.0, "anisotropy": {"base": 1.0}, "referencePbr": {"version": "1.0", "sourceImage": "/Users/congt/Documents/img2threejs/assets/material-crops/matte-black-refined.png", "extractor": "stage1_intake/extract_pbr_evidence.py", "method": "single-image pixel evidence with de-lighting estimate; not photogrammetry", "usable": true, "verdict": "pass", "confidence": 0.745, "estimatedFidelity": 0.745, "targetThreshold": 0.7, "hardLimit": "A single image cannot uniquely recover true albedo/roughness/normal/AO; maps are reference-derived estimates.", "maps": {"albedo": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_albedo.png", "url": "matte-black_albedo.png", "channel": "albedo", "source": "reference-pixel-extraction"}, "roughness": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_roughness.png", "url": "matte-black_roughness.png", "channel": "roughness", "source": "reference-pixel-extraction"}, "height": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_height.png", "url": "matte-black_height.png", "channel": "height", "source": "reference-pixel-extraction"}, "normal": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_normal.png", "url": "matte-black_normal.png", "channel": "normal", "source": "reference-pixel-extraction"}, "ao": {"path": "/Users/congt/Documents/img2threejs/sculpt/noir-pbr/matte-black/matte-black_ao.png", "url": "matte-black_ao.png", "channel": "ao", "source": "reference-pixel-extraction"}}, "diagnostics": {"sourceWidth": 300, "sourceHeight": 90, "mapSize": 1024, "cropBBoxPixels": {"x": 0, "y": 0, "width": 300, "height": 90}, "mask": {"backgroundColor": "#F5F5F5", "backgroundNoise": 353.338, "transparentPixelFraction": 0.0, "foregroundCoverage": 1.0}, "mapStats": {"valueRange": 0.9255, "heightP90Gradient": 0.01335, "roughnessBase": 0.692, "roughnessVariation": 0.05, "normalStrength": 0.172, "blurRadius": 21}, "palette": ["#2A2A2B", "#343534", "#F4F4F4", "#0B0B0B", "#505050"]}, "warnings": ["foreground mask is tiny; material extraction is likely unreliable", "image is not clearly isolated from background; using most pixels as material evidence", "object/background separation is weak"]}, "shaderNotes": ["Reference-derived maps are estimates from image pixels; verify with neutral, grazing, and reference-matched renders.", "Do not treat baked image shadows as final albedo; rerun extraction with a tighter material crop if highlights/shadows pollute the maps."]},
    options
  );
  materialMap["rubber"] = createSculptMaterial(
    "rubber",
    {"id": "rubber", "name": "Black rubber feet", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "utility", "baseColor": "#090A0B", "color": "#090A0B", "albedo": {"dominant": "#090A0B", "secondary": ["#242526"], "samplingNotes": "Reference-derived local palette; no third-party logo or protected wordmark is copied."}, "colorVariation": {"palette": ["#090A0B", "#242526"], "pattern": "fine moulded rubber grain", "amplitude": 0.04, "heightCorrelation": 0.35}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [5, 5], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.5, "amplitude": 0.18, "role": "broad finish and color variation"}, {"id": "meso", "frequency": 16, "amplitude": 0.1, "role": "grain, weave, brushing, or component relief"}, {"id": "micro", "frequency": 96, "amplitude": 0.035, "role": "grazing-highlight breakup"}], "roughness": {"base": 0.75, "variation": 0.08, "map": "rubber-roughness-independent", "localResponse": "Contact edge is slightly polished."}, "metalness": {"base": 0, "variation": 0.08}, "clearcoat": 0, "clearcoatRoughness": 0.5, "normal": {"pattern": "rubber-independent-height-to-normal", "strength": 0.18, "scale": 75, "space": "tangent"}, "bump": {"pattern": "rubber-independent-height", "amplitude": 0.04, "scale": 75}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.32, "contactShadowBias": 0.34, "notes": "Independent cavity/contact response; not derived from albedo."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "contact-polish", "region": "reference-defined local region", "roughness": 0.63, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}], "notes": "Rubber is visually distinct from black powder-coated panels."},
    options
  );
  materialMap["pcb"] = createSculptMaterial(
    "pcb",
    {"id": "pcb", "name": "Dark green electronics board", "type": "physical-opaque", "shaderModel": "MeshPhysicalMaterial", "qualityTier": "utility", "baseColor": "#173229", "color": "#173229", "albedo": {"dominant": "#173229", "secondary": ["#9B8A43", "#0B1512"], "samplingNotes": "Reference-derived local palette; no third-party logo or protected wordmark is copied."}, "colorVariation": {"palette": ["#173229", "#9B8A43", "#0B1512"], "pattern": "solder pads and masked board field", "amplitude": 0.15, "heightCorrelation": 0.35}, "textureResolution": 1024, "textureProjection": {"mode": "object-space procedural", "repeat": [4, 4], "anisotropy": 8, "texelDensityIntent": "Independent material-frequency texture fields at stable object scale."}, "surfaceFrequencyBands": [{"id": "macro", "frequency": 1.5, "amplitude": 0.18, "role": "broad finish and color variation"}, {"id": "meso", "frequency": 16, "amplitude": 0.1, "role": "grain, weave, brushing, or component relief"}, {"id": "micro", "frequency": 96, "amplitude": 0.035, "role": "grazing-highlight breakup"}], "roughness": {"base": 0.3, "variation": 0.16, "map": "pcb-roughness-independent", "localResponse": "Solder pads are glossier than mask."}, "metalness": {"base": 0.36, "variation": 0.08}, "clearcoat": 0.12, "clearcoatRoughness": 0.18, "normal": {"pattern": "pcb-independent-height-to-normal", "strength": 0.12, "scale": 90, "space": "tangent"}, "bump": {"pattern": "pcb-independent-height", "amplitude": 0.02, "scale": 90}, "displacement": {"pattern": "none", "amplitude": 0, "scale": 1, "silhouetteAffects": false}, "ambientOcclusion": {"cavityStrength": 0.32, "contactShadowBias": 0.34, "notes": "Independent cavity/contact response; not derived from albedo."}, "wear": {"edgeWear": 0.08, "scratches": ["subtle reference-consistent micro scratches"], "chips": []}, "dirt": {"amount": 0.04, "cavityBias": 0.38, "color": "#0A0A0A"}, "localOverrides": [{"id": "solder-pad-gloss", "region": "reference-defined local region", "roughness": 0.18, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}], "notes": "Trace and component geometry are approximate because the exact PCB is not legible."},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const attachment_cabinet_shell_0 = null;
  const endpoint_cabinet_shell_0 = makeAttachmentEndpoint(attachment_cabinet_shell_0);
  const node_cabinet_shell_0 = new THREE.Group();
  node_cabinet_shell_0.name = "Wrapped acoustic cabinet__pivot";
  if (endpoint_cabinet_shell_0) {
    node_cabinet_shell_0.position.copy(endpoint_cabinet_shell_0.start);
    node_cabinet_shell_0.rotation.set(0, 0, 0);
    node_cabinet_shell_0.scale.set(1, 1, 1);
  } else {
    node_cabinet_shell_0.position.set(0.0, 0.0, 0.0);
    node_cabinet_shell_0.rotation.set(0.0, 0.0, 0.0);
    node_cabinet_shell_0.scale.set(1.0, 1.0, 1.0);
  }
  node_cabinet_shell_0.userData.sculptComponent = {"id": "cabinet-shell", "name": "Wrapped acoustic cabinet", "level": "macro", "role": "enclosure", "importance": 1, "confidence": 0.94, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Open-front MDF enclosure assembled from back, side, top, and bottom panels so the exploded view reveals a real chamber.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 4.8, "height": 3, "depth": 2.05, "units": "relative", "confidence": 0.94}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "front-seat", "localPosition": [0, 0, 0.94], "localRotation": [0, 0, 0], "role": "front-assembly"}, {"id": "rear-seat", "localPosition": [0, 0, -0.94], "localRotation": [0, 0, 0], "role": "rear-assembly"}, {"id": "top-seat", "localPosition": [0, 1.45, 0], "localRotation": [0, 0, 0], "role": "control-assembly"}, {"id": "base-seat", "localPosition": [0, -1.45, 0], "localRotation": [0, 0, 0], "role": "isolation-feet"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "vinyl-leather", "materialLayers": ["vinyl-leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "rounded-vinyl-shell", "type": "reference-detail"}, {"id": "cabinet-seam", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(18, 19, 21, 1.0)", "secondaryAlbedo": "rgba(41, 39, 38, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.94, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Open-front MDF enclosure assembled from back, side, top, and bottom panels so the exploded view reveals a real chamber."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["rounded-vinyl-shell", "cabinet-seam"], "fidelityTier": "reference"};
  node_cabinet_shell_0.userData.actionProfile = {"animationRole": "root", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "front-seat", "localPosition": [0, 0, 0.94], "localRotation": [0, 0, 0], "role": "front-assembly"}, {"id": "rear-seat", "localPosition": [0, 0, -0.94], "localRotation": [0, 0, 0], "role": "rear-assembly"}, {"id": "top-seat", "localPosition": [0, 1.45, 0], "localRotation": [0, 0, 0], "role": "control-assembly"}, {"id": "base-seat", "localPosition": [0, -1.45, 0], "localRotation": [0, 0, 0], "role": "isolation-feet"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "rubber"}};
  (nodes["root"] ?? root).add(node_cabinet_shell_0);
  nodes["cabinet-shell"] = node_cabinet_shell_0;
  const mesh_cabinet_shell_0Geometry = endpoint_cabinet_shell_0
    ? new THREE.CylinderGeometry(endpoint_cabinet_shell_0.endRadius, endpoint_cabinet_shell_0.baseRadius, endpoint_cabinet_shell_0.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const mesh_cabinet_shell_0 = new THREE.Mesh(
    mesh_cabinet_shell_0Geometry,
    materialMap["vinyl-leather"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_cabinet_shell_0.name = "Wrapped acoustic cabinet";
  if (endpoint_cabinet_shell_0) {
    mesh_cabinet_shell_0.position.copy(endpoint_cabinet_shell_0.midpoint);
    mesh_cabinet_shell_0.quaternion.copy(endpoint_cabinet_shell_0.quaternion);
  }
  mesh_cabinet_shell_0.castShadow = options.castShadow ?? true;
  mesh_cabinet_shell_0.receiveShadow = options.receiveShadow ?? true;
  mesh_cabinet_shell_0.userData.sculptComponent = {"id": "cabinet-shell", "name": "Wrapped acoustic cabinet", "level": "macro", "role": "enclosure", "importance": 1, "confidence": 0.94, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Open-front MDF enclosure assembled from back, side, top, and bottom panels so the exploded view reveals a real chamber.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": null, "attachment": null, "dimensions": {"width": 4.8, "height": 3, "depth": 2.05, "units": "relative", "confidence": 0.94}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "root", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [{"id": "front-seat", "localPosition": [0, 0, 0.94], "localRotation": [0, 0, 0], "role": "front-assembly"}, {"id": "rear-seat", "localPosition": [0, 0, -0.94], "localRotation": [0, 0, 0], "role": "rear-assembly"}, {"id": "top-seat", "localPosition": [0, 1.45, 0], "localRotation": [0, 0, 0], "role": "control-assembly"}, {"id": "base-seat", "localPosition": [0, -1.45, 0], "localRotation": [0, 0, 0], "role": "isolation-feet"}], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": [], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "vinyl-leather", "materialLayers": ["vinyl-leather"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "rounded-vinyl-shell", "type": "reference-detail"}, {"id": "cabinet-seam", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(18, 19, 21, 1.0)", "secondaryAlbedo": "rgba(41, 39, 38, 1.0)", "materialClass": "skin", "materialClassConfidence": 0.94, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Open-front MDF enclosure assembled from back, side, top, and bottom panels so the exploded view reveals a real chamber."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["rounded-vinyl-shell", "cabinet-seam"], "fidelityTier": "reference"};
  node_cabinet_shell_0.add(mesh_cabinet_shell_0);
  meshes["cabinet-shell"] = mesh_cabinet_shell_0;
  colliders["cabinet-shell"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."};
  destructionGroups["speaker-service-parts"] ??= [];
  destructionGroups["speaker-service-parts"].push(node_cabinet_shell_0);
  const socket_cabinet_shell_front_seat_0 = new THREE.Object3D();
  socket_cabinet_shell_front_seat_0.name = "front-seat";
  socket_cabinet_shell_front_seat_0.position.set(0.0, 0.0, 0.94);
  socket_cabinet_shell_front_seat_0.rotation.set(0.0, 0.0, 0.0);
  socket_cabinet_shell_front_seat_0.userData.socket = {"id": "front-seat", "localPosition": [0, 0, 0.94], "localRotation": [0, 0, 0], "role": "front-assembly"};
  node_cabinet_shell_0.add(socket_cabinet_shell_front_seat_0);
  sockets["cabinet-shell:front-seat"] = socket_cabinet_shell_front_seat_0;
  const socket_cabinet_shell_rear_seat_1 = new THREE.Object3D();
  socket_cabinet_shell_rear_seat_1.name = "rear-seat";
  socket_cabinet_shell_rear_seat_1.position.set(0.0, 0.0, -0.94);
  socket_cabinet_shell_rear_seat_1.rotation.set(0.0, 0.0, 0.0);
  socket_cabinet_shell_rear_seat_1.userData.socket = {"id": "rear-seat", "localPosition": [0, 0, -0.94], "localRotation": [0, 0, 0], "role": "rear-assembly"};
  node_cabinet_shell_0.add(socket_cabinet_shell_rear_seat_1);
  sockets["cabinet-shell:rear-seat"] = socket_cabinet_shell_rear_seat_1;
  const socket_cabinet_shell_top_seat_2 = new THREE.Object3D();
  socket_cabinet_shell_top_seat_2.name = "top-seat";
  socket_cabinet_shell_top_seat_2.position.set(0.0, 1.45, 0.0);
  socket_cabinet_shell_top_seat_2.rotation.set(0.0, 0.0, 0.0);
  socket_cabinet_shell_top_seat_2.userData.socket = {"id": "top-seat", "localPosition": [0, 1.45, 0], "localRotation": [0, 0, 0], "role": "control-assembly"};
  node_cabinet_shell_0.add(socket_cabinet_shell_top_seat_2);
  sockets["cabinet-shell:top-seat"] = socket_cabinet_shell_top_seat_2;
  const socket_cabinet_shell_base_seat_3 = new THREE.Object3D();
  socket_cabinet_shell_base_seat_3.name = "base-seat";
  socket_cabinet_shell_base_seat_3.position.set(0.0, -1.45, 0.0);
  socket_cabinet_shell_base_seat_3.rotation.set(0.0, 0.0, 0.0);
  socket_cabinet_shell_base_seat_3.userData.socket = {"id": "base-seat", "localPosition": [0, -1.45, 0], "localRotation": [0, 0, 0], "role": "isolation-feet"};
  node_cabinet_shell_0.add(socket_cabinet_shell_base_seat_3);
  sockets["cabinet-shell:base-seat"] = socket_cabinet_shell_base_seat_3;

  const attachment_acoustic_chamber_1 = {"parentId": "cabinet-shell", "parentSocket": "front-seat", "localStart": [0, 0, 0.76], "localEnd": [0, 0, 0.92], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]};
  const endpoint_acoustic_chamber_1 = makeAttachmentEndpoint(attachment_acoustic_chamber_1);
  const node_acoustic_chamber_1 = new THREE.Group();
  node_acoustic_chamber_1.name = "MDF acoustic chamber__pivot";
  if (endpoint_acoustic_chamber_1) {
    node_acoustic_chamber_1.position.copy(endpoint_acoustic_chamber_1.start);
    node_acoustic_chamber_1.rotation.set(0, 0, 0);
    node_acoustic_chamber_1.scale.set(1, 1, 1);
  } else {
    node_acoustic_chamber_1.position.set(0.0, 0.0, 0.04);
    node_acoustic_chamber_1.rotation.set(0.0, 0.0, 0.0);
    node_acoustic_chamber_1.scale.set(1.0, 1.0, 1.0);
  }
  node_acoustic_chamber_1.userData.sculptComponent = {"id": "acoustic-chamber", "name": "MDF acoustic chamber", "level": "macro", "role": "internal-volume", "importance": 1, "confidence": 0.78, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Warm MDF inner surfaces, horizontal shelf and rear port aperture; thickness is an inferred low-confidence interior detail.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": "cabinet-shell", "attachment": {"parentId": "cabinet-shell", "parentSocket": "front-seat", "localStart": [0, 0, 0.76], "localEnd": [0, 0, 0.92], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "dimensions": {"width": 4.08, "height": 2.3, "depth": 1.65, "units": "relative", "confidence": 0.78}, "transform": {"position": [0, 0, 0.04], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "mdf-wood", "materialLayers": ["mdf-wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "mdf-shelf", "type": "reference-detail"}, {"id": "rear-port-aperture", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(104, 72, 39, 1.0)", "secondaryAlbedo": "rgba(157, 112, 66, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.78, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Warm MDF inner surfaces, horizontal shelf and rear port aperture; thickness is an inferred low-confidence interior detail."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["mdf-shelf", "rear-port-aperture"], "fidelityTier": "reference"};
  node_acoustic_chamber_1.userData.actionProfile = {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}};
  (nodes["cabinet-shell"] ?? root).add(node_acoustic_chamber_1);
  nodes["acoustic-chamber"] = node_acoustic_chamber_1;
  const mesh_acoustic_chamber_1Geometry = endpoint_acoustic_chamber_1
    ? new THREE.CylinderGeometry(endpoint_acoustic_chamber_1.endRadius, endpoint_acoustic_chamber_1.baseRadius, endpoint_acoustic_chamber_1.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const mesh_acoustic_chamber_1 = new THREE.Mesh(
    mesh_acoustic_chamber_1Geometry,
    materialMap["mdf-wood"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_acoustic_chamber_1.name = "MDF acoustic chamber";
  if (endpoint_acoustic_chamber_1) {
    mesh_acoustic_chamber_1.position.copy(endpoint_acoustic_chamber_1.midpoint);
    mesh_acoustic_chamber_1.quaternion.copy(endpoint_acoustic_chamber_1.quaternion);
  }
  mesh_acoustic_chamber_1.castShadow = options.castShadow ?? true;
  mesh_acoustic_chamber_1.receiveShadow = options.receiveShadow ?? true;
  mesh_acoustic_chamber_1.userData.sculptComponent = {"id": "acoustic-chamber", "name": "MDF acoustic chamber", "level": "macro", "role": "internal-volume", "importance": 1, "confidence": 0.78, "primitive": "box", "topologyClass": "conforming-shell", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Warm MDF inner surfaces, horizontal shelf and rear port aperture; thickness is an inferred low-confidence interior detail.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": "cabinet-shell", "attachment": {"parentId": "cabinet-shell", "parentSocket": "front-seat", "localStart": [0, 0, 0.76], "localEnd": [0, 0, 0.92], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "dimensions": {"width": 4.08, "height": 2.3, "depth": 1.65, "units": "relative", "confidence": 0.78}, "transform": {"position": [0, 0, 0.04], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "mdf-wood", "materialLayers": ["mdf-wood"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "mdf-shelf", "type": "reference-detail"}, {"id": "rear-port-aperture", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(104, 72, 39, 1.0)", "secondaryAlbedo": "rgba(157, 112, 66, 1.0)", "materialClass": "wood", "materialClassConfidence": 0.78, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Warm MDF inner surfaces, horizontal shelf and rear port aperture; thickness is an inferred low-confidence interior detail."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["mdf-shelf", "rear-port-aperture"], "fidelityTier": "reference"};
  node_acoustic_chamber_1.add(mesh_acoustic_chamber_1);
  meshes["acoustic-chamber"] = mesh_acoustic_chamber_1;
  colliders["acoustic-chamber"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."};
  destructionGroups["speaker-service-parts"] ??= [];
  destructionGroups["speaker-service-parts"].push(node_acoustic_chamber_1);

  const attachment_front_assembly_2 = {"parentId": "cabinet-shell", "parentSocket": "front-seat", "localStart": [0, 0, 0.94], "localEnd": [0, 0, 1.1], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]};
  const endpoint_front_assembly_2 = makeAttachmentEndpoint(attachment_front_assembly_2);
  const node_front_assembly_2 = new THREE.Group();
  node_front_assembly_2.name = "Front acoustic stack__pivot";
  if (endpoint_front_assembly_2) {
    node_front_assembly_2.position.copy(endpoint_front_assembly_2.start);
    node_front_assembly_2.rotation.set(0, 0, 0);
    node_front_assembly_2.scale.set(1, 1, 1);
  } else {
    node_front_assembly_2.position.set(0.0, 0.0, 1.04);
    node_front_assembly_2.rotation.set(0.0, 0.0, 0.0);
    node_front_assembly_2.scale.set(1.0, 1.0, 1.0);
  }
  node_front_assembly_2.userData.sculptComponent = {"id": "front-assembly", "name": "Front acoustic stack", "level": "macro", "role": "removable-front-assembly", "importance": 1, "confidence": 0.88, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Container for independently pickable grille, trim and driver baffle.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": "cabinet-shell", "attachment": {"parentId": "cabinet-shell", "parentSocket": "front-seat", "localStart": [0, 0, 0.94], "localEnd": [0, 0, 1.1], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "dimensions": {"width": 4.35, "height": 2.55, "depth": 0.32, "units": "relative", "confidence": 0.88}, "transform": {"position": [0, 0, 1.04], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "matte-black", "materialLayers": ["matte-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "front-stack-seam", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(18, 20, 22, 1.0)", "secondaryAlbedo": "rgba(52, 54, 58, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.88, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Container for independently pickable grille, trim and driver baffle."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["front-stack-seam"], "fidelityTier": "reference"};
  node_front_assembly_2.userData.actionProfile = {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}};
  (nodes["cabinet-shell"] ?? root).add(node_front_assembly_2);
  nodes["front-assembly"] = node_front_assembly_2;
  const mesh_front_assembly_2Geometry = endpoint_front_assembly_2
    ? new THREE.CylinderGeometry(endpoint_front_assembly_2.endRadius, endpoint_front_assembly_2.baseRadius, endpoint_front_assembly_2.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const mesh_front_assembly_2 = new THREE.Mesh(
    mesh_front_assembly_2Geometry,
    materialMap["matte-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_front_assembly_2.name = "Front acoustic stack";
  if (endpoint_front_assembly_2) {
    mesh_front_assembly_2.position.copy(endpoint_front_assembly_2.midpoint);
    mesh_front_assembly_2.quaternion.copy(endpoint_front_assembly_2.quaternion);
  }
  mesh_front_assembly_2.castShadow = options.castShadow ?? true;
  mesh_front_assembly_2.receiveShadow = options.receiveShadow ?? true;
  mesh_front_assembly_2.userData.sculptComponent = {"id": "front-assembly", "name": "Front acoustic stack", "level": "macro", "role": "removable-front-assembly", "importance": 1, "confidence": 0.88, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Container for independently pickable grille, trim and driver baffle.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": "cabinet-shell", "attachment": {"parentId": "cabinet-shell", "parentSocket": "front-seat", "localStart": [0, 0, 0.94], "localEnd": [0, 0, 1.1], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "dimensions": {"width": 4.35, "height": 2.55, "depth": 0.32, "units": "relative", "confidence": 0.88}, "transform": {"position": [0, 0, 1.04], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "matte-black", "materialLayers": ["matte-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "front-stack-seam", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(18, 20, 22, 1.0)", "secondaryAlbedo": "rgba(52, 54, 58, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.88, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Container for independently pickable grille, trim and driver baffle."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["front-stack-seam"], "fidelityTier": "reference"};
  node_front_assembly_2.add(mesh_front_assembly_2);
  meshes["front-assembly"] = mesh_front_assembly_2;
  colliders["front-assembly"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."};
  destructionGroups["speaker-service-parts"] ??= [];
  destructionGroups["speaker-service-parts"].push(node_front_assembly_2);

  const attachment_rear_assembly_3 = {"parentId": "cabinet-shell", "parentSocket": "rear-seat", "localStart": [0, 0, -0.94], "localEnd": [0, 0, -1.1], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]};
  const endpoint_rear_assembly_3 = makeAttachmentEndpoint(attachment_rear_assembly_3);
  const node_rear_assembly_3 = new THREE.Group();
  node_rear_assembly_3.name = "Rear service stack__pivot";
  if (endpoint_rear_assembly_3) {
    node_rear_assembly_3.position.copy(endpoint_rear_assembly_3.start);
    node_rear_assembly_3.rotation.set(0, 0, 0);
    node_rear_assembly_3.scale.set(1, 1, 1);
  } else {
    node_rear_assembly_3.position.set(0.0, 0.0, -1.04);
    node_rear_assembly_3.rotation.set(0.0, 0.0, 0.0);
    node_rear_assembly_3.scale.set(1.0, 1.0, 1.0);
  }
  node_rear_assembly_3.userData.sculptComponent = {"id": "rear-assembly", "name": "Rear service stack", "level": "macro", "role": "removable-rear-assembly", "importance": 1, "confidence": 0.88, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Container for rear panel and brass I/O plate.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": "cabinet-shell", "attachment": {"parentId": "cabinet-shell", "parentSocket": "rear-seat", "localStart": [0, 0, -0.94], "localEnd": [0, 0, -1.1], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "dimensions": {"width": 4, "height": 1.7, "depth": 0.18, "units": "relative", "confidence": 0.88}, "transform": {"position": [0, 0, -1.04], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "matte-black", "materialLayers": ["matte-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "rear-stack-seam", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(18, 20, 22, 1.0)", "secondaryAlbedo": "rgba(52, 54, 58, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.88, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Container for rear panel and brass I/O plate."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["rear-stack-seam"], "fidelityTier": "reference"};
  node_rear_assembly_3.userData.actionProfile = {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}};
  (nodes["cabinet-shell"] ?? root).add(node_rear_assembly_3);
  nodes["rear-assembly"] = node_rear_assembly_3;
  const mesh_rear_assembly_3Geometry = endpoint_rear_assembly_3
    ? new THREE.CylinderGeometry(endpoint_rear_assembly_3.endRadius, endpoint_rear_assembly_3.baseRadius, endpoint_rear_assembly_3.length, 32, 12)
    : new THREE.BoxGeometry(1, 1, 1, 12, 12, 12);
  const mesh_rear_assembly_3 = new THREE.Mesh(
    mesh_rear_assembly_3Geometry,
    materialMap["matte-black"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rear_assembly_3.name = "Rear service stack";
  if (endpoint_rear_assembly_3) {
    mesh_rear_assembly_3.position.copy(endpoint_rear_assembly_3.midpoint);
    mesh_rear_assembly_3.quaternion.copy(endpoint_rear_assembly_3.quaternion);
  }
  mesh_rear_assembly_3.castShadow = options.castShadow ?? true;
  mesh_rear_assembly_3.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_assembly_3.userData.sculptComponent = {"id": "rear-assembly", "name": "Rear service stack", "level": "macro", "role": "removable-rear-assembly", "importance": 1, "confidence": 0.88, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Chosen from the observed part silhouette and the separation required by the exploded reference.", "geometryDescriptor": {"topologyIntent": "Container for rear panel and brass I/O plate.", "edgeTreatment": {"type": "rounded", "bevelRadius": 0.08, "segments": 8}, "deformationStack": [], "uvStrategy": "generated object-space coordinates", "normalStrategy": "smooth analytic vertex normals"}, "parent": "cabinet-shell", "attachment": {"parentId": "cabinet-shell", "parentSocket": "rear-seat", "localStart": [0, 0, -0.94], "localEnd": [0, 0, -1.1], "contactType": "overlap", "overlap": 0.04, "gapTolerance": 0.008, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "dimensions": {"width": 4, "height": 1.7, "depth": 0.18, "units": "relative", "confidence": 0.88}, "transform": {"position": [0, 0, -1.04], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-assembly", "pivot": {"mode": "component-center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.88}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": true, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "speaker-service-parts", "seamRefs": [], "detachableFragments": ["exploded-view"], "breakImpulse": 0, "debrisMaterial": "rubber"}}, "material": "matte-black", "materialLayers": ["matte-black"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "rear-stack-seam", "type": "reference-detail"}], "colorMaterialRecipe": {"dominantAlbedo": "rgba(18, 20, 22, 1.0)", "secondaryAlbedo": "rgba(52, 54, 58, 1.0)", "materialClass": "metal", "materialClassConfidence": 0.88, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"]}, "surfaceDetail": {"macroRoughness": 0.18, "microRoughness": 0.08, "bumpAmplitude": 0.04, "normalPattern": "independent procedural height field", "displacementPattern": "none", "occlusionPattern": "cavity/contact AO", "edgeWearPattern": "subtle edge darkening", "notes": "Container for rear panel and brass I/O plate."}, "evidenceRefs": ["front-view", "front-three-quarter", "rear-view", "exploded-view"], "details": ["rear-stack-seam"], "fidelityTier": "reference"};
  node_rear_assembly_3.add(mesh_rear_assembly_3);
  meshes["rear-assembly"] = mesh_rear_assembly_3;
  colliders["rear-assembly"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Interaction proxy follows this named assembly."};
  destructionGroups["speaker-service-parts"] ??= [];
  destructionGroups["speaker-service-parts"].push(node_rear_assembly_3);

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"minimumTextureResolution": 1024, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py"}}};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createNOIRS1ModularSpeakerLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "NOIR S1 Modular Speaker look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = ["key light: broad warm-white rectangular area above and front-left, soft contact shadows", "fill light: cool neutral broad source from the front-right at lower intensity", "rim/environment light: cool edge light from rear-right and PMREM studio environment", "exposure and tone mapping: ACES Filmic at exposure 1.1, protecting brass highlights", "background and contact shadow: pale reference studio for comparison and a dark product-page studio with soft ground contact shadow for presentation"];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"minimumTextureResolution": 1024, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py"}}};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createNOIRS1ModularSpeakerEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameNOIRS1ModularSpeakerCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createNOIRS1ModularSpeakerPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureNOIRS1ModularSpeakerRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createNOIRS1ModularSpeakerInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
