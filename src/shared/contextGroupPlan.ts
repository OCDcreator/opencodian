/**
 * ContextGroupAttachPlan — one-click attach planning for context groups
 * (docs/requirements/flowtext-parity.md R-B2).
 *
 * A context group is an ordered list of vault paths that may be larger than
 * the per-turn attach cap. Both attach surfaces (the inline-edit panel and
 * the chat composer) share the same deterministic rules, kept here as pure
 * functions so the semantics — order preservation, cap behaviour, missing
 * entries — are unit-testable without Obsidian:
 *
 * - entries attach in group order; paths already attached (or duplicated
 *   inside the group) are skipped silently, matching manual re-attach;
 * - once the cap is reached the remaining entries are *omitted* and counted,
 *   never silently truncated — callers surface the count;
 * - an entry that does not resolve (note moved/deleted) is *missing*: it is
 *   skipped, reported with its path, and never aborts the attach;
 * - `cap` may be `Infinity` for surfaces without a per-turn limit (chat).
 */

/** Minimal shape the planner needs from one group entry. */
export interface ContextGroupAttachCandidate {
  readonly path: string;
}

/** One entry that resolved and will be attached, in attach order. */
export interface ContextGroupResolvedEntry<T> {
  readonly path: string;
  readonly entry: T;
}

/** The deterministic result of planning one group attach. */
export interface ContextGroupAttachPlan<T> {
  /** Entries to attach, in group order, at most `cap` of them. */
  readonly toAttach: readonly ContextGroupResolvedEntry<T>[];
  /** How many group entries were dropped because the cap was reached. */
  readonly omittedCount: number;
  /** Paths that did not resolve (moved/deleted), in group order. */
  readonly missingPaths: readonly string[];
}

export interface ContextGroupAttachPlanOptions<T> {
  /** The group's ordered entries. */
  readonly entries: readonly ContextGroupAttachCandidate[];
  /** Resolve one path against the vault; `null` means missing. */
  readonly resolve: (path: string) => T | null;
  /** Paths already attached; they are skipped, not re-attached. */
  readonly existingPaths?: ReadonlySet<string>;
  /** Maximum number of entries this attach may add (Infinity = no limit). */
  readonly cap: number;
}

export function planContextGroupAttach<T>(
  options: ContextGroupAttachPlanOptions<T>,
): ContextGroupAttachPlan<T> {
  const seen = new Set<string>(options.existingPaths ?? []);
  const toAttach: ContextGroupResolvedEntry<T>[] = [];
  const missingPaths: string[] = [];
  let omittedCount = 0;

  for (const candidate of options.entries) {
    if (seen.has(candidate.path)) continue;
    if (toAttach.length >= options.cap) {
      // Past the cap every remaining entry counts as omitted (R-B2:
      // "按顺序取前 N 条并明确提示被省略的条数"). They are not resolved —
      // the user only needs to know how many were left out.
      omittedCount += 1;
      continue;
    }
    const entry = options.resolve(candidate.path);
    if (entry === null || entry === undefined) {
      if (!missingPaths.includes(candidate.path)) missingPaths.push(candidate.path);
      seen.add(candidate.path);
      continue;
    }
    seen.add(candidate.path);
    toAttach.push({ path: candidate.path, entry });
  }

  return { toAttach, omittedCount, missingPaths };
}

/** Compact, render-ready view of one group for attach-topic UI rows. */
export interface ContextGroupSummary {
  readonly id: string;
  readonly name: string;
  readonly entryCount: number;
}

export function summarizeContextGroup(group: {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly unknown[];
}): ContextGroupSummary {
  return { id: group.id, name: group.name, entryCount: group.entries.length };
}
