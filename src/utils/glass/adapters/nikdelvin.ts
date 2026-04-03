import type {
  GlassAdapterSettingsValue,
  GlassEffectAdapter,
  GlassMountContext,
  GlassParamDef,
} from '../types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const FILTER_ID_PREFIX = 'opencodian-lg-nikdelvin-';
const INSTANCE_ATTR = 'data-opencodian-lg-nikdelvin-instance';
const OWNER_ATTR = 'data-opencodian-lg-nikdelvin-owner';
const ROLE_ATTR = 'data-opencodian-lg-nikdelvin-role';
const MODE_ATTR = 'data-opencodian-lg-nikdelvin-mode';

type RenderMode = 'svg' | 'glass' | 'overlay';

interface NikdelvinSettings {
  depth: number;
  strength: number;
  chromaticAberration: number;
  blur: number;
}

interface ShellMetrics {
  width: number;
  height: number;
  radius: number;
  effectiveDepth: number;
  filterSignature: string;
}

interface NikdelvinState {
  instanceId: string;
  filterId: string;
  shellEl: HTMLElement;
  contentEl: HTMLElement;
  svgRootEl: SVGSVGElement;
  filterLayerEl: HTMLElement;
  svgDefsEl: SVGDefsElement;
  surfaceEl: HTMLDivElement;
  highlightEl: HTMLDivElement;
  spectrumEl: HTMLDivElement;
  resizeObserver: ResizeObserver | null;
  supportsBackdropFilter: boolean;
  supportsBackdropFilterUrl: boolean;
  settings: NikdelvinSettings;
  currentFilterSignature: string | null;
  currentMode: RenderMode | null;
}

type DisplacementOptions = {
  height: number;
  width: number;
  radius: number;
  depth: number;
  strength: number;
  chromaticAberration: number;
};

const paramDefs: readonly GlassParamDef[] = [
  {
    key: 'depth',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.depth',
    type: 'number',
    min: 0,
    max: 40,
    step: 0.5,
    unit: '',
    defaultValue: 10,
  },
  {
    key: 'strength',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.strength',
    type: 'number',
    min: 0,
    max: 200,
    step: 1,
    unit: '',
    defaultValue: 100,
  },
  {
    key: 'chromaticAberration',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.chromaticAberration',
    type: 'number',
    min: 0,
    max: 10,
    step: 0.1,
    unit: '',
    defaultValue: 2,
  },
  {
    key: 'blur',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.blur',
    type: 'number',
    min: 0,
    max: 10,
    step: 0.1,
    unit: '',
    defaultValue: 0,
  },
] as const;

const stateByShellEl = new WeakMap<HTMLElement, NikdelvinState>();

