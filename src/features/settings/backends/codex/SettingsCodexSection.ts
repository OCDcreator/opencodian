/**
 * SettingsCodexSection — Codex backend settings panel.
 *
 * Task-oriented subtabs (backend settings refresh; legacy tab ids route):
 *   - conversation: model (live catalog), reasoning effort, web search,
 *     per-backend model overrides — the per-conversation defaults
 *   - permissions-safety: sandbox mode, approval policy, network access,
 *     additional writable directories (physically separated high-risk surface)
 *   - account: auth source, account/usage surfaces, cost estimate row
 *   - resources: session resume/inspect readbacks, skills/agents resources,
 *     plugins
 *   - connection: connection summary, CLI path override (high-risk, separated
 *     from model settings), legacy credential control, and the project
 *     config.toml workbench with protected archive history
 *
 * Legacy secondary tab ids (model, permissions, project-config,
 * resume-inspect, plugins) route onto the task pages above so saved layouts
 * and deep links keep working. Every editable row carries honest
 * scope/effect/risk metadata; thread-scoped values apply at the NEXT thread
 * boundary (adapter mutators), and executablePath/apiKey need a plugin reload.
 *
 * The old disabled "Authentication" setting is replaced by a lightweight
 * connection summary and the Account surface auth-source row, so the UI never
 * presents a disabled input as a status indicator.
 */
/* eslint-disable max-lines -- Codex settings own connection, permissions, account, and inspection controls behind one tabbed section owner. */

import { realpathSync } from 'node:fs';
import path from 'node:path';

import { DropdownComponent, Modal, Notice, Setting } from 'obsidian';

import type { CodexModelSummary } from '../../../../core/agents/backend/codex/CodexAdapter';
import type { CodexApprovalPolicy, CodexReasoningEffort, CodexWebSearchMode } from '../../../../core/types/settings';
import {
  getDefaultBackendSettings,
  getDefaultCodexBackendSettings,
} from '../../../../core/types/settings';
import { t, type TranslationKey } from '../../../../i18n';
import type OpenCodianPlugin from '../../../../main';
import {
  addBackendChoiceSetting,
  describeBackendSetting,
} from '../../controls/BackendSettingsControls';
import { SettingsInlineEditSection } from '../../general/SettingsInlineEditSection';
import { renderCostEstimateSettingsRow } from '../opencode/CostEstimateSettingsRow';
import {
  type CodexProjectConfigTomlDiagnostic,
  isCliRetiredCodexProjectApprovalPolicy,
  isGuidedCodexProjectApprovalPolicy,
} from './CodexProjectConfigFormModel';
import { parseProjectConfigFormValues } from './CodexProjectConfigFormModel';
import { SettingsCodexAccountSurface } from './SettingsCodexAccountSurface';
import { SettingsCodexLegacyCredentialControl } from './SettingsCodexLegacyCredentialControl';
import { SettingsCodexPluginsSection } from './SettingsCodexPluginsSection';
import { SettingsCodexProjectConfigSection } from './SettingsCodexProjectConfigSection';
import { SettingsCodexReadbackControls } from './SettingsCodexReadbackControls';
import { SettingsCodexResourcesSection } from './SettingsCodexResourcesSection';

export interface SettingsCodexSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (containerEl: HTMLElement, title: string, tooltip?: string) => HTMLHeadingElement;
}

/**
 * Task-oriented subtab ids; legacy ids route onto these pages (see
 * CODEX_LEGACY_TAB_ROUTES) so existing layouts and deep links keep working.
 */
const CODEX_TASK_TABS = [
  'connection',
  'conversation',
  'permissions-safety',
  'account',
  'resources',
] as const;

type CodexTaskTabId = (typeof CODEX_TASK_TABS)[number];

