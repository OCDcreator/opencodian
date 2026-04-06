import { createLogger } from '../../shared/logger';
import {
  applyEdgeBulge,
  type DiamondContext,
  type DiamondSize,
  traceDiamondRay,
} from '../../utils/glass/adapters/shudingDiamond';

type Vec3 = [number, number, number];

type DiamondFace = {
  vertices: [Vec3, Vec3, Vec3];
  normal: Vec3;
};

type WebGlUniformLocations = {
  resolution: WebGLUniformLocation;
  size: WebGLUniformLocation;
  thetaCos: WebGLUniformLocation;
  thetaSin: WebGLUniformLocation;
  phiCos: WebGLUniformLocation;
  phiSin: WebGLUniformLocation;
  displacementRange: WebGLUniformLocation;
  hullCenter: WebGLUniformLocation;
  hullPointCount: WebGLUniformLocation;
  hullPoints: WebGLUniformLocation;
  faceV0: WebGLUniformLocation;
  faceV1: WebGLUniformLocation;
  faceV2: WebGLUniformLocation;
  faceNormal: WebGLUniformLocation;
};

const logger = createLogger('LiquidDiamondDemoWebGL');

export type LiquidDiamondDemoWebGlRenderer = {
  render: (context: DiamondContext, size: DiamondSize) => number;
  destroy: () => void;
};

const CAMERA: Vec3 = [0, 0.08, 4.2];
const VIEWPORT_SCALE = 1.7;
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
const GPU_DISPLACEMENT_RANGE_PX = 128;
const GPU_MIN_DISPLACEMENT_RANGE_PX = 8;
const GPU_DISPLACEMENT_SAMPLE_STEP_PX = 12;
const GPU_DISPLACEMENT_SCALE_PADDING = 1.1;
const GPU_DISPLACEMENT_SCALE_RELAXATION = 0.25;
const MAX_HULL_POINTS = 8;
const EPSILON = 1e-6;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function scaleVertices(
  vertices: typeof BASE_PYRAMID_VERTICES,
  scale: number,
): typeof BASE_PYRAMID_VERTICES {
  return {
    apex: mul3(vertices.apex, scale),
    base: vertices.base.map((vertex) => mul3(vertex, scale)),
  };
}

function createPlane(
  a: Vec3,
  b: Vec3,
  c: Vec3,
  interiorPoint: Vec3,
): { point: Vec3; normal: Vec3 } {
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
const PYRAMID_FACES: readonly DiamondFace[] = [
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[0],
      PYRAMID_VERTICES.base[1],
    ],
    normal: PYRAMID_PLANES[0].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[1],
      PYRAMID_VERTICES.base[2],
    ],
    normal: PYRAMID_PLANES[1].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[2],
      PYRAMID_VERTICES.base[3],
    ],
    normal: PYRAMID_PLANES[2].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.apex,
      PYRAMID_VERTICES.base[3],
      PYRAMID_VERTICES.base[0],
    ],
    normal: PYRAMID_PLANES[3].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.base[0],
      PYRAMID_VERTICES.base[1],
      PYRAMID_VERTICES.base[2],
    ],
    normal: PYRAMID_PLANES[4].normal,
  },
  {
    vertices: [
      PYRAMID_VERTICES.base[0],
      PYRAMID_VERTICES.base[2],
      PYRAMID_VERTICES.base[3],
    ],
    normal: PYRAMID_PLANES[4].normal,
  },
];

function measureDisplacementRangeAtUv(
  uv: { x: number; y: number },
  context: DiamondContext,
  size: DiamondSize,
): number {
  const trace = traceDiamondRay(uv, context, size);
  if (!trace) {
    return 0;
  }

  const displaced = applyEdgeBulge(trace, uv, context, size);
  return Math.max(
    Math.abs((displaced.displacedUv.x - uv.x) * size.pixelWidth),
    Math.abs((displaced.displacedUv.y - uv.y) * size.pixelHeight),
  );
}