let instanceCounter = 0;
let cachedBackdropFilterSupport: boolean | null = null;
let cachedBackdropFilterUrlSupport: boolean | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function parseCssLength(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

function createOverlayElement(instanceId: string, role: string): HTMLDivElement {
  const element = document.createElement('div');
  element.setAttribute(OWNER_ATTR, instanceId);
  element.setAttribute(ROLE_ATTR, role);
  element.style.position = 'absolute';
  element.style.inset = '0';
  element.style.borderRadius = 'inherit';
  element.style.pointerEvents = 'none';
  element.style.transform = 'translateZ(0)';
  return element;
}

function applyInstanceMarker(element: Element, instanceId: string, role?: string): void {
  element.setAttribute(INSTANCE_ATTR, instanceId);
  if (role) {
    element.setAttribute(ROLE_ATTR, role);
  }
}

function normalizeBackdropValue(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function detectCssSupport(property: string, value: string): boolean {
  return typeof CSS !== 'undefined'
    && typeof CSS.supports === 'function'
    && CSS.supports(property, value);
}

function styleAcceptsBackdropValue(value: string, useWebkit: boolean): boolean {
  const testEl = document.createElement('div');
  if (useWebkit) {
    testEl.style.setProperty('-webkit-backdrop-filter', value);
    return normalizeBackdropValue(testEl.style.getPropertyValue('-webkit-backdrop-filter')).includes(
      `${value.split('(')[0].toLowerCase()}(`,
    );
  }

  testEl.style.backdropFilter = value;
  return normalizeBackdropValue(testEl.style.backdropFilter).includes(
    `${value.split('(')[0].toLowerCase()}(`,
  );
}

function supportsBackdropFilter(): boolean {
  if (cachedBackdropFilterSupport !== null) {
    return cachedBackdropFilterSupport;
  }

  cachedBackdropFilterSupport =
    detectCssSupport('backdrop-filter', 'blur(1px)')
    || detectCssSupport('-webkit-backdrop-filter', 'blur(1px)')
    || styleAcceptsBackdropValue('blur(1px)', false)
    || styleAcceptsBackdropValue('blur(1px)', true);

  return cachedBackdropFilterSupport;
}

function supportsBackdropFilterUrl(): boolean {
  if (cachedBackdropFilterUrlSupport !== null) {
    return cachedBackdropFilterUrlSupport;
  }

  if (!supportsBackdropFilter()) {
    cachedBackdropFilterUrlSupport = false;
    return cachedBackdropFilterUrlSupport;
  }

  const quotedValue = 'url("#opencodian-lg-nikdelvin-support")';
  const plainValue = 'url(#opencodian-lg-nikdelvin-support)';

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

function getDefaultNumber(key: keyof NikdelvinSettings): number {
  const def = paramDefs.find((item) => item.key === key);
  return typeof def?.defaultValue === 'number' ? def.defaultValue : 0;
}

function readNumberSetting(
  settings: Record<string, GlassAdapterSettingsValue>,
  key: keyof NikdelvinSettings,
  min: number,
  max: number,
): number {
  const rawValue = settings[key];
  const parsedValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return getDefaultNumber(key);
  }

  return clamp(parsedValue, min, max);
}

function normalizeSettings(settings: Record<string, GlassAdapterSettingsValue>): NikdelvinSettings {
  return {
    depth: readNumberSetting(settings, 'depth', 0, 40),
    strength: readNumberSetting(settings, 'strength', 0, 200),
    chromaticAberration: readNumberSetting(settings, 'chromaticAberration', 0, 10),
    blur: readNumberSetting(settings, 'blur', 0, 10),
  };
}

function resolveBorderRadius(shellEl: HTMLElement, width: number, height: number): number {
  const computedStyle = getComputedStyle(shellEl);
  const radius = Math.max(
    parseCssLength(computedStyle.borderTopLeftRadius),
    parseCssLength(computedStyle.borderTopRightRadius),
    parseCssLength(computedStyle.borderBottomRightRadius),
    parseCssLength(computedStyle.borderBottomLeftRadius),
  );

  return clamp(radius, 0, Math.min(width, height) / 2);
}

function readShellMetrics(state: NikdelvinState): ShellMetrics {
  const rect = state.shellEl.getBoundingClientRect();
  const width = Math.max(
    1,
    Math.round(rect.width || state.shellEl.offsetWidth || state.contentEl.offsetWidth || 1),
  );
  const height = Math.max(
    1,
    Math.round(rect.height || state.shellEl.offsetHeight || state.contentEl.offsetHeight || 1),
  );
  const radius = resolveBorderRadius(state.shellEl, width, height);
  const maxDepth = Math.max(0, (Math.min(width, height) - 2) / 2);
  const effectiveDepth = clamp(state.settings.depth, 0, maxDepth);

  return {
    width,
    height,
    radius,
    effectiveDepth,
    filterSignature: [
      width,
      height,
      formatNumber(radius),
      formatNumber(effectiveDepth),
      formatNumber(state.settings.strength),
      formatNumber(state.settings.chromaticAberration),
    ].join(':'),
  };
}

function getDisplacementMap({
  height,
  width,
  radius,
  depth,
}: Omit<DisplacementOptions, 'chromaticAberration' | 'strength'>): string {
  const safeDepth = clamp(depth, 0, Math.max(0, (Math.min(width, height) - 2) / 2));
  const innerWidth = Math.max(1, width - safeDepth * 2);
  const innerHeight = Math.max(1, height - safeDepth * 2);

  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg height="${height}" width="${width}" viewBox="0 0 ${width} ${height}" xmlns="${SVG_NS}">
      <style>
        .mix { mix-blend-mode: screen; }
      </style>
      <defs>
        <linearGradient
          id="Y"
          x1="0"
          x2="0"
          y1="${Math.ceil((radius / height) * 15)}%"
          y2="${Math.floor(100 - (radius / height) * 15)}%">
          <stop offset="0%" stop-color="#0F0" />
          <stop offset="100%" stop-color="#000" />
        </linearGradient>
        <linearGradient
          id="X"
          x1="${Math.ceil((radius / width) * 15)}%"
          x2="${Math.floor(100 - (radius / width) * 15)}%"
          y1="0"
          y2="0">
          <stop offset="0%" stop-color="#F00" />
          <stop offset="100%" stop-color="#000" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" height="${height}" width="${width}" fill="#808080" />
      <g filter="blur(2px)">
        <rect x="0" y="0" height="${height}" width="${width}" fill="#000080" />
        <rect x="0" y="0" height="${height}" width="${width}" fill="url(#Y)" class="mix" />
        <rect x="0" y="0" height="${height}" width="${width}" fill="url(#X)" class="mix" />
        <rect
          x="${safeDepth}"
          y="${safeDepth}"
          height="${innerHeight}"
          width="${innerWidth}"
          fill="#808080"
          rx="${radius}"
          ry="${radius}"
          filter="blur(${safeDepth}px)"
        />
      </g>
    </svg>`,
  )}`;
}

function getDisplacementFilter({
  height,
  width,
  radius,
  depth,
  strength,
  chromaticAberration,
  filterId,
}: DisplacementOptions & { filterId: string }): SVGFilterElement {
  const padding = Math.max(
    16,
    Math.ceil(strength * 0.25 + chromaticAberration * 4 + depth * 1.5),
  );
  const filter = createSvgElement('filter', {
    id: filterId,
    x: `${-padding}`,
    y: `${-padding}`,
    width: `${width + padding * 2}`,
    height: `${height + padding * 2}`,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  });

  const displacementMap = getDisplacementMap({
    height,
    width,
    radius,
    depth,
  });

  const feImage = createSvgElement('feImage', {
    x: '0',
    y: '0',
    width: `${width}`,
    height: `${height}`,
    preserveAspectRatio: 'none',
    result: 'displacementMap',
  });
  feImage.setAttribute('href', displacementMap);
  feImage.setAttributeNS(XLINK_NS, 'xlink:href', displacementMap);

  filter.append(
    feImage,
    createSvgElement('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'displacementMap',
      scale: `${strength + chromaticAberration * 2}`,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'displacedRSource',
    }),
    createSvgElement('feColorMatrix', {
      in: 'displacedRSource',
      type: 'matrix',
      values: `1 0 0 0 0
               0 0 0 0 0
               0 0 0 0 0
               0 0 0 1 0`,
      result: 'displacedR',
    }),
    createSvgElement('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'displacementMap',
      scale: `${strength + chromaticAberration}`,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'displacedGSource',
    }),
    createSvgElement('feColorMatrix', {
      in: 'displacedGSource',
      type: 'matrix',
      values: `0 0 0 0 0
               0 1 0 0 0
               0 0 0 0 0
               0 0 0 1 0`,
      result: 'displacedG',
    }),
    createSvgElement('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'displacementMap',
      scale: `${strength}`,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'displacedBSource',
    }),
    createSvgElement('feColorMatrix', {
      in: 'displacedBSource',
      type: 'matrix',
      values: `0 0 0 0 0
               0 0 0 0 0
               0 0 1 0 0
               0 0 0 1 0`,
      result: 'displacedB',
    }),
    createSvgElement('feBlend', {
      in: 'displacedR',
      in2: 'displacedG',
      mode: 'screen',
      result: 'blendedRG',
    }),
    createSvgElement('feBlend', {
      in: 'blendedRG',
      in2: 'displacedB',
      mode: 'screen',
    }),
  );

  return filter;
}

