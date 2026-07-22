import type { PluginEnvironmentSnapshot } from '../../core/config/PluginManagementService';
import type { PluginEvidenceSnapshot } from '../../core/opencode/OpenCodeEventSubscriptionCoordinator';
import { t } from '../../i18n';

export interface SettingsPluginEvidencePresenterOptions {
  applyInlineCodeText: (targetEl: HTMLElement | null, text: string) => void;
}

export class SettingsPluginEvidencePresenter {
  private readonly applyInlineCodeText: (targetEl: HTMLElement | null, text: string) => void;

  constructor(options: SettingsPluginEvidencePresenterOptions) {
    this.applyInlineCodeText = options.applyInlineCodeText;
  }

  renderOverview(
    containerEl: HTMLElement,
    snapshot: PluginEnvironmentSnapshot,
    evidence: PluginEvidenceSnapshot | null,
  ): void {
    containerEl.empty();
    this.renderLocalSummarySection(containerEl, snapshot);
    this.renderSdkEvidenceSections(containerEl, evidence);
  }

  updateSdkEvidence(containerEl: HTMLElement, evidence: PluginEvidenceSnapshot): void {
    const effectiveEl = containerEl.querySelector('[data-evidence-kind="effective-config"]') as HTMLElement | null;
    const runtimeEl = containerEl.querySelector('[data-evidence-kind="runtime"]') as HTMLElement | null;
    const transportEl = containerEl.querySelector('[data-evidence-kind="transport"]') as HTMLElement | null;

    if (effectiveEl) {
      this.renderEffectiveConfigSection(effectiveEl, evidence);
    }
    if (runtimeEl) {
      this.renderRuntimeSection(runtimeEl, evidence);
    }
    if (transportEl) {
      this.renderTransportSection(transportEl, evidence);
    }
  }

  private renderLocalSummarySection(containerEl: HTMLElement, snapshot: PluginEnvironmentSnapshot): void {
    const totalProjectPlugins =
      snapshot.projectConfigPlugins.length + snapshot.disabledProjectConfigPlugins.length;
    const totalDirPlugins =
      snapshot.projectDirectoryPlugins.length + snapshot.disabledProjectDirectoryPlugins.length;

    const sectionEl = containerEl.createDiv({
      cls: 'opencodian-plugin-evidence-section',
      attr: { 'data-evidence-kind': 'local-summary' },
    });
    sectionEl.createEl('h5', {
      cls: 'opencodian-plugin-evidence-section-title',
      text: t('settings.plugins.overview.localSummaryTitle'),
    });

    const rows = [
      {
        label: t('settings.plugins.overview.serviceMode'),
        value:
          snapshot.serviceMode === 'local'
            ? t('settings.plugins.overview.serviceModeLocal')
            : t('settings.plugins.overview.serviceModeRemote'),
      },
      {
        label: t('settings.plugins.overview.isolationMode'),
        value:
          snapshot.isolationMode === 'pure'
            ? t('settings.plugins.isolation.pure')
            : t('settings.plugins.isolation.default'),
      },
      {
        label: t('settings.plugins.overview.vaultConfigDir'),
        value: snapshot.vaultConfigDir,
      },
      {
        label: t('settings.plugins.overview.globalInfluence'),
        value: snapshot.globalInfluenceDetected
          ? t('settings.plugins.overview.globalInfluenceYes')
          : t('settings.plugins.overview.globalInfluenceNo'),
      },
      {
        label: t('settings.plugins.overview.projectConfigCount'),
        value: String(totalProjectPlugins),
      },
      {
        label: t('settings.plugins.overview.projectDirectoryCount'),
        value: String(totalDirPlugins),
      },
    ];

    this.renderKeyValueRows(sectionEl, rows);

    if (snapshot.serviceMode === 'remote') {
      const remoteNoticeEl = containerEl.createDiv({
        cls: 'opencodian-plugin-remote-notice',
        attr: { 'data-remote-honesty': 'true' },
      });
      remoteNoticeEl.createSpan({
        cls: 'opencodian-plugin-remote-notice-label',
        text: t('settings.plugins.remoteNotice.label'),
      });
      remoteNoticeEl.createSpan({
        text: t('settings.plugins.remoteNotice.desc'),
      });
    }
  }

  private renderSdkEvidenceSections(containerEl: HTMLElement, evidence: PluginEvidenceSnapshot | null): void {
    const effectiveEl = containerEl.createDiv();
    this.renderEffectiveConfigSection(effectiveEl, evidence);

    const runtimeEl = containerEl.createDiv();
    this.renderRuntimeSection(runtimeEl, evidence);

    const transportEl = containerEl.createDiv();
    this.renderTransportSection(transportEl, evidence);
  }

