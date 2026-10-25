import { App } from 'obsidian';

import { AgentServiceRegistry } from '../../../../src/core/agents/backend/AgentServiceRegistry';
import { DshAdapter } from '../../../../src/core/agents/backend/dsh/DshAdapter';
import { normalizeDshBackendSettings } from '../../../../src/core/types/settings';
import { type BackendSessionBrowserHost, BackendSessionBrowserModal } from '../../../../src/features/chat/ui/BackendSessionBrowserModal';
import { t } from '../../../../src/i18n';

it.each(['native', 'acp'] as const)('preserves DSH %s preview history, identity and owner', async (transport) => {
  const registry = new AgentServiceRegistry();
  const adapter = new DshAdapter({ workingDirectory: '/vault', getSettings: () => ({ ...normalizeDshBackendSettings(undefined), transport }) });
  const history = jest.spyOn(adapter, 'getSessionMessages');
  if (transport === 'native') history.mockResolvedValue([
    { id: 'native-message-id', role: 'assistant', content: [{ type: 'text', text: 'Native DSH transcript' }] },
    { id: 'native-tool-id', info: { role: 'activity' }, parts: [{ type: 'text', text: 'Tool result: native output' }] },
  ]);
  else history.mockRejectedValue(new Error('ACP has no transcript API'));
  registry.register(adapter);
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
    expect(previewEl.textContent).toContain(transport === 'native' ? 'Native DSH transcript' : t('chat.backendSessions.dshResumeWithoutHistory'));
    await seam.resumeSession('native-dsh-session');
    const importedHistory = expect.arrayContaining([
      expect.objectContaining({ id: 'native-message-id', sourceMessageId: 'native-message-id', content: 'Native DSH transcript' }),
      expect.objectContaining({ id: 'native-tool-id', content: 'Tool result: native output' }),
    ]);
    expect(host.createConversationFromBackendSession).toHaveBeenCalledWith('native-dsh-session', 'DSH work',
      transport === 'native' ? importedHistory : undefined, 'dsh');
    expect(host.loadConversation).toHaveBeenCalledWith('local-dsh-conversation');
    expect(registry.get('dsh')?.status).toBe('disconnected');
  } finally {
    modal.close();
    registry.dispose();
  }
});
