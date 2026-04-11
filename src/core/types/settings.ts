/**
 * Settings type definitions for OpenCodian
 */

/** Permission mode for tool execution */
export type PermissionMode = 'yolo' | 'plan' | 'normal';

/** Effort level for adaptive thinking models */
export type EffortLevel = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/** Thinking budget for custom models */
export type ThinkingBudget = 0 | 1024 | 4096 | 8192 | 16384;

export function normalizeEffortLevel(value: unknown): EffortLevel {
  switch (value) {
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return value;
    case 'max':
      return 'xhigh';
    default:
      return 'high';
  }
}

export function normalizeThinkingBudget(value: unknown): ThinkingBudget {
  if (value === 'off') return 0;
  if (value === 'low') return 1024;
  if (value === 'medium') return 4096;
  if (value === 'high') return 8192;
  if (value === 'xhigh') return 16384;

  switch (value) {
    case 0:
    case 1024:
    case 4096:
    case 8192:
    case 16384:
      return value;
    default:
      return 4096;
  }
}

export function normalizeTabBarPosition(value: unknown): TabBarPosition {
  switch (value) {
    case 'input':
    case 'header':
    case 'below-header':
      return value;
    default:
      return 'below-header';
  }
}

export function normalizeBelowHeaderTabBarLayout(value: unknown): BelowHeaderTabBarLayout {
  switch (value) {
    case 'grid':
    case 'vertical':
      return value;
    default:
      return 'grid';
  }
}

/** User decision from the approval modal */
export type ApprovalDecision = 'allow' | 'allow-always' | 'deny' | 'cancel';

/** Tab bar position setting */
export type TabBarPosition = 'input' | 'header' | 'below-header';

/** Tab layout when mounted below the header */
export type BelowHeaderTabBarLayout = 'grid' | 'vertical';

/** Chat scroll effect */
export type ChatScrollMode = 'natural' | 'sticky-basic' | 'sticky-mask';

/** Input panel visual theme */
export type InputPanelThemeId =
  | 'preset'
  | 'glass-refraction-glass'
  | 'glass-refraction-card'
  | 'glass-refraction-pill'
  | 'liquid-glass-shuding'
  | 'liquid-glass-nikdelvin';

/** Composer action button style */
export type InputPanelActionButtonStyleId = 'default' | 'etched';

export type LiquidGlassAdapterId = 'shuding' | 'nikdelvin' | 'shudingDiamond';

export type ChatAppearanceBackgroundFitMode = 'cover' | 'contain' | 'fit-width' | 'fit-height';

/** Server connection mode */
export type ServerMode = 'local' | 'remote';

export const OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST = '127.0.0.1';
export const OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT = 4196;
export const OPENCODE_LEGACY_LOCAL_DEFAULT_PORT = 4096;

/** Server auth type */
export type ServerAuthType = 'none' | 'basic' | 'bearer';

/** Model source mode */
export type ModelSourceMode = 'merge' | 'local' | 'server';

/** Conversation title generation mode */
export type TitleMode = 'default' | 'ai';

/** OpenCode question card display mode */
export type QuestionDisplayMode = 'all' | 'single';

/** Where pending OpenCode question cards should be shown */
export type QuestionCardPosition = 'inline' | 'above_input';

/** Plugin isolation mode for local OpenCode */
export type PluginIsolationMode = 'default' | 'pure';

export function normalizeTitleMode(value: unknown): TitleMode {
  switch (value) {
    case 'ai':
    case 'default':
      return value;
    default:
      return 'default';
  }
}

export function normalizeQuestionDisplayMode(value: unknown): QuestionDisplayMode {
  switch (value) {
    case 'all':
    case 'single':
      return value;
    default:
      return 'all';
  }
}

export function normalizeQuestionCardPosition(value: unknown): QuestionCardPosition {
  switch (value) {
    case 'inline':
    case 'above_input':
      return value;
    default:
      return 'inline';
  }
}

export function normalizeInputPanelThemeId(value: unknown): InputPanelThemeId {
  switch (value) {
    case 'preset':
    case 'glass-refraction-glass':
    case 'glass-refraction-card':
    case 'glass-refraction-pill':
    case 'liquid-glass-shuding':
    case 'liquid-glass-nikdelvin':
      return value;
    case 'liquid-glass-rdev':
      return 'liquid-glass-shuding';
    case 'liquid-diamond-shuding':
      return 'preset';
    default:
      return 'preset';
  }
}

export function normalizeInputPanelActionButtonStyleId(value: unknown): InputPanelActionButtonStyleId {
  switch (value) {
    case 'default':
    case 'etched':
      return value;
    default:
      return 'default';
  }
}

export function normalizeChatAppearanceBackgroundFitMode(value: unknown): ChatAppearanceBackgroundFitMode {
  switch (value) {
    case 'cover':
    case 'contain':
    case 'fit-width':
    case 'fit-height':
      return value;
    default:
      return 'cover';
  }
}

export function normalizePluginIsolationMode(value: unknown): PluginIsolationMode {
  switch (value) {
    case 'pure':
    case 'default':
      return value;
    default:
      return 'default';
  }
}

/** Local server configuration */
export interface LocalServerConfig {
  host: string;
  port: number;
  autoStart: boolean;
}

/** Remote server configuration */
export interface RemoteServerConfig {
  baseUrl: string;
}

/** Server authentication configuration */
export interface ServerAuthConfig {
  type: ServerAuthType;
  username: string;
  password: string;
  token: string;
}

/** Server configuration */
export interface ServerConfig {
  mode: ServerMode;
  local: LocalServerConfig;
  remote: RemoteServerConfig;
  auth: ServerAuthConfig;
}

/** Platform-specific blocked commands */
export interface PlatformBlockedCommands {
  unix: string[];
  windows: string[];
}

/** Platform-specific debug log export paths */
export interface PlatformDebugLogPaths {
  unix: string;
  windows: string;
}

