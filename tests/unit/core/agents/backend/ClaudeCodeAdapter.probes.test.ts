/* eslint-disable max-lines -- Probe test file accumulates focused tests for each readback/pass diagnostic surface. */
import {
  ClaudeCodeAdapter,
  type ClaudeCodeSdkFacade,
} from '../../../../../src/core/agents/backend';
import { ClaudeCodeStreamNormalizer } from '../../../../../src/core/agents/backend/ClaudeCodeStreamNormalizer';
import { getDefaultClaudeCodeBackendSettings } from '../../../../../src/core/types';

/**
 * Helper: create a mock SDK whose query() yields the given messages.
 * Messages use the real SDK shape so ClaudeCodeStreamNormalizer produces
 * correct text/session chunks.
 */
function createProbeSdk(messages: unknown[]): ClaudeCodeSdkFacade & {
  query: jest.Mock;
  getSessionInfo: jest.Mock;
} {
  return {
    query: jest.fn(() => Object.assign((async function* () {
      for (const message of messages) {
        yield message;
      }
    })(), {
      close: jest.fn(),
    })),
    getSessionInfo: jest.fn((_sessionId: string) =>
      Promise.resolve({
        sessionId: _sessionId,
        summary: 'probe-session',
        lastModified: Date.now(),
      }),
    ),
  } as unknown as ClaudeCodeSdkFacade & { query: jest.Mock; getSessionInfo: jest.Mock };
}

/**
 * Real SDK-shaped assistant message with text content and session_id.
 * The normalizer will generate a text chunk from `content[0].text`
 * and `resolveDiagnosticSessionId` will find `session_id`.
 */
function assistantMessage(sessionId: string, text: string) {
  return {
    type: 'assistant',
    session_id: sessionId,
    content: [{ type: 'text', text }],
  };
}

/** Real SDK-shaped result terminator. */
function resultMessage(sessionId: string) {
  return { type: 'result', subtype: 'success', session_id: sessionId };
}

/**
 * Helper: create a mock SDK whose query() invokes options.stderr if provided.
 */
function createStderrEmittingSdk(
  messages: unknown[],
  stderrText?: string,
): ClaudeCodeSdkFacade & { query: jest.Mock; getSessionInfo: jest.Mock } {
  return {
    query: jest.fn((input: { options?: { stderr?: (data: string) => void } }) => {
      if (input.options?.stderr && stderrText !== undefined) {
        input.options.stderr(stderrText);
      }
      return Object.assign((async function* () {
        for (const message of messages) {
          yield message;
        }
      })(), {
        close: jest.fn(),
      });
    }),
    getSessionInfo: jest.fn((_sessionId: string) =>
      Promise.resolve({
        sessionId: _sessionId,
        summary: 'probe-session',
        lastModified: Date.now(),
      }),
    ),
  } as unknown as ClaudeCodeSdkFacade & { query: jest.Mock; getSessionInfo: jest.Mock };
}

describe('ClaudeCodeStreamNormalizer assistant message', () => {
  it('generates text chunks from assistant content blocks', () => {
    const normalizer = new ClaudeCodeStreamNormalizer();
    const message = {
      type: 'assistant',
      session_id: 'test-session',
      content: [{ type: 'text', text: 'hello world' }],
    };
    const chunks = normalizer.transformSDKMessage(message);
    expect(chunks.some((c) => c.type === 'text' && c.content === 'hello world')).toBe(true);
  });
});

