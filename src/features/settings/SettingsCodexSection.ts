/**
 * SettingsCodexSection — Codex backend settings panel.
 *
 * Organizes Codex configuration into three product-grade groups:
 *   1. Connection & runtime defaults — genuinely wired SDK options.
 *   2. Resume & inspect — session browser (action) and diagnostic readbacks.
 *   3. Account & provider status — live read-only account/capability cards.
 *
 * The old disabled "Authentication" setting is replaced by a lightweight
 * connection summary and the Account surface auth-source row, so the UI never
 * presents a disabled input as a status indicator.
 */

import { DropdownComponent, Setting } from 'obsidian';

import type { CodexModelSummary } from '../../core/agents/backend/CodexAdapter';
import type { CodexApprovalPolicy, CodexReasoningEffort, CodexWebSearchMode } from '../../core/types/settings';
import {
  getDefaultClaudeCodeBackendSettings,
  getDefaultCodexBackendSettings,
} from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { renderCostEstimateSettingsRow } from './CostEstimateSettingsRow';
import { SettingsCodexAccountSurface } from './SettingsCodexAccountSurface';
import { SettingsCodexReadbackControls } from './SettingsCodexReadbackControls';
import { SettingsCodexResourcesSection } from './SettingsCodexResourcesSection';

export interface SettingsCodexSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

