import type { TabId } from '../tabs';

export type TrailingAssistantPatchTailStatePlan = {
  messageEl: HTMLElement;
  messageId: string;
  sourceMessageId: string | null;
  shouldStickToBottom: boolean;
};

type TrailingAssistantPatchTailStateApplier = {
  scrollToBottom(options?: { tabId?: TabId | null }): void;
};

export function applyTrailingAssistantPatchTailState(
  tailStatePlan: TrailingAssistantPatchTailStatePlan,
  tabId: TabId | null,
  applier: TrailingAssistantPatchTailStateApplier,
): void {
  const { messageEl, messageId, sourceMessageId, shouldStickToBottom } = tailStatePlan;
  messageEl.dataset.messageId = messageId;
  if (sourceMessageId) {
    messageEl.dataset.sourceMessageId = sourceMessageId;
  } else {
    delete messageEl.dataset.sourceMessageId;
  }
  messageEl.style.animation = 'none';
  if (shouldStickToBottom) {
    applier.scrollToBottom({ tabId });
  }
}
