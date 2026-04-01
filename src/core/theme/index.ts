import {
  type ChatAppearanceSettings,
  getDefaultChatAppearanceSettings,
  normalizeChatAppearanceSettings,
  normalizePartialChatAppearanceSettings,
  type PartialChatAppearanceSettings,
  type ThemePresetDefinition,
  type ThemePresetId,
  type ThemeSettings,
} from '../types';

const GLASS_CLASSIC_APPEARANCE = getDefaultChatAppearanceSettings();

const GLASS_APPEARANCE = normalizeChatAppearanceSettings({
  user: {
    radius: 17,
    blur: 14,
    shadowBlur: 30,
  },
  assistant: {
    radius: 16,
    backgroundOpacity: 68,
    blur: 12,
    shadowBlur: 26,
  },
  input: {
    radius: 14,
    backgroundOpacity: 72,
    blur: 20,
    shadowBlur: 30,
  },
});

const FLAT_APPEARANCE = normalizeChatAppearanceSettings({
  sticky: {
    maskBlur: 0,
  },
  user: {
    radius: 10,
    tailRadius: 2,
    blur: 0,
    shadowBlur: 0,
  },
  assistant: {
    radius: 10,
    backgroundOpacity: 92,
    blur: 0,
    shadowBlur: 0,
  },
  input: {
    radius: 10,
    backgroundOpacity: 92,
    blur: 0,
    shadowBlur: 0,
  },
  scrollbar: {
    width: 9,
    radius: 8,
    trackOpacity: 28,
    thumbOpacity: 76,
    thumbHoverOpacity: 88,
    edgePadding: 1,
    shadowOpacity: 0,
  },
});

const SOFT_APPEARANCE = normalizeChatAppearanceSettings({
  layout: {
    messagesPaddingTop: 14,
    messagesPaddingX: 18,
  },
  sticky: {
    headerGap: 8,
    maskHeight: 22,
    maskBlur: 18,
  },
  user: {
    radius: 22,
    tailRadius: 10,
    blur: 10,
    shadowBlur: 22,
  },
  assistant: {
    radius: 20,
    backgroundOpacity: 76,
    blur: 8,
    shadowBlur: 20,
  },
  input: {
    radius: 20,
    backgroundOpacity: 78,
    blur: 14,
    shadowBlur: 18,
  },
  scrollbar: {
    width: 7,
    radius: 999,
    trackOpacity: 18,
    thumbOpacity: 62,
    thumbHoverOpacity: 74,
    edgePadding: 3,
    shadowOpacity: 30,
  },
});

const SHARP_APPEARANCE = normalizeChatAppearanceSettings({
  layout: {
    messagesPaddingTop: 10,
    messagesPaddingX: 14,
  },
  sticky: {
    headerGap: 4,
    maskHeight: 16,
    maskBlur: 10,
  },
  user: {
    radius: 8,
    tailRadius: 0,
    blur: 2,
    shadowBlur: 18,
  },
  assistant: {
    radius: 8,
    backgroundOpacity: 86,
    blur: 2,
    shadowBlur: 14,
  },
  input: {
    radius: 8,
    backgroundOpacity: 88,
    blur: 4,
    shadowBlur: 14,
  },
  scrollbar: {
    width: 8,
    radius: 4,
    trackOpacity: 30,
    thumbOpacity: 78,
    thumbHoverOpacity: 90,
    edgePadding: 1,
    shadowOpacity: 22,
  },
});

