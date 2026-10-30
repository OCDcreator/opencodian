import { AgentCapability } from '../../../../core/agents/AgentCapability';
import { type AgentAuxQueryCapability, AUX_DENIED_CAPABILITIES, type AuxQuerySession, type BackendModelSelection,findWriteToolCalls } from '../../../../core/agents/backend/AgentAuxQueryCapability';
import { getConversationSessionBackendService, readBackendSessionTitleSnapshot } from '../../../../core/agents/backend/AgentBackendRouting';
import type { LocalOutputFormat } from '../../../../core/opencode/types';
import { buildTitleGenerationPrompt, buildTitleGenerationSystemPrompt, normalizeTitleGenerationLocale } from '../../../../core/prompts/titleGeneration';
import type { ChatMessage } from '../../../../core/types';
import type { AgentBackendKind, Conversation, ConversationTitleState } from '../../../../core/types/chat';
import { getConversationBackendSessionId } from '../../../../core/types/chat';
import type { TitleGenerationPort } from './TitleGenerationPort';
import { type ResolvedTitleModel, type TitleModel,TitleModelResolver } from './TitleModelResolver';

export type TitleGenerationResult =
  | { success: true; title: string; source: 'native' | 'ai'; model?: TitleModel; modelSource?: ConversationTitleState['modelSource'] }
  | { success: false; error: string };

export type TitleGenerationCallback = (conversationId: string, result: TitleGenerationResult) => Promise<void>;

export interface TitleGenerationOptions {
  sessionId?: string;
  officialPollAttempts?: number;
  officialPollIntervalMs?: number;
  /** End-to-end budget for model selection, startup and the auxiliary turn. */
  aiTimeoutMs?: number;
  /** Tests and explicit retry can skip the final native readback window. */
  lateOfficialPollAttempts?: number;
}

export interface ConversationTitleUpdate {
  title?: string;
  titleState?: ConversationTitleState;
  titleGenerationStatus?: Conversation['titleGenerationStatus'];
  expectedTitleRevision?: number;
}

const OUTPUT_FORMAT: LocalOutputFormat = {
  type: 'json_schema',
  schema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'], additionalProperties: false },
};
const DEFAULT_TITLE = /^(?:(?:New|Child) session - \d{4}-\d{2}-\d{2}T|new (?:pi |zcode |dsh )?(?:chat|conversation|session)$|untitled$|\(untitled\)$|新对话$|新会话$|未命名(?:会话)?$)/i;
const NATIVE_GENERATORS = new Set<AgentBackendKind>(['opencode', 'opencode2', 'claude-code', 'zcode', 'dsh']);

export class TitleGenerationService {
  private readonly activeGenerations = new Map<string, AbortController>();
  private readonly nativeTitleWrites = new Map<string, Promise<void>>();
  private readonly localTitleWrites = new Map<string, Promise<Conversation | null>>();

  constructor(private readonly plugin: TitleGenerationPort, private readonly workingDirectory = '') {}

  /** Pure lifecycle decisions stay here; the view only persists and presents updates. */
  createFallbackUpdate(conversation: Conversation, firstMessage: string): ConversationTitleUpdate | null {
    const title = this.plugin.generateDefaultTitle(firstMessage);
    if (conversation.titleState && conversation.titleState.source !== 'rule') return null;
    // Preserve pre-existing imported/custom titles even on their first local send.
    if (!conversation.titleState && conversation.title && !DEFAULT_TITLE.test(conversation.title) && conversation.title !== title) {
      return { titleState: { source: 'native', revision: 1 }, titleGenerationStatus: undefined };
    }
    return {
      title,
      titleState: { source: 'rule', revision: (conversation.titleState?.revision ?? 0) + 1 },
      titleGenerationStatus: undefined,
    };
  }

  createGeneratedUpdate(conversation: Conversation, revision: number, result: TitleGenerationResult): ConversationTitleUpdate | null {
    if (conversation.titleState?.source !== 'rule' || conversation.titleState.revision !== revision) return null;
    const titleState: ConversationTitleState = result.success
      ? { source: result.source, revision: revision + 1, model: result.model, modelSource: result.modelSource }
      : { ...conversation.titleState, error: result.error };
    return {
      ...(result.success ? { title: result.title } : {}),
      titleState,
      titleGenerationStatus: result.success ? 'success' : 'failed',
      expectedTitleRevision: revision,
    };
  }

