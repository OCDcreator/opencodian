import type {
  GlassAdapterSettingsValue,
  GlassEffectAdapter,
  GlassMountContext,
} from '../types';
import {
  createRdevInteractionController,
  createRestInteractionFrame,
  type RdevInteractionController,
  type RdevInteractionFrame,
} from './rdev/interaction';
import { getRdevDisplacementMap, type RdevMode } from './rdev/displacementMaps';
import {
  createRdevFilter,
  removeRdevFilter,
  updateRdevFilter,
  type RdevFilterRefs,
} from './rdev/svgFilter';

interface NormalizedRdevSettings {
  mode: RdevMode;
  displacementScale: number;
  aberrationIntensity: number;
  blurAmount: number;
  elasticity: number;
}

interface RdevLayerDomRefs {
  glowEl: HTMLDivElement;
  rimEl: HTMLDivElement;
  sheenEl: HTMLDivElement;
  surfaceEl: HTMLDivElement;
}

interface RdevState {
  ctx: GlassMountContext;
  dom: RdevLayerDomRefs;
  filterId: string;
  filterRefs: RdevFilterRefs;
  filterLayerDatasetSnapshot: Record<string, string | undefined>;
  filterLayerStyleSnapshot: Record<string, string>;
  interaction: RdevInteractionController;
  lastMapKey: string | null;
  motion: RdevInteractionFrame;
  resizeObserver: ResizeObserver | null;
  settings: NormalizedRdevSettings;
  shellDatasetSnapshot: Record<string, string | undefined>;
  shellStyleSnapshot: Record<string, string>;
}

const DEFAULT_SETTINGS: NormalizedRdevSettings = {
  mode: 'standard',
  displacementScale: 70,
  aberrationIntensity: 2,
  blurAmount: 1,
  elasticity: 0.15,
};

const FILTER_LAYER_DATASET_KEYS = ['opencodianLgRdev', 'opencodianLgRdevFilterId'];
const FILTER_LAYER_STYLE_PROPERTIES = [
  'opacity',
  'filter',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'background',
  'transform',
  'transform-origin',
  'will-change',
] as const;
const MODE_VISUAL_PROFILES: Record<
  RdevMode,
  {
    angle: number;
    density: number;
    spectrum: number;
    tint: number;
  }
> = {
  standard: {
    angle: 132,
    density: 54,
    spectrum: 26,
    tint: 70,
  },
  polar: {
    angle: 118,
    density: 60,
    spectrum: 34,
    tint: 74,
  },
  prominent: {
    angle: 146,
    density: 68,
    spectrum: 42,
    tint: 80,
  },
  shader: {
    angle: 138,
    density: 58,
    spectrum: 30,
    tint: 72,
  },
};
const SHELL_DATASET_KEYS = ['opencodianLgRdev'];
const SHELL_STYLE_PROPERTIES = [
  'background',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'transform',
  'transform-origin',
  'will-change',
] as const;
const stateByShell = new WeakMap<HTMLElement, RdevState>();

let filterIdCounter = 0;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRdevMode(value: GlassAdapterSettingsValue | undefined): value is RdevMode {
  return value === 'standard' || value === 'polar' || value === 'prominent' || value === 'shader';
}

function coerceNumber(
  value: GlassAdapterSettingsValue | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const nextValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(nextValue) ? clamp(nextValue, min, max) : fallback;
}

