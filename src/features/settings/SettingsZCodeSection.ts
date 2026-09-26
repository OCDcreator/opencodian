import * as nodeOs from 'node:os';

import { Setting } from 'obsidian';

import type { ZCodeAdapter, ZCodeAdapterRuntimeDiagnostics } from '../../core/agents/backend/zcode';
import { normalizeZCodeBackendSettings, type ZCodeBackendSettings } from '../../core/types/settings';
import { t } from '../../i18n';

/** Minimal host surface; keeps this section testable without the full plugin type. */
export interface SettingsZCodeHost {
  settings: { backendSettings: { zcode?: ZCodeBackendSettings } };
  saveSettings(): Promise<void>;
  agentServiceRegistry?: {
    get(kind: 'zcode'): { start(): Promise<void>; stop(): Promise<void>; getRuntimeDiagnostics?(): ZCodeAdapterRuntimeDiagnostics } | undefined;
  };
  invalidateSlashCommandCatalog?(): void;
}

/** Config and entry paths are shown for orientation; the home prefix is the noisy part. */
function shortenPath(filePath: string): string {
  const home = nodeOs.homedir();
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedHome = home.replace(/\\/g, '/');
  return normalized.startsWith(`${normalizedHome}/`) ? `~/${normalized.slice(normalizedHome.length + 1)}` : filePath;
}

/**
 * Owns the ZCode runtime surface only: executable override plus an honest
 * ready / unavailable / failed state for discovery, provider configuration,
 * and the capability handshake. Native session state stays in the adapter.
 */
export class SettingsZCodeSection {
  constructor(private readonly host: SettingsZCodeHost) {}

  attach(container: HTMLElement): void {
    container.createEl('h2', { text: t('settings.zcode.title') });
    this.attachBody(container.createDiv());
  }

  attachTabbed(container: HTMLElement, _requested: string): void {
    this.attachBody(container);
  }

  private attachBody(container: HTMLElement): void {
    const section = container.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-zcode-settings',
      attr: { 'data-settings-surface': 'section', 'data-settings-target': 'zcode-connection' },
    });
    const body = section.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });
    body.createEl('h3', { text: t('settings.zcode.tab.connection') });
    body.createEl('p', { text: t('settings.zcode.description'), cls: 'setting-item-description' });

    const settings = normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode);
    new Setting(body)
      .setName(t('settings.zcode.executable'))
      .setDesc(t('settings.zcode.executable.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.zcode.executable.auto'))
          .setValue(settings.executablePath)
          .onChange(async (value) => {
            this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({
              ...settings,
              executablePath: value,
            });
            await this.host.saveSettings();
          });
      });

    new Setting(body)
      .setName(t('settings.zcode.model'))
      .setDesc(t('settings.zcode.model.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.zcode.model.placeholder'))
          .setValue(settings.model)
          .onChange(async (value) => {
            this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({ ...settings, model: value });
            await this.host.saveSettings();
          });
      });
    new Setting(body)
      .setName(t('settings.zcode.thinking'))
      .setDesc(t('settings.zcode.thinking.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.zcode.thinking.placeholder'))
          .setValue(settings.thinkingLevel)
          .onChange(async (value) => {
            this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({ ...settings, thinkingLevel: value });
            await this.host.saveSettings();
          });
      });
    new Setting(body)
      .setName(t('settings.zcode.mode'))
      .setDesc(t('settings.zcode.mode.desc'))
      .addDropdown((dropdown) => {
        for (const value of ['', 'plan', 'build', 'edit', 'yolo', 'auto'] as const) {
          dropdown.addOption(value, value === '' ? t('settings.zcode.mode.inherit') : value);
        }
        dropdown.setValue(settings.mode).onChange(async (value) => {
          this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({ ...settings, mode: value });
          await this.host.saveSettings();
        });
      });

    const status = body.createDiv({ cls: 'opencodian-zcode-config-status', attr: { role: 'status' } });
    this.renderDiagnostics(status);

    new Setting(body)
      .setName(t('settings.zcode.reconnect'))
      .setDesc(t('settings.zcode.reconnect.help'))
      .addButton((button) => {
        button.setButtonText(t('settings.zcode.reconnect')).onClick(async () => {
          button.setDisabled(true);
          const adapter = this.adapter;
          try {
            if (adapter) {
              await adapter.stop();
              await adapter.start();
            }
            this.host.invalidateSlashCommandCatalog?.();
          } catch {
            // The adapter records the failure; the status block reports it.
          } finally {
            this.renderDiagnostics(status);
            button.setDisabled(false);
          }
        });
      });
  }

  private get adapter(): ReturnType<NonNullable<SettingsZCodeHost['agentServiceRegistry']>['get']> {
    return this.host.agentServiceRegistry?.get('zcode');
  }

  private renderDiagnostics(status: HTMLElement): void {
    status.empty();
    const diagnostics = this.adapter?.getRuntimeDiagnostics?.() ?? null;

    const resolution = diagnostics?.resolution ?? null;
    if (!resolution) {
      this.addStateRow(status, t('settings.zcode.status.runtime'), t('settings.zcode.status.idleHint'));
    } else if (resolution.mode === 'ready') {
      this.addStateRow(status, t('settings.zcode.status.runtime'), t('settings.zcode.status.runtimeReady', {
        path: shortenPath(resolution.launch.entryPath),
        source: resolution.launch.source,
      }));
    } else if (resolution.mode === 'missing') {
      this.addStateRow(status, t('settings.zcode.status.runtime'), resolution.reason === 'configured-path-not-found'
        ? t('settings.zcode.status.configuredMissing', { path: resolution.configuredPath ?? '' })
        : t('settings.zcode.status.runtimeMissing'));
    } else {
      this.addStateRow(status, t('settings.zcode.status.runtime'), t('settings.zcode.status.runtimeIncompatible', {
        detail: resolution.detail,
      }));
    }

    const providerConfig = diagnostics?.providerConfig ?? null;
    if (providerConfig) {
      const path = shortenPath(providerConfig.configPath);
      const detail = providerConfig.state === 'validated'
        ? (providerConfig.providerCount === null
            ? t('settings.zcode.status.providerValidatedNoCount', { path })
            : t('settings.zcode.status.providerValidated', {
                path,
                count: String(providerConfig.providerCount),
              }))
        : providerConfig.state === 'missing'
          ? t('settings.zcode.status.providerMissing', { path })
          : providerConfig.state === 'unreadable'
            ? t('settings.zcode.status.providerUnreadable', { path })
            : t('settings.zcode.status.providerMalformed', { path });
      this.addStateRow(status, t('settings.zcode.status.providerConfig'), detail);
    }

    const handshake = diagnostics?.handshake ?? 'idle';
    const connectionDetail = handshake === 'ready'
      ? t('settings.zcode.connected')
      : handshake === 'failed'
        ? (diagnostics?.lastError ?? t('settings.zcode.status.handshakeFailed'))
        : handshake === 'connecting'
          ? t('settings.zcode.status.connecting')
          : t('settings.zcode.status.disconnected');
    this.addStateRow(status, t('settings.zcode.status.connection'), connectionDetail);
  }

  private addStateRow(container: HTMLElement, label: string, detail: string): void {
    const row = container.createDiv({ cls: 'opencodian-zcode-config-status-row' });
    row.createSpan({ cls: 'opencodian-zcode-config-status-label', text: label });
    row.createSpan({ cls: 'opencodian-zcode-config-status-detail', text: detail });
  }
}

export type { ZCodeAdapter };
