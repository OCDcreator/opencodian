import type { ChatMessage, StreamChunk as CoreStreamChunk } from '../../../../src/core/types';
import {
  summarizeChatMessageForDebug,
  summarizeContentBlocksForDebug,
  summarizeCoreStreamChunkForDebug,
  summarizeRenderedStreamChunkForDebug,
} from '../../../../src/features/chat/runtime/SendPipelineDebugSummaries';
import type { StreamChunk as StreamingChunk } from '../../../../src/utils/streaming';

describe('summarizeContentBlocksForDebug', () => {
    it('returns zero counts for empty blocks', () => {
      const result = summarizeContentBlocksForDebug(undefined);

      expect(result).toEqual({
        count: 0,
        types: [],
        textLength: 0,
        toolCount: 0,
        thinkingCount: 0,
      });
    });

    it('counts text blocks and accumulates text length', () => {
      const result = summarizeContentBlocksForDebug([
        { type: 'text', text: 'hello' },
        { type: 'text', content: 'world' },
      ]);

      expect(result.count).toBe(2);
      expect(result.textLength).toBe(10);
      expect(result.toolCount).toBe(0);
      expect(result.thinkingCount).toBe(0);
      expect(result.types).toEqual(['text', 'text']);
    });

    it('counts tool_use and tool_call blocks', () => {
      const result = summarizeContentBlocksForDebug([
        { type: 'tool_use' },
        { type: 'tool_call' },
        { toolCall: { id: '1', name: 'test' } },
      ]);

      expect(result.toolCount).toBe(3);
      expect(result.textLength).toBe(0);
    });

    it('counts thinking blocks', () => {
      const result = summarizeContentBlocksForDebug([
        { type: 'thinking' },
        { type: 'text', text: 'foo' },
      ]);

      expect(result.thinkingCount).toBe(1);
      expect(result.textLength).toBe(3);
    });

    it('falls back to unknown for missing type', () => {
      const result = summarizeContentBlocksForDebug([{}]);

      expect(result.types).toEqual(['unknown']);
    });
  });

  describe('summarizeChatMessageForDebug', () => {
    it('returns null for null or undefined message', () => {
      expect(summarizeChatMessageForDebug(null)).toBeNull();
      expect(summarizeChatMessageForDebug(undefined)).toBeNull();
    });

    it('summarizes a basic chat message', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello world',
        timestamp: 1234567890,
      };

      const result = summarizeChatMessageForDebug(message);

      expect(result).toMatchObject({
        id: 'msg-1',
        sourceMessageId: null,
        role: 'assistant',
        timestamp: 1234567890,
        modelId: null,
        streamState: null,
        displayStyle: 'default',
        contentLength: 11,
        contentPreview: 'Hello world',
        toolCallsCount: 0,
        structuredPresent: false,
        partsCount: 0,
        questionResolution: null,
        omoKind: null,
      });
    });

    it('truncates content preview for long content', () => {
      const longContent = 'a'.repeat(200);
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'user',
        content: longContent,
        timestamp: 0,
      };

      const result = summarizeChatMessageForDebug(message);

      expect((result as Record<string, unknown>).contentPreview).toBe(`${'a'.repeat(120)}...`);
    });

    it('includes contentBlocks summary when present', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'test',
        timestamp: 0,
        contentBlocks: [{ type: 'text', text: 'block' }],
      };

      const result = summarizeChatMessageForDebug(message);

      expect((result as Record<string, unknown>).contentBlocks).toEqual({
        count: 1,
        types: ['text'],
        textLength: 5,
        toolCount: 0,
        thinkingCount: 0,
      });
    });

    it('includes questionResolution when present', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'test',
        timestamp: 0,
        questionResolution: {
          request: { id: 'req-1', questions: [] },
          status: 'answered',
        },
      };

      const result = summarizeChatMessageForDebug(message);

      expect((result as Record<string, unknown>).questionResolution).toEqual({
        requestId: 'req-1',
        status: 'answered',
      });
    });

    it('includes omo kind when present', () => {
      const message: ChatMessage = {
        id: 'msg-1',
        role: 'assistant',
        content: 'test',
        timestamp: 0,
        omo: { kind: 'injection' },
      };

      const result = summarizeChatMessageForDebug(message);

      expect((result as Record<string, unknown>).omoKind).toBe('injection');
    });
  });

  describe('summarizeCoreStreamChunkForDebug', () => {
    it('summarizes text chunk', () => {
      const chunk: CoreStreamChunk = { type: 'text', content: 'hello world' };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'text',
        length: 11,
        preview: 'hello world',
      });
    });

    it('summarizes thinking chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'thinking',
        content: 'deep thought',
        partId: 'part-1',
        durationSeconds: 5,
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'thinking',
        partId: 'part-1',
        length: 12,
        preview: 'deep thought',
        durationSeconds: 5,
      });
    });

    it('summarizes tool_use chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'tool_use',
        id: 'tool-1',
        name: 'readFile',
        input: { path: '/test' },
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'tool_use',
        id: 'tool-1',
        name: 'readFile',
        inputKeys: ['path'],
      });
    });

    it('summarizes tool_result chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'tool_result',
        toolUseId: 'tool-1',
        content: 'result data',
        isError: true,
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'tool_result',
        toolUseId: 'tool-1',
        length: 11,
        preview: 'result data',
        isError: true,
      });
    });

    it('summarizes usage chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'usage',
        inputTokens: 100,
        outputTokens: 50,
        sessionId: 'session-1',
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'usage',
        inputTokens: 100,
        outputTokens: 50,
        sessionId: 'session-1',
      });
    });

    it('summarizes backend diagnostic events without expanding payloads', () => {
      const chunk: CoreStreamChunk = {
        type: 'backend_event',
        source: 'claude-code',
        event: 'structured_output',
        status: 'received',
        id: 'event-1',
        name: 'schema',
        content: '{"status":"ok"}',
        metadata: {
          structuredOutput: { status: 'ok' },
          deferredToolUse: null,
        },
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'backend_event',
        source: 'claude-code',
        event: 'structured_output',
        status: 'received',
        id: 'event-1',
        name: 'schema',
        contentLength: 15,
        metadataKeys: ['structuredOutput', 'deferredToolUse'],
      });
    });

    it('summarizes message_metadata chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'message_metadata',
        messageId: 'msg-1',
        timestamp: 1234567890,
        modelId: 'gpt-4',
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'message_metadata',
        messageId: 'msg-1',
        timestamp: 1234567890,
        modelId: 'gpt-4',
      });
    });

    it('summarizes file_edited chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'file_edited',
        file: '/path/to/file.md',
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'file_edited',
        file: '/path/to/file.md',
      });
    });

    it('summarizes permission_request chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'permission_request',
        id: 'perm-1',
        permission: 'bash',
        patterns: ['rm -rf'],
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'permission_request',
        id: 'perm-1',
        permission: 'bash',
        patternCount: 1,
      });
    });

    it('summarizes question_request chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'question_request',
        request: { id: 'q-1', questions: [{ id: 'q1', text: 'What?' }] },
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'question_request',
        requestId: 'q-1',
        questionCount: 1,
      });
    });

    it('summarizes error chunk', () => {
      const chunk: CoreStreamChunk = {
        type: 'error',
        content: 'something went wrong',
      };
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'error',
        length: 20,
        preview: 'something went wrong',
      });
    });

    it('returns type-only for unknown chunk type', () => {
      const chunk = { type: 'unknown_type' } as CoreStreamChunk;
      const result = summarizeCoreStreamChunkForDebug(chunk);

      expect(result).toEqual({ type: 'unknown_type' });
    });
  });

  describe('summarizeRenderedStreamChunkForDebug', () => {
    it('summarizes text chunk', () => {
      const chunk: StreamingChunk = { type: 'text', content: 'hello' };
      const result = summarizeRenderedStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'text',
        length: 5,
        preview: 'hello',
      });
    });

    it('summarizes thinking chunk', () => {
      const chunk: StreamingChunk = {
        type: 'thinking',
        content: 'thought',
        partId: 'p1',
        durationSeconds: 3,
      };
      const result = summarizeRenderedStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'thinking',
        partId: 'p1',
        length: 7,
        preview: 'thought',
        durationSeconds: 3,
      });
    });

    it('summarizes tool_use chunk', () => {
      const chunk: StreamingChunk = {
        type: 'tool_use',
        id: 't1',
        name: 'tool',
        input: { a: 1 },
      };
      const result = summarizeRenderedStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'tool_use',
        id: 't1',
        name: 'tool',
        inputKeys: ['a'],
      });
    });

    it('summarizes tool_result chunk', () => {
      const chunk: StreamingChunk = {
        type: 'tool_result',
        id: 't1',
        content: 'ok',
        isError: false,
      };
      const result = summarizeRenderedStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'tool_result',
        id: 't1',
        length: 2,
        preview: 'ok',
        isError: false,
      });
    });

    it('summarizes error chunk', () => {
      const chunk: StreamingChunk = {
        type: 'error',
        content: 'fail',
      };
      const result = summarizeRenderedStreamChunkForDebug(chunk);

      expect(result).toEqual({
        type: 'error',
        length: 4,
        preview: 'fail',
      });
    });

    it('summarizes done chunk', () => {
      const chunk: StreamingChunk = { type: 'done' };
      const result = summarizeRenderedStreamChunkForDebug(chunk);

      expect(result).toEqual({ type: 'done' });
    });

    it('returns unknown for unrecognized type', () => {
      const chunk = { type: 'unrecognized' } as unknown as StreamingChunk;
      const result = summarizeRenderedStreamChunkForDebug(chunk);

      expect(result).toEqual({ type: 'unknown' });
    });
  });
