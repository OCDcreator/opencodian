/**
 * OpenCodeAuxQuerySession — read-only auxiliary session on an isolated OpenCode scope.
 *
 * Every session owns exactly one native OpenCode session inside the isolated
 * server from `OpenCodeAuxScope`, and deletes it on `dispose()`. The session
 * never touches the chat server, so it cannot appear in the plugin's session
 * list, trigger sync events, or affect chat runtime state.
 *
 * Tool calls are read back from the session message history after each turn and
 * returned in `AuxQueryResult.toolCalls` for the service-layer write audit.
 *
 * See docs/requirements/inline-edit.md §5.2–§5.5.
 */

import { createLogger } from '../../../../shared/logger';
import type {
  AuxObservedToolCall,
  AuxQueryResult,
  AuxQuerySafetyProof,
  AuxQuerySession,
  AuxQueryTurnRequest,
  BackendModelSelection,
} from '../AgentAuxQueryCapability';
import { AUX_DENIED_CAPABILITIES } from '../AgentAuxQueryCapability';
import { auxFetchTransport,type AuxTransport } from './AuxTransport';
import { OpenCodeAuxScope, scopeUrl } from './OpenCodeAuxScope';

const logger = createLogger('OpenCodeAuxQuerySession');

/** File extension per image media type; mirrors the chat-side mapping. */
const AUX_IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export interface OpenCodeAuxSessionOptions {
  readonly systemPrompt: string;
  readonly model?: BackendModelSelection;
  readonly workingDirectory: string;
  /** Shared isolated scope; started on first use and reused across sessions. */
  readonly scope: OpenCodeAuxScope;
  /** Name of the read-only agent defined by the scope config. */
  readonly agentName: string;
  /** Wall-clock budget for a single turn. */
  readonly turnTimeoutMs?: number;
  /** HTTP transport; must match the scope's (requestUrl inside Obsidian). */
  readonly transport?: AuxTransport;
}

const DEFAULT_TURN_TIMEOUT_MS = 180_000;

/** Raw part as returned by `/session/:id/message`. */
interface OpenCodePart {
  readonly type?: string;
  readonly tool?: string;
  readonly text?: string;
  readonly state?: { readonly status?: string };
}

interface OpenCodeMessageEnvelope {
  readonly info?: { readonly role?: string };
  readonly parts?: readonly OpenCodePart[];
}

export class OpenCodeAuxQuerySession implements AuxQuerySession {
  readonly queryId: string;
  readonly safety: AuxQuerySafetyProof;

  private nativeSessionId: string | null = null;
  private inFlight: AbortController | null = null;
  private disposed = false;
  private readonly transport: AuxTransport;

