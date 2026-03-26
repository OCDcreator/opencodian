import { TabManager } from '../../../../../src/features/chat/tabs/TabManager';

describe('TabManager', () => {
  function createManager(maxTabs = 3): TabManager {
    return new TabManager('New chat', {
      getMaxTabs: () => maxTabs,
    });
  }

  it('creates tabs and marks the newest one active', () => {
    const manager = createManager();

    const first = manager.createTab({ id: 'conv-1', title: 'Chat 1' });
    const second = manager.createTab({ id: 'conv-2', title: 'Chat 2' });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(manager.getTabCount()).toBe(2);
    expect(manager.getActiveTab()?.conversationId).toBe('conv-2');
    expect(manager.getTabBarItems()[1].isActive).toBe(true);
  });

  it('respects the maxTabs setting', () => {
    const manager = createManager(1);

    expect(manager.createTab({ id: 'conv-1', title: 'Chat 1' })).not.toBeNull();
    expect(manager.createTab({ id: 'conv-2', title: 'Chat 2' })).toBeNull();
  });

  it('switches and closes tabs with fallback activation', () => {
    const manager = createManager();
    const first = manager.createTab({ id: 'conv-1', title: 'Chat 1' })!;
    const second = manager.createTab({ id: 'conv-2', title: 'Chat 2' })!;

    manager.switchToTab(first.id);
    expect(manager.getActiveTab()?.id).toBe(first.id);

    const result = manager.closeTab(first.id);
    expect(result.closed).toBe(true);
    expect(result.nextActiveTabId).toBe(second.id);
    expect(manager.getActiveTab()?.id).toBe(second.id);
  });

  it('stores model override per active tab', () => {
    const manager = createManager();
    manager.createTab({ id: 'conv-1', title: 'Chat 1' });

    manager.setActiveTabModelOverride({ provider: 'anthropic', model: 'claude-sonnet' });

    expect(manager.getActiveTabModelOverride()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet',
    });
  });
});