function estimateAdaptiveDisplacementRangePx(
  context: DiamondContext,
  size: DiamondSize,
): number {
  const sampleBounds = {
    minX: clamp(context.hullBounds.minX - EDGE_BULGE_PX - 6, 0, size.cssWidth),
    minY: clamp(context.hullBounds.minY - EDGE_BULGE_PX - 6, 0, size.cssHeight),
    maxX: clamp(context.hullBounds.maxX + EDGE_BULGE_PX + 6, 0, size.cssWidth),
    maxY: clamp(context.hullBounds.maxY + EDGE_BULGE_PX + 6, 0, size.cssHeight),
  };
  const spanX = Math.max(sampleBounds.maxX - sampleBounds.minX, 1);
  const spanY = Math.max(sampleBounds.maxY - sampleBounds.minY, 1);
  const stepCountX = Math.max(
    4,
    Math.ceil(spanX / GPU_DISPLACEMENT_SAMPLE_STEP_PX),
  );
  const stepCountY = Math.max(
    4,
    Math.ceil(spanY / GPU_DISPLACEMENT_SAMPLE_STEP_PX),
  );
  let maxScale = 0;

  function sampleUv(x: number, y: number): void {
    maxScale = Math.max(
      maxScale,
      measureDisplacementRangeAtUv(
        {
          x: clamp(x, 0, 1),
          y: clamp(y, 0, 1),
        },
        context,
        size,
      ),
    );
  }

  sampleUv(
    context.hullCenter.x / size.cssWidth,
    context.hullCenter.y / size.cssHeight,
  );

  for (let index = 0; index < context.hull.length; index += 1) {
    const point = context.hull[index];
    const nextPoint = context.hull[(index + 1) % context.hull.length];
    sampleUv(point.x / size.cssWidth, point.y / size.cssHeight);
    sampleUv(
      (point.x + nextPoint.x) / (2 * size.cssWidth),
      (point.y + nextPoint.y) / (2 * size.cssHeight),
    );
  }

  for (let yIndex = 0; yIndex <= stepCountY; yIndex += 1) {
    const y =
      (sampleBounds.minY + (spanY * yIndex) / stepCountY) / size.cssHeight;
    for (let xIndex = 0; xIndex <= stepCountX; xIndex += 1) {
      const x =
        (sampleBounds.minX + (spanX * xIndex) / stepCountX) / size.cssWidth;
      sampleUv(x, y);
    }
  }

  return clamp(
    Math.max(
      maxScale * GPU_DISPLACEMENT_SCALE_PADDING,
      GPU_MIN_DISPLACEMENT_RANGE_PX,
    ),
    GPU_MIN_DISPLACEMENT_RANGE_PX,
    GPU_DISPLACEMENT_RANGE_PX,
  );
}

function compileGlShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to allocate WebGL shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  }

  const info = gl.getShaderInfoLog(shader);
  gl.deleteShader(shader);
  throw new Error(info || 'Failed to compile WebGL shader');
}

function createGlProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to allocate WebGL program');
  }

  const vertexShader = compileGlShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileGlShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program;
  }

  const info = gl.getProgramInfoLog(program);
  gl.deleteProgram(program);
  throw new Error(info || 'Failed to link WebGL program');
}

function requireUniformLocation(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) {
    throw new Error(`Missing WebGL uniform location for ${name}`);
  }

  return location;
}

function glslFloatLiteral(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

export function createLiquidDiamondDemoWebGlRenderer(
  canvas: HTMLCanvasElement,
): LiquidDiamondDemoWebGlRenderer | null {
  const diagnostics = {
    hasWebGL2Constructor:
      typeof window.WebGL2RenderingContext !== 'undefined',
    hasCanvasGetContext: typeof canvas.getContext === 'function',
    userAgent:
      typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  };

  if (
    typeof window.WebGL2RenderingContext === 'undefined'
    || typeof canvas.getContext !== 'function'
  ) {
    logger.warn('WebGL demo unavailable before context creation', diagnostics);
    return null;
  }

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    stencil: false,
  }) as WebGL2RenderingContext | null;

  if (
    !gl
    || typeof gl.createShader !== 'function'
    || typeof gl.createVertexArray !== 'function'
  ) {
    logger.warn('WebGL2 context creation failed or returned an incomplete API surface', {
      ...diagnostics,
      hasContext: !!gl,
      hasCreateShader: typeof gl?.createShader === 'function',
      hasCreateVertexArray: typeof gl?.createVertexArray === 'function',
    });
    return null;
  }

  logger.info('WebGL2 context created for liquid diamond demo', {
    vendor: gl.getParameter(gl.VENDOR),
    renderer: gl.getParameter(gl.RENDERER),
    version: gl.getParameter(gl.VERSION),
    shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
    maxFragmentUniformVectors:
      typeof gl.MAX_FRAGMENT_UNIFORM_VECTORS === 'number'
        ? gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)
        : undefined,
  });

  const vertexSource = `#version 300 es
in vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  const fragmentSource = `#version 300 es
precision highp float;

