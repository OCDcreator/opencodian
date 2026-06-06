import type {
  QuestionDisplayMode,
  QuestionRequest,
} from '../../../../src/core/types';
import { QuestionInlineCardRenderer } from '../../../../src/features/chat/runtime/QuestionInlineCardRenderer';
import { StreamingInlineCardRenderer } from '../../../../src/features/chat/runtime/StreamingInlineCardRenderer';

function createRendererHarness() {
  const messageEl = document.createElement('div');
  messageEl.hidden = true;
  const contentEl = messageEl.createDiv({ cls: 'opencodian-message-content' });
  const toolCallEl = messageEl.createDiv({ cls: 'streaming-tool-call' });
  document.body.appendChild(messageEl);

  const runtime = {
    streamingMessageEl: messageEl,
    questionInlineCardEl: null as HTMLElement | null,
  };
  const keepPinnedSpy = jest.fn();
  const inlineCardRenderer = new StreamingInlineCardRenderer({
    getActiveTabId: () => 'tab-1',
    getTabRuntimeState: () => runtime,
    revealStreamingAssistantMessageElement: () => {
      messageEl.hidden = false;
      return messageEl;
    },
  });
  const renderer = new QuestionInlineCardRenderer(inlineCardRenderer, {
    getActiveTabId: () => 'tab-1',
    getTabRuntimeState: () => runtime,
    keepQuestionCardPinnedToBottom: keepPinnedSpy,
  });

  return {
    contentEl,
    keepPinnedSpy,
    messageEl,
    renderer,
    runtime,
    toolCallEl,
  };
}

function createQuestionRequest(overrides?: Partial<QuestionRequest>): QuestionRequest {
  return {
    id: 'question-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Language',
        question: 'Which languages should be included?',
        options: [
          { label: 'TypeScript', description: 'Plugin code' },
          { label: 'Python', description: 'Scripts' },
        ],
        multiple: true,
        custom: true,
      },
      {
        header: 'Platform',
        question: 'Which platform should be verified?',
        options: [
          { label: 'Windows', description: 'Primary test platform' },
          { label: 'macOS', description: 'Secondary platform' },
        ],
        multiple: false,
        custom: false,
      },
    ],
    ...overrides,
  };
}

function createSingleSelectRequest(): QuestionRequest {
  return createQuestionRequest({
    questions: [
      {
        header: 'Language',
        question: 'Which language should be used?',
        options: [
          { label: 'TypeScript', description: 'Plugin code' },
          { label: 'Python', description: 'Scripts' },
        ],
        multiple: false,
        custom: false,
      },
      {
        header: 'Platform',
        question: 'Which platform should be verified?',
        options: [
          { label: 'Windows', description: 'Primary test platform' },
          { label: 'macOS', description: 'Secondary platform' },
        ],
        multiple: false,
        custom: false,
      },
    ],
  });
}

function optionInputs(cardEl: HTMLElement): HTMLInputElement[] {
  return [...cardEl.querySelectorAll<HTMLInputElement>(
    '.opencodian-question-inline-section input[type="checkbox"], .opencodian-question-inline-section input[type="radio"]',
  )];
}

