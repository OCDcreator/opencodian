import { createLogger } from '../../shared';
import { normalizeContextPath } from '../../shared/contextPath';
import type { SessionDiffEntry } from '../types';
import type {
  Part,
  Session,
  SessionMessage,
} from './OpenCodeSessionLifecycleCoordinator';

const logger = createLogger('OpenCodeSessionControlOrchestrator');

export interface SessionContextUsageSnapshot {
  sessionId: string;
  sessionTitle: string;
  createdAt: number;
  updatedAt: number;
  compactingAt: number | null;
  providerId: string | null;
  providerName: string | null;
  modelId: string | null;
  modelName: string | null;
  contextWindow: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

type AvailableModelDirectory = {
  providers: Array<{
    id: string;
    name: string;
    models: Array<{
      id: string;
      name: string;
      contextWindow?: number;
    }>;
  }>;
  defaults: Record<string, string>;
};

export interface SessionCommandTemplateContext {
  vaultPath?: string | null;
  currentNotePath?: string | null;
  currentSelection?: string | null;
  externalContextPaths?: readonly string[] | null;
  conversationTitle?: string | null;
}

export interface SessionCommandInput {
  command: string;
  arguments: string;
  agent?: string;
  model?: string;
  messageID?: string;
  variant?: string;
  parts?: unknown[];
  placeholderContext?: SessionCommandTemplateContext;
}

export interface SessionShellInput {
  agent: string;
  command: string;
  model?: { providerID: string; modelID: string };
  messageID?: string;
}

export interface OpenCodeSessionControlSdk {
  fork(request: { sessionID: string; messageID?: string }): Promise<unknown>;
  revert(request: { sessionID: string; messageID: string; partID?: string }): Promise<unknown>;
  unrevert(request: { sessionID: string }): Promise<unknown>;
  diff(request: { sessionID: string; messageID?: string }): Promise<unknown>;
  init(request: { sessionID: string; providerID: string; modelID: string; messageID: string }): Promise<unknown>;
  children(request: { sessionID: string }): Promise<unknown>;
  share(request: { sessionID: string }): Promise<unknown>;
  unshare(request: { sessionID: string }): Promise<unknown>;
  summarize(request: { sessionID: string; providerID: string; modelID: string; auto: boolean }): Promise<unknown>;
  message(request: { sessionID: string; messageID: string }): Promise<unknown>;
  deleteMessage(request: { sessionID: string; messageID: string }): Promise<unknown>;
  command(request: { sessionID: string } & SessionCommandInput): Promise<unknown>;
  shell(request: { sessionID: string } & SessionShellInput): Promise<unknown>;
}

export interface OpenCodeSessionControlPartSdk {
  update(request: { sessionID: string; messageID: string; partID: string; body: unknown }): Promise<unknown>;
  delete(request: { sessionID: string; messageID: string; partID: string }): Promise<unknown>;
}

export interface OpenCodeSessionControlOrchestratorHost {
  shouldUseSdkCrud(): boolean;
  getSdkSession(): OpenCodeSessionControlSdk;
  getSdkPart(): OpenCodeSessionControlPartSdk;
  postLegacy<T>(path: string, body: unknown): Promise<T>;
  getLegacy<T>(path: string): Promise<T>;
  getSessionInfo(sessionId: string): Promise<Session>;
  getSessionMessages(sessionId: string): Promise<SessionMessage[]>;
  getAvailableModels(): Promise<AvailableModelDirectory>;
  logServiceWarning(key: string, message: string, error: unknown): void;
  logServiceError(key: string, message: string, error: unknown): void;
}

const SESSION_COMMAND_PLACEHOLDER_PATTERN =
  /\{\{(?:vault_path|current_note_path|current_selection|external_context_paths|conversation_title)\}\}/g;

function normalizeSessionCommandPath(pathValue?: string | null): string {
  return typeof pathValue === 'string' && pathValue.length > 0
    ? normalizeContextPath(pathValue)
    : '';
}

function normalizeSessionCommandText(value?: string | null): string {
  return typeof value === 'string' ? value : '';
}

function normalizeSessionCommandExternalContextPaths(
  paths?: readonly string[] | null,
): string {
  if (!Array.isArray(paths) || paths.length === 0) {
    return '';
  }

  return paths
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .map((item) => normalizeContextPath(item))
    .join('\n');
}

export function expandSessionCommandTemplate(
  template: string,
  context?: SessionCommandTemplateContext,
): string {
  if (!template) {
    return template;
  }

  return template.replace(SESSION_COMMAND_PLACEHOLDER_PATTERN, (token) => {
    switch (token) {
      case '{{vault_path}}':
        return normalizeSessionCommandPath(context?.vaultPath);
      case '{{current_note_path}}':
        return normalizeSessionCommandPath(context?.currentNotePath);
      case '{{current_selection}}':
        return normalizeSessionCommandText(context?.currentSelection);
      case '{{external_context_paths}}':
        return normalizeSessionCommandExternalContextPaths(context?.externalContextPaths);
      case '{{conversation_title}}':
        return normalizeSessionCommandText(context?.conversationTitle);
      default:
        return token;
    }
  });
}

export class OpenCodeSessionControlOrchestrator {
  constructor(private readonly host: OpenCodeSessionControlOrchestratorHost) {}

