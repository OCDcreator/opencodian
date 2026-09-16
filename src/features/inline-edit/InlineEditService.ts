/**
 * InlineEditService — backend-agnostic orchestration for one inline edit.
 *
 * Responsibilities (docs/requirements/inline-edit.md §5, §7.6, §8.3):
 * - create one `AuxQuerySession` per inline edit and dispose it on every exit
 *   path, so no native session survives a rejected or cancelled edit;
 * - build the request, parse the reply, and run the clarification loop through
 *   `followUp()` on the same native session;
 * - audit the tool calls the backend reported and discard the result when any
 *   write-class tool was observed (fail closed, §5.5 rule 2);
 * - own the dirty check that gates the final write.
 *
 * It never touches the editor: applying the accepted text is the controller's
 * job, which keeps the write path to a single `editor.replaceRange` call.
 */

import type {
  AuxQueryResult,
  AuxQuerySession,
} from '../../core/agents/backend/AgentAuxQueryCapability';
import { findWriteToolCalls } from '../../core/agents/backend/AgentAuxQueryCapability';
import type { Locale } from '../../i18n';
import {
  buildInlineEditRequest,
  buildInlineEditSystemPrompt,
  type InlineEditRequest,
  parseInlineEditResponse,
} from './InlineEditPrompt';
import type { InlineEditHostAdapter, InlineEditOutcome } from './InlineEditTypes';

/** Everything the service needs to issue requests for one inline edit. */
export interface InlineEditServiceConfig {
  readonly adapter: InlineEditHostAdapter;
  readonly workingDirectory: string;
  readonly locale: Locale;
  readonly signal?: AbortSignal;
}

export class InlineEditService {
  private session: AuxQuerySession | null = null;
  private starting: Promise<AuxQuerySession> | null = null;
  private disposed = false;

  constructor(private readonly config: InlineEditServiceConfig) {}

  /** True once a native session exists; used for diagnostics. */
  get hasSession(): boolean {
    return this.session !== null;
  }

  /**
   * Send the first turn for `request`.
   *
   * Rejects with `status: 'error'` when the backend cannot start a read-only
   * session — the session is never downgraded to a prompting-only mode.
   */
  async submit(request: InlineEditRequest): Promise<InlineEditOutcome> {
    const built = buildInlineEditRequest(request);
    if (!built.ok) {
      return { status: 'error', reason: built.error };
    }
    const session = await this.ensureSession();
    if ('status' in session) return session;
    const signal = this.config.signal;
    return this.runTurn(session.query({
      prompt: built.prompt,
      ...(signal ? { signal } : {}),
    }));
  }

  /** Continue the clarification loop on the same native session. */
  async clarify(instruction: string): Promise<InlineEditOutcome> {
    const session = this.session;
    if (!session) {
      return { status: 'error', reason: 'no-session' };
    }
    const prompt = instruction.trim();
    if (!prompt) {
      return { status: 'error', reason: 'empty-instruction' };
    }
    const signal = this.config.signal;
    return this.runTurn(session.followUp(prompt, signal ? { signal } : undefined));
  }

  /** Cancel the in-flight turn; the session stays alive for a retry. */
  cancel(): void {
    this.session?.cancel();
  }

  /** Idempotent teardown of the native session. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const session = this.session;
    this.session = null;
    this.starting = null;
    if (!session) return;
    await session.dispose();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async ensureSession(): Promise<AuxQuerySession | InlineEditOutcome> {
    if (this.session) return this.session;
    if (this.starting) {
      try {
        return await this.starting;
      } catch (error) {
        return this.describeStartFailure(error);
      }
    }
    const capability = this.config.adapter.getAuxQuery();
    if (!capability) {
      return {
        status: 'error',
        reason: 'capability-unavailable',
        detail: this.config.adapter.kind,
      };
    }
    const resolved = this.config.adapter.resolveModel();
    if (!resolved.ok) {
      return { status: 'error', reason: 'model-unavailable', detail: resolved.error };
    }
    const effort = this.config.adapter.getEffort?.() ?? null;
    this.starting = capability.startAuxQuerySession({
      systemPrompt: buildInlineEditSystemPrompt(this.config.locale),
      workingDirectory: this.config.workingDirectory,
      ...(resolved.model ? { model: resolved.model } : {}),
      ...(effort ? { effort } : {}),
    });
    try {
      const session = await this.starting;
      this.session = session;
      return session;
    } catch (error) {
      return this.describeStartFailure(error);
    } finally {
      this.starting = null;
    }
  }

  private describeStartFailure(error: unknown): InlineEditOutcome {
    return {
      status: 'error',
      reason: 'session-unavailable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  /** Await one turn and apply the response contract plus the write audit. */
  private async runTurn(turn: Promise<AuxQueryResult>): Promise<InlineEditOutcome> {
    const result = await turn;
    if (!result.success) {
      if (result.cancelled) {
        return { status: 'error', reason: 'cancelled' };
      }
      // A backend that failed its own verification is not reusable.
      await this.dispose();
      return { status: 'error', reason: 'turn-failed', detail: result.error };
    }

    // §5.5 rule 2: any write-class tool call invalidates the whole turn.
    const violations = findWriteToolCalls(result.toolCalls);
    if (violations.length > 0) {
      await this.dispose();
      return {
        status: 'error',
        reason: 'write-tool-observed',
        detail: violations.join(', '),
      };
    }

    const parsed = parseInlineEditResponse(result.text);
    switch (parsed.kind) {
      case 'replacement':
      case 'insertion':
        return { status: 'preview', mode: parsed.kind, text: parsed.text };
      case 'clarification':
        return { status: 'clarification', text: parsed.text };
      default:
        return { status: 'error', reason: parsed.error };
    }
  }
}

/**
 * Dirty check (§7.5).
 *
 * The accepted text is only written when the editor still holds exactly the
 * snapshot the request was built from. Any user edit, or any other transaction
 * that touched the range, makes the offsets meaningless.
 */
export function canApplyEdit(snapshot: string, currentText: string): boolean {
  return snapshot === currentText;
}
