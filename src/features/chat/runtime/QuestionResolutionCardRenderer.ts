import type { ContentBlock, QuestionRequest, QuestionResolution } from '../../../core/types';
import { t } from '../../../i18n';

interface QuestionResolutionCopy {
  icon: string;
  title: string;
  body: string;
}

export interface QuestionResolutionCardRenderPlan {
  hasContentBlocks: boolean;
  blocksBeforeCard: ContentBlock[];
  blocksAfterCard: ContentBlock[];
}

export function populateQuestionResolutionCard(
  cardEl: HTMLElement,
  resolution: QuestionResolution,
): void {
  const detailsEl = cardEl.createEl('details', {
    cls: 'opencodian-question-inline-details',
  });
  detailsEl.open = true;

  const summaryEl = detailsEl.createEl('summary', {
    cls: 'opencodian-question-inline-summary-toggle',
  });
  const headerEl = summaryEl.createDiv({ cls: 'opencodian-question-inline-header' });
  const copy = getQuestionResolutionCopy(resolution.status);

  headerEl.createSpan({
    cls: 'opencodian-question-inline-icon',
    text: copy.icon,
  });
  headerEl.createSpan({
    cls: 'opencodian-question-inline-title',
    text: copy.title,
  });
  const collapseHintEl = headerEl.createSpan({
    cls: 'opencodian-question-inline-collapse-hint',
    text: '',
  });
  const updateCollapseHint = () => {
    collapseHintEl.setText(detailsEl.open ? t('chat.action.showLess') : t('chat.action.showMore'));
  };
  updateCollapseHint();
  detailsEl.addEventListener('toggle', updateCollapseHint);

  const bodyEl = detailsEl.createDiv({ cls: 'opencodian-question-inline-details-body' });
  bodyEl.createDiv({
    cls: 'opencodian-question-inline-body-text',
    text: copy.body,
  });

  const listEl = bodyEl.createEl('ul', { cls: 'opencodian-question-inline-summary-list' });
  resolution.request.questions.forEach((question, index) => {
    const itemEl = listEl.createEl('li', { cls: 'opencodian-question-inline-summary-item' });
    const labelEl = itemEl.createSpan({ cls: 'opencodian-question-inline-summary-label' });
    labelEl.setText(`${question.header}: `);
    itemEl.createSpan({
      cls: 'opencodian-question-inline-summary-value',
      text: getQuestionResolutionAnswerText(resolution, index),
    });
  });
}

export function appendQuestionResolutionCard(
  parentEl: HTMLElement,
  resolution: QuestionResolution,
): HTMLElement {
  const cardEl = parentEl.createDiv({
    cls: 'opencodian-question-inline opencodian-question-inline--resolved',
  });
  populateQuestionResolutionCard(cardEl, resolution);
  return cardEl;
}

export function buildQuestionResolutionCardRenderPlan(
  contentBlocks?: ContentBlock[],
): QuestionResolutionCardRenderPlan {
  if (!contentBlocks || contentBlocks.length === 0) {
    return {
      hasContentBlocks: false,
      blocksBeforeCard: [],
      blocksAfterCard: [],
    };
  }

  const blocksBeforeCard: ContentBlock[] = [];
  const blocksAfterCard: ContentBlock[] = [];
  for (const block of contentBlocks) {
    if (block.type === 'text') {
      blocksAfterCard.push(block);
    } else {
      blocksBeforeCard.push(block);
    }
  }

  return {
    hasContentBlocks: true,
    blocksBeforeCard,
    blocksAfterCard,
  };
}

export function buildQuestionAnswerMarkdown(request: QuestionRequest, answers: string[][]): string {
  const lines = request.questions.map((question, index) => {
    const answer = answers[index]?.join(', ') ?? '';
    return `- **${question.header}**: ${answer}`;
  });

  return [
    t('chat.question.notice.answeredBody'),
    '',
    ...lines,
  ].join('\n');
}

export function buildQuestionRejectedMarkdown(request: QuestionRequest): string {
  const lines = request.questions.map((question) => `- ${question.header}`);
  return [
    t('chat.question.notice.rejectedBody'),
    '',
    ...lines,
  ].join('\n');
}

function getQuestionResolutionCopy(status: QuestionResolution['status']): QuestionResolutionCopy {
  return status === 'answered'
    ? {
        icon: 'i',
        title: t('chat.question.notice.answeredTitle'),
        body: t('chat.question.notice.answeredBody'),
      }
    : {
        icon: '!',
        title: t('chat.question.notice.rejectedTitle'),
        body: t('chat.question.notice.rejectedBody'),
      };
}

function getQuestionResolutionAnswerText(
  resolution: QuestionResolution,
  index: number,
): string {
  return resolution.status === 'answered'
    ? (resolution.answers?.[index]?.join(', ') ?? '')
    : t('chat.question.reject');
}
