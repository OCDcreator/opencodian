import { ConversationRenderService } from '../../../../src/features/chat/services/ConversationRenderService';
import {
  createMessage,
  getIncrementalRenderedMessageUpdate,
} from './ConversationRenderService.testSupport';

describe('getIncrementalRenderedMessageUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when rendered messages shrink', () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: (message) => JSON.stringify(message),
    });

    expect(result).toBeNull();
  });

  it('returns null when a non-tail rendered signature changes', () => {
    const previousMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Hi' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];
    const nextMessages = [
      createMessage({ id: 'user-1', role: 'user', content: 'Changed' }),
      createMessage({ id: 'assistant-1', content: 'Hello' }),
    ];

    const result = getIncrementalRenderedMessageUpdate({
      previousMessages,
      nextMessages,
      getMessagesForRender: (messages) => messages,
      getMessageVisualSignature: (message) => JSON.stringify(message),
    });

    expect(result).toBeNull();
  });
});

describe('ConversationRenderService tooltip / copy utilities', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('COPY_ICON', () => {
    it('exports a non-empty SVG string', () => {
      expect(ConversationRenderService.COPY_ICON).toContain('<svg');
      expect(ConversationRenderService.COPY_ICON).toContain('</svg>');
    });
  });

  describe('attachCopyButtonBehavior', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        writable: true,
        configurable: true,
      });
    });

    it('writes text to clipboard on click', async () => {
      const copyBtn = document.createElement('button');

      ConversationRenderService.attachCopyButtonBehavior(copyBtn, 'hello world');
      copyBtn.click();

      await Promise.resolve();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
    });

    it('shows "copied!" feedback then reverts after timeout', async () => {
      jest.useFakeTimers();
      const copyBtn = document.createElement('button');

      ConversationRenderService.attachCopyButtonBehavior(copyBtn, 'content');
      copyBtn.click();

      await Promise.resolve();

      expect(copyBtn.innerHTML).toContain('copied!');
      expect(copyBtn.classList.contains('copied')).toBe(true);

      jest.advanceTimersByTime(1500);

      expect(copyBtn.textContent).toBe('');
      expect(copyBtn.classList.contains('copied')).toBe(false);

      jest.useRealTimers();
    });

    it('preserves aria-labelledby label when reverting', () => {
      jest.useFakeTimers();
      const copyBtn = document.createElement('button');
      copyBtn.setAttribute('data-tooltip', 'Copy');
      copyBtn.setAttribute('aria-labelledby', 'label-1');
      const labelEl = document.createElement('span');
      labelEl.id = 'label-1';
      labelEl.className = 'opencodian-visually-hidden';
      labelEl.textContent = 'Copy';
      copyBtn.appendChild(labelEl);

      ConversationRenderService.attachCopyButtonBehavior(copyBtn, 'content');
      copyBtn.click();
      jest.advanceTimersByTime(1500);

      const restoredLabel = copyBtn.querySelector('#label-1');
      expect(restoredLabel).not.toBeNull();
      expect(restoredLabel?.textContent).toBe('Copy');

      jest.useRealTimers();
    });
  });

  describe('attachTooltipLabel', () => {
    it('creates a visually-hidden span with the label text', () => {
      const buttonEl = document.createElement('button');

      ConversationRenderService.attachTooltipLabel(buttonEl, 'Send message');

      const labelEl = buttonEl.querySelector('.opencodian-visually-hidden');
      expect(labelEl).not.toBeNull();
      expect(labelEl?.textContent).toBe('Send message');
      expect(labelEl?.getAttribute('data-tooltip-label')).toBe('true');
      expect(buttonEl.getAttribute('aria-labelledby')).toBe(labelEl?.id);
    });

    it('generates unique ids for successive labels', () => {
      const btn1 = document.createElement('button');
      const btn2 = document.createElement('button');

      ConversationRenderService.attachTooltipLabel(btn1, 'First');
      ConversationRenderService.attachTooltipLabel(btn2, 'Second');

      const id1 = btn1.querySelector('.opencodian-visually-hidden')?.id;
      const id2 = btn2.querySelector('.opencodian-visually-hidden')?.id;

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^opencodian-tooltip-label-/);
      expect(id2).toMatch(/^opencodian-tooltip-label-/);
    });
  });

  describe('setTooltipLabel', () => {
    it('sets data-tooltip and removes title/aria-label', () => {
      const buttonEl = document.createElement('button');
      buttonEl.setAttribute('title', 'Old title');
      buttonEl.setAttribute('aria-label', 'Old label');

      ConversationRenderService.setTooltipLabel(buttonEl, 'New tooltip', 'bottom');

      expect(buttonEl.getAttribute('data-tooltip')).toBe('New tooltip');
      expect(buttonEl.getAttribute('data-tooltip-position')).toBe('bottom');
      expect(buttonEl.hasAttribute('title')).toBe(false);
      expect(buttonEl.hasAttribute('aria-label')).toBe(false);
    });

    it('creates a new visually-hidden label when none exists', () => {
      const buttonEl = document.createElement('button');

      ConversationRenderService.setTooltipLabel(buttonEl, 'My label');

      const labelEl = buttonEl.querySelector('.opencodian-visually-hidden[data-tooltip-label="true"]');
      expect(labelEl).not.toBeNull();
      expect(labelEl?.textContent).toBe('My label');
    });

    it('updates existing label text instead of creating a duplicate', () => {
      const buttonEl = document.createElement('button');
      const existingLabel = document.createElement('span');
      existingLabel.className = 'opencodian-visually-hidden';
      existingLabel.setAttribute('data-tooltip-label', 'true');
      existingLabel.textContent = 'Old';
      buttonEl.appendChild(existingLabel);

      ConversationRenderService.setTooltipLabel(buttonEl, 'Updated');

      const labels = buttonEl.querySelectorAll('.opencodian-visually-hidden[data-tooltip-label="true"]');
      expect(labels).toHaveLength(1);
      expect(labels[0].textContent).toBe('Updated');
    });
  });

  describe('removeEmptyAssistantShells', () => {
    it('removes assistant shells with no content', () => {
      const container = document.createElement('div');
      const emptyAssistant = container.createDiv({ cls: 'opencodian-message opencodian-message--assistant' });
      emptyAssistant.createDiv({ cls: 'opencodian-message-content' });

      ConversationRenderService.removeEmptyAssistantShells(container);

      expect(container.children).toHaveLength(0);
    });

    it('preserves assistant shells with text content', () => {
      const container = document.createElement('div');
      const assistant = container.createDiv({ cls: 'opencodian-message opencodian-message--assistant' });
      const content = assistant.createDiv({ cls: 'opencodian-message-content' });
      content.textContent = 'Hello world';

      ConversationRenderService.removeEmptyAssistantShells(container);

      expect(container.children).toHaveLength(1);
    });

    it('preserves assistant shells with streaming text blocks', () => {
      const container = document.createElement('div');
      const assistant = container.createDiv({ cls: 'opencodian-message opencodian-message--assistant' });
      const content = assistant.createDiv({ cls: 'opencodian-message-content' });
      content.createDiv({ cls: 'streaming-text-block' });

      ConversationRenderService.removeEmptyAssistantShells(container);

      expect(container.children).toHaveLength(1);
    });

    it('skips notice and background-task shells', () => {
      const container = document.createElement('div');
      const notice = container.createDiv({ cls: 'opencodian-message opencodian-message--assistant opencodian-message--notice' });
      notice.createDiv({ cls: 'opencodian-message-content' });
      const bgTask = container.createDiv({ cls: 'opencodian-message opencodian-message--assistant opencodian-message--background-task' });
      bgTask.createDiv({ cls: 'opencodian-message-content' });

      ConversationRenderService.removeEmptyAssistantShells(container);

      expect(container.children).toHaveLength(2);
    });
  });
});
