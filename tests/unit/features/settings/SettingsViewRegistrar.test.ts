import { VIEW_TYPE_OPENCODIAN_SETTINGS } from '../../../../src/core/types';
import { activateSettingsView, dismissNativeSettingsModals } from '../../../../src/features/settings/SettingsViewRegistrar';

describe('SettingsViewRegistrar', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('dismisses native Obsidian settings modals before activating the editor-area settings view', async () => {
    const nativeSettingsModalEl = document.body.createDiv({ cls: 'modal mod-settings' });
    const closeButtonEl = nativeSettingsModalEl.createEl('button', { cls: 'modal-close-button' });
    const closeSpy = jest.spyOn(closeButtonEl, 'click').mockImplementation(() => {
      nativeSettingsModalEl.remove();
    });
    const settingsLeaf = {
      view: {},
    };
    const workspace = {
      getLeavesOfType: jest.fn(() => [settingsLeaf]),
      getLeaf: jest.fn(),
      revealLeaf: jest.fn(),
    };

    await activateSettingsView({
      app: { workspace },
    } as never);

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('.modal.mod-settings')).toBeNull();
    expect(workspace.getLeavesOfType).toHaveBeenCalledWith(VIEW_TYPE_OPENCODIAN_SETTINGS);
    expect(workspace.getLeaf).not.toHaveBeenCalled();
    expect(workspace.revealLeaf).toHaveBeenCalledWith(settingsLeaf);
  });

  it('does not dismiss non-settings modals', () => {
    const regularModalEl = document.body.createDiv({ cls: 'modal opencodian-skill-detail-modal' });
    const closeButtonEl = regularModalEl.createEl('button', { cls: 'modal-close-button' });
    const closeSpy = jest.spyOn(closeButtonEl, 'click');

    dismissNativeSettingsModals(document);

    expect(closeSpy).not.toHaveBeenCalled();
    expect(document.body.querySelector('.opencodian-skill-detail-modal')).not.toBeNull();
  });
});
