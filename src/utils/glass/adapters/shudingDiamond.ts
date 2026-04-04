import type {
  GlassAdapterSettingsValue,
  GlassEffectAdapter,
  GlassMountContext,
  GlassParamDef,
} from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const FILTER_ID_PREFIX = 'opencodian-lg-shuding-diamond-';
const SHELL_DATASET_KEYS = ['opencodianLgShudingDiamond'] as const;
const FILTER_LAYER_DATASET_KEYS = [
  'opencodianLgShudingDiamondOwner',
  'opencodianLgShudingDiamondUrlSupported',
] as const;
const FILTER_LAYER_STYLE_PROPERTIES = ['opacity'] as const;
const CANVAS_DPI = 1;
const VIEWPORT_SCALE = 1.7;
const CAMERA: Vec3 = [0, 0.08, 4.2];
const BACKGROUND_Z = -5.5;
const IOR = 1.18;
const MAX_DISTANCE = 12;
const SURFACE_OFFSET = 0.008;
const MIN_BACKGROUND_Z_COMPONENT = 0.08;
const MAX_UV_OFFSET = 2;
const MAX_EFFECTIVE_UV_OFFSET = 0.32;
const MAX_INTERNAL_BOUNCES = 8;
const EDGE_BULGE_PX = 20;
const EDGE_BULGE_STRENGTH = 0.04;
const DEFAULT_THETA = 0.64;
const DEFAULT_PHI = -0.42;
const THETA_POINTER_RANGE = 0.72;
const PHI_POINTER_RANGE = 0.62;
const PHI_MIN = -1.35;
const PHI_MAX = 1.35;
const DEFAULT_DISPLACEMENT_SCALE = 10;
const DEFAULT_BLOOM_OPACITY = 1;
const DEFAULT_RIM_OPACITY = 0.45;
const DEFAULT_FACE_OVERLAY_OPACITY = 1;
const DEFAULT_SUPPORT_OPACITY = 0.88;
const DEFAULT_POINTER_TILT = 1;
const EPSILON = 1e-6;

type Vec3 = [number, number, number];

interface DiamondPoint {
  x: number;
  y: number;
}

interface DiamondBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

interface DiamondBloomAnchors {
  top: DiamondPoint;
  lowerLeft: DiamondPoint;
  lowerRight: DiamondPoint;
}

interface DiamondHullEdge {
  a: DiamondPoint;
  abx: number;
  aby: number;
  ab2: number;
}

interface DiamondProjectedFace {
  points: DiamondPoint[];
  strokeOpacity: number;
  fillOpacity: number;
}

interface DiamondTransform {
  theta: number;
  phi: number;
  thetaCos: number;
  thetaSin: number;
  phiCos: number;
  phiSin: number;
}

interface DiamondContext extends DiamondTransform {
  hull: DiamondPoint[];
  projectedFaces: DiamondProjectedFace[];
  hullCenter: DiamondPoint;
  hullBounds: DiamondBounds;
  bloomAnchors: DiamondBloomAnchors;
  hullEdges: DiamondHullEdge[];
  clipPath: string;
}

interface DiamondDisplacementTrace {
  displacedUv: {
    x: number;
    y: number;
  };
}

interface DiamondSettings {
  displacementScale: number;
  bloomOpacity: number;
  rimOpacity: number;
  faceOverlayOpacity: number;
  supportOpacity: number;
  pointerTracking: boolean;
  pointerTilt: number;
}

interface DiamondSize {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpi: number;
}

interface DiamondState {
  ctx: GlassMountContext;
  shellEl: HTMLElement;
  filterLayerEl: HTMLElement;
  svgRootEl: SVGSVGElement;
  defsEl: SVGDefsElement;
  filterEl: SVGFilterElement;
  feImageEl: SVGFEImageElement;
  feDisplacementMapEl: SVGFEDisplacementMapElement;
  canvasEl: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
  rootEl: HTMLDivElement;
  supportEl: HTMLDivElement;
  bloomEl: HTMLDivElement;
  crystalEl: HTMLDivElement;
  rimEl: HTMLDivElement;
  faceSvgEl: SVGSVGElement;
  resizeObserver: ResizeObserver | null;
  frameId: number | null;
  settings: DiamondSettings;
  size: DiamondSize;
  baseDisplacementScale: number;
  currentTheta: number;
  currentPhi: number;
  targetTheta: number;
  targetPhi: number;
  supportsBackdropFilterUrl: boolean;
  ownerId: string;
  filterId: string;
  shellDatasetSnapshot: Record<string, string | undefined>;
  filterLayerDatasetSnapshot: Record<string, string | undefined>;
  filterLayerStyleSnapshot: Record<string, string>;
  pointerMoveHandler: (event: PointerEvent) => void;
  pointerLeaveHandler: () => void;
}

type DiamondTransmissionResult = {
  kind: 'refracted' | 'reflected';
  direction: Vec3;
};

const BASE_PYRAMID_VERTICES = {
  apex: [0, 1.18, 0] as Vec3,
  base: [
    [-1.04, -0.92, -1.04],
    [1.04, -0.92, -1.04],
    [1.04, -0.92, 1.04],
    [-1.04, -0.92, 1.04],
  ] as Vec3[],
};
const SHAPE_SCALE = 0.9;

const paramDefs: readonly GlassParamDef[] = [
  {
    key: 'displacementScale',
    labelKey: 'settings.style.input.liquidGlass.shudingDiamond.displacementScale',
    descKey: 'settings.style.input.liquidGlass.shudingDiamond.displacementScale.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.filter',
    type: 'number',
    min: 0,
    max: 40,
    step: 0.5,
    unit: '',
    defaultValue: DEFAULT_DISPLACEMENT_SCALE,
  },
  {
    key: 'bloomOpacity',
    labelKey: 'settings.style.input.liquidGlass.shudingDiamond.bloomOpacity',
    descKey: 'settings.style.input.liquidGlass.shudingDiamond.bloomOpacity.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '',
    defaultValue: DEFAULT_BLOOM_OPACITY,
  },
  {
    key: 'rimOpacity',
    labelKey: 'settings.style.input.liquidGlass.shudingDiamond.rimOpacity',
    descKey: 'settings.style.input.liquidGlass.shudingDiamond.rimOpacity.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '',
    defaultValue: DEFAULT_RIM_OPACITY,
  },
  {
    key: 'faceOverlayOpacity',
    labelKey: 'settings.style.input.liquidGlass.shudingDiamond.faceOverlayOpacity',
    descKey: 'settings.style.input.liquidGlass.shudingDiamond.faceOverlayOpacity.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '',
    defaultValue: DEFAULT_FACE_OVERLAY_OPACITY,
  },
  {
    key: 'supportOpacity',
    labelKey: 'settings.style.input.liquidGlass.shudingDiamond.supportOpacity',
    descKey: 'settings.style.input.liquidGlass.shudingDiamond.supportOpacity.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.appearance',
    type: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    unit: '',
    defaultValue: DEFAULT_SUPPORT_OPACITY,
  },
  {
    key: 'pointerTracking',
    labelKey: 'settings.style.input.liquidGlass.shudingDiamond.pointerTracking',
    descKey: 'settings.style.input.liquidGlass.shudingDiamond.pointerTracking.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.behavior',
    type: 'toggle',
    defaultValue: true,
  },
  {
    key: 'pointerTilt',
    labelKey: 'settings.style.input.liquidGlass.shudingDiamond.pointerTilt',
    descKey: 'settings.style.input.liquidGlass.shudingDiamond.pointerTilt.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.behavior',
    type: 'number',
    min: 0,
    max: 2,
    step: 0.05,
    unit: '',
    defaultValue: DEFAULT_POINTER_TILT,
  },
] as const;

