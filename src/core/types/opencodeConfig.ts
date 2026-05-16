/**
 * OpenCode configuration types used by OpenCodian.
 */

export interface OpencodeProviderModelLimit {
  context?: number;
  output?: number;
}

export interface OpencodeProviderModelConfig {
  name?: string;
  limit?: OpencodeProviderModelLimit;
  options?: Record<string, unknown>;
  variants?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface OpencodeProviderConfig {
  npm?: string;
  name?: string;
  options?: Record<string, unknown>;
  models?: Record<string, OpencodeProviderModelConfig>;
  [key: string]: unknown;
}

export type OpencodePluginOptions = Record<string, unknown>;

export type OpencodePluginSpec = string | [string, OpencodePluginOptions];

export type OpencodeAgentMode = 'primary' | 'subagent' | 'all';

export interface OpencodeAgentConfig {
  description?: string;
  mode?: OpencodeAgentMode;
  model?: string;
  prompt?: string;
  temperature?: number;
  top_p?: number;
  steps?: number;
  tools?: Record<string, boolean>;
  permission?: import('./permission').PermissionConfig | import('./permission').PermissionAction;
  color?: string;
  hidden?: boolean;
  disable?: boolean;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

export type OpencodeAgentConfigRecord = Record<string, OpencodeAgentConfig>;

export interface OpencodeCommandConfig {
  template?: string;
  description?: string;
  agent?: string;
  subtask?: boolean;
  model?: string;
  temperature?: number;
  top_p?: number;
  [key: string]: unknown;
}

export type OpencodeCommandConfigRecord = Record<string, OpencodeCommandConfig>;

export type OpencodeShareMode = 'manual' | 'auto' | 'disabled';

export interface OpencodeCompactionConfig {
  auto?: boolean;
  prune?: boolean;
  tail_turns?: number;
  preserve_recent_tokens?: number;
  reserved?: number;
  [key: string]: unknown;
}

/**
 * Single formatter entry configuration.
 * Mirrors the upstream OpenCode schema from packages/opencode/src/config/formatter.ts.
 * The index signature preserves unknown fields that OpenCode may add in the future.
 */
export interface OpencodeFormatterEntryConfig {
  disabled?: boolean;
  command?: string[];
  environment?: Record<string, string>;
  extensions?: string[];
  [key: string]: unknown;
}

/**
 * Formatter configuration in .opencode/opencode.json.
 * - `undefined` (field absent) → default mode (OpenCode auto-detects formatters)
 * - `false` → all formatters disabled
 * - `Record<string, OpencodeFormatterEntryConfig>` → custom mode (per-formatter overrides)
 */
export type OpencodeFormatterConfig =
  | boolean
  | Record<string, OpencodeFormatterEntryConfig>;

/**
 * Single language server entry configuration.
 * Mirrors the OpenCode LSP subtree shape used by the formatter/LSP settings UI.
 * Unknown fields are preserved for forward compatibility with upstream OpenCode.
 */
export interface OpencodeLspEntryConfig {
  disabled?: boolean;
  command?: string[];
  env?: Record<string, string>;
  extensions?: string[];
  initialization?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * LSP configuration in .opencode/opencode.json.
 * - `undefined` (field absent) → default mode (OpenCode auto-detects language servers)
 * - `false` → all language servers disabled
 * - `Record<string, OpencodeLspEntryConfig>` → custom mode (per-server overrides)
 */
export type OpencodeLspConfig =
  | boolean
  | Record<string, OpencodeLspEntryConfig>;

export type OpencodeMcpTransportType = 'local' | 'remote';

export interface OpencodeMcpOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  redirectUri?: string;
  [key: string]: unknown;
}

export interface OpencodeMcpEntryConfig {
  type?: OpencodeMcpTransportType | string;
  command?: string[];
  environment?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  timeout?: number;
  oauth?: boolean | OpencodeMcpOAuthConfig;
  [key: string]: unknown;
}

export type OpencodeMcpConfigRecord = Record<string, OpencodeMcpEntryConfig>;

/**
 * Runtime formatter status returned by SDK formatter.status().
 * Mirrors the upstream OpenCode Format.Status type.
 */
export interface OpencodeFormatterStatus {
  name: string;
  extensions: string[];
  enabled: boolean;
}

/**
 * Runtime language server status returned by SDK lsp.status().
 */
export interface OpencodeLspStatus {
  id: string;
  root?: string;
  status: string;
  [key: string]: unknown;
}

export type OpencodeToolConfig = Record<string, boolean>;

export interface OpencodeModelConfigSubset {
  model?: string;
  small_model?: string;
  provider?: Record<string, OpencodeProviderConfig>;
  enabled_providers?: string[];
  disabled_providers?: string[];
}

export interface OpencodeConfig extends OpencodeModelConfigSubset {
  $schema?: string;
  permission?: import('./permission').PermissionConfig | import('./permission').PermissionAction;
  plugin?: OpencodePluginSpec[];
  agent?: OpencodeAgentConfigRecord;
  command?: OpencodeCommandConfigRecord;
  default_agent?: string;
  share?: OpencodeShareMode;
  compaction?: OpencodeCompactionConfig;
  formatter?: OpencodeFormatterConfig;
  lsp?: OpencodeLspConfig;
  mcp?: OpencodeMcpConfigRecord;
  mode?: OpencodeAgentConfigRecord;
  tools?: OpencodeToolConfig;
  [key: string]: unknown;
}
