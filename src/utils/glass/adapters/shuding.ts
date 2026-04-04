import type {
  GlassAdapterSettingsValue,
  GlassEffectAdapter,
  GlassMountContext,
} from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const FILTER_ID_PREFIX = 'opencodian-lg-shuding-';
const FILTER_OWNER_DATASET_KEY = 'opencodianLgShudingOwner';
const DEFAULT_DISPLACEMENT_SCALE = 10;
const DEFAULT_BLUR_AMOUNT = 0.25;
const DEFAULT_CONTRAST_BOOST = 1.2;
const DEFAULT_BRIGHTNESS_BOOST = 1.05;
const DEFAULT_SATURATE_BOOST = 1.1;
const CANVAS_DPI = 1;
const DISPLACEMENT_SCALE_BASELINE = 10;
const DISPLACEMENT_MAP_RESULT = 'shuding-displacement-map';
const EPSILON = 1e-3;
const UPSTREAM_PANEL_GEOMETRY = Object.freeze({
  halfWidth: 0.3,
  halfHeight: 0.2,
  radius: 0.6,
});
const UPSTREAM_BOX_SHADOW =
  '0 4px 8px rgba(0, 0, 0, 0.25), 0 -10px 25px inset rgba(0, 0, 0, 0.15)';
const SHELL_DATASET_KEYS = ['opencodianLgShuding'] as const;
const FILTER_LAYER_DATASET_KEYS = [
  FILTER_OWNER_DATASET_KEY,
  'opencodianLgShudingUrlSupported',
] as const;
const SHELL_STYLE_PROPERTIES = [
  'background',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'transform-origin',
  'will-change',
] as const;
const FILTER_LAYER_STYLE_PROPERTIES = [
  'opacity',
  'background',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'box-shadow',
  'transform-origin',
  'will-change',
] as const;

interface ShudingSettings {
  adaptiveSdf: boolean;
  adaptiveSdfMix: number;
  rectEdgeRefraction: boolean;
  rectEdgeRefractionStrength: number;
  cornerEnhancement: boolean;
  cornerEnhancementStrength: number;
  edgeBandWidth: number;
  barrelDistortion: boolean;
  barrelStrength: number;
  topHighlight: boolean;
  topHighlightOpacity: number;
  innerBorder: boolean;
  innerBorderOpacity: number;
  bottomShadow: boolean;
  bottomShadowOpacity: number;
  insetDepthShadow: boolean;
  insetDepthShadowOpacity: number;
  insetShadowBlur: number;
  displacementScale: number;
  blurAmount: number;
  contrastBoost: number;
  brightnessBoost: number;
  saturateBoost: number;
}

interface ShudingSize {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpi: number;
}

interface ShudingState {
  ctx: GlassMountContext;
  shellEl: HTMLElement;
  filterLayerEl: HTMLElement;
  svgRootEl: SVGSVGElement;
  filterId: string;
  defsEl: SVGDefsElement;
  filterEl: SVGFilterElement;
  feImageEl: SVGFEImageElement;
  feDisplacementMapEl: SVGFEDisplacementMapElement;
  canvasEl: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D;
  resizeObserver: ResizeObserver;
  resizeFrame: number | null;
  settings: ShudingSettings;
  size: ShudingSize;
  baseDisplacementScale: number;
  shellDatasetSnapshot: Record<string, string | undefined>;
  filterLayerDatasetSnapshot: Record<string, string | undefined>;
  shellStyleSnapshot: Record<string, string>;
  filterLayerStyleSnapshot: Record<string, string>;
  supportsBackdropFilterUrl: boolean;
}

interface ShudingPanelGeometry {
  halfWidth: number;
  halfHeight: number;
  radius: number;
}

type ShudingDisplacementPath = 'strict-upstream' | 'adaptive-upstream' | 'enhanced';

interface ShudingTextureSample {
  path: ShudingDisplacementPath;
  sampleX: number;
  sampleY: number;
}

