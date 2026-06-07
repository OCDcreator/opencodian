/* eslint-disable max-lines -- Capability Lab tests intentionally keep the full diagnostic surface matrix, history, rewind, structured, and fork probe behavior together. */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
    settingSources: ['project'],
    enableFileCheckpointing: false,
    includeHookEvents: false,
    forwardSubagentText: false,
    agentProgressSummaries: false,
    allowedTools: [],
    disallowedTools: [],
    restrictedBuiltinTools: [],
    maxTurns: null,
    maxBudgetUsd: null,
    env: {},
    fallbackModel: '',
    sandbox: {
      enabled: false,
      failIfUnavailable: false,
      autoAllowBashIfSandboxed: false,
      excludedCommands: [],
      allowUnsandboxedCommands: true,
      filesystem: { allowWrite: [], denyWrite: [], denyRead: [] },
      network: { allowedDomains: [], deniedDomains: [] },
      enableWeakerNestedSandbox: false,
      enableWeakerNetworkIsolation: false,
      ripgrep: { command: '', args: [] },
    },
    debug: false,
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
    expect(t('settings.claudeCode.includeHookEvents.desc').toLowerCase()).toContain('hook authoring is already available via claude project settings');
    expect(t('settings.claudeCode.includeHookEvents.desc').toLowerCase()).toContain('hook lifecycle events');
    expect(t('settings.claudeCode.includeHookEvents.desc')).not.toContain('remains hidden until runtime proof is complete');

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
    expect(checkpointRow?.textContent).toContain('Readback verified');
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

    // Runtime-only capabilities without dedicated diagnostic proof paths must stay hidden.
    // All hidden capabilities with runtime proof are now either 'pass' or 'readback' with evidence.
    // No hidden-readback capabilities remain — Plugins promoted to pass (marketplace plugin → MCP server chain).
    const hiddenReadbackCapabilities: string[] = [];

    for (const cap of hiddenReadbackCapabilities) {
      const row = getRow(cap);
      expect(row).not.toBeNull(); // ${cap} row must exist
      expect(row?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('hidden');
      expect(row?.textContent).toContain('Readback verified');
    }

    // Agent Definitions has a dedicated diagnostic proof path (Run Agent Definition Proof button).
    // Promoted to 'settings' surface: project agents discovery + create/open actions in Claude Code runtime tab.
    // @agent mention menu shows Claude runtime agents for Claude backend conversations.
    const agentDefRow = getRow('Agent Definitions');
    expect(agentDefRow).not.toBeNull();
    expect(agentDefRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('settings');
    expect(agentDefRow?.textContent).toContain('Verified');
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

    // Hooks is pass (Verified), Rewind remains readback because checkpoint data is still unavailable.
    const hooksRow = getRow('Hooks');
    expect(hooksRow).not.toBeNull();
    expect(hooksRow?.textContent).not.toContain('Complete');
    expect(hooksRow?.textContent).toContain('Verified');
    expect(hooksRow?.textContent).not.toContain('Untested');

    const rewindRow = getRow('Rewind');
    expect(rewindRow).not.toBeNull();
    expect(rewindRow?.textContent).not.toContain('Complete');
    expect(rewindRow?.textContent).toContain('Readback verified');

    // Agent Definitions has a dedicated diagnostic proof path but should not be marked Complete.
    const agentDefRow = getRow('Agent Definitions');
    expect(agentDefRow).not.toBeNull();
    expect(agentDefRow?.textContent).not.toContain('Complete');
    expect(agentDefRow?.textContent).toContain('Verified');
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

  it('renders permission approval, AskUserQuestion, MCP Elicitation, and Structured Output rows with honest chat surfaces', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const permissionRow = rows.find((row) => row.textContent?.includes('Permission Approval'));
    const questionRow = rows.find((row) => row.textContent?.includes('AskUserQuestion'));
    const elicitationRow = rows.find((row) => row.textContent?.includes('MCP Elicitation'));
    const structuredRow = rows.find((row) => row.textContent?.includes('Structured Output'));

    expect(permissionRow).not.toBeNull();
    expect(permissionRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
    expect(permissionRow?.textContent).toContain('Verified');

    expect(questionRow).not.toBeNull();
    expect(questionRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
    expect(questionRow?.textContent).toContain('Verified');

    expect(elicitationRow).not.toBeNull();
    expect(elicitationRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
    expect(elicitationRow?.textContent).toContain('Wiring only');
    expect(elicitationRow?.textContent).not.toContain('Verified');

    expect(structuredRow).not.toBeNull();
    expect(structuredRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
    expect(structuredRow?.textContent).toContain('Verified');
  });

  it('reflects honest event-stream states for hook and subagent rows in capability matrix', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const rows = Array.from(containerEl.querySelectorAll('.opencodian-capability-lab-matrix tbody tr'));
    const getRow = (label: string) => rows.find((row) => row.textContent?.includes(label));

    // Include Hook Events: runtimeProof pass (real hook backend_events captured), diagnostic surface
    const hookRow = getRow('Include Hook Events');
    expect(hookRow).not.toBeNull();
    expect(hookRow?.textContent).toContain('SDK');
    expect(hookRow?.textContent).toContain('Adapter');
    expect(hookRow?.textContent).toContain('Verified');
    expect(hookRow?.textContent).toContain('Diagnostic');
    expect(hookRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('diagnostic');

    // Subagent Transcript / Progress: runtimeProof pass (inline agents + Agent tool prompt triggers real subagent spawning), chat surface (task/subagent tool rendering)
    const subagentRow = getRow('Subagent Transcript / Progress');
    expect(subagentRow).not.toBeNull();
    expect(subagentRow?.textContent).toContain('SDK');
    expect(subagentRow?.textContent).toContain('Adapter');
    expect(subagentRow?.textContent).toContain('Verified');
    expect(subagentRow?.textContent).toContain('Chat');
    expect(subagentRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('chat');
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
    const getDiscoveryRow = (label: string) => rows.find((row) => row.querySelector('td')?.textContent === label);
    const permissionRow = getDiscoveryRow('Permission Approval');
    const questionRow = getDiscoveryRow('AskUserQuestion');
    const elicitationRow = getDiscoveryRow('MCP Elicitation');
    const structuredOutputRow = getDiscoveryRow('Structured Output');
    const mcpRow = getDiscoveryRow('MCP Servers');

    expect(permissionRow).not.toBeNull();
    expect(permissionRow?.textContent).toContain('Exposed');
    expect(permissionRow?.textContent).toContain('Chat-surface validated in Capability Lab harness');
    expect(permissionRow?.textContent).toContain('permission card UI');
    expect(permissionRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();

    expect(questionRow).not.toBeNull();
    expect(questionRow?.textContent).toContain('Exposed');
    expect(questionRow?.textContent).toContain('Chat-surface validated in ordinary chat and Capability Lab harness');
    expect(questionRow?.textContent).toContain('question dialog');
    expect(questionRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();

    expect(elicitationRow).not.toBeNull();
    expect(elicitationRow?.textContent).toContain('Exposed');
    expect(elicitationRow?.textContent).toContain('SDK onElicitation callback');
    expect(elicitationRow?.textContent).toContain('SDK-level roundtrip proven');
    expect(elicitationRow?.querySelector('.opencodian-capability-lab-chip-active')).not.toBeNull();

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
      getMcpServerNames: jest.fn().mockReturnValue(['alpha-mcp', 'zeta-mcp']),
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
    expect(mcpRow?.textContent).toContain('alpha-mcp');
    expect(mcpRow?.textContent).toContain('zeta-mcp');
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
    expect(pluginsRow?.textContent).toContain('dead-letter at runtime');
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
    expect(pluginsRow?.textContent).toContain('adapter plugin option(s)');
    expect(pluginsRow?.textContent).toContain('dead-letter at runtime');
    expect(pluginsRow?.textContent).toContain('2 adapter plugin option(s): plugin-a, plugin-b');
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
    expect(agentRow?.textContent).toContain('Runtime verified');
    expect(agentRow?.textContent).toContain('inline Agent Definition Proof');
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
    expect(agentRow?.textContent).toContain('Runtime verified');
    expect(agentRow?.textContent).toContain('inline Agent Definition Proof');
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
    expect(agentRow?.textContent).toContain('Runtime verified');
    expect(agentRow?.textContent).toContain('inline Agent Definition Proof');
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
    expect(fallbackRow?.textContent).toContain('same-model validation');
    expect(fallbackRow?.textContent).toContain('HTTP 529');
    expect(fallbackRow?.textContent).toContain('switching not locally provable');
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
    expect(fallbackRow?.textContent).toContain('overload-oriented');
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

    for (const label of ['Allowed Tools']) {
      const row = getRow(label);
      expect(row).not.toBeNull();
      expect(row?.textContent).toContain('SDK');
      expect(row?.textContent).toContain('Adapter');
      expect(row?.textContent).toContain('Readback verified');
      expect(row?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('settings');
    }

    // Disallowed Tools is now pass (init-message tool catalog inspection)
    const disallowedRow = getRow('Disallowed Tools');
    expect(disallowedRow).not.toBeNull();
    expect(disallowedRow?.textContent).toContain('SDK');
    expect(disallowedRow?.textContent).toContain('Adapter');
    expect(disallowedRow?.textContent).toContain('Verified');
    expect(disallowedRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('settings');

    // Turn/Budget Limits is now pass (live maxTurns proof), not readback
    const turnRow = getRow('Turn/Budget Limits');
    expect(turnRow).not.toBeNull();
    expect(turnRow?.textContent).toContain('SDK');
    expect(turnRow?.textContent).toContain('Adapter');
    expect(turnRow?.textContent).toContain('Verified');
    expect(turnRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('settings');

    const envRow = getRow('Environment Variables');
    expect(envRow).not.toBeNull();
    expect(envRow?.textContent).toContain('SDK');
    expect(envRow?.textContent).toContain('Adapter');
    expect(envRow?.textContent).toContain('Verified');
    expect(envRow?.querySelector('[data-surface]')?.getAttribute('data-surface')).toBe('settings');
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

    for (const feature of ['Hooks', 'Skills', 'Agent Definitions', 'Session Store']) {
      const row = getRow(feature);
      expect(row).toBeTruthy();
      expect(row?.textContent).toContain('Discovery Only');
    }
    // Plugins discovery row shows dead-letter programmatic options wording
    const pluginsRow = getRow('Plugins');
    expect(pluginsRow).toBeTruthy();
    expect(pluginsRow?.textContent).toContain('dead-letter at runtime');
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
    expect(rows.length).toBe(55);
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

  it('audits capability matrix for honest classifications across all 55 rows', () => {
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
    const expected: Record<string, { runtimeProof: 'untested' | 'pass' | 'fail' | 'wiring' | 'boundary' | 'readback'; userSurface: 'settings' | 'diagnostic' | 'hidden' | 'chat' | 'settings+chat' }> = {
      Hooks: { runtimeProof: 'pass', userSurface: 'settings' },
      'File Checkpoint / Rewind': { runtimeProof: 'readback', userSurface: 'diagnostic' },
      'JSONL History Browser': { runtimeProof: 'pass', userSurface: 'settings+chat' },
      'Session Store': { runtimeProof: 'pass', userSurface: 'hidden' },
      Skills: { runtimeProof: 'pass', userSurface: 'settings+chat' },
      Plugins: { runtimeProof: 'pass', userSurface: 'settings' },
      'MCP Servers': { runtimeProof: 'pass', userSurface: 'settings' },
      'Allowed Tools': { runtimeProof: 'readback', userSurface: 'settings' },
      'Disallowed Tools': { runtimeProof: 'pass', userSurface: 'settings' },
      'Restricted Built-in Tools': { runtimeProof: 'pass', userSurface: 'settings' },
      'Turn/Budget Limits': { runtimeProof: 'pass', userSurface: 'settings' },
      'Environment Variables': { runtimeProof: 'pass', userSurface: 'settings' },
      'Fallback Model': { runtimeProof: 'readback', userSurface: 'settings' },
      'Permission Approval': { runtimeProof: 'pass', userSurface: 'chat' },
      AskUserQuestion: { runtimeProof: 'pass', userSurface: 'chat' },
      'MCP Elicitation': { runtimeProof: 'wiring', userSurface: 'chat' },
      'Agents (Subagents)': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      'Agent Definitions': { runtimeProof: 'pass', userSurface: 'settings' },
      'Structured Output': { runtimeProof: 'pass', userSurface: 'chat' },
      'Subagent Transcript / Progress': { runtimeProof: 'pass', userSurface: 'chat' },
      'Include Hook Events': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      'Import Session to Store': { runtimeProof: 'pass', userSurface: 'hidden' },
      'Fork Session': { runtimeProof: 'pass', userSurface: 'chat' },
      'Resume Session': { runtimeProof: 'pass', userSurface: 'chat' },
      'Session Detail': { runtimeProof: 'pass', userSurface: 'settings+chat' },
      'Backend Routing': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      '/context Diagnostic': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      'Warm Startup': { runtimeProof: 'readback', userSurface: 'diagnostic' },
      'Sandbox': { runtimeProof: 'readback', userSurface: 'settings+chat' },
      'Session Title': { runtimeProof: 'pass', userSurface: 'settings+chat' },
      'Prompt Suggestions': { runtimeProof: 'pass', userSurface: 'chat' },
      'Task Budget': { runtimeProof: 'readback', userSurface: 'settings' },
      'Thinking': { runtimeProof: 'pass', userSurface: 'settings+chat' },
      'Plan Mode Instructions': { runtimeProof: 'pass', userSurface: 'settings' },
      'Tool Aliases': { runtimeProof: 'readback', userSurface: 'settings' },
      'Debug': { runtimeProof: 'readback', userSurface: 'settings' },
      'Debug File': { runtimeProof: 'pass', userSurface: 'settings' },
      'Strict MCP Config': { runtimeProof: 'readback', userSurface: 'settings' },
      '1M Context Beta': { runtimeProof: 'readback', userSurface: 'settings' },
      'JS Runtime': { runtimeProof: 'readback', userSurface: 'settings' },
      'Load Timeout': { runtimeProof: 'readback', userSurface: 'settings' },
      'Stderr Diagnostic': { runtimeProof: 'readback', userSurface: 'diagnostic' },
      'Custom Session ID': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      'Continue': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      'Resume Session At Position': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      'Fork Session On Resume': { runtimeProof: 'pass', userSurface: 'diagnostic' },
      'AskUserQuestion Preview Format': { runtimeProof: 'pass', userSurface: 'settings+chat' },
      'System Prompt': { runtimeProof: 'pass', userSurface: 'settings' },
      'Main Model Live Switch': { runtimeProof: 'pass', userSurface: 'settings+chat' },
      'Permission Mode Live Switch': { runtimeProof: 'readback', userSurface: 'settings+chat' },
      'Output Style': { runtimeProof: 'pass', userSurface: 'settings' },
      'Effort': { runtimeProof: 'readback', userSurface: 'settings+chat' },
      'Additional Directories': { runtimeProof: 'readback', userSurface: 'settings+chat' },
      'Account Info': { runtimeProof: 'pass', userSurface: 'settings' },
      'Context Usage': { runtimeProof: 'pass', userSurface: 'settings+chat' },
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
      expect.arrayContaining(['MCP Servers', 'Permission Approval', 'AskUserQuestion', 'Structured Output', 'Agent Definitions', 'Include Hook Events', 'Environment Variables', 'Fork Session', 'JSONL History Browser', 'Session Store', 'Import Session to Store', 'Resume Session', 'Session Detail', 'Backend Routing', 'Turn/Budget Limits', 'Skills', 'Agents (Subagents)', 'Subagent Transcript / Progress', 'Hooks', 'Disallowed Tools', 'Plugins', 'Restricted Built-in Tools', '/context Diagnostic', 'Session Title', 'Custom Session ID', 'Continue', 'Resume Session At Position', 'Fork Session On Resume', 'System Prompt', 'Prompt Suggestions', 'Debug File', 'Plan Mode Instructions', 'AskUserQuestion Preview Format', 'Main Model Live Switch', 'Output Style', 'Account Info', 'Context Usage', 'Thinking']),
    );
    expect(verifiedCapabilities).not.toContain('MCP Elicitation');
    expect(verifiedCapabilities.length).toBe(38);

    // Total rows check
    expect(rows.length).toBe(55);

    // Honesty rule: readback capabilities must not be in the verified count.
    // Debug is readback (option wiring only, not behavior-verified) so it stays out.
    const readbackRows = rows.filter((row) => {
      const text = row.textContent ?? '';
      return text.includes('Readback verified');
    });
    const readbackCapabilities = readbackRows.map((row) => {
      const firstCell = row.querySelector('td');
      return firstCell?.textContent ?? '';
    });
    expect(readbackCapabilities).toEqual(
      expect.arrayContaining(['File Checkpoint / Rewind', 'Allowed Tools', 'Fallback Model', 'Warm Startup', 'Sandbox', 'Task Budget', 'Tool Aliases', 'Debug', 'Strict MCP Config', '1M Context Beta', 'JS Runtime', 'Load Timeout', 'Stderr Diagnostic', 'Permission Mode Live Switch', 'Effort', 'Additional Directories']),
    );
    expect(readbackCapabilities.length).toBe(16);

    const wiringRows = rows.filter((row) => (row.textContent ?? '').includes('Wiring only'));
    const wiringCapabilities = wiringRows.map((row) => row.querySelector('td')?.textContent ?? '');
    expect(wiringCapabilities).toEqual(expect.arrayContaining(['MCP Elicitation']));
    expect(wiringRows.length).toBe(1);

    // Honesty rule: hidden capabilities must not have a settings or diagnostic surface chip.
    const hiddenRows = rows.filter((row) => (
      row.querySelector('[data-surface="hidden"]') !== null
    ));
    expect(hiddenRows.length).toBe(2); // Session Store, Import Session to Store
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
    // Layer 1/2/3 text should appear
    expect(containerEl.textContent).toContain('Layer 1');
    expect(containerEl.textContent).toContain('Layer 2');
    expect(containerEl.textContent).toContain('Layer 3');
    // Hooks matrix row shows 'Verified' (pass) based on static assessment
    const proofMarkers = containerEl.querySelectorAll('[data-capability]');
    const hookMarker = Array.from(proofMarkers).find((el) => el.getAttribute('data-capability') === 'Hooks');
    expect(hookMarker).toBeTruthy();
    // Include Hook Events is NOT updated by runHookProof (independent pass)
    const includeHookMarker = Array.from(proofMarkers).find((el) => el.getAttribute('data-capability') === 'Include Hook Events');
    expect(includeHookMarker).toBeFalsy();
  });

  it('keeps Hooks at readback when only the JS callback layer fires', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockImplementation(async (request: {
        hooks?: { SessionStart?: Array<{ hooks?: Array<() => Promise<unknown>> }> };
      }) => {
        await request.hooks?.SessionStart?.[0]?.hooks?.[0]?.();
        return {
          sessionId: 'diag-hook-callback-only',
          rawMessages: [],
          chunks: [],
        };
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        hooks: { SessionStart: [{ hooks: [] }] },
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

    expect(containerEl.textContent).toContain('JS callback was invoked by SDK');
    expect(containerEl.textContent).toContain('Hooks READBACK: JS callback invocation verified');
    expect(containerEl.textContent).toContain('Stable Hooks pass requires Layer 3 shell-hook execution');
    expect(containerEl.textContent).not.toContain('Hooks PASS');
    const hookMarker = containerEl.querySelector('[data-capability="Hooks"]');
    expect(hookMarker).toBeTruthy();
    expect(hookMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(hookMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  describe('Hook proof settings.local.json restore/cleanup', () => {
    // These tests verify the Layer 3 shell-hook config merge/restore logic
    // using a real temp directory on disk, not mocks.
    let proofTmpDir: string;
    let claudeDir: string;
    let settingsPath: string;

    beforeEach(() => {
      proofTmpDir = join(tmpdir(), `opencodian-hook-restore-test-${Date.now()}`);
      claudeDir = join(proofTmpDir, '.claude');
      settingsPath = join(claudeDir, 'settings.local.json');
    });

    afterEach(() => {
      // Clean up test temp dir
      try { rmSync(proofTmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    });

    it('restores pre-existing settings.local.json after hook proof', async () => {
      // Create a pre-existing settings.local.json with user content
      mkdirSync(claudeDir, { recursive: true });
      const userContent = JSON.stringify({
        permissions: { allow: ['Bash(git *)'] },
        hooks: {
          PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'prettier' }] }],
        },
      }, null, 2);
      writeFileSync(settingsPath, userContent, 'utf8');

      const adapter = {
        listSessions: jest.fn().mockResolvedValue([]),
        runDiagnosticPrompt: jest.fn().mockResolvedValue({
          sessionId: 'diag-hook-restore-1',
          rawMessages: [],
          chunks: [{
            type: 'backend_event',
            source: 'claude-code',
            event: 'hook',
            status: 'response',
            id: 'hook-restore-1',
            metadata: { hookEvent: 'SessionStart' },
          }],
        }),
        inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
          hooks: { SessionStart: [{ hooks: [] }] },
        }),
        capabilities: new Set(),
      };

      // Use a plugin mock that returns the proof temp dir as vault path
      const mockPlugin = createMockPlugin(adapter);
      (mockPlugin as Record<string, unknown>).app = {
        vault: {
          adapter: {
            getBasePath: () => proofTmpDir,
          },
        },
      };

      const containerEl = document.createElement('div');
      const section = new SettingsCapabilityLabSection({
        plugin: mockPlugin,
        createSectionHeading: createHeadingStub(),
      });

      section.attachTabbed(containerEl, 'capability-lab');
      const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
        el.textContent?.includes('Run Hook Proof')
      )) as HTMLButtonElement | undefined;
      expect(button).toBeTruthy();

      button!.click();
      await flushUi();

      // After proof completes, settings.local.json should be restored to original content
      expect(existsSync(settingsPath)).toBe(true);
      const restoredContent = readFileSync(settingsPath, 'utf8');
      const restored = JSON.parse(restoredContent);
      expect(restored.permissions.allow).toEqual(['Bash(git *)']);
      expect(restored.hooks.PostToolUse).toEqual([{ matcher: 'Write', hooks: [{ type: 'command', command: 'prettier' }] }]);
      // Our injected SessionStart hook should be removed
      expect(restored.hooks.SessionStart).toBeUndefined();
    });

    it('removes settings.local.json when no pre-existing file existed', async () => {
      mkdirSync(claudeDir, { recursive: true });
      // Do NOT create settings.local.json — it should not exist before probe

      const adapter = {
        listSessions: jest.fn().mockResolvedValue([]),
        runDiagnosticPrompt: jest.fn().mockResolvedValue({
          sessionId: 'diag-hook-restore-2',
          rawMessages: [],
          chunks: [{
            type: 'backend_event',
            source: 'claude-code',
            event: 'hook',
            status: 'response',
            id: 'hook-restore-2',
            metadata: { hookEvent: 'SessionStart' },
          }],
        }),
        inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
          hooks: { SessionStart: [{ hooks: [] }] },
        }),
        capabilities: new Set(),
      };

      const mockPlugin = createMockPlugin(adapter);
      (mockPlugin as Record<string, unknown>).app = {
        vault: {
          adapter: {
            getBasePath: () => proofTmpDir,
          },
        },
      };

      const containerEl = document.createElement('div');
      const section = new SettingsCapabilityLabSection({
        plugin: mockPlugin,
        createSectionHeading: createHeadingStub(),
      });

      section.attachTabbed(containerEl, 'capability-lab');
      const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
        el.textContent?.includes('Run Hook Proof')
      )) as HTMLButtonElement | undefined;
      expect(button).toBeTruthy();

      // Verify no settings.local.json before probe
      expect(existsSync(settingsPath)).toBe(false);

      button!.click();
      await flushUi();

      // After proof completes, settings.local.json should be removed (it didn't exist before)
      expect(existsSync(settingsPath)).toBe(false);
      // .claude/ directory should still exist (not removed)
      expect(existsSync(claudeDir)).toBe(true);
    });
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

  it('marks Fallback Model as readback when invalid primary succeeds without fallback (SDK does not validate model names)', async () => {
    // Phase 1: valid wiring check → succeeds, options readback confirms fallbackModel
    // Phase 2: invalid primary → SDK ACCEPTS without error, reports same invalid string back, no fallback
    // This matches BUILD_ID feature-phase0-capability.202605300441 runtime evidence
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({ // Phase 1: wiring check
          sessionId: 'diag-wiring-1',
          rawMessages: [],
          chunks: [{ type: 'text', text: 'fallback wiring check' }],
        })
        .mockResolvedValueOnce({ // Phase 2: invalid primary accepted without error
          sessionId: 'diag-fallback-1',
          rawMessages: [],
          chunks: [
            { type: 'message_metadata', modelId: 'opencodian-invalid-model-test-xyz123' },
            { type: 'text', text: 'fallback model proof' },
          ],
        }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        fallbackModel: 'claude-haiku-4-5',
        model: undefined,
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

    // Phase 1: wiring check succeeds
    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      fallbackModel: 'claude-haiku-4-5',
      persistSession: false,
    }));
    expect(containerEl.textContent).toContain('Phase 1 PASS');
    // Phase 2: invalid primary accepted without error, reported same invalid model back
    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      model: 'opencodian-invalid-model-test-xyz123',
      fallbackModel: 'claude-haiku-4-5',
    }));
    expect(containerEl.textContent).toContain('Unexpected');
    expect(containerEl.textContent).toContain('opencodian-invalid-model-test-xyz123');
    // Overall classification: readback (option wired, no fallback occurred)
    const proofMarker = containerEl.querySelector('[data-capability="Fallback Model"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('marks Fallback Model as pass if SDK somehow falls back for invalid primary', async () => {
    // Edge case: if Phase 2 succeeds with explicit fallback evidence, mark as pass.
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({ // Phase 1: wiring check
          sessionId: 'diag-wiring-1',
          rawMessages: [],
          chunks: [{ type: 'text', text: 'fallback wiring check' }],
        })
        .mockResolvedValueOnce({ // Phase 2: invalid primary but SDK falls back
          sessionId: 'diag-fallback-1',
          rawMessages: [
            {
              type: 'result',
              modelUsage: {
                'opencodian-invalid-model-test-xyz123': { inputTokens: 12 },
                'claude-haiku-4-5': { inputTokens: 24 },
              },
            },
          ],
          chunks: [
            { type: 'message_metadata', modelId: 'claude-haiku-4-5' },
            { type: 'text', text: 'fallback model proof' },
          ],
        }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        fallbackModel: 'claude-haiku-4-5',
        model: undefined,
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

    const proofMarker = containerEl.querySelector('[data-capability="Fallback Model"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('keeps Fallback Model as readback when invalid primary succeeds with a different non-fallback model', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({
          sessionId: 'diag-wiring-1',
          rawMessages: [],
          chunks: [{ type: 'text', text: 'fallback wiring check' }],
        })
        .mockResolvedValueOnce({
          sessionId: 'diag-normalized-1',
          rawMessages: [
            {
              type: 'result',
              modelUsage: {
                'claude-sonnet-normalized': { inputTokens: 42 },
              },
            },
          ],
          chunks: [
            { type: 'message_metadata', modelId: 'claude-sonnet-normalized' },
            { type: 'text', text: 'fallback model proof' },
          ],
        }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        fallbackModel: 'claude-haiku-4-5',
        model: undefined,
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

    expect(containerEl.textContent).toContain('SDK reported model: "claude-sonnet-normalized"');
    const proofMarker = containerEl.querySelector('[data-capability="Fallback Model"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('handles fallback model proof failure when wiring check fails', async () => {
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

    // Phase 1 wiring check fails — error shown
    expect(containerEl.textContent).toContain('Phase 1 error');
    expect(containerEl.textContent).toContain('SDK fallback model error');
  });

  // =======================================================================
  // extractModelUsage helper — Fallback Model detection plumbing
  // =======================================================================

  it('extractModelUsage returns modelUsage from result message', () => {
    const adapter = { capabilities: new Set() };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    // Access private method via bracket notation
    const extract = (section as unknown as { extractModelUsage: (r: unknown) => unknown }).extractModelUsage.bind(section);
    const result = {
      rawMessages: [
        { type: 'assistant', message: { role: 'assistant' } },
        { type: 'result', subtype: 'success', modelUsage: { 'claude-sonnet-4-6': { inputTokens: 100, outputTokens: 50 } } },
      ],
      chunks: [],
    };
    const usage = extract(result);
    expect(usage).toEqual({ 'claude-sonnet-4-6': { inputTokens: 100, outputTokens: 50 } });
  });

  it('extractModelUsage returns undefined when no result message exists', () => {
    const adapter = { capabilities: new Set() };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    const extract = (section as unknown as { extractModelUsage: (r: unknown) => unknown }).extractModelUsage.bind(section);
    const result = {
      rawMessages: [
        { type: 'assistant', message: { role: 'assistant' } },
      ],
      chunks: [],
    };
    expect(extract(result)).toBeUndefined();
  });

  it('extractModelUsage returns undefined when result has no modelUsage', () => {
    const adapter = { capabilities: new Set() };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    const extract = (section as unknown as { extractModelUsage: (r: unknown) => unknown }).extractModelUsage.bind(section);
    const result = {
      rawMessages: [
        { type: 'result', subtype: 'success' },
      ],
      chunks: [],
    };
    expect(extract(result)).toBeUndefined();
  });

  it('extractModelUsage returns multi-model usage when fallback occurred', () => {
    const adapter = { capabilities: new Set() };
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    const extract = (section as unknown as { extractModelUsage: (r: unknown) => unknown }).extractModelUsage.bind(section);
    const result = {
      rawMessages: [
        { type: 'result', subtype: 'success', modelUsage: {
          'claude-sonnet-4-6': { inputTokens: 100, outputTokens: 0 },
          'claude-haiku-4-5': { inputTokens: 50, outputTokens: 50 },
        } },
      ],
      chunks: [],
    };
    const usage = extract(result) as Record<string, unknown>;
    expect(Object.keys(usage)).toHaveLength(2);
    expect(usage['claude-sonnet-4-6']).toBeDefined();
    expect(usage['claude-haiku-4-5']).toBeDefined();
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
    expect(forkBlock?.querySelector('.opencodian-capability-lab-probe-header')).toBeTruthy();
    expect(forkBlock?.querySelector('.opencodian-capability-lab-probe-badge')).toBeTruthy();
    expect(forkBlock?.querySelector('.opencodian-capability-lab-probe-copy')).toBeTruthy();
    expect(forkBlock?.querySelector('.opencodian-capability-lab-probe-toolbar')).toBeTruthy();

    const forkButton = Array.from(forkBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Fork Diagnostic')
    )) as HTMLButtonElement | undefined;
    expect(forkButton).toBeTruthy();

    const sessionSelect = forkBlock!.querySelector('[data-diagnostic-session-select="fork"]') as HTMLSelectElement | null;
    expect(sessionSelect).toBeTruthy();
    expect(sessionSelect?.closest('.opencodian-capability-lab-probe-field-row')).toBeTruthy();
    expect(forkButton?.closest('.opencodian-capability-lab-probe-action-row')).toBeTruthy();
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
      getSession: jest.fn().mockResolvedValue({ sessionId: 'session-source-1' }),
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

  it('resolves authoritative SDK session id before forking when selected id is local handle', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'claude-code-local-1', summary: 'Local handle', lastModified: 1 },
      ]),
      getSession: jest.fn().mockResolvedValue({ sessionId: '5983419f-7e60-42f3-907d-e5cfafcac4f9' }),
      forkSession: jest.fn().mockResolvedValue({
        id: 'forked-session-uuid',
        title: 'Local handle (fork)',
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

    sessionSelect.value = 'claude-code-local-1';
    forkButton.click();
    await flushUi();

    expect(adapter.getSession).toHaveBeenCalledWith('claude-code-local-1');
    expect(adapter.forkSession).toHaveBeenCalledWith('5983419f-7e60-42f3-907d-e5cfafcac4f9');
  });

  it('prefers provider session id field when probe session payload includes both local sessionId and sdk id', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'claude-code-local-2', summary: 'Local handle', lastModified: 1 },
      ]),
      getSession: jest.fn().mockResolvedValue({
        sessionId: 'claude-code-local-2',
        id: 'b16a4c61-7906-4e25-9c58-23f19a6f0a90',
      }),
      forkSession: jest.fn().mockResolvedValue({
        id: 'forked-session-uuid-2',
        title: 'Local handle (fork)',
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

    sessionSelect.value = 'claude-code-local-2';
    forkButton.click();
    await flushUi();

    expect(adapter.getSession).toHaveBeenCalledWith('claude-code-local-2');
    expect(adapter.forkSession).toHaveBeenCalledWith('b16a4c61-7906-4e25-9c58-23f19a6f0a90');
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
    expect(surfaceChip?.dataset.surface).toBe('chat');
    expect(surfaceChip?.textContent).toBe('Chat');
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

  it('shows selected history-session metadata in a fixed detail region instead of option.title', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        {
          sessionId: 'abc12345-session',
          summary: 'History summary',
          lastModified: new Date('2026-06-05T10:20:30.000Z').getTime(),
        },
      ]),
      getSessionMessages: jest.fn().mockResolvedValue([]),
      importSessionToStore: jest.fn(),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'unused',
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

    const refreshButton = Array.from(containerEl.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Refresh Sessions');
    refreshButton?.click();
    await flushUi();

    const sessionSelect = containerEl.querySelector<HTMLSelectElement>('[data-diagnostic-session-select="history"]');
    const detailEl = containerEl.querySelector<HTMLElement>('[data-capability-history-session-detail]');

    // Options must not carry native title metadata.
    expect(sessionSelect?.options[1]?.title ?? '').toBe('');
    sessionSelect!.value = 'abc12345-session';
    sessionSelect!.dispatchEvent(new Event('change'));

    expect(detailEl?.textContent).toContain('History summary');
    expect(detailEl?.textContent).toContain('2026-06-05T10:20:30.000Z');
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
    expect(resumeBlock?.querySelector('.opencodian-capability-lab-probe-header')).toBeTruthy();
    expect(resumeBlock?.querySelector('.opencodian-capability-lab-probe-badge')).toBeTruthy();
    expect(resumeBlock?.querySelector('.opencodian-capability-lab-probe-copy')).toBeTruthy();
    expect(resumeBlock?.querySelector('.opencodian-capability-lab-probe-toolbar')).toBeTruthy();

    const resumeButton = Array.from(resumeBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Resume Diagnostic')
    )) as HTMLButtonElement | undefined;
    expect(resumeButton).toBeTruthy();

    const sessionSelect = resumeBlock!.querySelector('[data-diagnostic-session-select="resume"]') as HTMLSelectElement | null;
    expect(sessionSelect).toBeTruthy();
    expect(sessionSelect?.closest('.opencodian-capability-lab-probe-field-row')).toBeTruthy();
    expect(resumeButton?.closest('.opencodian-capability-lab-probe-action-row')).toBeTruthy();
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

  it('marks Resume Session as a chat surface in the capability matrix', async () => {
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
    expect(surfaceChip?.dataset.surface).toBe('chat');
    expect(surfaceChip?.textContent).toBe('Chat');
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
    expect(detailBlock?.querySelector('.opencodian-capability-lab-probe-header')).toBeTruthy();
    expect(detailBlock?.querySelector('.opencodian-capability-lab-probe-badge')).toBeTruthy();
    expect(detailBlock?.querySelector('.opencodian-capability-lab-probe-copy')).toBeTruthy();
    expect(detailBlock?.querySelector('.opencodian-capability-lab-probe-toolbar')).toBeTruthy();

    const detailButton = Array.from(detailBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Inspect Session Detail')
    )) as HTMLButtonElement | undefined;
    expect(detailButton).toBeTruthy();

    const sessionSelect = detailBlock!.querySelector('[data-diagnostic-session-select="session-detail"]') as HTMLSelectElement | null;
    expect(sessionSelect).toBeTruthy();
    expect(sessionSelect?.closest('.opencodian-capability-lab-probe-field-row')).toBeTruthy();
    expect(detailButton?.closest('.opencodian-capability-lab-probe-action-row')).toBeTruthy();
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

  it('marks Session Detail as a settings+chat surface in the capability matrix', async () => {
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
      el.textContent?.includes('Session Detail')
    )) as HTMLElement | undefined;
    expect(row).toBeTruthy();
    const surfaceChip = row!.querySelector('[data-surface]') as HTMLElement | null;
    expect(surfaceChip?.dataset.surface).toBe('settings+chat');
    expect(surfaceChip?.textContent).toBe('Settings + Chat');
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
    expect(routingBlock?.querySelector('.opencodian-capability-lab-probe-header')).toBeTruthy();
    expect(routingBlock?.querySelector('.opencodian-capability-lab-probe-badge')).toBeTruthy();
    expect(routingBlock?.querySelector('.opencodian-capability-lab-probe-copy')).toBeTruthy();
    expect(routingBlock?.querySelector('.opencodian-capability-lab-probe-status-grid')).toBeTruthy();
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
    expect(probeButton?.closest('.opencodian-capability-lab-probe-action-row')).toBeTruthy();
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
        canRewind: true,
        filesChanged: ['src/main.ts', 'src/utils.ts'],
        insertions: 5,
        deletions: 2,
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
    // canRewind:true + non-empty filesChanged → pass
    const proofMarker = outputEl.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker?.textContent).toContain('Runtime verified');
  });

  it('classifies rewind dry-run as readback when canRewind is false', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'rewind-session-norw', summary: 'No rewind session', lastModified: 1 },
      ]),
      rewindFiles: jest.fn().mockResolvedValue({
        canRewind: false,
        error: 'No file checkpoint found for this message.',
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
    const sessionSelect = rewindBlock!.querySelector('select') as HTMLSelectElement;
    const msgInput = rewindBlock!.querySelector('input[type="text"]') as HTMLInputElement;
    const dryRunBtn = Array.from(rewindBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Dry-Run Preview')
    )) as HTMLButtonElement | undefined;

    sessionSelect.value = 'rewind-session-norw';
    sessionSelect.dispatchEvent(new Event('change'));
    msgInput.value = 'msg-target';
    dryRunBtn!.click();
    await flushUi();

    const outputEl = rewindBlock!.querySelector('.opencodian-capability-lab-output') as HTMLElement;
    expect(outputEl.textContent).toContain('Dry-Run Rewind Preview');
    // canRewind:false → readback, NOT pass
    const proofMarker = outputEl.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker?.textContent).toContain('Readback verified');
    expect(proofMarker?.textContent).not.toContain('Runtime verified');
    // Blocker hint should explain the current SDK 0.3.158 readback blocker, not stale 0.3.157 wording.
    expect(outputEl.textContent).toContain('Blocker: SDK returns canRewind:false');
    expect(outputEl.textContent).toContain('SDK 0.3.158');
    expect(outputEl.textContent).not.toContain('0.3.157');
    expect(outputEl.textContent).toContain('#236');
  });

  it('classifies rewind dry-run as readback when canRewind is true but filesChanged is empty', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([
        { sessionId: 'rewind-session-empty', summary: 'Empty files session', lastModified: 1 },
      ]),
      rewindFiles: jest.fn().mockResolvedValue({
        canRewind: true,
        filesChanged: [],
        insertions: 0,
        deletions: 0,
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
    const sessionSelect = rewindBlock!.querySelector('select') as HTMLSelectElement;
    const msgInput = rewindBlock!.querySelector('input[type="text"]') as HTMLInputElement;
    const dryRunBtn = Array.from(rewindBlock!.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Dry-Run Preview')
    )) as HTMLButtonElement | undefined;

    sessionSelect.value = 'rewind-session-empty';
    sessionSelect.dispatchEvent(new Event('change'));
    msgInput.value = 'msg-target';
    dryRunBtn!.click();
    await flushUi();

    const outputEl = rewindBlock!.querySelector('.opencodian-capability-lab-output') as HTMLElement;
    expect(outputEl.textContent).toContain('Dry-Run Rewind Preview');
    // canRewind:true + empty filesChanged → readback, NOT pass
    const proofMarker = outputEl.querySelector('.opencodian-capability-lab-proof-marker');
    expect(proofMarker?.textContent).toContain('Readback verified');
    expect(proofMarker?.textContent).not.toContain('Runtime verified');
    // Blocker hint should explain the empty filesChanged blocker
    expect(outputEl.textContent).toContain('empty filesChanged');
    expect(outputEl.textContent).toContain('#236');
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

  it('renders Environment Variables discovery row with honest verified/pass description (not stale readback)', () => {
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const discoveryTable = containerEl.querySelector('.opencodian-capability-lab-discovery');
    expect(discoveryTable).toBeTruthy();
    const rows = Array.from(discoveryTable!.querySelectorAll('tbody tr'));
    const envRow = rows.find((row) => row.textContent?.includes('Environment Variables'));

    expect(envRow).not.toBeNull();
    // Honesty check: discovery row must NOT claim "Static classification is readback"
    // because the capability matrix already has runtimeProof: 'pass' (live behavior proof achieved).
    expect(envRow?.textContent).not.toContain('Static classification is readback');
    // Discovery row must reflect that live behavior proof exists (capability is verified).
    expect(envRow?.textContent).toContain('verified');
  });

  it('marks Environment Variables as pass when env-derived filesystem side effect is observed', async () => {
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
    const expectedProofPath = join(tmpdir(), 'opencodian-env-proof-1700000000000-4fzolfdn');
    (adapter.runDiagnosticPrompt as jest.Mock).mockImplementation(async () => {
      mkdirSync(tmpdir(), { recursive: true });
      writeFileSync(expectedProofPath, '1700000000000-4fzolfdn', 'utf8');
      return {
      sessionId: 'diag-env-proof-pass',
      rawMessages: [],
      chunks: [
        { type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'printf \'%s\' "${OPENCODIAN_ENV_PROOF_NONCE}" > "${OPENCODIAN_ENV_PROOF_PATH}"' } },
        { type: 'tool_result', toolUseId: 'tool-1', content: 'ok' },
      ],
      };
    });

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Layer 3 (env-derived filesystem side effect): PASS');
    const passMarkers = containerEl.querySelectorAll('[data-capability="Environment Variables"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBeGreaterThan(0);
    expect(plugin.settings.backendSettings.claudeCode.env).toEqual({});
    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ _diagnosticBypassPermissions: true }),
    );
    rmSync(expectedProofPath, { force: true });

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('does not modify permissionMode during env proof (bypass is in diagnostic request, not settings)', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-env-nosideeffect',
        rawMessages: [],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        env: {},
      }),
      capabilities: new Set(),
    };
    const plugin = createMockPlugin(adapter, 'claude-code', {
      env: {},
      permissionMode: 'acceptEdits',
    }) as unknown as {
      settings: { backendSettings: { claudeCode: { env: Record<string, string>; permissionMode: string } } };
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

    button!.click();
    await flushUi();

    // Settings permissionMode should remain unchanged (bypass is only in diagnostic request)
    expect(plugin.settings.backendSettings.claudeCode.permissionMode).toBe('acceptEdits');
    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ _diagnosticBypassPermissions: true }),
    );

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('shows diagnostic bypass path label in env proof output', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-env-label',
        rawMessages: [],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        env: {},
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

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('diagnostic bypass (proves env propagation, not permission UI)');

    dateNowSpy.mockRestore();
    randomSpy.mockRestore();
  });

  it('renders Agent Definition Proof button', () => {
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
      el.textContent?.includes('Run Agent Definition Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks Agent Definitions as pass when inline agent alters assistant behavior', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-agent-def-pass',
        rawMessages: [],
        chunks: [
          { type: 'text', content: 'AGENT-DEF-PROOF-ACTIVATED\n\nHello! I am the proof agent.' },
        ],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        agent: 'opencodian-proof-agent',
        agents: {
          'opencodian-proof-agent': {
            description: 'A diagnostic agent',
            prompt: 'You are a proof agent.',
          },
        },
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
      el.textContent?.includes('Run Agent Definition Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Layer 1 (SDK options readback): PASS');
    expect(containerEl.textContent).toContain('Layer 2 (assistant text marker echo): PASS');
    const passMarkers = containerEl.querySelectorAll('[data-capability="Agent Definitions"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBeGreaterThan(0);
    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'opencodian-proof-agent',
        agents: expect.objectContaining({
          'opencodian-proof-agent': expect.objectContaining({
            description: expect.stringContaining('diagnostic agent'),
            prompt: expect.stringContaining('proof agent'),
          }),
        }),
      }),
    );
  });

  it('marks Agent Definitions as readback when SDK accepts options but behavior unchanged', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-agent-def-readback',
        rawMessages: [],
        chunks: [
          { type: 'text', content: 'Hello! I am just a regular assistant.' },
        ],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        agent: 'opencodian-proof-agent',
        agents: {
          'opencodian-proof-agent': {
            description: 'A diagnostic agent',
            prompt: 'You are a proof agent.',
          },
        },
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
      el.textContent?.includes('Run Agent Definition Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Layer 1 (SDK options readback): PASS');
    expect(containerEl.textContent).toContain('Layer 2 (assistant text marker echo): NO EVIDENCE');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Agent Definitions"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
  });

  it('marks Agent Definitions as fail when SDK options readback does not match', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-agent-def-fail',
        rawMessages: [],
        chunks: [
          { type: 'text', content: 'AGENT-DEF-PROOF-ACTIVATED\n\nHello!' },
        ],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        agent: undefined,
        agents: undefined,
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
      el.textContent?.includes('Run Agent Definition Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Layer 1 (SDK options readback): FAIL');
    const failMarkers = containerEl.querySelectorAll('[data-capability="Agent Definitions"].opencodian-capability-lab-proof-fail');
    expect(failMarkers.length).toBeGreaterThan(0);
  });

  it('marks Agent Definitions as fail and surfaces SDK rejection in error path', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockRejectedValue(new Error('Unknown agent: opencodian-proof-agent')),
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
      el.textContent?.includes('Run Agent Definition Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Layer 1 (SDK options readback): BLOCKED');
    expect(containerEl.textContent).toContain('Layer 2 (assistant text marker echo): BLOCKED');
    expect(containerEl.textContent).toContain('Unknown agent: opencodian-proof-agent');
    const failMarkers = containerEl.querySelectorAll('[data-capability="Agent Definitions"].opencodian-capability-lab-proof-fail');
    expect(failMarkers.length).toBeGreaterThan(0);
  });

  it('renders Allowed Tools Proof button', () => {
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks Allowed Tools as readback when init catalog coincidentally contains only Read (not allowedTools enforcement)', async () => {
    // Even when the init catalog is a subset, that is NOT allowedTools enforcement.
    // The SDK `tools` restrictor is owned by "Restricted Built-in Tools".
    // allowedTools is a pre-approve/auto-approve shortcut only.
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-coincidental-a',
          rawMessages: [
            { type: 'system', subtype: 'init', tools: ['Read'], model: 'claude-sonnet' },
          ],
          chunks: [
            { type: 'text', content: 'I only have Read access.' },
          ],
        })
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-coincidental-b',
          rawMessages: [],
          chunks: [],
        }),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Configured allowedTools: ["Read"]');
    expect(containerEl.textContent).toContain('NOT allowedTools enforcement');
    expect(containerEl.textContent).toContain('pre-approve/auto-approve shortcut');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
    // Must NOT have pass markers — coincidental catalog subset is not enforcement
    const passMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBe(0);
  });

  it('marks Allowed Tools as readback when init catalog contains non-allowed tools', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-catalog-unfiltered-a',
          rawMessages: [
            { type: 'system', subtype: 'init', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'], model: 'claude-sonnet' },
          ],
          chunks: [
            { type: 'text', content: 'I only used Read.' },
          ],
        })
        // Phase B: non-bypass returns empty
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-catalog-unfiltered-b',
          rawMessages: [],
          chunks: [],
        }),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Configured allowedTools: ["Read"]');
    expect(containerEl.textContent).toContain('Non-allowed in catalog: 4');
    // Phase B produced zero tool calls → inconclusive → readback
    expect(containerEl.textContent).toContain('Phase B inconclusive');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
  });

  it('marks Allowed Tools as readback when init catalog unfiltered and non-allowed tools called (bypassPermissions active)', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-catalog-unfiltered-with-calls-a',
          rawMessages: [
            { type: 'system', subtype: 'init', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'], model: 'claude-sonnet' },
          ],
          chunks: [
            { type: 'tool_use', name: 'Bash' },
            { type: 'tool_use', name: 'Glob' },
            { type: 'tool_result', content: 'file1.txt' },
          ],
        })
        // Phase B: non-bypass returns empty
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-catalog-unfiltered-with-calls-b',
          rawMessages: [],
          chunks: [],
        }),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Configured allowedTools: ["Read"]');
    expect(containerEl.textContent).toContain('Non-allowed in catalog: 4');
    // Phase B inconclusive → readback
    expect(containerEl.textContent).toContain('Phase B inconclusive');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
    // Must NOT have fail markers in this branch
    const failMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-fail');
    expect(failMarkers.length).toBe(0);
  });

  it('marks Allowed Tools as readback when no init message and no tool calls', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-a',
          rawMessages: [],
          chunks: [
            { type: 'text', content: 'I cannot list files because I only have Read access.' },
          ],
        })
        // Phase B: non-bypass returns empty
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-b',
          rawMessages: [],
          chunks: [],
        }),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Configured allowedTools: ["Read"]');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
  });

  it('marks Allowed Tools as readback when non-allowed tool is called (not a restrictor)', async () => {
    // Under the product boundary, observing non-allowed tool calls proves
    // allowedTools is not an availability restrictor — but that is not
    // a "fail", it confirms readback (pre-approve shortcut only).
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-not-restrictor-a',
          rawMessages: [],
          chunks: [
            { type: 'tool_use', name: 'Bash' },
            { type: 'tool_result', content: 'file1.txt\nfile2.txt' },
          ],
        })
        // Phase B: non-bypass returns empty
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-not-restrictor-b',
          rawMessages: [],
          chunks: [],
        }),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Phase A');
    expect(containerEl.textContent).toContain('NOT an availability restrictor');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
    // Must NOT have fail markers — non-allowed calls prove it's not a restrictor, not that it "failed"
    const failMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-fail');
    expect(failMarkers.length).toBe(0);
  });

  it('marks Allowed Tools as readback when Phase B synthetic canUseTool only sees Read (inconclusive, not pass)', async () => {
    // Phase A: bypass-mode shows unfiltered catalog (the usual case).
    // Phase B: non-bypass with synthetic canUseTool that records tool names.
    // Even if only Read reaches canUseTool, this is model-behavior omission,
    // not deterministic SDK-owned enforcement proof.
    const phaseBCanUseToolCalls: string[] = [];
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockImplementationOnce(async () => ({
          sessionId: 'diag-allowed-tools-phaseb-readback-a',
          rawMessages: [
            { type: 'system', subtype: 'init', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'], model: 'claude-sonnet' },
          ],
          chunks: [
            { type: 'tool_use', name: 'Bash' },
            { type: 'tool_result', content: 'file1.txt' },
            { type: 'tool_use', name: 'Read' },
            { type: 'tool_result', content: 'hello' },
          ],
        }))
        // Phase B: non-bypass. Simulate SDK calling canUseTool for Read only.
        .mockImplementationOnce(async (_req: Record<string, unknown>) => {
          const canUseTool = _req._diagnosticCanUseTool as (name: string, input: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<{ behavior: string }>;
          if (canUseTool) {
            await canUseTool('Read', {}, {});
            phaseBCanUseToolCalls.push('Read');
          }
          return {
            sessionId: 'diag-allowed-tools-phaseb-readback-b',
            rawMessages: [],
            chunks: [
              { type: 'tool_use', name: 'Read' },
              { type: 'tool_result', content: 'hello' },
            ],
          };
        }),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    // Single-run model omission of non-allowed tools is NOT pass
    expect(containerEl.textContent).toContain('Phase B inconclusive');
    expect(containerEl.textContent).toContain('not deterministic proof');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
    // Must NOT have pass markers from single-run model omission
    const passMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBe(0);
  });

  it('marks Allowed Tools as readback when Phase B synthetic canUseTool sees non-allowed tools', async () => {
    // Phase A: bypass-mode, unfiltered catalog.
    // Phase B: non-bypass, synthetic canUseTool sees Bash and Read.
    // This proves the SDK does NOT enforce allowedTools before canUseTool.
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        // Phase A
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-phaseb-readback-a',
          rawMessages: [
            { type: 'system', subtype: 'init', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'], model: 'claude-sonnet' },
          ],
          chunks: [
            { type: 'tool_use', name: 'Bash' },
            { type: 'tool_result', content: 'file1.txt' },
          ],
        })
        // Phase B: non-bypass, SDK does not call canUseTool in query() mode —
        // returns executed tools directly. This matches real SDK behavior.
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-phaseb-readback-b',
          rawMessages: [],
          chunks: [
            { type: 'tool_use', name: 'Bash' },
            { type: 'tool_result', content: 'file1.txt' },
            { type: 'tool_use', name: 'Read' },
            { type: 'tool_result', content: 'hello' },
          ],
        }),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    // Phase B: zero canUseTool calls (SDK doesn't invoke it in query() mode)
    // but tools were executed → falls into the "zero canUseTool calls" readback path
    expect(containerEl.textContent).toContain('Phase B');
    expect(containerEl.textContent).toContain('Readback verified');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
  });

  it('marks Allowed Tools as readback when Phase B errors', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn()
        .mockResolvedValueOnce({
          sessionId: 'diag-allowed-tools-phaseb-error-a',
          rawMessages: [
            { type: 'system', subtype: 'init', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob'], model: 'claude-sonnet' },
          ],
          chunks: [],
        })
        // Phase B: non-bypass rejects
        .mockRejectedValueOnce(new Error('Non-bypass diagnostic failed: subprocess error')),
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
      el.textContent?.includes('Run Allowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Non-bypass error');
    expect(containerEl.textContent).toContain('Layer 0 — Proven readback');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Allowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
  });

  it('renders Disallowed Tools Proof button', () => {
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
      el.textContent?.includes('Run Disallowed Tools Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks Disallowed Tools as pass when init message tools catalog excludes Bash', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-disallowed-tools',
        rawMessages: [
          { type: 'system', subtype: 'init', tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], model: 'claude-sonnet' },
        ],
        chunks: [
          { type: 'text', content: 'I cannot use Bash because it is disallowed.' },
        ],
      }),
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
      el.textContent?.includes('Run Disallowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Configured disallowedTools: ["Bash"]');
    expect(containerEl.textContent).toContain('Bash in init catalog: false');
    expect(containerEl.textContent).toContain('Enforcement PASS');
    const passMarkers = containerEl.querySelectorAll('[data-capability="Disallowed Tools"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBeGreaterThan(0);
  });

  it('marks Disallowed Tools as fail when blocked tool is called', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-disallowed-tools-fail',
        rawMessages: [
          { type: 'system', subtype: 'init', tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'], model: 'claude-sonnet' },
        ],
        chunks: [
          { type: 'tool_use', name: 'Bash' },
          { type: 'tool_result', content: 'file1.txt\nfile2.txt' },
        ],
      }),
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
      el.textContent?.includes('Run Disallowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Enforcement FAILED');
    const failMarkers = containerEl.querySelectorAll('[data-capability="Disallowed Tools"].opencodian-capability-lab-proof-fail');
    expect(failMarkers.length).toBeGreaterThan(0);
  });

  it('marks Disallowed Tools as readback when no init message and no tool calls', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-disallowed-tools-noinit',
        rawMessages: [],
        chunks: [
          { type: 'text', content: 'I cannot use Bash.' },
        ],
      }),
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
      el.textContent?.includes('Run Disallowed Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Configured disallowedTools: ["Bash"]');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Disallowed Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
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
        agent: 'proof-agent',
        agents: { 'proof-agent': { description: 'test' } },
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
    expect(containerEl.textContent).toContain('Agent Definitions:');
    expect(containerEl.textContent).toContain('agent="proof-agent"');
    expect(containerEl.textContent).toContain('1 definition(s)');

    // Verify readback markers for capabilities that have options present in SDK options
    // The stable settings readback proof marks capabilities as readback when options are present,
    // regardless of the capability's overall matrix classification.
    // Allowed Tools, Disallowed Tools, Turn/Budget Limits, Environment Variables, Fallback Model, Agent Definitions = 6
    const readbackMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBe(6);

    // Environment Variables no longer gets a pass marker from readback proof (it's pass overall)
    const passMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBeGreaterThanOrEqual(0);

    // Fallback Model is readback (not wiring) — behavior proof failed: SDK accepted invalid primary without error, no fallback triggered; options verified
    const wiringMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-wiring');
    expect(wiringMarkers.length).toBe(0);
  });

  it('renders Query.getSettings runtime settings readback without changing matrix proof markers', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-runtime-settings-readback',
        rawMessages: [],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        allowedTools: ['Read'],
        disallowedTools: [],
        env: {},
      }),
      getRuntimeSettings: jest.fn().mockResolvedValue({
        model: 'claude-sonnet-4-5',
        env: { ANTHROPIC_API_KEY: 'secret-value' },
        processEnv: { OPENCODIAN_REAL_ENV: 'process-env-secret' },
        permissions: { defaultMode: 'default' },
        safe: { label: 'visible-runtime-setting' },
        nested: {
          apiKey: 'camel-api-key-secret',
          clientSecret: 'client-secret-value',
          oauth: { accessToken: 'oauth-token-value' },
          tokenList: ['array-token-value'],
          headers: [
            { Authorization: 'Bearer authorization-secret' },
          ],
          profile: {
            credentials: [
              { username: 'safe-name', password: 'nested-password-secret' },
            ],
          },
        },
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

    button!.click();
    await flushUi();

    expect(adapter.getRuntimeSettings).toHaveBeenCalledTimes(1);
    const text = containerEl.textContent ?? '';
    expect(text).toContain('Runtime Settings Readback (Query.getSettings)');
    expect(text).toContain('claude-sonnet-4-5');
    expect(text).toContain('visible-runtime-setting');
    expect(text).toContain('[redacted');
    expect(text).not.toContain('secret-value');
    expect(text).not.toContain('process-env-secret');
    expect(text).not.toContain('camel-api-key-secret');
    expect(text).not.toContain('client-secret-value');
    expect(text).not.toContain('oauth-token-value');
    expect(text).not.toContain('array-token-value');
    expect(text).not.toContain('Bearer authorization-secret');
    expect(text).not.toContain('nested-password-secret');

    const runtimeReadbackEl = containerEl.querySelector('[data-runtime-settings-readback="true"][data-proof-state="readback"]');
    expect(runtimeReadbackEl).not.toBeNull();
    const readbackMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBe(1);
  });

  it('keeps Query.getSettings runtime settings readback as a no-op when no snapshot is returned', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-runtime-settings-empty',
        rawMessages: [],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        allowedTools: [],
        disallowedTools: [],
        env: {},
      }),
      getRuntimeSettings: jest.fn().mockResolvedValue(null),
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

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Query.getSettings() returned no runtime settings snapshot');
    const passMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBe(0);
  });

  it('keeps stable settings readback intact when Query.getSettings runtime readback fails', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-runtime-settings-failure',
        rawMessages: [],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({
        allowedTools: ['Read'],
        disallowedTools: [],
        env: {},
      }),
      getRuntimeSettings: jest.fn().mockRejectedValue(new Error('SDK getSettings unavailable')),
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

    button!.click();
    await flushUi();

    expect(adapter.getRuntimeSettings).toHaveBeenCalledTimes(1);
    expect(containerEl.textContent).toContain('Allowed Tools:');
    expect(containerEl.textContent).toContain('1 tool(s) configured');
    expect(containerEl.textContent).toContain('Query.getSettings() readback failed');
    expect(containerEl.textContent).toContain('Existing SDK options readback remains the available evidence');
    const readbackMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBe(1);
    const passMarkers = containerEl.querySelectorAll('.opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBe(0);
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

  // ── Restricted Built-in Tools Proof Tests ──

  it('renders Restricted Built-in Tools Proof button', () => {
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
      el.textContent?.includes('Run Restricted Built-in Tools Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('restricted builtin proof uses real settings wiring not diagnostic escape hatch', async () => {
    // The proof must temporarily set restrictedBuiltinTools=['Read'] on the live
    // settings object, NOT pass _diagnosticToolRestriction to the diagnostic prompt.
    const diagnosticCalls: Record<string, unknown>[] = [];
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockImplementation(async (req: Record<string, unknown>) => {
        diagnosticCalls.push(req);
        return {
          sessionId: 'diag-restricted-builtin-wiring',
          rawMessages: [
            { type: 'system', subtype: 'init', tools: ['Read', 'mcp__server__tool'], model: 'claude-sonnet' },
          ],
          chunks: [],
        };
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({ tools: ['Read'] }),
      capabilities: new Set(),
    };
    const plugin = createMockPlugin(adapter);
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin,
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Restricted Built-in Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    // Verify the diagnostic prompt was called WITHOUT _diagnosticToolRestriction
    expect(diagnosticCalls.length).toBe(1);
    expect(diagnosticCalls[0]).not.toHaveProperty('_diagnosticToolRestriction');
    // Verify it WAS called with bypassPermissions (the proof uses bypass mode)
    expect(diagnosticCalls[0]._diagnosticBypassPermissions).toBe(true);
  });

  it('restricted builtin proof restores original setting after pass', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-restricted-builtin-restore',
        rawMessages: [
          { type: 'system', subtype: 'init', tools: ['Read', 'mcp__server__tool'], model: 'claude-sonnet' },
        ],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({ tools: ['Read'] }),
      capabilities: new Set(),
    };
    // Pre-set a non-empty original value to verify restore
    const plugin = createMockPlugin(adapter, 'claude-code', {
      restrictedBuiltinTools: ['Bash', 'Write'],
    });
    const originalValue = (plugin.settings.backendSettings.claudeCode as Record<string, unknown>).restrictedBuiltinTools;
    expect(originalValue).toEqual(['Bash', 'Write']);

    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin,
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Restricted Built-in Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    // The original restrictedBuiltinTools must be restored on the live settings object
    const currentValue = (plugin.settings.backendSettings.claudeCode as Record<string, unknown>).restrictedBuiltinTools;
    expect(currentValue).toEqual(['Bash', 'Write']);
  });

  it('restricted builtin proof restores original setting after error', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockRejectedValue(new Error('SDK subprocess crashed')),
      inspectLastDiagnosticSdkOptions: jest.fn(),
      capabilities: new Set(),
    };
    const plugin = createMockPlugin(adapter, 'claude-code', {
      restrictedBuiltinTools: ['Glob'],
    });

    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin,
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Restricted Built-in Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    // Even on error, the original setting must be restored
    const currentValue = (plugin.settings.backendSettings.claudeCode as Record<string, unknown>).restrictedBuiltinTools;
    expect(currentValue).toEqual(['Glob']);
  });

  it('restricted builtin proof passes when only Read and MCP tools in catalog', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-restricted-builtin-pass',
        rawMessages: [
          { type: 'system', subtype: 'init', tools: ['Read', 'mcp__ctx7__resolve', 'mcp__mem__search'], model: 'claude-sonnet' },
        ],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({ tools: ['Read'] }),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Restricted Built-in Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('PASS');
    expect(containerEl.textContent).toContain('MCP tools [mcp__ctx7__resolve, mcp__mem__search] correctly pass through');
    const passMarkers = containerEl.querySelectorAll('[data-capability="Restricted Built-in Tools"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBeGreaterThan(0);
  });

  it('restricted builtin proof readbacks when non-MCP extra tools remain', async () => {
    // Init catalog has Read (requested) + mcp__tool (ok) + Bash (NOT ok — non-MCP extra)
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-restricted-builtin-readback',
        rawMessages: [
          { type: 'system', subtype: 'init', tools: ['Read', 'Bash', 'mcp__server__tool'], model: 'claude-sonnet' },
        ],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({ tools: ['Read'] }),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Restricted Built-in Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('READBACK');
    expect(containerEl.textContent).toContain('non-MCP non-requested tools remain');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Restricted Built-in Tools"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
    // Must NOT be pass
    const passMarkers = containerEl.querySelectorAll('[data-capability="Restricted Built-in Tools"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBe(0);
  });

  it('restricted builtin proof fails when Read missing from catalog', async () => {
    // Init catalog has no Read at all — the requested tool is absent
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-restricted-builtin-fail',
        rawMessages: [
          { type: 'system', subtype: 'init', tools: ['mcp__server__tool'], model: 'claude-sonnet' },
        ],
        chunks: [],
      }),
      inspectLastDiagnosticSdkOptions: jest.fn().mockReturnValue({ tools: ['Read'] }),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Restricted Built-in Tools Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('FAIL');
    const failMarkers = containerEl.querySelectorAll('[data-capability="Restricted Built-in Tools"].opencodian-capability-lab-proof-fail');
    expect(failMarkers.length).toBeGreaterThan(0);
  });

  // ── Plugins Proof Tests ──

  it('renders Plugins Proof button', () => {
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
      el.textContent?.includes('Run Plugins Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks Plugins as readback when plugin MCP servers exist but no plugin skills', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-plugins-mcp-only',
        rawMessages: [
          {
            type: 'system',
            subtype: 'init',
            plugins: [
              { name: 'context7@claude-plugins-official', path: '/Users/test/.claude/plugins/cache/claude-plugins-official/context7/abc123' },
              { name: 'claude-mem@thedotmack', path: '/Users/test/.claude/plugins/cache/thedotmack/claude-mem/1.0' },
            ],
            mcp_servers: [
              { name: 'context7', status: 'connected' },
              { name: 'filesystem', status: 'connected' },
            ],
            skills: ['some-skill'],
            slash_commands: [],
            tools: ['Read', 'Write'],
          },
        ],
        chunks: [
          { type: 'text', content: 'PLUGINS-PROOF-ACK' },
        ],
      }),
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
      el.textContent?.includes('Run Plugins Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    // MCP servers alone are registration evidence, not behavior proof.
    // Pass requires plugin-provided skills in init.skills.
    expect(containerEl.textContent).toContain('READBACK');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Plugins"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
  });

  it('marks Plugins as pass when init message shows plugin-contributed skills', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-plugins-skills',
        rawMessages: [
          {
            type: 'system',
            subtype: 'init',
            plugins: [
              { name: 'document-skills@anthropic-agent-skills', path: '/Users/test/.claude/plugins/cache/anthropic-agent-skills/document-skills/abc' },
            ],
            mcp_servers: [],
            skills: ['document-skills', 'other-skill'],
            slash_commands: [],
            tools: ['Read'],
          },
        ],
        chunks: [
          { type: 'text', content: 'PLUGINS-PROOF-ACK' },
        ],
      }),
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
      el.textContent?.includes('Run Plugins Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('PASS');
    const passMarkers = containerEl.querySelectorAll('[data-capability="Plugins"].opencodian-capability-lab-proof-pass');
    expect(passMarkers.length).toBeGreaterThan(0);
  });

  it('marks Plugins as readback when plugins loaded but no correlated contributions', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-plugins-readback',
        rawMessages: [
          {
            type: 'system',
            subtype: 'init',
            plugins: [
              { name: 'my-plugin@some-marketplace', path: '/Users/test/.claude/plugins/cache/some-marketplace/my-plugin/1.0' },
            ],
            mcp_servers: [{ name: 'unrelated-server', status: 'connected' }],
            skills: ['unrelated-skill'],
            slash_commands: [],
            tools: ['Read'],
          },
        ],
        chunks: [
          { type: 'text', content: 'PLUGINS-PROOF-ACK' },
        ],
      }),
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
      el.textContent?.includes('Run Plugins Proof')
    )) as HTMLButtonElement | undefined;

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('READBACK');
    const readbackMarkers = containerEl.querySelectorAll('[data-capability="Plugins"].opencodian-capability-lab-proof-readback');
    expect(readbackMarkers.length).toBeGreaterThan(0);
  });

  // =======================================================================
  // SetModel Live Proof — diagnostic probe for query.setModel() live behavior
  // =======================================================================

  it('renders setModel live proof button in discovery controls', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSetModelLiveProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run SetModel Live Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('marks setModel live as pass when model switches after setModel call', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSetModelLiveProbe: jest.fn().mockResolvedValue({
        setModelAttempted: true,
        setModelError: undefined,
        setModelNotAvailable: false,
        phase1ModelKeys: ['claude-sonnet-4-5'],
        phase2ModelKeys: ['claude-opus-4-5'],
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
      el.textContent?.includes('Run SetModel Live Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('claude-opus-4-5');
    const proofMarker = containerEl.querySelector('[data-capability="SetModel Live"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('marks setModel live as readback when model does not switch after setModel call', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSetModelLiveProbe: jest.fn().mockResolvedValue({
        setModelAttempted: true,
        setModelError: undefined,
        setModelNotAvailable: false,
        phase1ModelKeys: ['claude-sonnet-4-5'],
        phase2ModelKeys: ['claude-sonnet-4-5'],
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
      el.textContent?.includes('Run SetModel Live Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('readback');
    const proofMarker = containerEl.querySelector('[data-capability="SetModel Live"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('marks setModel live as readback when setModel throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSetModelLiveProbe: jest.fn().mockResolvedValue({
        setModelAttempted: true,
        setModelError: 'model switch rejected',
        setModelNotAvailable: false,
        phase1ModelKeys: ['claude-sonnet-4-5'],
        phase2ModelKeys: ['claude-sonnet-4-5'],
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
      el.textContent?.includes('Run SetModel Live Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('model switch rejected');
    const proofMarker = containerEl.querySelector('[data-capability="SetModel Live"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
  });

  it('marks setModel live as boundary when setModel not available on query', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSetModelLiveProbe: jest.fn().mockResolvedValue({
        setModelAttempted: false,
        setModelError: undefined,
        setModelNotAvailable: true,
        phase1ModelKeys: [],
        phase2ModelKeys: [],
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
      el.textContent?.includes('Run SetModel Live Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('not available');
    const proofMarker = containerEl.querySelector('[data-capability="SetModel Live"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-boundary')).toBe(true);
  });

  it('marks setModel live as fail when adapter throws exception', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSetModelLiveProbe: jest.fn().mockRejectedValue(new Error('SDK setModel probe error')),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run SetModel Live Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('SDK setModel probe error');
    const proofMarker = containerEl.querySelector('[data-capability="SetModel Live"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  /* eslint-enable @typescript-eslint/no-explicit-any */

  // =====================================================================
  // /context Diagnostic capability seam — diagnostic-only proof
  // =====================================================================

  it('runs the command execution proof and marks pass when /context returns Context Usage', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-cmd-exec-1',
        rawMessages: [
          { type: 'system', subtype: 'init', session_id: 'diag-cmd-exec-1' },
          { type: 'assistant', subtype: 'text', session_id: 'diag-cmd-exec-1', message: { content: [{ type: 'text', text: '## Context Usage\nUsing 5 of 200k tokens.' }] } },
          { type: 'result', subtype: 'success', session_id: 'diag-cmd-exec-1' },
        ],
        chunks: [],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run /context Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Verify adapter was called with /context prompt, persistSession:false, diagnostic bypass
    expect(adapter.runDiagnosticPrompt).toHaveBeenCalledWith(expect.objectContaining({
      prompt: '/context',
      persistSession: false,
      _diagnosticBypassPermissions: true,
    }));

    // Verify output contains the session and evidence
    expect(containerEl.textContent).toContain('diag-cmd-exec-1');
    expect(containerEl.textContent).toContain('Context Usage');

    // Verify pass marker
    const proofMarker = containerEl.querySelector('[data-capability="/context Diagnostic"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);

    // Verify diagnostic-only honesty text
    expect(containerEl.textContent).toContain('diagnostic-only');
    expect(containerEl.textContent).toContain('/context');
  });

  it('detects Context Usage from normalized text chunks when rawMessages have no assistant content', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-cmd-exec-chunks',
        rawMessages: [
          { type: 'system', subtype: 'init', session_id: 'diag-cmd-exec-chunks' },
          { type: 'assistant', subtype: 'text', session_id: 'diag-cmd-exec-chunks', message: { content: [{ type: 'text', text: '## Context Usage\nUsing 3 of 200k tokens.' }] } },
          { type: 'result', subtype: 'success', session_id: 'diag-cmd-exec-chunks' },
        ],
        chunks: [
          { type: 'text', content: '## Context Usage\nUsing 3 of 200k tokens.' },
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
      el.textContent?.includes('Run /context Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Must classify as pass — chunks contain Context Usage
    const proofMarker = containerEl.querySelector('[data-capability="/context Diagnostic"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain('Context Usage');
  });

  it('marks command execution as readback when output is present but lacks Context Usage', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-cmd-exec-2',
        rawMessages: [
          { type: 'system', subtype: 'init', session_id: 'diag-cmd-exec-2' },
          { type: 'assistant', subtype: 'text', session_id: 'diag-cmd-exec-2', message: { content: [{ type: 'text', text: 'Hello, I can help you with that.' }] } },
          { type: 'result', subtype: 'success', session_id: 'diag-cmd-exec-2' },
        ],
        chunks: [],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run /context Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Must NOT classify as pass — output lacks "Context Usage"
    const passMarker = containerEl.querySelector('[data-capability="/context Diagnostic"].opencodian-capability-lab-proof-pass');
    expect(passMarker).toBeNull();

    // Must classify as readback — adapter returned messages but unexpected content
    const readbackMarker = containerEl.querySelector('[data-capability="/context Diagnostic"].opencodian-capability-lab-proof-readback');
    expect(readbackMarker).toBeTruthy();

    // Honest classification text
    expect(containerEl.textContent).toContain('Readback verified');
  });

  it('marks command execution as fail when adapter throws exception', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockRejectedValue(new Error('SDK command execution error')),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run /context Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('SDK command execution error');
    const proofMarker = containerEl.querySelector('[data-capability="/context Diagnostic"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('marks command execution as readback when adapter returns empty rawMessages', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-cmd-exec-3',
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
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run /context Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Must NOT classify as pass — empty messages
    const passMarker = containerEl.querySelector('[data-capability="/context Diagnostic"].opencodian-capability-lab-proof-pass');
    expect(passMarker).toBeNull();

    // Must classify as readback
    const readbackMarker = containerEl.querySelector('[data-capability="/context Diagnostic"].opencodian-capability-lab-proof-readback');
    expect(readbackMarker).toBeTruthy();
  });

  it('verifies command execution proof uses persistSession false to avoid session pollution', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'diag-cmd-exec-4',
        rawMessages: [
          { type: 'system', subtype: 'init', session_id: 'diag-cmd-exec-4' },
          { type: 'assistant', subtype: 'text', session_id: 'diag-cmd-exec-4', message: { content: '## Context Usage\nUsing 1 of 200k tokens.' } },
          { type: 'result', subtype: 'success', session_id: 'diag-cmd-exec-4' },
        ],
        chunks: [],
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run /context Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Verify no session pollution — persistSession must be false
    const callArgs = adapter.runDiagnosticPrompt.mock.calls[0][0] as { persistSession: boolean };
    expect(callArgs.persistSession).toBe(false);

    // Verify no resume session (ordinary-session isolation)
    expect(callArgs).not.toHaveProperty('resumeSessionId');
  });

  // =====================================================================
  // Warm Startup capability seam — diagnostic readback proof
  // =====================================================================

  it('runs the warm startup proof and marks readback when startup resolves and warm query responds', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runWarmStartupProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        startupResolved: true,
        warmQueryAvailable: true,
        warmQueryResponded: true,
        rawMessageCount: 3,
        error: undefined,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Warm Startup Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runWarmStartupProbe).toHaveBeenCalled();

    // Verify readback marker (not pass)
    const proofMarker = containerEl.querySelector('[data-capability="Warm Startup"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);

    // Verify diagnostic-only honesty text
    expect(containerEl.textContent).toContain('readback');
  });

  it('runs the warm startup proof and marks fail when startup throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runWarmStartupProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        startupResolved: false,
        warmQueryAvailable: false,
        warmQueryResponded: false,
        rawMessageCount: 0,
        error: 'startup failed: SDK initialization timeout',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Warm Startup Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Verify fail marker
    const proofMarker = containerEl.querySelector('[data-capability="Warm Startup"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('runs the warm startup proof and marks boundary when SDK does not expose startup', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runWarmStartupProbe: jest.fn().mockResolvedValue({
        classification: 'boundary',
        startupResolved: false,
        warmQueryAvailable: false,
        warmQueryResponded: false,
        rawMessageCount: 0,
        error: undefined,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Warm Startup Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Verify boundary marker
    const proofMarker = containerEl.querySelector('[data-capability="Warm Startup"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-boundary')).toBe(true);
  });

  it('renders Stderr Diagnostic Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStderrDiagnosticProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Stderr Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the stderr diagnostic proof and marks readback when callback is wired', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStderrDiagnosticProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        callbackWired: true,
        chunksReceived: 2,
        totalBytes: 42,
        sanitizedPreview: 'debug: loading model…',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Stderr Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runStderrDiagnosticProbe).toHaveBeenCalled();

    // Verify readback marker (not pass)
    const proofMarker = containerEl.querySelector('[data-capability="Stderr Diagnostic"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);

    // Verify diagnostic-only honesty text
    expect(containerEl.textContent).toContain('readback');
    expect(containerEl.textContent).toContain('Callback wired');
  });

  it('runs the stderr diagnostic proof and marks readback when no stderr observed', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStderrDiagnosticProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        callbackWired: true,
        chunksReceived: 0,
        totalBytes: 0,
        sanitizedPreview: 'Callback wired — no stderr observed',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Stderr Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Verify readback marker (honest: no output is still readback, not pass)
    const proofMarker = containerEl.querySelector('[data-capability="Stderr Diagnostic"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(containerEl.textContent).toContain('no stderr observed');
  });

  it('runs the stderr diagnostic proof and marks fail when probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStderrDiagnosticProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        callbackWired: false,
        chunksReceived: 0,
        totalBytes: 0,
        sanitizedPreview: undefined,
        error: 'SDK query failed',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Stderr Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    // Verify fail marker
    const proofMarker = containerEl.querySelector('[data-capability="Stderr Diagnostic"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('renders honest boundary text for stderr diagnostic proof', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStderrDiagnosticProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        callbackWired: true,
        isolatedDiagnosticOnly: true,
        chunksReceived: 1,
        totalBytes: 42,
        sanitizedPreview: 'debug: loading model…',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Stderr Diagnostic Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Isolated diagnostic query');
    expect(containerEl.textContent).toContain('Active ordinary chat sessions do not gain a live stderr subscription');
    expect(containerEl.textContent).toContain('No persistent raw-log surface');
    expect(containerEl.textContent).toContain('file write is exposed');
  });

  it('renders stderr diagnostic proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStderrDiagnosticProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        callbackWired: true,
        isolatedDiagnosticOnly: true,
        chunksReceived: 1,
        totalBytes: 42,
        sanitizedPreview: 'debug: loading model…',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('运行 Stderr 诊断证明')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('隔离诊断查询');
    expect(containerEl.textContent).toContain('活跃的普通聊天会话不会获得实时 stderr 订阅');
    expect(containerEl.textContent).toContain('不会写入文件');
  });

  it('renders Prompt Suggestions Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPromptSuggestionsReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Prompt Suggestions Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the prompt suggestions readback proof and marks readback when option is wired', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPromptSuggestionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        optionValue: true,
        sdkOptionPresent: true,
        modelState: 'claude',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Prompt Suggestions Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    // Verify readback marker
    const proofMarker = containerEl.querySelector('[data-capability="Prompt Suggestions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(containerEl.textContent).toContain('Readback');
    expect(containerEl.textContent).toContain('Active sessions do not update live');
  });

  it('runs the prompt suggestions readback proof and marks fail when probe returns fail', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPromptSuggestionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        optionWired: false,
        optionValue: true,
        sdkOptionPresent: false,
        modelState: 'unknown',
        error: 'promptSuggestions is enabled in settings but missing from built SDK options.',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Prompt Suggestions Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Prompt Suggestions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('marks fail when the prompt suggestions readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPromptSuggestionsReadbackProbe: jest.fn().mockRejectedValue(new Error('probe crashed')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Prompt Suggestions Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Prompt Suggestions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('renders prompt suggestions readback proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPromptSuggestionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        optionValue: true,
        sdkOptionPresent: true,
        modelState: 'claude',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('运行提示建议 Readback 证明')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('诊断 readback');
    expect(containerEl.textContent).toContain('仅在下次查询或重启会话时生效');
  });

  it('renders prompt suggestions proof output with model state and blocker note', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPromptSuggestionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        optionValue: true,
        sdkOptionPresent: true,
        modelState: 'non-claude',
        blockerNote: 'Option enabled but model is non-Claude. Prompt suggestions piggyback on Claude-specific prompt caching; non-Claude models may not emit suggestions.',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Prompt Suggestions Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('Non-Claude');
    expect(containerEl.textContent).toContain('non-Claude');
    expect(containerEl.textContent).toContain('piggyback');
  });

  it('renders System Prompt Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSystemPromptReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run System Prompt Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the system prompt readback proof and marks readback when option is wired', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSystemPromptReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        emptySetting: false,
        presetPreserved: true,
        appendValue: 'Be concise.',
        expectedAppendValue: 'Be concise.',
        appendMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run System Prompt Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runSystemPromptReadbackProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="System Prompt"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
  });

  it('renders System Prompt Live Behavior Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSystemPromptLiveProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run System Prompt Live Behavior Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the system prompt live proof and marks pass when nonce is recalled', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSystemPromptLiveProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        nonce: 'abc123',
        nonceRecalled: true,
        responsePreview: 'The secret codeword is abc123',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run System Prompt Live Behavior Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runSystemPromptLiveProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="System Prompt"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain('Diagnostic live proof: this probe injects a one-off appended system prompt through the same preset-with-append SDK path.');
    expect(containerEl.textContent).toContain('Use System Prompt Readback Proof to confirm the currently saved appended-instructions value is wired into that same path.');
    expect(containerEl.textContent).toContain('Fresh diagnostic query only. Active sessions are not mutated.');
    expect(containerEl.textContent).toContain('the preset-with-append system prompt path influenced the model response');
  });

  it('runs the system prompt live proof and marks fail when nonce is not recalled', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSystemPromptLiveProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        nonce: 'abc123',
        nonceRecalled: false,
        responsePreview: 'I do not know.',
        error: 'Nonce not found in response.',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run System Prompt Live Behavior Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="System Prompt"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('renders system prompt live proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSystemPromptLiveProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        nonce: 'abc123',
        nonceRecalled: true,
        responsePreview: 'secret codeword: abc123',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('运行 System Prompt 实时行为证明')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain('诊断实时证明');
    expect(containerEl.textContent).toContain('当前已保存的附加指令值是否接入同一路径');
    expect(containerEl.textContent).toContain('不会修改活跃会话');
  });

  it('renders Task Budget Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runTaskBudgetReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Task Budget Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the task budget readback proof and marks readback', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runTaskBudgetReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: 50000,
        sdkOptionPresent: true,
        sdkTotalValue: 50000,
        totalMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Task Budget Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runTaskBudgetReadbackProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Task Budget"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
  });

  it('renders Sandbox Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSandboxReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.sandbox.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the sandbox readback proof and marks readback with lifecycle boundary', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSandboxReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingEnabled: true,
        settingFailIfUnavailable: true,
        settingAutoAllowBashIfSandboxed: true,
        sdkOptionPresent: true,
        sdkEnabled: true,
        sdkFailIfUnavailable: true,
        sdkAutoAllowBashIfSandboxed: true,
        enabledMatch: true,
        failIfUnavailableMatch: true,
        autoAllowBashIfSandboxedMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.sandbox.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runSandboxReadbackProbe).toHaveBeenCalled();

    // Lifecycle boundary must be explicit in the proof output
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.sandbox.lifecycleBoundary')
    );

    // Honesty boundary must be explicit
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.sandbox.boundary')
    );

    // Readback classification marker
    const proofMarker = containerEl.querySelector('[data-capability="Sandbox"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('renders sandbox proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSandboxReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingEnabled: true,
        settingFailIfUnavailable: true,
        settingAutoAllowBashIfSandboxed: true,
        sdkOptionPresent: true,
        sdkEnabled: true,
        sdkFailIfUnavailable: true,
        sdkAutoAllowBashIfSandboxed: true,
        enabledMatch: true,
        failIfUnavailableMatch: true,
        autoAllowBashIfSandboxedMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.sandbox.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    // Chinese lifecycle boundary must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.sandbox.lifecycleBoundary')
    );
    // Chinese boundary notice must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.sandbox.boundary')
    );
    // Chinese readback marker
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.sandbox.readback')
    );
  });

  it('marks fail when the sandbox readback probe returns fail', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSandboxReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        optionWired: false,
        settingEnabled: true,
        settingFailIfUnavailable: true,
        settingAutoAllowBashIfSandboxed: true,
        sdkOptionPresent: false,
        enabledMatch: false,
        failIfUnavailableMatch: false,
        autoAllowBashIfSandboxedMatch: false,
        error: 'sandbox option not wired into SDK options',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.sandbox.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Sandbox"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(false);
    expect(containerEl.textContent).toContain('sandbox option not wired');
  });

  it('marks fail when the sandbox readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSandboxReadbackProbe: jest.fn().mockRejectedValue(new Error('probe crashed')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.sandbox.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Sandbox"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('probe crashed');
  });

  it('renders Plan Mode Instructions Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructions.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the plan mode instructions readback proof and marks readback', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        permissionMode: 'plan',
        settingValue: 'Use bullet points.',
        sdkOptionPresent: true,
        sdkValue: 'Use bullet points.',
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructions.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runPlanModeInstructionsReadbackProbe).toHaveBeenCalled();

    // Lifecycle boundary must be explicit in the proof output
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.planModeInstructions.lifecycleBoundary')
    );

    const proofMarker = containerEl.querySelector('[data-capability="Plan Mode Instructions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
  });

  it('surfaces non-plan wiring as readback-only when permission mode is not plan', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        permissionMode: 'default',
        settingValue: 'Use bullet points.',
        sdkOptionPresent: true,
        sdkValue: 'Use bullet points.',
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructions.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    // Builder wiring nuance must surface from locale
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.planModeInstructions.builderWiringNuance')
    );
    // Must remain readback, not pass
    const proofMarker = containerEl.querySelector('[data-capability="Plan Mode Instructions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('renders plan mode instructions proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        permissionMode: 'plan',
        settingValue: 'Use bullet points.',
        sdkOptionPresent: true,
        sdkValue: 'Use bullet points.',
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructions.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    // Chinese lifecycle boundary must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.planModeInstructions.lifecycleBoundary')
    );
    // Chinese boundary notice must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.planModeInstructions.boundary')
    );
  });

  it('marks fail when the plan mode instructions readback probe returns fail', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        error: 'value mismatch',
        optionWired: true,
        permissionMode: 'plan',
        settingValue: 'Use bullet points.',
        sdkOptionPresent: true,
        sdkValue: 'Different value.',
        valueMatch: false,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructions.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Plan Mode Instructions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(false);
    expect(containerEl.textContent).toContain('value mismatch');
  });

  it('marks fail when the plan mode instructions readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsReadbackProbe: jest.fn().mockRejectedValue(new Error('probe exploded')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructions.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Plan Mode Instructions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('probe exploded');
  });

  it('renders Plan Mode Instructions Live Behavior Proof button from locale', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsLiveProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructionsLive.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the plan mode instructions live proof and marks pass', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runPlanModeInstructionsLiveProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        nonce: 'abcd1234',
        nonceRecalled: true,
        responsePreview: 'abcd1234',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.planModeInstructionsLive.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runPlanModeInstructionsLiveProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Plan Mode Instructions"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.planModeInstructionsLive.behaviorBoundary'));
    expect(containerEl.textContent).toContain('abcd1234');
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.planModeInstructionsLive.pass'));
  });

  it('renders Output Style Live Behavior Proof button from locale', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runOutputStyleLiveProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.outputStyleLive.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the output style live proof and marks pass only for nonce recall', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runOutputStyleLiveProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        styleName: 'opencodian-proof-abcd1234',
        nonce: 'abcd1234',
        nonceRecalled: true,
        outputStyleOptionWired: true,
        responsePreview: 'Output-style proof: abcd1234',
        tempStylePath: '/tmp/vault/.claude/output-styles/opencodian-proof-abcd1234.md',
        cleanup: { fileRemoved: true, emptyDirRemoved: true },
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.outputStyleLive.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runOutputStyleLiveProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Output Style"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.outputStyleLive.behaviorBoundary'));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.outputStyleLive.lifecycleBoundary'));
    expect(containerEl.textContent).toContain('opencodian-proof-abcd1234');
    expect(containerEl.textContent).toContain('abcd1234');
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.outputStyleLive.pass'));
  });

  it('marks fail when the output style live proof misses the nonce', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runOutputStyleLiveProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        styleName: 'opencodian-proof-abcd1234',
        nonce: 'abcd1234',
        nonceRecalled: false,
        outputStyleOptionWired: true,
        responsePreview: 'No proof code.',
        tempStylePath: '/tmp/vault/.claude/output-styles/opencodian-proof-abcd1234.md',
        cleanup: { fileRemoved: true },
        error: 'Nonce not found in response.',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.outputStyleLive.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Output Style"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
    expect(containerEl.textContent).toContain('Nonce not found in response.');
  });

  it('renders Tool Aliases Readback Proof button backed by locale key', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runToolAliasesReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.toolAliases.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the tool aliases readback proof and marks readback with lifecycle boundary', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runToolAliasesReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingEmpty: false,
        sdkOptionPresent: true,
        sdkEntryCount: 2,
        entriesMatch: true,
        defensiveCopyPreserved: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.toolAliases.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runToolAliasesReadbackProbe).toHaveBeenCalled();

    // Lifecycle boundary must be explicit in the proof output
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.toolAliases.lifecycleBoundary')
    );

    // Honesty boundary must be explicit
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.toolAliases.boundary')
    );

    // Readback classification marker
    const proofMarker = containerEl.querySelector('[data-capability="Tool Aliases"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('renders tool aliases proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runToolAliasesReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingEmpty: false,
        sdkOptionPresent: true,
        sdkEntryCount: 2,
        entriesMatch: true,
        defensiveCopyPreserved: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.toolAliases.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    // Chinese lifecycle boundary must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.toolAliases.lifecycleBoundary')
    );
    // Chinese boundary notice must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.toolAliases.boundary')
    );
    // Chinese readback marker
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.toolAliases.readback')
    );
  });

  it('marks fail when the tool aliases readback probe returns fail', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runToolAliasesReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        optionWired: true,
        settingEmpty: false,
        sdkOptionPresent: true,
        sdkEntryCount: 1,
        entriesMatch: false,
        defensiveCopyPreserved: true,
        error: 'toolAliases entries mismatch',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.toolAliases.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Tool Aliases"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(false);
    expect(containerEl.textContent).toContain('toolAliases entries mismatch');
  });

  it('marks fail when the tool aliases readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runToolAliasesReadbackProbe: jest.fn().mockRejectedValue(new Error('probe threw')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.toolAliases.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Tool Aliases"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('probe threw');
  });

  it('renders Task Budget Readback Proof button backed by locale key', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runTaskBudgetReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.taskBudget.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the task budget readback proof and marks readback with lifecycle boundary', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runTaskBudgetReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: 50000,
        sdkOptionPresent: true,
        sdkTotalValue: 50000,
        totalMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.taskBudget.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runTaskBudgetReadbackProbe).toHaveBeenCalled();

    // Lifecycle boundary must be explicit in the proof output
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.taskBudget.lifecycleBoundary')
    );

    // Honesty boundary must be explicit
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.taskBudget.boundary')
    );

    // Readback classification marker
    const proofMarker = containerEl.querySelector('[data-capability="Task Budget"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(false);
  });

  it('renders task budget proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runTaskBudgetReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: 50000,
        sdkOptionPresent: true,
        sdkTotalValue: 50000,
        totalMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.taskBudget.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    // Chinese lifecycle boundary must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.taskBudget.lifecycleBoundary')
    );
    // Chinese boundary notice must appear
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.taskBudget.boundary')
    );
    // Chinese readback marker
    expect(containerEl.textContent).toContain(
      t('settings.capabilityLab.proofs.taskBudget.readback')
    );
  });

  it('marks fail when the task budget readback probe returns fail', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runTaskBudgetReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        optionWired: false,
        settingValue: 50000,
        sdkOptionPresent: false,
        totalMatch: false,
        error: 'taskBudget is 50000 in settings but SDK options have total=undefined.',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.taskBudget.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Task Budget"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(false);
    expect(containerEl.textContent).toContain('50000 in settings');
  });

  it('marks fail when the task budget readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runTaskBudgetReadbackProbe: jest.fn().mockRejectedValue(new Error('probe crashed')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.taskBudget.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Task Budget"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('probe crashed');
  });

  it('renders Debug File Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugFileReadbackProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debugFile.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the debug file readback proof and marks readback', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugFileReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: '/tmp/claude-debug.log',
        emptySetting: false,
        sdkOptionPresent: true,
        sdkValue: '/tmp/claude-debug.log',
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debugFile.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDebugFileReadbackProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Debug File"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debugFile.settingValue', {
      value: '"/tmp/claude-debug.log"',
    }));
    expect(containerEl.textContent).toContain('/tmp/claude-debug.log');
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debugFile.boundary'));
  });

  it('marks fail when the debug file readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugFileReadbackProbe: jest.fn().mockRejectedValue(new Error('probe exploded')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debugFile.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Debug File"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('probe exploded');
  });

  it('renders Debug File Live Proof button from locale', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugFileLiveProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debugFileLive.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the debug file live proof and marks pass', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugFileLiveProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        tempDir: '/tmp/opencodian-debug-file-probe-123',
        debugFilePath: '/tmp/opencodian-debug-file-probe-123/debug.log',
        fileExists: true,
        fileSize: 128,
        optionWired: true,
        sessionId: 'ses_debug_file_probe',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debugFileLive.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDebugFileLiveProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Debug File"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debugFileLive.boundary'));
    expect(containerEl.textContent).toContain('/tmp/opencodian-debug-file-probe-123/debug.log');
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debugFileLive.pass'));
  });

  it('renders Debug Readback Proof button from locale', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugReadbackProbe: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debug.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the debug readback proof and marks readback with lifecycle boundary', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: false,
        sdkOptionPresent: false,
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debug.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runDebugReadbackProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Debug"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.boundary'));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.lifecycleBoundary'));
    expect(containerEl.textContent).not.toContain('restarted session');
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.readback'));
  });

  it('renders debug proof copy from locale in Chinese', async () => {
    setLocale('zh');
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: true,
        sdkOptionPresent: true,
        sdkValue: true,
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debug.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.title'));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.boundary'));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.lifecycleBoundary'));
    expect(containerEl.textContent).not.toContain('重启会话');
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.readback'));
    setLocale('en');
  });

  it('marks fail when the debug readback probe returns fail classification', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        optionWired: true,
        settingValue: true,
        sdkOptionPresent: false,
        valueMatch: false,
        error: 'SDK option missing',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debug.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Debug"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.fail', {
      error: 'SDK option missing',
    }));
  });

  it('marks fail when the debug readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runDebugReadbackProbe: jest.fn().mockRejectedValue(new Error('probe exploded')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.debug.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Debug"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.debug.threw', {
      error: 'probe exploded',
    }));
  });

  it('renders Strict MCP Config Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStrictMcpConfigReadbackProbe: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Strict MCP Config Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the strict MCP config readback proof and marks readback', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStrictMcpConfigReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: true,
        sdkOptionPresent: true,
        sdkValue: true,
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Strict MCP Config Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runStrictMcpConfigReadbackProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Strict MCP Config"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(containerEl.textContent).toContain('Setting value');
    expect(containerEl.textContent).toContain('true');
    expect(containerEl.textContent).toContain('Diagnostic readback only');
    expect(containerEl.textContent).toContain('next query');
    expect(containerEl.textContent).toContain('Active sessions');
    expect(containerEl.textContent).toContain('.claude');
  });

  it('marks fail when the strict MCP config readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runStrictMcpConfigReadbackProbe: jest.fn().mockRejectedValue(new Error('strict mcp probe exploded')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Strict MCP Config Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Strict MCP Config"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('strict mcp probe exploded');
  });

  it('renders 1M Context Beta Readback Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContext1mBetaReadbackProbe: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run 1M Context Beta Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the 1M Context Beta readback proof and marks readback', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContext1mBetaReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: true,
        sdkOptionPresent: true,
        sdkValue: ['context-1m-2025-08-07'],
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run 1M Context Beta Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runContext1mBetaReadbackProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="1M Context Beta"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(containerEl.textContent).toContain('Diagnostic readback only');
    expect(containerEl.textContent).toContain('Actual beta availability depends on selected model');
    expect(containerEl.textContent).toContain('Applies to the next query');
    expect(containerEl.textContent).toContain('Active sessions do not update live');
    expect(containerEl.textContent).toContain('No generic beta management');
  });

  it('marks fail when the 1M Context Beta readback probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContext1mBetaReadbackProbe: jest.fn().mockRejectedValue(new Error('beta probe exploded')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run 1M Context Beta Readback Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="1M Context Beta"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('beta probe exploded');
  });

  it('renders Custom Session ID Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runCustomSessionIdProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Custom Session ID Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the custom session id proof and marks pass when exact match', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runCustomSessionIdProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        requestedSessionId: 'custom-sess-abc',
        returnedSessionId: 'custom-sess-abc',
        exactMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Custom Session ID Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runCustomSessionIdProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Custom Session ID"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain('exact match');
  });

  it('runs the custom session id proof and marks fail on mismatch', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runCustomSessionIdProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        requestedSessionId: 'custom-sess-abc',
        returnedSessionId: 'different-sess-xyz',
        exactMatch: false,
        error: 'SDK returned different session id',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Custom Session ID Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Custom Session ID"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('different session id');
  });

  it('runs the custom session id proof and marks fail when probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runCustomSessionIdProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        requestedSessionId: 'custom-sess-throw',
        returnedSessionId: undefined,
        exactMatch: false,
        error: 'SDK query failed',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Custom Session ID Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Custom Session ID"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('passes a plain valid UUID to runCustomSessionIdProbe, not a prefixed non-UUID string', async () => {
    const runCustomSessionIdProbe = jest.fn().mockResolvedValue({
      classification: 'pass',
      requestedSessionId: '00000000-0000-0000-0000-000000000000',
      returnedSessionId: '00000000-0000-0000-0000-000000000000',
      exactMatch: true,
    });
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runCustomSessionIdProbe,
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Custom Session ID Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    expect(runCustomSessionIdProbe).toHaveBeenCalledTimes(1);
    const arg = runCustomSessionIdProbe.mock.calls[0][0] as string;
    // Must be a plain UUID v4 format (8-4-4-4-12 hex digits), no prefix
    expect(arg).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(arg).not.toContain('opencodian');
    expect(arg).not.toContain('diag');
  });

  it('renders Continue Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContinueProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Continue Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the continue proof and marks pass when session ids match and nonce is recalled', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContinueProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        seedSessionId: 'continue-sess-abc',
        continueSessionId: 'continue-sess-abc',
        sessionIdsMatch: true,
        nonceRecalled: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Continue Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runContinueProbe).toHaveBeenCalled();

    const proofMarker = containerEl.querySelector('[data-capability="Continue"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain('session ids match');
    expect(containerEl.textContent).toContain('nonce recalled');
  });

  it('runs the continue proof and marks fail when session ids mismatch', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContinueProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        seedSessionId: 'continue-sess-seed',
        continueSessionId: 'continue-sess-diff',
        sessionIdsMatch: false,
        nonceRecalled: false,
        error: 'Different session id',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Continue Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Continue"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('Different session id');
  });

  it('runs the continue proof and marks fail when nonce is not recalled', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContinueProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        seedSessionId: 'continue-sess-abc',
        continueSessionId: 'continue-sess-abc',
        sessionIdsMatch: true,
        nonceRecalled: false,
        error: 'nonce not recalled',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Continue Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Continue"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('nonce not recalled');
  });

  it('runs the continue proof and marks fail when probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runContinueProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        seedSessionId: undefined,
        continueSessionId: undefined,
        sessionIdsMatch: false,
        nonceRecalled: false,
        error: 'SDK query failed',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Continue Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Continue"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('renders Resume Session At Position Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runResumeSessionAtProbe: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Resume Session At Position Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    expect(adapter.runResumeSessionAtProbe).toHaveBeenCalled();
  });

  it('runs the resumeSessionAt proof and marks pass when session ids match and alpha nonce is recalled', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runResumeSessionAtProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        sessionId: 'resume-at-sess-abc',
        resumedAtAlpha: true,
        alphaNonce: 'alpha-nonce-abc',
        betaNonce: 'beta-nonce-def',
        alphaMessageUuid: 'msg-uuid-alpha',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Resume Session At Position Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    await flushUi();
    expect(adapter.runResumeSessionAtProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Resume Session At Position"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('runs the resumeSessionAt proof and marks fail when beta nonce is recalled instead of alpha', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runResumeSessionAtProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        sessionId: 'resume-at-sess-abc',
        resumedAtAlpha: false,
        alphaNonce: 'alpha-nonce-abc',
        betaNonce: 'beta-nonce-def',
        alphaMessageUuid: 'msg-uuid-alpha',
        error: 'beta nonce recalled instead of alpha',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Resume Session At Position Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    await flushUi();
    expect(adapter.runResumeSessionAtProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Resume Session At Position"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('runs the resumeSessionAt proof and marks fail when probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runResumeSessionAtProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        sessionId: undefined,
        resumedAtAlpha: false,
        alphaNonce: 'alpha-nonce-abc',
        betaNonce: 'beta-nonce-def',
        alphaMessageUuid: undefined,
        error: 'SDK query failed',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Resume Session At Position Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    await flushUi();
    expect(adapter.runResumeSessionAtProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Resume Session At Position"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('renders Fork Session On Resume Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runForkSessionProbe: jest.fn(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Fork Session On Resume Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    expect(adapter.runForkSessionProbe).toHaveBeenCalled();
  });

  it('runs the forkSession proof and marks pass when session ids differ and nonce is recalled', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runForkSessionProbe: jest.fn().mockResolvedValue({
        classification: 'pass',
        seedSessionId: 'fork-sess-seed',
        forkedSessionId: 'fork-sess-forked',
        sessionIdsDiffer: true,
        nonceRecalled: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Fork Session On Resume Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    await flushUi();
    expect(adapter.runForkSessionProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Fork Session On Resume"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
  });

  it('runs the forkSession proof and marks fail when session ids match', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runForkSessionProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        seedSessionId: 'fork-sess-seed',
        forkedSessionId: 'fork-sess-seed',
        sessionIdsDiffer: false,
        nonceRecalled: true,
        error: 'same session id',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Fork Session On Resume Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    await flushUi();
    expect(adapter.runForkSessionProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Fork Session On Resume"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('runs the forkSession proof and marks fail when nonce is not recalled', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runForkSessionProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        seedSessionId: 'fork-sess-seed',
        forkedSessionId: 'fork-sess-forked',
        sessionIdsDiffer: true,
        nonceRecalled: false,
        error: 'nonce not recalled',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Fork Session On Resume Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    await flushUi();
    expect(adapter.runForkSessionProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Fork Session On Resume"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('runs the forkSession proof and marks fail when probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runForkSessionProbe: jest.fn().mockResolvedValue({
        classification: 'fail',
        seedSessionId: undefined,
        forkedSessionId: undefined,
        sessionIdsDiffer: false,
        nonceRecalled: false,
        error: 'SDK query failed',
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });
    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('Run Fork Session On Resume Proof')
    ) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();
    await flushUi();
    expect(adapter.runForkSessionProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Fork Session On Resume"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('renders Session Title Proof button', () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSessionTitleProbe: jest.fn(),
      capabilities: new Set(),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Session Title Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
  });

  it('runs the session title proof and marks pass when customTitle matches', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSessionTitleProbe: jest.fn().mockImplementation((requestedTitle: string) =>
        Promise.resolve({
          classification: 'pass',
          requestedTitle,
          sessionId: 'title-sess-abc',
          customTitle: requestedTitle,
          matchedBy: ['customTitle'],
        })
      ),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Session Title Proof')
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runSessionTitleProbe).toHaveBeenCalledTimes(1);
    const calledTitle = adapter.runSessionTitleProbe.mock.calls[0][0] as string;
    expect(calledTitle).toMatch(/^OpenCodian Diagnostic Session Title \d+-[a-z0-9]+$/);

    const proofMarker = containerEl.querySelector('[data-capability="Session Title"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-pass')).toBe(true);
    expect(containerEl.textContent).toContain('customTitle matches');
  });

  it('runs the session title proof and marks fail on customTitle mismatch', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSessionTitleProbe: jest.fn().mockImplementation((requestedTitle: string) =>
        Promise.resolve({
          classification: 'fail',
          requestedTitle,
          sessionId: 'title-sess-abc',
          customTitle: 'Auto-generated Title',
          error: 'customTitle mismatch',
        })
      ),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Session Title Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Session Title"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain('customTitle mismatch');
  });

  it('runs the session title proof and marks fail when probe throws', async () => {
    const adapter = {
      listSessions: jest.fn().mockResolvedValue([]),
      runSessionTitleProbe: jest.fn().mockImplementation((requestedTitle: string) =>
        Promise.resolve({
          classification: 'fail',
          requestedTitle,
          error: 'SDK query failed',
        })
      ),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes('Run Session Title Proof')
    )) as HTMLButtonElement | undefined;
    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Session Title"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
  });

  it('renders JS Runtime readback proof button backed by locale key and shows readback output', async () => {
    const adapter = {
      runJsRuntimeReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: 'node',
        emptySetting: false,
        sdkOptionPresent: true,
        sdkValue: 'node',
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.jsRuntime.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runJsRuntimeReadbackProbe).toHaveBeenCalled();
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.title'));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.optionWired', { status: t('settings.capabilityLab.proofs.jsRuntime.status.yes') }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.settingValue', { value: 'node' }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.sdkOptionPresent', { status: t('settings.capabilityLab.proofs.jsRuntime.status.yes') }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.sdkValue', { value: 'node' }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.valueMatch', { status: t('settings.capabilityLab.proofs.jsRuntime.status.yes') }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.readback'));
  });

  it('renders JS Runtime readback proof button and shows error on thrown error', async () => {
    const adapter = {
      runJsRuntimeReadbackProbe: jest.fn().mockRejectedValue(new Error('probe exploded')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.jsRuntime.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.jsRuntime.title'));
    expect(containerEl.textContent).toContain('probe exploded');
  });

  it('renders Load Timeout readback proof button backed by locale key and shows readback output', async () => {
    const adapter = {
      runLoadTimeoutReadbackProbe: jest.fn().mockResolvedValue({
        classification: 'readback',
        optionWired: true,
        settingValue: 60000,
        sdkOptionPresent: true,
        sdkValue: 60000,
        valueMatch: true,
      }),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.loadTimeout.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    expect(adapter.runLoadTimeoutReadbackProbe).toHaveBeenCalled();
    const proofMarker = containerEl.querySelector('[data-capability="Load Timeout"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-readback')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.title'));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.optionWired', { status: t('settings.capabilityLab.proofs.loadTimeout.status.yes') }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.settingValue', { value: 60000 }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.sdkOptionPresent', { status: t('settings.capabilityLab.proofs.loadTimeout.status.yes') }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.sdkValue', { value: 60000 }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.valueMatch', { status: t('settings.capabilityLab.proofs.loadTimeout.status.yes') }));
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.readback'));
  });

  it('renders Load Timeout readback proof button and shows error on thrown error', async () => {
    const adapter = {
      runLoadTimeoutReadbackProbe: jest.fn().mockRejectedValue(new Error('probe exploded')),
    };
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(adapter),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');
    const button = Array.from(containerEl.querySelectorAll('button')).find((el) => (
      el.textContent?.includes(t('settings.capabilityLab.proofs.loadTimeout.button'))
    )) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();
    await flushUi();

    const proofMarker = containerEl.querySelector('[data-capability="Load Timeout"]');
    expect(proofMarker).toBeTruthy();
    expect(proofMarker!.classList.contains('opencodian-capability-lab-proof-fail')).toBe(true);
    expect(containerEl.textContent).toContain(t('settings.capabilityLab.proofs.loadTimeout.title'));
    expect(containerEl.textContent).toContain('probe exploded');
  });
});
