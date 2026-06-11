/**
 * CodexAdapter.getAccountInfo() tests.
 *
 * Uses jest.mock('node:child_process') at the module level so the adapter's
 * import-time binding to `execFile` is replaced with the mock.
 */
import type { execFile as ExecFileFn } from 'node:child_process';

const mockExecFile = jest.fn<void, Parameters<typeof ExecFileFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: (...args: Parameters<typeof ExecFileFn>) => mockExecFile(...args),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend';

type ExecFileCallback = (err: Error | null, stdout: string, stderr: string) => void;

const VALID_DOCTOR_OUTPUT = JSON.stringify({
  schemaVersion: 1,
  overallStatus: 'ok',
  checks: {
    'auth.credentials': {
      id: 'auth.credentials',
      status: 'ok',
      details: {
        'auth file': '/home/user/.codex/auth.json',
        'auth storage mode': 'File',
        'stored API key': 'false',
        'stored ChatGPT tokens': 'true',
        'stored agent identity': 'false',
        'stored auth mode': 'chatgpt',
      },
    },
  },
});

const DOCTOR_OUTPUT_NO_AUTH = JSON.stringify({
  schemaVersion: 1,
  overallStatus: 'ok',
  checks: {
    'config.load': { id: 'config.load', status: 'ok', details: {} },
  },
});

const DOCTOR_OUTPUT_NO_DETAILS = JSON.stringify({
  schemaVersion: 1,
  overallStatus: 'ok',
  checks: {
    'auth.credentials': { id: 'auth.credentials', status: 'ok' },
  },
});

describe('CodexAdapter.getAccountInfo', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('returns auth.credentials.details from valid stdout JSON', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, VALID_DOCTOR_OUTPUT, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getAccountInfo();

    expect(result).toEqual({
      'auth file': '/home/user/.codex/auth.json',
      'auth storage mode': 'File',
      'stored API key': 'false',
      'stored ChatGPT tokens': 'true',
      'stored agent identity': 'false',
      'stored auth mode': 'chatgpt',
    });
  });

  it('falls back to stderr when stdout is empty and command exits non-zero', async () => {
    const stderrOutput = JSON.stringify({
      schemaVersion: 1,
      overallStatus: 'fail',
      checks: {
        'auth.credentials': {
          id: 'auth.credentials',
          status: 'ok',
          details: {
            'auth file': '/Users/test/.codex/auth.json',
            'auth storage mode': 'File',
            'stored auth mode': 'chatgpt',
          },
        },
      },
    });

    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(new Error('exit code 1'), '', stderrOutput);
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getAccountInfo();

    expect(result).toEqual({
      'auth file': '/Users/test/.codex/auth.json',
      'auth storage mode': 'File',
      'stored auth mode': 'chatgpt',
    });
  });

  it('returns null when output is not valid JSON', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(new Error('exit code 1'), 'not json at all', '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getAccountInfo();

    expect(result).toBeNull();
  });

  it('returns null when checks.auth.credentials is missing', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, DOCTOR_OUTPUT_NO_AUTH, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getAccountInfo();

    expect(result).toBeNull();
  });

  it('returns null when details is missing from auth.credentials', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, DOCTOR_OUTPUT_NO_DETAILS, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getAccountInfo();

    expect(result).toBeNull();
  });

  it('passes codexPathOverride as the command to execFile', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, '{}', '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/custom/codex' });
    await adapter.getAccountInfo();

    expect(mockExecFile).toHaveBeenCalledWith(
      '/custom/codex',
      ['doctor', '--json'],
      { timeout: 15000 },
      expect.any(Function),
    );
  });

  it('falls back to "codex" command when codexPathOverride is not set', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, '{}', '');
    });

    const adapter = new CodexAdapter({});
    await adapter.getAccountInfo();

    expect(mockExecFile).toHaveBeenCalledWith(
      'codex',
      ['doctor', '--json'],
      { timeout: 15000 },
      expect.any(Function),
    );
  });
});
