/**
 * Real unit tests for the Codex MCP elicitation bridge:
 * `CodexElicitationBridge` builders (form/url question cards, content
 * coercion) and the adapter-side `mcpServer/elicitation/request` handler
 * (registration, form/url flows, decline/cancel, unsupported modes).
 */

const mockRegisterServerRequestHandler = jest.fn();
const mockUnregisterServerRequestHandler = jest.fn();
const mockAppServerClientStart = jest.fn().mockResolvedValue(undefined);
const mockAppServerClientStop = jest.fn();
let elicitationHandler: ((params: unknown) => unknown) | null = null;
const mockRegisterMcpElicitationHandler = jest.fn((handler: (params: unknown) => unknown) => {
  elicitationHandler = handler;
});

jest.mock('../../../../../src/core/agents/backend/CodexAppServerClient', () => {
  const actual = jest.requireActual('../../../../../src/core/agents/backend/CodexAppServerClient');
  return {
    ...actual,
    CodexAppServerClient: jest.fn().mockImplementation(() => ({
      start: mockAppServerClientStart,
      stop: mockAppServerClientStop,
      registerServerRequestHandler: mockRegisterServerRequestHandler,
      unregisterServerRequestHandler: mockUnregisterServerRequestHandler,
      registerMcpElicitationHandler: mockRegisterMcpElicitationHandler,
      listThreads: jest.fn().mockResolvedValue([]),
      readThread: jest.fn().mockResolvedValue(null),
    })),
  };
});

import { CodexAdapter } from '../../../../../src/core/agents/backend/CodexAdapter';
import {
  buildCodexElicitationContent,
  buildCodexElicitationQuestionRequest,
  buildCodexElicitationUrlQuestionRequest,
  type CodexElicitationFormParams,
  type CodexElicitationUrlParams,
} from '../../../../../src/core/agents/backend/CodexElicitationBridge';

function createMockCodex(): unknown {
  return {
    startThread: jest.fn(),
    resumeThread: jest.fn(),
  };
}

const FORM_PARAMS: CodexElicitationFormParams = {
  serverName: 'github',
  threadId: 'thread-1',
  mode: 'form',
  message: 'Configure the deployment',
  requestedSchema: {
    type: 'object',
    properties: {
      environment: {
        type: 'string',
        title: 'Environment',
        enum: ['staging', 'production'],
        enumNames: ['Staging', 'Production'],
      },
      retries: { type: 'integer', title: 'Retries' },
      confirmed: { type: 'boolean', title: 'Confirmed' },
      regions: { type: 'array', items: { type: 'string', enum: ['us', 'eu'] } },
      channel: {
        type: 'string',
        oneOf: [
          { const: 'stable', title: 'Stable channel' },
          { const: 'beta', title: 'Beta channel' },
        ],
      },
    },
    required: ['environment'],
  },
};

const URL_PARAMS: CodexElicitationUrlParams = {
  serverName: 'slack',
  threadId: 'thread-1',
  mode: 'url',
  message: 'Authorize Slack in the browser',
  url: 'https://example.com/auth',
  elicitationId: 'elicitation-1',
};

describe('CodexElicitationBridge builders', () => {
  it('maps schema properties to custom prompts with enum options and multiple arrays', () => {
    const request = buildCodexElicitationQuestionRequest(FORM_PARAMS);

    expect(request.sessionId).toBe('codex');
    expect(request.questions).toHaveLength(5);

    const byKey = Object.fromEntries(request.questions.map((q) => [q.question, q]));
    expect(byKey.environment.header).toBe('Environment');
    expect(byKey.environment.options).toEqual([
      { label: 'staging', description: 'Staging' },
      { label: 'production', description: 'Production' },
    ]);
    expect(byKey.environment.custom).toBe(true);

    expect(byKey.retries.options).toEqual([]);
    expect(byKey.confirmed.multiple).toBeFalsy();

    expect(byKey.regions.multiple).toBe(true);
    expect(byKey.regions.options).toEqual([
      { label: 'us', description: '' },
      { label: 'eu', description: '' },
    ]);

    expect(byKey.channel.options).toEqual([
      { label: 'stable', description: 'Stable channel' },
      { label: 'beta', description: 'Beta channel' },
    ]);
  });

  it('falls back to an Accept/Decline confirm card when the form has no properties', () => {
    const request = buildCodexElicitationQuestionRequest({
      ...FORM_PARAMS,
      requestedSchema: { type: 'object', properties: {} },
    });

    expect(request.questions).toHaveLength(1);
    expect(request.questions[0].question).toBe('Configure the deployment');
    expect(request.questions[0].options.map((o) => o.label)).toEqual(['Accept', 'Decline']);
  });

  it('builds the url-mode confirm card', () => {
    const request = buildCodexElicitationUrlQuestionRequest(URL_PARAMS);

    expect(request.id).toBe('codex-elicitation-url-elicitation-1');
    expect(request.questions[0].options[0]).toEqual({
      label: 'Accept',
      description: 'https://example.com/auth',
    });
  });

  it('coerces answers back per the requested schema', () => {
    const request = buildCodexElicitationQuestionRequest(FORM_PARAMS);
    const answers = [
      ['staging'],
      ['3'],
      ['yes'],
      ['us', 'eu'],
      ['beta'],
    ];

    const content = buildCodexElicitationContent(request, answers, FORM_PARAMS);

    expect(content).toEqual({
      environment: 'staging',
      retries: 3,
      confirmed: true,
      regions: ['us', 'eu'],
      channel: 'beta',
    });
  });

  it('skips the fallback Decline selection when building content', () => {
    const params: CodexElicitationFormParams = {
      ...FORM_PARAMS,
      requestedSchema: { type: 'object', properties: {} },
    };
    const request = buildCodexElicitationQuestionRequest(params);

    expect(buildCodexElicitationContent(request, [['Decline']], params)).toEqual({});
  });
});

