const CAMERA_FOV_DEGREES = 31;
const GLASS_OCTAHEDRON_CAMERA_POSITION: Vec3 = [0, 0.12, 5.8];
const GLASS_OCTAHEDRON_CAMERA_TARGET: Vec3 = [0, 0, 0];
const GLASS_OCTAHEDRON_BACKGROUND_PLANE_DISTANCE = 4.8;
const GLASS_OCTAHEDRON_IOR = 1.18;
const GLASS_OCTAHEDRON_MAX_TRACE_DISTANCE = 18;
const GLASS_OCTAHEDRON_SURFACE_OFFSET = 0.008;
const GLASS_OCTAHEDRON_MIN_BACKGROUND_COMPONENT = 0.08;
const GLASS_OCTAHEDRON_MAX_UV_OFFSET = 0.055;
const GLASS_OCTAHEDRON_EFFECTIVE_UV_OFFSET = 0.038;
const GLASS_OCTAHEDRON_MAX_INTERNAL_BOUNCES = 6;
const GLASS_OCTAHEDRON_INTERACTIVE_MAP_SIZE = 64;
const GLASS_OCTAHEDRON_SETTLED_MAP_SIZE = 112;
const GLASS_OCTAHEDRON_INTERACTIVE_DISPLACEMENT_SCALE = 20;
const GLASS_OCTAHEDRON_SETTLED_DISPLACEMENT_SCALE = 26;
const GLASS_OCTAHEDRON_DISPLACEMENT_EDGE_DISTANCE_RATIO = 0.18;
const GLASS_OCTAHEDRON_EPSILON = 1e-6;
const SVG_URL_SUPPORT_ID = 'opencodian-glass-octahedron-demo-support';
const WORLD_UP: Vec3 = [0, 1, 0];

type Vec3 = [number, number, number];

export type GlassOctahedronQualityTier = 'full-v3' | 'light-v3' | 'mesh-only';
export type GlassOctahedronRenderQuality = 'interactive' | 'settled';

export interface GlassOctahedronPoint {
  x: number;
  y: number;
}

export interface GlassOctahedronBounds {
  height: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
}

export interface GlassOctahedronProjectedFace {
  facing: number;
  fillOpacity: number;
  points: GlassOctahedronPoint[];
  strokeOpacity: number;
}

export interface GlassOctahedronStageSize {
  cssHeight: number;
  cssWidth: number;
}

export interface GlassOctahedronProjectionContext {
  bounds: GlassOctahedronBounds;
  center: GlassOctahedronPoint;
  clipPath: string;
  displacementStrength: number;
  hull: GlassOctahedronPoint[];
  projectedFaces: GlassOctahedronProjectedFace[];
  qualityTier: GlassOctahedronQualityTier;
  transform: GlassOctahedronTransform;
}

export interface GlassOctahedronDisplacementSnapshot {
  dataUrl: string;
  filterScale: number;
}

export interface GlassOctahedronBackdropSupport {
  basic: boolean;
  url: boolean;
}

export interface GlassOctahedronTransform {
  offsetY: number;
  pitch: number;
  roll: number;
  yaw: number;
}

type GlassOctahedronFace = {
  normal: Vec3;
  vertices: [Vec3, Vec3, Vec3];
};

type GlassOctahedronIntersection = {
  normal: Vec3;
  point: Vec3;
  t: number;
};

type GlassOctahedronTransmissionResult = {
  direction: Vec3;
  kind: 'reflected' | 'refracted';
};

export const GLASS_OCTAHEDRON_GEOMETRY_RADIUS = 1.36;

const GLASS_OCTAHEDRON_LOCAL_VERTICES = {
  back: [0, 0, -GLASS_OCTAHEDRON_GEOMETRY_RADIUS] as Vec3,
  bottom: [0, -GLASS_OCTAHEDRON_GEOMETRY_RADIUS, 0] as Vec3,
  front: [0, 0, GLASS_OCTAHEDRON_GEOMETRY_RADIUS] as Vec3,
  left: [-GLASS_OCTAHEDRON_GEOMETRY_RADIUS, 0, 0] as Vec3,
  right: [GLASS_OCTAHEDRON_GEOMETRY_RADIUS, 0, 0] as Vec3,
  top: [0, GLASS_OCTAHEDRON_GEOMETRY_RADIUS, 0] as Vec3,
};

