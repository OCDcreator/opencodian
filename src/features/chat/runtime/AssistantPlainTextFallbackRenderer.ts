import type { MarkdownRenderService } from '../../../utils/markdown';
import {
  appendQuestionResolutionCardFromRenderPlan,
  type QuestionResolutionCardRenderPlan,
} from './QuestionResolutionCardRenderer';

export interface AssistantPlainTextFallbackRenderOptions {
  containerEl: HTMLElement;
  messageContent?: string;
  markdownService: MarkdownRenderService | null;
  questionResolutionRenderPlan: QuestionResolutionCardRenderPlan;
}

export async function renderAssistantPlainTextFallbackContent({
  containerEl,
  messageContent,
  markdownService,
  questionResolutionRenderPlan,
}: AssistantPlainTextFallbackRenderOptions): Promise<void> {
  appendQuestionResolutionCardFromRenderPlan(containerEl, questionResolutionRenderPlan);

  if (!messageContent) {
    return;
  }

  const textEl = containerEl.createDiv({ cls: 'opencodian-message-text' });
  if (markdownService) {
    await markdownService.render(textEl, messageContent);
    return;
  }

  textEl.textContent = messageContent;
}