  private renderEffectiveConfigSection(containerEl: HTMLElement, evidence: PluginEvidenceSnapshot | null): void {
    containerEl.empty();
    containerEl.classList.add('opencodian-plugin-evidence-section');
    containerEl.setAttribute('data-evidence-kind', 'effective-config');
    containerEl.createEl('h5', {
      cls: 'opencodian-plugin-evidence-section-title',
      text: t('settings.plugins.evidence.effectiveConfigTitle'),
    });
    containerEl.createEl('p', {
      cls: 'opencodian-plugin-evidence-section-desc',
      text: t('settings.plugins.evidence.effectiveConfigDesc'),
    });

    if (!evidence) {
      containerEl.createEl('p', {
        cls: 'opencodian-plugin-evidence-empty',
        text: t('settings.plugins.evidence.notYetFetched'),
      });
      return;
    }

    const rows = [
      {
        label: t('settings.plugins.evidence.connectionGeneration'),
        value: evidence.connectionGeneration ?? t('settings.plugins.evidence.unknown'),
      },
      {
        label: t('settings.plugins.evidence.fetchStatus'),
        value: this.describeFetchStatus(evidence.fetch),
      },
    ];

    if (evidence.fetch.attemptedAt !== null) {
      rows.push({
        label: t('settings.plugins.evidence.fetchAttemptedAt'),
        value: this.formatTimestamp(evidence.fetch.attemptedAt),
      });
    }
    if (evidence.fetch.generation) {
      rows.push({
        label: t('settings.plugins.evidence.fetchGeneration'),
        value: evidence.fetch.generation,
      });
    }
    if (evidence.fetch.error) {
      rows.push({
        label: t('settings.plugins.evidence.fetchError'),
        value: evidence.fetch.error,
      });
    }

    this.renderKeyValueRows(containerEl, rows);

    if (evidence.effective) {
      const currentEl = containerEl.createDiv({
        cls: 'opencodian-plugin-evidence-subsection',
        attr: { 'data-effective-state': 'current' },
      });
      currentEl.createEl('h6', {
        cls: 'opencodian-plugin-evidence-subsection-title',
        text: t('settings.plugins.evidence.currentEffectiveTitle'),
      });
      this.renderSpecList(currentEl, evidence.effective.plugin, {
        generation: evidence.effective.generation,
        fetchedAt: evidence.effective.fetchedAt,
      });
    }

    if (evidence.previousEffective) {
      const staleEl = containerEl.createDiv({
        cls: 'opencodian-plugin-evidence-subsection',
        attr: { 'data-effective-state': 'stale' },
      });
      staleEl.createEl('h6', {
        cls: 'opencodian-plugin-evidence-subsection-title',
        text: t('settings.plugins.evidence.staleEffectiveTitle'),
      });
      this.renderSpecList(staleEl, evidence.previousEffective.plugin, {
        generation: evidence.previousEffective.generation,
        fetchedAt: evidence.previousEffective.fetchedAt,
      });
    }

    if (!evidence.effective && !evidence.previousEffective) {
      containerEl.createEl('p', {
        cls: 'opencodian-plugin-evidence-empty',
        text: t('settings.plugins.evidence.noEffectiveSpecs'),
      });
    }
  }

  private renderRuntimeSection(containerEl: HTMLElement, evidence: PluginEvidenceSnapshot | null): void {
    containerEl.empty();
    containerEl.classList.add('opencodian-plugin-evidence-section');
    containerEl.setAttribute('data-evidence-kind', 'runtime');
    containerEl.createEl('h5', {
      cls: 'opencodian-plugin-evidence-section-title',
      text: t('settings.plugins.evidence.runtimeTitle'),
    });
    containerEl.createEl('p', {
      cls: 'opencodian-plugin-evidence-section-desc',
      text: t('settings.plugins.evidence.runtimeDesc'),
    });

    if (!evidence || (evidence.runtime.length === 0 && evidence.staleRuntime.length === 0)) {
      containerEl.createEl('p', {
        cls: 'opencodian-plugin-evidence-empty',
        text: t('settings.plugins.evidence.noRuntimeIds'),
      });
      return;
    }

    if (evidence.runtime.length > 0) {
      const currentEl = containerEl.createDiv({
        cls: 'opencodian-plugin-evidence-subsection',
        attr: { 'data-runtime-state': 'current' },
      });
      currentEl.createEl('h6', {
        cls: 'opencodian-plugin-evidence-subsection-title',
        text: t('settings.plugins.evidence.currentRuntimeTitle'),
      });
      this.renderRuntimeIdList(currentEl, evidence.runtime);
    }

    if (evidence.staleRuntime.length > 0) {
      const staleEl = containerEl.createDiv({
        cls: 'opencodian-plugin-evidence-subsection',
        attr: { 'data-runtime-state': 'stale' },
      });
      staleEl.createEl('h6', {
        cls: 'opencodian-plugin-evidence-subsection-title',
        text: t('settings.plugins.evidence.staleRuntimeTitle'),
      });
      this.renderRuntimeIdList(staleEl, evidence.staleRuntime);
    }
  }

