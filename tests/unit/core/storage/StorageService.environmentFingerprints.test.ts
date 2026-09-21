/**
 * advantage-parity R-F7: StorageService environment-fingerprint persistence —
 * runtime.json read/write round-trip with honest failure paths.
 */

import { StorageService } from '../../../../src/core/storage/StorageService';

const mockAdapter = {
  basePath: '/test/vault',
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  write: jest.fn().mockResolvedValue(undefined),
  writeBinary: jest.fn().mockResolvedValue(undefined),
  read: jest.fn().mockResolvedValue('{}'),
  readBinary: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
  remove: jest.fn().mockResolvedValue(undefined),
  list: jest.fn().mockResolvedValue({ files: [], folders: [] }),
};

const buildStorage = (): StorageService =>
  new StorageService({ app: { vault: { adapter: mockAdapter } } } as unknown as Parameters<typeof StorageService>[0]);

beforeEach(() => {
  jest.clearAllMocks();
  mockAdapter.read.mockResolvedValue('{}');
});

describe('StorageService environment fingerprints (R-F7)', () => {
  it('returns null when runtime.json has no fingerprints', async () => {
    const storage = buildStorage();
    await expect(storage.loadEnvironmentFingerprints()).resolves.toBeNull();
  });

  it('round-trips fingerprints through runtime.json (read-modify-write)', async () => {
    const storage = buildStorage();
    await storage.saveEnvironmentFingerprints({ 'claude-code': 'aa', pi: 'bb' });

    expect(mockAdapter.write).toHaveBeenCalledWith(
      '.opencodian/runtime.json',
      expect.stringContaining('environmentFingerprints'),
    );

    // The written payload round-trips: feed it back through the mock adapter.
    const written = mockAdapter.write.mock.calls[0][1] as string;
    mockAdapter.read.mockResolvedValue(written);
    await expect(storage.loadEnvironmentFingerprints()).resolves.toEqual({
      'claude-code': 'aa',
      pi: 'bb',
    });
  });

  it('preserves managedServer state when writing fingerprints', async () => {
    mockAdapter.read.mockResolvedValue(JSON.stringify({ managedServer: { pid: 1234 } }));
    const storage = buildStorage();
    await storage.saveEnvironmentFingerprints({ opencode: 'cc' });

    const written = JSON.parse(mockAdapter.write.mock.calls[0][1] as string);
    expect(written.managedServer).toEqual({ pid: 1234 });
    expect(written.environmentFingerprints).toEqual({ opencode: 'cc' });
  });

  it('filters non-string junk from stored fingerprints', async () => {
    mockAdapter.read.mockResolvedValue(JSON.stringify({
      environmentFingerprints: { pi: 'aa', junk: 42, empty: '' },
    }));
    const storage = buildStorage();
    await expect(storage.loadEnvironmentFingerprints()).resolves.toEqual({ pi: 'aa', empty: '' });
  });

  it('returns null when the runtime file cannot be read', async () => {
    mockAdapter.read.mockRejectedValue(new Error('missing file'));
    const storage = buildStorage();
    await expect(storage.loadEnvironmentFingerprints()).resolves.toBeNull();
  });

  it('swallows write failures with a warning instead of throwing', async () => {
    mockAdapter.write.mockRejectedValue(new Error('disk full'));
    const storage = buildStorage();
    await expect(storage.saveEnvironmentFingerprints({ pi: 'aa' })).resolves.toBeUndefined();
  });
});
