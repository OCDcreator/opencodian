import { setIcon } from 'obsidian';

import type { QuestionDisplayMode, QuestionRequest } from '../../../core/types';
import { t } from '../../../i18n';
import {
  buildQuestionDockViewModel,
  isQuestionAnswerComplete,
  type QuestionDockViewModel,
} from './questionDockState';

export interface QuestionDockRenderState {
  request: QuestionRequest | null;
  answers: string[][];
  displayMode: QuestionDisplayMode;
  activeGroupKey?: string | null;
  activeQuestionIndex?: number | null;
}

export interface QuestionDockCallbacks {
  onAnswerChange: (questionIndex: number, answer: string[]) => void;
  onSelectGroup: (groupKey: string) => void;
  onSelectQuestion: (questionIndex: number) => void;
  onSubmit: () => void;
  onReject: () => void;
  onClose: () => void;
}

export class QuestionDock {
  private readonly rootEl: HTMLElement;

  constructor(parentEl: HTMLElement) {
    this.rootEl = parentEl.createDiv({
      cls: 'opencodian-question-dock is-hidden',
      attr: {
        'data-component': 'question-dock',
      },
    });
  }

  render(state: QuestionDockRenderState, callbacks: QuestionDockCallbacks): void {
    this.rootEl.empty();

    if (!state.request || state.request.questions.length === 0) {
      this.rootEl.addClass('is-hidden');
      return;
    }

    this.rootEl.removeClass('is-hidden');

    const viewModel = buildQuestionDockViewModel(
      state.request,
      state.answers,
      {
        activeGroupKey: state.activeGroupKey,
        activeQuestionIndex: state.activeQuestionIndex,
        displayMode: state.displayMode,
      },
    );

    if (viewModel.visibleQuestions.length === 0) {
      this.rootEl.addClass('is-hidden');
      return;
    }

    this.renderHeader(viewModel, state.displayMode, callbacks);
    this.renderTabs(viewModel, callbacks);
    const sectionElements = this.renderBody(viewModel, state.displayMode, callbacks);
    this.renderFooter(viewModel, state.displayMode, sectionElements, callbacks);
  }

  destroy(): void {
    this.rootEl.remove();
  }

  private renderHeader(
    viewModel: QuestionDockViewModel,
    displayMode: QuestionDisplayMode,
    callbacks: QuestionDockCallbacks,
  ): void {
    const headerEl = this.rootEl.createDiv({ cls: 'opencodian-question-dock-header' });

    const titleWrapEl = headerEl.createDiv({ cls: 'opencodian-question-dock-title-wrap' });
    const iconEl = titleWrapEl.createSpan({ cls: 'opencodian-question-dock-icon' });
    setIcon(iconEl, 'help-circle');
    titleWrapEl.createSpan({
      cls: 'opencodian-question-dock-title',
      text: t('chat.question.title'),
    });

    const metaEl = headerEl.createDiv({ cls: 'opencodian-question-dock-meta' });
    if (displayMode === 'single' && viewModel.currentStep) {
      metaEl.createSpan({
        cls: 'opencodian-question-dock-progress',
        text: t('chat.question.progress', {
          current: String(viewModel.currentStep.current),
          total: String(viewModel.currentStep.total),
        }),
      });
    }
    metaEl.createSpan({
      cls: 'opencodian-question-dock-summary',
      text: t('chat.question.overallProgress', {
        answered: String(viewModel.answeredCount),
        total: String(viewModel.totalCount),
      }),
    });

    const closeBtn = headerEl.createEl('button', {
      cls: 'opencodian-question-dock-close',
      attr: {
        type: 'button',
        'aria-label': t('chat.question.close'),
      },
    });
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('click', () => {
      callbacks.onClose();
    });
  }

  private renderTabs(viewModel: QuestionDockViewModel, callbacks: QuestionDockCallbacks): void {
    if (viewModel.groups.length <= 1) {
      return;
    }

    const tabsEl = this.rootEl.createDiv({ cls: 'opencodian-question-dock-tabs' });
    for (const group of viewModel.groups) {
      const tabEl = tabsEl.createEl('button', {
        cls: 'opencodian-question-dock-tab',
        text: group.label,
        attr: {
          type: 'button',
        },
      });
      if (group.key === viewModel.activeGroupKey) {
        tabEl.addClass('is-active');
      }

      const badgeEl = tabEl.createSpan({
        cls: 'opencodian-question-dock-tab-badge',
        text: `${group.answeredCount}/${group.totalCount}`,
      });
      badgeEl.setAttribute('aria-hidden', 'true');

      tabEl.addEventListener('click', () => {
        callbacks.onSelectGroup(group.key);
      });
    }
  }