const GLASS_OCTAHEDRON_FACES: readonly GlassOctahedronFace[] = [
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.top,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.right,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.front,
  ),
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.top,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.front,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.left,
  ),
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.top,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.left,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.back,
  ),
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.top,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.back,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.right,
  ),
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.bottom,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.front,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.right,
  ),
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.bottom,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.left,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.front,
  ),
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.bottom,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.back,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.left,
  ),
  createFace(
    GLASS_OCTAHEDRON_LOCAL_VERTICES.bottom,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.right,
    GLASS_OCTAHEDRON_LOCAL_VERTICES.back,
  ),
];

const CAMERA_FORWARD = normalize3(
  sub3(GLASS_OCTAHEDRON_CAMERA_TARGET, GLASS_OCTAHEDRON_CAMERA_POSITION),
);
const CAMERA_RIGHT = normalize3(cross3(CAMERA_FORWARD, WORLD_UP));
const CAMERA_UP = normalize3(cross3(CAMERA_RIGHT, CAMERA_FORWARD));
const CAMERA_TAN_HALF_FOV = Math.tan((CAMERA_FOV_DEGREES * Math.PI) / 360);
const GLASS_OCTAHEDRON_BACKGROUND_PLANE_POINT = add3(
  GLASS_OCTAHEDRON_CAMERA_TARGET,
  mul3(CAMERA_FORWARD, GLASS_OCTAHEDRON_BACKGROUND_PLANE_DISTANCE),
);

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function length3(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize3(vector: Vec3): Vec3 {
  const length = length3(vector);
  if (length <= GLASS_OCTAHEDRON_EPSILON) {
    return [0, 0, 0];
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function rotateX(point: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    point[0],
    point[1] * cos - point[2] * sin,
    point[1] * sin + point[2] * cos,
  ];
}

function rotateY(point: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    point[0] * cos + point[2] * sin,
    point[1],
    -point[0] * sin + point[2] * cos,
  ];
}

function rotateZ(point: Vec3, angle: number): Vec3 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    point[0] * cos - point[1] * sin,
    point[0] * sin + point[1] * cos,
    point[2],
  ];
}

function rotateLocalPoint(
  point: Vec3,
  transform: GlassOctahedronTransform,
): Vec3 {
  return rotateZ(
    rotateY(
      rotateX(point, transform.pitch),
      transform.yaw,
    ),
    transform.roll,
  );
}

function inverseRotateLocalPoint(
  point: Vec3,
  transform: GlassOctahedronTransform,
): Vec3 {
  return rotateX(
    rotateY(
      rotateZ(point, -transform.roll),
      -transform.yaw,
    ),
    -transform.pitch,
  );
}

function localPointToWorldPoint(
  point: Vec3,
  transform: GlassOctahedronTransform,
): Vec3 {
  const rotated = rotateLocalPoint(point, transform);
  return [rotated[0], rotated[1] + transform.offsetY, rotated[2]];
}

function worldPointToLocalPoint(
  point: Vec3,
  transform: GlassOctahedronTransform,
): Vec3 {
  return inverseRotateLocalPoint(
    [point[0], point[1] - transform.offsetY, point[2]],
    transform,
  );
}

function worldDirectionToLocalDirection(
  direction: Vec3,
  transform: GlassOctahedronTransform,
): Vec3 {
  return inverseRotateLocalPoint(direction, transform);
}

function localDirectionToWorldDirection(
  direction: Vec3,
  transform: GlassOctahedronTransform,
): Vec3 {
  return rotateLocalPoint(direction, transform);
}

