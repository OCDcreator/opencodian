/* eslint-disable max-lines -- Capability Lab tests intentionally keep the full diagnostic surface matrix, history, rewind, structured, and fork probe behavior together. */
import { SettingsCapabilityLabSection } from '../../../../src/features/settings/SettingsCapabilityLabSection';
import { setLocale, t } from '../../../../src/i18n';

/**
 * Minimal mock plugin that satisfies CapabilityLabDeps.
 * agentServiceRegistry is the only accessed property via getClaudeCodeAdapter().
 */
function createMockPlugin(adapter: unknown = null, activeKind = adapter ? 'claude-code' : null, settingsOverride?: Record<string, unknown>): never {
  const registry = adapter
    ? {
        get: jest.fn().mockReturnValue(adapter),
        getActive: jest.fn().mockReturnValue(adapter),
        getActiveKind: jest.fn().mockReturnValue(activeKind),
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
  const defaultClaudeSettings = {
    enableFileCheckpointing: false,
    includeHookEvents: false,
    forwardSubagentText: false,
    agentProgressSummaries: false,
    allowedTools: [],
    disallowedTools: [],
    maxTurns: null,
    maxBudgetUsd: null,
    env: {},
    fallbackModel: '',
  };
  return {
    agentServiceRegistry: registry,
    getConversations: jest.fn().mockReturnValue([]),
    settings: {
      backendSettings: {
        claudeCode: {
          ...defaultClaudeSettings,
          ...settingsOverride,
        },
      },
    },
    saveSettings: jest.fn().mockResolvedValue(undefined),
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

  it('renders diagnostic stream controls in Discovery section with toggles backed by plugin settings', async () => {
    const plugin = createMockPlugin(null, null, {
      includeHookEvents: false,
      forwardSubagentText: true,
      agentProgressSummaries: false,
    });
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin,
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const controlsEl = containerEl.querySelector('[data-capability-lab-surface="diagnostic-stream"]');
    expect(controlsEl).toBeTruthy();
    expect(controlsEl!.getAttribute('data-diagnostic')).toBe('true');
    expect(controlsEl!.textContent).toContain(t('settings.capabilityLab.diagnosticStreamControls.title'));
    expect(controlsEl!.textContent).toContain(t('settings.capabilityLab.diagnosticStreamControls.description'));

    // Verify settings object reflects initial values
    const claudeSettings = (plugin as unknown as { settings: { backendSettings: { claudeCode: Record<string, unknown> } } }).settings.backendSettings.claudeCode;
    expect(claudeSettings.includeHookEvents).toBe(false);
    expect(claudeSettings.forwardSubagentText).toBe(true);
    expect(claudeSettings.agentProgressSummaries).toBe(false);
  });

  it('renders file checkpoint toggle in diagnostic stream controls', async () => {
    const plugin = createMockPlugin(null, null, {
      enableFileCheckpointing: false,
    });
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin,
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const controlsEl = containerEl.querySelector('[data-capability-lab-surface="diagnostic-stream"]');
    expect(controlsEl).toBeTruthy();
    expect(controlsEl!.getAttribute('data-diagnostic')).toBe('true');

    // Verify settings object reflects initial value
    const claudeSettings = (plugin as unknown as { settings: { backendSettings: { claudeCode: Record<string, unknown> } } }).settings.backendSettings.claudeCode;
    expect(claudeSettings.enableFileCheckpointing).toBe(false);
  });

  it('renders File Checkpoint row in capability matrix with diagnostic surface', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const checkpointRow = rows.find((row) => row.textContent?.includes('File Checkpoint / Rewind'));
    expect(checkpointRow).not.toBeNull();
    expect(checkpointRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('diagnostic');
    expect(checkpointRow?.textContent).toContain('Untested');
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

  it('renders MCP Servers row in capability matrix with settings surface', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const mcpRow = rows.find((row) => row.textContent?.includes('MCP Servers'));
    expect(mcpRow).not.toBeNull();
    // MCP is settings (runtime passthrough via shared MCP tab + Claude Code Tools refresh)
    expect(mcpRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('settings');
    expect(mcpRow?.textContent).toContain('Verified');
  });

  it('renders permission approval, AskUserQuestion, and Structured Output rows as chat surface', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const permissionRow = rows.find((row) => row.textContent?.includes('Permission Approval'));
    const questionRow = rows.find((row) => row.textContent?.includes('AskUserQuestion / Elicitation'));
    const structuredRow = rows.find((row) => row.textContent?.includes('Structured Output'));

    expect(permissionRow).not.toBeNull();
    expect(permissionRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
    expect(permissionRow?.textContent).toContain('Verified');

    expect(questionRow).not.toBeNull();
    expect(questionRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
    expect(questionRow?.textContent).toContain('Verified');

    expect(structuredRow).not.toBeNull();
    expect(structuredRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
    expect(structuredRow?.textContent).toContain('Verified');
  });

  it('keeps hook and subagent stream option rows diagnostic-facing while untested', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const getRow = (label: string) => rows.find((row) => row.textContent?.includes(label));

    for (const label of ['Subagent Transcript / Progress', 'Include Hook Events']) {
      const row = getRow(label);
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('SDK');
      expect(row?.textContent).toContain('Adapter');
      expect(row?.textContent).toContain('Untested');
      expect(row?.textContent).toContain('Diagnostic');
      expect(row?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('diagnostic');
      expect(row?.querySelector('[data-surface]')?.getAttribute('data-surface')).not.toBe('settings');
    }
  });

  it('renders exposed discovery rows for permission approval, AskUserQuestion, and MCP', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getMcpServerCount: jest.fn().mockReturnValue(2),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const permissionRow = rows.find((row) => row.textContent?.includes('Permission Approval'));
    const questionRow = rows.find((row) => row.textContent?.includes('AskUserQuestion / Elicitation'));
    const structuredOutputRow = rows.find((row) => row.textContent?.includes('Structured Output'));
    const mcpRow = rows.find((row) => row.textContent?.includes('MCP Servers'));

    expect(permissionRow).not.toBeNull();
    expect(permissionRow?.textContent).toContain('Exposed');
    expect(permissionRow?.textContent).toContain('Chat-surface validated in Capability Lab harness');
    expect(permissionRow?.textContent).toContain('permission card UI');
    expect(permissionRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();

    expect(questionRow).not.toBeNull();
    expect(questionRow?.textContent).toContain('Exposed');
    expect(questionRow?.textContent).toContain('Chat-surface validated in Capability Lab harness');
    expect(questionRow?.textContent).toContain('question dialog');
    expect(questionRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();

    expect(structuredOutputRow).not.toBeNull();
    expect(structuredOutputRow?.textContent).toContain('Exposed');
    expect(structuredOutputRow?.textContent).toContain('Ordinary chat verified (execution path)');
    expect(structuredOutputRow?.textContent).toContain('/json');
    expect(structuredOutputRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();

    expect(mcpRow).not.toBeNull();
    expect(mcpRow?.textContent).toContain('Exposed');
    expect(mcpRow?.textContent).toContain('2 server(s) loaded');
    expect(mcpRow?.textContent).toContain('Ordinary runtime passthrough');
    expect(mcpRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();
  });

  it('renders Structured Output discovery row as exposed with chat trigger info', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getPluginCount: jest.fn().mockReturnValue(0),
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
    const structuredRow = rows.find((row) => row.textContent?.includes('Structured Output'));

    expect(structuredRow).not.toBeNull();
    expect(structuredRow?.textContent).toContain('Exposed');
    expect(structuredRow?.textContent).toContain('Ordinary chat verified (execution path)');
    expect(structuredRow?.textContent).toContain('/json');
    expect(structuredRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();
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
    expect(mcpRow?.textContent).toContain('Ordinary runtime passthrough');
  });

  it('renders MCP Servers in discovery table as exposed when adapter has servers', () => {
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
    expect(mcpRow?.textContent).toContain('Claude Code Tools tab');
    expect(mcpRow?.textContent).not.toContain('No Claude Code Tools tab');
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

  it('renders Plugins in discovery table as Discovery Only when adapter has plugins', () => {
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
    expect(pluginsRow?.textContent).toContain('Discovery Only');
    expect(pluginsRow?.textContent).not.toContain('Exposed');
    expect(pluginsRow?.querySelector('.opencodian-capability-lab-chip')?.classList.contains('opencodian-capability-lab-chip-active')).toBe(false);
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

  it('renders Skills in discovery table as Discovery Only when adapter has skills', () => {
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
    expect(skillsRow?.textContent).toContain('Discovery Only');
    expect(skillsRow?.textContent).not.toContain('Exposed');
    expect(skillsRow?.querySelector('.opencodian-capability-lab-chip')?.classList.contains('opencodian-capability-lab-chip-active')).toBe(false);
    expect(skillsRow?.textContent).toContain('3 skill(s): skill-a, skill-b, skill-c');
  });

  it('renders Skills in discovery table as Discovery Only when skills set to all', () => {
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
    expect(skillsRow?.textContent).toContain('Discovery Only');
    expect(skillsRow?.textContent).not.toContain('Exposed');
    expect(skillsRow?.querySelector('.opencodian-capability-lab-chip')?.classList.contains('opencodian-capability-lab-chip-active')).toBe(false);
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
    expect(skillsRow?.textContent).toContain('Discovery Only');
    expect(skillsRow?.textContent).not.toContain('Exposed');
  });

  it('renders Agent Definitions discovery row with names when adapter has definitions', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getPluginCount: jest.fn().mockReturnValue(0),
      getPluginsList: jest.fn().mockReturnValue([]),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(0),
      getSkillsList: jest.fn().mockReturnValue([]),
      getAgentDefinitionCount: jest.fn().mockReturnValue(2),
      getAgentDefinitionsList: jest.fn().mockReturnValue(['agent-a', 'agent-b']),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const agentRow = rows.find((row) => row.textContent?.includes('Agent Definitions'));
    expect(agentRow?.textContent).toContain('2 agent definition(s)');
    expect(agentRow?.textContent).toContain('agent-a');
    expect(agentRow?.textContent).toContain('agent-b');
    expect(agentRow?.textContent).toContain('Discovery Only');
    expect(agentRow?.textContent).not.toContain('Exposed');
  });

  it('renders Agent Definitions discovery row as empty when adapter has no definitions', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getPluginCount: jest.fn().mockReturnValue(0),
      getPluginsList: jest.fn().mockReturnValue([]),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(0),
      getSkillsList: jest.fn().mockReturnValue([]),
      getAgentDefinitionCount: jest.fn().mockReturnValue(0),
      getAgentDefinitionsList: jest.fn().mockReturnValue([]),
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const agentRow = rows.find((row) => row.textContent?.includes('Agent Definitions'));
    expect(agentRow?.textContent).toContain('No agent definitions loaded');
    expect(agentRow?.textContent).toContain('Discovery Only');
  });

  it('renders Agent Definitions discovery row as empty when no adapter', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const agentRow = rows.find((row) => row.textContent?.includes('Agent Definitions'));
    expect(agentRow?.textContent).toContain('No agent definitions loaded');
    expect(agentRow?.textContent).toContain('Discovery Only');
  });

  it('renders Fallback Model discovery row with configured value when adapter has fallbackModel', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getPluginCount: jest.fn().mockReturnValue(0),
      getPluginsList: jest.fn().mockReturnValue([]),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(0),
      getSkillsList: jest.fn().mockReturnValue([]),
      getAgentDefinitionCount: jest.fn().mockReturnValue(0),
      getAgentDefinitionsList: jest.fn().mockReturnValue([]),
      options: {
        settings: {
          fallbackModel: 'claude-haiku-4-5',
        },
      },
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const fallbackRow = rows.find((row) => row.textContent?.includes('Fallback Model'));
    expect(fallbackRow?.textContent).toContain('claude-haiku-4-5');
    expect(fallbackRow?.textContent).toContain('Discovery Only');
    expect(fallbackRow?.textContent).toContain('Blocker: unknown fallback trigger conditions');
  });

  it('renders Fallback Model discovery row as empty when adapter has no fallbackModel', () => {
    const containerEl = document.createElement('div');
    const adapter = {
      capabilities: new Set(['chat']),
      getPluginCount: jest.fn().mockReturnValue(0),
      getPluginsList: jest.fn().mockReturnValue([]),
      getMcpServerCount: jest.fn().mockReturnValue(0),
      getSkillCount: jest.fn().mockReturnValue(0),
      getSkillsList: jest.fn().mockReturnValue([]),
      getAgentDefinitionCount: jest.fn().mockReturnValue(0),
      getAgentDefinitionsList: jest.fn().mockReturnValue([]),
      options: {
        settings: {
          fallbackModel: '',
        },
      },
    };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-discovery');
    const rows = Array.from(table?.querySelectorAll('tr') ?? []);
    const fallbackRow = rows.find((row) => row.textContent?.includes('Fallback Model'));
    expect(fallbackRow?.textContent).toContain('No fallback model configured');
    expect(fallbackRow?.textContent).toContain('Discovery Only');
    expect(fallbackRow?.textContent).toContain('Blocker: unknown fallback trigger conditions');
  });

  it('renders advanced Claude settings as settings-surface readback-verified SDK option rows', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const getRow = (label: string) => rows.find((row) => row.textContent?.includes(label));

    for (const label of ['Allowed Tools', 'Disallowed Tools', 'Turn/Budget Limits', 'Environment Variables']) {
      const row = getRow(label);
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('SDK');
      expect(row?.textContent).toContain('Adapter');
      expect(row?.textContent).toContain('Readback verified');
      expect(row?.textContent).not.toContain('Verified');
      expect(row?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('settings');
    }
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

  it('buildMatrixRows returns all expected capabilities', () => {
    // We test this indirectly by counting matrix table rows
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-matrix');
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(24);
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
    expect(surfaces).toContain('chat');
  });

  it('audits capability matrix for honest classifications across all 24 rows', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const getRow = (label: string) => rows.find((row) => row.textContent?.includes(label));

    // Expected honest classifications for every capability row.
    // runtimeProof: 'pass' only when direct SDK smoke proof exists.
    // userSurface: 'settings' for stable settings controls; 'diagnostic' for experimental-only surfaces; 'hidden' for unexposed capabilities.
    const expected: Record<string, { runtimeProof: 'untested' | 'pass' | 'fail' | 'wiring' | 'boundary' | 'readback'; userSurface: 'settings' | 'diagnostic' | 'hidden' | 'chat' }> = {
      Hooks: { runtimeProof: 'untested', userSurface: 'hidden' },
      'File Checkpoint / Rewind': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'JSONL History Browser': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'Session Store': { runtimeProof: 'untested', userSurface: 'hidden' },
      Skills: { runtimeProof: 'untested', userSurface: 'hidden' },
      Plugins: { runtimeProof: 'untested', userSurface: 'hidden' },
      'MCP Servers': { runtimeProof: 'pass', userSurface: 'settings' },
      'Allowed Tools': { runtimeProof: 'readback', userSurface: 'settings' },
      'Disallowed Tools': { runtimeProof: 'readback', userSurface: 'settings' },
      'Turn/Budget Limits': { runtimeProof: 'readback', userSurface: 'settings' },
      'Environment Variables': { runtimeProof: 'readback', userSurface: 'settings' },
      'Fallback Model': { runtimeProof: 'wiring', userSurface: 'settings' },
      'Permission Approval': { runtimeProof: 'pass', userSurface: 'chat' },
      'AskUserQuestion / Elicitation': { runtimeProof: 'pass', userSurface: 'chat' },
      'Agents (Subagents)': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'Agent Definitions': { runtimeProof: 'untested', userSurface: 'hidden' },
      'Structured Output': { runtimeProof: 'pass', userSurface: 'chat' },
      'Subagent Transcript / Progress': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'Include Hook Events': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'Import Session to Store': { runtimeProof: 'untested', userSurface: 'hidden' },
      'Fork Session': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'Resume Session': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'Session Detail': { runtimeProof: 'untested', userSurface: 'diagnostic' },
      'Backend Routing': { runtimeProof: 'untested', userSurface: 'diagnostic' },
    };

    for (const [name, expectedValues] of Object.entries(expected)) {
      const row = getRow(name);
      expect(row).not.toBeNull();

      const surface = row?.querySelector('[data-surface]')?.getAttribute('data-surface');
      expect(surface).toBe(expectedValues.userSurface);

      const proofText = row?.textContent ?? '';
      const proofLabel = proofText.includes('Readback verified') ? 'readback'
        : proofText.includes('Verified') ? 'pass'
          : proofText.includes('Failed') ? 'fail'
            : proofText.includes('Wiring only') ? 'wiring'
              : 'untested';
      expect(proofLabel).toBe(expectedValues.runtimeProof);
    }

    // Honesty rule: only true behavior-verified capabilities count as 'Verified'.
    // 'Readback verified' is a distinct category and must not inflate the verified count.
    const verifiedRows = rows.filter((row) => {
      const text = row.textContent ?? '';
      return text.includes('Verified') && !text.includes('Readback verified');
    });
    const verifiedCapabilities = verifiedRows.map((row) => {
      const firstCell = row.querySelector('td');
      return firstCell?.textContent ?? '';
    });
    expect(verifiedCapabilities).toEqual(
      expect.arrayContaining(['MCP Servers', 'Permission Approval', 'AskUserQuestion / Elicitation', 'Structured Output']),
    );
    expect(verifiedCapabilities.length).toBe(4);

    // Honesty rule: hidden capabilities must not have a settings or diagnostic surface chip.
    const hiddenRows = rows.filter((row) => (
      row.querySelector('[data-surface="hidden"]') !== null
    ));
    expect(hiddenRows.length).toBe(6); // Hooks, Session Store, Skills, Plugins, Agent Definitions, Import Session to Store
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

  it('falls back to text-chunk JSON detection when no structured_output backend_event is emitted', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-structured-fallback-1',
        rawMessages: [],
        chunks: [
          {
            type: 'text',
            source: 'claude-code',
            content: '{"status":"ok","surface":"diagnostic","confidence":0.95}',
          },
        ],
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

    expect(containerEl.textContent).toContain('diag-structured-fallback-1');
    expect(containerEl.textContent).toContain('valid JSON was detected in the text response');
    expect(containerEl.textContent).toContain('confidence');
    const marker = containerEl.querySelector('.opencodian-capability-lab-proof-pass');
    expect(marker).toBeTruthy();
  });

  it('rejects malformed fallback JSON that violates schema boundary', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-structured-fallback-bad',
        rawMessages: [],
        chunks: [
          {
            type: 'text',
            source: 'claude-code',
            content: '{"status":"ok","surface":"diagnostic","confidence":1.5}',
          },
        ],
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

    expect(containerEl.textContent).toContain('diag-structured-fallback-bad');
    expect(containerEl.textContent).toContain('no structured_output backend_event or parseable JSON');
    const failMarker = containerEl.querySelector('.opencodian-capability-lab-proof-fail');
    expect(failMarker).toBeTruthy();
    const passMarker = containerEl.querySelector('.opencodian-capability-lab-proof-pass');
    expect(passMarker).toBeFalsy();
  });

  it('rejects fallback JSON with wrong status or surface values', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-structured-fallback-wrong-values',
        rawMessages: [],
        chunks: [
          {
            type: 'text',
            source: 'claude-code',
            content: '{"status":"partial","surface":"chat","confidence":0.5}',
          },
        ],
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

    expect(containerEl.textContent).toContain('diag-structured-fallback-wrong-values');
    const failMarker = containerEl.querySelector('.opencodian-capability-lab-proof-fail');
    expect(failMarker).toBeTruthy();
    const passMarker = containerEl.querySelector('.opencodian-capability-lab-proof-pass');
    expect(passMarker).toBeFalsy();
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
    // Verify both Hooks and Include Hook Events are marked as pass
    const proofMarkers = containerEl.querySelectorAll('[data-capability]');
    const hookMarker = Array.from(proofMarkers).find((el) => el.getAttribute('data-capability') === 'Hooks');
    const includeHookMarker = Array.from(proofMarkers).find((el) => el.getAttribute('data-capability') === 'Include Hook Events');
    expect(hookMarker).toBeTruthy();
    expect(includeHookMarker).toBeTruthy();
  });

  it('renders subagent stream proof button in discovery controls', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Subagent Stream Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks Subagent Transcript / Progress as fail when no real subagent events are captured', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-subagent-1',
        rawMessages: [],
        chunks: [{
          type: 'text',
          content: 'subagent stream proof',
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
      el.textContent?.includes('Run Subagent Stream Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      forwardSubagentText: true,
      agentProgressSummaries: true,
      includeHookEvents: true,
      persistSession: false,
    }));
    expect(containerEl.textContent).toContain('Diagnostic prompt completed with forwardSubagentText and agentProgressSummaries enabled');
    expect(containerEl.textContent).toContain('No subagent events captured');
    // Honesty boundary: zero real subagent/progress events means this is NOT a pass.
    const proofMarker = containerEl.querySelector('[data-capability="Subagent Transcript / Progress"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('marks Subagent Transcript / Progress as pass when real subagent backend events are captured', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-subagent-2',
        rawMessages: [],
        chunks: [
          {
            type: 'backend_event',
            source: 'claude-code',
            event: 'subagent',
            id: 'subagent-1',
            content: 'subagent started',
            metadata: { agentId: 'agent-1' },
          },
          {
            type: 'backend_event',
            source: 'claude-code',
            event: 'tool_progress',
            metadata: { progress: 50 },
          },
        ],
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
      el.textContent?.includes('Run Subagent Stream Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Captured 2 subagent-related event(s)');
    expect(containerEl.textContent).toContain('subagent');
    expect(containerEl.textContent).toContain('tool_progress');
    // Only when real subagent/progress events are captured does this become pass.
    const proofMarker = containerEl.querySelector('[data-capability="Subagent Transcript / Progress"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(false);
  });

  it('handles subagent stream proof failure', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockRejectedValue(new Error('SDK subagent error')),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Subagent Stream Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Subagent stream proof failed');
    expect(containerEl.textContent).toContain('SDK subagent error');
    const proofMarker = containerEl.querySelector('[data-capability="Subagent Transcript / Progress"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('renders fallback model proof button in discovery controls', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fallback Model Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks Fallback Model as pass when invalid primary fails and fallback model is detected', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-fallback-1',
        rawMessages: [],
        chunks: [
          {
            type: 'message_metadata',
            modelId: 'claude-haiku-4-5',
          },
          {
            type: 'text',
            text: 'fallback model proof',
          },
        ],
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
      el.textContent?.includes('Run Fallback Model Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      model: 'opencodian-invalid-model-test-xyz123',
      fallbackModel: 'claude-haiku-4-5',
      persistSession: false,
    }));
    expect(containerEl.textContent).toContain('Invalid primary: "opencodian-invalid-model-test-xyz123"');
    expect(containerEl.textContent).toContain('SDK reported model: "claude-haiku-4-5"');
    const proofMarker = containerEl.querySelector('[data-capability="Fallback Model"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-wiring')).toBe(false);
  });

  it('marks Fallback Model as wiring-only when text output exists but no model is detected', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-fallback-1',
        rawMessages: [],
        chunks: [{
          type: 'text',
          text: 'fallback model proof',
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
      el.textContent?.includes('Run Fallback Model Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('no trustworthy runtime signal confirms which model was used');
    const proofMarker = containerEl.querySelector('[data-capability="Fallback Model"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-wiring')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('handles fallback model proof failure', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockRejectedValue(new Error('SDK fallback model error')),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fallback Model Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Fallback model proof failed');
    expect(containerEl.textContent).toContain('SDK fallback model error');
    const proofMarker = containerEl.querySelector('[data-capability="Fallback Model"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
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
        sessionId: 'session-resume-source',
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
      _diagnosticResumeAt: true,
      prompt: expect.any(String),
    }));
    expect(containerEl.textContent).toContain('session-resume-source');
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
        sessionId: 'session-rt-resume',
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

  it('marks Resume Session runtime proof as failed when result session id differs from requested resume id', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-rt-resume', summary: 'RT resume session', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'different-session',
        rawMessages: [],
        chunks: [{ type: 'text', content: 'This was not the requested session' }],
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
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(resumeBlock!.textContent).toContain('different session id');
  });

  it('marks Resume Session runtime proof as failed when result session id is missing', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-rt-resume', summary: 'RT resume session', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        rawMessages: [],
        chunks: [{ type: 'text', content: 'This response omitted the resumed session id' }],
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
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(resumeBlock!.textContent).toContain('(none)');
  });

  it('uses the claude-code registry adapter for resume diagnostics even when OpenCode is active', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'session-rt-resume', summary: 'RT resume session', lastModified: 1 },
      ]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'session-rt-resume',
        rawMessages: [],
        chunks: [{ type: 'text', content: 'Claude registry adapter proof' }],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter, 'opencode'),
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

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      resumeSessionId: 'session-rt-resume',
    }));
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

  // =======================================================================
  // Synthetic Streaming Context — focused unit tests
  // =======================================================================
  /* eslint-disable @typescript-eslint/no-explicit-any -- Accessing private methods via bracket notation in tests */

  it('injectSyntheticStreamingContext returns boundary when chat view is not open', () => {
    const plugin = createMockPlugin() as any;
    plugin.app = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
      },
    };
    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    const result = (section as any).injectSyntheticStreamingContext();
    expect(result).toMatchObject({
      success: false,
      message: expect.stringContaining('not found'),
    });
    // Cleanup must be a no-op when the view is missing.
    expect(() => result.cleanup()).not.toThrow();
  });

  it('injectSyntheticStreamingContext restores previous runtime state on cleanup', () => {
    const previousEl = document.createElement('div');
    const runtime: { streamingMessageEl: HTMLElement | null } = { streamingMessageEl: previousEl };
    const messagesContainer = document.createElement('div');
    const mockView = {
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getTabRuntimeState: jest.fn().mockReturnValue(runtime),
      messagesContainer,
    };
    const plugin = createMockPlugin() as any;
    plugin.app = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([{ view: mockView }]),
      },
    };
    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    const result = (section as any).injectSyntheticStreamingContext();
    expect(result.success).toBe(true);
    expect(runtime.streamingMessageEl).not.toBe(previousEl);
    expect(messagesContainer.children.length).toBe(1);
    expect(messagesContainer.children[0].classList.contains('opencodian-diagnostic-synthetic-streaming')).toBe(true);

    result.cleanup();
    expect(runtime.streamingMessageEl).toBe(previousEl);
    expect(messagesContainer.children.length).toBe(0);
  });

  it('live permission card harness calls cleanup in finally on success path', async () => {
    const cleanupSpy = jest.fn();
    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionBridge = {
      canUseTool: jest.fn().mockResolvedValue({ behavior: 'allow' }),
    };
    plugin.claudeCodePermissionHostContext = {
      permissionCardRenderer: true,
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    // Inject a spy so we can verify cleanup is invoked without needing a real view.
    (section as any).injectSyntheticStreamingContext = jest.fn().mockReturnValue({
      cleanup: cleanupSpy,
      success: true,
      message: 'ok',
    });

    const outputEl = document.createElement('div');
    await (section as any).runLivePermissionCardHarness(outputEl);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(outputEl.textContent).toContain('User approved');
  });

  it('live permission card harness calls cleanup in finally when bridge throws', async () => {
    const cleanupSpy = jest.fn();
    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionBridge = {
      canUseTool: jest.fn().mockRejectedValue(new Error('Bridge error')),
    };
    plugin.claudeCodePermissionHostContext = {
      permissionCardRenderer: true,
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    (section as any).injectSyntheticStreamingContext = jest.fn().mockReturnValue({
      cleanup: cleanupSpy,
      success: true,
      message: 'ok',
    });

    const outputEl = document.createElement('div');
    await (section as any).runLivePermissionCardHarness(outputEl);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(outputEl.textContent).toContain('Bridge error');
  });

  it('live question dialog harness calls cleanup in finally on success path', async () => {
    const cleanupSpy = jest.fn();
    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionBridge = {
      canUseTool: jest.fn().mockResolvedValue({ behavior: 'allow' }),
    };
    plugin.claudeCodePermissionHostContext = {
      questionCardRenderer: true,
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    (section as any).injectSyntheticStreamingContext = jest.fn().mockReturnValue({
      cleanup: cleanupSpy,
      success: true,
      message: 'ok',
    });

    const outputEl = document.createElement('div');
    await (section as any).runLiveQuestionDialogHarness(outputEl);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(outputEl.textContent).toContain('User answered');
  });

  it('live permission card harness marks pass even on interrupt result', async () => {
    const cleanupSpy = jest.fn();
    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionBridge = {
      canUseTool: jest.fn().mockResolvedValue({ behavior: 'deny', interrupt: true }),
    };
    plugin.claudeCodePermissionHostContext = {
      permissionCardRenderer: true,
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    (section as any).injectSyntheticStreamingContext = jest.fn().mockReturnValue({
      cleanup: cleanupSpy,
      success: true,
      message: 'ok',
    });

    const outputEl = document.createElement('div');
    await (section as any).runLivePermissionCardHarness(outputEl);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    // interrupt should now be treated as pass (UI rendered and was interactive)
    expect(outputEl.textContent).toContain('live UI proof');
    const proofMarker = outputEl.querySelector('.opencodian-capability-lab-proof-pass');
    expect(proofMarker).toBeTruthy();
  });

  it('live question dialog harness marks pass even on interrupt result', async () => {
    const cleanupSpy = jest.fn();
    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionBridge = {
      canUseTool: jest.fn().mockResolvedValue({ behavior: 'deny', interrupt: true }),
    };
    plugin.claudeCodePermissionHostContext = {
      questionCardRenderer: true,
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    (section as any).injectSyntheticStreamingContext = jest.fn().mockReturnValue({
      cleanup: cleanupSpy,
      success: true,
      message: 'ok',
    });

    const outputEl = document.createElement('div');
    await (section as any).runLiveQuestionDialogHarness(outputEl);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(outputEl.textContent).toContain('live UI proof');
    const proofMarker = outputEl.querySelector('.opencodian-capability-lab-proof-pass');
    expect(proofMarker).toBeTruthy();
  });

  it('streaming context probe marks pass when renderer creates card and bridge is wired', async () => {
    const cleanupSpy = jest.fn();
    const mockCardEl = document.createElement('div');
    mockCardEl.className = 'opencodian-diagnostic-probe';

    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionHostContext = {
      permissionCardRenderer: true,
      questionCardRenderer: true,
    };
    plugin.app = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([{
          view: {
            streamingInlineCardRenderer: {
              createStreamingInlineCard: jest.fn().mockReturnValue(mockCardEl),
            },
          },
        }]),
      },
    };
    plugin.agentServiceRegistry = {
      get: jest.fn().mockReturnValue({
        options: {
          permissionBridge: {
            host: {
              collectToolApproval: jest.fn(),
            },
          },
        },
      }),
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    (section as any).injectSyntheticStreamingContext = jest.fn().mockReturnValue({
      cleanup: cleanupSpy,
      success: true,
      message: 'ok',
      diagnostics: { tabId: 'tab-1', verified: true },
    });

    const outputEl = document.createElement('div');
    await (section as any).runStreamingContextProbe(outputEl);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(outputEl.textContent).toContain('card created successfully');
    expect(outputEl.textContent).toContain('Permission bridge host.collectToolApproval wired: true');
    const proofMarkers = outputEl.querySelectorAll('.opencodian-capability-lab-proof-pass');
    expect(proofMarkers.length).toBe(1); // Only Permission Approval — AskUserQuestion is NOT proven by this isolation probe
  });

  it('streaming context probe reports renderer failure when card creation returns null', async () => {
    const cleanupSpy = jest.fn();

    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionHostContext = {
      permissionCardRenderer: true,
      questionCardRenderer: true,
    };
    plugin.app = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([{
          view: {
            streamingInlineCardRenderer: {
              createStreamingInlineCard: jest.fn().mockReturnValue(null),
            },
          },
        }]),
      },
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    (section as any).injectSyntheticStreamingContext = jest.fn().mockReturnValue({
      cleanup: cleanupSpy,
      success: true,
      message: 'ok',
      diagnostics: { tabId: 'tab-1', verified: true },
    });

    const outputEl = document.createElement('div');
    await (section as any).runStreamingContextProbe(outputEl);

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    expect(outputEl.textContent).toContain('card creation returned null');
    expect(outputEl.textContent).toContain('NOT sufficient');
    const proofMarkers = outputEl.querySelectorAll('.opencodian-capability-lab-proof-pass');
    expect(proofMarkers.length).toBe(0);
  });

  it('streaming context probe handles missing chat view gracefully', async () => {
    const plugin = createMockPlugin() as any;
    plugin.claudeCodePermissionHostContext = {
      permissionCardRenderer: true,
      questionCardRenderer: true,
    };
    plugin.app = {
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
      },
    };

    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    const outputEl = document.createElement('div');
    await (section as any).runStreamingContextProbe(outputEl);

    expect(outputEl.textContent).toContain('Synthetic context injection failed');
  });

  it('renders stable settings readback proof button in discovery controls', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn(),
      inspectLastDiagnosticSdkOptions: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Stable Settings Readback')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('renders environment variables proof button in discovery controls', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn(),
      inspectLastDiagnosticSdkOptions: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Environment Variables Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks Environment Variables as pass when nonce appears in tool_result', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-env-proof-pass',
        rawMessages: [],
        chunks: [
          { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'printenv proof' } },
          { type: 'tool_result', toolUseId: 'tool-1', content: 'prefix-12345-suffix' },
        ],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        env: { OPENCODIAN_ENV_PROOF_TEST: '12345' },
      }),
      capabilities: new Set(),
    };
    const plugin = createMockPlugin(adapter, 'claude-code', { env: {} }) as unknown as {
      settings: { backendSettings: { claudeCode: { env: Record<string, string> } } };
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: plugin as never,
      createSectionHeading: createHeadingStub(),
    });

    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.12345);

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Environment Variables Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    // Align adapter evidence with deterministic nonce/key
    (adapter.inspectLastDiagnosticSdkOptions as jest.Mock).mockReturnValue({
      env: { OPENCODIAN_ENV_PROOF_1700000000000: '1700000000000-4fzolfdn' },
    });
    (adapter.runDiagnosticPrompt as jest.Mock).mockResolvedValue({
      sessionId: 'diag-env-proof-pass',
      rawMessages: [],
      chunks: [
        { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'printenv OPENCODIAN_ENV_PROOF_1700000000000' } },
        { type: 'tool_result', toolUseId: 'tool-1', content: '1700000000000-4fzolfdn' },
      ],
    });

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Layer 3 (nonce in Bash tool_result): PASS');
    const passMarkers = containerEl.querySelectorAll('[data-capability="Environment Variables"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBeGreaterThan(0);
    expect(plugin.settings.backendSettings.claudeCode.env).toEqual({});

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('marks stable settings as readback verified when options contain configured values', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-readback-1',
        rawMessages: [],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        allowedTools: ['Read', 'Bash'],
        disallowedTools: ['Edit'],
        maxTurns: 10,
        maxBudgetUsd: 5.0,
        env: { FOO: 'bar' },
        fallbackModel: 'claude-haiku-4-5',
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
      el.textContent?.includes('Run Stable Settings Readback')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: expect.stringContaining('stable settings readback proof'),
      persistSession: false,
    }));

    // Verify readback results are shown
    expect(containerEl.textContent).toContain('Allowed Tools:');
    expect(containerEl.textContent).toContain('2 tool(s) configured');
    expect(containerEl.textContent).toContain('Disallowed Tools:');
    expect(containerEl.textContent).toContain('1 tool(s) configured');
    expect(containerEl.textContent).toContain('maxTurns=10');
    expect(containerEl.textContent).toContain('maxBudgetUsd=5');
    expect(containerEl.textContent).toContain('1 variable(s) configured');
    expect(containerEl.textContent).toContain('option="claude-haiku-4-5"');

    // Verify readback markers for capabilities that are genuinely readback-classified
    // Allowed Tools, Disallowed Tools, Turn/Budget Limits, Environment Variables = 4 readback markers
    // Fallback Model is wiring overall (behavior proof failed) so it gets a wiring marker, not readback
    const readbackMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBe(4);

    // Verify Fallback Model gets a wiring marker (not readback) because behavior proof failed
    const wiringMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-wiring');
    expect(wiringMarkers.length).toBeGreaterThanOrEqual(1);
  });

  it('shows no-config hint when stable settings readback finds nothing configured', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-readback-empty',
        rawMessages: [],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        allowedTools: [],
        disallowedTools: [],
        env: {},
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
      el.textContent?.includes('Run Stable Settings Readback')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('None of the stable settings are currently configured');
    const readbackMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBe(0);
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
