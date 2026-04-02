import type { GlassEffectAdapter } from '../types';

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
      defaultValue: 10,
    },
    {
      key: 'blurAmount',
      labelKey: 'settings.style.input.liquidGlass.shuding.blurAmount',
      type: 'number',
      min: 0,
      max: 4,
      step: 0.05,
      unit: '',
      defaultValue: 0.25,
    },
  ],
  mount(): void {},
  unmount(): void {},
};
