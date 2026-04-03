import {
  createShaderDisplacementFragment,
  fragmentShaders,
  ShaderDisplacementGenerator,
  type FragmentShader,
} from './shaderUtils';

export type RdevMode = 'standard' | 'polar' | 'prominent' | 'shader';

export interface RdevDisplacementMapOptions {
  displacementScale: number;
  aberrationIntensity: number;
}

export interface RdevDisplacementMapResult {
  cacheKey: string;
  url: string;
}

const DEFAULT_SIZE = { width: 320, height: 96 };
const MIN_WIDTH = 112;
const MAX_WIDTH = 448;
const MIN_HEIGHT = 64;
const MAX_HEIGHT = 256;
const SIZE_BUCKET = 16;
const mapCache = new Map<string, string>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bucketDimension(value: number, min: number, max: number): number {
  return clamp(Math.round(value / SIZE_BUCKET) * SIZE_BUCKET, min, max);
}

function normalizeSize(width: number, height: number): { width: number; height: number } {
  const nextWidth = Number.isFinite(width) && width > 0 ? width : DEFAULT_SIZE.width;
  const nextHeight = Number.isFinite(height) && height > 0 ? height : DEFAULT_SIZE.height;
  const largestEdge = Math.max(nextWidth, nextHeight);
  const scale = largestEdge > MAX_WIDTH ? MAX_WIDTH / largestEdge : 1;

  return {
    width: bucketDimension(nextWidth * scale, MIN_WIDTH, MAX_WIDTH),
    height: bucketDimension(nextHeight * scale, MIN_HEIGHT, MAX_HEIGHT),
  };
}

function resolveFragment(mode: RdevMode, options: RdevDisplacementMapOptions): FragmentShader {
  if (mode === 'shader') {
    return createShaderDisplacementFragment(options);
  }

  return fragmentShaders[mode];
}

function buildCacheKey(
  mode: RdevMode,
  width: number,
  height: number,
  options: RdevDisplacementMapOptions,
): string {
  if (mode !== 'shader') {
    return `${mode}:${width}x${height}`;
  }

  return `${mode}:${width}x${height}:${options.displacementScale.toFixed(2)}:${options.aberrationIntensity.toFixed(2)}`;
}

export function getRdevDisplacementMap(
  mode: RdevMode,
  width: number,
  height: number,
  options: RdevDisplacementMapOptions,
): RdevDisplacementMapResult {
  const normalizedSize = normalizeSize(width, height);
  const cacheKey = buildCacheKey(mode, normalizedSize.width, normalizedSize.height, options);
  const cachedUrl = mapCache.get(cacheKey);
  if (cachedUrl) {
    return { cacheKey, url: cachedUrl };
  }

  const generator = new ShaderDisplacementGenerator({
    width: normalizedSize.width,
    height: normalizedSize.height,
    fragment: resolveFragment(mode, options),
  });

  const url = generator.updateShader();
  generator.destroy();
  mapCache.set(cacheKey, url);

  return { cacheKey, url };
}
