/* eslint-disable max-lines -- Claude Code adapter owns SDK query lifecycle, session identity, permissions, MCP refresh, and model catalog wiring for the same backend boundary. */
import { existsSync, unlinkSync } from 'node:fs';

import type { ElicitationRequest, ElicitationResult, Query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

import { createLogger, sanitizeDiagnosticReport } from '../../../shared';
import type { AgentBackendKind, StreamChunk } from '../../types/chat';
import type { ClaudeCodeBackendSettings, ClaudeCodeEffort } from '../../types/settings';
import { AgentCapability, type BackendCapabilities } from '../AgentCapability';
import type {
  AgentChatCapability,
  AgentChatSendRequest,
  AgentConnectionStatus,
  AgentService,
  AgentServiceInfo,
  AgentSessionCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';
import type { ClaudeCodeMcpServersMap } from './ClaudeCodeMcpConfigAdapter';
import {
  buildClaudeCodeOptions,
  type ClaudeCodeOptionsBuilderInput,
  type ClaudeCodeSdkOptionsShape,
  type ClaudeCodeSpawnRequest,
} from './ClaudeCodeOptionsBuilder';
import { ClaudeCodePermissionBridge } from './ClaudeCodePermissionBridge';
import {
  ClaudeCodeAsyncQueue,
  type ClaudeCodeQueuedPrompt,
  type ClaudeCodeRuntimeOutput,
  type ClaudeCodeSessionRuntime,
  createSessionId,
  createUserPrompt,
  isPromptSuggestionMessage,
  isTurnBoundaryMessage,
} from './ClaudeCodeQueue';
import type { WarmQueryHandle } from './ClaudeCodeSdkLoader';
import { ClaudeCodeStreamNormalizer } from './ClaudeCodeStreamNormalizer';
import {
  clearPromptSuggestionSink,
  registerPromptSuggestionSink,
} from './promptSuggestionSink';

const runtimeLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'runtime' });
const sessionLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'sessions' });
const mcpLogger = createLogger('ClaudeCodeAdapter', { moduleKey: 'claudeCode', channel: 'mcp' });

export interface ClaudeCodeSdkQueryInput {
  prompt: string | AsyncIterable<unknown>;
  options: ClaudeCodeSdkOptionsShape;
}

type ClaudeCodeQueryHandle = Query & {
  getSettings?: () => Promise<unknown>;
  getContextUsage?: () => Promise<unknown>;
  accountInfo?: () => Promise<unknown>;
  readFile?: (path: string, options?: ClaudeCodeRuntimeFileReadOptions) => Promise<unknown>;
  mcpServerStatus?: () => Promise<unknown[]>;
  supportedCommands?: () => Promise<unknown>;
  supportedAgents?: () => Promise<unknown>;
  supportedModels(): Promise<ClaudeCodeSdkModelInfo[]>;
};

type ClaudeCodeModelCatalogQuery = {
  supportedModels(): Promise<ClaudeCodeSdkModelInfo[]>;
  close?: () => void;
  shouldClose?: boolean;
};

type ClaudeCodeRuntimeSettingsQuery = {
  getSettings?: () => Promise<unknown>;
  close?: () => void;
  closeInput?: () => void;
  shouldClose?: boolean;
};

type ClaudeCodeRuntimeQueryWithSettings = NonNullable<ClaudeCodeSessionRuntime['query']> & {
  getSettings?: () => Promise<unknown>;
};

type ClaudeCodeContextUsageQuery = {
  getContextUsage?: () => Promise<unknown>;
  close?: () => void;
  closeInput?: () => void;
  shouldClose?: boolean;
};

type ClaudeCodeRuntimeQueryWithContextUsage = NonNullable<ClaudeCodeSessionRuntime['query']> & {
  getContextUsage?: () => Promise<unknown>;
};

type ClaudeCodeAccountInfoQuery = {
  accountInfo?: () => Promise<unknown>;
  close?: () => void;
  closeInput?: () => void;
  shouldClose?: boolean;
};

type ClaudeCodeRuntimeQueryWithAccountInfo = NonNullable<ClaudeCodeSessionRuntime['query']> & {
  accountInfo?: () => Promise<unknown>;
};

type ClaudeCodeRuntimeFileReadOptions = {
  maxBytes?: number;
  encoding?: 'utf-8' | 'base64';
};

type ClaudeCodeRuntimeFileQuery = {
  readFile?: (path: string, options?: ClaudeCodeRuntimeFileReadOptions) => Promise<unknown>;
  close?: () => void;
  closeInput?: () => void;
  shouldClose?: boolean;
};

type ClaudeCodeRuntimeQueryWithFileReadback = NonNullable<ClaudeCodeSessionRuntime['query']> & {
  readFile?: (path: string, options?: ClaudeCodeRuntimeFileReadOptions) => Promise<unknown>;
};

type ClaudeCodeMcpServerStatusQuery = {
  mcpServerStatus?: () => Promise<unknown[]>;
  close?: () => void;
  shouldClose?: boolean;
};

type ClaudeCodeRuntimeQueryWithMcpServerStatus = NonNullable<ClaudeCodeSessionRuntime['query']> & {
  mcpServerStatus?: () => Promise<unknown[]>;
};

type ClaudeCodeRuntimeCatalogQuery = {
  supportedCommands?: () => Promise<unknown>;
  supportedAgents?: () => Promise<unknown>;
  close?: () => void;
  closeInput?: () => void;
  shouldClose?: boolean;
};

type ClaudeCodeRuntimeQueryWithCatalog = NonNullable<ClaudeCodeSessionRuntime['query']> & {
  supportedCommands?: () => Promise<unknown>;
  supportedAgents?: () => Promise<unknown>;
};

export interface ClaudeCodeSdkFacade {
  query(input: ClaudeCodeSdkQueryInput): ClaudeCodeQueryHandle;
  listSessions?(options?: { dir?: string; limit?: number; offset?: number; sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo[]>;
  getSessionInfo?(sessionId: string, options?: { dir?: string; sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo | undefined>;
  getSessionMessages?(sessionId: string, options?: { dir?: string; limit?: number; offset?: number; includeSystemMessages?: boolean; sessionStore?: unknown }): Promise<unknown[]>;
  listSubagents?(sessionId: string, options?: { dir?: string; sessionStore?: unknown }): Promise<string[]>;
  getSubagentMessages?(sessionId: string, agentId: string, options?: { dir?: string; limit?: number; offset?: number; sessionStore?: unknown }): Promise<unknown[]>;
  importSessionToStore?(sessionId: string, store: unknown, options?: { dir?: string; includeSubagents?: boolean; batchSize?: number }): Promise<void>;
  forkSession?(sessionId: string, options?: { dir?: string; upToMessageId?: string; title?: string }): Promise<{ sessionId: string }>;
  renameSession?(sessionId: string, title: string, options?: { dir?: string }): Promise<void>;
  startup?(params?: { options?: unknown; initializeTimeoutMs?: number }): Promise<WarmQueryHandle>;
}

export type ClaudeCodeSdkModelInfo = {
  id?: string;
  name?: string;
  provider?: string;
  value?: string;
  displayName?: string;
};

export interface ClaudeCodeMcpServerRuntimeStatus {
  name: string;
  status: string;
  scope?: string;
  serverInfo?: {
    name?: string;
    version?: string;
  };
  toolCount: number;
  toolNames: string[];
  hasError: boolean;
  errorSummary?: string;
}

export interface ClaudeCodeRuntimeCatalogCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  aliases: string[];
}

export interface ClaudeCodeRuntimeCatalogAgent {
  name: string;
  description?: string;
  model?: string;
}

export interface ClaudeCodeRuntimeCatalog {
  commands: ClaudeCodeRuntimeCatalogCommand[];
  agents: ClaudeCodeRuntimeCatalogAgent[];
}

export interface ClaudeCodeSdkSessionInfo {
  sessionId: string;
  summary: string;
  lastModified: number;
  createdAt?: number;
  customTitle?: string;
}

export interface ClaudeCodeDiagnosticPromptRequest {
  prompt: string;
  hooks?: ClaudeCodeOptionsBuilderInput['hooks'];
  sessionStore?: ClaudeCodeOptionsBuilderInput['sessionStore'];
  sessionStoreFlush?: ClaudeCodeOptionsBuilderInput['sessionStoreFlush'];
  outputFormat?: ClaudeCodeOptionsBuilderInput['outputFormat'];
  enableFileCheckpointing?: boolean;
  includeHookEvents?: boolean;
  forwardSubagentText?: boolean;
  agentProgressSummaries?: boolean;
  persistSession?: boolean;
  fallbackModel?: string;
  /** Runtime-only agent selector for diagnostic probes. */
  agent?: ClaudeCodeOptionsBuilderInput['agent'];
  /** Runtime-only agent definitions map for diagnostic probes. */
  agents?: ClaudeCodeOptionsBuilderInput['agents'];
  /** Runtime-only skills override for diagnostic probes. */
  skills?: ClaudeCodeOptionsBuilderInput['skills'];
  /** Runtime-only plugins override for diagnostic probes. */
  plugins?: ClaudeCodeOptionsBuilderInput['plugins'];
  /**
   * Diagnostic-only model override. Intentionally invalid model names may be used
   * to provoke fallback behavior. Never leaks into ordinary chat send paths.
   */
  model?: string;
  /**
   * Diagnostic resume-at only: resumes the diagnostic prompt from this SDK session id.
   * This is intentionally gated behind runDiagnosticPrompt() and must never be used
   * for ordinary chat resume. The diagnostic result is validated but not stored in
   * ordinary session state, preventing resume-at from rebinding stable chat sessions.
   */
  resumeSessionId?: string;
  /**
   * Explicit diagnostic gate: must be set to `true` when using `resumeSessionId`.
   * This flag keeps resume-at behind an explicit opt-in diagnostic boundary,
   * preventing accidental stable usage of arbitrary session resume.
   */
  _diagnosticResumeAt?: boolean;
  /**
   * Diagnostic-only permission bypass. When true, the diagnostic prompt runs
   * with `bypassPermissions` mode and skips wiring `canUseTool`, so the SDK
   * subprocess executes tools without requiring an approval host. This is
   * necessary for Capability Lab probes that test non-permission capabilities
   * (e.g. environment variable propagation) in contexts where no chat
   * streaming UI / permission card host is available.
   *
   * Scope boundary: this proves env/tool/budget propagation into Claude/Bash
   * subprocesses, NOT permission approval UX. Permission approval capability
   * remains independently proven by ordinary chat + live harness paths.
   */
  _diagnosticBypassPermissions?: boolean;
  /**
   * Diagnostic-only maxTurns override. When set, forces the diagnostic prompt
   * to use this value instead of the adapter's settings.maxTurns. Used by the
   * Capability Lab "Run Max Turns Proof" probe to test SDK turn-limit enforcement
   * with a low value (e.g. 1) without modifying the user's actual settings.
   */
  _diagnosticMaxTurns?: number;
  /**
   * Diagnostic-only canUseTool override. When provided AND `_diagnosticBypassPermissions`
   * is NOT true, this callback replaces the bridge's `canUseTool` in the diagnostic
   * SDK options. Used by the Capability Lab Allowed Tools proof to provide a synthetic
   * approval handler that auto-approves all tool calls while recording which tools
   * the SDK requests approval for — this reveals whether the SDK enforces allowedTools
   * before calling canUseTool or relies on the callback for enforcement.
   *
   * Scope boundary: this is a diagnostic-only escape hatch. It does NOT change the
   * bridge/host architecture for normal chat paths.
   */
  _diagnosticCanUseTool?: (toolName: string, input: Record<string, unknown>, context: Record<string, unknown>) => Promise<{ behavior: 'allow' | 'deny'; message?: string }>;
  /**
   * Diagnostic-only permissionMode override. When set AND `_diagnosticBypassPermissions`
   * is NOT true, this forces the diagnostic settings to use this permissionMode instead
   * of the adapter's settings.permissionMode. Used by the Allowed Tools proof to run
   * Phase B in 'default' permissionMode (non-bypass) even when the user's settings have
   * 'bypassPermissions', so the SDK subprocess actually calls canUseTool instead of
   * silently executing all tools.
   */
  _diagnosticForcePermissionMode?: 'default' | 'acceptEdits' | 'plan';
  /**
   * Diagnostic-only tool availability restrictor. When set, overrides the
   * SDK `tools` option from the default preset to a strict string[] allowlist.
   * Used by the Allowed Tools proof to test whether the SDK `tools` option
   * deterministically restricts the init tool catalog — providing an honest
    * plugin-owned product path for the "Restricted Built-in Tools" capability.
    *
    * This tests the SDK `tools` option (availability restrictor), NOT the
    * `allowedTools` option (auto-approve list). The distinction is documented
    * in the proof classification. MCP tools are unaffected — they always
    * pass through the SDK `tools` filter.
    */
   _diagnosticToolRestriction?: string[];
  /**
   * Diagnostic-only stderr callback. When provided, receives raw stderr text
   * from the Claude Code subprocess during diagnostic prompt execution.
   */
  _diagnosticStderrCallback?: (data: string) => void;
  /**
   * Diagnostic-only explicit session id. Passed to SDK options.sessionId;
   * only effective when the SDK honors it.
   */
  _diagnosticSessionId?: string;
  /**
   * Diagnostic-only continue flag. When true, asks the SDK to continue the
   * most recent conversation instead of starting a new one.
   */
  _diagnosticContinue?: boolean;
  /**
   * Diagnostic-only resume-at message UUID. When provided with resumeSessionId,
   * asks the SDK to resume only up to and including the message with this UUID.
   */
  _diagnosticResumeSessionAt?: string;
  /**
   * Diagnostic-only fork-on-resume flag. When true AND resumeSessionId is
   * provided, asks the SDK to fork the resumed session into a new session id.
   */
  _diagnosticForkSession?: boolean;
  /**
   * Diagnostic-only custom session title. Passed to SDK options.title;
   * only effective on first query (not resume).
   */
  _diagnosticTitle?: string;
  /**
   * Diagnostic-only system prompt override. When provided, replaces the
   * adapter's settings.systemPrompt for this diagnostic query only.
   * Used by the System Prompt live proof to inject a nonce-bearing
   * instruction without modifying the user's actual settings.
   */
  _diagnosticSystemPrompt?: string;
}

export interface ClaudeCodeDiagnosticPromptResult {
  sessionId?: string;
  rawMessages: unknown[];
  chunks: StreamChunk[];
  /** Non-fatal SDK error collected after stream end (e.g. max_turns_reached, max_budget_reached).
   *  Present when the SDK intentionally stopped with an error result — the messages were already
   *  collected and are available in rawMessages. Diagnostic probes should inspect this field
   *  as a secondary signal alongside rawMessages scanning. */
  sdkError?: Error;
}

export interface WarmStartupProbeResult {
  /** Honest classification: 'readback' when startup resolves + warm query responds;
   *  'fail' when startup or warm query throws; 'boundary' when SDK lacks startup(). */
  classification: 'readback' | 'fail' | 'boundary';
  /** Whether startup() resolved without throwing */
  startupResolved: boolean;
  /** Whether a WarmQuery handle was obtained from startup() */
  warmQueryAvailable: boolean;
  /** Whether warmQuery.query() produced at least one message */
  warmQueryResponded: boolean;
  /** Number of raw messages collected from warm query iteration */
  rawMessageCount: number;
  /** Error message if startup or warm query failed */
  error?: string;
}

export type ClaudeCodeSdkLoader = () => Promise<ClaudeCodeSdkFacade>;

export type ClaudeCodeMcpConfigLoader = () => Promise<ClaudeCodeMcpServersMap>;

export interface ClaudeCodeAdapterOptions {
  vaultPath: string;
  settings: ClaudeCodeBackendSettings;
  pathToClaudeCodeExecutable?: string;
  sdk?: ClaudeCodeSdkFacade;
  sdkLoader?: ClaudeCodeSdkLoader;
  permissionBridge?: ClaudeCodePermissionBridge;
  onElicitation?: (request: ElicitationRequest, options: { signal: AbortSignal }) => Promise<ElicitationResult>;
  mcpServers?: ClaudeCodeMcpServersMap;
  /** Dynamic MCP config loader — called at runtime when building SDK options. */
  mcpConfigLoader?: ClaudeCodeMcpConfigLoader;
  /** Runtime-only Claude SDK callbacks. Not persisted to user settings. */
  hooks?: ClaudeCodeOptionsBuilderInput['hooks'];
  /** Runtime-only transcript mirror adapter. Not persisted to user settings. */
  sessionStore?: ClaudeCodeOptionsBuilderInput['sessionStore'];
  sessionStoreFlush?: ClaudeCodeOptionsBuilderInput['sessionStoreFlush'];
  /** Runtime-only structured output request shape for diagnostic/experimental callers. */
  outputFormat?: ClaudeCodeOptionsBuilderInput['outputFormat'];
  /** Runtime-only Claude plugin declarations. Stable authoring UI remains hidden. */
  plugins?: ClaudeCodeOptionsBuilderInput['plugins'];
  /** Runtime-only Claude skills allowlist. Stable authoring UI remains hidden. */
  skills?: ClaudeCodeOptionsBuilderInput['skills'];
  /** Runtime-only main-thread agent selector. Stable authoring UI remains hidden. */
  agent?: ClaudeCodeOptionsBuilderInput['agent'];
  /** Runtime-only Claude agent definitions. Stable authoring UI remains hidden. */
  agents?: ClaudeCodeOptionsBuilderInput['agents'];
}

const CLAUDE_CODE_EFFORT_VALUES = new Set<ClaudeCodeEffort>(['low', 'medium', 'high', 'xhigh', 'max']);

function trimOptionalOptionString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveSendOptionOverrides(options: Record<string, unknown> | undefined): {
  model?: string;
  effort?: ClaudeCodeEffort;
} {
  const model = trimOptionalOptionString(options?.model);
  const variant = trimOptionalOptionString(options?.variant);
  const effort = variant && CLAUDE_CODE_EFFORT_VALUES.has(variant as ClaudeCodeEffort)
    ? variant as ClaudeCodeEffort
    : undefined;
  return {
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };
}

function summarizeError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error && error.name.trim()
    ? error.name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 48)
    : typeof error;
  const lowerMessage = rawMessage.toLowerCase();
  const category =
    lowerMessage.includes('abort') ? 'abort'
      : lowerMessage.includes('timeout') || lowerMessage.includes('timed out') ? 'timeout'
        : lowerMessage.includes('eacces') || lowerMessage.includes('permission') || lowerMessage.includes('denied') ? 'permission'
          : lowerMessage.includes('enoent') || lowerMessage.includes('not found') ? 'not-found'
            : lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('econn') ? 'network'
              : 'generic';
  return `${errorName}(category=${category}, messageLength=${rawMessage.length})`;
}

function summarizeMcpStatusError(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const rawMessage = typeof value === 'string' ? value : String(value);
  const lowerMessage = rawMessage.toLowerCase();
  const category =
    lowerMessage.includes('auth') || lowerMessage.includes('token') || lowerMessage.includes('credential') ? 'auth'
      : lowerMessage.includes('timeout') || lowerMessage.includes('timed out') ? 'timeout'
        : lowerMessage.includes('permission') || lowerMessage.includes('denied') ? 'permission'
          : lowerMessage.includes('not found') || lowerMessage.includes('enoent') ? 'not-found'
            : lowerMessage.includes('network') || lowerMessage.includes('connection') || lowerMessage.includes('econn') ? 'network'
              : 'generic';
  return `McpServerError(category=${category}, messageLength=${rawMessage.length})`;
}

function normalizeMcpServerInfo(value: unknown): ClaudeCodeMcpServerRuntimeStatus['serverInfo'] | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const serverInfo = {
    ...(typeof record.name === 'string' ? { name: record.name } : {}),
    ...(typeof record.version === 'string' ? { version: record.version } : {}),
  };
  return Object.keys(serverInfo).length > 0 ? serverInfo : undefined;
}

function normalizeMcpToolNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((tool) => {
      if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) {
        return '';
      }
      return trimOptionalOptionString((tool as Record<string, unknown>).name) ?? '';
    })
    .filter((toolName) => toolName.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeMcpServerRuntimeStatus(rawStatus: unknown): ClaudeCodeMcpServerRuntimeStatus | null {
  if (typeof rawStatus !== 'object' || rawStatus === null || Array.isArray(rawStatus)) {
    return null;
  }
  const record = rawStatus as Record<string, unknown>;
  const name = trimOptionalOptionString(record.name) ?? '(unnamed)';
  const status = trimOptionalOptionString(record.status) ?? 'unknown';
  const scope = trimOptionalOptionString(record.scope);
  const serverInfo = normalizeMcpServerInfo(record.serverInfo);
  const toolNames = normalizeMcpToolNames(record.tools);
  const errorSummary = summarizeMcpStatusError(record.error);
  return {
    name,
    status,
    ...(scope ? { scope } : {}),
    ...(serverInfo ? { serverInfo } : {}),
    toolCount: toolNames.length,
    toolNames,
    hasError: Boolean(errorSummary),
    ...(errorSummary ? { errorSummary } : {}),
  };
}

function normalizeRuntimeCatalogAliases(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((alias) => trimOptionalOptionString(alias) ?? '')
    .filter((alias) => alias.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeRuntimeCatalogCommands(value: unknown): ClaudeCodeRuntimeCatalogCommand[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = trimOptionalOptionString(record.name);
      if (!name) {
        return null;
      }
      const description = trimOptionalOptionString(record.description);
      const argumentHint = trimOptionalOptionString(record.argumentHint);
      return {
        name,
        ...(description ? { description } : {}),
        ...(argumentHint ? { argumentHint } : {}),
        aliases: normalizeRuntimeCatalogAliases(record.aliases),
      };
    })
    .filter((entry): entry is ClaudeCodeRuntimeCatalogCommand => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeRuntimeCatalogAgents(value: unknown): ClaudeCodeRuntimeCatalogAgent[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        return null;
      }
      const record = entry as Record<string, unknown>;
      const name = trimOptionalOptionString(record.name);
      if (!name) {
        return null;
      }
      const description = trimOptionalOptionString(record.description);
      const model = trimOptionalOptionString(record.model);
      return {
        name,
        ...(description ? { description } : {}),
        ...(model ? { model } : {}),
      };
    })
    .filter((entry): entry is ClaudeCodeRuntimeCatalogAgent => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function summarizeSendOptions(options: Record<string, unknown> | undefined): Record<string, unknown> {
  const overrides = resolveSendOptionOverrides(options);
  return {
    optionKeyCount: Object.keys(options ?? {}).length,
    hasModelOverride: Boolean(overrides.model),
    effort: overrides.effort,
  };
}

function summarizeSession(session: ClaudeCodeSessionState): Record<string, unknown> {
  return {
    sessionId: session.id,
    sdkSessionId: session.sdkSessionId,
    messageCount: session.messages.length,
    hasRuntime: Boolean(session.runtime && !session.runtime.closed),
  };
}

function resolveDiagnosticSessionId(message: unknown, chunks: readonly StreamChunk[]): string | undefined {
  for (const chunk of chunks) {
    if (chunk.type === 'message_metadata' && chunk.sessionId) {
      return chunk.sessionId;
    }
    if (chunk.type === 'usage' && chunk.sessionId) {
      return chunk.sessionId;
    }
    if (chunk.type === 'backend_event' && chunk.sessionId) {
      return chunk.sessionId;
    }
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return undefined;
  }
  const record = message as {
    session_id?: unknown;
    sessionId?: unknown;
    message?: { session_id?: unknown; sessionId?: unknown };
  };
  const candidates = [
    record.session_id,
    record.sessionId,
    record.message?.session_id,
    record.message?.sessionId,
  ];
  const resolved = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim().length > 0);
  return typeof resolved === 'string' ? resolved : undefined;
}

/**
 * Extract modelUsage from the last 'result'-type raw message.
 * Returns the modelUsage object (map of model name → token stats) or undefined.
 * Diagnostic-only helper; does not modify any state.
 */
function extractModelUsageFromRaw(rawMessages: unknown[]): Record<string, unknown> | undefined {
  for (let i = rawMessages.length - 1; i >= 0; i--) {
    const msg = rawMessages[i];
    if (typeof msg === 'object' && msg !== null && !Array.isArray(msg)) {
      const record = msg as { type?: unknown; subtype?: unknown; modelUsage?: unknown };
      if (record.type === 'result' && record.modelUsage && typeof record.modelUsage === 'object') {
        return record.modelUsage as Record<string, unknown>;
      }
    }
  }
  return undefined;
}

function resolveComparableSessionIds(sessionInfo: ClaudeCodeSdkSessionInfo): string[] {
  const record = sessionInfo as ClaudeCodeSdkSessionInfo & { id?: unknown };
  return [record.sessionId, record.id]
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0)
    .map((candidate) => candidate.trim());
}

const CLAUDE_CODE_PHASE1_CAPABILITIES: BackendCapabilities = Object.freeze(
  new Set<AgentCapability>([
    AgentCapability.Chat,
    AgentCapability.Sessions,
    AgentCapability.Fork,
    AgentCapability.Models,
    AgentCapability.Thinking,
    AgentCapability.FileOps,
    AgentCapability.Shell,
  ]),
);

function isOpenCodianLocalClaudeSessionId(sessionId: string): boolean {
  return sessionId.startsWith('claude-code-');
}

type CheckpointRewindActualResult = {
  result: unknown;
  probeFileExistedBefore: boolean;
  probeFileExistsAfter: boolean;
  fileWasRemoved: boolean;
  successfulCandidateId: string;
};

type CheckpointPhase1RewindResult = {
  dryRunResult: unknown;
  filesChanged: unknown[];
  toolUseTypes: string[];
  userMessageUuid: string;
};

type CheckpointCandidateResult = {
  candidateId: string;
  canRewind: boolean;
  filesChanged: unknown;
  error?: string;
};

type CheckpointRewindProbeResult = {
  sessionId: string | undefined;
  userMessageId: string | undefined;
  rewindDryRunResult: unknown;
  rewindActualResult: CheckpointRewindActualResult | undefined;
  phase1RewindResult: CheckpointPhase1RewindResult | undefined;
  probeFileExistedAfterPhase1: boolean;
  chunks: StreamChunk[];
  toolUseTypes: string[];
  candidatesAttempted: string[];
  candidateResults: CheckpointCandidateResult[];
  sdkFilesPersistedEventCount: number;
  applyFlagSettingsAttempted: boolean;
  applyFlagSettingsError: string | undefined;
};

/** Stderr diagnostic probe result. */
export interface StderrDiagnosticProbeResult {
  classification: 'readback' | 'fail';
  callbackWired: boolean;
  /** True when this probe uses an isolated diagnostic query; active sessions are unaffected. */
  isolatedDiagnosticOnly: boolean;
  chunksReceived?: number;
  totalBytes?: number;
  sanitizedPreview?: string;
  error?: string;
}

/** Prompt suggestions readback probe result. */
export interface PromptSuggestionsReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  optionValue: boolean;
  sdkOptionPresent: boolean;
  modelState: 'claude' | 'non-claude' | 'unknown';
  blockerNote?: string;
  error?: string;
}

/** System prompt readback probe result. */
export interface SystemPromptReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  presetPreserved: boolean;
  emptySetting: boolean;
  appendValue?: string;
  expectedAppendValue?: string;
  appendMatch?: boolean;
  error?: string;
}

/** System prompt live behavior probe result. */
export interface SystemPromptLiveProbeResult {
  classification: 'pass' | 'fail';
  nonce: string;
  nonceRecalled: boolean;
  responsePreview?: string;
  error?: string;
}

/** Task budget readback probe result. */
export interface TaskBudgetReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingValue: number | null;
  sdkOptionPresent: boolean;
  sdkTotalValue?: number;
  totalMatch: boolean;
  error?: string;
}

/** Sandbox readback probe result. */
export interface SandboxReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingEnabled: boolean;
  settingFailIfUnavailable: boolean;
  settingAutoAllowBashIfSandboxed: boolean;
  sdkOptionPresent: boolean;
  sdkEnabled?: boolean;
  sdkFailIfUnavailable?: boolean;
  sdkAutoAllowBashIfSandboxed?: boolean;
  enabledMatch: boolean;
  failIfUnavailableMatch: boolean;
  autoAllowBashIfSandboxedMatch: boolean;
  error?: string;
}

/** Plan mode instructions readback probe result. */
export interface PlanModeInstructionsReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  permissionMode: string;
  settingValue: string;
  sdkOptionPresent: boolean;
  sdkValue?: string;
  valueMatch: boolean;
  error?: string;
}

/** Tool aliases readback probe result. */
export interface ToolAliasesReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingEmpty: boolean;
  sdkOptionPresent: boolean;
  sdkEntryCount?: number;
  entriesMatch: boolean;
  defensiveCopyPreserved: boolean;
  error?: string;
}

/** Debug file readback probe result. */
export interface DebugFileReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingValue: string;
  emptySetting: boolean;
  sdkOptionPresent: boolean;
  sdkValue?: string;
  valueMatch: boolean;
  error?: string;
}

/** Strict MCP config readback probe result. */
export interface StrictMcpConfigReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingValue: boolean;
  sdkOptionPresent: boolean;
  sdkValue?: boolean;
  valueMatch: boolean;
  error?: string;
}

/** Debug readback probe result. */
export interface DebugReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingValue: boolean;
  sdkOptionPresent: boolean;
  sdkValue?: boolean;
  valueMatch: boolean;
  error?: string;
}

/** 1M Context Beta readback probe result. */
export interface Context1mBetaReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingValue: boolean;
  sdkOptionPresent: boolean;
  sdkValue?: string[];
  valueMatch: boolean;
  error?: string;
}

/** JS Runtime readback probe result. */
export interface JsRuntimeReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingValue: string;
  emptySetting: boolean;
  sdkOptionPresent: boolean;
  sdkValue?: string;
  valueMatch: boolean;
  error?: string;
}

/** Load Timeout readback probe result. */
export interface LoadTimeoutReadbackProbeResult {
  classification: 'readback' | 'fail';
  optionWired: boolean;
  settingValue: number | null;
  sdkOptionPresent: boolean;
  sdkValue?: number;
  valueMatch: boolean;
  error?: string;
}

/** Continue diagnostic probe result. */
export interface ContinueProbeResult {
  classification: 'pass' | 'fail';
  seedSessionId?: string;
  continueSessionId?: string;
  nonce?: string;
  recalled?: boolean;
  sessionIdsMatch?: boolean;
  nonceRecalled?: boolean;
  error?: string;
}

/** Resume session at diagnostic probe result. */
export interface ResumeSessionAtProbeResult {
  classification: 'pass' | 'fail';
  seedSessionId?: string;
  resumedSessionId?: string;
  sessionId?: string;
  alphaNonce?: string;
  betaNonce?: string;
  alphaMessageUuid?: string;
  recalledAlpha?: boolean;
  resumedAtAlpha?: boolean;
  error?: string;
}

/** Fork session diagnostic probe result. */
export interface ForkSessionProbeResult {
  classification: 'pass' | 'fail';
  seedSessionId?: string;
  forkedSessionId?: string;
  nonce?: string;
  recalled?: boolean;
  sessionIdsDiffer?: boolean;
  nonceRecalled?: boolean;
  error?: string;
}

/** Session title diagnostic probe result. */
export interface SessionTitleProbeResult {
  classification: 'pass' | 'fail';
  sessionId?: string;
  requestedTitle?: string;
  customTitle?: string;
  error?: string;
}

/** Custom session id diagnostic probe result. */
export interface CustomSessionIdProbeResult {
  classification: 'pass' | 'fail';
  requestedSessionId?: string;
  actualSessionId?: string;
  returnedSessionId?: string;
  error?: string;
}

type CheckpointPhase1StreamResult = {
  allChunks: StreamChunk[];
  sessionId: string | undefined;
  phase1UserMessageUuid: string | undefined;
  toolUseTypes: string[];
  sdkFilesPersistedEventCount: number;
  applyFlagSettingsAttempted: boolean;
  applyFlagSettingsError: string | undefined;
};

type CheckpointPhase2StreamResult = {
  rewindDryRunResult: unknown;
  rewindActualResult: CheckpointRewindActualResult | undefined;
  phase1RewindResult: CheckpointPhase1RewindResult | undefined;
  candidateResults: CheckpointCandidateResult[];
};

interface ClaudeCodeSessionState {
  id: string;
  title: string;
  messages: ClaudeCodeQueuedPrompt[];
  sdkSessionId?: string;
  resumeValidationRequired?: boolean;
  runtime?: ClaudeCodeSessionRuntime;
}

export class ClaudeCodeRuntimeAbortController {
  private readonly controller = new AbortController();
  readonly signal = this.controller.signal;

  abort(reason?: unknown): void {
    this.controller.abort(reason);
  }
}