const states = new WeakMap<HTMLElement, ShudingState>();
let cachedBackdropFilterUrlSupport: boolean | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smoothStep(edge0: number, edge1: number, value: number): number {
  if (Math.abs(edge1 - edge0) < EPSILON) {
    return value < edge0 ? 0 : 1;
  }

  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function roundedRectSDF(x: number, y: number, width: number, height: number, radius: number): number {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;

  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    radius
  );
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(tagName: K): SVGElementTagNameMap[K] {
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

function resolveSettings(settings: Record<string, GlassAdapterSettingsValue>): ShudingSettings {
  return {
    adaptiveSdf: readBooleanSetting(settings.adaptiveSdf, false),
    adaptiveSdfMix: readNumberSetting(settings.adaptiveSdfMix, 0, 0, 1),
    rectEdgeRefraction: readBooleanSetting(settings.rectEdgeRefraction, false),
    rectEdgeRefractionStrength: readNumberSetting(settings.rectEdgeRefractionStrength, 0, 0, 2),
    cornerEnhancement: readBooleanSetting(settings.cornerEnhancement, false),
    cornerEnhancementStrength: readNumberSetting(settings.cornerEnhancementStrength, 0, 0, 2),
    edgeBandWidth: readNumberSetting(settings.edgeBandWidth, 0, 0, 0.2),
    barrelDistortion: readBooleanSetting(settings.barrelDistortion, false),
    barrelStrength: readNumberSetting(settings.barrelStrength, 0, 0, 0.1),
    topHighlight: readBooleanSetting(settings.topHighlight, false),
    topHighlightOpacity: readNumberSetting(settings.topHighlightOpacity, 0.6, 0, 1),
    innerBorder: readBooleanSetting(settings.innerBorder, false),
    innerBorderOpacity: readNumberSetting(settings.innerBorderOpacity, 0.2, 0, 1),
    bottomShadow: readBooleanSetting(settings.bottomShadow, false),
    bottomShadowOpacity: readNumberSetting(settings.bottomShadowOpacity, 0.08, 0, 1),
    insetDepthShadow: readBooleanSetting(settings.insetDepthShadow, false),
    insetDepthShadowOpacity: readNumberSetting(settings.insetDepthShadowOpacity, 0.12, 0, 1),
    insetShadowBlur: readNumberSetting(settings.insetShadowBlur, 10, 5, 30),
    displacementScale: readNumberSetting(settings.displacementScale, DEFAULT_DISPLACEMENT_SCALE, 0, 40),
    blurAmount: readNumberSetting(settings.blurAmount, DEFAULT_BLUR_AMOUNT, 0, 4),
    contrastBoost: readNumberSetting(settings.contrastBoost, DEFAULT_CONTRAST_BOOST, 1, 1.5),
    brightnessBoost: readNumberSetting(settings.brightnessBoost, DEFAULT_BRIGHTNESS_BOOST, 1, 1.2),
    saturateBoost: readNumberSetting(settings.saturateBoost, DEFAULT_SATURATE_BOOST, 1, 1.3),
  };
}

function measureShell(shellEl: HTMLElement): ShudingSize {
  const rect = shellEl.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width));
  const cssHeight = Math.max(1, Math.round(rect.height));
  const dpi = CANVAS_DPI;

  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.max(1, Math.round(cssWidth * dpi)),
    pixelHeight: Math.max(1, Math.round(cssHeight * dpi)),
    dpi,
  };
}

function sizesMatch(left: ShudingSize, right: ShudingSize): boolean {
  return (
    left.cssWidth === right.cssWidth &&
    left.cssHeight === right.cssHeight &&
    left.pixelWidth === right.pixelWidth &&
    left.pixelHeight === right.pixelHeight
  );
}

function generateFilterId(): string {
  const entropy =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return `${FILTER_ID_PREFIX}${entropy}`;
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

function detectCssSupport(property: string, value: string): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
    ? CSS.supports(property, value)
    : false;
}

function normalizeFilterValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function parseCssLength(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

  const quotedValue = 'url("#opencodian-lg-shuding-support")';
  const plainValue = 'url(#opencodian-lg-shuding-support)';
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

function buildBackdropFilterValue(filterId: string, settings: ShudingSettings): string {
  const blurValue = settings.blurAmount.toFixed(2).replace(/\.?0+$/, '');
  return `url(#${filterId}) blur(${blurValue}px) contrast(${formatNumber(settings.contrastBoost)}) brightness(${formatNumber(settings.brightnessBoost)}) saturate(${formatNumber(settings.saturateBoost)})`;
}

function buildFallbackBackdropFilterValue(settings: ShudingSettings): string {
  const blurValue = settings.blurAmount.toFixed(2).replace(/\.?0+$/, '');
  return `blur(${blurValue}px) contrast(${formatNumber(settings.contrastBoost)}) brightness(${formatNumber(settings.brightnessBoost)}) saturate(${formatNumber(settings.saturateBoost)})`;
}

function applyShellStyles(shellEl: HTMLElement): void {
  shellEl.dataset.opencodianLgShuding = 'mounted';
  shellEl.style.setProperty('background', 'transparent');
  shellEl.style.setProperty('backdrop-filter', 'none');
  shellEl.style.setProperty('-webkit-backdrop-filter', 'none');
  shellEl.style.setProperty('transform-origin', 'center center');
  shellEl.style.setProperty('will-change', 'transform');
}

function buildFilterLayerBoxShadow(settings: ShudingSettings): string {
  const boxShadowParts = [UPSTREAM_BOX_SHADOW];

  if (settings.topHighlight && settings.topHighlightOpacity > EPSILON) {
    boxShadowParts.push(`inset 0 1px 0 rgba(255, 255, 255, ${formatNumber(settings.topHighlightOpacity)})`);
  }
  if (settings.bottomShadow && settings.bottomShadowOpacity > EPSILON) {
    boxShadowParts.push(`inset 0 -1px 0 rgba(0, 0, 0, ${formatNumber(settings.bottomShadowOpacity)})`);
  }
  if (settings.innerBorder && settings.innerBorderOpacity > EPSILON) {
    boxShadowParts.push(`inset 0 0 0 1px rgba(255, 255, 255, ${formatNumber(settings.innerBorderOpacity)})`);
  }
  if (settings.insetDepthShadow && settings.insetDepthShadowOpacity > EPSILON) {
    boxShadowParts.push(`inset 0 -8px ${formatNumber(settings.insetShadowBlur)}px rgba(0, 0, 0, ${formatNumber(settings.insetDepthShadowOpacity)})`);
  }

  return boxShadowParts.join(', ');
}

function applyFilterLayerStyles(
  filterLayerEl: HTMLElement,
  filterId: string,
  settings: ShudingSettings,
  supportsUrlFilter: boolean,
): void {
  filterLayerEl.dataset[FILTER_OWNER_DATASET_KEY] = filterId;
  filterLayerEl.dataset.opencodianLgShudingUrlSupported = supportsUrlFilter ? 'true' : 'false';
  filterLayerEl.style.setProperty('opacity', '1');
  filterLayerEl.style.setProperty('background', 'transparent');
  filterLayerEl.style.setProperty('box-shadow', buildFilterLayerBoxShadow(settings));
  filterLayerEl.style.setProperty('transform-origin', 'center center');
  filterLayerEl.style.setProperty('will-change', 'backdrop-filter, opacity');

  const filterValue = supportsUrlFilter
    ? buildBackdropFilterValue(filterId, settings)
    : buildFallbackBackdropFilterValue(settings);

  filterLayerEl.style.setProperty('backdrop-filter', filterValue);
  filterLayerEl.style.setProperty('-webkit-backdrop-filter', filterValue);
}

function updateSvgGeometry(state: ShudingState): void {
  const { cssWidth, cssHeight } = state.size;

  state.filterEl.setAttribute('x', '0');
  state.filterEl.setAttribute('y', '0');
  state.filterEl.setAttribute('width', `${cssWidth}`);
  state.filterEl.setAttribute('height', `${cssHeight}`);

  state.feImageEl.setAttribute('x', '0');
  state.feImageEl.setAttribute('y', '0');
  state.feImageEl.setAttribute('width', `${cssWidth}`);
  state.feImageEl.setAttribute('height', `${cssHeight}`);
}

function resolvePanelGeometry(state: ShudingState): ShudingPanelGeometry {
  const legacyGeometry: ShudingPanelGeometry = { ...UPSTREAM_PANEL_GEOMETRY };

  if (!state.settings.adaptiveSdf) {
    return legacyGeometry;
  }

  const aspect = state.size.cssWidth / Math.max(state.size.cssHeight, 1);
  const normalizedAspect = Math.max(aspect, 1);
  const halfWidth = clamp(0.5 * (aspect / normalizedAspect), EPSILON, 0.5);
  const halfHeight = clamp(0.5 * (1 / normalizedAspect), EPSILON, 0.5);

  const computedStyle = window.getComputedStyle(state.shellEl);
  const borderRadiusPx =
    (
      parseCssLength(computedStyle.getPropertyValue('border-top-left-radius')) +
      parseCssLength(computedStyle.getPropertyValue('border-top-right-radius')) +
      parseCssLength(computedStyle.getPropertyValue('border-bottom-right-radius')) +
      parseCssLength(computedStyle.getPropertyValue('border-bottom-left-radius'))
    ) / 4;
  const sdfRadius = clamp(
    (borderRadiusPx / Math.max(1, Math.min(state.size.cssWidth, state.size.cssHeight))) * 0.5,
    EPSILON,
    Math.min(halfWidth, halfHeight),
  );

  const adaptiveGeometry: ShudingPanelGeometry = {
    halfWidth,
    halfHeight,
    radius: sdfRadius,
  };
  const mixAmount = state.settings.adaptiveSdfMix;

  return {
    halfWidth: lerp(legacyGeometry.halfWidth, adaptiveGeometry.halfWidth, mixAmount),
    halfHeight: lerp(legacyGeometry.halfHeight, adaptiveGeometry.halfHeight, mixAmount),
    radius: lerp(legacyGeometry.radius, adaptiveGeometry.radius, mixAmount),
  };
}

function buildEdgeBandWeight(distanceToEdge: number, edgeBandWidth: number): number {
  const outerMask = smoothStep(0, -edgeBandWidth, distanceToEdge);
  const innerMask = smoothStep(-edgeBandWidth, -(edgeBandWidth * 2), distanceToEdge);
  return clamp(outerMask - innerMask, 0, 1);
}

function resolveUpstreamTextureSample(
  ix: number,
  iy: number,
  geometry: ShudingPanelGeometry,
  path: ShudingDisplacementPath,
): ShudingTextureSample {
  const distanceToEdge = roundedRectSDF(
    ix,
    iy,
    geometry.halfWidth,
    geometry.halfHeight,
    geometry.radius,
  );
  const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
  const scaled = smoothStep(0, 1, displacement);

  return {
    path,
    sampleX: ix * scaled + 0.5,
    sampleY: iy * scaled + 0.5,
  };
}

function resolveDisplacementTextureSample(
  ix: number,
  iy: number,
  geometry: ShudingPanelGeometry,
  settings: ShudingSettings,
): ShudingTextureSample {
  const usesEnhancedRefraction = settings.rectEdgeRefraction || settings.barrelDistortion;

  if (!settings.adaptiveSdf && !usesEnhancedRefraction) {
    return resolveUpstreamTextureSample(ix, iy, UPSTREAM_PANEL_GEOMETRY, 'strict-upstream');
  }

  if (!usesEnhancedRefraction) {
    return resolveUpstreamTextureSample(ix, iy, geometry, 'adaptive-upstream');
  }

  const distanceToEdge = roundedRectSDF(
    ix,
    iy,
    geometry.halfWidth,
    geometry.halfHeight,
    geometry.radius,
  );

  let push = 0;
  if (settings.rectEdgeRefraction) {
    const edgeBand = buildEdgeBandWeight(distanceToEdge, settings.edgeBandWidth);
    let edgePush = edgeBand * settings.rectEdgeRefractionStrength;

    if (settings.cornerEnhancement && geometry.radius > EPSILON) {
      const cornerX = Math.max(Math.abs(ix) - geometry.halfWidth + geometry.radius, 0);
      const cornerY = Math.max(Math.abs(iy) - geometry.halfHeight + geometry.radius, 0);
      const cornerFactor = clamp((Math.hypot(cornerX, cornerY) / geometry.radius) * 2, 0, 1);
      edgePush *= 1 + (cornerFactor * settings.cornerEnhancementStrength * 0.35);
    }

    push += edgePush;
  } else {
    const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15);
    push += smoothStep(0, 1, displacement);
  }

  if (settings.barrelDistortion) {
    const radialDistance = Math.hypot(
      ix / Math.max(geometry.halfWidth, EPSILON),
      iy / Math.max(geometry.halfHeight, EPSILON),
    );
    const barrelFactor = clamp(1 - radialDistance, 0, 1);
    push += barrelFactor * settings.barrelStrength;
  }

  return {
    path: 'enhanced',
    sampleX: ix * (1 + push) + 0.5,
    sampleY: iy * (1 + push) + 0.5,
  };
}