export type ProviderIconEntryType = 'mapped' | 'builtin' | 'url' | 'file';
export type ProviderIconColorMode = 'system' | 'monochrome' | 'color';
export type LobehubIconVariant =
  | 'auto'
  | 'mono'
  | 'color'
  | 'brand'
  | 'brand-color'
  | 'text'
  | 'text-cn'
  | 'text-color'
  | 'combine'
  | 'avatar';
export type StaticLobehubIconVariant = Exclude<LobehubIconVariant, 'auto' | 'combine'>;
export type ProviderIconResolvedFormat = 'svg' | 'png' | 'webp' | 'avatar';

export interface ProviderIconEntry {
  id: string;
  type: ProviderIconEntryType;
  source: string;
  variant?: LobehubIconVariant;
  resolvedVariant?: Exclude<LobehubIconVariant, 'auto'>;
  resolvedFormat?: ProviderIconResolvedFormat;
  mimeType?: string;
  cacheFileName?: string;
  addedAt: number;
  updatedAt?: number;
}

export type ProviderIconLibrary = Record<string, ProviderIconEntry[]>;

export function normalizeProviderIconColorMode(value: unknown): ProviderIconColorMode {
  switch (value) {
    case 'monochrome':
    case 'color':
    case 'system':
      return value;
    default:
      return 'system';
  }
}

export function normalizeLobehubIconVariant(value: unknown): LobehubIconVariant {
  switch (value) {
    case 'auto':
    case 'mono':
    case 'color':
    case 'brand':
    case 'brand-color':
    case 'text':
    case 'text-cn':
    case 'text-color':
    case 'combine':
    case 'avatar':
      return value;
    default:
      return 'auto';
  }
}

export function normalizeProviderIconResolvedFormat(value: unknown): ProviderIconResolvedFormat | undefined {
  switch (value) {
    case 'svg':
    case 'png':
    case 'webp':
    case 'avatar':
      return value;
    default:
      return undefined;
  }
}

const UNIX_BLOCKED_COMMANDS = [
  'rm -rf',
  'chmod 777',
  'chmod -R 777',
];

const WINDOWS_BLOCKED_COMMANDS = [
  'del /s /q',
  'rd /s /q',
  'rmdir /s /q',
  'format',
  'diskpart',
  'Remove-Item -Recurse -Force',
  'Remove-Item -Force -Recurse',
  'Remove-Item -r -fo',
  'Remove-Item -fo -r',
  'Remove-Item -Recurse',
  'Remove-Item -r',
  'ri -Recurse',
  'ri -r',
  'ri -Force',
  'ri -fo',
  'rm -r -fo',
  'rm -Recurse',
  'rm -Force',
  'del -Recurse',
  'del -Force',
  'erase -Recurse',
  'erase -Force',
  'rd -Recurse',
  'rmdir -Recurse',
  'Format-Volume',
  'Clear-Disk',
  'Initialize-Disk',
  'Remove-Partition',
];

export function getDefaultBlockedCommands(): PlatformBlockedCommands {
  return {
    unix: [...UNIX_BLOCKED_COMMANDS],
    windows: [...WINDOWS_BLOCKED_COMMANDS],
  };
}

export function getCurrentPlatformKey(): 'unix' | 'windows' {
  return process.platform === 'win32' ? 'windows' : 'unix';
}

export function getCurrentPlatformBlockedCommands(commands: PlatformBlockedCommands): string[] {
  return commands[getCurrentPlatformKey()];
}

export function getDefaultDebugLogPaths(): PlatformDebugLogPaths {
  return {
    unix: '',
    windows: '',
  };
}

export function getCurrentPlatformDebugLogPath(paths: PlatformDebugLogPaths): string {
  return paths[getCurrentPlatformKey()];
}

export function normalizeProviderIconLibrary(value: unknown): ProviderIconLibrary {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const normalizedLibrary: ProviderIconLibrary = {};

  for (const [providerId, entries] of Object.entries(value as Record<string, unknown>)) {
    if (!providerId.trim() || !Array.isArray(entries)) {
      continue;
    }

    const normalizedEntries = entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const candidate = entry as Partial<ProviderIconEntry>;
      const id = typeof candidate.id === 'string' && candidate.id.trim()
        ? candidate.id.trim()
        : '';
      const source = typeof candidate.source === 'string' && candidate.source.trim()
        ? candidate.source.trim()
        : '';

      if (!id || !source) {
        return [];
      }

      if (
        candidate.type !== 'mapped'
        && candidate.type !== 'builtin'
        && candidate.type !== 'url'
        && candidate.type !== 'file'
      ) {
        return [];
      }

      if (candidate.type === 'builtin' && !/^(lobehub|opencode):[^:\s]+$/i.test(source)) {
        return [];
      }

      return [{
        id,
        type: candidate.type,
        source,
        variant: normalizeLobehubIconVariant(candidate.variant),
        resolvedVariant: candidate.resolvedVariant === undefined
          ? undefined
          : normalizeLobehubIconVariant(candidate.resolvedVariant) === 'auto'
            ? undefined
            : normalizeLobehubIconVariant(candidate.resolvedVariant) as Exclude<LobehubIconVariant, 'auto'>,
        resolvedFormat: normalizeProviderIconResolvedFormat(candidate.resolvedFormat),
        mimeType: typeof candidate.mimeType === 'string' && candidate.mimeType.trim()
          ? candidate.mimeType.trim()
          : undefined,
        cacheFileName: typeof candidate.cacheFileName === 'string' && candidate.cacheFileName.trim()
          ? candidate.cacheFileName.trim()
          : undefined,
        addedAt: typeof candidate.addedAt === 'number' && Number.isFinite(candidate.addedAt)
          ? candidate.addedAt
          : Date.now(),
        updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
          ? candidate.updatedAt
          : undefined,
      } satisfies ProviderIconEntry];
    });

    if (normalizedEntries.length > 0) {
      normalizedLibrary[providerId.trim()] = normalizedEntries;
    }
  }

  return normalizedLibrary;
}

