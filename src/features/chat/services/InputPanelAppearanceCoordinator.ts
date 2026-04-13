import type {
  InputPanelActionButtonStyleId,
  InputPanelGlassRefractionSvgFilterPresetId,
  InputPanelGlassRefractionSvgFilterSettings,
  InputPanelThemeId,
  LiquidGlassAdapterId,
} from '../../../core/types';
import { createLogger } from '../../../shared';
import {
  getGlassAdapter,
  type GlassAdapterSettingsValue,
  type GlassEffectAdapter,
  type GlassMountContext,
} from '../../../utils/glass';

const logger = createLogger('OpenCodianView');

const INPUT_PANEL_THEME_CLASS_BY_ID: Record<
  Exclude<
    InputPanelThemeId,
    'preset' | 'liquid-glass-shuding' | 'liquid-glass-nikdelvin'
  >,
  string
> = {
  'glass-refraction-glass': 'opencodian-composer-shell--gr-glass',
  'glass-refraction-card': 'opencodian-composer-shell--gr-card',
  'glass-refraction-pill': 'opencodian-composer-shell--gr-pill',
};
const INPUT_PANEL_THEME_CLASS_NAMES = [
  ...Object.values(INPUT_PANEL_THEME_CLASS_BY_ID),
  'opencodian-composer-shell--liquid-glass',
];
const INPUT_PANEL_SVG_FILTER_CLASS_BY_ID: Record<Exclude<InputPanelGlassRefractionSvgFilterPresetId, 'none'>, string> = {
  subtle: 'opencodian-composer-shell--gr-svg-filter-subtle',
  strong: 'opencodian-composer-shell--gr-svg-filter-strong',
};
const INPUT_PANEL_SVG_FILTER_CLASS_NAMES = Object.values(INPUT_PANEL_SVG_FILTER_CLASS_BY_ID);
const INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_BY_ID: Record<
  Exclude<InputPanelActionButtonStyleId, 'default'>,
  string
> = {
  etched: 'opencodian-composer-shell--action-buttons-etched',
};
const INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_NAMES = Object.values(
  INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_BY_ID,
);
const COMPOSER_GLASS_SVG_DEFS_ID = 'opencodian-glass-svg-defs';
const COMPOSER_GLASS_SVG_FILTER_ID = 'opencodian-glass-refract';
const COMPOSER_GLASS_SVG_FILTER_STRONG_ID = 'opencodian-glass-refract-strong';

interface LiquidGlassDiagnosticElementDescriptor {
  tag: string;
  id: string | null;
  classes: string[];
  messageId: string | null;
  role: string | null;
  textPreview: string;
}

interface LiquidGlassBackdropPointSample {
  point: string;
  x: number;
  y: number;
  underlayChain: LiquidGlassDiagnosticElementDescriptor[];
}

interface LiquidGlassOverlapElementDiagnostic {
  overlapArea: number;
  overlapPercentOfShell: number;
  element: LiquidGlassDiagnosticElementDescriptor | null;
}

interface LiquidGlassBackdropOverlapDiagnostics {
  shellArea: number;
  intersectingElementCount: number;
  topIntersectingElements: LiquidGlassOverlapElementDiagnostic[];
  lastContentBottom: number | null;
  shellTop: number;
  gapAboveShellFromLastContentPx: number | null;
}

interface LiquidGlassAncestorDiagnostic {
  depth: number;
  element: LiquidGlassDiagnosticElementDescriptor | null;
  position: string;
  zIndex: string;
  overflow: string;
  isolation: string;
  transform: string;
  filter: string;
  backdropFilter: string;
  opacity: string;
  contain: string;
  mixBlendMode: string;
  pointerEvents: string;
}

