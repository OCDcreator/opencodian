export const DEFAULT_DEBUG_REFRESH_INTERVAL_MS = 3000;
export const MIN_DEBUG_REFRESH_INTERVAL_MS = 250;
export const MAX_DEBUG_REFRESH_INTERVAL_MS = 30000;

export const CLAUDE_CODE_DEBUG_CHANNEL_IDS = [
  'runtime',
  'sessions',
  'stream',
  'permissions',
  'mcp',
  'experimental',
] as const;

export type ClaudeCodeDebugChannelId = typeof CLAUDE_CODE_DEBUG_CHANNEL_IDS[number];
export type ClaudeCodeDebugChannelSettings = Record<ClaudeCodeDebugChannelId, boolean>;

export function getDefaultClaudeCodeDebugChannelSettings(): ClaudeCodeDebugChannelSettings {
  return {
    runtime: true,
    sessions: true,
    stream: true,
    permissions: true,
    mcp: true,
    experimental: false,
  };
}

export function normalizeClaudeCodeDebugChannelSettings(value: unknown): ClaudeCodeDebugChannelSettings {
  const defaults = getDefaultClaudeCodeDebugChannelSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }

  const candidate = value as Partial<Record<ClaudeCodeDebugChannelId, unknown>>;
  return Object.fromEntries(
    CLAUDE_CODE_DEBUG_CHANNEL_IDS.map((channelId) => [
      channelId,
      typeof candidate[channelId] === 'boolean' ? candidate[channelId] : defaults[channelId],
    ]),
  ) as ClaudeCodeDebugChannelSettings;
}

export function getEnabledClaudeCodeDebugChannels(
  settings: ClaudeCodeDebugChannelSettings,
): ClaudeCodeDebugChannelId[] {
  return CLAUDE_CODE_DEBUG_CHANNEL_IDS.filter((channelId) => settings[channelId]);
}

export const DEBUG_MODULE_REGISTRY = [
  {
    key: 'app',
    labelKey: 'settings.debug.modules.app.name',
    descriptionKey: 'settings.debug.modules.app.desc',
    defaultEnabled: true,
  },
  {
    key: 'settings',
    labelKey: 'settings.debug.modules.settings.name',
    descriptionKey: 'settings.debug.modules.settings.desc',
    defaultEnabled: true,
  },
  {
    key: 'server',
    labelKey: 'settings.debug.modules.server.name',
    descriptionKey: 'settings.debug.modules.server.desc',
    defaultEnabled: true,
  },
  {
    key: 'models',
    labelKey: 'settings.debug.modules.models.name',
    descriptionKey: 'settings.debug.modules.models.desc',
    defaultEnabled: true,
  },
  {
    key: 'chat',
    labelKey: 'settings.debug.modules.chat.name',
    descriptionKey: 'settings.debug.modules.chat.desc',
    defaultEnabled: true,
  },
  {
    key: 'contextUsage',
    labelKey: 'settings.debug.modules.contextUsage.name',
    descriptionKey: 'settings.debug.modules.contextUsage.desc',
    defaultEnabled: true,
  },
  {
    key: 'streaming',
    labelKey: 'settings.debug.modules.streaming.name',
    descriptionKey: 'settings.debug.modules.streaming.desc',
    defaultEnabled: true,
  },
  {
    key: 'claudeCode',
    labelKey: 'settings.debug.modules.claudeCode.name',
    descriptionKey: 'settings.debug.modules.claudeCode.desc',
    defaultEnabled: true,
  },
  {
    key: 'tasks',
    labelKey: 'settings.debug.modules.tasks.name',
    descriptionKey: 'settings.debug.modules.tasks.desc',
    defaultEnabled: true,
  },
  {
    key: 'storage',
    labelKey: 'settings.debug.modules.storage.name',
    descriptionKey: 'settings.debug.modules.storage.desc',
    defaultEnabled: true,
  },
  {
    key: 'providerIcons',
    labelKey: 'settings.debug.modules.providerIcons.name',
    descriptionKey: 'settings.debug.modules.providerIcons.desc',
    defaultEnabled: true,
  },
  {
    key: 'visuals',
    labelKey: 'settings.debug.modules.visuals.name',
    descriptionKey: 'settings.debug.modules.visuals.desc',
    defaultEnabled: true,
  },
] as const;