const BUILTIN_THEME_PRESETS = [
  {
    id: 'glass-classic',
    name: 'OpenCodian Classic',
    styleId: 'glass',
    schemeName: 'Classic',
    containerClass: 'opencodian-theme-glass',
    cssVariables: {},
    appearance: GLASS_CLASSIC_APPEARANCE,
  },
  {
    id: 'glass-warm',
    name: 'Glass Warm',
    styleId: 'glass',
    schemeName: 'Warm',
    containerClass: 'opencodian-theme-glass',
    cssVariables: {
      '--opencodian-accent': '#f59e0b',
      '--opencodian-accent-hover': '#f97316',
      '--opencodian-accent-contrast': '#1f1403',
      '--opencodian-accent-text': '#f59e0b',
    },
    appearance: GLASS_APPEARANCE,
  },
  {
    id: 'glass-mint',
    name: 'Glass Mint',
    styleId: 'glass',
    schemeName: 'Mint',
    containerClass: 'opencodian-theme-glass',
    cssVariables: {
      '--opencodian-accent': '#14b8a6',
      '--opencodian-accent-hover': '#0f766e',
      '--opencodian-accent-contrast': '#e6fffb',
      '--opencodian-accent-text': '#14b8a6',
    },
    appearance: GLASS_APPEARANCE,
  },
  {
    id: 'flat-slate',
    name: 'Flat Slate',
    styleId: 'flat',
    schemeName: 'Slate',
    containerClass: 'opencodian-theme-flat',
    cssVariables: {
      '--opencodian-accent': '#475569',
      '--opencodian-accent-hover': '#334155',
      '--opencodian-accent-contrast': '#f8fafc',
      '--opencodian-accent-text': '#475569',
    },
    appearance: FLAT_APPEARANCE,
  },
  {
    id: 'flat-ocean',
    name: 'Flat Ocean',
    styleId: 'flat',
    schemeName: 'Ocean',
    containerClass: 'opencodian-theme-flat',
    cssVariables: {
      '--opencodian-accent': '#2563eb',
      '--opencodian-accent-hover': '#1d4ed8',
      '--opencodian-accent-contrast': '#eff6ff',
      '--opencodian-accent-text': '#2563eb',
    },
    appearance: FLAT_APPEARANCE,
  },
  {
    id: 'flat-rose',
    name: 'Flat Rose',
    styleId: 'flat',
    schemeName: 'Rose',
    containerClass: 'opencodian-theme-flat',
    cssVariables: {
      '--opencodian-accent': '#e11d48',
      '--opencodian-accent-hover': '#be123c',
      '--opencodian-accent-contrast': '#fff1f2',
      '--opencodian-accent-text': '#e11d48',
    },
    appearance: FLAT_APPEARANCE,
  },
  {
    id: 'soft-neutral',
    name: 'Soft Neutral',
    styleId: 'soft',
    schemeName: 'Neutral',
    containerClass: 'opencodian-theme-soft',
    cssVariables: {
      '--opencodian-accent': '#64748b',
      '--opencodian-accent-hover': '#475569',
      '--opencodian-accent-contrast': '#f8fafc',
      '--opencodian-accent-text': '#64748b',
    },
    appearance: SOFT_APPEARANCE,
  },
  {
    id: 'soft-lavender',
    name: 'Soft Lavender',
    styleId: 'soft',
    schemeName: 'Lavender',
    containerClass: 'opencodian-theme-soft',
    cssVariables: {
      '--opencodian-accent': '#8b5cf6',
      '--opencodian-accent-hover': '#7c3aed',
      '--opencodian-accent-contrast': '#f5f3ff',
      '--opencodian-accent-text': '#8b5cf6',
    },
    appearance: SOFT_APPEARANCE,
  },
  {
    id: 'soft-latte',
    name: 'Soft Latte',
    styleId: 'soft',
    schemeName: 'Latte',
    containerClass: 'opencodian-theme-soft',
    cssVariables: {
      '--opencodian-accent': '#a16207',
      '--opencodian-accent-hover': '#854d0e',
      '--opencodian-accent-contrast': '#fffbeb',
      '--opencodian-accent-text': '#a16207',
    },
    appearance: SOFT_APPEARANCE,
  },
  {
    id: 'sharp-graphite',
    name: 'Sharp Graphite',
    styleId: 'sharp',
    schemeName: 'Graphite',
    containerClass: 'opencodian-theme-sharp',
    cssVariables: {
      '--opencodian-accent': '#0f172a',
      '--opencodian-accent-hover': '#020617',
      '--opencodian-accent-contrast': '#f8fafc',
      '--opencodian-accent-text': '#0f172a',
    },
    appearance: SHARP_APPEARANCE,
  },
  {
    id: 'sharp-neon',
    name: 'Sharp Neon',
    styleId: 'sharp',
    schemeName: 'Neon',
    containerClass: 'opencodian-theme-sharp',
    cssVariables: {
      '--opencodian-accent': '#06b6d4',
      '--opencodian-accent-hover': '#d946ef',
      '--opencodian-accent-contrast': '#06131a',
      '--opencodian-accent-text': '#06b6d4',
    },
    appearance: SHARP_APPEARANCE,
  },
  {
    id: 'sharp-amber',
    name: 'Sharp Amber',
    styleId: 'sharp',
    schemeName: 'Amber',
    containerClass: 'opencodian-theme-sharp',
    cssVariables: {
      '--opencodian-accent': '#f59e0b',
      '--opencodian-accent-hover': '#d97706',
      '--opencodian-accent-contrast': '#1c1201',
      '--opencodian-accent-text': '#f59e0b',
    },
    appearance: SHARP_APPEARANCE,
  },
] satisfies ThemePresetDefinition[];

export const THEME_STYLE_CONTAINER_CLASSES = Array.from(new Set(
  BUILTIN_THEME_PRESETS.map((preset) => preset.containerClass),
));

