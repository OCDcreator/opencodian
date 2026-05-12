import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { OpenCodianSettingsView } from '../../../../src/features/settings/OpenCodianSettingsView';
import { setLocale } from '../../../../src/i18n';

function createSettingsView(layoutMode: 'classic' | 'tabbed' = 'classic') {
  const app = {
    vault: {
      adapter: {
        getResourcePath: (assetPath: string) => `app://opencodian/${assetPath}`,
      },
    },
  };
  const plugin = {
    app,
    manifest: {
      dir: '/plugins/opencodian',
    },
    settings: {
      ...DEFAULT_SETTINGS,
      settingsLayoutMode: layoutMode,
      settingsTabbedPrimaryTab: 'general',
      settingsTabbedSecondaryTabByPrimary: { general: 'basic' },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    scheduleSettingsUiStateSave: jest.fn(),
  };
  const view = new OpenCodianSettingsView({} as never, plugin as never);
  view.containerEl.dataset.type = 'opencodian-settings-view';
  view.contentEl.addClass('view-content');
  view.containerEl.appendChild(view.contentEl);
  document.body.appendChild(view.containerEl);
  return { plugin, view };
}

describe('OpenCodianSettingsView', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders editor-area classic settings inside the ItemView content element', async () => {
    const { view } = createSettingsView('classic');
    const appendHeading = (title: string) => (containerEl: HTMLElement) => {
      (view as unknown as {
        createSectionHeading: (host: HTMLElement, heading: string, tooltip?: string) => HTMLHeadingElement;
      }).createSectionHeading(containerEl, title, `${title} tooltip`);
    };

    Object.assign(view as unknown as Record<string, unknown>, {
      renderClassicGeneralSection: appendHeading('General'),
      addServerSettings: appendHeading('Server'),
      addMcpSettings: appendHeading('MCP'),
      addModelSettings: appendHeading('Model'),
      addConversationSettings: appendHeading('Conversation'),
      addAgentsSettings: appendHeading('Agents'),
      addCommandsSettings: appendHeading('Commands'),
      addFormatterSettings: appendHeading('Formatter'),
      addPluginSettings: appendHeading('Plugins'),
      addSecuritySettings: appendHeading('Security'),
      addUISettings: appendHeading('UI'),
      addStyleSettings: appendHeading('Style'),
      addDebugSettings: appendHeading('Debug'),
      addUserSettings: appendHeading('User'),
    });

    await view.onOpen();

    expect(view.containerEl.classList.contains('opencodian-settings')).toBe(false);
    expect(view.contentEl.classList.contains('opencodian-settings')).toBe(true);
    expect(view.contentEl.classList.contains('opencodian-settings--classic')).toBe(true);
    expect(view.contentEl.dataset.settingsLayoutMode).toBe('classic');
    expect(view.contentEl.dataset.settingsSurface).toBe('page');
    expect(view.contentEl.querySelector('.opencodian-settings-quick-nav')).not.toBeNull();
    expect(Array.from(view.containerEl.children).some((child) =>
      child.classList.contains('opencodian-settings-quick-nav'),
    )).toBe(false);
  });

  it('renders editor-area tabbed settings inside the ItemView content element', async () => {
    const { view } = createSettingsView('tabbed');
    const renderDisplay = jest.fn((containerEl: HTMLElement) => {
      containerEl.createDiv({ cls: 'tabbed-render-marker', text: 'tabbed-rendered' });
    });

    Object.assign(view as unknown as Record<string, unknown>, {
      getOrCreateTabbedRenderer: () => ({
        renderDisplay,
        switchToPrimaryTab: jest.fn(),
      }),
    });

    await view.onOpen();

    expect(view.containerEl.classList.contains('opencodian-settings')).toBe(false);
    expect(view.contentEl.classList.contains('opencodian-settings')).toBe(true);
    expect(view.contentEl.classList.contains('opencodian-settings--tabbed')).toBe(true);
    expect(view.contentEl.dataset.settingsLayoutMode).toBe('tabbed');
    expect(view.contentEl.dataset.settingsSurface).toBe('page');
    expect(renderDisplay).toHaveBeenCalledTimes(1);
  });
});