const stateByShellEl = new WeakMap<HTMLElement, DiamondState>();
let cachedBackdropFilterUrlSupport: boolean | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function mul3(a: Vec3, scalar: number): Vec3 {
  return [a[0] * scalar, a[1] * scalar, a[2] * scalar];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize3(v: Vec3): Vec3 {
  const len = length3(v);
  if (len < EPSILON) {
    return [0, 0, 0];
  }

  return [v[0] / len, v[1] / len, v[2] / len];
}

function softClampSigned(value: number, limit: number): number {
  if (Math.abs(value) <= limit) {
    return value;
  }

  return limit * Math.tanh(value / limit);
}

function comparePoints(a: DiamondPoint, b: DiamondPoint): number {
  if (a.x !== b.x) {
    return a.x - b.x;
  }

  return a.y - b.y;
}

function cross2(o: DiamondPoint, a: DiamondPoint, b: DiamondPoint): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function length2(x: number, y: number): number {
  return Math.hypot(x, y);
}

function centroid2(points: DiamondPoint[]): DiamondPoint {
  let x = 0;
  let y = 0;

  for (const point of points) {
    x += point.x;
    y += point.y;
  }

  return {
    x: x / points.length,
    y: y / points.length,
  };
}

function bounds2(points: DiamondPoint[]): DiamondBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  if (Math.abs(edge1 - edge0) < EPSILON) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function scaleVertices(
  vertices: typeof BASE_PYRAMID_VERTICES,
  scale: number,
): typeof BASE_PYRAMID_VERTICES {
  return {
    apex: mul3(vertices.apex, scale),
    base: vertices.base.map((vertex) => mul3(vertex, scale)),
  };
}

function createPlane(a: Vec3, b: Vec3, c: Vec3, interiorPoint: Vec3): { point: Vec3; normal: Vec3 } {
  let normal = normalize3(cross3(sub3(b, a), sub3(c, a)));
  if (dot3(sub3(interiorPoint, a), normal) > 0) {
    normal = mul3(normal, -1);
  }

  return {
    point: a,
    normal,
  };
}

const PYRAMID_VERTICES = scaleVertices(BASE_PYRAMID_VERTICES, SHAPE_SCALE);
const PYRAMID_INTERIOR = mul3([0, -0.3, 0], SHAPE_SCALE);
const PYRAMID_PLANES = [
  createPlane(
    PYRAMID_VERTICES.apex,
    PYRAMID_VERTICES.base[0],
    PYRAMID_VERTICES.base[1],
    PYRAMID_INTERIOR,
  ),
  createPlane(
    PYRAMID_VERTICES.apex,
    PYRAMID_VERTICES.base[1],
    PYRAMID_VERTICES.base[2],
    PYRAMID_INTERIOR,
  ),
  createPlane(
    PYRAMID_VERTICES.apex,
    PYRAMID_VERTICES.base[2],
    PYRAMID_VERTICES.base[3],
    PYRAMID_INTERIOR,
  ),
  createPlane(
    PYRAMID_VERTICES.apex,
    PYRAMID_VERTICES.base[3],
    PYRAMID_VERTICES.base[0],
    PYRAMID_INTERIOR,
  ),
  createPlane(
    PYRAMID_VERTICES.base[0],
    PYRAMID_VERTICES.base[3],
    PYRAMID_VERTICES.base[2],
    PYRAMID_INTERIOR,
  ),
];
const PYRAMID_FACES = [
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[0],
      PYRAMID_VERTICES.base[1],
    ] as Vec3[],
    normal: PYRAMID_PLANES[0].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[1],
      PYRAMID_VERTICES.base[2],
    ] as Vec3[],
    normal: PYRAMID_PLANES[1].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[2],
      PYRAMID_VERTICES.base[3],
    ] as Vec3[],
    normal: PYRAMID_PLANES[2].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[3],
      PYRAMID_VERTICES.base[0],
    ] as Vec3[],
    normal: PYRAMID_PLANES[3].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.base[0],
      PYRAMID_VERTICES.base[1],
      PYRAMID_VERTICES.base[2],
    ] as Vec3[],
    normal: PYRAMID_PLANES[4].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.base[0],
      PYRAMID_VERTICES.base[2],
      PYRAMID_VERTICES.base[3],
    ] as Vec3[],
    normal: PYRAMID_PLANES[4].normal,
  },
];

function rotatePointWithTransform(point: Vec3, transform: DiamondTransform): Vec3 {
  const yx = point[0] * transform.thetaCos + point[2] * transform.thetaSin;
  const yz = -point[0] * transform.thetaSin + point[2] * transform.thetaCos;

  return [
    yx,
    point[1] * transform.phiCos - yz * transform.phiSin,
    point[1] * transform.phiSin + yz * transform.phiCos,
  ];
}

function inverseRotatePointWithTransform(point: Vec3, transform: DiamondTransform): Vec3 {
  const xx = point[0];
  const xy = point[1] * transform.phiCos + point[2] * transform.phiSin;
  const xz = -point[1] * transform.phiSin + point[2] * transform.phiCos;

  return [
    xx * transform.thetaCos - xz * transform.thetaSin,
    xy,
    xx * transform.thetaSin + xz * transform.thetaCos,
  ];
}

function stabilizeBackgroundDirection(direction: Vec3, minZ: number): Vec3 {
  if (direction[2] <= -minZ) {
    return direction;
  }

  return normalize3([direction[0], direction[1], -minZ]);
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tagName);
}

