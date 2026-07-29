import type { ChildProcess } from 'child_process';

import type { OpenCodeTracePort } from '../../../../src/core/opencode/diagnostics';
import { LocalSidecarLauncher } from '../../../../src/core/opencode/LocalSidecarLauncher';
import type { OpenCodeServerConfig } from '../../../../src/core/opencode/types';

function createProcessHarness() {
  const processHandlers = new Map<string, (...args: unknown[]) => void>();
  const stdoutHandlers = new Map<string, (...args: unknown[]) => void>();
  const stderrHandlers = new Map<string, (...args: unknown[]) => void>();
  const child = {
    pid: 4242,
    on: jest.fn((name: string, handler: (...args: unknown[]) => void) => {
      processHandlers.set(name, handler);
    }),
    removeListener: jest.fn(),
    stdout: {
      on: jest.fn((name: string, handler: (...args: unknown[]) => void) => {
        stdoutHandlers.set(name, handler);
      }),
      removeListener: jest.fn(),
    },
    stderr: {
      on: jest.fn((name: string, handler: (...args: unknown[]) => void) => {
        stderrHandlers.set(name, handler);
      }),
      removeListener: jest.fn(),
    },
  } as unknown as ChildProcess;
  return { child, processHandlers, stdoutHandlers, stderrHandlers };
}

describe('LocalSidecarLauncher OpenCode trace tail', () => {
  it('redacts service output before console, trace, and the bounded process-exit tail', () => {
    const canary = 'sidecar-canary-secret';
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const recordRuntime = jest.fn();
    const recordServiceOutput = jest.fn();
    const tracePort = { recordRuntime, recordServiceOutput } as OpenCodeTracePort;
    const config = {
      mode: 'local',
      baseUrl: 'http://127.0.0.1:4196',
      local: { host: '127.0.0.1', port: 4196 },
      auth: { type: 'basic', username: 'user', password: canary, token: '' },
    } as OpenCodeServerConfig;
    const launcher = new LocalSidecarLauncher(config, undefined, tracePort);
    const harness = createProcessHarness();

    (launcher as unknown as {
      attachLaunchTracking(
        process: ChildProcess,
        options: {
          timeout: number;
          checkHealth: () => Promise<boolean>;
          managedServerStateSnapshot: null;
        },
      ): void;
    }).attachLaunchTracking(harness.child, {
      timeout: 1,
      checkHealth: async () => true,
      managedServerStateSnapshot: null,
    });
    harness.stderrHandlers.get('data')?.(
      Array.from({ length: 100 }, (_, index) => `line-${index}-${canary}`).join('\n'),
    );
    harness.processHandlers.get('exit')?.(1, null);

    expect(JSON.stringify(recordServiceOutput.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(recordRuntime.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain(canary);
    expect(recordServiceOutput).toHaveBeenCalledWith(expect.objectContaining({
      stream: 'stderr',
      pid: 4242,
    }));
    expect(recordRuntime).toHaveBeenCalledWith(expect.objectContaining({
      name: 'service.process_exit',
      payload: expect.objectContaining({
        association: 'runtime-window-only',
        errorTail: Array.from(
          { length: 80 },
          (_, index) => `line-${index + 20}-[REDACTED]`,
        ),
      }),
    }));
    consoleSpy.mockRestore();
  });
});