#define FACE_COUNT 6
#define MAX_HULL_POINTS ${MAX_HULL_POINTS}

uniform vec2 uResolution;
uniform vec2 uSize;
uniform float uThetaCos;
uniform float uThetaSin;
uniform float uPhiCos;
uniform float uPhiSin;
uniform float uDisplacementRangePx;
uniform vec2 uHullCenter;
uniform int uHullPointCount;
uniform vec2 uHullPoints[MAX_HULL_POINTS];
uniform vec3 uFaceV0[FACE_COUNT];
uniform vec3 uFaceV1[FACE_COUNT];
uniform vec3 uFaceV2[FACE_COUNT];
uniform vec3 uFaceNormal[FACE_COUNT];

out vec4 outColor;

const vec3 CAMERA = vec3(${glslFloatLiteral(CAMERA[0])}, ${glslFloatLiteral(CAMERA[1])}, ${glslFloatLiteral(CAMERA[2])});
const float VIEWPORT_SCALE = ${glslFloatLiteral(VIEWPORT_SCALE)};
const float BACKGROUND_Z = ${glslFloatLiteral(BACKGROUND_Z)};
const float IOR = ${glslFloatLiteral(IOR)};
const float MAX_DISTANCE = ${glslFloatLiteral(MAX_DISTANCE)};
const float SURFACE_OFFSET = ${glslFloatLiteral(SURFACE_OFFSET)};
const float MIN_BACKGROUND_Z_COMPONENT = ${glslFloatLiteral(MIN_BACKGROUND_Z_COMPONENT)};
const float MAX_UV_OFFSET = ${glslFloatLiteral(MAX_UV_OFFSET)};
const float MAX_EFFECTIVE_UV_OFFSET = ${glslFloatLiteral(MAX_EFFECTIVE_UV_OFFSET)};
const int MAX_INTERNAL_BOUNCES = ${MAX_INTERNAL_BOUNCES};
const float EDGE_BULGE_PX = ${glslFloatLiteral(EDGE_BULGE_PX)};
const float EDGE_BULGE_STRENGTH = ${glslFloatLiteral(EDGE_BULGE_STRENGTH)};

float softClampSigned(float value, float limit) {
  float absValue = abs(value);
  if (absValue <= limit) {
    return value;
  }

  float scaled = absValue / limit;
  float expValue = exp(-2.0 * scaled);
  float tanhValue = (1.0 - expValue) / (1.0 + expValue);
  return sign(value) * limit * tanhValue;
}

vec3 rotatePointWithTransform(vec3 point) {
  float yx = point.x * uThetaCos + point.z * uThetaSin;
  float yz = -point.x * uThetaSin + point.z * uThetaCos;

  return vec3(
    yx,
    point.y * uPhiCos - yz * uPhiSin,
    point.y * uPhiSin + yz * uPhiCos
  );
}

vec3 inverseRotatePointWithTransform(vec3 point) {
  float xx = point.x;
  float xy = point.y * uPhiCos + point.z * uPhiSin;
  float xz = -point.y * uPhiSin + point.z * uPhiCos;

  return vec3(
    xx * uThetaCos - xz * uThetaSin,
    xy,
    xx * uThetaSin + xz * uThetaCos
  );
}

bool intersectRayTriangle(
  vec3 origin,
  vec3 direction,
  vec3 a,
  vec3 b,
  vec3 c,
  vec3 faceNormal,
  out float t,
  out vec3 point,
  out vec3 normal
) {
  vec3 edge1 = b - a;
  vec3 edge2 = c - a;
  vec3 pvec = cross(direction, edge2);
  float det = dot(edge1, pvec);
  if (abs(det) < 1e-6) {
    return false;
  }

  float invDet = 1.0 / det;
  vec3 tvec = origin - a;
  float u = dot(tvec, pvec) * invDet;
  if (u < 0.0 || u > 1.0) {
    return false;
  }

  vec3 qvec = cross(tvec, edge1);
  float v = dot(direction, qvec) * invDet;
  if (v < 0.0 || u + v > 1.0) {
    return false;
  }

  t = dot(edge2, qvec) * invDet;
  if (t <= SURFACE_OFFSET || t > MAX_DISTANCE) {
    return false;
  }

  point = origin + direction * t;
  normal = faceNormal;
  return true;
}

