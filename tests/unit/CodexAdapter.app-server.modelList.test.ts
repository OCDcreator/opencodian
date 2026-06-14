/**
 * CodexAdapter tests — focused on app-server model list preference.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CodexFactory } from '../../src/core/agents/backend/CodexAdapter';
import { CodexAdapter } from '../../src/core/agents/backend/CodexAdapter';
import { CodexAppServerClient } from '../../src/core/agents/backend/CodexAppServerClient';

jest.mock('../../src/core/agents/backend/CodexAppServerClient', () => {
  const mockConstructor = jest.fn().mockImplementation(() => ({
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    listThreads: jest.fn().mockResolvedValue([]),
    readThread: jest.fn().mockResolvedValue(null),
    listModels: jest.fn().mockResolvedValue([]),
  }));
  (mockConstructor as any).normalizeThreadList = jest.fn((threads: any[]) =>
    threads.map((t: any) => ({
      id: t.id,
      title: t.name ?? t.preview?.slice(0, 80) ?? '(untitled)',
      updatedAt: t.updatedAt ? t.updatedAt * 1000 : null,
      shareUrl: null,
    }))
  );
  (mockConstructor as any).normalizeTurnsToPreviewMessages = jest.fn(() => []);
  return { CodexAppServerClient: mockConstructor };
});

const MockedCodexAppServerClient = CodexAppServerClient as jest.MockedClass<typeof CodexAppServerClient>;

describe('CodexAdapter — getModelList() app-server preference', () => {
  let adapter: CodexAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefers app-server model/list when available', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
      listModels: jest.fn().mockResolvedValue([
        {
          id: 'gpt-5.5',
          model: 'gpt-5.5',
          displayName: 'GPT-5.5',
          description: 'Frontier model.',
          defaultReasoningEffort: 'medium',
        },
        {
          id: 'gpt-5.4',
          model: 'gpt-5.4',
          displayName: 'gpt-5.4',
          description: null,
          defaultReasoningEffort: 'medium',
        },
      ]),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as Awaited<ReturnType<CodexFactory>>,
    });
    await adapter.start();

    const result = await adapter.getModelList();

    expect(result).toEqual([
      {
        slug: 'gpt-5.5',
        display_name: 'GPT-5.5',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: 'medium',
        description: 'Frontier model.',
      },
      {
        slug: 'gpt-5.4',
        display_name: 'gpt-5.4',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: 'medium',
        description: null,
      },
    ]);
  });

  it('falls back to CLI diagnostic when app-server returns no models', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
      listModels: jest.fn().mockResolvedValue([]),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as Awaited<ReturnType<CodexFactory>>,
    });
    await adapter.start();

    const result = await adapter.getModelList();

    expect(result).toBeNull();
  });

  it('falls back to CLI diagnostic when app-server listModels throws', async () => {
    MockedCodexAppServerClient.mockImplementation(() => ({
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
      listModels: jest.fn().mockRejectedValue(new Error('app-server offline')),
    } as unknown as CodexAppServerClient));

    adapter = new CodexAdapter({
      codexPathOverride: '/mock/codex',
      createCodex: async () => ({}) as Awaited<ReturnType<CodexFactory>>,
    });
    await adapter.start();

    const result = await adapter.getModelList();

    expect(result).toBeNull();
  });
});
