import { describe, expect, it, jest } from '@jest/globals';

import {
  INLINE_COMPLETION_TURN_TIMEOUT_MS,
} from '../../../../../src/core/agents/backend/AgentInlineCompletionCapability';
import {
  ZCodeInlineCompletionSession,
  type ZCodeWorkspaceGenerationTransport,
} from '../../../../../src/core/agents/backend/zcode/ZCodeInlineCompletionSession';
import type { ZCodeModelCatalog } from '../../../../../src/core/agents/backend/zcode/ZCodeModelCatalog';

const catalog: ZCodeModelCatalog = {
  models: [{
    providerId: 'krill',
    modelId: 'gpt-6-sol',
    label: 'GPT-6 Sol',
    providerLabel: 'Krill',
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    reasoningLevels: [{ value: 'none', label: 'None' }],
    defaultReasoningLevel: 'none',
    supportsImageInput: true,
  }],
  currentModel: { providerId: 'krill', modelId: 'gpt-6-sol', reasoningLevel: 'none' },
  thoughtLevels: [],
  currentThoughtLevel: null,
  thoughtLevelEnabled: false,
  currentMode: 'build',
  slashCommands: [],
  observedAt: 0,
};

function makeSession(request = jest.fn<ZCodeWorkspaceGenerationTransport['request']>(async (method) => {
  if (method === 'workspace/generateText') return { text: 'completion', toolCalls: [] };
  return { cancelled: true };
})): { session: ZCodeInlineCompletionSession; request: typeof request } {
  const session = ZCodeInlineCompletionSession.create({
    transport: { request },
    workingDirectory: '/isolated-vault',
    systemPrompt: 'You complete text only.',
    catalog,
    model: { providerId: 'krill', modelId: 'gpt-6-sol', reasoningLevel: 'none' },
  });
  return { session, request };
}

const turn = { prefix: 'Start', suffix: 'End', maxChars: 40 };

describe('ZCodeInlineCompletionSession', () => {
  it('uses direct text generation with native tools:[], full model reasoning, and no session method', async () => {
    const { session, request } = makeSession();

    await expect(session.complete(turn)).resolves.toEqual({ ok: true, text: 'completion', toolCalls: [] });

    expect(request).toHaveBeenCalledWith('workspace/generateText', expect.objectContaining({
      workspace: { workspaceKey: '/isolated-vault', workspacePath: '/isolated-vault' },
      selection: {
        providerId: 'krill',
        modelId: 'gpt-6-sol',
        options: { reasoningLevel: 'none' },
      },
      tools: [],
      maxOutputTokens: 64,
      querySource: 'opencodian_inline_completion',
      messages: expect.arrayContaining([
        { role: 'system', content: 'You complete text only.' },
        expect.objectContaining({ role: 'user' }),
      ]),
    }));
    expect(request.mock.calls.map(([method]) => method)).not.toContain('session/create');
    // This is an audited request/source constraint, not a runtime tool-list
    // readback. The direct response's `toolCalls` is the per-turn observation.
    expect(session.safety.effectiveTools).toEqual([]);
    expect(session.safety.mechanism).toContain('no session effective-tool readback');
  });

  it('validates model reasoning before any native request', () => {
    const request = jest.fn<ZCodeWorkspaceGenerationTransport['request']>();

    expect(() => ZCodeInlineCompletionSession.create({
      transport: { request },
      workingDirectory: '/isolated-vault',
      systemPrompt: 'x',
      catalog,
      model: { providerId: 'krill', modelId: 'gpt-6-sol', reasoningLevel: 'high' },
    })).toThrow('not supported');
    expect(request).not.toHaveBeenCalled();
  });

  it('cancels the exact native operation and reports cancellation', async () => {
    let resolveGenerate: ((value: unknown) => void) | undefined;
    const request = jest.fn<ZCodeWorkspaceGenerationTransport['request']>((method) => {
      if (method === 'workspace/generateText') {
        return new Promise((resolve) => { resolveGenerate = resolve; });
      }
      return Promise.resolve({ cancelled: true });
    });
    const { session } = makeSession(request);
    const running = session.complete(turn);

    await Promise.resolve();
    session.cancel();
    expect(request).toHaveBeenCalledWith('workspace/cancelGenerateText', expect.objectContaining({
      operationId: expect.stringMatching(/^zcode-inline-/),
    }));
    resolveGenerate?.({ text: 'late completion', toolCalls: [] });

    await expect(running).resolves.toEqual(expect.objectContaining({ ok: false, cancelled: true }));
  });

  it('enforces the inline turn budget through native operation-id cancellation', async () => {
    jest.useFakeTimers();
    try {
      const request = jest.fn<ZCodeWorkspaceGenerationTransport['request']>((method) => {
        if (method === 'workspace/generateText') return new Promise(() => { /* cancelled by the native operation */ });
        return Promise.resolve({ cancelled: true });
      });
      const { session } = makeSession(request);
      const running = session.complete(turn);

      await jest.advanceTimersByTimeAsync(INLINE_COMPLETION_TURN_TIMEOUT_MS);

      await expect(running).resolves.toEqual(expect.objectContaining({ ok: false, cancelled: true }));
      expect(request).toHaveBeenCalledWith('workspace/cancelGenerateText', expect.objectContaining({
        operationId: expect.stringMatching(/^zcode-inline-/),
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns within a bounded cancel-ack budget when the native ACK never arrives', async () => {
    jest.useFakeTimers();
    try {
      const request = jest.fn<ZCodeWorkspaceGenerationTransport['request']>((method) => {
        if (method === 'workspace/generateText' || method === 'workspace/cancelGenerateText') {
          return new Promise(() => { /* Native response intentionally never arrives. */ });
        }
        return Promise.resolve({});
      });
      const { session } = makeSession(request);
      const running = session.complete(turn);

      await Promise.resolve();
      session.cancel();
      await jest.advanceTimersByTimeAsync(1_000);

      await expect(running).resolves.toEqual(expect.objectContaining({ ok: false, cancelled: true }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('serializes rapid completion requests behind the active turn', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    const request = jest.fn<ZCodeWorkspaceGenerationTransport['request']>((method) => {
      if (method !== 'workspace/generateText') return Promise.resolve({ cancelled: true });
      if (request.mock.calls.filter(([name]) => name === 'workspace/generateText').length === 1) {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      return Promise.resolve({ text: 'second', toolCalls: [] });
    });
    const { session } = makeSession(request);
    const first = session.complete(turn);
    const second = session.complete({ ...turn, prefix: 'Second' });

    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    resolveFirst?.({ text: 'first', toolCalls: [] });

    await expect(first).resolves.toEqual({ ok: true, text: 'first', toolCalls: [] });
    await expect(second).resolves.toEqual({ ok: true, text: 'second', toolCalls: [] });
    expect(request.mock.calls.filter(([method]) => method === 'workspace/generateText')).toHaveLength(2);
  });

  it('returns a fixed failure category and never opens a session when generation fails', async () => {
    const request = jest.fn<ZCodeWorkspaceGenerationTransport['request']>(async (method) => {
      if (method === 'workspace/generateText') throw new Error('untrusted remote detail');
      return { cancelled: false };
    });
    const { session } = makeSession(request);

    await expect(session.complete(turn)).resolves.toEqual({
      ok: false,
      error: 'ZCode inline completion request failed.',
    });
    await session.reset();
    await session.dispose();
    expect(request.mock.calls.map(([method]) => method)).not.toContain('session/list');
    expect(request.mock.calls.map(([method]) => method)).not.toContain('session/create');
  });
});
