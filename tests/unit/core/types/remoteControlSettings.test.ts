import {
  normalizeRemoteControlBindAddress,
  normalizeRemoteControlEnabled,
  normalizeRemoteControlNonLoopbackAcknowledgedAt,
  normalizeRemoteControlToken,
} from '../../../../src/core/types/settings';
import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';

function loadWith(data: unknown) {
  return prepareLoadedSettingsBootstrapState({
    core: {
      data,
      filePath: '.opencodian/settings.core.json',
      source: 'primary',
      shouldPersist: false,
    },
    ui: {
      data: null,
      filePath: '.opencodian/settings.ui.json',
      source: 'missing',
      shouldPersist: false,
    },
    writable: true,
    shouldPersist: false,
  }).settings;
}

describe('R-C6 remote control settings normalization', () => {
  it('defaults every field safely for a fresh install', () => {
    const settings = loadWith(null);
    expect(settings.remoteControlEnabled).toBe(false);
    expect(settings.remoteControlBindAddress).toBe('127.0.0.1');
    expect(settings.remoteControlToken).toBe('');
    expect(settings.remoteControlNonLoopbackAcknowledgedAt).toBe('');
  });

  describe('normalizeRemoteControlEnabled', () => {
    it.each([[undefined], [null], ['true'], [1], [0], [{}]])('coerces %j to false', (value) => {
      expect(normalizeRemoteControlEnabled(value)).toBe(false);
    });
    it('keeps an explicit true', () => {
      expect(normalizeRemoteControlEnabled(true)).toBe(true);
    });
  });

  describe('normalizeRemoteControlBindAddress', () => {
    it('normalizes localhost to the 127.0.0.1 listener', () => {
      expect(normalizeRemoteControlBindAddress('localhost')).toBe('127.0.0.1');
      expect(normalizeRemoteControlBindAddress('  LocalHost  ')).toBe('127.0.0.1');
    });

    it('keeps loopback literals verbatim', () => {
      expect(normalizeRemoteControlBindAddress('::1')).toBe('::1');
      expect(normalizeRemoteControlBindAddress(' 127.0.0.1 ')).toBe('127.0.0.1');
    });

    it('keeps a non-loopback value (the service, not normalization, gates it on the acknowledgement)', () => {
      expect(normalizeRemoteControlBindAddress('192.168.1.10')).toBe('192.168.1.10');
      expect(normalizeRemoteControlBindAddress('0.0.0.0')).toBe('0.0.0.0');
    });

    it.each([[undefined], [null], [42], [{}], [''], ['   '], ['x'.repeat(46)]])(
      'falls back to the loopback default for %j',
      (value) => {
        expect(normalizeRemoteControlBindAddress(value)).toBe('127.0.0.1');
      },
    );
  });

  describe('normalizeRemoteControlToken', () => {
    it('keeps a well-formed token, trimmed', () => {
      expect(normalizeRemoteControlToken('  abc_DEF-123  ')).toBe('abc_DEF-123');
    });

    it.each([[undefined], [null], [42], [{}], [''], ['   '], ['x'.repeat(201)]])(
      'fails closed to empty for %j',
      (value) => {
        expect(normalizeRemoteControlToken(value)).toBe('');
      },
    );
  });

  describe('normalizeRemoteControlNonLoopbackAcknowledgedAt', () => {
    it('keeps a timestamp-looking string', () => {
      const iso = '2026-09-18T12:34:56.789Z';
      expect(normalizeRemoteControlNonLoopbackAcknowledgedAt(iso)).toBe(iso);
    });

    it.each([[undefined], [null], [42], [{}], [''], ['x'.repeat(41)]])(
      'clears invalid acknowledgements for %j',
      (value) => {
        expect(normalizeRemoteControlNonLoopbackAcknowledgedAt(value)).toBe('');
      },
    );
  });

  it('survives a persisted enabled+acknowledged configuration round trip', () => {
    const settings = loadWith({
      remoteControlEnabled: true,
      remoteControlBindAddress: 'localhost',
      remoteControlToken: 'stored-token-value',
      remoteControlNonLoopbackAcknowledgedAt: '2026-09-18T00:00:00.000Z',
    });
    expect(settings.remoteControlEnabled).toBe(true);
    expect(settings.remoteControlBindAddress).toBe('127.0.0.1');
    expect(settings.remoteControlToken).toBe('stored-token-value');
    expect(settings.remoteControlNonLoopbackAcknowledgedAt).toBe('2026-09-18T00:00:00.000Z');
  });
});
