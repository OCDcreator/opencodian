/**
 * AgentInlineCompletionCapability — backend-neutral ghost-text completion channel.
 *
 * Purpose: the R-C3 Alt-triggered inline completion runs short, stateless
 * read-only turns over *warm* sessions. It is a sibling of
 * `AgentAuxQueryCapability` (inline edit), not a replacement: the aux
 * create-per-edit / dispose-on-exit contract is untouched, and this channel
 * reuses the same runtime-proven read-only mechanisms instead of inventing
 * new ones (docs/requirements/flowtext-c3-design.md §3.2).
 *
 * Contract invariants (design §3.2 — audited item by item):
 *
 * 1. **Warm session, cold semantics.** Only the native process/connection is
 *    reused across turns. Every turn's meaning is fully carried by the
 *    `prefix`/`suffix` request; the server must never be *depended on* to
 *    remember previous turns. `reset()` discards any residual native context
 *    and must be called when the note (or backend model) changes.
 * 2. **Read-only guarantee equal to aux, by reuse not rewrite.** Sessions are
 *    built on the same per-backend read-only machinery as aux sessions and
 *    carry the same `AuxQuerySafetyProof`; a failed proof rejects the session
 *    (fail closed, no prompt-only downgrade).
 * 3. **Per-turn write audit.** `complete()` reports observed tool calls; the
 *    feature layer audits them with the shared `findWriteToolCalls`. A
 *    completion turn must observe zero write-class tools.
 *
 * See docs/requirements/flowtext-parity.md R-C3 and §6.1.
 */

import type {
  AuxObservedToolCall,
  AuxQuerySafetyProof,
  BackendModelSelection,
} from './AgentAuxQueryCapability';
import type { AgentService } from './AgentService';

/** Longest cursor-prefix window embedded in one turn (whole-line aligned). */
export const INLINE_COMPLETION_PREFIX_WINDOW_CHARS = 4000;
/** Longest cursor-suffix window embedded in one turn. */
export const INLINE_COMPLETION_SUFFIX_WINDOW_CHARS = 1000;
/**
 * Hard wall-clock budget for one completion turn (design §3.2: turn-level
 * timeout as the backstop). The 800 ms figure is the first-byte *budget* that
 * prewarmed sessions are measured against — it is recorded per backend, not
 * enforced as an abort, so a slow-but-working backend stays usable and is
 * labelled honestly (design §8 C3-Q5) instead of being killed mid-flight.
 */
export const INLINE_COMPLETION_TURN_TIMEOUT_MS = 4_000;

/** One stateless completion request (design §3.2). */
export interface InlineCompletionTurnRequest {
  /** Text before the cursor (≤ `INLINE_COMPLETION_PREFIX_WINDOW_CHARS`, line aligned). */
  readonly prefix: string;
  /** Text after the cursor (≤ `INLINE_COMPLETION_SUFFIX_WINDOW_CHARS`). */
  readonly suffix: string;
  /** Hard output cap in characters (from `inlineCompletionMaxChars`). */
  readonly maxChars: number;
  readonly signal?: AbortSignal;
  /**
   * Progressive callback: the accumulated suggestion so far. Ghost text may
   * appear chunk by chunk to cut first-byte latency; every chunk is validated
   * by the feature layer before display.
   */
  readonly onTextChunk?: (accumulated: string) => void;
}

export type InlineCompletionTurnResult =
  | { ok: true; text: string; toolCalls: readonly AuxObservedToolCall[] }
  | { ok: false; error: string; cancelled?: boolean; unsupported?: boolean };

/**
 * A warm, reusable, provably read-only completion session.
 *
 * Native state (CLI process, thread, isolated scope session) is owned by the
 * session and released by `dispose()`. Turns are internally serialized; a new
 * `complete()` never runs concurrently with a previous one.
 */
export interface InlineCompletionSession {
  readonly queryId: string;
  /** Same runtime proof shape as aux sessions, produced by the same mechanism. */
  readonly safety: AuxQuerySafetyProof;
  /** Run one stateless completion turn. */
  complete(request: InlineCompletionTurnRequest): Promise<InlineCompletionTurnResult>;
  /** Discard any residual native session context (note / model switch). */
  reset(): Promise<void>;
  /** Idempotent teardown of the native session state. */
  dispose(): Promise<void>;
}

/** Configuration for a new completion session. */
export interface InlineCompletionSessionConfig {
  readonly systemPrompt: string;
  readonly model?: BackendModelSelection;
  readonly effort?: string;
  readonly workingDirectory: string;
}

/**
 * Optional capability: a backend that cannot host a verified read-only
 * completion session simply does not implement it (honest unavailability,
 * docs/requirements/flowtext-parity.md §6.5).
 */
export interface AgentInlineCompletionCapability extends AgentService {
  startInlineCompletionSession(config: InlineCompletionSessionConfig): Promise<InlineCompletionSession>;
}

/**
 * The user-turn message for one completion request. Shared by every backend
 * wrapper so the wire format stays comparable across backends (backend-agnostic
 * is an acceptance item, §6.5): the model sees the prefix, a caret marker, and
 * the suffix, and must reply with the continuation only.
 */
export function buildInlineCompletionTurnPrompt(request: InlineCompletionTurnRequest): string {
  const lines = [
    `Continue the text at the caret (^.^). Reply with the continuation ONLY —`,
    `at most ${request.maxChars} characters, ending at a natural sentence or paragraph boundary.`,
    'Do not repeat any part of the text before the caret. Do not rewrite it.',
    'Output plain text only: no code fences, no commentary, no markup tags of any kind.',
    'Match the language, register, and markdown style of the surrounding text.',
    'If the text ends inside a word, complete that word first.',
    '',
    '--- text before the caret ---',
    request.prefix,
    '<^.^>',
    '--- text after the caret ---',
    request.suffix,
    '--- end ---',
  ];
  return lines.join('\n');
}
