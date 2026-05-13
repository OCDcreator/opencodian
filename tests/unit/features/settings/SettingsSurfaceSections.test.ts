import { requestUrl } from 'obsidian';

import { DEFAULT_SETTINGS } from '../../../../src/core/types';
import { SettingsAcpSection } from '../../../../src/features/settings/SettingsAcpSection';
import { SettingsSkillSection } from '../../../../src/features/settings/SettingsSkillSection';
import { SettingsToolSection } from '../../../../src/features/settings/SettingsToolSection';
import { setLocale } from '../../../../src/i18n';

const mockRequestUrl = requestUrl as jest.Mock;

function createPlugin(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      ...DEFAULT_SETTINGS,
      server: DEFAULT_SETTINGS.server,
      acpAgents: [],
      ...overrides,
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
    opencodeConfigManager: {
      read: jest.fn().mockResolvedValue({ permission: {} }),
      setToolPermission: jest.fn().mockResolvedValue(undefined),
      setSkillPermissionPattern: jest.fn().mockResolvedValue(undefined),
    },
    openCodeCatalogStateStore: {
      getToolCatalogSnapshot: jest.fn(() => ({ registryToolIds: ['custom.exec'] })),
      classifyToolIds: jest.fn(() => ({ builtin: [], custom: ['custom.exec'] })),
    },
  };
}

function createHeading(containerEl: HTMLElement, title: string): HTMLHeadingElement {
  return containerEl.createEl('h3', { text: title });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('settings Skills, Tools, and ACP layout surfaces', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    mockRequestUrl.mockReset();
  });

  it('renders Skills as a toolbar plus grouped source cards', async () => {
    mockRequestUrl.mockResolvedValue({
      status: 200,
      json: {
        skills: [
          {
            name: 'reviewer',
            description: 'Reviews local changes',
            location: 'builtin',
            content: '# Reviewer\n- Inspect diffs',
          },
        ],
      },
      text: '',
    });
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    new SettingsSkillSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'catalog');
    await flushPromises();

    expect(containerEl.querySelector('.opencodian-skill-toolbar')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-skill-source-section')?.getAttribute('data-skill-source')).toBe(
      'builtin',
    );
    expect(containerEl.querySelector('.opencodian-skill-count')?.textContent).toBe('1 items');
    expect(containerEl.querySelector('.opencodian-skill-description')?.textContent).toBe('Reviews local changes');
  });

  it('renders built-in tools as grouped permission panels', async () => {
    const plugin = createPlugin();
    const containerEl = document.createElement('div');

    await new SettingsToolSection(containerEl, plugin as never, 'builtin').render();

    expect(containerEl.querySelectorAll('.opencodian-tool-group-panel').length).toBeGreaterThan(1);
    expect(containerEl.querySelector('.opencodian-tool-group-desc')?.textContent).toContain('Read, write');
    expect(containerEl.querySelector('.opencodian-tool-permission-row')?.getAttribute('data-tool-permission')).toBe(
      'allow',
    );
  });

  it('renders ACP presets and agent cards with structured headers', () => {
    const plugin = createPlugin({
      acpAgents: [
        {
          id: 'codex',
          name: 'Codex',
          command: 'codex',
          args: ['acp'],
          env: {},
          enabled: true,
        },
      ],
    });
    const containerEl = document.createElement('div');

    new SettingsAcpSection({
      plugin: plugin as never,
      createSectionHeading: createHeading,
    }).attachTabbed(containerEl, 'agents');

    expect(containerEl.querySelector('.opencodian-acp-preset-rail')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-acp-agent-card-header')).not.toBeNull();
    expect(containerEl.querySelector('.opencodian-acp-agent-command-summary')?.textContent).toBe('codex acp');
    expect(containerEl.querySelectorAll('.opencodian-acp-stacked-field')).toHaveLength(4);
  });
});