function renderDisplacementMap(state: ShudingState): number {
  const { pixelWidth, pixelHeight, dpi } = state.size;
  const { canvasEl, canvasCtx } = state;
  const geometry = resolvePanelGeometry(state);

  canvasEl.width = pixelWidth;
  canvasEl.height = pixelHeight;

  const imageData = canvasCtx.createImageData(pixelWidth, pixelHeight);
  const data = imageData.data;
  const rawValues: number[] = [];
  let maxScale = 0;

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const uvX = x / pixelWidth;
      const uvY = y / pixelHeight;
      const ix = uvX - 0.5;
      const iy = uvY - 0.5;
      const textureSample = resolveDisplacementTextureSample(ix, iy, geometry, state.settings);
      const sampleX = textureSample.sampleX;
      const sampleY = textureSample.sampleY;
      const dx = sampleX * pixelWidth - x;
      const dy = sampleY * pixelHeight - y;

      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      rawValues.push(dx, dy);
    }
  }

  maxScale = Math.max(maxScale * 0.5, EPSILON);

  let rawIndex = 0;
  for (let index = 0; index < data.length; index += 4) {
    const r = rawValues[rawIndex++] / maxScale + 0.5;
    const g = rawValues[rawIndex++] / maxScale + 0.5;
    data[index] = Math.round(clamp(r, 0, 1) * 255);
    data[index + 1] = Math.round(clamp(g, 0, 1) * 255);
    data[index + 2] = 0;
    data[index + 3] = 255;
  }

  canvasCtx.putImageData(imageData, 0, 0);

  const dataUrl = canvasEl.toDataURL();
  state.feImageEl.setAttribute('href', dataUrl);
  state.feImageEl.setAttributeNS(XLINK_NS, 'href', dataUrl);

  return maxScale / dpi;
}

