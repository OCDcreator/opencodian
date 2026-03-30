import { syncUserMessageStreamingActionState } from '../../../../src/features/chat/userMessageActions';

describe('syncUserMessageStreamingActionState', () => {
  it('toggles rewind and fork buttons with streaming state changes', () => {
    const container = document.createElement('div');
    const rewindBtn = container.createEl('button', { cls: 'opencodian-user-action-btn' });
    const forkBtn = container.createEl('button', { cls: 'opencodian-user-action-btn' });
    const copyBtn = container.createEl('button', { cls: 'opencodian-copy-btn-inline' });

    syncUserMessageStreamingActionState(container, true);

    expect(rewindBtn.disabled).toBe(true);
    expect(forkBtn.disabled).toBe(true);
    expect(copyBtn.disabled).toBe(false);

    syncUserMessageStreamingActionState(container, false);

    expect(rewindBtn.disabled).toBe(false);
    expect(forkBtn.disabled).toBe(false);
    expect(copyBtn.disabled).toBe(false);
  });
});
