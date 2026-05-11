import { Notice } from 'obsidian';

import type { QuestionDisplayMode, QuestionRequest } from '../../../core/types';
import { t } from '../../../i18n';
import type { TabId } from '../tabs';
import { StreamingInlineCardRenderer } from './StreamingInlineCardRenderer';

export interface QuestionInlineCardRuntimeState {
  questionInlineCardEl: HTMLElement | null;
}

export interface QuestionInlineCardRendererHost {
  getActiveTabId(): TabId | null;
  getTabRuntimeState(tabId: TabId | null): QuestionInlineCardRuntimeState | null;
  keepQuestionCardPinnedToBottom(tabId: TabId | null): void;
}

export type QuestionInlineCardAction =
  | { type: 'reply'; answers: string[][] }
  | { type: 'reject' };

type SingleQuestionAction =
  | { type: 'reply'; answer: string[] }
  | { type: 'reject' };

interface QuestionInputState {
  optionInputs: HTMLInputElement[];
  customInput: HTMLInputElement | null;
}

interface SingleQuestionPromptOptions {
  request: QuestionRequest;
  question: QuestionRequest['questions'][number];
  index: number;
  total: number;
  tabId: TabId | null;
}

export class QuestionInlineCardRenderer {
  constructor(
    private readonly streamingInlineCardRenderer: StreamingInlineCardRenderer,
    private readonly host: QuestionInlineCardRendererHost,
  ) {}

  async collectAction(
    request: QuestionRequest,
    displayMode: QuestionDisplayMode,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): Promise<QuestionInlineCardAction | null> {
    return displayMode === 'single'
      ? this.collectSequentialQuestionAction(request, tabId)
      : this.collectGroupedQuestionAction(request, tabId);
  }

  getOrCreateCard(
    className: string,
    tabId: TabId | null = this.host.getActiveTabId(),
  ): HTMLElement | null {
    const runtime = this.host.getTabRuntimeState(tabId);
    const existing = runtime?.questionInlineCardEl ?? null;

    if (existing?.isConnected) {
      existing.className = className;
      existing.empty();
      this.host.keepQuestionCardPinnedToBottom(tabId);
      return existing;
    }

    const cardEl = this.streamingInlineCardRenderer.createStreamingInlineCard(className, tabId);
    if (!cardEl) {
      return null;
    }

    if (runtime) {
      runtime.questionInlineCardEl = cardEl;
    }
    this.host.keepQuestionCardPinnedToBottom(tabId);
    return cardEl;
  }

  clear(tabId: TabId | null = this.host.getActiveTabId()): void {
    const runtime = this.host.getTabRuntimeState(tabId);
    runtime?.questionInlineCardEl?.remove();
    if (runtime) {
      runtime.questionInlineCardEl = null;
    }
  }

  private async collectGroupedQuestionAction(
    request: QuestionRequest,
    tabId: TabId | null,
  ): Promise<QuestionInlineCardAction | null> {
    const questionCard = this.getOrCreateCard('opencodian-question-inline', tabId);
    if (!questionCard) {
      return null;
    }

    this.renderQuestionHeader(questionCard);

    const inputStates = request.questions.map(() => ({
      optionInputs: [] as HTMLInputElement[],
      customInput: null as HTMLInputElement | null,
    }));

    request.questions.forEach((question, index) => {
      inputStates[index] = this.renderQuestionSection({
        questionCard,
        request,
        question,
        index,
      });
    });

    const buttons = this.renderButtons(questionCard, t('chat.question.submit'));
    const action = await new Promise<QuestionInlineCardAction>((resolve) => {
      request.questions.forEach((question, index) => {
        this.attachQuestionKeyboardHandlers({
          question,
          inputState: inputStates[index],
          onReject: () => resolve({ type: 'reject' }),
          onOptionActivated: () => {
            // Grouped cards only collect through the submit button so every
            // question can be validated together.
          },
        });
      });

      buttons.submitBtn.addEventListener('click', () => {
        buttons.submitBtn.blur();
        const answers = request.questions.map((question, index) =>
          this.collectAnswerFromInputState(question, inputStates[index]));

        if (answers.some((answer) => answer.length === 0)) {
          new Notice(t('chat.question.answerRequired'));
          return;
        }

        resolve({ type: 'reply', answers });
      });

      buttons.rejectBtn.addEventListener('click', () => {
        buttons.rejectBtn.blur();
        resolve({ type: 'reject' });
      });
    });

    this.host.keepQuestionCardPinnedToBottom(tabId);
    return action;
  }