export type DebugModuleDefinition = typeof DEBUG_MODULE_REGISTRY[number];
export type DebugModuleKey = DebugModuleDefinition['key'];
export type DebugModuleSettings = Record<DebugModuleKey, boolean>;

const DEBUG_MODULE_KEYS = new Set<string>(
  DEBUG_MODULE_REGISTRY.map((debugModule) => debugModule.key),
);
const DEBUG_MODULE_SCOPE_PATTERNS: Array<{
  key: DebugModuleKey;
  matches: string[];
}> = [
  {
    key: 'claudeCode',
    matches: ['ClaudeCode', 'Claude Code', 'claude-code'],
  },
  {
    key: 'contextUsage',
    matches: ['ContextUsage', 'ContextUsageCoordinator'],
  },
  {
    key: 'streaming',
    matches: ['Stream', 'Streaming'],
  },
  {
    key: 'tasks',
    matches: ['Question', 'Todo', 'BackgroundTask'],
  },
  {
    key: 'server',
    matches: ['OpenCode', 'ServerManager', 'OpencodeConfigManager'],
  },
  {
    key: 'models',
    matches: ['Model', 'Catalog'],
  },
  {
    key: 'settings',
    matches: ['Settings', 'Modal', 'Editor'],
  },
  {
    key: 'storage',
    matches: ['Storage', 'ConversationMetadataCache', 'Persistence'],
  },
  {
    key: 'providerIcons',
    matches: ['ProviderIcon'],
  },
  {
    key: 'visuals',
    matches: ['Liquid', 'Glass', 'Appearance'],
  },
  {
    key: 'chat',
    matches: ['Chat', 'Conversation', 'OpenCodianView', 'Composer', 'Selection', 'SlashCommand'],
  },
];

export function isDebugModuleKey(value: unknown): value is DebugModuleKey {
  return typeof value === 'string' && DEBUG_MODULE_KEYS.has(value);
}

export function getDefaultDebugModuleSettings(): DebugModuleSettings {
  return Object.fromEntries(
    DEBUG_MODULE_REGISTRY.map((debugModule) => [debugModule.key, debugModule.defaultEnabled]),
  ) as DebugModuleSettings;
}

export function normalizeDebugModuleSettings(value: unknown): DebugModuleSettings {
  const normalized = getDefaultDebugModuleSettings();

  if (!value || typeof value !== 'object') {
    return normalized;
  }

  const candidate = value as Record<string, unknown>;
  for (const debugModule of DEBUG_MODULE_REGISTRY) {
    const candidateValue = candidate[debugModule.key];
    if (typeof candidateValue === 'boolean') {
      normalized[debugModule.key] = candidateValue;
    }
  }

  return normalized;
}

export function normalizeDebugRefreshIntervalMs(value: unknown): number {
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number.parseInt(value, 10)
      : Number.NaN;

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_DEBUG_REFRESH_INTERVAL_MS;
  }

  return Math.min(
    MAX_DEBUG_REFRESH_INTERVAL_MS,
    Math.max(MIN_DEBUG_REFRESH_INTERVAL_MS, Math.round(numericValue)),
  );
}

export function resolveDebugModuleKey(scope: string, explicitModuleKey?: DebugModuleKey): DebugModuleKey {
  if (explicitModuleKey) {
    return explicitModuleKey;
  }

  const normalizedScope = scope.toLowerCase();
  for (const candidate of DEBUG_MODULE_SCOPE_PATTERNS) {
    if (candidate.matches.some((pattern) => (
      scope.includes(pattern) || normalizedScope.includes(pattern.toLowerCase())
    ))) {
      return candidate.key;
    }
  }

  return 'app';
}