bool intersectCrystalFaces(
  vec3 origin,
  vec3 direction,
  out vec3 hitPoint,
  out vec3 hitNormal
) {
  vec3 localOrigin = inverseRotatePointWithTransform(origin);
  vec3 localDirection = inverseRotatePointWithTransform(direction);
  float bestT = 1e9;
  bool found = false;
  vec3 bestPoint = vec3(0.0);
  vec3 bestNormal = vec3(0.0);

  for (int i = 0; i < FACE_COUNT; i += 1) {
    float t = 0.0;
    vec3 point = vec3(0.0);
    vec3 normal = vec3(0.0);
    if (
      intersectRayTriangle(
        localOrigin,
        localDirection,
        uFaceV0[i],
        uFaceV1[i],
        uFaceV2[i],
        uFaceNormal[i],
        t,
        point,
        normal
      ) &&
      t < bestT
    ) {
      bestT = t;
      bestPoint = point;
      bestNormal = normal;
      found = true;
    }
  }

  if (!found) {
    return false;
  }

  hitPoint = rotatePointWithTransform(bestPoint);
  hitNormal = normalize(rotatePointWithTransform(bestNormal));
  return true;
}

vec3 reflectVector(vec3 incident, vec3 normal) {
  vec3 orientedNormal = dot(incident, normal) < 0.0 ? normal : -normal;
  return normalize(incident - orientedNormal * 2.0 * dot(incident, orientedNormal));
}

bool refractVector(vec3 incident, vec3 normal, float ratio, out vec3 refracted) {
  vec3 orientedNormal = dot(incident, normal) < 0.0 ? normal : -normal;
  float cosTheta = dot(orientedNormal, incident);
  float k = 1.0 - ratio * ratio * (1.0 - cosTheta * cosTheta);
  if (k < 0.0) {
    return false;
  }

  refracted = normalize(
    incident * ratio - orientedNormal * (ratio * cosTheta + sqrt(k))
  );
  return true;
}

bool traceToPlane(vec3 origin, vec3 direction, float planeZ, out vec3 hitPoint) {
  if (abs(direction.z) < 1e-5) {
    return false;
  }

  float t = (planeZ - origin.z) / direction.z;
  if (t <= 0.0) {
    return false;
  }

  hitPoint = origin + direction * t;
  return true;
}

vec3 uvToScreenPoint(vec2 uv) {
  return vec3(
    (uv.x - 0.5) * 2.0 * VIEWPORT_SCALE,
    (0.5 - uv.y) * 2.0 * VIEWPORT_SCALE,
    0.0
  );
}

vec2 screenPointToUv(vec3 point) {
  return vec2(
    point.x / (2.0 * VIEWPORT_SCALE) + 0.5,
    0.5 - point.y / (2.0 * VIEWPORT_SCALE)
  );
}

vec3 stabilizeBackgroundDirection(vec3 direction) {
  if (direction.z <= -MIN_BACKGROUND_Z_COMPONENT) {
    return direction;
  }

  return normalize(vec3(direction.x, direction.y, -MIN_BACKGROUND_Z_COMPONENT));
}

vec2 buildDisplacementUv(
  vec2 uv,
  vec3 origin,
  vec3 direction,
  vec3 entryPoint,
  vec3 exitPoint,
  bool hasExitPoint
) {
  vec3 finalExitPoint = hasExitPoint ? exitPoint : entryPoint;
  vec3 stableDirection = stabilizeBackgroundDirection(direction);
  vec3 backgroundHit = vec3(0.0);
  if (!traceToPlane(origin, stableDirection, BACKGROUND_Z, backgroundHit)) {
    return uv;
  }

  vec2 displacedUv = screenPointToUv(backgroundHit);
  vec2 offset = clamp(displacedUv - uv, vec2(-MAX_UV_OFFSET), vec2(MAX_UV_OFFSET));
  float strength = clamp(
    0.9 + length(finalExitPoint - entryPoint) * 0.14,
    0.85,
    1.25
  );

  return vec2(
    uv.x + softClampSigned(offset.x * strength, MAX_EFFECTIVE_UV_OFFSET),
    uv.y + softClampSigned(offset.y * strength, MAX_EFFECTIVE_UV_OFFSET)
  );
}

float pointEdgeDistance(vec2 point, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float ab2 = dot(ab, ab);
  if (ab2 <= 0.0) {
    return length(point - a);
  }

  float t = clamp(dot(point - a, ab) / ab2, 0.0, 1.0);
  return length(point - (a + ab * t));
}

