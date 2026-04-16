import type { ChatMessage } from '../../../../src/core/types';
import {
  createTabActivationConversationSyncRuntimePort,
  type TabActivationConversationSyncRuntimePortHost,
} from '../../../../src/features/chat/services/TabActivationRuntimeViewHostFactory';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

function createFixture() {
  const initialPorts = {
    getConversationSyncFingerprint: jest
      .fn<string, [ChatMessage[]]>()
      .mockReturnValue('fingerprint-initial'),
    setLastConversationSyncFingerprint: jest.fn<void, [string]>(),
    startConversationSyncLoop: jest.fn<void, []>(),
    stopConversationSyncLoop: jest.fn<void, []>(),
  };
  let ports = initialPorts;

  const host: Mocked<TabActivationConversationSyncRuntimePortHost> = {
    getConversationSyncFingerprint: jest.fn((messages) =>
      ports.getConversationSyncFingerprint(messages)),
    setLastConversationSyncFingerprint: jest.fn((fingerprint) => {
      ports.setLastConversationSyncFingerprint(fingerprint);
    }),
    startConversationSyncLoop: jest.fn(() => {
      ports.startConversationSyncLoop();
    }),
    stopConversationSyncLoop: jest.fn(() => {
      ports.stopConversationSyncLoop();
    }),
  };

  return {
    host,
    initialPorts,
    setPorts: (next: typeof initialPorts) => {
      ports = next;
    },
  };
}

describe('TabActivationRuntimeViewHostFactory conversation-sync port', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('groups the tab-activation conversation-sync fingerprint seam into one runtime port', () => {
    const fixture = createFixture();
    const runtime = createTabActivationConversationSyncRuntimePort(fixture.host);

    expect(runtime.getConversationSyncFingerprint([])).toBe('fingerprint-initial');
    runtime.setLastConversationSyncFingerprint('fingerprint-next');
    runtime.startConversationSyncLoop();
    runtime.stopConversationSyncLoop();

    expect(fixture.host.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(fixture.host.setLastConversationSyncFingerprint).toHaveBeenCalledWith(
      'fingerprint-next',
    );
    expect(fixture.host.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.host.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.initialPorts.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(fixture.initialPorts.setLastConversationSyncFingerprint).toHaveBeenCalledWith(
      'fingerprint-next',
    );
    expect(fixture.initialPorts.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(fixture.initialPorts.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
  });

  it('keeps the grouped runtime port late-bound to the latest sync collaborators', () => {
    const fixture = createFixture();
    const runtime = createTabActivationConversationSyncRuntimePort(fixture.host);
    const nextPorts = {
      getConversationSyncFingerprint: jest
        .fn<string, [ChatMessage[]]>()
        .mockReturnValue('fingerprint-next'),
      setLastConversationSyncFingerprint: jest.fn<void, [string]>(),
      startConversationSyncLoop: jest.fn<void, []>(),
      stopConversationSyncLoop: jest.fn<void, []>(),
    };

    fixture.setPorts(nextPorts);

    expect(runtime.getConversationSyncFingerprint([])).toBe('fingerprint-next');
    runtime.setLastConversationSyncFingerprint('fingerprint-late-bound');
    runtime.startConversationSyncLoop();
    runtime.stopConversationSyncLoop();

    expect(nextPorts.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(nextPorts.setLastConversationSyncFingerprint).toHaveBeenCalledWith(
      'fingerprint-late-bound',
    );
    expect(nextPorts.startConversationSyncLoop).toHaveBeenCalledTimes(1);
    expect(nextPorts.stopConversationSyncLoop).toHaveBeenCalledTimes(1);
  });
});