describe('runStderrDiagnosticProbe', () => {
  it('returns readback when callback is wired and stderr is captured', async () => {
    const sdk = createStderrEmittingSdk([
      assistantMessage('probe-session', 'ok'),
      resultMessage('probe-session'),
    ], 'stderr probe test output');
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runStderrDiagnosticProbe();

    expect(result.classification).toBe('readback');
    expect(result.callbackWired).toBe(true);
    expect(result.isolatedDiagnosticOnly).toBe(true);
    expect(result.chunksReceived).toBe(1);
    expect(result.totalBytes).toBe('stderr probe test output'.length);
    expect(result.sanitizedPreview).toBe('stderr probe test output');
  });

  it('returns readback with no-stderr-observed when callback is wired but no stderr emitted', async () => {
    const sdk = createProbeSdk([
      assistantMessage('probe-session', 'ok'),
      resultMessage('probe-session'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runStderrDiagnosticProbe();

    expect(result.classification).toBe('readback');
    expect(result.callbackWired).toBe(true);
    expect(result.isolatedDiagnosticOnly).toBe(true);
    expect(result.chunksReceived).toBe(0);
    expect(result.totalBytes).toBe(0);
    expect(result.sanitizedPreview).toBe('Callback wired — no stderr observed');
  });

  it('returns fail on thrown error', async () => {
    const sdk = createProbeSdk([]);
    sdk.query.mockImplementation(() => {
      throw new Error('query failed');
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runStderrDiagnosticProbe();

    expect(result.classification).toBe('fail');
    expect(result.error).toContain('query failed');
  });

  it('sanitizes stderr text before preview', async () => {
    const secretText = 'api_key=sk-ant-api03-secret123';
    const sdk = createStderrEmittingSdk([
      assistantMessage('probe-session', 'ok'),
      resultMessage('probe-session'),
    ], secretText);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runStderrDiagnosticProbe();

    expect(result.classification).toBe('readback');
    expect(result.callbackWired).toBe(true);
    expect(result.chunksReceived).toBe(1);
    expect(result.sanitizedPreview).toContain('[REDACTED]');
    expect(result.sanitizedPreview).not.toContain('secret123');
  });

  it('aggressively truncates long stderr to 240 chars', async () => {
    const longText = 'x'.repeat(500);
    const sdk = createStderrEmittingSdk([
      assistantMessage('probe-session', 'ok'),
      resultMessage('probe-session'),
    ], longText);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runStderrDiagnosticProbe();

    expect(result.classification).toBe('readback');
    expect(result.callbackWired).toBe(true);
    expect(result.chunksReceived).toBe(1);
    expect(result.totalBytes).toBe(500);
    expect(result.sanitizedPreview!.length).toBeLessThanOrEqual(240);
  });

  it('sanitizes before truncation to prevent secret leakage at truncation boundary', async () => {
    const prefix = 'a'.repeat(220);
    const secret = 'api_key=sk-ant-api03-leaky-boundary-value-here';
    const suffix = 'b'.repeat(100);
    const text = prefix + secret + suffix;

    const sdk = createStderrEmittingSdk([
      assistantMessage('probe-session', 'ok'),
      resultMessage('probe-session'),
    ], text);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runStderrDiagnosticProbe();

    expect(result.classification).toBe('readback');
    expect(result.sanitizedPreview).not.toContain('leaky-boundary-value');
    expect(result.sanitizedPreview).toContain('[REDACTED]');
  });

  it('proves _diagnosticStderrCallback reaches built SDK options', async () => {
    const stderrText = 'diagnostic stderr wiring test';
    const sdk = createStderrEmittingSdk([
      assistantMessage('probe-session', 'ok'),
      resultMessage('probe-session'),
    ], stderrText);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    await adapter.runStderrDiagnosticProbe();
    // inspectLastDiagnosticSdkOptions uses structuredClone which strips functions,
    // so access the raw internal property to verify the callback was wired.
    const rawOptions = (adapter as unknown as { lastDiagnosticSdkOptions?: { stderr?: unknown } }).lastDiagnosticSdkOptions;

    expect(rawOptions).toBeDefined();
    expect(typeof rawOptions!.stderr).toBe('function');
  });
});

describe('runPromptSuggestionsReadbackProbe', () => {
  it('returns readback when option is wired and no explicit model is configured', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        promptSuggestions: true,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runPromptSuggestionsReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.optionValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.modelState).toBe('unknown');
    expect(result.blockerNote).toBeUndefined();
  });

  it('returns readback with blocker note when using non-Claude model', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        promptSuggestions: true,
        model: 'deepseek-v4-pro',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runPromptSuggestionsReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.modelState).toBe('non-claude');
    expect(result.blockerNote).toContain('non-Claude');
  });

  it('returns readback when promptSuggestions is disabled', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        promptSuggestions: false,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runPromptSuggestionsReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.optionValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.modelState).toBe('unknown');
  });

  it('returns fail when promptSuggestions is enabled but SDK option is missing', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        promptSuggestions: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      promptSuggestions: undefined,
    });

    const result = await adapter.runPromptSuggestionsReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.optionValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.modelState).toBe('unknown');
    expect(result.error).toContain('promptSuggestions');
  });

  it('returns fail when promptSuggestions is disabled but SDK option is present', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        promptSuggestions: false,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      promptSuggestions: true,
    });

    const result = await adapter.runPromptSuggestionsReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.optionValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.modelState).toBe('unknown');
    expect(result.error).toContain('promptSuggestions');
  });

  it('returns fail on thrown error', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockImplementation(() => {
      throw new Error('build failed');
    });

    const result = await adapter.runPromptSuggestionsReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.error).toContain('build failed');
  });
});

describe('runSystemPromptReadbackProbe', () => {
  it('returns readback with default preset when systemPrompt is empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        systemPrompt: '',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runSystemPromptReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.emptySetting).toBe(true);
    expect(result.presetPreserved).toBe(true);
    expect(result.appendValue).toBeUndefined();
    expect(result.appendMatch).toBe(true);
  });

  it('returns readback with preset-and-append when systemPrompt is non-empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        systemPrompt: 'Be concise. Use bullet points.',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runSystemPromptReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.emptySetting).toBe(false);
    expect(result.presetPreserved).toBe(true);
    expect(result.appendValue).toBe('Be concise. Use bullet points.');
    expect(result.expectedAppendValue).toBe('Be concise. Use bullet points.');
    expect(result.appendMatch).toBe(true);
  });

  it('returns readback with trimmed append value when systemPrompt has surrounding whitespace', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        systemPrompt: '  Be concise.  ',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runSystemPromptReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.emptySetting).toBe(false);
    expect(result.presetPreserved).toBe(true);
    expect(result.appendValue).toBe('Be concise.');
    expect(result.expectedAppendValue).toBe('Be concise.');
    expect(result.appendMatch).toBe(true);
  });
});

