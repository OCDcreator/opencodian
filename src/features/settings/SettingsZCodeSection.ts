import * as nodeOs from 'node:os';

import { Setting } from 'obsidian';

import type { FileRevision } from '../../core/agents/backend/ProjectResourceSecureWrite';
import type { ZCodeAdapter, ZCodeAdapterRuntimeDiagnostics, ZCodeManagementCatalog, ZCodeManagementMutationResult } from '../../core/agents/backend/zcode';
import { normalizeZCodeBackendSettings, type ZCodeBackendSettings } from '../../core/types/settings';
import { t } from '../../i18n';

/** Minimal host surface; keeps this section testable without the full plugin type. */
export interface SettingsZCodeHost {
  settings: { backendSettings: { zcode?: ZCodeBackendSettings } };
  saveSettings(): Promise<void>;
  agentServiceRegistry?: {
    get(kind: 'zcode'): {
      start(): Promise<void>;
      stop(): Promise<void>;
      getRuntimeDiagnostics?(): ZCodeAdapterRuntimeDiagnostics;
      getManagementCatalog?(): Promise<ZCodeManagementCatalog | null>;
      setManagedPluginEnabled?(pluginId: string, enabled: boolean, expectedRevision: FileRevision | null): Promise<ZCodeManagementMutationResult>;
    } | undefined;
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

/** Parent supplies locale entries; keep the surface usable until that handoff lands. */
function managementText(key: string, fallback: string): string {
  const translated = t(key as Parameters<typeof t>[0]);
  return translated === key ? fallback : translated;
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

    // Initial values are a render snapshot; change handlers merge the latest host state.
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
              ...normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode),
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
            this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({
              ...normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode),
              model: value,
            });
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
            this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({
              ...normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode),
              thinkingLevel: value,
            });
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
          this.host.settings.backendSettings.zcode = normalizeZCodeBackendSettings({
            ...normalizeZCodeBackendSettings(this.host.settings.backendSettings.zcode),
            mode: value,
          });
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
    this.attachManagement(body);
  }

  private attachManagement(body: HTMLElement): void {
    const container = body.createDiv({ attr: { 'data-settings-target': 'zcode-management' } });
    container.createEl('h3', { text: managementText('settings.zcode.management.title', 'Plugins, MCP and hooks') });
    container.createEl('p', {
      cls: 'setting-item-description',
      text: managementText('settings.zcode.management.help', 'Plugin switches save workspace overrides. Effective configuration is read again after saving; existing sessions keep their startup snapshot. MCP status and hook declarations are read-only.'),
    });
    const outcome = container.createDiv({ attr: { role: 'status', 'data-zcode-management': 'outcome' } });
    const catalog = container.createDiv({ attr: { 'data-zcode-management': 'catalog' } });
    let refreshEpoch = 0;
    const refresh = async (): Promise<void> => {
      const epoch = ++refreshEpoch;
      try {
        const snapshot = await this.adapter?.getManagementCatalog?.() ?? null;
        if (epoch === refreshEpoch) this.renderManagement(catalog, snapshot, outcome, refresh);
      } catch {
        if (epoch === refreshEpoch) {
          catalog.empty();
          this.addStateRow(catalog, managementText('settings.zcode.management.title', 'Plugins, MCP and hooks'), managementText('settings.zcode.management.failed', 'Readback failed; effective values are unknown.'));
        }
      }
    };
    new Setting(container)
      .setName(managementText('settings.zcode.management.refresh', 'Refresh effective catalog'))
      .addButton((button) => button.setButtonText(managementText('settings.zcode.management.refresh', 'Refresh effective catalog')).onClick(async () => {
        button.setDisabled(true);
        try { await refresh(); } finally { button.setDisabled(false); }
      }));
    void refresh();
  }

  private renderManagement(container: HTMLElement, catalog: ZCodeManagementCatalog | null, outcome: HTMLElement, refresh: () => Promise<void>): void {
    container.empty();
    if (!catalog) {
      this.addStateRow(container, managementText('settings.zcode.management.title', 'Plugins, MCP and hooks'), managementText('settings.zcode.management.unavailable', 'Unavailable for this runtime or workspace.'));
      return;
    }
    this.addStateRow(container, managementText('settings.zcode.management.declarations', 'Workspace declarations'),
      catalog.configuration.state === 'available'
        ? t('settings.zcode.management.declarationCounts', {
            path: shortenPath(catalog.configuration.targetPath), plugins: catalog.configuration.pluginOverrideCount ?? '?',
            mcp: catalog.configuration.mcpDeclarationCount ?? '?', hooks: catalog.configuration.hookDeclarationCount ?? '?',
          })
        : managementText('settings.zcode.management.failed', 'Readback failed; effective values are unknown.'));
    this.addStateRow(container, managementText('settings.zcode.management.plugins', 'Effective plugin configuration'),
      managementText(`settings.zcode.management.${catalog.plugins.state}`, catalog.plugins.state));
    for (const plugin of catalog.plugins.entries ?? []) {
      new Setting(container)
        .setName(plugin.id)
        .setDesc(t('settings.zcode.management.pluginDetails', {
          source: managementText(`settings.zcode.management.sourceValue.${plugin.enabledSource ?? 'unknown'}`, plugin.enabledSource ?? 'unknown'),
          mcp: plugin.mcpCount ?? '?', hooks: plugin.hookCount ?? '?',
          missing: plugin.packageMissing ? t('settings.zcode.management.packageMissing') : '',
        }))
        .addToggle((toggle) => {
          toggle.setValue(plugin.enabled).setDisabled(catalog.mutation.plugins !== 'available' || catalog.configuration.state !== 'available' || plugin.packageMissing || !this.adapter?.setManagedPluginEnabled);
          toggle.onChange(async (enabled) => {
            toggle.setDisabled(true);
            try {
              const result = await this.adapter?.setManagedPluginEnabled?.(plugin.id, enabled, catalog.configuration.revision);
              if (result?.evidence.persistence === 'verified') this.host.invalidateSlashCommandCatalog?.();
              await refresh();
              outcome.setText(result ? t('settings.zcode.management.outcome', {
                  status: managementText(`settings.zcode.management.result.${result.status}`, result.status),
                  persistence: managementText(`settings.zcode.management.evidence.${result.evidence.persistence}`, result.evidence.persistence),
                  application: managementText(`settings.zcode.management.evidence.${result.evidence.application}`, result.evidence.application),
                  runtime: managementText(`settings.zcode.management.evidence.${result.evidence.runtime}`, result.evidence.runtime),
                })
                : managementText('settings.zcode.management.unavailable', 'Unavailable for this runtime or workspace.'));
            } catch {
              toggle.setValue(plugin.enabled).setDisabled(false);
              outcome.setText(managementText('settings.zcode.management.failed', 'Readback failed; effective values are unknown.'));
            }
          });
        });
    }
    this.addStateRow(container, managementText('settings.zcode.management.mcp', 'MCP runtime status'), managementText(`settings.zcode.management.${catalog.mcp.state}`, catalog.mcp.state));
    for (const server of catalog.mcp.entries ?? []) {
      this.addStateRow(container, server.id, t('settings.zcode.management.mcpDetails', {
        status: managementText(`settings.zcode.management.mcpStatus.${server.status}`, server.status),
        tools: server.toolCount ?? '?',
        authentication: managementText(`settings.zcode.management.authValue.${server.authentication}`, server.authentication),
      }));
    }
    this.addStateRow(container, managementText('settings.zcode.management.hooks', 'Effective hooks'), managementText('settings.zcode.management.hooksUnavailable', 'Unavailable: this protocol has no independent hook configuration readback. Declaration counts do not prove execution.'));
    this.addStateRow(container, managementText('settings.zcode.management.mutations', 'MCP and hook changes'), managementText('settings.zcode.management.mutationsUnavailable', 'Unavailable: this runtime has no supported management mutation contract.'));
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