function applyBackdropFilterValue(filterLayerEl: HTMLElement, value: string | null): void {
  if (!value) {
    filterLayerEl.style.backdropFilter = '';
    filterLayerEl.style.removeProperty('-webkit-backdrop-filter');
    return;
  }

  filterLayerEl.style.backdropFilter = value;
  filterLayerEl.style.setProperty('-webkit-backdrop-filter', value);
}

function buildBackdropFilterValue(
  state: NikdelvinState,
  mode: Extract<RenderMode, 'svg' | 'glass'>,
): string {
  const brightness = clamp(1.04 + state.settings.depth * 0.006 + state.settings.blur * 0.012, 1, 1.26);
  const saturation = clamp(
    1.18 + state.settings.strength * 0.003 + state.settings.chromaticAberration * 0.03,
    1,
    1.95,
  );
  const parts: string[] = [];

  if (mode === 'svg' && state.settings.blur > 0) {
    parts.push(`blur(${formatNumber(state.settings.blur / 2)}px)`);
  }

  if (mode === 'svg') {
    parts.push(`url("#${state.filterId}")`);
    if (state.settings.blur > 0) {
      parts.push(`blur(${formatNumber(state.settings.blur)}px)`);
    }
  } else {
    const fallbackBlur = Math.max(4, state.settings.blur + state.settings.depth * 0.45);
    parts.push(`blur(${formatNumber(fallbackBlur)}px)`);
  }

  parts.push(`brightness(${formatNumber(brightness)})`);
  parts.push(`saturate(${formatNumber(saturation)})`);

  return parts.join(' ');
}