describe('runCustomSessionIdProbe', () => {
  it('returns pass when session id matches', async () => {
    const targetId = 'test-session-id-123';
    const sdk = createProbeSdk([
      assistantMessage(targetId, 'ok'),
      resultMessage(targetId),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runCustomSessionIdProbe(targetId);

    expect(result.classification).toBe('pass');
    expect(result.returnedSessionId).toBe(targetId);
  });

  it('returns fail when session id mismatches', async () => {
    const sdk = createProbeSdk([
      assistantMessage('different-id', 'ok'),
      resultMessage('different-id'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runCustomSessionIdProbe('expected-id');

    expect(result.classification).toBe('fail');
    expect(result.returnedSessionId).toBe('different-id');
  });
});

describe('runSessionTitleProbe', () => {
  it('returns pass when customTitle matches', async () => {
    const title = 'Test Diagnostic Title';
    const sessionId = 'session-123';
    const sdk = createProbeSdk([
      assistantMessage(sessionId, 'ok'),
      resultMessage(sessionId),
    ]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId,
      summary: 'test',
      lastModified: Date.now(),
      customTitle: title,
    });

    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runSessionTitleProbe(title);

    expect(result.classification).toBe('pass');
    expect(result.customTitle).toBe(title);
  });

  it('returns fail when customTitle mismatches', async () => {
    const title = 'Test Diagnostic Title';
    const sessionId = 'session-123';
    const sdk = createProbeSdk([
      assistantMessage(sessionId, 'ok'),
      resultMessage(sessionId),
    ]);
    sdk.getSessionInfo.mockResolvedValue({
      sessionId,
      summary: 'test',
      lastModified: Date.now(),
      customTitle: 'Different Title',
    });

    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runSessionTitleProbe(title);

    expect(result.classification).toBe('fail');
    expect(result.customTitle).toBe('Different Title');
  });
});

describe('runForkSessionProbe', () => {
  it('returns pass when session ids differ and nonce is recalled', async () => {
    let callIndex = 0;
    const sdk = createProbeSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    // Mock Math.random to get deterministic nonce
    const realRandom = Math.random;
    Math.random = () => 0.123456789;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    sdk.query.mockImplementation(() => {
      callIndex++;
      return Object.assign((async function* () {
        if (callIndex === 1) {
          yield assistantMessage('seed-session', 'seed ok');
          yield resultMessage('seed-session');
        } else {
          yield assistantMessage('forked-session', `recall ${expectedNonce}`);
          yield resultMessage('forked-session');
        }
      })(), { close: jest.fn() });
    });

    const result = await adapter.runForkSessionProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('pass');
    expect(result.sessionIdsDiffer).toBe(true);
    expect(result.nonceRecalled).toBe(true);
  });

  it('returns fail when session ids match (no fork occurred)', async () => {
    let callIndex = 0;
    const sdk = createProbeSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const realRandom = Math.random;
    Math.random = () => 0.123456789;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    sdk.query.mockImplementation(() => {
      callIndex++;
      return Object.assign((async function* () {
        const sessionId = 'same-session';
        if (callIndex === 1) {
          yield assistantMessage(sessionId, 'seed ok');
          yield resultMessage(sessionId);
        } else {
          yield assistantMessage(sessionId, `recall ${expectedNonce}`);
          yield resultMessage(sessionId);
        }
      })(), { close: jest.fn() });
    });

    const result = await adapter.runForkSessionProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('fail');
    expect(result.sessionIdsDiffer).toBe(false);
  });
});

describe('runContinueProbe', () => {
  it('returns pass when session ids match and nonce is recalled', async () => {
    let callIndex = 0;
    const sdk = createProbeSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const realRandom = Math.random;
    Math.random = () => 0.987654321;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    sdk.query.mockImplementation(() => {
      callIndex++;
      return Object.assign((async function* () {
        if (callIndex === 1) {
          yield assistantMessage('session-1', 'seed ok');
          yield resultMessage('session-1');
        } else {
          yield assistantMessage('session-1', `recall ok ${expectedNonce}`);
          yield resultMessage('session-1');
        }
      })(), { close: jest.fn() });
    });

    const result = await adapter.runContinueProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('pass');
    expect(result.sessionIdsMatch).toBe(true);
    expect(result.nonceRecalled).toBe(true);
  });

  it('returns fail when session ids mismatch', async () => {
    let callIndex = 0;
    const sdk = createProbeSdk([]);
    sdk.query.mockImplementation(() => {
      callIndex++;
      return Object.assign((async function* () {
        if (callIndex === 1) {
          yield assistantMessage('session-1', 'seed ok');
          yield resultMessage('session-1');
        } else {
          yield assistantMessage('session-2', 'different session');
          yield resultMessage('session-2');
        }
      })(), { close: jest.fn() });
    });

    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runContinueProbe();

    expect(result.classification).toBe('fail');
    expect(result.sessionIdsMatch).toBe(false);
  });
});

describe('runResumeSessionAtProbe', () => {
  it('returns pass when resumed at alpha and alpha is recalled', async () => {
    const alphaUuid = 'assistant-uuid-alpha';
    let callIndex = 0;
    const sdk = createProbeSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    // Deterministic nonces: alpha=0.1→nonce1, beta=0.2→nonce2
    const realRandom = Math.random;
    let randomCount = 0;
    Math.random = () => {
      randomCount++;
      return 0.1 * randomCount;
    };

    const alphaNonce = (0.1).toString(36).slice(2, 10);

    sdk.query.mockImplementation(() => {
      callIndex++;
      return Object.assign((async function* () {
        if (callIndex === 1) {
          yield { type: 'assistant', uuid: alphaUuid, session_id: 'session-1' };
          yield assistantMessage('session-1', 'alpha ok');
          yield resultMessage('session-1');
        } else if (callIndex === 2) {
          yield assistantMessage('session-1', 'beta ok');
          yield resultMessage('session-1');
        } else {
          yield assistantMessage('session-1', `The nonce was ${alphaNonce}`);
          yield resultMessage('session-1');
        }
      })(), { close: jest.fn() });
    });

    const result = await adapter.runResumeSessionAtProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('pass');
    expect(result.resumedAtAlpha).toBe(true);
    expect(result.alphaMessageUuid).toBe(alphaUuid);
  });

  it('returns fail when beta is recalled instead of alpha', async () => {
    const alphaUuid = 'assistant-uuid-alpha';
    let callIndex = 0;
    const sdk = createProbeSdk([]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const realRandom = Math.random;
    let randomCount = 0;
    Math.random = () => {
      randomCount++;
      return 0.1 * randomCount;
    };

    const betaNonce = (0.2).toString(36).slice(2, 10);

    sdk.query.mockImplementation(() => {
      callIndex++;
      return Object.assign((async function* () {
        if (callIndex === 1) {
          yield { type: 'assistant', uuid: alphaUuid, session_id: 'session-1' };
          yield assistantMessage('session-1', 'alpha ok');
          yield resultMessage('session-1');
        } else if (callIndex === 2) {
          yield assistantMessage('session-1', 'beta ok');
          yield resultMessage('session-1');
        } else {
          yield assistantMessage('session-1', `The nonce was ${betaNonce}`);
          yield resultMessage('session-1');
        }
      })(), { close: jest.fn() });
    });

    const result = await adapter.runResumeSessionAtProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('fail');
    expect(result.resumedAtAlpha).toBe(false);
  });
});

describe('runTaskBudgetReadbackProbe', () => {
  it('returns readback with no taskBudget option when setting is null', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        taskBudget: null,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runTaskBudgetReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBeNull();
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.sdkTotalValue).toBeUndefined();
    expect(result.totalMatch).toBe(true);
  });

  it('returns readback with taskBudget option when setting is a positive integer', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        taskBudget: 50000,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runTaskBudgetReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(50000);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkTotalValue).toBe(50000);
    expect(result.totalMatch).toBe(true);
  });

  it('returns fail when total value does not match setting', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        taskBudget: 50000,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      taskBudget: { total: 12345 },
    });

    const result = await adapter.runTaskBudgetReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(50000);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkTotalValue).toBe(12345);
    expect(result.totalMatch).toBe(false);
    expect(result.error).toContain('taskBudget is 50000 in settings but SDK options have total=12345');
  });
});