export function normalizeDisabledModelRefs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .flatMap((item) => {
          const slashIndex = item.indexOf('/');
          if (slashIndex <= 0 || slashIndex >= item.length - 1) {
            return [];
          }

          const provider = item.slice(0, slashIndex).trim();
          const model = item.slice(slashIndex + 1).trim();
          if (!provider || !model) {
            return [];
          }

          return [`${provider}/${model}`];
        }),
    ),
  );
}

/**
 * Get blocked commands for the Bash tool.
 *
 * On Windows, the Bash tool runs in a Git Bash/MSYS2 environment but can still
 * invoke Windows commands (e.g., via `cmd /c` or `powershell`), so both Unix
 * and Windows blocklist patterns are merged.
 */
export function getBashToolBlockedCommands(commands: PlatformBlockedCommands): string[] {
  if (process.platform === 'win32') {
    return Array.from(new Set([...commands.unix, ...commands.windows]));
  }
  return getCurrentPlatformBlockedCommands(commands);
}

/** Model provider configuration */
export interface ModelProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface ChatAppearanceLayoutSettings {
  messagesPaddingTop: number;
  messagesPaddingX: number;
}

export interface ChatAppearanceStickySettings {
  headerGap: number;
  maskHeight: number;
  maskBlur: number;
}

export interface ChatAppearanceBackgroundSettings {
  imagePath: string;
  imageMimeType: string;
  imageDisplayName: string;
  fitMode: ChatAppearanceBackgroundFitMode;
  opacity: number;
  blur: number;
  depth: number;
  dim: number;
  edgeFade: number;
  saturation: number;
  brightness: number;
  focusX: number;
  focusY: number;
}

export interface ChatAppearanceUserSettings {
  radius: number;
  tailRadius: number;
  blur: number;
  shadowBlur: number;
  timeFontSize: number;
  timeFontWeight: number;
  timeColor: string;
}

export interface ChatAppearanceAssistantSettings {
  radius: number;
  backgroundOpacity: number;
  blur: number;
  shadowBlur: number;
  metaFontSize: number;
  timeFontSize: number;
  timeFontWeight: number;
  metaColor: string;
  timeColor: string;
  modelIdFontSize: number;
  modelIdFontWeight: number;
  modelIdColor: string;
}

export interface ChatAppearanceInputSettings {
  radius: number;
  backgroundOpacity: number;
  blur: number;
  shadowBlur: number;
  actionButtonStyle: InputPanelActionButtonStyleId;
}

export type InputPanelGlassRefractionVariantId = 'glass' | 'card' | 'pill';

export interface InputPanelGlassRefractionVariantSettings {
  backgroundOpacity: number;
  blur: number;
  saturation: number;
  brightness: number;
}

export interface InputPanelGlassRefractionSettings {
  glass: InputPanelGlassRefractionVariantSettings;
  card: InputPanelGlassRefractionVariantSettings;
  pill: InputPanelGlassRefractionVariantSettings;
}

type PartialInputPanelGlassRefractionSettings = Partial<
  Record<InputPanelGlassRefractionVariantId, Partial<InputPanelGlassRefractionVariantSettings>>
>;

export type InputPanelGlassRefractionSvgFilterPresetId = 'none' | 'subtle' | 'strong';

export interface InputPanelGlassRefractionSvgFilterSettings {
  preset: InputPanelGlassRefractionSvgFilterPresetId;
  subtleScale: number;
  strongScale: number;
}

export interface InputPanelLiquidGlassSettings {
  shuding: Record<string, number | string | boolean>;
  nikdelvin: Record<string, number | string | boolean>;
  shudingDiamond: Record<string, number | string | boolean>;
}

export interface ChatAppearanceScrollbarSettings {
  width: number;
  radius: number;
  trackOpacity: number;
  thumbOpacity: number;
  thumbHoverOpacity: number;
  edgePadding: number;
  shadowOpacity: number;
}

export interface ChatAppearanceAdvancedSettings {
  customCssDeclarations: string;
}

export interface ChatAppearanceSettings {
  layout: ChatAppearanceLayoutSettings;
  sticky: ChatAppearanceStickySettings;
  background: ChatAppearanceBackgroundSettings;
  user: ChatAppearanceUserSettings;
  assistant: ChatAppearanceAssistantSettings;
  input: ChatAppearanceInputSettings;
  scrollbar: ChatAppearanceScrollbarSettings;
  advanced: ChatAppearanceAdvancedSettings;
}

export interface PartialChatAppearanceSettings {
  layout?: Partial<ChatAppearanceLayoutSettings>;
  sticky?: Partial<ChatAppearanceStickySettings>;
  background?: Partial<ChatAppearanceBackgroundSettings>;
  user?: Partial<ChatAppearanceUserSettings>;
  assistant?: Partial<ChatAppearanceAssistantSettings>;
  input?: Partial<ChatAppearanceInputSettings>;
  scrollbar?: Partial<ChatAppearanceScrollbarSettings>;
  advanced?: Partial<ChatAppearanceAdvancedSettings>;
}

export type ThemeStyleId = 'glass' | 'flat' | 'soft' | 'sharp';

export type ThemePresetId =
  | 'glass-classic'
  | 'glass-warm'
  | 'glass-mint'
  | 'flat-slate'
  | 'flat-ocean'
  | 'flat-rose'
  | 'soft-neutral'
  | 'soft-lavender'
  | 'soft-latte'
  | 'sharp-graphite'
  | 'sharp-neon'
  | 'sharp-amber';

export interface ThemePresetDefinition {
  id: ThemePresetId;
  name: string;
  styleId: ThemeStyleId;
  schemeName: string;
  containerClass: string;
  cssVariables: Record<string, string>;
  appearance: ChatAppearanceSettings;
}

export interface ThemeSettings {
  activePresetId: ThemePresetId | null;
  customAppearanceOverrides: PartialChatAppearanceSettings;
}

