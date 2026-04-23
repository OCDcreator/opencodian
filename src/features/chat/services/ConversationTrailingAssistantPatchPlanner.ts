import { type ChatMessage } from '../../../core/types';
import type { TabId } from '../tabs';
import type {
  ConversationRenderHost,
  ConversationRenderRuntimeState,
} from './ConversationRenderRuntime';

type TrailingAssistantPatchDomTarget = {
  messageEl: HTMLElement;
  contentEl: HTMLElement;
};

type TrailingAssistantPatchNonMergeableTailFailurePlan = {
  reason: 'tail-message-not-mergeable-assistant';
  payload: {
    previousTail: Record<string, unknown> | null;
    nextTail: Record<string, unknown> | null;
  };
};

export type TrailingAssistantPatchPlanningContext = {
  previousTailMessage: ChatMessage;
  nextTailMessage: ChatMessage;
  patchTarget: TrailingAssistantPatchDomTarget;
  parentEl: HTMLElement;
  runtime: ConversationRenderRuntimeState | null;
  shouldStickToBottom: boolean;
};

export type TrailingAssistantPatchPreflight =
  | {
    ok: true;
    planningContext: TrailingAssistantPatchPlanningContext;
  }
  | {
    ok: false;
    reason: string;
    payload?: Record<string, unknown>;
  };

type TrailingAssistantPatchContainerResult =
  | {
    ok: true;
    messagesEl: HTMLElement;
  }
  | {
    ok: false;
    reason: 'missing-container-or-inactive-tab';
  };

type TrailingAssistantPatchTargetFailureReason =
  | 'missing-existing-tail-element'
  | 'missing-tail-content-element';

type TrailingAssistantPatchTargetFailureResult = {
  ok: false;
  reason: TrailingAssistantPatchTargetFailureReason;
};

type TrailingAssistantPatchTargets =
  | {
    ok: true;
    existingTailMessageEl: HTMLElement;
    existingContentEl: HTMLElement;
    parentEl: HTMLElement;
  }
  | TrailingAssistantPatchTargetFailureResult;

type TrailingAssistantPatchRenderedMessagesResult =
  | {
    ok: true;
    previousRenderedMessages: ChatMessage[];
    nextRenderedMessages: ChatMessage[];
  }
  | {
    ok: false;
    reason: 'rendered-message-count-mismatch';
  };

type TrailingAssistantPatchNonTailSignatureResult =
  | {
    ok: true;
  }
  | {
    ok: false;
    reason: 'non-tail-message-signature-mismatch';
    payload: {
      mismatchIndex: number;
    };
  };

type TrailingAssistantPatchTailMessagesResult =
  | {
    ok: true;
    previousTailMessage: ChatMessage;
    nextTailMessage: ChatMessage;
  }
  | ({ ok: false } & TrailingAssistantPatchNonMergeableTailFailurePlan);

type SuccessfulTrailingAssistantPatchTargets = Extract<
  TrailingAssistantPatchTargets,
  { ok: true }
>;
type SuccessfulTrailingAssistantPatchTailMessages = Extract<
  TrailingAssistantPatchTailMessagesResult,
  { ok: true }
>;

export class TrailingAssistantPatchPlanningDelegate {
  constructor(private readonly host: ConversationRenderHost) {}

  resolvePreflight(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
    tabId: TabId | null,
  ): TrailingAssistantPatchPreflight {
    const activeContainer = this.resolveActiveContainer(tabId);
    if (!activeContainer.ok) {
      return activeContainer;
    }
    const { messagesEl } = activeContainer;

    const renderedMessages = this.resolveRenderedMessages(previousMessages, nextMessages);
    if (!renderedMessages.ok) {
      return renderedMessages;
    }
    const { previousRenderedMessages, nextRenderedMessages } = renderedMessages;

    const nonTailSignatureMismatch = this.resolveNonTailSignatureMismatch(
      previousRenderedMessages,
      nextRenderedMessages,
    );
    if (!nonTailSignatureMismatch.ok) {
      return nonTailSignatureMismatch;
    }

    const tailMessages = this.resolveTailMessages(previousRenderedMessages, nextRenderedMessages);
    if (!tailMessages.ok) {
      return tailMessages;
    }

    const patchTargets = this.resolvePatchTargets(messagesEl);
    if (!patchTargets.ok) {
      return patchTargets;
    }

    return {
      ok: true,
      planningContext: this.buildPlanningContext(tailMessages, patchTargets, tabId),
    };
  }

  private resolveNonTailSignatureMismatch(
    previousRenderedMessages: ChatMessage[],
    nextRenderedMessages: ChatMessage[],
  ): TrailingAssistantPatchNonTailSignatureResult {
    const lastIndex = previousRenderedMessages.length - 1;
    for (let index = 0; index < lastIndex; index += 1) {
      if (
        this.host.getMessageVisualSignature(previousRenderedMessages[index])
        !== this.host.getMessageVisualSignature(nextRenderedMessages[index])
      ) {
        return {
          ok: false,
          reason: 'non-tail-message-signature-mismatch',
          payload: {
            mismatchIndex: index,
          },
        };
      }
    }

    return { ok: true };
  }