describe('runSandboxReadbackProbe', () => {
  it('returns readback with no sandbox option when sandbox is disabled', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        sandbox: { ...getDefaultClaudeCodeBackendSettings().sandbox, enabled: false },
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runSandboxReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingEnabled).toBe(false);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.enabledMatch).toBe(true);
    expect(result.failIfUnavailableMatch).toBe(true);
    expect(result.autoAllowBashIfSandboxedMatch).toBe(true);
  });

  it('returns readback with sandbox option when sandbox is enabled with sub-options', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        sandbox: {
          ...getDefaultClaudeCodeBackendSettings().sandbox,
          enabled: true,
          failIfUnavailable: true,
          autoAllowBashIfSandboxed: true,
        },
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runSandboxReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingEnabled).toBe(true);
    expect(result.settingFailIfUnavailable).toBe(true);
    expect(result.settingAutoAllowBashIfSandboxed).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkEnabled).toBe(true);
    expect(result.sdkFailIfUnavailable).toBe(true);
    expect(result.sdkAutoAllowBashIfSandboxed).toBe(true);
    expect(result.enabledMatch).toBe(true);
    expect(result.failIfUnavailableMatch).toBe(true);
    expect(result.autoAllowBashIfSandboxedMatch).toBe(true);
  });

  it('returns fail when sandbox enabled setting mismatches SDK options', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        sandbox: { ...getDefaultClaudeCodeBackendSettings().sandbox, enabled: true },
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      sandbox: { enabled: false },
    });

    const result = await adapter.runSandboxReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingEnabled).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkEnabled).toBe(false);
    expect(result.enabledMatch).toBe(false);
    expect(result.error).toContain('sandbox.enabled');
  });

  it('returns fail when sandbox is disabled but SDK options still include sandbox', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        sandbox: { ...getDefaultClaudeCodeBackendSettings().sandbox, enabled: false },
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      sandbox: { enabled: false },
    });

    const result = await adapter.runSandboxReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.enabledMatch).toBe(false);
    expect(result.error).toContain('sandbox.optionPresent=true');
  });

  it('returns fail when false sandbox sub-options are explicitly passed into SDK options', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        sandbox: { ...getDefaultClaudeCodeBackendSettings().sandbox, enabled: true },
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      sandbox: { enabled: true, failIfUnavailable: false, autoAllowBashIfSandboxed: false },
    });

    const result = await adapter.runSandboxReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.enabledMatch).toBe(true);
    expect(result.failIfUnavailableMatch).toBe(false);
    expect(result.autoAllowBashIfSandboxedMatch).toBe(false);
    expect(result.error).toContain('sandbox.failIfUnavailable=false→false');
    expect(result.error).toContain('sandbox.autoAllowBashIfSandboxed=false→false');
  });
});

describe('runPlanModeInstructionsReadbackProbe', () => {
  it('returns readback with planModeInstructions option when permissionMode is plan and setting is non-empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        permissionMode: 'plan',
        planModeInstructions: 'Use bullet points for all plans.',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runPlanModeInstructionsReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.permissionMode).toBe('plan');
    expect(result.settingValue).toBe('Use bullet points for all plans.');
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('Use bullet points for all plans.');
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with planModeInstructions option even when permissionMode is not plan (builder does not gate on permissionMode)', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        permissionMode: 'default',
        planModeInstructions: 'Use bullet points for all plans.',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runPlanModeInstructionsReadbackProbe();

    // The builder wires planModeInstructions whenever the trimmed setting is non-empty,
    // regardless of permissionMode. The probe verifies this current mapping behavior.
    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.permissionMode).toBe('default');
    expect(result.settingValue).toBe('Use bullet points for all plans.');
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('Use bullet points for all plans.');
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with no planModeInstructions option when permissionMode is plan but setting is empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        permissionMode: 'plan',
        planModeInstructions: '',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runPlanModeInstructionsReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.permissionMode).toBe('plan');
    expect(result.settingValue).toBe('');
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.sdkValue).toBeUndefined();
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with trimmed value when setting has surrounding whitespace', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        permissionMode: 'plan',
        planModeInstructions: '  Use bullet points.  ',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runPlanModeInstructionsReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('Use bullet points.');
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('Use bullet points.');
    expect(result.valueMatch).toBe(true);
  });

  it('returns fail when planModeInstructions value does not match setting', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        permissionMode: 'plan',
        planModeInstructions: 'Use bullet points.',
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      planModeInstructions: 'Different instructions.',
    });

    const result = await adapter.runPlanModeInstructionsReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.permissionMode).toBe('plan');
    expect(result.settingValue).toBe('Use bullet points.');
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('Different instructions.');
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('planModeInstructions');
  });

  it('returns fail when planModeInstructions is present but value mismatches setting', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        permissionMode: 'plan',
        planModeInstructions: 'Use bullet points.',
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      planModeInstructions: 'Different instructions.',
    });

    const result = await adapter.runPlanModeInstructionsReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.permissionMode).toBe('plan');
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('planModeInstructions');
  });
});

