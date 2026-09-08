import type { ElicitationRequest } from '@anthropic-ai/claude-agent-sdk';
import type { UserDialogRequest } from '@anthropic-ai/claude-agent-sdk';

import {
  buildClaudeCodeElicitationContent,
  buildClaudeCodeElicitationQuestionRequest,
  buildClaudeCodeUserDialogQuestionRequest,
  buildClaudeCodeUserDialogResult,
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

describe('ClaudeCode user dialog bridge (SDK >= 0.3.2xx)', () => {
  const refusalRequest: UserDialogRequest = {
    dialogKind: 'refusal_fallback_prompt',
    payload: {
      originalModel: 'claude-opus-4-6',
      fallbackModel: 'claude-sonnet-4-6',
      guidanceText: 'The model refused this request.',
    },
  };

  it('builds a retry/edit question card for refusal_fallback_prompt', () => {
    const questionRequest = buildClaudeCodeUserDialogQuestionRequest(refusalRequest);
    expect(questionRequest.questions).toHaveLength(1);
    const question = questionRequest.questions[0];
    expect(question.question).toBe('The model refused this request.');
    expect(question.options.map((option) => option.label)).toEqual([
      'Retry with fallback model',
      'Edit prompt',
    ]);
    expect(question.options[0].description).toContain('claude-sonnet-4-6');
    expect(question.options[1].description).toContain('claude-opus-4-6');
  });

  it('falls back to a default question when guidanceText is absent', () => {
    const request: UserDialogRequest = {
      dialogKind: 'refusal_fallback_prompt',
      payload: { originalModel: 'a', fallbackModel: 'b' },
    };
    const questionRequest = buildClaudeCodeUserDialogQuestionRequest(request);
    expect(questionRequest.questions[0].question).toContain('refused');
  });

  it('builds a generic card for unknown dialog kinds', () => {
    const request: UserDialogRequest = {
      dialogKind: 'fable_overage_consent_prompt',
      payload: {},
    };
    const questionRequest = buildClaudeCodeUserDialogQuestionRequest(request);
    expect(questionRequest.questions[0].question).toContain('fable_overage_consent_prompt');
  });

  it('maps accepted answers to the CLI retry_fallback/edit_prompt enum', () => {
    expect(buildClaudeCodeUserDialogResult('refusal_fallback_prompt', {
      action: 'accept',
      answers: [['Retry with fallback model']],
    })).toEqual({ behavior: 'completed', result: 'retry_fallback' });

    expect(buildClaudeCodeUserDialogResult('refusal_fallback_prompt', {
      action: 'accept',
      answers: [['Edit prompt']],
    })).toEqual({ behavior: 'completed', result: 'edit_prompt' });
  });

  it('maps cancel, decline, null, and unknown answers to cancelled (CLI default behavior)', () => {
    expect(buildClaudeCodeUserDialogResult('refusal_fallback_prompt', null))
      .toEqual({ behavior: 'cancelled' });
    expect(buildClaudeCodeUserDialogResult('refusal_fallback_prompt', {
      action: 'decline',
      answers: [['Retry with fallback model']],
    })).toEqual({ behavior: 'cancelled' });
    expect(buildClaudeCodeUserDialogResult('refusal_fallback_prompt', {
      action: 'accept',
      answers: [['Something else']],
    })).toEqual({ behavior: 'cancelled' });
    expect(buildClaudeCodeUserDialogResult('fable_overage_consent_prompt', {
      action: 'accept',
      answers: [['Continue with default']],
    })).toEqual({ behavior: 'cancelled' });
  });
});
