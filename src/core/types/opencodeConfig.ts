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

export interface OpencodeCompactionConfig {
  auto?: boolean;
  prune?: boolean;
  tail_turns?: number;
  preserve_recent_tokens?: number;
  reserved?: number;
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
  compaction?: OpencodeCompactionConfig;
  mode?: OpencodeAgentConfigRecord;
  tools?: OpencodeToolConfig;
  [key: string]: unknown;
}
