/**
 * InlineCompletionService — the warm completion session pool (design §3.2.4).
 *
 * The inline-edit aux contract is create-per-edit / dispose-on-exit; completion
 * has an opposite latency budget, so this pool keeps at most one warm, already
 * verified read-only session per `backend × workingDirectory`, prewarmed on
 * the first editor focus and disposed on a five-minute idle TTL. The session
 * is rebuilt (reset semantics) whenever the note path, the resolved model, or
 * the backend/working-directory key changes, so no server-side residue can
 * leak between notes.
 *
 * Failure semantics are fail-closed, never silent-downgrade (design §3.2.6):
 * - start failure → the backend is marked unsupported for this cycle and the
 *   user is told honestly (notice);
 * - a single failed turn → no suggestion this time (low-interruption silence);
 * - two consecutive turn failures → the session is disposed so the next
 *   trigger cold-restarts once;
 * - a third consecutive failure → the backend is unsupported for the cycle;
 * - an observed write-class tool call → dispose + unsupported + honest notice.
 * Nothing ever falls back to a local pseudo-completion.
 *
 * The controller audits each turn with the shared `findWriteToolCalls` and
 * reports violations here.
 */

import type { BackendModelSelection } from '../../core/agents/backend/AgentAuxQueryCapability';
import type {
  InlineCompletionSession,
} from '../../core/agents/backend/AgentInlineCompletionCapability';
import type { AgentBackendKind } from '../../core/types/chat';
import type { Locale } from '../../i18n';
import { t } from '../../i18n';

/** Idle lifetime of a pooled session (design §3.2.4: 5 minutes). */
export const INLINE_COMPLETION_IDLE_TTL_MS = 5 * 60 * 1000;

/**
 * The backend-side target one obtain() call resolves to. One snapshot per
 * call: the backend, its directory scope, and the model/effort the session
 * would be built with are captured together, so a mid-trigger backend or tab
 * switch can never mix two backends into one entry.
 */
export type InlineCompletionTarget =
  | {
    readonly ok: true;
    readonly backend: AgentBackendKind;
    readonly displayName: string;
    readonly workingDirectory: string;
    readonly model: BackendModelSelection | null;
    readonly effort: string | null;
    /** Build one verified read-only completion session (adapter-owned). */
    readonly startSession: () => Promise<InlineCompletionSession>;
  }
  | { readonly ok: false; readonly reason: 'capability-unavailable'; readonly backend: string }
  | { readonly ok: false; readonly reason: 'model-unavailable'; readonly detail: string };

/**
 * Everything the pool needs from the plugin runtime. Implemented over the
 * existing inline-edit host bridge, so model resolution follows the documented
 * chain (R-C3: dedicated `inlineCompletionModelOverrides` first, then
 * `inlineEditModelOverrides` → active chat model → backend default; with the
 * dedicated map empty the chain is byte-identical to the pre-setting
 * behaviour).
 */
export interface InlineCompletionPoolHost {
  /** Whether `inlineCompletionEnabled` is on. Off = the pool never starts. */
  isEnabled(): boolean;
  getLocale(): Locale;
  /** Output cap for one suggestion (`inlineCompletionMaxChars`). */
  getMaxChars(): number;
  /** Path of the note the next turn would run against ('' when unknown). */
  getNotePath(): string;
  /** Resolve the active backend's completion target for this call. */
  resolveCompletionTarget(): InlineCompletionTarget;
  /** Build the session system prompt (locale- and cap-aware). */
  buildSystemPrompt(): string;
}

export interface InlineCompletionPoolOptions {
  readonly host: InlineCompletionPoolHost;
  /**
   * Surfaces user-visible messages (Obsidian `Notice` in production).
   * Required, not optional: every message routed through here is an honesty
   * contract (design §3.2.6 — refusals are reported, never swallowed), so a
   * composition root that forgets it must fail to compile instead of
   * silently dropping `sessionUnavailable` / `unsupportedAfterFailures` /
   * `writeToolObserved` on the floor (defect R-C3-D1).
   */
  readonly notify: (message: string) => void;
  /** Idle lifetime override (tests); defaults to 5 minutes. */
  readonly ttlMs?: number;
}

/** Why a completion session could not be provided. */
export type InlineCompletionPoolError =
  | { readonly reason: 'disabled' }
  | { readonly reason: 'unsupported'; readonly backend: AgentBackendKind }
  | { readonly reason: 'capability-unavailable'; readonly backend: string }
  | { readonly reason: 'model-unavailable'; readonly detail: string }
  | { readonly reason: 'session-unavailable'; readonly detail: string };

