import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../sculpt/noir-speaker-spec.json', import.meta.url);
const spec = JSON.parse(await readFile(path, 'utf8'));
const evidence = ['front-view', 'front-three-quarter', 'rear-view', 'exploded-view'];

function action(sockets = [], detachable = true) {
  return {
    animationRole: detachable ? 'detachable-assembly' : 'root',
    pivot: { mode: 'component-center', localPosition: [0, 0, 0], axis: [0, 1, 0], confidence: 0.88 },
    transformChannels: { translate: true, rotate: true, scale: true, bend: false, twist: false, detach: detachable, visibility: true, materialState: true },
    sockets,
    collider: { type: 'box', offset: [0, 0, 0], scale: [1, 1, 1], isTrigger: false, notes: 'Interaction proxy follows this named assembly.' },
    constraints: [],
    destruction: { breakable: false, fractureGroup: 'speaker-service-parts', seamRefs: [], detachableFragments: detachable ? ['exploded-view'] : [], breakImpulse: 0, debrisMaterial: 'rubber' },
  };
}

function component({ id, name, level, role, primitive, parent = null, material, dims, position = [0, 0, 0], features = [], sockets = [], detail = 'procedural surface detail', attachment = null, confidence = 0.88 }) {
  const primitiveMap = {
    'rounded-box': 'box', 'assembled-boxes': 'box', assembly: 'box', 'rounded-frame': 'extrude', 'rounded-plane': 'instanced-cluster',
    'lathe-and-torus': 'lathe', 'recessed-rounded-plate': 'box', 'pcb-assembly': 'box', 'rounded-panel': 'extrude',
    'rounded-plate': 'box', 'cylinder-set': 'cylinder', instanced: 'instanced-cluster', 'extruded-text': 'extrude',
  };
  const materialRecipe = {
    'vinyl-leather': ['rgba(18, 19, 21, 1.0)', 'rgba(41, 39, 38, 1.0)', 'skin'],
    'grille-cloth': ['rgba(58, 44, 26, 1.0)', 'rgba(185, 138, 67, 1.0)', 'fabric'],
    'brushed-brass': ['rgba(184, 134, 69, 1.0)', 'rgba(226, 190, 121, 1.0)', 'metal'],
    'mdf-wood': ['rgba(104, 72, 39, 1.0)', 'rgba(157, 112, 66, 1.0)', 'wood'],
    'driver-composite': ['rgba(16, 18, 22, 1.0)', 'rgba(41, 45, 49, 1.0)', 'plastic'],
    'matte-black': ['rgba(18, 20, 22, 1.0)', 'rgba(52, 54, 58, 1.0)', 'metal'],
    rubber: ['rgba(9, 10, 11, 1.0)', 'rgba(36, 37, 38, 1.0)', 'rubber'],
    pcb: ['rgba(23, 50, 41, 1.0)', 'rgba(155, 138, 67, 1.0)', 'plastic'],
  }[material] ?? ['rgba(20, 20, 20, 1.0)', 'rgba(50, 50, 50, 1.0)', 'unknown'];
  const normalizedPrimitive = primitiveMap[primitive] ?? primitive;
  const topologyClass = id === 'grille' ? 'fiber-strand' : id === 'front-trim' ? 'surface-relief' : id === 'cabinet-shell' || id === 'acoustic-chamber' ? 'conforming-shell' : 'assembled-solid';
  return {
    id, name, level, role, importance: level === 'macro' ? 1 : level === 'meso' ? 0.82 : 0.62, confidence, primitive,
    primitive: normalizedPrimitive,
    topologyClass,
    topologyRationale: 'Chosen from the observed part silhouette and the separation required by the exploded reference.',
    geometryDescriptor: { topologyIntent: detail, edgeTreatment: { type: 'rounded', bevelRadius: level === 'micro' ? 0.015 : 0.08, segments: level === 'micro' ? 4 : 8 }, deformationStack: [], uvStrategy: 'generated object-space coordinates', normalStrategy: 'smooth analytic vertex normals' },
    parent, attachment,
    dimensions: { width: dims[0], height: dims[1], depth: dims[2], units: 'relative', confidence },
    transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
    actionProfile: action(sockets, parent !== null), material, materialLayers: [material], deformations: [], joints: [], seams: [],
    localFeatures: features.map((id) => ({ id, type: 'reference-detail' })),
    colorMaterialRecipe: { dominantAlbedo: materialRecipe[0], secondaryAlbedo: materialRecipe[1], materialClass: materialRecipe[2], materialClassConfidence: confidence, evidenceRefs: evidence },
    surfaceDetail: { macroRoughness: 0.18, microRoughness: 0.08, bumpAmplitude: 0.04, normalPattern: 'independent procedural height field', displacementPattern: 'none', occlusionPattern: 'cavity/contact AO', edgeWearPattern: 'subtle edge darkening', notes: detail },
    evidenceRefs: evidence, details: features, fidelityTier: 'reference',
  };
}

