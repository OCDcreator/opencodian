/**
 * OpenCodeAdapter — wraps the existing OpenCodeService behind the
 * AgentService interface.
 *
 * This is the first adapter and serves as the reference implementation.
 * It does NOT change any OpenCodeService internals — it only delegates.
 *
 * OpenCode supports all capabilities, so this adapter implements every
 * capability interface in addition to the core AgentService.
 *
 * See docs/requirements/multi-agent-foundation/03-opencode-adapter.md.
 */

import type { OpenCodeService } from '../../opencode/OpenCodeService';
import type { AgentBackendKind } from '../../types/chat';
import {
  type AgentCapability,
  OPENCODE_FULL_CAPABILITIES,
} from '../AgentCapability';
import type {
  AgentAuthCapability,
  AgentBranchCapability,
  AgentChatCapability,
  AgentConfigCapability,
  AgentConnectionStatus,
  AgentMcpCapability,
  AgentModelCapability,
  AgentPermissionCapability,
  AgentQuestionCapability,
  AgentService,
  AgentServiceInfo,
  AgentSessionCapability,
  AgentTodoCapability,
  AgentToolCapability,
  Disposable,
  StatusChangeHandler,
} from './AgentService';

/**
 * Maps OpenCodeService server status strings to AgentConnectionStatus.
 */
function mapServerStatus(status: string): AgentConnectionStatus {
  switch (status) {
    case 'running':
    case 'ready':
      return 'connected';
    case 'starting':
    case 'stopping':
      return 'connecting';
    case 'stopped':
    case 'not_configured':
      return 'disconnected';
    default:
      if (status.includes('error') || status.includes('fail')) {
        return 'error';
      }
      return 'disconnected';
  }
}

/**
 * OpenCodeAdapter wraps an existing OpenCodeService instance and
 * exposes it through the AgentService interface.
 */
