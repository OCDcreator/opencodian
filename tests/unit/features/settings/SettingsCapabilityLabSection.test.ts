/* eslint-disable max-lines -- Capability Lab tests intentionally keep the full diagnostic surface matrix, history, rewind, structured, and fork probe behavior together. */
import { SettingsCapabilityLabSection } from '../../../../src/features/settings/SettingsCapabilityLabSection';
import { setLocale, t } from '../../../../src/i18n';

/**
 * Minimal mock plugin that satisfies CapabilityLabDeps.
 * agentServiceRegistry is the only accessed property via getClaudeCodeAdapter().
 */
function createMockPlugin(adapter: unknown = null): never {
  const registry = adapter
    ? {
        get: jest.fn().mockReturnValue(adapter),
        getActive: jest.fn().mockReturnValue(adapter),
        getActiveKind: jest.fn().mockReturnValue('claude-code'),
        listAll: jest.fn().mockReturnValue([{ kind: 'claude-code' }]),
        adapters: new Map(),
      }
    : {
        get: jest.fn().mockReturnValue(null),
        getActive: jest.fn().mockReturnValue(null),
        getActiveKind: jest.fn().mockReturnValue(null),
        listAll: jest.fn().mockReturnValue([]),
        adapters: new Map(),
      };
  return {
    agentServiceRegistry: registry,
    getConversations: jest.fn().mockReturnValue([]),
  } as never;
}

function createHeadingStub(): jest.Mock {
  return jest.fn((_containerEl: HTMLElement, _title: string, _tooltip?: string) => {
    return document.createElement('h3');
  });
}