describe('CodexAdapter mcpServer/elicitation/request handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    elicitationHandler = null;
    mockAppServerClientStart.mockResolvedValue(undefined);
  });

  function createStartedAdapter(
    host: { collectElicitation: jest.Mock },
  ): CodexAdapter {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    adapter.setElicitationHost(host);
    return adapter;
  }

  it('registers the elicitation handler when a host is set before start', async () => {
    const adapter = createStartedAdapter({ collectElicitation: jest.fn().mockResolvedValue(null) });
    await adapter.start();

    expect(mockRegisterMcpElicitationHandler).toHaveBeenCalledWith(expect.any(Function));
    await adapter.stop();
  });

  it('does not register the handler without a host', async () => {
    const adapter = new CodexAdapter({
      codexPathOverride: '/path/to/codex',
      createCodex: jest.fn().mockResolvedValue(createMockCodex()),
    });
    await adapter.start();

    expect(mockRegisterMcpElicitationHandler).not.toHaveBeenCalled();
    await adapter.stop();
  });

  it('accepts a form elicitation with schema-coerced content', async () => {
    const collectElicitation = jest.fn().mockResolvedValue({
      action: 'accept',
      answers: [['staging'], ['2'], ['true'], ['us'], ['stable']],
    });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    const reply = await elicitationHandler!(FORM_PARAMS);

    expect(reply).toEqual({
      action: 'accept',
      content: {
        environment: 'staging',
        retries: 2,
        confirmed: true,
        regions: ['us'],
        channel: 'stable',
      },
    });
    const cardRequest = collectElicitation.mock.calls[0][0];
    expect(cardRequest.params).toBe(FORM_PARAMS);
    expect(cardRequest.questionRequest.questions).toHaveLength(5);
    await adapter.stop();
  });

  it('passes decline and cancel actions through unchanged', async () => {
    const collectElicitation = jest.fn()
      .mockResolvedValueOnce({ action: 'decline' })
      .mockResolvedValueOnce({ action: 'cancel' });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!(FORM_PARAMS)).resolves.toEqual({ action: 'decline' });
    await expect(elicitationHandler!(FORM_PARAMS)).resolves.toEqual({ action: 'cancel' });
    await adapter.stop();
  });

  it('maps the fallback Decline selection to a decline action', async () => {
    const collectElicitation = jest.fn().mockResolvedValue({
      action: 'accept',
      answers: [['Decline']],
    });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    const noProperties = { ...FORM_PARAMS, requestedSchema: { type: 'object', properties: {} } };
    await expect(elicitationHandler!(noProperties)).resolves.toEqual({ action: 'decline' });
    await adapter.stop();
  });

  it('opens the url and confirms for url-mode elicitations', async () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const collectElicitation = jest.fn().mockResolvedValue({ action: 'accept' });
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!(URL_PARAMS)).resolves.toEqual({ action: 'accept' });
    expect(openSpy).toHaveBeenCalledWith('https://example.com/auth', '_blank');
    const cardRequest = collectElicitation.mock.calls[0][0];
    expect(cardRequest.questionRequest.id).toBe('codex-elicitation-url-elicitation-1');

    openSpy.mockRestore();
    await adapter.stop();
  });

  it('declines the unsupported openai/form mode gracefully', async () => {
    const collectElicitation = jest.fn();
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!({
      serverName: 'openai',
      threadId: 'thread-1',
      mode: 'openai/form',
      message: 'm',
      requestedSchema: { type: 'object' },
    })).resolves.toEqual({ action: 'decline' });
    expect(collectElicitation).not.toHaveBeenCalled();
    await adapter.stop();
  });

  it('cancels malformed params', async () => {
    const collectElicitation = jest.fn();
    const adapter = createStartedAdapter({ collectElicitation });
    await adapter.start();

    await expect(elicitationHandler!({ nope: true })).resolves.toEqual({ action: 'cancel' });
    await adapter.stop();
  });
});