describe('runToolAliasesReadbackProbe', () => {
  it('returns readback with no toolAliases option when setting is empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        toolAliases: {},
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runToolAliasesReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingEmpty).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.entriesMatch).toBe(true);
  });

  it('returns readback with toolAliases option when setting has entries', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        toolAliases: { Fetch: 'Read', Search: 'Grep' },
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runToolAliasesReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingEmpty).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkEntryCount).toBe(2);
    expect(result.entriesMatch).toBe(true);
  });

  it('returns fail when toolAliases entries mismatch', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        toolAliases: { Fetch: 'Read' },
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      toolAliases: { Fetch: 'Write' },
    });

    const result = await adapter.runToolAliasesReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingEmpty).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.entriesMatch).toBe(false);
    expect(result.error).toContain('toolAliases');
  });

  it('returns fail when toolAliases is present but setting is empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        toolAliases: {},
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      toolAliases: { Fetch: 'Read' },
    });

    const result = await adapter.runToolAliasesReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingEmpty).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.entriesMatch).toBe(false);
    expect(result.error).toContain('toolAliases');
  });

  it('returns fail when SDK toolAliases shares the same object reference as settings', async () => {
    const sharedAliases = { Fetch: 'Read' };
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        toolAliases: sharedAliases,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      toolAliases: sharedAliases,
    });

    const result = await adapter.runToolAliasesReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingEmpty).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.entriesMatch).toBe(true);
    expect(result.defensiveCopyPreserved).toBe(false);
    expect(result.error).toContain('same object reference');
  });

  it('honestly states lifecycle applies to next query only', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        toolAliases: { Fetch: 'Read' },
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runToolAliasesReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    // readback means we do NOT claim alias resolution is behavior-verified
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.entriesMatch).toBe(true);
  });
});

describe('runDebugFileReadbackProbe', () => {
  it('returns readback with no debugFile option when setting is empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runDebugFileReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('');
    expect(result.emptySetting).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.sdkValue).toBeUndefined();
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with no debugFile option when setting is whitespace-only', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '   ',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runDebugFileReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('');
    expect(result.emptySetting).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.sdkValue).toBeUndefined();
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with debugFile option when setting is non-empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '/tmp/claude-debug.log',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runDebugFileReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('/tmp/claude-debug.log');
    expect(result.emptySetting).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('/tmp/claude-debug.log');
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with trimmed debugFile option when setting has surrounding whitespace', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '  /tmp/claude-debug.log  ',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runDebugFileReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('/tmp/claude-debug.log');
    expect(result.emptySetting).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('/tmp/claude-debug.log');
    expect(result.valueMatch).toBe(true);
  });

  it('returns fail when debugFile value does not match setting', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '/tmp/claude-debug.log',
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      debugFile: '/wrong/path.log',
    });

    const result = await adapter.runDebugFileReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe('/tmp/claude-debug.log');
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('/wrong/path.log');
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('debugFile');
  });

  it('returns fail when debugFile option is present but setting is empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debugFile: '',
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      debugFile: '/unexpected/path.log',
    });

    const result = await adapter.runDebugFileReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe('');
    expect(result.emptySetting).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('debugFile');
  });
});

describe('runDebugReadbackProbe', () => {
  it('returns readback with no debug option when setting is false', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debug: false,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runDebugReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with debug option true when setting is true', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debug: true,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runDebugReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(true);
    expect(result.valueMatch).toBe(true);
  });

  it('returns fail when debug is false but SDK option is present', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debug: false,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      debug: true,
    });

    const result = await adapter.runDebugReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(true);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('debug');
  });

  it('returns fail when debug is true but SDK option is missing', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debug: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      debug: undefined,
    });

    const result = await adapter.runDebugReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('debug');
  });

  it('returns fail when debug is true but SDK option is false', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debug: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      debug: false,
    });

    const result = await adapter.runDebugReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('debug');
  });

  it('returns fail on thrown error', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        debug: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockImplementation(() => {
      throw new Error('buildDiagnosticSdkOptions threw');
    });

    const result = await adapter.runDebugReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('buildDiagnosticSdkOptions threw');
  });
});

describe('runStrictMcpConfigReadbackProbe', () => {
  it('returns readback with no strictMcpConfig option when setting is false', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        strictMcpConfig: false,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runStrictMcpConfigReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with strictMcpConfig option true when setting is true', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        strictMcpConfig: true,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runStrictMcpConfigReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(true);
    expect(result.valueMatch).toBe(true);
  });

  it('returns fail when strictMcpConfig is false but SDK option is present', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        strictMcpConfig: false,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      strictMcpConfig: true,
    });

    const result = await adapter.runStrictMcpConfigReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(true);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('strictMcpConfig');
  });

  it('returns fail when strictMcpConfig is true but SDK option is missing', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        strictMcpConfig: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      strictMcpConfig: undefined,
    });

    const result = await adapter.runStrictMcpConfigReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('strictMcpConfig');
  });

  it('returns fail when strictMcpConfig is true but SDK option is false', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        strictMcpConfig: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      strictMcpConfig: false,
    });

    const result = await adapter.runStrictMcpConfigReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('strictMcpConfig');
  });

  it('returns fail on thrown error', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        strictMcpConfig: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockImplementation(() => {
      throw new Error('buildDiagnosticSdkOptions threw');
    });

    const result = await adapter.runStrictMcpConfigReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('buildDiagnosticSdkOptions threw');
  });
});

describe('runContext1mBetaReadbackProbe', () => {
  it('returns readback with no betas option when setting is false', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: false,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runContext1mBetaReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with betas option when setting is true', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: true,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runContext1mBetaReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toEqual(['context-1m-2025-08-07']);
    expect(result.valueMatch).toBe(true);
  });

  it('returns fail when enableContext1mBeta is false but SDK option is present', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: false,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      betas: ['context-1m-2025-08-07'],
    });

    const result = await adapter.runContext1mBetaReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toEqual(['context-1m-2025-08-07']);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('betas');
  });

  it('returns fail when enableContext1mBeta is true but SDK option is missing', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      betas: undefined,
    });

    const result = await adapter.runContext1mBetaReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('betas');
  });

  it('returns fail when enableContext1mBeta is true but SDK option has wrong value', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      betas: ['wrong-beta'],
    });

    const result = await adapter.runContext1mBetaReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toEqual(['wrong-beta']);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('betas');
  });

  it('returns fail when enableContext1mBeta is true but SDK option has wrong length', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      betas: ['context-1m-2025-08-07', 'extra-beta'],
    });

    const result = await adapter.runContext1mBetaReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toEqual(['context-1m-2025-08-07', 'extra-beta']);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('betas');
  });

  it('returns fail on thrown error', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        enableContext1mBeta: true,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockImplementation(() => {
      throw new Error('buildDiagnosticSdkOptions threw');
    });

    const result = await adapter.runContext1mBetaReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('buildDiagnosticSdkOptions threw');
  });
});