function readNumberSetting(
  value: GlassAdapterSettingsValue | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? clamp(numericValue, min, max) : fallback;
}

function readBooleanSetting(
  value: GlassAdapterSettingsValue | undefined,
  fallback: boolean,
): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function resolveSettings(
  settings: Record<string, GlassAdapterSettingsValue>,
): DiamondSettings {
  return {
    displacementScale: readNumberSetting(
      settings.displacementScale,
      DEFAULT_DISPLACEMENT_SCALE,
      0,
      40,
    ),
    bloomOpacity: readNumberSetting(settings.bloomOpacity, DEFAULT_BLOOM_OPACITY, 0, 1),
    rimOpacity: readNumberSetting(settings.rimOpacity, DEFAULT_RIM_OPACITY, 0, 1),
    faceOverlayOpacity: readNumberSetting(
      settings.faceOverlayOpacity,
      DEFAULT_FACE_OVERLAY_OPACITY,
      0,
      1,
    ),
    supportOpacity: readNumberSetting(settings.supportOpacity, DEFAULT_SUPPORT_OPACITY, 0, 1),
    pointerTracking: readBooleanSetting(settings.pointerTracking, true),
    pointerTilt: readNumberSetting(settings.pointerTilt, DEFAULT_POINTER_TILT, 0, 2),
  };
}

function measureShell(shellEl: HTMLElement): DiamondSize {
  const rect = shellEl.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width || shellEl.offsetWidth || 1));
  const cssHeight = Math.max(1, Math.round(rect.height || shellEl.offsetHeight || 1));
  const dpi = CANVAS_DPI;

  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * dpi)),
    pixelHeight: Math.max(1, Math.round(cssHeight * dpi)),
    dpi,
  };
}

function captureDatasetSnapshot(
  el: HTMLElement,
  keys: readonly string[],
): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, el.dataset[key]]));
}

function restoreDatasetSnapshot(
  el: HTMLElement,
  snapshot: Record<string, string | undefined>,
): void {
  Object.entries(snapshot).forEach(([key, value]) => {
    if (value === undefined) {
      delete el.dataset[key];
      return;
    }

    el.dataset[key] = value;
  });
}

function captureStyleSnapshot(
  el: HTMLElement,
  properties: readonly string[],
): Record<string, string> {
  return Object.fromEntries(properties.map((property) => [property, el.style.getPropertyValue(property)]));
}

function restoreStyleSnapshot(el: HTMLElement, snapshot: Record<string, string>): void {
  Object.entries(snapshot).forEach(([property, value]) => {
    if (value) {
      el.style.setProperty(property, value);
      return;
    }

    el.style.removeProperty(property);
  });
}