export function getDefaultChatAppearanceSettings(): ChatAppearanceSettings {
  return {
    layout: {
      messagesPaddingTop: 12,
      messagesPaddingX: 16,
    },
    sticky: {
      headerGap: 6,
      maskHeight: 18,
      maskBlur: 24,
    },
    background: {
      imagePath: '',
      imageMimeType: '',
      imageDisplayName: '',
      fitMode: 'cover',
      opacity: 92,
      blur: 2,
      depth: 8,
      dim: 28,
      edgeFade: 28,
      saturation: 108,
      brightness: 94,
      focusX: 50,
      focusY: 50,
    },
    user: {
      radius: 16,
      tailRadius: 4,
      blur: 12,
      shadowBlur: 28,
      timeFontSize: 11,
      timeFontWeight: 400,
      timeColor: 'var(--text-muted)',
    },
    assistant: {
      radius: 14,
      backgroundOpacity: 72,
      blur: 10,
      shadowBlur: 24,
      metaFontSize: 10,
      timeFontSize: 10,
      timeFontWeight: 400,
      metaColor: 'var(--text-muted)',
      timeColor: 'var(--text-muted)',
      modelIdFontSize: 10,
      modelIdFontWeight: 400,
      modelIdColor: 'var(--text-faint, var(--text-muted))',
    },
    input: {
      radius: 12,
      backgroundOpacity: 72,
      blur: 18,
      shadowBlur: 28,
      actionButtonStyle: 'default',
    },
    scrollbar: {
      width: 8,
      radius: 999,
      trackOpacity: 22,
      thumbOpacity: 68,
      thumbHoverOpacity: 82,
      edgePadding: 2,
      shadowOpacity: 46,
    },
    advanced: {
      customCssDeclarations: '',
    },
  };
}

function normalizeFiniteNumberInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function normalizeFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isValidCssColorValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  if (/^var\(.+\)$/u.test(trimmed)) {
    return true;
  }

  try {
    if (typeof globalThis.CSS?.supports === 'function' && globalThis.CSS.supports('color', trimmed)) {
      return true;
    }
  } catch {
    // Ignore platform-specific CSS parser gaps and fall back to conservative checks below.
  }

  return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/iu.test(trimmed)
    || /^(?:rgb|hsl)a?\(/iu.test(trimmed)
    || /^(?:transparent|currentcolor|inherit|initial|unset)$/iu.test(trimmed);
}

function normalizeCssColorValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return isValidCssColorValue(trimmed) ? trimmed : fallback;
}

