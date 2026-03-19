/**
 * Settings type definitions for OpenCodian
 */

/** Permission mode for tool execution */
export type PermissionMode = 'yolo' | 'plan' | 'normal';

/** User decision from the approval modal */
export type ApprovalDecision = 'allow' | 'allow-always' | 'deny' | 'cancel';

/** Tab bar position setting */
export type TabBarPosition = 'input' | 'header';

/** Server configuration */
export interface ServerConfig {
  host: string;
  port: number;
  autoStart: boolean;
}

/** Platform-specific blocked commands */
export interface PlatformBlockedCommands {
  unix: string[];
  windows: string[];
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

export function getCurrentPlatformBlockedCommands(commands: PlatformBlockedCommands): string[] {
  return process.platform === 'win32' ? commands.windows : commands.unix;
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

  // Model settings
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
    host: '127.0.0.1',
    port: 4096,
    autoStart: true,
  },

  enableBlocklist: true,
  allowExternalAccess: false,
  blockedCommands: getDefaultBlockedCommands(),
  permissionMode: 'yolo',

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
  openInMainTab: false,

  locale: 'en',

  hiddenSlashCommands: [],
};