function generateFilterId(): string {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${FILTER_ID_PREFIX}${entropy}`;
}

function detectCssSupport(property: string, value: string): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports(property, value)
    : false;
}

function normalizeFilterValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function styleAcceptsBackdropValue(value: string, prefixed: boolean): boolean {
  const probe = document.createElement('div');
  if (prefixed) {
    probe.style.setProperty('-webkit-backdrop-filter', value);
    return normalizeFilterValue(probe.style.getPropertyValue('-webkit-backdrop-filter')).includes('url(');
  }

  probe.style.setProperty('backdrop-filter', value);
  return normalizeFilterValue(probe.style.getPropertyValue('backdrop-filter')).includes('url(');
}

function supportsBackdropFilterUrl(): boolean {
  if (cachedBackdropFilterUrlSupport !== null) {
    return cachedBackdropFilterUrlSupport;
  }

  const quotedValue = 'url("#opencodian-lg-shuding-diamond-support")';
  const plainValue = 'url(#opencodian-lg-shuding-diamond-support)';
  cachedBackdropFilterUrlSupport =
    detectCssSupport('backdrop-filter', quotedValue)
    || detectCssSupport('-webkit-backdrop-filter', quotedValue)
    || detectCssSupport('backdrop-filter', plainValue)
    || detectCssSupport('-webkit-backdrop-filter', plainValue)
    || styleAcceptsBackdropValue(quotedValue, false)
    || styleAcceptsBackdropValue(quotedValue, true)
    || styleAcceptsBackdropValue(plainValue, false)
    || styleAcceptsBackdropValue(plainValue, true);

  return cachedBackdropFilterUrlSupport;
}

function buildBackdropFilterValue(filterId: string): string {
  return `url(#${filterId}) contrast(1.08) brightness(1.18) saturate(1.08)`;
}

function buildFallbackBackdropFilterValue(): string {
  return 'blur(10px) contrast(1.02) brightness(1.06) saturate(1.08)';
}

function convexHull(points: DiamondPoint[]): DiamondPoint[] {
  const sorted = points.slice().sort(comparePoints);
  if (sorted.length <= 1) {
    return sorted;
  }

  const lower: DiamondPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2
      && cross2(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: DiamondPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2
      && cross2(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function selectBloomAnchors(points: DiamondPoint[]): DiamondBloomAnchors {
  let top = points[0];
  let lowerLeft = points[0];
  let lowerRight = points[0];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point.y < top.y) {
      top = point;
    }
    if (point.x + point.y < lowerLeft.x + lowerLeft.y) {
      lowerLeft = point;
    }
    if (point.x - point.y > lowerRight.x - lowerRight.y) {
      lowerRight = point;
    }
  }

  return {
    top,
    lowerLeft,
    lowerRight,
  };
}

function buildHullEdges(hull: DiamondPoint[]): DiamondHullEdge[] {
  const edges: DiamondHullEdge[] = [];
  for (let index = 0; index < hull.length; index += 1) {
    const a = hull[index];
    const b = hull[(index + 1) % hull.length];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    edges.push({
      a,
      abx,
      aby,
      ab2: abx * abx + aby * aby,
    });
  }

  return edges;
}

function pointEdgeDistance(point: DiamondPoint, edge: DiamondHullEdge): number {
  if (edge.ab2 < EPSILON) {
    return length2(point.x - edge.a.x, point.y - edge.a.y);
  }

  const apx = point.x - edge.a.x;
  const apy = point.y - edge.a.y;
  const t = clamp((apx * edge.abx + apy * edge.aby) / edge.ab2, 0, 1);
  const closestX = edge.a.x + edge.abx * t;
  const closestY = edge.a.y + edge.aby * t;
  return length2(point.x - closestX, point.y - closestY);
}

function projectPoint(point: Vec3): [number, number] {
  const depth = CAMERA[2] - point[2];
  const factor = CAMERA[2] / depth;
  return [point[0] * factor, point[1] * factor];
}

function uvToScreenPoint(
  uv: { x: number; y: number },
  size: DiamondSize,
): Vec3 {
  void size;
  return [
    (uv.x - 0.5) * 2 * VIEWPORT_SCALE,
    (0.5 - uv.y) * 2 * VIEWPORT_SCALE,
    0,
  ];
}

function screenPointToUv(point: Vec3, size: DiamondSize): { x: number; y: number } {
  void size;
  return {
    x: point[0] / (2 * VIEWPORT_SCALE) + 0.5,
    y: 0.5 - point[1] / (2 * VIEWPORT_SCALE),
  };
}

function traceToPlane(origin: Vec3, direction: Vec3, planeZ: number): Vec3 | null {
  if (Math.abs(direction[2]) < EPSILON) {
    return null;
  }

  const t = (planeZ - origin[2]) / direction[2];
  if (t <= 0) {
    return null;
  }

  return add3(origin, mul3(direction, t));
}

function intersectRayTriangle(
  origin: Vec3,
  direction: Vec3,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  normal: Vec3,
): { t: number; point: Vec3; normal: Vec3 } | null {
  const edge1 = sub3(b, a);
  const edge2 = sub3(c, a);
  const pvec = cross3(direction, edge2);
  const det = dot3(edge1, pvec);
  if (Math.abs(det) < EPSILON) {
    return null;
  }

  const invDet = 1 / det;
  const tvec = sub3(origin, a);
  const u = dot3(tvec, pvec) * invDet;
  if (u < 0 || u > 1) {
    return null;
  }

  const qvec = cross3(tvec, edge1);
  const v = dot3(direction, qvec) * invDet;
  if (v < 0 || u + v > 1) {
    return null;
  }

  const t = dot3(edge2, qvec) * invDet;
  if (t <= SURFACE_OFFSET || t > MAX_DISTANCE) {
    return null;
  }

  return {
    t,
    point: add3(origin, mul3(direction, t)),
    normal,
  };
}

function intersectCrystalFaces(
  origin: Vec3,
  direction: Vec3,
  transform: DiamondTransform,
): { t: number; point: Vec3; normal: Vec3 } | null {
  const localOrigin = inverseRotatePointWithTransform(origin, transform);
  const localDirection = inverseRotatePointWithTransform(direction, transform);
  let bestHit: { t: number; point: Vec3; normal: Vec3 } | null = null;

  for (const face of PYRAMID_FACES) {
    const hit = intersectRayTriangle(
      localOrigin,
      localDirection,
      face.vertices[0],
      face.vertices[1],
      face.vertices[2],
      face.normal,
    );
    if (!hit) {
      continue;
    }

    if (!bestHit || hit.t < bestHit.t) {
      bestHit = {
        t: hit.t,
        point: rotatePointWithTransform(hit.point, transform),
        normal: normalize3(rotatePointWithTransform(hit.normal, transform)),
      };
    }
  }

  return bestHit;
}

function refractVector(incident: Vec3, normal: Vec3, ratio: number): Vec3 | null {
  const orientedNormal = dot3(incident, normal) < 0 ? normal : mul3(normal, -1);
  const cosTheta = dot3(orientedNormal, incident);
  const k = 1 - ratio * ratio * (1 - cosTheta * cosTheta);
  if (k < 0) {
    return null;
  }

  return normalize3(
    sub3(
      mul3(incident, ratio),
      mul3(orientedNormal, ratio * cosTheta + Math.sqrt(k)),
    ),
  );
}

function reflectVector(incident: Vec3, normal: Vec3): Vec3 {
  const orientedNormal = dot3(incident, normal) < 0 ? normal : mul3(normal, -1);
  return normalize3(
    sub3(incident, mul3(orientedNormal, 2 * dot3(incident, orientedNormal))),
  );
}

function resolveTransmissionDirection(
  incident: Vec3,
  normal: Vec3,
  ratio: number,
): DiamondTransmissionResult {
  const refracted = refractVector(incident, normal, ratio);
  if (refracted) {
    return {
      kind: 'refracted',
      direction: refracted,
    };
  }

  return {
    kind: 'reflected',
    direction: reflectVector(incident, normal),
  };
}

function createProjectedHull(
  transform: DiamondTransform,
  size: DiamondSize,
): DiamondPoint[] {
  const projected = [PYRAMID_VERTICES.apex]
    .concat(PYRAMID_VERTICES.base)
    .map((vertex) => {
      const rotated = rotatePointWithTransform(vertex, transform);
      const projectedPoint = projectPoint(rotated);
      return {
        x: (projectedPoint[0] / VIEWPORT_SCALE) * (size.cssWidth / 2) + size.cssWidth / 2,
        y: size.cssHeight / 2 - (projectedPoint[1] / VIEWPORT_SCALE) * (size.cssHeight / 2),
      };
    });

  return convexHull(projected);
}

function createProjectedFaces(
  transform: DiamondTransform,
  size: DiamondSize,
): DiamondProjectedFace[] {
  return PYRAMID_FACES.map((face) => {
    const worldVertices = face.vertices.map((vertex) => rotatePointWithTransform(vertex, transform));
    const points = worldVertices.map((vertex) => {
      const projectedPoint = projectPoint(vertex);
      return {
        x: (projectedPoint[0] / VIEWPORT_SCALE) * (size.cssWidth / 2) + size.cssWidth / 2,
        y: size.cssHeight / 2 - (projectedPoint[1] / VIEWPORT_SCALE) * (size.cssHeight / 2),
      };
    });
    const centroid = mul3(
      add3(add3(worldVertices[0], worldVertices[1]), worldVertices[2]),
      1 / 3,
    );
    const rotatedNormal = normalize3(rotatePointWithTransform(face.normal, transform));
    const viewDirection = normalize3(sub3(CAMERA, centroid));
    const facing = Math.abs(dot3(rotatedNormal, viewDirection));

    return {
      points,
      strokeOpacity: 0.09 + facing * 0.14,
      fillOpacity: 0.012 + facing * 0.028,
    };
  });
}

function createDiamondContext(
  theta: number,
  phi: number,
  size: DiamondSize,
): DiamondContext {
  const transform: DiamondTransform = {
    theta,
    phi,
    thetaCos: Math.cos(theta),
    thetaSin: Math.sin(theta),
    phiCos: Math.cos(phi),
    phiSin: Math.sin(phi),
  };
  const hull = createProjectedHull(transform, size);
  const projectedFaces = createProjectedFaces(transform, size);
  const hullCenter = centroid2(hull);
  const hullBounds = bounds2(hull);
  const bloomAnchors = selectBloomAnchors(hull);
  const hullEdges = buildHullEdges(hull);

  return {
    ...transform,
    hull,
    projectedFaces,
    hullCenter,
    hullBounds,
    bloomAnchors,
    hullEdges,
    clipPath: `polygon(${hull
      .map((point) => `${point.x.toFixed(2)}px ${point.y.toFixed(2)}px`)
      .join(', ')})`,
  };
}

function buildDisplacementTrace(
  uv: { x: number; y: number },
  origin: Vec3,
  direction: Vec3,
  entryPoint: Vec3,
  size: DiamondSize,
  exitPoint?: Vec3,
): DiamondDisplacementTrace {
  const finalExitPoint = exitPoint ?? entryPoint;
  const stableDirection = stabilizeBackgroundDirection(direction, MIN_BACKGROUND_Z_COMPONENT);
  const hit = traceToPlane(origin, stableDirection, BACKGROUND_Z);
  if (!hit) {
    return {
      displacedUv: {
        x: uv.x,
        y: uv.y,
      },
    };
  }

  const displacedUv = screenPointToUv(hit, size);
  let offsetX = displacedUv.x - uv.x;
  let offsetY = displacedUv.y - uv.y;
  offsetX = clamp(offsetX, -MAX_UV_OFFSET, MAX_UV_OFFSET);
  offsetY = clamp(offsetY, -MAX_UV_OFFSET, MAX_UV_OFFSET);

  const strength = clamp(
    0.9 + length3(sub3(finalExitPoint, entryPoint)) * 0.14,
    0.85,
    1.25,
  );

  return {
    displacedUv: {
      x: uv.x + softClampSigned(offsetX * strength, MAX_EFFECTIVE_UV_OFFSET),
      y: uv.y + softClampSigned(offsetY * strength, MAX_EFFECTIVE_UV_OFFSET),
    },
  };
}

function traceDiamondRay(
  uv: { x: number; y: number },
  context: DiamondContext,
  size: DiamondSize,
): DiamondDisplacementTrace | null {
  const screenPoint = uvToScreenPoint(uv, size);
  const rayDirection = normalize3(sub3(screenPoint, CAMERA));
  const firstHit = intersectCrystalFaces(CAMERA, rayDirection, context);
  if (!firstHit) {
    return null;
  }

  const entryPoint = firstHit.point;
  const entryTransmission = resolveTransmissionDirection(rayDirection, firstHit.normal, 1 / IOR);
  if (entryTransmission.kind === 'reflected') {
    return buildDisplacementTrace(
      uv,
      add3(entryPoint, mul3(entryTransmission.direction, SURFACE_OFFSET)),
      entryTransmission.direction,
      entryPoint,
      size,
    );
  }

  let insideOrigin = add3(entryPoint, mul3(entryTransmission.direction, SURFACE_OFFSET));
  let currentDirection = entryTransmission.direction;
  let exitPoint: Vec3 | null = null;
  let outsideDirection: Vec3 | null = null;

  for (let bounce = 0; bounce < MAX_INTERNAL_BOUNCES; bounce += 1) {
    const insideHit = intersectCrystalFaces(insideOrigin, currentDirection, context);
    if (!insideHit) {
      return buildDisplacementTrace(uv, insideOrigin, currentDirection, entryPoint, size);
    }

    exitPoint = insideHit.point;
    const exitTransmission = resolveTransmissionDirection(currentDirection, insideHit.normal, IOR);
    if (exitTransmission.kind === 'refracted') {
      outsideDirection = exitTransmission.direction;
      break;
    }

    currentDirection = exitTransmission.direction;
    insideOrigin = add3(exitPoint, mul3(currentDirection, SURFACE_OFFSET));
  }

  if (!exitPoint || !outsideDirection) {
    return buildDisplacementTrace(uv, insideOrigin, currentDirection, entryPoint, size);
  }

  return buildDisplacementTrace(
    uv,
    add3(exitPoint, mul3(outsideDirection, SURFACE_OFFSET)),
    outsideDirection,
    entryPoint,
    size,
    exitPoint,
  );
}

function applyEdgeBulge(
  trace: DiamondDisplacementTrace,
  uv: { x: number; y: number },
  context: DiamondContext,
  size: DiamondSize,
): DiamondDisplacementTrace {
  const pixelPoint = {
    x: uv.x * size.cssWidth,
    y: uv.y * size.cssHeight,
  };
  let edgeDistance = Infinity;
  for (const edge of context.hullEdges) {
    edgeDistance = Math.min(edgeDistance, pointEdgeDistance(pixelPoint, edge));
  }

  const edgeWeight = 1 - smoothStep(0, EDGE_BULGE_PX, edgeDistance);
  if (edgeWeight <= 0) {
    return trace;
  }

  const centerUv = {
    x: context.hullCenter.x / size.cssWidth,
    y: context.hullCenter.y / size.cssHeight,
  };

  return {
    displacedUv: {
      x:
        trace.displacedUv.x
        + (centerUv.x - uv.x) * edgeWeight * EDGE_BULGE_STRENGTH,
      y:
        trace.displacedUv.y
        + (centerUv.y - uv.y) * edgeWeight * EDGE_BULGE_STRENGTH,
    },
  };
}

function renderDisplacementMap(
  state: DiamondState,
  context: DiamondContext,
): number {
  const { pixelWidth, pixelHeight, dpi } = state.size;
  const { canvasEl, canvasCtx } = state;
  canvasEl.width = pixelWidth;
  canvasEl.height = pixelHeight;

  const imageData = canvasCtx.createImageData(pixelWidth, pixelHeight);
  const data = imageData.data;
  const rawValues = new Float32Array(pixelWidth * pixelHeight * 2);
  let maxScale = 0;
  let rawIndex = 0;

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const uv = {
        x: x / pixelWidth,
        y: y / pixelHeight,
      };
      const trace = traceDiamondRay(uv, context, state.size);
      const displaced = trace ? applyEdgeBulge(trace, uv, context, state.size) : {
        displacedUv: uv,
      };
      const dx = displaced.displacedUv.x * pixelWidth - x;
      const dy = displaced.displacedUv.y * pixelHeight - y;
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      rawValues[rawIndex] = dx;
      rawValues[rawIndex + 1] = dy;
      rawIndex += 2;
    }
  }

  maxScale = Math.max(maxScale, 1);
  rawIndex = 0;

  for (let index = 0; index < data.length; index += 4) {
    const r = rawValues[rawIndex] / (maxScale * 2) + 0.5;
    const g = rawValues[rawIndex + 1] / (maxScale * 2) + 0.5;
    data[index] = Math.round(clamp(r, 0, 1) * 255);
    data[index + 1] = Math.round(clamp(g, 0, 1) * 255);
    data[index + 2] = 0;
    data[index + 3] = 255;
    rawIndex += 2;
  }

  canvasCtx.putImageData(imageData, 0, 0);
  const dataUrl = canvasEl.toDataURL();
  state.feImageEl.setAttribute('href', dataUrl);
  state.feImageEl.setAttributeNS(XLINK_NS, 'href', dataUrl);
  return (maxScale * 2) / dpi;
}