function normalizeFontWeightValue(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const rounded = Math.round(value);
  return Math.min(900, Math.max(100, rounded));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function getDefaultInputPanelGlassRefractionSettings(): InputPanelGlassRefractionSettings {
  return {
    glass: {
      backgroundOpacity: 48,
      blur: 26,
      saturation: 170,
      brightness: 108,
    },
    card: {
      backgroundOpacity: 52,
      blur: 20,
      saturation: 150,
      brightness: 100,
    },
    pill: {
      backgroundOpacity: 5,
      blur: 8,
      saturation: 130,
      brightness: 100,
    },
  };
}

export function getDefaultInputPanelGlassRefractionSvgFilterSettings(): InputPanelGlassRefractionSvgFilterSettings {
  return {
    preset: 'none',
    subtleScale: 8,
    strongScale: 16,
  };
}

export function getDefaultInputPanelLiquidGlassSettings(): InputPanelLiquidGlassSettings {
  return {
    shuding: {
      displacementScale: 10,
      blurAmount: 0.25,
      adaptiveSdf: false,
      adaptiveSdfMix: 0,
      rectEdgeRefraction: false,
      rectEdgeRefractionStrength: 0,
      cornerEnhancement: false,
      cornerEnhancementStrength: 0,
      edgeBandWidth: 0,
      barrelDistortion: false,
      barrelStrength: 0,
      topHighlight: false,
      topHighlightOpacity: 0.6,
      innerBorder: false,
      innerBorderOpacity: 0.2,
      bottomShadow: false,
      bottomShadowOpacity: 0.08,
      insetDepthShadow: false,
      insetDepthShadowOpacity: 0.12,
      insetShadowBlur: 10,
      contrastBoost: 1.2,
      brightnessBoost: 1.05,
      saturateBoost: 1.1,
    },
    nikdelvin: {
      depth: 10,
      strength: 100,
      chromaticAberration: 0,
      blur: 0,
      backgroundPreset: 'background',
      color: 'transparent',
      background: '',
      freeze: false,
      noMorph: false,
      button: false,
      inline: false,
      customEffects: false,
    },
    shudingDiamond: {
      displacementScale: 10,
      bloomOpacity: 1,
      rimOpacity: 0.45,
      faceOverlayOpacity: 1,
      supportOpacity: 0.88,
      pointerTracking: true,
      pointerTilt: 1,
    },
  };
}

function normalizeInputPanelGlassRefractionVariantSettings(
  value: unknown,
  defaults: InputPanelGlassRefractionVariantSettings,
): InputPanelGlassRefractionVariantSettings {
  const candidate =
    value && typeof value === 'object'
      ? (value as Partial<InputPanelGlassRefractionVariantSettings>)
      : undefined;

  return {
    backgroundOpacity: normalizeFiniteNumberInRange(
      candidate?.backgroundOpacity,
      defaults.backgroundOpacity,
      0,
      100,
    ),
    blur: normalizeFiniteNumberInRange(candidate?.blur, defaults.blur, 0, 40),
    saturation: normalizeFiniteNumberInRange(candidate?.saturation, defaults.saturation, 50, 250),
    brightness: normalizeFiniteNumberInRange(candidate?.brightness, defaults.brightness, 50, 150),
  };
}

export function normalizeInputPanelGlassRefractionSettings(
  value?: PartialInputPanelGlassRefractionSettings | null,
): InputPanelGlassRefractionSettings {
  const defaults = getDefaultInputPanelGlassRefractionSettings();

  return {
    glass: normalizeInputPanelGlassRefractionVariantSettings(value?.glass, defaults.glass),
    card: normalizeInputPanelGlassRefractionVariantSettings(value?.card, defaults.card),
    pill: normalizeInputPanelGlassRefractionVariantSettings(value?.pill, defaults.pill),
  };
}

export function normalizeInputPanelGlassRefractionSvgFilterPresetId(
  value: unknown,
): InputPanelGlassRefractionSvgFilterPresetId {
  switch (value) {
    case 'none':
    case 'subtle':
    case 'strong':
      return value;
    default:
      return 'none';
  }
}

export function normalizeInputPanelGlassRefractionSvgFilterSettings(
  value?: Partial<InputPanelGlassRefractionSvgFilterSettings> | null,
): InputPanelGlassRefractionSvgFilterSettings {
  const defaults = getDefaultInputPanelGlassRefractionSvgFilterSettings();

  return {
    preset: normalizeInputPanelGlassRefractionSvgFilterPresetId(value?.preset),
    subtleScale: normalizeFiniteNumberInRange(value?.subtleScale, defaults.subtleScale, 0, 32),
    strongScale: normalizeFiniteNumberInRange(value?.strongScale, defaults.strongScale, 0, 32),
  };
}

export function normalizeInputPanelLiquidGlassSettings(
  value?: Partial<InputPanelLiquidGlassSettings> | null,
): InputPanelLiquidGlassSettings {
  const defaults = getDefaultInputPanelLiquidGlassSettings();
  const shuding = value?.shuding ?? {};
  const nikdelvin = value?.nikdelvin ?? {};
  const shudingDiamond = value?.shudingDiamond ?? {};

  return {
    shuding: {
      displacementScale: normalizeFiniteNumber(
        shuding.displacementScale,
        defaults.shuding.displacementScale as number,
      ),
      blurAmount: normalizeFiniteNumber(
        shuding.blurAmount,
        defaults.shuding.blurAmount as number,
      ),
      adaptiveSdf: normalizeBoolean(
        shuding.adaptiveSdf,
        defaults.shuding.adaptiveSdf as boolean,
      ),
      adaptiveSdfMix: normalizeFiniteNumberInRange(
        shuding.adaptiveSdfMix,
        defaults.shuding.adaptiveSdfMix as number,
        0,
        1,
      ),
      rectEdgeRefraction: normalizeBoolean(
        shuding.rectEdgeRefraction,
        defaults.shuding.rectEdgeRefraction as boolean,
      ),
      rectEdgeRefractionStrength: normalizeFiniteNumberInRange(
        shuding.rectEdgeRefractionStrength,
        defaults.shuding.rectEdgeRefractionStrength as number,
        0,
        2,
      ),
      cornerEnhancement: normalizeBoolean(
        shuding.cornerEnhancement,
        defaults.shuding.cornerEnhancement as boolean,
      ),
      cornerEnhancementStrength: normalizeFiniteNumberInRange(
        shuding.cornerEnhancementStrength,
        defaults.shuding.cornerEnhancementStrength as number,
        0,
        2,
      ),
      edgeBandWidth: normalizeFiniteNumberInRange(
        shuding.edgeBandWidth,
        defaults.shuding.edgeBandWidth as number,
        0,
        0.2,
      ),
      barrelDistortion: normalizeBoolean(
        shuding.barrelDistortion,
        defaults.shuding.barrelDistortion as boolean,
      ),
      barrelStrength: normalizeFiniteNumberInRange(
        shuding.barrelStrength,
        defaults.shuding.barrelStrength as number,
        0,
        0.1,
      ),
      topHighlight: normalizeBoolean(
        shuding.topHighlight,
        defaults.shuding.topHighlight as boolean,
      ),
      topHighlightOpacity: normalizeFiniteNumberInRange(
        shuding.topHighlightOpacity,
        defaults.shuding.topHighlightOpacity as number,
        0,
        1,
      ),
      innerBorder: normalizeBoolean(
        shuding.innerBorder,
        defaults.shuding.innerBorder as boolean,
      ),
      innerBorderOpacity: normalizeFiniteNumberInRange(
        shuding.innerBorderOpacity,
        defaults.shuding.innerBorderOpacity as number,
        0,
        1,
      ),
      bottomShadow: normalizeBoolean(
        shuding.bottomShadow,
        defaults.shuding.bottomShadow as boolean,
      ),
      bottomShadowOpacity: normalizeFiniteNumberInRange(
        shuding.bottomShadowOpacity,
        defaults.shuding.bottomShadowOpacity as number,
        0,
        1,
      ),
      insetDepthShadow: normalizeBoolean(
        shuding.insetDepthShadow,
        defaults.shuding.insetDepthShadow as boolean,
      ),
      insetDepthShadowOpacity: normalizeFiniteNumberInRange(
        shuding.insetDepthShadowOpacity,
        defaults.shuding.insetDepthShadowOpacity as number,
        0,
        1,
      ),
      insetShadowBlur: normalizeFiniteNumberInRange(
        shuding.insetShadowBlur,
        defaults.shuding.insetShadowBlur as number,
        5,
        30,
      ),
      contrastBoost: normalizeFiniteNumberInRange(
        shuding.contrastBoost,
        defaults.shuding.contrastBoost as number,
        1,
        1.5,
      ),
      brightnessBoost: normalizeFiniteNumberInRange(
        shuding.brightnessBoost,
        defaults.shuding.brightnessBoost as number,
        1,
        1.2,
      ),
      saturateBoost: normalizeFiniteNumberInRange(
        shuding.saturateBoost,
        defaults.shuding.saturateBoost as number,
        1,
        1.3,
      ),
    },
    nikdelvin: {
      depth: normalizeFiniteNumberInRange(
        nikdelvin.depth,
        defaults.nikdelvin.depth as number,
        0,
        40,
      ),
      strength: normalizeFiniteNumberInRange(
        nikdelvin.strength,
        defaults.nikdelvin.strength as number,
        0,
        200,
      ),
      chromaticAberration: normalizeFiniteNumberInRange(
        nikdelvin.chromaticAberration,
        defaults.nikdelvin.chromaticAberration as number,
        0,
        10,
      ),
      blur: normalizeFiniteNumberInRange(
        nikdelvin.blur,
        defaults.nikdelvin.blur as number,
        0,
        10,
      ),
      backgroundPreset:
        nikdelvin.backgroundPreset === 'background'
        || nikdelvin.backgroundPreset === 'lines'
        || nikdelvin.backgroundPreset === 'rocks'
        || nikdelvin.backgroundPreset === 'chrome'
        || nikdelvin.backgroundPreset === 'silk'
        || nikdelvin.backgroundPreset === 'none'
          ? nikdelvin.backgroundPreset
          : defaults.nikdelvin.backgroundPreset,
      color:
        nikdelvin.color === 'black'
        || nikdelvin.color === 'white'
        || nikdelvin.color === 'transparent'
          ? nikdelvin.color
          : defaults.nikdelvin.color,
      background:
        typeof nikdelvin.background === 'string'
          ? nikdelvin.background.trim()
          : defaults.nikdelvin.background,
      freeze: normalizeBoolean(
        nikdelvin.freeze,
        defaults.nikdelvin.freeze as boolean,
      ),
      noMorph: normalizeBoolean(
        nikdelvin.noMorph,
        defaults.nikdelvin.noMorph as boolean,
      ),
      button: normalizeBoolean(
        nikdelvin.button,
        defaults.nikdelvin.button as boolean,
      ),
      inline: normalizeBoolean(
        nikdelvin.inline,
        defaults.nikdelvin.inline as boolean,
      ),
      customEffects: normalizeBoolean(
        nikdelvin.customEffects,
        defaults.nikdelvin.customEffects as boolean,
      ),
    },
    shudingDiamond: {
      displacementScale: normalizeFiniteNumber(
        shudingDiamond.displacementScale,
        defaults.shudingDiamond.displacementScale as number,
      ),
      bloomOpacity: normalizeFiniteNumberInRange(
        shudingDiamond.bloomOpacity,
        defaults.shudingDiamond.bloomOpacity as number,
        0,
        1,
      ),
      rimOpacity: normalizeFiniteNumberInRange(
        shudingDiamond.rimOpacity,
        defaults.shudingDiamond.rimOpacity as number,
        0,
        1,
      ),
      faceOverlayOpacity: normalizeFiniteNumberInRange(
        shudingDiamond.faceOverlayOpacity,
        defaults.shudingDiamond.faceOverlayOpacity as number,
        0,
        1,
      ),
      supportOpacity: normalizeFiniteNumberInRange(
        shudingDiamond.supportOpacity,
        defaults.shudingDiamond.supportOpacity as number,
        0,
        1,
      ),
      pointerTracking: normalizeBoolean(
        shudingDiamond.pointerTracking,
        defaults.shudingDiamond.pointerTracking as boolean,
      ),
      pointerTilt: normalizeFiniteNumberInRange(
        shudingDiamond.pointerTilt,
        defaults.shudingDiamond.pointerTilt as number,
        0,
        2,
      ),
    },
  };
}

function normalizePartialNestedObject<T extends object>(value: unknown): Partial<T> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return { ...(value as Partial<T>) };
}

