/**
 * Coordinates the plugin-settings half of Claude provider mutations.
 *
 * Source files are written first by the backend owner. This boundary keeps a
 * verified source revision/evidence and the in-memory metadata together when
 * plugin.saveSettings() is temporarily unavailable, so recovery never writes
 * the source a second time.
 */

import {
  type ApplyClaudeProviderPresetResult,
  type MigrateClaudeProviderModelsResult,
} from '../../core/agents/backend';
import type { ClaudeCodeBackendSettings } from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

type ClaudeProviderPartialPersistence =
  | {
    kind: 'preset';
    revision: ApplyClaudeProviderPresetResult['revision'];
    evidence: ApplyClaudeProviderPresetResult['evidence'];
    pending: {
      activePresetId: string;
      lastAppliedManagedEnvKeys: string[];
    };
  }
  | {
    kind: 'migration';
    revision: MigrateClaudeProviderModelsResult['revision'];
    evidence: MigrateClaudeProviderModelsResult['evidence'];
    sourceMutated: boolean;
    pending: {
      model: string;
      fallbackModel: string;
      modelMigrationDone: boolean;
    };
  };

export interface SettingsClaudeProviderMetadataPersistenceCoordinatorOptions {
  plugin: Pick<OpenCodianPlugin, 'saveSettings'>;
  getSettings: () => ClaudeCodeBackendSettings;
  requestRender: (bodyEl: HTMLElement) => void;
  onAfterMutation?: () => void;
}

export class SettingsClaudeProviderMetadataPersistenceCoordinator {
  private partialPersistence: ClaudeProviderPartialPersistence | null = null;
  private retryInFlight = false;
  private renderGeneration = 0;
  private currentBodyEl: HTMLElement | null = null;

  constructor(private readonly options: SettingsClaudeProviderMetadataPersistenceCoordinatorOptions) {}

  setRenderGeneration(generation: number, bodyEl?: HTMLElement): void {
    this.renderGeneration = generation;
    if (bodyEl) this.currentBodyEl = bodyEl;
  }

  hasPendingPersistence(): boolean {
    return Boolean(this.partialPersistence);
  }

  persistPresetMetadata(
    result: ApplyClaudeProviderPresetResult,
    settings: ClaudeCodeBackendSettings,
    bodyEl: HTMLElement,
  ): Promise<boolean> {
    this.partialPersistence = {
      kind: 'preset',
      revision: result.revision,
      evidence: result.evidence,
      pending: {
        activePresetId: settings.providers.activePresetId,
        lastAppliedManagedEnvKeys: [...settings.providers.lastAppliedManagedEnvKeys],
      },
    };
    return this.saveOrRender(bodyEl);
  }

  persistMigrationMetadata(
    result: MigrateClaudeProviderModelsResult,
    settings: ClaudeCodeBackendSettings,
    bodyEl: HTMLElement,
  ): Promise<boolean> {
    this.partialPersistence = {
      kind: 'migration',
      revision: result.revision,
      evidence: result.evidence,
      sourceMutated: result.migrated,
      pending: {
        model: settings.model,
        fallbackModel: settings.fallbackModel,
        modelMigrationDone: settings.providers.modelMigrationDone,
      },
    };
    return this.saveOrRender(bodyEl);
  }

