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
  agent?: Record<string, unknown>;
  [key: string]: unknown;
}