export function normalizePartialChatAppearanceSettings(
  appearance?: PartialChatAppearanceSettings | null,
): PartialChatAppearanceSettings {
  if (!appearance || typeof appearance !== 'object') {
    return {};
  }

  const normalized: PartialChatAppearanceSettings = {};

  const layout = normalizePartialNestedObject<ChatAppearanceLayoutSettings>(appearance.layout);
  if (layout) {
    normalized.layout = layout;
  }

  const sticky = normalizePartialNestedObject<ChatAppearanceStickySettings>(appearance.sticky);
  if (sticky) {
    normalized.sticky = sticky;
  }

  const background = normalizePartialNestedObject<ChatAppearanceBackgroundSettings>(appearance.background);
  if (background) {
    normalized.background = background;
  }

  const user = normalizePartialNestedObject<ChatAppearanceUserSettings>(appearance.user);
  if (user) {
    normalized.user = user;
  }

  const assistant = normalizePartialNestedObject<ChatAppearanceAssistantSettings>(appearance.assistant);
  if (assistant) {
    normalized.assistant = assistant;
  }

  const input = normalizePartialNestedObject<ChatAppearanceInputSettings>(appearance.input);
  if (input) {
    normalized.input = input;
  }

  const scrollbar = normalizePartialNestedObject<ChatAppearanceScrollbarSettings>(appearance.scrollbar);
  if (scrollbar) {
    normalized.scrollbar = scrollbar;
  }

  const advanced = normalizePartialNestedObject<ChatAppearanceAdvancedSettings>(appearance.advanced);
  if (advanced) {
    normalized.advanced = advanced;
  }

  return normalized;
}