function attach(parentId, parentSocket, start, end) {
  return { parentId, parentSocket, localStart: start, localEnd: end, contactType: 'overlap', overlap: 0.04, gapTolerance: 0.008, evidenceRefs: evidence };
}

function material(id, name, color, secondary, response, overrides) {
  return {
    id, name, type: 'physical-opaque', shaderModel: 'MeshPhysicalMaterial', qualityTier: 'reference', baseColor: color, color,
    albedo: { dominant: color, secondary, samplingNotes: 'Reference-derived local palette; no third-party logo or protected wordmark is copied.' },
    colorVariation: { palette: [color, ...secondary], pattern: response.pattern, amplitude: response.colorAmplitude, heightCorrelation: 0.35 },
    textureResolution: 1024, textureProjection: { mode: 'object-space procedural', repeat: response.repeat, anisotropy: 8, texelDensityIntent: 'Independent material-frequency texture fields at stable object scale.' },
    surfaceFrequencyBands: [
      { id: 'macro', frequency: 1.5, amplitude: 0.18, role: 'broad finish and color variation' },
      { id: 'meso', frequency: 16, amplitude: 0.1, role: 'grain, weave, brushing, or component relief' },
      { id: 'micro', frequency: 96, amplitude: 0.035, role: 'grazing-highlight breakup' },
    ],
    roughness: { base: response.roughness, variation: response.roughnessVariation, map: `${id}-roughness-independent`, localResponse: response.roughnessNote },
    metalness: { base: response.metalness, variation: 0.08 },
    clearcoat: response.clearcoat, clearcoatRoughness: response.clearcoatRoughness,
    normal: { pattern: `${id}-independent-height-to-normal`, strength: response.normal, scale: response.normalScale, space: 'tangent' },
    bump: { pattern: `${id}-independent-height`, amplitude: response.bump, scale: response.normalScale },
    displacement: { pattern: 'none', amplitude: 0, scale: 1, silhouetteAffects: false },
    ambientOcclusion: { cavityStrength: 0.32, contactShadowBias: 0.34, notes: 'Independent cavity/contact response; not derived from albedo.' },
    wear: { edgeWear: 0.08, scratches: ['subtle reference-consistent micro scratches'], chips: [] }, dirt: { amount: 0.04, cavityBias: 0.38, color: '#0A0A0A' },
    localOverrides: overrides.map((id) => ({ id, region: 'reference-defined local region', roughness: Math.max(0.08, response.roughness - 0.12), evidenceRefs: evidence })),
    notes: response.notes,
  };
}

