/**
 * AgentAuxQueryCapability — backend-neutral one-shot auxiliary query channel.
 *
 * Purpose: run a short-lived, provably read-only agent turn that is completely
 * independent from chat. Callers are features such as inline edit, where the
 * plugin — not the backend — owns the only write path (`editor.replaceRange`).
 *
 * Two invariants make this interface safe to expose:
 *
 * 1. **fail closed** — `startAuxQuerySession()` must reject when the backend
 *    cannot be *runtime-verified* read-only. A prompt instruction is never an
 *    accepted substitute for an enforced mechanism.
 * 2. **no chat side effects** — an aux session must not appear in the plugin
 *    session list, must not touch chat sync/title/notification paths, and must
 *    clean up every native artefact on `dispose()`.
 *
 * See docs/requirements/inline-edit.md §5 for the full contract and §11 for the
 * per-backend security audit that gates the implementation.
 */

import type { AgentBackendKind } from '../../types/chat';
import type { AgentService } from './AgentService';

/**
 * Backend-normalised model reference.
 *
 * Deliberately not a single `{ provider, model }` shape: each backend has a
 * different model identity model, and forcing a common structure would lose
 * information (Claude Code aliases, Codex reasoning effort).
 */
export type BackendModelSelection =
  | { kind: 'opencode' | 'pi'; provider: string; model: string }
  | { kind: 'claude-code'; model: string }
  | { kind: 'codex'; model: string; reasoningEffort?: string }
  /** ZCode models require a provider-qualified identity and may expose a per-model reasoning level. */
  | { kind: 'zcode'; provider: string; model: string; reasoningLevel?: string };

/** A single turn in an aux session. */
export interface AuxQueryTurnRequest {
  readonly prompt: string;
  readonly signal?: AbortSignal;
  /** Streaming text callback (accumulated text). MVP uses it for spinner state. */
  readonly onTextChunk?: (accumulatedText: string) => void;
  /**
   * Images attached to this turn (R-A4). Backends that cannot transport
   * images must reject the turn rather than silently dropping them.
   */
  readonly images?: readonly AuxQueryImageAttachment[];
}

/**
 * One image attached to an auxiliary turn.
 *
 * The shape mirrors the chat-side `ImageAttachment`
 * (src/core/types/chat.ts) so backends reuse their existing chat
 * serialization: `data` is the raw base64 payload without a `data:` prefix.
 */
export interface AuxQueryImageAttachment {
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  /** Base64 payload, no data-URL prefix. */
  readonly data: string;
}

/** A tool invocation observed in the backend's native event stream. */
export interface AuxObservedToolCall {
  readonly name: string;
  readonly kind?: string;
}

export type AuxQueryResult =
  | { success: true; text: string; toolCalls: readonly AuxObservedToolCall[] }
  | { success: false; error: string; cancelled?: boolean };

/**
 * Runtime evidence that the session is read-only.
 *
 * Every field is sourced from the backend's own runtime state (config readback,
 * effective tool enumeration, denial callbacks) — never from the request we
 * sent. This is what the M1 audit asserts against.
 */
export interface AuxQuerySafetyProof {
  readonly backend: AgentBackendKind;
  /** `'none'` = session has no tools at all; `'read-only-allowlist'` = allowlist only. */
  readonly enforcedPolicy: 'none' | 'read-only-allowlist';
  /** Tools actually in effect, read back from the backend's native enumeration. */
  readonly effectiveTools: readonly string[];
  /** Capability classes explicitly denied or absent: write/shell/mcp/package/subagent. */
  readonly deniedCapabilities: readonly string[];
  /** Human-readable mechanism, e.g. `'codex read-only sandbox'`. */
  readonly mechanism: string;
}

/**
 * Short-lived auxiliary session.
 *
 * Native state (processes, threads, sessions, temp config scopes) is owned by
 * the session object and released by `dispose()`.
 */
