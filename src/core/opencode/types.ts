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
import type { Message, Part, SessionMessage } from './OpenCodeSessionLifecycleCoordinator';
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
  | 'restarting'
  | 'conflict';

export type ServerDiagnosticReason =
  | 'none'
  | 'local-external'
  | 'local-conflict'
  | 'local-orphan-restarted';

export interface ServerDiagnostics {
  reason: ServerDiagnosticReason;
  host?: string;
  port?: number;
  pid?: number;
  commandLine?: string;
  message?: string;
}

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
  launcherPid?: number;
  listenerPid?: number;
  host: string;
  port: number;
  signatureVersion?: number;
  workingDirectory?: string;
  modelSourceMode?: ModelSourceMode;
  pluginIsolationMode?: PluginIsolationMode;
  configFingerprint?: string;
}

export interface ToolCatalogEntry {
  id: string;
  description: string;
  parameters: unknown;
}

export type McpServerStatus =
  | { status: 'connected' }
  | { status: 'disabled' }
  | { status: 'failed'; error: string }
  | { status: 'needs_auth' }
  | { status: 'needs_client_registration'; error: string };

export interface ToolCatalogSnapshot {
  registryToolIds: string[];
  toolSchemasByModel: Record<string, ToolCatalogEntry[]>;
  observedExternalTools: string[];
  updatedAt: number | null;
}

export interface McpServerSnapshot {
  servers: Record<string, McpServerStatus>;
  updatedAt: number | null;
}

export type OpenCodeEventSource = 'global' | 'event' | 'sync';

export interface SdkEventEnvelope<TPayload = unknown> {
  source: OpenCodeEventSource;
  payload: TPayload;
  timestamp: number;
}

export interface OpenCodeCapabilitySnapshot {
  toolCatalog: ToolCatalogSnapshot;
  mcp: McpServerSnapshot;
}

export type OpenCodeCanonicalMessageInfo = Message;

export type OpenCodeCanonicalPart = Part;

export type OpenCodeSessionMessageWithParts = SessionMessage;

export interface OpenCodeCanonicalSessionState {
  sessionID: string;
  messages: OpenCodeCanonicalMessageInfo[];
  partsByMessageID: Record<string, OpenCodeCanonicalPart[]>;
}

export interface OpenCodeCanonicalMutation {
  type:
    | 'session.snapshot.replaced'
    | 'message.upserted'
    | 'message.removed'
    | 'part.upserted'
    | 'part.removed'
    | 'part.delta';
  sessionID?: string;
  messageID?: string;
  partID?: string;
  field?: string;
}

export type { SdkFeatureFlags };
