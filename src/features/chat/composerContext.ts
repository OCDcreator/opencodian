import type { PromptContextItem, PromptContextLineRange } from '../../core/types';
import { formatContextLabel } from '../../shared';

export interface FocusContextPreview {
  kind: 'current_note' | 'selection';
  path: string;
  label: string;
  lineRange?: PromptContextLineRange;
  textSnapshot?: string;
}

export interface ComposerContextChipState {
  key: string;
  kind: PromptContextItem['kind'];
  path: string;
  label: string;
  lineRange?: PromptContextLineRange;
  attached: boolean;
  preview: boolean;
  /** R-C1: retrieval-injected chips render with the "retrieved" badge. */
  origin?: PromptContextItem['origin'];
}

export function getContextTargetKey(
  path: string,
  lineRange?: PromptContextLineRange,
): string {
  const lines = lineRange ? `${lineRange.startLine}-${lineRange.endLine}` : '';
  return `${path}:${lines}`;
}

export function getPromptContextTargetKey(
  item: Pick<PromptContextItem, 'path' | 'lineRange'>,
): string {
  return getContextTargetKey(item.path, item.lineRange);
}

export function upsertDraftContextItem(
  items: PromptContextItem[],
  item: PromptContextItem,
): PromptContextItem[] {
  const targetKey = getPromptContextTargetKey(item);
  const nextItems = items.filter((entry) => getPromptContextTargetKey(entry) !== targetKey);
  nextItems.push(item);
  return nextItems;
}

export function removeDraftContextItemsByTarget(
  items: PromptContextItem[],
  target: Pick<PromptContextItem, 'path' | 'lineRange'>,
): PromptContextItem[] {
  const targetKey = getContextTargetKey(target.path, target.lineRange);
  return items.filter((item) => getPromptContextTargetKey(item) !== targetKey);
}

/**
 * Send-path existence gate (R-B2 parity): partition context items into
 * entries whose vault path still resolves and entries that no longer exist.
 * A path deleted after attach (moved, trashed, removed outside Obsidian) must
 * never reach the request as an unreadable file part — the caller drops the
 * missing entries from the outgoing context, prunes their draft chips and
 * reports them once with the group-attach vocabulary, so the turn always
 * sends. Pure so the semantics stay unit-testable without Obsidian.
 */
export function partitionExistingContextItems(
  items: readonly PromptContextItem[],
  hasEntryAtPath: (path: string) => boolean,
): { existing: PromptContextItem[]; missingPaths: string[] } {
  const existing: PromptContextItem[] = [];
  const missingPaths: string[] = [];
  for (const item of items) {
    if (hasEntryAtPath(item.path)) {
      existing.push(item);
    } else if (!missingPaths.includes(item.path)) {
      missingPaths.push(item.path);
    }
  }
  return { existing, missingPaths };
}

export function createFocusContextPreview(
  path: string,
  lineRange?: PromptContextLineRange,
  textSnapshot?: string,
): FocusContextPreview {
  return {
    kind: lineRange ? 'selection' : 'current_note',
    path,
    label: formatContextLabel(path, lineRange),
    lineRange,
    textSnapshot: lineRange ? textSnapshot : undefined,
  };
}

export function resolveFocusContextPreview(
  nextPreview: FocusContextPreview | null,
  previousPreview: FocusContextPreview | null,
  options: {
    retainSelectionPreview?: boolean;
  } = {},
): FocusContextPreview | null {
  if (!options.retainSelectionPreview) {
    return nextPreview;
  }

  if (!nextPreview || nextPreview.kind !== 'current_note') {
    return nextPreview;
  }

  if (!previousPreview || previousPreview.kind !== 'selection') {
    return nextPreview;
  }

  if (previousPreview.path !== nextPreview.path) {
    return nextPreview;
  }

  return previousPreview;
}

export function buildComposerContextChipStates(
  attachedItems: PromptContextItem[],
  focusPreview: FocusContextPreview | null,
): ComposerContextChipState[] {
  const chips: ComposerContextChipState[] = [];
  const attachedByKey = new Map<string, PromptContextItem>();
  const selectionPaths = new Set<string>();

  for (const item of attachedItems) {
    attachedByKey.set(getPromptContextTargetKey(item), item);
    if (item.kind === 'selection') {
      selectionPaths.add(item.path);
    }
  }

  const shouldHideFocusPreview = focusPreview?.kind === 'current_note'
    && selectionPaths.has(focusPreview.path);

  if (focusPreview && !shouldHideFocusPreview) {
    const focusKey = getContextTargetKey(focusPreview.path, focusPreview.lineRange);
    const matchedAttached = attachedByKey.get(focusKey);
    if (matchedAttached) {
      chips.push({
        key: focusKey,
        kind: matchedAttached.kind,
        path: matchedAttached.path,
        label: matchedAttached.label,
        lineRange: matchedAttached.lineRange,
        attached: true,
        preview: false,
        origin: matchedAttached.origin,
      });
      attachedByKey.delete(focusKey);
    } else {
      chips.push({
        key: focusKey,
        kind: focusPreview.kind,
        path: focusPreview.path,
        label: focusPreview.label,
        lineRange: focusPreview.lineRange,
        attached: false,
        preview: true,
      });
    }
  }

  for (const item of attachedItems) {
    const key = getPromptContextTargetKey(item);
    if (!attachedByKey.has(key)) {
      continue;
    }

    chips.push({
      key,
      kind: item.kind,
      path: item.path,
      label: item.label,
      lineRange: item.lineRange,
      attached: true,
      preview: false,
      origin: item.origin,
    });
    attachedByKey.delete(key);
  }

  return chips;
}