export interface InputPanelAppearanceCoordinatorHost {
  getComposerShellEl(): HTMLElement | null;
  getInputWrapperEl(): HTMLElement | null;
  getChatContainerEl(): HTMLElement | null;
  getMessagesShellEl(): HTMLElement | null;
  getMessagesContainerEl(): HTMLElement | null;
  getInputPanelTheme(): InputPanelThemeId;
  getInputActionButtonStyle(): InputPanelActionButtonStyleId;
  getInputPanelGlassRefractionSvgFilterSettings(): InputPanelGlassRefractionSvgFilterSettings;
  getLiquidGlassAdapterSettings(
    adapterId: LiquidGlassAdapterId,
  ): Record<string, GlassAdapterSettingsValue>;
  isDebugLoggingEnabled(): boolean;
  resolveAssetUrl(relativePath: string): string | null;
  getLogPreview(text: string, maxLength?: number): string;
  stringifyLogPayload(payload: unknown): string;
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

function createComposerGlassFilterElement(
  filterId: string,
  config: {
    initialBlur: number;
    baseFrequency: string;
    numOctaves: number;
    noiseBlur: number;
    scale: number;
    saturation: number;
  },
): SVGFilterElement {
  const filter = createSvgElement('filter', {
    id: filterId,
    x: '-5%',
    y: '-5%',
    width: '110%',
    height: '110%',
    'color-interpolation-filters': 'sRGB',
  });

  filter.append(
    createSvgElement('feGaussianBlur', {
      in: 'SourceGraphic',
      stdDeviation: `${config.initialBlur}`,
      result: 'preblur',
    }),
    createSvgElement('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: config.baseFrequency,
      numOctaves: `${config.numOctaves}`,
      seed: '42',
      result: 'noise',
    }),
    createSvgElement('feGaussianBlur', {
      in: 'noise',
      stdDeviation: `${config.noiseBlur}`,
      result: 'smooth',
    }),
    createSvgElement('feDisplacementMap', {
      in: 'preblur',
      in2: 'smooth',
      scale: `${config.scale}`,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'displaced',
    }),
    createSvgElement('feColorMatrix', {
      in: 'displaced',
      type: 'saturate',
      values: `${config.saturation}`,
    }),
  );

  return filter;
}

function ensureComposerGlassSvgRootElement(): SVGSVGElement {
  let svg = document.getElementById(COMPOSER_GLASS_SVG_DEFS_ID) as SVGSVGElement | null;
  if (!svg) {
    svg = createSvgElement('svg', {
      id: COMPOSER_GLASS_SVG_DEFS_ID,
      width: '0',
      height: '0',
      'aria-hidden': 'true',
      focusable: 'false',
    });
    svg.style.position = 'absolute';
    svg.style.width = '0';
    svg.style.height = '0';
    svg.style.pointerEvents = 'none';
    (document.body ?? document.documentElement).appendChild(svg);
  }

  return svg;
}

function ensureComposerGlassSvgDefs(settings: InputPanelGlassRefractionSvgFilterSettings): void {
  const svg = ensureComposerGlassSvgRootElement();
  const defs = createSvgElement('defs', {});
  defs.append(
    createComposerGlassFilterElement(COMPOSER_GLASS_SVG_FILTER_ID, {
      initialBlur: 0.3,
      baseFrequency: '0.015 0.012',
      numOctaves: 2,
      noiseBlur: 3,
      scale: settings.subtleScale,
      saturation: 1.3,
    }),
    createComposerGlassFilterElement(COMPOSER_GLASS_SVG_FILTER_STRONG_ID, {
      initialBlur: 0.4,
      baseFrequency: '0.012 0.010',
      numOctaves: 3,
      noiseBlur: 4,
      scale: settings.strongScale,
      saturation: 1.5,
    }),
  );
  svg.replaceChildren(defs);
}

export class InputPanelAppearanceCoordinator {
  private composerSvgFilterLayerEl: HTMLElement | null = null;
  private activeLiquidGlassAdapter: GlassEffectAdapter | null = null;
  private lastLiquidGlassDiagnosticsFingerprint: string | null = null;

  constructor(private readonly host: InputPanelAppearanceCoordinatorHost) {}

