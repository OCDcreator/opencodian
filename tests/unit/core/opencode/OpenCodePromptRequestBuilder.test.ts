import {
  type BuiltPromptSendPayload,
  OpenCodePromptRequestBuilder,
  type PromptRequestPart,
} from '../../../../src/core/opencode/OpenCodePromptRequestBuilder';

function createBuilder() {
  const host = {
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
  it('generates OpenCode-compatible entity ids directly from the builder', () => {
    const { builder } = createBuilder();

    const messageId = builder.createPromptEntityId('message');
    const partId = builder.createPromptEntityId('part');

    expect(messageId).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(partId).toMatch(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(messageId).not.toBe(partId);
  });

  it('returns stable message and part ids for the optimistic seed and the request payload', () => {
    const { builder } = createBuilder();

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

    expect(payload.messageID).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(payload.requestParts).toEqual([
      { id: expect.stringMatching(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/), type: 'text', text: 'Hello' },
      {
        id: expect.stringMatching(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/),
        type: 'file',
        mime: 'text/plain',
        filename: 'notes.md',
        url: 'file:///vault/notes.md',
      },
    ]);
    expect(payload.optimisticUserParts).toEqual(payload.requestParts);
    expect(payload.requestParts[0]?.id).not.toBe(payload.requestParts[1]?.id);
  });

  it('appends plugin-injected synthetic text parts without flattening them into user text', () => {
    const { builder } = createBuilder();

    const payload = builder.buildStructuredPromptSendPayload({
      parts: [{ type: 'text', text: 'Hello' }],
      syntheticTextParts: [
        {
          text: 'Injected plugin prompt',
          metadata: {
            source: 'plugin',
            pluginName: 'opencode-plugin-x',
          },
        },
      ],
    });

    expect(payload.messageID).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(payload.requestParts).toEqual([
      { id: expect.stringMatching(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/), type: 'text', text: 'Hello' },
      {
        id: expect.stringMatching(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/),
        type: 'text',
        text: 'Injected plugin prompt',
        synthetic: true,
        metadata: {
          source: 'plugin',
          pluginName: 'opencode-plugin-x',
        },
      },
    ]);
    expect(payload.optimisticUserParts).toEqual(payload.requestParts);
    expect(payload.requestParts[1]).not.toBe(payload.optimisticUserParts[1]);
    expect(
      (payload.requestParts[1] as Extract<PromptRequestPart, { type: 'text' }>).metadata,
    ).not.toBe(
      (payload.optimisticUserParts[1] as Extract<PromptRequestPart, { type: 'text' }>).metadata,
    );
  });

  it('appends invocation parts with stable ids and cloned nested fields', () => {
    const { builder } = createBuilder();

    const payload = builder.buildStructuredPromptSendPayload({
      parts: [{ type: 'text', text: 'Hello' }],
      invocationParts: [
        {
          type: 'agent',
          name: 'explorer',
          source: {
            value: '@explorer',
            start: 0,
            end: 9,
          },
        },
        {
          type: 'subtask',
          description: 'Audit routes',
          prompt: 'Inspect the router implementation',
          agent: 'reviewer',
          model: {
            providerID: 'openai',
            modelID: 'gpt-5.4',
          },
        },
      ],
    });

    expect(payload.messageID).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    expect(payload.requestParts).toEqual([
      { id: expect.stringMatching(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/), type: 'text', text: 'Hello' },
      {
        id: expect.stringMatching(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/),
        type: 'agent',
        name: 'explorer',
        source: {
          value: '@explorer',
          start: 0,
          end: 9,
        },
      },
      {
        id: expect.stringMatching(/^prt_[0-9a-f]{12}[0-9A-Za-z]{14}$/),
        type: 'subtask',
        description: 'Audit routes',
        prompt: 'Inspect the router implementation',
        agent: 'reviewer',
        model: {
          providerID: 'openai',
          modelID: 'gpt-5.4',
        },
      },
    ]);
    expect(payload.optimisticUserParts).toEqual(payload.requestParts);
    expect(new Set(payload.requestParts.map((part) => part.id)).size).toBe(3);
    expect(payload.requestParts[1]).not.toBe(payload.optimisticUserParts[1]);
    expect(
      (payload.requestParts[1] as Extract<PromptRequestPart, { type: 'agent' }>).source,
    ).not.toBe(
      (payload.optimisticUserParts[1] as Extract<PromptRequestPart, { type: 'agent' }>).source,
    );
    expect(
      (payload.requestParts[2] as Extract<PromptRequestPart, { type: 'subtask' }>).model,
    ).not.toBe(
      (payload.optimisticUserParts[2] as Extract<PromptRequestPart, { type: 'subtask' }>).model,
    );
  });
});

describe('OpenCodePromptRequestBuilder transport payloads', () => {
  const parts: PromptRequestPart[] = [{ type: 'text', text: 'Hello' }];

  it('builds SDK prompt parameters with shared prompt options and default model selection', () => {
    const { builder, host } = createBuilder();

    const parameters = builder.buildSdkPromptParameters('session-1', parts, {
      system: ' Return JSON only ',
      agent: ' title ',
      noReply: false,
      allowedTools: ['read', 'grep'],
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
    }, 'msg_1');

    expect(parameters).toEqual({
      sessionID: 'session-1',
      messageID: 'msg_1',
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
      variant: 'medium',
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

  it('maps variant into legacy stream request body', () => {
    const { builder } = createBuilder();

    const withVariant = builder.buildLegacyStreamRequestBody(parts, {
      variant: 'low',
    }, 'msg_enabled');
    const withoutVariant = builder.buildLegacyStreamRequestBody(parts, {}, 'msg_disabled');

    expect(withVariant).toEqual({
      messageID: 'msg_enabled',
      parts,
      model: {
        providerID: 'openai',
        modelID: 'gpt-5',
      },
      variant: 'low',
    });
    expect(withoutVariant).toEqual({
      messageID: 'msg_disabled',
      parts,
      model: {
        providerID: 'openai',
        modelID: 'gpt-5',
      },
    });
  });
});
