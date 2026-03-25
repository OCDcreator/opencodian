/**
 * Settings type definitions for OpenCodian
 */

/** Permission mode for tool execution */
export type PermissionMode = 'yolo' | 'plan' | 'normal';

/** User decision from the approval modal */
export type ApprovalDecision = 'allow' | 'allow-always' | 'deny' | 'cancel';

/** Tab bar position setting */
export type TabBarPosition = 'input' | 'header';

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

  // Content settings
  excludedTags: string[];
  mediaFolder: string;
  systemPrompt: string;
  allowedExportPaths: string[];

  // UI settings
  maxTabs: number;
  tabBarPosition: TabBarPosition;
  enableAutoScroll: boolean;
  chatScrollMode: ChatScrollMode;
  enableDebugLogging: boolean;
  debugLogPaths: PlatformDebugLogPaths;
  openInMainTab: boolean;

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

  excludedTags: [],
  mediaFolder: '',
  systemPrompt: '',
  allowedExportPaths: ['~/Desktop', '~/Downloads'],

  maxTabs: 3,
  tabBarPosition: 'input',
  enableAutoScroll: true,
  chatScrollMode: 'sticky-mask',
  enableDebugLogging: false,
  debugLogPaths: getDefaultDebugLogPaths(),
  openInMainTab: false,

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
