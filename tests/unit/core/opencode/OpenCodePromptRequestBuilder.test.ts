import {
  type BuiltPromptSendPayload,
  OpenCodePromptRequestBuilder,
  type PromptRequestPart,
} from '../../../../src/core/opencode/OpenCodePromptRequestBuilder';

function createBuilder() {
  const generatedIds = ['message-1', 'part-1', 'part-2', 'part-3'];
  const host = {
    createPromptEntityId: jest.fn(() => generatedIds.shift() ?? `generated-${Date.now()}`),
    getDefaultModelSelection: jest.fn(() => ({
      providerID: 'openai',
      modelID: 'gpt-5',
    })),
    observeRuntimeToolNames: jest.fn(() => false),
  };

  return {
    host,
    builder: new OpenCodePromptRequestBuilder(host),
  };
}

describe('OpenCodePromptRequestBuilder', () => {
  const parts: PromptRequestPart[] = [{ type: 'text', text: 'Hello' }];

  it('returns stable message and part ids for the optimistic seed and the request payload', () => {
    const { builder, host } = createBuilder();

    const payload: BuiltPromptSendPayload = builder.buildStructuredPromptSendPayload({
      parts: [
        { type: 'text', text: 'Hello' },
        {
          type: 'file',
          mime: 'text/plain',
          filename: 'notes.md',
          url: 'file:///vault/notes.md',
        },
      ],
    });

    expect(payload).toEqual({
      messageID: 'message-1',
      requestParts: [
        { id: 'part-1', type: 'text', text: 'Hello' },
        {
          id: 'part-2',
          type: 'file',
          mime: 'text/plain',
          filename: 'notes.md',
          url: 'file:///vault/notes.md',
        },
      ],
      optimisticUserParts: [
        { id: 'part-1', type: 'text', text: 'Hello' },
        {
          id: 'part-2',
          type: 'file',
          mime: 'text/plain',
          filename: 'notes.md',
          url: 'file:///vault/notes.md',
        },
      ],
    });
    expect(host.createPromptEntityId).toHaveBeenNthCalledWith(1, 'message');
    expect(host.createPromptEntityId).toHaveBeenNthCalledWith(2, 'part');
    expect(host.createPromptEntityId).toHaveBeenNthCalledWith(3, 'part');
  });

  it('builds SDK prompt parameters with shared prompt options and default model selection', () => {
    const { builder, host } = createBuilder();

    const parameters = builder.buildSdkPromptParameters('session-1', parts, {
      system: ' Return JSON only ',
      agent: ' title ',
      noReply: false,
      allowedTools: ['read', 'grep'],
      reasoningEffort: 'high',
      thinkingBudget: 128,
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    });

    expect(parameters).toEqual({
      sessionID: 'session-1',
      model: {
        providerID: 'openai',
        modelID: 'gpt-5',
      },
      parts,
      system: 'Return JSON only',
      agent: 'title',
      noReply: false,
      tools: {
        read: true,
        grep: true,
      },
      variant: 'high',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
          additionalProperties: false,
        },
      },
    });
    expect(host.observeRuntimeToolNames).toHaveBeenCalledWith(['read', 'grep']);
  });

  it('keeps legacy message request assembly free of async-only model options', () => {
    const { builder } = createBuilder();

    const requestBody = builder.buildLegacyMessageRequestBody(parts, {
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      allowedTools: ['read'],
      reasoningEffort: 'medium',
      thinkingBudget: 0,
      format: { type: 'text' },
    });

    expect(requestBody).toEqual({
      parts,
      model: {
        providerID: 'anthropic',
        modelID: 'claude-3-7-sonnet',
      },
      tools: {
        read: true,
      },
      variant: 'medium',
      format: { type: 'text' },
    });
  });

  it('maps reasoning effort and thinking budget into legacy stream model options', () => {
    const { builder } = createBuilder();

    const enabledThinking = builder.buildLegacyStreamRequestBody(parts, {
      reasoningEffort: 'low',
      thinkingBudget: 256,
    });
    const disabledThinking = builder.buildLegacyStreamRequestBody(parts, {
      thinkingBudget: 0,
    });

    expect(enabledThinking).toEqual({
      parts,
      model: {
        providerID: 'openai',
        modelID: 'gpt-5',
        options: {
          reasoningEffort: 'low',
          thinking: {
            type: 'enabled',
            budgetTokens: 256,
          },
        },
      },
      variant: 'low',
    });
    expect(disabledThinking).toEqual({
      parts,
      model: {
        providerID: 'openai',
        modelID: 'gpt-5',
        options: {
          thinking: {
            type: 'disabled',
          },
        },
      },
    });
  });
});
