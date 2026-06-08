import * as obsidian from 'obsidian';

import { ToolDetailModal } from '../../../../src/features/settings/SettingsToolDetailModal';
import { setLocale, t } from '../../../../src/i18n';

function createPlugin() {
  return {
    app: {
      vault: {
        adapter: {
          remove: jest.fn().mockResolvedValue(undefined),
          write: jest.fn().mockResolvedValue(undefined),
        },
      },
    },
    settings: {
      activeBackend: 'opencode',
      enabledBackends: ['opencode', 'claude-code'],
    },
  };
}

describe('ToolDetailModal backend guard', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('blocks stale project tool save/delete callbacks after switching to Claude Code', async () => {
    const noticeSpy = jest.spyOn(obsidian, 'Notice').mockImplementation(() => undefined as never);
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const plugin = createPlugin();
    const onSaved = jest.fn().mockResolvedValue(undefined);
    const modal = new ToolDetailModal({
      file: {
        content: 'export default tool({ description: "test", args: {}, async execute() { return "ok"; } });',
        name: 'test-tool',
        path: '.opencode/tools/test-tool.ts',
        source: 'project',
      },
      onSaved,
      plugin: plugin as never,
    });

    modal.onOpen();
    plugin.settings.activeBackend = 'claude-code';
    const buttons = Array.from(modal.contentEl.querySelectorAll<HTMLButtonElement>('button'));
    const saveButton = buttons.find((button) => button.textContent === t('settings.tools.custom.modal.save'));
    const deleteButton = buttons.find((button) => button.textContent === t('settings.tools.custom.delete'));

    saveButton?.click();
    await Promise.resolve();
    deleteButton?.click();
    await Promise.resolve();

    expect(plugin.app.vault.adapter.write).not.toHaveBeenCalled();
    expect(plugin.app.vault.adapter.remove).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenLastCalledWith(t('settings.tools.notice.openCodeOnly'));
  });
});
