import {
  ConversationTabLifecycleRecoveryCoordinator,
  type ConversationTabLifecycleRecoveryHost,
  type ConversationTabLifecycleRecoveryPort,
} from '../../../../src/features/chat/services/ConversationTabLifecycleRecoveryCoordinator';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';

describe('ConversationTabLifecycleRecoveryCoordinator diagnostics cancellation', () => {
  it('continues a tab-close recovery when Codex cancellation throws', async () => {
    const tabs = new TabManager('New chat', { getMaxTabs: () => 4 });
    const survivor = tabs.createTab({ id: 'survivor', title: 'Survivor' });
    const closing = tabs.createTab({ id: 'closing', title: 'Closing' });
    const host: ConversationTabLifecycleRecoveryHost = {
      getTabManager: () => tabs,
      isTabForegroundBusy: () => false,
      getCurrentConversationId: () => null,
      createConversation: jest.fn(),
      deleteConversation: jest.fn(),
      clearTabMessagesPanes: jest.fn(),
      resetTabManager: jest.fn(),
      removeTabMessagesPane: jest.fn(),
      cancelCodexDiagnosticCapture: jest.fn(() => { throw new Error('sk-canary /vault/secret'); }),
      showNotice: jest.fn(),
    };
    const port: ConversationTabLifecycleRecoveryPort = {
      activateTab: jest.fn().mockResolvedValue(undefined),
      createConversationInNewTab: jest.fn(),
    };

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(new ConversationTabLifecycleRecoveryCoordinator(host, port).closeTabAndRecover(closing!.id)).resolves.toBeUndefined();

    expect(host.removeTabMessagesPane).toHaveBeenCalledWith(closing!.id);
    expect(port.activateTab).toHaveBeenCalledWith(survivor!.id);
    const logged = warn.mock.calls.flat().map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
    expect(logged).not.toContain('sk-canary');
    expect(logged).not.toContain('/vault/');
  });

  it('cancels every capture before reset even when a trace hook throws', async () => {
    const tabs = new TabManager('New chat', { getMaxTabs: () => 4 });
    const first = tabs.createTab({ id: 'first', title: 'First' });
    const second = tabs.createTab({ id: 'second', title: 'Second' });
    const cancelCodexDiagnosticCapture = jest.fn((tabId: string) => {
      if (tabId === first?.id) throw new Error('sk-canary /vault/secret');
    });
    const host: ConversationTabLifecycleRecoveryHost = {
      getTabManager: () => tabs,
      isTabForegroundBusy: () => false,
      getCurrentConversationId: () => null,
      createConversation: jest.fn(),
      deleteConversation: jest.fn().mockResolvedValue(undefined),
      clearTabMessagesPanes: jest.fn(),
      resetTabManager: jest.fn(),
      removeTabMessagesPane: jest.fn(),
      cancelOpenCodeDiagnosticCapture: jest.fn(),
      cancelCodexDiagnosticCapture,
      showNotice: jest.fn(),
    };
    const port: ConversationTabLifecycleRecoveryPort = {
      activateTab: jest.fn().mockResolvedValue(undefined),
      createConversationInNewTab: jest.fn().mockResolvedValue(undefined),
    };
    const coordinator = new ConversationTabLifecycleRecoveryCoordinator(host, port);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(coordinator.deleteAllConversationsAndReset(['first', 'second'])).resolves.toBeUndefined();

    expect(cancelCodexDiagnosticCapture).toHaveBeenCalledWith(first!.id);
    expect(cancelCodexDiagnosticCapture).toHaveBeenCalledWith(second!.id);
    expect(host.resetTabManager).toHaveBeenCalledTimes(1);
    expect(port.createConversationInNewTab).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls.flat().map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
    expect(logged).not.toContain('sk-canary');
    expect(logged).not.toContain('/vault/');
  });
});