function updateDisplacementScale(state: DiamondState): void {
  const normalizedStrength = state.settings.displacementScale / DEFAULT_DISPLACEMENT_SCALE;
  const appliedScale = state.baseDisplacementScale * normalizedStrength;
  state.feDisplacementMapEl.setAttribute('scale', formatNumber(appliedScale));
}

function createLayerElement(ownerId: string, role: string): HTMLDivElement {
  const element = document.createElement('div');
  element.dataset.opencodianLgShudingDiamondOwner = ownerId;
  element.setAttribute('data-opencodian-lg-shuding-diamond-role', role);
  element.style.position = 'absolute';
  element.style.inset = '0';
  element.style.borderRadius = 'inherit';
  element.style.pointerEvents = 'none';
  return element;
}

function createFaceSvgElement(ownerId: string): SVGSVGElement {
  const element = createSvgElement('svg');
  element.setAttribute('data-opencodian-lg-shuding-diamond-owner', ownerId);
  element.setAttribute('data-opencodian-lg-shuding-diamond-role', 'face-overlay');
  element.style.position = 'absolute';
  element.style.inset = '0';
  element.style.overflow = 'visible';
  element.style.pointerEvents = 'none';
  return element;
}

function applyFilterLayerState(state: DiamondState): void {
  state.shellEl.dataset.opencodianLgShudingDiamond = 'mounted';
  state.filterLayerEl.dataset.opencodianLgShudingDiamondOwner = state.ownerId;
  state.filterLayerEl.dataset.opencodianLgShudingDiamondUrlSupported = state.supportsBackdropFilterUrl
    ? 'true'
    : 'false';
  state.filterLayerEl.style.setProperty('opacity', '1');
}