export type InlineCompletionPoolResult =
  | {
    readonly ok: true;
    readonly session: InlineCompletionSession;
    readonly maxChars: number;
    readonly backend: AgentBackendKind;
    readonly displayName: string;
  }
  | { readonly ok: false; readonly error: InlineCompletionPoolError };

type ResolvedInlineCompletionTarget = Extract<InlineCompletionTarget, { ok: true }>;

interface PoolEntry {
  readonly backend: AgentBackendKind;
  readonly workingDirectory: string;
  session: InlineCompletionSession | null;
  starting: Promise<InlineCompletionSession> | null;
  /** Model reference the session was built with (switch → rebuild). */
  modelRef: string | null;
  /** Note the session context belongs to (switch → reset via rebuild). */
  notePath: string;
  ttlTimer: ReturnType<typeof setTimeout> | null;
}

export class InlineCompletionService {
  private readonly entries = new Map<string, PoolEntry>();
  /** Latest R-F4 exclusive warm request; cancels older backend snapshots. */
  private exclusiveWarmGeneration = 0;
  /** Consecutive turn failures per backend (across rebuilds). */
  private readonly turnFailures = new Map<AgentBackendKind, number>();
  /** Backends that may not run completions until the next enable cycle. */
  private readonly unsupportedBackends = new Set<AgentBackendKind>();
  private readonly ttlMs: number;

  constructor(private readonly options: InlineCompletionPoolOptions) {
    this.ttlMs = options.ttlMs ?? INLINE_COMPLETION_IDLE_TTL_MS;
  }

  /** Backends currently marked unsupported (diagnostics/tests). */
  isUnsupported(backend: AgentBackendKind): boolean {
    return this.unsupportedBackends.has(backend);
  }

  /** Whether a warm session exists for the given backend (diagnostics/tests). */
  hasSession(backend: AgentBackendKind): boolean {
    return [...this.entries.values()].some(
      (entry) => entry.backend === backend && entry.session !== null,
    );
  }

  /** Number of live pooled sessions (diagnostics/tests). */
  sessionCount(): number {
    return [...this.entries.values()].filter((entry) => entry.session !== null).length;
  }

  /**
   * Prewarm on the first editor focus: start the session for the current
   * backend so the trigger path pays no cold start. Fire-and-forget; failures
   * follow the normal fail-closed path (unsupported + notice).
   */
  prewarm(): void {
    void this.obtain();
  }

  /**
   * R-F4 chat warm-up: retain only the active target's session. The target is
   * captured once before cleanup, so switching backends while a native session
   * starts cannot create a session for the newly active backend by accident.
   * This only constructs/warm-ups the read-only auxiliary session; it never
   * submits a completion turn.
   */
  async prewarmExclusive(): Promise<void> {
    const generation = ++this.exclusiveWarmGeneration;
    if (!this.options.host.isEnabled()) return;
    const target = this.options.host.resolveCompletionTarget();
    if (!target.ok) {
      // No usable active backend means the exclusive invariant has no target
      // key to retain. Evict any prior backend immediately; this also awaits
      // pending native starts so late sessions are disposed rather than leaked.
      const stale = [...this.entries.entries()].map(([entryKey, entry]) => {
        this.entries.delete(entryKey);
        return this.disposeEntry(entry);
      });
      await Promise.all(stale);
      return;
    }
    await this.prewarmExclusiveTarget(target, generation);
  }

  /**
   * Provide the warm session for the current context, starting or rebuilding
   * it as needed. Every branch is fail-closed: an unusable context is an
   * error result, never a degraded session.
   */
  async obtain(): Promise<InlineCompletionPoolResult> {
    if (!this.options.host.isEnabled()) {
      return { ok: false, error: { reason: 'disabled' } };
    }
    const target = this.options.host.resolveCompletionTarget();
    return this.obtainTarget(target);
  }

  private async prewarmExclusiveTarget(
    target: InlineCompletionTarget,
    generation: number,
  ): Promise<void> {
    if (!target.ok) return;
    const key = this.keyFor(target);
    // Delete each entry before awaiting native disposal. A resolving old start
    // cannot remain in the map, and `obtainTarget` detects that stale identity
    // before publishing it as a live session.
    const stale = [...this.entries.entries()]
      .filter(([entryKey]) => entryKey !== key)
      .map(([entryKey, entry]) => {
        this.entries.delete(entryKey);
        return this.disposeEntry(entry);
    });
    await Promise.all(stale);
    // A second backend switch could have occurred while teardown awaited. It
    // owns the newer snapshot; do not recreate an old target after cleanup.
    if (generation !== this.exclusiveWarmGeneration) return;
    // Chat warming deliberately has no note context. Unlike R-C3's editor
    // path, it only starts the backend's empty read-only auxiliary runtime.
    await this.obtainTarget(target, '', generation);
  }

