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
const SPIN_DEGREES_PER_MS = 360 / 20000;

type RenderMode = 'svg' | 'glass' | 'overlay';
type NikdelvinColor = 'transparent' | 'black' | 'white';
type NikdelvinBackgroundPresetId = 'none' | 'background' | 'lines' | 'rocks' | 'chrome' | 'silk';

const NIKDELVIN_BACKGROUND_PRESET_ASSET_PATH: Record<
  Exclude<NikdelvinBackgroundPresetId, 'none'>,
  string
> = {
  background: 'assets/liquid-glass/nikdelvin/background.webp',
  lines: 'assets/liquid-glass/nikdelvin/lines1.svg',
  rocks: 'assets/liquid-glass/nikdelvin/rocks1.png',
  chrome: 'assets/liquid-glass/nikdelvin/chrome1.png',
  silk: 'assets/liquid-glass/nikdelvin/silk1.png',
};

interface NikdelvinSettings {
  depth: number;
  strength: number;
  chromaticAberration: number;
  blur: number;
  backgroundPreset: NikdelvinBackgroundPresetId;
  color: NikdelvinColor;
  background: string;
  freeze: boolean;
  noMorph: boolean;
  button: boolean;
  inline: boolean;
  customEffects: boolean;
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
  bgContainerEl: HTMLDivElement;
  bgImageEl: HTMLImageElement;
  overlayEl: HTMLDivElement;
  glassBoxEl: HTMLDivElement;
  surfaceEl: HTMLDivElement;
  highlightEl: HTMLDivElement;
  spectrumEl: HTMLDivElement;
  resizeObserver: ResizeObserver | null;
  supportsBackdropFilter: boolean;
  supportsBackdropFilterUrl: boolean;
  settings: NikdelvinSettings;
  currentFilterSignature: string | null;
  currentMode: RenderMode | null;
  resolveAssetUrl: ((relativePath: string) => string | null) | null;
  spinFrameId: number | null;
  spinLastTimestamp: number | null;
  spinRotation: number;
  isHovered: boolean;
  mouseEnterHandler: () => void;
  mouseLeaveHandler: () => void;
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
    descKey: 'settings.style.input.liquidGlass.nikdelvin.depth.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
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
    descKey: 'settings.style.input.liquidGlass.nikdelvin.strength.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
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
    descKey: 'settings.style.input.liquidGlass.nikdelvin.chromaticAberration.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
    type: 'number',
    min: 0,
    max: 10,
    step: 0.1,
    unit: '',
    defaultValue: 0,
  },
  {
    key: 'blur',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.blur',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.blur.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.refraction',
    type: 'number',
    min: 0,
    max: 10,
    step: 0.1,
    unit: '',
    defaultValue: 0,
  },
  {
    key: 'backgroundPreset',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.appearance',
    type: 'select',
    options: [
      {
        value: 'none',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset.option.none',
      },
      {
        value: 'background',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset.option.background',
      },
      {
        value: 'lines',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset.option.lines',
      },
      {
        value: 'rocks',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset.option.rocks',
      },
      {
        value: 'chrome',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset.option.chrome',
      },
      {
        value: 'silk',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.backgroundPreset.option.silk',
      },
    ],
    defaultValue: 'background',
  },
  {
    key: 'color',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.color',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.color.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.appearance',
    type: 'select',
    options: [
      {
        value: 'transparent',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.color.option.transparent',
      },
      {
        value: 'black',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.color.option.black',
      },
      {
        value: 'white',
        labelKey: 'settings.style.input.liquidGlass.nikdelvin.color.option.white',
      },
    ],
    defaultValue: 'transparent',
  },
  {
    key: 'background',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.background',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.background.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.appearance',
    type: 'text',
    defaultValue: '',
  },
  {
    key: 'freeze',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.freeze',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.freeze.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.behavior',
    type: 'toggle',
    defaultValue: false,
  },
  {
    key: 'noMorph',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.noMorph',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.noMorph.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.behavior',
    type: 'toggle',
    defaultValue: false,
  },
  {
    key: 'button',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.button',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.button.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.behavior',
    type: 'toggle',
    defaultValue: false,
  },
  {
    key: 'inline',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.inline',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.inline.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.behavior',
    type: 'toggle',
    defaultValue: false,
  },
  {
    key: 'customEffects',
    labelKey: 'settings.style.input.liquidGlass.nikdelvin.customEffects',
    descKey: 'settings.style.input.liquidGlass.nikdelvin.customEffects.desc',
    sectionLabelKey: 'settings.style.input.liquidGlass.section.extras',
    type: 'toggle',
    defaultValue: false,
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

function createLayerElement(instanceId: string, role: string): HTMLDivElement {
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

function createBackgroundImageElement(instanceId: string): HTMLImageElement {
  const element = document.createElement('img');
  element.setAttribute(OWNER_ATTR, instanceId);
  element.setAttribute(ROLE_ATTR, 'background-image');
  element.style.position = 'absolute';
  element.style.top = '50%';
  element.style.left = '50%';
  element.style.transform = 'translate(-50%, -50%)';
  element.style.pointerEvents = 'none';
  element.style.willChange = 'filter, transform';
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

function getDefaultSetting<K extends keyof NikdelvinSettings>(key: K): NikdelvinSettings[K] {
  const def = paramDefs.find((item) => item.key === key);
  return (def?.defaultValue ?? null) as NikdelvinSettings[K];
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
    return getDefaultSetting(key) as number;
  }

  return clamp(parsedValue, min, max);
}

function readStringSetting(
  settings: Record<string, GlassAdapterSettingsValue>,
  key: keyof NikdelvinSettings,
): string {
  const rawValue = settings[key];
  return typeof rawValue === 'string'
    ? rawValue.trim()
    : String(getDefaultSetting(key) ?? '');
}

function readBooleanSetting(
  settings: Record<string, GlassAdapterSettingsValue>,
  key: keyof NikdelvinSettings,
): boolean {
  const rawValue = settings[key];
  return typeof rawValue === 'boolean'
    ? rawValue
    : Boolean(getDefaultSetting(key));
}

function readColorSetting(settings: Record<string, GlassAdapterSettingsValue>): NikdelvinColor {
  const rawValue = settings.color;
  switch (rawValue) {
    case 'black':
    case 'white':
    case 'transparent':
      return rawValue;
    default:
      return getDefaultSetting('color');
  }
}

function readBackgroundPresetSetting(
  settings: Record<string, GlassAdapterSettingsValue>,
): NikdelvinBackgroundPresetId {
  const rawValue = settings.backgroundPreset;
  switch (rawValue) {
    case 'background':
    case 'lines':
    case 'rocks':
    case 'chrome':
    case 'silk':
    case 'none':
      return rawValue;
    default:
      return getDefaultSetting('backgroundPreset');
  }
}

function normalizeSettings(settings: Record<string, GlassAdapterSettingsValue>): NikdelvinSettings {
  return {
    depth: readNumberSetting(settings, 'depth', 0, 40),
    strength: readNumberSetting(settings, 'strength', 0, 200),
    chromaticAberration: readNumberSetting(settings, 'chromaticAberration', 0, 10),
    blur: readNumberSetting(settings, 'blur', 0, 10),
    backgroundPreset: readBackgroundPresetSetting(settings),
    color: readColorSetting(settings),
    background: readStringSetting(settings, 'background'),
    freeze: readBooleanSetting(settings, 'freeze'),
    noMorph: readBooleanSetting(settings, 'noMorph'),
    button: readBooleanSetting(settings, 'button'),
    inline: readBooleanSetting(settings, 'inline'),
    customEffects: readBooleanSetting(settings, 'customEffects'),
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

function applyBackdropFilterValue(element: HTMLElement, value: string | null): void {
  if (!value) {
    element.style.backdropFilter = '';
    element.style.removeProperty('-webkit-backdrop-filter');
    return;
  }

  element.style.backdropFilter = value;
  element.style.setProperty('-webkit-backdrop-filter', value);
}

function buildSvgBackdropFilterValue(state: NikdelvinState): string {
  const brightness = state.settings.button ? 1.6 : 1.1;
  const saturation = state.settings.button ? 1.2 : 1.5;
  const parts: string[] = [];

  if (state.settings.blur > 0) {
    parts.push(`blur(${formatNumber(state.settings.blur / 2)}px)`);
  }

  parts.push(`url("#${state.filterId}")`);

  if (state.settings.blur > 0) {
    parts.push(`blur(${formatNumber(state.settings.blur)}px)`);
  }

  parts.push(`brightness(${formatNumber(brightness)})`);
  parts.push(`saturate(${formatNumber(saturation)})`);

  return parts.join(' ');
}

function buildFallbackBackdropFilterValue(metrics: ShellMetrics): string {
  return `blur(${formatNumber(metrics.width / 10)}px) saturate(180%)`;
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

function resolveOverlayBackground(settings: NikdelvinSettings): string {
  if (settings.noMorph) {
    return 'rgba(255, 255, 255, 0.1)';
  }

  return settings.button ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.3)';
}

function applyGlassTint(state: NikdelvinState): void {
  state.glassBoxEl.style.boxShadow = 'inset 0 0 4px 0 #fafafa80';

  switch (state.settings.color) {
    case 'black':
      state.glassBoxEl.style.background = '#09090b80';
      state.glassBoxEl.style.filter = 'brightness(0.6)';
      break;
    case 'white':
      state.glassBoxEl.style.background = '#fafafa80';
      state.glassBoxEl.style.filter = '';
      break;
    case 'transparent':
    default:
      state.glassBoxEl.style.background = '#09090b00';
      state.glassBoxEl.style.filter = '';
      break;
  }
}

function updateBackgroundTransform(state: NikdelvinState): void {
  state.bgImageEl.style.transform =
    `translate(-50%, -50%) rotate(${formatNumber(state.spinRotation)}deg)`;
}

function stopBackgroundSpin(state: NikdelvinState): void {
  if (state.spinFrameId !== null) {
    window.cancelAnimationFrame(state.spinFrameId);
    state.spinFrameId = null;
  }
  state.spinLastTimestamp = null;
}

function shouldSpinBackground(state: NikdelvinState): boolean {
  return resolveBackgroundSource(state).length > 0 && !state.settings.freeze && state.isHovered;
}

function stepBackgroundSpin(state: NikdelvinState, timestamp: number): void {
  if (!shouldSpinBackground(state)) {
    stopBackgroundSpin(state);
    return;
  }

  if (state.spinLastTimestamp !== null) {
    const elapsed = timestamp - state.spinLastTimestamp;
    state.spinRotation = (state.spinRotation + elapsed * SPIN_DEGREES_PER_MS) % 360;
    updateBackgroundTransform(state);
  }

  state.spinLastTimestamp = timestamp;
  state.spinFrameId = window.requestAnimationFrame((nextTimestamp) => {
    stepBackgroundSpin(state, nextTimestamp);
  });
}

function syncBackgroundSpin(state: NikdelvinState): void {
  if (!shouldSpinBackground(state)) {
    stopBackgroundSpin(state);
    return;
  }

  if (state.spinFrameId !== null) {
    return;
  }

  state.spinFrameId = window.requestAnimationFrame((timestamp) => {
    stepBackgroundSpin(state, timestamp);
  });
}

function applyShellInteractiveStyles(state: NikdelvinState): void {
  const hasBackground = resolveBackgroundSource(state).length > 0;
  state.shellEl.style.transition = state.settings.button ? 'all 0.3s ease-out' : '';
  state.shellEl.style.transformOrigin = state.settings.button ? 'top center' : '';
  state.shellEl.style.cursor = state.settings.button ? 'pointer' : '';
  state.shellEl.style.transform =
    state.settings.button && state.isHovered ? 'scale(1.05) rotate(-1deg)' : '';
  state.shellEl.style.display = state.settings.inline ? 'inline-flex' : '';
  state.shellEl.style.alignSelf = state.settings.inline ? 'flex-start' : '';
  state.shellEl.style.width = state.settings.inline ? 'max-content' : '';
  state.shellEl.style.maxWidth = state.settings.inline ? '100%' : '';
  state.shellEl.style.verticalAlign = state.settings.inline ? 'middle' : '';
  state.shellEl.style.boxShadow =
    !state.supportsBackdropFilterUrl && hasBackground
      ? (state.settings.button ? '0px 0px 2px white' : '0px 0px 1px white')
      : '';
}

function resolveBackgroundSource(state: NikdelvinState): string {
  if (state.settings.backgroundPreset !== 'none') {
    const relativePath = NIKDELVIN_BACKGROUND_PRESET_ASSET_PATH[state.settings.backgroundPreset];
    const resolvedUrl = state.resolveAssetUrl?.(relativePath) ?? null;
    if (resolvedUrl) {
      return resolvedUrl;
    }
  }

  return state.settings.background;
}

function updateBaseLayers(state: NikdelvinState, metrics: ShellMetrics, mode: RenderMode): void {
  const backgroundSource = resolveBackgroundSource(state);
  const hasBackground = backgroundSource.length > 0;

  state.overlayEl.style.display = 'block';
  state.overlayEl.style.background = resolveOverlayBackground(state.settings);

  state.glassBoxEl.style.display = 'block';
  state.glassBoxEl.style.width = `${metrics.width}px`;
  state.glassBoxEl.style.height = `${metrics.height}px`;
  applyGlassTint(state);

  if (mode === 'svg') {
    applyBackdropFilterValue(state.glassBoxEl, buildSvgBackdropFilterValue(state));
  } else if (mode === 'glass' && !hasBackground) {
    applyBackdropFilterValue(state.glassBoxEl, buildFallbackBackdropFilterValue(metrics));
  } else {
    applyBackdropFilterValue(state.glassBoxEl, null);
  }

  state.bgContainerEl.style.display = hasBackground ? 'block' : 'none';
  if (!hasBackground) {
    state.bgImageEl.removeAttribute('src');
    state.bgImageEl.style.filter = '';
    state.spinRotation = 0;
    updateBackgroundTransform(state);
    stopBackgroundSpin(state);
    applyShellInteractiveStyles(state);
    return;
  }

  if (state.bgImageEl.getAttribute('src') !== backgroundSource) {
    state.bgImageEl.src = backgroundSource;
  }

  state.bgImageEl.style.width = `${metrics.width}px`;
  state.bgImageEl.style.height = `${metrics.width}px`;
  state.bgImageEl.style.filter =
    mode === 'svg' ? '' : `blur(${formatNumber(metrics.width / 50)}px) saturate(180%)`;
  updateBackgroundTransform(state);
  syncBackgroundSpin(state);
  applyShellInteractiveStyles(state);
}

function updateCustomEffectLayers(state: NikdelvinState, mode: RenderMode): void {
  if (!state.settings.customEffects) {
    for (const element of [state.surfaceEl, state.highlightEl, state.spectrumEl]) {
      element.style.display = 'none';
      element.style.opacity = '0';
      element.style.background = '';
      element.style.boxShadow = '';
      element.style.mixBlendMode = '';
    }
    return;
  }

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

  for (const element of [state.surfaceEl, state.highlightEl, state.spectrumEl]) {
    element.style.display = 'block';
  }

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
  filterLayerEl.removeAttribute(INSTANCE_ATTR);
  filterLayerEl.removeAttribute(MODE_ATTR);
}

function resetShellStyles(shellEl: HTMLElement): void {
  shellEl.style.transition = '';
  shellEl.style.transformOrigin = '';
  shellEl.style.cursor = '';
  shellEl.style.transform = '';
  shellEl.style.display = '';
  shellEl.style.alignSelf = '';
  shellEl.style.width = '';
  shellEl.style.maxWidth = '';
  shellEl.style.verticalAlign = '';
  shellEl.style.boxShadow = '';
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
  resetShellStyles(shellEl);
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
  state.resolveAssetUrl = ctx.resolveAssetUrl ?? null;

  if (state.svgDefsEl.parentNode !== ctx.svgRootEl) {
    ctx.svgRootEl.appendChild(state.svgDefsEl);
  }

  if (state.bgImageEl.parentElement !== state.bgContainerEl) {
    state.bgContainerEl.appendChild(state.bgImageEl);
  }

  for (const element of [
    state.bgContainerEl,
    state.overlayEl,
    state.glassBoxEl,
    state.surfaceEl,
    state.highlightEl,
    state.spectrumEl,
  ]) {
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
  } else {
    clearFilterDefinition(state);
  }

  updateBaseLayers(state, metrics, mode);
  updateCustomEffectLayers(state, mode);
  applyShellInteractiveStyles(state);
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

  const bgContainerEl = createLayerElement(instanceId, 'background');
  bgContainerEl.style.overflow = 'hidden';
  bgContainerEl.style.zIndex = '0';

  const bgImageEl = createBackgroundImageElement(instanceId);
  bgContainerEl.appendChild(bgImageEl);

  const overlayEl = createLayerElement(instanceId, 'overlay');
  overlayEl.style.zIndex = '1';

  const glassBoxEl = createLayerElement(instanceId, 'glass-box');
  glassBoxEl.style.zIndex = '2';

  const surfaceEl = createLayerElement(instanceId, 'surface');
  surfaceEl.style.zIndex = '3';

  const highlightEl = createLayerElement(instanceId, 'highlight');
  highlightEl.style.zIndex = '4';

  const spectrumEl = createLayerElement(instanceId, 'spectrum');
  spectrumEl.style.zIndex = '5';

  const state: NikdelvinState = {
    instanceId,
    filterId: `${instanceId}-filter`,
    shellEl: ctx.shellEl,
    contentEl: ctx.contentEl,
    svgRootEl: ctx.svgRootEl,
    filterLayerEl: ctx.filterLayerEl,
    svgDefsEl,
    bgContainerEl,
    bgImageEl,
    overlayEl,
    glassBoxEl,
    surfaceEl,
    highlightEl,
    spectrumEl,
    resizeObserver: null,
    supportsBackdropFilter: supportsBackdropFilter(),
    supportsBackdropFilterUrl: supportsBackdropFilterUrl(),
    settings: normalizeSettings(settings),
    currentFilterSignature: null,
    currentMode: null,
    resolveAssetUrl: ctx.resolveAssetUrl ?? null,
    spinFrameId: null,
    spinLastTimestamp: null,
    spinRotation: 0,
    isHovered: false,
    mouseEnterHandler: () => {
      state.isHovered = true;
      applyShellInteractiveStyles(state);
      syncBackgroundSpin(state);
    },
    mouseLeaveHandler: () => {
      state.isHovered = false;
      applyShellInteractiveStyles(state);
      syncBackgroundSpin(state);
    },
  };

  state.shellEl.addEventListener('mouseenter', state.mouseEnterHandler);
  state.shellEl.addEventListener('mouseleave', state.mouseLeaveHandler);

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
      resetShellStyles(ctx.shellEl);
    }
    return;
  }

  stopBackgroundSpin(state);
  state.resizeObserver?.disconnect();
  state.shellEl.removeEventListener('mouseenter', state.mouseEnterHandler);
  state.shellEl.removeEventListener('mouseleave', state.mouseLeaveHandler);
  cleanupInstanceArtifacts(state.shellEl, state.filterLayerEl, state.svgRootEl, state.instanceId);
  stateByShellEl.delete(ctx.shellEl);
}

export const adapter: GlassEffectAdapter = {
  id: 'nikdelvin',
  displayName: 'Nikdelvin Liquid Glass',
  description: 'A liquid-glass adapter that keeps the upstream overlay and tint defaults while allowing OpenCodian extras to be toggled back on.',
  paramDefs,
  mount,
  updateSettings,
  unmount,
};
