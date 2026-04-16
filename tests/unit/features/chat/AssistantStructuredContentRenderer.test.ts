import type { QuestionRequest, QuestionResolution } from '../../../../src/core/types';
import { renderAssistantStructuredContent } from '../../../../src/features/chat/runtime/AssistantStructuredContentRenderer';
import { buildQuestionResolutionCardRenderPlan } from '../../../../src/features/chat/runtime/QuestionResolutionCardRenderer';

function createQuestionRequest(): QuestionRequest {
  return {
    id: 'question-1',
    sessionId: 'session-1',
    questions: [
      {
        header: 'Language',
        question: 'Which languages should be included?',
        options: [],
        multiple: true,
        custom: true,
      },
    ],
  };
}

describe('AssistantStructuredContentRenderer', () => {
  afterEach(() => {
    document.body.replaceChildren();
    jest.clearAllMocks();
  });

  it('renders structured blocks around the resolved card insertion point', async () => {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    const resolution: QuestionResolution = {
      request: createQuestionRequest(),
      status: 'answered',
      answers: [['TypeScript']],
    };
    const renderContentBlock = jest.fn().mockImplementation(
      async (targetEl: HTMLElement, block: { type: string; text?: string; thinking?: string; toolName?: string }) => {
        const blockEl = document.createElement('div');
        blockEl.className = 'assistant-structured-block';
        blockEl.dataset.blockType = block.type;
        blockEl.textContent = block.text ?? block.thinking ?? block.toolName ?? '';
        targetEl.appendChild(blockEl);
      },
    );

    await renderAssistantStructuredContent({
      containerEl,
      questionResolutionRenderPlan: buildQuestionResolutionCardRenderPlan({
        contentBlocks: [
          { type: 'text', text: 'Final answer' },
          { type: 'thinking', thinking: 'Reasoning' },
          { type: 'tool_use', toolName: 'search' },
          { type: 'text', text: 'Follow-up detail' },
        ],
        questionResolution: resolution,
        shouldRenderQuestionResolutionCard: true,
      }),
      renderContentBlock,
    });

    expect(renderContentBlock.mock.calls.map(([, block]) => block.type)).toEqual([
      'thinking',
      'tool_use',
      'text',
      'text',
    ]);
    expect(Array.from(containerEl.children).map((child) =>
      child.classList.contains('opencodian-question-inline--resolved')
        ? 'resolved-card'
        : child.getAttribute('data-block-type'),
    )).toEqual([
      'thinking',
      'tool_use',
      'resolved-card',
      'text',
      'text',
    ]);
  });

  it('skips resolved-card insertion when the visibility gate is off', async () => {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    const renderContentBlock = jest.fn().mockImplementation(
      async (targetEl: HTMLElement, block: { type: string }) => {
        const blockEl = document.createElement('div');
        blockEl.dataset.blockType = block.type;
        targetEl.appendChild(blockEl);
      },
    );

    await renderAssistantStructuredContent({
      containerEl,
      questionResolutionRenderPlan: buildQuestionResolutionCardRenderPlan({
        contentBlocks: [
          { type: 'thinking', thinking: 'Reasoning' },
          { type: 'text', text: 'Final answer' },
        ],
        questionResolution: {
          request: createQuestionRequest(),
          status: 'answered',
          answers: [['TypeScript']],
        },
        shouldRenderQuestionResolutionCard: false,
      }),
      renderContentBlock,
    });

    expect(containerEl.querySelector('.opencodian-question-inline--resolved')).toBeNull();
    expect(Array.from(containerEl.children).map((child) => child.getAttribute('data-block-type'))).toEqual([
      'thinking',
      'text',
    ]);
  });
});
