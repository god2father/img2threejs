import { readFile, writeFile } from 'node:fs/promises';

const assessmentPath = new URL('../sculpt/assessment.json', import.meta.url);
const specPath = new URL('../sculpt/object-sculpt-spec.json', import.meta.url);

const assessment = JSON.parse(await readFile(assessmentPath, 'utf8'));
const spec = JSON.parse(await readFile(specPath, 'utf8'));

const classification = {
  primaryType: 'clear tapered drinking tumbler',
  primaryDomain: 'object',
  formLanguage: ['hard-surface', 'transparent-like', 'rotationally-symmetric', 'smooth'],
  structureKind: ['single body', 'layered shell'],
  motionPotential: ['static prop', 'whole-object transform'],
  materialFamilies: ['glass-like'],
  notes: 'A simple axisymmetric tumbler with outward wall taper, a thick rounded base, a double-reading rim, and a recessed inner floor. Exact refraction and caustics remain an approximation.',
};

const complexity = {
  tier: 'simple',
  scores: {
    silhouetteComplexity: 1,
    componentCount: 1,
    hierarchyDepth: 1,
    repetitionDensity: 0,
    materialLayerCount: 2,
    localDetailDensity: 1,
    occlusionRisk: 1,
    actionReadinessNeed: 1,
  },
  estimatedCounts: {
    macroComponents: 1,
    mesoComponents: 2,
    microFeatureGroups: 0,
    materialLayers: 1,
    repetitionSystems: 0,
  },
  reasoning: [
    'The silhouette is rotationally symmetric and decomposes into one lathed shell plus rim and base optical accents.',
    'Transparency raises shading risk, but does not increase geometric complexity for a real-time approximation.',
  ],
};

const detailInventory = {
  scanMethod: 'component-zones',
  targetMinDetails: 3,
  note: 'Identity details mapped to concrete geometry or material entries.',
  details: [
    { id: 'double-rim', kind: 'bevel', evidenceRefs: ['full-object'], mapsTo: { ref: 'rim/double-lip' } },
    { id: 'heavy-base-step', kind: 'ridge', evidenceRefs: ['full-object'], mapsTo: { ref: 'base-ring/base-step' } },
    { id: 'clear-specular-columns', kind: 'gloss', evidenceRefs: ['full-object'], mapsTo: { ref: 'glass/optical-highlight' } },
  ],
};

assessment.preSpecAssessment.objectClass = classification;
assessment.preSpecAssessment.complexity = complexity;
assessment.preSpecAssessment.specDepthDecision = {
  requiredDepth: 'simple',
  minimumComponentLevels: ['macro', 'meso'],
  needsRepetitionSystems: false,
  needsMaterialLocalOverrides: true,
  needsMultipleReviewViews: true,
  needsActionReadyHierarchy: true,
  rationale: 'A lathed profile is sufficient, while the rim and base require separate named optical forms for reliable review and later tuning.',
};
assessment.preSpecAssessment.unknownsToResolveBeforeImplementation = [];
assessment.preSpecAssessment.detailInventory = detailInventory;
assessment.qualityContract.qualityBar = 'simple';
assessment.qualityContract.definitionOfDone = [
  'At the reference camera, the cup matches the outward taper, overall aspect ratio, elliptical opening, thick base, and double rim.',
  'The glass remains readable on a dark neutral background using physically based transmission, refraction, and controlled studio reflections.',
];
assessment.qualityContract.minimumSpecDepth = {
  macroComponents: 1,
  mesoComponents: 2,
  microFeatureGroups: 0,
  materialLayers: 1,
  repetitionSystems: 0,
  reviewViewpoints: 3,
};

