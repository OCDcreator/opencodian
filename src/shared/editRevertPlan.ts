/**
 * EditRevertPlan — pure planning core for backend-neutral edit revert (R-B3).
 *
 * docs/requirements/flowtext-parity.md R-B3: plugin-side, backend-agnostic
 * file-level revert built on pre-turn content snapshots. This module holds
 * only deterministic, Obsidian-free logic so it can be unit-tested directly:
 *
 * - write-tool classification and target-path extraction across the four
 *   backend tool surfaces (OpenCode edit/write, Claude Edit/Write/MultiEdit,
 *   Codex apply_patch/shell, Pi bash) plus conservative shell-redirection
 *   parsing for the unstructured write path;
 * - prompt candidate extraction for the budgeted turn-start pre-snapshot;
 * - retention planning (round count / per-conversation count / byte cap) over
 *   content-addressed rounds, and the sidebar view-model derivation with
 *   explicit capability-boundary labels (fail-closed).
 *
 * The stateful vault-facing owner is `src/core/storage/EditRevertService.ts`.
 */

/** Per-turn pre-snapshot wall-clock budget (ms). Over budget => degraded. */
export const EDIT_REVERT_SNAPSHOT_BUDGET_MS = 200;
/** Single-file snapshot cap; larger files are reported as not revertible. */
export const EDIT_REVERT_MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
/** Global round retention cap (oldest rounds evict first). */
export const EDIT_REVERT_MAX_ROUNDS_TOTAL = 30;
/** Per-conversation round retention cap. */
export const EDIT_REVERT_MAX_ROUNDS_PER_CONVERSATION = 10;
/** Idle (no open round) recent-content cache bounds used as pre-image fallback. */
export const EDIT_REVERT_IDLE_CACHE_MAX_FILES = 64;
export const EDIT_REVERT_IDLE_CACHE_MAX_BYTES = 8 * 1024 * 1024;
/** Post-turn grace window: writes after turn end still attribute to the round. */
export const EDIT_REVERT_POST_TURN_GRACE_MS = 10 * 60 * 1000;

/**
 * File lifecycle covered by revert. `'moved'` (R-B5) is a plugin-recorded
 * rename/move: content is unchanged, so revert renames the file back through
 * `fileManager.renameFile` (which also restores updated references) instead
 * of writing a pre-image blob.
 */
export type EditRevertFileStatus = 'modified' | 'created' | 'deleted' | 'moved';
export type EditRevertEntryState = 'active' | 'reverted';
export type EditRevertPreImageStatus = 'available' | 'oversize' | 'unavailable';
/**
 * How the turn learned about the write: a declared tool call, the vault-event
 * safety net, or an explicit plugin-initiated batch operation (R-B5).
 */
export type EditRevertEntrySource = 'tool' | 'vault-event' | 'plugin';

export interface EditRevertFileEntry {
  /** Vault-relative path with `/` separators. */
  readonly path: string;
  status: EditRevertFileStatus;
  state: EditRevertEntryState;
  preImageStatus: EditRevertPreImageStatus;
  /** Content hash of the file before the turn's first write (blob key). */
  preImageHash?: string;
  preImageBytes?: number;
  /** Content hash captured right after a create event (informational). */
  createdHash?: string;
  /** For `'moved'` entries: the vault-relative path the file lives at now. */
  movedTo?: string;
  /** Content hash captured at revert time; enables "恢复回退". */
  restoreHash?: string;
  restoreBytes?: number;
  /** Latest known on-disk size, used for retention accounting. */
  sizeBytes: number;
  readonly firstWriteAt: number;
  lastWriteAt: number;
  readonly source: EditRevertEntrySource;
  /**
   * R-C2: the file is a plugin-generated BINARY asset (image generation).
   * Binary entries never take text snapshots — revert is plain trash and
   * "restore" is honestly unavailable (`restoreHash` stays unset by
   * construction, not by adapter accident).
   */
  binaryAsset?: boolean;
  /** Last revert/restore failure message (kept on the entry for UI honesty). */
  lastError?: string;
}