function projectWorldPoint(
  point: Vec3,
  size: GlassOctahedronStageSize,
): GlassOctahedronPoint {
  const cameraToPoint = sub3(point, GLASS_OCTAHEDRON_CAMERA_POSITION);
  const viewX = dot3(cameraToPoint, CAMERA_RIGHT);
  const viewY = dot3(cameraToPoint, CAMERA_UP);
  const viewZ = -dot3(cameraToPoint, CAMERA_FORWARD);
  const safeDepth = Math.max(-viewZ, GLASS_OCTAHEDRON_EPSILON);
  const ndcX = viewX / (safeDepth * CAMERA_TAN_HALF_FOV);
  const ndcY = viewY / (safeDepth * CAMERA_TAN_HALF_FOV);

  return {
    x: clamp((ndcX * 0.5 + 0.5) * size.cssWidth, 0, size.cssWidth),
    y: clamp((-ndcY * 0.5 + 0.5) * size.cssHeight, 0, size.cssHeight),
  };
}

function uvToWorldRayDirection(uv: { x: number; y: number }): Vec3 {
  const ndcX = uv.x * 2 - 1;
  const ndcY = 1 - uv.y * 2;
  const cameraDirection = normalize3([
    ndcX * CAMERA_TAN_HALF_FOV,
    ndcY * CAMERA_TAN_HALF_FOV,
    -1,
  ]);

  return normalize3(
    add3(
      add3(
        mul3(CAMERA_RIGHT, cameraDirection[0]),
        mul3(CAMERA_UP, cameraDirection[1]),
      ),
      mul3(CAMERA_FORWARD, -cameraDirection[2]),
    ),
  );
}

function worldPointToUv(
  point: Vec3,
  size: GlassOctahedronStageSize,
): { x: number; y: number } {
  const projected = projectWorldPoint(point, size);
  return {
    x: projected.x / size.cssWidth,
    y: projected.y / size.cssHeight,
  };
}

function createFace(a: Vec3, b: Vec3, c: Vec3): GlassOctahedronFace {
  const interiorPoint: Vec3 = [0, 0, 0];
  let normal = normalize3(cross3(sub3(b, a), sub3(c, a)));
  if (dot3(sub3(interiorPoint, a), normal) > 0) {
    normal = mul3(normal, -1);
  }

  return {
    normal,
    vertices: [a, b, c],
  };
}

