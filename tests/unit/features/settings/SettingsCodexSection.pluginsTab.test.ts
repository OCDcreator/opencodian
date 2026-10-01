/**
 * The Codex settings panel exposes plugin management as its own secondary tab.
 * The tab is registered in the layout registry and routed to the
 * SettingsCodexPluginsSection surface by SettingsCodexSection.
 */
import {
  DEFAULT_SETTINGS,
  getDefaultCodexBackendSettings,
} from '../../../../src/core/types';
import { SettingsCodexSection } from '../../../../src/features/settings/SettingsCodexSection';
import { getPrimaryTabDefinition } from '../../../../src/features/settings/settingsLayoutRegistry';
import { setLocale } from '../../../../src/i18n';
import type OpenCodianPlugin from '../../../../src/main';

type TestPlugin = {
  settings: OpenCodianPlugin['settings'];
  app: { vault: { adapter: { basePath: string } } };
  agentServiceRegistry: { get: jest.Mock };
  invalidateSlashCommandCatalog: jest.Mock;
};

function createPlugin(): TestPlugin {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      backendSettings: {
        ...DEFAULT_SETTINGS.backendSettings,
        codex: getDefaultCodexBackendSettings(),
      },
    },
    app: { vault: { adapter: { basePath: '/vault' } } },
    agentServiceRegistry: {
      get: jest.fn((backend: string) => (backend === 'codex' ? {} : null)),
    },
    invalidateSlashCommandCatalog: jest.fn(),
  };
}

function createSectionHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  const headingEl = document.createElement('h2');
  headingEl.textContent = title;
  containerEl.appendChild(headingEl);
  return headingEl;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
  await new Promise((r) => setTimeout(r, 0));
}

describe('SettingsCodexSection — plugins secondary tab', () => {
  beforeEach(() => {
    setLocale('en');
  });

  it('registers the plugins secondary tab in the layout registry', () => {
    const codexTab = getPrimaryTabDefinition('codex');
    expect(codexTab).toBeDefined();
    expect(codexTab!.secondaryTabs.map((tab) => tab.id)).toContain('plugins');
  });

  it('routes the plugins tab id to the plugin browser surface', async () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'plugins');
    await flush();

    const hostEl = containerEl.querySelector('[data-codex-section="plugins"]')!;
    expect(hostEl).toBeTruthy();
    expect(hostEl.getAttribute('data-settings-surface')).toBe('section');
    // The plugin browser surface mounts inside the tab host and honestly
    // reports the adapter-less backend as unavailable.
    const pluginsEl = hostEl.querySelector('[data-codex-plugins]')!;
    expect(pluginsEl).toBeTruthy();
    expect(pluginsEl.getAttribute('data-codex-plugins-state')).toBe('unavailable');

    section.dispose();
  });

  it('keeps other tab ids on their existing surfaces', () => {
    const plugin = createPlugin();
    const section = new SettingsCodexSection({
      plugin: plugin as never,
      createSectionHeading,
    });
    const containerEl = document.createElement('div');

    section.attachTabbed(containerEl, 'resources');
    const hostEl = containerEl.querySelector('[data-codex-section="resources"]')!;
    expect(hostEl).toBeTruthy();
    // Resources host does not accidentally mount the plugins surface.
    expect(hostEl.querySelector('[data-codex-plugins]')).toBeNull();

    section.dispose();
  });
});
