import type { execFile as ExecFileFn } from 'node:child_process';

const mockExecFile = jest.fn<void, Parameters<typeof ExecFileFn>>();

jest.mock('node:child_process', () => ({
  ...jest.requireActual('node:child_process'),
  execFile: (...args: Parameters<typeof ExecFileFn>) => mockExecFile(...args),
}));

import { CodexAdapter } from '../../../../../src/core/agents/backend';

type ExecFileCallback = (err: Error | null, stdout: string, stderr: string) => void;

const VALID_MODELS_OUTPUT = JSON.stringify({
  models: [
    {
      slug: 'gpt-5.5',
      display_name: 'GPT-5.5',
      description: 'Frontier model.',
      default_reasoning_level: 'medium',
      visibility: 'list',
      supported_in_api: true,
    },
    {
      slug: 'codex-auto-review',
      display_name: 'Codex Auto Review',
      description: 'Automatic approval review model.',
      default_reasoning_level: 'medium',
      visibility: 'hide',
      supported_in_api: true,
    },
    {
      slug: 'gpt-5.4',
      display_name: 'gpt-5.4',
      description: 'Strong model for everyday coding.',
      default_reasoning_level: 'medium',
      visibility: 'list',
      supported_in_api: true,
    },
    {
      slug: 'experimental-xyz',
      display_name: 'Experimental XYZ',
      description: 'Not yet in API.',
      default_reasoning_level: 'medium',
      visibility: 'list',
      supported_in_api: false,
    },
  ],
});

const EMPTY_MODELS_OUTPUT = JSON.stringify({ models: [] });

const NO_MODELS_KEY_OUTPUT = JSON.stringify({ other: 'data' });

describe('CodexAdapter.getModelList', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('returns filtered model list excluding visibility=hide and supported_in_api=false', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, VALID_MODELS_OUTPUT, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getModelList();

    expect(result).toEqual([
      {
        slug: 'gpt-5.5',
        display_name: 'GPT-5.5',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: 'medium',
        description: 'Frontier model.',
      },
      {
        slug: 'gpt-5.4',
        display_name: 'gpt-5.4',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: 'medium',
        description: 'Strong model for everyday coding.',
      },
    ]);
  });

  it('falls back to stderr when stdout is empty', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(new Error('exit code 1'), '', VALID_MODELS_OUTPUT);
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getModelList();

    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
  });

  it('returns null when output is not valid JSON', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(new Error('exit code 1'), 'not json', '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getModelList();

    expect(result).toBeNull();
  });

  it('returns null when models array is empty', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, EMPTY_MODELS_OUTPUT, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getModelList();

    expect(result).toBeNull();
  });

  it('returns null when models key is missing', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, NO_MODELS_KEY_OUTPUT, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getModelList();

    expect(result).toBeNull();
  });

  it('passes codexPathOverride and correct args to execFile', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, EMPTY_MODELS_OUTPUT, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/custom/codex' });
    await adapter.getModelList();

    expect(mockExecFile).toHaveBeenCalledWith(
      '/custom/codex',
      ['debug', 'models'],
      { timeout: 15000, maxBuffer: 512 * 1024 },
      expect.any(Function),
    );
  });

  it('handles models with missing optional fields gracefully', async () => {
    const minimalOutput = JSON.stringify({
      models: [
        { slug: 'minimal-model', display_name: 'Minimal', visibility: 'list', supported_in_api: true },
      ],
    });

    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as ExecFileCallback)(null, minimalOutput, '');
    });

    const adapter = new CodexAdapter({ codexPathOverride: '/path/to/codex' });
    const result = await adapter.getModelList();

    expect(result).toEqual([
      {
        slug: 'minimal-model',
        display_name: 'Minimal',
        visibility: 'list',
        supported_in_api: true,
        default_reasoning_level: null,
        description: null,
      },
    ]);
  });
});
