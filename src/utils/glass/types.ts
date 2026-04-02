export interface GlassMountContext {
  shellEl: HTMLElement;
  contentEl: HTMLElement;
  svgRootEl: SVGSVGElement;
  filterLayerEl: HTMLElement;
}

export interface GlassParamDef {
  key: string;
  labelKey: string;
  type: 'number' | 'select';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
  defaultValue: number | string;
}

export type GlassAdapterSettingsValue = number | string;

export interface GlassEffectAdapter {
  readonly id: 'shuding' | 'nikdelvin' | 'rdev';
  readonly displayName: string;
  readonly description: string;
  readonly paramDefs: readonly GlassParamDef[];
  mount(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void;
  unmount(ctx: GlassMountContext): void;
  updateSettings?(ctx: GlassMountContext, settings: Record<string, GlassAdapterSettingsValue>): void;
}
