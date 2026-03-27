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

/** Server connection mode */
export type ServerMode = 'local' | 'remote';

/** Server auth type */
export type ServerAuthType = 'none' | 'basic' | 'bearer';

/** Model source mode */
export type ModelSourceMode = 'merge' | 'local' | 'server';

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

export interface ChatAppearanceUserSettings {
  radius: number;
  tailRadius: number;
  blur: number;
  shadowBlur: number;
}

export interface ChatAppearanceAssistantSettings {
  radius: number;
  backgroundOpacity: number;
  blur: number;
  shadowBlur: number;
}

export interface ChatAppearanceInputSettings {
  radius: number;
  blur: number;
  shadowBlur: number;
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
  user: ChatAppearanceUserSettings;
  assistant: ChatAppearanceAssistantSettings;
  input: ChatAppearanceInputSettings;
  scrollbar: ChatAppearanceScrollbarSettings;
  advanced: ChatAppearanceAdvancedSettings;
}

export interface PartialChatAppearanceSettings {
  layout?: Partial<ChatAppearanceLayoutSettings>;
  sticky?: Partial<ChatAppearanceStickySettings>;
  user?: Partial<ChatAppearanceUserSettings>;
  assistant?: Partial<ChatAppearanceAssistantSettings>;
  input?: Partial<ChatAppearanceInputSettings>;
  scrollbar?: Partial<ChatAppearanceScrollbarSettings>;
  advanced?: Partial<ChatAppearanceAdvancedSettings>;
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
    user: {
      radius: 16,
      tailRadius: 4,
      blur: 12,
      shadowBlur: 28,
    },
    assistant: {
      radius: 14,
      backgroundOpacity: 72,
      blur: 10,
      shadowBlur: 24,
    },
    input: {
      radius: 12,
      blur: 18,
      shadowBlur: 28,
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

export function normalizeChatAppearanceSettings(
  appearance?: PartialChatAppearanceSettings | null,
): ChatAppearanceSettings {
  const defaults = getDefaultChatAppearanceSettings();

  return {
    layout: {
      ...defaults.layout,
      ...(appearance?.layout ?? {}),
    },
    sticky: {
      ...defaults.sticky,
      ...(appearance?.sticky ?? {}),
    },
    user: {
      ...defaults.user,
      ...(appearance?.user ?? {}),
    },
    assistant: {
      ...defaults.assistant,
      ...(appearance?.assistant ?? {}),
    },
    input: {
      ...defaults.input,
      ...(appearance?.input ?? {}),
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
  providers: ModelProviderConfig[];
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
  chatAppearance: ChatAppearanceSettings;
  settingsPanelScrollTop: number;
  enableDebugLogging: boolean;
  debugLogPaths: PlatformDebugLogPaths;
  openInMainTab: boolean;
  tabState: PersistedTabState;

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
      host: '127.0.0.1',
      port: 4096,
      autoStart: true,
    },
    remote: {
      baseUrl: 'http://127.0.0.1:4096',
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
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      enabled: true,
    },
  ],
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
  chatAppearance: getDefaultChatAppearanceSettings(),
  settingsPanelScrollTop: 0,
  enableDebugLogging: false,
  debugLogPaths: getDefaultDebugLogPaths(),
  openInMainTab: false,
  tabState: getDefaultPersistedTabState(),

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
