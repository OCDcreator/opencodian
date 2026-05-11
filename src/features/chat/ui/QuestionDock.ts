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
      sectionEl.addEventListener('keydown', (event) => {
        this.handleQuestionKeydown({
          event,
          question: visibleQuestion.question,
          questionIndex: visibleQuestion.index,
          sectionEl,
          displayMode,
          viewModel,
          callbacks,
        });
      });

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

  private handleQuestionKeydown(options: {
    event: KeyboardEvent;
    question: QuestionRequest['questions'][number];
    questionIndex: number;
    sectionEl: HTMLElement;
    displayMode: QuestionDisplayMode;
    viewModel: QuestionDockViewModel;
    callbacks: QuestionDockCallbacks;
  }): void {
    const {
      event,
      question,
      questionIndex,
      sectionEl,
      displayMode,
      viewModel,
      callbacks,
    } = options;

    if (event.key === 'Escape') {
      event.preventDefault();
      callbacks.onReject();
      return;
    }

    if (
      event.target instanceof HTMLInputElement
      && event.target.classList.contains('opencodian-question-inline-custom')
    ) {
      return;
    }

    const optionInputs = this.getOptionInputs(sectionEl);
    const focusedIndex = optionInputs.findIndex((input) => input === event.target);
    if (focusedIndex < 0) {
      return;
    }

    if (this.handleOptionFocusKey(event, optionInputs, focusedIndex)) {
      return;
    }

    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    this.toggleOptionInput(optionInputs[focusedIndex], question);
    const answer = this.collectAnswerFromSection(sectionEl, question);
    const shouldDeferAnswerChangeToSubmit = event.key === 'Enter' && !question.multiple && displayMode === 'single';
    if (!shouldDeferAnswerChangeToSubmit) {
      callbacks.onAnswerChange(questionIndex, answer);
    }

    if (
      displayMode === 'single'
      && !question.multiple
      && isQuestionAnswerComplete(question, answer)
      && event.key === ' '
      && questionIndex < viewModel.totalCount - 1
    ) {
      callbacks.onSelectQuestion(questionIndex + 1);
      return;
    }

    if (event.key === 'Enter' && !question.multiple && displayMode === 'single') {
      this.handleSubmitOrNext(viewModel, displayMode, new Map([[questionIndex, sectionEl]]), callbacks);
    }
  }

  private handleOptionFocusKey(
    event: KeyboardEvent,
    optionInputs: readonly HTMLInputElement[],
    focusedIndex: number,
  ): boolean {
    const focusTargetByKey: Record<string, number | undefined> = {
      ArrowDown: focusedIndex + 1,
      ArrowRight: focusedIndex + 1,
      ArrowUp: focusedIndex - 1,
      ArrowLeft: focusedIndex - 1,
      Home: 0,
      End: optionInputs.length - 1,
    };
    const nextIndex = focusTargetByKey[event.key];
    if (nextIndex === undefined) {
      return false;
    }

    event.preventDefault();
    this.focusOptionInput(optionInputs, nextIndex);
    return true;
  }

  private getOptionInputs(sectionEl: HTMLElement): HTMLInputElement[] {
    return [...sectionEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"], input[type="radio"]')];
  }

  private focusOptionInput(optionInputs: readonly HTMLInputElement[], nextIndex: number): void {
    if (optionInputs.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(nextIndex, optionInputs.length - 1));
    optionInputs[boundedIndex]?.focus();
  }

  private toggleOptionInput(
    inputEl: HTMLInputElement | undefined,
    question: QuestionRequest['questions'][number],
  ): void {
    if (!inputEl) {
      return;
    }

    if (question.multiple) {
      inputEl.checked = !inputEl.checked;
      return;
    }

    inputEl.checked = true;
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
      this.handleSubmitOrNext(viewModel, displayMode, sectionElements, callbacks);
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

  private handleSubmitOrNext(
    viewModel: QuestionDockViewModel,
    displayMode: QuestionDisplayMode,
    sectionElements: ReadonlyMap<number, HTMLElement>,
    callbacks: QuestionDockCallbacks,
  ): void {
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