export function normalizeChatAppearanceSettings(
  appearance?: PartialChatAppearanceSettings | null,
): ChatAppearanceSettings {
  const defaults = getDefaultChatAppearanceSettings();
  const background = appearance?.background;
  const assistant = appearance?.assistant;

  return {
    layout: {
      ...defaults.layout,
      ...(appearance?.layout ?? {}),
    },
    sticky: {
      ...defaults.sticky,
      ...(appearance?.sticky ?? {}),
    },
    background: {
      ...defaults.background,
      ...(background ?? {}),
      imagePath: typeof background?.imagePath === 'string' ? background.imagePath.trim() : defaults.background.imagePath,
      imageMimeType:
        typeof background?.imageMimeType === 'string'
          ? background.imageMimeType.trim()
          : defaults.background.imageMimeType,
      imageDisplayName:
        typeof background?.imageDisplayName === 'string'
          ? background.imageDisplayName.trim()
          : defaults.background.imageDisplayName,
      fitMode: normalizeChatAppearanceBackgroundFitMode(background?.fitMode),
      opacity: normalizeFiniteNumberInRange(background?.opacity, defaults.background.opacity, 0, 100),
      blur: normalizeFiniteNumberInRange(background?.blur, defaults.background.blur, 0, 48),
      depth: normalizeFiniteNumberInRange(background?.depth, defaults.background.depth, 0, 36),
      dim: normalizeFiniteNumberInRange(background?.dim, defaults.background.dim, 0, 88),
      edgeFade: normalizeFiniteNumberInRange(background?.edgeFade, defaults.background.edgeFade, 0, 80),
      saturation: normalizeFiniteNumberInRange(background?.saturation, defaults.background.saturation, 50, 200),
      brightness: normalizeFiniteNumberInRange(background?.brightness, defaults.background.brightness, 40, 140),
      focusX: normalizeFiniteNumberInRange(background?.focusX, defaults.background.focusX, 0, 100),
      focusY: normalizeFiniteNumberInRange(background?.focusY, defaults.background.focusY, 0, 100),
    },
    user: {
      ...defaults.user,
      ...(appearance?.user ?? {}),
      timeFontSize: normalizeFiniteNumberInRange(appearance?.user?.timeFontSize, defaults.user.timeFontSize, 6, 36),
      timeFontWeight: normalizeFontWeightValue(appearance?.user?.timeFontWeight, defaults.user.timeFontWeight),
      timeColor: normalizeCssColorValue(appearance?.user?.timeColor, defaults.user.timeColor),
    },
    assistant: {
      ...defaults.assistant,
      ...(assistant ?? {}),
      metaFontSize: normalizeFiniteNumberInRange(assistant?.metaFontSize, defaults.assistant.metaFontSize, 6, 36),
      timeFontSize: normalizeFiniteNumberInRange(
        assistant?.timeFontSize,
        normalizeFiniteNumberInRange(assistant?.metaFontSize, defaults.assistant.timeFontSize, 6, 36),
        6,
        36,
      ),
      timeFontWeight: normalizeFontWeightValue(assistant?.timeFontWeight, defaults.assistant.timeFontWeight),
      metaColor: normalizeCssColorValue(assistant?.metaColor, defaults.assistant.metaColor),
      timeColor: normalizeCssColorValue(assistant?.timeColor, defaults.assistant.timeColor),
      modelIdFontSize: normalizeFiniteNumberInRange(
        assistant?.modelIdFontSize,
        normalizeFiniteNumberInRange(assistant?.metaFontSize, defaults.assistant.modelIdFontSize, 6, 36),
        6,
        36,
      ),
      modelIdFontWeight: normalizeFontWeightValue(assistant?.modelIdFontWeight, defaults.assistant.modelIdFontWeight),
      modelIdColor: normalizeCssColorValue(assistant?.modelIdColor, defaults.assistant.modelIdColor),
    },
    input: {
      ...defaults.input,
      ...(appearance?.input ?? {}),
      actionButtonStyle: normalizeInputPanelActionButtonStyleId(appearance?.input?.actionButtonStyle),
    },
    scrollbar: {
      ...defaults.scrollbar,
      ...(appearance?.scrollbar ?? {}),
    },
    advanced: {
      ...defaults.advanced,
      ...(appearance?.advanced ?? {}),
    },
  };
}

export function isThemePresetId(value: unknown): value is ThemePresetId {
  switch (value) {
    case 'glass-classic':
    case 'glass-warm':
    case 'glass-mint':
    case 'flat-slate':
    case 'flat-ocean':
    case 'flat-rose':
    case 'soft-neutral':
    case 'soft-lavender':
    case 'soft-latte':
    case 'sharp-graphite':
    case 'sharp-neon':
    case 'sharp-amber':
      return true;
    default:
      return false;
  }
}

export function getDefaultThemeSettings(): ThemeSettings {
  return {
    activePresetId: 'glass-classic',
    customAppearanceOverrides: {},
  };
}

export function normalizeThemeSettings(value?: Partial<ThemeSettings> | null): ThemeSettings {
  const defaults = getDefaultThemeSettings();

  return {
    activePresetId:
      value?.activePresetId === null
        ? null
        : isThemePresetId(value?.activePresetId)
          ? value.activePresetId
          : defaults.activePresetId,
    customAppearanceOverrides: normalizePartialChatAppearanceSettings(value?.customAppearanceOverrides),
  };
}

export function isValidChatAppearanceCustomCssDeclarations(value: string): boolean {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return true;
  }

  const loweredValue = trimmedValue.toLowerCase();
  return !trimmedValue.includes('{')
    && !trimmedValue.includes('}')
    && !loweredValue.includes('<style')
    && !loweredValue.includes('</style');
}

export interface PersistedTabModelOverride {
  provider: string;
  model: string;
}

export interface PersistedTabEntry {
  conversationId: string | null;
  title: string;
  modelOverride: PersistedTabModelOverride | null;
}

export interface PersistedTabState {
  tabs: PersistedTabEntry[];
  activeTabIndex: number;
}

export function getDefaultPersistedTabState(): PersistedTabState {
  return {
    tabs: [],
    activeTabIndex: 0,
  };
}

export function normalizePersistedTabState(state?: Partial<PersistedTabState> | null): PersistedTabState {
  const tabs = Array.isArray(state?.tabs)
    ? state.tabs.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return [];
        }

        const conversationId = typeof entry.conversationId === 'string'
          ? entry.conversationId
          : null;
        const title = typeof entry.title === 'string' && entry.title.trim()
          ? entry.title
          : '';
        const modelOverride =
          entry.modelOverride
          && typeof entry.modelOverride === 'object'
          && typeof entry.modelOverride.provider === 'string'
          && typeof entry.modelOverride.model === 'string'
            ? {
                provider: entry.modelOverride.provider,
                model: entry.modelOverride.model,
              }
            : null;

        return [{
          conversationId,
          title,
          modelOverride,
        }];
      })
    : [];

  return {
    tabs,
    activeTabIndex: Number.isInteger(state?.activeTabIndex) && (state?.activeTabIndex ?? 0) >= 0
      ? (state?.activeTabIndex as number)
      : 0,
  };
}