  render(bodyEl: HTMLElement, generation: number): void {
    this.currentBodyEl = bodyEl;
    this.renderGeneration = generation;
    const partial = this.partialPersistence;
    if (!partial) return;
    const revision = partial.revision?.sha256.slice(0, 8) ?? t('settings.claudeCode.providers.localStatus.newFile');
    const path = partial.revision?.canonicalPath || '.claude/settings.local.json';
    const evidence = partial.evidence ?? { persistence: 'verified', application: 'pending', runtime: 'unavailable' };
    const partialEl = bodyEl.createDiv({
      cls: 'opencodian-claude-provider-partial-persistence',
      attr: {
        'data-claude-provider-partial-persistence': 'true',
        'data-claude-provider-partial-kind': partial.kind,
        role: 'alert',
        'aria-live': 'assertive',
      },
    });
    partialEl.createEl('strong', { text: t('settings.claudeCode.providers.partialPersistence.title') });
    const descKey = partial.kind === 'preset'
      ? 'settings.claudeCode.providers.partialPersistence.presetDesc'
      : partial.sourceMutated
        ? 'settings.claudeCode.providers.partialPersistence.migrationDesc'
        : 'settings.claudeCode.providers.partialPersistence.migrationNoSourceDesc';
    partialEl.createEl('p', {
      text: t(descKey as TranslationKey, {
        path,
        revision,
        persistence: this.localizeEvidenceStatus(evidence.persistence),
        application: this.localizeEvidenceStatus(evidence.application),
        runtime: this.localizeEvidenceStatus(evidence.runtime),
      }),
    });
    const actions = partialEl.createDiv({ cls: 'opencodian-claude-provider-card-actions' });
    const retryButton = actions.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.claudeCode.providers.partialPersistence.retry'),
    });
    retryButton.type = 'button';
    retryButton.disabled = this.retryInFlight;
    retryButton.setAttribute('aria-label', t('settings.claudeCode.providers.partialPersistence.retry'));
    retryButton.addEventListener('click', () => this.retry(bodyEl, generation, retryButton));
  }

  private localizeEvidenceStatus(status: string): string {
    return t(`settings.claudeCode.providers.partialPersistence.status.${status}` as TranslationKey);
  }

  private async saveOrRender(bodyEl: HTMLElement): Promise<boolean> {
    try {
      await this.options.plugin.saveSettings();
      this.partialPersistence = null;
      return true;
    } catch {
      this.options.requestRender(this.currentBodyEl ?? bodyEl);
      return false;
    }
  }

  private retry(bodyEl: HTMLElement, generation: number, retryButton: HTMLButtonElement): void {
    const partial = this.partialPersistence;
    if (!partial || this.retryInFlight || generation !== this.renderGeneration) return;
    this.retryInFlight = true;
    retryButton.disabled = true;
    retryButton.setAttribute('aria-busy', 'true');
    this.restorePendingMetadata(partial);
    void this.options.plugin.saveSettings()
      .then(() => {
        if (this.partialPersistence !== partial) {
          this.retryInFlight = false;
          return;
        }
        this.partialPersistence = null;
        this.retryInFlight = false;
        this.options.onAfterMutation?.();
        this.options.requestRender(this.currentBodyEl ?? bodyEl);
      })
      .catch(() => {
        this.retryInFlight = false;
        const currentBodyEl = this.currentBodyEl ?? bodyEl;
        const partialEl = currentBodyEl.querySelector<HTMLElement>('[data-claude-provider-partial-persistence="true"]');
        const currentRetryButton = partialEl?.querySelector<HTMLButtonElement>('button');
        currentRetryButton?.removeAttribute('aria-busy');
        if (currentRetryButton) currentRetryButton.disabled = false;
        if (partialEl && !partialEl.querySelector('[data-claude-provider-partial-retry-failed="true"]')) {
          partialEl.createEl('p', {
            cls: 'opencodian-claude-provider-warning',
            attr: { 'data-claude-provider-partial-retry-failed': 'true' },
            text: t('settings.claudeCode.providers.partialPersistence.retryFailed'),
          });
        }
      });
  }

  private restorePendingMetadata(partial: ClaudeProviderPartialPersistence): void {
    const settings = this.options.getSettings();
    if (partial.kind === 'preset') {
      settings.providers = {
        ...settings.providers,
        activePresetId: partial.pending.activePresetId,
        lastAppliedManagedEnvKeys: [...partial.pending.lastAppliedManagedEnvKeys],
      };
      return;
    }
    settings.model = partial.pending.model;
    settings.fallbackModel = partial.pending.fallbackModel;
    settings.providers = {
      ...settings.providers,
      modelMigrationDone: partial.pending.modelMigrationDone,
    };
  }
}
