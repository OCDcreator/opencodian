/**
 * OpenCode SDK wrapper types
 */

import type { ImageAttachment, PromptContextItem, StreamChunk } from '../types';
import type {
  EffortLevel,
  LocalServerConfig,
  ModelSourceMode,
  PluginIsolationMode,
  ServerAuthConfig,
  ServerMode,
  ThinkingBudget,
} from '../types/settings';
import type { SdkFeatureFlags } from './sdkFeatureFlags';

/** Response handler callbacks */
export interface ResponseHandler {
  id: string;
  onChunk: (chunk: StreamChunk) => void;
  onDone: () => void;
  onError: (error: Error) => void;
}

/** Server status */
export type ServerStatus = 
  | 'stopped'
  | 'starting'
  | 'running'
  | 'error'
  | 'restarting';

/** Server error */
export interface ServerError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface LocalTextOutputFormat {
  type: 'text';
}

export interface LocalJsonSchemaOutputFormat {
  type: 'json_schema';
  schema: Record<string, unknown>;
  retryCount?: number;
}

export type LocalOutputFormat = LocalTextOutputFormat | LocalJsonSchemaOutputFormat;

/** Query options */
export interface QueryOptions {
  sessionId?: string;
  model?: string;
  provider?: string;
  agent?: string;
  noReply?: boolean;
  format?: LocalOutputFormat;
  images?: ImageAttachment[];
  contextItems?: PromptContextItem[];
  allowedTools?: string[];
  externalContextPaths?: string[];
  reasoningEffort?: EffortLevel;
  thinkingBudget?: ThinkingBudget;
}

/** Server configuration */
export interface OpenCodeServerConfig {
  mode: ServerMode;
  baseUrl: string;
  local: LocalServerConfig;
  auth: ServerAuthConfig;
  modelSourceMode: ModelSourceMode;
  pluginIsolationMode: PluginIsolationMode;
  timeout?: number;
}

/** Client configuration */
export interface OpenCodeClientConfig {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface ManagedServerState {
  pid: number;
  host: string;
  port: number;
  signatureVersion?: number;
  workingDirectory?: string;
  modelSourceMode?: ModelSourceMode;
  pluginIsolationMode?: PluginIsolationMode;
  configFingerprint?: string;
}

export type { SdkFeatureFlags };
