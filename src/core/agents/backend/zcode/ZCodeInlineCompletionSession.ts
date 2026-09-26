/**
 * ZCodeInlineCompletionSession — sessionless, text-only inline completion.
 *
 * The official `workspace/generateText` protocol operation is a direct model
 * request, not `session/send`: it accepts an explicit `tools: []` list,
 * returns native `toolCalls`, supports operation-id cancellation, and does
 * not create a chat session. `tools: []` is audited source/request evidence,
 * not a native per-request effective-tool-list readback; a successful native
 * result with `toolCalls: []` observes one turn only. This deliberately does
 * not implement generic auxiliary queries: that contract also requires a
 * verified image turn, and `workspace/generateText` messages are text-only.
 */

import type {
  AuxObservedToolCall,
  AuxQuerySafetyProof,
} from '../AgentAuxQueryCapability';
import { AUX_DENIED_CAPABILITIES } from '../AgentAuxQueryCapability';
import {
  buildInlineCompletionTurnPrompt,
  INLINE_COMPLETION_TURN_TIMEOUT_MS,
  type InlineCompletionSession,
  type InlineCompletionTurnRequest,
  type InlineCompletionTurnResult,
} from '../AgentInlineCompletionCapability';
import { validateZCodeModelSelection, type ZCodeModelCatalog } from './ZCodeModelCatalog';

/** Exact native selection shape consumed by `workspace/generateText`. */
export interface ZCodeInlineCompletionModelSelection {
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoningLevel?: string | null;
}

/** The limited official protocol surface this class needs. */
export interface ZCodeWorkspaceGenerationTransport {
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

export interface ZCodeInlineCompletionSessionOptions {
  readonly transport: ZCodeWorkspaceGenerationTransport;
  readonly workingDirectory: string;
  readonly systemPrompt: string;
  /** Live runtime catalog; selections are validated before a request is sent. */
  readonly catalog: ZCodeModelCatalog;
  readonly model: ZCodeInlineCompletionModelSelection;
}

interface ActiveCompletion {
  readonly operationId: string;
  cancelled: boolean;
  cancelRequested: boolean;
  readonly cancellation: Promise<void>;
  readonly settleCancellation: () => void;
}

interface WorkspaceGenerateTextResult {
  readonly text?: unknown;
  readonly toolCalls?: unknown;
}

/** Never let a missing cancel ACK wait for the transport's 15-second timeout. */
const CANCEL_ACKNOWLEDGEMENT_TIMEOUT_MS = 1_000;

interface ValidatedModelSelection {
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoningLevel: string | null;
}

/**
 * A connection-warm completion channel with no native conversation state.
 *
 * `reset()` and `dispose()` only cancel an active direct request because the
 * protocol operation owns no session/thread to delete.  The adapter keeps its
 * app-server transport warm; every completion carries all text context anew.
 */
export class ZCodeInlineCompletionSession implements InlineCompletionSession {
  readonly queryId = `zcode-inline-${crypto.randomUUID()}`;
  /**
   * Direct-operation proof metadata. The official direct generation request
   * carries no tools, but it cannot satisfy the separate generic aux contract
   * that requires a native session effective-tool readback and image input.
   */
  readonly safety: AuxQuerySafetyProof = {
    backend: 'zcode',
    enforcedPolicy: 'none',
    effectiveTools: [],
    deniedCapabilities: AUX_DENIED_CAPABILITIES,
    mechanism: 'ZCode workspace/generateText with native tools:[] request and returned toolCalls; no session effective-tool readback',
  };

  private active: ActiveCompletion | null = null;
  private tail: Promise<void> = Promise.resolve();
  private disposed = false;
  private operationSequence = 0;

  private constructor(
    private readonly options: ZCodeInlineCompletionSessionOptions,
    private readonly model: ValidatedModelSelection,
  ) {}

  /** Validate model and reasoning level against the observed native catalog. */
  static create(options: ZCodeInlineCompletionSessionOptions): ZCodeInlineCompletionSession {
    const validation = validateZCodeModelSelection(options.catalog, options.model);
    if (!validation.ok) {
      throw new Error(validation.detail);
    }
    return new ZCodeInlineCompletionSession(options, {
      providerId: options.model.providerId,
      modelId: options.model.modelId,
      reasoningLevel: validation.reasoningLevel,
    });
  }