describe('runLoadTimeoutReadbackProbe', () => {
  it('returns readback with no loadTimeoutMs option when setting is null', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runLoadTimeoutReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBeNull();
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with loadTimeoutMs option when setting is a positive integer', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        loadTimeoutMs: 60000,
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runLoadTimeoutReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe(60000);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(60000);
    expect(result.valueMatch).toBe(true);
  });

  it('returns fail when loadTimeoutMs is null but SDK option is present', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      loadTimeoutMs: 30000,
    });

    const result = await adapter.runLoadTimeoutReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBeNull();
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('loadTimeoutMs');
  });

  it('returns fail when loadTimeoutMs is set but SDK option is missing', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        loadTimeoutMs: 60000,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      loadTimeoutMs: undefined,
    });

    const result = await adapter.runLoadTimeoutReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(60000);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('loadTimeoutMs');
  });

  it('returns fail when loadTimeoutMs is set but SDK option has wrong value', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        loadTimeoutMs: 60000,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      loadTimeoutMs: 30000,
    });

    const result = await adapter.runLoadTimeoutReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(60000);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe(30000);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('loadTimeoutMs');
  });

  it('returns fail on thrown error', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        loadTimeoutMs: 60000,
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockImplementation(() => {
      throw new Error('buildDiagnosticSdkOptions threw');
    });

    const result = await adapter.runLoadTimeoutReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe(60000);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('buildDiagnosticSdkOptions threw');
  });
});

describe('runJsRuntimeReadbackProbe', () => {
  it('returns readback with no executable option when jsRuntime is empty', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('');
    expect(result.emptySetting).toBe(true);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with executable option when jsRuntime is node', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        jsRuntime: 'node',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('node');
    expect(result.emptySetting).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('node');
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with executable option when jsRuntime is bun', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        jsRuntime: 'bun',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('bun');
    expect(result.emptySetting).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('bun');
    expect(result.valueMatch).toBe(true);
  });

  it('returns readback with executable option when jsRuntime is deno', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        jsRuntime: 'deno',
      },
      sdk: createProbeSdk([]),
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('readback');
    expect(result.optionWired).toBe(true);
    expect(result.settingValue).toBe('deno');
    expect(result.emptySetting).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('deno');
    expect(result.valueMatch).toBe(true);
  });

  it('returns fail when jsRuntime is empty but SDK option is present', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      executable: 'node',
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe('');
    expect(result.emptySetting).toBe(true);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('executable');
  });

  it('returns fail when jsRuntime is non-empty but SDK option is missing', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        jsRuntime: 'node',
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      executable: undefined,
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe('node');
    expect(result.emptySetting).toBe(false);
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('executable');
  });

  it('returns fail when jsRuntime is non-empty but SDK option has wrong value', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        jsRuntime: 'node',
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockReturnValue({
      executable: 'bun',
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe('node');
    expect(result.emptySetting).toBe(false);
    expect(result.sdkOptionPresent).toBe(true);
    expect(result.sdkValue).toBe('bun');
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('executable');
  });

  it('returns fail on thrown error', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: {
        ...getDefaultClaudeCodeBackendSettings(),
        jsRuntime: 'node',
      },
      sdk: createProbeSdk([]),
    });

    jest.spyOn(adapter as unknown as {
      buildDiagnosticSdkOptions: (...args: unknown[]) => unknown;
    }, 'buildDiagnosticSdkOptions').mockImplementation(() => {
      throw new Error('buildDiagnosticSdkOptions threw');
    });

    const result = await adapter.runJsRuntimeReadbackProbe();

    expect(result.classification).toBe('fail');
    expect(result.optionWired).toBe(false);
    expect(result.settingValue).toBe('node');
    expect(result.sdkOptionPresent).toBe(false);
    expect(result.valueMatch).toBe(false);
    expect(result.error).toContain('buildDiagnosticSdkOptions threw');
  });
});

