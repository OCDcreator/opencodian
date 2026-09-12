/**
 * Shared types and primitives for the backend-neutral workspace memory core.
 *
 * This module is deliberately self-contained: no imports outside this owner
 * (structural transcript types instead of core/types/chat.ts, injected
 * filesystem/model ports instead of backend services). That independence is
 * the product requirement — the memory store, its retrieval protocol and its
 * write planning must behave identically no matter which agent backend is
 * active.
 */

/** Settings snapshot consumed by the memory core (structural, backend-neutral). */
export interface MemorySettingsSnapshot {
  /** Master switch. Default false — ships dark, safe to roll back. */
  readonly memoryBackendEnabled: boolean;
  /** Per-turn background extraction while the master switch is on. Default true. */
  readonly memoryExtractionEnabled: boolean;
  /** Opt-in semantic recall (lexical + lite-model selection + body injection). Default false. */
  readonly memorySemanticRecallEnabled: boolean;
  /** Optional extraction model as `provider/model`. Empty string = session model. */
  readonly memoryExtractionModel: string;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettingsSnapshot = {
  memoryBackendEnabled: false,
  memoryExtractionEnabled: true,
  memorySemanticRecallEnabled: false,
  memoryExtractionModel: '',
};

/** Structural slice of a persisted chat message the memory core needs. */
export interface MemoryTranscriptMessage {
  readonly id?: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp?: number;
  /** Compaction/summary marker persisted by the chat runtime. */
  readonly summary?: boolean;
  readonly summaryKind?: string;
  readonly compactionDivider?: { auto?: boolean } | null;
  /** Tool calls recorded on the message (write detection for the extraction gate). */
  readonly toolCalls?: ReadonlyArray<{
    name?: string;
    input?: Record<string, unknown>;
    status?: string;
  }>;
  /** Raw backend parts (best-effort synthetic-part marker detection). */
  readonly parts?: unknown;
}

/**
 * Filesystem port for the memory store. Paths are vault-relative, posix-style,
 * rooted at the vault base (for example `.opencodian/memory/projects/x/MEMORY.md`).
 * The app layer binds this to the Obsidian vault adapter; tests bind an
 * in-memory implementation.
 */
export interface MemoryFileSystem {
  readFile(relativePath: string): Promise<string | null>;
  writeFile(relativePath: string, content: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  listFiles(relativePath: string): Promise<string[]>;
  mkdir(relativePath: string): Promise<void>;
  remove(relativePath: string): Promise<void>;
  /**
   * File mtime in ms, or null when unavailable. Hidden dotfolders are not
   * indexed by Obsidian, so the app-layer adapter may resolve this through
   * node fs; null degrades ordering deterministically (importance, then
   * original order).
   */
  mtimeMs(relativePath: string): Promise<number | null>;
  /** Native (OS-separator) absolute path for showing the model / logging. */
  nativeAbsolutePath(relativePath: string): string;
}

/** Model-invoker port for plugin-side distillation (extraction / reflection). */
export interface MemoryModelInvoker {
  /**
   * Run a one-shot JSON distillation. `modelRef` is `provider/model` or
   * empty for the invoker default. Fail-soft is the caller's concern; the
   * implementation may throw.
   */
  invoke(input: {
    system: string;
    user: string;
    modelRef: string;
    title: string;
  }): Promise<string>;
}

/** One metric event appended to `metrics.jsonl` under the store root. */
export interface MemoryMetricEvent {
  readonly ts: number;
  readonly kind:
    | 'injection'
    | 'injection-skipped'
    | 'extraction'
    | 'extraction-skipped'
    | 'reflection'
    | 'reflection-skipped'
    | 'maintenance';
  readonly conversationId: string;
  readonly detail: string;
  readonly bytes: number;
}

const utf8Encoder = typeof TextEncoder !== 'undefined'
  ? new TextEncoder()
  : null;

/**
 * UTF-8 byte length (CJK-correct). Never use `String.length` for budgets.
 * Falls back to Buffer when TextEncoder is unavailable (jsdom tests).
 */
export function byteLength(text: string): number {
  if (utf8Encoder) return utf8Encoder.encode(text).length;
  return Buffer.byteLength(text, 'utf8');
}
