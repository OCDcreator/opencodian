/**
 * AssistantAutoInternalLinkService (R-B1 chat boundary) — unit tests:
 *
 * - which reference set is used: the turn's own manual note attachments
 *   (file / current_note); folders, PDFs, selections, and R-C1 retrieval
 *   fragments never ground links;
 * - when it runs: once, on the completed assistant message of THIS turn —
 *   never on interrupted streams, notices, earlier turns, or partial text;
 * - empty reference set is a no-op;
 * - stored representations stay consistent: content and text content blocks
 *   are rewritten so both render paths show the same linked text;
 * - a missing processor seam is reported (§6.7 honesty), never silent;
 * - an unchanged pass leaves the message byte-identical.
 */

import type { ChatMessage, Conversation, PromptContextItem } from '../../../../../src/core/types';
import { AssistantAutoInternalLinkService } from '../../../../../src/features/chat/services/AssistantAutoInternalLinkService';

function createContextItem(overrides: Partial<PromptContextItem> = {}): PromptContextItem {
  return {
    id: 'ctx-1',
    kind: 'file',
    path: 'notes/ref-attention.md',
    label: 'ref-attention.md',
    mime: 'text/markdown',
    ...overrides,
  };
}

function createMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Hello',
    timestamp: 10,
    ...overrides,
  };
}

function createConversation(messages: ChatMessage[]): Conversation {
  return {
    id: 'conversation-1',
    title: 'Conversation',
    createdAt: 1,
    updatedAt: 1,
    openCodeSessionId: 'session-1',
    messages,
  };
}

function createTurn(conversationMessages: ChatMessage[]): { conversation: Conversation; logStage: jest.Mock } {
  const logStage = jest.fn();
  return { conversation: createConversation(conversationMessages), logStage };
}

/** Processor that links deterministically so assertions stay explicit. */
const linkAttention = (text: string): string => text.replaceAll('注意力机制', '[[notes/ref-attention.md#注意力机制]]');

describe('AssistantAutoInternalLinkService reference-set selection', () => {
  it('passes manual file and current_note attachments to the processor', () => {
    const seen: string[][] = [];
    const spy = jest.fn((text: string, notes: readonly { path: string }[]) => {
      seen.push(notes.map((note) => note.path));
      return linkAttention(text);
    });
    const service = new AssistantAutoInternalLinkService(spy);
    const { conversation, logStage } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      createMessage({ content: '本节介绍注意力机制。', timestamp: 10 }),
    ]);

    const { changed } = service.applyToConversationTail(conversation, [
      createContextItem({ id: 'ctx-file', path: 'notes/ref-attention.md' }),
      createContextItem({ id: 'ctx-note', kind: 'current_note', path: 'notes/current.md' }),
      createContextItem({ id: 'ctx-folder', kind: 'folder', path: 'notes/dir' }),
      createContextItem({ id: 'ctx-pdf', kind: 'pdf_document', path: 'notes/paper.pdf' }),
      createContextItem({ id: 'ctx-selection', kind: 'selection', path: 'notes/current.md' }),
      createContextItem({ id: 'ctx-retrieval', origin: 'vault-retrieval', path: 'notes/retrieved.md' }),
    ], logStage);

    expect(changed).toBe(true);
    expect(seen).toEqual([[
      'notes/ref-attention.md',
      'notes/current.md',
    ]]);
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: true,
      reason: 'applied',
      referenceCount: 2,
    });
  });

  it('is a no-op without calling the processor when the reference set is empty', () => {
    const processor = jest.fn((text: string) => text);
    const service = new AssistantAutoInternalLinkService(processor);
    const { conversation, logStage } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      createMessage({ content: '本节介绍注意力机制。', timestamp: 10 }),
    ]);

    const { changed } = service.applyToConversationTail(conversation, [], logStage);
    const { changed: changedNoItems } = service.applyToConversationTail(conversation, undefined, logStage);

    expect(changed).toBe(false);
    expect(changedNoItems).toBe(false);
    expect(processor).not.toHaveBeenCalled();
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: false,
      reason: 'no-references',
      referenceCount: 0,
    });
  });
});