export interface EditRevertRoundMeta {
  readonly id: string;
  readonly conversationId: string;
  readonly backend: string;
  readonly sessionId?: string;
  readonly createdAt: number;
  closedAt: number | null;
  /** Turn-start pre-snapshot exceeded its budget; only tool-declared files were captured. */
  degraded: boolean;
  /** Post-turn grace deadline; the round accepts vault writes until then. */
  acceptsWritesUntil: number;
  /** Last begin/write activity, used to attribute concurrent vault events. */
  lastActivityAtHint: number;
  entries: EditRevertFileEntry[];
}

export type EditRevertExcludedReason = 'oversize' | 'no-preimage';

export interface EditRevertSidebarEntry {
  readonly path: string;
  readonly status: EditRevertFileStatus;
  /** Current location for `'moved'` entries; `null` otherwise. */
  readonly movedTo: string | null;
  readonly state: EditRevertEntryState;
  readonly revertible: boolean;
  readonly restorable: boolean;
  readonly excludedReason: EditRevertExcludedReason | null;
}

export interface EditRevertSidebarModel {
  readonly enabled: boolean;
  readonly roundId: string | null;
  /** Round is still accepting writes (turn running or inside post-turn grace). */
  readonly roundOpen: boolean;
  readonly degraded: boolean;
  readonly entries: readonly EditRevertSidebarEntry[];
  readonly revertibleCount: number;
}

export interface EditRevertActionResult {
  ok: boolean;
  /** Files whose revert/restore succeeded in this call. */
  changed: number;
  /** Paths skipped (not revertible / already in target state). */
  readonly skipped: readonly string[];
  /** Human-readable failure detail when ok === false. */
  error?: string;
}

const MARKDOWN_EXTENSION = /\.md$/i;

export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSION.test(path);
}

/**
 * Obsidian canvas files are TEXT (JSON `nodes`/`edges`), so their pre-images
 * snapshot and restore exactly like markdown (R-C5: the text-node write-back
 * rides the R-B3 batch capture). This predicate is deliberately NARROW —
 * markdown + canvas and nothing else: the vault-event funnel, reference
 * rewriting and binary exclusion keep their `isMarkdownPath` semantics, and
 * binary formats never become "revertible text" by accident.
 */
const CANVAS_EXTENSION = /\.canvas$/i;

export function isRevertibleTextPath(path: string): boolean {
  return isMarkdownPath(path) || CANVAS_EXTENSION.test(path);
}

const STRUCTURED_WRITE_TOOL_NAMES = new Set([
  'write',
  'edit',
  'multi_edit',
  'multiedit',
  'str_replace_editor',
  'str_replace_based_edit_tool',
  'apply_patch',
  'write_file',
  'edit_file',
  'create_file',
  'update_file',
  'notebook_edit',
  'notebookedit',
]);

const SHELL_WRITE_TOOL_NAMES = new Set([
  'bash',
  'shell',
  'command_execution',
  'run_command',
  'execute_command',
]);

export type EditRevertWriteToolKind = 'structured' | 'shell';

/**
 * Classify a backend tool name as a write surface. Names are matched
 * case-insensitively and suffix-tolerant (`str_replace_editor__` variants)
 * because the four backends emit slightly different spellings.
 */
export function classifyWriteTool(toolName: string): EditRevertWriteToolKind | null {
  if (!toolName) {
    return null;
  }
  const normalized = toolName.trim().toLowerCase();
  if (STRUCTURED_WRITE_TOOL_NAMES.has(normalized) || normalized.startsWith('str_replace')) {
    return 'structured';
  }
  if (SHELL_WRITE_TOOL_NAMES.has(normalized)) {
    return 'shell';
  }
  return null;
}

