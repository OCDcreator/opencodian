import { SettingsPluginEvidencePresenter } from '../../../../src/features/settings/SettingsPluginEvidencePresenter';
import { setLocale, t } from '../../../../src/i18n';
import { createConfigSnapshot, createEvidenceSnapshot } from './SettingsPluginSection.evidence.testSupport';

describe('SettingsPluginEvidencePresenter', () => {
  beforeEach(() => {
    setLocale('en');
  });

  function createPresenter() {
    return new SettingsPluginEvidencePresenter({
      applyInlineCodeText: (targetEl, text) => {
        if (targetEl) targetEl.textContent = text;
      },
    });
  }

  it('renders local summary, remote notice, and SDK sections', () => {
    const presenter = createPresenter();
    const containerEl = document.createElement('div');

    presenter.renderOverview(containerEl, createConfigSnapshot('remote'), createEvidenceSnapshot());

    expect(containerEl.querySelector('[data-evidence-kind="local-summary"]')).not.toBeNull();
    expect(containerEl.querySelector('[data-remote-honesty="true"]')).not.toBeNull();
    expect(containerEl.querySelector('[data-evidence-kind="effective-config"]')).not.toBeNull();
    expect(containerEl.querySelector('[data-evidence-kind="runtime"]')).not.toBeNull();
    expect(containerEl.querySelector('[data-evidence-kind="transport"]')).not.toBeNull();
  });

  it('does not render remote notice in local mode', () => {
    const presenter = createPresenter();
    const containerEl = document.createElement('div');

    presenter.renderOverview(containerEl, createConfigSnapshot('local'), createEvidenceSnapshot());

    expect(containerEl.querySelector('[data-remote-honesty="true"]')).toBeNull();
  });

  it('updates SDK sections without touching local summary', () => {
    const presenter = createPresenter();
    const containerEl = document.createElement('div');

    presenter.renderOverview(containerEl, createConfigSnapshot('local'), createEvidenceSnapshot());

    const localSummaryEl = containerEl.querySelector('[data-evidence-kind="local-summary"]') as HTMLElement;
    const originalLocalText = localSummaryEl.textContent;

    presenter.updateSdkEvidence(containerEl, createEvidenceSnapshot({
      effective: {
        plugin: ['updated-plugin'],
        fetchedAt: 1_700_000_000_000,
        generation: 'gen-9',
        stale: false,
      },
      previousEffective: null,
      runtime: [],
      staleRuntime: [],
      fetch: {
        status: 'ready',
        attemptedAt: 1_700_000_000_000,
        generation: 'gen-9',
        error: null,
      },
    }));

    expect(localSummaryEl.textContent).toBe(originalLocalText);

    const effectiveEl = containerEl.querySelector('[data-evidence-kind="effective-config"]') as HTMLElement;
    expect(effectiveEl.textContent).toContain('updated-plugin');
  });

  it('preserves section titles while updating evidence body', () => {
    const presenter = createPresenter();
    const containerEl = document.createElement('div');

    presenter.renderOverview(containerEl, createConfigSnapshot('local'), createEvidenceSnapshot());

    const effectiveEl = containerEl.querySelector('[data-evidence-kind="effective-config"]') as HTMLElement;
    const title = effectiveEl.querySelector('.opencodian-plugin-evidence-section-title')?.textContent;

    presenter.updateSdkEvidence(containerEl, createEvidenceSnapshot({
      effective: null,
      previousEffective: null,
      runtime: [],
      staleRuntime: [],
      fetch: {
        status: 'idle',
        attemptedAt: null,
        generation: null,
        error: null,
      },
    }));

    expect(effectiveEl.querySelector('.opencodian-plugin-evidence-section-title')?.textContent).toBe(title);
    expect(effectiveEl.textContent).toContain('Fetch status:idle');
  });

  it('describes fetch status for idle-null, refreshing, ready and error', () => {
    const presenter = createPresenter();
    const containerEl = document.createElement('div');
    const base = createEvidenceSnapshot({ effective: null, previousEffective: null, runtime: [], staleRuntime: [] });

    const idleNull = { ...base, fetch: { status: 'idle' as const, attemptedAt: null, generation: null, error: null } };
    presenter.renderOverview(containerEl, createConfigSnapshot('local'), idleNull);
    expect(containerEl.textContent).toContain(t('settings.plugins.evidence.fetchIdle'));

    containerEl.innerHTML = '';
    const refreshing = { ...base, fetch: { status: 'idle' as const, attemptedAt: 1_700_000_000_000, generation: 'gen-1', error: null } };
    presenter.renderOverview(containerEl, createConfigSnapshot('local'), refreshing);
    expect(containerEl.textContent).toContain(t('settings.plugins.evidence.fetchRefreshing'));

    containerEl.innerHTML = '';
    const ready = { ...base, fetch: { status: 'ready' as const, attemptedAt: 1_700_000_000_000, generation: 'gen-1', error: null } };
    presenter.renderOverview(containerEl, createConfigSnapshot('local'), ready);
    expect(containerEl.textContent).toContain(t('settings.plugins.evidence.fetchReady'));

    containerEl.innerHTML = '';
    const error = { ...base, fetch: { status: 'error' as const, attemptedAt: 1_700_000_000_000, generation: 'gen-1', error: 'boom' } };
    presenter.renderOverview(containerEl, createConfigSnapshot('local'), error);
    expect(containerEl.textContent).toContain(t('settings.plugins.evidence.fetchError'));
    expect(containerEl.textContent).toContain('boom');
  });

  it('treats idle + attemptedAt: 0 as refreshing and shows attempted-at row', () => {
    const presenter = createPresenter();
    const containerEl = document.createElement('div');
    const snapshot = createEvidenceSnapshot({
      effective: null,
      previousEffective: null,
      runtime: [],
      staleRuntime: [],
      fetch: {
        status: 'idle',
        attemptedAt: 0,
        generation: 'gen-1',
        error: null,
      },
    });

    presenter.renderOverview(containerEl, createConfigSnapshot('local'), snapshot);

    expect(containerEl.textContent).toContain(t('settings.plugins.evidence.fetchRefreshing'));
    expect(containerEl.textContent).toContain(t('settings.plugins.evidence.fetchAttemptedAt'));
  });
});
