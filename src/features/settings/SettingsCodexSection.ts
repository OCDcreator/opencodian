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
/* eslint-disable max-lines -- Codex settings own connection, permissions, account, and inspection controls behind one tabbed section owner. */

import { realpathSync } from 'node:fs';
import path from 'node:path';

import { DropdownComponent, Modal, Notice, Setting } from 'obsidian';

import type { CodexModelSummary } from '../../core/agents/backend/CodexAdapter';
import type { CodexApprovalPolicy, CodexReasoningEffort, CodexWebSearchMode } from '../../core/types/settings';
import {
  getDefaultBackendSettings,
  getDefaultCodexBackendSettings,
} from '../../core/types/settings';
import { t } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import type { CodexProjectConfigTomlDiagnostic } from './CodexProjectConfigFormModel';
import { parseProjectConfigFormValues } from './CodexProjectConfigFormModel';
import { renderCostEstimateSettingsRow } from './CostEstimateSettingsRow';
import { SettingsCodexAccountSurface } from './SettingsCodexAccountSurface';
import { SettingsCodexLegacyCredentialControl } from './SettingsCodexLegacyCredentialControl';
import { SettingsCodexProjectConfigSection } from './SettingsCodexProjectConfigSection';
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
  private readonly legacyCredentialControl: SettingsCodexLegacyCredentialControl;
  private readonly resourcesSurface: SettingsCodexResourcesSection;
  private readonly projectConfigSection: SettingsCodexProjectConfigSection;
  private connectionSummaryValueEl: HTMLElement | null = null;

  constructor(options: SettingsCodexSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.readbackControls = new SettingsCodexReadbackControls({ plugin: this.plugin });
    this.accountSurface = new SettingsCodexAccountSurface({ plugin: this.plugin });
    this.legacyCredentialControl = new SettingsCodexLegacyCredentialControl({
      plugin: this.plugin,
      onAfterClear: () => {
        if (this.connectionSummaryValueEl) {
          this.connectionSummaryValueEl.textContent = t('settings.codex.connection.sourceEnvOrChatgpt');
        }
        this.accountSurface.updateAuthSource('env-or-chatgpt');
        this.applyCodexRuntimeUpdates();
      },
    });
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
    this.projectConfigSection = new SettingsCodexProjectConfigSection({ plugin: this.plugin });
  }

  dispose(): void {
    this.accountSurface.dispose();
    this.legacyCredentialControl.dispose();
    this.connectionSummaryValueEl = null;
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
    this.plugin.settings.backendSettings ??= getDefaultBackendSettings();
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

    if (resolvedTabId === 'project-config') {
      this.renderProjectConfigGroup(bodyEl);
      return;
    }

    if (resolvedTabId === 'account') {
      this.renderAccountAndStatusGroup(bodyEl);
      return;
    }

    // Default / 'connection'
    this.renderConnectionSummary(bodyEl);
    this.renderCliLifecycleControls(bodyEl);
    this.renderRuntimeDefaultsGroup(bodyEl);
  }

  private renderConnectionSummary(bodyEl: HTMLElement): void {
    const codex = this.plugin.settings.backendSettings.codex;
    const summaryEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-connection-summary',
      attr: {
        'data-codex-connection-summary': 'true',
        role: 'status',
        'aria-live': 'polite',
      },
    });

    const authSource = codex.apiKey
      ? t('settings.codex.connection.sourceApiKey')
      : t('settings.codex.connection.sourceEnvOrChatgpt');

    summaryEl.createSpan({
      cls: 'opencodian-settings-codex-connection-summary-label',
      text: t('settings.codex.connection.name'),
    });
    this.connectionSummaryValueEl = summaryEl.createSpan({
      cls: 'opencodian-settings-codex-connection-summary-value',
      text: authSource,
      attr: { 'data-codex-auth-source-summary': 'true' },
    });
  }

  private renderCliLifecycleControls(bodyEl: HTMLElement): void {
    new Setting(bodyEl)
      .setName(t('settings.codex.executablePath.name'))
      .setDesc(t('settings.codex.executablePath.desc'))
      .addText((text) => text
        .setPlaceholder(t('settings.codex.executablePath.placeholder'))
        .setValue(this.plugin.settings.backendSettings.codex.executablePath)
        .onChange(async (value) => {
          this.plugin.settings.backendSettings.codex.executablePath = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(bodyEl)
      .setName(t('settings.codex.reload.name'))
      .setDesc(t('settings.codex.reload.desc'))
      .addButton((button) => button
        .setButtonText(t('settings.codex.reload.button'))
        .onClick(async () => this.reloadOpenCodian()));
  }

  private async reloadOpenCodian(): Promise<void> {
    const plugins = (this.plugin.app as unknown as {
      plugins?: { reloadPlugin?: (pluginId: string) => Promise<void> };
    }).plugins;
    if (typeof plugins?.reloadPlugin !== 'function') {
      new Notice(t('settings.codex.reload.manual'));
      return;
    }

    try {
      await plugins.reloadPlugin(this.plugin.manifest.id);
    } catch {
      new Notice(t('settings.codex.reload.failed'));
    }
  }

  private renderRuntimeDefaultsGroup(bodyEl: HTMLElement): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--runtime',
      attr: { 'data-codex-group': 'runtime-defaults' },
    });

    const headerTextEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-header-text',
    });
    headerTextEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.groups.runtimeDefaults'),
    });
    headerTextEl.createDiv({
      cls: 'opencodian-settings-codex-group-desc',
      text: t('settings.codex.groups.runtimeDefaultsDesc'),
    });

    const controlsEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
      attr: { 'data-codex-group-controls': 'runtime-defaults' },
    });

    this.legacyCredentialControl.render(controlsEl);
    this.renderModelSetting(controlsEl);
    this.renderReasoningSetting(controlsEl);
    this.renderWebSearchSetting(controlsEl);
  }

  /**
   * Project configuration tab: manages `<vault-root>/.codex/config.toml` with
   * a common form + constrained advanced TOML editor. Reuses
   * ProjectResourceSecureWrite for CAS, archive, and conflict detection.
   */
  private renderProjectConfigGroup(bodyEl: HTMLElement): void {
    bodyEl.empty();
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--project-config',
      attr: { 'data-codex-group': 'project-config' },
    });

    const headerTextEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-header-text',
    });
    headerTextEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.projectConfig.title'),
    });
    headerTextEl.createDiv({
      cls: 'opencodian-settings-codex-group-desc',
      text: t('settings.codex.projectConfig.description'),
    });

    const stackEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
    });

    void this.renderProjectConfigForm(stackEl, bodyEl);
  }

  /** Clear and re-render the project config tab (Fix 8: no duplicate controls). */
  private refreshProjectConfigTab(bodyEl: HTMLElement): void {
    this.renderProjectConfigGroup(bodyEl);
  }

  /**
   * Canonical path.relative containment check + explicit confirmation for
   * vault-external additional_directories. Uses path.relative (NOT startsWith)
   * to avoid /vault-evil matching /vault. Returns true if safe/confirmed.
   */
  private confirmExternalDirectories(dirs: readonly string[]): boolean {
    if (dirs.length === 0) {
      return true;
    }
    const vaultPath = (this.plugin.app.vault.adapter as { getBasePath?: () => string }).getBasePath?.();
    if (!vaultPath) {
      return true;
    }
    // Use canonical realpaths — NOT lexical path.resolve — so that a symlink
    // inside the vault pointing to an external target is correctly detected.
    let canonicalVault: string;
    try {
      canonicalVault = realpathSync(path.resolve(vaultPath));
    } catch {
      canonicalVault = path.resolve(vaultPath);
    }
    const externalDirs = dirs.filter((d) => {
      const resolved = path.resolve(d);
      // If the path exists, canonicalize via realpath to catch symlink escape.
      let canonical: string;
      try {
        canonical = realpathSync(resolved);
      } catch {
        // Path doesn't exist yet or can't be canonicalized — fail conservatively
        // by treating it as external (require confirmation).
        return true;
      }
      const relative = path.relative(canonicalVault, canonical);
      return relative.startsWith('..') || path.isAbsolute(relative);
    });
    if (externalDirs.length === 0) {
      return true;
    }
    return window.confirm(t('settings.codex.projectConfig.externalDirConfirm', { count: String(externalDirs.length) }));
  }

  private async renderProjectConfigForm(containerEl: HTMLElement, bodyEl: HTMLElement): Promise<void> {
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-codex-project-config-status',
      text: t('settings.codex.projectConfig.loading'),
    });

    const readResult = await this.projectConfigSection.read();

    statusEl.empty();
    statusEl.setAttribute('data-project-config-state', readResult.status);

    if (readResult.status === 'invalid-path') {
      statusEl.setText(t('settings.codex.projectConfig.noVault'));
      return;
    }
    if (readResult.status === 'conflict') {
      statusEl.setText(t('settings.codex.projectConfig.conflictOnRead'));
      return;
    }
    if (readResult.status === 'read-failed') {
      statusEl.setText(t('settings.codex.projectConfig.readFailed'));
      return;
    }

    const isExisting = readResult.status === 'success';
    statusEl.setText(
      isExisting
        ? t('settings.codex.projectConfig.fileFound')
        : t('settings.codex.projectConfig.fileMissing'),
    );

    // Common form fields.
    const values = readResult.values;
    let model = values.model ?? '';
    let reasoningEffort = values.modelReasoningEffort ?? '';
    let sandboxMode = values.sandboxMode ?? '';
    let approvalPolicy = values.approvalPolicy ?? '';
    let additionalDirs = (values.additionalDirectories ?? []).join('\n');
    let networkAccess = values.networkAccess;
    let webSearch = values.webSearch;
    let advancedToml = readResult.content;

    const formEl = containerEl.createDiv({ cls: 'opencodian-codex-project-config-form' });

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldModel'))
      .setDesc(t('settings.codex.projectConfig.fieldModelDesc'))
      .addText((text) => {
        text.setValue(model);
        text.onChange((v) => { model = v; });
      });

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldReasoningEffort'))
      .setDesc(t('settings.codex.projectConfig.fieldReasoningEffortDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.codex.projectConfig.inherit'));
        for (const effort of ['minimal', 'low', 'medium', 'high', 'xhigh']) {
          dropdown.addOption(effort, effort);
        }
        dropdown.setValue(reasoningEffort);
        dropdown.onChange((v) => { reasoningEffort = v; });
      });

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldSandboxMode'))
      .setDesc(t('settings.codex.projectConfig.fieldSandboxModeDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.codex.projectConfig.inherit'));
        for (const mode of ['read-only', 'workspace-write', 'danger-full-access']) {
          dropdown.addOption(mode, mode);
        }
        dropdown.setValue(sandboxMode);
        dropdown.onChange((v) => { sandboxMode = v; });
      });

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldApprovalPolicy'))
      .setDesc(t('settings.codex.projectConfig.fieldApprovalPolicyDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.codex.projectConfig.inherit'));
        for (const policy of ['never', 'on-request', 'on-failure', 'untrusted']) {
          dropdown.addOption(policy, policy);
        }
        dropdown.setValue(approvalPolicy);
        dropdown      .onChange((v) => { approvalPolicy = v; });
      });

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldNetworkAccess'))
      .setDesc(t('settings.codex.projectConfig.fieldNetworkAccessDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.codex.projectConfig.inherit'));
        dropdown.addOption('true', t('settings.codex.projectConfig.enabled'));
        dropdown.addOption('false', t('settings.codex.projectConfig.disabled'));
        dropdown.setValue(networkAccess === null ? '' : String(networkAccess));
        dropdown.onChange((v) => { networkAccess = v === '' ? null : v === 'true'; });
      });

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldWebSearch'))
      .setDesc(t('settings.codex.projectConfig.fieldWebSearchDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.codex.projectConfig.inherit'));
        for (const mode of ['disabled', 'cached', 'live']) {
          dropdown.addOption(mode, mode);
        }
        dropdown.setValue(webSearch ?? '');
        dropdown.onChange((v) => { webSearch = v || null; });
      });

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldAdditionalDirectories'))
      .setDesc(t('settings.codex.projectConfig.fieldAdditionalDirectoriesDesc'))
      .addTextArea((text) => {
        text.setValue(additionalDirs);
        text.onChange((v) => { additionalDirs = v; });
      });

    // Advanced TOML editor.
    const advancedEl = containerEl.createDiv({ cls: 'opencodian-codex-project-config-advanced' });
    advancedEl.createEl('h5', {
      cls: 'opencodian-codex-project-config-advanced-title',
      text: t('settings.codex.projectConfig.advancedTitle'),
    });
    advancedEl.createDiv({
      cls: 'opencodian-codex-project-config-advanced-desc',
      text: t('settings.codex.projectConfig.advancedDesc'),
    });
    const tomlTextarea = advancedEl.createEl('textarea', {
      cls: 'opencodian-codex-project-config-toml-editor',
      attr: { spellcheck: 'false', rows: '12' },
    });
    tomlTextarea.value = advancedToml;
    tomlTextarea.addEventListener('change', () => { advancedToml = tomlTextarea.value; });

    // Save buttons.
    const actionsEl = containerEl.createDiv({ cls: 'opencodian-codex-project-config-actions' });
    const saveFormBtn = actionsEl.createEl('button', {
      cls: 'mod-cta',
      text: t('settings.codex.projectConfig.saveForm'),
      attr: { type: 'button' },
    });
    saveFormBtn.addEventListener('click', async () => {
      saveFormBtn.disabled = true;
      saveFormBtn.setText(t('settings.codex.projectConfig.saving'));
      try {
        const dirs = additionalDirs
          .split('\n')
          .map((d) => d.trim())
          .filter((d) => d.length > 0);
        // External directory confirmation using canonical path.relative containment
        // (NOT startsWith — /vault-evil must not match /vault).
        if (!this.confirmExternalDirectories(dirs)) {
          saveFormBtn.disabled = false;
          saveFormBtn.setText(t('settings.codex.projectConfig.saveForm'));
          return;
        }
        const result = await this.projectConfigSection.save(
          {
            model: model.trim() || null,
            modelReasoningEffort: reasoningEffort || null,
            sandboxMode: sandboxMode || null,
            approvalPolicy: approvalPolicy || null,
            networkAccess,
            webSearch,
            additionalDirectories: dirs.length > 0 ? dirs : null,
          },
          readResult.revision,
          dirs.length > 0 ? dirs : null,
        );
        if (result.status === 'success') {
          new Notice(t('settings.codex.projectConfig.saved'));
          this.refreshProjectConfigTab(bodyEl);
        } else {
          new Notice(t(`settings.codex.projectConfig.error.${result.status}` as never) || result.status);
        }
      } finally {
        saveFormBtn.disabled = false;
        saveFormBtn.setText(t('settings.codex.projectConfig.saveForm'));
      }
    });

    const saveAdvancedBtn = actionsEl.createEl('button', {
      text: t('settings.codex.projectConfig.saveAdvanced'),
      attr: { type: 'button' },
    });
    saveAdvancedBtn.addEventListener('click', async () => {
      saveAdvancedBtn.disabled = true;
      try {
        // Parse and confirm external dirs from advanced TOML too.
        const advancedValues = parseProjectConfigFormValues(advancedToml);
        const advancedDirs = advancedValues.additionalDirectories ?? [];
        if (!this.confirmExternalDirectories(advancedDirs)) {
          return;
        }
        const result = await this.projectConfigSection.saveAdvancedToml(advancedToml, readResult.revision);
        if (result.status === 'success') {
          new Notice(t('settings.codex.projectConfig.saved'));
          this.refreshProjectConfigTab(bodyEl);
        } else {
          new Notice(t(`settings.codex.projectConfig.error.${result.status}` as never) || result.status);
          // Render focused diagnostics for invalid-content (Fix 5).
          if (result.status === 'invalid-content' && result.diagnostics) {
            this.renderProjectConfigDiagnostics(advancedEl, result.diagnostics);
          }
        }
      } finally {
        saveAdvancedBtn.disabled = false;
      }
    });

    // History/restore button (Fix 6: protected archive history + restore).
    const historyBtn = actionsEl.createEl('button', {
      text: t('settings.codex.projectConfig.history'),
      attr: { type: 'button' },
    });
    historyBtn.addEventListener('click', () => {
      void this.openProjectConfigHistory(bodyEl, readResult.revision);
    });
  }

  /**
   * Render accessible, localized, focused diagnostics that identify rejected
   * keys/locations (Fix 5). Clears previous diagnostics before rendering.
   */
  private renderProjectConfigDiagnostics(
    container: HTMLElement,
    diagnostics: readonly CodexProjectConfigTomlDiagnostic[],
  ): void {
    const existing = container.querySelector('.opencodian-codex-project-config-diagnostics');
    if (existing) {
      existing.remove();
    }
    if (diagnostics.length === 0) {
      return;
    }
    const list = container.createDiv({
      cls: 'opencodian-codex-project-config-diagnostics',
      attr: { role: 'alert', 'aria-live': 'assertive' },
    });
    for (const diag of diagnostics) {
      const item = list.createDiv({
        cls: `opencodian-codex-project-config-diagnostic opencodian-codex-project-config-diagnostic--${diag.kind}`,
      });
      item.createSpan({
        cls: 'opencodian-codex-project-config-diagnostic-key',
        text: diag.key,
      });
      item.createSpan({
        cls: 'opencodian-codex-project-config-diagnostic-reason',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        text: t(diag.reasonKey as any, diag.params),
      });
    }
  }

  /**
   * Open a protected history modal showing archived project config entries.
   * Restore requires CAS (expectedRevision match) — stale revisions block
   * restore. Fix 6.
   */
  private async openProjectConfigHistory(
    bodyEl: HTMLElement,
    expectedRevision: import('../../core/agents/backend/ProjectResourceSecureWrite').FileRevision | null,
  ): Promise<void> {
    const modal = new Modal(this.plugin.app);
    modal.titleEl.setText(t('settings.codex.projectConfig.historyTitle'));
    modal.contentEl.addClass('opencodian-codex-project-config-history-modal');
    const bodyContent = modal.contentEl.createDiv({ cls: 'opencodian-codex-project-config-history-body' });
    bodyContent.createEl('p', { text: t('settings.codex.projectConfig.historyLoading') });

    modal.open();

    const entries = await this.projectConfigSection.listHistory();
    bodyContent.empty();

    if (!entries || entries.length === 0) {
      bodyContent.createEl('p', { text: t('settings.codex.projectConfig.historyEmpty') });
      return;
    }

    for (const entry of entries) {
      const row = bodyContent.createDiv({ cls: 'opencodian-codex-project-config-history-entry' });
      row.createSpan({
        cls: 'opencodian-codex-project-config-history-entry-kind',
        text: entry.archiveKind,
      });
      row.createSpan({
        cls: 'opencodian-codex-project-config-history-entry-date',
        text: new Date(entry.timestamp).toLocaleString(),
      });
      const restoreBtn = row.createEl('button', {
        text: t('settings.codex.projectConfig.restore'),
        attr: { type: 'button' },
      });
      restoreBtn.addEventListener('click', async () => {
        restoreBtn.disabled = true;
        if (window.confirm(t('settings.codex.projectConfig.restoreConfirm')) === false) {
          restoreBtn.disabled = false;
          return;
        }
        const result = await this.projectConfigSection.restoreEntry(
          entry.identity,
          expectedRevision,
        );
        if (result.status === 'success') {
          new Notice(t('settings.codex.projectConfig.restored'));
          modal.close();
          this.refreshProjectConfigTab(bodyEl);
        } else if (result.status === 'conflict') {
          new Notice(t('settings.codex.projectConfig.error.conflict'));
        } else {
          new Notice(t('settings.codex.projectConfig.error.write-failed'));
        }
        restoreBtn.disabled = false;
      });
    }
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

    const headerTextEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-header-text',
    });
    headerTextEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.groups.permissions'),
    });
    headerTextEl.createDiv({
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

    const headerTextEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-header-text',
    });
    headerTextEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.groups.resumeAndInspect'),
    });
    headerTextEl.createDiv({
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