describe('runSystemPromptLiveProbe', () => {
  it('returns pass when nonce is recalled in response', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.555555555;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    const sdk = createProbeSdk([
      assistantMessage('probe-session', `The secret codeword is ${expectedNonce}`),
      resultMessage('probe-session'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runSystemPromptLiveProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('pass');
    expect(result.nonce).toBe(expectedNonce);
    expect(result.nonceRecalled).toBe(true);
    expect(result.responsePreview).toContain(expectedNonce);
  });

  it('returns fail when nonce is not recalled', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.555555555;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    const sdk = createProbeSdk([
      assistantMessage('probe-session', 'I do not know the secret codeword.'),
      resultMessage('probe-session'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runSystemPromptLiveProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('fail');
    expect(result.nonce).toBe(expectedNonce);
    expect(result.nonceRecalled).toBe(false);
    expect(result.error).toContain('Nonce not found');
  });

  it('returns fail on thrown error', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.555555555;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    const sdk = createProbeSdk([]);
    sdk.query.mockImplementation(() => {
      throw new Error('SDK query failed');
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runSystemPromptLiveProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('fail');
    expect(result.nonce).toBe(expectedNonce);
    expect(result.nonceRecalled).toBe(false);
    expect(result.error).toContain('SDK query failed');
  });

  it('passes _diagnosticSystemPrompt with nonce to runDiagnosticPrompt', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.777777777;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    const sdk = createProbeSdk([
      assistantMessage('probe-session', `codeword: ${expectedNonce}`),
      resultMessage('probe-session'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const runDiagnosticPromptSpy = jest.spyOn(adapter, 'runDiagnosticPrompt');

    await adapter.runSystemPromptLiveProbe();
    Math.random = realRandom;

    expect(runDiagnosticPromptSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'What is the secret codeword?',
        _diagnosticBypassPermissions: true,
        _diagnosticSystemPrompt: `If asked for the secret codeword, reply with exactly '${expectedNonce}' and nothing else.`,
      }),
    );
  });
});

describe('runOutputStyleLiveProbe', () => {
  it('returns pass when a custom output style nonce is recalled in a fresh diagnostic response', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.555555555;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    const sdk = createProbeSdk([
      assistantMessage('probe-session', `Output-style proof: ${expectedNonce}`),
      resultMessage('probe-session'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/tmp/opencodian-output-style-probe-vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runOutputStyleLiveProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('pass');
    expect(result.nonce).toBe(expectedNonce);
    expect(result.nonceRecalled).toBe(true);
    expect(result.outputStyleOptionWired).toBe(true);
    expect(result.styleName).toContain('opencodian-proof-');
    expect(result.tempStylePath).toContain('/.claude/output-styles/');
    expect(result.responsePreview).toContain(expectedNonce);
    expect(result.cleanup.fileRemoved).toBe(true);
  });

  it('passes a diagnostic output style name without putting the nonce in the user prompt', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.777777777;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    const sdk = createProbeSdk([
      assistantMessage('probe-session', `proof ${expectedNonce}`),
      resultMessage('probe-session'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/tmp/opencodian-output-style-probe-vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const runDiagnosticPromptSpy = jest.spyOn(adapter, 'runDiagnosticPrompt');

    await adapter.runOutputStyleLiveProbe();
    Math.random = realRandom;

    expect(runDiagnosticPromptSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'What is the output-style proof code?',
        _diagnosticBypassPermissions: true,
        _diagnosticOutputStyle: expect.stringContaining('opencodian-proof-'),
      }),
    );
    const prompt = runDiagnosticPromptSpy.mock.calls[0][0].prompt;
    expect(prompt).not.toContain(expectedNonce);
  });

  it('returns fail when the output style nonce is not recalled', async () => {
    const realRandom = Math.random;
    Math.random = () => 0.555555555;
    const expectedNonce = Math.random().toString(36).slice(2, 10);

    const sdk = createProbeSdk([
      assistantMessage('probe-session', 'I do not know the proof code.'),
      resultMessage('probe-session'),
    ]);
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/tmp/opencodian-output-style-probe-vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runOutputStyleLiveProbe();
    Math.random = realRandom;

    expect(result.classification).toBe('fail');
    expect(result.nonce).toBe(expectedNonce);
    expect(result.nonceRecalled).toBe(false);
    expect(result.outputStyleOptionWired).toBe(true);
    expect(result.error).toContain('Nonce not found');
    expect(result.cleanup.fileRemoved).toBe(true);
  });

  it('returns fail with cleanup status when the diagnostic query throws', async () => {
    const sdk = createProbeSdk([]);
    sdk.query.mockImplementation(() => {
      throw new Error('SDK query failed');
    });
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/tmp/opencodian-output-style-probe-vault',
      settings: getDefaultClaudeCodeBackendSettings(),
      sdk,
    });

    const result = await adapter.runOutputStyleLiveProbe();

    expect(result.classification).toBe('fail');
    expect(result.nonceRecalled).toBe(false);
    expect(result.outputStyleOptionWired).toBe(true);
    expect(result.error).toContain('SDK query failed');
    expect(result.cleanup.fileRemoved).toBe(true);
  });
});

/**
 * Helper: create a mock runDiagnosticPrompt that returns REAL SDK raw message
 * shapes WITHOUT invoking _diagnosticOnElicitation directly.
 */
function createMockRunDiagnosticPrompt(
  adapter: ClaudeCodeAdapter,
  rawMessages: unknown[],
): jest.SpyInstance {
  return jest.spyOn(adapter, 'runDiagnosticPrompt').mockImplementation(async () => {
    return {
      sessionId: 'probe-session',
      rawMessages,
      chunks: [],
    };
  });
}

describe('runMcpElicitationLiveProbe scanner', () => {
  it('finds nonce echoed in assistant tool_result', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    const nonce = 'test-nonce-123';
    const steps: string[] = [];
    const result = ((adapter as unknown as Record<string, (...args: unknown[]) => unknown>)
      .scanMessagesForNonce([
        {
          type: 'assistant',
          session_id: 'probe-session',
          content: [
            {
              type: 'tool_result',
              text: JSON.stringify({ echoed: 'elicitation-live-test', elicitationAction: 'accept', nonce }),
            },
          ],
        },
      ], nonce, (msg) => steps.push(msg)) as { nonceEchoed: boolean; echoedNonce?: string });

    expect(result.nonceEchoed).toBe(true);
    expect(result.echoedNonce).toBe(nonce);
    expect(steps.some((s) => s.includes('Nonce echoed in tool_result block'))).toBe(true);
  });

  it('finds nonce echoed in user message tool_result (real SDK shape)', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    const nonce = 'test-nonce-456';
    const steps: string[] = [];
    const result = ((adapter as unknown as Record<string, (...args: unknown[]) => unknown>)
      .scanMessagesForNonce([
        {
          type: 'user',
          session_id: 'probe-session',
          content: [
            {
              type: 'tool_result',
              text: JSON.stringify({ echoed: 'elicitation-live-test', elicitationAction: 'accept', nonce }),
              isError: false,
            },
          ],
        },
      ], nonce, (msg) => steps.push(msg)) as { nonceEchoed: boolean; echoedNonce?: string });

    expect(result.nonceEchoed).toBe(true);
    expect(result.echoedNonce).toBe(nonce);
  });

  it('finds nonce in single-object content (non-array)', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    const nonce = 'test-nonce-789';
    const steps: string[] = [];
    const result = ((adapter as unknown as Record<string, (...args: unknown[]) => unknown>)
      .scanMessagesForNonce([
        {
          type: 'user',
          session_id: 'probe-session',
          content: {
            type: 'tool_result',
            text: JSON.stringify({ echoed: 'test', nonce }),
            isError: false,
          },
        },
      ], nonce, (msg) => steps.push(msg)) as { nonceEchoed: boolean; echoedNonce?: string });

    expect(result.nonceEchoed).toBe(true);
    expect(result.echoedNonce).toBe(nonce);
  });

  it('finds nonce in content-field text', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    const nonce = 'test-nonce-abc';
    const steps: string[] = [];
    const result = ((adapter as unknown as Record<string, (...args: unknown[]) => unknown>)
      .scanMessagesForNonce([
        {
          type: 'user',
          session_id: 'probe-session',
          content: [
            {
              type: 'tool_result',
              content: JSON.stringify({ echoed: 'test', nonce }),
              isError: false,
            },
          ],
        },
      ], nonce, (msg) => steps.push(msg)) as { nonceEchoed: boolean; echoedNonce?: string });

    expect(result.nonceEchoed).toBe(true);
    expect(result.echoedNonce).toBe(nonce);
  });

  it('extractToolResultErrorPreview extracts error from user tool_result', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    const preview = ((adapter as unknown as Record<string, (...args: unknown[]) => unknown>)
      .extractToolResultErrorPreview([
        {
          type: 'user',
          session_id: 'probe-session',
          content: [
            {
              type: 'tool_result',
              text: 'MCP server error: elicitation/create method not supported by SDK client',
              isError: true,
            },
          ],
        },
      ]) as string | undefined);

    expect(preview).toBeDefined();
    expect(preview).toContain('elicitation/create');
  });
});

