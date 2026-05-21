/* eslint-disable max-lines-per-function -- Permission bridge coverage keeps approval, question, and logging privacy regressions together. */

import {
  type ClaudeCodePermissionBridgeHost,
  createClaudeCodePermissionBridge,
} from '../../../../../src/core/agents/backend';
import {
  clearRecentLogs,
  getRecentLogEntries,
  setClaudeCodeDebugChannelSettings,
  setDebugLoggingEnabled,
  setDebugModuleEnabled,
} from '../../../../../src/shared';

describe('ClaudeCodePermissionBridge', () => {
  beforeEach(() => {
    clearRecentLogs();
    setDebugLoggingEnabled(true);
    setDebugModuleEnabled('claudeCode', true);
    setClaudeCodeDebugChannelSettings(undefined);
  });

  afterEach(() => {
    setDebugLoggingEnabled(false);
    setDebugModuleEnabled('claudeCode', false);
    setClaudeCodeDebugChannelSettings(undefined);
    clearRecentLogs();
  });

  it('allows a tool once and returns updated input', async () => {
    const collectToolApproval = jest.fn(async () => ({
      reply: 'once' as const,
      updatedInput: { command: 'pwd', timeout: 1000 },
    }));
    const bridge = createClaudeCodePermissionBridge({ collectToolApproval }, {
      sessionId: 'claude-session-1',
    });

    await expect(bridge.canUseTool(
      'Bash',
      { command: 'pwd' },
      { toolUseID: 'tool-1' },
    )).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { command: 'pwd', timeout: 1000 },
      toolUseID: 'tool-1',
    });

    expect(collectToolApproval).toHaveBeenCalledWith({
      type: 'permission_request',
      id: 'tool-1',
      sessionID: 'claude-session-1',
      permission: 'Bash',
      patterns: ['pwd'],
      metadata: {
        source: 'claude-code',
        input: { command: 'pwd' },
        command: 'pwd',
      },
      always: [],
      tool: { messageID: 'tool-1', callID: 'tool-1' },
    }, { toolUseID: 'tool-1' });
  });

  it('maps allow-always decisions to Claude permission updates', async () => {
    const bridge = createClaudeCodePermissionBridge({
      collectToolApproval: jest.fn(async () => 'always' as const),
    });

    await expect(bridge.canUseTool('Edit', { file_path: 'note.md' }, {
      toolUseID: 'tool-edit',
      suggestions: [
        { destination: 'localSettings', rule: 'allow edit note.md' },
        { destination: 'session', rule: 'temporary' },
      ],
    })).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { file_path: 'note.md' },
      updatedPermissions: [{ destination: 'localSettings', rule: 'allow edit note.md' }],
      toolUseID: 'tool-edit',
    });
  });

  it('maps session approvals to session-scoped permission updates', async () => {
    const bridge = createClaudeCodePermissionBridge({
      collectToolApproval: jest.fn(async () => 'session' as const),
    });

    await expect(bridge.canUseTool('Read', { file_path: 'note.md' }, {
      suggestions: [
        { destination: 'session', rule: 'allow read note.md' },
        { destination: 'projectSettings', rule: 'persisted' },
      ],
    })).resolves.toEqual({
      behavior: 'allow',
      updatedInput: { file_path: 'note.md' },
      updatedPermissions: [{ destination: 'session', rule: 'allow read note.md' }],
    });
  });

  it('denies rejected tools and preserves denial messages', async () => {
    const bridge = createClaudeCodePermissionBridge({
      collectToolApproval: jest.fn(async () => ({
        reply: 'reject' as const,
        message: 'Do not run that command',
      })),
    });

    await expect(bridge.canUseTool('Bash', { command: 'rm -rf dist' }, {
      toolUseID: 'tool-denied',
    })).resolves.toEqual({
      behavior: 'deny',
      message: 'Do not run that command',
      toolUseID: 'tool-denied',
    });
  });

  it('returns interrupt denial for cancellation and abort signals', async () => {
    const aborted = new AbortController();
    aborted.abort();

    await expect(createClaudeCodePermissionBridge().canUseTool(
      'Bash',
      { command: 'pwd' },
      { toolUseID: 'tool-abort', signal: aborted.signal },
    )).resolves.toEqual({
      behavior: 'deny',
      message: 'Claude Code permission request was interrupted.',
      interrupt: true,
      toolUseID: 'tool-abort',
    });

    await expect(createClaudeCodePermissionBridge({
      collectToolApproval: jest.fn(async () => null),
    }).canUseTool('Bash', { command: 'pwd' }, { toolUseID: 'tool-cancel' }))
      .resolves.toEqual({
        behavior: 'deny',
        message: 'Claude Code permission request was cancelled.',
        interrupt: true,
        toolUseID: 'tool-cancel',
      });
  });

  it('denies safely when no permission handler is installed', async () => {
    const bridge = createClaudeCodePermissionBridge();

    await expect(bridge.canUseTool('Bash', { command: 'pwd' }, { toolUseID: 'tool-1' }))
      .resolves.toEqual({
        behavior: 'deny',
        message: 'No Claude Code permission handler is available.',
        toolUseID: 'tool-1',
      });
  });

  it('maps AskUserQuestion input to a question request and returns answers in updated input', async () => {
    const collectQuestionAnswers = jest.fn(async () => ({
      answers: [['Yes'], ['Fast', 'Safe']],
      updatedInput: { confirmed: true },
    }));
    const host: ClaudeCodePermissionBridgeHost = { collectQuestionAnswers };
    const bridge = createClaudeCodePermissionBridge(host, {
      sessionId: 'claude-session-questions',
    });

    const input = {
      questions: [{
        question: 'Continue?',
        header: 'Confirm',
        options: [{ label: 'Yes', description: 'Proceed' }],
      }, {
        question: 'Modes',
        options: [
          { label: 'Fast', description: 'Lower latency' },
          { label: 'Safe', description: 'More checks' },
        ],
        multiple: true,
      }],
    };

    await expect(bridge.canUseTool('AskUserQuestion', input, { toolUseID: 'question-1' }))
      .resolves.toEqual({
        behavior: 'allow',
        updatedInput: {
          questions: input.questions,
          answers: {
            'Continue?': 'Yes',
            Modes: ['Fast', 'Safe'],
          },
          confirmed: true,
        },
        toolUseID: 'question-1',
      });

    expect(collectQuestionAnswers).toHaveBeenCalledWith({
      id: 'question-1',
      sessionId: 'claude-session-questions',
      questions: [{
        question: 'Continue?',
        header: 'Confirm',
        options: [{ label: 'Yes', description: 'Proceed' }],
        multiple: false,
        custom: true,
      }, {
        question: 'Modes',
        header: 'Question',
        options: [
          { label: 'Fast', description: 'Lower latency' },
          { label: 'Safe', description: 'More checks' },
        ],
        multiple: true,
        custom: true,
      }],
    }, { toolUseID: 'question-1' });
  });

  it('denies invalid AskUserQuestion input', async () => {
    const bridge = createClaudeCodePermissionBridge({
      collectQuestionAnswers: jest.fn(async () => [['Yes']]),
    });

    await expect(bridge.canUseTool('AskUserQuestion', { questions: [] }, {
      toolUseID: 'question-invalid',
    })).resolves.toEqual({
      behavior: 'deny',
      message: 'Claude Code asked an invalid question.',
      toolUseID: 'question-invalid',
    });
  });

  it('logs permission and question decisions without leaking user answers', async () => {
    const bridge = createClaudeCodePermissionBridge({
      collectToolApproval: jest.fn(async () => 'session' as const),
      collectQuestionAnswers: jest.fn(async () => ({
        answers: [['secret answer']],
        updatedInput: { redacted: true },
      })),
    }, { sessionId: 'claude-session-log' });

    await bridge.canUseTool('Bash', { command: 'echo secret-command' }, {
      toolUseID: 'tool-log',
      suggestions: [{ destination: 'session', rule: 'allow bash' }],
    });
    await bridge.canUseTool('AskUserQuestion', {
      questions: [{
        question: 'Continue?',
        options: [{ label: 'Yes', description: 'Proceed' }],
      }],
    }, { toolUseID: 'question-log' });

    const entries = getRecentLogEntries().filter((entry) => entry.scope === 'ClaudeCodePermissionBridge');
    const logText = entries.map((entry) => entry.message).join('\n');

    expect(entries.length).toBeGreaterThanOrEqual(4);
    expect(entries.every((entry) => entry.moduleKey === 'claudeCode')).toBe(true);
    expect(entries.every((entry) => entry.channel === 'permissions')).toBe(true);
    expect(logText).toContain('canUseTool request');
    expect(logText).toContain('canUseTool decision');
    expect(logText).toContain('AskUserQuestion request');
    expect(logText).toContain('AskUserQuestion decision');
    expect(logText).toContain('updatedPermissionsCount');
    [
      'agentID',
      'hasSignal',
      'aborted',
      'suggestionCount',
      'hasBlockedPath',
      'hasDecisionReason',
      'inputKeyCount',
      'updatedInputKeyCount',
      'interrupt',
      'sessionId',
      'optionCount',
      'answerGroupCount',
      'selectedCount',
    ].forEach((forbiddenField) => {
      expect(logText).not.toContain(forbiddenField);
    });
    expect(logText).not.toContain('secret answer');
    expect(logText).not.toContain('echo secret-command');
  });

  it('logs AskUserQuestion errors without error keys or raw error messages', async () => {
    const bridge = createClaudeCodePermissionBridge({
      collectQuestionAnswers: jest.fn(async () => {
        throw new Error('secret raw question failure');
      }),
    }, { sessionId: 'claude-session-error-log' });

    await expect(bridge.canUseTool('AskUserQuestion', {
      questions: [{
        question: 'Continue?',
        options: [{ label: 'Yes', description: 'Proceed' }],
      }],
    }, { toolUseID: 'question-error-log' })).rejects.toThrow('secret raw question failure');

    const logText = getRecentLogEntries()
      .filter((entry) => entry.scope === 'ClaudeCodePermissionBridge')
      .map((entry) => entry.message)
      .join('\n');

    expect(logText).toContain('AskUserQuestion error');
    expect(logText).toContain('toolUseID');
    expect(logText).not.toContain('"error"');
    expect(logText).not.toContain('secret raw question failure');
  });
});