/** Main settings interface */
export interface OpenCodianSettings {
  // User preferences
  userName: string;

  // Server configuration
  server: ServerConfig;

  // Security
  enableBlocklist: boolean;
  allowExternalAccess: boolean;
  blockedCommands: PlatformBlockedCommands;
  permissionMode: PermissionMode;
  autoRestartOnPermissionChange: boolean;

  // Model settings
  modelSourceMode: ModelSourceMode;
  defaultProvider: string;
  defaultModel: string;
  titleMode: TitleMode;
  questionDisplayMode: QuestionDisplayMode;
  questionCardPosition: QuestionCardPosition;
  showAnsweredQuestionCards: boolean;
  aiTitleModel: string;
  disabledModelRefs: string[];
  renderUserMarkupAsCodeBlocks: boolean;
  pluginIsolationMode: PluginIsolationMode;
  providers: ModelProviderConfig[];
  providerIconLibrary: ProviderIconLibrary;
  providerIconColorMode: ProviderIconColorMode;
  providerIconDefaultVariant: LobehubIconVariant;
  effortLevel: EffortLevel;
  thinkingBudget: ThinkingBudget;

  // Content settings
  excludedTags: string[];
  mediaFolder: string;
  systemPrompt: string;
  allowedExportPaths: string[];

  // UI settings
  maxTabs: number;
  tabBarPosition: TabBarPosition;
  belowHeaderTabBarLayout: BelowHeaderTabBarLayout;
  enableAutoScroll: boolean;
  chatScrollMode: ChatScrollMode;
  inputPanelTheme: InputPanelThemeId;
  inputPanelGlassRefraction: InputPanelGlassRefractionSettings;
  inputPanelGlassRefractionSvgFilter: InputPanelGlassRefractionSvgFilterSettings;
  inputPanelGlassRefractionGlassDefaultsVersion: number;
  inputPanelLiquidGlass: InputPanelLiquidGlassSettings;
  chatAppearance: ChatAppearanceSettings;
  settingsPanelScrollTop: number;
  modelAvailabilitySectionOpen: boolean;
  modelToolsSectionOpen: boolean;
  enableDebugLogging: boolean;
  inlineSerializedDebugLogArgs: boolean;
  debugLogPaths: PlatformDebugLogPaths;
  openInMainTab: boolean;
  tabState: PersistedTabState;
  theme: ThemeSettings;

  // Language
  locale: string;

  // Hidden slash commands
  hiddenSlashCommands: string[];
}

/** Default settings */
export const DEFAULT_SETTINGS: OpenCodianSettings = {
  userName: '',

  server: {
    mode: 'local',
    local: {
      host: OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST,
      port: OPENCODIAN_LOCAL_SIDECAR_DEFAULT_PORT,
      autoStart: true,
    },
    remote: {
      baseUrl: `http://${OPENCODIAN_LOCAL_SIDECAR_DEFAULT_HOST}:${OPENCODE_LEGACY_LOCAL_DEFAULT_PORT}`,
    },
    auth: {
      type: 'none',
      username: 'opencode',
      password: '',
      token: '',
    },
  },

  enableBlocklist: true,
  allowExternalAccess: false,
  blockedCommands: getDefaultBlockedCommands(),
  permissionMode: 'yolo',
  autoRestartOnPermissionChange: false,

  modelSourceMode: 'merge',
  defaultProvider: 'anthropic',
  defaultModel: 'claude-3-5-sonnet-20241022',
  titleMode: 'default',
  questionDisplayMode: 'all',
  questionCardPosition: 'inline',
  showAnsweredQuestionCards: true,
  aiTitleModel: '',
  disabledModelRefs: [],
  renderUserMarkupAsCodeBlocks: true,
  pluginIsolationMode: 'default',
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      enabled: true,
    },
  ],
  providerIconLibrary: {},
  providerIconColorMode: 'system',
  providerIconDefaultVariant: 'auto',
  effortLevel: 'high',
  thinkingBudget: 4096,

  excludedTags: [],
  mediaFolder: '',
  systemPrompt: '',
  allowedExportPaths: ['~/Desktop', '~/Downloads'],

  maxTabs: 3,
  tabBarPosition: 'below-header',
  belowHeaderTabBarLayout: 'grid',
  enableAutoScroll: true,
  chatScrollMode: 'sticky-mask',
  inputPanelTheme: 'preset',
  inputPanelGlassRefraction: getDefaultInputPanelGlassRefractionSettings(),
  inputPanelGlassRefractionSvgFilter: getDefaultInputPanelGlassRefractionSvgFilterSettings(),
  inputPanelGlassRefractionGlassDefaultsVersion: 2,
  inputPanelLiquidGlass: getDefaultInputPanelLiquidGlassSettings(),
  chatAppearance: getDefaultChatAppearanceSettings(),
  settingsPanelScrollTop: 0,
  modelAvailabilitySectionOpen: true,
  modelToolsSectionOpen: true,
  enableDebugLogging: false,
  inlineSerializedDebugLogArgs: false,
  debugLogPaths: getDefaultDebugLogPaths(),
  openInMainTab: false,
  tabState: getDefaultPersistedTabState(),
  theme: getDefaultThemeSettings(),

  locale: 'en',

  hiddenSlashCommands: [],
};

export function isLocalServerMode(server: ServerConfig): boolean {
  return server.mode === 'local';
}

export function getServerBaseUrl(server: ServerConfig): string {
  if (server.mode === 'remote') {
    return normalizeBaseUrl(server.remote.baseUrl);
  }

  return `http://${server.local.host}:${server.local.port}`;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