function renderFaceOverlay(
  state: DiamondState,
  context: DiamondContext,
): void {
  state.faceSvgEl.setAttribute('width', `${state.size.cssWidth}`);
  state.faceSvgEl.setAttribute('height', `${state.size.cssHeight}`);
  state.faceSvgEl.setAttribute('viewBox', `0 0 ${state.size.cssWidth} ${state.size.cssHeight}`);
  state.faceSvgEl.style.opacity = formatNumber(state.settings.faceOverlayOpacity);
  state.faceSvgEl.replaceChildren();

  for (let index = 0; index < context.projectedFaces.length; index += 1) {
    const face = context.projectedFaces[index];
    const polygon = createSvgElement('polygon');
    polygon.setAttribute('data-opencodian-lg-shuding-diamond-owner', state.ownerId);
    polygon.setAttribute('data-opencodian-lg-shuding-diamond-role', 'face');
    polygon.setAttribute('data-opencodian-lg-shuding-diamond-face-index', `${index}`);
    polygon.setAttribute(
      'points',
      face.points
        .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
        .join(' '),
    );
    polygon.setAttribute(
      'fill',
      `rgba(188, 232, 247, ${face.fillOpacity.toFixed(3)})`,
    );
    polygon.setAttribute(
      'stroke',
      `rgba(126, 176, 198, ${face.strokeOpacity.toFixed(3)})`,
    );
    polygon.setAttribute('stroke-width', '1');
    polygon.setAttribute('stroke-linejoin', 'round');
    polygon.setAttribute('vector-effect', 'non-scaling-stroke');
    state.faceSvgEl.appendChild(polygon);
  }

  const hullOutline = createSvgElement('polygon');
  hullOutline.setAttribute('data-opencodian-lg-shuding-diamond-owner', state.ownerId);
  hullOutline.setAttribute('data-opencodian-lg-shuding-diamond-role', 'facet-outline');
  hullOutline.setAttribute(
    'points',
    context.hull
      .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' '),
  );
  hullOutline.setAttribute('fill', 'none');
  hullOutline.setAttribute('stroke', 'rgba(220, 248, 255, 0.34)');
  hullOutline.setAttribute('stroke-width', '1.1');
  hullOutline.setAttribute('stroke-linejoin', 'round');
  hullOutline.setAttribute('vector-effect', 'non-scaling-stroke');
  state.faceSvgEl.appendChild(hullOutline);
}

