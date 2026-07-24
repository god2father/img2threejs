import * as THREE from 'three';

export type GlassBuildStage =
  | 'blockout'
  | 'structural-pass'
  | 'form-refinement'
  | 'material-pass'
  | 'surface-pass'
  | 'lighting-pass'
  | 'interaction-pass'
  | 'optimization-pass';

export type GlassRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
  liquidSlosh?: LiquidSloshRuntime;
};

export type LiquidSloshRuntime = {
  surfacePivot: THREE.Group;
  clippingPlane: THREE.Plane;
  currentNormal: THREE.Vector3;
  normalVelocity: THREE.Vector3;
  fillRatio: number;
  surfaceY: number;
};

export type GlassModelOptions = {
  stage?: GlassBuildStage;
  castShadow?: boolean;
  liquid?: boolean;
  liquidLevel?: number;
  liquidColor?: THREE.ColorRepresentation;
};

const STAGE_INDEX: Record<GlassBuildStage, number> = {
  blockout: 0,
  'structural-pass': 1,
  'form-refinement': 2,
  'material-pass': 3,
  'surface-pass': 4,
  'lighting-pass': 5,
  'interaction-pass': 6,
  'optimization-pass': 7,
};

function makeGlassMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    name: 'clear-soda-lime-glass',
    color: new THREE.Color('#ffffff'),
    roughness: 0.035,
    metalness: 0,
    transmission: 1,
    thickness: 0.085,
    ior: 1.52,
    attenuationColor: new THREE.Color('#f2fbff'),
    attenuationDistance: 12,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    specularIntensity: 1,
    specularColor: new THREE.Color('#ffffff'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthWrite: true,
  });
}

function makeBlockoutMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name: 'neutral-blockout',
    color: '#aeb9bc',
    roughness: 0.42,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
}

function createProfile(stage: GlassBuildStage): THREE.Vector2[] {
  const refined = STAGE_INDEX[stage] >= STAGE_INDEX['form-refinement'];
  if (!refined) {
    return [
      new THREE.Vector2(0, -1.1),
      new THREE.Vector2(0.61, -1.1),
      new THREE.Vector2(0.64, -0.84),
      new THREE.Vector2(0.79, 1.08),
      new THREE.Vector2(0.72, 1.08),
      new THREE.Vector2(0.57, -0.72),
      new THREE.Vector2(0, -0.72),
    ];
  }

  return [
    new THREE.Vector2(0, -1.1),
    new THREE.Vector2(0.47, -1.1),
    new THREE.Vector2(0.57, -1.095),
    new THREE.Vector2(0.625, -1.065),
    new THREE.Vector2(0.648, -1.01),
    new THREE.Vector2(0.65, -0.91),
    new THREE.Vector2(0.635, -0.82),
    new THREE.Vector2(0.625, -0.77),
    new THREE.Vector2(0.637, -0.62),
    new THREE.Vector2(0.66, -0.34),
    new THREE.Vector2(0.69, 0.02),
    new THREE.Vector2(0.72, 0.38),
    new THREE.Vector2(0.75, 0.73),
    new THREE.Vector2(0.775, 1.0),
    new THREE.Vector2(0.79, 1.065),
    new THREE.Vector2(0.787, 1.095),
    new THREE.Vector2(0.766, 1.12),
    new THREE.Vector2(0.735, 1.12),
    new THREE.Vector2(0.712, 1.098),
    new THREE.Vector2(0.708, 1.065),
    new THREE.Vector2(0.7, 1.01),
    new THREE.Vector2(0.676, 0.72),
    new THREE.Vector2(0.648, 0.37),
    new THREE.Vector2(0.622, 0.02),
    new THREE.Vector2(0.598, -0.31),
    new THREE.Vector2(0.578, -0.56),
    new THREE.Vector2(0.565, -0.69),
    new THREE.Vector2(0.548, -0.735),
    new THREE.Vector2(0.49, -0.765),
    new THREE.Vector2(0.39, -0.735),
    new THREE.Vector2(0.24, -0.7),
    new THREE.Vector2(0, -0.685),
  ];
}

function createSocket(name: string, position: THREE.Vector3): THREE.Object3D {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.copy(position);
  socket.userData.socket = { role: 'surface-contact', localPosition: position.toArray() };
  return socket;
}

function applyManufacturingWaviness(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute('position');
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index);
    const radius = Math.hypot(point.x, point.z);
    if (radius < 0.1) continue;
    const angle = Math.atan2(point.z, point.x);
    const radialOffset =
      0.00135 * Math.sin(angle * 11 + point.y * 2.6)
      + 0.0007 * Math.sin(angle * 23 - point.y * 5.1);
    const scale = (radius + radialOffset) / radius;
    positions.setXYZ(index, point.x * scale, point.y, point.z * scale);
  }
  positions.needsUpdate = true;
  geometry.userData.surfaceDetail = {
    type: 'subtle-manufacturing-waviness',
    amplitude: 0.00205,
    locality: 'glass-shell-only',
  };
}