  async getSessionContextUsageSnapshot(sessionId: string): Promise<SessionContextUsageSnapshot | null> {
    if (!sessionId) {
      return null;
    }

    try {
      const session = await this.host.getSessionInfo(sessionId);
      const hasSessionLevelUsage = session.tokens != null && session.model != null;

      if (hasSessionLevelUsage) {
        return this.buildSessionLevelUsageSnapshot(session, sessionId);
      }

      return this.buildMessageLevelUsageSnapshot(session, sessionId);
    } catch (error) {
      this.host.logServiceError('session.context-usage', `Failed to get session context usage snapshot for ${sessionId}:`, error);
      return null;
    }
  }

  private async buildSessionLevelUsageSnapshot(
    session: Session,
    sessionId: string,
  ): Promise<SessionContextUsageSnapshot> {
    const rawPId = session.model?.providerID ?? null;
    const rawMId = session.model?.id ?? null;
    let providerName: string | null = rawPId;
    let modelName: string | null = rawMId;
    let contextWindow = 0;

    try {
      const providersResult = await this.host.getAvailableModels();
      const provider = rawPId ? providersResult.providers.find((p) => p.id === rawPId) : undefined;
      const model = provider && rawMId ? provider.models.find((m) => m.id === rawMId) : undefined;
      providerName = provider?.name ?? rawPId;
      modelName = model?.name ?? rawMId;
      contextWindow = model?.contextWindow ?? 0;
    } catch {
      // Fall back to raw IDs when model catalog is unavailable
    }

    return {
      sessionId,
      sessionTitle: session.title,
      createdAt: session.time.created,
      updatedAt: session.time.updated,
      compactingAt: typeof session.time.compacting === 'number' ? session.time.compacting : null,
      providerId: rawPId,
      providerName,
      modelId: rawMId,
      modelName,
      contextWindow,
      inputTokens: session.tokens?.input ?? 0,
      outputTokens: session.tokens?.output ?? 0,
      reasoningTokens: session.tokens?.reasoning ?? 0,
      cacheReadTokens: session.tokens?.cache?.read ?? 0,
      cacheWriteTokens: session.tokens?.cache?.write ?? 0,
      totalCost: session.cost ?? 0,
    };
  }

  private async buildMessageLevelUsageSnapshot(
    session: Session,
    sessionId: string,
  ): Promise<SessionContextUsageSnapshot> {
    const [messages, providersResult] = await Promise.all([
      this.host.getSessionMessages(sessionId),
      this.host.getAvailableModels(),
    ]);

    const totalCost = messages.reduce(
      (sum, message) => sum + (message.info.role === 'assistant' ? (message.info.cost ?? 0) : 0),
      0,
    );

    const latestAssistantWithTokens = OpenCodeSessionControlOrchestrator.findLatestAssistantWithTokens(messages);
    const rawPId = latestAssistantWithTokens?.info.providerID ?? null;
    const rawMId = latestAssistantWithTokens?.info.modelID ?? null;
    const provider = rawPId ? providersResult.providers.find((p) => p.id === rawPId) : undefined;
    const model = provider && rawMId ? provider.models.find((m) => m.id === rawMId) : undefined;
    const tokens = latestAssistantWithTokens?.info.tokens;

    return {
      sessionId,
      sessionTitle: session.title,
      createdAt: session.time.created,
      updatedAt: latestAssistantWithTokens?.info.time.created ?? session.time.updated,
      compactingAt: typeof session.time.compacting === 'number' ? session.time.compacting : null,
      providerId: rawPId,
      providerName: provider?.name ?? rawPId,
      modelId: rawMId,
      modelName: model?.name ?? rawMId,
      contextWindow: model?.contextWindow ?? 0,
      inputTokens: tokens?.input ?? 0,
      outputTokens: tokens?.output ?? 0,
      reasoningTokens: tokens?.reasoning ?? 0,
      cacheReadTokens: tokens?.cache?.read ?? 0,
      cacheWriteTokens: tokens?.cache?.write ?? 0,
      totalCost,
    };
  }

  async forkSession(sessionId: string, messageID?: string): Promise<{ id: string; title: string }> {
    const response = this.host.shouldUseSdkCrud()
      ? await this.host.getSdkSession().fork({
          sessionID: sessionId,
          messageID,
        })
      : await this.host.postLegacy<unknown>(`/session/${sessionId}/fork`, messageID ? { messageID } : {});

    return this.normalizeForkResponse(response);
  }