  private renderBody(
    viewModel: QuestionDockViewModel,
    displayMode: QuestionDisplayMode,
    callbacks: QuestionDockCallbacks,
  ): Map<number, HTMLElement> {
    const bodyEl = this.rootEl.createDiv({ cls: 'opencodian-question-dock-body' });
    const sectionElements = new Map<number, HTMLElement>();

    for (const visibleQuestion of viewModel.visibleQuestions) {
      const sectionEl = bodyEl.createDiv({ cls: 'opencodian-question-inline-section opencodian-question-dock-section' });
      sectionEl.dataset.questionIndex = String(visibleQuestion.index);
      if (displayMode === 'all') {
        sectionEl.toggleClass('is-answered', visibleQuestion.answered);
      }
      sectionElements.set(visibleQuestion.index, sectionEl);

      sectionEl.createDiv({
        cls: 'opencodian-question-inline-header-text',
        text: visibleQuestion.question.header,
      });
      sectionEl.createDiv({
        cls: 'opencodian-question-inline-body-text',
        text: visibleQuestion.question.question,
      });

      if (visibleQuestion.question.options.length > 0) {
        const optionsEl = sectionEl.createDiv({ cls: 'opencodian-question-inline-options' });
        const inputType = visibleQuestion.question.multiple ? 'checkbox' : 'radio';

        for (const option of visibleQuestion.question.options) {
          const labelEl = optionsEl.createEl('label', {
            cls: 'opencodian-question-inline-option',
          });
          const inputEl = labelEl.createEl('input', {
            attr: {
              type: inputType,
              name: `opencodian-question-dock-${visibleQuestion.index}`,
              value: option.label,
            },
          });
          inputEl.checked = visibleQuestion.answer.includes(option.label);
          inputEl.addEventListener('change', () => {
            callbacks.onAnswerChange(
              visibleQuestion.index,
              this.collectAnswerFromSection(sectionEl, visibleQuestion.question),
            );
          });

          const textWrap = labelEl.createDiv({ cls: 'opencodian-question-inline-option-copy' });
          textWrap.createDiv({
            cls: 'opencodian-question-inline-option-label',
            text: option.label,
          });
          if (option.description) {
            textWrap.createDiv({
              cls: 'opencodian-question-inline-option-description',
              text: option.description,
            });
          }
        }
      }

      if (visibleQuestion.question.custom !== false) {
        const optionLabels = new Set(visibleQuestion.question.options.map((option) => option.label));
        const customValue = visibleQuestion.answer.find((answer) => !optionLabels.has(answer)) ?? '';
        const customInput = sectionEl.createEl('input', {
          cls: 'opencodian-question-inline-custom',
          attr: {
            type: 'text',
            placeholder: t('chat.question.customPlaceholder'),
          },
        });
        customInput.value = customValue;
        customInput.addEventListener('input', () => {
          callbacks.onAnswerChange(
            visibleQuestion.index,
            this.collectAnswerFromSection(sectionEl, visibleQuestion.question),
          );
        });
      }
    }

    return sectionElements;
  }

  private renderFooter(
    viewModel: QuestionDockViewModel,
    displayMode: QuestionDisplayMode,
    sectionElements: ReadonlyMap<number, HTMLElement>,
    callbacks: QuestionDockCallbacks,
  ): void {
    const footerEl = this.rootEl.createDiv({ cls: 'opencodian-question-inline-buttons opencodian-question-dock-footer' });

    const submitBtn = footerEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-submit',
      text: displayMode === 'single' && viewModel.currentStep && viewModel.currentStep.current < viewModel.currentStep.total
        ? t('chat.question.next')
        : t('chat.question.submit'),
      attr: { type: 'button' },
    });
    submitBtn.addEventListener('click', () => {
      if (displayMode === 'single') {
        const current = viewModel.visibleQuestions[0];
        if (!current) {
          return;
        }

        const sectionEl = sectionElements.get(current.index);
        const answer = sectionEl
          ? this.collectAnswerFromSection(sectionEl, current.question)
          : current.answer;
        if (!isQuestionAnswerComplete(current.question, answer)) {
          return;
        }

        callbacks.onAnswerChange(current.index, answer);
        if (current.index < viewModel.totalCount - 1) {
          callbacks.onSelectQuestion(current.index + 1);
          return;
        }
      }

      callbacks.onSubmit();
    });

    const rejectBtn = footerEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-reject',
      text: t('chat.question.reject'),
      attr: { type: 'button' },
    });
    rejectBtn.addEventListener('click', () => {
      callbacks.onReject();
    });
  }

  private collectAnswerFromSection(
    containerEl: HTMLElement,
    question: QuestionRequest['questions'][number],
  ): string[] {
    const selectedValues = [...containerEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')]
      .filter((input) => input.checked)
      .map((input) => input.value);
    const customValue = containerEl.querySelector<HTMLInputElement>('.opencodian-question-inline-custom')?.value.trim() ?? '';

    if (question.multiple) {
      return [...new Set(customValue ? [...selectedValues, customValue] : selectedValues)];
    }

    if (customValue) {
      return [customValue];
    }

    return selectedValues.length > 0 ? [selectedValues[0]] : [];
  }
}