spec.suitability = 'pass';
spec.scores = { object_isolation: 3, silhouette_readability: 3, depth_inference: 3, primitive_decomposition: 3, material_procedurality: 3, occlusion_risk: 2, interaction_fit: 3 };
spec.coordinateFrame = { front: 'positive Z faces the front reference', up: 'positive Y', scaleReference: 'cabinet width = 4.8 scene units' };
spec.assumptions = [
  'The multi-view sheet supplies front, three-quarter, side, rear, and top exterior evidence; the exploded sheet supplies the service stack.',
  'Concealed MDF bracing and cable routing are inferred from the open cavity; they are rendered as plausible, non-claiming structure.',
  'The reference wordmark is replaced with neutral NOIR typography; no source logo is reproduced.',
];
spec.preSpecAssessment.unknownsToResolveBeforeImplementation = [];
spec.silhouette = { boundingShape: 'wide rounded rectangular cabinet with a shallow depth and four low isolation feet', aspectRatios: ['width:height = 1.60', 'depth:width = 0.43', 'grille width:cabinet width = 0.88'], symmetry: 'bilateral around the vertical centreline except rear I/O', dominantCurves: ['large corner radii', 'front trim perimeter', 'rear handle capsule', 'cylindrical control and driver profiles'], negativeSpaces: ['rear handle cutout', 'top control recess', 'front cavity exposed during exploded view'], landmarks: ['cabinet front z=0.92', 'rear panel z=-0.92', 'top deck y=1.48', 'foot contact y=-1.7'] };
spec.viewEvidence = [
  { id: 'front-view', view: 'front', imageRegion: { x: 0, y: 0, width: 1, height: 1, units: 'normalized' }, observations: ['black woven grille', 'thin gold trim', 'wide low cabinet', 'four feet'], confidence: 0.95 },
  { id: 'front-three-quarter', view: 'front-three-quarter', imageRegion: { x: 0, y: 0, width: 1, height: 1, units: 'normalized' }, observations: ['shallow cabinet depth', 'rounded wrapped shell', 'top recessed control deck'], confidence: 0.92 },
  { id: 'rear-view', view: 'rear', imageRegion: { x: 0, y: 0, width: 1, height: 1, units: 'normalized' }, observations: ['handle cutout', 'screw perimeter', 'brass I/O plate'], confidence: 0.94 },
  { id: 'exploded-view', view: 'front-three-quarter exploded', imageRegion: { x: 0, y: 0, width: 1, height: 1, units: 'normalized' }, observations: ['removable grille/frame/baffle', 'three-driver array', 'MDF cavity', 'top PCB and rear panel'], confidence: 0.9 },
];

