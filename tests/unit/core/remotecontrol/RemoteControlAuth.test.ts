import {
  deriveTokenFingerprint,
  extractBearerToken,
  generateRemoteControlToken,
  isLoopbackBindAddress,
  tokensMatch,
} from '../../../../src/core/remotecontrol/RemoteControlAuth';

describe('RemoteControlAuth (R-C6)', () => {
  describe('token generation', () => {
    it('produces 256-bit base64url tokens (~43 chars)', () => {
      const token = generateRemoteControlToken();
      expect(token).toHaveLength(43);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('produces distinct tokens across many generations', () => {
      const tokens = new Set(Array.from({ length: 50 }, () => generateRemoteControlToken()));
      expect(tokens.size).toBe(50);
    });
  });

  describe('fingerprint derivation', () => {
    it('returns the first 12 hex chars of sha256 and is deterministic', () => {
      const token = generateRemoteControlToken();
      const first = deriveTokenFingerprint(token);
      expect(first).toMatch(/^[0-9a-f]{12}$/);
      expect(deriveTokenFingerprint(token)).toBe(first);
    });

    it('never equals the token itself even for short tokens', () => {
      expect(deriveTokenFingerprint('secret-token')).not.toContain('secret-token');
    });
  });

  describe('bearer extraction', () => {
    it.each([
      ['Bearer abc_TOKEN-123', 'abc_TOKEN-123'],
      ['bearer abc_TOKEN-123', 'abc_TOKEN-123'],
      ['BEARER   spaced-out   ', 'spaced-out'],
      ['Bearer  zzz', 'zzz'],
    ])('extracts the credential from %j', (header, expected) => {
      expect(extractBearerToken(header)).toBe(expected);
    });

    it.each([
      [undefined],
      [''],
      ['abc_TOKEN-123'],
      ['Basic abc_TOKEN-123'],
      ['Bearer'],
      ['Bearer '],
      ['Token abc'],
    ])('rejects malformed headers %j', (header) => {
      expect(extractBearerToken(header)).toBeNull();
    });
  });

  describe('timing-safe token comparison', () => {
    const stored = generateRemoteControlToken();
    const sameLengthWrong = 'A'.repeat(stored.length);

    it('accepts the exact stored token', () => {
      expect(tokensMatch(stored, stored)).toBe(true);
    });

    it('rejects a wrong token of identical length', () => {
      expect(tokensMatch(sameLengthWrong, stored)).toBe(false);
    });

    it('rejects a wrong token of different length', () => {
      expect(tokensMatch('short', stored)).toBe(false);
      expect(tokensMatch(`${stored}suffix`, stored)).toBe(false);
    });

    it('rejects a missing credential (fail-closed)', () => {
      expect(tokensMatch(null, stored)).toBe(false);
      expect(tokensMatch('', stored)).toBe(false);
    });

    it('rejects everything when no token was ever issued (fail-closed)', () => {
      expect(tokensMatch(stored, '')).toBe(false);
      expect(tokensMatch(null, '')).toBe(false);
    });
  });

  describe('loopback classification', () => {
    it.each(['127.0.0.1', '::1', 'localhost', '  LOCALHOST  '])('treats %j as loopback', (address) => {
      expect(isLoopbackBindAddress(address)).toBe(true);
    });

    it.each([
      '0.0.0.0',
      '::',
      '::/0',
      '192.168.1.10',
      'example.com',
      '127.0.0.1.evil.com',
      '',
    ])('treats %j as non-loopback', (address) => {
      expect(isLoopbackBindAddress(address)).toBe(false);
    });
  });
});