  private renderTransportSection(containerEl: HTMLElement, evidence: PluginEvidenceSnapshot | null): void {
    containerEl.empty();
    containerEl.classList.add('opencodian-plugin-evidence-section');
    containerEl.setAttribute('data-evidence-kind', 'transport');
    containerEl.createEl('h5', {
      cls: 'opencodian-plugin-evidence-section-title',
      text: t('settings.plugins.evidence.transportTitle'),
    });
    containerEl.createEl('p', {
      cls: 'opencodian-plugin-evidence-section-desc',
      text: t('settings.plugins.evidence.transportDesc'),
    });

    if (!evidence) {
      containerEl.createEl('p', {
        cls: 'opencodian-plugin-evidence-empty',
        text: t('settings.plugins.evidence.notYetFetched'),
      });
      return;
    }

    const rows = [
      {
        label: t('settings.plugins.evidence.transportWanted'),
        value: String(evidence.transport.wanted),
      },
      {
        label: t('settings.plugins.evidence.transportActiveSources'),
        value: evidence.transport.activeSources.join(', ') || t('settings.plugins.evidence.none'),
      },
      {
        label: t('settings.plugins.evidence.transportCaptureGeneration'),
        value: evidence.transport.captureGeneration ?? t('settings.plugins.evidence.none'),
      },
      {
        label: t('settings.plugins.evidence.transportCaptureStartedAt'),
        value: evidence.transport.captureStartedAt
          ? this.formatTimestamp(evidence.transport.captureStartedAt)
          : t('settings.plugins.evidence.none'),
      },
    ];

    this.renderKeyValueRows(containerEl, rows);
  }

  private renderKeyValueRows(
    containerEl: HTMLElement,
    rows: Array<{ label: string; value: string }>,
  ): void {
    const hostEl = containerEl.createDiv({ cls: 'opencodian-plugin-summary-list-host' });
    const listEl = hostEl.createDiv({ cls: 'opencodian-plugin-summary-list' });
    for (const row of rows) {
      const rowEl = listEl.createDiv({ cls: 'opencodian-plugin-summary-row' });
      const labelEl = rowEl.createSpan({ cls: 'opencodian-plugin-summary-label' });
      this.applyInlineCodeText(labelEl, `${row.label}:`);
      const valueEl = rowEl.createSpan({ cls: 'opencodian-plugin-summary-value' });
      this.applyInlineCodeText(valueEl, row.value);
    }
  }

  private renderSpecList(
    containerEl: HTMLElement,
    specs: Array<string | [string, Record<string, unknown>]>,
    meta: { generation: string; fetchedAt: number },
  ): void {
    const listEl = containerEl.createDiv({ cls: 'opencodian-plugin-evidence-list' });
    for (const spec of specs) {
      const itemEl = listEl.createDiv({ cls: 'opencodian-plugin-evidence-item' });
      const codeEl = itemEl.createEl('code', { cls: 'opencodian-plugin-evidence-code' });
      codeEl.textContent = typeof spec === 'string' ? spec : JSON.stringify(spec);
    }
    const metaEl = containerEl.createDiv({ cls: 'opencodian-plugin-evidence-meta' });
    metaEl.textContent = `${t('settings.plugins.evidence.generation')}: ${meta.generation} · ${t('settings.plugins.evidence.fetchedAt')}: ${this.formatTimestamp(meta.fetchedAt)}`;
  }

  private renderRuntimeIdList(
    containerEl: HTMLElement,
    runtime: Array<{
      runtimeId: string;
      generation: string;
      firstObservedAt: number;
      lastObservedAt: number;
      sources: string[];
      stale: boolean;
    }>,
  ): void {
    const listEl = containerEl.createDiv({ cls: 'opencodian-plugin-evidence-list' });
    for (const entry of runtime) {
      const itemEl = listEl.createDiv({
        cls: 'opencodian-plugin-evidence-item',
        attr: { 'data-runtime-current': entry.stale ? 'false' : 'true' },
      });
      const codeEl = itemEl.createEl('code', { cls: 'opencodian-plugin-evidence-code' });
      codeEl.textContent = entry.runtimeId;
      const metaEl = itemEl.createDiv({ cls: 'opencodian-plugin-evidence-meta' });
      metaEl.textContent = [
        `${t('settings.plugins.evidence.generation')}: ${entry.generation}`,
        `${t('settings.plugins.evidence.sources')}: ${entry.sources.join(', ') || t('settings.plugins.evidence.unknown')}`,
        `${t('settings.plugins.evidence.firstSeen')}: ${this.formatTimestamp(entry.firstObservedAt)}`,
        `${t('settings.plugins.evidence.lastSeen')}: ${this.formatTimestamp(entry.lastObservedAt)}`,
      ].join(' · ');
    }
  }

  private describeFetchStatus(fetch: PluginEvidenceSnapshot['fetch']): string {
    if (fetch.status === 'idle' && fetch.attemptedAt !== null) {
      return t('settings.plugins.evidence.fetchRefreshing');
    }

    switch (fetch.status) {
      case 'idle':
        return t('settings.plugins.evidence.fetchIdle');
      case 'ready':
        return t('settings.plugins.evidence.fetchReady');
      case 'error':
        return t('settings.plugins.evidence.fetchError');
      default:
        return t('settings.plugins.evidence.unknown');
    }
  }

  private formatTimestamp(timestamp: number): string {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return String(timestamp);
    }
  }
}