const cabinetSockets = [
  { id: 'front-seat', localPosition: [0, 0, 0.94], localRotation: [0, 0, 0], role: 'front-assembly' },
  { id: 'rear-seat', localPosition: [0, 0, -0.94], localRotation: [0, 0, 0], role: 'rear-assembly' },
  { id: 'top-seat', localPosition: [0, 1.60, 0], localRotation: [0, 0, 0], role: 'control-assembly' },
  { id: 'base-seat', localPosition: [0, -1.60, 0], localRotation: [0, 0, 0], role: 'isolation-feet' },
];
spec.componentTree = [
  component({ id: 'cabinet-shell', name: 'Wrapped acoustic cabinet', level: 'macro', role: 'enclosure', primitive: 'rounded-box', material: 'vinyl-leather', dims: [4.8, 3.0, 2.05], features: ['rounded-vinyl-shell', 'cabinet-seam'], sockets: cabinetSockets, detail: 'Open-front MDF enclosure assembled from back, side, top, and bottom panels so the exploded view reveals a real chamber.', confidence: 0.94 }),
  component({ id: 'acoustic-chamber', name: 'MDF acoustic chamber', level: 'macro', role: 'internal-volume', primitive: 'assembled-boxes', parent: 'cabinet-shell', material: 'mdf-wood', dims: [4.08, 2.3, 1.65], position: [0, 0, 0.04], features: ['mdf-shelf', 'rear-port-aperture'], attachment: attach('cabinet-shell', 'front-seat', [0, 0, 0.76], [0, 0, 0.92]), detail: 'Warm MDF inner surfaces, horizontal shelf and rear port aperture; thickness is an inferred low-confidence interior detail.', confidence: 0.78 }),
  component({ id: 'front-assembly', name: 'Front acoustic stack', level: 'macro', role: 'removable-front-assembly', primitive: 'assembly', parent: 'cabinet-shell', material: 'matte-black', dims: [4.35, 2.55, 0.32], position: [0, 0, 1.04], features: ['front-stack-seam'], attachment: attach('cabinet-shell', 'front-seat', [0, 0, 0.94], [0, 0, 1.1]), detail: 'Container for independently pickable grille, trim and driver baffle.' }),
  component({ id: 'rear-assembly', name: 'Rear service stack', level: 'macro', role: 'removable-rear-assembly', primitive: 'assembly', parent: 'cabinet-shell', material: 'matte-black', dims: [4.0, 1.7, 0.18], position: [0, 0, -1.04], features: ['rear-stack-seam'], attachment: attach('cabinet-shell', 'rear-seat', [0, 0, -0.94], [0, 0, -1.1]), detail: 'Container for rear panel and brass I/O plate.' }),
  component({ id: 'front-frame', name: 'Front frame and gold piping', level: 'meso', role: 'trim-frame', primitive: 'rounded-frame', parent: 'front-assembly', material: 'matte-black', dims: [4.28, 2.48, 0.12], features: ['gold-piping', 'frame-corner-radius'], attachment: attach('front-assembly', 'front-seat', [0, 0, 0.02], [0, 0, 0.12]), detail: 'Black structural front frame with separate thin gold piping geometry.' }),
  component({ id: 'grille', name: 'Woven front grille', level: 'meso', role: 'perforated-cover', primitive: 'rounded-plane', parent: 'front-assembly', material: 'grille-cloth', dims: [4.12, 2.27, 0.07], features: ['woven-relief', 'grille-badge'], attachment: attach('front-assembly', 'front-seat', [0, 0, 0.13], [0, 0, 0.2]), detail: 'Opaque woven cloth cover with a physically separated neutral badge.' }),
  component({ id: 'driver-baffle', name: 'Driver baffle', level: 'meso', role: 'driver-mount', primitive: 'rounded-box', parent: 'front-assembly', material: 'matte-black', dims: [4.08, 2.34, 0.13], features: ['driver-mount-holes'], attachment: attach('front-assembly', 'front-seat', [0, 0, -0.02], [0, 0, 0.08]), detail: 'Rigid black baffle carrying the woofer and twin tweeters.' }),
  component({ id: 'driver-array', name: 'Woofer and twin tweeters', level: 'meso', role: 'acoustic-transducer-array', primitive: 'lathe-and-torus', parent: 'driver-baffle', material: 'driver-composite', dims: [3.65, 1.62, 0.32], features: ['concentric-driver-rings', 'twin-tweeter-domes'], attachment: attach('driver-baffle', 'front-seat', [0, 0, 0.06], [0, 0, 0.22]), detail: 'Central woofer and symmetric left/right tweeters with geometric retaining rings and cone relief.' }),
  component({ id: 'top-control-deck', name: 'Top recessed control deck', level: 'meso', role: 'control-interface', primitive: 'recessed-rounded-plate', parent: 'cabinet-shell', material: 'brushed-brass', dims: [2.95, 0.12, 0.88], position: [0, 1.63, 0], features: ['top-control-recess', 'knurled-knobs', 'toggle-stem'], attachment: attach('cabinet-shell', 'top-seat', [0, 1.55, 0], [0, 1.69, 0]), detail: 'Brass plate is inset into a black top recess; four knobs and one toggle are individual geometry.' }),
  component({ id: 'amplifier-board', name: 'Amplifier circuit board', level: 'meso', role: 'electronics', primitive: 'pcb-assembly', parent: 'cabinet-shell', material: 'pcb', dims: [3.35, 0.16, 0.94], position: [0, 0.72, -0.25], features: ['pcb-components', 'capacitor-bank'], attachment: attach('cabinet-shell', 'top-seat', [0, 0.85, -0.25], [0, 1.32, -0.25]), detail: 'Service board below the top controls; detailed component placement is inferred from the exploded reference.' }),
  component({ id: 'rear-panel', name: 'Rear panel with handle', level: 'meso', role: 'back-cover', primitive: 'rounded-panel', parent: 'rear-assembly', material: 'matte-black', dims: [3.98, 1.65, 0.11], features: ['handle-cutout', 'rear-perimeter-screws'], attachment: attach('rear-assembly', 'rear-seat', [0, 0, 0.02], [0, 0, 0.11]), detail: 'Black rear panel with a true capsule-shaped negative handle opening and perimeter screws.' }),
  component({ id: 'rear-io-plate', name: 'Rear brass I/O plate', level: 'meso', role: 'connection-interface', primitive: 'rounded-plate', parent: 'rear-assembly', material: 'brushed-brass', dims: [2.52, 0.62, 0.08], position: [0, -0.35, -0.09], features: ['io-jacks', 'power-inlet'], attachment: attach('rear-assembly', 'rear-seat', [0, -0.35, 0.06], [0, -0.35, -0.04]), detail: 'Brass audio and power plate; exact port protocol is intentionally generic.' }),
  component({ id: 'isolation-feet', name: 'Rubber feet and brass washers', level: 'meso', role: 'base-support', primitive: 'cylinder-set', parent: 'cabinet-shell', material: 'rubber', dims: [3.8, 0.25, 1.25], position: [0, -1.73, 0], features: ['feet-washers'], attachment: attach('cabinet-shell', 'base-seat', [0, -1.57, 0], [0, -1.83, 0]), detail: 'Four discrete cylindrical feet with small brass washer geometry.' }),
  component({ id: 'fastener-system', name: 'Perimeter fastener system', level: 'micro', role: 'repeated-fastener', primitive: 'instanced', parent: 'cabinet-shell', material: 'matte-black', dims: [4.1, 2.3, 0.08], features: ['perimeter-screws'], attachment: attach('cabinet-shell', 'front-seat', [0, 0, 0.94], [0, 0, 1.0]), detail: 'Instanced recessed screws distributed around front and rear panels.' }),
  component({ id: 'front-trim', name: 'Brass perimeter piping', level: 'micro', role: 'metal-accent', primitive: 'tube', parent: 'front-frame', material: 'brushed-brass', dims: [4.12, 2.22, 0.05], features: ['gold-piping'], attachment: attach('front-frame', 'front-seat', [0, 0, 0.08], [0, 0, 0.13]), detail: 'Rounded rectangular tube makes the gold trim a real highlight-catching profile.' }),
  component({ id: 'grille-badge', name: 'Neutral grille badge', level: 'micro', role: 'decal-plaque', primitive: 'extruded-text', parent: 'grille', material: 'brushed-brass', dims: [1.1, 0.28, 0.03], features: ['grille-badge'], attachment: attach('grille', 'front-seat', [0, 0, 0.04], [0, 0, 0.08]), detail: 'Neutral NOIR text plaque replaces the reference logo.' }),
];

