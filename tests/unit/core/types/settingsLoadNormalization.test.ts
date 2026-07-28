import { prepareLoadedSettingsBootstrapState } from '../../../../src/core/types/settingsLoadNormalization';

describe('prepareLoadedSettingsBootstrapState backend normalization', () => {
  it('normalizes the optional Codex executable path for migration-safe persistence', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          backendSettings: {
            codex: { executablePath: '  ~/bin/codex  ' },
          },
        },
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(state.settings.backendSettings.codex.executablePath).toBe('~/bin/codex');
  });

  it('keeps opencode enabled for a fresh install with no persisted settings', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: null,
        filePath: '.opencodian/settings.core.json',
        source: 'missing',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(state.settings.enabledBackends).toEqual(['opencode']);
    expect(state.settings.activeBackend).toBe('opencode');
  });

  it('preserves a valid Capability Lab backend selection from the UI settings envelope', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: null,
        filePath: '.opencodian/settings.core.json',
        source: 'missing',
        shouldPersist: false,
      },
      ui: {
        data: { capabilityLabSelectedBackend: ' opencode ' },
        filePath: '.opencodian/settings.ui.json',
        source: 'primary',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(state.settings.capabilityLabSelectedBackend).toBe('opencode');
  });

  it('preserves future Capability Lab backend selections for descriptor resolution', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: null,
        filePath: '.opencodian/settings.core.json',
        source: 'missing',
        shouldPersist: false,
      },
      ui: {
        data: { capabilityLabSelectedBackend: ' copilot ' },
        filePath: '.opencodian/settings.ui.json',
        source: 'primary',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(state.settings.capabilityLabSelectedBackend).toBe('copilot');
  });

  it('preserves implemented backends and repairs the active backend when needed', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          enabledBackends: ['codex', 'opencode'],
          activeBackend: 'codex',
        },
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    // codex is now an implemented backend — it should be preserved
    expect(state.settings.enabledBackends).toEqual(['codex', 'opencode']);
    expect(state.settings.activeBackend).toBe('codex');
  });

  it('normalizes Claude Code backend settings and preserves enabled Claude once implemented', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          enabledBackends: ['claude-code', 'opencode'],
          activeBackend: 'claude-code',
          backendSettings: {
            claudeCode: {
              executablePath: ' ~/bin/claude ',
              settingSources: ['project', 'bogus', 'project', 'user'],
              permissionMode: 'bypassPermissions',
              thinking: { type: 'fixed', budgetTokens: 1234.8 },
              effort: 'max',
              additionalDirectories: [' /tmp/context ', '', '/tmp/context'],
              model: ' claude-opus-4-6 ',
              fallbackModel: ' claude-sonnet-4-5 ',
            },
          },
        },
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(state.settings.enabledBackends).toEqual(['claude-code', 'opencode']);
    expect(state.settings.activeBackend).toBe('claude-code');
    expect(state.settings.backendSettings.claudeCode).toEqual({
      executablePath: '~/bin/claude',
      settingSources: ['project', 'user'],
      permissionMode: 'bypassPermissions',
      thinking: { type: 'fixed', budgetTokens: 1234 },
      effort: 'max',
      additionalDirectories: ['/tmp/context'],
      model: 'claude-opus-4-6',
      pricingProviderId: '',
      pricingEndpoint: '',
      outputStyle: '',
      fallbackModel: 'claude-sonnet-4-5',
      providers: {
        presets: [{
          id: 'official',
          name: 'Anthropic Official',
          baseUrl: '',
          authToken: '',
          model: '',
          fallbackModel: '',
          haikuModel: '',
          extraEnv: {},
        }],
        activePresetId: 'official',
        lastAppliedManagedEnvKeys: [],
        modelMigrationDone: false,
      },
      allowedTools: [],
      disallowedTools: [],
      restrictedBuiltinTools: [],
      maxTurns: null,
      maxBudgetUsd: null,
      taskBudget: null,
      env: {},
      enableFileCheckpointing: false,
      includeHookEvents: false,
      forwardSubagentText: false,
      agentProgressSummaries: false,
      askUserQuestionPreviewFormat: '',
      promptSuggestions: false,
      debugChannels: {
        runtime: true,
        sessions: true,
        stream: true,
        permissions: true,
        mcp: true,
        experimental: false,
      },
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
      planModeInstructions: '',
      toolAliases: {},
      debug: false,
      debugFile: '',
      enableContext1mBeta: false,
      jsRuntime: '',
      loadTimeoutMs: null,
      strictMcpConfig: false,
      systemPrompt: '',
      autoTitle: true,
    });
  });

  it('defaults Claude settingSources to project but preserves an explicit empty list', () => {
    const missing = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          backendSettings: {
            claudeCode: {
              settingSources: 'invalid',
            },
          },
        },
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });
    const explicitNone = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          backendSettings: {
            claudeCode: {
              settingSources: [],
            },
          },
        },
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(missing.settings.backendSettings.claudeCode.settingSources).toEqual(['project']);
    expect(explicitNone.settings.backendSettings.claudeCode.settingSources).toEqual([]);
  });

  it('preserves an explicit Claude autoTitle false override', () => {
    const state = prepareLoadedSettingsBootstrapState({
      core: {
        data: {
          backendSettings: {
            claudeCode: {
              autoTitle: false,
            },
          },
        },
        filePath: '.opencodian/settings.core.json',
        source: 'primary',
        shouldPersist: false,
      },
      ui: {
        data: null,
        filePath: '.opencodian/settings.ui.json',
        source: 'missing',
        shouldPersist: false,
      },
      writable: true,
      shouldPersist: false,
    });

    expect(state.settings.backendSettings.claudeCode.autoTitle).toBe(false);
  });
});
