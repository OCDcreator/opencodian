/**
 * SettingsCodexSection — minimal Codex backend settings panel.
 *
 * Renders the connection/authentication settings for the Codex adapter.
 * Only fields that are genuinely wired through to the SDK adapter are exposed.
 */

import { DropdownComponent, Setting } from 'obsidian';

import type { CodexModelSummary } from '../../core/agents/backend/CodexAdapter';
import type { CodexReasoningEffort, CodexWebSearchMode } from '../../core/types/settings';
import {
  getDefaultClaudeCodeBackendSettings,
  getDefaultCodexBackendSettings,
} from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { SettingsCodexAccountSurface } from './SettingsCodexAccountSurface';
import { SettingsCodexReadbackControls } from './SettingsCodexReadbackControls';

export interface SettingsCodexSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

export class SettingsCodexSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsCodexSectionOptions['createSectionHeading'];
  private readonly readbackControls: SettingsCodexReadbackControls;
  private readonly accountSurface: SettingsCodexAccountSurface;

  constructor(options: SettingsCodexSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.readbackControls = new SettingsCodexReadbackControls({ plugin: this.plugin });
    this.accountSurface = new SettingsCodexAccountSurface({ plugin: this.plugin });
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
    const modelSetting = new Setting(bodyEl)
      .setName(t('settings.codex.model.name'))
      .setDesc(t('settings.codex.model.desc'));

    let modelDropdown: DropdownComponent | null = null;
    let modelCustomInputEl: HTMLInputElement | null = null;
    const currentModel = this.plugin.settings.backendSettings.codex.model;

    modelSetting.addDropdown((dropdown) => {
      modelDropdown = dropdown;
      dropdown.selectEl?.setAttribute('data-setting', 'codex-model');
      dropdown.addOption('__custom__', t('settings.codex.model.customOption'));
      dropdown.setValue('__custom__');
      dropdown.onChange(async (value) => {
        if (value === '__custom__') {
          if (modelCustomInputEl) {
            modelCustomInputEl.style.display = 'block';
            modelCustomInputEl.focus();
          }
        } else {
          if (modelCustomInputEl) {
            modelCustomInputEl.style.display = 'none';
            modelCustomInputEl.value = '';
          }
          this.plugin.settings.backendSettings.codex.model = value;
          await this.plugin.saveSettings();
          this.applyCodexRuntimeUpdates();
        }
      });
    });

    if (modelSetting.controlEl) {
      modelCustomInputEl = modelSetting.controlEl.createEl('input', {
        cls: 'opencodian-settings-text-input',
        attr: {
          type: 'text',
          placeholder: t('settings.codex.model.customPlaceholder'),
          'data-setting': 'codex-model-custom',
        },
      });
      modelCustomInputEl.value = currentModel;
      modelCustomInputEl.addEventListener('change', async () => {
        const value = modelCustomInputEl?.value ?? '';
        this.plugin.settings.backendSettings.codex.model = value;
        await this.plugin.saveSettings();
        this.applyCodexRuntimeUpdates();
      });
    }

    void this.populateCodexModelDropdown(currentModel, modelDropdown, modelCustomInputEl);

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

    // Web search mode
    new Setting(bodyEl)
      .setName(t('settings.codex.webSearch.name'))
      .setDesc(t('settings.codex.webSearch.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('disabled', t('settings.codex.webSearch.disabled'))
          .addOption('cached', t('settings.codex.webSearch.cached'))
          .addOption('live', t('settings.codex.webSearch.live'))
          .setValue(this.plugin.settings.backendSettings.codex.webSearchMode)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.webSearchMode = value as CodexWebSearchMode;
            await this.plugin.saveSettings();
            this.applyCodexRuntimeUpdates();
          }),
      );

    // Authentication info
    const apiKey = this.plugin.settings.backendSettings.codex.apiKey;
    const authSourceDesc = apiKey
      ? t('settings.codex.connection.sourceApiKey')
      : t('settings.codex.connection.sourceEnvOrChatgpt');
    new Setting(bodyEl)
      .setName(t('settings.codex.connection.name'))
      .setDesc(authSourceDesc)
      .then((setting) => {
        setting.setDisabled(true);
      });

    this.readbackControls.renderBackendSessionBrowserInfo(bodyEl);
    this.readbackControls.renderModelListReadbackControls(bodyEl);
    this.readbackControls.renderPermissionProfilesReadbackControls(bodyEl);
    this.readbackControls.renderMcpServerStatusReadbackControls(bodyEl);
    this.readbackControls.renderLoadedThreadsReadbackControls(bodyEl);

    // Account & capability product surface — elevated from JSON-dump readbacks.
    // Renders four product cards: account identity, token usage, rate limits,
    // and provider capabilities. Each auto-loads and exposes its own refresh.
    this.createSectionHeading(
      bodyEl,
      t('settings.codex.accountSurface.sectionName'),
      t('settings.codex.accountSurface.sectionDesc'),
    );
    const authSource = apiKey ? 'plugin-api-key' : 'env-or-chatgpt';
    this.accountSurface.attach(bodyEl, authSource);
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

    if ('updateWebSearchMode' in adapter) {
      (adapter as { updateWebSearchMode(m: CodexWebSearchMode): void })
        .updateWebSearchMode(codex.webSearchMode);
    }

    if ('updateModel' in adapter) {
      (adapter as { updateModel(m: string | undefined): void })
        .updateModel(codex.model);
    }
  }

  private async populateCodexModelDropdown(
    currentModel: string,
    dropdown: DropdownComponent | null,
    customInputEl: HTMLInputElement | null,
  ): Promise<void> {
    if (!dropdown?.selectEl) {
      return;
    }

    const models = await this.loadCodexModelOptions();

    dropdown.selectEl.empty();

    if (models && models.length > 0) {
      for (const model of models) {
        dropdown.addOption(model.slug, model.display_name || model.slug);
      }
    }

    dropdown.addOption('__custom__', t('settings.codex.model.customOption'));

    const isKnownModel = models?.some((m) => m.slug === currentModel) ?? false;
    if (isKnownModel) {
      dropdown.setValue(currentModel);
      if (customInputEl) {
        customInputEl.style.display = 'none';
        customInputEl.value = '';
      }
    } else {
      dropdown.setValue('__custom__');
      if (customInputEl) {
        customInputEl.style.display = 'block';
        customInputEl.value = currentModel;
      }
    }
  }

  private async loadCodexModelOptions(): Promise<CodexModelSummary[] | undefined> {
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      getModelList?: () => Promise<CodexModelSummary[] | null>;
    } | null;
    if (typeof adapter?.getModelList !== 'function') {
      return undefined;
    }
    try {
      const models = await adapter.getModelList();
      return models ?? undefined;
    } catch {
      return undefined;
    }
  }
}