function renderVisualLayers(
  state: DiamondState,
  context: DiamondContext,
): void {
  const centerX = (context.hullCenter.x / state.size.cssWidth) * 100;
  const centerY = (context.hullCenter.y / state.size.cssHeight) * 100;
  const topX = (context.bloomAnchors.top.x / state.size.cssWidth) * 100;
  const topY = (context.bloomAnchors.top.y / state.size.cssHeight) * 100;
  const leftX = (context.bloomAnchors.lowerLeft.x / state.size.cssWidth) * 100;
  const leftY = (context.bloomAnchors.lowerLeft.y / state.size.cssHeight) * 100;
  const rightX = (context.bloomAnchors.lowerRight.x / state.size.cssWidth) * 100;
  const rightY = (context.bloomAnchors.lowerRight.y / state.size.cssHeight) * 100;
  const bloomScaleX = Math.max((context.hullBounds.width / state.size.cssWidth) * 100, 68);
  const bloomScaleY = Math.max((context.hullBounds.height / state.size.cssHeight) * 100, 78);

  state.supportEl.style.opacity = formatNumber(state.settings.supportOpacity);
  state.supportEl.style.background = [
    'linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04) 38%, rgba(18, 28, 40, 0.2) 100%)',
    'linear-gradient(135deg, rgba(174, 230, 250, 0.18), rgba(88, 148, 176, 0.08) 45%, rgba(16, 24, 32, 0.26) 100%)',
  ].join(', ');
  state.supportEl.style.boxShadow = [
    'inset 0 1px 0 rgba(255, 255, 255, 0.18)',
    'inset 0 0 0 1px rgba(220, 246, 255, 0.10)',
    '0 10px 24px rgba(4, 14, 28, 0.10)',
  ].join(', ');
  state.supportEl.style.setProperty(
    'backdrop-filter',
    'blur(8px) saturate(1.1) brightness(1.04)',
  );
  state.supportEl.style.setProperty(
    '-webkit-backdrop-filter',
    'blur(8px) saturate(1.1) brightness(1.04)',
  );

  state.bloomEl.style.setProperty('clip-path', context.clipPath);
  state.bloomEl.style.opacity = formatNumber(state.settings.bloomOpacity);
  state.bloomEl.style.transform = 'scale(1.03)';
  state.bloomEl.style.transformOrigin = `${centerX}% ${centerY}%`;
  state.bloomEl.style.filter = 'blur(30px) saturate(1.3) brightness(1.22)';
  state.bloomEl.style.background = [
    `radial-gradient(${bloomScaleX * 0.2}% ${bloomScaleY * 0.24}% at ${topX}% ${topY}%, rgba(255, 255, 255, 0.98), rgba(186, 244, 255, 0.68) 34%, rgba(108, 224, 255, 0.2) 62%, rgba(108, 224, 255, 0) 100%)`,
    `radial-gradient(${bloomScaleX * 0.18}% ${bloomScaleY * 0.2}% at ${leftX}% ${leftY}%, rgba(214, 247, 255, 0.58), rgba(110, 221, 255, 0.24) 48%, rgba(110, 221, 255, 0) 100%)`,
    `radial-gradient(${bloomScaleX * 0.16}% ${bloomScaleY * 0.18}% at ${rightX}% ${rightY}%, rgba(208, 244, 255, 0.34), rgba(110, 221, 255, 0.14) 50%, rgba(110, 221, 255, 0) 100%)`,
    `radial-gradient(${bloomScaleX * 0.44}% ${bloomScaleY * 0.32}% at ${centerX}% ${Math.max(centerY - 8, 12)}%, rgba(160, 236, 255, 0.22), rgba(160, 236, 255, 0.08) 54%, rgba(160, 236, 255, 0) 100%)`,
  ].join(', ');

  state.crystalEl.style.setProperty('clip-path', context.clipPath);
  state.crystalEl.style.background = [
    'linear-gradient(140deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03) 38%, rgba(255, 255, 255, 0.10) 68%, rgba(255, 255, 255, 0.18))',
    'linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05))',
  ].join(', ');
  state.crystalEl.style.boxShadow = 'inset 0 0 0 1px rgba(224, 248, 255, 0.08)';
  const filterValue = state.supportsBackdropFilterUrl
    ? buildBackdropFilterValue(state.filterId)
    : buildFallbackBackdropFilterValue();
  state.crystalEl.style.setProperty('backdrop-filter', filterValue);
  state.crystalEl.style.setProperty('-webkit-backdrop-filter', filterValue);

  state.rimEl.style.setProperty('clip-path', context.clipPath);
  state.rimEl.style.opacity = formatNumber(state.settings.rimOpacity);
  state.rimEl.style.background =
    'linear-gradient(145deg, rgba(255, 255, 255, 0.72), rgba(205, 246, 255, 0.18) 42%, rgba(255, 255, 255, 0.04) 78%, rgba(255, 255, 255, 0.24))';
  state.rimEl.style.filter =
    'drop-shadow(0 0 6px rgba(170, 240, 255, 0.45)) drop-shadow(0 0 14px rgba(122, 225, 255, 0.18))';

  renderFaceOverlay(state, context);
}

function renderState(state: DiamondState): void {
  state.size = measureShell(state.shellEl);
  state.filterEl.setAttribute('x', '0');
  state.filterEl.setAttribute('y', '0');
  state.filterEl.setAttribute('width', `${state.size.cssWidth}`);
  state.filterEl.setAttribute('height', `${state.size.cssHeight}`);
  state.feImageEl.setAttribute('x', '0');
  state.feImageEl.setAttribute('y', '0');
  state.feImageEl.setAttribute('width', `${state.size.cssWidth}`);
  state.feImageEl.setAttribute('height', `${state.size.cssHeight}`);

  applyFilterLayerState(state);
  const context = createDiamondContext(state.currentTheta, state.currentPhi, state.size);
  state.baseDisplacementScale = renderDisplacementMap(state, context);
  updateDisplacementScale(state);
  renderVisualLayers(state, context);
}

function updateAnimatedOrientation(state: DiamondState): void {
  state.frameId = null;
  const thetaDelta = state.targetTheta - state.currentTheta;
  const phiDelta = state.targetPhi - state.currentPhi;
  state.currentTheta += thetaDelta * 0.18;
  state.currentPhi += phiDelta * 0.18;

  if (Math.abs(thetaDelta) < 0.001) {
    state.currentTheta = state.targetTheta;
  }
  if (Math.abs(phiDelta) < 0.001) {
    state.currentPhi = state.targetPhi;
  }

  renderState(state);

  if (
    Math.abs(state.targetTheta - state.currentTheta) > 0.001
    || Math.abs(state.targetPhi - state.currentPhi) > 0.001
  ) {
    scheduleAnimatedOrientation(state);
  }
}

function scheduleAnimatedOrientation(state: DiamondState): void {
  if (state.frameId !== null) {
    return;
  }

  state.frameId = window.requestAnimationFrame(() => {
    updateAnimatedOrientation(state);
  });
}

function resetPointerOrientation(state: DiamondState): void {
  state.targetTheta = DEFAULT_THETA;
  state.targetPhi = DEFAULT_PHI;
  scheduleAnimatedOrientation(state);
}

function updateTargetFromPointer(state: DiamondState, event: PointerEvent): void {
  if (!state.settings.pointerTracking) {
    return;
  }

  const rect = state.shellEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const normalizedY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  state.targetTheta = DEFAULT_THETA + normalizedX * THETA_POINTER_RANGE * state.settings.pointerTilt;
  state.targetPhi = clamp(
    DEFAULT_PHI - normalizedY * PHI_POINTER_RANGE * state.settings.pointerTilt,
    PHI_MIN,
    PHI_MAX,
  );
  scheduleAnimatedOrientation(state);
}

