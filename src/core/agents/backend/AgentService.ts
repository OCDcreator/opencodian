/**
 * AgentService — the core interface every agent adapter must implement.
 *
 * This is the minimal contract that allows the plugin to use any backend
 * (OpenCode, Claude Code, Codex, Copilot, Pi) through a uniform API.
 *
 * Capability-specific extensions live in separate optional interfaces
 * (see the capability interfaces below). Adapters implement only the
 * capabilities they support.
 *
 * See docs/requirements/multi-agent-foundation/02-architecture.md §2–3.
 */

import type { AgentBackendKind, ImageAttachment, StreamChunk } from '../../types/chat';
import type { SessionDiffEntry } from '../../types/chat';
import type { AgentCapability, BackendCapabilities } from '../AgentCapability';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Connection status of an agent adapter. */
export type AgentConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/** Universal disposable handle. */
export interface Disposable {
  dispose(): void;
}

/** Handler for adapter status changes. */
export type StatusChangeHandler = (status: AgentConnectionStatus) => void;

/** Handler for runtime capability changes (for example an optional protocol becoming ready). */
export type CapabilityChangeHandler = (capabilities: BackendCapabilities) => void;

/** Light-weight session summary returned by the registry. */
export interface AgentServiceInfo {
  readonly kind: AgentBackendKind;
  readonly displayName: string;
  readonly description: string;
  readonly status: AgentConnectionStatus;
  readonly capabilities: BackendCapabilities;
}

// ---------------------------------------------------------------------------
// Core AgentService interface
// ---------------------------------------------------------------------------

/**
 * The core agent adapter interface.
 *
 * Every backend adapter must implement at least these methods.
 * Capability-specific methods live on separate optional interfaces;
 * callers use `hasCapability()` + type narrowing to access them.
 */
export interface AgentService {
  /** Backend kind identifier (e.g. `'opencode'`, `'claude-code'`). */
  readonly kind: AgentBackendKind;

  /** Localised display name. */
  readonly displayName: string;

  /** Localised description. */
  readonly description: string;

  /** Current connection status. */
  readonly status: AgentConnectionStatus;

  /** Declared capability set. */
  readonly capabilities: BackendCapabilities;

  /** Check whether this adapter supports a specific capability. */
  hasCapability(cap: AgentCapability): boolean;

  // -- Lifecycle -------------------------------------------------------------

  /** Start the backend (connect, spawn process, etc.). */
  start(): Promise<void>;

  /** Stop the backend (disconnect, kill process, etc.). */
  stop(): Promise<void>;

  /** Dispose of resources held by this adapter. */
  dispose(): void;

  /** Subscribe to connection status changes. */
  onStatusChange(handler: StatusChangeHandler): Disposable;

  /**
   * Optional because most backends have a static capability set. Dynamic
   * backends (Codex app-server) use this to let composer slots refresh.
   */
  onCapabilitiesChange?(handler: CapabilityChangeHandler): Disposable;
}

// ---------------------------------------------------------------------------
// Core runtime capability interfaces
// ---------------------------------------------------------------------------

/** Request object for backend-neutral chat sends. */
export interface AgentChatSendRequest {
  readonly sessionId: string;
  readonly content: string;
  readonly images?: ImageAttachment[];
  readonly options?: Record<string, unknown>;
  /**
   * Optional diagnostic deep-capture token armed by the UI. Structurally
   * aligned with `CodexDiagnosticRunToken` but inlined here so the core
   * AgentService contract does not gain a reverse dependency on the
   * diagnostics package. Consumed only by backends that opt in (e.g. the
   * Codex adapter's trace port); absent for normal sends.
   */
  readonly diagnosticRunToken?: { runId: string; tabId: string; armedAt: number; expiresAt: number };
}

/** Chat: send a message and cancel active streams. */
export interface AgentChatCapability extends AgentService {
  sendMessage(request: AgentChatSendRequest): AsyncGenerator<StreamChunk>;
  cancelStream(sessionId: string): Promise<void> | void;
}