function normalizeSettings(
  settings: Record<string, GlassAdapterSettingsValue>,
): NormalizedRdevSettings {
  return {
    mode: isRdevMode(settings.mode) ? settings.mode : DEFAULT_SETTINGS.mode,
    displacementScale: coerceNumber(
      settings.displacementScale,
      DEFAULT_SETTINGS.displacementScale,
      0,
      140,
    ),
    aberrationIntensity: coerceNumber(
      settings.aberrationIntensity,
      DEFAULT_SETTINGS.aberrationIntensity,
      0,
      10,
    ),
    blurAmount: coerceNumber(settings.blurAmount, DEFAULT_SETTINGS.blurAmount, 0, 10),
    elasticity: coerceNumber(settings.elasticity, DEFAULT_SETTINGS.elasticity, 0, 1),
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

function mixVar(variableName: string, percent: number): string {
  return `color-mix(in srgb, ${variableName} ${Math.round(percent)}%, transparent)`;
}

function createLayerPart(part: string): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset.opencodianLgRdevPart = part;
  el.style.position = 'absolute';
  el.style.inset = '0';
  el.style.borderRadius = 'inherit';
  el.style.pointerEvents = 'none';
  return el;
}

function createLayerDom(filterLayerEl: HTMLElement): RdevLayerDomRefs {
  const surfaceEl = createLayerPart('surface');
  surfaceEl.style.willChange = 'transform';

  const glowEl = createLayerPart('glow');
  glowEl.style.mixBlendMode = 'screen';

  const rimEl = createLayerPart('rim');
  rimEl.style.mixBlendMode = 'screen';

  const sheenEl = createLayerPart('sheen');
  sheenEl.style.mixBlendMode = 'screen';

  filterLayerEl.append(surfaceEl, glowEl, rimEl, sheenEl);

  return {
    glowEl,
    rimEl,
    sheenEl,
    surfaceEl,
  };
}

function getLayerSize(ctx: GlassMountContext): { height: number; width: number } {
  const width =
    ctx.filterLayerEl.clientWidth || ctx.shellEl.clientWidth || ctx.contentEl.clientWidth || 320;
  const height =
    ctx.filterLayerEl.clientHeight || ctx.shellEl.clientHeight || ctx.contentEl.clientHeight || 96;

  return { width, height };
}

function refreshFilter(state: RdevState): void {
  const { width, height } = getLayerSize(state.ctx);
  const map = getRdevDisplacementMap(state.settings.mode, width, height, {
    displacementScale: state.settings.displacementScale,
    aberrationIntensity: state.settings.aberrationIntensity,
  });

  if (map.cacheKey === state.lastMapKey) {
    return;
  }

  state.lastMapKey = map.cacheKey;
  updateRdevFilter(state.filterRefs, {
    mode: state.settings.mode,
    displacementScale: state.settings.displacementScale,
    aberrationIntensity: state.settings.aberrationIntensity,
    mapUrl: map.url,
  });
}

function applyMotion(state: RdevState, frame: RdevInteractionFrame): void {
  const motionStrength = Math.hypot(frame.filterOffsetX, frame.filterOffsetY);
  const highlightBand = clamp(24 + motionStrength * 1.4, 24, 44);
  const highlightSpread = clamp(16 + motionStrength * 1.2, 16, 34);

  state.motion = frame;

  state.ctx.shellEl.style.setProperty(
    'transform',
    `translate3d(${frame.translateX.toFixed(2)}px, ${frame.translateY.toFixed(2)}px, 0) scaleX(${frame.scaleX.toFixed(4)}) scaleY(${frame.scaleY.toFixed(4)})`,
  );
  state.ctx.filterLayerEl.style.setProperty(
    'transform',
    `translate3d(${frame.filterOffsetX.toFixed(2)}px, ${frame.filterOffsetY.toFixed(2)}px, 0)`,
  );

  state.dom.surfaceEl.style.transform = `translate3d(${(frame.filterOffsetX * 0.35).toFixed(2)}px, ${(frame.filterOffsetY * 0.35).toFixed(2)}px, 0) scale(${(1 + motionStrength * 0.0009).toFixed(4)})`;
  state.dom.glowEl.style.background = `
radial-gradient(
  circle at ${frame.highlightX.toFixed(2)}% ${frame.highlightY.toFixed(2)}%,
  ${mixVar('var(--opencodian-composer-liquid-highlight-strong)', 16 + frame.glowOpacity * 34)} 0%,
  ${mixVar('var(--opencodian-composer-liquid-spectrum-end)', 12 + frame.glowOpacity * 28 + state.settings.aberrationIntensity * 1.8)} 28%,
  transparent 62%
)`;
  state.dom.glowEl.style.opacity = `${clamp(0.06 + frame.glowOpacity * 0.72, 0.06, 0.78).toFixed(3)}`;

  state.dom.sheenEl.style.background = `
linear-gradient(
  ${frame.highlightAngle.toFixed(2)}deg,
  transparent 0%,
  transparent ${highlightBand.toFixed(2)}%,
  ${mixVar('var(--opencodian-composer-liquid-highlight-strong)', 22 + frame.highlightOpacity * 44 + state.settings.aberrationIntensity * 2.4)} 50%,
  transparent ${(highlightBand + highlightSpread).toFixed(2)}%,
  transparent 100%
)`;
  state.dom.sheenEl.style.opacity = `${clamp(0.12 + frame.highlightOpacity * 0.62, 0.12, 0.84).toFixed(3)}`;
  state.dom.rimEl.style.opacity = `${clamp(frame.rimOpacity, 0.5, 1).toFixed(3)}`;
}

function applyVisualSettings(state: RdevState): void {
  const blurRatio = state.settings.blurAmount / 10;
  const aberrationRatio = state.settings.aberrationIntensity / 10;
  const displacementRatio = state.settings.displacementScale / 140;
  const profile = MODE_VISUAL_PROFILES[state.settings.mode];
  const filterLayerEl = state.ctx.filterLayerEl;
  const shellEl = state.ctx.shellEl;
  const backdropFilterValue = `blur(${(6 + state.settings.blurAmount * 3.2).toFixed(2)}px) saturate(${(120 + displacementRatio * 40 + aberrationRatio * 10).toFixed(2)}%) brightness(${(100 + blurRatio * 6).toFixed(2)}%)`;

  refreshFilter(state);

  filterLayerEl.dataset.opencodianLgRdev = 'mounted';
  filterLayerEl.dataset.opencodianLgRdevFilterId = state.filterId;
  filterLayerEl.style.setProperty('opacity', '1');
  filterLayerEl.style.setProperty('filter', `url(#${state.filterId})`);
  filterLayerEl.style.setProperty(
    'background',
    `rgba(255, 255, 255, ${(0.01 + blurRatio * 0.01).toFixed(3)})`,
  );
  filterLayerEl.style.setProperty('backdrop-filter', backdropFilterValue);
  filterLayerEl.style.setProperty('-webkit-backdrop-filter', backdropFilterValue);
  filterLayerEl.style.setProperty('transform-origin', 'center center');
  filterLayerEl.style.setProperty('will-change', 'transform, filter, opacity, backdrop-filter');

  shellEl.dataset.opencodianLgRdev = 'mounted';
  shellEl.style.setProperty('background', 'transparent');
  shellEl.style.setProperty('backdrop-filter', 'none');
  shellEl.style.setProperty('-webkit-backdrop-filter', 'none');
  shellEl.style.setProperty('transform-origin', 'center center');
  shellEl.style.setProperty('will-change', 'transform');

  state.dom.surfaceEl.style.background = `
linear-gradient(
  ${profile.angle}deg,
  ${mixVar('var(--opencodian-composer-liquid-tint)', profile.tint + blurRatio * 8)} 0%,
  ${mixVar('var(--opencodian-composer-liquid-density)', profile.density + displacementRatio * 14)} 38%,
  ${mixVar('var(--opencodian-composer-liquid-tint)', profile.tint + aberrationRatio * 16 + 10)} 100%
),
radial-gradient(
  circle at 12% 0%,
  ${mixVar('var(--opencodian-composer-liquid-highlight-strong)', 18 + blurRatio * 10 + aberrationRatio * 14)} 0%,
  transparent ${Math.round(36 + blurRatio * 10)}%
),
radial-gradient(
  circle at 86% 100%,
  ${mixVar('var(--opencodian-composer-liquid-spectrum-end)', profile.spectrum + aberrationRatio * 18)} 0%,
  transparent ${Math.round(48 + displacementRatio * 10)}%
),
linear-gradient(
  180deg,
  ${mixVar('var(--opencodian-composer-liquid-density)', 18 + blurRatio * 10)} 0%,
  transparent 62%
)`;
  state.dom.surfaceEl.style.boxShadow = `
    inset 0 1px 0 rgba(255, 255, 255, ${(0.08 + blurRatio * 0.06).toFixed(3)}),
    inset 0 -1px 0 rgba(255, 255, 255, ${(0.04 + aberrationRatio * 0.06).toFixed(3)}),
    0 14px ${Math.round(24 + state.settings.displacementScale * 0.2)}px rgba(0, 0, 0, ${(0.12 + blurRatio * 0.07).toFixed(3)})`;
  state.dom.surfaceEl.style.opacity = `${(0.92 + blurRatio * 0.06).toFixed(3)}`;

  state.dom.rimEl.style.boxShadow = `
    inset 0 0 0 0.7px rgba(255, 255, 255, ${(0.18 + aberrationRatio * 0.14).toFixed(3)}),
    inset 0 1px 0 rgba(255, 255, 255, ${(0.08 + blurRatio * 0.05).toFixed(3)}),
    inset 0 -1px 0 rgba(173, 216, 255, ${(0.04 + aberrationRatio * 0.08).toFixed(3)})`;

  applyMotion(state, state.motion);
}

function createState(
  ctx: GlassMountContext,
  settings: NormalizedRdevSettings,
): RdevState {
  const filterId = `opencodian-lg-rdev-${++filterIdCounter}`;
  const initialMap = getRdevDisplacementMap(settings.mode, 320, 96, {
    displacementScale: settings.displacementScale,
    aberrationIntensity: settings.aberrationIntensity,
  });
  const filterRefs = createRdevFilter(ctx.svgRootEl, filterId, {
    mode: settings.mode,
    displacementScale: settings.displacementScale,
    aberrationIntensity: settings.aberrationIntensity,
    mapUrl: initialMap.url,
  });
  const dom = createLayerDom(ctx.filterLayerEl);
  const shellStyleSnapshot = captureStyleSnapshot(ctx.shellEl, SHELL_STYLE_PROPERTIES);
  const filterLayerStyleSnapshot = captureStyleSnapshot(
    ctx.filterLayerEl,
    FILTER_LAYER_STYLE_PROPERTIES,
  );
  const shellDatasetSnapshot = captureDatasetSnapshot(ctx.shellEl, SHELL_DATASET_KEYS);
  const filterLayerDatasetSnapshot = captureDatasetSnapshot(
    ctx.filterLayerEl,
    FILTER_LAYER_DATASET_KEYS,
  );
  const motion = createRestInteractionFrame();
  const interaction = createRdevInteractionController(ctx.shellEl, settings.elasticity, (frame) => {
    const nextState = stateByShell.get(ctx.shellEl);
    if (!nextState) {
      return;
    }

    applyMotion(nextState, frame);
  });

  const state: RdevState = {
    ctx,
    dom,
    filterId,
    filterRefs,
    filterLayerDatasetSnapshot,
    filterLayerStyleSnapshot,
    interaction,
    lastMapKey: initialMap.cacheKey,
    motion,
    resizeObserver: null,
    settings,
    shellDatasetSnapshot,
    shellStyleSnapshot,
  };

  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(() => {
      refreshFilter(state);
    });
    state.resizeObserver.observe(ctx.shellEl);
  }

  applyVisualSettings(state);
  return state;
}

