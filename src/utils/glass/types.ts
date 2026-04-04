export interface GlassMountContext {
  shellEl: HTMLElement;
  contentEl: HTMLElement;
  svgRootEl: SVGSVGElement;
  filterLayerEl: HTMLElement;
  resolveAssetUrl?: (relativePath: string) => string | null;
}

export interface GlassParamDef {
  key: string;
  labelKey: string;
  descKey?: string;
  type: 'number' | 'select' | 'text' | 'toggle';
  sectionLabelKey?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label?: string; labelKey?: string }[];
  defaultValue: number | string | boolean;
}

export type GlassAdapterSettingsValue = number | string | boolean;

export interface GlassEffectAdapter {
  readonly id: 'shuding' | 'nikdelvin' | 'shudingDiamond';
  readonly displayName: string;
  readonly description: string;
  readonly paramDefs: readonly GlassParamDef[];
  mount(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void;
  unmount(ctx: GlassMountContext): void;
  updateSettings?(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void;
}
