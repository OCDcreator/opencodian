import { ChatHeaderPresenter, type ChatHeaderPresenterHost } from '../../../../src/features/chat/services/ChatHeaderPresenter';

function createHost(): jest.Mocked<ChatHeaderPresenterHost> {
  return {
    setTooltipLabel: jest.fn(),
    registerCssChangeListener: jest.fn(),
    resolveAssetUrl: jest.fn(() => ''),
    scheduleChatSurfaceColorSync: jest.fn(),
    scheduleComposerLayoutSync: jest.fn(),
    resolveServerAvailability: jest.fn().mockResolvedValue('checking'),
    isLocalServerMode: jest.fn(() => true),
    refreshContextUsageIndicator: jest.fn(),
    openServerSettings: jest.fn(),
    createConversationInNewTab: jest.fn().mockResolvedValue(undefined),
    createConversationInCurrentTab: jest.fn().mockResolvedValue(undefined),
    showConversationHistory: jest.fn(),
    openConversationSessionSettings: jest.fn(),
    openSettings: jest.fn(),
    isOpenCodeBackend: jest.fn(() => false),
    getActiveBackendKind: jest.fn(() => 'codex'),
    getActiveDiagnosticsTabId: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }),
    getCodexDiagnosticsState: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }),
    showCodexDiagnostics: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }),
  };
}

describe('ChatHeaderPresenter Codex diagnostics isolation', () => {
  it('contains throwing state and click callbacks', () => {
    const host = createHost();
    const headerEl = document.createElement('div');
    const presenter = new ChatHeaderPresenter(host);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    presenter.build(headerEl);

    expect(() => presenter.refreshBackendChrome()).not.toThrow();
    const diagnosticsButton = headerEl.querySelector<HTMLElement>(
      '.opencodian-header-btn[data-action="opencode-diagnostics"]',
    );
    expect(() => diagnosticsButton?.click()).not.toThrow();
    expect(host.showCodexDiagnostics).not.toHaveBeenCalled();
    const logged = warn.mock.calls.flat().map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
    expect(logged).not.toContain('sk-canary');
    expect(logged).not.toContain('/vault/');
  });
});