spec.suitability = 'conditional';
spec.scores = {
  object_isolation: 3,
  silhouette_readability: 3,
  depth_inference: 2,
  primitive_decomposition: 3,
  material_procedurality: 2,
  occlusion_risk: 2,
  interaction_fit: 3,
};
spec.preSpecAssessment.objectClass = classification;
spec.preSpecAssessment.complexity = complexity;
spec.preSpecAssessment.specDepthDecision = assessment.preSpecAssessment.specDepthDecision;
spec.preSpecAssessment.unknownsToResolveBeforeImplementation = assessment.preSpecAssessment.unknownsToResolveBeforeImplementation;
spec.preSpecAssessment.detailInventory = detailInventory;
spec.qualityContract = assessment.qualityContract;
spec.qualityTargets = {
  targetFidelity: 0.8,
  mustMatch: [
    'height-to-top-width ratio near 1.35',
    'top opening wider than base by roughly 24 percent',
    'thick transparent base occupying roughly 18 percent of height',
    'rounded double-reading rim and recessed inner floor',
    'glass transmission with narrow vertical reflection bands',
  ],
  niceToHave: ['subtle internal refraction at the base', 'soft contact shadow under the tumbler'],
  fpsTarget: 60,
  reviewViewpoints: ['reference-front', 'three-quarter', 'side-profile'],
};
spec.assumptions = [
  'The unseen back is rotationally symmetric with the visible front.',
  'Wall thickness is approximated at 4 percent of top diameter.',
  'The output targets a convincing browser render rather than exact optical caustics or manufacturing dimensions.',
];
spec.coordinateFrame = {
  front: 'positive Z faces the reference camera',
  up: 'positive Y follows image up',
  scaleReference: 'glass height = 2.2 scene units',
};
spec.silhouette = {
  boundingShape: 'upright truncated cone with gently convex side walls and a heavy cylindrical base',
  aspectRatios: ['height:topDiameter = 1.39', 'bottomDiameter:topDiameter = 0.79', 'baseHeight:totalHeight = 0.18'],
  symmetry: 'continuous rotational symmetry around Y',
  dominantCurves: ['walls flare outward by about 7 degrees', 'top and bottom edges are rounded', 'inner floor rises into a shallow central dish'],
  negativeSpaces: ['large open interior', 'elliptical mouth opening'],
  landmarks: ['outer lip at y=1.10', 'inner floor at y=-0.76', 'bottom contact at y=-1.10'],
};
spec.viewEvidence = [{
  id: 'full-object',
  view: 'front-three-quarter',
  imageRegion: { x: 0, y: 0, width: 1, height: 1, units: 'normalized' },
  observations: [
    'Top rim spans approximately 58 percent of image width and is wider than the foot.',
    'The straight side walls flare outward with mild convexity.',
    'The base is visibly thicker and optically denser than the wall.',
    'Bright vertical studio reflections define both side walls.',
  ],
  confidence: 0.92,
}];

const baseProfile = structuredClone(spec.componentTree[0].actionProfile);
const makeComponent = ({ id, name, level, role, primitive, parent, dimensions, position, material, localFeatures, topology, edge }) => ({
  id,
  name,
  level,
  role,
  importance: level === 'macro' ? 1 : 0.82,
  confidence: 0.9,
  primitive,
  geometryDescriptor: {
    topologyIntent: topology,
    edgeTreatment: edge,
    deformationStack: [],
    uvStrategy: 'cylindrical procedural coordinates',
    normalStrategy: 'smooth analytic vertex normals',
  },
  parent,
  attachment: null,
  dimensions: { ...dimensions, units: 'relative', confidence: 0.9 },
  transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
  actionProfile: structuredClone(baseProfile),
  material,
  materialLayers: [material],
  deformations: [],
  joints: [],
  seams: [],
  localFeatures,
  surfaceDetail: {
    macroRoughness: 0.04,
    microRoughness: 0.015,
    bumpAmplitude: 0.002,
    normalPattern: 'subtle manufacturing waviness',
    displacementPattern: 'none',
    occlusionPattern: 'contact-only',
    edgeWearPattern: 'none',
    notes: 'Glass is optically smooth; surface detail is intentionally below silhouette scale.',
  },
  evidenceRefs: ['full-object'],
  details: localFeatures.map((feature) => typeof feature === 'string' ? feature : feature.id),
  fidelityTier: 'reference',
});

const shell = makeComponent({
  id: 'glass-shell', name: 'Tapered glass shell', level: 'macro', role: 'body', primitive: 'lathe', parent: null,
  dimensions: { width: 1.58, height: 2.2, depth: 1.58 }, position: [0, 0, 0], material: 'glass',
  localFeatures: [{ id: 'wall-taper', type: 'contour' }, { id: 'inner-cavity', type: 'hole' }],
  topology: 'closed lathed cross-section with outer wall, rounded lip, inner wall, and thick concave base',
  edge: { type: 'rounded', bevelRadius: 0.035, segments: 8 },
});
shell.actionProfile.pivot.mode = 'base';
shell.actionProfile.pivot.localPosition = [0, -1.1, 0];
shell.actionProfile.sockets = [
  { id: 'top-rim-seat', localPosition: [0, 1.08, 0], localRotation: [0, 0, 0], role: 'surface-contact' },
  { id: 'base-ring-seat', localPosition: [0, -0.94, 0], localRotation: [0, 0, 0], role: 'surface-contact' },
];
shell.actionProfile.collider = { type: 'cylinder', offset: [0, 0, 0], scale: [0.77, 1.1, 0.77], isTrigger: false, notes: 'Approximate solid collider; cavity is intentionally ignored.' };
shell.actionProfile.destruction = { breakable: false, fractureGroup: 'glass-body', seamRefs: ['rim-seam', 'base-seam'], detachableFragments: [], breakImpulse: 0, debrisMaterial: 'glass' };