  /** Start/reuse one already-snapshotted target. */
  private async obtainTarget(
    target: InlineCompletionTarget,
    notePath = this.options.host.getNotePath(),
    exclusiveGeneration?: number,
  ): Promise<InlineCompletionPoolResult> {
    if (!target.ok) {
      return this.unavailableTargetResult(target);
    }
    if (this.unsupportedBackends.has(target.backend)) {
      return { ok: false, error: { reason: 'unsupported', backend: target.backend } };
    }
    if (this.isExclusiveWarmInvalidated(exclusiveGeneration)) return this.supersededResult();
    const workingDirectory = target.workingDirectory;
    const key = this.keyFor(target);
    const modelRef = describeModelRef(target.model);

    let entry = this.entries.get(key);
    if (entry && this.entryNeedsRebuild(entry, modelRef, notePath, exclusiveGeneration)) {
      // Model or note switched: the native context must not survive. Rebuild
      // through the adapter's own read-only construction (reset semantics).
      await this.disposeEntry(entry);
      entry = undefined;
    }
    if (!entry) {
      entry = {
        backend: target.backend,
        workingDirectory,
        session: null,
        starting: null,
        modelRef,
        notePath,
        ttlTimer: null,
      };
      this.entries.set(key, entry);
    }

    const startError = await this.ensureEntrySession(entry, key, target);
    if (startError) return { ok: false, error: startError };

    const session = entry.session;
    if (!session) {
      return { ok: false, error: { reason: 'session-unavailable', detail: 'no session' } };
    }
    this.touch(entry);
    return {
      ok: true,
      session,
      maxChars: this.options.host.getMaxChars(),
      backend: target.backend,
      displayName: target.displayName,
    };
  }

  private unavailableTargetResult(
    target: Exclude<InlineCompletionTarget, ResolvedInlineCompletionTarget>,
  ): InlineCompletionPoolResult {
    return target.reason === 'model-unavailable'
      ? { ok: false, error: { reason: 'model-unavailable', detail: target.detail } }
      : { ok: false, error: { reason: 'capability-unavailable', backend: target.backend } };
  }

  private isExclusiveWarmInvalidated(generation: number | undefined): boolean {
    return generation !== undefined && generation !== this.exclusiveWarmGeneration;
  }

  private entryNeedsRebuild(
    entry: PoolEntry,
    modelRef: string,
    notePath: string,
    exclusiveGeneration: number | undefined,
  ): boolean {
    if (entry.modelRef !== modelRef) return true;
    return exclusiveGeneration !== undefined
      ? entry.notePath !== ''
      : entry.notePath !== notePath && notePath !== '';
  }

