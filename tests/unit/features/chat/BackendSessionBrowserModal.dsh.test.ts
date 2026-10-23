import { App } from 'obsidian';

import { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { DshAdapter } from '../../../../src/core/agents/backend/dsh/DshAdapter';
import { normalizeDshBackendSettings } from '../../../../src/core/types/settings';
import { type BackendSessionBrowserHost, BackendSessionBrowserModal } from '../../../../src/features/chat/ui/BackendSessionBrowserModal';
import { t } from '../../../../src/i18n';

it('labels DSH resume without history and preserves its native identity and owner', async () => {
  const registry = new AgentServiceRegistry();
  registry.register(new DshAdapter({ workingDirectory: '/vault', getSettings: () => normalizeDshBackendSettings(undefined) }));
  registry.setEnabled('dsh');
  const host: BackendSessionBrowserHost = {
    getAgentServiceRegistry: () => registry,
    getActiveBackendKind: () => 'codex',
    forcedBackendKind: 'dsh',
    createConversationFromBackendSession: jest.fn().mockResolvedValue('local-dsh-conversation'),
    loadConversation: jest.fn().mockResolvedValue(undefined),
    showNotice: jest.fn(),
    isStreaming: () => false,
  };
  const modal = new BackendSessionBrowserModal({} as App, host);
  const previewEl = document.createElement('div');
  const seam = modal as unknown as {
    previewEl: HTMLElement;
    sessions: Array<{ id: string; title: string }>;
    loadPreview(id: string): Promise<void>;
    resumeSession(id: string): Promise<void>;
  };
  seam.previewEl = previewEl;
  seam.sessions = [{ id: 'native-dsh-session', title: 'DSH work' }];
  try {
    await seam.loadPreview('native-dsh-session');
    expect(previewEl.textContent).toBe(t('chat.backendSessions.dshResumeWithoutHistory'));
    await seam.resumeSession('native-dsh-session');
    expect(host.createConversationFromBackendSession).toHaveBeenCalledWith('native-dsh-session', 'DSH work', undefined, 'dsh');
    expect(host.loadConversation).toHaveBeenCalledWith('local-dsh-conversation');
    expect(registry.get('dsh')?.status).toBe('disconnected');
  } finally {
    modal.close();
    registry.dispose();
  }
});