  private resolveTailMessages(
    previousRenderedMessages: ChatMessage[],
    nextRenderedMessages: ChatMessage[],
  ): TrailingAssistantPatchTailMessagesResult {
    const previousTailMessage = previousRenderedMessages[previousRenderedMessages.length - 1];
    const nextTailMessage = nextRenderedMessages[nextRenderedMessages.length - 1];
    if (!this.isPatchableAssistantTail(previousTailMessage, nextTailMessage)) {
      return {
        ok: false,
        ...this.buildNonMergeableTailFailurePlan(previousTailMessage, nextTailMessage),
      };
    }

    return {
      ok: true,
      previousTailMessage,
      nextTailMessage,
    };
  }

  private isPatchableAssistantTail(
    previousTailMessage: ChatMessage,
    nextTailMessage: ChatMessage,
  ): boolean {
    if (previousTailMessage.role !== 'assistant' || nextTailMessage.role !== 'assistant') {
      return false;
    }

    if (previousTailMessage.displayStyle === 'notice' || nextTailMessage.displayStyle === 'notice') {
      return false;
    }

    if (nextTailMessage.summary && nextTailMessage.summaryKind !== 'compaction') {
      return false;
    }

    return true;
  }

  private buildNonMergeableTailFailurePlan(
    previousTailMessage: ChatMessage,
    nextTailMessage: ChatMessage,
  ): TrailingAssistantPatchNonMergeableTailFailurePlan {
    return {
      reason: 'tail-message-not-mergeable-assistant',
      payload: {
        previousTail: this.host.summarizeChatMessageForDebug(previousTailMessage),
        nextTail: this.host.summarizeChatMessageForDebug(nextTailMessage),
      },
    };
  }

  private resolveRenderedMessages(
    previousMessages: ChatMessage[],
    nextMessages: ChatMessage[],
  ): TrailingAssistantPatchRenderedMessagesResult {
    const previousRenderedMessages = this.host.getMessagesForRender(previousMessages);
    const nextRenderedMessages = this.host.getMessagesForRender(nextMessages);
    if (
      previousRenderedMessages.length === 0
      || previousRenderedMessages.length !== nextRenderedMessages.length
    ) {
      return { ok: false, reason: 'rendered-message-count-mismatch' };
    }

    return {
      ok: true,
      previousRenderedMessages,
      nextRenderedMessages,
    };
  }

  private resolveActiveContainer(
    tabId: TabId | null,
  ): TrailingAssistantPatchContainerResult {
    const messagesEl = this.host.getMessagesContainer();
    if (!messagesEl || this.host.getActiveTabId() !== tabId) {
      return { ok: false, reason: 'missing-container-or-inactive-tab' };
    }

    return {
      ok: true,
      messagesEl,
    };
  }

  private buildPlanningContext(
    tailMessages: SuccessfulTrailingAssistantPatchTailMessages,
    patchTargets: SuccessfulTrailingAssistantPatchTargets,
    tabId: TabId | null,
  ): TrailingAssistantPatchPlanningContext {
    return {
      previousTailMessage: tailMessages.previousTailMessage,
      nextTailMessage: tailMessages.nextTailMessage,
      patchTarget: this.buildDomTarget(patchTargets),
      parentEl: patchTargets.parentEl,
      runtime: this.host.getRenderRuntimeForTab(tabId),
      shouldStickToBottom: this.host.shouldAutoScroll(tabId),
    };
  }

  private buildDomTarget(
    patchTargets: SuccessfulTrailingAssistantPatchTargets,
  ): TrailingAssistantPatchDomTarget {
    return {
      messageEl: patchTargets.existingTailMessageEl,
      contentEl: patchTargets.existingContentEl,
    };
  }

  private resolvePatchTargets(messagesEl: HTMLElement): TrailingAssistantPatchTargets {
    const existingTailMessageEl = this.findExistingTrailingAssistantElement(messagesEl);
    const parentEl = existingTailMessageEl?.parentElement;
    if (!existingTailMessageEl || !(parentEl instanceof HTMLElement)) {
      return this.buildTargetFailureResult('missing-existing-tail-element');
    }

    const existingContentEl = existingTailMessageEl.querySelector('.opencodian-message-content');
    if (!(existingContentEl instanceof HTMLElement)) {
      return this.buildTargetFailureResult('missing-tail-content-element');
    }

    return this.buildTargetSuccessResult(existingTailMessageEl, existingContentEl, parentEl);
  }

  private buildTargetFailureResult(
    reason: TrailingAssistantPatchTargetFailureReason,
  ): TrailingAssistantPatchTargetFailureResult {
    return {
      ok: false,
      reason,
    };
  }

  private buildTargetSuccessResult(
    existingTailMessageEl: HTMLElement,
    existingContentEl: HTMLElement,
    parentEl: HTMLElement,
  ): SuccessfulTrailingAssistantPatchTargets {
    return {
      ok: true,
      existingTailMessageEl,
      existingContentEl,
      parentEl,
    };
  }

  private findExistingTrailingAssistantElement(messagesEl: HTMLElement): HTMLElement | null {
    return Array.from(
      messagesEl.querySelectorAll<HTMLElement>('.opencodian-message--assistant'),
    )
      .filter((element) => !element.classList.contains('opencodian-message--notice'))
      .pop() ?? null;
  }
}
