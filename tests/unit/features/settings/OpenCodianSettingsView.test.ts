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

beforeEach(() => {
  setLocale('en');
  document.body.innerHTML = '';
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('OpenCodianSettingsView classic layout', () => {
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
      addSkillsSettings: appendHeading('Skills'),
      addToolsSettings: appendHeading('Tools'),
      addAcpSettings: appendHeading('ACP'),
    });

    await view.onOpen();

    expect(view.containerEl.classList.contains('opencodian-settings')).toBe(false);
    expect(view.contentEl.classList.contains('opencodian-settings')).toBe(true);
    expect(view.contentEl.classList.contains('opencodian-settings--classic')).toBe(true);
    expect(view.contentEl.dataset.settingsLayoutMode).toBe('classic');
    expect(view.contentEl.dataset.settingsSurface).toBe('page');
    expect(view.contentEl.querySelector('.opencodian-settings-quick-nav')).not.toBeNull();
    expect(Array.from(view.contentEl.querySelectorAll('.opencodian-settings-section-heading')).map((heading) =>
      heading.textContent,
    )).toEqual([
      'General',
      'Server',
      'Model',
      'Conversation',
      'Agents',
      'Commands',
      'MCP',
      'Formatter',
      'Plugins',
      'Security',
      'UI',
      'Style',
      'Debug',
      'User',
      'Skills',
      'Tools',
      'ACP',
    ]);
    expect(Array.from(view.containerEl.children).some((child) =>
      child.classList.contains('opencodian-settings-quick-nav'),
    )).toBe(false);
  });

  it('keeps classic quick-nav jumps scoped to the editor-area content scroller', async () => {
    const { view } = createSettingsView('classic');
    const appendHeading = (title: string) => (containerEl: HTMLElement) => {
      const headingEl = (view as unknown as {
        createSectionHeading: (host: HTMLElement, heading: string, tooltip?: string) => HTMLHeadingElement;
      }).createSectionHeading(containerEl, title, `${title} tooltip`);
      Object.defineProperty(headingEl, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          left: 0,
          top: title === 'Model' ? 520 : 260,
          right: 800,
          bottom: title === 'Model' ? 556 : 296,
          width: 800,
          height: 36,
          x: 0,
          y: title === 'Model' ? 520 : 260,
          toJSON: () => '',
        }),
      });
    };
    const outerScrollTo = jest.fn();
    const contentScrollTo = jest.fn();

    Object.defineProperty(view.containerEl, 'scrollHeight', {
      configurable: true,
      value: 1600,
    });
    Object.defineProperty(view.containerEl, 'clientHeight', {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(view.containerEl, 'scrollTo', {
      configurable: true,
      value: outerScrollTo,
    });
    Object.defineProperty(view.containerEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 40,
        right: 800,
        bottom: 540,
        width: 800,
        height: 500,
        x: 0,
        y: 40,
        toJSON: () => '',
      }),
    });
    Object.defineProperty(view.contentEl, 'scrollHeight', {
      configurable: true,
      value: 1600,
    });
    Object.defineProperty(view.contentEl, 'clientHeight', {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(view.contentEl, 'scrollTo', {
      configurable: true,
      value: contentScrollTo,
    });
    Object.defineProperty(view.contentEl, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 100,
        right: 800,
        bottom: 600,
        width: 800,
        height: 500,
        x: 0,
        y: 100,
        toJSON: () => '',
      }),
    });

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
      addSkillsSettings: appendHeading('Skills'),
      addToolsSettings: appendHeading('Tools'),
      addAcpSettings: appendHeading('ACP'),
    });

    await view.onOpen();

    const quickNavEl = view.contentEl.querySelector<HTMLElement>('.opencodian-settings-quick-nav');
    Object.defineProperty(quickNavEl as HTMLElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 100,
        right: 800,
        bottom: 180,
        width: 800,
        height: 80,
        x: 0,
        y: 100,
        toJSON: () => '',
      }),
    });

    const modelButtonEl = Array.from(
      view.contentEl.querySelectorAll<HTMLButtonElement>('.opencodian-settings-quick-nav-btn'),
    ).find((buttonEl) => buttonEl.textContent === 'Model');
    modelButtonEl?.click();

    expect(contentScrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 340,
    });
    expect(outerScrollTo).not.toHaveBeenCalled();
  });

});

describe('OpenCodianSettingsView tabbed layout', () => {
  it('renders editor-area tabbed settings inside the ItemView content element', async () => {
    const { view } = createSettingsView('tabbed');
    const renderDisplay = jest.fn((containerEl: HTMLElement) => {
      containerEl.createDiv({ cls: 'opencodian-settings-content-shell tabbed-render-marker', text: 'tabbed-rendered' });
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
    expect(view.contentEl.querySelector('.opencodian-settings-content-shell')).not.toBeNull();
    expect(view.contentEl.querySelector('.opencodian-settings-tab-panel')).toBeNull();
    expect(renderDisplay).toHaveBeenCalledTimes(1);
  });
});