  private async collectSequentialQuestionAction(
    request: QuestionRequest,
    tabId: TabId | null,
  ): Promise<QuestionInlineCardAction | null> {
    const answers: string[][] = [];

    for (let index = 0; index < request.questions.length; index += 1) {
      const action = await this.promptForSingleQuestion({
        request,
        question: request.questions[index],
        index,
        total: request.questions.length,
        tabId,
      });

      if (!action) {
        return null;
      }

      if (action.type === 'reject') {
        return action;
      }

      answers.push(action.answer);
    }

    return {
      type: 'reply',
      answers,
    };
  }

  private async promptForSingleQuestion(options: SingleQuestionPromptOptions): Promise<SingleQuestionAction | null> {
    const {
      request,
      question,
      index,
      total,
      tabId,
    } = options;
    const questionCard = this.getOrCreateCard('opencodian-question-inline', tabId);
    if (!questionCard) {
      return null;
    }

    this.renderQuestionHeader(questionCard, total > 1
      ? t('chat.question.progress', {
        current: String(index + 1),
        total: String(total),
      })
      : null);

    const inputState = this.renderQuestionSection({
      questionCard,
      request,
      question,
      index,
    });
    const buttons = this.renderButtons(
      questionCard,
      index === total - 1 ? t('chat.question.submit') : t('chat.question.next'),
    );

    const action = await new Promise<SingleQuestionAction>((resolve) => {
      this.attachQuestionKeyboardHandlers({
        question,
        inputState,
        onReject: () => resolve({ type: 'reject' }),
        onOptionActivated: (key) => {
          if (question.multiple) {
            return;
          }

          const answer = this.collectAnswerFromInputState(question, inputState);
          if (answer.length === 0) {
            return;
          }

          if (key === 'Enter' || index < total - 1) {
            resolve({ type: 'reply', answer });
          }
        },
      });

      buttons.submitBtn.addEventListener('click', () => {
        buttons.submitBtn.blur();
        const answer = this.collectAnswerFromInputState(question, inputState);

        if (answer.length === 0) {
          new Notice(t('chat.question.answerRequired'));
          return;
        }

        resolve({ type: 'reply', answer });
      });

      buttons.rejectBtn.addEventListener('click', () => {
        buttons.rejectBtn.blur();
        resolve({ type: 'reject' });
      });
    });

    this.host.keepQuestionCardPinnedToBottom(tabId);
    return action;
  }

  private renderQuestionHeader(questionCard: HTMLElement, progressText: string | null = null): void {
    const headerEl = questionCard.createDiv({ cls: 'opencodian-question-inline-header' });
    headerEl.createSpan({ cls: 'opencodian-question-inline-icon', text: '?' });
    headerEl.createSpan({
      cls: 'opencodian-question-inline-title',
      text: t('chat.question.title'),
    });
    if (progressText) {
      headerEl.createSpan({
        cls: 'opencodian-question-inline-progress',
        text: progressText,
      });
    }
  }

