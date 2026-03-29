/**
 * OpenCode SDK wrapper types
 */

import type { ImageAttachment, StreamChunk } from '../types';
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

/** Query options */
export interface QueryOptions {
  sessionId?: string;
  model?: string;
  provider?: string;
  images?: ImageAttachment[];
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
}

export type { SdkFeatureFlags };