function createLiquidVolume(
  fillRatio: number,
  color: THREE.ColorRepresentation,
): {
  group: THREE.Group;
  meshes: Record<string, THREE.Mesh>;
  slosh: LiquidSloshRuntime;
} {
  const group = new THREE.Group();
  group.name = 'liquid';

  const clampedFill = THREE.MathUtils.clamp(fillRatio, 0.08, 0.92);
  const bottomY = -0.65;
  const topY = THREE.MathUtils.lerp(-0.48, 0.9, clampedFill);
  const volumeTopY = Math.min(0.99, topY + 0.34);
  const height = volumeTopY - bottomY;
  const bottomRadius = 0.525;
  const wallProgress = THREE.MathUtils.clamp((topY + 0.69) / 1.7, 0, 1);
  const topRadius = THREE.MathUtils.lerp(0.535, 0.682, wallProgress);
  const volumeTopProgress = THREE.MathUtils.clamp((volumeTopY + 0.69) / 1.7, 0, 1);
  const volumeTopRadius = THREE.MathUtils.lerp(0.535, 0.682, volumeTopProgress);
  const clippingPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), topY);

  const fadeData = new Uint8Array(64 * 4);
  for (let row = 0; row < 64; row += 1) {
    const fade = THREE.MathUtils.smoothstep(row / 63, 0, 0.22);
    const value = Math.round(fade * 255);
    const offset = row * 4;
    fadeData[offset] = value;
    fadeData[offset + 1] = value;
    fadeData[offset + 2] = value;
    fadeData[offset + 3] = 255;
  }
  const bottomFade = new THREE.DataTexture(fadeData, 1, 64, THREE.RGBAFormat);
  bottomFade.name = 'liquid-bottom-fade';
  bottomFade.minFilter = THREE.LinearFilter;
  bottomFade.magFilter = THREE.LinearFilter;
  bottomFade.generateMipmaps = false;
  bottomFade.needsUpdate = true;

  const waterMaterial = new THREE.MeshPhysicalMaterial({
    name: 'clear-water-volume',
    color: new THREE.Color(color),
    roughness: 0.025,
    metalness: 0,
    transmission: 0.92,
    thickness: 0.18,
    ior: 1.333,
    attenuationColor: new THREE.Color('#55c4e2'),
    attenuationDistance: 6,
    clearcoat: 0.35,
    clearcoatRoughness: 0.02,
    transparent: true,
    opacity: 0.16,
    alphaMap: bottomFade,
    clippingPlanes: [clippingPlane],
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });

  const volume = new THREE.Mesh(
    new THREE.CylinderGeometry(volumeTopRadius, bottomRadius, height, 128, 1, true),
    waterMaterial,
  );
  volume.name = 'liquid-volume';
  volume.position.y = bottomY + height / 2;
  volume.renderOrder = 8;
  group.add(volume);

  const surfacePivot = new THREE.Group();
  surfacePivot.name = 'liquid-surface-pivot';
  surfacePivot.position.y = topY;
  group.add(surfacePivot);

  const surfaceProfile = [
    new THREE.Vector2(0, -0.012),
    new THREE.Vector2(topRadius * 0.58, -0.008),
    new THREE.Vector2(topRadius * 0.88, -0.001),
    new THREE.Vector2(topRadius, 0.014),
  ];
  const surfaceMaterial = waterMaterial.clone();
  surfaceMaterial.name = 'water-meniscus-surface';
  surfaceMaterial.alphaMap = null;
  surfaceMaterial.clippingPlanes = [];
  surfaceMaterial.roughness = 0.018;
  surfaceMaterial.transmission = 0.75;
  surfaceMaterial.opacity = 0.22;
  const surface = new THREE.Mesh(
    new THREE.LatheGeometry(surfaceProfile, 128),
    surfaceMaterial,
  );
  surface.name = 'liquid-meniscus';
  surface.renderOrder = 9;
  surfacePivot.add(surface);

  const meniscusEdge = new THREE.Mesh(
    new THREE.TorusGeometry(topRadius - 0.004, 0.007, 12, 128),
    new THREE.MeshBasicMaterial({
      color: '#c9f4ff',
      transparent: true,
      opacity: 0.36,
      depthTest: false,
      depthWrite: false,
    }),
  );
  meniscusEdge.name = 'liquid-meniscus-edge';
  meniscusEdge.rotation.x = Math.PI / 2;
  meniscusEdge.position.y = 0.006;
  meniscusEdge.renderOrder = 10;
  surfacePivot.add(meniscusEdge);

  group.userData.liquid = {
    fillRatio: clampedFill,
    surfaceY: topY,
    ior: 1.333,
    maxVisualTilt: 0.28,
  };

  return {
    group,
    meshes: {
      'liquid-volume': volume,
      'liquid-meniscus': surface,
      'liquid-meniscus-edge': meniscusEdge,
    },
    slosh: {
      surfacePivot,
      clippingPlane,
      currentNormal: new THREE.Vector3(0, 1, 0),
      normalVelocity: new THREE.Vector3(),
      fillRatio: clampedFill,
      surfaceY: topY,
    },
  };
}

