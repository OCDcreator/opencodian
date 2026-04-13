import {
  OpenCodeStreamingRuntimeCoordinator,
  type OpenCodeStreamingRuntimeCoordinatorHost,
} from '../../../../src/core/opencode/OpenCodeStreamingRuntimeCoordinator';

function createHost(
  overrides: Partial<OpenCodeStreamingRuntimeCoordinatorHost> = {},
): jest.Mocked<OpenCodeStreamingRuntimeCoordinatorHost> {
  return {
    abortSessionOnServer: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as jest.Mocked<OpenCodeStreamingRuntimeCoordinatorHost>;
}

describe('OpenCodeStreamingRuntimeCoordinator', () => {
  it('tracks part types independently across concurrent session contexts', () => {
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(createHost());
    const left = coordinator.createActiveStreamContext('session-left');
    const right = coordinator.createActiveStreamContext('session-right');

    left.setPartType('part-1', 'thinking');
    right.setPartType('part-1', 'tool');

    expect(left.getPartType('part-1')).toBe('thinking');
    expect(right.getPartType('part-1')).toBe('tool');
    expect(left.hasPartType('missing')).toBe(false);
  });

  it('replaces only the current session context and keeps the replacement registered', () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const original = coordinator.createActiveStreamContext('session-1');
    const otherSession = coordinator.createActiveStreamContext('session-2');

    const replacement = coordinator.createActiveStreamContext('session-1');
    coordinator.releaseActiveStreamContext(original);
    coordinator.cancelStream('session-1');

    expect(original.signal.aborted).toBe(true);
    expect(otherSession.signal.aborted).toBe(false);
    expect(replacement.signal.aborted).toBe(true);
    expect(host.abortSessionOnServer).toHaveBeenCalledWith('session-1');
  });

  it('cancels server-side work only for explicit cancellation, not local detach', () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);
    const cancelContext = coordinator.createActiveStreamContext('session-cancel');
    const detachContext = coordinator.createActiveStreamContext('session-detach');

    coordinator.cancelStream('session-cancel');
    coordinator.detachStream('session-detach');

    expect(cancelContext.signal.aborted).toBe(true);
    expect(detachContext.signal.aborted).toBe(true);
    expect(host.abortSessionOnServer).toHaveBeenCalledTimes(1);
    expect(host.abortSessionOnServer).toHaveBeenCalledWith('session-cancel');
  });

  it('ignores missing or inactive sessions without calling server abort', () => {
    const host = createHost();
    const coordinator = new OpenCodeStreamingRuntimeCoordinator(host);

    coordinator.cancelStream();
    coordinator.cancelStream('missing-session');
    coordinator.detachStream();
    coordinator.detachStream('missing-session');

    expect(host.abortSessionOnServer).not.toHaveBeenCalled();
  });
});