function clearFilterDefinition(state: NikdelvinState): void {
  state.svgDefsEl.replaceChildren();
  state.currentFilterSignature = null;
}

function syncFilterDefinition(state: NikdelvinState, metrics: ShellMetrics): void {
  if (state.currentFilterSignature === metrics.filterSignature) {
    return;
  }

  const filter = getDisplacementFilter({
    filterId: state.filterId,
    height: metrics.height,
    width: metrics.width,
    radius: metrics.radius,
    depth: metrics.effectiveDepth,
    strength: state.settings.strength,
    chromaticAberration: state.settings.chromaticAberration,
  });

  state.svgDefsEl.replaceChildren(filter);
  state.currentFilterSignature = metrics.filterSignature;
}

function updateVisualLayers(state: NikdelvinState, mode: RenderMode): void {
  const fallbackBoost = mode === 'svg' ? 0 : mode === 'glass' ? 0.06 : 0.12;
  const surfaceOpacity = clamp(
    0.82 + state.settings.depth * 0.004 + state.settings.blur * 0.01 + fallbackBoost,
    0.78,
    1,
  );
  const highlightOpacity = clamp(
    0.46 + state.settings.depth * 0.01 + state.settings.strength * 0.0009 + fallbackBoost,
    0.42,
    0.88,
  );
  const spectrumOpacity = clamp(
    0.08 + state.settings.chromaticAberration * 0.08 + state.settings.strength * 0.0007 + fallbackBoost * 0.45,
    0.04,
    0.64,
  );
  const borderAlpha = clamp(0.16 + state.settings.depth * 0.008, 0.14, 0.46);
  const bottomEdgeAlpha = clamp(0.06 + state.settings.strength * 0.0005, 0.05, 0.2);

  state.surfaceEl.style.opacity = formatNumber(surfaceOpacity);
  state.surfaceEl.style.background = [
    'linear-gradient(180deg, color-mix(in srgb, var(--opencodian-composer-liquid-density) 94%, transparent) 0%, color-mix(in srgb, var(--opencodian-composer-liquid-tint) 94%, transparent) 100%)',
    'linear-gradient(135deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.04) 38%, transparent 74%)',
  ].join(', ');
  state.surfaceEl.style.boxShadow = [
    `inset 0 1px 0 rgba(255, 255, 255, ${formatNumber(borderAlpha + 0.08)})`,
    `inset 0 -1px 0 rgba(255, 255, 255, ${formatNumber(bottomEdgeAlpha)})`,
    `inset 0 0 0 1px rgba(255, 255, 255, ${formatNumber(borderAlpha)})`,
  ].join(', ');

  state.highlightEl.style.opacity = formatNumber(highlightOpacity);
  state.highlightEl.style.mixBlendMode = 'screen';
  state.highlightEl.style.background = [
    'radial-gradient(145% 100% at 12% 0%, var(--opencodian-composer-liquid-highlight-strong) 0%, transparent 58%)',
    'linear-gradient(180deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.1) 14%, rgba(255, 255, 255, 0) 42%)',
  ].join(', ');

  state.spectrumEl.style.opacity = formatNumber(spectrumOpacity);
  state.spectrumEl.style.mixBlendMode = 'screen';
  state.spectrumEl.style.background = [
    'linear-gradient(112deg, rgba(255, 255, 255, 0.18) 0%, var(--opencodian-composer-liquid-spectrum-end) 44%, transparent 76%)',
    'radial-gradient(88% 70% at 100% 0%, rgba(115, 207, 255, 0.16) 0%, transparent 54%)',
  ].join(', ');
}