const LIQUID_LOCAL_UP = new THREE.Vector3(0, 1, 0);
const LIQUID_WORLD_UP = new THREE.Vector3(0, 1, 0);
const liquidWorldQuaternion = new THREE.Quaternion();
const liquidInverseQuaternion = new THREE.Quaternion();
const liquidTargetNormal = new THREE.Vector3();
const liquidWorldNormal = new THREE.Vector3();
const liquidWorldPoint = new THREE.Vector3();
const liquidNormalMatrix = new THREE.Matrix3();

export function updateLiquidSlosh(root: THREE.Group, deltaSeconds: number): void {
  const runtime = root.userData.sculptRuntime as GlassRuntime | undefined;
  const slosh = runtime?.liquidSlosh;
  const glassPivot = runtime?.nodes['glass-shell'];
  if (!slosh || !glassPivot) return;

  const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 1 / 30);
  root.updateWorldMatrix(true, true);
  glassPivot.getWorldQuaternion(liquidWorldQuaternion);
  liquidInverseQuaternion.copy(liquidWorldQuaternion).invert();
  liquidTargetNormal.copy(LIQUID_WORLD_UP).applyQuaternion(liquidInverseQuaternion).normalize();

  const stiffness = 22;
  const damping = 5.8;
  slosh.normalVelocity.addScaledVector(
    liquidTargetNormal.sub(slosh.currentNormal),
    stiffness * delta,
  );
  slosh.normalVelocity.multiplyScalar(Math.exp(-damping * delta));
  slosh.currentNormal.addScaledVector(slosh.normalVelocity, delta).normalize();

  slosh.surfacePivot.quaternion.setFromUnitVectors(LIQUID_LOCAL_UP, slosh.currentNormal);
  slosh.surfacePivot.updateWorldMatrix(true, false);

  liquidNormalMatrix.getNormalMatrix(glassPivot.matrixWorld);
  liquidWorldNormal.copy(slosh.currentNormal).applyMatrix3(liquidNormalMatrix).normalize();
  slosh.surfacePivot.getWorldPosition(liquidWorldPoint);
  slosh.clippingPlane.setFromNormalAndCoplanarPoint(
    liquidWorldNormal.negate(),
    liquidWorldPoint,
  );
}

