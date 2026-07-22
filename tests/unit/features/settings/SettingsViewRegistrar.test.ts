import { VIEW_TYPE_OPENCODIAN_SETTINGS } from '../../../../src/core/types';
import { OpenCodianSettingsView } from '../../../../src/features/settings/OpenCodianSettingsView';
import {
  activateSettingsView,
  broadcastActiveBackendChangeToSettingsViews,
  dismissNativeSettingsModals,
  registerSettingsView,
} from '../../../../src/features/settings/SettingsViewRegistrar';

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

  it('broadcasts an active backend change to every open editor-area settings view', () => {
    const firstView = Object.create(OpenCodianSettingsView.prototype) as OpenCodianSettingsView;
    const secondView = Object.create(OpenCodianSettingsView.prototype) as OpenCodianSettingsView;
    const firstHandler = jest.fn();
    const secondHandler = jest.fn();
    Object.assign(firstView, { handleActiveBackendChange: firstHandler });
    Object.assign(secondView, { handleActiveBackendChange: secondHandler });
    const plugin = {
      app: {
        workspace: {
          getLeavesOfType: jest.fn(() => [{ view: firstView }, { view: secondView }, { view: {} }]),
        },
      },
    };

    broadcastActiveBackendChangeToSettingsViews(plugin as never, 'codex');

    expect(firstHandler).toHaveBeenCalledWith('codex');
    expect(secondHandler).toHaveBeenCalledWith('codex');
  });

  it('wires the active backend registry event and releases it with the plugin lifecycle', () => {
    const view = Object.create(OpenCodianSettingsView.prototype) as OpenCodianSettingsView;
    const handleActiveBackendChange = jest.fn();
    Object.assign(view, { handleActiveBackendChange });
    const dispose = jest.fn();
    let activeChangeHandler: ((backend: 'codex' | null) => void) | undefined;
    const plugin = {
      app: {
        workspace: {
          getLeavesOfType: jest.fn(() => [{ view }]),
        },
      },
      settings: {
        settingsInEditorArea: true,
      },
      registerView: jest.fn(),
      addCommand: jest.fn(),
      register: jest.fn(),
      agentServiceRegistry: {
        onActiveChange: jest.fn((handler: (backend: 'codex' | null) => void) => {
          activeChangeHandler = handler;
          return { dispose };
        }),
      },
    };

    registerSettingsView(plugin as never);
    activeChangeHandler?.('codex');

    expect(handleActiveBackendChange).toHaveBeenCalledWith('codex');
    expect(plugin.register).toHaveBeenCalledTimes(1);
    const cleanup = plugin.register.mock.calls[0]?.[0] as (() => void);
    cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