function clearFilterLayerDecorations(filterLayerEl: HTMLElement): void {
  filterLayerEl.style.opacity = '';
  filterLayerEl.style.backdropFilter = '';
  filterLayerEl.style.removeProperty('-webkit-backdrop-filter');
  filterLayerEl.removeAttribute(INSTANCE_ATTR);
  filterLayerEl.removeAttribute(MODE_ATTR);
}

function cleanupInstanceArtifacts(
  shellEl: HTMLElement,
  filterLayerEl: HTMLElement,
  svgRootEl: SVGSVGElement,
  instanceId: string,
): void {
  filterLayerEl
    .querySelectorAll<HTMLElement>(`[${OWNER_ATTR}="${instanceId}"]`)
    .forEach((element) => element.remove());
  svgRootEl
    .querySelectorAll<SVGElement>(`[${INSTANCE_ATTR}="${instanceId}"]`)
    .forEach((element) => element.remove());

  clearFilterLayerDecorations(filterLayerEl);
  shellEl.removeAttribute(INSTANCE_ATTR);
  shellEl.removeAttribute(MODE_ATTR);
}

function syncStateContext(state: NikdelvinState, ctx: GlassMountContext): void {
  if (state.filterLayerEl !== ctx.filterLayerEl) {
    clearFilterLayerDecorations(state.filterLayerEl);
    state.filterLayerEl = ctx.filterLayerEl;
  }

  if (state.contentEl !== ctx.contentEl && state.resizeObserver) {
    state.resizeObserver.unobserve(state.contentEl);
    state.resizeObserver.observe(ctx.contentEl);
  }

  state.contentEl = ctx.contentEl;
  state.svgRootEl = ctx.svgRootEl;

  if (state.svgDefsEl.parentNode !== ctx.svgRootEl) {
    ctx.svgRootEl.appendChild(state.svgDefsEl);
  }

  for (const element of [state.surfaceEl, state.highlightEl, state.spectrumEl]) {
    if (element.parentElement !== ctx.filterLayerEl) {
      ctx.filterLayerEl.appendChild(element);
    }
  }
}

function renderState(state: NikdelvinState): void {
  const mode: RenderMode = state.supportsBackdropFilterUrl
    ? 'svg'
    : state.supportsBackdropFilter
      ? 'glass'
      : 'overlay';
  const metrics = readShellMetrics(state);

  state.filterLayerEl.style.opacity = '1';
  applyInstanceMarker(state.filterLayerEl, state.instanceId);
  state.filterLayerEl.setAttribute(MODE_ATTR, mode);
  state.shellEl.setAttribute(INSTANCE_ATTR, state.instanceId);
  state.shellEl.setAttribute(MODE_ATTR, mode);

  if (mode === 'svg') {
    syncFilterDefinition(state, metrics);
    applyBackdropFilterValue(state.filterLayerEl, buildBackdropFilterValue(state, 'svg'));
  } else {
    clearFilterDefinition(state);
    applyBackdropFilterValue(
      state.filterLayerEl,
      mode === 'glass' ? buildBackdropFilterValue(state, 'glass') : null,
    );
  }

  updateVisualLayers(state, mode);
  state.currentMode = mode;
}

