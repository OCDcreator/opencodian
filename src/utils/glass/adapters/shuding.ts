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
const DISPLACEMENT_MAP_RESULT = 'shuding-displacement-map';
const EPSILON = 1e-3;

interface ShudingSettings {
  displacementScale: number;
  blurAmount: number;
}

interface ShudingSize {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  dpi: number;
}

interface ShudingState {
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
}

const states = new WeakMap<HTMLElement, ShudingState>();

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function resolveSettings(settings: Record<string, GlassAdapterSettingsValue>): ShudingSettings {
  return {
    displacementScale: readNumberSetting(settings.displacementScale, DEFAULT_DISPLACEMENT_SCALE, 0, 40),
    blurAmount: readNumberSetting(settings.blurAmount, DEFAULT_BLUR_AMOUNT, 0, 4),
  };
}

function measureShell(shellEl: HTMLElement): ShudingSize {
  const rect = shellEl.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect.width));
  const cssHeight = Math.max(1, Math.round(rect.height));
  const dpi = clamp(window.devicePixelRatio || 1, 1, 2);

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

function buildBackdropFilterValue(filterId: string, blurAmount: number): string {
  const blurValue = blurAmount.toFixed(2).replace(/\.?0+$/, '');
  return `url(#${filterId}) blur(${blurValue}px) saturate(1.08) brightness(1.03)`;
}

function applyFilterLayerStyles(filterLayerEl: HTMLElement, filterId: string, blurAmount: number): void {
  const style = filterLayerEl.style as CSSStyleDeclaration & { webkitBackdropFilter: string };
  const filterValue = buildBackdropFilterValue(filterId, blurAmount);

  style.backdropFilter = filterValue;
  style.webkitBackdropFilter = filterValue;
  filterLayerEl.dataset[FILTER_OWNER_DATASET_KEY] = filterId;
}