  private renderQuestionSection(options: {
    questionCard: HTMLElement;
    request: QuestionRequest;
    question: QuestionRequest['questions'][number];
    index: number;
  }): QuestionInputState {
    const {
      questionCard,
      request,
      question,
      index,
    } = options;
    const sectionEl = questionCard.createDiv({ cls: 'opencodian-question-inline-section' });
    sectionEl.createDiv({
      cls: 'opencodian-question-inline-header-text',
      text: question.header,
    });
    sectionEl.createDiv({
      cls: 'opencodian-question-inline-body-text',
      text: question.question,
    });

    const inputState: QuestionInputState = {
      optionInputs: [],
      customInput: null,
    };

    if (question.options.length > 0) {
      const optionsEl = sectionEl.createDiv({ cls: 'opencodian-question-inline-options' });
      const inputType = question.multiple ? 'checkbox' : 'radio';

      for (const option of question.options) {
        const labelEl = optionsEl.createEl('label', {
          cls: 'opencodian-question-inline-option',
        });
        const inputEl = labelEl.createEl('input', {
          attr: {
            type: inputType,
            name: `opencodian-question-${request.id}-${index}`,
            value: option.label,
          },
        });
        inputState.optionInputs.push(inputEl);

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

    if (question.custom !== false) {
      inputState.customInput = sectionEl.createEl('input', {
        cls: 'opencodian-question-inline-custom',
        attr: {
          type: 'text',
          placeholder: t('chat.question.customPlaceholder'),
        },
      });
    }

    return inputState;
  }

  private attachQuestionKeyboardHandlers(options: {
    question: QuestionRequest['questions'][number];
    inputState: QuestionInputState;
    onReject: () => void;
    onOptionActivated: (key: 'Enter' | ' ') => void;
  }): void {
    const {
      question,
      inputState,
      onReject,
      onOptionActivated,
    } = options;

    for (const inputEl of inputState.optionInputs) {
      inputEl.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onReject();
          return;
        }

        if (this.moveOptionFocus(inputState, inputEl, event.key)) {
          event.preventDefault();
          return;
        }

        if (!this.isOptionActivationKey(event.key)) {
          return;
        }

        event.preventDefault();
        this.toggleOptionInput(question, inputState, inputEl);
        onOptionActivated(event.key === 'Enter' ? 'Enter' : ' ');
      });
    }

    inputState.customInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onReject();
    });
  }

  private moveOptionFocus(
    inputState: QuestionInputState,
    currentInput: HTMLInputElement,
    key: string,
  ): boolean {
    const inputs = inputState.optionInputs;
    if (inputs.length === 0) {
      return false;
    }

    const currentIndex = inputs.indexOf(currentInput);
    if (currentIndex === -1) {
      return false;
    }

    let nextIndex: number | null = null;
    if (key === 'ArrowDown' || key === 'ArrowRight') {
      nextIndex = Math.min(currentIndex + 1, inputs.length - 1);
    } else if (key === 'ArrowUp' || key === 'ArrowLeft') {
      nextIndex = Math.max(currentIndex - 1, 0);
    } else if (key === 'Home') {
      nextIndex = 0;
    } else if (key === 'End') {
      nextIndex = inputs.length - 1;
    }

    if (nextIndex === null) {
      return false;
    }

    inputs[nextIndex]?.focus();
    return true;
  }

  private isOptionActivationKey(key: string): boolean {
    return key === 'Enter' || key === ' ' || key === 'Spacebar';
  }

  private toggleOptionInput(
    question: QuestionRequest['questions'][number],
    inputState: QuestionInputState,
    inputEl: HTMLInputElement,
  ): void {
    if (question.multiple) {
      inputEl.checked = !inputEl.checked;
      return;
    }

    for (const optionInput of inputState.optionInputs) {
      optionInput.checked = optionInput === inputEl;
    }
  }

  private renderButtons(
    questionCard: HTMLElement,
    submitText: string,
  ): { submitBtn: HTMLButtonElement; rejectBtn: HTMLButtonElement } {
    const buttonsEl = questionCard.createDiv({ cls: 'opencodian-question-inline-buttons' });
    const submitBtn = buttonsEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-submit',
      text: submitText,
      attr: { type: 'button' },
    });
    const rejectBtn = buttonsEl.createEl('button', {
      cls: 'opencodian-question-inline-btn is-reject',
      text: t('chat.question.reject'),
      attr: { type: 'button' },
    });

    return {
      submitBtn,
      rejectBtn,
    };
  }

  private collectAnswerFromInputState(
    question: QuestionRequest['questions'][number],
    inputState: QuestionInputState,
  ): string[] {
    const selectedValues = inputState.optionInputs
      .filter((input) => input.checked)
      .map((input) => input.value);
    const customValue = inputState.customInput?.value.trim() ?? '';

    if (question.multiple) {
      const combined = customValue ? [...selectedValues, customValue] : selectedValues;
      return [...new Set(combined)];
    }

    if (customValue) {
      return [customValue];
    }

    return selectedValues.length > 0 ? [selectedValues[0]] : [];
  }
}