  async revertSession(sessionId: string, messageID: string, partID?: string): Promise<boolean> {
    const payload: Record<string, string> = { messageID };
    if (partID) {
      payload.partID = partID;
    }

    logger.debug('Revert session request', {
      sessionId,
      messageID,
      partID: partID ?? null,
    });

    const response = this.host.shouldUseSdkCrud()
      ? await this.host.getSdkSession().revert({
          sessionID: sessionId,
          messageID,
          partID,
        })
      : await this.host.postLegacy<unknown>(`/session/${sessionId}/revert`, payload);

    logger.debug('Revert session raw response', {
      sessionId,
      messageID,
      response,
    });

    const normalized = this.normalizeRevertResponse(response);
    logger.debug('Revert session normalized boolean result', {
      sessionId,
      messageID,
      normalized,
    });

    return normalized;
  }

  async unrevertSession(sessionId: string): Promise<boolean> {
    const response = this.host.shouldUseSdkCrud()
      ? await this.host.getSdkSession().unrevert({
          sessionID: sessionId,
        })
      : await this.host.postLegacy<unknown>(`/session/${sessionId}/unrevert`, {});

    return this.normalizeRevertResponse(response);
  }

  async getSessionRevertState(
    sessionId: string,
  ): Promise<{ messageID: string; partID?: string } | null> {
    const session = await this.host.getSessionInfo(sessionId);
    return session.revert?.messageID ? session.revert : null;
  }

  async getSessionDiff(sessionId: string, messageID?: string): Promise<SessionDiffEntry[]> {
    if (this.host.shouldUseSdkCrud()) {
      try {
        const response = await this.host.getSdkSession().diff({
          sessionID: sessionId,
          messageID,
        });
        return this.normalizeSessionDiff(response);
      } catch (error) {
        this.host.logServiceWarning('session.diff', `SDK session.diff failed for ${sessionId}, falling back to legacy HTTP`, error);
      }
    }

    const query = messageID ? `?messageID=${encodeURIComponent(messageID)}` : '';
    try {
      const response = await this.host.getLegacy<unknown>(`/session/${sessionId}/diff${query}`);
      return this.normalizeSessionDiff(response);
    } catch (error) {
      this.host.logServiceError('session.diff', `Failed to get session diff for ${sessionId}:`, error);
      return [];
    }
  }

  async initializeSession(sessionId: string, providerID: string, modelID: string, messageID: string): Promise<boolean> {
    return (await this.host.getSdkSession().init({ sessionID: sessionId, providerID, modelID, messageID })) === true;
  }

  async getSessionChildren(sessionId: string): Promise<Session[]> {
    const response = await this.host.getSdkSession().children({ sessionID: sessionId });
    return Array.isArray(response) ? response as Session[] : [];
  }

  async shareSession(sessionId: string): Promise<Session> {
    return await this.host.getSdkSession().share({ sessionID: sessionId }) as unknown as Session;
  }

  async unshareSession(sessionId: string): Promise<Session> {
    return await this.host.getSdkSession().unshare({ sessionID: sessionId }) as unknown as Session;
  }

  async summarizeSession(sessionId: string, providerID: string, modelID: string, auto = false): Promise<boolean> {
    return (await this.host.getSdkSession().summarize({ sessionID: sessionId, providerID, modelID, auto })) === true;
  }

  async getSessionMessage(sessionId: string, messageId: string): Promise<SessionMessage> {
    return this.host.getSdkSession().message({ sessionID: sessionId, messageID: messageId }) as Promise<SessionMessage>;
  }

  async deleteSessionMessage(sessionId: string, messageId: string): Promise<boolean> {
    return (await this.host.getSdkSession().deleteMessage({ sessionID: sessionId, messageID: messageId })) === true;
  }

  async runSessionCommand(sessionId: string, input: SessionCommandInput): Promise<SessionMessage> {
    return this.host.getSdkSession().command(
      this.buildSessionCommandRequest(sessionId, input) as never,
    ) as Promise<SessionMessage>;
  }

  async runSessionShell(sessionId: string, input: SessionShellInput): Promise<SessionMessage> {
    return this.host.getSdkSession().shell(
      this.buildSessionShellRequest(sessionId, input) as never,
    ) as Promise<SessionMessage>;
  }

  async updateMessagePart(sessionId: string, messageId: string, partId: string, part: Part): Promise<Part> {
    return await this.host.getSdkPart().update({
      sessionID: sessionId,
      messageID: messageId,
      partID: partId,
      body: part as never,
    } as never) as Part;
  }

  async deleteMessagePart(sessionId: string, messageId: string, partId: string): Promise<boolean> {
    return (await this.host.getSdkPart().delete({
      sessionID: sessionId,
      messageID: messageId,
      partID: partId,
    })) === true;
  }

