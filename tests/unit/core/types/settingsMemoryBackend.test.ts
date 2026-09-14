import { normalizeMemoryBackendUserSettings } from '../../../../src/core/types/settings';

describe('memory backend settings normalization', () => {
  it('defaults the shared-store fields to empty and drops non-strings', () => {
    expect(normalizeMemoryBackendUserSettings(undefined)).toMatchObject({
      memoryExternalRoot: '',
      memorySyncRemoteUrl: '',
    });
    expect(normalizeMemoryBackendUserSettings({
      memoryExternalRoot: 42,
      memorySyncRemoteUrl: null,
    })).toMatchObject({
      memoryExternalRoot: '',
      memorySyncRemoteUrl: '',
    });
  });

  it('trims and caps the shared root at 300 chars and the remote URL at 500', () => {
    const out = normalizeMemoryBackendUserSettings({
      memoryExternalRoot: `  ${'r'.repeat(400)}  `,
      memorySyncRemoteUrl: ` ${'u'.repeat(600)} `,
    });
    expect(out.memoryExternalRoot).toBe('r'.repeat(300));
    expect(out.memorySyncRemoteUrl).toBe('u'.repeat(500));
  });

  it('keeps a tilde-prefixed shared root verbatim (expansion happens per host)', () => {
    expect(normalizeMemoryBackendUserSettings({
      memoryExternalRoot: '~/.zcode/cli/memories',
    }).memoryExternalRoot).toBe('~/.zcode/cli/memories');
  });
});
