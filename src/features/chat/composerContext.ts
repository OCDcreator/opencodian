import type { PromptContextItem, PromptContextLineRange } from '../../core/types';
import { formatContextLabel } from '../../shared';

export interface FocusContextPreview {
  kind: 'current_note' | 'selection';
  path: string;
  label: string;
  lineRange?: PromptContextLineRange;
}

export interface ComposerContextChipState {
  key: string;
  kind: PromptContextItem['kind'];
  path: string;
  label: string;
  lineRange?: PromptContextLineRange;
  attached: boolean;
  preview: boolean;
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

export function createFocusContextPreview(
  path: string,
  lineRange?: PromptContextLineRange,
): FocusContextPreview {
  return {
    kind: lineRange ? 'selection' : 'current_note',
    path,
    label: formatContextLabel(path, lineRange),
    lineRange,
  };
}

export function buildComposerContextChipStates(
  attachedItems: PromptContextItem[],
  focusPreview: FocusContextPreview | null,
): ComposerContextChipState[] {
  const chips: ComposerContextChipState[] = [];
  const attachedByKey = new Map<string, PromptContextItem>();

  for (const item of attachedItems) {
    attachedByKey.set(getPromptContextTargetKey(item), item);
  }

  if (focusPreview) {
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
    });
    attachedByKey.delete(key);
  }

  return chips;
}
