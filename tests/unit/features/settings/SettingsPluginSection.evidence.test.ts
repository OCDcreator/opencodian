import { setLocale, t } from '../../../../src/i18n';
import {
  buttonRecords,
  createConfigSnapshot,
  createEvidenceSnapshot,
  createSection,
  findButton,
  flushAsync,
  setupSettingMocks,
} from './SettingsPluginSection.evidence.testSupport';

describe('SettingsPluginSection evidence integration', () => {
  beforeEach(() => {
    setLocale('en');
    document.body.innerHTML = '';
    buttonRecords.length = 0;
    setupSettingMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('subscribes to plugin evidence on attach and refreshes both local and SDK snapshots', async () => {
    const { subscribeToOpenCodeEvents, refreshPluginConfigEvidence } = createSection();
    await flushAsync();

    expect(subscribeToOpenCodeEvents).toHaveBeenCalledTimes(1);
    expect(refreshPluginConfigEvidence).toHaveBeenCalledTimes(1);
  });

  it('renders four evidence sections with their titles', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const localSummaryEl = containerEl.querySelector('[data-evidence-kind="local-summary"]');
    const effectiveEl = containerEl.querySelector('[data-evidence-kind="effective-config"]');
    const runtimeEl = containerEl.querySelector('[data-evidence-kind="runtime"]');
    const transportEl = containerEl.querySelector('[data-evidence-kind="transport"]');

    expect(localSummaryEl).not.toBeNull();
    expect(effectiveEl).not.toBeNull();
    expect(runtimeEl).not.toBeNull();
    expect(transportEl).not.toBeNull();

    expect(localSummaryEl?.querySelector('.opencodian-plugin-evidence-section-title')?.textContent)
      .toBe(t('settings.plugins.overview.localSummaryTitle'));
    expect(effectiveEl?.querySelector('.opencodian-plugin-evidence-section-title')?.textContent)
      .toBe(t('settings.plugins.evidence.effectiveConfigTitle'));
    expect(runtimeEl?.querySelector('.opencodian-plugin-evidence-section-title')?.textContent)
      .toBe(t('settings.plugins.evidence.runtimeTitle'));
    expect(transportEl?.querySelector('.opencodian-plugin-evidence-section-title')?.textContent)
      .toBe(t('settings.plugins.evidence.transportTitle'));
  });

  it('renders effective config section with description, fetch rows and current/stale subsections', async () => {
    const { containerEl } = createSection({
      evidence: createEvidenceSnapshot({
        effective: {
          plugin: ['current-plugin'],
          fetchedAt: 1_700_000_000_000,
          generation: 'gen-2',
          stale: false,
        },
        previousEffective: {
          plugin: ['stale-plugin'],
          fetchedAt: 1_700_000_000_000,
          generation: 'gen-1',
          stale: true,
        },
        fetch: {
          status: 'ready',
          attemptedAt: 1_700_000_000_500,
          generation: 'gen-2',
          error: null,
        },
      }),
    });
    await flushAsync();

    const effectiveEl = containerEl.querySelector('[data-evidence-kind="effective-config"]') as HTMLElement;
    expect(effectiveEl.textContent).toContain(t('settings.plugins.evidence.effectiveConfigDesc'));
    expect(effectiveEl.textContent).toContain(t('settings.plugins.evidence.fetchStatus'));
    expect(effectiveEl.textContent).toContain(t('settings.plugins.evidence.fetchAttemptedAt'));
    expect(effectiveEl.textContent).toContain(t('settings.plugins.evidence.fetchGeneration'));

    const currentEl = effectiveEl.querySelector('[data-effective-state="current"]');
    expect(currentEl?.textContent).toContain('current-plugin');
    expect(currentEl?.textContent).toContain(t('settings.plugins.evidence.currentEffectiveTitle'));

    const staleEl = effectiveEl.querySelector('[data-effective-state="stale"]');
    expect(staleEl?.textContent).toContain('stale-plugin');
    expect(staleEl?.textContent).toContain(t('settings.plugins.evidence.staleEffectiveTitle'));
  });

  it('renders runtime IDs in current and stale subsections', async () => {
    const { containerEl } = createSection();
    await flushAsync();

    const runtimeEl = containerEl.querySelector('[data-evidence-kind="runtime"]') as HTMLElement;
    expect(runtimeEl.textContent).toContain(t('settings.plugins.evidence.runtimeDesc'));

    const currentEl = runtimeEl.querySelector('[data-runtime-state="current"]');
    expect(currentEl?.textContent).toContain('runtime-plugin-a');
    expect(currentEl?.textContent).toContain(t('settings.plugins.evidence.currentRuntimeTitle'));

    const staleEl = runtimeEl.querySelector('[data-runtime-state="stale"]');
    expect(staleEl?.textContent).toContain('runtime-plugin-b');
    expect(staleEl?.querySelector('[data-runtime-current="false"]')?.textContent).toContain('runtime-plugin-b');
  });

  it('updates evidence sections when listener callback fires', async () => {
    const { containerEl, evidenceListeners } = createSection();
    await flushAsync();

    const runtimeEl = containerEl.querySelector('[data-evidence-kind="runtime"]') as HTMLElement;
    expect(runtimeEl.textContent).toContain('runtime-plugin-a');

    evidenceListeners[0](createEvidenceSnapshot({
      runtime: [
        {
          runtimeId: 'runtime-plugin-c',
          firstObservedAt: 1_700_000_000_300,
          lastObservedAt: 1_700_000_000_300,
          generation: 'gen-2',
          stale: false,
          sources: ['event'],
        },
      ],
      staleRuntime: [],
    }));

    expect(runtimeEl.textContent).toContain('runtime-plugin-c');
    expect(runtimeEl.textContent).not.toContain('runtime-plugin-a');
  });

  it('does not update evidence sections after dispose', async () => {
    const { containerEl, section, evidenceListeners, unsubscribe } = createSection();
    await flushAsync();

    section.dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);

    evidenceListeners[0](createEvidenceSnapshot({
      runtime: [
        {
          runtimeId: 'after-dispose',
          firstObservedAt: 1,
          lastObservedAt: 1,
          generation: 'gen-9',
          stale: false,
          sources: ['event'],
        },
      ],
      staleRuntime: [],
    }));

    const runtimeEl = containerEl.querySelector('[data-evidence-kind="runtime"]') as HTMLElement;
    expect(runtimeEl.textContent).not.toContain('after-dispose');
  });

  it('shows stale effective specs and fetch error separately', async () => {
    const { containerEl } = createSection({
      evidence: createEvidenceSnapshot({
        effective: null,
        previousEffective: {
          plugin: ['old-plugin'],
          fetchedAt: 1_700_000_000_000,
          generation: 'gen-1',
          stale: true,
        },
        fetch: {
          status: 'error',
          attemptedAt: 1_700_000_000_500,
          generation: 'gen-2',
          error: 'network down',
        },
      }),
    });
    await flushAsync();

    const effectiveEl = containerEl.querySelector('[data-evidence-kind="effective-config"]') as HTMLElement;
    expect(effectiveEl.querySelector('[data-effective-state="stale"]')?.textContent).toContain('old-plugin');
    expect(effectiveEl.textContent).toContain('network down');
    expect(effectiveEl.textContent).not.toContain(t('settings.plugins.evidence.currentEffectiveTitle'));
  });

  it('does not match runtime IDs to declarations as loaded evidence', async () => {
    const { containerEl, evidenceListeners } = createSection({
      inspectSnapshot: {
        ...createConfigSnapshot('local'),
        projectConfigSpecs: ['demo-plugin'],
        projectConfigPlugins: [
          {
            kind: 'npm',
            scope: 'project',
            source: 'config',
            specifier: 'demo-plugin',
            displayName: 'demo-plugin',
            disabled: false,
          },
        ],
      },
    });
    await flushAsync();

    evidenceListeners[0](createEvidenceSnapshot({
      runtime: [
        {
          runtimeId: 'demo-plugin',
          firstObservedAt: 1_700_000_000_100,
          lastObservedAt: 1_700_000_000_200,
          generation: 'gen-1',
          stale: false,
          sources: ['event'],
        },
      ],
      staleRuntime: [],
    }));

    const runtimeEl = containerEl.querySelector('[data-evidence-kind="runtime"]') as HTMLElement;
    expect(runtimeEl.textContent).toContain('demo-plugin');
    expect(runtimeEl.textContent).toContain(t('settings.plugins.evidence.runtimeTitle'));

    const sourceGroup = containerEl.querySelector('[data-source-path="/vault/.opencode/opencode.json"]');
    expect(sourceGroup?.textContent).toContain('demo-plugin');
  });

  it('refresh button re-fetches both local inspect and SDK evidence', async () => {
    const { refreshPluginConfigEvidence } = createSection();
    await flushAsync();

    const refreshButton = findButton(t('settings.plugins.actions.refresh'));
    await refreshButton?.onClick?.();
    await flushAsync();

    expect(refreshButton?.onClick).toBeDefined();
    expect(refreshPluginConfigEvidence).toHaveBeenCalledTimes(2);
  });
});