function customInput(cardEl: HTMLElement): HTMLInputElement {
  const input = cardEl.querySelector<HTMLInputElement>('.opencodian-question-inline-custom');
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

async function flushInlineRender(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function expectPromisePending<T>(promise: Promise<T>): Promise<void> {
  const sentinel = Symbol('pending');
  const result = await Promise.race([
    promise,
    Promise.resolve(sentinel),
  ]);
  expect(result).toBe(sentinel);
}

async function renderInlineQuestion(options: {
  request?: QuestionRequest;
  displayMode: QuestionDisplayMode;
}) {
  const harness = createRendererHarness();
  const request = options.request ?? createQuestionRequest();
  const responsePromise = harness.renderer.collectAction(request, options.displayMode, 'tab-1');
  await flushInlineRender();
  const cardEl = harness.runtime.questionInlineCardEl;
  if (!cardEl) {
    throw new Error('Expected inline question card');
  }
  return {
    ...harness,
    cardEl,
    request,
    responsePromise,
  };
}

describe('QuestionInlineCardRenderer', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('renders grouped inline questions and resolves submitted answers', async () => {
    const {
      contentEl,
      keepPinnedSpy,
      messageEl,
      renderer,
      runtime,
      toolCallEl,
    } = createRendererHarness();
    const request = createQuestionRequest();

    const responsePromise = renderer.collectAction(request, 'all', 'tab-1');

    const cardEl = runtime.questionInlineCardEl;
    expect(cardEl).not.toBeNull();
    expect(messageEl.hidden).toBe(false);
    expect(toolCallEl.nextSibling).toBe(cardEl);
    expect(contentEl.contains(cardEl!)).toBe(false);
    expect(cardEl?.querySelectorAll('.opencodian-question-inline-section')).toHaveLength(2);

    const typescriptInput = cardEl?.querySelector<HTMLInputElement>('input[value="TypeScript"]');
    const rustInput = cardEl?.querySelector<HTMLInputElement>('.opencodian-question-inline-custom');
    const windowsInput = cardEl?.querySelector<HTMLInputElement>('input[value="Windows"]');
    expect(typescriptInput).not.toBeNull();
    expect(rustInput).not.toBeNull();
    expect(windowsInput).not.toBeNull();
    typescriptInput!.checked = true;
    rustInput!.value = 'Rust';
    windowsInput!.checked = true;

    cardEl?.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();

    await expect(responsePromise).resolves.toEqual({
      type: 'reply',
      answers: [
        ['TypeScript', 'Rust'],
        ['Windows'],
      ],
    });
    expect(cardEl?.isConnected).toBe(true);
    expect(keepPinnedSpy).toHaveBeenCalledWith('tab-1');
  });

  it('renders AskUserQuestion option preview on focus and hides it on blur', async () => {
    const { renderer, runtime } = createRendererHarness();
    const request = createQuestionRequest({
      questions: [{
        header: 'Confirm',
        question: 'Continue?',
        options: [
          { label: 'Yes', description: 'Proceed', preview: '**Proceed** with the operation' },
          { label: 'No', description: 'Stop' },
        ],
        multiple: false,
        custom: false,
      }],
    });

    const responsePromise = renderer.collectAction(request, 'all', 'tab-1');
    await flushInlineRender();

    const cardEl = runtime.questionInlineCardEl;
    expect(cardEl).not.toBeNull();

    const previewEl = cardEl!.querySelector('.opencodian-question-inline-option-preview');
    expect(previewEl).not.toBeNull();
    expect(previewEl!.classList.contains('is-hidden')).toBe(true);

    const yesInput = cardEl?.querySelector<HTMLInputElement>('input[value="Yes"]');
    expect(yesInput).not.toBeNull();
    yesInput!.focus();
    yesInput!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(previewEl!.classList.contains('is-hidden')).toBe(false);
    expect(previewEl!.textContent).toBe('**Proceed** with the operation');

    const noInput = cardEl?.querySelector<HTMLInputElement>('input[value="No"]');
    expect(noInput).not.toBeNull();
    noInput!.focus();
    noInput!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

    expect(previewEl!.classList.contains('is-hidden')).toBe(true);

    yesInput!.checked = true;
    cardEl?.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();
    await expect(responsePromise).resolves.toEqual({ type: 'reply', answers: [['Yes']] });
  });

  it('reuses the inline card while collecting sequential question answers', async () => {
    const {
      keepPinnedSpy,
      renderer,
      runtime,
    } = createRendererHarness();
    const request = createQuestionRequest();

    const responsePromise = renderer.collectAction(request, 'single', 'tab-1');

    const firstCardEl = runtime.questionInlineCardEl;
    expect(firstCardEl).not.toBeNull();
    expect(firstCardEl?.querySelector('.opencodian-question-inline-progress')?.textContent).toContain('1');
    expect(firstCardEl?.querySelector('.opencodian-question-inline-header-text')?.textContent).toBe('Language');

    const typescriptInput = firstCardEl?.querySelector<HTMLInputElement>('input[value="TypeScript"]');
    expect(typescriptInput).not.toBeNull();
    typescriptInput!.checked = true;
    firstCardEl?.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();

    await Promise.resolve();
    await Promise.resolve();

    const secondCardEl = runtime.questionInlineCardEl;
    expect(secondCardEl).toBe(firstCardEl);
    expect(secondCardEl?.querySelector('.opencodian-question-inline-progress')?.textContent).toContain('2');
    expect(secondCardEl?.querySelector('.opencodian-question-inline-header-text')?.textContent).toBe('Platform');

    const windowsInput = secondCardEl?.querySelector<HTMLInputElement>('input[value="Windows"]');
    expect(windowsInput).not.toBeNull();
    windowsInput!.checked = true;
    secondCardEl?.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();

    await expect(responsePromise).resolves.toEqual({
      type: 'reply',
      answers: [
        ['TypeScript'],
        ['Windows'],
      ],
    });
    expect(keepPinnedSpy).toHaveBeenCalledWith('tab-1');
  });
});

describe('QuestionInlineCardRenderer keyboard interaction', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('moves inline option focus with arrow and edge navigation keys', async () => {
    const { cardEl } = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    const inputs = optionInputs(cardEl);

    inputs[0].focus();
    expect(document.activeElement).toBe(inputs[0]);

    const arrowDown = keydown(inputs[0], 'ArrowDown');
    expect(arrowDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[1]);

    const arrowUp = keydown(inputs[1], 'ArrowUp');
    expect(arrowUp.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[0]);

    const arrowRight = keydown(inputs[0], 'ArrowRight');
    expect(arrowRight.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[1]);

    const arrowLeft = keydown(inputs[1], 'ArrowLeft');
    expect(arrowLeft.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(inputs[0]);

    keydown(inputs[0], 'End');
    expect(document.activeElement).toBe(inputs[1]);

    keydown(inputs[1], 'Home');
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('auto-renders the next sequential single-select question after Space selects a non-final answer', async () => {
    const { cardEl, responsePromise, runtime } = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    const inputs = optionInputs(cardEl);

    inputs[1].focus();
    const event = keydown(inputs[1], ' ');
    await flushInlineRender();

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(runtime.questionInlineCardEl).toBe(cardEl);
    expect(cardEl.querySelector('.opencodian-question-inline-progress')?.textContent).toContain('2');
    expect(cardEl.querySelector('.opencodian-question-inline-header-text')?.textContent).toBe('Platform');
    await expectPromisePending(responsePromise);
  });

  it('auto-renders the next sequential single-select question after Enter selects a non-final answer', async () => {
    const { cardEl, responsePromise, runtime } = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    const inputs = optionInputs(cardEl);

    inputs[1].focus();
    const event = keydown(inputs[1], 'Enter');
    await flushInlineRender();

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[1].checked).toBe(true);
    expect(runtime.questionInlineCardEl).toBe(cardEl);
    expect(cardEl.querySelector('.opencodian-question-inline-progress')?.textContent).toContain('2');
    expect(cardEl.querySelector('.opencodian-question-inline-header-text')?.textContent).toBe('Platform');
    await expectPromisePending(responsePromise);
  });

  it('submits the final sequential single-select question with Enter', async () => {
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    keydown(optionInputs(cardEl)[0], ' ');
    await flushInlineRender();

    const secondInputs = optionInputs(cardEl);
    secondInputs[0].focus();
    const event = keydown(secondInputs[0], 'Enter');

    expect(event.defaultPrevented).toBe(true);
    await expect(responsePromise).resolves.toEqual({
      type: 'reply',
      answers: [
        ['TypeScript'],
        ['Windows'],
      ],
    });
  });

  it('selects a grouped radio with Enter without submitting an incomplete grouped request', async () => {
    const request = createSingleSelectRequest();
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request,
      displayMode: 'all',
    });
    const inputs = optionInputs(cardEl);

    inputs[0].focus();
    const event = keydown(inputs[0], 'Enter');

    expect(event.defaultPrevented).toBe(true);
    expect(inputs[0].checked).toBe(true);
    await expectPromisePending(responsePromise);
  });

  it('toggles sequential multi-select checkboxes without auto-resolving from option keys', async () => {
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request: createQuestionRequest(),
      displayMode: 'single',
    });
    const inputs = optionInputs(cardEl);

    inputs[0].focus();
    const space = keydown(inputs[0], ' ');
    const enter = keydown(inputs[1], 'Enter');

    expect(space.defaultPrevented).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(true);
    await expectPromisePending(responsePromise);
  });

  it('toggles grouped multi-select checkboxes without submitting from option keys', async () => {
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request: createQuestionRequest(),
      displayMode: 'all',
    });
    const inputs = optionInputs(cardEl);

    inputs[0].focus();
    const space = keydown(inputs[0], ' ');
    const enter = keydown(inputs[1], 'Enter');

    expect(space.defaultPrevented).toBe(true);
    expect(enter.defaultPrevented).toBe(true);
    expect(inputs[0].checked).toBe(true);
    expect(inputs[1].checked).toBe(true);
    await expectPromisePending(responsePromise);
  });

  it('keeps custom input Enter and arrow keys native while preserving submit collection', async () => {
    const { cardEl, responsePromise } = await renderInlineQuestion({
      request: createQuestionRequest(),
      displayMode: 'single',
    });
    const input = customInput(cardEl);

    input.focus();
    const enter = keydown(input, 'Enter');
    const arrowDown = keydown(input, 'ArrowDown');
    const home = keydown(input, 'Home');
    const end = keydown(input, 'End');
    const space = keydown(input, ' ');
    input.value = 'Rust';
    cardEl.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();
    await flushInlineRender();

    expect(enter.defaultPrevented).toBe(false);
    expect(arrowDown.defaultPrevented).toBe(false);
    expect(home.defaultPrevented).toBe(false);
    expect(end.defaultPrevented).toBe(false);
    expect(space.defaultPrevented).toBe(false);
    expect(cardEl.querySelector('.opencodian-question-inline-header-text')?.textContent).toBe('Platform');

    const secondInputs = optionInputs(cardEl);
    secondInputs[0].checked = true;
    cardEl.querySelector<HTMLButtonElement>('.opencodian-question-inline-btn.is-submit')?.click();
    await expect(responsePromise).resolves.toEqual({
      type: 'reply',
      answers: [
        ['Rust'],
        ['Windows'],
      ],
    });
  });

  it('rejects inline questions with Escape from options and custom input', async () => {
    const optionCase = await renderInlineQuestion({
      request: createSingleSelectRequest(),
      displayMode: 'single',
    });
    const optionEvent = keydown(optionInputs(optionCase.cardEl)[0], 'Escape');

    expect(optionEvent.defaultPrevented).toBe(true);
    await expect(optionCase.responsePromise).resolves.toEqual({ type: 'reject' });

    document.body.replaceChildren();

    const customCase = await renderInlineQuestion({
      request: createQuestionRequest(),
      displayMode: 'single',
    });
    const customEvent = keydown(customInput(customCase.cardEl), 'Escape');

    expect(customEvent.defaultPrevented).toBe(true);
    await expect(customCase.responsePromise).resolves.toEqual({ type: 'reject' });
  });
});
