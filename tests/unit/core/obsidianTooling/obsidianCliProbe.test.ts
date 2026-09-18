import type { CliSpawnFn } from '../../../../src/core/obsidianTooling/ObsidianCliProbe';
import { probeObsidianCli } from '../../../../src/core/obsidianTooling/ObsidianCliProbe';

function fakeSpawn(outcome: {
  code?: number | null;
  stdout?: string;
  stderr?: string;
  error?: NodeJS.ErrnoException;
}): CliSpawnFn {
  return async () => ({
    code: outcome.code ?? 0,
    stdout: outcome.stdout ?? '',
    stderr: outcome.stderr ?? '',
    ...(outcome.error ? { error: outcome.error } : {}),
  });
}

describe('Obsidian CLI availability probe (R-B4)', () => {
  it('reports available with the first stdout line as version', async () => {
    const result = await probeObsidianCli({
      spawn: fakeSpawn({ stdout: '1.13.7 (installer 1.13.4)\n' }),
    });
    expect(result).toEqual({ status: 'available', version: '1.13.7 (installer 1.13.4)' });
  });

  it('reports not-found on ENOENT (CLI missing from PATH)', async () => {
    const error = Object.assign(new Error('spawn obsidian ENOENT'), { code: 'ENOENT' });
    const result = await probeObsidianCli({ spawn: fakeSpawn({ code: null, error }) });
    expect(result.status).toBe('not-found');
  });

  it('reports timeout when the spawn reports the kill via onTimeout', async () => {
    const spawn: CliSpawnFn = (_command, _args, onTimeout) => new Promise((resolve) => {
      onTimeout(() => undefined);
      resolve({ code: null, stdout: '', stderr: '' });
    });
    const result = await probeObsidianCli({ spawn, timeoutMs: 1000 });
    expect(result.status).toBe('timeout');
  });

  it('reports error with stderr detail on non-zero exit', async () => {
    const result = await probeObsidianCli({
      spawn: fakeSpawn({ code: 1, stderr: 'boom' }),
    });
    expect(result).toEqual({ status: 'error', detail: 'boom' });
  });

  it('never throws even when the spawn implementation throws', async () => {
    const spawn: CliSpawnFn = async () => {
      throw new Error('unexpected');
    };
    const result = await probeObsidianCli({ spawn });
    expect(result.status).toBe('error');
  });
});