  applyActionButtonStyleState(): void {
    const composerShellEl = this.host.getComposerShellEl();
    if (!composerShellEl) {
      return;
    }

    for (const className of INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_NAMES) {
      composerShellEl.removeClass(className);
    }

    const actionButtonStyle = this.host.getInputActionButtonStyle();
    if (actionButtonStyle === 'default') {
      return;
    }

    composerShellEl.addClass(INPUT_PANEL_ACTION_BUTTON_STYLE_CLASS_BY_ID[actionButtonStyle]);
  }

  applyThemeState(): void {
    const composerShellEl = this.host.getComposerShellEl();
    if (!composerShellEl) {
      return;
    }

    for (const className of INPUT_PANEL_THEME_CLASS_NAMES) {
      composerShellEl.removeClass(className);
    }
    for (const className of INPUT_PANEL_SVG_FILTER_CLASS_NAMES) {
      composerShellEl.removeClass(className);
    }

    const inputPanelTheme = this.host.getInputPanelTheme();
    if (inputPanelTheme === 'preset') {
      this.unmountLiquidGlassAdapter();
      this.removeComposerSvgFilterLayer();
      return;
    }

    const liquidGlassAdapterId = this.getLiquidGlassAdapterId(inputPanelTheme);
    if (liquidGlassAdapterId) {
      composerShellEl.addClass('opencodian-composer-shell--liquid-glass');

      const adapter = getGlassAdapter(liquidGlassAdapterId);
      const ctx = this.buildLiquidGlassMountContext();
      if (!adapter || !ctx) {
        this.unmountLiquidGlassAdapter();
        return;
      }

      const adapterSettings = this.host.getLiquidGlassAdapterSettings(liquidGlassAdapterId);
      if (this.activeLiquidGlassAdapter !== adapter) {
        this.unmountLiquidGlassAdapter();
        adapter.mount(ctx, adapterSettings);
        this.activeLiquidGlassAdapter = adapter;
      } else {
        adapter.updateSettings?.(ctx, adapterSettings);
      }
      this.scheduleLiquidGlassDiagnostics(liquidGlassAdapterId);
      return;
    }

    this.unmountLiquidGlassAdapter();
    const themeClassName = INPUT_PANEL_THEME_CLASS_BY_ID[
      inputPanelTheme as keyof typeof INPUT_PANEL_THEME_CLASS_BY_ID
    ];
    if (!themeClassName) {
      this.removeComposerSvgFilterLayer();
      return;
    }

    composerShellEl.addClass(themeClassName);

    const svgFilterSettings = this.host.getInputPanelGlassRefractionSvgFilterSettings();
    const activeSvgFilterPreset = svgFilterSettings.preset;
    const activeSvgFilterScale = this.getActiveInputPanelGlassRefractionSvgFilterScale();
    if (activeSvgFilterPreset === 'none' || activeSvgFilterScale <= 0) {
      this.removeComposerSvgFilterLayer();
      return;
    }

    ensureComposerGlassSvgDefs(svgFilterSettings);
    this.ensureComposerSvgFilterLayer();
    composerShellEl.addClass(INPUT_PANEL_SVG_FILTER_CLASS_BY_ID[activeSvgFilterPreset]);
  }

  destroy(): void {
    this.unmountLiquidGlassAdapter();
    this.removeComposerSvgFilterLayer();
  }

  logDiagnosticsEntry(label: string, payload: unknown): void {
    const serializedPayload = this.host.stringifyLogPayload(payload);
    const fingerprint = `${label}:${serializedPayload}`;
    if (this.lastLiquidGlassDiagnosticsFingerprint === fingerprint) {
      return;
    }

    this.lastLiquidGlassDiagnosticsFingerprint = fingerprint;
    logger.debug(`${label}: ${serializedPayload}`);
  }

  private getLiquidGlassAdapterId(themeId: InputPanelThemeId): LiquidGlassAdapterId | null {
    switch (themeId) {
      case 'liquid-glass-shuding':
        return 'shuding';
      case 'liquid-glass-nikdelvin':
        return 'nikdelvin';
      default:
        return null;
    }
  }

