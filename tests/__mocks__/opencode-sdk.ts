/**
 * Mock for @opencode-ai/sdk
 */

import type { Message, Session } from '@opencode-ai/sdk';

// Mock session data
const mockSession: Session = {
  id: 'test-session-123',
  projectID: 'test-project',
  directory: '/test',
  title: 'Test Session',
  version: '1.0.0',
  time: {
    created: Date.now(),
    updated: Date.now(),
  },
};

// Create mock client
export const createMockClient = () => ({
  session: {
    create: jest.fn().mockResolvedValue({
      data: mockSession,
      error: null,
    }),
    list: jest.fn().mockResolvedValue({
      data: [mockSession],
      error: null,
    }),
    messages: jest.fn().mockResolvedValue({
      data: [],
      error: null,
    }),
    delete: jest.fn().mockResolvedValue({
      data: true,
      error: null,
    }),
    prompt: jest.fn().mockResolvedValue({
      data: { success: true },
      error: null,
    }),
  },
  config: {
    providers: jest.fn().mockResolvedValue({
      data: {
        providers: [
          {
            id: 'anthropic',
            name: 'Anthropic',
            source: 'env' as const,
            env: ['ANTHROPIC_API_KEY'],
            options: {},
            models: {
              'claude-3-5-sonnet': {
                id: 'claude-3-5-sonnet-20241022',
                providerID: 'anthropic',
                name: 'Claude 3.5 Sonnet',
                api: { id: 'anthropic', url: 'https://api.anthropic.com', npm: '@ai-sdk/anthropic' },
                capabilities: { temperature: true, tools: true },
                limit: { context: 200000, output: 8192 },
              },
            },
          },
        ],
        default: { anthropic: 'claude-3-5-sonnet-20241022' },
      },
      error: null,
    }),
  },
  global: {
    event: jest.fn().mockResolvedValue({
      stream: (async function* () {
        // Yield a mock event
        yield {
          type: 'message.updated',
          properties: {
            info: {
              id: 'msg-1',
              sessionID: 'test-session-123',
              role: 'assistant',
              time: { created: Date.now() },
            } as Message,
          },
        };
      })(),
    }),
  },
});

export const createOpencode = jest.fn().mockResolvedValue({
  client: createMockClient(),
  server: {
    url: 'http://127.0.0.1:4096',
    close: jest.fn(),
  },
});

export const createOpencodeClient = jest.fn().mockReturnValue(createMockClient());

export type OpencodeClient = ReturnType<typeof createOpencodeClient>;