const TOOL_INPUT_PATH_FIELDS = [
  'file_path',
  'filepath',
  'target_file',
  'targetfile',
  'notebook_path',
  'notebookpath',
  'path',
  'file',
] as const;

const TOOL_INPUT_PATCH_TEXT_FIELDS = ['patch', 'input', 'content', 'diff'] as const;

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Extract declared target paths from an apply_patch / unified-diff payload. */
export function parseApplyPatchPaths(patchText: string): string[] {
  const paths = new Set<string>();
  const patchFilePattern = /^\*{3}\s*(?:Add|Update|Delete) File:\s*(.+?)\s*$/gm;
  const diffTargetPattern = /^\+\+\+\s+(?:b\/)?([^\s]+).*$/gm;
  const diffSourcePattern = /^---\s+(?:a\/)?([^\s]+).*$/gm;
  for (const pattern of [patchFilePattern, diffTargetPattern, diffSourcePattern]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(patchText);
    while (match) {
      const candidate = match[1]?.trim();
      // `/dev/null` marks the absent side of an add/delete; not a real path.
      if (candidate && candidate !== '/dev/null' && !candidate.startsWith('/dev/')) {
        paths.add(candidate);
      }
      match = pattern.exec(patchText);
    }
  }
  return [...paths];
}

/**
 * Conservative shell-redirection target extraction. Only simple literal
 * targets are considered (`.md` files); variables, /dev sinks and pipes are
 * ignored. This is a best-effort enhancement: the vault-event safety net in
 * the service remains the authoritative record of actual writes.
 */
export function parseShellRedirectionTargets(command: string): string[] {
  const targets = new Set<string>();
  const redirectionPattern = /(?:>>?|tee)\s+("[^"]+"|'[^']+'|[^\s;&|><]+)/g;
  let match = redirectionPattern.exec(command);
  while (match) {
    let candidate = match[1]?.trim() ?? '';
    if (
      (candidate.startsWith('"') && candidate.endsWith('"'))
      || (candidate.startsWith("'") && candidate.endsWith("'"))
    ) {
      candidate = candidate.slice(1, -1);
    }
    if (
      candidate
      && !candidate.includes('$')
      && !candidate.startsWith('/dev/')
      && isMarkdownPath(candidate)
    ) {
      targets.add(candidate);
    }
    match = redirectionPattern.exec(command);
  }
  return [...targets];
}

/** Collect apply_patch / unified-diff targets embedded in a text field. */
function collectPatchTargets(targets: Set<string>, patchText: string): void {
  for (const path of parseApplyPatchPaths(patchText)) {
    targets.add(path);
  }
}

/** Direct path fields plus embedded patch payloads (structured write tools). */
function extractStructuredWriteTargets(input: Record<string, unknown>): string[] {
  const targets = new Set<string>();
  for (const field of TOOL_INPUT_PATH_FIELDS) {
    const value = asNonEmptyString(input?.[field]);
    if (value) {
      targets.add(value);
    }
  }
  for (const field of TOOL_INPUT_PATCH_TEXT_FIELDS) {
    const patchText = asNonEmptyString(input?.[field]);
    if (patchText && (patchText.includes('*** ') || patchText.startsWith('---') || patchText.startsWith('diff '))) {
      collectPatchTargets(targets, patchText);
    }
  }
  // Some patch tools wrap the payload one level deeper (e.g. {patch: {body}}).
  const nested = input?.patch ?? input?.input;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    for (const value of Object.values(nested as Record<string, unknown>)) {
      const patchText = asNonEmptyString(value);
      if (patchText && patchText.includes('*** ')) {
        collectPatchTargets(targets, patchText);
      }
    }
  }
  return [...targets];
}

/** Shell redirection targets (shell-style write tools; best effort). */
function extractShellWriteTargets(input: Record<string, unknown>): string[] {
  const command = asNonEmptyString(input?.command) ?? asNonEmptyString(input?.cmd) ?? asNonEmptyString(input?.input);
  if (!command) {
    return [];
  }
  return parseShellRedirectionTargets(command);
}