export function createClearTumblerModel(options: GlassModelOptions = {}): THREE.Group {
  const stage = options.stage ?? 'optimization-pass';
  const stageIndex = STAGE_INDEX[stage];
  const root = new THREE.Group();
  root.name = 'clear-tumbler-root';

  const glassPivot = new THREE.Group();
  glassPivot.name = 'glass-shell';
  root.add(glassPivot);

  const material = stageIndex >= STAGE_INDEX['material-pass']
    ? makeGlassMaterial()
    : makeBlockoutMaterial();
  const radialSegments = stageIndex >= STAGE_INDEX['optimization-pass'] ? 128 : 160;
  const shellGeometry = new THREE.LatheGeometry(createProfile(stage), radialSegments, 0, Math.PI * 2);
  if (stageIndex >= STAGE_INDEX['surface-pass']) applyManufacturingWaviness(shellGeometry);
  shellGeometry.computeVertexNormals();
  const shell = new THREE.Mesh(shellGeometry, material);
  shell.name = 'glass-shell-mesh';
  shell.castShadow = options.castShadow ?? true;
  shell.receiveShadow = true;
  shell.renderOrder = 1;
  glassPivot.add(shell);

  const meshes: Record<string, THREE.Mesh> = { 'glass-shell': shell };
  const nodes: Record<string, THREE.Object3D> = { root, 'glass-shell': glassPivot };
  const sockets: Record<string, THREE.Object3D> = {};

  if (stageIndex >= STAGE_INDEX['structural-pass']) {
    const accentMaterial = stageIndex >= STAGE_INDEX['material-pass']
      ? makeGlassMaterial()
      : makeBlockoutMaterial();
    if (accentMaterial instanceof THREE.MeshPhysicalMaterial) {
      accentMaterial.thickness = 0.16;
      accentMaterial.roughness = 0.025;
      accentMaterial.attenuationDistance = 8;
    }

    const rimPivot = new THREE.Group();
    rimPivot.name = 'rim';
    rimPivot.position.y = 1.085;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.026, 20, 128), accentMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.name = 'outer-lip-highlight';
    rim.renderOrder = 12;
    rimPivot.add(rim);
    const innerLipMaterial = stageIndex >= STAGE_INDEX['material-pass']
      ? new THREE.MeshBasicMaterial({
        color: '#53656d',
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
      : accentMaterial;
    const innerLip = new THREE.Mesh(new THREE.TorusGeometry(0.714, 0.012, 14, 128), innerLipMaterial);
    innerLip.rotation.x = Math.PI / 2;
    innerLip.position.y = -0.006;
    innerLip.name = 'inner-lip-highlight';
    innerLip.renderOrder = 3;
    rimPivot.add(innerLip);
    glassPivot.add(rimPivot);

    if (stageIndex < STAGE_INDEX['material-pass']) {
      const openingProxy = new THREE.Mesh(
        new THREE.CircleGeometry(0.707, 128),
        new THREE.MeshBasicMaterial({
          color: '#07090a',
          side: THREE.DoubleSide,
          depthTest: false,
          depthWrite: false,
        }),
      );
      openingProxy.name = 'opening-structure-proxy';
      openingProxy.rotation.x = -Math.PI / 2;
      openingProxy.position.y = 1.068;
      openingProxy.renderOrder = 10;
      glassPivot.add(openingProxy);
      meshes['opening-proxy'] = openingProxy;
    }

    const basePivot = new THREE.Group();
    basePivot.name = 'base-ring';
    basePivot.position.y = -0.995;
    const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.585, 0.048, 20, 128), accentMaterial);
    baseRing.rotation.x = Math.PI / 2;
    baseRing.name = 'base-optical-ring';
    baseRing.renderOrder = 2;
    basePivot.add(baseRing);
    glassPivot.add(basePivot);

    nodes.rim = rimPivot;
    nodes['base-ring'] = basePivot;
    meshes.rim = rim;
    meshes['inner-lip'] = innerLip;
    meshes['base-ring'] = baseRing;

    const rimSocket = createSocket('top-rim-seat', new THREE.Vector3(0, 1.085, 0));
    const baseSocket = createSocket('base-ring-seat', new THREE.Vector3(0, -0.995, 0));
    glassPivot.add(rimSocket, baseSocket);
    sockets['glass-shell:top-rim-seat'] = rimSocket;
    sockets['glass-shell:base-ring-seat'] = baseSocket;
  }

  if (stageIndex >= STAGE_INDEX['form-refinement']) {
    const floorMaterial = stageIndex >= STAGE_INDEX['material-pass']
      ? makeGlassMaterial()
      : makeBlockoutMaterial();
    if (floorMaterial instanceof THREE.MeshPhysicalMaterial) {
      floorMaterial.thickness = 0.24;
      floorMaterial.attenuationDistance = 6;
      floorMaterial.depthWrite = true;
    }
    const innerFloor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.52, 0.035, 128, 1, false),
      floorMaterial,
    );
    innerFloor.name = 'recessed-inner-floor';
    innerFloor.position.y = -0.705;
    innerFloor.renderOrder = 2;
    glassPivot.add(innerFloor);
    meshes['inner-floor'] = innerFloor;
  }

  if (options.liquid !== false && stageIndex >= STAGE_INDEX['material-pass']) {
    const liquid = createLiquidVolume(
      options.liquidLevel ?? 0.58,
      options.liquidColor ?? '#9edff0',
    );
    glassPivot.add(liquid.group);
    nodes.liquid = liquid.group;
    Object.assign(meshes, liquid.meshes);
    root.userData.liquidSlosh = liquid.slosh;
  }

  const runtime: GlassRuntime = {
    nodes,
    meshes,
    sockets,
    colliders: {
      body: { type: 'cylinder', radius: 0.72, height: 2.2, center: [0, 0, 0], solidApproximation: true },
    },
    destructionGroups: { 'glass-body': Object.values(meshes) },
    liquidSlosh: root.userData.liquidSlosh as LiquidSloshRuntime | undefined,
  };

  root.userData.sculptRuntime = runtime;
  root.userData.buildStage = stage;
  root.userData.actionReadiness = {
    rootMotionNode: 'root',
    basePivot: [0, -1.1, 0],
    breakable: false,
  };
  root.userData.optimization = {
    radialSegments,
    targetFps: 60,
    lodStrategy: '160 radial segments during look-dev; 128 for the optimized deliverable',
    instancing: 'Not applicable: each optical component is unique and the model uses four meshes.',
  };

  return root;
}