export const THEME_PRESET_CSS_VARIABLE_NAMES = Array.from(new Set(
  BUILTIN_THEME_PRESETS.flatMap((preset) => Object.keys(preset.cssVariables)),
));

const THEME_PRESET_MAP = new Map<ThemePresetId, ThemePresetDefinition>(
  BUILTIN_THEME_PRESETS.map((preset) => [preset.id, preset]),
);

export function getBuiltinThemePresets(): ThemePresetDefinition[] {
  return BUILTIN_THEME_PRESETS.map((preset) => ({
    ...preset,
    cssVariables: { ...preset.cssVariables },
    appearance: normalizeChatAppearanceSettings(preset.appearance),
  }));
}

export function getThemePresetDefinition(presetId: ThemePresetId | null | undefined): ThemePresetDefinition | null {
  if (!presetId) {
    return null;
  }

  const preset = THEME_PRESET_MAP.get(presetId);
  if (!preset) {
    return null;
  }

  return {
    ...preset,
    cssVariables: { ...preset.cssVariables },
    appearance: normalizeChatAppearanceSettings(preset.appearance),
  };
}

export function resolveThemeChatAppearance(theme: ThemeSettings): ChatAppearanceSettings {
  const preset = getThemePresetDefinition(theme.activePresetId);
  if (!preset) {
    return getDefaultChatAppearanceSettings();
  }

  return normalizeChatAppearanceSettings(mergePartialChatAppearanceSettings(
    preset.appearance,
    theme.customAppearanceOverrides,
  ));
}

export function mergePartialChatAppearanceSettings(
  base: ChatAppearanceSettings,
  overrides?: PartialChatAppearanceSettings | null,
): ChatAppearanceSettings {
  return normalizeChatAppearanceSettings({
    layout: {
      ...base.layout,
      ...(overrides?.layout ?? {}),
    },
    sticky: {
      ...base.sticky,
      ...(overrides?.sticky ?? {}),
    },
    user: {
      ...base.user,
      ...(overrides?.user ?? {}),
    },
    assistant: {
      ...base.assistant,
      ...(overrides?.assistant ?? {}),
    },
    input: {
      ...base.input,
      ...(overrides?.input ?? {}),
    },
    scrollbar: {
      ...base.scrollbar,
      ...(overrides?.scrollbar ?? {}),
    },
    advanced: {
      ...base.advanced,
      ...(overrides?.advanced ?? {}),
    },
  });
}

export function getThemeAppearanceOverridesFromBase(
  base: ChatAppearanceSettings,
  current: ChatAppearanceSettings,
): PartialChatAppearanceSettings {
  const normalizedBase = normalizeChatAppearanceSettings(base);
  const normalizedCurrent = normalizeChatAppearanceSettings(current);
  const overrides: PartialChatAppearanceSettings = {};

  const layout = diffObject(normalizedBase.layout, normalizedCurrent.layout);
  if (layout) {
    overrides.layout = layout;
  }

  const sticky = diffObject(normalizedBase.sticky, normalizedCurrent.sticky);
  if (sticky) {
    overrides.sticky = sticky;
  }

  const user = diffObject(normalizedBase.user, normalizedCurrent.user);
  if (user) {
    overrides.user = user;
  }

  const assistant = diffObject(normalizedBase.assistant, normalizedCurrent.assistant);
  if (assistant) {
    overrides.assistant = assistant;
  }

  const input = diffObject(normalizedBase.input, normalizedCurrent.input);
  if (input) {
    overrides.input = input;
  }

  const scrollbar = diffObject(normalizedBase.scrollbar, normalizedCurrent.scrollbar);
  if (scrollbar) {
    overrides.scrollbar = scrollbar;
  }

  const advanced = diffObject(normalizedBase.advanced, normalizedCurrent.advanced);
  if (advanced) {
    overrides.advanced = advanced;
  }

  return normalizePartialChatAppearanceSettings(overrides);
}

export function areChatAppearanceSettingsEqual(
  left: ChatAppearanceSettings,
  right: ChatAppearanceSettings,
): boolean {
  return JSON.stringify(normalizeChatAppearanceSettings(left)) === JSON.stringify(normalizeChatAppearanceSettings(right));
}

export function hasThemeAppearanceOverrides(theme: ThemeSettings): boolean {
  const normalized = normalizePartialChatAppearanceSettings(theme.customAppearanceOverrides);
  return Object.values(normalized).some((value) => value && Object.keys(value).length > 0);
}

function diffObject<T extends Record<string, unknown>>(base: T, current: T): Partial<T> | undefined {
  const next: Partial<T> = {};

  for (const key of Object.keys(base) as Array<keyof T>) {
    if (current[key] !== base[key]) {
      next[key] = current[key];
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
