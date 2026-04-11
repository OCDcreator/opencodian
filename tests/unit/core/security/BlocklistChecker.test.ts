import { isCommandBlocked } from '../../../../src/core/security/BlocklistChecker';

describe('BlocklistChecker', () => {
  it('allows commands when blocklist checking is disabled', () => {
    expect(isCommandBlocked('rm -rf /tmp/test', ['rm\\s+-rf'], false)).toBe(false);
  });

  it('matches regex patterns case-insensitively', () => {
    expect(isCommandBlocked('RM -RF /tmp/test', ['rm\\s+-rf'], true)).toBe(true);
  });

  it('falls back to substring matching for invalid regex patterns', () => {
    expect(isCommandBlocked('please delete( the workspace', ['delete('], true)).toBe(true);
  });

  it('falls back to substring matching for overly long patterns', () => {
    const longPattern = `${'abc'.repeat(167)}danger`;

    expect(isCommandBlocked('prefix DANGER suffix', [longPattern], true)).toBe(false);
    expect(isCommandBlocked(`prefix ${longPattern.toUpperCase()} suffix`, [longPattern], true)).toBe(true);
  });

  it('returns false when no patterns match', () => {
    expect(isCommandBlocked('npm run test', ['rm\\s+-rf', 'shutdown'], true)).toBe(false);
  });
});