  private constructor(
    private readonly options: OpenCodeAuxSessionOptions,
    private readonly baseUrl: string,
    private readonly sessionDirectory: string,
    safety: AuxQuerySafetyProof,
  ) {
    this.queryId = `oc-aux-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.safety = safety;
    this.transport = options.transport ?? auxFetchTransport;
  }

  /**
   * Create the auxiliary session. Rejects when the isolated scope cannot be
   * verified read-only (fail closed).
   */
  static async create(options: OpenCodeAuxSessionOptions): Promise<OpenCodeAuxQuerySession> {
    const baseUrl = await options.scope.ensureStarted(options.workingDirectory);
    const verification = options.scope.getVerification();
    const safety: AuxQuerySafetyProof = {
      backend: 'opencode',
      enforcedPolicy: 'read-only-allowlist',
      effectiveTools: verification.allowed,
      deniedCapabilities: AUX_DENIED_CAPABILITIES,
      mechanism: `isolated opencode scope + agent "${verification.agent.name}" `
        + `(tools allowlist + trailing "*" permission deny)`,
    };

    const session = new OpenCodeAuxQuerySession(
      options,
      baseUrl,
      options.scope.getSessionDirectory(),
      safety,
    );
    await session.createNativeSession();
    return session;
  }

  async query(request: AuxQueryTurnRequest): Promise<AuxQueryResult> {
    return this.runTurn(request, false);
  }

  async followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult> {
    return this.runTurn({ ...request, prompt }, true);
  }

  cancel(): void {
    this.inFlight?.abort();
    const sessionId = this.nativeSessionId;
    if (sessionId) {
      void this.transport(this.url(`/session/${sessionId}/abort`), { method: 'POST' })
        .catch((error: unknown) => { logger.debug('Abort request failed', error); });
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.inFlight?.abort();
    this.inFlight = null;
    const sessionId = this.nativeSessionId;
    this.nativeSessionId = null;
    if (!sessionId) return;
    try {
      await this.transport(this.url(`/session/${sessionId}`), { method: 'DELETE' });
    } catch (error) {
      logger.warn('Failed to delete auxiliary OpenCode session', error);
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private url(route: string): string {
    return scopeUrl(this.baseUrl, route, this.sessionDirectory);
  }

  private async createNativeSession(): Promise<void> {
    const response = await this.transport(this.url('/session'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'OpenCodian inline edit (auxiliary)' }),
    });
    if (!response.ok) {
      throw new Error(`OpenCode auxiliary session creation failed (${response.status}).`);
    }
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== 'string' || !payload.id) {
      throw new Error('OpenCode auxiliary session creation returned no id.');
    }
    this.nativeSessionId = payload.id;
  }

  private async runTurn(request: AuxQueryTurnRequest, isFollowUp: boolean): Promise<AuxQueryResult> {
    const sessionId = this.nativeSessionId;
    if (this.disposed || !sessionId) {
      return { success: false, error: 'OpenCode auxiliary session is not available.', cancelled: true };
    }
    if (this.inFlight) {
      return { success: false, error: 'OpenCode auxiliary session is already running a turn.' };
    }

    const controller = new AbortController();
    this.inFlight = controller;
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS,
    );
    request.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const before = await this.readHistory(sessionId, controller.signal);
      const response = await this.transport(this.url(`/session/${sessionId}/message`), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(this.buildPromptBody(request)),
      });
      if (!response.ok) {
        return {
          success: false,
          error: `OpenCode auxiliary turn failed (${response.status}).`,
        };
      }
      await response.text();

      const after = await this.readHistory(sessionId, controller.signal);
      const produced = after.slice(before.length);
      const text = accumulateAssistantText(produced);
      const toolCalls = collectToolCalls(produced);
      request.onTextChunk?.(text);

      if (!isFollowUp && !text) {
        return { success: false, error: 'OpenCode auxiliary turn returned an empty response.' };
      }
      return { success: true, text, toolCalls };
    } catch (error) {
      if (isAbortError(error)) {
        return { success: false, error: 'OpenCode auxiliary turn was cancelled.', cancelled: true };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
      if (this.inFlight === controller) {
        this.inFlight = null;
      }
    }
  }

  private buildPromptBody(request: AuxQueryTurnRequest): Record<string, unknown> {
    const parts: Record<string, unknown>[] = [{ type: 'text', text: request.prompt }];
    // Image attachments reuse the chat-side wire shape
    // (OpenCodeContextPartSerializer): a `file` part carrying a data URL.
    // Nothing is written to disk — the payload travels inside the message.
    for (const image of request.images ?? []) {
      parts.push({
        type: 'file',
        mime: image.mediaType,
        filename: `inline-edit.${AUX_IMAGE_EXTENSIONS[image.mediaType] ?? 'bin'}`,
        url: `data:${image.mediaType};base64,${image.data}`,
      });
    }
    const body: Record<string, unknown> = {
      agent: this.options.agentName,
      system: this.options.systemPrompt,
      parts,
    };
    const model = this.options.model;
    if (model && model.kind === 'opencode') {
      body.model = { providerID: model.provider, modelID: model.model };
    }
    return body;
  }

  private async readHistory(
    sessionId: string,
    signal: AbortSignal,
  ): Promise<readonly OpenCodeMessageEnvelope[]> {
    const response = await this.transport(this.url(`/session/${sessionId}/message`), { signal });
    if (!response.ok) {
      throw new Error(`OpenCode auxiliary history read failed (${response.status}).`);
    }
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) return [];
    return payload.filter(
      (entry): entry is OpenCodeMessageEnvelope => typeof entry === 'object' && entry !== null,
    );
  }
}

function accumulateAssistantText(messages: readonly OpenCodeMessageEnvelope[]): string {
  const chunks: string[] = [];
  for (const message of messages) {
    if (message.info?.role !== 'assistant') continue;
    for (const part of message.parts ?? []) {
      if (part.type === 'text' && typeof part.text === 'string' && part.text) {
        chunks.push(part.text);
      }
    }
  }
  return chunks.join('');
}

function collectToolCalls(messages: readonly OpenCodeMessageEnvelope[]): AuxObservedToolCall[] {
  const seen = new Set<string>();
  const calls: AuxObservedToolCall[] = [];
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (part.type !== 'tool' || typeof part.tool !== 'string' || !part.tool) continue;
      const key = `${part.tool}#${part.state?.status ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      calls.push({ name: part.tool, kind: part.tool.startsWith('mcp') ? 'mcp' : undefined });
    }
  }
  return calls;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
}
