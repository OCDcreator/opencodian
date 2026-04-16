import type {
  InputPanelActionButtonStyleId,
  InputPanelGlassRefractionSvgFilterPresetId,
  InputPanelGlassRefractionSvgFilterSettings,
  InputPanelThemeId,
  LiquidGlassAdapterId,
} from '../../../core/types';
import { getLiquidGlassAdapterIdForInputPanelTheme } from '../../../core/types';
import {
  getGlassAdapter,
  type GlassAdapterSettingsValue,
  type GlassEffectAdapter,
  type GlassMountContext,
} from '../../../utils/glass';

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
const INPUT_PANEL_SVG_FILTER_CLASS_BY_ID: Record<
  Exclude<InputPanelGlassRefractionSvgFilterPresetId, 'none'>,
  string
> = {
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

export interface InputPanelThemeRuntimeHost {
  getComposerShellEl(): HTMLElement | null;
  getInputWrapperEl(): HTMLElement | null;
  getInputPanelTheme(): InputPanelThemeId;
  getInputActionButtonStyle(): InputPanelActionButtonStyleId;
  getInputPanelGlassRefractionSvgFilterSettings(): InputPanelGlassRefractionSvgFilterSettings;
  getLiquidGlassAdapterSettings(
    adapterId: LiquidGlassAdapterId,
  ): Record<string, GlassAdapterSettingsValue>;
  resolveAssetUrl(relativePath: string): string | null;
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

export class InputPanelThemeRuntime {
  private composerSvgFilterLayerEl: HTMLElement | null = null;
  private activeLiquidGlassAdapter: GlassEffectAdapter | null = null;

  constructor(private readonly host: InputPanelThemeRuntimeHost) {}

  syncAppearanceState(): LiquidGlassAdapterId | null {
    this.applyActionButtonStyleState();
    return this.applyThemeState();
  }

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

  applyThemeState(): LiquidGlassAdapterId | null {
    const composerShellEl = this.host.getComposerShellEl();
    if (!composerShellEl) {
      return null;
    }

    this.resetComposerShellThemeState(composerShellEl);

    const inputPanelTheme = this.host.getInputPanelTheme();
    if (inputPanelTheme === 'preset') {
      this.unmountLiquidGlassAdapter();
      this.removeComposerSvgFilterLayer();
      return null;
    }

    const liquidGlassAdapterId = getLiquidGlassAdapterIdForInputPanelTheme(inputPanelTheme);
    if (liquidGlassAdapterId) {
      return this.applyLiquidGlassTheme(composerShellEl, liquidGlassAdapterId);
    }

    this.unmountLiquidGlassAdapter();
    return this.applyGlassRefractionTheme(composerShellEl, inputPanelTheme);
  }

  destroy(): void {
    this.unmountLiquidGlassAdapter();
    this.removeComposerSvgFilterLayer();
  }

  getComposerSvgFilterLayerEl(): HTMLElement | null {
    if (!this.composerSvgFilterLayerEl?.isConnected) {
      return null;
    }

    return this.composerSvgFilterLayerEl;
  }

  private resetComposerShellThemeState(composerShellEl: HTMLElement): void {
    for (const className of INPUT_PANEL_THEME_CLASS_NAMES) {
      composerShellEl.removeClass(className);
    }
    for (const className of INPUT_PANEL_SVG_FILTER_CLASS_NAMES) {
      composerShellEl.removeClass(className);
    }
  }

  private applyLiquidGlassTheme(
    composerShellEl: HTMLElement,
    adapterId: LiquidGlassAdapterId,
  ): LiquidGlassAdapterId | null {
    composerShellEl.addClass('opencodian-composer-shell--liquid-glass');

    const adapter = getGlassAdapter(adapterId);
    const ctx = this.buildLiquidGlassMountContext();
    if (!adapter || !ctx) {
      this.unmountLiquidGlassAdapter();
      return null;
    }

    const adapterSettings = this.host.getLiquidGlassAdapterSettings(adapterId);
    if (this.activeLiquidGlassAdapter !== adapter) {
      this.unmountLiquidGlassAdapter();
      adapter.mount(ctx, adapterSettings);
      this.activeLiquidGlassAdapter = adapter;
    } else {
      adapter.updateSettings?.(ctx, adapterSettings);
    }

    return adapterId;
  }

  private applyGlassRefractionTheme(
    composerShellEl: HTMLElement,
    inputPanelTheme: InputPanelThemeId,
  ): LiquidGlassAdapterId | null {
    const themeClassName = INPUT_PANEL_THEME_CLASS_BY_ID[
      inputPanelTheme as keyof typeof INPUT_PANEL_THEME_CLASS_BY_ID
    ];
    if (!themeClassName) {
      this.removeComposerSvgFilterLayer();
      return null;
    }

    composerShellEl.addClass(themeClassName);

    const svgFilterSettings = this.host.getInputPanelGlassRefractionSvgFilterSettings();
    const activeSvgFilterPreset = svgFilterSettings.preset;
    const activeSvgFilterScale = this.getActiveInputPanelGlassRefractionSvgFilterScale(
      svgFilterSettings,
    );
    if (activeSvgFilterPreset === 'none' || activeSvgFilterScale <= 0) {
      this.removeComposerSvgFilterLayer();
      return null;
    }

    ensureComposerGlassSvgDefs(svgFilterSettings);
    this.ensureComposerSvgFilterLayer();
    composerShellEl.addClass(INPUT_PANEL_SVG_FILTER_CLASS_BY_ID[activeSvgFilterPreset]);
    return null;
  }

  private getActiveInputPanelGlassRefractionSvgFilterScale(
    svgFilterSettings: InputPanelGlassRefractionSvgFilterSettings,
  ): number {
    switch (svgFilterSettings.preset) {
      case 'subtle':
        return svgFilterSettings.subtleScale;
      case 'strong':
        return svgFilterSettings.strongScale;
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
}