async function flushUi(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

// eslint-disable-next-line max-lines-per-function -- Capability Lab DOM coverage intentionally exercises one dense diagnostic surface end to end.
describe('SettingsCapabilityLabSection', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders diagnostic banner with experimental warning', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const banner = containerEl.querySelector('.opencodian-capability-lab-banner');
    expect(banner).toBeTruthy();
    expect(banner!.getAttribute('data-diagnostic')).toBe('true');
    expect(banner!.textContent).toContain('DIAGNOSTIC');
    expect(banner!.textContent).toContain('EXPERIMENTAL');
    expect(banner!.textContent).toContain('NOT STABLE');
  });

  it('renders all ten diagnostic panels including fork, resume, session detail, and backend routing probes', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const blocks = containerEl.querySelectorAll('[data-section-block]');
    const blockIds = Array.from(blocks).map((el) => el.getAttribute('data-section-block'));
    expect(blockIds).toContain('matrix');
    expect(blockIds).toContain('history');
    expect(blockIds).toContain('subagents');
    expect(blockIds).toContain('rewind');
    expect(blockIds).toContain('fork');
    expect(blockIds).toContain('resume');
    expect(blockIds).toContain('session-detail');
    expect(blockIds).toContain('backend-routing');
    expect(blockIds).toContain('structured');
    expect(blockIds).toContain('discovery');
  });

  it('renders capability matrix table with header columns', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-matrix');
    expect(table).toBeTruthy();
    const headers = Array.from(table!.querySelectorAll('th')).map((th) => th.textContent);
    expect(headers).toEqual(['Capability', 'SDK', 'Adapter', 'Runtime Proof', 'User Surface']);
  });

  it('keeps runtime-only capabilities locked to hidden/Untested in capability matrix', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const getRow = (label: string) => rows.find((row) => row.textContent?.includes(label));

    // All runtime-only capabilities must stay hidden and untested until explicitly promoted.
    const hiddenCapabilities = ['Session Store', 'Agent Definitions', 'Plugins', 'Skills', 'Hooks'];

    for (const cap of hiddenCapabilities) {
      const row = getRow(cap);
      expect(row).not.toBeNull(); // ${cap} row must exist
      expect(row?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('hidden');
      expect(row?.textContent).toContain('Untested');
    }
  });

  it('keeps runtime-proved diagnostic capabilities from being marked complete in the matrix', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const getRow = (label: string) => rows.find((row) => row.textContent?.includes(label));

    for (const cap of ['Hooks', 'Session Store', 'Rewind', 'Agent Definitions']) {
      const row = getRow(cap);
      expect(row).not.toBeNull();
      expect(row?.textContent).not.toContain('Complete');
      expect(row?.textContent).toContain('Untested');
    }
  });

  it('renders MCP Servers row in capability matrix with diagnostic surface', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const mcpRow = rows.find((row) => row.textContent?.includes('MCP Servers'));
    expect(mcpRow).not.toBeNull();
    // MCP is diagnostic (runtime passthrough), not hidden like skills/plugins/agents
    expect(mcpRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('diagnostic');
    expect(mcpRow?.textContent).toContain('Untested');
  });

  it('renders MCP Servers in discovery table as Discovery Only when no adapter', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const mcpRow = rows.find((row) => row.textContent?.includes('MCP Servers'));
    expect(mcpRow).not.toBeNull();
    expect(mcpRow?.textContent).toContain('Discovery Only');
    expect(mcpRow?.textContent).toContain('Runtime passthrough');
  });

  it('renders MCP Servers in discovery table as Exposed when adapter has servers', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getMcpServerCount: jest.fn().mockReturnValue(3),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const mcpRow = rows.find((row) => row.textContent?.includes('MCP Servers'));
    expect(mcpRow).not.toBeNull();
    expect(mcpRow?.textContent).toContain('Exposed');
    expect(mcpRow?.textContent).toContain('3 server(s) loaded');
    expect(mcpRow?.textContent).toContain('Claude Code settings Tools tab');
    expect(mcpRow?.textContent).not.toContain('No Claude Code settings tab');
  });

  it('renders Plugins in discovery table as Discovery Only when no adapter', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const pluginsRow = rows.find((row) => row.textContent?.includes('Plugins'));
    expect(pluginsRow).not.toBeNull();
    expect(pluginsRow?.textContent).toContain('Discovery Only');
    expect(pluginsRow?.textContent).toContain('No plugins loaded');
  });

  it('renders Plugins in discovery table as Exposed when adapter has plugins', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getPluginCount: jest.fn().mockReturnValue(2),
      getPluginsList: jest.fn().mockReturnValue(['plugin-a', 'plugin-b']),
      getSkillCount: jest.fn().mockReturnValue(0),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const pluginsRow = rows.find((row) => row.textContent?.includes('Plugins'));
    expect(pluginsRow).not.toBeNull();
    expect(pluginsRow?.textContent).toContain('Exposed');
    expect(pluginsRow?.textContent).toContain('2 plugin(s): plugin-a, plugin-b');
  });

  it('renders Skills in discovery table as Discovery Only when no adapter', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const skillsRow = rows.find((row) => row.textContent?.includes('Skills'));
    expect(skillsRow).not.toBeNull();
    expect(skillsRow?.textContent).toContain('Discovery Only');
    expect(skillsRow?.textContent).toContain('No skills loaded');
  });

  it('renders Skills in discovery table as Exposed when adapter has skills', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getPluginCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(3),
      getSkillsList: jest.fn().mockReturnValue(['skill-a', 'skill-b', 'skill-c']),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const skillsRow = rows.find((row) => row.textContent?.includes('Skills'));
    expect(skillsRow).not.toBeNull();
    expect(skillsRow?.textContent).toContain('Exposed');
    expect(skillsRow?.textContent).toContain('3 skill(s): skill-a, skill-b, skill-c');
  });

  it('renders Skills in discovery table as Exposed when skills set to all', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getPluginCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(-1),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const skillsRow = rows.find((row) => row.textContent?.includes('Skills'));
    expect(skillsRow).not.toBeNull();
    expect(skillsRow?.textContent).toContain('Exposed');
    expect(skillsRow?.textContent).toContain('All skills enabled');
  });

  it('renders Plugins discovery row with plugin names in notes', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getPluginCount: jest.fn().mockReturnValue(2),
      getPluginsList: jest.fn().mockReturnValue(['my-plugin', 'other-plugin']),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(0),
      getSkillsList: jest.fn().mockReturnValue([]),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const pluginsRow = rows.find((row) => row.textContent?.includes('Plugins'));
    expect(pluginsRow?.textContent).toContain('my-plugin');
    expect(pluginsRow?.textContent).toContain('other-plugin');
  });

  it('renders Skills discovery row with skill names in notes', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getPluginCount: jest.fn().mockReturnValue(0),
      getPluginsList: jest.fn().mockReturnValue([]),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(2),
      getSkillsList: jest.fn().mockReturnValue(['my-skill', 'cool-skill']),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const skillsRow = rows.find((row) => row.textContent?.includes('Skills'));
    expect(skillsRow?.textContent).toContain('my-skill');
    expect(skillsRow?.textContent).toContain('cool-skill');
  });

  it('renders Skills discovery row without names when adapter has no getSkillsList', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getPluginCount: jest.fn().mockReturnValue(0),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(1),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const skillsRow = rows.find((row) => row.textContent?.includes('Skills'));
    expect(skillsRow?.textContent).toContain('1 skill(s)');
    expect(skillsRow?.textContent).toContain('Exposed');
  });

  it('renders a diagnostic summary strip above the matrix', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const summary = containerEl.querySelector('.opencodian-capability-lab-summary');
    expect(summary).toBeTruthy();
    expect(summary!.getAttribute('data-diagnostic')).toBe('true');
    expect(summary!.textContent).toContain('Diagnostic only');
    expect(summary!.textContent).toContain('Isolated diagnostic only');
  });

  it('shows unavailable message when adapter is not present', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    // History, Subagent, Rewind, Structured panels should all show unavailable messages
    const unavailableMessages = containerEl.querySelectorAll('.opencodian-capability-lab-unavailable');
    expect(unavailableMessages.length).toBeGreaterThanOrEqual(3);
  });

  it('renders discovery table with feature rows', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = discoveryTable!.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThanOrEqual(6); // Hooks, Plugins, Skills, MCP Servers, Subagents, Session Store, Import/Delete/Restore
  });

  it('keeps discovery-only Claude ecosystem rows labeled as discovery only', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin({
        capabilities: new Set(['subagents']),
      }),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();

    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const getRow = (feature: string) => rows.find((row) => row.textContent?.includes(feature));

    for (const feature of ['Hooks', 'Plugins', 'Skills', 'Agent Definitions', 'Session Store']) {
      const row = getRow(feature);
      expect(row).toBeTruthy();
      expect(row?.textContent).toContain('Discovery Only');
    }
  });

  it('uses i18n keys for section title', () => {
    setLocale('en');
    const title = t('settings.capabilityLab.title');
    expect(title).toContain('Capability Lab');
    expect(title).toContain('Diagnostic');
  });

  it('renders i18n tab label', () => {
    setLocale('en');
    const tabLabel = t('settings.debug.tab.capabilityLab');
    expect(tabLabel).toBe('Capability Lab');
  });

  it('renders i18n keys for all sub-panels', () => {
    setLocale('en');
    // Matrix
    expect(t('settings.capabilityLab.matrix.title')).toBeTruthy();
    expect(t('settings.capabilityLab.matrix.description')).toBeTruthy();
    // History
    expect(t('settings.capabilityLab.history.title')).toBeTruthy();
    expect(t('settings.capabilityLab.history.description')).toBeTruthy();
    // Subagents
    expect(t('settings.capabilityLab.subagents.title')).toBeTruthy();
    expect(t('settings.capabilityLab.subagents.description')).toBeTruthy();
    // Rewind
    expect(t('settings.capabilityLab.rewind.title')).toBeTruthy();
    expect(t('settings.capabilityLab.rewind.description')).toBeTruthy();
    // Structured
    expect(t('settings.capabilityLab.structured.title')).toBeTruthy();
    expect(t('settings.capabilityLab.structured.description')).toBeTruthy();
    // Discovery
    expect(t('settings.capabilityLab.discovery.title')).toBeTruthy();
    expect(t('settings.capabilityLab.discovery.description')).toBeTruthy();
  });

  it('renders i18n keys in Chinese locale', () => {
    setLocale('zh');
    const title = t('settings.capabilityLab.title');
    expect(title).toContain('能力实验室');
    const tabLabel = t('settings.debug.tab.capabilityLab');
    expect(tabLabel).toBe('能力实验室');
    const historyDescription = t('settings.capabilityLab.history.description');
    expect(historyDescription).toContain('diagnostic store');
    expect(historyDescription).toContain('导入');
    expect(historyDescription).toContain('镜像');
    expect(historyDescription).toContain('回读');
    expect(historyDescription).toContain('不提供稳定的删除或恢复');
    expect(historyDescription).not.toContain('不提供导入');
  });

  it('dispose does not throw', () => {
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });
    expect(() => section.dispose()).not.toThrow();
  });

  it('uses data-diagnostic attribute on controls and outputs', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const diagnosticElements = containerEl.querySelectorAll('[data-diagnostic="true"]');
    expect(diagnosticElements.length).toBeGreaterThan(0);
  });

  it('buildMatrixRows returns all 16 expected capabilities', () => {
    // We test this indirectly by counting matrix table rows
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-matrix');
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(17);
  });

  it('renders status chips with correct active/inactive classes', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const activeChips = containerEl.querySelectorAll('.opencodian-capability-lab-chip-active');
    const inactiveChips = containerEl.querySelectorAll('.opencodian-capability-lab-chip:not(.opencodian-capability-lab-chip-active)');
    expect(activeChips.length).toBeGreaterThan(0);
    expect(inactiveChips.length).toBeGreaterThan(0);
  });

  it('labels user-facing surfaces without claiming all are stable', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const surfaces = Array.from(containerEl.querySelectorAll('[data-surface]')).map((el) => (
      (el as HTMLElement).dataset.surface
    ));
    expect(surfaces).toContain('settings');
    expect(surfaces).toContain('diagnostic');
    expect(surfaces).toContain('hidden');
  });

  it('runs the structured output diagnostic probe through the adapter runtime', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-structured-1',
        rawMessages: [],
        chunks: [{
          type: 'backend_event',
          source: 'claude-code',
          event: 'structured_output',
          status: 'received',
          content: '{"status":"ok"}',
          metadata: {
            structuredOutput: { status: 'ok' },
          },
        }],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Structured Output Probe')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      includeHookEvents: true,
      persistSession: false,
      outputFormat: expect.objectContaining({
        type: 'json_schema',
      }),
    }));
    expect(containerEl.textContent).toContain('diag-structured-1');
    expect(containerEl.textContent).toContain('"status":"ok"');
  });

  it('runs the SessionStart hook proof from the discovery panel', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-hook-1',
        rawMessages: [],
        chunks: [{
          type: 'backend_event',
          source: 'claude-code',
          event: 'hook',
          status: 'response',
          id: 'hook-1',
          name: 'capability-lab-session-start',
          content: 'hook ok',
          metadata: {
            hookEvent: 'SessionStart',
          },
          sessionId: 'diag-hook-1',
        }],
      }),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Hook Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      includeHookEvents: true,
      hooks: expect.objectContaining({
        SessionStart: expect.any(Array),
      }),
      persistSession: false,
    }));
    expect(containerEl.textContent).toContain('Captured 1 hook event');
    expect(containerEl.textContent).toContain('SessionStart');
    expect(containerEl.textContent).toContain('diag-hook-1');
  });

  // =======================================================================
  // Fork Session Diagnostic Probe
  // =======================================================================

  it('renders fork probe section with session selector and fork button when adapter is available', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-abc-123', summary: 'Test session', lastModified: 1 },
      ]),
      forkSession: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const forkBlock = containerEl.querySelector('[data-section-block="fork"]') as HTMLElement | null;
    expect(forkBlock).toBeTruthy();

    const forkButton = Array.from(forkBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fork Diagnostic')
    )) as HTMLButtonElement | undefined;
    expect(forkButton).toBeTruthy();

    const sessionSelect = forkBlock!.querySelector('[data-diagnostic-session-select="fork"]') as HTMLSelectElement | null;
    expect(sessionSelect).toBeTruthy();
  });

  it('shows unavailable message in fork probe when adapter is not present', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const forkBlock = containerEl.querySelector('[data-section-block="fork"]') as HTMLElement | null;
    expect(forkBlock).toBeTruthy();
    const unavailableMsg = forkBlock!.querySelector('.opencodian-capability-lab-unavailable');
    expect(unavailableMsg).toBeTruthy();
    expect(unavailableMsg!.textContent).toContain('Claude Code adapter not available');
  });

  it('calls forkSession on the adapter and shows the forked session id and title', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-source-1', summary: 'Source session', lastModified: 1 },
      ]),
      forkSession: jest.fn().mockResolvedValue({
        id: 'forked-session-999',
        title: 'Source session (fork)',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const forkBlock = containerEl.querySelector('[data-section-block="fork"]') as HTMLElement | null;
    const sessionSelect = forkBlock!.querySelector('[data-diagnostic-session-select="fork"]') as HTMLSelectElement;
    const forkButton = Array.from(forkBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fork Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-source-1';
    forkButton.click();
    await flushUi();

    expect(adapter.forkSession).toHaveBeenCalledWith('session-source-1');
    expect(containerEl.textContent).toContain('forked-session-999');
    expect(containerEl.textContent).toContain('Source session (fork)');
  });

  it('shows diagnostic error and hint when forkSession fails', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-bad-1', summary: 'Bad session', lastModified: 1 },
      ]),
      forkSession: jest.fn().mockRejectedValue(new Error('Claude Code forkSession is unavailable in this SDK.')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const forkBlock = containerEl.querySelector('[data-section-block="fork"]') as HTMLElement | null;
    const sessionSelect = forkBlock!.querySelector('[data-diagnostic-session-select="fork"]') as HTMLSelectElement;
    const forkButton = Array.from(forkBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fork Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-bad-1';
    forkButton.click();
    await flushUi();

    const errorEl = forkBlock!.querySelector('.opencodian-capability-lab-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('forkSession is unavailable');
    const hintEl = forkBlock!.querySelector('.opencodian-capability-lab-hint');
    expect(hintEl).toBeTruthy();
  });

  it('updates Fork Session runtime proof to pass on success', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-rt-1', summary: 'RT session', lastModified: 1 },
      ]),
      forkSession: jest.fn().mockResolvedValue({
        id: 'forked-rt-1',
        title: 'RT session (fork)',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const forkBlock = containerEl.querySelector('[data-section-block="fork"]') as HTMLElement | null;
    const sessionSelect = forkBlock!.querySelector('[data-diagnostic-session-select="fork"]') as HTMLSelectElement;
    const forkButton = Array.from(forkBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fork Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-rt-1';
    forkButton.click();
    await flushUi();

    const proofMarker = forkBlock!.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('updates Fork Session runtime proof to fail on error', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-fail-1', summary: 'Fail session', lastModified: 1 },
      ]),
      forkSession: jest.fn().mockRejectedValue(new Error('SDK unavailable')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const forkBlock = containerEl.querySelector('[data-section-block="fork"]') as HTMLElement | null;
    const sessionSelect = forkBlock!.querySelector('[data-diagnostic-session-select="fork"]') as HTMLSelectElement;
    const forkButton = Array.from(forkBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fork Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-fail-1';
    forkButton.click();
    await flushUi();

    const proofMarker = forkBlock!.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('marks Fork Session as a diagnostic surface in the capability matrix', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      forkSession: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const row = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr')).find((el) => (
      el.textContent?.includes('Fork Session')
    )) as HTMLElement | undefined;
    expect(row).toBeTruthy();
    const surfaceChip = row!.querySelector('[data-surface]') as HTMLElement | null;
    expect(surfaceChip?.dataset.surface).toBe('diagnostic');
    expect(surfaceChip?.textContent).toBe('Diagnostic');
  });

  it('describes history import and mirror as diagnostic-store only without stable delete or restore', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const historyBlock = containerEl.querySelector('[data-section-block="history"]') as HTMLElement | null;
    expect(historyBlock).toBeTruthy();
    const description = historyBlock!.querySelector('.opencodian-capability-lab-description')?.textContent ?? '';
    expect(description).toContain('diagnostic store');
    expect(description).toContain('import');
    expect(description).toContain('mirror');
    expect(description).toContain('readback');
    expect(description).toContain('No stable delete or restore');
    expect(description).not.toContain('No import');
  });

  it('renders session store controls, imports sessions, and proves mirror readback from the diagnostic store', async () => {
    const listSessions = jest.fn().mockImplementation((options?: { sessionStore?: unknown }) => {
      if (options?.sessionStore) {
        return Promise.resolve([{
          sessionId: 'diag-mirror-1',
          summary: 'Mirrored store session',
          lastModified: 2,
        }]);
      }
      return Promise.resolve([{
        sessionId: 'local-session-1',
        summary: 'Local session',
        lastModified: 1,
      }]);
    });
    const getSessionMessages = jest.fn().mockResolvedValue([{
      type: 'assistant',
      uuid: 'mirror-message-1',
      content: 'Diagnostic store readback proof from mirrored session.',
    }]);
    const adapter = {
      listSessions,
      getSessionMessages,
      importSessionToStore: jest.fn().mockResolvedValue(undefined),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-mirror-1',
        rawMessages: [],
        chunks: [],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const historyBlock = containerEl.querySelector('[data-section-block="history"]') as HTMLElement | null;
    const sourceSelect = containerEl.querySelector('[data-diagnostic-source="history"]') as HTMLSelectElement | null;
    const sessionSelect = containerEl.querySelector('[data-diagnostic-session-select="history"]') as HTMLSelectElement | null;
    const refreshButton = Array.from(historyBlock?.querySelectorAll('button') ?? []).find((el) => (
      el.textContent?.includes('Refresh Sessions')
    )) as HTMLButtonElement | undefined;
    const importButton = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Import Selected Session')
    )) as HTMLButtonElement | undefined;
    const mirrorButton = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Store Mirror Probe')
    )) as HTMLButtonElement | undefined;

    expect(sourceSelect).toBeTruthy();
    expect(importButton).toBeTruthy();
    expect(mirrorButton).toBeTruthy();
    expect(sessionSelect).toBeTruthy();
    expect(refreshButton).toBeTruthy();

    refreshButton!.click();
    await flushUi();

    sessionSelect!.value = 'local-session-1';
    importButton!.click();
    await flushUi();

    expect(adapter.importSessionToStore).toHaveBeenCalledWith(
      'local-session-1',
      expect.any(Object),
      expect.objectContaining({
        includeSubagents: true,
      }),
    );

    mirrorButton!.click();
    await flushUi();

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionStore: expect.any(Object),
      sessionStoreFlush: 'eager',
    }));
    expect(sourceSelect!.value).toBe('store');
    expect(sessionSelect!.value).toBe('diag-mirror-1');
    expect(getSessionMessages).toHaveBeenCalledWith('diag-mirror-1', expect.objectContaining({
      sessionStore: expect.any(Object),
      limit: 50,
      includeSystemMessages: false,
    }));
    expect(containerEl.textContent).toContain('Diagnostic store readback');
    expect(containerEl.textContent).toContain('diagnostic proof only');
    expect(containerEl.textContent).toContain('Diagnostic store readback proof from mirrored session.');
    const proofMarker = historyBlock!.querySelector('.opencodian-capability-lab-proof-marker') as HTMLElement | null;
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.dataset.capability).toBe('Session Store');
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('fails the store mirror proof when diagnostic store readback returns no messages', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([{
        sessionId: 'diag-empty-1',
        summary: 'Empty mirrored store session',
        lastModified: 2,
      }]),
      getSessionMessages: jest.fn().mockResolvedValue([]),
      importSessionToStore: jest.fn(),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-empty-1',
        rawMessages: [],
        chunks: [],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const historyBlock = containerEl.querySelector('[data-section-block="history"]') as HTMLElement | null;
    const mirrorButton = Array.from(historyBlock?.querySelectorAll('button') ?? []).find((el) => (
      el.textContent?.includes('Run Store Mirror Probe')
    )) as HTMLButtonElement | undefined;

    mirrorButton!.click();
    await flushUi();

    expect(adapter.getSessionMessages).toHaveBeenCalledWith('diag-empty-1', expect.objectContaining({
      sessionStore: expect.any(Object),
      limit: 50,
      includeSystemMessages: false,
    }));
    expect(containerEl.textContent).toContain('Mirror probe failed');
    expect(containerEl.textContent).toContain('did not return any messages');
    const proofMarker = historyBlock!.querySelector('.opencodian-capability-lab-proof-marker') as HTMLElement | null;
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.dataset.capability).toBe('Session Store');
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('keeps stale async session reloads from overwriting mirror proof output', async () => {
    let releaseInitialLoad: (() => void) | undefined;
    const initialLoad = new Promise<Array<{ sessionId: string; summary: string; lastModified: number }>>((resolve) => {
      releaseInitialLoad = () => resolve([{
        sessionId: 'stale-local-1',
        summary: 'Stale local session',
        lastModified: 1,
      }]);
    });
    const listSessions = jest.fn()
      .mockReturnValueOnce(initialLoad)
      .mockResolvedValue([{
        sessionId: 'diag-race-1',
        summary: 'Mirrored store session',
        lastModified: 3,
      }]);
    const adapter = {
      listSessions,
      getSessionMessages: jest.fn().mockResolvedValue([{
        type: 'assistant',
        uuid: 'mirror-race-message-1',
        content: 'Mirror proof survives stale reload.',
      }]),
      importSessionToStore: jest.fn(),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-race-1',
        rawMessages: [],
        chunks: [],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const historyBlock = containerEl.querySelector('[data-section-block="history"]') as HTMLElement | null;
    const sessionSelect = containerEl.querySelector('[data-diagnostic-session-select="history"]') as HTMLSelectElement | null;
    const mirrorButton = Array.from(historyBlock?.querySelectorAll('button') ?? []).find((el) => (
      el.textContent?.includes('Run Store Mirror Probe')
    )) as HTMLButtonElement | undefined;

    mirrorButton!.click();
    await flushUi();
    expect(containerEl.textContent).toContain('Mirror proof survives stale reload.');

    releaseInitialLoad!();
    await flushUi();

    expect(sessionSelect!.value).toBe('diag-race-1');
    expect(containerEl.textContent).toContain('Diagnostic store readback');
    expect(containerEl.textContent).toContain('Mirror proof survives stale reload.');
    expect(containerEl.textContent).not.toContain('Loaded 1 store session(s).');
  });

  // =======================================================================
  // Resume Session Diagnostic Probe
  // =======================================================================

  it('renders resume probe section with session selector and resume button when adapter is available', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-resume-1', summary: 'Resume test', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const resumeBlock = containerEl.querySelector('[data-section-block="resume"]') as HTMLElement | null;
    expect(resumeBlock).toBeTruthy();

    const resumeButton = Array.from(resumeBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Resume Diagnostic')
    )) as HTMLButtonElement | undefined;
    expect(resumeButton).toBeTruthy();

    const sessionSelect = resumeBlock!.querySelector('[data-diagnostic-session-select="resume"]') as HTMLSelectElement | null;
    expect(sessionSelect).toBeTruthy();
  });

  it('shows unavailable message in resume probe when adapter is not present', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const resumeBlock = containerEl.querySelector('[data-section-block="resume"]') as HTMLElement | null;
    expect(resumeBlock).toBeTruthy();
    const unavailableMsg = resumeBlock!.querySelector('.opencodian-capability-lab-unavailable');
    expect(unavailableMsg).toBeTruthy();
    expect(unavailableMsg!.textContent).toContain('Claude Code adapter not available');
  });

  it('calls runDiagnosticPrompt with resumeSessionId and shows resulting session id and output preview', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-resume-source', summary: 'Source session for resume', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-resume-result-session',
        rawMessages: [],
        chunks: [
          { type: 'text', content: 'Resumed session says hello' },
        ],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const resumeBlock = containerEl.querySelector('[data-section-block="resume"]') as HTMLElement | null;
    const sessionSelect = resumeBlock!.querySelector('[data-diagnostic-session-select="resume"]') as HTMLSelectElement;
    const resumeButton = Array.from(resumeBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Resume Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-resume-source';
    resumeButton.click();
    await flushUi();

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      resumeSessionId: 'session-resume-source',
      prompt: expect.any(String),
    }));
    expect(containerEl.textContent).toContain('diag-resume-result-session');
    expect(containerEl.textContent).toContain('Resumed session says hello');
  });

  it('shows diagnostic error and hint when resume diagnostic fails', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-resume-bad', summary: 'Bad resume source', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn().mockRejectedValue(new Error('Claude Code resume is unavailable in this SDK configuration.')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const resumeBlock = containerEl.querySelector('[data-section-block="resume"]') as HTMLElement | null;
    const sessionSelect = resumeBlock!.querySelector('[data-diagnostic-session-select="resume"]') as HTMLSelectElement;
    const resumeButton = Array.from(resumeBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Resume Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-resume-bad';
    resumeButton.click();
    await flushUi();

    const errorEl = resumeBlock!.querySelector('.opencodian-capability-lab-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('resume is unavailable');
    const hintEl = resumeBlock!.querySelector('.opencodian-capability-lab-hint');
    expect(hintEl).toBeTruthy();
  });

  it('updates Resume Session runtime proof to pass on success', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-rt-resume', summary: 'RT resume session', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-resume-rt-pass',
        rawMessages: [],
        chunks: [{ type: 'text', content: 'Resume proof pass' }],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const resumeBlock = containerEl.querySelector('[data-section-block="resume"]') as HTMLElement | null;
    const sessionSelect = resumeBlock!.querySelector('[data-diagnostic-session-select="resume"]') as HTMLSelectElement;
    const resumeButton = Array.from(resumeBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Resume Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-rt-resume';
    resumeButton.click();
    await flushUi();

    const proofMarker = resumeBlock!.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('updates Resume Session runtime proof to fail on error', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-rt-resume-fail', summary: 'RT resume fail', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn().mockRejectedValue(new Error('SDK unavailable')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const resumeBlock = containerEl.querySelector('[data-section-block="resume"]') as HTMLElement | null;
    const sessionSelect = resumeBlock!.querySelector('[data-diagnostic-session-select="resume"]') as HTMLSelectElement;
    const resumeButton = Array.from(resumeBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Resume Diagnostic')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-rt-resume-fail';
    resumeButton.click();
    await flushUi();

    const proofMarker = resumeBlock!.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('marks Resume Session as a diagnostic surface in the capability matrix', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const row = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr')).find((el) => (
      el.textContent?.includes('Resume Session')
    )) as HTMLElement | undefined;
    expect(row).toBeTruthy();
    const surfaceChip = row!.querySelector('[data-surface]') as HTMLElement | null;
    expect(surfaceChip?.dataset.surface).toBe('diagnostic');
    expect(surfaceChip?.textContent).toBe('Diagnostic');
  });

  it('renders i18n keys for resume probe panel', () => {
    setLocale('en');
    expect(t('settings.capabilityLab.resume.title')).toBeTruthy();
    expect(t('settings.capabilityLab.resume.description')).toBeTruthy();
  });

  it('renders i18n keys for session detail probe panel', () => {
    setLocale('en');
    expect(t('settings.capabilityLab.sessionDetail.title')).toBeTruthy();
    expect(t('settings.capabilityLab.sessionDetail.description')).toBeTruthy();
  });

  // =======================================================================
  // Session Detail Diagnostic Probe
  // =======================================================================

  it('renders session-detail probe section with session selector and inspect button when adapter is available', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-detail-1', summary: 'Detail test', lastModified: 1 },
      ]),
      getSession: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const detailBlock = containerEl.querySelector('[data-section-block="session-detail"]') as HTMLElement | null;
    expect(detailBlock).toBeTruthy();

    const detailButton = Array.from(detailBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Inspect Session Detail')
    )) as HTMLButtonElement | undefined;
    expect(detailButton).toBeTruthy();

    const sessionSelect = detailBlock!.querySelector('[data-diagnostic-session-select="session-detail"]') as HTMLSelectElement | null;
    expect(sessionSelect).toBeTruthy();
  });

  it('shows unavailable message in session-detail probe when adapter is not present', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const detailBlock = containerEl.querySelector('[data-section-block="session-detail"]') as HTMLElement | null;
    expect(detailBlock).toBeTruthy();
    const unavailableMsg = detailBlock!.querySelector('.opencodian-capability-lab-unavailable');
    expect(unavailableMsg).toBeTruthy();
    expect(unavailableMsg!.textContent).toContain('Claude Code adapter not available');
  });

  it('calls getSession on the adapter and shows session detail fields', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-inspect-1', summary: 'Inspect source', lastModified: 1000 },
      ]),
      getSession: jest.fn().mockResolvedValue({
        sessionId: 'session-inspect-1',
        summary: 'Inspect source',
        lastModified: 1000,
        messageCount: 5,
        customField: 'hello',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const detailBlock = containerEl.querySelector('[data-section-block="session-detail"]') as HTMLElement | null;
    const sessionSelect = detailBlock!.querySelector('[data-diagnostic-session-select="session-detail"]') as HTMLSelectElement;
    const detailButton = Array.from(detailBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Inspect Session Detail')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-inspect-1';
    detailButton.click();
    await flushUi();

    expect(adapter.getSession).toHaveBeenCalledWith('session-inspect-1');
    expect(containerEl.textContent).toContain('session-inspect-1');
    expect(containerEl.textContent).toContain('Inspect source');
    expect(containerEl.textContent).toContain('5');
  });

  it('shows diagnostic error and hint when getSession fails', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-bad-detail', summary: 'Bad detail', lastModified: 1 },
      ]),
      getSession: jest.fn().mockRejectedValue(new Error('Claude Code getSession is unavailable.')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const detailBlock = containerEl.querySelector('[data-section-block="session-detail"]') as HTMLElement | null;
    const sessionSelect = detailBlock!.querySelector('[data-diagnostic-session-select="session-detail"]') as HTMLSelectElement;
    const detailButton = Array.from(detailBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Inspect Session Detail')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-bad-detail';
    detailButton.click();
    await flushUi();

    const errorEl = detailBlock!.querySelector('.opencodian-capability-lab-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('getSession is unavailable');
    const hintEl = detailBlock!.querySelector('.opencodian-capability-lab-hint');
    expect(hintEl).toBeTruthy();
  });

  it('updates Session Detail runtime proof to pass on success', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-rt-detail', summary: 'RT detail session', lastModified: 1 },
      ]),
      getSession: jest.fn().mockResolvedValue({
        sessionId: 'session-rt-detail',
        summary: 'RT detail session',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const detailBlock = containerEl.querySelector('[data-section-block="session-detail"]') as HTMLElement | null;
    const sessionSelect = detailBlock!.querySelector('[data-diagnostic-session-select="session-detail"]') as HTMLSelectElement;
    const detailButton = Array.from(detailBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Inspect Session Detail')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-rt-detail';
    detailButton.click();
    await flushUi();

    const proofMarker = detailBlock!.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('updates Session Detail runtime proof to fail when getSession returns null', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-null-detail', summary: 'Null detail', lastModified: 1 },
      ]),
      getSession: jest.fn().mockResolvedValue(null),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const detailBlock = containerEl.querySelector('[data-section-block="session-detail"]') as HTMLElement | null;
    const sessionSelect = detailBlock!.querySelector('[data-diagnostic-session-select="session-detail"]') as HTMLSelectElement;
    const detailButton = Array.from(detailBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Inspect Session Detail')
    )) as HTMLButtonElement;

    sessionSelect.value = 'session-null-detail';
    detailButton.click();
    await flushUi();

    const proofMarker = detailBlock!.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('marks Session Detail as a diagnostic surface in the capability matrix', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      getSession: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const row = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr')).find((el) => (
      el.textContent?.includes('Session Detail')
    )) as HTMLElement | undefined;
    expect(row).toBeTruthy();
    const surfaceChip = row!.querySelector('[data-surface]') as HTMLElement | null;
    expect(surfaceChip?.dataset.surface).toBe('diagnostic');
    expect(surfaceChip?.textContent).toBe('Diagnostic');
  });

  it('renders backend-routing probe section with routing status display', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const routingBlock = containerEl.querySelector('[data-section-block="backend-routing"]') as HTMLElement | null;
    expect(routingBlock).toBeTruthy();
    // Should show active backend status even without adapter
    expect(routingBlock!.textContent).toContain('Active backend');
  });

  it('renders backend-routing probe with probe button when adapter is available', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      getSession: jest.fn(),
      capabilities: new Set(['chat']),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const routingBlock = containerEl.querySelector('[data-section-block="backend-routing"]') as HTMLElement | null;
    expect(routingBlock).toBeTruthy();
    const probeButton = routingBlock!.querySelector('button[data-diagnostic]');
    expect(probeButton).toBeTruthy();
  });

  it('exercises registry routing layer in backend routing probe', async () => {
    const adapter = {
      kind: 'claude-code',
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'routing-session-1', summary: 'Routing test', lastModified: Date.now() },
      ]),
      getSession: jest.fn().mockResolvedValue({
        sessionId: 'routing-session-1',
        summary: 'Routing test',
        lastModified: Date.now(),
      }),
      getSessionMessages: jest.fn().mockResolvedValue([
        { role: 'user', content: 'Hello' },
      ]),
      hasCapability: jest.fn().mockReturnValue(true),
      capabilities: new Set(['chat', 'sessions']),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const routingBlock = containerEl.querySelector('[data-section-block="backend-routing"]') as HTMLElement | null;
    const probeButton = Array.from(routingBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Backend Routing Probe')
    )) as HTMLButtonElement;
    probeButton.click();
    await flushUi();
    await flushUi(); // Extra flush for async readBackendSessionTitle / readBackendSessionShareUrl

    // Verify adapter path was exercised
    expect(adapter.listSessions).toHaveBeenCalled();
    expect(adapter.getSession).toHaveBeenCalledWith('routing-session-1');

    // Verify registry routing layer results are rendered
    const outputEl = routingBlock!.querySelector('.opencodian-capability-lab-output') as HTMLElement;
    expect(outputEl.textContent).toContain('listSessions() via adapter');
    expect(outputEl.textContent).toContain('listBackendSessions() via registry');
    expect(outputEl.textContent).toContain('getBackendSessionPreview() via registry');

    const proofMarker = routingBlock!.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('marks Backend Routing as a diagnostic surface in the capability matrix', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      getSession: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const row = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr')).find((el) => (
      el.textContent?.includes('Backend Routing')
    )) as HTMLElement | undefined;
    expect(row).toBeTruthy();
    const surfaceChip = row!.querySelector('[data-surface]') as HTMLElement | null;
    expect(surfaceChip?.dataset.surface).toBe('diagnostic');
    expect(surfaceChip?.textContent).toBe('Diagnostic');
  });

  it('runs the rewind dry-run probe through the adapter and renders the result', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'rewind-session-1', summary: 'Test session for rewind', lastModified: 1 },
      ]),
      rewindFiles: jest.fn().mockResolvedValue({
        dryRun: true,
        filesAffected: ['src/main.ts', 'src/utils.ts'],
        description: 'Would revert changes from message msg-rewind-target',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const rewindBlock = containerEl.querySelector('[data-section-block="rewind"]') as HTMLElement | null;
    expect(rewindBlock).toBeTruthy();

    const sessionSelect = rewindBlock!.querySelector('select') as HTMLSelectElement;
    const msgInput = rewindBlock!.querySelector('input[type="text"]') as HTMLInputElement;
    const dryRunBtn = Array.from(rewindBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Dry-Run Preview')
    )) as HTMLButtonElement | undefined;
    expect(dryRunBtn).toBeTruthy();

    sessionSelect.value = 'rewind-session-1';
    sessionSelect.dispatchEvent(new Event('change'));
    msgInput.value = 'msg-rewind-target';
    dryRunBtn!.click();
    await flushUi();

    expect(adapter.rewindFiles).toHaveBeenCalledWith('rewind-session-1', 'msg-rewind-target', { dryRun: true });
    const outputEl = rewindBlock!.querySelector('.opencodian-capability-lab-output') as HTMLElement;
    expect(outputEl.textContent).toContain('Dry-Run Rewind Preview');
    expect(outputEl.textContent).toContain('src/main.ts');
  });

  it('renders error output when rewind dry-run probe fails', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'rewind-session-err', summary: 'Error session', lastModified: 1 },
      ]),
      rewindFiles: jest.fn().mockRejectedValue(new Error('No active runtime')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const rewindBlock = containerEl.querySelector('[data-section-block="rewind"]') as HTMLElement | null;
    expect(rewindBlock).toBeTruthy();

    const sessionSelect = rewindBlock!.querySelector('select') as HTMLSelectElement;
    const msgInput = rewindBlock!.querySelector('input[type="text"]') as HTMLInputElement;
    const dryRunBtn = Array.from(rewindBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Dry-Run Preview')
    )) as HTMLButtonElement | undefined;
    expect(dryRunBtn).toBeTruthy();

    sessionSelect.value = 'rewind-session-err';
    sessionSelect.dispatchEvent(new Event('change'));
    msgInput.value = 'msg-rewind-target';
    dryRunBtn!.click();
    await flushUi();

    expect(adapter.rewindFiles).toHaveBeenCalledWith('rewind-session-err', 'msg-rewind-target', { dryRun: true });
    const outputEl = rewindBlock!.querySelector('.opencodian-capability-lab-output') as HTMLElement;
    expect(outputEl.textContent).toContain('Error:');
    expect(outputEl.textContent).toContain('No active runtime');
    expect(outputEl.textContent).toContain('Hint: rewindFiles requires an active runtime with checkpointing enabled.');
  });

  // =======================================================================
  // Subagent Browser
  // =======================================================================

  it('renders subagent browser section with session selector and refresh button when adapter is available', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'sa-session-1', summary: 'Subagent test', lastModified: 1 },
      ]),
      listSubagents: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    expect(subagentBlock).toBeTruthy();
    expect(subagentBlock!.querySelector('select')).toBeTruthy();

    const refreshButton = Array.from(subagentBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Refresh Sessions')
    )) as HTMLButtonElement | undefined;
    expect(refreshButton).toBeTruthy();
  });

  it('loads sessions and populates the session select on refresh', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'sa-session-1', summary: 'Subagent test', lastModified: 1 },
      ]),
      listSubagents: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    const sessionSelect = subagentBlock!.querySelector('select') as HTMLSelectElement;
    const refreshButton = Array.from(subagentBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Refresh Sessions')
    )) as HTMLButtonElement;

    refreshButton.click();
    await flushUi();

    expect(adapter.listSessions).toHaveBeenCalled();
    const option = Array.from(sessionSelect.options).find((el) => el.value === 'sa-session-1');
    expect(option).toBeTruthy();
  });

  it('loads subagents when a session is selected and renders agent buttons', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'sa-session-1', summary: 'Subagent test', lastModified: 1 },
      ]),
      listSubagents: jest.fn().mockResolvedValue(['agent-alpha', 'agent-beta']),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    const sessionSelect = subagentBlock!.querySelector('select') as HTMLSelectElement;
    sessionSelect.value = 'sa-session-1';
    sessionSelect.dispatchEvent(new Event('change'));
    await flushUi();

    expect(adapter.listSubagents).toHaveBeenCalledWith('sa-session-1');
    expect(subagentBlock!.textContent).toContain('2 subagent(s)');
    expect(subagentBlock!.textContent).toContain('Agent: agent-alpha');
    expect(subagentBlock!.textContent).toContain('Agent: agent-beta');
  });

  it('shows no subagents message when listSubagents returns empty', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'sa-session-1', summary: 'Subagent test', lastModified: 1 },
      ]),
      listSubagents: jest.fn().mockResolvedValue([]),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    const sessionSelect = subagentBlock!.querySelector('select') as HTMLSelectElement;
    sessionSelect.value = 'sa-session-1';
    sessionSelect.dispatchEvent(new Event('change'));
    await flushUi();

    expect(subagentBlock!.textContent).toContain('No subagents found for this session.');
  });

  it('shows error when listSubagents fails', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'sa-session-1', summary: 'Subagent test', lastModified: 1 },
      ]),
      listSubagents: jest.fn().mockRejectedValue(new Error('SDK subagent listing failed')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    const sessionSelect = subagentBlock!.querySelector('select') as HTMLSelectElement;
    sessionSelect.value = 'sa-session-1';
    sessionSelect.dispatchEvent(new Event('change'));
    await flushUi();

    const errorEl = subagentBlock!.querySelector('.opencodian-capability-lab-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('SDK subagent listing failed');
  });

  it('loads subagent messages when an agent button is clicked', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'sa-session-1', summary: 'Subagent test', lastModified: 1 },
      ]),
      listSubagents: jest.fn().mockResolvedValue(['agent-msg']),
      getSubagentMessages: jest.fn().mockResolvedValue([
        { role: 'assistant', content: 'Subagent response' },
      ]),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    const sessionSelect = subagentBlock!.querySelector('select') as HTMLSelectElement;
    sessionSelect.value = 'sa-session-1';
    sessionSelect.dispatchEvent(new Event('change'));
    await flushUi();

    const agentButton = Array.from(subagentBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Agent: agent-msg')
    )) as HTMLButtonElement;
    agentButton.click();
    await flushUi();

    expect(adapter.getSubagentMessages).toHaveBeenCalledWith('sa-session-1', 'agent-msg', { limit: 50 });
    expect(subagentBlock!.textContent).toContain('1 messages');
    expect(subagentBlock!.textContent).toContain('Subagent response');
  });

  it('shows error when getSubagentMessages fails', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'sa-session-1', summary: 'Subagent test', lastModified: 1 },
      ]),
      listSubagents: jest.fn().mockResolvedValue(['agent-err']),
      getSubagentMessages: jest.fn().mockRejectedValue(new Error('SDK message read failed')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    const sessionSelect = subagentBlock!.querySelector('select') as HTMLSelectElement;
    sessionSelect.value = 'sa-session-1';
    sessionSelect.dispatchEvent(new Event('change'));
    await flushUi();

    const agentButton = Array.from(subagentBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Agent: agent-err')
    )) as HTMLButtonElement;
    agentButton.click();
    await flushUi();

    const errorEl = subagentBlock!.querySelector('.opencodian-capability-lab-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('SDK message read failed');
  });

  it('shows error when listSessions fails on refresh', async () => {
    const adapter = {
      listSessions: jest.fn().mockRejectedValue(new Error('SDK session list failed')),
      listSubagents: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    await flushUi();

    const subagentBlock = containerEl.querySelector('[data-section-block="subagents"]') as HTMLElement | null;
    const refreshButton = Array.from(subagentBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Refresh Sessions')
    )) as HTMLButtonElement;
    refreshButton.click();
    await flushUi();

    const errorEl = subagentBlock!.querySelector('.opencodian-capability-lab-output .opencodian-capability-lab-error');
    expect(errorEl).toBeTruthy();
    expect(errorEl!.textContent).toContain('SDK session list failed');
  });
});