function convexHull(points: GlassOctahedronPoint[]): GlassOctahedronPoint[] {
  if (points.length <= 1) {
    return [...points];
  }

  const sorted = [...points].sort((a, b) => (
    a.x === b.x ? a.y - b.y : a.x - b.x
  ));

  const cross = (
    origin: GlassOctahedronPoint,
    a: GlassOctahedronPoint,
    b: GlassOctahedronPoint,
  ): number => (
    (a.x - origin.x) * (b.y - origin.y)
    - (a.y - origin.y) * (b.x - origin.x)
  );

  const lower: GlassOctahedronPoint[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2
      && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: GlassOctahedronPoint[] = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (
      upper.length >= 2
      && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function computeBounds(points: GlassOctahedronPoint[]): GlassOctahedronBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    height: maxY - minY,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX,
  };
}

function createProjectedFaces(
  transform: GlassOctahedronTransform,
  size: GlassOctahedronStageSize,
): GlassOctahedronProjectedFace[] {
  return GLASS_OCTAHEDRON_FACES.map((face) => {
    const worldVertices = face.vertices.map((vertex) => localPointToWorldPoint(vertex, transform));
    const points = worldVertices.map((vertex) => projectWorldPoint(vertex, size));
    const centroid = mul3(
      add3(add3(worldVertices[0], worldVertices[1]), worldVertices[2]),
      1 / 3,
    );
    const rotatedNormal = normalize3(localDirectionToWorldDirection(face.normal, transform));
    const viewDirection = normalize3(sub3(GLASS_OCTAHEDRON_CAMERA_POSITION, centroid));
    const facing = clamp(dot3(rotatedNormal, viewDirection), 0, 1);

    return {
      facing,
      fillOpacity: 0.018 + facing * 0.026,
      points,
      strokeOpacity: 0.064 + facing * 0.11,
    };
  });
}

function buildClipPath(points: GlassOctahedronPoint[]): string {
  return `polygon(${points
    .map((point) => `${point.x.toFixed(2)}px ${point.y.toFixed(2)}px`)
    .join(', ')})`;
}

function pointInPolygon(
  point: GlassOctahedronPoint,
  polygon: GlassOctahedronPoint[],
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const intersects = (
      (current.y > point.y) !== (prior.y > point.y)
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x
    );
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function distanceToSegment(
  point: GlassOctahedronPoint,
  a: GlassOctahedronPoint,
  b: GlassOctahedronPoint,
): number {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const abLengthSquared = abX * abX + abY * abY;
  if (abLengthSquared <= GLASS_OCTAHEDRON_EPSILON) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = clamp(
    ((point.x - a.x) * abX + (point.y - a.y) * abY) / abLengthSquared,
    0,
    1,
  );
  const closestX = a.x + abX * t;
  const closestY = a.y + abY * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function distanceToHullEdges(
  point: GlassOctahedronPoint,
  hull: GlassOctahedronPoint[],
): number {
  let minDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < hull.length; index += 1) {
    const a = hull[index];
    const b = hull[(index + 1) % hull.length];
    minDistance = Math.min(minDistance, distanceToSegment(point, a, b));
  }

  return minDistance;
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function softClampSigned(value: number, limit: number): number {
  if (limit <= GLASS_OCTAHEDRON_EPSILON) {
    return 0;
  }

  return limit * Math.tanh(value / limit);
}

function intersectRayTriangle(
  origin: Vec3,
  direction: Vec3,
  face: GlassOctahedronFace,
): GlassOctahedronIntersection | null {
  const [a, b, c] = face.vertices;
  const edge1 = sub3(b, a);
  const edge2 = sub3(c, a);
  const pvec = cross3(direction, edge2);
  const determinant = dot3(edge1, pvec);
  if (Math.abs(determinant) < GLASS_OCTAHEDRON_EPSILON) {
    return null;
  }

  const inverseDeterminant = 1 / determinant;
  const tvec = sub3(origin, a);
  const u = dot3(tvec, pvec) * inverseDeterminant;
  if (u < 0 || u > 1) {
    return null;
  }

  const qvec = cross3(tvec, edge1);
  const v = dot3(direction, qvec) * inverseDeterminant;
  if (v < 0 || u + v > 1) {
    return null;
  }

  const t = dot3(edge2, qvec) * inverseDeterminant;
  if (
    t <= GLASS_OCTAHEDRON_SURFACE_OFFSET
    || t > GLASS_OCTAHEDRON_MAX_TRACE_DISTANCE
  ) {
    return null;
  }

  return {
    normal: face.normal,
    point: add3(origin, mul3(direction, t)),
    t,
  };
}

function intersectGlassOctahedron(
  origin: Vec3,
  direction: Vec3,
  transform: GlassOctahedronTransform,
): GlassOctahedronIntersection | null {
  const localOrigin = worldPointToLocalPoint(origin, transform);
  const localDirection = worldDirectionToLocalDirection(direction, transform);
  let bestHit: GlassOctahedronIntersection | null = null;

  for (const face of GLASS_OCTAHEDRON_FACES) {
    const hit = intersectRayTriangle(localOrigin, localDirection, face);
    if (!hit) {
      continue;
    }

    if (!bestHit || hit.t < bestHit.t) {
      bestHit = {
        normal: normalize3(localDirectionToWorldDirection(hit.normal, transform)),
        point: localPointToWorldPoint(hit.point, transform),
        t: hit.t,
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
    sub3(
      incident,
      mul3(orientedNormal, 2 * dot3(incident, orientedNormal)),
    ),
  );
}

function resolveTransmissionDirection(
  incident: Vec3,
  normal: Vec3,
  ratio: number,
): GlassOctahedronTransmissionResult {
  const refracted = refractVector(incident, normal, ratio);
  if (refracted) {
    return {
      direction: refracted,
      kind: 'refracted',
    };
  }

  return {
    direction: reflectVector(incident, normal),
    kind: 'reflected',
  };
}

function stabilizeDirectionToBackground(direction: Vec3): Vec3 {
  const forwardComponent = Math.abs(dot3(direction, CAMERA_FORWARD));
  if (forwardComponent >= GLASS_OCTAHEDRON_MIN_BACKGROUND_COMPONENT) {
    return direction;
  }

  return normalize3(
    add3(
      mul3(direction, 0.64),
      mul3(CAMERA_FORWARD, 0.36),
    ),
  );
}

function traceToBackgroundPlane(origin: Vec3, direction: Vec3): Vec3 | null {
  const stabilizedDirection = stabilizeDirectionToBackground(direction);
  const denominator = dot3(stabilizedDirection, CAMERA_FORWARD);
  if (Math.abs(denominator) < GLASS_OCTAHEDRON_EPSILON) {
    return null;
  }

  const t = dot3(
    sub3(GLASS_OCTAHEDRON_BACKGROUND_PLANE_POINT, origin),
    CAMERA_FORWARD,
  ) / denominator;
  if (t <= 0) {
    return null;
  }

  return add3(origin, mul3(stabilizedDirection, t));
}

function buildDisplacementTrace(
  uv: { x: number; y: number },
  origin: Vec3,
  direction: Vec3,
  size: GlassOctahedronStageSize,
): { displacedUv: { x: number; y: number } } {
  const backgroundHit = traceToBackgroundPlane(origin, direction);
  if (!backgroundHit) {
    return {
      displacedUv: {
        x: uv.x,
        y: uv.y,
      },
    };
  }

  const displacedUv = worldPointToUv(backgroundHit, size);
  const offsetX = clamp(
    displacedUv.x - uv.x,
    -GLASS_OCTAHEDRON_MAX_UV_OFFSET,
    GLASS_OCTAHEDRON_MAX_UV_OFFSET,
  );
  const offsetY = clamp(
    displacedUv.y - uv.y,
    -GLASS_OCTAHEDRON_MAX_UV_OFFSET,
    GLASS_OCTAHEDRON_MAX_UV_OFFSET,
  );

  return {
    displacedUv: {
      x: uv.x + softClampSigned(offsetX, GLASS_OCTAHEDRON_EFFECTIVE_UV_OFFSET),
      y: uv.y + softClampSigned(offsetY, GLASS_OCTAHEDRON_EFFECTIVE_UV_OFFSET),
    },
  };
}

function traceGlassOctahedronRay(
  uv: { x: number; y: number },
  projection: GlassOctahedronProjectionContext,
  size: GlassOctahedronStageSize,
): { displacedUv: { x: number; y: number } } | null {
  const rayDirection = uvToWorldRayDirection(uv);
  const firstHit = intersectGlassOctahedron(
    GLASS_OCTAHEDRON_CAMERA_POSITION,
    rayDirection,
    projection.transform,
  );
  if (!firstHit) {
    return null;
  }

  const entryTransmission = resolveTransmissionDirection(
    rayDirection,
    firstHit.normal,
    1 / GLASS_OCTAHEDRON_IOR,
  );
  if (entryTransmission.kind === 'reflected') {
    return buildDisplacementTrace(
      uv,
      add3(
        firstHit.point,
        mul3(entryTransmission.direction, GLASS_OCTAHEDRON_SURFACE_OFFSET),
      ),
      entryTransmission.direction,
      size,
    );
  }

  let insideOrigin = add3(
    firstHit.point,
    mul3(entryTransmission.direction, GLASS_OCTAHEDRON_SURFACE_OFFSET),
  );
  let currentDirection = entryTransmission.direction;
  let exitPoint: Vec3 | null = null;
  let outsideDirection: Vec3 | null = null;

  for (let bounce = 0; bounce < GLASS_OCTAHEDRON_MAX_INTERNAL_BOUNCES; bounce += 1) {
    const insideHit = intersectGlassOctahedron(
      insideOrigin,
      currentDirection,
      projection.transform,
    );
    if (!insideHit) {
      return buildDisplacementTrace(
        uv,
        insideOrigin,
        currentDirection,
        size,
      );
    }

    exitPoint = insideHit.point;
    const exitTransmission = resolveTransmissionDirection(
      currentDirection,
      insideHit.normal,
      GLASS_OCTAHEDRON_IOR,
    );
    if (exitTransmission.kind === 'refracted') {
      outsideDirection = exitTransmission.direction;
      break;
    }

    insideOrigin = add3(
      exitPoint,
      mul3(exitTransmission.direction, GLASS_OCTAHEDRON_SURFACE_OFFSET),
    );
    currentDirection = exitTransmission.direction;
  }

  if (!outsideDirection || !exitPoint) {
    return buildDisplacementTrace(uv, insideOrigin, currentDirection, size);
  }

  return buildDisplacementTrace(
    uv,
    add3(exitPoint, mul3(outsideDirection, GLASS_OCTAHEDRON_SURFACE_OFFSET)),
    outsideDirection,
    size,
  );
}

function normalizeBackdropFilterValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function detectCssSupport(property: string, value: string): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports(property, value)
    : false;
}

function styleAcceptsBackdropValue(value: string, prefixed: boolean): boolean {
  const probe = document.createElement('div');
  if (prefixed) {
    probe.style.setProperty('-webkit-backdrop-filter', value);
    return normalizeBackdropFilterValue(
      probe.style.getPropertyValue('-webkit-backdrop-filter'),
    ).includes('url(');
  }

  probe.style.setProperty('backdrop-filter', value);
  return normalizeBackdropFilterValue(
    probe.style.getPropertyValue('backdrop-filter'),
  ).includes('url(');
}

function encodeDisplacementChannel(offset: number, scale: number): number {
  const normalized = clamp(offset / scale + 0.5, 0, 1);
  return Math.round(normalized * 255);
}

function setNeutralDisplacementPixel(
  data: Uint8ClampedArray,
  index: number,
): void {
  data[index] = 128;
  data[index + 1] = 128;
  data[index + 2] = 128;
  data[index + 3] = 255;
}

export function detectGlassOctahedronBackdropSupport(): GlassOctahedronBackdropSupport {
  const quotedValue = `url("#${SVG_URL_SUPPORT_ID}")`;
  const plainValue = `url(#${SVG_URL_SUPPORT_ID})`;
  const basic = (
    detectCssSupport('backdrop-filter', 'blur(1px)')
    || detectCssSupport('-webkit-backdrop-filter', 'blur(1px)')
  );
  const url = (
    detectCssSupport('backdrop-filter', quotedValue)
    || detectCssSupport('-webkit-backdrop-filter', quotedValue)
    || detectCssSupport('backdrop-filter', plainValue)
    || detectCssSupport('-webkit-backdrop-filter', plainValue)
    || styleAcceptsBackdropValue(quotedValue, false)
    || styleAcceptsBackdropValue(quotedValue, true)
    || styleAcceptsBackdropValue(plainValue, false)
    || styleAcceptsBackdropValue(plainValue, true)
  );

  return { basic, url };
}

export function buildGlassOctahedronBackdropFilterValue(filterId: string): string {
  return `url(#${filterId}) blur(6px) brightness(1.01)`;
}

export function buildGlassOctahedronLightBackdropFilterValue(): string {
  return 'blur(6px) brightness(1.01)';
}

export function createGlassOctahedronProjectionContext(input: {
  qualityTier: GlassOctahedronQualityTier;
  size: GlassOctahedronStageSize;
  transform: GlassOctahedronTransform;
}): GlassOctahedronProjectionContext {
  const { qualityTier, size, transform } = input;
  const projectedVertices = Object.values(GLASS_OCTAHEDRON_LOCAL_VERTICES)
    .map((vertex) => localPointToWorldPoint(vertex, transform))
    .map((vertex) => projectWorldPoint(vertex, size));
  const hull = convexHull(projectedVertices);
  const projectedFaces = createProjectedFaces(transform, size);
  const bounds = computeBounds(hull);
  const center = projectWorldPoint([0, transform.offsetY, 0], size);
  const visibleFaces = projectedFaces.filter((face) => face.facing > 0.02);
  const averageFacing = visibleFaces.length > 0
    ? visibleFaces.reduce((sum, face) => sum + face.facing, 0) / visibleFaces.length
    : 0;
  const displacementStrength = qualityTier === 'full-v3'
    ? clamp(
      0.34 + averageFacing * 0.16 + (bounds.width / size.cssWidth) * 0.08,
      0.32,
      0.56,
    )
    : 0;

  return {
    bounds,
    center,
    clipPath: buildClipPath(hull),
    displacementStrength,
    hull,
    projectedFaces,
    qualityTier,
    transform,
  };
}

export function renderGlassOctahedronDisplacementSnapshot(input: {
  canvasEl: HTMLCanvasElement;
  projection: GlassOctahedronProjectionContext;
  quality: GlassOctahedronRenderQuality;
  size: GlassOctahedronStageSize;
}): GlassOctahedronDisplacementSnapshot | null {
  const { canvasEl, projection, quality, size } = input;
  if (projection.qualityTier !== 'full-v3') {
    return null;
  }

  const context2d = canvasEl.getContext('2d');
  if (
    !context2d
    || typeof context2d.createImageData !== 'function'
    || typeof context2d.putImageData !== 'function'
    || typeof canvasEl.toDataURL !== 'function'
  ) {
    return null;
  }

  const mapSize = quality === 'interactive'
    ? GLASS_OCTAHEDRON_INTERACTIVE_MAP_SIZE
    : GLASS_OCTAHEDRON_SETTLED_MAP_SIZE;
  if (canvasEl.width !== mapSize || canvasEl.height !== mapSize) {
    canvasEl.width = mapSize;
    canvasEl.height = mapSize;
  }

  const filterScaleBase = quality === 'interactive'
    ? GLASS_OCTAHEDRON_INTERACTIVE_DISPLACEMENT_SCALE
    : GLASS_OCTAHEDRON_SETTLED_DISPLACEMENT_SCALE;
  const filterScale = filterScaleBase + projection.displacementStrength * 6;
  const imageData = context2d.createImageData(mapSize, mapSize);
  const maxEdgeDistance = Math.max(
    10,
    Math.min(projection.bounds.width, projection.bounds.height)
      * GLASS_OCTAHEDRON_DISPLACEMENT_EDGE_DISTANCE_RATIO,
  );

  for (let y = 0; y < mapSize; y += 1) {
    for (let x = 0; x < mapSize; x += 1) {
      const index = (y * mapSize + x) * 4;
      const uv = {
        x: (x + 0.5) / mapSize,
        y: (y + 0.5) / mapSize,
      };
      const point = {
        x: uv.x * size.cssWidth,
        y: uv.y * size.cssHeight,
      };

      if (!pointInPolygon(point, projection.hull)) {
        setNeutralDisplacementPixel(imageData.data, index);
        continue;
      }

      const trace = traceGlassOctahedronRay(uv, projection, size);
      if (!trace) {
        setNeutralDisplacementPixel(imageData.data, index);
        continue;
      }

      const offsetX = (trace.displacedUv.x - uv.x) * size.cssWidth;
      const offsetY = (trace.displacedUv.y - uv.y) * size.cssHeight;
      const edgeDistance = distanceToHullEdges(point, projection.hull);
      const edgeWeight = 1 - smoothStep(0, maxEdgeDistance, edgeDistance);
      const appliedStrength =
        projection.displacementStrength * (0.28 + edgeWeight * 0.72);
      const clampedOffsetX = softClampSigned(
        offsetX * appliedStrength,
        filterScale * 0.46,
      );
      const clampedOffsetY = softClampSigned(
        offsetY * appliedStrength,
        filterScale * 0.46,
      );

      imageData.data[index] = encodeDisplacementChannel(clampedOffsetX, filterScale);
      imageData.data[index + 1] = encodeDisplacementChannel(clampedOffsetY, filterScale);
      imageData.data[index + 2] = 128;
      imageData.data[index + 3] = 255;
    }
  }

  context2d.putImageData(imageData, 0, 0);

  return {
    dataUrl: canvasEl.toDataURL('image/png'),
    filterScale,
  };
}

export const __testing = {
  GLASS_OCTAHEDRON_IOR,
  GLASS_OCTAHEDRON_MAX_INTERNAL_BOUNCES,
  buildGlassOctahedronBackdropFilterValue,
  buildGlassOctahedronLightBackdropFilterValue,
  convexHull,
  createGlassOctahedronProjectionContext,
  detectGlassOctahedronBackdropSupport,
  reflectVector,
  refractVector,
  renderGlassOctahedronDisplacementSnapshot,
  resolveTransmissionDirection,
};
