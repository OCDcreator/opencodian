/**
 * LocalSidecarProcessInspector unit tests
 */

import { spawn, spawnSync } from 'child_process';

import { LocalSidecarProcessInspector } from '../../../../src/core/opencode/LocalSidecarProcessInspector';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  spawnSync: jest.fn().mockReturnValue({ status: 0, error: null, stdout: '' }),
}));

const mockSpawn = spawn as jest.Mock;
const mockSpawnSync = spawnSync as jest.Mock;

describe('LocalSidecarProcessInspector', () => {
  let inspector: LocalSidecarProcessInspector;

  beforeEach(() => {
    inspector = new LocalSidecarProcessInspector();
    jest.clearAllMocks();
  });

  function mockSpawnWithStdout(stdout: string, exitCode = 0): void {
    const stdoutHandler = jest.fn();
    const child = {
      stdout: { on: stdoutHandler },
      once: jest.fn().mockImplementation((event: string, handler: (arg?: unknown) => void) => {
        if (event === 'exit') {
          setTimeout(() => handler(exitCode), 0);
        }
      }),
    };
    mockSpawn.mockReturnValueOnce(child);
    // Simulate stdout data event
    setTimeout(() => {
      const dataHandler = stdoutHandler.mock.calls.find((call) => call[0] === 'data')?.[1];
      if (dataHandler) {
        dataHandler(Buffer.from(stdout));
      }
    }, 0);
  }

  describe('getListeningProcessId', () => {
    it('returns parsed PID from lsof output on non-Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnWithStdout('12345\n');

      const result = await inspector.getListeningProcessId(4196);

      expect(result).toBe(12345);
      expect(mockSpawn).toHaveBeenCalledWith(
        'sh',
        ['-lc', 'lsof -nP -iTCP:4196 -sTCP:LISTEN -t 2>/dev/null | head -n 1'],
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }),
      );
    });

    it('prefers the PID bound to the requested host on non-Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnWithStdout('p12345\nn*:4196\np67890\nn127.0.0.1:4196\n');

      const result = await inspector.getListeningProcessId(4196, '127.0.0.1');

      expect(result).toBe(67890);
    });

    it('accepts wildcard listeners for the requested host on non-Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnWithStdout('p12345\nn*:4196\n');

      const result = await inspector.getListeningProcessId(4196, '127.0.0.1');

      expect(result).toBe(12345);
    });

    it('returns null when no process is listening', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnWithStdout('', 1);

      const result = await inspector.getListeningProcessId(4196);

      expect(result).toBeNull();
    });

    it('returns parsed PID from PowerShell output on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockSpawnWithStdout('6789\n');

      const result = await inspector.getListeningProcessId(4196);

      expect(result).toBe(6789);
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-NoProfile', '-Command']),
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }),
      );
    });

    it('filters Windows listener lookup by local address when a host is provided', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockSpawnWithStdout('6789\n');

      const result = await inspector.getListeningProcessId(4196, '127.0.0.1');

      expect(result).toBe(6789);
      const command = mockSpawn.mock.calls[0][1][2] as string;
      expect(command).toContain('LocalAddress');
      expect(command).toContain('127.0.0.1');
    });
  });

  describe('getListeningProcessIdSync', () => {
    it('returns parsed PID from spawnSync stdout on non-Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockSpawnSync.mockReturnValueOnce({ status: 0, error: null, stdout: '54321\n' });

      const result = inspector.getListeningProcessIdSync(4196);

      expect(result).toBe(54321);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'sh',
        ['-lc', 'lsof -nP -iTCP:4196 -sTCP:LISTEN -t 2>/dev/null | head -n 1'],
        expect.objectContaining({ encoding: 'utf-8', windowsHide: true }),
      );
    });

    it('returns null when spawnSync fails', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockSpawnSync.mockReturnValueOnce({ status: 1, error: new Error('failed'), stdout: '' });

      const result = inspector.getListeningProcessIdSync(4196);

      expect(result).toBeNull();
    });
  });

  describe('getProcessCommandLine', () => {
    it('returns command line from ps output on non-Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnWithStdout('node opencode serve --port 4196\n');

      const result = await inspector.getProcessCommandLine(1234);

      expect(result).toBe('node opencode serve --port 4196');
      expect(mockSpawn).toHaveBeenCalledWith(
        'ps',
        ['-p', '1234', '-o', 'command='],
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }),
      );
    });
  });

  describe('getProcessCommandLineSync', () => {
    it('returns command line from spawnSync stdout on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockSpawnSync.mockReturnValueOnce({
        status: 0,
        error: null,
        stdout: 'C:\\Program Files\\opencode\\opencode.exe serve --port 4196',
      });

      const result = inspector.getProcessCommandLineSync(1234);

      expect(result).toBe('C:\\Program Files\\opencode\\opencode.exe serve --port 4196');
    });
  });

  describe('isPidRunning', () => {
    it('returns true when process command line is found', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnWithStdout('some command\n');

      const result = await inspector.isPidRunning(1234);

      expect(result).toBe(true);
    });

    it('returns false when process command line is empty', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnWithStdout('', 1);

      const result = await inspector.isPidRunning(1234);

      expect(result).toBe(false);
    });
  });

  describe('isPidRunningSync', () => {
    it('returns true when sync command line lookup succeeds', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockSpawnSync.mockReturnValueOnce({ status: 0, error: null, stdout: 'some command\n' });

      const result = inspector.isPidRunningSync(1234);

      expect(result).toBe(true);
    });
  });

  describe('isLocalPortAvailableSync', () => {
    it('returns true when port is available on non-Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnSync.mockReturnValueOnce({ status: 0, error: null });

      const result = inspector.isLocalPortAvailableSync(4196);

      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'sh',
        ['-lc', 'if lsof -nP -iTCP:4196 -sTCP:LISTEN -t >/dev/null 2>&1; then exit 1; else exit 0; fi'],
        expect.objectContaining({ stdio: 'ignore', windowsHide: true }),
      );
    });

    it('returns false when port is in use on non-Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnSync.mockReturnValueOnce({ status: 1, error: null });

      const result = inspector.isLocalPortAvailableSync(4196);

      expect(result).toBe(false);
    });

    it('returns false when spawnSync errors', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockSpawnSync.mockReturnValueOnce({ status: null, error: new Error('spawn error') });

      const result = inspector.isLocalPortAvailableSync(4196);

      expect(result).toBe(false);
    });

    it('returns true when port is available on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockSpawnSync.mockReturnValueOnce({ status: 0, error: null });

      const result = inspector.isLocalPortAvailableSync(4196);

      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining(['-NoProfile', '-Command']),
        expect.objectContaining({ stdio: 'ignore', windowsHide: true }),
      );
    });
  });
});