const rim = makeComponent({
  id: 'rim', name: 'Rounded double lip', level: 'meso', role: 'edge accent', primitive: 'torus', parent: 'glass-shell',
  dimensions: { width: 1.58, height: 0.12, depth: 1.58 }, position: [0, 1.08, 0], material: 'glass',
  localFeatures: [{ id: 'double-lip', type: 'bevel' }],
  topology: 'two close concentric rounded lip curves integrated into the shell profile',
  edge: { type: 'rounded', bevelRadius: 0.045, segments: 12 },
});
rim.attachment = {
  parentId: 'glass-shell', parentSocket: 'top-rim-seat', localStart: [0, 1.04, 0], localEnd: [0, 1.1, 0],
  contactType: 'overlap', overlap: 0.04, gapTolerance: 0.005, evidenceRefs: ['full-object'],
};

const base = makeComponent({
  id: 'base-ring', name: 'Heavy optical base ring', level: 'meso', role: 'optical accent', primitive: 'torus', parent: 'glass-shell',
  dimensions: { width: 1.28, height: 0.3, depth: 1.28 }, position: [0, -0.94, 0], material: 'glass',
  localFeatures: [{ id: 'base-step', type: 'ridge' }, { id: 'inner-dish', type: 'contour' }],
  topology: 'rounded base perimeter with a shallow recessed inner floor and dense refraction band',
  edge: { type: 'rounded', bevelRadius: 0.06, segments: 12 },
});
base.attachment = {
  parentId: 'glass-shell', parentSocket: 'base-ring-seat', localStart: [0, -1.08, 0], localEnd: [0, -0.82, 0],
  contactType: 'overlap', overlap: 0.06, gapTolerance: 0.005, evidenceRefs: ['full-object'],
};

spec.componentTree = [shell, rim, base];
spec.materials = [{
  id: 'glass',
  name: 'Clear soda-lime glass approximation',
  type: 'physical-transparent',
  shaderModel: 'MeshPhysicalMaterial with transmission',
  baseColor: '#EAF7FF',
  color: '#EAF7FF',
  albedo: {
    dominant: '#F4FBFF',
    secondary: ['#BFD0D8', '#FFFFFF'],
    samplingNotes: 'Near-colorless body; grey-blue and white values are reflection/refraction cues rather than opaque paint.',
  },
  colorVariation: { palette: ['#F4FBFF', '#BFD0D8', '#FFFFFF'], pattern: 'vertical optical reflection bands', amplitude: 0.08, heightCorrelation: 0.1 },
  textureResolution: 1024,
  textureProjection: { mode: 'cylindrical', repeat: [1, 1], anisotropy: 8, texelDensityIntent: 'Object-space reflection bands; no visible tiling.' },
  surfaceFrequencyBands: [
    { id: 'macro', frequency: 1, amplitude: 0.09, role: 'broad studio reflection columns' },
    { id: 'meso', frequency: 10, amplitude: 0.015, role: 'subtle glass waviness and base refraction breakup' },
    { id: 'micro', frequency: 80, amplitude: 0.002, role: 'very fine highlight breakup without frosted appearance' },
  ],
  roughness: { base: 0.055, variation: 0.018, map: 'independent-optical-roughness-field', localResponse: 'rim and base slightly smoother than broad walls' },
  metalness: { base: 0, variation: 0 },
  transmission: { base: 1, thickness: 0.16, ior: 1.52, attenuationDistance: 6, attenuationColor: '#EAF7FF' },
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  normal: { pattern: 'independent-manufacturing-waviness', strength: 0.015, scale: 18, space: 'tangent' },
  bump: { pattern: 'independent-micro-wave', amplitude: 0.002, scale: 80 },
  displacement: { pattern: 'none', amplitude: 0, scale: 1, silhouetteAffects: false },
  ambientOcclusion: { cavityStrength: 0.08, contactShadowBias: 0.2, notes: 'Only rim/base contacts and inner floor receive subtle occlusion.' },
  wear: { edgeWear: 0, scratches: [], chips: [] },
  dirt: { amount: 0, cavityBias: 0, color: '#FFFFFF' },
  localOverrides: [
    { id: 'optical-highlight', region: 'left and right outer walls', roughness: 0.025, transmission: 0.94, evidenceRefs: ['full-object'] },
    { id: 'rim-density', region: 'top lip', roughness: 0.035, transmission: 0.88, evidenceRefs: ['full-object'] },
    { id: 'base-density', region: 'bottom 18 percent', roughness: 0.045, transmission: 0.82, evidenceRefs: ['full-object'] },
  ],
  shaderNotes: [
    'Use front/back transmission with thickness authored in geometry, not opacity-only blending.',
    'Use PMREM environment reflections and ACES tone mapping to keep clear glass readable.',
    'Reference PBR extraction is intentionally skipped because transparent pixels contain background and baked refraction rather than recoverable albedo.',
  ],
  notes: 'Real-time optical approximation; exact caustics are outside scope.',
}];

