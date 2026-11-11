/**
 * The Codex settings panel mounts plugin management inside the merged
 * resources task page (legacy `plugins` tab id routes onto it). The registry
 * lists the `resources` tab; SettingsCodexSection gives each merged surface a
 * dedicated sub-host so their host-emptying renders never wipe each other.
 */
import {
  DEFAULT_SETTINGS,
  getDefaultCodexBackendSettings,
} from '../../../../src/core/types';
import { SettingsCodexSection } from '../../../../src/features/settings/backends/codex/SettingsCodexSection';
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

  it('registers the resources task tab (hosting plugins) in the layout registry', () => {
    const codexTab = getPrimaryTabDefinition('codex');
    expect(codexTab).toBeDefined();
    expect(codexTab!.secondaryTabs.map((tab) => tab.id)).toContain('resources');
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

    // Legacy `plugins` id routes onto the resources task page; the plugin
    // browser surface mounts inside its dedicated sub-host and honestly
    // reports the adapter-less backend as unavailable.
    const hostEl = containerEl.querySelector('[data-codex-section="resources"]')!;
    expect(hostEl).toBeTruthy();
    expect(hostEl.getAttribute('data-settings-surface')).toBe('section');
    const pluginsAreaEl = hostEl.querySelector('[data-codex-resources-page-area="plugins"]')!;
    expect(pluginsAreaEl).toBeTruthy();
    const pluginsEl = pluginsAreaEl.querySelector('[data-codex-plugins]')!;
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

    section.attachTabbed(containerEl, 'account');
    const hostEl = containerEl.querySelector('[data-codex-section="account"]')!;
    expect(hostEl).toBeTruthy();
    // The account page never mounts the plugins surface; on the resources
    // page plugins live only inside their dedicated sub-host.
    expect(hostEl.querySelector('[data-codex-plugins]')).toBeNull();

    section.dispose();
  });
});