function createState(
  ctx: GlassMountContext,
  settings: Record<string, GlassAdapterSettingsValue>,
): NikdelvinState {
  instanceCounter += 1;
  const instanceId = `${FILTER_ID_PREFIX}${instanceCounter}`;
  const svgDefsEl = createSvgElement('defs');
  applyInstanceMarker(svgDefsEl, instanceId, 'defs');

  const state: NikdelvinState = {
    instanceId,
    filterId: `${instanceId}-filter`,
    shellEl: ctx.shellEl,
    contentEl: ctx.contentEl,
    svgRootEl: ctx.svgRootEl,
    filterLayerEl: ctx.filterLayerEl,
    svgDefsEl,
    surfaceEl: createOverlayElement(instanceId, 'surface'),
    highlightEl: createOverlayElement(instanceId, 'highlight'),
    spectrumEl: createOverlayElement(instanceId, 'spectrum'),
    resizeObserver: null,
    supportsBackdropFilter: supportsBackdropFilter(),
    supportsBackdropFilterUrl: supportsBackdropFilterUrl(),
    settings: normalizeSettings(settings),
    currentFilterSignature: null,
    currentMode: null,
  };

  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(() => {
      if (!stateByShellEl.has(state.shellEl)) {
        return;
      }

      renderState(state);
    });
    state.resizeObserver.observe(ctx.shellEl);
    if (ctx.contentEl !== ctx.shellEl) {
      state.resizeObserver.observe(ctx.contentEl);
    }
  }

  return state;
}

function mount(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void {
  const existingState = stateByShellEl.get(ctx.shellEl);
  if (existingState) {
    existingState.settings = normalizeSettings(settings);
    syncStateContext(existingState, ctx);
    renderState(existingState);
    return;
  }

  const staleInstanceId = ctx.shellEl.getAttribute(INSTANCE_ATTR);
  if (staleInstanceId) {
    cleanupInstanceArtifacts(ctx.shellEl, ctx.filterLayerEl, ctx.svgRootEl, staleInstanceId);
  }

  const state = createState(ctx, settings);
  stateByShellEl.set(ctx.shellEl, state);
  syncStateContext(state, ctx);
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

  state.settings = normalizeSettings(settings);
  syncStateContext(state, ctx);
  renderState(state);
}

function unmount(ctx: GlassMountContext): void {
  const state = stateByShellEl.get(ctx.shellEl);
  if (!state) {
    const instanceId = ctx.shellEl.getAttribute(INSTANCE_ATTR) ?? ctx.filterLayerEl.getAttribute(INSTANCE_ATTR);
    if (instanceId) {
      cleanupInstanceArtifacts(ctx.shellEl, ctx.filterLayerEl, ctx.svgRootEl, instanceId);
    } else {
      ctx.filterLayerEl
        .querySelectorAll<HTMLElement>(`[${OWNER_ATTR}]`)
        .forEach((element) => element.remove());
      clearFilterLayerDecorations(ctx.filterLayerEl);
    }
    return;
  }

  state.resizeObserver?.disconnect();
  cleanupInstanceArtifacts(state.shellEl, state.filterLayerEl, state.svgRootEl, state.instanceId);
  stateByShellEl.delete(ctx.shellEl);
}

export const adapter: GlassEffectAdapter = {
  id: 'nikdelvin',
  displayName: 'Nikdelvin Liquid Glass',
  description: 'A deeper liquid-glass variant with stronger depth and chromatic separation.',
  paramDefs,
  mount,
  updateSettings,
  unmount,
};