spec.featureReviewTargets = [
  { id: 'tapered-shell-silhouette', name: 'Tapered shell silhouette', tier: 'critical', passIds: ['blockout', 'structural-pass', 'form-refinement'], minimumScore: 0.8, mustPass: true, componentRefs: ['glass-shell'], evidenceRefs: ['full-object'] },
  { id: 'rim-opening-system', name: 'Elliptical opening and double rim', tier: 'critical', passIds: ['structural-pass', 'form-refinement', 'material-pass'], minimumScore: 0.78, mustPass: true, componentRefs: ['rim'], evidenceRefs: ['full-object'] },
  { id: 'heavy-base-system', name: 'Thick base and recessed inner floor', tier: 'critical', passIds: ['structural-pass', 'form-refinement', 'material-pass'], minimumScore: 0.78, mustPass: true, componentRefs: ['base-ring'], evidenceRefs: ['full-object'] },
  { id: 'clear-glass-optics', name: 'Clear glass transmission and reflection bands', tier: 'critical', passIds: ['material-pass', 'surface-pass', 'lighting-pass'], minimumScore: 0.75, mustPass: true, componentRefs: ['glass-shell', 'rim', 'base-ring'], evidenceRefs: ['full-object'] },
];

spec.lookDevTargets.materialPass.referencePbrExtraction = {
  requiredWhenSourceImagePresent: false,
  targetThreshold: 0.7,
  stopOnLowConfidence: false,
  script: 'forge/stage1_intake/extract_pbr_evidence.py',
  acceptedLimitation: 'Transparent glass does not expose intrinsic albedo/roughness maps in a single image; use observed contour, Fresnel, transmission, and studio reflection evidence instead.',
};
spec.lightingFromPhoto = [
  'key light: large cool-white rectangular area above-left, intensity 4.5, soft shadow',
  'fill light: broad neutral front panel, intensity 1.4, preserving transparent interior',
  'rim/environment light: white vertical reflection cards on both sides plus dim cool environment',
  'exposure and tone mapping: ACES filmic, exposure 1.15, restrained white clipping',
  'background and contact shadow: near-black neutral background with a soft ground contact shadow and subtle ambient occlusion beneath the base',
];
spec.performanceBudget = {
  qualityPriority: 'reference-fidelity',
  targetTriangles: 18000,
  maxDrawCalls: 12,
  textureSize: 1024,
  fpsTarget: 60,
  optimizationPolicy: 'Use one lathed shell and a small number of optical accent meshes; retain smooth profile segments near the rim and base.',
};
spec.proceduralStrategy = [
  'Create a closed LatheGeometry cross-section for outer wall, rounded lip, inner wall, inner dish, and bottom.',
  'Add narrow rim and base optical accent geometry only where it materially improves reflection readability.',
  'Use MeshPhysicalMaterial transmission and a generated studio environment; avoid opacity-only glass.',
  'Match the reference with a mild orthographic-like perspective camera and a dark neutral background.',
];
spec.animationAnchors = ['glass-shell base pivot supports whole-object turntable rotation and placement'];
spec.destructionAnchors = ['glass-body fracture group is recorded but disabled by default'];
spec.risks = [
  'Transparent materials are highly dependent on the environment and renderer settings.',
  'Single-view evidence cannot determine exact wall thickness or underside shape.',
  'Screen-space transmission will not reproduce path-traced caustics.',
];

await writeFile(assessmentPath, `${JSON.stringify(assessment, null, 2)}\n`);
await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);