spec.repetitionSystems = [
  { id: 'grille-weave', componentRef: 'grille', realization: 'instanced-lines', buildsGeometry: true, geometry: 'orthogonal warped fibre strips', count: 720, distribution: 'dense rectangular weave', material: 'grille-cloth', evidenceRefs: ['front-view'] },
  { id: 'perimeter-screws', componentRef: 'fastener-system', realization: 'instanced-mesh', buildsGeometry: true, geometry: 'recessed button-head screw', count: 20, distribution: 'panel perimeter', material: 'matte-black', evidenceRefs: ['rear-view', 'exploded-view'] },
  { id: 'control-knobs', componentRef: 'top-control-deck', realization: 'instanced-mesh', buildsGeometry: true, geometry: 'knurled brass cylinder', count: 4, distribution: 'top plate row', material: 'brushed-brass', evidenceRefs: ['front-three-quarter'] },
  { id: 'driver-ring-set', componentRef: 'driver-array', realization: 'repeated-profile', buildsGeometry: true, geometry: 'concentric retaining and diaphragm rings', count: 3, distribution: 'one woofer plus two tweeters', material: 'driver-composite', evidenceRefs: ['exploded-view'] },
];

spec.materials = [
  material('vinyl-leather', 'Black leather-like cabinet wrap', '#121315', ['#08090A', '#292726'], { pattern: 'low-frequency grain and seam darkening', colorAmplitude: 0.1, repeat: [3, 2], roughness: 0.5, roughnessVariation: 0.16, roughnessNote: 'Recessed grain is rougher; stitched edges are smoother.', metalness: 0.02, clearcoat: 0.18, clearcoatRoughness: 0.3, normal: 0.42, bump: 0.075, normalScale: 58, notes: 'Separate color, roughness, height/normal and AO fields represent black leather-like vinyl.' }, ['leather-grain', 'cabinet-seam']),
  material('grille-cloth', 'Gold-black woven grille cloth', '#3A2C1A', ['#B98A43', '#12100D'], { pattern: 'orthogonal warm-metal warp and dark weft', colorAmplitude: 0.26, repeat: [18, 12], roughness: 0.62, roughnessVariation: 0.2, roughnessNote: 'Raised fibre ridges catch light while voids remain dark.', metalness: 0.26, clearcoat: 0.04, clearcoatRoughness: 0.45, normal: 0.6, bump: 0.12, normalScale: 94, notes: 'Weave geometry is instanced; texture channels only add fibre-scale variation.' }, ['woven-relief']),
  material('brushed-brass', 'Warm brushed brass', '#B88645', ['#E2BE79', '#63431E'], { pattern: 'directional horizontal brush and edge brightening', colorAmplitude: 0.12, repeat: [6, 1], roughness: 0.23, roughnessVariation: 0.11, roughnessNote: 'Plane is brushed; edges and knob caps are smoother.', metalness: 0.92, clearcoat: 0.08, clearcoatRoughness: 0.18, normal: 0.16, bump: 0.026, normalScale: 140, notes: 'Directional independent roughness/normal fields give brass its brushed response.' }, ['brushed-grain', 'polished-knob-caps']),
  material('mdf-wood', 'Warm MDF acoustic chamber', '#684827', ['#9D7042', '#382313'], { pattern: 'coarse pressed wood grain', colorAmplitude: 0.18, repeat: [4, 4], roughness: 0.77, roughnessVariation: 0.14, roughnessNote: 'Cut edges darken and cavity contacts receive AO.', metalness: 0, clearcoat: 0, clearcoatRoughness: 0.4, normal: 0.34, bump: 0.075, normalScale: 42, notes: 'Interior finish is an inferred MDF approximation from the exploded view.' }, ['mdf-cut-edges', 'mdf-shelf']),
  material('driver-composite', 'Driver cone and retaining rings', '#101216', ['#292D31', '#050607'], { pattern: 'radial cone ridges and smooth rubber surround', colorAmplitude: 0.08, repeat: [1, 1], roughness: 0.38, roughnessVariation: 0.14, roughnessNote: 'Rubber surrounds are matte; retaining rings are glossier.', metalness: 0.18, clearcoat: 0.12, clearcoatRoughness: 0.24, normal: 0.22, bump: 0.05, normalScale: 28, notes: 'Driver profiles carry the primary concentric relief in geometry.' }, ['cone-ridges', 'rubber-surround']),
  material('matte-black', 'Matte black panel and fastener finish', '#121416', ['#030405', '#34363A'], { pattern: 'subtle powder-coat grain', colorAmplitude: 0.06, repeat: [5, 5], roughness: 0.48, roughnessVariation: 0.12, roughnessNote: 'Recesses and fastener wells are darker and rougher.', metalness: 0.28, clearcoat: 0.05, clearcoatRoughness: 0.3, normal: 0.16, bump: 0.028, normalScale: 96, notes: 'Used for baffle, rear panel and fasteners with independent cavity AO.' }, ['fastener-wells', 'handle-cavity']),
  material('rubber', 'Black rubber feet', '#090A0B', ['#242526'], { pattern: 'fine moulded rubber grain', colorAmplitude: 0.04, repeat: [5, 5], roughness: 0.75, roughnessVariation: 0.08, roughnessNote: 'Contact edge is slightly polished.', metalness: 0, clearcoat: 0, clearcoatRoughness: 0.5, normal: 0.18, bump: 0.04, normalScale: 75, notes: 'Rubber is visually distinct from black powder-coated panels.' }, ['contact-polish']),
  material('pcb', 'Dark green electronics board', '#173229', ['#9B8A43', '#0B1512'], { pattern: 'solder pads and masked board field', colorAmplitude: 0.15, repeat: [4, 4], roughness: 0.3, roughnessVariation: 0.16, roughnessNote: 'Solder pads are glossier than mask.', metalness: 0.36, clearcoat: 0.12, clearcoatRoughness: 0.18, normal: 0.12, bump: 0.02, normalScale: 90, notes: 'Trace and component geometry are approximate because the exact PCB is not legible.' }, ['solder-pad-gloss']),
];
for (const id of ['rubber', 'pcb']) {
  const utilityMaterial = spec.materials.find((item) => item.id === id);
  if (utilityMaterial) utilityMaterial.qualityTier = 'utility';
}

