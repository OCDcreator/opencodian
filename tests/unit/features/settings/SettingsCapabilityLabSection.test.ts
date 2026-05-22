import { SettingsCapabilityLabSection } from '../../../../src/features/settings/SettingsCapabilityLabSection';
import { setLocale, t } from '../../../../src/i18n';

/**
 * Minimal mock plugin that satisfies CapabilityLabDeps.
 * agentServiceRegistry is the only accessed property via getClaudeCodeAdapter().
 */
function createMockPlugin(adapter: unknown = null): never {
  return {
    agentServiceRegistry: adapter
      ? { get: jest.fn().mockReturnValue(adapter) }
      : undefined,
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

  it('renders all six diagnostic panels', () => {
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
    expect(rows.length).toBeGreaterThanOrEqual(5); // Hooks, Plugins, Skills, Subagents, Session Store, Import/Delete/Restore
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

  it('buildMatrixRows returns all 13 expected capabilities', () => {
    // We test this indirectly by counting matrix table rows
    const containerEl = document.createElement('div');
    const section = new SettingsCapabilityLabSection({
      plugin: createMockPlugin(),
      createSectionHeading: createHeadingStub(),
    });

    section.attachTabbed(containerEl, 'capability-lab');

    const table = containerEl.querySelector('.opencodian-capability-lab-matrix');
    const rows = table!.querySelectorAll('tbody tr');
    expect(rows.length).toBe(13);
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
    expect(containerEl.textContent).toContain('SessionStart');
    expect(containerEl.textContent).toContain('diag-hook-1');
  });

  it('renders session store controls and imports the selected session into the diagnostic store', async () => {
    const listSessions = jest.fn().mockImplementation((options?: { sessionStore?: unknown }) => {
      if (options?.sessionStore) {
        return Promise.resolve([{
          sessionId: 'store-session-1',
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
    const adapter = {
      listSessions,
      getSessionMessages: jest.fn().mockResolvedValue([]),
      importSessionToStore: jest.fn().mockResolvedValue(undefined),
      runDiagnosticPrompt: jest.fn().mockResolvedValue({
        sessionId: 'store-session-1',
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
  });
});
