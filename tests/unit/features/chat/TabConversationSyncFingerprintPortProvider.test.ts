import {
  createTabConversationSyncFingerprintRuntimePort,
  type TabConversationSyncFingerprintPortProviderHost,
} from '../../../../src/features/chat/services/TabConversationSyncFingerprintPortProvider';

type Mocked<T> = {
  [Key in keyof T]:
    T[Key] extends (...args: infer Args) => infer Result
      ? jest.Mock<Result, Args>
      : T[Key];
};

describe('TabConversationSyncFingerprintPortProvider', () => {
  it('regroups fingerprint read/write callbacks into a reusable runtime port', () => {
    const host: Mocked<TabConversationSyncFingerprintPortProviderHost> = {
      getConversationSyncFingerprint: jest.fn(() => 'fingerprint-next'),
      setTabConversationSyncFingerprint: jest.fn(),
    };

    const port = createTabConversationSyncFingerprintRuntimePort(host);

    expect(port.getConversationSyncFingerprint([])).toBe('fingerprint-next');
    port.setTabConversationSyncFingerprint('tab-1', 'fingerprint-next');

    expect(host.getConversationSyncFingerprint).toHaveBeenCalledWith([]);
    expect(host.setTabConversationSyncFingerprint)
      .toHaveBeenCalledWith('tab-1', 'fingerprint-next');
  });
});