  private async ensureEntrySession(
    entry: PoolEntry,
    key: string,
    target: ResolvedInlineCompletionTarget,
  ): Promise<InlineCompletionPoolError | null> {
    if (entry.session) return null;
    if (!entry.starting) entry.starting = target.startSession();
    const starting = entry.starting;
    if (!starting) return { reason: 'session-unavailable', detail: 'no session' };
    try {
      const session = await starting;
      if (!this.isCurrentStart(key, entry, starting)) return this.supersededError();
      entry.session = session;
    } catch (error) {
      if (!this.isCurrentStart(key, entry, starting)) return this.supersededError();
      entry.starting = null;
      this.entries.delete(key);
      this.markUnsupported(target.backend);
      this.notifyUnsupportedStart(target.displayName, error);
      return {
        reason: 'session-unavailable',
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (entry.starting === starting) entry.starting = null;
    }
    return null;
  }

  private isCurrentStart(key: string, entry: PoolEntry, starting: Promise<InlineCompletionSession>): boolean {
    return this.entries.get(key) === entry && entry.starting === starting;
  }

  private supersededResult(): InlineCompletionPoolResult {
    return { ok: false, error: this.supersededError() };
  }

  private supersededError(): InlineCompletionPoolError {
    return { reason: 'session-unavailable', detail: 'session superseded by backend switch' };
  }

  /**
   * Report a finished, clean turn: resets the consecutive-failure counter.
   */
  reportTurnSuccess(backend: AgentBackendKind): void {
    this.turnFailures.delete(backend);
  }

  /**
   * Report one failed (non-violating) turn: silent for the user, but two in a
   * row dispose the session so the next attempt cold-restarts, and a third
   * marks the backend unsupported for this cycle.
   */
  reportTurnFailure(backend: AgentBackendKind): void {
    const failures = (this.turnFailures.get(backend) ?? 0) + 1;
    this.turnFailures.set(backend, failures);
    if (failures < 2) return;
    void this.disposeBackendSessions(backend);
    if (failures >= 3) {
      this.markUnsupported(backend);
      this.notify(t('inlineCompletion.error.unsupportedAfterFailures', {
        backend,
      }));
    }
  }

  /**
   * A write-class tool was observed on a completion turn: the session is
   * disposed, the backend is unsupported for this cycle, and the user is
   * told honestly. The ghost never entered the document, so there is no
   * damage to undo — the response is simply discarded by the controller.
   */
  reportWriteToolViolation(backend: AgentBackendKind, displayName: string, tools: readonly string[]): void {
    this.markUnsupported(backend);
    void this.disposeBackendSessions(backend);
    this.notify(t('inlineCompletion.error.writeToolObserved', {
      backend: displayName,
      tools: tools.join(', '),
    }));
  }

  /** Clear the unsupported marks (new enable cycle). */
  resetUnsupported(): void {
    this.unsupportedBackends.clear();
    this.turnFailures.clear();
  }

  /** Dispose every pooled session (toggle off, plugin unload). */
  async disposeAll(): Promise<void> {
    // An exclusive warm-up may be paused after it disposed stale entries but
    // before it starts its captured target. Invalidate that snapshot first so
    // toggle-off remains a strict zero-session state.
    this.exclusiveWarmGeneration += 1;
    await Promise.all([...this.entries.values()].map((entry) => this.disposeEntry(entry)));
    this.entries.clear();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private touch(entry: PoolEntry): void {
    if (entry.ttlTimer) clearTimeout(entry.ttlTimer);
    entry.ttlTimer = setTimeout(() => {
      entry.ttlTimer = null;
      void this.disposeEntry(entry).then(() => {
        // Keep the map honest: a TTL-expired entry is fully gone.
        const key = `${entry.backend}::${entry.workingDirectory}`;
        if (this.entries.get(key) === entry) this.entries.delete(key);
      });
    }, this.ttlMs);
  }

  private keyFor(target: Extract<InlineCompletionTarget, { ok: true }>): string {
    return `${target.backend}::${target.workingDirectory}`;
  }

  private async disposeBackendSessions(backend: AgentBackendKind): Promise<void> {
    for (const [key, entry] of [...this.entries.entries()]) {
      if (entry.backend !== backend) continue;
      this.entries.delete(key);
      await this.disposeEntry(entry);
    }
  }

  private async disposeEntry(entry: PoolEntry): Promise<void> {
    if (entry.ttlTimer) {
      clearTimeout(entry.ttlTimer);
      entry.ttlTimer = null;
    }
    const session = entry.session;
    entry.session = null;
    const starting = entry.starting;
    entry.starting = null;
    if (starting) {
      // A session that is still starting must be disposed once it resolves,
      // or its native runtime would leak past the pool's teardown.
      try {
        const created = await starting;
        await created.dispose().catch(() => { /* Native teardown is best effort. */ });
      } catch {
        // Start failures have nothing to dispose.
      }
      return;
    }
    await session?.dispose().catch(() => { /* Native teardown is best effort. */ });
  }

  private markUnsupported(backend: AgentBackendKind): void {
    this.unsupportedBackends.add(backend);
  }

  private notifyUnsupportedStart(displayName: string, error: unknown): void {
    this.notify(t('inlineCompletion.error.sessionUnavailable', {
      backend: displayName,
      detail: error instanceof Error ? error.message : String(error),
    }));
  }

  private notify(message: string): void {
    this.options.notify(message);
  }
}

/** Stable string for the model a session was built with (switch detection). */
function describeModelRef(model: BackendModelSelection | null): string {
  if (!model) return '';
  switch (model.kind) {
    case 'opencode':
    case 'pi':
      return `${model.kind}:${model.provider}/${model.model}`;
    case 'claude-code':
      return `${model.kind}:${model.model}`;
    case 'codex':
      return `${model.kind}:${model.model}${model.reasoningEffort ? `@${model.reasoningEffort}` : ''}`;
  }
}