export class ClaudeCodeAdapter
  implements AgentService, AgentChatCapability, AgentSessionCapability
{
  readonly kind: AgentBackendKind = 'claude-code';
  readonly displayName = 'Claude Code';
  readonly description = 'Claude Code official Agent SDK backend';
  readonly capabilities = CLAUDE_CODE_PHASE1_CAPABILITIES;

  private statusValue: AgentConnectionStatus = 'disconnected';
  private readonly statusChangeHandlers = new Set<StatusChangeHandler>();
  private readonly sessions = new Map<string, ClaudeCodeSessionState>();
  private readonly cancelledSessions = new Set<string>();
  private readonly invalidatedSessions = new Set<string>();
  private sdkLoadPromise: Promise<ClaudeCodeSdkFacade> | null = null;
  private lastDiagnosticSdkOptions: ClaudeCodeSdkOptionsShape | null = null;
  private readonly postResultCallbacks = new Set<(chunk: StreamChunk) => void>();

  constructor(private readonly options: ClaudeCodeAdapterOptions) {}

  hasCapability(cap: AgentCapability): boolean {
    return this.capabilities.has(cap);
  }

  get status(): AgentConnectionStatus {
    return this.statusValue;
  }

  getInfo(): AgentServiceInfo {
    return {
      kind: this.kind,
      displayName: this.displayName,
      description: this.description,
      status: this.status,
      capabilities: this.capabilities,
    };
  }

  async start(): Promise<void> {
    runtimeLogger.debug('start', { vaultPath: this.options.vaultPath });
    await this.loadMcpConfig();
    registerPromptSuggestionSink(this);
    this.setStatus('connected');
  }

  async stop(): Promise<void> {
    runtimeLogger.debug('stop', { sessionCount: this.sessions.size });
    this.cancelledSessions.clear();
    for (const session of this.sessions.values()) {
      this.closeRuntime(session);
    }
    clearPromptSuggestionSink();
    this.postResultCallbacks.clear();
    this.setStatus('disconnected');
  }

  dispose(): void {
    runtimeLogger.debug('dispose', { sessionCount: this.sessions.size });
    this.cancelledSessions.clear();
    for (const sessionId of this.sessions.keys()) {
      this.invalidatedSessions.add(sessionId);
    }
    for (const session of this.sessions.values()) {
      this.closeRuntime(session);
    }
    this.sessions.clear();
    this.statusChangeHandlers.clear();
    this.postResultCallbacks.clear();
    clearPromptSuggestionSink();
    this.statusValue = 'disconnected';
  }

  /**
   * Register a callback to receive post-result chunks (e.g. prompt suggestions)
   * after the main turn boundary has been reached.
   * Returns an unsubscribe function.
   */
  onPostResultChunk(callback: (chunk: StreamChunk) => void): () => void {
    this.postResultCallbacks.add(callback);
    return () => { this.postResultCallbacks.delete(callback); };
  }

  private firePostResultChunk(chunk: StreamChunk): void {
    for (const cb of this.postResultCallbacks) {
      try { cb(chunk); } catch { /* ignore callback errors */ }
    }
  }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusChangeHandlers.add(handler);
    return { dispose: () => this.statusChangeHandlers.delete(handler) };
  }

  async createSession(title = 'New Claude Code chat'): Promise<string> {
    const id = createSessionId();
    this.invalidatedSessions.delete(id);
    this.sessions.set(id, {
      id,
      title,
      messages: [],
    });
    sessionLogger.debug('create session', { sessionId: id, titleLength: title.length });
    return id;
  }

  async deleteSession(sessionId: string): Promise<void> {
    sessionLogger.debug('delete session', { sessionId, existed: this.sessions.has(sessionId) });
    this.cancelledSessions.add(sessionId);
    this.invalidatedSessions.add(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      this.closeRuntime(session);
    }
    this.sessions.delete(sessionId);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.title = title;
    sessionLogger.debug('update session', {
      sessionId,
      sdkSessionId: session.sdkSessionId,
      titleLength: title.length,
    });
    if (session.sdkSessionId) {
      const sdk = await this.getSdk();
      await sdk.renameSession?.(session.sdkSessionId, title, { dir: this.options.vaultPath });
    }
  }

  async listSessions(options?: { limit?: number; offset?: number; sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo[]> {
    sessionLogger.debug('list session', {
      vaultPath: this.options.vaultPath,
      limit: options?.limit,
      offset: options?.offset,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    const sdk = await this.getSdk();
    const sessions = await sdk.listSessions?.({
      dir: this.options.vaultPath,
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    }) ?? [];
    sessionLogger.debug('list session complete', { count: sessions.length });
    return sessions;
  }

  async supportedModels(): Promise<Array<{ id: string; name: string; provider: string }>> {
    let query: ClaudeCodeModelCatalogQuery | undefined;
    try {
      query = await this.getModelCatalogQuery();
      const models = await query.supportedModels();
      const normalizedModels = models.map((rawModel) => {
        const model = rawModel as ClaudeCodeSdkModelInfo;
        return {
          id: model.id ?? model.value ?? '',
          name: model.name ?? model.displayName ?? model.id ?? model.value ?? '',
          provider: model.provider ?? 'claude',
        };
      }).filter((model) => model.id.length > 0);
      runtimeLogger.debug('supportedModels count', { count: normalizedModels.length });
      return normalizedModels;
    } catch (error) {
      runtimeLogger.debug('supportedModels error', { error: summarizeError(error) });
      return [];
    } finally {
      if (query?.shouldClose !== false) {
        query?.close?.();
      }
    }
  }

  async getRuntimeCatalog(): Promise<ClaudeCodeRuntimeCatalog | null> {
    let query: ClaudeCodeRuntimeCatalogQuery | undefined;
    try {
      query = await this.getRuntimeCatalogQuery();
      if (typeof query.supportedCommands !== 'function' || typeof query.supportedAgents !== 'function') {
        runtimeLogger.debug('runtime catalog unavailable', { reason: 'missing-query-catalog-methods' });
        return null;
      }
      const [rawCommands, rawAgents] = await Promise.all([
        query.supportedCommands(),
        query.supportedAgents(),
      ]);
      const commands = normalizeRuntimeCatalogCommands(rawCommands);
      const agents = normalizeRuntimeCatalogAgents(rawAgents);
      if (!commands || !agents) {
        runtimeLogger.debug('runtime catalog unexpected shape', {
          commandsType: typeof rawCommands,
          agentsType: typeof rawAgents,
        });
        return null;
      }
      runtimeLogger.debug('runtime catalog readback', {
        commandCount: commands.length,
        agentCount: agents.length,
      });
      return { commands, agents };
    } catch (error) {
      runtimeLogger.debug('runtime catalog error', { error: summarizeError(error) });
      return null;
    } finally {
      if (query?.shouldClose !== false) {
        query?.closeInput?.();
        try {
          query?.close?.();
        } catch (error) {
          runtimeLogger.debug('runtime catalog close error', { error: summarizeError(error) });
        }
      }
    }
  }

  async getRuntimeSettings(): Promise<unknown | null> {
    let query: ClaudeCodeRuntimeSettingsQuery | undefined;
    try {
      query = await this.getRuntimeSettingsQuery();
      if (typeof query.getSettings !== 'function') {
        runtimeLogger.debug('runtime settings unavailable', { reason: 'missing-query-getSettings' });
        return null;
      }
      const settings = await query.getSettings();
      runtimeLogger.debug('runtime settings readback', {
        available: settings !== null && settings !== undefined,
        valueType: typeof settings,
      });
      return settings ?? null;
    } catch (error) {
      runtimeLogger.debug('runtime settings error', { error: summarizeError(error) });
      return null;
    } finally {
      if (query?.shouldClose !== false) {
        query?.closeInput?.();
        try {
          query?.close?.();
        } catch (error) {
          runtimeLogger.debug('runtime settings close error', { error: summarizeError(error) });
        }
      }
    }
  }

  async getContextUsage(): Promise<unknown | null> {
    let query: ClaudeCodeContextUsageQuery | undefined;
    try {
      query = await this.getContextUsageQuery();
      if (typeof query.getContextUsage !== 'function') {
        runtimeLogger.debug('context usage unavailable', { reason: 'missing-query-getContextUsage' });
        return null;
      }
      const contextUsage = await query.getContextUsage();
      runtimeLogger.debug('context usage readback', {
        available: contextUsage !== null && contextUsage !== undefined,
        valueType: typeof contextUsage,
      });
      return contextUsage ?? null;
    } catch (error) {
      runtimeLogger.debug('context usage error', { error: summarizeError(error) });
      return null;
    } finally {
      if (query?.shouldClose !== false) {
        query?.closeInput?.();
        try {
          query?.close?.();
        } catch (error) {
          runtimeLogger.debug('context usage close error', { error: summarizeError(error) });
        }
      }
    }
  }

  async getAccountInfo(): Promise<unknown | null> {
    let query: ClaudeCodeAccountInfoQuery | undefined;
    try {
      query = await this.getAccountInfoQuery();
      if (typeof query.accountInfo !== 'function') {
        runtimeLogger.debug('account info unavailable', { reason: 'missing-query-accountInfo' });
        return null;
      }
      const accountInfo = await query.accountInfo();
      runtimeLogger.debug('account info readback', {
        available: accountInfo !== null && accountInfo !== undefined,
        valueType: typeof accountInfo,
      });
      return accountInfo ?? null;
    } catch (error) {
      runtimeLogger.debug('account info error', { error: summarizeError(error) });
      return null;
    } finally {
      if (query?.shouldClose !== false) {
        query?.closeInput?.();
        try {
          query?.close?.();
        } catch (error) {
          runtimeLogger.debug('account info close error', { error: summarizeError(error) });
        }
      }
    }
  }

  async readRuntimeFile(path: string, options?: ClaudeCodeRuntimeFileReadOptions): Promise<unknown | null> {
    let query: ClaudeCodeRuntimeFileQuery | undefined;
    try {
      query = await this.getRuntimeFileQuery();
      if (typeof query.readFile !== 'function') {
        runtimeLogger.debug('runtime file readback unavailable', { reason: 'missing-query-readFile' });
        return null;
      }
      const fileReadback = await query.readFile(path, options);
      runtimeLogger.debug('runtime file readback', {
        available: fileReadback !== null && fileReadback !== undefined,
        valueType: typeof fileReadback,
      });
      return fileReadback ?? null;
    } catch (error) {
      runtimeLogger.debug('runtime file readback error', { error: summarizeError(error) });
      return null;
    } finally {
      if (query?.shouldClose !== false) {
        query?.closeInput?.();
        try {
          query?.close?.();
        } catch (error) {
          runtimeLogger.debug('runtime file readback close error', { error: summarizeError(error) });
        }
      }
    }
  }

  async getMcpServerRuntimeStatuses(): Promise<ClaudeCodeMcpServerRuntimeStatus[] | null> {
    let query: ClaudeCodeMcpServerStatusQuery | undefined;
    try {
      query = await this.getMcpServerStatusQuery();
      if (typeof query.mcpServerStatus !== 'function') {
        mcpLogger.debug('MCP server status unavailable', { reason: 'missing-query-mcpServerStatus' });
        return null;
      }
      const rawStatuses = await query.mcpServerStatus();
      if (!Array.isArray(rawStatuses)) {
        mcpLogger.debug('MCP server status unexpected shape', { valueType: typeof rawStatuses });
        return null;
      }
      const statuses = rawStatuses
        .map((rawStatus) => normalizeMcpServerRuntimeStatus(rawStatus))
        .filter((status): status is ClaudeCodeMcpServerRuntimeStatus => Boolean(status));
      mcpLogger.debug('MCP server status readback', {
        count: statuses.length,
        connectedCount: statuses.filter((status) => status.status === 'connected').length,
        failedCount: statuses.filter((status) => status.status === 'failed').length,
      });
      return statuses;
    } catch (error) {
      mcpLogger.debug('MCP server status error', { error: summarizeError(error) });
      return null;
    } finally {
      if (query?.shouldClose !== false) {
        query?.close?.();
      }
    }
  }

  async getSession(sessionId: string, options?: { sessionStore?: unknown }): Promise<ClaudeCodeSdkSessionInfo | null> {
    sessionLogger.debug('get session', { sessionId, hasSessionStore: Boolean(options?.sessionStore) });
    const sdk = await this.getSdk();
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    const session = await sdk.getSessionInfo?.(sdkSessionId, {
      dir: this.options.vaultPath,
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    }) ?? null;
    sessionLogger.debug('get session complete', {
      sessionId,
      sdkSessionId,
      found: Boolean(session),
    });
    return session;
  }

  async getSessionMessages(
    sessionId: string,
    options?: { limit?: number; offset?: number; includeSystemMessages?: boolean; sessionStore?: unknown },
  ): Promise<unknown[]> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.getSessionMessages) {
      throw new Error('Claude Code getSessionMessages is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('get session messages', {
      sessionId,
      sdkSessionId,
      includeSystemMessages: options?.includeSystemMessages === true,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    return await sdk.getSessionMessages(sdkSessionId, {
      dir: this.options.vaultPath,
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      ...(options?.includeSystemMessages !== undefined ? { includeSystemMessages: options.includeSystemMessages } : {}),
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    });
  }

  async listSubagents(sessionId: string, options?: { sessionStore?: unknown }): Promise<string[]> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.listSubagents) {
      throw new Error('Claude Code listSubagents is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('list subagents', {
      sessionId,
      sdkSessionId,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    return await sdk.listSubagents(sdkSessionId, {
      dir: this.options.vaultPath,
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    });
  }

  async getSubagentMessages(
    sessionId: string,
    agentId: string,
    options?: { limit?: number; offset?: number; sessionStore?: unknown },
  ): Promise<unknown[]> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.getSubagentMessages) {
      throw new Error('Claude Code getSubagentMessages is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('get subagent messages', {
      sessionId,
      sdkSessionId,
      agentId,
      hasSessionStore: Boolean(options?.sessionStore),
    });
    return await sdk.getSubagentMessages(sdkSessionId, agentId, {
      dir: this.options.vaultPath,
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
      ...(options?.sessionStore ? { sessionStore: options.sessionStore } : {}),
    });
  }

  async importSessionToStore(
    sessionId: string,
    store: unknown,
    options?: { includeSubagents?: boolean; batchSize?: number },
  ): Promise<void> {
    this.assertSessionNotInvalidated(sessionId);
    const sdk = await this.getSdk();
    if (!sdk.importSessionToStore) {
      throw new Error('Claude Code importSessionToStore is unavailable in this SDK.');
    }
    const state = this.sessions.get(sessionId);
    const sdkSessionId = state?.sdkSessionId ?? sessionId;
    sessionLogger.debug('import session to store', {
      sessionId,
      sdkSessionId,
      includeSubagents: options?.includeSubagents !== false,
      batchSize: options?.batchSize,
    });
    await sdk.importSessionToStore(sdkSessionId, store, {
      dir: this.options.vaultPath,
      ...(options?.includeSubagents !== undefined ? { includeSubagents: options.includeSubagents } : {}),
      ...(options?.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
    });
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const sdk = await this.getSdk();
    const state = this.getOrRestoreSession(sessionId);
    if (!state.sdkSessionId) {
      throw new Error(
        `Claude Code forkSession requires a bound SDK session id for ${sessionId}. ` +
        'Send at least one message before forking a local session.',
      );
    }
    const sourceSessionId = state.sdkSessionId;
    sessionLogger.debug('fork session', { sessionId, sourceSessionId, upToMessageId: messageID });
    if (!sdk.forkSession) {
      throw new Error('Claude Code forkSession is unavailable in this SDK.');
    }
    const result = await sdk.forkSession(sourceSessionId, {
      dir: this.options.vaultPath,
      ...(messageID ? { upToMessageId: messageID } : {}),
      title: `${state.title} (fork)`,
    });
    const forkedState: ClaudeCodeSessionState = {
      id: result.sessionId,
      title: `${state.title} (fork)`,
      messages: [],
      sdkSessionId: result.sessionId,
    };
    this.sessions.set(result.sessionId, forkedState);
    sessionLogger.debug('fork session complete', { sessionId, forkedSessionId: result.sessionId });
    return { id: result.sessionId, title: forkedState.title };
  }

  async rewindFiles(
    sessionId: string,
    userMessageId: string,
    options?: { dryRun?: boolean },
  ): Promise<unknown> {
    if (!userMessageId.trim()) {
      throw new Error('Claude Code rewindFiles requires a non-empty userMessageId.');
    }
    const session = this.getOrRestoreSession(sessionId);
    const effectiveDryRun = options?.dryRun !== false;
    if (!effectiveDryRun) {
      sessionLogger.warn('rewind called with dryRun=false - this is a real rewind, not a preview', {
        sessionId,
        userMessageId,
      });
    }
    sessionLogger.debug('rewind session', { sessionId, userMessageId, dryRun: effectiveDryRun });
    const rewindFiles = session.runtime?.query?.rewindFiles;
    if (!rewindFiles) {
      throw new Error('Claude Code rewindFiles is unavailable. Start a checkpoint-enabled runtime first.');
    }
    return await rewindFiles(userMessageId, { ...options, dryRun: effectiveDryRun });
  }

  private static extractUserMessageUuid(message: unknown): string | undefined {
    if (typeof message !== 'object' || message === null || Array.isArray(message)) return undefined;
    const rec = message as Record<string, unknown>;
    if (rec.type !== 'user') return undefined;
    const raw = typeof rec.uuid === 'string' ? rec.uuid.trim() : undefined;
    return raw || undefined;
  }

  async runCheckpointRewindProbe(): Promise<CheckpointRewindProbeResult> {
    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();

    const probeFilePath = `${this.options.vaultPath}/.opencodian-checkpoint-probe.txt`;
    try { unlinkSync(probeFilePath); } catch { /* not present, ok */ }

    try {
      return await this.executeCheckpointRewindProbe(sdk, probeFilePath);
    } finally {
      try { unlinkSync(probeFilePath); } catch { /* guaranteed cleanup */ }
    }
  }

  private async executeCheckpointRewindProbe(
    sdk: ClaudeCodeSdkFacade,
    probeFilePath: string,
  ): Promise<CheckpointRewindProbeResult> {
    const phase1Abort = new ClaudeCodeRuntimeAbortController() as AbortController;
    const phase1Settings: ClaudeCodeBackendSettings = {
      ...this.options.settings,
      permissionMode: 'bypassPermissions' as const,
    };
    const phase1Options = buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: phase1Settings,
      pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      abortController: phase1Abort,
      spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
      enableFileCheckpointing: true,
      persistSession: true,
    });
    this.lastDiagnosticSdkOptions = phase1Options;

    const phase1Query = sdk.query({
      prompt: `Write the text "checkpoint-test-content" to the file at "${probeFilePath}" using the Write tool. After writing, use the Read tool to confirm the file content.`,
      options: phase1Options,
    });
    const normalizer = new ClaudeCodeStreamNormalizer();
    const p1 = await this.streamCheckpointPhase1(phase1Query, normalizer);

    const probeFileExistedAfterPhase1 = existsSync(probeFilePath);
    sessionLogger.debug('checkpoint rewind probe: phase 1 complete', {
      sessionId: p1.sessionId,
      probeFileExistedAfterPhase1,
      phase1UserMessageUuid: p1.phase1UserMessageUuid,
      toolUseTypes: p1.toolUseTypes,
    });

    if (!p1.sessionId) {
      throw new Error('Checkpoint rewind probe phase 1 failed: no session ID captured.');
    }

    const initialUserMessageId = p1.phase1UserMessageUuid ?? await this.findInitialPromptUuid(sdk, p1.sessionId);
    sessionLogger.debug('checkpoint rewind probe: found initial prompt UUID', {
      sessionId: p1.sessionId,
      initialUserMessageId,
      source: p1.phase1UserMessageUuid ? 'stream' : 'getSessionMessages',
    });

    if (!initialUserMessageId) {
      return this.buildProbeEarlyReturn(p1, probeFileExistedAfterPhase1);
    }

    const candidates = await this.collectRewindCandidateIds(sdk, p1.sessionId, initialUserMessageId);
    sessionLogger.debug('checkpoint rewind probe: rewind candidates', {
      sessionId: p1.sessionId,
      candidates,
    });

    const phase2Abort = new ClaudeCodeRuntimeAbortController() as AbortController;
    const phase2Options = buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: phase1Settings,
      pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      abortController: phase2Abort,
      spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
      enableFileCheckpointing: true,
      resumeSessionId: p1.sessionId,
    });

    const phase2Query = sdk.query({
      prompt: 'The rewind probe is continuing. Say "rewind probe active" and nothing else.',
      options: phase2Options,
    });
    const phase2Normalizer = new ClaudeCodeStreamNormalizer({ sessionId: p1.sessionId });
    const p2 = await this.streamCheckpointPhase2Rewind({
      phase2Query, phase2Normalizer, allChunks: p1.allChunks, candidates,
      probeFilePath, probeFileExistedAfterPhase1, sessionId: p1.sessionId, toolUseTypes: p1.toolUseTypes,
    });

    return {
      sessionId: p1.sessionId,
      userMessageId: initialUserMessageId,
      rewindDryRunResult: p2.rewindDryRunResult,
      rewindActualResult: p2.rewindActualResult,
      phase1RewindResult: p2.phase1RewindResult,
      probeFileExistedAfterPhase1,
      chunks: p1.allChunks,
      toolUseTypes: p1.toolUseTypes,
      candidatesAttempted: candidates,
      candidateResults: p2.candidateResults,
      sdkFilesPersistedEventCount: p1.sdkFilesPersistedEventCount,
      applyFlagSettingsAttempted: p1.applyFlagSettingsAttempted,
      applyFlagSettingsError: p1.applyFlagSettingsError,
    };
  }

  private buildProbeEarlyReturn(
    p1: CheckpointPhase1StreamResult,
    probeFileExistedAfterPhase1: boolean,
  ): CheckpointRewindProbeResult {
    return {
      sessionId: p1.sessionId,
      userMessageId: undefined,
      rewindDryRunResult: undefined,
      rewindActualResult: undefined,
      phase1RewindResult: undefined,
      probeFileExistedAfterPhase1,
      chunks: p1.allChunks,
      toolUseTypes: p1.toolUseTypes,
      candidatesAttempted: [],
      candidateResults: [],
      sdkFilesPersistedEventCount: p1.sdkFilesPersistedEventCount,
      applyFlagSettingsAttempted: p1.applyFlagSettingsAttempted,
      applyFlagSettingsError: p1.applyFlagSettingsError,
    };
  }

  private async attemptApplyFlagSettings(
    phase1Query: AsyncIterable<unknown> & { applyFlagSettings?: (s: { fileCheckpointingEnabled: boolean }) => Promise<void> },
    sessionId: string | undefined,
  ): Promise<string | undefined> {
    try {
      if (typeof phase1Query.applyFlagSettings === 'function') {
        await phase1Query.applyFlagSettings({ fileCheckpointingEnabled: true });
        sessionLogger.debug('checkpoint rewind probe: applyFlagSettings succeeded', { sessionId });
        return undefined;
      }
      return 'applyFlagSettings not available on Query';
    } catch (flagErr) {
      const msg = flagErr instanceof Error ? flagErr.message : String(flagErr);
      sessionLogger.debug('checkpoint rewind probe: applyFlagSettings failed', { sessionId, error: msg });
      return msg;
    }
  }

  private async streamCheckpointPhase1(
    phase1Query: AsyncIterable<unknown> & { close?: () => void; applyFlagSettings?: (s: { fileCheckpointingEnabled: boolean }) => Promise<void> },
    normalizer: ClaudeCodeStreamNormalizer,
  ): Promise<CheckpointPhase1StreamResult> {
    const allChunks: StreamChunk[] = [];
    let sessionId: string | undefined;
    let phase1UserMessageUuid: string | undefined;
    const toolUseTypes: string[] = [];
    let sdkFilesPersistedEventCount = 0;
    let applyFlagSettingsAttempted = false;
    let applyFlagSettingsError: string | undefined;

    try {
      for await (const message of phase1Query ?? []) {
        const nextChunks = normalizer.transformSDKMessage(message);
        if (!sessionId) {
          sessionId = resolveDiagnosticSessionId(message, nextChunks);
        }
        allChunks.push(...nextChunks);

        if (typeof message === 'object' && message !== null) {
          const rec = message as Record<string, unknown>;
          if (rec.type === 'files_persisted') {
            sdkFilesPersistedEventCount++;
          }
        }

        if (!phase1UserMessageUuid && typeof message === 'object' && message !== null) {
          const rec = message as Record<string, unknown>;
          if (rec.type === 'user' && typeof rec.uuid === 'string') {
            phase1UserMessageUuid = rec.uuid.trim();
          }
        }

        if (!applyFlagSettingsAttempted && typeof message === 'object' && message !== null) {
          const rec = message as Record<string, unknown>;
          if (rec.type === 'assistant') {
            applyFlagSettingsAttempted = true;
            applyFlagSettingsError = await this.attemptApplyFlagSettings(phase1Query, sessionId);
          }
        }

        for (const chunk of nextChunks) {
          if (chunk.type === 'tool_use') {
            const name = (chunk as unknown as { name?: string }).name;
            if (typeof name === 'string') {
              toolUseTypes.push(name);
            }
          }
        }
      }
    } finally {
      phase1Query.close?.();
    }

    return { allChunks, sessionId, phase1UserMessageUuid, toolUseTypes, sdkFilesPersistedEventCount, applyFlagSettingsAttempted, applyFlagSettingsError };
  }

  private async streamCheckpointPhase2Rewind(
    opts: {
      phase2Query: AsyncIterable<unknown> & { close?: () => void; rewindFiles?: (id: string, opts: { dryRun?: boolean }) => Promise<unknown> };
      phase2Normalizer: ClaudeCodeStreamNormalizer;
      allChunks: StreamChunk[];
      candidates: string[];
      probeFilePath: string;
      probeFileExistedAfterPhase1: boolean;
      sessionId: string | undefined;
      toolUseTypes: string[];
    },
  ): Promise<CheckpointPhase2StreamResult> {
    const { phase2Query, phase2Normalizer, allChunks, candidates, probeFilePath, probeFileExistedAfterPhase1, sessionId, toolUseTypes } = opts;
    let rewindDryRunResult: unknown;
    let rewindActualResult: CheckpointRewindActualResult | undefined;
    let phase1RewindResult: CheckpointPhase1RewindResult | undefined;
    let rewindDone = false;
    const candidateResults: CheckpointCandidateResult[] = [];

    try {
      for await (const message of phase2Query ?? []) {
        const nextChunks = phase2Normalizer.transformSDKMessage(message);
        allChunks.push(...nextChunks);

        if (!rewindDone && phase2Query.rewindFiles) {
          const msgType = typeof message === 'object' && message !== null
            ? (message as Record<string, unknown>).type
            : undefined;
          if (msgType === 'assistant') {
            rewindDone = true;
            const rewind = await this.executeDryRunCandidates(phase2Query.rewindFiles!, candidates, sessionId);            candidateResults.push(...rewind.candidateResults);
            rewindDryRunResult = rewind.rewindDryRunResult;

            if (!rewindDryRunResult) {
              rewindDryRunResult = { canRewind: false, error: 'rewindFiles threw for all candidate IDs', candidates };
            } else if (rewind.successfulCandidateId) {
              const filesChanged = (rewindDryRunResult as Record<string, unknown>)?.filesChanged;
              phase1RewindResult = {
                dryRunResult: rewindDryRunResult,
                filesChanged: Array.isArray(filesChanged) ? filesChanged : [],
                toolUseTypes,
                userMessageUuid: rewind.successfulCandidateId,
              };
              if (!Array.isArray(filesChanged) || filesChanged.length === 0) {
                rewindActualResult = await this.executeActualRewind({
                  rewindFiles: phase2Query.rewindFiles!, successfulCandidateId: rewind.successfulCandidateId,
                  probeFilePath, probeFileExistedAfterPhase1, sessionId,
                });
              }
            }
          }
        }
      }
    } finally {
      phase2Query.close?.();
    }

    return { rewindDryRunResult, rewindActualResult, phase1RewindResult, candidateResults };
  }

  private async executeDryRunCandidates(
    rewindFiles: (id: string, opts: { dryRun?: boolean }) => Promise<unknown>,
    candidates: string[],
    sessionId: string | undefined,
  ): Promise<{ rewindDryRunResult: unknown; successfulCandidateId: string; candidateResults: CheckpointCandidateResult[] }> {
    let rewindDryRunResult: unknown;
    let successfulCandidateId = '';
    const candidateResults: CheckpointCandidateResult[] = [];

    for (const candidateId of candidates) {
      try {
        const attempt = await rewindFiles(candidateId, { dryRun: true });
        const rewindObj = attempt as Record<string, unknown> | null;
        const canRewind = rewindObj && typeof rewindObj === 'object' && rewindObj.canRewind === true;
        candidateResults.push({
          candidateId,
          canRewind: !!canRewind,
          filesChanged: rewindObj?.filesChanged,
        });
        rewindDryRunResult = attempt;
        sessionLogger.debug('checkpoint rewind probe: rewindFiles dryRun result for candidate', {
          sessionId, candidateId, canRewind, filesChanged: rewindObj?.filesChanged,
          insertions: rewindObj?.insertions, deletions: rewindObj?.deletions,
        });
        if (canRewind) {
          successfulCandidateId = candidateId;
          break;
        }
      } catch (rewindErr) {
        const errMsg = rewindErr instanceof Error ? rewindErr.message : String(rewindErr);
        candidateResults.push({ candidateId, canRewind: false, filesChanged: undefined, error: errMsg });
        sessionLogger.debug('checkpoint rewind probe: rewindFiles threw for candidate', {
          sessionId, candidateId, error: errMsg,
        });
      }
    }

    return { rewindDryRunResult, successfulCandidateId, candidateResults };
  }

  private async executeActualRewind(
    opts: {
      rewindFiles: (id: string, opts: { dryRun?: boolean }) => Promise<unknown>;
      successfulCandidateId: string;
      probeFilePath: string;
      probeFileExistedAfterPhase1: boolean;
      sessionId: string | undefined;
    },
  ): Promise<CheckpointRewindActualResult | undefined> {
    const { rewindFiles, successfulCandidateId, probeFilePath, probeFileExistedAfterPhase1, sessionId } = opts;
    if (!probeFileExistedAfterPhase1) return undefined;
    try {
      const fileExistedBefore = existsSync(probeFilePath);
      const actualRewindResult = await rewindFiles(successfulCandidateId, { dryRun: false });
      const fileExistsAfter = existsSync(probeFilePath);
      const result: CheckpointRewindActualResult = {
        result: actualRewindResult,
        probeFileExistedBefore: fileExistedBefore,
        probeFileExistsAfter: fileExistsAfter,
        fileWasRemoved: fileExistedBefore && !fileExistsAfter,
        successfulCandidateId,
      };
      sessionLogger.debug('checkpoint rewind probe: dryRun=false filesystem evidence', {
        sessionId, candidateId: successfulCandidateId,
        fileExistedBefore, fileExistsAfter, fileWasRemoved: result.fileWasRemoved,
      });
      return result;
    } catch (actualRewindErr) {
      sessionLogger.debug('checkpoint rewind probe: dryRun=false threw', {
        sessionId, candidateId: successfulCandidateId,
        error: actualRewindErr instanceof Error ? actualRewindErr.message : String(actualRewindErr),
      });
      return undefined;
    }
  }

  private async findInitialPromptUuid(
    sdk: ClaudeCodeSdkFacade,
    sessionId: string,
  ): Promise<string | undefined> {
    try {
      const messages = await sdk.getSessionMessages?.(sessionId, { includeSystemMessages: false });
      if (!Array.isArray(messages)) return undefined;
      for (const msg of messages) {
        if (typeof msg !== 'object' || msg === null) continue;
        const rec = msg as Record<string, unknown>;
        if (rec.type === 'user' && (!rec.parent_tool_use_id || rec.parent_tool_use_id === null)) {
          return typeof rec.uuid === 'string' ? rec.uuid.trim() : undefined;
        }
      }
    } catch (err) {
      sessionLogger.debug('checkpoint rewind probe: getSessionMessages failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return undefined;
  }

  private async collectRewindCandidateIds(
    sdk: ClaudeCodeSdkFacade,
    sessionId: string,
    initialUserMessageId: string | undefined,
  ): Promise<string[]> {
    const candidates: string[] = [];
    if (initialUserMessageId) candidates.push(initialUserMessageId);
    if (sessionId) candidates.push(sessionId);
    try {
      const messages = await sdk.getSessionMessages?.(sessionId, { includeSystemMessages: false });
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          if (typeof msg !== 'object' || msg === null) continue;
          const rec = msg as Record<string, unknown>;
          const uuid = typeof rec.uuid === 'string' ? rec.uuid.trim() : undefined;
          if (uuid && rec.type === 'assistant') {
            candidates.push(uuid);
          }
        }
      }
    } catch {
      // best-effort — assistant UUIDs are supplementary candidates
    }
    return candidates;
  }

  /**
   * Diagnostic probe for setModel() live behavior verification.
   *
   * Two-phase probe:
   *  Phase 1: sends a short prompt, captures modelUsage from result message.
   *  Calls query.setModel(targetModel) on the active query handle.
   *  Phase 2: sends another short prompt to the same query, captures modelUsage.
   *
   * Returns structured evidence so the caller can classify honestly:
   * - pass: phase2 model !== phase1 model AND phase2 includes targetModel
   * - readback: setModel succeeded but model didn't change or signal ambiguous
   * - boundary: setModel not available on query
   * - fail: probe threw
   *
   * This is diagnostic-only. It does not change stable chat behavior or settings.
   */
  async runSetModelLiveProbe(targetModel: string): Promise<{
    setModelAttempted: boolean;
    setModelError: string | undefined;
    setModelNotAvailable: boolean;
    phase1ModelKeys: string[];
    phase2ModelKeys: string[];
  }> {
    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();

    // Single persistent query with AsyncIterable input — same pattern as getOrStartRuntime().
    // This ensures Phase 1 + setModel + Phase 2 all run on the SAME query handle,
    // so Phase 2 modelUsage genuinely reflects any model change from setModel().
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const probeSettings: ClaudeCodeBackendSettings = {
      ...this.options.settings,
      permissionMode: 'bypassPermissions' as const,
    };
    const probeOptions = buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: probeSettings,
      pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      abortController,
      spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
      persistSession: true,
    });
    this.lastDiagnosticSdkOptions = probeOptions;

    // Create input/output queues — same architecture as normal chat sessions
    const input = new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>();
    const output = new ClaudeCodeAsyncQueue<ClaudeCodeRuntimeOutput>();

    // Single SDK query with AsyncIterable prompt (streaming input mode)
    const query = sdk.query({
      prompt: input,
      options: probeOptions,
    });

    // Background pump: iterates query messages into output queue
    const pumpPromise = (async () => {
      try {
        for await (const message of query ?? []) {
          output.push({ type: 'message', message });
        }
      } catch (err) {
        output.push({ type: 'error', error: err });
      }
    })();

    const phase1Raw: unknown[] = [];
    const phase2Raw: unknown[] = [];
    let setModelAttempted = false;
    let setModelError: string | undefined;
    let setModelNotAvailable = false;

    try {
      // Phase 1: push first prompt, consume until turn boundary (result message)
      input.push(createUserPrompt('Say hello in exactly one word.'));
      for await (const item of output) {
        if (item.type === 'message') {
          phase1Raw.push(item.message);
        }
        if (item.type === 'error') {
          break;
        }
        // Check for turn boundary — result message ends Phase 1
        if (item.type === 'message' && isTurnBoundaryMessage(item.message)) {
          break;
        }
      }

      // Extract modelUsage from Phase 1 result messages
      const phase1ModelUsage = extractModelUsageFromRaw(phase1Raw);
      const phase1ModelKeys = phase1ModelUsage ? Object.keys(phase1ModelUsage) : [];

      // Call setModel on THE SAME query handle (mid-stream)
      if (typeof (query as unknown as Record<string, unknown>)?.setModel === 'function') {
        setModelAttempted = true;
        try {
          await ((query as unknown as { setModel: (m: string) => Promise<unknown> }).setModel(targetModel));
        } catch (err) {
          setModelError = err instanceof Error ? err.message : String(err);
        }
      } else {
        setModelNotAvailable = true;
      }

      // Phase 2: push second prompt into THE SAME input channel
      input.push(createUserPrompt('Say goodbye in exactly one word.'));
      for await (const item of output) {
        if (item.type === 'message') {
          phase2Raw.push(item.message);
        }
        if (item.type === 'error') {
          break;
        }
        // Check for turn boundary — result message ends Phase 2
        if (item.type === 'message' && isTurnBoundaryMessage(item.message)) {
          break;
        }
      }

      // Close input to end the query cleanly
      input.close();

      const phase2ModelUsage = extractModelUsageFromRaw(phase2Raw);
      const phase2ModelKeys = phase2ModelUsage ? Object.keys(phase2ModelUsage) : [];

      return {
        setModelAttempted,
        setModelError,
        setModelNotAvailable,
        phase1ModelKeys,
        phase2ModelKeys,
      };
    } finally {
      // Ensure cleanup regardless of error path
      input.close();
      query?.close?.();
      await pumpPromise.catch(() => { /* pump already settled or errored */ });
    }
  }

  async runDiagnosticPrompt(
    request: ClaudeCodeDiagnosticPromptRequest,
  ): Promise<ClaudeCodeDiagnosticPromptResult> {
    if (request.sessionStore && request.enableFileCheckpointing === true) {
      throw new Error('Claude Code sessionStore diagnostics cannot enable file checkpointing.');
    }
    // Diagnostic flag gate: resume-at requires explicit opt-in.
    // This keeps arbitrary session resume behind a diagnostic boundary
    // and prevents accidental stable usage.
    if (request.resumeSessionId && request._diagnosticResumeAt !== true && request._diagnosticForkSession !== true) {
      throw new Error(
        'Claude Code diagnostic resume-at requires _diagnosticResumeAt flag. ' +
        'Resume-at is diagnostic-only and must not be used for ordinary chat resume.',
      );
    }
    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    await this.validateDiagnosticResumeSession(sdk, request.resumeSessionId);
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const query = sdk.query({
      prompt: request.prompt,
      options: this.buildDiagnosticSdkOptions(abortController, request),
    });
    const normalizer = new ClaudeCodeStreamNormalizer();
    const rawMessages: unknown[] = [];
    const chunks: StreamChunk[] = [];
    let sessionId: string | undefined;
    let sdkError: Error | undefined;

    try {
      for await (const message of query ?? []) {
        rawMessages.push(message);
        const nextChunks = normalizer.transformSDKMessage(message);
        if (!sessionId) {
          sessionId = resolveDiagnosticSessionId(message, nextChunks);
        }
        chunks.push(...nextChunks);
      }
    } catch (err) {
      // The SDK throws after emitting intentional stop results (max_turns, max_budget).
      // These are not failures — the messages were already collected.
      // Attach the error as a non-fatal signal and return the collected data.
      sdkError = err instanceof Error ? err : new Error(String(err));
      runtimeLogger.debug('diagnostic prompt collected SDK error as non-fatal signal', {
        errorMessage: sdkError.message,
        messagesCollected: rawMessages.length,
      });
    } finally {
      query.close?.();
    }

    const validatedSessionId = request._diagnosticForkSession
      ? sessionId
      : this.validateDiagnosticResumeResult(request.resumeSessionId, sessionId);

    // Explicit isolation: diagnostic resume-at must never modify ordinary session state.
    // The diagnostic result is returned to the caller but is not stored in this.sessions
    // and cannot rebind any ordinary chat session's sdkSessionId.
    if (validatedSessionId) {
      for (const session of this.sessions.values()) {
        if (session.sdkSessionId === validatedSessionId) {
          runtimeLogger.debug('diagnostic resume-at collision with ordinary session', {
            diagnosticSessionId: validatedSessionId,
            ordinarySessionId: session.id,
          });
        }
      }
    }

    return {
      sessionId: validatedSessionId,
      rawMessages,
      chunks,
      ...(sdkError ? { sdkError } : {}),
    };
  }

  // =======================================================================
  // Warm Startup Probe — diagnostic probe for startup() / WarmQuery seam
  // =======================================================================

  /**
   * Diagnostic probe: calls SDK startup() to obtain a WarmQuery handle,
   * optionally sends a minimal diagnostic prompt through the warm handle,
   * and returns honest classification evidence.
   *
   * Classification rules:
   * - 'readback': startup() resolved + warm query produced messages.
   *   Warm-vs-cold latency benefit is the SDK's internal claim, not independently measured.
   * - 'fail': startup() or warm query iteration threw an exception.
   * - 'boundary': SDK facade does not expose startup().
   */
  async runWarmStartupProbe(): Promise<WarmStartupProbeResult> {
    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();

    if (!sdk.startup) {
      runtimeLogger.debug('warm startup probe', { result: 'boundary', reason: 'SDK lacks startup()' });
      return {
        classification: 'boundary',
        startupResolved: false,
        warmQueryAvailable: false,
        warmQueryResponded: false,
        rawMessageCount: 0,
      };
    }

    let warmQuery: WarmQueryHandle | undefined;
    try {
      // Build adapter-owned options through the diagnostic options pipeline
      // so the warm subprocess receives the same vaultPath, settings, spawn config,
      // MCP servers, and abort controller as a normal diagnostic query.
      const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
      const diagnosticOptions = this.buildDiagnosticSdkOptions(abortController, {
        prompt: '',
        persistSession: false,
        _diagnosticBypassPermissions: true,
      });
      warmQuery = await sdk.startup({ options: diagnosticOptions });
      runtimeLogger.debug('warm startup probe', { result: 'startup resolved' });

      // Send a minimal diagnostic prompt through the warm handle
      const queryHandle = warmQuery.query('Say "warm startup probe ok" and nothing else.');
      const rawMessages: unknown[] = [];

      try {
        for await (const message of queryHandle ?? []) {
          rawMessages.push(message);
        }
      } catch (err) {
        // Warm query iteration threw — classify as fail
        const errorMessage = err instanceof Error ? err.message : String(err);
        runtimeLogger.debug('warm startup probe', { result: 'fail', reason: 'warm query iteration threw', error: errorMessage });
        return {
          classification: 'fail',
          startupResolved: true,
          warmQueryAvailable: true,
          warmQueryResponded: false,
          rawMessageCount: rawMessages.length,
          error: errorMessage,
        };
      }

      const responded = rawMessages.length > 0;
      runtimeLogger.debug('warm startup probe', {
        result: responded ? 'readback' : 'readback',
        messageCount: rawMessages.length,
      });

      return {
        classification: 'readback',
        startupResolved: true,
        warmQueryAvailable: true,
        warmQueryResponded: responded,
        rawMessageCount: rawMessages.length,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('warm startup probe', { result: 'fail', reason: 'startup threw', error: errorMessage });
      return {
        classification: 'fail',
        startupResolved: false,
        warmQueryAvailable: false,
        warmQueryResponded: false,
        rawMessageCount: 0,
        error: errorMessage,
      };
    } finally {
      warmQuery?.close();
    }
  }

  // ─── Diagnostic probe implementations ───

  /**
   * Truncate a sanitized stderr preview to the honest display ceiling.
   * Preceding sanitize step must already have run via `sanitizeDiagnosticReport()`.
   */
  private truncateStderrPreview(sanitized: string): string {
    const CEILING = 240;
    if (sanitized.length <= CEILING) return sanitized;
    return sanitized.slice(0, CEILING - 1) + '…';
  }

  async runStderrDiagnosticProbe(): Promise<StderrDiagnosticProbeResult> {
    const chunks: string[] = [];
    let totalBytes = 0;
    const stderrCallback = (data: string): void => {
      chunks.push(data);
      totalBytes += data.length;
    };
    try {
      await this.runDiagnosticPrompt({
        prompt: 'Say "stderr probe test" and nothing else.',
        _diagnosticBypassPermissions: true,
        _diagnosticStderrCallback: stderrCallback,
      });
      const sanitizedPreview = chunks.length > 0
        ? this.truncateStderrPreview(sanitizeDiagnosticReport(chunks.join('')))
        : 'Callback wired — no stderr observed';
      return {
        classification: 'readback',
        callbackWired: true,
        isolatedDiagnosticOnly: true,
        chunksReceived: chunks.length,
        totalBytes,
        sanitizedPreview,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('stderr diagnostic probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        callbackWired: false,
        isolatedDiagnosticOnly: true,
        error: errorMessage,
      };
    }
  }

  async runPromptSuggestionsReadbackProbe(): Promise<PromptSuggestionsReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Prompt suggestions readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const optionValue = this.options.settings.promptSuggestions === true;
      const sdkOptionPresent = options.promptSuggestions === true;
      const optionWired = optionValue ? sdkOptionPresent : !('promptSuggestions' in options);
      const explicitModel = this.options.settings.model?.trim() ?? '';
      const modelState = explicitModel.length === 0
        ? 'unknown'
        : explicitModel.toLowerCase().startsWith('claude')
          ? 'claude'
          : 'non-claude';
      const blockerNote = optionValue && modelState === 'non-claude'
        ? 'Option enabled but model is non-Claude. Prompt suggestions piggyback on Claude-specific prompt caching; non-Claude models may not emit suggestions.'
        : undefined;
      if (!optionWired) {
        return {
          classification: 'fail',
          optionWired: false,
          optionValue,
          sdkOptionPresent,
          modelState,
          error: optionValue
            ? 'promptSuggestions is enabled in settings but missing from built SDK options.'
            : 'promptSuggestions is disabled in settings but still present in built SDK options.',
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        optionValue,
        sdkOptionPresent,
        modelState,
        blockerNote,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('prompt suggestions readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        optionValue: false,
        sdkOptionPresent: false,
        modelState: 'unknown',
        error: errorMessage,
      };
    }
  }

  async runSystemPromptReadbackProbe(): Promise<SystemPromptReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'System prompt readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const rawSetting = this.options.settings.systemPrompt ?? '';
      const trimmedSetting = rawSetting.trim();
      const emptySetting = trimmedSetting.length === 0;
      const sdkSystemPrompt = options.systemPrompt;
      const presetPreserved =
        sdkSystemPrompt?.type === 'preset' && sdkSystemPrompt?.preset === 'claude_code';
      const sdkAppendValue =
        sdkSystemPrompt?.type === 'preset' ? sdkSystemPrompt.append : undefined;
      const expectedAppendValue = emptySetting ? undefined : trimmedSetting;
      const appendMatch =
        emptySetting
          ? sdkAppendValue === undefined
          : sdkAppendValue === expectedAppendValue;
      const optionWired = presetPreserved && appendMatch;
      if (!optionWired) {
        return {
          classification: 'fail',
          optionWired: false,
          presetPreserved,
          emptySetting,
          appendValue: sdkAppendValue,
          expectedAppendValue,
          appendMatch,
          error: emptySetting
            ? `Expected default preset { type: 'preset', preset: 'claude_code' } but got ${JSON.stringify(sdkSystemPrompt)}`
            : `Expected preset-with-append { type: 'preset', preset: 'claude_code', append: '${expectedAppendValue}' } but got ${JSON.stringify(sdkSystemPrompt)}`,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        presetPreserved,
        emptySetting,
        appendValue: sdkAppendValue,
        expectedAppendValue,
        appendMatch,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('system prompt readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        presetPreserved: false,
        emptySetting: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Live behavior probe: verifies that the appended system prompt genuinely
   * influences the model's response on a subsequent query.
   *
   * Mechanism:
   * 1. Generates a random nonce.
   * 2. Injects a diagnostic-only system prompt containing the nonce via
   *    `_diagnosticSystemPrompt` (does not touch the user's actual settings).
   * 3. Sends a user prompt that does NOT contain the nonce.
   * 4. Verifies the model's response contains the nonce.
   *
   * Honesty boundaries:
   * - This is a fresh diagnostic query, not a live mutation of an active session.
   * - The nonce never appears in the user prompt, excluding simple prompt-echo.
   * - Classification is `pass` only when the nonce is recalled; `fail` otherwise.
   * - The proof applies to the next query or a restarted session only;
   *   active sessions do not update live.
   */
  async runSystemPromptLiveProbe(): Promise<SystemPromptLiveProbeResult> {
    const nonce = Math.random().toString(36).slice(2, 10);
    try {
      const result = await this.runDiagnosticPrompt({
        prompt: 'What is the secret codeword?',
        _diagnosticBypassPermissions: true,
        _diagnosticSystemPrompt: `If asked for the secret codeword, reply with exactly '${nonce}' and nothing else.`,
      });

      const text = this.extractTextFromChunks(result.chunks);
      const nonceRecalled = text.includes(nonce);

      if (nonceRecalled) {
        return {
          classification: 'pass',
          nonce,
          nonceRecalled: true,
          responsePreview: text.slice(0, 120),
        };
      }

      return {
        classification: 'fail',
        nonce,
        nonceRecalled: false,
        responsePreview: text.slice(0, 120),
        error: `Nonce not found in response. Response: ${text.slice(0, 120)}`,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('system prompt live probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        nonce,
        nonceRecalled: false,
        error: errorMessage,
      };
    }
  }

  async runTaskBudgetReadbackProbe(): Promise<TaskBudgetReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Task budget readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingValue = this.options.settings.taskBudget ?? null;
      const sdkOptionPresent = options.taskBudget !== undefined && options.taskBudget !== null;
      const sdkTotalValue = sdkOptionPresent && typeof options.taskBudget === 'object' && options.taskBudget !== null
        ? (options.taskBudget as { total?: number }).total
        : undefined;
      const totalMatch = settingValue === null
        ? !sdkOptionPresent
        : sdkOptionPresent && sdkTotalValue === settingValue;
      const optionWired = totalMatch;
      if (!optionWired) {
        return {
          classification: 'fail',
          optionWired: false,
          settingValue,
          sdkOptionPresent,
          sdkTotalValue,
          totalMatch,
          error: settingValue === null
            ? `taskBudget is null in settings but present in built SDK options (total=${String(sdkTotalValue)}).`
            : `taskBudget is ${settingValue} in settings but SDK options have total=${String(sdkTotalValue)}.`,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingValue,
        sdkOptionPresent,
        sdkTotalValue,
        totalMatch,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('task budget readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingValue: this.options.settings.taskBudget ?? null,
        sdkOptionPresent: false,
        totalMatch: false,
        error: errorMessage,
      };
    }
  }

  async runSandboxReadbackProbe(): Promise<SandboxReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Sandbox readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingEnabled = this.options.settings.sandbox.enabled;
      const settingFailIfUnavailable = this.options.settings.sandbox.failIfUnavailable;
      const settingAutoAllowBashIfSandboxed = this.options.settings.sandbox.autoAllowBashIfSandboxed;
      const sdkOptionPresent = options.sandbox !== undefined && options.sandbox !== null;
      const sdkSandbox = sdkOptionPresent && typeof options.sandbox === 'object' && options.sandbox !== null
        ? options.sandbox as { enabled?: boolean; failIfUnavailable?: boolean; autoAllowBashIfSandboxed?: boolean }
        : undefined;
      const sdkEnabled = sdkSandbox?.enabled;
      const sdkFailIfUnavailable = sdkSandbox?.failIfUnavailable;
      const sdkAutoAllowBashIfSandboxed = sdkSandbox?.autoAllowBashIfSandboxed;
      const enabledMatch = settingEnabled
        ? sdkOptionPresent && sdkEnabled === true
        : !sdkOptionPresent;
      const failIfUnavailableMatch = settingFailIfUnavailable
        ? sdkFailIfUnavailable === true
        : sdkFailIfUnavailable === undefined;
      const autoAllowBashIfSandboxedMatch = settingAutoAllowBashIfSandboxed
        ? sdkAutoAllowBashIfSandboxed === true
        : sdkAutoAllowBashIfSandboxed === undefined;
      const optionWired = enabledMatch && failIfUnavailableMatch && autoAllowBashIfSandboxedMatch;
      if (!optionWired) {
        return {
          classification: 'fail',
          optionWired: false,
          settingEnabled,
          settingFailIfUnavailable,
          settingAutoAllowBashIfSandboxed,
          sdkOptionPresent,
          sdkEnabled,
          sdkFailIfUnavailable,
          sdkAutoAllowBashIfSandboxed,
          enabledMatch,
          failIfUnavailableMatch,
          autoAllowBashIfSandboxedMatch,
          error: `sandbox.optionPresent=${String(sdkOptionPresent)}, ` +
            `sandbox.enabled=${String(settingEnabled)}→${String(sdkEnabled)}, ` +
            `sandbox.failIfUnavailable=${String(settingFailIfUnavailable)}→${String(sdkFailIfUnavailable)}, ` +
            `sandbox.autoAllowBashIfSandboxed=${String(settingAutoAllowBashIfSandboxed)}→${String(sdkAutoAllowBashIfSandboxed)}`,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingEnabled,
        settingFailIfUnavailable,
        settingAutoAllowBashIfSandboxed,
        sdkOptionPresent,
        sdkEnabled,
        sdkFailIfUnavailable,
        sdkAutoAllowBashIfSandboxed,
        enabledMatch,
        failIfUnavailableMatch,
        autoAllowBashIfSandboxedMatch,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('sandbox readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingEnabled: this.options.settings.sandbox.enabled,
        settingFailIfUnavailable: this.options.settings.sandbox.failIfUnavailable,
        settingAutoAllowBashIfSandboxed: this.options.settings.sandbox.autoAllowBashIfSandboxed,
        sdkOptionPresent: false,
        enabledMatch: false,
        failIfUnavailableMatch: false,
        autoAllowBashIfSandboxedMatch: false,
        error: errorMessage,
      };
    }
  }

  async runPlanModeInstructionsReadbackProbe(): Promise<PlanModeInstructionsReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Plan mode instructions readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const permissionMode = this.options.settings.permissionMode ?? 'default';
      const rawSetting = this.options.settings.planModeInstructions ?? '';
      const trimmedSetting = rawSetting.trim();
      const sdkOptionPresent = options.planModeInstructions !== undefined && options.planModeInstructions !== null;
      const sdkValue = sdkOptionPresent ? String(options.planModeInstructions) : undefined;
      // The builder wires planModeInstructions whenever the trimmed setting is non-empty.
      const expectedPresent = trimmedSetting.length > 0;
      const valueMatch = expectedPresent
        ? sdkOptionPresent && sdkValue === trimmedSetting
        : !sdkOptionPresent;
      const optionWired = valueMatch;
      if (!optionWired) {
        return {
          classification: 'fail',
          optionWired: false,
          permissionMode,
          settingValue: trimmedSetting,
          sdkOptionPresent,
          sdkValue,
          valueMatch,
          error: expectedPresent
            ? `planModeInstructions is '${trimmedSetting}' in settings but SDK options have ${sdkOptionPresent ? `'${String(sdkValue)}'` : 'no planModeInstructions'}.`
            : `planModeInstructions is empty in settings but SDK options still contain planModeInstructions=${String(sdkValue)}.`,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        permissionMode,
        settingValue: trimmedSetting,
        sdkOptionPresent,
        sdkValue,
        valueMatch,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('plan mode instructions readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        permissionMode: this.options.settings.permissionMode ?? 'default',
        settingValue: (this.options.settings.planModeInstructions ?? '').trim(),
        sdkOptionPresent: false,
        valueMatch: false,
        error: errorMessage,
      };
    }
  }

  async runToolAliasesReadbackProbe(): Promise<ToolAliasesReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Tool aliases readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingAliases = this.options.settings.toolAliases ?? {};
      const settingEmpty = Object.keys(settingAliases).length === 0;
      const sdkOptionPresent = options.toolAliases !== undefined && options.toolAliases !== null;
      const sdkAliases = sdkOptionPresent && typeof options.toolAliases === 'object' && options.toolAliases !== null
        ? options.toolAliases as Record<string, string>
        : undefined;
      const sdkEntryCount = sdkAliases ? Object.keys(sdkAliases).length : 0;
      const defensiveCopyPreserved = !sdkOptionPresent || sdkAliases !== settingAliases;

      // Verify entries match (defensive copy check)
      let entriesMatch: boolean;
      if (settingEmpty) {
        entriesMatch = !sdkOptionPresent;
      } else {
        const settingKeys = Object.keys(settingAliases).sort();
        const sdkKeys = sdkAliases ? Object.keys(sdkAliases).sort() : [];
        entriesMatch = sdkOptionPresent &&
          settingKeys.length === sdkKeys.length &&
          settingKeys.every((key) => settingAliases[key] === sdkAliases![key]);
      }

      const optionWired = entriesMatch && defensiveCopyPreserved;
      if (!optionWired) {
        let error: string;
        if (!defensiveCopyPreserved) {
          error = 'toolAliases SDK option reuses the same object reference as settings instead of a defensive copy.';
        } else if (settingEmpty) {
          error = `toolAliases is empty in settings but SDK options still contain toolAliases=${JSON.stringify(sdkAliases)}.`;
        } else {
          error = `toolAliases entries mismatch: settings=${JSON.stringify(settingAliases)} vs SDK=${JSON.stringify(sdkAliases)}.`;
        }
        return {
          classification: 'fail',
          optionWired: false,
          settingEmpty,
          sdkOptionPresent,
          sdkEntryCount,
          entriesMatch,
          defensiveCopyPreserved,
          error,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingEmpty,
        sdkOptionPresent,
        sdkEntryCount,
        entriesMatch,
        defensiveCopyPreserved,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('tool aliases readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingEmpty: Object.keys(this.options.settings.toolAliases ?? {}).length === 0,
        sdkOptionPresent: false,
        entriesMatch: false,
        defensiveCopyPreserved: false,
        error: errorMessage,
      };
    }
  }

  async runDebugFileReadbackProbe(): Promise<DebugFileReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Debug file readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingValue = (this.options.settings.debugFile ?? '').trim();
      const emptySetting = settingValue.length === 0;
      const sdkOptionPresent = options.debugFile !== undefined && options.debugFile !== null;
      const sdkValue = sdkOptionPresent && typeof options.debugFile === 'string'
        ? options.debugFile
        : undefined;
      const valueMatch = emptySetting
        ? !sdkOptionPresent
        : sdkOptionPresent && sdkValue === settingValue;

      const optionWired = valueMatch;
      if (!optionWired) {
        let error: string;
        if (emptySetting) {
          error = `debugFile is empty in settings but SDK options still contain debugFile=${JSON.stringify(sdkValue)}.`;
        } else {
          error = `debugFile is "${settingValue}" in settings but SDK options have debugFile=${JSON.stringify(sdkValue)}.`;
        }
        return {
          classification: 'fail',
          optionWired: false,
          settingValue,
          emptySetting,
          sdkOptionPresent,
          sdkValue,
          valueMatch: false,
          error,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingValue,
        emptySetting,
        sdkOptionPresent,
        sdkValue,
        valueMatch: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('debug file readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingValue: (this.options.settings.debugFile ?? '').trim(),
        emptySetting: (this.options.settings.debugFile ?? '').trim().length === 0,
        sdkOptionPresent: false,
        valueMatch: false,
        error: errorMessage,
      };
    }
  }

  async runStrictMcpConfigReadbackProbe(): Promise<StrictMcpConfigReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Strict MCP config readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingValue = this.options.settings.strictMcpConfig === true;
      const sdkOptionPresent = options.strictMcpConfig !== undefined && options.strictMcpConfig !== null;
      const sdkValue = sdkOptionPresent ? Boolean(options.strictMcpConfig) : undefined;
      const valueMatch = settingValue
        ? sdkOptionPresent && sdkValue === true
        : !sdkOptionPresent;
      const optionWired = valueMatch;
      if (!optionWired) {
        const error = settingValue
          ? `strictMcpConfig is true in settings but SDK options have strictMcpConfig=${String(options.strictMcpConfig)}.`
          : `strictMcpConfig is false in settings but SDK options still contain strictMcpConfig=${String(options.strictMcpConfig)}.`;
        return {
          classification: 'fail',
          optionWired: false,
          settingValue,
          sdkOptionPresent,
          sdkValue,
          valueMatch: false,
          error,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingValue,
        sdkOptionPresent,
        sdkValue,
        valueMatch: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('strict MCP config readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingValue: this.options.settings.strictMcpConfig === true,
        sdkOptionPresent: false,
        valueMatch: false,
        error: errorMessage,
      };
    }
  }

  async runDebugReadbackProbe(): Promise<DebugReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Debug readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingValue = this.options.settings.debug === true;
      const sdkOptionPresent = options.debug !== undefined && options.debug !== null;
      const sdkValue = sdkOptionPresent ? Boolean(options.debug) : undefined;
      const valueMatch = settingValue
        ? sdkOptionPresent && sdkValue === true
        : !sdkOptionPresent;
      const optionWired = valueMatch;
      if (!optionWired) {
        const error = settingValue
          ? `debug is true in settings but SDK options have debug=${String(options.debug)}.`
          : `debug is false in settings but SDK options still contain debug=${String(options.debug)}.`;
        return {
          classification: 'fail',
          optionWired: false,
          settingValue,
          sdkOptionPresent,
          sdkValue,
          valueMatch: false,
          error,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingValue,
        sdkOptionPresent,
        sdkValue,
        valueMatch: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('debug readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingValue: this.options.settings.debug === true,
        sdkOptionPresent: false,
        valueMatch: false,
        error: errorMessage,
      };
    }
  }

  async runContext1mBetaReadbackProbe(): Promise<Context1mBetaReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: '1M Context Beta readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingValue = this.options.settings.enableContext1mBeta === true;
      const sdkOptionPresent = Array.isArray(options.betas);
      const sdkValue = sdkOptionPresent ? options.betas : undefined;
      const expectedValue = ['context-1m-2025-08-07'];
      const valueMatch = settingValue
        ? sdkOptionPresent
          && sdkValue !== undefined
          && sdkValue.length === expectedValue.length
          && sdkValue[0] === expectedValue[0]
        : !sdkOptionPresent;
      const optionWired = valueMatch;
      if (!optionWired) {
        const error = settingValue
          ? `enableContext1mBeta is true in settings but SDK options have betas=${JSON.stringify(sdkValue)}.`
          : `enableContext1mBeta is false in settings but SDK options still contain betas=${JSON.stringify(sdkValue)}.`;
        return {
          classification: 'fail',
          optionWired: false,
          settingValue,
          sdkOptionPresent,
          sdkValue,
          valueMatch: false,
          error,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingValue,
        sdkOptionPresent,
        sdkValue,
        valueMatch: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('1M Context Beta readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingValue: this.options.settings.enableContext1mBeta === true,
        sdkOptionPresent: false,
        valueMatch: false,
        error: errorMessage,
      };
    }
  }

  async runJsRuntimeReadbackProbe(): Promise<JsRuntimeReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'JS Runtime readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingValue = this.options.settings.jsRuntime ?? '';
      const emptySetting = settingValue.length === 0;
      const sdkOptionPresent = options.executable !== undefined && options.executable !== null;
      const sdkValue = sdkOptionPresent ? String(options.executable) : undefined;
      const valueMatch = emptySetting
        ? !sdkOptionPresent
        : sdkOptionPresent && sdkValue === settingValue;
      const optionWired = valueMatch;
      if (!optionWired) {
        const error = emptySetting
          ? `jsRuntime is empty in settings but SDK options still contain executable=${JSON.stringify(sdkValue)}.`
          : `jsRuntime is '${settingValue}' in settings but SDK options have executable=${JSON.stringify(sdkValue)}.`;
        return {
          classification: 'fail',
          optionWired: false,
          settingValue,
          emptySetting,
          sdkOptionPresent,
          sdkValue,
          valueMatch: false,
          error,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingValue,
        emptySetting,
        sdkOptionPresent,
        sdkValue,
        valueMatch: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('JS Runtime readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingValue: this.options.settings.jsRuntime ?? '',
        emptySetting: (this.options.settings.jsRuntime ?? '').length === 0,
        sdkOptionPresent: false,
        valueMatch: false,
        error: errorMessage,
      };
    }
  }

  async runLoadTimeoutReadbackProbe(): Promise<LoadTimeoutReadbackProbeResult> {
    try {
      const abortController = new AbortController();
      const options = this.buildDiagnosticSdkOptions(abortController, {
        prompt: 'Load timeout readback proof.',
        _diagnosticBypassPermissions: true,
      });
      const settingValue = this.options.settings.loadTimeoutMs ?? null;
      const sdkOptionPresent = options.loadTimeoutMs !== undefined && options.loadTimeoutMs !== null;
      const sdkValue = sdkOptionPresent ? Number(options.loadTimeoutMs) : undefined;
      const valueMatch = settingValue !== null
        ? sdkOptionPresent && sdkValue === settingValue
        : !sdkOptionPresent;
      const optionWired = valueMatch;
      if (!optionWired) {
        const error = settingValue !== null
          ? `loadTimeoutMs is ${settingValue} in settings but SDK options have loadTimeoutMs=${JSON.stringify(sdkValue)}.`
          : `loadTimeoutMs is null in settings but SDK options still contain loadTimeoutMs=${JSON.stringify(sdkValue)}.`;
        return {
          classification: 'fail',
          optionWired: false,
          settingValue,
          sdkOptionPresent,
          sdkValue,
          valueMatch: false,
          error,
        };
      }
      return {
        classification: 'readback',
        optionWired: true,
        settingValue,
        sdkOptionPresent,
        sdkValue,
        valueMatch: true,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('load timeout readback probe', { result: 'fail', error: errorMessage });
      return {
        classification: 'fail',
        optionWired: false,
        settingValue: this.options.settings.loadTimeoutMs ?? null,
        sdkOptionPresent: false,
        valueMatch: false,
        error: errorMessage,
      };
    }
  }

  async runContinueProbe(): Promise<ContinueProbeResult> {
    const nonce = Math.random().toString(36).slice(2, 10);
    try {
      // Phase 1: seed with nonce
      const seedResult = await this.runDiagnosticPrompt({
        prompt: `Remember this nonce: ${nonce}. Reply with only "seed ok".`,
        persistSession: true,
        _diagnosticBypassPermissions: true,
      });
      const seedSessionId = seedResult.sessionId;
      if (!seedSessionId) {
        return { classification: 'fail', error: 'Seed query did not return a session id' };
      }

      // Phase 2: continue and ask to recall nonce
      const continueResult = await this.runDiagnosticPrompt({
        prompt: 'What was the nonce from the immediately previous turn? Reply with only the nonce.',
        _diagnosticContinue: true,
        _diagnosticBypassPermissions: true,
      });
      const continueSessionId = continueResult.sessionId;
      const text = this.extractTextFromChunks(continueResult.chunks);
      const nonceRecalled = text.includes(nonce);
      const sessionIdsMatch = seedSessionId === continueSessionId;

      if (sessionIdsMatch && nonceRecalled) {
        return {
          classification: 'pass',
          seedSessionId,
          continueSessionId,
          nonce,
          recalled: true,
          sessionIdsMatch: true,
          nonceRecalled: true,
        };
      }
      return {
        classification: 'fail',
        seedSessionId,
        continueSessionId,
        nonce,
        recalled: nonceRecalled,
        sessionIdsMatch,
        nonceRecalled,
        error: sessionIdsMatch ? 'Nonce not recalled' : 'Session ids mismatch',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('continue probe', { result: 'fail', error: errorMessage });
      return { classification: 'fail', error: errorMessage };
    }
  }

  async runResumeSessionAtProbe(): Promise<ResumeSessionAtProbeResult> {
    const alphaNonce = Math.random().toString(36).slice(2, 10);
    const betaNonce = Math.random().toString(36).slice(2, 10);
    try {
      // Phase 1a: seed with ALPHA
      const alphaResult = await this.runDiagnosticPrompt({
        prompt: `Remember this nonce: ${alphaNonce}. Reply with only "alpha ok".`,
        persistSession: true,
        _diagnosticBypassPermissions: true,
      });
      const seedSessionId = alphaResult.sessionId;
      if (!seedSessionId) {
        return { classification: 'fail', error: 'Alpha query did not return a session id' };
      }

      // Extract alpha assistant message UUID from raw messages
      const alphaMessageUuid = this.extractAssistantMessageUuid(alphaResult.rawMessages);
      if (!alphaMessageUuid) {
        return { classification: 'fail', error: 'Could not extract alpha assistant message UUID' };
      }

      // Phase 1b: send BETA in same session
      await this.runDiagnosticPrompt({
        prompt: `Remember this nonce: ${betaNonce}. Reply with only "beta ok".`,
        persistSession: true,
        resumeSessionId: seedSessionId,
        _diagnosticBypassPermissions: true,
        _diagnosticResumeAt: true,
      });

      // Phase 2: resume at alpha's UUID
      const resumeResult = await this.runDiagnosticPrompt({
        prompt: 'What was the last nonce? Reply with only the nonce.',
        resumeSessionId: seedSessionId,
        _diagnosticResumeAt: true,
        _diagnosticResumeSessionAt: alphaMessageUuid,
        _diagnosticBypassPermissions: true,
      });

      const text = this.extractTextFromChunks(resumeResult.chunks);
      const resumedAtAlpha = text.includes(alphaNonce) && !text.includes(betaNonce);
      const sessionId = resumeResult.sessionId;

      if (sessionId === seedSessionId && resumedAtAlpha) {
        return {
          classification: 'pass',
          seedSessionId,
          resumedSessionId: sessionId,
          sessionId,
          alphaNonce,
          betaNonce,
          alphaMessageUuid,
          recalledAlpha: true,
          resumedAtAlpha: true,
        };
      }
      return {
        classification: 'fail',
        seedSessionId,
        resumedSessionId: sessionId,
        sessionId,
        alphaNonce,
        betaNonce,
        alphaMessageUuid,
        recalledAlpha: resumedAtAlpha,
        resumedAtAlpha,
        error: sessionId !== seedSessionId ? 'Session ids mismatch' : 'Did not recall alpha nonce',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('resume session at probe', { result: 'fail', error: errorMessage });
      return { classification: 'fail', error: errorMessage };
    }
  }

  async runForkSessionProbe(): Promise<ForkSessionProbeResult> {
    const nonce = Math.random().toString(36).slice(2, 10);
    try {
      // Phase 1: seed with nonce
      const seedResult = await this.runDiagnosticPrompt({
        prompt: `Remember this nonce: ${nonce}. Reply with only "seed ok".`,
        persistSession: true,
        _diagnosticBypassPermissions: true,
      });
      const seedSessionId = seedResult.sessionId;
      if (!seedSessionId) {
        return { classification: 'fail', error: 'Seed query did not return a session id' };
      }

      // Phase 2: fork and recall
      const forkResult = await this.runDiagnosticPrompt({
        prompt: 'What was the nonce from the previous turn? Reply with only the nonce.',
        resumeSessionId: seedSessionId,
        _diagnosticForkSession: true,
        _diagnosticBypassPermissions: true,
      });
      const forkedSessionId = forkResult.sessionId;
      const text = this.extractTextFromChunks(forkResult.chunks);
      const nonceRecalled = text.includes(nonce);
      const sessionIdsDiffer = seedSessionId !== forkedSessionId;

      if (sessionIdsDiffer && nonceRecalled) {
        return {
          classification: 'pass',
          seedSessionId,
          forkedSessionId,
          nonce,
          recalled: true,
          sessionIdsDiffer: true,
          nonceRecalled: true,
        };
      }
      return {
        classification: 'fail',
        seedSessionId,
        forkedSessionId,
        nonce,
        recalled: nonceRecalled,
        sessionIdsDiffer,
        nonceRecalled,
        error: !sessionIdsDiffer ? 'Session ids match (no fork occurred)' : 'Nonce not recalled',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('fork session probe', { result: 'fail', error: errorMessage });
      return { classification: 'fail', error: errorMessage };
    }
  }

  async runSessionTitleProbe(requestedTitle: string): Promise<SessionTitleProbeResult> {
    try {
      const result = await this.runDiagnosticPrompt({
        prompt: 'Say "title probe test" and nothing else.',
        persistSession: true,
        _diagnosticTitle: requestedTitle,
        _diagnosticBypassPermissions: true,
      });
      const sessionId = result.sessionId;
      if (!sessionId) {
        return { classification: 'fail', requestedTitle, error: 'No session id returned' };
      }

      const sessionInfo = await this.getSession(sessionId);
      const customTitle = sessionInfo?.customTitle;
      if (customTitle === requestedTitle) {
        return {
          classification: 'pass',
          sessionId,
          requestedTitle,
          customTitle,
        };
      }
      return {
        classification: 'fail',
        sessionId,
        requestedTitle,
        customTitle,
        error: customTitle ? `customTitle mismatch: ${customTitle}` : 'customTitle absent',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('session title probe', { result: 'fail', error: errorMessage });
      return { classification: 'fail', requestedTitle, error: errorMessage };
    }
  }

  async runCustomSessionIdProbe(targetSessionId: string): Promise<CustomSessionIdProbeResult> {
    try {
      const result = await this.runDiagnosticPrompt({
        prompt: 'Say "session id probe test" and nothing else.',
        _diagnosticSessionId: targetSessionId,
        _diagnosticBypassPermissions: true,
      });
      const returnedSessionId = result.sessionId;
      if (returnedSessionId === targetSessionId) {
        return {
          classification: 'pass',
          requestedSessionId: targetSessionId,
          actualSessionId: returnedSessionId,
          returnedSessionId,
        };
      }
      return {
        classification: 'fail',
        requestedSessionId: targetSessionId,
        actualSessionId: returnedSessionId,
        returnedSessionId,
        error: returnedSessionId ? `Mismatch: expected ${targetSessionId}, got ${returnedSessionId}` : 'No session id returned',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      runtimeLogger.debug('custom session id probe', { result: 'fail', error: errorMessage });
      return { classification: 'fail', requestedSessionId: targetSessionId, error: errorMessage };
    }
  }

  private extractTextFromChunks(chunks: StreamChunk[]): string {
    return chunks
      .filter((c): c is Extract<StreamChunk, { type: 'text' }> => c.type === 'text')
      .map((c) => c.content)
      .join('');
  }

  private extractAssistantMessageUuid(messages: unknown[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (typeof msg !== 'object' || msg === null) continue;
      const rec = msg as Record<string, unknown>;
      if (rec.type === 'assistant' && typeof rec.uuid === 'string') {
        return rec.uuid.trim() || undefined;
      }
    }
    return undefined;
  }

  private async validateDiagnosticResumeSession(
    sdk: ClaudeCodeSdkFacade,
    resumeSessionId: string | undefined,
  ): Promise<void> {
    const trimmedResumeSessionId = resumeSessionId?.trim();
    if (!trimmedResumeSessionId) {
      return;
    }
    if (!sdk.getSessionInfo) {
      throw new Error('Claude Code diagnostic resume validation failed: SDK session lookup is unavailable.');
    }
    const sessionInfo = await sdk.getSessionInfo(trimmedResumeSessionId, { dir: this.options.vaultPath });
    if (!sessionInfo) {
      throw new Error(`Claude Code diagnostic resume validation failed: session "${trimmedResumeSessionId}" was not found in the Claude SDK session catalog.`);
    }
    const comparableSessionIds = resolveComparableSessionIds(sessionInfo);
    const mismatchedSessionId = comparableSessionIds.find((sessionId) => sessionId !== trimmedResumeSessionId);
    if (mismatchedSessionId) {
      throw new Error(`Claude Code diagnostic resume validation failed: SDK session lookup returned "${mismatchedSessionId}" for requested session "${trimmedResumeSessionId}".`);
    }
  }

  private validateDiagnosticResumeResult(
    resumeSessionId: string | undefined,
    resultingSessionId: string | undefined,
  ): string | undefined {
    const trimmedResumeSessionId = resumeSessionId?.trim();
    if (!trimmedResumeSessionId) {
      return resultingSessionId;
    }
    if (resultingSessionId !== trimmedResumeSessionId) {
      throw new Error(`Claude Code diagnostic resume validation failed: resumed query returned session "${resultingSessionId ?? '(none)'}" for requested session "${trimmedResumeSessionId}".`);
    }
    return resultingSessionId;
  }

  async *sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk> {
    const session = this.getOrRestoreSession(request.sessionId);
    runtimeLogger.debug('sendMessage start', {
      sessionId: request.sessionId,
      contentLength: request.content.length,
      ...summarizeSendOptions(request.options),
    });
    this.cancelledSessions.delete(request.sessionId);
    // Prompt hardening for structured-output sends: explicitly constrain the model
    // to return ONLY through the StructuredOutput tool and avoid any visible text
    // outside the structured output (markdown code fences, explanations, prose).
    const hasOutputFormat = request.options?.outputFormat != null
      && typeof request.options.outputFormat === 'object'
      && Object.keys(request.options.outputFormat).length > 0;
    const promptContent = hasOutputFormat
      ? `You MUST return your complete response ONLY through the StructuredOutput tool using the provided JSON schema. Do NOT output markdown code blocks, JSON fences, explanations, or any conversational text outside the structured output.\n\n${request.content}`
      : request.content;
    const prompt = createUserPrompt(promptContent);
    session.messages.push(prompt);
    let runtime: ClaudeCodeSessionRuntime;
    try {
      runtime = await this.getOrStartRuntime(session, request.options);
      runtimeLogger.debug('sendMessage runtime-ready', summarizeSession(session));
    } catch (error) {
      this.setStatus('error');
      runtimeLogger.debug('sendMessage error', {
        sessionId: request.sessionId,
        phase: 'runtime-ready',
        error: summarizeError(error),
      });
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield {
        type: 'error',
        content: errorMessage.startsWith('Claude Code resume validation failed')
          ? errorMessage
          : `Claude Code SDK unavailable: ${errorMessage}`,
      };
      return;
    }

    runtime.input.push(prompt);

    let sawChunk = false;
    try {
      for await (const item of runtime.output) {
        if (this.cancelledSessions.has(request.sessionId)) {
          return;
        }
        if (item.type === 'error') {
          runtimeLogger.debug('sendMessage error', {
            sessionId: request.sessionId,
            phase: 'runtime-output',
            error: summarizeError(item.error),
          });
          yield {
            type: 'error',
            content: `Claude Code stream failed: ${item.error instanceof Error ? item.error.message : String(item.error)}`,
          };
          return;
        }

        const chunks = runtime.normalizer.transformSDKMessage(item.message);
        this.captureSdkSessionId(session, item.message, chunks);
        for (const chunk of chunks) {
          sawChunk = true;
          yield chunk;
        }
        if (isTurnBoundaryMessage(item.message)) {
          runtimeLogger.debug('sendMessage complete', {
            sessionId: request.sessionId,
            sawChunk,
            boundary: true,
          });
          return;
        }
      }
    } catch (error) {
      runtimeLogger.debug('sendMessage error', {
        sessionId: request.sessionId,
        phase: 'stream',
        error: summarizeError(error),
      });
      yield {
        type: 'error',
        content: `Claude Code stream failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      if (!sawChunk) { return; }
    }
    runtimeLogger.debug('sendMessage complete', {
      sessionId: request.sessionId,
      sawChunk,
      boundary: false,
    });
  }

  cancelStream(sessionId: string): void {
    runtimeLogger.debug('close runtime', { sessionId, reason: 'cancelStream' });
    this.cancelledSessions.add(sessionId);
    const session = this.sessions.get(sessionId);
    void session?.runtime?.query?.interrupt?.();
    if (session) {
      this.closeRuntime(session);
    }
  }

  async setModel(model?: string): Promise<void> {
    await this.applyToActiveQueries((runtime) => runtime.query?.setModel?.(model));
  }

  async setPermissionMode(mode: ClaudeCodeBackendSettings['permissionMode']): Promise<void> {
    await this.applyToActiveQueries((runtime) => runtime.query?.setPermissionMode?.(mode));
  }

  async reloadMcpServers(): Promise<void> {
    mcpLogger.debug('MCP config reload', { hadCachedConfig: this.cachedMcpServers !== undefined });
    this.refreshMcpConfig();
    await this.loadMcpConfig();
    await this.applyToActiveQueries((runtime) =>
      runtime.query?.setMcpServers?.(this.options.mcpServers ?? this.cachedMcpServers ?? {}));
  }

  async restartPersistentQueries(reason = 'manual'): Promise<void> {
    runtimeLogger.debug('runtime restart requested', {
      reason,
      sessionCount: this.sessions.size,
    });
    for (const session of this.sessions.values()) {
      if (session.runtime && !session.runtime.closed) {
        runtimeLogger.debug('runtime close', {
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
          reason: `restart:${reason}`,
        });
        this.closeRuntime(session);
      }
    }
  }

  private cachedMcpServers: ClaudeCodeMcpServersMap | undefined;

  private buildSdkOptions(
    abortController?: AbortController,
    session?: ClaudeCodeSessionState,
    sendOptions?: Record<string, unknown>,
  ): ClaudeCodeSdkOptionsShape {
    const overrides = resolveSendOptionOverrides(sendOptions);
    const options = buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: {
        ...this.options.settings,
        ...(overrides.model ? { model: overrides.model } : {}),
        ...(overrides.effort ? { effort: overrides.effort } : {}),
      },
      pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      abortController,
      spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
      canUseTool: this.options.permissionBridge
        ? this.options.permissionBridge.canUseTool.bind(this.options.permissionBridge)
        : undefined,
      onElicitation: this.options.onElicitation
        ? async (request: ElicitationRequest, context: { signal: AbortSignal }) =>
          await this.options.onElicitation!(request, context)
        : undefined,
      mcpServers: this.options.mcpServers ?? this.cachedMcpServers,
      hooks: this.options.hooks,
      sessionStore: this.options.sessionStore,
      sessionStoreFlush: this.options.sessionStoreFlush,
      // One-shot structured-output trigger from ordinary chat `/json` prefix takes
      // precedence over the adapter-level default. Diagnostic probes still use
      // buildDiagnosticSdkOptions which has its own override path.
      outputFormat: sendOptions?.outputFormat && typeof sendOptions.outputFormat === 'object'
        ? sendOptions.outputFormat as Record<string, unknown>
        : this.options.outputFormat,
      plugins: this.options.plugins,
      skills: this.options.skills,
      agent: this.options.agent,
      agents: this.options.agents,
      // Ordinary resume path: only the session's own captured sdkSessionId is used.
      // Arbitrary resume-at ids are rejected; use runDiagnosticPrompt() for diagnostic resume.
      resumeSessionId: session?.sdkSessionId,
      // Pass session title only on first query (no resume). SDK docs say title
      // has no effect on persisted title when resuming an existing session.
      title: !session?.sdkSessionId && session?.title ? session.title : undefined,
    });
    runtimeLogger.debug('buildSdkOptions tool config', {
      allowedToolCount: options.allowedTools?.length ?? 0,
      disallowedToolCount: options.disallowedTools?.length ?? 0,
      allowedTools: options.allowedTools,
      disallowedTools: options.disallowedTools,
    });
    runtimeLogger.debug('buildSdkOptions limits config', {
      maxTurns: options.maxTurns ?? null,
      maxBudgetUsd: options.maxBudgetUsd ?? null,
    });
    runtimeLogger.debug('buildSdkOptions fallback model', {
      fallbackModel: options.fallbackModel ?? null,
    });
    return options;
  }

  private resolveDiagnosticSettings(
    request: ClaudeCodeDiagnosticPromptRequest,
  ): ClaudeCodeBackendSettings {
    const bypassPermissions = request._diagnosticBypassPermissions === true;
    let diagnosticSettings = bypassPermissions
      ? { ...this.options.settings, permissionMode: 'bypassPermissions' as const }
      : { ...this.options.settings };
    if (request._diagnosticMaxTurns !== undefined && request._diagnosticMaxTurns !== null) {
      diagnosticSettings = { ...diagnosticSettings, maxTurns: request._diagnosticMaxTurns };
    }
    if (!bypassPermissions && request._diagnosticForcePermissionMode) {
      diagnosticSettings = { ...diagnosticSettings, permissionMode: request._diagnosticForcePermissionMode };
    }
    if (request._diagnosticSystemPrompt !== undefined) {
      diagnosticSettings = { ...diagnosticSettings, systemPrompt: request._diagnosticSystemPrompt };
    }
    return diagnosticSettings;
  }

  private resolveDiagnosticCanUseTool(
    request: ClaudeCodeDiagnosticPromptRequest,
    bypassPermissions: boolean,
  ): unknown {
    if (bypassPermissions) return undefined;
    if (request._diagnosticCanUseTool) return request._diagnosticCanUseTool;
    return this.options.permissionBridge
      ? this.options.permissionBridge.canUseTool.bind(this.options.permissionBridge)
      : undefined;
  }

  private buildDiagnosticSdkOptions(
    abortController: AbortController | undefined,
    request: ClaudeCodeDiagnosticPromptRequest,
  ): ClaudeCodeSdkOptionsShape {
    const bypassPermissions = request._diagnosticBypassPermissions === true;
    const diagnosticSettings = this.resolveDiagnosticSettings(request);
    const options = buildClaudeCodeOptions({
      vaultPath: this.options.vaultPath,
      settings: diagnosticSettings,
      pathToClaudeCodeExecutable: this.options.pathToClaudeCodeExecutable,
      abortController,
      spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
      canUseTool: this.resolveDiagnosticCanUseTool(request, bypassPermissions),
      onElicitation: bypassPermissions
        ? undefined
        : this.options.onElicitation
          ? async (promptRequest: ElicitationRequest, context: { signal: AbortSignal }) =>
            await this.options.onElicitation!(promptRequest, context)
          : undefined,
      mcpServers: this.options.mcpServers ?? this.cachedMcpServers,
      hooks: request.hooks ?? this.options.hooks,
      sessionStore: request.sessionStore ?? this.options.sessionStore,
      sessionStoreFlush: request.sessionStoreFlush ?? this.options.sessionStoreFlush,
      outputFormat: request.outputFormat ?? this.options.outputFormat,
      enableFileCheckpointing: request.sessionStore ? false : request.enableFileCheckpointing,
      includeHookEvents: request.includeHookEvents,
      forwardSubagentText: request.forwardSubagentText,
      agentProgressSummaries: request.agentProgressSummaries,
      persistSession: request.persistSession,
      resumeSessionId: request.resumeSessionId,
      fallbackModel: request.fallbackModel,
      model: request.model,
      agent: request.agent ?? this.options.agent,
      agents: request.agents ?? this.options.agents,
      skills: request.skills ?? this.options.skills,
      plugins: request.plugins ?? this.options.plugins,
    });
    if (request._diagnosticToolRestriction) {
      options.tools = [...request._diagnosticToolRestriction];
    }
    if (request._diagnosticStderrCallback) {
      options.stderr = request._diagnosticStderrCallback;
    }
    if (request._diagnosticSessionId) {
      options.sessionId = request._diagnosticSessionId;
    }
    if (request._diagnosticContinue === true) {
      options.continue = true;
    }
    if (request._diagnosticResumeSessionAt) {
      options.resumeSessionAt = request._diagnosticResumeSessionAt;
    }
    if (request._diagnosticForkSession === true) {
      options.forkSession = true;
    }
    if (request._diagnosticTitle) {
      options.title = request._diagnosticTitle;
    }
    this.lastDiagnosticSdkOptions = options;
    return options;
  }

  /**
   * Return a deep clone of the last SDK options built by a diagnostic prompt.
   * This is a read-only diagnostic surface for verifying that stable settings
   * (allowedTools, disallowedTools, maxTurns, maxBudgetUsd, env, fallbackModel)
   * were correctly mapped into the SDK options shape.
   */
  inspectLastDiagnosticSdkOptions(): ClaudeCodeSdkOptionsShape | null {
    if (!this.lastDiagnosticSdkOptions) return null;
    try {
      return structuredClone(this.lastDiagnosticSdkOptions) as ClaudeCodeSdkOptionsShape;
    } catch {
      // Fallback for environments where structuredClone is unavailable
      return JSON.parse(JSON.stringify(this.lastDiagnosticSdkOptions)) as ClaudeCodeSdkOptionsShape;
    }
  }

  /**
   * Load MCP server config from the loader callback and cache it for
   * subsequent SDK query calls. Call this before the first send or after
   * MCP settings change. Safe to call multiple times.
   */
  async loadMcpConfig(): Promise<void> {
    if (this.options.mcpServers) {
      mcpLogger.debug('MCP config load', {
        source: 'static',
        serverCount: Object.keys(this.options.mcpServers).length,
      });
      return;
    }
    if (this.cachedMcpServers !== undefined) {
      mcpLogger.debug('MCP config load', {
        source: 'cache',
        serverCount: Object.keys(this.cachedMcpServers).length,
      });
      return;
    }
    if (!this.options.mcpConfigLoader) {
      mcpLogger.debug('MCP config load', { source: 'none', serverCount: 0 });
      return;
    }
    try {
      this.cachedMcpServers = await this.options.mcpConfigLoader();
      mcpLogger.debug('MCP config load', {
        source: 'loader',
        serverCount: Object.keys(this.cachedMcpServers).length,
      });
    } catch (error) {
      this.cachedMcpServers = undefined;
      mcpLogger.debug('MCP config load', {
        source: 'loader',
        error: summarizeError(error),
      });
    }
  }

  /** Invalidate the cached MCP config so the next loadMcpConfig reloads it. */
  refreshMcpConfig(): void {
    mcpLogger.debug('MCP config reload', { action: 'refresh-cache' });
    this.cachedMcpServers = undefined;
  }

  /**
   * Return the number of MCP servers currently loaded into the adapter.
   * Returns 0 if no config has been loaded yet. Includes both static
   * (options.mcpServers) and dynamically loaded (mcpConfigLoader) servers.
   */
  getMcpServerCount(): number {
    const servers = this.options.mcpServers ?? this.cachedMcpServers;
    return servers ? Object.keys(servers).length : 0;
  }

  /**
   * Return the names of MCP servers currently loaded into the adapter.
   * Returns an empty list if no config has been loaded yet. Read-only
   * visibility only — MCP authoring stays in the shared MCP settings surface.
   */
  getMcpServerNames(): string[] {
    const servers = this.options.mcpServers ?? this.cachedMcpServers;
    return servers ? Object.keys(servers).sort((a, b) => a.localeCompare(b)) : [];
  }

  /**
   * Return the number of plugins currently wired into the adapter.
   * Returns 0 if no plugins have been configured.
   */
  getPluginCount(): number {
    return this.options.plugins?.length ?? 0;
  }

  /**
   * Return the number of skills currently wired into the adapter.
   * Returns 0 if no skills have been configured.
   * Returns -1 to indicate "all skills" when `skills` is set to `'all'`.
   */
  getSkillCount(): number {
    const skills = this.options.skills;
    if (skills === 'all') {
      return -1;
    }
    return skills?.length ?? 0;
  }

  /**
   * Return the list of skill names currently wired into the adapter.
   * Returns `'all'` when all skills are enabled.
   * Returns a copy of the names array, or an empty array if none configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getSkillsList(): string[] | 'all' {
    const skills = this.options.skills;
    if (skills === 'all') {
      return 'all';
    }
    return skills ? [...skills] : [];
  }

  /**
   * Return the list of plugin identifiers currently wired into the adapter.
   * Returns stringified identifiers (plugin items may be strings or objects).
   * Returns an empty array if none configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getPluginsList(): string[] {
    return this.options.plugins
      ? this.options.plugins.map(p => typeof p === 'string' ? p : JSON.stringify(p))
      : [];
  }

  /**
   * Return the number of agent definitions currently wired into the adapter.
   * Counts both the single `agent` selector and entries in the `agents` map.
   * Returns 0 if neither is configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getAgentDefinitionCount(): number {
    let count = 0;
    if (typeof this.options.agent === 'string' && this.options.agent.trim().length > 0) {
      count += 1;
    }
    if (this.options.agents && typeof this.options.agents === 'object') {
      count += Object.keys(this.options.agents).length;
    }
    return count;
  }

  /**
   * Return the list of agent definition names currently wired into the adapter.
   * Includes the single `agent` selector (if set) followed by keys from the
   * `agents` map. Returns an empty array if neither is configured.
   * Diagnostic read-only surface — no authoring UI.
   */
  getAgentDefinitionsList(): string[] {
    const names: string[] = [];
    if (typeof this.options.agent === 'string' && this.options.agent.trim().length > 0) {
      names.push(this.options.agent.trim());
    }
    if (this.options.agents && typeof this.options.agents === 'object') {
      names.push(...Object.keys(this.options.agents));
    }
    return names;
  }

  private async applyToActiveQueries(
    apply: (runtime: ClaudeCodeSessionRuntime) => Promise<unknown> | void | undefined,
  ): Promise<void> {
    const updates: Array<Promise<unknown>> = [];
    for (const session of this.sessions.values()) {
      const runtime = session.runtime;
      if (!runtime || runtime.closed) {
        continue;
      }
      const result = apply(runtime);
      if (result) {
        updates.push(result);
      }
    }
    await Promise.all(updates);
  }

  private captureSdkSessionId(
    session: ClaudeCodeSessionState,
    message: unknown,
    chunks: readonly StreamChunk[],
  ): void {
    const sdkSessionId = resolveDiagnosticSessionId(message, chunks);
    if (!sdkSessionId || sdkSessionId === session.sdkSessionId) {
      return;
    }
    if (session.sdkSessionId) {
      this.closeRuntime(session);
      throw new Error(`Claude Code resume validation failed: resumed query returned session "${sdkSessionId}" for requested session "${session.sdkSessionId}".`);
    }
    session.sdkSessionId = sdkSessionId;
    this.sessions.set(sdkSessionId, session);
  }

  private async validateUserResumeSession(
    sdk: ClaudeCodeSdkFacade,
    session: ClaudeCodeSessionState,
  ): Promise<void> {
    const sdkSessionId = session.sdkSessionId?.trim();
    if (!sdkSessionId || !session.resumeValidationRequired) {
      return;
    }
    if (!sdk.getSessionInfo) {
      throw new Error('Claude Code resume validation failed: SDK session lookup is unavailable.');
    }
    const sessionInfo = await sdk.getSessionInfo(sdkSessionId, { dir: this.options.vaultPath });
    if (!sessionInfo) {
      throw new Error(`Claude Code resume validation failed: session "${sdkSessionId}" was not found in the Claude SDK session catalog.`);
    }
    const comparableSessionIds = resolveComparableSessionIds(sessionInfo);
    if (comparableSessionIds.length === 0) {
      throw new Error(`Claude Code resume validation failed: SDK session lookup returned no comparable identity for requested session "${sdkSessionId}".`);
    }
    const mismatchedSessionId = comparableSessionIds.find((sessionId) => sessionId !== sdkSessionId);
    if (mismatchedSessionId) {
      throw new Error(`Claude Code resume validation failed: SDK session lookup returned "${mismatchedSessionId}" for requested session "${sdkSessionId}".`);
    }
    session.resumeValidationRequired = false;
  }

  private async getOrStartRuntime(
    session: ClaudeCodeSessionState,
    sendOptions?: Record<string, unknown>,
  ): Promise<ClaudeCodeSessionRuntime> {
    const overrides = resolveSendOptionOverrides(sendOptions);
    if (session.runtime && !session.runtime.closed) {
      const nextEffort = overrides.effort ?? this.options.settings.effort;
      if (nextEffort !== session.runtime.effort) {
        runtimeLogger.debug('runtime close', {
          sessionId: session.id,
          reason: 'effort-change',
          previousEffort: session.runtime.effort,
          nextEffort,
        });
        this.closeRuntime(session);
      } else {
        if (overrides.model) {
          await session.runtime.query?.setModel?.(overrides.model);
        }
        runtimeLogger.debug('runtime reuse', {
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
          effort: session.runtime.effort,
          hasModelOverride: Boolean(overrides.model),
        });
        return session.runtime;
      }
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    await this.validateUserResumeSession(sdk, session);
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const runtime: ClaudeCodeSessionRuntime = {
      input: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
      output: new ClaudeCodeAsyncQueue<ClaudeCodeRuntimeOutput>(),
      normalizer: new ClaudeCodeStreamNormalizer({
        sessionId: session.sdkSessionId ?? session.id,
      }),
      abortController,
      effort: overrides.effort ?? this.options.settings.effort,
      closed: false,
    };
    runtimeLogger.debug('runtime create', {
      sessionId: session.id,
      sdkSessionId: session.sdkSessionId,
      effort: runtime.effort,
    });
    runtimeLogger.debug('SDK query creation', {
      sessionId: session.id,
      sdkSessionId: session.sdkSessionId,
      cwd: this.options.vaultPath,
      ...summarizeSendOptions(sendOptions),
    });
    runtime.query = sdk.query({
      prompt: runtime.input,
      options: this.buildSdkOptions(abortController, session, sendOptions),
    });
    session.runtime = runtime;
    void this.pumpRuntimeOutput(session, runtime);
    return runtime;
  }

  private async getModelCatalogQuery(): Promise<ClaudeCodeModelCatalogQuery> {
    for (const session of this.sessions.values()) {
      const query = session.runtime?.query;
      if (query?.supportedModels) {
        runtimeLogger.debug('SDK query creation', {
          source: 'runtime-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          supportedModels: query.supportedModels.bind(query),
          shouldClose: false,
        };
      }
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    runtimeLogger.debug('SDK query creation', {
      source: 'model-catalog',
      cwd: this.options.vaultPath,
    });
    return sdk.query({
      prompt: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
      options: this.buildSdkOptions(abortController),
    });
  }

  private async getRuntimeCatalogQuery(): Promise<ClaudeCodeRuntimeCatalogQuery> {
    let hasActiveQuery = false;
    for (const session of this.sessions.values()) {
      if (!session.runtime?.query || session.runtime.closed) {
        continue;
      }
      hasActiveQuery = true;
      const query = session.runtime.query as ClaudeCodeRuntimeQueryWithCatalog;
      if (typeof query.supportedCommands === 'function' && typeof query.supportedAgents === 'function') {
        runtimeLogger.debug('SDK query creation', {
          source: 'runtime-catalog-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          supportedCommands: query.supportedCommands.bind(query),
          supportedAgents: query.supportedAgents.bind(query),
          shouldClose: false,
        };
      }
    }
    if (hasActiveQuery) {
      runtimeLogger.debug('runtime catalog unavailable', { reason: 'active-query-missing-catalog-methods' });
      return { shouldClose: false };
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const prompt = new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>();
    runtimeLogger.debug('SDK query creation', {
      source: 'runtime-catalog-readback',
      cwd: this.options.vaultPath,
    });
    try {
      const query = sdk.query({
        prompt,
        options: this.buildSdkOptions(abortController),
      });
      const readbackQuery: ClaudeCodeRuntimeCatalogQuery = {
        closeInput: () => {
          prompt.close();
          abortController.abort();
        },
      };
      if (typeof query.supportedCommands === 'function') {
        readbackQuery.supportedCommands = query.supportedCommands.bind(query);
      }
      if (typeof query.supportedAgents === 'function') {
        readbackQuery.supportedAgents = query.supportedAgents.bind(query);
      }
      if (typeof query.close === 'function') {
        readbackQuery.close = query.close.bind(query);
      }
      return readbackQuery;
    } catch (error) {
      prompt.close();
      abortController.abort();
      throw error;
    }
  }

  private async getRuntimeSettingsQuery(): Promise<ClaudeCodeRuntimeSettingsQuery> {
    let hasActiveQuery = false;
    for (const session of this.sessions.values()) {
      if (!session.runtime?.query || session.runtime.closed) {
        continue;
      }
      hasActiveQuery = true;
      const query = session.runtime.query as ClaudeCodeRuntimeQueryWithSettings;
      if (typeof query?.getSettings === 'function') {
        runtimeLogger.debug('SDK query creation', {
          source: 'runtime-settings-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          getSettings: query.getSettings.bind(query),
          shouldClose: false,
        };
      }
    }
    if (hasActiveQuery) {
      runtimeLogger.debug('runtime settings unavailable', { reason: 'active-query-missing-getSettings' });
      return { shouldClose: false };
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const prompt = new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>();
    runtimeLogger.debug('SDK query creation', {
      source: 'runtime-settings-readback',
      cwd: this.options.vaultPath,
    });
    try {
      const query = sdk.query({
        prompt,
        options: this.buildSdkOptions(abortController),
      });
      const readbackQuery: ClaudeCodeRuntimeSettingsQuery = {
        closeInput: () => {
          prompt.close();
          abortController.abort();
        },
      };
      if (typeof query.getSettings === 'function') {
        readbackQuery.getSettings = query.getSettings.bind(query);
      }
      if (typeof query.close === 'function') {
        readbackQuery.close = query.close.bind(query);
      }
      return readbackQuery;
    } catch (error) {
      prompt.close();
      throw error;
    }
  }

  private async getContextUsageQuery(): Promise<ClaudeCodeContextUsageQuery> {
    let hasActiveQuery = false;
    for (const session of this.sessions.values()) {
      if (!session.runtime?.query || session.runtime.closed) {
        continue;
      }
      hasActiveQuery = true;
      const query = session.runtime.query as ClaudeCodeRuntimeQueryWithContextUsage;
      if (typeof query?.getContextUsage === 'function') {
        runtimeLogger.debug('SDK query creation', {
          source: 'context-usage-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          getContextUsage: query.getContextUsage.bind(query),
          shouldClose: false,
        };
      }
    }
    if (hasActiveQuery) {
      runtimeLogger.debug('context usage unavailable', { reason: 'active-query-missing-getContextUsage' });
      return { shouldClose: false };
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const prompt = new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>();
    runtimeLogger.debug('SDK query creation', {
      source: 'context-usage-readback',
      cwd: this.options.vaultPath,
    });
    try {
      const query = sdk.query({
        prompt,
        options: this.buildSdkOptions(abortController),
      });
      const readbackQuery: ClaudeCodeContextUsageQuery = {
        closeInput: () => {
          prompt.close();
          abortController.abort();
        },
      };
      if (typeof query.getContextUsage === 'function') {
        readbackQuery.getContextUsage = query.getContextUsage.bind(query);
      }
      if (typeof query.close === 'function') {
        readbackQuery.close = query.close.bind(query);
      }
      return readbackQuery;
    } catch (error) {
      prompt.close();
      throw error;
    }
  }

  private async getAccountInfoQuery(): Promise<ClaudeCodeAccountInfoQuery> {
    let hasActiveQuery = false;
    for (const session of this.sessions.values()) {
      if (!session.runtime?.query || session.runtime.closed) {
        continue;
      }
      hasActiveQuery = true;
      const query = session.runtime.query as ClaudeCodeRuntimeQueryWithAccountInfo;
      if (typeof query?.accountInfo === 'function') {
        runtimeLogger.debug('SDK query creation', {
          source: 'account-info-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          accountInfo: query.accountInfo.bind(query),
          shouldClose: false,
        };
      }
    }
    if (hasActiveQuery) {
      runtimeLogger.debug('account info unavailable', { reason: 'active-query-missing-accountInfo' });
      return { shouldClose: false };
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const prompt = new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>();
    runtimeLogger.debug('SDK query creation', {
      source: 'account-info-readback',
      cwd: this.options.vaultPath,
    });
    try {
      const query = sdk.query({
        prompt,
        options: this.buildSdkOptions(abortController),
      });
      const readbackQuery: ClaudeCodeAccountInfoQuery = {
        closeInput: () => {
          prompt.close();
          abortController.abort();
        },
      };
      if (typeof query.accountInfo === 'function') {
        readbackQuery.accountInfo = query.accountInfo.bind(query);
      }
      if (typeof query.close === 'function') {
        readbackQuery.close = query.close.bind(query);
      }
      return readbackQuery;
    } catch (error) {
      prompt.close();
      throw error;
    }
  }

  private async getRuntimeFileQuery(): Promise<ClaudeCodeRuntimeFileQuery> {
    let hasActiveQuery = false;
    for (const session of this.sessions.values()) {
      if (!session.runtime?.query || session.runtime.closed) {
        continue;
      }
      hasActiveQuery = true;
      const query = session.runtime.query as ClaudeCodeRuntimeQueryWithFileReadback;
      if (typeof query?.readFile === 'function') {
        runtimeLogger.debug('SDK query creation', {
          source: 'runtime-file-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          readFile: query.readFile.bind(query),
          shouldClose: false,
        };
      }
    }
    if (hasActiveQuery) {
      runtimeLogger.debug('runtime file readback unavailable', { reason: 'active-query-missing-readFile' });
      return { shouldClose: false };
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    const prompt = new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>();
    runtimeLogger.debug('SDK query creation', {
      source: 'runtime-file-readback',
      cwd: this.options.vaultPath,
    });
    try {
      const query = sdk.query({
        prompt,
        options: this.buildSdkOptions(abortController),
      });
      const readbackQuery: ClaudeCodeRuntimeFileQuery = {
        closeInput: () => {
          prompt.close();
          abortController.abort();
        },
      };
      if (typeof query?.readFile === 'function') {
        readbackQuery.readFile = query.readFile.bind(query);
      }
      if (typeof query?.close === 'function') {
        readbackQuery.close = query.close.bind(query);
      }
      return readbackQuery;
    } catch (error) {
      prompt.close();
      abortController.abort();
      throw error;
    }
  }

  private async getMcpServerStatusQuery(): Promise<ClaudeCodeMcpServerStatusQuery> {
    for (const session of this.sessions.values()) {
      const query = session.runtime?.query as ClaudeCodeRuntimeQueryWithMcpServerStatus | undefined;
      if (typeof query?.mcpServerStatus === 'function') {
        mcpLogger.debug('SDK query creation', {
          source: 'mcp-status-reuse',
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
        });
        return {
          mcpServerStatus: query.mcpServerStatus.bind(query),
          shouldClose: false,
        };
      }
    }

    await this.ensureReadyForQuery();
    const sdk = await this.getSdk();
    const abortController = new ClaudeCodeRuntimeAbortController() as AbortController;
    mcpLogger.debug('SDK query creation', {
      source: 'mcp-status-readback',
      cwd: this.options.vaultPath,
    });
    return sdk.query({
      prompt: new ClaudeCodeAsyncQueue<ClaudeCodeQueuedPrompt>(),
      options: this.buildSdkOptions(abortController),
    });
  }

  private async ensureReadyForQuery(): Promise<void> {
    await this.loadMcpConfig();
    this.setStatus('connected');
  }

  private async pumpRuntimeOutput(
    session: ClaudeCodeSessionState,
    runtime: ClaudeCodeSessionRuntime,
  ): Promise<void> {
    try {
      for await (const message of runtime.query ?? []) {
        runtime.output.push({ type: 'message', message });
        // Post-result prompt suggestions bypass the normal streaming consumer
        // (sendMessage returns at the turn boundary) and are delivered through
        // the dedicated post-result callback channel.
        if (isPromptSuggestionMessage(message)) {
          const chunks = runtime.normalizer.transformSDKMessage(message);
          for (const chunk of chunks) {
            this.firePostResultChunk(chunk);
          }
        }
      }
    } catch (error) {
      runtimeLogger.debug('sendMessage error', {
        sessionId: session.id,
        phase: 'runtime-pump',
        error: summarizeError(error),
      });
      runtime.output.push({ type: 'error', error });
    } finally {
      runtime.closed = true;
      runtime.input.close();
      runtime.output.close();
      if (session.runtime === runtime) {
        delete session.runtime;
      }
      runtimeLogger.debug('runtime close', {
        sessionId: session.id,
        sdkSessionId: session.sdkSessionId,
        reason: 'pump-finally',
      });
    }
  }

  private closeRuntime(session: ClaudeCodeSessionState): void {
    const runtime = session.runtime;
    if (!runtime) {
      return;
    }
    runtimeLogger.debug('runtime close', {
      sessionId: session.id,
      sdkSessionId: session.sdkSessionId,
      reason: 'closeRuntime',
    });
    runtime.closed = true;
    runtime.abortController.abort();
    runtime.input.close();
    runtime.output.close();
    runtime.query?.close?.();
    delete session.runtime;
  }

  private readonly spawnClaudeCodeProcess = (request: ClaudeCodeSpawnRequest) => {
    const envKeys = Object.keys(request.env ?? {});
    runtimeLogger.debug('spawn command', {
      command: request.command,
      cwd: request.cwd,
      argCount: request.args.length,
      envKeyCount: envKeys.length,
      envKeys,
    });
    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: request.env as NodeJS.ProcessEnv,
      windowsHide: true,
    });

    request.signal?.addEventListener('abort', () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    }, { once: true });

    child.on('exit', (code, signal) => {
      runtimeLogger.debug('spawn exit', {
        command: request.command,
        cwd: request.cwd,
        code,
        signal,
      });
    });
    child.on('error', (error) => {
      runtimeLogger.debug('spawn error', {
        command: request.command,
        cwd: request.cwd,
        error: summarizeError(error),
      });
    });

    return {
      stdin: child.stdin,
      stdout: child.stdout,
      get killed() {
        return child.killed;
      },
      get exitCode() {
        return child.exitCode;
      },
      kill: child.kill.bind(child),
      on: child.on.bind(child),
      once: child.once.bind(child),
      off: child.off.bind(child),
    };
  };

  private getSdk(): Promise<ClaudeCodeSdkFacade> {
    if (this.options.sdk) {
      runtimeLogger.debug('SDK load', { source: 'injected' });
      return Promise.resolve(this.options.sdk);
    }
    if (!this.options.sdkLoader) {
      runtimeLogger.debug('SDK load', { source: 'missing-loader' });
      return Promise.reject(new Error('No Claude Code SDK loader configured'));
    }
    if (!this.sdkLoadPromise) {
      runtimeLogger.debug('SDK load', { source: 'loader' });
      this.sdkLoadPromise = this.options.sdkLoader();
    } else {
      runtimeLogger.debug('SDK load', { source: 'cache' });
    }
    return this.sdkLoadPromise;
  }

  private requireSession(sessionId: string): ClaudeCodeSessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Claude Code session not found: ${sessionId}`);
    }
    return session;
  }

  private getOrRestoreSession(sessionId: string): ClaudeCodeSessionState {
    this.assertSessionNotInvalidated(sessionId);
    const session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    const restoredSession: ClaudeCodeSessionState = {
      id: sessionId,
      title: 'Restored Claude Code chat',
      messages: [],
      ...(isOpenCodianLocalClaudeSessionId(sessionId)
        ? {}
        : { sdkSessionId: sessionId, resumeValidationRequired: true }),
    };
    this.sessions.set(sessionId, restoredSession);
    sessionLogger.debug('get session', {
      sessionId,
      restored: true,
      sdkSessionId: restoredSession.sdkSessionId,
    });
    return restoredSession;
  }

  private assertSessionNotInvalidated(sessionId: string): void {
    if (this.invalidatedSessions.has(sessionId)) {
      throw new Error(`Claude Code session not found: ${sessionId}`);
    }
  }

  private setStatus(status: AgentConnectionStatus): void {
    if (this.statusValue === status) {
      return;
    }
    runtimeLogger.debug('status change', {
      from: this.statusValue,
      to: status,
    });
    this.statusValue = status;
    for (const handler of this.statusChangeHandlers) {
      handler(status);
    }
  }
}
