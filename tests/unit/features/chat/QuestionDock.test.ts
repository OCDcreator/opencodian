import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import {
  QuestionDock,
  type QuestionDockCallbacks,
  type QuestionDockRenderState,
} from '../../../../src/features/chat/ui/QuestionDock';
import { setLocale } from '../../../../src/i18n';

function createQuestionRequest(overrides?: Partial<QuestionRequest>): QuestionRequest {
  return {
    id: 'request-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Language',
        question: 'Which language should be used?',
        options: [
          { label: 'TypeScript', description: 'Plugin code' },
          { label: 'Python', description: 'Scripts' },
          { label: 'Rust', description: 'Native helper' },
        ],
        multiple: false,
        custom: true,
      },
      {
        header: 'Platform',
        question: 'Which platform should be verified?',
        options: [
          { label: 'Windows', description: 'Primary platform' },
          { label: 'macOS', description: 'Secondary platform' },
        ],
        multiple: false,
        custom: false,
      },
    ],
    ...overrides,
  };
}

function createCallbacks(): jest.Mocked<QuestionDockCallbacks> {
  return {
    onAnswerChange: jest.fn(),
    onSelectGroup: jest.fn(),
    onSelectQuestion: jest.fn(),
    onSubmit: jest.fn(),
    onReject: jest.fn(),
    onClose: jest.fn(),
  };
}

function renderDock(options?: {
  request?: QuestionRequest;
  answers?: string[][];
  displayMode?: QuestionDisplayMode;
  activeQuestionIndex?: number | null;
  callbacks?: jest.Mocked<QuestionDockCallbacks>;
}) {
  const parentEl = document.body.createDiv();
  const dock = new QuestionDock(parentEl);
  const request = options?.request ?? createQuestionRequest();
  const callbacks = options?.callbacks ?? createCallbacks();
  const state: QuestionDockRenderState = {
    request,
    answers: options?.answers ?? request.questions.map(() => []),
    displayMode: options?.displayMode ?? 'single',
    activeQuestionIndex: options?.activeQuestionIndex ?? 0,
  };

  dock.render(state, callbacks);

  return {
    callbacks,
    dock,
    parentEl,
    request,
    rootEl: parentEl.querySelector<HTMLElement>('.opencodian-question-dock'),
  };
}

function optionInputs(rootEl: HTMLElement): HTMLInputElement[] {
  return [...rootEl.querySelectorAll<HTMLInputElement>(
    '.opencodian-question-dock-section input[type="checkbox"], .opencodian-question-dock-section input[type="radio"]',
  )];
}

function customInput(rootEl: HTMLElement): HTMLInputElement {
  const input = rootEl.querySelector<HTMLInputElement>('.opencodian-question-inline-custom');
  if (!input) {
    throw new Error('Expected custom input');
  }
  return input;
}

function keydown(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
  });
  target.dispatchEvent(event);
  return event;
}

describe('QuestionDock keyboard interaction', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
    setLocale('en');
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('moves option focus with arrow and edge navigation keys', () => {
    const { rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    expect(document.activeElement).toBe(inputs[0]);

    const arrowDown = keydown(inputs[0], 'ArrowDown');
    expect(arrowDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[1]);

    const arrowUp = keydown(inputs[1], 'ArrowUp');
    expect(arrowUp.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[0]);

    keydown(inputs[0], 'End');
    expect(document.activeElement).toBe(inputs[2]);

    keydown(inputs[2], 'Home');
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('selects a focused radio with Space and auto-advances single-mode non-final questions', () => {
    const { callbacks, rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[1].focus();
    const event = keydown(inputs[1], ' ');

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith(0, ['Python']);
    expect(callbacks.onSelectQuestion).toHaveBeenCalledWith(1);
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });

  it('submits with Enter on a final answered single-select question', () => {
    const request = createQuestionRequest();
    const { callbacks, rootEl } = renderDock({
      request,
      answers: [[], ['Windows']],
      displayMode: 'single',
      activeQuestionIndex: 1,
    });
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    const event = keydown(inputs[0], 'Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith(1, ['Windows']);
    expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelectQuestion).not.toHaveBeenCalled();
  });

  it('rejects the active dock request with Escape from an option', () => {
    const { callbacks, rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    const event = keydown(inputs[0], 'Escape');

    expect(event.defaultPrevented).toBe(true);
    expect(callbacks.onReject).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it('keeps custom text input keyboard editing on the native input path', () => {
    const { callbacks, rootEl } = renderDock();
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const input = customInput(rootEl);

    input.focus();
    const enter = keydown(input, 'Enter');
    const arrowDown = keydown(input, 'ArrowDown');
    input.value = 'Go';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const escape = keydown(input, 'Escape');

    expect(enter.defaultPrevented).toBe(false);
    expect(arrowDown.defaultPrevented).toBe(false);
    expect(escape.defaultPrevented).toBe(true);
    expect(callbacks.onSelectQuestion).not.toHaveBeenCalled();
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
    expect(callbacks.onReject).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith(0, ['Go']);
  });

  it('selects a focused radio with Enter in all mode without submitting or advancing', () => {
    const { callbacks, rootEl } = renderDock({
      displayMode: 'all',
      activeQuestionIndex: null,
    });
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[1].focus();
    const event = keydown(inputs[1], 'Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(callbacks.onAnswerChange).toHaveBeenCalledWith(0, ['Python']);
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
    expect(callbacks.onSelectQuestion).not.toHaveBeenCalled();
  });

  it('toggles multi-select checkboxes without auto-advancing or submitting', () => {
    const request = createQuestionRequest({
      questions: [
        {
          header: 'Targets',
          question: 'Which targets should be checked?',
          options: [
            { label: 'Dock', description: '' },
            { label: 'Inline', description: '' },
          ],
          multiple: true,
          custom: false,
        },
        {
          header: 'Follow-up',
          question: 'Should this remain pending?',
          options: [{ label: 'Yes', description: '' }],
          multiple: false,
          custom: false,
        },
      ],
    });
    const { callbacks, rootEl } = renderDock({ request });
    if (!rootEl) {
      throw new Error('Expected dock root');
    }
    const inputs = optionInputs(rootEl);

    inputs[0].focus();
    const space = keydown(inputs[0], ' ');
    const enter = keydown(inputs[1], 'Enter');

    expect(space.defaultPrevented).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(callbacks.onAnswerChange).toHaveBeenLastCalledWith(0, ['Dock', 'Inline']);
    expect(callbacks.onSelectQuestion).not.toHaveBeenCalled();
    expect(callbacks.onSubmit).not.toHaveBeenCalled();
  });
});