export class OpenCodeAdapter
  implements
    AgentService,
    AgentChatCapability,
    AgentSessionCapability,
    AgentBranchCapability,
    AgentTodoCapability,
    AgentQuestionCapability,
    AgentPermissionCapability,
    AgentModelCapability,
    AgentMcpCapability,
    AgentConfigCapability,
    AgentToolCapability,
    AgentAuthCapability
{
  readonly kind: AgentBackendKind = 'opencode';
  readonly displayName = 'OpenCode';
  readonly description = 'OpenCode AI coding agent';
  readonly capabilities = OPENCODE_FULL_CAPABILITIES;

  private statusChangeHandlers = new Set<StatusChangeHandler>();

  constructor(private readonly service: OpenCodeService) {}

  // -------------------------------------------------------------------------
  // AgentService core
  // -------------------------------------------------------------------------

  hasCapability(cap: AgentCapability): boolean {
    return this.capabilities.has(cap);
  }

  get status(): AgentConnectionStatus {
    return mapServerStatus(this.service.getServerStatus());
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
    await this.service.start();
  }

  async stop(): Promise<void> {
    await this.service.stop();
  }

  dispose(): void {
    // Only clear adapter-level state; the underlying OpenCodeService
    // is disposed separately by the plugin's onunload.
    this.statusChangeHandlers.clear();
  }

  onStatusChange(handler: StatusChangeHandler): Disposable {
    this.statusChangeHandlers.add(handler);
    return { dispose: () => this.statusChangeHandlers.delete(handler) };
  }

  /**
   * Notify listeners of a status change.
   * Called by the registry when it detects the underlying service status
   * has changed (e.g. via the existing onServerStatusChange callback).
   */
  notifyStatusChange(status: string): void {
    const mapped = mapServerStatus(status);
    for (const handler of this.statusChangeHandlers) {
      try {
        handler(mapped);
      } catch {
        // Swallow handler errors
      }
    }
  }

  // -------------------------------------------------------------------------
  // Direct delegation — expose the underlying OpenCodeService for
  // consumers that need OpenCode-specific methods not on the interface.
  // -------------------------------------------------------------------------

  /** Underlying OpenCodeService for direct access when needed. */
  get underlying(): OpenCodeService {
    return this.service;
  }

  // -------------------------------------------------------------------------
  // AgentChatCapability
  // -------------------------------------------------------------------------

  async *sendMessage(request: { sessionId: string; content: string; options?: Record<string, unknown> }) {
    yield* this.service.sendMessage(request.content, {
      ...(request.options ?? {}),
      sessionId: request.sessionId,
    });
  }

  cancelStream(sessionId: string): void {
    this.service.cancelStream(sessionId);
  }

  // -------------------------------------------------------------------------
  // AgentSessionCapability
  // -------------------------------------------------------------------------

  async createSession(title?: string, options?: Record<string, unknown>): Promise<string> {
    return this.service.createSession(title, options as Parameters<OpenCodeService['createSession']>[1]);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.service.deleteSession(sessionId);
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await this.service.updateSessionTitle(sessionId, title);
  }

  // -------------------------------------------------------------------------
  // AgentBranchCapability
  // -------------------------------------------------------------------------

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    return this.service.forkSession(sessionId, messageID);
  }

  async revertSession(sessionId: string, messageID: string, partID?: string): Promise<boolean> {
    return this.service.revertSession(sessionId, messageID, partID);
  }

  async unrevertSession(sessionId: string): Promise<boolean> {
    return this.service.unrevertSession(sessionId);
  }

  async getSessionRevertState(sessionId: string): Promise<{ messageID: string; partID?: string } | null> {
    return this.service.getSessionRevertState(sessionId);
  }

  async getSessionDiff(sessionId: string, messageID?: string) {
    return this.service.getSessionDiff(sessionId, messageID);
  }

  async getSessionChildren(sessionId: string): Promise<unknown[]> {
    return this.service.getSessionChildren(sessionId);
  }

  // -------------------------------------------------------------------------
  // AgentTodoCapability
  // -------------------------------------------------------------------------

  async getSessionTodos(sessionId: string): Promise<unknown[]> {
    return this.service.getSessionTodos(sessionId);
  }

  subscribeToSessionTodoUpdates(handler: (update: unknown) => void): Disposable {
    const unsub = this.service.subscribeToSessionTodoUpdates(handler as never);
    return { dispose: unsub };
  }

  // -------------------------------------------------------------------------
  // AgentQuestionCapability
  // -------------------------------------------------------------------------

  async getPendingQuestions(): Promise<unknown[]> {
    return this.service.getPendingQuestions();
  }

  async replyToQuestion(requestID: string, answers: string[][]): Promise<void> {
    return this.service.replyToQuestion(requestID, answers);
  }

  async rejectQuestion(requestID: string): Promise<void> {
    return this.service.rejectQuestion(requestID);
  }

  // -------------------------------------------------------------------------
  // AgentPermissionCapability
  // -------------------------------------------------------------------------

  async getPendingPermissions(): Promise<unknown[]> {
    return this.service.getPendingPermissions();
  }

  async respondToPermission(requestID: string, reply: unknown, message?: string): Promise<void> {
    return this.service.respondToPermission(requestID, reply as never, message);
  }

  async respondToSessionPermission(sessionId: string, permissionId: string, reply: unknown): Promise<void> {
    return this.service.respondToSessionPermission(sessionId, permissionId, reply as never);
  }

  // -------------------------------------------------------------------------
  // AgentModelCapability
  // -------------------------------------------------------------------------

  async getAvailableModels(options?: Record<string, unknown>): Promise<unknown> {
    return this.service.getAvailableModels(options);
  }

  async getProviderDirectory(options?: Record<string, unknown>): Promise<unknown> {
    return this.service.getProviderDirectory(options);
  }

  async getResolvedModelConfig(options?: Record<string, unknown>): Promise<unknown> {
    return this.service.getResolvedModelConfig(options);
  }

  // -------------------------------------------------------------------------
  // AgentMcpCapability
  // -------------------------------------------------------------------------

  getMcpServerSnapshot(): unknown {
    return this.service.getMcpServerSnapshot();
  }

  async getMcpStatus(): Promise<unknown> {
    return this.service.getMcpStatus();
  }

  async addMcpServer(name: string, config: Record<string, unknown>): Promise<unknown> {
    return this.service.addMcpServer(name, config);
  }

  async connectMcpServer(name: string): Promise<boolean> {
    return this.service.connectMcpServer(name);
  }

  async disconnectMcpServer(name: string): Promise<boolean> {
    return this.service.disconnectMcpServer(name);
  }

  async refreshMcpServerStatus(): Promise<unknown> {
    return this.service.refreshMcpServerStatus();
  }

  async removeMcpAuth(name: string): Promise<unknown> {
    return this.service.removeMcpAuth(name);
  }

  async authenticateMcp(name: string): Promise<unknown> {
    return this.service.authenticateMcp(name);
  }

  subscribeToCatalogUpdates(handler: (update: unknown) => void): Disposable {
    const unsub = this.service.subscribeToCatalogUpdates(handler as never);
    return { dispose: unsub };
  }

  // -------------------------------------------------------------------------
  // AgentConfigCapability
  // -------------------------------------------------------------------------

  getSettingsSnapshot(): unknown {
    return this.service.getSettingsSnapshot();
  }

  async updateSettings(settings: unknown): Promise<void> {
    return this.service.updateSettings(settings as never);
  }

  setVaultPath(path: string): void {
    this.service.setVaultPath(path);
  }

  async reapplyCompactionConfigFromProjectConfig(compaction: unknown): Promise<unknown> {
    return this.service.reapplyCompactionConfigFromProjectConfig(compaction as never);
  }

  // -------------------------------------------------------------------------
  // AgentToolCapability
  // -------------------------------------------------------------------------

  async listTools(providerID: string, modelID: string, options?: { refresh?: boolean }): Promise<unknown[]> {
    return this.service.listTools(providerID, modelID, options);
  }

  getToolCatalogSnapshot(): unknown {
    return this.service.getToolCatalogSnapshot();
  }

  getCapabilitySnapshot(): unknown {
    return this.service.getCapabilitySnapshot();
  }

  async refreshToolIds(): Promise<string[]> {
    return this.service.refreshToolIds();
  }

  // -------------------------------------------------------------------------
  // AgentAuthCapability
  // -------------------------------------------------------------------------

  async getProviderAuthMethods(): Promise<unknown> {
    return this.service.getProviderAuthMethods();
  }

  async authorizeProviderOAuth(providerID: string): Promise<unknown> {
    return this.service.authorizeProviderOAuth(providerID);
  }

  async completeProviderOAuth(providerID: string, code: string, method?: number): Promise<unknown> {
    return this.service.completeProviderOAuth(providerID, code, method);
  }
}