/**
 * Extract the vault file paths a write-tool call intends to touch. Returns
 * paths in the backend's own spelling (absolute or vault-relative); the
 * service normalizes them against the vault base path.
 */
export function extractWriteToolTargets(
  toolName: string,
  input: Record<string, unknown>,
): string[] {
  const kind = classifyWriteTool(toolName);
  if (!kind) {
    return [];
  }
  if (kind === 'structured') {
    return extractStructuredWriteTargets(input);
  }
  return extractShellWriteTargets(input);
}

const WIKILINK_PATTERN = /\[\[([^\][|]+)(?:[|#][^\][]*)?\]\]/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\(([^()]+?)(?:#[^()]*)?\)/g;
// The capture group is required: extractCandidatePathsFromPrompt reads
// `match[1]` for every non-markdown-link pattern.
const BARE_MARKDOWN_PATH_PATTERN = /([A-Za-z0-9_\-./\u3400-\u9FFF()]+?\.md\b)/g;

function pushCandidate(candidates: Set<string>, raw: string): void {
  let cleaned = raw.trim().replace(/^<|>$/g, '').split('#')[0].trim();
  // Bare-path scanning can start inside markdown-link syntax or part-way into
  // a URL scheme; strip unbalanced parentheses and protocol-relative leftovers.
  cleaned = cleaned.replace(/^[(<]+/, '').replace(/[>)]+$/, '').trim();
  if (cleaned && !cleaned.includes('://') && !cleaned.startsWith('//') && isMarkdownPath(cleaned)) {
    candidates.add(cleaned.replace(/^\.\//, ''));
  }
}

/**
 * Best-effort candidate set for the budgeted turn-start pre-snapshot:
 * markdown paths mentioned in the outgoing user message (wikilinks, markdown
 * links, bare `*.md` tokens). Existence and dedup are handled by the service.
 */
export function extractCandidatePathsFromPrompt(text: string): string[] {
  if (!text) {
    return [];
  }
  const candidates = new Set<string>();
  for (const pattern of [WIKILINK_PATTERN, MARKDOWN_LINK_PATTERN, BARE_MARKDOWN_PATH_PATTERN]) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      // Group 2 for markdown links (target), group 1 otherwise.
      const raw = pattern === MARKDOWN_LINK_PATTERN ? match[2] : match[1];
      if (raw) {
        pushCandidate(candidates, raw);
      }
      match = pattern.exec(text);
    }
  }
  return [...candidates];
}

export interface EditRevertRoundSummary {
  readonly id: string;
  readonly conversationId: string;
  readonly createdAt: number;
  readonly bytes: number;
}

/**
 * Round retention plan: given newest-first round summaries and the active
 * limits, return the round ids to evict (oldest first). Per-conversation
 * overflow is resolved first, then global count, then global bytes.
 */
export function planRoundEvictions(
  rounds: readonly EditRevertRoundSummary[],
  limits: {
    maxTotal: number;
    maxPerConversation: number;
    maxBytes: number;
  },
): string[] {
  const byAgeAsc = [...rounds].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const evict = new Set<string>();
  const kept = () => byAgeAsc.filter((round) => !evict.has(round.id));

  // 1. Per-conversation overflow (oldest within the conversation first).
  const byConversation = new Map<string, EditRevertRoundSummary[]>();
  for (const round of byAgeAsc) {
    const list = byConversation.get(round.conversationId) ?? [];
    list.push(round);
    byConversation.set(round.conversationId, list);
  }
  for (const list of byConversation.values()) {
    const overflow = list.length - limits.maxPerConversation;
    for (let index = 0; index < overflow; index += 1) {
      evict.add(list[index].id);
    }
  }

  // 2. Global count overflow.
  let overflow = kept().length - limits.maxTotal;
  for (const round of byAgeAsc) {
    if (overflow <= 0) {
      break;
    }
    if (!evict.has(round.id)) {
      evict.add(round.id);
      overflow -= 1;
    }
  }

  // 3. Global byte overflow (rounds referenced multiple times count once per
  //    round; cross-round blob sharing makes this conservative, which is the
  //    safe direction for a retention cap).
  let totalBytes = kept().reduce((sum, round) => sum + round.bytes, 0);
  for (const round of byAgeAsc) {
    if (totalBytes <= limits.maxBytes) {
      break;
    }
    if (!evict.has(round.id)) {
      evict.add(round.id);
      totalBytes -= round.bytes;
    }
  }

  return byAgeAsc.filter((round) => evict.has(round.id)).map((round) => round.id);
}

/** Sum of unique blob bytes referenced by a round's entries (deduped in-round). */
export function computeRoundBytes(
  round: Pick<EditRevertRoundMeta, 'entries'>,
  getBlobBytes: (hash: string) => number,
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const entry of round.entries) {
    for (const hash of [entry.preImageHash, entry.createdHash, entry.restoreHash]) {
      if (hash && !seen.has(hash)) {
        seen.add(hash);
        total += getBlobBytes(hash);
      }
    }
  }
  return total;
}

/** Reference counts for every blob hash referenced by the given rounds. */
export function computeBlobRefCounts(rounds: readonly Pick<EditRevertRoundMeta, 'entries'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (hash: string | undefined): void => {
    if (!hash) {
      return;
    }
    counts.set(hash, (counts.get(hash) ?? 0) + 1);
  };
  for (const round of rounds) {
    for (const entry of round.entries) {
      bump(entry.preImageHash);
      bump(entry.createdHash);
      bump(entry.restoreHash);
    }
  }
  return counts;
}

export function isEntryRevertible(entry: EditRevertFileEntry): boolean {
  if (entry.state !== 'active') {
    return false;
  }
  if (entry.status === 'created') {
    return true;
  }
  // A recorded move needs no content pre-image: revert renames the file back.
  if (entry.status === 'moved') {
    return !!entry.movedTo;
  }
  return entry.preImageStatus === 'available' && !!entry.preImageHash;
}

export function isEntryRestorable(entry: EditRevertFileEntry): boolean {
  if (entry.state !== 'reverted') {
    return false;
  }
  if (entry.status === 'moved') {
    return !!entry.movedTo;
  }
  return !!entry.restoreHash;
}

/** Derive the sidebar view model from a round (null when no round exists). */
export function buildSidebarModel(
  round: EditRevertRoundMeta | null,
  enabled: boolean,
  now: number,
): EditRevertSidebarModel {
  if (!round || !enabled) {
    return {
      enabled,
      roundId: round?.id ?? null,
      roundOpen: false,
      degraded: false,
      entries: [],
      revertibleCount: 0,
    };
  }
  const entries = round.entries.map<EditRevertSidebarEntry>((entry) => {
    const revertible = isEntryRevertible(entry);
    const restorable = isEntryRestorable(entry);
    // Only not-yet-reverted, non-revertible entries carry an exclusion label;
    // a reverted entry is not "excluded", it is undone (and possibly restorable).
    const excludedReason: EditRevertExcludedReason | null = !revertible && entry.state !== 'reverted'
      ? entry.preImageStatus === 'oversize'
        ? 'oversize'
        : 'no-preimage'
      : null;
    return {
      path: entry.path,
      status: entry.status,
      movedTo: entry.status === 'moved' ? entry.movedTo ?? null : null,
      state: entry.state,
      revertible,
      restorable,
      excludedReason,
    };
  });
  return {
    enabled,
    roundId: round.id,
    roundOpen: round.acceptsWritesUntil > now,
    degraded: round.degraded,
    entries,
    revertibleCount: entries.filter((entry) => entry.revertible).length,
  };
}