export interface AuxQuerySession {
  readonly queryId: string;
  readonly safety: AuxQuerySafetyProof;
  /** First turn. */
  query(request: AuxQueryTurnRequest): Promise<AuxQueryResult>;
  /** Follow-up turn for the clarification loop; reuses native session state. */
  followUp(prompt: string, request?: Partial<AuxQueryTurnRequest>): Promise<AuxQueryResult>;
  /** Idempotent cancellation of the in-flight turn. */
  cancel(): void;
  /** Idempotent teardown: destroy native session/thread/process state. */
  dispose(): Promise<void>;
  /**
   * Whether this session transports per-turn image attachments (R-A4).
   * All four backends implement image transfer; a `false` here lets the
   * service layer surface an explicit capability gap instead of downgrading
   * an image request to text-only.
   */
  readonly supportsImages?: boolean;
}

/** Configuration for a new aux session. */
export interface AuxQuerySessionConfig {
  /** System prompt injected through the backend's native system-prompt seam. */
  readonly systemPrompt: string;
  readonly model?: BackendModelSelection;
  /**
   * Backend-native effort level (e.g. Claude Code `low..max`, Codex
   * `minimal..persistent`). Ignored by backends without an effort seam.
   */
  readonly effort?: string;
  /** Working directory scope for the aux session. */
  readonly workingDirectory: string;
  /**
   * Optional wall-clock budget for one turn. Absent lets each backend apply
   * its own default (180 s). Callers with tight latency budgets (inline
   * completion, R-C3) set a short one explicitly.
   */
  readonly turnTimeoutMs?: number;
}

/**
 * Optional capability implemented by every agent backend that supports
 * provably read-only auxiliary queries.
 */
export interface AgentAuxQueryCapability extends AgentService {
  /**
   * Create a short-lived read-only auxiliary session.
   *
   * Contract:
   * 1. Must reject when read-only execution cannot be verified at runtime.
   * 2. Must not mutate any user configuration file and must not enter the
   *    chat agent directory.
   * 3. Native state may only live in memory or a temp directory; `dispose()`
   *    must clean it up.
   */
  startAuxQuerySession(config: AuxQuerySessionConfig): Promise<AuxQuerySession>;
}

/**
 * The capability classes that an aux session must never be able to reach.
 * Shared so every backend reports a comparable `deniedCapabilities` set and the
 * service layer can audit observed tool calls against one list.
 */
export const AUX_DENIED_CAPABILITIES: readonly string[] = [
  'write',
  'edit',
  'patch',
  'shell',
  'mcp',
  'package',
  'subagent',
];

/**
 * Tool names that indicate a write-class capability, used by
 * `assertNoWriteToolCalls()` to fail closed on an observed violation.
 * Matched case-insensitively against the observed tool name.
 */
const WRITE_TOOL_PATTERNS: readonly RegExp[] = [
  /^write$/i,
  /^edit$/i,
  /^multiedit$/i,
  /^apply_?patch$/i,
  /^patch$/i,
  /^create_?file$/i,
  /^delete_?file$/i,
  /^move_?file$/i,
  /^notebook_?edit$/i,
  /^bash$/i,
  /^shell$/i,
  /^exec$/i,
  /^command_?execution$/i,
  /^run_?command$/i,
  /^terminal$/i,
  /^apply patch$/i,
  /^kill_?shell$/i,
  /^task$/i,
  /^agent$/i,
  /^mcp/i,
  /^install_?package$/i,
  /^update_?package$/i,
  /^remove_?package$/i,
];

/**
 * Audit the tool calls observed during an aux turn.
 *
 * Returns the offending tool names (empty when the turn is clean). The caller
 * discards the result, disposes the session, and surfaces an error when this is
 * non-empty — see docs/requirements/inline-edit.md §5.5 rule 2.
 */
export function findWriteToolCalls(
  toolCalls: readonly AuxObservedToolCall[],
): readonly string[] {
  const hits: string[] = [];
  for (const call of toolCalls) {
    const name = call.name.trim();
    if (!name) continue;
    if (call.kind === 'mcp') {
      hits.push(name);
      continue;
    }
    if (WRITE_TOOL_PATTERNS.some((pattern) => pattern.test(name))) {
      hits.push(name);
    }
  }
  return hits;
}