describe('runMcpElicitationLiveProbe integration', () => {
  it('returns wiring when tool_result has isError:true with error preview', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    createMockRunDiagnosticPrompt(adapter, [
      {
        type: 'user',
        session_id: 'probe-session',
        content: [
          {
            type: 'tool_result',
            text: 'MCP server error: elicitation/create method not supported by SDK client',
            isError: true,
          },
        ],
      },
      { type: 'result', subtype: 'success', session_id: 'probe-session' },
    ]);

    const result = await adapter.runMcpElicitationLiveProbe();

    expect(result.classification).toBe('wiring');
    expect(result.serverCreated).toBe(true);
    expect(result.nonceEchoed).toBe(false);
    expect(result.onElicitationCallCount).toBe(0);
    expect(result.toolResultErrorPreview).toBeDefined();
    expect(result.toolResultErrorPreview).toContain('elicitation/create');
    expect(result.stepLog.some((s) => s.includes('Tool result error preview'))).toBe(true);
  });

  it('returns wiring when no elicitation or tool result observed', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    createMockRunDiagnosticPrompt(adapter, [
      {
        type: 'assistant',
        session_id: 'probe-session',
        content: [{ type: 'text', text: 'No tool result here' }],
      },
      { type: 'result', subtype: 'success', session_id: 'probe-session' },
    ]);

    const result = await adapter.runMcpElicitationLiveProbe();

    expect(result.classification).toBe('wiring');
    expect(result.serverCreated).toBe(true);
    expect(result.serverCleanedUp).toBe(true);
    expect(result.nonceEchoed).toBe(false);
  });

  it('returns fail when runDiagnosticPrompt throws', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    jest.spyOn(adapter, 'runDiagnosticPrompt').mockImplementation(() => {
      throw new Error('Diagnostic query failed');
    });

    const result = await adapter.runMcpElicitationLiveProbe();

    expect(result.classification).toBe('fail');
    expect(result.serverCreated).toBe(true);
    expect(result.serverCleanedUp).toBe(true);
    expect(result.error).toContain('Diagnostic query failed');
  });

  it('passes correct diagnostic overrides to runDiagnosticPrompt', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    const runDiagnosticPromptSpy = createMockRunDiagnosticPrompt(adapter, [
      {
        type: 'assistant',
        session_id: 'probe-session',
        content: [{ type: 'text', text: 'No tool result' }],
      },
      { type: 'result', subtype: 'success', session_id: 'probe-session' },
    ]);

    await adapter.runMcpElicitationLiveProbe();

    expect(runDiagnosticPromptSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        _diagnosticBypassPermissions: false,
        _diagnosticMcpServers: expect.objectContaining({
          elicit_live: expect.objectContaining({
            type: 'stdio',
            command: 'node',
            alwaysLoad: true,
          }),
        }),
        _diagnosticAllowedTools: ['mcp__elicit_live__ask_and_echo'],
        _diagnosticCanUseTool: expect.any(Function),
        _diagnosticOnElicitation: expect.any(Function),
        _diagnosticMaxTurns: 3,
      }),
    );

    // Verify the onElicitation callback accepts both parameters (SDK expects 2)
    const callArgs = runDiagnosticPromptSpy.mock.calls[0][0];
    expect(callArgs._diagnosticOnElicitation).toBeDefined();
    const elicitationResult = await callArgs._diagnosticOnElicitation!(
      { serverName: 'elicit_live', message: 'test' } as unknown as import('@anthropic-ai/claude-agent-sdk').ElicitationRequest,
      { signal: new AbortController().signal },
    );
    expect(elicitationResult.action).toBe('accept');
    expect(elicitationResult.content).toHaveProperty('nonce');
  });

  it('cleans up temp server even on failure', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    jest.spyOn(adapter, 'runDiagnosticPrompt').mockImplementation(() => {
      throw new Error('Simulated failure');
    });

    const result = await adapter.runMcpElicitationLiveProbe();

    expect(result.serverCreated).toBe(true);
    expect(result.serverCleanedUp).toBe(true);
    expect(result.stepLog.some((s) => s.includes('cleaned up'))).toBe(true);
  });

  it('detects tool_result on backend_event messages', async () => {
    const adapter = new ClaudeCodeAdapter({
      vaultPath: '/vault',
      settings: getDefaultClaudeCodeBackendSettings(),
    });

    createMockRunDiagnosticPrompt(adapter, [
      {
        type: 'backend_event',
        session_id: 'probe-session',
        content: [
          {
            type: 'tool_result',
            text: JSON.stringify({ error: 'backend tool failed' }),
            isError: true,
          },
        ],
      },
      { type: 'result', subtype: 'success', session_id: 'probe-session' },
    ]);

    const result = await adapter.runMcpElicitationLiveProbe();

    expect(result.classification).toBe('wiring');
    expect(result.toolResultErrorPreview).toBeDefined();
    expect(result.stepLog.some((s) => s.includes('tool result observed but onElicitation not called'))).toBe(true);
  });
});