const inv = spec.preSpecAssessment.detailInventory.details;
const refs = ['vinyl-leather/leather-grain','front-frame/gold-piping','grille-cloth/woven-relief','grille/grille-badge','driver-array/concentric-driver-rings','top-control-deck/top-control-recess','brushed-brass/brushed-grain','rear-panel/handle-cutout','fastener-system/perimeter-screws','acoustic-chamber/mdf-shelf','amplifier-board/pcb-components','isolation-feet/feet-washers'];
const kinds = ['bevel','linework','ridge','linework','ridge','groove','gloss','hole','fastener','contour','ridge','fastener'];
inv.forEach((item, index) => { item.kind = kinds[index]; item.mapsTo = { type: refs[index].includes('/') ? 'feature' : 'component', ref: refs[index] }; });

spec.featureReviewTargets = [
  { id: 'cabinet-proportion', name: 'Wrapped cabinet proportion and rounded silhouette', tier: 'critical', passIds: ['blockout','structural-pass','form-refinement'], minimumScore: 0.82, mustPass: true, componentRefs: ['cabinet-shell'], evidenceRefs: ['front-view','front-three-quarter'] },
  { id: 'front-stack', name: 'Grille, gold trim and three-driver front stack', tier: 'critical', passIds: ['structural-pass','form-refinement','material-pass'], minimumScore: 0.82, mustPass: true, componentRefs: ['grille','front-frame','driver-array'], evidenceRefs: ['front-view','exploded-view'] },
  { id: 'top-and-rear-controls', name: 'Top brass controls and rear service interfaces', tier: 'critical', passIds: ['structural-pass','form-refinement','material-pass'], minimumScore: 0.78, mustPass: true, componentRefs: ['top-control-deck','rear-panel','rear-io-plate'], evidenceRefs: ['front-three-quarter','rear-view','exploded-view'] },
  { id: 'material-system', name: 'Leather, weave, brass and MDF material separation', tier: 'critical', passIds: ['material-pass','surface-pass','lighting-pass'], minimumScore: 0.76, mustPass: true, componentRefs: ['cabinet-shell','grille','front-trim','acoustic-chamber'], evidenceRefs: evidence },
  { id: 'serviceable-exploded-assembly', name: 'Separated named parts reveal the MDF chamber and electronics', tier: 'critical', passIds: ['interaction-pass','optimization-pass'], minimumScore: 0.8, mustPass: true, componentRefs: ['front-assembly','top-control-deck','amplifier-board','rear-assembly','isolation-feet'], evidenceRefs: ['exploded-view'] },
];
spec.lightingFromPhoto = [
  'key light: broad warm-white rectangular area above and front-left, soft contact shadows',
  'fill light: cool neutral broad source from the front-right at lower intensity',
  'rim/environment light: cool edge light from rear-right and PMREM studio environment',
  'exposure and tone mapping: ACES Filmic at exposure 1.1, protecting brass highlights',
  'background and contact shadow: pale reference studio for comparison and a dark product-page studio with soft ground contact shadow for presentation',
];
spec.lookDevTargets = { qualityPriority: 'reference-fidelity', materialPass: { minimumTextureResolution: 1024, independentMapChannels: ['albedo','roughness','height','normal','ambient-occlusion'], referencePbrExtraction: { requiredWhenSourceImagePresent: true, targetThreshold: 0.7, stopOnLowConfidence: true, script: 'forge/stage1_intake/extract_pbr_evidence.py' } } };
spec.performanceBudget = { qualityPriority: 'reference-fidelity', targetTriangles: 70000, maxDrawCalls: 90, textureSize: 1024, fpsTarget: 55, optimizationPolicy: 'Use instancing for weave and screws, merge static material-compatible parts after interaction structure is accepted.' };
spec.proceduralStrategy = ['Use rounded boxes, tube sweep trim, lathed driver profiles, capsule handle geometry, instanced screw/knob/fibre systems, and independent generated PBR canvas textures.', 'Preserve every serviceable part as a named group with home transforms and centre-scaled exploded transforms.', 'Build the open-front cabinet from shell panels, not a solid box, so the exploded view exposes real interior depth.'];
spec.animationAnchors = ['cabinet-shell root orbit pivot', 'top-control-deck knob axes', 'front-assembly exploded pivot', 'rear-assembly exploded pivot'];
spec.destructionAnchors = ['front-assembly', 'top-control-deck', 'amplifier-board', 'rear-assembly', 'isolation-feet'];
spec.risks = ['One sheet provides multiple camera views but no measured manufacturing dimensions.', 'Interior bracing and PCB traces are inferred rather than recovered.', 'Procedural textures match material class and reference palette, not proprietary source surface scans.'];
spec.sculptPipeline = { passOrder: ['blockout','structural-pass','form-refinement','material-pass','surface-pass','lighting-pass','interaction-pass','optimization-pass'], currentPass: 'blockout', completedPasses: [], passGateMode: 'locked-sequential', nextRequiredEvidence: ['blockout browser render', 'reference comparison sheet', 'review scorecard'] };

await writeFile(path, `${JSON.stringify(spec, null, 2)}\n`);