describe('AssistantAutoInternalLinkService turn-tail selection', () => {
  it('rewrites only the completed assistant message of the current turn', () => {
    const service = new AssistantAutoInternalLinkService(jest.fn(linkAttention));
    const earlierTurn = createMessage({ id: 'assistant-0', content: '旧回答提到注意力机制。', timestamp: 5 });
    const { conversation, logStage } = createTurn([
      earlierTurn,
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 8 }),
      createMessage({ content: '本节介绍注意力机制。', timestamp: 10 }),
    ]);

    const { changed } = service.applyToConversationTail(conversation, [
      createContextItem(),
    ], logStage);

    expect(changed).toBe(true);
    expect(earlierTurn.content).toBe('旧回答提到注意力机制。');
    expect(conversation.messages[2]?.content).toBe('本节介绍[[notes/ref-attention.md#注意力机制]]。');
  });

  it('never rewrites an interrupted assistant message', () => {
    const processor = jest.fn(linkAttention);
    const service = new AssistantAutoInternalLinkService(processor);
    const interrupted = createMessage({ streamState: 'interrupted', content: '本节介绍注意力机制' });
    const { conversation, logStage } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      interrupted,
    ]);

    const { changed } = service.applyToConversationTail(conversation, [createContextItem()], logStage);

    expect(changed).toBe(false);
    expect(processor).not.toHaveBeenCalled();
    expect(interrupted.content).toBe('本节介绍注意力机制');
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: false,
      reason: 'no-completed-assistant-message',
      referenceCount: 1,
    });
  });

  it('never rewrites when the turn produced only notices (no assistant text)', () => {
    const processor = jest.fn((text: string) => text);
    const service = new AssistantAutoInternalLinkService(processor);
    const earlierAnswer = createMessage({ id: 'assistant-0', content: '上一轮提到注意力机制。', timestamp: 5 });
    const { conversation, logStage } = createTurn([
      earlierAnswer,
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 8 }),
      createMessage({ displayStyle: 'notice', content: '流中断通知', timestamp: 10 }),
    ]);

    const { changed } = service.applyToConversationTail(conversation, [createContextItem()], logStage);

    expect(changed).toBe(false);
    expect(processor).not.toHaveBeenCalled();
    expect(earlierAnswer.content).toBe('上一轮提到注意力机制。');
  });
});

describe('AssistantAutoInternalLinkService stored-representation consistency', () => {
  it('keeps content equal to the join of rewritten text blocks', () => {
    const service = new AssistantAutoInternalLinkService(jest.fn(linkAttention));
    const message = createMessage({
      content: '前段注意力机制。后段注意力机制。',
      contentBlocks: [
        { type: 'thinking', thinking: '思考' },
        { type: 'text', text: '前段注意力机制。' },
        { type: 'tool_use', toolId: 'call-1', toolName: 'read' },
        { type: 'text', text: '后段注意力机制。' },
      ],
    });
    const { conversation, logStage } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      message,
    ]);

    const { changed } = service.applyToConversationTail(conversation, [createContextItem()], logStage);

    expect(changed).toBe(true);
    expect(message.content).toBe('前段[[notes/ref-attention.md#注意力机制]]。后段[[notes/ref-attention.md#注意力机制]]。');
    expect(message.contentBlocks?.[1]).toEqual({ type: 'text', text: '前段[[notes/ref-attention.md#注意力机制]]。' });
    expect(message.contentBlocks?.[3]).toEqual({ type: 'text', text: '后段[[notes/ref-attention.md#注意力机制]]。' });
  });

  it('processes content independently when it is not the join of blocks', () => {
    const service = new AssistantAutoInternalLinkService(jest.fn(linkAttention));
    const message = createMessage({
      content: '正文里的注意力机制。',
      contentBlocks: [{ type: 'text', text: '块里的普通句子。' }],
    });
    const { conversation, logStage } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      message,
    ]);

    const { changed } = service.applyToConversationTail(conversation, [createContextItem()], logStage);

    expect(changed).toBe(true);
    expect(message.content).toBe('正文里的[[notes/ref-attention.md#注意力机制]]。');
    expect(message.contentBlocks?.[0]?.text).toBe('块里的普通句子。');
  });

  it('reports unchanged and leaves the message byte-identical when nothing matches', () => {
    const processor = jest.fn((text: string) => text);
    const service = new AssistantAutoInternalLinkService(processor);
    const message = createMessage({ content: '没有可链接的词。' });
    const { conversation, logStage } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      message,
    ]);

    const { changed } = service.applyToConversationTail(conversation, [createContextItem()], logStage);

    expect(changed).toBe(false);
    expect(message.content).toBe('没有可链接的词。');
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: false,
      reason: 'unchanged',
      referenceCount: 1,
    });
  });
});

describe('AssistantAutoInternalLinkService honesty', () => {
  it('reports a missing processor seam through the trace instead of pretending success', () => {
    const service = new AssistantAutoInternalLinkService(null);
    const { conversation, logStage } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      createMessage({ content: '本节介绍注意力机制。', timestamp: 10 }),
    ]);

    const { changed } = service.applyToConversationTail(conversation, [createContextItem()], logStage);

    expect(changed).toBe(false);
    expect(logStage).toHaveBeenCalledWith('auto-internal-link-pass', {
      changed: false,
      reason: 'processor-unavailable',
      referenceCount: 0,
    });
  });

  it('returns a pre-mutation snapshot so the render apply sees a real before/after diff', () => {
    const service = new AssistantAutoInternalLinkService(jest.fn(linkAttention));
    const message = createMessage({ content: '本节介绍注意力机制。' });
    const { conversation } = createTurn([
      createMessage({ id: 'user-1', role: 'user', content: '总结一下', timestamp: 1 }),
      message,
    ]);

    const outcome = service.applyToConversationTail(conversation, [createContextItem()], jest.fn());

    expect(outcome.changed).toBe(true);
    // Live message carries the links…
    expect(message.content).toBe('本节介绍[[notes/ref-attention.md#注意力机制]]。');
    // …while the returned snapshot still shows the generated wording.
    expect(outcome.previousMessages[1]?.content).toBe('本节介绍注意力机制。');
    expect(outcome.previousMessages[1]).not.toBe(message);
    expect(conversation.messages[1]).toBe(message);
  });
});
