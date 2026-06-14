/**
 * CodexAdapter tests — focused on app-server transcript normalization.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { CodexAppServerClient } from '../../src/core/agents/backend/CodexAppServerClient';

describe('CodexAppServerClient.normalizeTurnsToPreviewMessages()', () => {
  it('extracts text from userMessage and agentMessage items', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'userMessage', id: 'item-1', content: [{ type: 'text', text: 'Hello' }] },
          { type: 'agentMessage', id: 'item-2', text: 'Hi there!', phase: 'commentary' },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as unknown as import('../../src/core/agents/backend/CodexAppServerClient').AppServerTurn[]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ role: 'user', parts: [{ type: 'text', text: 'Hello' }] });
    expect(result[1]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: 'Hi there!' }] });
  });

  it('skips reasoning and contextCompaction but includes mcpToolCall, webSearch, fileChange as activity', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'userMessage', id: 'item-1', content: [{ type: 'text', text: 'User prompt' }] },
          { type: 'reasoning', id: 'item-2', summary: ['Thinking...'] },
          { type: 'mcpToolCall', id: 'item-3', server: 'opencode', tool: 'opencode_setup', arguments: {} },
          { type: 'webSearch', id: 'item-4', query: 'test query' },
          { type: 'fileChange', id: 'item-5', changes: [{ path: 'src/main.ts', kind: 'modified' }] },
          { type: 'contextCompaction', id: 'item-6' },
          { type: 'agentMessage', id: 'item-7', text: 'Agent reply', phase: 'commentary' },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as unknown as import('../../src/core/agents/backend/CodexAppServerClient').AppServerTurn[]);

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ role: 'user', parts: [{ type: 'text', text: 'User prompt' }] });
    expect(result[1]).toEqual({ role: 'activity', parts: [{ type: 'tool_call', text: 'opencode/opencode_setup' }] });
    expect(result[2]).toEqual({ role: 'activity', parts: [{ type: 'web_search', text: 'test query' }] });
    expect(result[3]).toEqual({ role: 'activity', parts: [{ type: 'file_change', text: 'src/main.ts (modified)' }] });
    expect(result[4]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: 'Agent reply' }] });
  });

  it('normalizes mcpToolCall without server name', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'mcpToolCall', id: 'item-1', server: '', tool: 'standalone_tool', arguments: {} },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as unknown as import('../../src/core/agents/backend/CodexAppServerClient').AppServerTurn[]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'activity', parts: [{ type: 'tool_call', text: 'standalone_tool' }] });
  });

  it('normalizes fileChange with multiple changes', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          {
            type: 'fileChange',
            id: 'item-1',
            changes: [
              { path: 'src/a.ts', kind: 'modified' },
              { path: 'src/b.ts', kind: 'created' },
              { path: 'src/c.ts', kind: 'deleted' },
            ],
          },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as unknown as import('../../src/core/agents/backend/CodexAppServerClient').AppServerTurn[]);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ role: 'activity', parts: [{ type: 'file_change', text: 'src/a.ts (modified)' }] });
    expect(result[1]).toEqual({ role: 'activity', parts: [{ type: 'file_change', text: 'src/b.ts (created)' }] });
    expect(result[2]).toEqual({ role: 'activity', parts: [{ type: 'file_change', text: 'src/c.ts (deleted)' }] });
  });

  it('normalizes fileChange with missing kind as "change"', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'fileChange', id: 'item-1', changes: [{ path: 'README.md' }] },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as unknown as import('../../src/core/agents/backend/CodexAppServerClient').AppServerTurn[]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'activity', parts: [{ type: 'file_change', text: 'README.md (change)' }] });
  });

  it('handles multiple text parts in userMessage content', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          {
            type: 'userMessage',
            id: 'item-1',
            content: [
              { type: 'text', text: 'First paragraph' },
              { type: 'text', text: 'Second paragraph' },
            ],
          },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as unknown as import('../../src/core/agents/backend/CodexAppServerClient').AppServerTurn[]);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(result[0].parts).toHaveLength(2);
    expect(result[0].parts[0]).toEqual({ type: 'text', text: 'First paragraph' });
    expect(result[0].parts[1]).toEqual({ type: 'text', text: 'Second paragraph' });
  });

  it('ignores userMessage items with no text content', () => {
    const turns = [
      {
        id: 'turn-1',
        items: [
          { type: 'userMessage', id: 'item-1', content: [{ type: 'image', url: 'http://example.com/img.png' }] },
          { type: 'agentMessage', id: 'item-2', text: 'I cannot see images.' },
        ],
      },
    ];

    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages(turns as unknown as import('../../src/core/agents/backend/CodexAppServerClient').AppServerTurn[]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'assistant', parts: [{ type: 'text', text: 'I cannot see images.' }] });
  });

  it('returns empty array for empty turns', () => {
    const result = CodexAppServerClient.normalizeTurnsToPreviewMessages([]);
    expect(result).toEqual([]);
  });
});