const CODEX_TASK_TAB_LABEL_KEYS: Record<CodexTaskTabId, TranslationKey> = {
  conversation: 'settings.backend.tabs.conversation',
  'permissions-safety': 'settings.backend.tabs.permissionsSafety',
  account: 'settings.codex.tab.account',
  resources: 'settings.backend.tabs.resources',
  connection: 'settings.backend.tabs.connection',
};

/**
 * Legacy secondary tab id → task page. Preserved via routes so an old saved
 * tab id still renders the same capabilities on the reorganized page.
 */
const CODEX_LEGACY_TAB_ROUTES: Record<string, CodexTaskTabId> = {
  model: 'conversation',
  permissions: 'permissions-safety',
  'project-config': 'connection',
  'resume-inspect': 'resources',
  plugins: 'resources',
};

function resolveCodexTaskTabId(candidate: string): CodexTaskTabId {
  if ((CODEX_TASK_TABS as readonly string[]).includes(candidate)) {
    return candidate as CodexTaskTabId;
  }
  return CODEX_LEGACY_TAB_ROUTES[candidate] ?? 'connection';
}

export class SettingsCodexSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsCodexSectionOptions['createSectionHeading'];
  private readonly readbackControls: SettingsCodexReadbackControls;
  private readonly accountSurface: SettingsCodexAccountSurface;
  private readonly legacyCredentialControl: SettingsCodexLegacyCredentialControl;
  private readonly resourcesSurface: SettingsCodexResourcesSection;
  private readonly pluginsSurface: SettingsCodexPluginsSection;
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
      onAfterMutation: () => this.invalidateCodexRuntimeCatalogs(),
    });
    this.pluginsSurface = new SettingsCodexPluginsSection({
      plugin: this.plugin,
      createSectionHeading: options.createSectionHeading,
      onAfterMutation: () => this.invalidateCodexRuntimeCatalogs(),
    });
    this.projectConfigSection = new SettingsCodexProjectConfigSection({ plugin: this.plugin });
  }

  /**
   * After a Codex resource/plugin mutation, invalidate the chat slash-command
   * menu catalog so the next `/` or `$` open reflects changes immediately
   * (not via skills/changed or the 120s TTL). Runtime skills/list remains the
   * final menu truth. The app-server does not always emit `skills/changed`
   * for files the plugin wrote itself, so force the next runtime skills/list
   * to bypass the server cache. One-shot; normal menu opens keep caching.
   */
  private invalidateCodexRuntimeCatalogs(): void {
    this.plugin.invalidateSlashCommandCatalog();
    const adapter = this.plugin.agentServiceRegistry?.get('codex') as {
      forceNextRuntimeSkillsReload?(): void;
    } | undefined;
    adapter?.forceNextRuntimeSkillsReload?.();
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
    for (const tabId of CODEX_TASK_TABS) {
      containerEl.createEl('h3', {
        cls: 'opencodian-settings-subheading',
        text: t(CODEX_TASK_TAB_LABEL_KEYS[tabId]),
      });
      this.renderTabContent(containerEl, tabId);
    }
    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.renderTabContent(containerEl, secondaryTabId);
  }

  // ─── Tab content ────────────────────────────────────────────────

  private renderTabContent(containerEl: HTMLElement, secondaryTabId: string): void {
    const requestedTabId = secondaryTabId || 'connection';
    const resolvedTabId = resolveCodexTaskTabId(requestedTabId);

    // Ensure codex settings object exists
    this.plugin.settings.backendSettings ??= getDefaultBackendSettings();
    this.plugin.settings.backendSettings.codex ??= getDefaultCodexBackendSettings();

    // Resources and plugins render as independent per-group cards with no
    // enclosing section card, keeping global-readonly / project-editable /
    // empty-state semantics. A borderless host preserves settings targeting.
    if (resolvedTabId === 'resources') {
      const resourcesHost = containerEl.createDiv({
        attr: {
          'data-settings-surface': 'section',
          'data-settings-target': `codex-${requestedTabId}`,
          'data-codex-section': resolvedTabId,
        },
      });
      // The resources page merges what used to be three tabs. Each surface
      // owns its host exclusively (they empty() their host on every render and
      // refresh), so they get dedicated sub-hosts and never wipe each other.
      const inspectHost = resourcesHost.createDiv({
        attr: { 'data-codex-resources-page-area': 'resume-inspect' },
      });
      const skillsHost = resourcesHost.createDiv({
        attr: { 'data-codex-resources-page-area': 'resources' },
      });
      const pluginsHost = resourcesHost.createDiv({
        attr: { 'data-codex-resources-page-area': 'plugins' },
      });
      this.renderResumeAndInspectGroup(inspectHost);
      this.resourcesSurface.render(skillsHost);
      this.pluginsSurface.render(pluginsHost);
      return;
    }

    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-settings-codex-block',
      attr: {
        'data-settings-surface': 'section',
        'data-settings-target': `codex-${requestedTabId}`,
        'data-codex-section': resolvedTabId,
      },
    });

    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });

    if (resolvedTabId === 'permissions-safety') {
      this.renderPermissionsGroup(bodyEl);
      return;
    }

    if (resolvedTabId === 'account') {
      this.renderAccountAndStatusGroup(bodyEl);
      return;
    }

    if (resolvedTabId === 'conversation') {
      this.renderConversationTab(bodyEl);
      return;
    }

    // Default / 'connection': connection summary + CLI path override (high
    // risk, physically separated from model settings) + credentials + the
    // project config.toml workbench with its protected archive history.
    this.renderConnectionSummary(bodyEl);
    this.renderCliLifecycleControls(bodyEl);
    this.legacyCredentialControl.render(bodyEl);
    this.renderProjectConfigGroup(bodyEl);
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
    const executableSetting = new Setting(bodyEl)
      .setName(t('settings.codex.executablePath.name'))
      .setDesc(t('settings.codex.executablePath.desc'))
      .addText((text) => text
        .setPlaceholder(t('settings.codex.executablePath.placeholder'))
        .setValue(this.plugin.settings.backendSettings.codex.executablePath)
        .onChange(async (value) => {
          this.plugin.settings.backendSettings.codex.executablePath = value.trim();
          await this.plugin.saveSettings();
        }));
    // CLI path overrides are resolved once at adapter start: changes need a
    // plugin reload, and the field deliberately lives on the connection page,
    // never next to conversation model settings.
    describeBackendSetting(executableSetting, {
      key: 'codex.executablePath',
      scope: 'vault',
      effect: 'restart',
      risk: 'medium',
      defaultLabel: t('settings.backendRefresh.default.autoDiscover'),
      source: t('settings.backendRefresh.source.pluginVaultSetting'),
    });

    new Setting(bodyEl)
      .setName(t('settings.codex.reload.name'))
      .setDesc(t('settings.codex.reload.desc'))
      .addButton((button) => button
        .setButtonText(t('settings.codex.reload.button'))
        .onClick(async () => this.reloadOpenCodian()));
  }

  private async reloadOpenCodian(): Promise<void> {
    const plugins = (this.plugin.app as unknown as {
      plugins?: {
        reloadPlugin?: (pluginId: string) => Promise<void>;
        unloadPlugin?: (pluginId: string) => void | Promise<void>;
        loadPlugin?: (pluginId: string) => Promise<boolean | void>;
      };
    }).plugins;
    const reload = plugins?.reloadPlugin;
    const unload = plugins?.unloadPlugin;
    const load = plugins?.loadPlugin;
    if (typeof reload !== 'function' && (typeof unload !== 'function' || typeof load !== 'function')) {
      new Notice(t('settings.codex.reload.manual'));
      return;
    }

    try {
      // Persist the current executable before the running plugin is unloaded.
      await this.plugin.saveSettings();
      if (typeof reload === 'function') {
        await reload.call(plugins, this.plugin.manifest.id);
      } else if (typeof unload === 'function' && typeof load === 'function') {
        // Current Obsidian hosts expose this pair instead of reloadPlugin.
        await unload.call(plugins, this.plugin.manifest.id);
        if (await load.call(plugins, this.plugin.manifest.id) === false) {
          throw new Error('OpenCodian was not loaded by the host');
        }
      }
    } catch {
      new Notice(t('settings.codex.reload.failed'));
    }
  }

  /**
   * Conversation defaults page: live-catalog model picker, reasoning effort,
   * web search, and the per-backend inline-edit/completion model overrides.
   * All thread-scoped values apply at the next thread boundary.
   */
  private renderConversationTab(bodyEl: HTMLElement): void {
    const groupEl = bodyEl.createDiv({
      cls: 'opencodian-settings-codex-group opencodian-settings-codex-group--runtime',
      attr: { 'data-codex-group': 'runtime-defaults' },
    });

    const headerTextEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-header-text',
    });
    headerTextEl.createEl('h4', {
      cls: 'opencodian-settings-codex-group-title',
      text: t('settings.codex.groups.conversationDefaults'),
    });
    headerTextEl.createDiv({
      cls: 'opencodian-settings-codex-group-desc',
      text: t('settings.codex.groups.conversationDefaultsDesc'),
    });

    const controlsEl = groupEl.createDiv({
      cls: 'opencodian-settings-codex-group-controls opencodian-settings-codex-group-stack',
      attr: { 'data-codex-group-controls': 'runtime-defaults' },
    });

    this.renderModelSetting(controlsEl);
    this.renderReasoningSetting(controlsEl);
    this.renderWebSearchSetting(controlsEl);
    SettingsInlineEditSection.renderBackendModelOverrides(bodyEl, 'codex', this.plugin);
  }

  /**
   * Project configuration tab: manages `<vault-root>/.codex/config.toml` with
   * a common form + constrained advanced TOML editor. Reuses
   * ProjectResourceSecureWrite for CAS, archive, and conflict detection.
   */
  private renderProjectConfigGroup(bodyEl: HTMLElement): void {
    // A dedicated host keeps the project-config workbench self-contained: the
    // connection page renders the summary/CLI/credential rows into the same
    // body first, so refreshes must empty ONLY this host, never the page body.
    let configHost = bodyEl.querySelector<HTMLElement>('[data-codex-project-config-host]');
    if (!configHost) {
      configHost = bodyEl.createDiv({
        cls: 'opencodian-settings-codex-project-config-host',
        attr: { 'data-codex-project-config-host': 'true' },
      });
    }
    configHost.empty();
    const groupEl = configHost.createDiv({
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

    void this.renderProjectConfigForm(stackEl, configHost);
  }

  /**
   * Guided approval_policy field for the project config form. Offers only the
   * supported policies plus inherit; a legacy value already in the file (the
   * CLI-retired 'untrusted', or a CLI-valid policy outside the plugin bridge
   * such as 'on-failure') is preserved verbatim: it appears as a marked option
   * and the form save never rewrites it — repair requires an explicit pick.
   * `state.value` mirrors the form's mutable value ('' is the inherit
   * sentinel, matching the initial parse).
   */
  private renderProjectConfigApprovalField(formEl: HTMLElement, state: { value: string }): void {
    const approvalPreservedEl = formEl.createDiv({
      cls: 'opencodian-codex-project-config-approval-preserved',
      attr: { 'data-project-config-approval-preserved': 'true', role: 'status' },
    });
    const renderApprovalPreservedNotice = (): void => {
      approvalPreservedEl.empty();
      // '' is the inherit sentinel in this form (matches the initial parse).
      if (state.value === '') {
        return;
      }
      if (isGuidedCodexProjectApprovalPolicy(state.value)) {
        return;
      }
      const retired = isCliRetiredCodexProjectApprovalPolicy(state.value || null);
      approvalPreservedEl.createEl('p', {
        cls: 'opencodian-codex-project-config-approval-preserved-text',
        // Keys ship in .tmp/backend-refresh-ui/claude-codex-locales.json;
        // cast until the i18n union lands (pending-key contract with parent).
        text: t((retired
          ? 'settings.codex.projectConfig.approvalPolicy.retiredNotice'
          : 'settings.codex.projectConfig.approvalPolicy.unguidedNotice') as TranslationKey, { value: state.value }),
      });
    };

    new Setting(formEl)
      .setName(t('settings.codex.projectConfig.fieldApprovalPolicy'))
      .setDesc(t('settings.codex.projectConfig.fieldApprovalPolicyDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.codex.projectConfig.inherit'));
        dropdown.addOption('never', 'never');
        dropdown.addOption('on-request', 'on-request');
        // Preserve a non-guided value read from the file as a marked option
        // instead of silently snapping the dropdown to a default.
        const guidedValues = ['', 'never', 'on-request'];
        if (!guidedValues.includes(state.value)) {
          const suffixKey = isCliRetiredCodexProjectApprovalPolicy(state.value || null)
            ? 'settings.codex.projectConfig.approvalPolicy.retiredOptionSuffix'
            : 'settings.codex.projectConfig.approvalPolicy.unguidedOptionSuffix';
          dropdown.addOption(state.value, t(suffixKey, { value: state.value }));
        }
        dropdown.setValue(state.value);
        dropdown.onChange((v) => {
          state.value = v;
          renderApprovalPreservedNotice();
        });
      });
    renderApprovalPreservedNotice();
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
    const approvalState = { value: values.approvalPolicy ?? '' };
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
        for (const effort of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'persistent']) {
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

    this.renderProjectConfigApprovalField(formEl, approvalState);

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
            approvalPolicy: approvalState.value || null,
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
    expectedRevision: import('../../../../core/agents/backend/configuration/ProjectResourceSecureWrite').FileRevision | null,
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
    const rawPolicy = this.plugin.settings.backendSettings.codex.approvalPolicy;
    // The load-time normalizer migrates retired 'untrusted' to 'on-request';
    // mirror that here so a raw persisted value still displays sanely.
    const effectivePolicy: CodexApprovalPolicy = rawPolicy === 'untrusted' ? 'on-request' : rawPolicy;
    addBackendChoiceSetting(bodyEl, {
      key: 'codex.approvalPolicy',
      name: t('settings.codex.approvalPolicy.name'),
      description: t('settings.codex.approvalPolicy.desc'),
      value: effectivePolicy,
      options: [
        { value: 'inherit', label: t('settings.codex.approvalPolicy.inherit'), recommended: true },
        { value: 'on-request', label: t('settings.codex.approvalPolicy.onRequest') },
        { value: 'never', label: t('settings.codex.approvalPolicy.never') },
      ],
      onChange: async (value) => {
        const previous = this.plugin.settings.backendSettings.codex.approvalPolicy;
        this.plugin.settings.backendSettings.codex.approvalPolicy = value as CodexApprovalPolicy;
        try {
          await this.plugin.saveSettings();
        } catch (error) {
          this.plugin.settings.backendSettings.codex.approvalPolicy = previous;
          throw error;
        }
        // Runtime apply runs only after a successful save; the shared choice
        // control repaints the committed value when persistence fails.
        this.applyCodexRuntimeUpdates();
      },
      presentation: {
        scope: 'vault',
        effect: 'new-session',
        risk: 'high',
        defaultLabel: t('settings.codex.approvalPolicy.inherit'),
        source: t('settings.backendRefresh.source.pluginVaultSetting'),
      },
    });
  }

  private renderModelSetting(bodyEl: HTMLElement): void {
    const modelSetting = new Setting(bodyEl)
      .setName(t('settings.codex.model.name'))
      .setDesc(t('settings.codex.model.desc'));
    // The searchable dropdown is populated from the live adapter catalog
    // (getModelList); a saved id absent from today's catalog falls back to the
    // custom text input so unknown values stay visible and preserved.
    describeBackendSetting(modelSetting, {
      key: 'codex.model',
      scope: 'vault',
      effect: 'new-session',
      risk: 'medium',
      defaultLabel: t('settings.backendRefresh.default.empty'),
      source: t('settings.backendRefresh.source.pluginVaultSetting'),
    });

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
    addBackendChoiceSetting(bodyEl, {
      key: 'codex.sandboxMode',
      name: t('settings.codex.sandbox.name'),
      description: t('settings.codex.sandbox.desc'),
      value: this.plugin.settings.backendSettings.codex.sandboxMode,
      options: [
        { value: 'read-only', label: t('settings.codex.sandbox.readOnly') },
        { value: 'workspace-write', label: t('settings.codex.sandbox.workspaceWrite'), recommended: true },
        { value: 'danger-full-access', label: t('settings.codex.sandbox.dangerFullAccess') },
      ],
      onChange: async (value) => {
        const previous = this.plugin.settings.backendSettings.codex.sandboxMode;
        this.plugin.settings.backendSettings.codex.sandboxMode = value as 'read-only' | 'workspace-write' | 'danger-full-access';
        try {
          await this.plugin.saveSettings();
        } catch (error) {
          this.plugin.settings.backendSettings.codex.sandboxMode = previous;
          throw error;
        }
        this.applyCodexRuntimeUpdates();
      },
      presentation: {
        scope: 'vault',
        effect: 'new-session',
        risk: 'high',
        defaultLabel: t('settings.codex.sandbox.workspaceWrite'),
        source: t('settings.backendRefresh.source.pluginVaultSetting'),
      },
    });
  }

  private renderReasoningSetting(bodyEl: HTMLElement): void {
    const efforts: Array<{ id: CodexReasoningEffort; labelKey: TranslationKey }> = [
      { id: 'minimal', labelKey: 'settings.codex.reasoning.minimal' },
      { id: 'low', labelKey: 'settings.codex.reasoning.low' },
      { id: 'medium', labelKey: 'settings.codex.reasoning.medium' },
      { id: 'high', labelKey: 'settings.codex.reasoning.high' },
      { id: 'xhigh', labelKey: 'settings.codex.reasoning.xhigh' },
      { id: 'max', labelKey: 'settings.codex.reasoning.max' },
      { id: 'ultra', labelKey: 'settings.codex.reasoning.ultra' },
      { id: 'persistent', labelKey: 'settings.codex.reasoning.persistent' },
    ];
    addBackendChoiceSetting(bodyEl, {
      key: 'codex.modelReasoningEffort',
      name: t('settings.codex.reasoning.name'),
      description: t('settings.codex.reasoning.desc'),
      value: this.plugin.settings.backendSettings.codex.modelReasoningEffort,
      options: efforts.map((effort) => ({
        value: effort.id,
        label: t(effort.labelKey),
        recommended: effort.id === 'medium',
      })),
      onChange: async (value) => {
        const previous = this.plugin.settings.backendSettings.codex.modelReasoningEffort;
        this.plugin.settings.backendSettings.codex.modelReasoningEffort = value as CodexReasoningEffort;
        try {
          await this.plugin.saveSettings();
        } catch (error) {
          this.plugin.settings.backendSettings.codex.modelReasoningEffort = previous;
          throw error;
        }
        this.applyCodexRuntimeUpdates();
      },
      presentation: {
        scope: 'vault',
        effect: 'new-session',
        risk: 'low',
        defaultLabel: t('settings.codex.reasoning.medium'),
        source: t('settings.backendRefresh.source.pluginVaultSetting'),
      },
    });
  }

  private renderAdditionalDirectoriesSetting(bodyEl: HTMLElement): void {
    const setting = new Setting(bodyEl)
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
    describeBackendSetting(setting, {
      key: 'codex.additionalDirectories',
      scope: 'vault',
      effect: 'new-session',
      risk: 'medium',
      defaultLabel: t('settings.backendRefresh.default.empty'),
      source: t('settings.backendRefresh.source.pluginVaultSetting'),
    });
  }

  private renderNetworkAccessSetting(bodyEl: HTMLElement): void {
    const setting = new Setting(bodyEl)
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
    describeBackendSetting(setting, {
      key: 'codex.networkAccessEnabled',
      scope: 'vault',
      effect: 'new-session',
      risk: 'medium',
      defaultLabel: t('settings.backendRefresh.default.off'),
      source: t('settings.backendRefresh.source.pluginVaultSetting'),
    });
  }

  private renderWebSearchSetting(bodyEl: HTMLElement): void {
    addBackendChoiceSetting(bodyEl, {
      key: 'codex.webSearchMode',
      name: t('settings.codex.webSearch.name'),
      description: t('settings.codex.webSearch.desc'),
      value: this.plugin.settings.backendSettings.codex.webSearchMode,
      options: [
        { value: 'disabled', label: t('settings.codex.webSearch.disabled') },
        { value: 'cached', label: t('settings.codex.webSearch.cached'), recommended: true },
        { value: 'live', label: t('settings.codex.webSearch.live') },
      ],
      onChange: async (value) => {
        const previous = this.plugin.settings.backendSettings.codex.webSearchMode;
        this.plugin.settings.backendSettings.codex.webSearchMode = value as CodexWebSearchMode;
        try {
          await this.plugin.saveSettings();
        } catch (error) {
          this.plugin.settings.backendSettings.codex.webSearchMode = previous;
          throw error;
        }
        this.applyCodexRuntimeUpdates();
      },
      presentation: {
        scope: 'vault',
        effect: 'new-session',
        risk: 'low',
        defaultLabel: t('settings.codex.webSearch.cached'),
        source: t('settings.backendRefresh.source.pluginVaultSetting'),
      },
    });
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

  /**
   * Public reapply hook for the common recovery shell: after the parent
   * Object.assigns restored defaults onto the live backendSettings.codex
   * object (identity preserved), this pushes the thread-scoped values into
   * the running adapter via the existing update* mutators, in the save-time
   * application order. Takes effect at the NEXT thread start/resume; cached
   * threads are not retroactively affected. executablePath/apiKey are NOT
   * runtime-updatable — the shell must label those as requiring reload.
   */
  reapplyRuntimeUpdates(): void {
    this.applyCodexRuntimeUpdates();
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

    // Inherit is the explicit first choice: an empty saved model means the
    // Codex CLI picks its own default, and the selector must show that.
    dropdown.addOption('', t('settings.codex.model.inheritOption' as TranslationKey));

    if (models && models.length > 0) {
      for (const model of models) {
        dropdown.addOption(model.slug, model.display_name || model.slug);
      }
    }

    dropdown.addOption('__custom__', t('settings.codex.model.customOption'));

    // Preserve an unknown saved id: it stays selectable as a marked option so
    // the saved value is never silently replaced by the custom placeholder.
    const isKnownModel = models?.some((m) => m.slug === currentModel) ?? false;
    const isPreservedUnknown = currentModel !== ''
      && currentModel !== '__custom__'
      && !isKnownModel;
    if (isPreservedUnknown) {
      dropdown.addOption(
        currentModel,
        t('settings.codex.model.unlistedOption' as TranslationKey, { value: currentModel }),
      );
    }

    if (currentModel === '' || isKnownModel || isPreservedUnknown) {
      dropdown.setValue(currentModel);
      if (customInputEl) {
        customInputEl.style.display = 'none';
        customInputEl.value = isPreservedUnknown ? currentModel : '';
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