function destroyState(state: RdevState): void {
  state.resizeObserver?.disconnect();
  state.interaction.destroy();
  removeRdevFilter(state.filterRefs);
  state.dom.surfaceEl.remove();
  state.dom.glowEl.remove();
  state.dom.rimEl.remove();
  state.dom.sheenEl.remove();
  restoreStyleSnapshot(state.ctx.filterLayerEl, state.filterLayerStyleSnapshot);
  restoreStyleSnapshot(state.ctx.shellEl, state.shellStyleSnapshot);
  restoreDatasetSnapshot(state.ctx.filterLayerEl, state.filterLayerDatasetSnapshot);
  restoreDatasetSnapshot(state.ctx.shellEl, state.shellDatasetSnapshot);
  stateByShell.delete(state.ctx.shellEl);
}

function mount(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void {
  const existingState = stateByShell.get(ctx.shellEl);
  if (existingState) {
    destroyState(existingState);
  }

  const state = createState(ctx, normalizeSettings(settings));
  stateByShell.set(ctx.shellEl, state);
}

function updateSettings(
  ctx: GlassMountContext,
  settings: Record<string, GlassAdapterSettingsValue>,
): void {
  const state = stateByShell.get(ctx.shellEl);
  const normalizedSettings = normalizeSettings(settings);

  if (
    !state ||
    !state.dom.surfaceEl.isConnected ||
    !state.filterRefs.defsEl.isConnected ||
    state.ctx.filterLayerEl !== ctx.filterLayerEl ||
    state.ctx.svgRootEl !== ctx.svgRootEl
  ) {
    mount(ctx, settings);
    return;
  }

  state.ctx = ctx;
  state.settings = normalizedSettings;
  state.interaction.updateElasticity(normalizedSettings.elasticity);
  applyVisualSettings(state);
}

function unmount(ctx: GlassMountContext): void {
  const state = stateByShell.get(ctx.shellEl);
  if (!state) {
    return;
  }

  destroyState(state);
}

export const adapter: GlassEffectAdapter = {
  id: 'rdev',
  displayName: 'Rdev Liquid Glass',
  description: 'A flexible liquid-glass adapter with multiple render modes and expressive motion tuning.',
  paramDefs: [
    {
      key: 'mode',
      labelKey: 'settings.style.input.liquidGlass.rdev.mode',
      type: 'select',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'polar', label: 'Polar' },
        { value: 'prominent', label: 'Prominent' },
        { value: 'shader', label: 'Shader' },
      ],
      defaultValue: 'standard',
    },
    {
      key: 'displacementScale',
      labelKey: 'settings.style.input.liquidGlass.rdev.displacementScale',
      type: 'number',
      min: 0,
      max: 140,
      step: 1,
      unit: '',
      defaultValue: 70,
    },
    {
      key: 'aberrationIntensity',
      labelKey: 'settings.style.input.liquidGlass.rdev.aberrationIntensity',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.1,
      unit: '',
      defaultValue: 2,
    },
    {
      key: 'blurAmount',
      labelKey: 'settings.style.input.liquidGlass.rdev.blurAmount',
      type: 'number',
      min: 0,
      max: 10,
      step: 0.1,
      unit: '',
      defaultValue: 1,
    },
    {
      key: 'elasticity',
      labelKey: 'settings.style.input.liquidGlass.rdev.elasticity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.01,
      unit: '',
      defaultValue: 0.15,
    },
  ],
  mount,
  unmount,
  updateSettings,
};
