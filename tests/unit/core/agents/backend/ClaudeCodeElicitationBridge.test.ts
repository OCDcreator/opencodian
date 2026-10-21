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

// MATRIX014: synthetic-only controls. These module mocks never delegate a product operation.
const mockMatrix014Attempts: Record<string, number> = { child: 0, fs: 0, sdk: 0, network: 0 };
jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  ...Object.fromEntries(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.child++; throw new Error('MATRIX014 blocked child operation'); })])),
}));
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  ...Object.fromEntries(['readFile', 'readFileSync', 'readdir', 'readdirSync', 'existsSync', 'stat', 'statSync', 'realpathSync', 'writeFile', 'writeFileSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'unlinkSync', 'open', 'openSync'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])),
}));
jest.mock('node:fs/promises', () => Object.fromEntries(['readFile', 'readdir', 'stat', 'access', 'writeFile', 'mkdir', 'mkdtemp', 'rm', 'unlink', 'open'].map(key => [key, jest.fn(async () => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])));
jest.mock('@openai/codex-sdk', () => ({ Codex: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked real SDK constructor'); }) }), { virtual: true });
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: jest.fn(() => { mockMatrix014Attempts.sdk++; throw new Error('MATRIX014 blocked SDK query'); }) }), { virtual: true });
jest.mock('node:http', () => ({ ...jest.requireActual('node:http'), request: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTP'); }), get: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTP'); }) }));
jest.mock('node:https', () => ({ ...jest.requireActual('node:https'), request: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTPS'); }), get: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked HTTPS'); }) }));
jest.mock('node:net', () => ({ ...jest.requireActual('node:net'), connect: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked net'); }), createConnection: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked net'); }) }));
jest.mock('node:tls', () => ({ ...jest.requireActual('node:tls'), connect: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked TLS'); }) }));
jest.mock('obsidian', () => ({ ...jest.requireActual('../../../../../tests/__mocks__/obsidian'), requestUrl: jest.fn(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked requestUrl'); }) }));
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  ...Object.fromEntries(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.child++; throw new Error('MATRIX014 blocked child operation'); })])),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  ...Object.fromEntries(['readFile', 'readFileSync', 'readdir', 'readdirSync', 'existsSync', 'stat', 'statSync', 'realpathSync', 'writeFile', 'writeFileSync', 'mkdirSync', 'mkdtempSync', 'rmSync', 'unlinkSync', 'open', 'openSync'].map(key => [key, jest.fn(() => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])),
}));
jest.mock('fs/promises', () => Object.fromEntries(['readFile', 'readdir', 'stat', 'access', 'writeFile', 'mkdir', 'mkdtemp', 'rm', 'unlink', 'open'].map(key => [key, jest.fn(async () => { mockMatrix014Attempts.fs++; throw new Error('MATRIX014 blocked product filesystem operation'); })])));

/* eslint-disable jest/no-conditional-expect, complexity -- This finite it.each driver selects named schema partitions; every registered scenario runs assertions. Keep the frozen per-partition fail-closed oracles unchanged. */
describe('MATRIX014 Claude pure source builders', () => {
  beforeEach(() => {
    if (typeof globalThis.fetch === 'function') jest.spyOn(globalThis, 'fetch').mockImplementation(async () => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked fetch'); });
    jest.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => { mockMatrix014Attempts.network++; throw new Error('MATRIX014 blocked XHR'); });
  });
  let actual: Record<string, unknown>;
  beforeEach(() => { actual = {}; jest.spyOn(Date, 'now').mockReturnValue(140014); jest.spyOn(window, 'open').mockImplementation(() => null); });
  afterEach(() => {
    actual.layers = { hostCallbacks: null, pendingRequests: null, SDKCallbacks: null, nativeReplies: null, providerHTTP: null, realWindowOpenAdmissions: 0, windowOpenAttempts: (window.open as jest.Mock).mock.calls.length, attempts: { ...mockMatrix014Attempts } };
    console.warn('MATRIX014_ACTUAL '+JSON.stringify({ fullName: expect.getState().currentTestName, actual })); jest.restoreAllMocks();
  });
  it('MATRIX014 CLAUDE-ELICITATION SMOKE-003', () => {
    const source: ElicitationRequest = { serverName: 'FAKE_MATRIX014_server', message: 'FAKE_MATRIX014_prompt', mode: 'form', requestedSchema: { type: 'object', properties: {} } }; const request = buildClaudeCodeElicitationQuestionRequest(source); actual.rawInput = source; actual.card = request;
    expect(request.questions[0].options.map(option => option.label)).toEqual(['Accept', 'Decline']); expect(mockMatrix014Attempts).toEqual({ child: 0, fs: 0, sdk: 0, network: 0 });
  });
  it.each([
    {"id": "CLAUDE-ELICITATION-SCENARIO-001", "propertyType": "string", "schemaShape": "properties", "resolution": "accept"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-002", "propertyType": "string", "schemaShape": "empty-properties", "resolution": "decline"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-003", "propertyType": "string", "schemaShape": "malformed-properties", "resolution": "cancel"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-004", "propertyType": "number", "schemaShape": "properties", "resolution": "decline"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-005", "propertyType": "number", "schemaShape": "empty-properties", "resolution": "accept"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-006", "propertyType": "integer", "schemaShape": "properties", "resolution": "cancel"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-007", "propertyType": "integer", "schemaShape": "malformed-properties", "resolution": "accept"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-008", "propertyType": "boolean", "schemaShape": "empty-properties", "resolution": "cancel"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-009", "propertyType": "boolean", "schemaShape": "malformed-properties", "resolution": "decline"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-010", "propertyType": "number", "schemaShape": "malformed-properties", "resolution": "cancel"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-011", "propertyType": "integer", "schemaShape": "empty-properties", "resolution": "decline"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-012", "propertyType": "boolean", "schemaShape": "properties", "resolution": "accept"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-013", "propertyType": "array", "schemaShape": "properties", "resolution": "accept"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-014", "propertyType": "array", "schemaShape": "empty-properties", "resolution": "decline"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-015", "propertyType": "array", "schemaShape": "malformed-properties", "resolution": "cancel"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-016", "propertyType": "unknown", "schemaShape": "properties", "resolution": "accept"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-017", "propertyType": "unknown", "schemaShape": "empty-properties", "resolution": "decline"},
    {"id": "CLAUDE-ELICITATION-SCENARIO-018", "propertyType": "unknown", "schemaShape": "malformed-properties", "resolution": "cancel"},
  ])('MATRIX014 CLAUDE-ELICITATION $id', ({ propertyType, schemaShape, resolution }) => {
    const enumValues = propertyType === 'string' || propertyType === 'array' ? ['red', 'blue'] : undefined;
    const properties = schemaShape === 'empty-properties' ? {} : schemaShape === 'malformed-properties' ? 'FAKE_MATRIX014_malformed' : { value: { type: propertyType === 'unknown' ? 'object' : propertyType, title: 'Value', ...(enumValues ? { enum: enumValues } : {}) } };
    const source: ElicitationRequest = { serverName: 'FAKE_MATRIX014_server', message: 'FAKE_MATRIX014_prompt', mode: 'form', elicitationId: 'FAKE_MATRIX014_elicitation', title: 'Form title', displayName: 'Display', description: 'FAKE_MATRIX014_description', requestedSchema: { type: 'object', properties } }; actual.rawInput = source; actual.resolutionAxis = { scheduled: resolution, observed: null, reason: 'pure builder has no callback resolution' };
    let request: ReturnType<typeof buildClaudeCodeElicitationQuestionRequest> | null = null; let error: string | null = null; try { request = buildClaudeCodeElicitationQuestionRequest(source); } catch (caught) { error = String(caught); } actual.card = request; actual.error = error;
    if (schemaShape === 'malformed-properties' || (schemaShape === 'properties' && propertyType === 'unknown')) { expect(request).toBeNull(); return; }
    expect(error).toBeNull();
    const answers = schemaShape === 'empty-properties' ? [[resolution === 'decline' ? 'Decline' : 'Accept']] : propertyType === 'array' ? [['red', 'blue']] : [[propertyType === 'number' ? '2.5' : propertyType === 'integer' ? '7' : propertyType === 'boolean' ? 'yes' : 'red']];
    const content = buildClaudeCodeElicitationContent(request!, answers, source); const normalized = normalizeClaudeCodeElicitationContent({ ...content, invalidObject: { forbidden: true }, invalidArray: ['red', 1] }); actual.answersBeforeMutation = JSON.parse(JSON.stringify(answers)); actual.content = content; actual.normalizedContent = normalized;
    if (schemaShape === 'empty-properties') { expect(request).toEqual({ id: 'FAKE_MATRIX014_elicitation', sessionId: 'claude-code', questions: [{ question: 'FAKE_MATRIX014_prompt', header: 'Form title', options: [{ label: 'Accept', description: 'FAKE_MATRIX014_description' }, { label: 'Decline', description: '' }], multiple: false, custom: true }] }); expect(content).toEqual(resolution === 'decline' ? {} : { FAKE_MATRIX014_prompt: 'Accept' }); }
    else { expect(request).toEqual({ id: 'FAKE_MATRIX014_elicitation', sessionId: 'claude-code', questions: [{ question: 'value', header: 'Value', options: enumValues ? [{ label: 'red', description: '' }, { label: 'blue', description: '' }] : [], multiple: propertyType === 'array', custom: true }] }); expect(content).toEqual({ value: propertyType === 'number' ? 2.5 : propertyType === 'integer' ? 7 : propertyType === 'boolean' ? true : propertyType === 'array' ? ['red', 'blue'] : 'red' }); }
    expect(normalized).toEqual(content);
    if (propertyType === 'array' && schemaShape === 'properties') { answers[0].push('mutated'); actual.answersAfterMutation = answers; expect(content.value).toEqual(['red', 'blue']); expect(content.value).not.toBe(answers[0]); }
  });
  it.each([
    {"id": "CLAUDE-DIALOG-SCENARIO-001", "dialogKind": "refusal_fallback_prompt", "declared": "declared", "answer": "retry-fallback"},
    {"id": "CLAUDE-DIALOG-SCENARIO-002", "dialogKind": "refusal_fallback_prompt", "declared": "undeclared", "answer": "edit-prompt"},
    {"id": "CLAUDE-DIALOG-SCENARIO-003", "dialogKind": "unknown-kind", "declared": "declared", "answer": "edit-prompt"},
    {"id": "CLAUDE-DIALOG-SCENARIO-004", "dialogKind": "unknown-kind", "declared": "undeclared", "answer": "retry-fallback"},
    {"id": "CLAUDE-DIALOG-SCENARIO-005", "dialogKind": "refusal_fallback_prompt", "declared": "declared", "answer": "cancel"},
    {"id": "CLAUDE-DIALOG-SCENARIO-006", "dialogKind": "unknown-kind", "declared": "undeclared", "answer": "cancel"},
  ])('MATRIX014 CLAUDE-DIALOG $id', ({ dialogKind, declared, answer }) => {
    const source: UserDialogRequest = { dialogKind, toolUseID: 'FAKE_MATRIX014_tool', payload: { originalModel: 'FAKE_MATRIX014_original', fallbackModel: 'FAKE_MATRIX014_fallback', guidanceText: 'FAKE_MATRIX014_guidance' } }; const request = buildClaudeCodeUserDialogQuestionRequest(source);
    const response = answer === 'cancel' ? { action: 'cancel' as const } : { action: 'accept' as const, answers: [[answer === 'retry-fallback' ? 'Retry with fallback model' : 'Edit prompt']] }; const reply = buildClaudeCodeUserDialogResult(dialogKind, response); actual.rawInput = source; actual.card = request; actual.response = response; actual.reply = reply; actual.declaredAxis = { scheduled: declared, observed: null, reason: 'pure SDK builder cannot observe CLI capability declaration/negotiation' };
    expect(reply).toEqual(dialogKind === 'refusal_fallback_prompt' && answer !== 'cancel' ? { behavior: 'completed', result: answer === 'retry-fallback' ? 'retry_fallback' : 'edit_prompt' } : { behavior: 'cancelled' });
    if (dialogKind === 'refusal_fallback_prompt') { expect(request).toEqual({ id: 'claude-user-dialog-FAKE_MATRIX014_tool', sessionId: 'claude-code', questions: [{ question: 'FAKE_MATRIX014_guidance', header: 'Claude needs your input', options: [{ label: 'Retry with fallback model', description: 'Retry the refused turn on FAKE_MATRIX014_fallback' }, { label: 'Edit prompt', description: 'Stop and edit your prompt (was on FAKE_MATRIX014_original)' }], multiple: false, custom: false }] }); }
    else { expect(request.questions[0].options).toEqual([{ label: 'Continue with default', description: '' }]); expect(request.id).toBe('claude-user-dialog-unknown-kind-140014'); }
  });
  it('MATRIX014 CLAUDE-ELICITATION SUPPLEMENT-NONFINITE-RAW', () => {
    const source: ElicitationRequest = { serverName: 'FAKE_MATRIX014_server', message: 'FAKE_MATRIX014_prompt', requestedSchema: { type: 'object', properties: { number: { type: 'number' }, integer: { type: 'integer' } } } }; const request = buildClaudeCodeElicitationQuestionRequest(source); const content = buildClaudeCodeElicitationContent(request, [['Infinity'], ['NaN']], source); actual.rawInput = source; actual.card = request; actual.answers = [['Infinity'], ['NaN']]; actual.content = content; actual.nativeSchemaValidation = 'not observed; source coercion retains raw strings';
    expect(content).toEqual({ number: 'Infinity', integer: 'NaN' });
  });
  it('MATRIX014 CLAUDE-ELICITATION SUPPLEMENT-NULL-ARRAY-SCHEMA', () => {
    const inputs = [{ properties: null }, { properties: [] }, { properties: { value: null } }]; const observations: unknown[] = [];
    for (const requestedSchema of inputs) { const source: ElicitationRequest = { serverName: 'FAKE_MATRIX014_server', message: 'FAKE_MATRIX014_prompt', requestedSchema }; let request: ReturnType<typeof buildClaudeCodeElicitationQuestionRequest> | null = null; let error: string | null = null; try { request = buildClaudeCodeElicitationQuestionRequest(source); } catch (caught) { error = String(caught); } observations.push({ rawInput: source, card: request, error }); }
    actual.observations = observations; expect(observations).toEqual(inputs.map(requestedSchema => expect.objectContaining({ rawInput: expect.objectContaining({ requestedSchema }), card: null })));
  });
  it('MATRIX014 CLAUDE-DIALOG SUPPLEMENT-SAFE-ANSWERS', () => {
    const responses = [null, { action: 'decline' as const }, { action: 'accept' as const, answers: [['FAKE_MATRIX014_unknown']] }]; const replies = responses.map(response => buildClaudeCodeUserDialogResult('refusal_fallback_prompt', response)); actual.responses = responses; actual.replies = replies;
    expect(replies).toEqual([{ behavior: 'cancelled' }, { behavior: 'cancelled' }, { behavior: 'cancelled' }]);
  });
  it('MATRIX014 CLAUDE-DIALOG SUPPLEMENT-MISSING-PAYLOAD', () => {
    const source = { dialogKind: 'refusal_fallback_prompt' } as unknown as UserDialogRequest; const request = buildClaudeCodeUserDialogQuestionRequest(source); actual.rawInput = source; actual.card = request;
    expect(request.questions[0]).toEqual({ question: 'The model refused to answer. How should Claude continue?', header: 'Claude needs your input', options: [{ label: 'Retry with fallback model', description: 'Retry the refused turn on the fallback model' }, { label: 'Edit prompt', description: 'Stop and edit your prompt' }], multiple: false, custom: false });
  });
});

/* eslint-enable jest/no-conditional-expect, complexity */
