import type { QuestionRequest } from '../../../../src/core/types';
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

function createQuestionRequest(): QuestionRequest {
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