function shouldRegenerateDisplacementMap(
  current: ShudingSettings,
  next: ShudingSettings,
): boolean {
  return current.adaptiveSdf !== next.adaptiveSdf
    || current.adaptiveSdfMix !== next.adaptiveSdfMix
    || current.rectEdgeRefraction !== next.rectEdgeRefraction
    || current.rectEdgeRefractionStrength !== next.rectEdgeRefractionStrength
    || current.cornerEnhancement !== next.cornerEnhancement
    || current.cornerEnhancementStrength !== next.cornerEnhancementStrength
    || current.edgeBandWidth !== next.edgeBandWidth
    || current.barrelDistortion !== next.barrelDistortion
    || current.barrelStrength !== next.barrelStrength;
}

function updateDisplacementScale(state: ShudingState): void {
  const normalizedStrength = state.settings.displacementScale / DISPLACEMENT_SCALE_BASELINE;
  const appliedScale = state.baseDisplacementScale * normalizedStrength;
  state.feDisplacementMapEl.setAttribute('scale', `${appliedScale}`);
}

function syncStateContext(
  ctx: GlassMountContext,
  state: ShudingState,
): void {
  state.ctx = ctx;

  if (state.shellEl !== ctx.shellEl) {
    const previousShellEl = state.shellEl;
    state.resizeObserver.unobserve(previousShellEl);
    restoreStyleSnapshot(previousShellEl, state.shellStyleSnapshot);
    restoreDatasetSnapshot(previousShellEl, state.shellDatasetSnapshot);
    states.delete(previousShellEl);

    state.shellEl = ctx.shellEl;
    state.shellStyleSnapshot = captureStyleSnapshot(ctx.shellEl, SHELL_STYLE_PROPERTIES);
    state.shellDatasetSnapshot = captureDatasetSnapshot(ctx.shellEl, SHELL_DATASET_KEYS);
    state.resizeObserver.observe(ctx.shellEl);
    states.set(ctx.shellEl, state);
  }

  if (state.filterLayerEl !== ctx.filterLayerEl) {
    restoreStyleSnapshot(state.filterLayerEl, state.filterLayerStyleSnapshot);
    restoreDatasetSnapshot(state.filterLayerEl, state.filterLayerDatasetSnapshot);

    state.filterLayerEl = ctx.filterLayerEl;
    state.filterLayerStyleSnapshot = captureStyleSnapshot(ctx.filterLayerEl, FILTER_LAYER_STYLE_PROPERTIES);
    state.filterLayerDatasetSnapshot = captureDatasetSnapshot(ctx.filterLayerEl, FILTER_LAYER_DATASET_KEYS);
  }

  if (state.svgRootEl !== ctx.svgRootEl) {
    state.svgRootEl = ctx.svgRootEl;
    if (state.defsEl.parentNode !== ctx.svgRootEl) {
      ctx.svgRootEl.appendChild(state.defsEl);
    }
  }
}