vec2 applyEdgeBulge(vec2 displacedUv, vec2 uv) {
  vec2 pixelPoint = uv * uSize;
  float edgeDistance = 1e9;

  for (int i = 0; i < MAX_HULL_POINTS; i += 1) {
    if (i >= uHullPointCount) {
      break;
    }

    int nextIndex = i + 1;
    if (nextIndex >= uHullPointCount) {
      nextIndex = 0;
    }

    edgeDistance = min(
      edgeDistance,
      pointEdgeDistance(pixelPoint, uHullPoints[i], uHullPoints[nextIndex])
    );
  }

  float edgeWeight = 1.0 - smoothstep(0.0, EDGE_BULGE_PX, edgeDistance);
  if (edgeWeight <= 0.0) {
    return displacedUv;
  }

  vec2 centerUv = uHullCenter / uSize;
  return displacedUv + (centerUv - uv) * edgeWeight * EDGE_BULGE_STRENGTH;
}

vec2 traceDiamondUv(vec2 uv, out bool hitCrystal) {
  vec3 screenPoint = uvToScreenPoint(uv);
  vec3 rayDirection = normalize(screenPoint - CAMERA);
  vec3 entryPoint = vec3(0.0);
  vec3 entryNormal = vec3(0.0);

  if (!intersectCrystalFaces(CAMERA, rayDirection, entryPoint, entryNormal)) {
    hitCrystal = false;
    return uv;
  }

  hitCrystal = true;

  vec3 insideDirection = vec3(0.0);
  if (!refractVector(rayDirection, entryNormal, 1.0 / IOR, insideDirection)) {
    return buildDisplacementUv(
      uv,
      entryPoint + rayDirection * SURFACE_OFFSET,
      reflectVector(rayDirection, entryNormal),
      entryPoint,
      entryPoint,
      false
    );
  }

  vec3 insideOrigin = entryPoint + insideDirection * SURFACE_OFFSET;
  vec3 currentDirection = insideDirection;
  vec3 exitPoint = vec3(0.0);
  vec3 outsideDirection = vec3(0.0);
  bool hasExit = false;

  for (int bounce = 0; bounce < MAX_INTERNAL_BOUNCES; bounce += 1) {
    vec3 insideHitPoint = vec3(0.0);
    vec3 insideHitNormal = vec3(0.0);
    if (
      !intersectCrystalFaces(
        insideOrigin,
        currentDirection,
        insideHitPoint,
        insideHitNormal
      )
    ) {
      return buildDisplacementUv(
        uv,
        insideOrigin,
        currentDirection,
        entryPoint,
        entryPoint,
        false
      );
    }

    exitPoint = insideHitPoint;
    if (refractVector(currentDirection, insideHitNormal, IOR, outsideDirection)) {
      hasExit = true;
      break;
    }

    currentDirection = reflectVector(currentDirection, insideHitNormal);
    insideOrigin = exitPoint + currentDirection * SURFACE_OFFSET;
  }

  if (!hasExit) {
    return buildDisplacementUv(
      uv,
      insideOrigin,
      currentDirection,
      entryPoint,
      entryPoint,
      false
    );
  }

  return buildDisplacementUv(
    uv,
    exitPoint + outsideDirection * SURFACE_OFFSET,
    outsideDirection,
    entryPoint,
    exitPoint,
    true
  );
}