  async complete(request: InlineCompletionTurnRequest): Promise<InlineCompletionTurnResult> {
    if (this.disposed) {
      return { ok: false, error: 'ZCode inline completion session is closed.', cancelled: true };
    }
    // Match the shared warm wrapper: rapid retriggers serialize behind the
    // active turn. Cancellation settles within a bounded time, so the next
    // request is not held behind the app-server's transport timeout.
    const run = this.tail.then(() => this.runCompletion(request));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async reset(): Promise<void> {
    this.cancel();
    await this.tail;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.reset();
  }

  /** Cancel exactly the active native operation, never a chat session. */
  cancel(): void {
    const active = this.active;
    if (!active || active.cancelRequested) return;
    active.cancelRequested = true;
    active.cancelled = true;
    const acknowledgement = this.options.transport.request('workspace/cancelGenerateText', {
      operationId: active.operationId,
    });
    settleCancellationWithinBudget(acknowledgement, active.settleCancellation);
  }

  private async runCompletion(request: InlineCompletionTurnRequest): Promise<InlineCompletionTurnResult> {
    let settleCancellation: (() => void) | null = null;
    const cancellation = new Promise<void>((resolve) => { settleCancellation = resolve; });
    const active: ActiveCompletion = {
      operationId: `${this.queryId}-${++this.operationSequence}`,
      cancelled: false,
      cancelRequested: false,
      cancellation,
      settleCancellation: () => settleCancellation?.(),
    };
    this.active = active;
    const abort = (): void => this.cancel();
    request.signal?.addEventListener('abort', abort, { once: true });
    if (request.signal?.aborted) {
      abort();
    }
    const timeout = setTimeout(abort, INLINE_COMPLETION_TURN_TIMEOUT_MS);

    try {
      const generation = this.options.transport.request<WorkspaceGenerateTextResult>(
        'workspace/generateText',
        {
          workspace: {
            workspaceKey: this.options.workingDirectory,
            workspacePath: this.options.workingDirectory,
          },
          selection: {
            providerId: this.model.providerId,
            modelId: this.model.modelId,
            ...(this.model.reasoningLevel ? { options: { reasoningLevel: this.model.reasoningLevel } } : {}),
          },
          messages: this.buildMessages(request),
          tools: [],
          querySource: 'opencodian_inline_completion',
          operationId: active.operationId,
          maxOutputTokens: maxOutputTokens(request.maxChars),
        },
      );
      const outcome = await Promise.race([
        generation.then(
          (result) => ({ kind: 'result' as const, result }),
          () => ({ kind: 'failure' as const }),
        ),
        active.cancellation.then(() => ({ kind: 'cancelled' as const })),
      ]);
      if (outcome.kind === 'cancelled') {
        return cancelledResult();
      }
      if (outcome.kind === 'failure') {
        return { ok: false, error: 'ZCode inline completion request failed.' };
      }
      const { result } = outcome;
      if (active.cancelled || request.signal?.aborted) {
        return cancelledResult();
      }
      const text = typeof result.text === 'string' ? result.text : '';
      if (!text) {
        return { ok: false, error: 'ZCode inline completion returned an empty response.' };
      }
      request.onTextChunk?.(text);
      return { ok: true, text, toolCalls: parseToolCalls(result.toolCalls) };
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abort);
      if (this.active === active) {
        this.active = null;
      }
    }
  }

  private buildMessages(request: InlineCompletionTurnRequest): readonly { readonly role: 'system' | 'user'; readonly content: string }[] {
    const messages: { role: 'system' | 'user'; content: string }[] = [];
    const systemPrompt = this.options.systemPrompt.trim();
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: buildInlineCompletionTurnPrompt(request) });
    return messages;
  }
}

function maxOutputTokens(maxChars: number): number {
  // The model prompt remains the character-limit authority.  This native cap
  // is a conservative backstop (tokens are not characters).  Real providers
  // reject tiny max_output_tokens values; 64 is the smallest observed-safe
  // allowance for a short completion, while the UI still clips characters.
  return Math.min(2048, Math.max(64, Math.ceil(maxChars / 2)));
}

function parseToolCalls(value: unknown): readonly AuxObservedToolCall[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AuxObservedToolCall[] => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    return typeof record['name'] === 'string' && record['name']
      ? [{ name: record['name'], ...(typeof record['kind'] === 'string' ? { kind: record['kind'] } : {}) }]
      : [];
  });
}

function cancelledResult(): InlineCompletionTurnResult {
  return { ok: false, error: 'ZCode inline completion was cancelled.', cancelled: true };
}

/**
 * The app-server transport has a general request timeout.  Completion cannot
 * wait for that timeout after a user cancellation: an absent ACK is unknown,
 * not proof that the model turn continued.  The outstanding generation has a
 * rejection handler in `runCompletion`, so any late native result is ignored.
 */
function settleCancellationWithinBudget(request: Promise<unknown>, settle: () => void): void {
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    settle();
  };
  const timer = setTimeout(finish, CANCEL_ACKNOWLEDGEMENT_TIMEOUT_MS);
  void request.then(finish, finish);
}