function syncState(
  ctx: GlassMountContext,
  state: ShudingState,
  nextSettings: ShudingSettings,
  options?: { forceMapRegeneration?: boolean },
): void {
  syncStateContext(ctx, state);

  const nextSize = measureShell(state.shellEl);
  const shouldRegenerateMap =
    options?.forceMapRegeneration
    || !sizesMatch(state.size, nextSize)
    || shouldRegenerateDisplacementMap(state.settings, nextSettings);

  state.settings = nextSettings;

  if (shouldRegenerateMap) {
    state.size = nextSize;
    updateSvgGeometry(state);
    state.baseDisplacementScale = renderDisplacementMap(state);
  }

  updateDisplacementScale(state);
  applyShellStyles(state.shellEl);
  applyFilterLayerStyles(
    state.filterLayerEl,
    state.filterId,
    state.settings,
    state.supportsBackdropFilterUrl,
  );
}

function scheduleResizeSync(state: ShudingState): void {
  if (state.resizeFrame !== null) {
    return;
  }

  state.resizeFrame = window.requestAnimationFrame(() => {
    state.resizeFrame = null;

    if (states.get(state.shellEl) !== state) {
      return;
    }

    syncState(state.ctx, state, state.settings);
  });
}

function createState(
  ctx: GlassMountContext,
  settings: ShudingSettings,
): ShudingState {
  const defsEl = createSvgElement('defs');
  const filterEl = createSvgElement('filter');
  const feImageEl = createSvgElement('feImage');
  const feDisplacementMapEl = createSvgElement('feDisplacementMap');
  const canvasEl = document.createElement('canvas');
  const canvasCtx = canvasEl.getContext('2d');

  if (!canvasCtx) {
    throw new Error('[OpenCodian] Unable to create 2D canvas context for Shuding glass adapter.');
  }

  const filterId = generateFilterId();

  defsEl.setAttribute('data-opencodian-lg-shuding-filter-id', filterId);

  filterEl.setAttribute('id', filterId);
  filterEl.setAttribute('filterUnits', 'userSpaceOnUse');
  filterEl.setAttribute('primitiveUnits', 'userSpaceOnUse');
  filterEl.setAttribute('color-interpolation-filters', 'sRGB');

  feImageEl.setAttribute('result', DISPLACEMENT_MAP_RESULT);
  feImageEl.setAttribute('preserveAspectRatio', 'none');

  feDisplacementMapEl.setAttribute('in', 'SourceGraphic');
  feDisplacementMapEl.setAttribute('in2', DISPLACEMENT_MAP_RESULT);
  feDisplacementMapEl.setAttribute('xChannelSelector', 'R');
  feDisplacementMapEl.setAttribute('yChannelSelector', 'G');

  filterEl.appendChild(feImageEl);
  filterEl.appendChild(feDisplacementMapEl);
  defsEl.appendChild(filterEl);
  ctx.svgRootEl.appendChild(defsEl);

  const state: ShudingState = {
    ctx,
    shellEl: ctx.shellEl,
    filterLayerEl: ctx.filterLayerEl,
    svgRootEl: ctx.svgRootEl,
    filterId,
    defsEl,
    filterEl,
    feImageEl,
    feDisplacementMapEl,
    canvasEl,
    canvasCtx,
    resizeObserver: new ResizeObserver(() => {
      scheduleResizeSync(state);
    }),
    resizeFrame: null,
    settings,
    size: measureShell(ctx.shellEl),
    baseDisplacementScale: 0,
    shellDatasetSnapshot: captureDatasetSnapshot(ctx.shellEl, SHELL_DATASET_KEYS),
    filterLayerDatasetSnapshot: captureDatasetSnapshot(ctx.filterLayerEl, FILTER_LAYER_DATASET_KEYS),
    shellStyleSnapshot: captureStyleSnapshot(ctx.shellEl, SHELL_STYLE_PROPERTIES),
    filterLayerStyleSnapshot: captureStyleSnapshot(ctx.filterLayerEl, FILTER_LAYER_STYLE_PROPERTIES),
    supportsBackdropFilterUrl: supportsBackdropFilterUrl(),
  };

  state.resizeObserver.observe(ctx.shellEl);

  return state;
}