function createState(
  ctx: GlassMountContext,
  settings: Record<string, GlassAdapterSettingsValue>,
): DiamondState {
  const canvasEl = document.createElement('canvas');
  const canvasCtx = canvasEl.getContext('2d');
  if (!canvasCtx) {
    throw new Error('[OpenCodian] Unable to create 2D canvas context for the Shuding diamond adapter.');
  }

  const ownerId = generateFilterId();
  const filterId = `${ownerId}-filter`;
  const defsEl = createSvgElement('defs');
  const filterEl = createSvgElement('filter');
  const feImageEl = createSvgElement('feImage');
  const feDisplacementMapEl = createSvgElement('feDisplacementMap');
  defsEl.setAttribute('data-opencodian-lg-shuding-diamond-owner', ownerId);
  defsEl.setAttribute('data-opencodian-lg-shuding-diamond-role', 'defs');
  defsEl.setAttribute('data-opencodian-lg-shuding-diamond-filter-id', filterId);
  filterEl.setAttribute('id', filterId);
  filterEl.setAttribute('filterUnits', 'userSpaceOnUse');
  filterEl.setAttribute('primitiveUnits', 'userSpaceOnUse');
  filterEl.setAttribute('color-interpolation-filters', 'sRGB');
  feImageEl.setAttribute('result', 'diamond-displacement-map');
  feImageEl.setAttribute('preserveAspectRatio', 'none');
  feDisplacementMapEl.setAttribute('in', 'SourceGraphic');
  feDisplacementMapEl.setAttribute('in2', 'diamond-displacement-map');
  feDisplacementMapEl.setAttribute('xChannelSelector', 'R');
  feDisplacementMapEl.setAttribute('yChannelSelector', 'G');
  filterEl.appendChild(feImageEl);
  filterEl.appendChild(feDisplacementMapEl);
  defsEl.appendChild(filterEl);
  ctx.svgRootEl.appendChild(defsEl);

  const rootEl = createLayerElement(ownerId, 'root');
  const supportEl = createLayerElement(ownerId, 'support');
  const bloomEl = createLayerElement(ownerId, 'bloom');
  const crystalEl = createLayerElement(ownerId, 'crystal');
  const rimEl = createLayerElement(ownerId, 'rim');
  const faceSvgEl = createFaceSvgElement(ownerId);
  rootEl.append(supportEl, bloomEl, crystalEl, rimEl, faceSvgEl);
  ctx.filterLayerEl.appendChild(rootEl);

  const state: DiamondState = {
    ctx,
    shellEl: ctx.shellEl,
    filterLayerEl: ctx.filterLayerEl,
    svgRootEl: ctx.svgRootEl,
    defsEl,
    filterEl,
    feImageEl,
    feDisplacementMapEl,
    canvasEl,
    canvasCtx,
    rootEl,
    supportEl,
    bloomEl,
    crystalEl,
    rimEl,
    faceSvgEl,
    resizeObserver: null,
    frameId: null,
    settings: resolveSettings(settings),
    size: measureShell(ctx.shellEl),
    baseDisplacementScale: 0,
    currentTheta: DEFAULT_THETA,
    currentPhi: DEFAULT_PHI,
    targetTheta: DEFAULT_THETA,
    targetPhi: DEFAULT_PHI,
    supportsBackdropFilterUrl: supportsBackdropFilterUrl(),
    ownerId,
    filterId,
    shellDatasetSnapshot: captureDatasetSnapshot(ctx.shellEl, SHELL_DATASET_KEYS),
    filterLayerDatasetSnapshot: captureDatasetSnapshot(ctx.filterLayerEl, FILTER_LAYER_DATASET_KEYS),
    filterLayerStyleSnapshot: captureStyleSnapshot(ctx.filterLayerEl, FILTER_LAYER_STYLE_PROPERTIES),
    pointerMoveHandler: (event: PointerEvent) => {
      updateTargetFromPointer(state, event);
    },
    pointerLeaveHandler: () => {
      resetPointerOrientation(state);
    },
  };

  state.shellEl.addEventListener('pointermove', state.pointerMoveHandler);
  state.shellEl.addEventListener('pointerleave', state.pointerLeaveHandler);

  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(() => {
      renderState(state);
    });
    state.resizeObserver.observe(state.shellEl);
  }

  return state;
}

function cleanupState(state: DiamondState): void {
  state.resizeObserver?.disconnect();
  if (state.frameId !== null) {
    window.cancelAnimationFrame(state.frameId);
  }

  state.shellEl.removeEventListener('pointermove', state.pointerMoveHandler);
  state.shellEl.removeEventListener('pointerleave', state.pointerLeaveHandler);
  state.canvasEl.width = 0;
  state.canvasEl.height = 0;
  state.defsEl.remove();
  state.rootEl.remove();
  restoreStyleSnapshot(state.filterLayerEl, state.filterLayerStyleSnapshot);
  restoreDatasetSnapshot(state.filterLayerEl, state.filterLayerDatasetSnapshot);
  restoreDatasetSnapshot(state.shellEl, state.shellDatasetSnapshot);
}

function mount(
  ctx: GlassMountContext,
  settings: Record<string, GlassAdapterSettingsValue>,
): void {
  const existingState = stateByShellEl.get(ctx.shellEl);
  if (existingState) {
    existingState.settings = resolveSettings(settings);
    if (!existingState.settings.pointerTracking) {
      existingState.targetTheta = DEFAULT_THETA;
      existingState.targetPhi = DEFAULT_PHI;
    }
    scheduleAnimatedOrientation(existingState);
    renderState(existingState);
    return;
  }

  const state = createState(ctx, settings);
  stateByShellEl.set(ctx.shellEl, state);
  renderState(state);
}

function updateSettings(
  ctx: GlassMountContext,
  settings: Record<string, GlassAdapterSettingsValue>,
): void {
  const state = stateByShellEl.get(ctx.shellEl);
  if (!state) {
    mount(ctx, settings);
    return;
  }

  state.settings = resolveSettings(settings);
  if (!state.settings.pointerTracking) {
    state.targetTheta = DEFAULT_THETA;
    state.targetPhi = DEFAULT_PHI;
  }
  scheduleAnimatedOrientation(state);
  renderState(state);
}

function unmount(ctx: GlassMountContext): void {
  const state = stateByShellEl.get(ctx.shellEl);
  if (!state) {
    return;
  }

  cleanupState(state);
  stateByShellEl.delete(ctx.shellEl);
}

export const adapter: GlassEffectAdapter = {
  id: 'shudingDiamond',
  displayName: 'Shuding Diamond',
  description: 'A separate diamond-cut liquid-crystal adapter with traced refraction, bloom, rim light, and facet overlays.',
  paramDefs,
  mount,
  updateSettings,
  unmount,
};

export {
  IOR,
  MAX_INTERNAL_BOUNCES,
  applyEdgeBulge,
  convexHull,
  createDiamondContext,
  reflectVector,
  refractVector,
  resolveTransmissionDirection,
  traceDiamondRay,
};
export type {
  DiamondContext,
  DiamondDisplacementTrace,
  DiamondPoint,
  DiamondProjectedFace,
  DiamondSize,
};

export const __testing = {
  IOR,
  MAX_INTERNAL_BOUNCES,
  applyEdgeBulge,
  createDiamondContext,
  measureShell,
  convexHull,
  refractVector,
  reflectVector,
  resolveSettings,
  resolveTransmissionDirection,
  traceDiamondRay,
  resetCachedBackdropFilterUrlSupport(): void {
    cachedBackdropFilterUrlSupport = null;
  },
};