/** Sessions: create, delete, retitle, and read backend-owned sessions. */
export interface AgentSessionCapability extends AgentService {
  createSession(title?: string, options?: Record<string, unknown>): Promise<string>;
  listSessions?(): Promise<unknown[]>;
  getSession?(sessionId: string): Promise<unknown | null>;
  deleteSession(sessionId: string): Promise<void>;
  updateSessionTitle(sessionId: string, title: string): Promise<void>;
  /**
   * Archive a backend session. Optional because not all backends support
   * session archival.
   */
  archiveSession?(sessionId: string): Promise<boolean>;
  /**
   * Unarchive a previously archived backend session. Optional because not all
   * backends support session archival.
   */
  unarchiveSession?(sessionId: string): Promise<boolean>;
  /**
   * Read messages from a backend session.
   * Returns backend-specific raw message objects — callers must normalize
   * per backend kind. Optional because not all backends expose message history.
   */
  getSessionMessages?(sessionId: string, options?: Record<string, unknown>): Promise<unknown[]>;
}

// ---------------------------------------------------------------------------
// Optional capability interfaces
// ---------------------------------------------------------------------------
// Adapters implement these in addition to AgentService when they support
// the corresponding capability. Callers narrow via:
//   if (svc.hasCapability(AgentCapability.Branching)) {
//     const branch = svc as AgentBranchCapability;
//     branch.forkSession(...);
//   }
// ---------------------------------------------------------------------------

/** Fork: session forking without full branching semantics. */
export interface AgentForkCapability extends AgentService {
  forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }>;
}

/** Branching: fork, revert, unrevert, diff. */
export interface AgentBranchCapability extends AgentService {
  forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }>;
  revertSession(sessionId: string, messageID: string, partID?: string): Promise<boolean>;
  unrevertSession(sessionId: string): Promise<boolean>;
  getSessionRevertState(sessionId: string): Promise<{ messageID: string; partID?: string } | null>;
  getSessionDiff(sessionId: string, messageID?: string): Promise<SessionDiffEntry[]>;
  getSessionChildren(sessionId: string): Promise<unknown[]>;
}

/** Todos: per-session TODO tracking. */
export interface AgentTodoCapability extends AgentService {
  getSessionTodos(sessionId: string): Promise<unknown[]>;
  subscribeToSessionTodoUpdates(handler: (update: unknown) => void): Disposable;
}

/** Questions: interactive question prompts. */
export interface AgentQuestionCapability extends AgentService {
  getPendingQuestions(): Promise<unknown[]>;
  replyToQuestion(requestID: string, answers: string[][]): Promise<void>;
  rejectQuestion(requestID: string): Promise<void>;
}

/** Permissions: tool execution permissions. */
export interface AgentPermissionCapability extends AgentService {
  getPendingPermissions(): Promise<unknown[]>;
  respondToPermission(requestID: string, reply: unknown, message?: string): Promise<void>;
  respondToSessionPermission(sessionId: string, permissionId: string, reply: unknown): Promise<void>;
}

/** Models: model listing and selection. */
export interface AgentModelCapability extends AgentService {
  getAvailableModels(options?: Record<string, unknown>): Promise<unknown>;
  getProviderDirectory(options?: Record<string, unknown>): Promise<unknown>;
  getResolvedModelConfig(options?: Record<string, unknown>): Promise<unknown>;
}

/** MCP: MCP server management. */
export interface AgentMcpCapability extends AgentService {
  getMcpServerSnapshot(): unknown;
  getMcpStatus(): Promise<unknown>;
  addMcpServer(name: string, config: Record<string, unknown>): Promise<unknown>;
  connectMcpServer(name: string): Promise<boolean>;
  disconnectMcpServer(name: string): Promise<boolean>;
  refreshMcpServerStatus(): Promise<unknown>;
  removeMcpAuth(name: string): Promise<unknown>;
  authenticateMcp(name: string): Promise<unknown>;
  subscribeToCatalogUpdates(handler: (update: unknown) => void): Disposable;
}

/** Config: server configuration. */
export interface AgentConfigCapability extends AgentService {
  getSettingsSnapshot(): unknown;
  updateSettings(settings: unknown): Promise<void>;
  setVaultPath(path: string): void;
  reapplyCompactionConfigFromProjectConfig(compaction: unknown): Promise<unknown>;
}

/** Tools: tool catalog queries. */
export interface AgentToolCapability extends AgentService {
  listTools(providerID: string, modelID: string, options?: { refresh?: boolean }): Promise<unknown[]>;
  getToolCatalogSnapshot(): unknown;
  getCapabilitySnapshot(): unknown;
  refreshToolIds(): Promise<string[]>;
}

/** Auth: provider OAuth flows. */
export interface AgentAuthCapability extends AgentService {
  getProviderAuthMethods(): Promise<unknown>;
  authorizeProviderOAuth(providerID: string): Promise<unknown>;
  completeProviderOAuth(providerID: string, code: string, method?: number): Promise<unknown>;
}