  createRetryUpdate(conversation: Conversation): ConversationTitleUpdate | null {
    if (conversation.titleState?.source !== 'rule' || conversation.titleGenerationStatus === 'pending') return null;
    this.cancelConversation(conversation.id);
    return {
      titleState: { source: 'rule', revision: conversation.titleState.revision + 1, model: conversation.titleState.model },
      titleGenerationStatus: 'pending', expectedTitleRevision: conversation.titleState.revision,
    };
  }

  /** Reload recovery performs one native read; it never silently repeats a paid request. */
  async recoverPending(conversation: Conversation): Promise<Conversation | null> {
    if (!['pending', 'failed'].includes(conversation.titleGenerationStatus ?? '') || this.activeGenerations.has(conversation.id)) return null;
    if (!conversation.titleState) {
      conversation.titleState = { source: 'rule', revision: 1 };
    }
    const revision = conversation.titleState?.revision;
    if (conversation.titleState?.source !== 'rule' || revision === undefined) return null;
    const title = await this.waitForOfficialTitle(conversation.id, {
      officialPollAttempts: 1, rejectTitle: conversation.messages.find((message) => message.role === 'user')?.content,
    }, new AbortController().signal).catch(() => null);
    if (this.activeGenerations.has(conversation.id)) return null;
    const update = this.createGeneratedUpdate(conversation, revision, title
      ? { success: true, title, source: 'native' }
      : { success: false, error: 'Title generation interrupted; retry is available' });
    return update ? this.persistUpdate(conversation.id, update, false) : null;
  }

  /** Settled native turns and their rename events trigger an authoritative readback. */
  async readNativeTitleUpdate(conversationId: string): Promise<ConversationTitleUpdate | null> {
    const conversation = await this.plugin.getConversationById(conversationId, { preferCache: true });
    if (!conversation || conversation.titleState?.source !== 'rule'
      || !['pending', 'failed'].includes(conversation.titleGenerationStatus ?? '')) return null;
    const revision = conversation.titleState.revision;
    const title = await this.waitForOfficialTitle(conversationId, {
      officialPollAttempts: 1, rejectTitle: conversation.messages.find((message) => message.role === 'user')?.content,
    }, new AbortController().signal);
    if (!title) return null;
    const update = this.createGeneratedUpdate(conversation, revision, { success: true, title, source: 'native' });
    if (update) this.cancelConversation(conversationId);
    return update;
  }

  async persistUpdate(conversationId: string, update: ConversationTitleUpdate, manual: boolean): Promise<Conversation | null> {
    const conversation = await this.plugin.getConversationById(conversationId, { preferCache: true });
    if (!conversation || (update.expectedTitleRevision !== undefined && conversation.titleState?.revision !== update.expectedTitleRevision)) return null;
    const manualTitle = manual && typeof update.title === 'string';
    if (manualTitle) {
      this.cancelConversation(conversationId);
      conversation.titleState = { source: 'manual', revision: (conversation.titleState?.revision ?? 0) + 1 };
    }
    const revision = conversation.titleState?.revision;
    const previous = this.localTitleWrites.get(conversationId) ?? Promise.resolve(null);
    const pending = previous.catch(() => null).then(() => this.persistTitleUpdate(conversation, update, { manual: manualTitle, revision }));
    this.localTitleWrites.set(conversationId, pending);
    try { return await pending; } finally {
      if (this.localTitleWrites.get(conversationId) === pending) this.localTitleWrites.delete(conversationId);
    }
  }

  private async persistTitleUpdate(conversation: Conversation, update: ConversationTitleUpdate, expected: { manual: boolean; revision?: number }): Promise<Conversation | null> {
    const { manual: manualTitle, revision } = expected;
    if (conversation.titleState?.revision !== revision) return null;
    if (manualTitle && conversation.backend === 'zcode') {
      await this.syncNativeTitle(conversation, update.title!, true);
      if (conversation.titleState?.revision !== revision) return null;
    }
    if (typeof update.title === 'string') conversation.title = update.title;
    if (update.titleState) conversation.titleState = update.titleState;
    conversation.titleGenerationStatus = update.titleGenerationStatus;
    conversation.updatedAt = Date.now();
    const persistedRevision = conversation.titleState?.revision;
    await this.plugin.saveConversation(conversation);
    if (conversation.titleState?.revision !== persistedRevision) return conversation;
    if (typeof update.title === 'string' && (manualTitle || update.titleState?.source === 'ai')
      && !(manualTitle && conversation.backend === 'zcode')) {
      void this.syncNativeTitle(conversation, update.title, false).catch(() => undefined);
    }
    return conversation;
  }

