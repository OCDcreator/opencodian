import type { ContentBlock } from '../../../core/types';
import {
  appendQuestionResolutionCardFromRenderPlan,
  type QuestionResolutionCardRenderPlan,
} from './QuestionResolutionCardRenderer';

export interface AssistantStructuredContentRenderOptions {
  containerEl: HTMLElement;
  questionResolutionRenderPlan: QuestionResolutionCardRenderPlan;
  renderContentBlock: (containerEl: HTMLElement, block: ContentBlock) => Promise<void>;
}

export async function renderAssistantStructuredContent({
  containerEl,
  questionResolutionRenderPlan,
  renderContentBlock,
}: AssistantStructuredContentRenderOptions): Promise<void> {
  if (!questionResolutionRenderPlan.hasContentBlocks) {
    return;
  }

  for (const block of questionResolutionRenderPlan.blocksBeforeCard) {
    await renderContentBlock(containerEl, block);
  }

  appendQuestionResolutionCardFromRenderPlan(containerEl, questionResolutionRenderPlan);

  for (const block of questionResolutionRenderPlan.blocksAfterCard) {
    await renderContentBlock(containerEl, block);
  }
}
