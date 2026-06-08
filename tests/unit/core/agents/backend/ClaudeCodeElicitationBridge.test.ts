import type { ElicitationRequest } from '@anthropic-ai/claude-agent-sdk';

import {
  buildClaudeCodeElicitationContent,
  buildClaudeCodeElicitationQuestionRequest,
  normalizeClaudeCodeElicitationContent,
} from '../../../../../src/core/agents/backend';

describe('ClaudeCodeElicitationBridge', () => {
  it('maps an MCP form elicitation schema to shared question prompts', () => {
    const request: ElicitationRequest = {
      serverName: 'github',
      message: 'Choose repository access',
      mode: 'form',
      elicitationId: 'elicitation-1',
      title: 'Repository Access',
      displayName: 'GitHub',
      requestedSchema: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            title: 'Scope',
            enum: ['Read only', 'Read write'],
          },
          labels: {
            type: 'array',
            title: 'Labels',
            enum: ['bug', 'feature'],
          },
          notes: {
            type: 'string',
            title: 'Notes',
          },
          priority: {
            type: 'number',
            title: 'Priority',
          },
          enabled: {
            type: 'boolean',
            title: 'Enabled',
          },
        },
      },
    };

    expect(buildClaudeCodeElicitationQuestionRequest(request)).toEqual({
      id: 'elicitation-1',
      sessionId: 'claude-code',
      questions: [{
        question: 'scope',
        header: 'Scope',
        options: [
          { label: 'Read only', description: '' },
          { label: 'Read write', description: '' },
        ],
        multiple: false,
        custom: true,
      }, {
        question: 'labels',
        header: 'Labels',
        options: [
          { label: 'bug', description: '' },
          { label: 'feature', description: '' },
        ],
        multiple: true,
        custom: true,
      }, {
        question: 'notes',
        header: 'Notes',
        options: [],
        multiple: false,
        custom: true,
      }, {
        question: 'priority',
        header: 'Priority',
        options: [],
        multiple: false,
        custom: true,
      }, {
        question: 'enabled',
        header: 'Enabled',
        options: [],
        multiple: false,
        custom: true,
      }],
    });
  });

  it('maps URL or schema-less MCP elicitations to accept/decline prompts with URL preview', () => {
    const request: ElicitationRequest = {
      serverName: 'linear',
      message: 'Authenticate Linear MCP?',
      mode: 'url',
      url: 'https://linear.example/oauth',
      displayName: 'Linear',
      description: 'Required to read issue metadata.',
    };

    expect(buildClaudeCodeElicitationQuestionRequest(request)).toEqual({
      id: expect.stringMatching(/^claude-elicitation-/),
      sessionId: 'claude-code',
      questions: [{
        question: 'Authenticate Linear MCP?',
        header: 'Linear',
        options: [
          {
            label: 'Accept',
            description: 'Required to read issue metadata.',
            preview: 'https://linear.example/oauth',
          },
          { label: 'Decline', description: '' },
        ],
        multiple: false,
        custom: true,
      }],
    });
  });

  it('builds MCP elicitation content from accepted shared question answers', () => {
    const source: ElicitationRequest = {
      serverName: 'github',
      message: 'Choose repository access',
      mode: 'form',
      elicitationId: 'elicitation-1',
      requestedSchema: {
        properties: {
          scope: { type: 'string', enum: ['Read only', 'Read write'] },
          labels: { type: 'array', enum: ['bug', 'feature'] },
          notes: { type: 'string' },
          priority: { type: 'number' },
          enabled: { type: 'boolean' },
        },
      },
    };
    const request = buildClaudeCodeElicitationQuestionRequest(source);

    expect(buildClaudeCodeElicitationContent(
      request,
      [['Read write'], ['bug', 'feature'], ['Needs review'], ['3'], ['true']],
      source,
    ))
      .toEqual({
        scope: 'Read write',
        labels: ['bug', 'feature'],
        notes: 'Needs review',
        priority: 3,
        enabled: true,
      });
  });

  it('keeps only MCP-safe primitive content values from renderer overrides', () => {
    expect(normalizeClaudeCodeElicitationContent({
      name: 'Codex',
      count: 3,
      enabled: true,
      labels: ['a', 'b'],
      nested: { unsafe: true },
      mixed: ['a', 2],
    })).toEqual({
      name: 'Codex',
      count: 3,
      enabled: true,
      labels: ['a', 'b'],
    });
  });
});
