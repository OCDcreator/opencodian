import type {
  SessionSyncEventUpdate,
} from '../../../../src/core/opencode';
import {
  type ConversationSyncBridgePortProviderHost,
  createConversationSyncBridgePorts,
} from '../../../../src/features/chat/services/ConversationSyncBridgePortProvider';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createFixture() {
  const initialPorts = {
    startConversationSyncLoop: jest.fn<void, []>(),
    stopConversationSyncLoop: jest.fn<void, []>(),
    clearScheduledSignalConversationSync: jest.fn<void, [string | null]>(),
    scheduleConversationSyncFromSignal: jest.fn<
      void,
      [string | null, SessionSyncEventUpdate['type']]
    >(),
    syncVisibleConversationInBackground: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };
  let ports = initialPorts;

  const host: Mocked<ConversationSyncBridgePortProviderHost> = {
    startConversationSyncLoop: jest.fn(() => {
      ports.startConversationSyncLoop();
    }),
    stopConversationSyncLoop: jest.fn(() => {
      ports.stopConversationSyncLoop();
    }),
    clearScheduledSignalConversationSync: jest.fn((tabId) => {
      ports.clearScheduledSignalConversationSync(tabId);
    }),
    scheduleConversationSyncFromSignal: jest.fn((tabId, reason) => {
      ports.scheduleConversationSyncFromSignal(tabId, reason);
    }),
    syncVisibleConversationInBackground: jest.fn(() =>
      ports.syncVisibleConversationInBackground()),
  };

  return {
    host,
    initialPorts,
    setPorts: (next: typeof initialPorts) => {
      ports = next;
    },
  };
}

describe('ConversationSyncBridgePortProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the thin sync scheduling seam into loop, signal, and visible follow-up ports', async () => {
    const fixture = createFixture();
    const ports = createConversationSyncBridgePorts(fixture.host);

    ports.getLoopControl().startConversationSyncLoop();
    ports.getLoopControl().stopConversationSyncLoop();
    ports.getSignalScheduler().clearScheduledSignalConversationSync('tab-active');
    ports.getSignalScheduler().scheduleConversationSyncFromSignal('tab-hidden', 'session.diff');
    await ports.getVisibleSyncFollowUp().syncVisibleConversationInBackground();
    ports.getVisibleSyncFollowUp().startConversationSyncLoop();

    expect(fixture.host.startConversationSyncLoop).toHaveBeenCalledTimes(2);
    expect(fixture.host.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.host.clearScheduledSignalConversationSync).toHaveBeenCalledWith('tab-active');
    expect(fixture.host.scheduleConversationSyncFromSignal).toHaveBeenCalledWith(
      'tab-hidden',
      'session.diff',
    );
    expect(fixture.host.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
    expect(fixture.initialPorts.startConversationSyncLoop).toHaveBeenCalledTimes(2);
    expect(fixture.initialPorts.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.initialPorts.clearScheduledSignalConversationSync).toHaveBeenCalledWith(
      'tab-active',
    );
    expect(fixture.initialPorts.scheduleConversationSyncFromSignal).toHaveBeenCalledWith(
      'tab-hidden',
      'session.diff',
    );
    expect(fixture.initialPorts.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
  });

  it('keeps grouped ports late-bound to the latest sync collaborators', async () => {
    const fixture = createFixture();
    const ports = createConversationSyncBridgePorts(fixture.host);
    const nextPorts = {
      startConversationSyncLoop: jest.fn<void, []>(),
      stopConversationSyncLoop: jest.fn<void, []>(),
      clearScheduledSignalConversationSync: jest.fn<void, [string | null]>(),
      scheduleConversationSyncFromSignal: jest.fn<
        void,
        [string | null, SessionSyncEventUpdate['type']]
      >(),
      syncVisibleConversationInBackground: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    };

    fixture.setPorts(nextPorts);

    ports.getLoopControl().startConversationSyncLoop();
    ports.getLoopControl().stopConversationSyncLoop();
    ports.getSignalScheduler().clearScheduledSignalConversationSync('tab-next');
    ports.getSignalScheduler().scheduleConversationSyncFromSignal('tab-next', 'message.updated');
    await ports.getVisibleSyncFollowUp().syncVisibleConversationInBackground();

    expect(nextPorts.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(nextPorts.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(nextPorts.clearScheduledSignalConversationSync).toHaveBeenCalledWith('tab-next');
    expect(nextPorts.scheduleConversationSyncFromSignal).toHaveBeenCalledWith(
      'tab-next',
      'message.updated',
    );
    expect(nextPorts.syncVisibleConversationInBackground).toHaveBeenCalledTimes(1);
  });
});
