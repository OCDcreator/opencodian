import { Setting } from 'obsidian';

import { SettingsModelSection } from '../../../../src/features/settings/SettingsModelSection';
import { t } from '../../../../src/i18n';

describe('SettingsModelSection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the unavailable state and clears refresh callbacks when no model config service exists', () => {
    let refreshModelsCallback: (() => void) | undefined = () => {};
    let refreshCatalogStatusCallback: (() => void) | undefined = () => {};
    const containerEl = document.createElement('div');
    const section = new SettingsModelSection({
      app: {} as never,
      plugin: {
        modelConfigService: null,
        settings: {},
        scheduleSettingsUiStateSave: jest.fn(),
      } as never,
      createSectionHeading: (hostEl, title) => {
        const headingEl = hostEl.createEl('h2');
        headingEl.setText(title);
        return headingEl;
      },
      createSettingsBlock: (hostEl, options) => {
        const blockEl = hostEl.createDiv();
        blockEl.dataset.title = options.title;
        return blockEl;
      },
      setSettingDescWithFormatting: (setting, text) => {
        setting.setDesc(text);
      },
      applyInlineCodeText: (targetEl, text) => {
        targetEl?.setText(text);
      },
      refreshTitleModels: jest.fn(),
      setRefreshModelsCallback: (callback) => {
        refreshModelsCallback = callback;
      },
      setRefreshModelCatalogStatusCallback: (callback) => {
        refreshCatalogStatusCallback = callback;
      },
      getServerState: () => ({
        healthy: false,
        status: 'stopped',
      }),
      setServerState: jest.fn(),
    });

    const headingEl = section.attach(containerEl);

    expect(containerEl.querySelectorAll('h2')).toHaveLength(1);
    expect(headingEl.textContent).toBe(t('settings.model.title'));
    expect(refreshModelsCallback).toBeUndefined();
    expect(refreshCatalogStatusCallback).toBeUndefined();
  });

  it('dispose clears any registered refresh callbacks', () => {
    let refreshModelsCallback: (() => void) | undefined = () => {};
    let refreshCatalogStatusCallback: (() => void) | undefined = () => {};
    const section = new SettingsModelSection({
      app: {} as never,
      plugin: {
        settings: {},
      } as never,
      createSectionHeading: () => document.createElement('h2'),
      createSettingsBlock: () => document.createElement('div'),
      setSettingDescWithFormatting: (setting: Setting, text: string) => {
        setting.setDesc(text);
      },
      applyInlineCodeText: () => {},
      refreshTitleModels: jest.fn(),
      setRefreshModelsCallback: (callback) => {
        refreshModelsCallback = callback;
      },
      setRefreshModelCatalogStatusCallback: (callback) => {
        refreshCatalogStatusCallback = callback;
      },
      getServerState: () => ({
        healthy: false,
        status: 'stopped',
      }),
      setServerState: jest.fn(),
    });

    section.dispose();

    expect(refreshModelsCallback).toBeUndefined();
    expect(refreshCatalogStatusCallback).toBeUndefined();
  });
});