export class SettingsCodexSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsCodexSectionOptions['createSectionHeading'];
  private readonly readbackControls: SettingsCodexReadbackControls;
  private readonly accountSurface: SettingsCodexAccountSurface;
  private readonly resourcesSurface: SettingsCodexResourcesSection;

  constructor(options: SettingsCodexSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.readbackControls = new SettingsCodexReadbackControls({ plugin: this.plugin });
    this.accountSurface = new SettingsCodexAccountSurface({ plugin: this.plugin });
    this.resourcesSurface = new SettingsCodexResourcesSection({
      plugin: this.plugin,
      createSectionHeading: options.createSectionHeading,
      onAfterMutation: () => {
        // Invalidate the Codex runtime / slash-command menu catalog so the
        // next `/` or `$` open reflects project changes immediately (not via
        // skills/changed or the 120s TTL). Runtime skills/list remains the
        // final menu truth.
        this.plugin.invalidateSlashCommandCatalog();
        // The app-server does not always emit `skills/changed` for files the
        // plugin wrote itself, so force the next runtime `skills/list` to
        // bypass the server cache. One-shot; normal menu opens keep caching.
        const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
          forceNextRuntimeSkillsReload?(): void;
        } | undefined;
        adapter?.forceNextRuntimeSkillsReload?.();
      },
    });
  }

  dispose(): void {
    this.accountSurface.dispose();
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.codex.title'),
      t('settings.codex.connection.desc'),
    );
    this.renderTabContent(containerEl, 'connection');
    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.renderTabContent(containerEl, secondaryTabId);
  }

  // ─── Tab content ────────────────────────────────────────────────

  private renderTabContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const resolvedTabId = secondaryTabId || 'connection';

    // Ensure codex settings object exists
    this.plugin.settings.backendSettings ??= {
      claudeCode: getDefaultClaudeCodeBackendSettings(),
      codex: getDefaultCodexBackendSettings(),
    };
    this.plugin.settings.backendSettings.codex ??= getDefaultCodexBackendSettings();

    // Resources renders as independent per-type cards (skills / agents) with no
    // enclosing section card, keeping global-readonly / project-editable /
    // empty-state semantics. A borderless host preserves settings targeting.
    if (resolvedTabId === 'resources') {
      const resourcesHost = containerEl.createDiv({
        attr: {
          'data-settings-surface': 'section',
          'data-settings-target': `codex-${resolvedTabId}`,
          'data-codex-section': resolvedTabId,
        },
      });
      this.resourcesSurface.render(resourcesHost);
      return;
    }

    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-settings-codex-block',
      attr: {
        'data-settings-surface': 'section',
        'data-settings-target': `codex-${resolvedTabId}`,
        'data-codex-section': resolvedTabId,
      },
    });

    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });

    if (resolvedTabId === 'resume-inspect') {
      this.renderResumeAndInspectGroup(bodyEl);
      return;
    }

    if (resolvedTabId === 'permissions') {
      this.renderPermissionsGroup(bodyEl);
      return;
    }

    if (resolvedTabId === 'account') {
      this.renderAccountAndStatusGroup(bodyEl);
      return;
    }

    // Default / 'connection'
    this.renderConnectionSummary(bodyEl);
    this.renderRuntimeDefaultsGroup(bodyEl);
  }

  private renderConnectionSummary(bodyEl: HTMLElement): void {
    const codex = this.plugin.settings.backendSettings.codex;
    const summaryEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-connection-summary',
      attr: { 'data-codex-connection-summary': 'true' },
    });

    const authSource = codex.apiKey
      ? t('settings.codex.connection.sourceApiKey')
      : t('settings.codex.connection.sourceEnvOrChatgpt');

    summaryEl.createSpan({
      cls: 'opencodian-settings-codex-connection-summary-label',
      text: t('settings.codex.connection.name'),
    });
    summaryEl.createSpan({
      cls: 'opencodian-settings-codex-connection-summary-value',
      text: authSource,
    });
  }

  private renderRuntimeDefaultsGroup(bodyEl: HTMLElement): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--runtime',
      attr: { 'data-codex-group': 'runtime-defaults' },
    });

    groupEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.groups.runtimeDefaults'),
    });
    groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-desc',
      text: t('settings.codex.groups.runtimeDefaultsDesc'),
    });

    const controlsEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
      attr: { 'data-codex-group-controls': 'runtime-defaults' },
    });

    this.renderApiKeySetting(controlsEl);
    this.renderModelSetting(controlsEl);
    this.renderReasoningSetting(controlsEl);
    this.renderWebSearchSetting(controlsEl);
  }

  /**
   * Permissions tab: approval policy, sandbox, network access, and additional
   * directories. Model, reasoning, API key, and web search stay in Connection.
   */
  private renderPermissionsGroup(bodyEl: HTMLElement): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--permissions',
      attr: { 'data-codex-group': 'permissions' },
    });

    groupEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.groups.permissions'),
    });
    groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-desc',
      text: t('settings.codex.groups.permissionsDesc'),
    });

    const controlsEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
      attr: { 'data-codex-group-controls': 'permissions' },
    });

    this.renderApprovalPolicySetting(controlsEl);
    this.renderSandboxSetting(controlsEl);
    this.renderNetworkAccessSetting(controlsEl);
    this.renderAdditionalDirectoriesSetting(controlsEl);
  }

  private renderApprovalPolicySetting(bodyEl: HTMLElement): void {
    new Setting(bodyEl)
      .setName(t('settings.codex.approvalPolicy.name'))
      .setDesc(t('settings.codex.approvalPolicy.desc'))
      .addDropdown((dropdown) => {
        dropdown.selectEl?.setAttribute('aria-label', t('settings.codex.approvalPolicy.name'));
        return dropdown
          .addOption('inherit', t('settings.codex.approvalPolicy.inherit'))
          .addOption('untrusted', t('settings.codex.approvalPolicy.untrusted'))
          .addOption('on-request', t('settings.codex.approvalPolicy.onRequest'))
          .addOption('never', t('settings.codex.approvalPolicy.never'))
          .setValue(this.plugin.settings.backendSettings.codex.approvalPolicy)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.approvalPolicy = value as CodexApprovalPolicy;
            await this.plugin.saveSettings();
            this.applyCodexRuntimeUpdates();
          });
      });
  }

  private renderApiKeySetting(bodyEl: HTMLElement): void {
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
        const inputEl = setting.controlEl.querySelector('input');
        if (inputEl) {
          inputEl.type = 'password';
          inputEl.autocomplete = 'off';
        }
      });
  }

  private renderModelSetting(bodyEl: HTMLElement): void {
    const modelSetting = new Setting(bodyEl)
      .setName(t('settings.codex.model.name'))
      .setDesc(t('settings.codex.model.desc'));

    let modelDropdown: DropdownComponent | null = null;
    let modelCustomInputEl: HTMLInputElement | null = null;
    const currentModel = this.plugin.settings.backendSettings.codex.model;

    modelSetting.addDropdown((dropdown) => {
      modelDropdown = dropdown;
      dropdown.selectEl?.setAttribute('data-setting', 'codex-model');
      dropdown.addOption('', t('settings.codex.model.loadingOption'));
      dropdown.setValue('');
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
      modelCustomInputEl.style.display = 'none';
      modelCustomInputEl.addEventListener('change', async () => {
        const value = modelCustomInputEl?.value ?? '';
        this.plugin.settings.backendSettings.codex.model = value;
        await this.plugin.saveSettings();
        this.applyCodexRuntimeUpdates();
      });
    }

    void this.populateCodexModelDropdown(currentModel, modelDropdown, modelCustomInputEl);
  }

  private renderSandboxSetting(bodyEl: HTMLElement): void {
    new Setting(bodyEl)
      .setName(t('settings.codex.sandbox.name'))
      .setDesc(t('settings.codex.sandbox.desc'))
      .addDropdown((dropdown) => {
        dropdown.selectEl?.setAttribute('aria-label', t('settings.codex.sandbox.name'));
        return dropdown
          .addOption('read-only', t('settings.codex.sandbox.readOnly'))
          .addOption('workspace-write', t('settings.codex.sandbox.workspaceWrite'))
          .addOption('danger-full-access', t('settings.codex.sandbox.dangerFullAccess'))
          .setValue(this.plugin.settings.backendSettings.codex.sandboxMode)
          .onChange(async (value) => {
            this.plugin.settings.backendSettings.codex.sandboxMode = value as 'read-only' | 'workspace-write' | 'danger-full-access';
            await this.plugin.saveSettings();
            this.applyCodexRuntimeUpdates();
          });
      });
  }

  private renderReasoningSetting(bodyEl: HTMLElement): void {
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
  }

  private renderAdditionalDirectoriesSetting(bodyEl: HTMLElement): void {
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
  }

  private renderNetworkAccessSetting(bodyEl: HTMLElement): void {
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
  }

  private renderWebSearchSetting(bodyEl: HTMLElement): void {
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
  }

  private renderResumeAndInspectGroup(bodyEl: HTMLElement): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--resume',
      attr: { 'data-codex-group': 'resume-and-inspect' },
    });

    groupEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.groups.resumeAndInspect'),
    });
    groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-desc',
      text: t('settings.codex.groups.resumeAndInspectDesc'),
    });

    const controlsEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
      attr: { 'data-codex-group-controls': 'resume-and-inspect' },
    });

    this.readbackControls.renderBackendSessionBrowserInfo(controlsEl);
    new Setting(controlsEl)
      .setName(t('settings.codex.contextUsage.name'))
      .setDesc(t('settings.codex.contextUsage.desc'));
    this.readbackControls.renderModelListReadbackControls(controlsEl);
    this.readbackControls.renderPermissionProfilesReadbackControls(controlsEl);
    this.readbackControls.renderMcpServerStatusReadbackControls(controlsEl);
    this.readbackControls.renderLoadedThreadsReadbackControls(controlsEl);
    this.readbackControls.renderHooksReadbackControls(controlsEl);
  }

  private renderAccountAndStatusGroup(bodyEl: HTMLElement): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--account',
      attr: { 'data-codex-group': 'account-and-status' },
    });

    const headerEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-header',
    });
    const headerTextEl = headerEl.createDiv({
      cls: 'opencodian-settings-codex-group-header-text',
    });
    headerTextEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.accountSurface.sectionName'),
    });
    headerTextEl.createDiv({
      cls: 'opencodian-settings-codex-group-desc',
      text: t('settings.codex.accountSurface.sectionDesc'),
    });
    const refreshAllTooltip = t('settings.codex.accountSurface.refreshAllTooltip');
    const refreshAllButtonEl = headerEl.createEl('button', {
      cls: 'opencodian-codex-account-refresh-all',
      text: t('settings.codex.accountSurface.refreshAll'),
      attr: { type: 'button', title: refreshAllTooltip, 'aria-label': refreshAllTooltip },
    });
    refreshAllButtonEl.addEventListener('click', () => this.accountSurface.refreshAllNow());

    const authSource = this.plugin.settings.backendSettings.codex.apiKey
      ? 'plugin-api-key'
      : 'env-or-chatgpt';
    const cardsEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
      attr: { 'data-codex-group-controls': 'account' },
    });
    this.accountSurface.attach(cardsEl, authSource);

    const costGroupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--cost',
      attr: { 'data-codex-group': 'cost-estimate' },
    });
    costGroupEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.cost.group.title'),
    });
    const costControlsEl = costGroupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
      attr: { 'data-codex-group-controls': 'cost-estimate' },
    });
    renderCostEstimateSettingsRow(costControlsEl, this.plugin, 'codex');
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

    if ('updateApprovalPolicy' in adapter) {
      (adapter as { updateApprovalPolicy(p: CodexApprovalPolicy): void })
        .updateApprovalPolicy(codex.approvalPolicy);
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
