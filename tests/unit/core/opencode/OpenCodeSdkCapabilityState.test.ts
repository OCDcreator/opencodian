import {
  type OpenCodeSdkCapabilityAvailabilityInput,
  resolveCapabilityAvailability,
} from '../../../../src/core/opencode/OpenCodeSdkCapabilityState';

describe('OpenCodeSdkCapabilityState', () => {
  describe('resolveCapabilityAvailability', () => {
    it('returns available when sdk+server+gate are true for read-only risk', () => {
      expect(
        resolveCapabilityAvailability({ sdk: true, server: true, gate: true, safety: 'read-only' }),
      ).toMatchObject({ kind: 'available' });
    });

    it('returns unsupported-by-server when server is false', () => {
      expect(
        resolveCapabilityAvailability({ sdk: true, server: false, gate: true, safety: 'read-only' }),
      ).toMatchObject({ kind: 'unsupported-by-server' });
    });

    it('returns disabled-by-user when gate is false for experimental-action', () => {
      expect(
        resolveCapabilityAvailability({ sdk: true, server: true, gate: false, safety: 'experimental-action' }),
      ).toMatchObject({ kind: 'disabled-by-user', reasonCode: 'disabled-by-user' });
    });

    it('returns unsupported-by-sdk when sdk is false', () => {
      expect(
        resolveCapabilityAvailability({ sdk: false, server: true, gate: true, safety: 'read-only' }),
      ).toMatchObject({ kind: 'unsupported-by-sdk' });
    });

    it('returns disabled-by-user when gate is false even for read-only', () => {
      expect(
        resolveCapabilityAvailability({ sdk: true, server: true, gate: false, safety: 'read-only' }),
      ).toMatchObject({ kind: 'disabled-by-user' });
    });

    it('returns unsupported-by-sdk before checking server or gate', () => {
      // sdk=false is the most fundamental block
      expect(
        resolveCapabilityAvailability({ sdk: false, server: false, gate: false, safety: 'read-only' }),
      ).toMatchObject({ kind: 'unsupported-by-sdk' });
    });

    it('returns available for experimental-action when all gates pass', () => {
      expect(
        resolveCapabilityAvailability({ sdk: true, server: true, gate: true, safety: 'experimental-action' }),
      ).toMatchObject({ kind: 'available' });
    });

    it('returns available for state-changing when all gates pass', () => {
      expect(
        resolveCapabilityAvailability({ sdk: true, server: true, gate: true, safety: 'state-changing' }),
      ).toMatchObject({ kind: 'available' });
    });

    it('includes a redactable reason for unsupported-by-server', () => {
      const result = resolveCapabilityAvailability({
        sdk: true,
        server: false,
        gate: true,
        safety: 'read-only',
      });
      expect(result.kind).toBe('unsupported-by-server');
      expect(result).toMatchObject({ kind: 'unsupported-by-server' });
      const reason = (result as { reason?: string }).reason;
      expect(typeof reason).toBe('string');
      expect((reason ?? '').length).toBeGreaterThan(0);
    });

    it('includes the raw server failure class for unknown transport failures', () => {
      const result = resolveCapabilityAvailability({
        sdk: true,
        server: 'unknown',
        gate: true,
        safety: 'read-only',
      });
      // 'unknown' server support must not be promoted to 'unsupported-by-server'.
      expect(result.kind).toBe('unknown');
    });
  });

  describe('availability kind exhaustiveness', () => {
    const safetyClasses: OpenCodeSdkCapabilityAvailabilityInput['safety'][] = [
      'read-only',
      'state-changing',
      'experimental-action',
      'stream',
    ];

    it.each(safetyClasses)('resolves all gate combinations for safety=%s', (safety) => {
      // all-true
      expect(
        resolveCapabilityAvailability({ sdk: true, server: true, gate: true, safety }).kind,
      ).toBe('available');
      // gate off
      expect(
        resolveCapabilityAvailability({ sdk: true, server: true, gate: false, safety }).kind,
      ).toBe('disabled-by-user');
    });
  });
});