  /** Serial writes plus a revision check prevent a slow AI rename winning over a manual rename. */
  private async syncNativeTitle(conversation: Conversation, title: string, required: boolean): Promise<void> {
    const revision = conversation.titleState?.revision;
    const previous = this.nativeTitleWrites.get(conversation.id) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      const latest = await this.plugin.getConversationById(conversation.id, { preferCache: true });
      if (!latest || latest.titleState?.revision !== revision) return;
      const sessionId = getConversationBackendSessionId(latest);
      const adapter = getConversationSessionBackendService(this.plugin.agentServiceRegistry, latest);
      if (!sessionId || !adapter) {
        if (required) throw new Error('Session rename requires an active native session.');
        return;
      }
      await adapter.updateSessionTitle(sessionId, title);
    });
    this.nativeTitleWrites.set(conversation.id, pending);
    try { await pending; } finally {
      if (this.nativeTitleWrites.get(conversation.id) === pending) this.nativeTitleWrites.delete(conversation.id);
    }
  }

  // eslint-disable-next-line max-params -- Preserves the existing title consumer seam.
  async generateTitle(
    conversationId: string,
    userMessage: string,
    currentModel: TitleModel,
    callback: TitleGenerationCallback,
    options: TitleGenerationOptions = {},
  ): Promise<void> {
    this.cancelConversation(conversationId);
    const controller = new AbortController();
    this.activeGenerations.set(conversationId, controller);
    const locale = normalizeTitleGenerationLocale(this.plugin.settings.locale);
    const resolver = new TitleModelResolver({
      settings: { ...this.plugin.settings, aiTitleModelOverrides: { ...this.plugin.settings.aiTitleModelOverrides }, disabledModelRefs: [...this.plugin.settings.disabledModelRefs] },
      modelConfigService: this.plugin.modelConfigService,
      agentServiceRegistry: this.plugin.agentServiceRegistry,
    });
    try {
      const officialTitle = await this.waitForOfficialTitle(conversationId, { ...options, rejectTitle: userMessage }, controller.signal);
      if (controller.signal.aborted) return;
      if (officialTitle) {
        await this.safeCallback(callback, conversationId, { success: true, title: officialTitle, source: 'native' });
        return;
      }
      const backend = await this.resolveConversationBackend(conversationId);
      const response = await this.withBudget(async (signal) => {
        const selected = await resolver.resolve(backend, currentModel);
        if (signal.aborted) throw new Error('Title generation cancelled');
        const prompt = buildTitleGenerationPrompt(this.truncateText(userMessage, 600), locale);
        const system = buildTitleGenerationSystemPrompt(locale);
        const title = await this.generateWithBackend({ backend, selected, prompt, system, signal });
        if (!title) throw new Error('Failed to parse title from response');
        return { title, selected };
      }, options.aiTimeoutMs ?? 45_000, controller.signal);
      if (controller.signal.aborted) return;
      // An authoritative title may have arrived during the auxiliary request.
      const lateNative = await this.waitForOfficialTitle(conversationId, {
        ...options, officialPollAttempts: 1, rejectTitle: userMessage,
      }, controller.signal);
      if (!controller.signal.aborted) {
        await this.safeCallback(callback, conversationId, lateNative
          ? { success: true, title: lateNative, source: 'native' }
          : { success: true, title: response.title, source: 'ai',
            model: { provider: response.selected.provider, model: response.selected.model }, modelSource: response.selected.source });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        await this.safeCallback(callback, conversationId, {
          success: false, error: error instanceof Error ? error.message : 'Unknown title generation error',
        });
        // Keep the rule title visible; a slow native sidecar can still replace it.
        const attempts = options.lateOfficialPollAttempts ?? options.officialPollAttempts ?? 12;
        if (attempts > 0) {
          const title = await this.waitForOfficialTitle(conversationId, {
            ...options, officialPollAttempts: attempts, rejectTitle: userMessage,
          }, controller.signal).catch(() => null);
          if (title && !controller.signal.aborted) {
            await this.safeCallback(callback, conversationId, { success: true, title, source: 'native' });
          }
        }
      }
    } finally {
      // A cancelled older task must never unregister its replacement.
      if (this.activeGenerations.get(conversationId) === controller) this.activeGenerations.delete(conversationId);
    }
  }

  private async generateWithBackend(request: {
    backend: AgentBackendKind; selected: ResolvedTitleModel; prompt: string; system: string; signal: AbortSignal;
  }): Promise<string | null> {
    const { backend, selected, prompt, system, signal } = request;
    if (backend === 'opencode2') {
      const adapter = this.plugin.agentServiceRegistry.get(backend) as unknown as {
        generateTitle?(prompt: string, provider: string, model: string, signal?: AbortSignal): Promise<string>;
      } | undefined;
      if (!adapter?.generateTitle) throw new Error('OpenCode 2 title generation unavailable');
      return this.parseTitle(await adapter.generateTitle(system + '\n\n' + prompt, selected.provider, selected.model, signal));
    }
    if (backend === 'opencode') return this.generateLegacy({ selected, prompt, system, signal });
    return this.generateAuxiliary({ ...request, model: this.toBackendModel(backend, selected) });
  }

  private async generateLegacy(request: { selected: TitleModel; prompt: string; system: string; signal: AbortSignal }): Promise<string | null> {
    let sessionId: string | null = null;
    try {
      sessionId = await this.plugin.openCodeService.createSession('Title Generation', { setCurrent: false });
      if (request.signal.aborted) return null;
      return this.extractTitle(await this.plugin.openCodeService.requestAssistantResponse(request.prompt, {
        sessionId, provider: request.selected.provider, model: request.selected.model, format: OUTPUT_FORMAT, system: request.system,
      }));
    } finally {
      if (sessionId) await this.plugin.openCodeService.deleteSession(sessionId).catch(() => undefined);
    }
  }

  private async generateAuxiliary(request: {
    backend: AgentBackendKind; model: BackendModelSelection; prompt: string; system: string; signal: AbortSignal;
  }): Promise<string | null> {
    const adapter = this.plugin.agentServiceRegistry.get(request.backend) as AgentAuxQueryCapability | undefined;
    if (!adapter?.hasCapability(AgentCapability.AuxQuery) || typeof adapter.startAuxQuerySession !== 'function') {
      throw new Error('Title backend has no read-only auxiliary query capability');
    }
    if (!this.workingDirectory) throw new Error('Title auxiliary query requires a working directory');
    let session: AuxQuerySession | undefined;
    const cancel = () => {
      session?.cancel();
      void session?.dispose().catch(() => undefined);
    };
    request.signal.addEventListener('abort', cancel, { once: true });
    try {
      session = await adapter.startAuxQuerySession({
        systemPrompt: request.system, workingDirectory: this.workingDirectory, turnTimeoutMs: 30_000,
        ...(request.model.model ? { model: request.model } : {}),
      });
      if (request.signal.aborted) { session.cancel(); return null; }
      const proof = session.safety;
      if (proof.backend !== request.backend
        || !['none', 'read-only-allowlist'].includes(proof.enforcedPolicy)
        || AUX_DENIED_CAPABILITIES.some((capability) => !proof.deniedCapabilities.includes(capability))
        || findWriteToolCalls(proof.effectiveTools.map((name) => ({ name }))).length) {
        throw new Error('Title auxiliary query read-only proof is invalid');
      }
      const result = await session.query({ prompt: request.prompt, signal: request.signal });
      if (!result.success) throw new Error(result.error);
      if (findWriteToolCalls(result.toolCalls).length) throw new Error('Title auxiliary query observed a forbidden tool');
      return this.parseTitle(result.text);
    } finally {
      request.signal.removeEventListener('abort', cancel);
      if (session) await session.dispose().catch(() => undefined);
    }
  }

  private toBackendModel(backend: AgentBackendKind, selected: TitleModel): BackendModelSelection {
    if (backend === 'claude-code' || backend === 'codex') return { kind: backend, model: selected.model };
    if (backend === 'opencode' || backend === 'opencode2' || backend === 'pi' || backend === 'dsh' || backend === 'zcode') {
      return { kind: backend, provider: selected.provider, model: selected.model };
    }
    throw new Error('Unsupported title backend');
  }

  private async waitForOfficialTitle(
    conversationId: string,
    options: TitleGenerationOptions & { rejectTitle?: string },
    signal: AbortSignal,
  ): Promise<string | null> {
    const sessionId = options.sessionId?.trim() || await this.resolveConversationSessionId(conversationId);
    if (!sessionId || signal.aborted) return null;
    const backend = await this.resolveConversationBackend(conversationId);
    const attempts = NATIVE_GENERATORS.has(backend) ? Math.max(1, options.officialPollAttempts ?? 12) : 1;
    for (let attempt = 0; attempt < attempts && !signal.aborted; attempt++) {
      let title: string | null;
      try { title = await this.withBudget(() => this.readOfficialSessionTitle(sessionId, backend, options.rejectTitle), 2_000, signal); }
      catch { return null; }
      if (title) return title;
      if (attempt < attempts - 1) await this.delay(options.officialPollIntervalMs ?? 1_500, signal);
    }
    return null;
  }

  private async readOfficialSessionTitle(sessionId: string, backend: AgentBackendKind, firstMessage = ''): Promise<string | null> {
    const snapshot = await readBackendSessionTitleSnapshot(this.plugin.agentServiceRegistry, { backend }, sessionId);
    if (!snapshot) return null;
    const candidate = snapshot.title.replace(/(?:\.{3}|…)$/, '').replace(/\s+/g, ' ').trim();
    if (snapshot.source === 'unknown' && candidate && firstMessage.replace(/\s+/g, ' ').trim().startsWith(candidate)) return null;
    return this.normalizeOfficialTitle(snapshot.title);
  }

  private async resolveConversationSessionId(conversationId: string): Promise<string | null> {
    const conversation = await this.plugin.getConversationById(conversationId, { preferCache: true }).catch(() => undefined);
    return conversation ? getConversationBackendSessionId(conversation) ?? null : null;
  }

  private async resolveConversationBackend(conversationId: string): Promise<AgentBackendKind> {
    const conversation = await this.plugin.getConversationById(conversationId, { preferCache: true });
    if (!conversation) throw new Error('Title conversation is unavailable');
    return conversation?.backend ?? 'opencode';
  }

  private normalizeOfficialTitle(rawTitle: string): string | null {
    const title = rawTitle.trim();
    if (!title || DEFAULT_TITLE.test(title)) return null;
    return Array.from(title).slice(0, 100).join('');
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0 || signal.aborted) return;
    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
      const timer = setTimeout(finish, ms);
      signal.addEventListener('abort', finish, { once: true });
    });
  }

  private async withBudget<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, parent: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    parent.addEventListener('abort', cancel, { once: true });
    if (parent.aborted) controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAborted: (() => void) | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw new Error('Title generation cancelled');
          return run(controller.signal);
        }),
        new Promise<never>((_, reject) => {
          rejectAborted = () => reject(new Error(parent.aborted ? 'Title generation cancelled' : 'Title generation timed out'));
          controller.signal.addEventListener('abort', rejectAborted, { once: true });
          timer = setTimeout(() => controller.abort(), Math.max(1, ms));
          if (controller.signal.aborted) rejectAborted();
        }),
      ]);
    } finally {
      clearTimeout(timer);
      parent.removeEventListener('abort', cancel);
      if (rejectAborted) controller.signal.removeEventListener('abort', rejectAborted);
    }
  }

  cancelConversation(conversationId: string): void {
    this.activeGenerations.get(conversationId)?.abort();
    this.activeGenerations.delete(conversationId);
  }

  cancelAll(): void {
    for (const controller of this.activeGenerations.values()) controller.abort();
    this.activeGenerations.clear();
  }

  private truncateText(text: string, maxLength: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    const chars = Array.from(normalized);
    return chars.length <= maxLength ? normalized : chars.slice(0, maxLength - 3).join('') + '...';
  }

  private extractTitle(response: ChatMessage | null): string | null {
    const structured = response?.structured as { title?: unknown } | undefined;
    const title = typeof structured?.title === 'string' ? this.normalizeTitleCandidate(structured.title) : null;
    return title ?? this.parseTitle(response?.content ?? '');
  }

  private parseTitle(responseText: string): string | null {
    const text = responseText.trim();
    try {
      const json = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as { title?: unknown };
      if (typeof json.title === 'string') return this.normalizeTitleCandidate(json.title);
    } catch { /* Plain text is also a supported backend response. */ }
    const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    return firstLine ? this.normalizeTitleCandidate(firstLine) : null;
  }

  private normalizeTitleCandidate(rawTitle: string): string | null {
    const title = rawTitle.replace(/^(?:title|标题)\s*[:：]\s*/i, '')
      .replace(/^["'`]+|["'`]+$/g, '').replace(/^[*-]\s*/, '').replace(/[.!?:;,，。！？；：]+$/u, '').trim();
    if (!title || DEFAULT_TITLE.test(title) || /^(?:null|undefined|true|false|\[.*\])$/i.test(title)
      || title.startsWith('{') || title.startsWith('~~~') || title.startsWith('```')) return null;
    const chars = Array.from(title);
    return chars.length > 50 ? chars.slice(0, 47).join('').trimEnd() + '...' : title;
  }

  private async safeCallback(callback: TitleGenerationCallback, conversationId: string, result: TitleGenerationResult): Promise<void> {
    try { await callback(conversationId, result); } catch { /* Persistence/presentation cannot break the chat path. */ }
  }
}