function clearFilterLayerStyles(filterLayerEl: HTMLElement, filterId: string): void {
  if (filterLayerEl.dataset[FILTER_OWNER_DATASET_KEY] !== filterId) {
    return;
  }

  const style = filterLayerEl.style as CSSStyleDeclaration & { webkitBackdropFilter: string };
  style.backdropFilter = '';
  style.webkitBackdropFilter = '';
  delete filterLayerEl.dataset[FILTER_OWNER_DATASET_KEY];
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

function writeNeutralPixel(data: Uint8ClampedArray, index: number): void {
  data[index] = 128;
  data[index + 1] = 128;
  data[index + 2] = 0;
  data[index + 3] = 255;
}

function renderDisplacementMap(state: ShudingState): void {
  const { pixelWidth, pixelHeight, dpi } = state.size;
  const { canvasEl, canvasCtx } = state;

  canvasEl.width = pixelWidth;
  canvasEl.height = pixelHeight;

  const imageData = canvasCtx.createImageData(pixelWidth, pixelHeight);
  const data = imageData.data;
  const halfWidth = pixelWidth / 2;
  const halfHeight = pixelHeight / 2;
  const minDimension = Math.min(pixelWidth, pixelHeight);
  const inset = Math.max(dpi * 1.5, minDimension * 0.045);
  const radius = Math.max(dpi * 8, minDimension * 0.28);
  const shapeHalfWidth = Math.max(dpi, halfWidth - inset);
  const shapeHalfHeight = Math.max(dpi, halfHeight - inset);
  const edgeBand = clamp(minDimension * 0.17, 10 * dpi, 30 * dpi);
  const outsideFade = edgeBand * 0.6;
  const maxVectorStrength = 0.62;

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const index = (y * pixelWidth + x) * 4;
      const localX = x + 0.5 - halfWidth;
      const localY = y + 0.5 - halfHeight;
      const distance = roundedRectSDF(localX, localY, shapeHalfWidth, shapeHalfHeight, radius);
      const edgeWeight = smoothStep(-edgeBand, 0, distance);

      if (edgeWeight <= EPSILON) {
        writeNeutralPixel(data, index);
        continue;
      }

      const gradientX =
        roundedRectSDF(localX + 1, localY, shapeHalfWidth, shapeHalfHeight, radius) -
        roundedRectSDF(localX - 1, localY, shapeHalfWidth, shapeHalfHeight, radius);
      const gradientY =
        roundedRectSDF(localX, localY + 1, shapeHalfWidth, shapeHalfHeight, radius) -
        roundedRectSDF(localX, localY - 1, shapeHalfWidth, shapeHalfHeight, radius);
      const gradientLength = Math.hypot(gradientX, gradientY);

      if (gradientLength <= EPSILON) {
        writeNeutralPixel(data, index);
        continue;
      }

      const inwardX = -gradientX / gradientLength;
      const inwardY = -gradientY / gradientLength;
      const outsideAttenuation = distance > 0 ? 1 - smoothStep(0, outsideFade, distance) : 1;
      const strength =
        maxVectorStrength *
        edgeWeight *
        (0.45 + edgeWeight * 0.55) *
        outsideAttenuation;
      const displacedX = clamp(inwardX * strength, -1, 1);
      const displacedY = clamp(inwardY * strength, -1, 1);

      data[index] = Math.round((displacedX * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((displacedY * 0.5 + 0.5) * 255);
      data[index + 2] = 0;
      data[index + 3] = 255;
    }
  }

  canvasCtx.putImageData(imageData, 0, 0);

  const dataUrl = canvasEl.toDataURL();
  state.feImageEl.setAttribute('href', dataUrl);
  state.feImageEl.setAttributeNS(XLINK_NS, 'href', dataUrl);
}

function updateDisplacementScale(state: ShudingState): void {
  state.feDisplacementMapEl.setAttribute('scale', `${state.settings.displacementScale}`);
}

function syncState(
  ctx: GlassMountContext,
  state: ShudingState,
  nextSettings: ShudingSettings,
  options?: { forceMapRegeneration?: boolean },
): void {
  const nextSize = measureShell(ctx.shellEl);
  const shouldRegenerateMap = options?.forceMapRegeneration || !sizesMatch(state.size, nextSize);

  state.settings = nextSettings;

  if (shouldRegenerateMap) {
    state.size = nextSize;
    updateSvgGeometry(state);
    renderDisplacementMap(state);
  }

  updateDisplacementScale(state);
  applyFilterLayerStyles(ctx.filterLayerEl, state.filterId, state.settings.blurAmount);
}

function scheduleResizeSync(ctx: GlassMountContext, state: ShudingState): void {
  if (state.resizeFrame !== null) {
    return;
  }

  state.resizeFrame = window.requestAnimationFrame(() => {
    state.resizeFrame = null;

    if (states.get(ctx.shellEl) !== state) {
      return;
    }

    syncState(ctx, state, state.settings);
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
    filterId,
    defsEl,
    filterEl,
    feImageEl,
    feDisplacementMapEl,
    canvasEl,
    canvasCtx,
    resizeObserver: new ResizeObserver(() => {
      scheduleResizeSync(ctx, state);
    }),
    resizeFrame: null,
    settings,
    size: measureShell(ctx.shellEl),
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

  clearFilterLayerStyles(ctx.filterLayerEl, state.filterId);
  state.defsEl.remove();
  state.canvasEl.width = 0;
  state.canvasEl.height = 0;
  states.delete(ctx.shellEl);
}

export const adapter: GlassEffectAdapter = {
  id: 'shuding',
  displayName: 'Shuding Liquid Glass',
  description: 'A restrained liquid-glass variant with compact displacement and soft blur.',
  paramDefs: [
    {
      key: 'displacementScale',
      labelKey: 'settings.style.input.liquidGlass.shuding.displacementScale',
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
      type: 'number',
      min: 0,
      max: 4,
      step: 0.05,
      unit: '',
      defaultValue: DEFAULT_BLUR_AMOUNT,
    },
  ],
  mount,
  unmount,
  updateSettings,
};