  private getActiveInputPanelGlassRefractionSvgFilterScale(): number {
    switch (this.host.getInputPanelGlassRefractionSvgFilterSettings().preset) {
      case 'subtle':
        return this.host.getInputPanelGlassRefractionSvgFilterSettings().subtleScale;
      case 'strong':
        return this.host.getInputPanelGlassRefractionSvgFilterSettings().strongScale;
      default:
        return 0;
    }
  }

  private ensureComposerGlassSvgRoot(): SVGSVGElement {
    return ensureComposerGlassSvgRootElement();
  }

  private buildLiquidGlassMountContext(): GlassMountContext | null {
    const composerShellEl = this.host.getComposerShellEl();
    const inputWrapperEl = this.host.getInputWrapperEl();
    if (!composerShellEl || !inputWrapperEl) {
      return null;
    }

    const filterLayerEl = this.ensureComposerSvgFilterLayer();
    if (!filterLayerEl) {
      return null;
    }

    return {
      shellEl: composerShellEl,
      contentEl: inputWrapperEl,
      svgRootEl: this.ensureComposerGlassSvgRoot(),
      filterLayerEl,
      resolveAssetUrl: (relativePath: string) => this.host.resolveAssetUrl(relativePath),
    };
  }

  private ensureComposerSvgFilterLayer(): HTMLElement | null {
    const composerShellEl = this.host.getComposerShellEl();
    if (!composerShellEl) {
      return null;
    }

    if (this.composerSvgFilterLayerEl?.isConnected) {
      return this.composerSvgFilterLayerEl;
    }

    const layerEl = document.createElement('div');
    layerEl.className = 'opencodian-composer-svg-filter-layer';
    composerShellEl.insertBefore(layerEl, composerShellEl.firstChild);
    this.composerSvgFilterLayerEl = layerEl;
    return layerEl;
  }

  private removeComposerSvgFilterLayer(): void {
    this.composerSvgFilterLayerEl?.remove();
    this.composerSvgFilterLayerEl = null;
  }

  private unmountLiquidGlassAdapter(): void {
    if (!this.activeLiquidGlassAdapter) {
      return;
    }

    const ctx = this.buildLiquidGlassMountContext();
    if (ctx) {
      this.activeLiquidGlassAdapter.unmount(ctx);
    }

    this.activeLiquidGlassAdapter = null;
  }

