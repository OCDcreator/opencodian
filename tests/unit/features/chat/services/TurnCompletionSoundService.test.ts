/**
 * TurnCompletionSoundService unit tests (advantage-parity R-D3).
 *
 * The trigger gate is the whole feature:
 * - off by default, and stays silent for a foreground regular turn
 * - fires for a background task even while focused, and for any turn while
 *   the window is unfocused
 * - custom path resolved → plays the custom URL; unresolvable → honest
 *   notice + builtin fallback; playback rejection never throws into chat
 */

import {
  resolveTurnCompletionSoundSource,
  type TurnCompletionSoundHostState,
  TurnCompletionSoundService,
} from '../../../../../src/features/chat/services/TurnCompletionSoundService';

function host(overrides: Partial<TurnCompletionSoundHostState> = {}): TurnCompletionSoundHostState {
  return {
    isWindowFocused: () => true,
    getResourcePath: (path) => (path === 'audio/done.wav' ? 'app://custom.wav' : null),
    showNotice: () => undefined,
    ...overrides,
  };
}

describe('resolveTurnCompletionSoundSource', () => {
  it('uses the custom resource URL when the vault file resolves', () => {
    const result = resolveTurnCompletionSoundSource(
      { customPath: ' audio/done.wav ' },
      host(),
    );
    expect(result.url).toBe('app://custom.wav');
    expect(result.degradedToBuiltin).toBe(false);
  });

  it('falls back to the embedded builtin chime (marked) when unresolvable or empty', () => {
    const degraded = resolveTurnCompletionSoundSource({ customPath: 'missing.wav' }, host());
    expect(degraded.degradedToBuiltin).toBe(true);
    expect(degraded.url.startsWith('data:audio/wav;base64,UklGR')).toBe(true);

    const builtin = resolveTurnCompletionSoundSource({ customPath: '' }, host());
    expect(builtin.degradedToBuiltin).toBe(false);
    expect(builtin.url.startsWith('data:audio/wav;base64,UklGR')).toBe(true);
  });
});

describe('playForTurnCompletion trigger gate', () => {
  const settings = { enabled: true, customPath: '' };

  it('does nothing while disabled', () => {
    const svc = new TurnCompletionSoundService(host(), () => ({ play: jest.fn() }));
    expect(svc.playForTurnCompletion({ ...settings, enabled: false }, { isBackgroundTask: true }))
      .toEqual({ played: false, reason: 'disabled' });
  });

  it('stays silent for a foreground regular turn', () => {
    const svc = new TurnCompletionSoundService(host(), () => ({ play: jest.fn() }));
    expect(svc.playForTurnCompletion(settings, { isBackgroundTask: false }))
      .toEqual({ played: false, reason: 'foreground-regular-turn' });
  });

  it('plays for a background task while focused, and for any turn while unfocused', () => {
    const playedUrls: string[] = [];
    const svc = new TurnCompletionSoundService(host(), (url) => {
      playedUrls.push(url);
      return { play: jest.fn().mockResolvedValue(undefined) };
    });
    expect(svc.playForTurnCompletion(settings, { isBackgroundTask: true }))
      .toEqual({ played: true, reason: 'played' });

    const unfocused = new TurnCompletionSoundService(
      host({ isWindowFocused: () => false }),
      (url) => {
        playedUrls.push(url);
        return { play: jest.fn().mockResolvedValue(undefined) };
      },
    );
    expect(unfocused.playForTurnCompletion(settings, { isBackgroundTask: false }))
      .toEqual({ played: true, reason: 'played' });
    expect(playedUrls).toHaveLength(2);
    for (const url of playedUrls) {
      expect(url.startsWith('data:audio/wav;base64,')).toBe(true);
    }
  });

  it('notices honestly and still plays the builtin when the custom path is unresolvable', () => {
    const notices: string[] = [];
    const svc = new TurnCompletionSoundService(
      host({ showNotice: (m) => notices.push(m) }),
      () => ({ play: jest.fn().mockResolvedValue(undefined) }),
    );
    const result = svc.playForTurnCompletion(
      { enabled: true, customPath: 'missing.wav' },
      { isBackgroundTask: true },
    );
    expect(result).toEqual({ played: true, reason: 'played' });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('missing.wav');
  });

  it('swallows playback rejections and reports no-audio when construction fails', () => {
    const play = jest.fn().mockRejectedValue(new Error('autoplay blocked'));
    const svc = new TurnCompletionSoundService(host(), () => ({ play }));
    expect(svc.playForTurnCompletion(settings, { isBackgroundTask: true }))
      .toEqual({ played: true, reason: 'played' });

    const none = new TurnCompletionSoundService(host(), () => null);
    expect(none.playForTurnCompletion(settings, { isBackgroundTask: true }))
      .toEqual({ played: false, reason: 'no-audio' });
  });
});