void main() {
  vec2 uv = vec2(
    gl_FragCoord.x / uResolution.x,
    1.0 - gl_FragCoord.y / uResolution.y
  );
  bool hitCrystal = false;
  vec2 displacedUv = traceDiamondUv(uv, hitCrystal);
  if (hitCrystal) {
    displacedUv = applyEdgeBulge(displacedUv, uv);
  }

  float displacementRangePx = max(uDisplacementRangePx, 1.0);
  vec2 deltaPx = clamp(
    (displacedUv - uv) * uResolution,
    vec2(-displacementRangePx),
    vec2(displacementRangePx)
  );
  vec2 encoded = clamp(
    deltaPx / (displacementRangePx * 2.0) + 0.5,
    vec2(0.0),
    vec2(1.0)
  );

  outColor = vec4(encoded, 0.0, 1.0);
}`;

  try {
    const program = createGlProgram(gl, vertexSource, fragmentSource);
    const vao = gl.createVertexArray();
    const positionBuffer = gl.createBuffer();
    if (!vao || !positionBuffer) {
      throw new Error('Failed to allocate WebGL buffers');
    }

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, 'aPosition');
    if (positionLocation < 0) {
      throw new Error('Missing WebGL attribute location for aPosition');
    }

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    const uniformLocations: WebGlUniformLocations = {
      resolution: requireUniformLocation(gl, program, 'uResolution'),
      size: requireUniformLocation(gl, program, 'uSize'),
      thetaCos: requireUniformLocation(gl, program, 'uThetaCos'),
      thetaSin: requireUniformLocation(gl, program, 'uThetaSin'),
      phiCos: requireUniformLocation(gl, program, 'uPhiCos'),
      phiSin: requireUniformLocation(gl, program, 'uPhiSin'),
      displacementRange: requireUniformLocation(
        gl,
        program,
        'uDisplacementRangePx',
      ),
      hullCenter: requireUniformLocation(gl, program, 'uHullCenter'),
      hullPointCount: requireUniformLocation(gl, program, 'uHullPointCount'),
      hullPoints: requireUniformLocation(gl, program, 'uHullPoints[0]'),
      faceV0: requireUniformLocation(gl, program, 'uFaceV0[0]'),
      faceV1: requireUniformLocation(gl, program, 'uFaceV1[0]'),
      faceV2: requireUniformLocation(gl, program, 'uFaceV2[0]'),
      faceNormal: requireUniformLocation(gl, program, 'uFaceNormal[0]'),
    };

    const faceV0 = new Float32Array(PYRAMID_FACES.length * 3);
    const faceV1 = new Float32Array(PYRAMID_FACES.length * 3);
    const faceV2 = new Float32Array(PYRAMID_FACES.length * 3);
    const faceNormal = new Float32Array(PYRAMID_FACES.length * 3);
    for (let index = 0; index < PYRAMID_FACES.length; index += 1) {
      const face = PYRAMID_FACES[index];
      faceV0.set(face.vertices[0], index * 3);
      faceV1.set(face.vertices[1], index * 3);
      faceV2.set(face.vertices[2], index * 3);
      faceNormal.set(face.normal, index * 3);
    }

    const hullPoints = new Float32Array(MAX_HULL_POINTS * 2);

    gl.useProgram(program);
    gl.uniform3fv(uniformLocations.faceV0, faceV0);
    gl.uniform3fv(uniformLocations.faceV1, faceV1);
    gl.uniform3fv(uniformLocations.faceV2, faceV2);
    gl.uniform3fv(uniformLocations.faceNormal, faceNormal);
    gl.useProgram(null);

    let currentRangePx = GPU_DISPLACEMENT_RANGE_PX;

    return {
      render(context: DiamondContext, size: DiamondSize): number {
        if (
          canvas.width !== size.pixelWidth
          || canvas.height !== size.pixelHeight
        ) {
          canvas.width = size.pixelWidth;
          canvas.height = size.pixelHeight;
        }

        const estimatedRangePx = estimateAdaptiveDisplacementRangePx(
          context,
          size,
        );
        currentRangePx =
          estimatedRangePx >= currentRangePx
            ? estimatedRangePx
            : currentRangePx
              + (estimatedRangePx - currentRangePx)
                * GPU_DISPLACEMENT_SCALE_RELAXATION;

        hullPoints.fill(0);
        for (
          let index = 0;
          index < context.hull.length && index < MAX_HULL_POINTS;
          index += 1
        ) {
          hullPoints[index * 2] = context.hull[index].x;
          hullPoints[index * 2 + 1] = context.hull[index].y;
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        gl.uniform2f(uniformLocations.resolution, canvas.width, canvas.height);
        gl.uniform2f(uniformLocations.size, size.cssWidth, size.cssHeight);
        gl.uniform1f(uniformLocations.thetaCos, context.thetaCos);
        gl.uniform1f(uniformLocations.thetaSin, context.thetaSin);
        gl.uniform1f(uniformLocations.phiCos, context.phiCos);
        gl.uniform1f(uniformLocations.phiSin, context.phiSin);
        gl.uniform1f(uniformLocations.displacementRange, currentRangePx);
        gl.uniform2f(
          uniformLocations.hullCenter,
          context.hullCenter.x,
          context.hullCenter.y,
        );
        gl.uniform1i(
          uniformLocations.hullPointCount,
          Math.min(context.hull.length, MAX_HULL_POINTS),
        );
        gl.uniform2fv(uniformLocations.hullPoints, hullPoints);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        gl.useProgram(null);

        return (currentRangePx * 2) / size.dpi;
      },
      destroy(): void {
        gl.deleteBuffer(positionBuffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(program);
      },
    };
  } catch (error) {
    logger.error('WebGL2 diamond renderer initialization failed', error);
    return null;
  }
}