  private scheduleLiquidGlassDiagnostics(adapterId: LiquidGlassAdapterId | null): void {
    if (!adapterId || !this.host.isDebugLoggingEnabled()) {
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        this.logLiquidGlassDiagnostics(adapterId);
      });
    });
  }

  private logLiquidGlassDiagnostics(adapterId: LiquidGlassAdapterId): void {
    const shellEl = this.host.getComposerShellEl();
    if (!shellEl || !this.composerSvgFilterLayerEl) {
      this.logDiagnosticsEntry('Liquid glass diagnostics skipped', {
        adapterId,
        reason: 'missing-shell-or-filter-layer',
      });
      return;
    }

    const filterLayerEl = this.composerSvgFilterLayerEl;
    const shellRect = shellEl.getBoundingClientRect();
    const filterRect = filterLayerEl.getBoundingClientRect();
    const filterComputed = window.getComputedStyle(filterLayerEl);
    const shellComputed = window.getComputedStyle(shellEl);
    const messagesEl = this.host.getMessagesContainerEl();
    const chatContainerEl = this.host.getChatContainerEl();
    const inlineFilter = filterLayerEl.style.getPropertyValue('filter');
    const inlineBackdropFilter = filterLayerEl.style.getPropertyValue('backdrop-filter');
    const backdropPointSamples = this.collectLiquidGlassBackdropPointSamples(shellEl);
    const backdropOverlap = this.collectLiquidGlassBackdropOverlapDiagnostics(shellEl);
    const filterLayerAncestorChain = this.collectLiquidGlassAncestorChain(filterLayerEl, chatContainerEl);
    const payload = {
      adapterId,
      themeId: this.host.getInputPanelTheme(),
      adapterSettings: this.host.getLiquidGlassAdapterSettings(adapterId),
      shellRect: {
        width: Math.round(shellRect.width),
        height: Math.round(shellRect.height),
      },
      filterRect: {
        width: Math.round(filterRect.width),
        height: Math.round(filterRect.height),
      },
      shellStyles: {
        isolation: shellComputed.isolation,
        transform: shellComputed.transform,
        borderRadius: shellComputed.borderRadius,
      },
      filterLayerStyles: {
        inlineFilter,
        computedFilter: filterComputed.filter,
        inlineBackdropFilter,
        computedBackdropFilter:
          filterComputed.getPropertyValue('backdrop-filter')
          || filterComputed.getPropertyValue('-webkit-backdrop-filter'),
        backgroundColor: filterComputed.backgroundColor,
        opacity: filterComputed.opacity,
      },
      messagesMetrics: messagesEl
        ? {
            scrollTop: Math.round(messagesEl.scrollTop),
            scrollHeight: Math.round(messagesEl.scrollHeight),
            clientHeight: Math.round(messagesEl.clientHeight),
            paddingBottom: window.getComputedStyle(messagesEl).paddingBottom,
          }
        : null,
      composerStackHeight: chatContainerEl?.style.getPropertyValue('--opencodian-composer-stack-height') ?? '',
      backdropPointSamples,
      backdropOverlap,
      filterLayerAncestorChain,
    };

    this.logDiagnosticsEntry('Liquid glass diagnostics', payload);
  }

  private describeLiquidGlassDiagnosticElement(
    el: Element | null,
  ): LiquidGlassDiagnosticElementDescriptor | null {
    if (!el) {
      return null;
    }

    const tagName = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : 'unknown';
    const classNames = Array.from(el.classList ?? []).slice(0, 6);
    const htmlEl = el instanceof HTMLElement ? el : null;
    const messageEl = htmlEl?.closest<HTMLElement>('.opencodian-message') ?? null;
    const previewSource = el instanceof HTMLImageElement
      ? (el.getAttribute('alt') ?? el.getAttribute('src') ?? '')
      : (htmlEl?.textContent ?? '');

    return {
      tag: tagName,
      id: 'id' in el && typeof el.id === 'string' && el.id ? el.id : null,
      classes: classNames,
      messageId: messageEl?.dataset.messageId ?? null,
      role: htmlEl?.getAttribute('role') ?? null,
      textPreview: previewSource ? this.host.getLogPreview(previewSource, 80) : '',
    };
  }

  private getLiquidGlassRectIntersectionArea(a: DOMRect, b: DOMRect): number {
    const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (width <= 0 || height <= 0) {
      return 0;
    }

    return width * height;
  }

  private collectLiquidGlassBackdropPointSamples(
    shellEl: HTMLElement,
  ): LiquidGlassBackdropPointSample[] {
    if (typeof document.elementsFromPoint !== 'function') {
      return [];
    }

    const shellRect = shellEl.getBoundingClientRect();
    if (shellRect.width <= 0 || shellRect.height <= 0) {
      return [];
    }

    const insetX = Math.max(8, Math.min(24, shellRect.width * 0.18));
    const insetY = Math.max(8, Math.min(24, shellRect.height * 0.18));
    const samplePoints = [
      { point: 'top-left', x: shellRect.left + insetX, y: shellRect.top + insetY },
      { point: 'top-center', x: shellRect.left + shellRect.width / 2, y: shellRect.top + insetY },
      { point: 'top-right', x: shellRect.right - insetX, y: shellRect.top + insetY },
      { point: 'center', x: shellRect.left + shellRect.width / 2, y: shellRect.top + shellRect.height / 2 },
      { point: 'bottom-center', x: shellRect.left + shellRect.width / 2, y: shellRect.bottom - insetY },
    ];

    return samplePoints.map((sample) => {
      const x = Math.max(0, Math.min(window.innerWidth - 1, Math.round(sample.x)));
      const y = Math.max(0, Math.min(window.innerHeight - 1, Math.round(sample.y)));
      const underlayChain = document
        .elementsFromPoint(x, y)
        .filter((candidate) => !shellEl.contains(candidate) && !candidate.contains(shellEl))
        .slice(0, 6)
        .map((candidate) => this.describeLiquidGlassDiagnosticElement(candidate))
        .filter((candidate): candidate is LiquidGlassDiagnosticElementDescriptor => candidate !== null);

      return {
        point: sample.point,
        x,
        y,
        underlayChain,
      };
    });
  }

  private collectLiquidGlassBackdropOverlapDiagnostics(
    shellEl: HTMLElement,
  ): LiquidGlassBackdropOverlapDiagnostics | null {
    const messagesShellEl = this.host.getMessagesShellEl();
    if (!messagesShellEl) {
      return null;
    }

    const shellRect = shellEl.getBoundingClientRect();
    const shellArea = Math.max(1, shellRect.width * shellRect.height);
    const overlapCandidates = Array.from(
      messagesShellEl.querySelectorAll<HTMLElement>(
        '.opencodian-message, .opencodian-chat-notice-card, .opencodian-tool-use, .opencodian-message img, .opencodian-message pre, .opencodian-message table',
      ),
    );
    const intersectingElements = overlapCandidates
      .map((candidate) => {
        const rect = candidate.getBoundingClientRect();
        const overlapArea = this.getLiquidGlassRectIntersectionArea(shellRect, rect);
        return { candidate, rect, overlapArea };
      })
      .filter((entry) => entry.overlapArea > 0)
      .sort((a, b) => b.overlapArea - a.overlapArea)
      .slice(0, 5)
      .map((entry) => ({
        overlapArea: Math.round(entry.overlapArea),
        overlapPercentOfShell: Number(((entry.overlapArea / shellArea) * 100).toFixed(2)),
        element: this.describeLiquidGlassDiagnosticElement(entry.candidate),
      }));

    const structuralContentElements = Array.from(
      messagesShellEl.querySelectorAll<HTMLElement>(
        '.opencodian-turn, .opencodian-chat-notice-card, .opencodian-tool-use',
      ),
    );
    let lastContentBottom = Number.NEGATIVE_INFINITY;
    structuralContentElements.forEach((candidate) => {
      const rect = candidate.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      lastContentBottom = Math.max(lastContentBottom, rect.bottom);
    });

    return {
      shellArea: Math.round(shellArea),
      intersectingElementCount: intersectingElements.length,
      topIntersectingElements: intersectingElements,
      lastContentBottom: Number.isFinite(lastContentBottom) ? Math.round(lastContentBottom) : null,
      shellTop: Math.round(shellRect.top),
      gapAboveShellFromLastContentPx:
        Number.isFinite(lastContentBottom)
          ? Math.round(shellRect.top - lastContentBottom)
          : null,
    };
  }

  private collectLiquidGlassAncestorChain(
    startEl: HTMLElement,
    stopEl?: HTMLElement | null,
  ): LiquidGlassAncestorDiagnostic[] {
    const chain: LiquidGlassAncestorDiagnostic[] = [];
    let current: HTMLElement | null = startEl;
    let depth = 0;

    while (current && depth < 8) {
      const computed = window.getComputedStyle(current);
      chain.push({
        depth,
        element: this.describeLiquidGlassDiagnosticElement(current),
        position: computed.position,
        zIndex: computed.zIndex,
        overflow: computed.overflow,
        isolation: computed.isolation,
        transform: computed.transform,
        filter: computed.filter,
        backdropFilter:
          computed.getPropertyValue('backdrop-filter')
          || computed.getPropertyValue('-webkit-backdrop-filter'),
        opacity: computed.opacity,
        contain: computed.contain,
        mixBlendMode: computed.mixBlendMode,
        pointerEvents: computed.pointerEvents,
      });

      if (stopEl && current === stopEl) {
        break;
      }

      current = current.parentElement;
      depth += 1;
    }

    return chain;
  }
}
