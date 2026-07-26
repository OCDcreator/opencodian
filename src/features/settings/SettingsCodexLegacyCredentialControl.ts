/**
 * SettingsCodexLegacyCredentialControl — masked legacy Codex credential control.
 *
 * This owner deliberately keeps the high-risk secret lifecycle together:
 * confirmation, masked rendering, persistence transaction/rollback, and the
 * callback that applies post-success runtime/auth-source changes. The value is
 * never copied into DOM text, attributes, notices, or diagnostics.
 */

import { ButtonComponent, Setting } from 'obsidian';

import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';

export interface SettingsCodexLegacyCredentialControlOptions {
  plugin: OpenCodianPlugin;
  onAfterClear: () => void;
}

type ClearFailureKey = 'settings.codex.apiKey.clearFailed';

export class SettingsCodexLegacyCredentialControl {
  private readonly plugin: OpenCodianPlugin;
  private readonly onAfterClear: () => void;
  private hostEl: HTMLElement | null = null;
  private clearButton: ButtonComponent | null = null;
  private clearButtonEl: HTMLButtonElement | null = null;

  constructor(options: SettingsCodexLegacyCredentialControlOptions) {
    this.plugin = options.plugin;
    this.onAfterClear = options.onAfterClear;
  }

  render(containerEl: HTMLElement): void {
    this.dispose();
    this.hostEl = containerEl.createDiv({
      cls: 'opencodian-settings-codex-legacy-credential-status',
      attr: {
        'data-codex-legacy-credential': 'true',
        role: 'status',
        'aria-live': 'polite',
        'aria-label': t('settings.codex.apiKey.name'),
      },
    });
    this.renderContent();
  }

  dispose(): void {
    this.hostEl = null;
    this.clearButton = null;
    this.clearButtonEl = null;
  }

  private renderContent(failureKey?: ClearFailureKey): void {
    const hostEl = this.hostEl;
    if (!hostEl) {
      return;
    }

    this.clearButton = null;
    this.clearButtonEl = null;
    hostEl.empty();
    const configured = Boolean(this.plugin.settings.backendSettings.codex.apiKey);
    hostEl.setAttribute('data-credential-state', configured ? 'configured' : 'empty');
    hostEl.createDiv({
      cls: 'opencodian-settings-codex-legacy-credential-status-copy',
      text: configured
        ? t('settings.codex.apiKey.statusConfigured')
        : t('settings.codex.apiKey.statusMissing'),
    });

    if (failureKey) {
      hostEl.createDiv({
        cls: 'opencodian-settings-codex-legacy-credential-status-error',
        attr: { role: 'alert' },
        text: t(failureKey),
      });
    }

    const setting = new Setting(hostEl)
      .setName(t('settings.codex.apiKey.name'))
      .setDesc(t('settings.codex.apiKey.desc'));

    if (!configured) {
      return;
    }

    setting.addButton((button) => {
      this.clearButton = button;
      this.clearButtonEl = button.buttonEl ?? null;
      button
        .setButtonText(t('settings.codex.apiKey.clearButton'))
        .onClick(() => this.clearCredential());
      this.clearButtonEl?.setAttribute('type', 'button');
      this.clearButtonEl?.setAttribute('aria-label', t('settings.codex.apiKey.clearButton'));
      this.clearButtonEl?.setAttribute('aria-disabled', 'false');
    });
  }

  private setClearButtonDisabled(disabled: boolean): void {
    this.clearButton?.setDisabled(disabled);
    this.clearButtonEl?.setAttribute('aria-disabled', String(disabled));
  }

  private async clearCredential(): Promise<void> {
    const codex = this.plugin.settings.backendSettings.codex;
    const previousSecret = codex.apiKey;
    if (!previousSecret) {
      return;
    }

    const confirmed = typeof window.confirm === 'function'
      && window.confirm(t('settings.codex.apiKey.clearConfirm')) === true;
    if (!confirmed) {
      return;
    }

    this.setClearButtonDisabled(true);
    codex.apiKey = '';
    try {
      await this.plugin.saveSettings();
    } catch {
      const shouldRestoreFocus = this.clearButtonEl === this.hostEl?.ownerDocument.activeElement;
      codex.apiKey = previousSecret;
      this.setClearButtonDisabled(false);
      this.renderContent('settings.codex.apiKey.clearFailed');
      if (shouldRestoreFocus) {
        this.clearButtonEl?.focus();
      }
      return;
    }

    this.renderContent();
    this.onAfterClear();
  }
}