function mount(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void {
  const existingState = states.get(ctx.shellEl);
  const resolvedSettings = resolveSettings(settings);

  if (existingState) {
    syncState(ctx, existingState, resolvedSettings, { forceMapRegeneration: true });
    return;
  }

  const state = createState(ctx, resolvedSettings);
  states.set(ctx.shellEl, state);
  syncState(ctx, state, resolvedSettings, { forceMapRegeneration: true });
}

function updateSettings(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void {
  const state = states.get(ctx.shellEl);

  if (!state) {
    mount(ctx, settings);
    return;
  }

  syncState(ctx, state, resolveSettings(settings));
}

function unmount(ctx: GlassMountContext): void {
  const state = states.get(ctx.shellEl);

  if (!state) {
    return;
  }

  state.resizeObserver.disconnect();

  if (state.resizeFrame !== null) {
    window.cancelAnimationFrame(state.resizeFrame);
  }

  syncStateContext(ctx, state);

  state.defsEl.remove();
  state.canvasEl.width = 0;
  state.canvasEl.height = 0;
  restoreStyleSnapshot(state.filterLayerEl, state.filterLayerStyleSnapshot);
  restoreDatasetSnapshot(state.filterLayerEl, state.filterLayerDatasetSnapshot);
  restoreStyleSnapshot(state.shellEl, state.shellStyleSnapshot);
  restoreDatasetSnapshot(state.shellEl, state.shellDatasetSnapshot);
  states.delete(ctx.shellEl);
}

export const adapter: GlassEffectAdapter = {
  id: 'shuding',
  displayName: 'Shuding Liquid Glass',
  description: 'A restrained liquid-glass variant with compact displacement and soft blur.',
  paramDefs: [
    {
      key: 'adaptiveSdf',
      labelKey: 'settings.style.input.liquidGlass.shuding.adaptiveSdf',
      descKey: 'settings.style.input.liquidGlass.shuding.adaptiveSdf.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'adaptiveSdfMix',
      labelKey: 'settings.style.input.liquidGlass.shuding.adaptiveSdfMix',
      descKey: 'settings.style.input.liquidGlass.shuding.adaptiveSdfMix.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      unit: '',
      defaultValue: 0,
    },
    {
      key: 'rectEdgeRefraction',
      labelKey: 'settings.style.input.liquidGlass.shuding.rectEdgeRefraction',
      descKey: 'settings.style.input.liquidGlass.shuding.rectEdgeRefraction.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'rectEdgeRefractionStrength',
      labelKey: 'settings.style.input.liquidGlass.shuding.rectEdgeRefractionStrength',
      descKey: 'settings.style.input.liquidGlass.shuding.rectEdgeRefractionStrength.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
      type: 'number',
      min: 0,
      max: 2,
      step: 0.05,
      unit: '',
      defaultValue: 0,
    },
    {
      key: 'cornerEnhancement',
      labelKey: 'settings.style.input.liquidGlass.shuding.cornerEnhancement',
      descKey: 'settings.style.input.liquidGlass.shuding.cornerEnhancement.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'cornerEnhancementStrength',
      labelKey: 'settings.style.input.liquidGlass.shuding.cornerEnhancementStrength',
      descKey: 'settings.style.input.liquidGlass.shuding.cornerEnhancementStrength.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
      type: 'number',
      min: 0,
      max: 2,
      step: 0.05,
      unit: '',
      defaultValue: 0,
    },
    {
      key: 'edgeBandWidth',
      labelKey: 'settings.style.input.liquidGlass.shuding.edgeBandWidth',
      descKey: 'settings.style.input.liquidGlass.shuding.edgeBandWidth.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
      type: 'number',
      min: 0,
      max: 0.2,
      step: 0.01,
      unit: '',
      defaultValue: 0,
    },
    {
      key: 'barrelDistortion',
      labelKey: 'settings.style.input.liquidGlass.shuding.barrelDistortion',
      descKey: 'settings.style.input.liquidGlass.shuding.barrelDistortion.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.global',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'barrelStrength',
      labelKey: 'settings.style.input.liquidGlass.shuding.barrelStrength',
      descKey: 'settings.style.input.liquidGlass.shuding.barrelStrength.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.global',
      type: 'number',
      min: 0,
      max: 0.1,
      step: 0.005,
      unit: '',
      defaultValue: 0,
    },
    {
      key: 'topHighlight',
      labelKey: 'settings.style.input.liquidGlass.shuding.topHighlight',
      descKey: 'settings.style.input.liquidGlass.shuding.topHighlight.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'topHighlightOpacity',
      labelKey: 'settings.style.input.liquidGlass.shuding.topHighlightOpacity',
      descKey: 'settings.style.input.liquidGlass.shuding.topHighlightOpacity.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      unit: '',
      defaultValue: 0.6,
    },
    {
      key: 'innerBorder',
      labelKey: 'settings.style.input.liquidGlass.shuding.innerBorder',
      descKey: 'settings.style.input.liquidGlass.shuding.innerBorder.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'innerBorderOpacity',
      labelKey: 'settings.style.input.liquidGlass.shuding.innerBorderOpacity',
      descKey: 'settings.style.input.liquidGlass.shuding.innerBorderOpacity.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      unit: '',
      defaultValue: 0.2,
    },
    {
      key: 'bottomShadow',
      labelKey: 'settings.style.input.liquidGlass.shuding.bottomShadow',
      descKey: 'settings.style.input.liquidGlass.shuding.bottomShadow.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'bottomShadowOpacity',
      labelKey: 'settings.style.input.liquidGlass.shuding.bottomShadowOpacity',
      descKey: 'settings.style.input.liquidGlass.shuding.bottomShadowOpacity.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      unit: '',
      defaultValue: 0.08,
    },
    {
      key: 'insetDepthShadow',
      labelKey: 'settings.style.input.liquidGlass.shuding.insetDepthShadow',
      descKey: 'settings.style.input.liquidGlass.shuding.insetDepthShadow.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'toggle',
      defaultValue: false,
    },
    {
      key: 'insetDepthShadowOpacity',
      labelKey: 'settings.style.input.liquidGlass.shuding.insetDepthShadowOpacity',
      descKey: 'settings.style.input.liquidGlass.shuding.insetDepthShadowOpacity.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      unit: '',
      defaultValue: 0.12,
    },
    {
      key: 'insetShadowBlur',
      labelKey: 'settings.style.input.liquidGlass.shuding.insetShadowBlur',
      descKey: 'settings.style.input.liquidGlass.shuding.insetShadowBlur.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.lighting',
      type: 'number',
      min: 5,
      max: 30,
      step: 1,
      unit: '',
      defaultValue: 10,
    },
    {
      key: 'displacementScale',
      labelKey: 'settings.style.input.liquidGlass.shuding.displacementScale',
      descKey: 'settings.style.input.liquidGlass.shuding.displacementScale.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.filter',
      type: 'number',
      min: 0,
      max: 40,
      step: 0.5,
      unit: '',
      defaultValue: DEFAULT_DISPLACEMENT_SCALE,
    },
    {
      key: 'blurAmount',
      labelKey: 'settings.style.input.liquidGlass.shuding.blurAmount',
      descKey: 'settings.style.input.liquidGlass.shuding.blurAmount.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.filter',
      type: 'number',
      min: 0,
      max: 4,
      step: 0.05,
      unit: '',
      defaultValue: DEFAULT_BLUR_AMOUNT,
    },
    {
      key: 'contrastBoost',
      labelKey: 'settings.style.input.liquidGlass.shuding.contrastBoost',
      descKey: 'settings.style.input.liquidGlass.shuding.contrastBoost.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.filter',
      type: 'number',
      min: 1,
      max: 1.5,
      step: 0.01,
      unit: '',
      defaultValue: DEFAULT_CONTRAST_BOOST,
    },
    {
      key: 'brightnessBoost',
      labelKey: 'settings.style.input.liquidGlass.shuding.brightnessBoost',
      descKey: 'settings.style.input.liquidGlass.shuding.brightnessBoost.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.filter',
      type: 'number',
      min: 1,
      max: 1.2,
      step: 0.01,
      unit: '',
      defaultValue: 1.05,
    },
    {
      key: 'saturateBoost',
      labelKey: 'settings.style.input.liquidGlass.shuding.saturateBoost',
      descKey: 'settings.style.input.liquidGlass.shuding.saturateBoost.desc',
      sectionLabelKey: 'settings.style.input.liquidGlass.section.filter',
      type: 'number',
      min: 1,
      max: 1.3,
      step: 0.01,
      unit: '',
      defaultValue: 1.1,
    },
  ],
  mount,
  unmount,
  updateSettings,
};

export const __testing = {
  buildBackdropFilterValue,
  buildFilterLayerBoxShadow,
  measureShell,
  resetCachedBackdropFilterUrlSupport(): void {
    cachedBackdropFilterUrlSupport = null;
  },
  resolveDisplacementTextureSample,
  resolvePanelGeometry,
  resolveSettings,
  upstreamBoxShadow: UPSTREAM_BOX_SHADOW,
  upstreamPanelGeometry: UPSTREAM_PANEL_GEOMETRY,
};