  private buildSessionCommandRequest(
    sessionId: string,
    input: SessionCommandInput,
  ): { sessionID: string } & SessionCommandInput {
    const {
      placeholderContext,
      ...commandInput
    } = input;

    const request: { sessionID: string } & SessionCommandInput = {
      sessionID: sessionId,
      command: commandInput.command.trim(),
      arguments: expandSessionCommandTemplate(commandInput.arguments, placeholderContext),
    };

    if (typeof commandInput.agent === 'string' && commandInput.agent.trim()) {
      request.agent = commandInput.agent.trim();
    }

    if (typeof commandInput.model === 'string' && commandInput.model.trim()) {
      request.model = commandInput.model.trim();
    }

    if (typeof commandInput.messageID === 'string' && commandInput.messageID.trim()) {
      request.messageID = commandInput.messageID.trim();
    }

    if (typeof commandInput.variant === 'string' && commandInput.variant.trim()) {
      request.variant = commandInput.variant.trim();
    }

    if (Array.isArray(commandInput.parts) && commandInput.parts.length > 0) {
      request.parts = commandInput.parts.map((part) => this.cloneSessionCommandPart(part));
    }

    return request;
  }

  private buildSessionShellRequest(
    sessionId: string,
    input: SessionShellInput,
  ): { sessionID: string } & SessionShellInput {
    const request: { sessionID: string } & SessionShellInput = {
      sessionID: sessionId,
      agent: input.agent.trim(),
      command: input.command.trim(),
    };

    if (input.model) {
      request.model = { ...input.model };
    }

    if (typeof input.messageID === 'string' && input.messageID.trim()) {
      request.messageID = input.messageID.trim();
    }

    return request;
  }

  private cloneSessionCommandPart(part: unknown): unknown {
    if (Array.isArray(part)) {
      return part.slice();
    }

    if (part && typeof part === 'object') {
      return { ...(part as Record<string, unknown>) };
    }

    return part;
  }

  private unwrapSdkData<T>(response: unknown): T | undefined {
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as { data?: T }).data;
    }

    return response as T | undefined;
  }

  private normalizeForkResponse(response: unknown): { id: string; title: string } {
    if (typeof response === 'object' && response !== null && 'id' in response) {
      const typedResponse = response as { id: unknown; title?: unknown };
      return {
        id: String(typedResponse.id),
        title: typeof typedResponse.title === 'string'
          ? typedResponse.title
          : '',
      };
    }

    throw new Error('Invalid fork session response');
  }

  private normalizeRevertResponse(response: unknown): boolean {
    if (response === false) {
      return false;
    }

    if (typeof response === 'object' && response !== null && Object.keys(response).length === 0) {
      return true;
    }

    if (typeof response === 'object' && response !== null && 'id' in response) {
      const responseId = String((response as { id: unknown }).id);
      return responseId.length > 0;
    }

    return response === true;
  }

  private normalizeSessionDiff(response: unknown): SessionDiffEntry[] {
    const rawEntries = this.unwrapSdkData<unknown[]>(response);
    const normalizedEntries = Array.isArray(rawEntries) ? rawEntries : [];

    return normalizedEntries.reduce<SessionDiffEntry[]>((entries, rawEntry) => {
      if (!rawEntry || typeof rawEntry !== 'object') {
        return entries;
      }

      const entry = rawEntry as {
        file?: unknown;
        patch?: unknown;
        before?: unknown;
        after?: unknown;
        additions?: unknown;
        deletions?: unknown;
        status?: unknown;
      };
      if (typeof entry.file !== 'string' || !entry.file.trim()) {
        return entries;
      }

      entries.push({
        file: entry.file,
        patch: typeof entry.patch === 'string' ? entry.patch : undefined,
        before: typeof entry.before === 'string' ? entry.before : undefined,
        after: typeof entry.after === 'string' ? entry.after : undefined,
        additions: typeof entry.additions === 'number' ? entry.additions : 0,
        deletions: typeof entry.deletions === 'number' ? entry.deletions : 0,
        status: entry.status === 'added' || entry.status === 'deleted' || entry.status === 'modified'
          ? entry.status
          : undefined,
      });
      return entries;
    }, []);
  }

  private static findLatestAssistantWithTokens(
    messages: SessionMessage[],
  ): SessionMessage | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.info.role !== 'assistant') {
        continue;
      }

      const tokens = message.info.tokens;
      if (!tokens) {
        continue;
      }

      const total = (tokens.input ?? 0)
        + (tokens.output ?? 0)
        + (tokens.reasoning ?? 0)
        + (tokens.cache?.read ?? 0)
        + (tokens.cache?.write ?? 0);
      if (total <= 0) {
        continue;
      }

      return message;
    }

    return null;
  }
}
