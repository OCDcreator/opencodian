/**
 * SettingsCodexSection — minimal Codex backend settings panel.
 *
 * Renders the connection/authentication settings for the Codex adapter.
 * Only fields that are genuinely wired through to the SDK adapter are exposed.
 */

import { Notice, Setting } from 'obsidian';

import type { AgentBackendKind } from '../../core/types/chat';
import type { CodexReasoningEffort } from '../../core/types/settings';
import {
  getDefaultClaudeCodeBackendSettings,
  getDefaultCodexBackendSettings,
} from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { BackendSessionBrowserModal } from '../chat/ui/BackendSessionBrowserModal';

export interface SettingsCodexSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

export class SettingsCodexSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsCodexSectionOptions['createSectionHeading'];

  constructor(options: SettingsCodexSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.codex.title'),
      t('settings.codex.connection.desc'),
    );
    this.renderConnectionTab(containerEl);
    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, _secondaryTabId: string): void {
    this.renderConnectionTab(containerEl);
  }

  // ─── Connection tab ─────────────────────────────────────────────

  private renderConnectionTab(containerEl: HTMLElement): void {
    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-settings-codex-block',
      attr: {
        'data-settings-surface': 'section',
        'data-settings-target': 'codex-connection',
        'data-codex-section': 'connection',
      },
    });

    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });

    // Ensure codex settings object exists
    this.plugin.settings.backendSettings ??= {
      claudeCode: getDefaultClaudeCodeBackendSettings(),
      codex: getDefaultCodexBackendSettings(),
    };
    this.plugin.settings.backendSettings.codex ??= getDefaultCodexBackendSettings();

    // API Key
    new Setting(bodyEl)
      .setName(t('settings.codex.apiKey.name'))
      .setDesc(t('settings.codex.apiKey.desc'))
      .addText((text) =>
        text
          .setPlaceholder(t('settings.codex.apiKey.placeholder'))
          .setValue(this.plugin.settings.backendSettings.codex.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.apiKey = value;
            await this.plugin.saveSettings();
          }),
      )
      .then((setting) => {
        // Mask the API key input
        const inputEl = setting.controlEl.querySelector('input');
        if (inputEl) {
          inputEl.type = 'password';
          inputEl.autocomplete = 'off';
        }
      });

    // Model
    new Setting(bodyEl)
      .setName(t('settings.codex.model.name'))
      .setDesc(t('settings.codex.model.desc'))
      .addText((text) =>
        text
          .setPlaceholder(t('settings.codex.model.placeholder'))
          .setValue(this.plugin.settings.backendSettings.codex.model)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.model = value;
            await this.plugin.saveSettings();
          }),
      );

    // Sandbox mode
    new Setting(bodyEl)
      .setName(t('settings.codex.sandbox.name'))
      .setDesc(t('settings.codex.sandbox.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('read-only', t('settings.codex.sandbox.readOnly'))
          .addOption('workspace-write', t('settings.codex.sandbox.workspaceWrite'))
          .addOption('danger-full-access', t('settings.codex.sandbox.dangerFullAccess'))
          .setValue(this.plugin.settings.backendSettings.codex.sandboxMode)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.sandboxMode = value as 'read-only' | 'workspace-write' | 'danger-full-access';
            await this.plugin.saveSettings();
            this.applyCodexRuntimeUpdates();
          }),
      );

    // Model reasoning effort
    new Setting(bodyEl)
      .setName(t('settings.codex.reasoning.name'))
      .setDesc(t('settings.codex.reasoning.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('minimal', t('settings.codex.reasoning.minimal'))
          .addOption('low', t('settings.codex.reasoning.low'))
          .addOption('medium', t('settings.codex.reasoning.medium'))
          .addOption('high', t('settings.codex.reasoning.high'))
          .addOption('xhigh', t('settings.codex.reasoning.xhigh'))
          .setValue(this.plugin.settings.backendSettings.codex.modelReasoningEffort)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.modelReasoningEffort = value as CodexReasoningEffort;
            await this.plugin.saveSettings();
            this.applyCodexRuntimeUpdates();
          }),
      );

    // Additional directories
    new Setting(bodyEl)
      .setName(t('settings.codex.additionalDirs.name'))
      .setDesc(t('settings.codex.additionalDirs.desc'))
      .addTextArea((text) =>
        text
          .setPlaceholder(t('settings.codex.additionalDirs.placeholder'))
          .setValue(this.plugin.settings.backendSettings.codex.additionalDirectories)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.additionalDirectories = value;
            await this.plugin.saveSettings();
            this.applyCodexRuntimeUpdates();
          }),
      );

    // Network access
    new Setting(bodyEl)
      .setName(t('settings.codex.network.name'))
      .setDesc(t('settings.codex.network.desc'))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.backendSettings.codex.networkAccessEnabled)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.networkAccessEnabled = value;
            await this.plugin.saveSettings();
            this.applyCodexRuntimeUpdates();
          }),
      );

    // Authentication info
    new Setting(bodyEl)
      .setName(t('settings.codex.connection.name'))
      .setDesc(t('settings.codex.connection.desc'))
      .then((setting) => {
        setting.setDisabled(true);
      });

    this.renderBackendSessionBrowserInfo(bodyEl);
    this.renderAccountInfoReadbackControls(bodyEl);
    this.renderModelListReadbackControls(bodyEl);
    this.renderPermissionProfilesReadbackControls(bodyEl);
    this.renderAccountRateLimitsReadbackControls(bodyEl);
    this.renderAccountUsageReadbackControls(bodyEl);
  }

  private renderBackendSessionBrowserInfo(containerEl: HTMLElement): void {
    const infoEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-codex-session-browser-info': 'true' },
    });
    infoEl.createSpan({ text: t('settings.codex.sessionBrowser.info') });

    new Setting(containerEl)
      .setName(t('settings.codex.sessionBrowser.launchName'))
      .setDesc(t('settings.codex.sessionBrowser.launchDesc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.sessionBrowser.launchButton'))
          .onClick(() => {
            const host = {
              getAgentServiceRegistry: () => this.plugin.agentServiceRegistry ?? null,
              createConversationFromBackendSession: async (
                sessionId: string,
                title: string,
                initialMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; timestamp: number }>,
                backend?: string,
              ) => this.plugin.createConversationFromBackendSession(sessionId, title, initialMessages, backend as AgentBackendKind),
              loadConversation: async (conversationId: string) => this.plugin.loadBackendSessionConversation(conversationId),
              getActiveBackendKind: () => this.plugin.settings.activeBackend ?? null,
              showNotice: (msg: string) => { new Notice(msg); },
              isStreaming: () => false,
              supportsResume: () => true,
              forcedBackendKind: 'codex' as const,
            };
            new BackendSessionBrowserModal(this.plugin.app, host).open();
          });
      });

    const inMemoryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-codex-session-browser-in-memory': 'true' },
    });
    inMemoryEl.createSpan({ text: t('settings.codex.sessionBrowser.inMemoryNotice') });
  }

  private renderAccountInfoReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-codex-account-info-readback',
        attr: {
          'data-codex-account-info-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.codex.accountInfo.name'))
      .setDesc(t('settings.codex.accountInfo.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.accountInfo.inspectButton'))
          .onClick(async () => {
            await this.renderAccountInfoReadback(getOutputEl());
          });
      });
  }

  private async renderAccountInfoReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.codex.accountInfo.loading'));
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getAccountInfo?: () => Promise<unknown | null>;
    } | null;
    if (typeof adapter?.getAccountInfo !== 'function') {
      outputEl.setText(t('settings.codex.accountInfo.unavailable'));
      return;
    }

    let accountInfo: unknown | null;
    try {
      accountInfo = await adapter.getAccountInfo();
    } catch {
      outputEl.setText(t('settings.codex.accountInfo.failed'));
      return;
    }

    if (accountInfo === null) {
      outputEl.setText(t('settings.codex.accountInfo.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.codex.accountInfo.summary'),
    });
    outputEl.createEl('pre', {
      text: this.formatAccountInfoReadback(accountInfo),
    });
  }

  private formatAccountInfoReadback(accountInfo: unknown): string {
    try {
      return JSON.stringify(this.sanitizeAccountInfoValue(accountInfo, '', new WeakSet<object>()), null, 2);
    } catch {
      return t('settings.codex.accountInfo.unavailable');
    }
  }

  private sanitizeAccountInfoValue(value: unknown, key: string, seen: WeakSet<object>): unknown {
    if (typeof key === 'string' && /(?:api[_\s-]?key|secret|password|credential|token|authorization|oauth)/i.test(key)) {
      return '[redacted]';
    }
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value !== 'object') {
      return `[${typeof value}]`;
    }
    if (seen.has(value)) {
      return '[circular]';
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeAccountInfoValue(item, key, seen));
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        this.sanitizeAccountInfoValue(entryValue, entryKey, seen),
      ]),
    );
  }

  private renderModelListReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-codex-model-list-readback',
        attr: {
          'data-codex-model-list-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.codex.modelList.name'))
      .setDesc(t('settings.codex.modelList.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.modelList.inspectButton'))
          .onClick(async () => {
            await this.renderModelListReadback(getOutputEl());
          });
      });
  }

  private async renderModelListReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.codex.modelList.loading'));
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getModelList?: () => Promise<unknown[] | null>;
    } | null;
    if (typeof adapter?.getModelList !== 'function') {
      outputEl.setText(t('settings.codex.modelList.unavailable'));
      return;
    }

    let models: unknown[] | null;
    try {
      models = await adapter.getModelList();
    } catch {
      outputEl.setText(t('settings.codex.modelList.failed'));
      return;
    }

    if (models === null || !Array.isArray(models) || models.length === 0) {
      outputEl.setText(t('settings.codex.modelList.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.codex.modelList.summary'),
    });

    for (const model of models) {
      const entry = model as Record<string, unknown>;
      const name = String(entry.display_name ?? entry.slug ?? 'unknown');
      const desc = entry.description as string | null | undefined;
      const label = desc
        ? t('settings.codex.modelList.modelEntry', { name, description: desc })
        : t('settings.codex.modelList.modelEntryNoDesc', { name });

      const rowEl = outputEl.createDiv({
        cls: 'opencodian-codex-model-list-entry',
        attr: {
          'data-model-slug': String(entry.slug ?? ''),
          'data-model-visibility': String(entry.visibility ?? ''),
          'data-proof-state': 'readback',
        },
      });

      rowEl.createEl('p', {
        cls: 'opencodian-codex-model-list-entry-name',
        text: label,
      });

      const metaParts: string[] = [];
      if (entry.default_reasoning_level) {
        metaParts.push(`reasoning: ${entry.default_reasoning_level}`);
      }
      if (entry.supported_in_api === true) {
        metaParts.push('API: yes');
      }
      if (metaParts.length > 0) {
        rowEl.createEl('p', {
          cls: 'opencodian-codex-model-list-entry-meta',
          text: metaParts.join(' | '),
        });
      }
    }
  }

  private renderPermissionProfilesReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-codex-permission-profiles-readback',
        attr: {
          'data-codex-permission-profiles-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.codex.permissionProfiles.name'))
      .setDesc(t('settings.codex.permissionProfiles.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.permissionProfiles.inspectButton'))
          .onClick(async () => {
            await this.renderPermissionProfilesReadback(getOutputEl());
          });
      });
  }

  private async renderPermissionProfilesReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.codex.permissionProfiles.loading'));
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getPermissionProfiles?: () => Promise<unknown[] | null>;
    } | null;
    if (typeof adapter?.getPermissionProfiles !== 'function') {
      outputEl.setText(t('settings.codex.permissionProfiles.unavailable'));
      return;
    }

    let profiles: unknown[] | null;
    try {
      profiles = await adapter.getPermissionProfiles();
    } catch {
      outputEl.setText(t('settings.codex.permissionProfiles.failed'));
      return;
    }

    if (profiles === null || !Array.isArray(profiles) || profiles.length === 0) {
      outputEl.setText(t('settings.codex.permissionProfiles.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.codex.permissionProfiles.summary'),
    });

    for (const profile of profiles) {
      const entry = profile as Record<string, unknown>;
      const id = String(entry.id ?? 'unknown');
      const desc = entry.description as string | null | undefined;
      const label = desc
        ? t('settings.codex.permissionProfiles.profileEntry', { id, description: desc })
        : t('settings.codex.permissionProfiles.profileEntryNoDesc', { id });

      const rowEl = outputEl.createDiv({
        cls: 'opencodian-codex-permission-profile-entry',
        attr: {
          'data-profile-id': id,
          'data-proof-state': 'readback',
        },
      });

      rowEl.createEl('p', {
        cls: 'opencodian-codex-permission-profile-entry-name',
        text: label,
      });
    }
  }

  private renderAccountRateLimitsReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-codex-rate-limits-readback',
        attr: {
          'data-codex-rate-limits-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.codex.rateLimits.name'))
      .setDesc(t('settings.codex.rateLimits.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.rateLimits.inspectButton'))
          .onClick(async () => {
            await this.renderAccountRateLimitsReadback(getOutputEl());
          });
      });
  }

  private async renderAccountRateLimitsReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.codex.rateLimits.loading'));
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getAccountRateLimits?: () => Promise<unknown | null>;
    } | null;
    if (typeof adapter?.getAccountRateLimits !== 'function') {
      outputEl.setText(t('settings.codex.rateLimits.unavailable'));
      return;
    }

    let rateLimits: unknown | null;
    try {
      rateLimits = await adapter.getAccountRateLimits();
    } catch {
      outputEl.setText(t('settings.codex.rateLimits.failed'));
      return;
    }

    if (rateLimits === null) {
      outputEl.setText(t('settings.codex.rateLimits.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.codex.rateLimits.summary'),
    });
    outputEl.createEl('pre', {
      text: JSON.stringify(rateLimits, null, 2),
    });
  }

  private renderAccountUsageReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-codex-account-usage-readback',
        attr: {
          'data-codex-account-usage-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.codex.accountUsage.name'))
      .setDesc(t('settings.codex.accountUsage.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.codex.accountUsage.inspectButton'))
          .onClick(async () => {
            await this.renderAccountUsageReadback(getOutputEl());
          });
      });
  }

  private async renderAccountUsageReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.codex.accountUsage.loading'));
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getAccountUsage?: () => Promise<unknown | null>;
    } | null;
    if (typeof adapter?.getAccountUsage !== 'function') {
      outputEl.setText(t('settings.codex.accountUsage.unavailable'));
      return;
    }

    let accountUsage: unknown | null;
    try {
      accountUsage = await adapter.getAccountUsage();
    } catch {
      outputEl.setText(t('settings.codex.accountUsage.failed'));
      return;
    }

    if (accountUsage === null) {
      outputEl.setText(t('settings.codex.accountUsage.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.codex.accountUsage.summary'),
    });
    outputEl.createEl('pre', {
      text: this.formatAccountUsageReadback(accountUsage),
    });
  }

  private formatAccountUsageReadback(accountUsage: unknown): string {
    try {
      return JSON.stringify(this.sanitizeAccountUsageValue(accountUsage, '', new WeakSet<object>()), null, 2);
    } catch {
      return t('settings.codex.accountUsage.unavailable');
    }
  }

  private sanitizeAccountUsageValue(value: unknown, key: string, seen: WeakSet<object>): unknown {
    if (typeof key === 'string' && /(?:api[_\s-]?key|secret|password|credential|token|authorization|oauth)/i.test(key)) {
      return '[redacted]';
    }
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (typeof value !== 'object') {
      return `[${typeof value}]`;
    }
    if (seen.has(value)) {
      return '[circular]';
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeAccountUsageValue(item, key, seen));
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        this.sanitizeAccountUsageValue(entryValue, entryKey, seen),
      ]),
    );
  }

  private applyCodexRuntimeUpdates(): void {
    const adapter = this.plugin.agentServiceRegistry?.get('codex');
    if (!adapter) {
      return;
    }

    const codex = this.plugin.settings.backendSettings.codex;

    if ('updateAdditionalDirectories' in adapter) {
      const dirs = codex.additionalDirectories
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      (adapter as { updateAdditionalDirectories(d: string[]): void })
        .updateAdditionalDirectories(dirs);
    }

    if ('updateNetworkAccessEnabled' in adapter) {
      (adapter as { updateNetworkAccessEnabled(v: boolean): void })
        .updateNetworkAccessEnabled(codex.networkAccessEnabled);
    }

    if ('updateSandboxMode' in adapter) {
      (adapter as { updateSandboxMode(m: 'read-only' | 'workspace-write' | 'danger-full-access'): void })
        .updateSandboxMode(codex.sandboxMode);
    }

    if ('updateModelReasoningEffort' in adapter) {
      (adapter as { updateModelReasoningEffort(e: CodexReasoningEffort): void })
        .updateModelReasoningEffort(codex.modelReasoningEffort);
    }
  }
}
