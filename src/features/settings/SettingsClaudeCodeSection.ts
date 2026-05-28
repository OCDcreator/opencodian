/**
 * Claude Code settings section.
 *
 * Renders backend-specific settings across multiple secondary tabs:
 *   - Runtime: executable path, environment hint, diagnostics
 *   - Model & Thinking: model, fallback model, thinking type/budget, effort, max turns, budget
 *   - Permissions: permission mode
 *   - Context & Sources: setting sources, additional directories
 *   - Tools: allowed/disallowed tool names
 *
 * The Model & Thinking tab includes the next-query/restart boundary notice
 * because max-turns and max-budget changes only take effect on the next query.
 *
 * Only controls backed by real adapter wiring and focused tests are exposed
 * as editable. Unverified capabilities remain hidden or read-only.
 */
/* eslint-disable max-lines -- Claude Code settings keeps cross-layout tab rendering and persistence controls co-located for auditability. */

import { Setting } from 'obsidian';

import {
  type ClaudeCodeProcessResolution,
  type ClaudeCodeProcessResolverOptions,
  resolveClaudeCodeProcess,
} from '../../core/agents/backend/ClaudeCodeProcessResolver';
import {
  type ClaudeCodeEffort,
  type ClaudeCodePermissionMode,
  type ClaudeCodeSettingSource,
  type ClaudeCodeThinking,
  getDefaultClaudeCodeBackendSettings,
} from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';

interface SettingsClaudeCodeSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  resolveProcess?: (options: ClaudeCodeProcessResolverOptions) => ClaudeCodeProcessResolution;
}

const CLAUDE_SETTING_SOURCES: Array<{ id: ClaudeCodeSettingSource; labelKey: TranslationKey; descKey: TranslationKey }> = [
  { id: 'user', labelKey: 'settings.claudeCode.settingSources.user', descKey: 'settings.claudeCode.settingSources.user.desc' },
  { id: 'project', labelKey: 'settings.claudeCode.settingSources.project', descKey: 'settings.claudeCode.settingSources.project.desc' },
  { id: 'local', labelKey: 'settings.claudeCode.settingSources.local', descKey: 'settings.claudeCode.settingSources.local.desc' },
];

const CLAUDE_PERMISSION_MODES: Array<{ id: ClaudeCodePermissionMode; labelKey: TranslationKey }> = [
  { id: 'default', labelKey: 'settings.claudeCode.permissionMode.default' },
  { id: 'acceptEdits', labelKey: 'settings.claudeCode.permissionMode.acceptEdits' },
  { id: 'bypassPermissions', labelKey: 'settings.claudeCode.permissionMode.bypassPermissions' },
  { id: 'plan', labelKey: 'settings.claudeCode.permissionMode.plan' },
];

const CLAUDE_THINKING_TYPES: Array<{ id: ClaudeCodeThinking['type']; labelKey: TranslationKey }> = [
  { id: 'adaptive', labelKey: 'settings.claudeCode.thinking.adaptive' },
  { id: 'disabled', labelKey: 'settings.claudeCode.thinking.disabled' },
  { id: 'fixed', labelKey: 'settings.claudeCode.thinking.fixed' },
];

const CLAUDE_EFFORT_LEVELS: Array<{ id: ClaudeCodeEffort; labelKey: TranslationKey }> = [
  { id: 'low', labelKey: 'settings.claudeCode.effort.low' },
  { id: 'medium', labelKey: 'settings.claudeCode.effort.medium' },
  { id: 'high', labelKey: 'settings.claudeCode.effort.high' },
  { id: 'xhigh', labelKey: 'settings.claudeCode.effort.xhigh' },
  { id: 'max', labelKey: 'settings.claudeCode.effort.max' },
];

const CLAUDE_PROJECT_SOURCE_FILES = [
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/settings.local.json',
] as const;

const CLAUDE_CLASSIC_TABS = [
  'runtime',
  'model-thinking',
  'permissions',
  'context-sources',
  'tools',
] as const;

const CLAUDE_TAB_LABEL_KEYS: Record<typeof CLAUDE_CLASSIC_TABS[number], TranslationKey> = {
  runtime: 'settings.claudeCode.tab.runtime',
  'model-thinking': 'settings.claudeCode.tab.modelThinking',
  permissions: 'settings.claudeCode.tab.permissions',
  'context-sources': 'settings.claudeCode.tab.contextSources',
  tools: 'settings.claudeCode.tab.tools',
};

export class SettingsClaudeCodeSection {
  private readonly plugin: OpenCodianPlugin;
  private readonly createSectionHeading: SettingsClaudeCodeSectionOptions['createSectionHeading'];
  private readonly resolveProcess: (options: ClaudeCodeProcessResolverOptions) => ClaudeCodeProcessResolution;
  private cachedModelCatalog: Array<{ id: string; name: string; provider: string }> | null = null;
  private modelCatalogLoadPromise: Promise<Array<{ id: string; name: string; provider: string }>> | null = null;

  constructor(options: SettingsClaudeCodeSectionOptions) {
    this.plugin = options.plugin;
    this.createSectionHeading = options.createSectionHeading;
    this.resolveProcess = options.resolveProcess ?? resolveClaudeCodeProcess;
  }

  attach(containerEl: HTMLElement): HTMLHeadingElement {
    const headingEl = this.createSectionHeading(
      containerEl,
      t('settings.claudeCode.title'),
      t('settings.claudeCode.desc'),
    );
    for (const tabId of CLAUDE_CLASSIC_TABS) {
      this.renderTabContent(containerEl, tabId, { showSubheading: true });
    }
    return headingEl;
  }

  attachTabbed(containerEl: HTMLElement, secondaryTabId: string): void {
    this.renderTabContent(containerEl, secondaryTabId);
  }

  // ─── Tab routing ──────────────────────────────────────────────────

  private renderTabContent(
    containerEl: HTMLElement,
    tabId: string,
    options: { showSubheading?: boolean } = {},
  ): void {
    const blockEl = containerEl.createDiv({
      cls: 'opencodian-settings-block opencodian-settings-section opencodian-settings-claude-code-block',
      attr: {
        'data-settings-surface': 'section',
        'data-settings-target': `claude-code-${tabId}`,
        'data-claude-code-section': tabId,
      },
    });
    if (options.showSubheading && this.isKnownClaudeTabId(tabId)) {
      blockEl.createEl('h3', {
        cls: 'opencodian-settings-subheading',
        text: t(CLAUDE_TAB_LABEL_KEYS[tabId]),
      });
    }
    const bodyEl = blockEl.createDiv({
      cls: 'opencodian-settings-block-body opencodian-settings-section-body',
      attr: { 'data-settings-surface': 'section-body' },
    });

    switch (tabId) {
      case 'model-thinking':
        this.renderModelThinkingTab(bodyEl);
        break;
      case 'permissions':
        this.renderPermissionsTab(bodyEl);
        break;
      case 'context-sources':
        this.renderContextSourcesTab(bodyEl);
        break;
      case 'tools':
        this.renderToolsTab(bodyEl);
        break;
      default:
        this.renderRuntimeTab(bodyEl);
        break;
    }
  }

  // ─── Runtime tab ──────────────────────────────────────────────────

  private renderRuntimeTab(containerEl: HTMLElement): void {
    this.renderRuntimeBoundaryNotice(containerEl);
    this.renderExecutableSetting(containerEl);
    this.renderEnvironmentHint(containerEl);
    this.renderDiagnostics(containerEl);
    this.renderEnvProofStatusNotice(containerEl);
    this.renderEnvironmentVariablesSetting(containerEl);
  }

  private renderExecutableSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.executablePath.name'))
      .setDesc(t('settings.claudeCode.executablePath.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.executablePath.placeholder'))
          .setValue(this.settings.executablePath)
          .onChange(async (value) => {
            this.settings.executablePath = value.trim();
            await this.saveSettings();
          });
      });
  }

  private renderEnvironmentHint(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.environment.name'))
      .setDesc(t('settings.claudeCode.environment.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.environment.status'))
          .setDisabled(true);
      });
  }

  private renderDiagnostics(containerEl: HTMLElement): void {
    const resultEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-diagnostics-result',
      text: t('settings.claudeCode.diagnostics.idle'),
    });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.diagnostics.name'))
      .setDesc(t('settings.claudeCode.diagnostics.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.diagnostics.button'))
          .onClick(() => {
            const resolution = this.resolveProcess({ settings: this.settings });
            resultEl.setText(this.formatDiagnostics(resolution));
          });
      });
  }

  // ─── Model & Thinking tab ─────────────────────────────────────────

  private renderModelThinkingTab(containerEl: HTMLElement): void {
    const modelTextControl = this.renderModelSetting(containerEl);
    this.renderModelQuickSelect(containerEl, modelTextControl);
    const fallbackTextControl = this.renderFallbackModelSetting(containerEl);
    this.renderFallbackModelQuickSelect(containerEl, fallbackTextControl);
    this.renderFallbackModelBoundaryNotice(containerEl);
    this.renderThinkingSetting(containerEl);
    if (this.settings.thinking.type === 'fixed') {
      this.renderThinkingBudgetSetting(containerEl);
    }
    this.renderEffortSetting(containerEl);
    this.renderLimitsProofStatusNotice(containerEl);
    this.renderLimitsBoundaryNotice(containerEl);
    this.renderMaxTurnsSetting(containerEl);
    this.renderMaxBudgetSetting(containerEl);
  }

  private renderModelSetting(containerEl: HTMLElement): unknown {
    let textControl: unknown = null;
    new Setting(containerEl)
      .setName(t('settings.claudeCode.model.name'))
      .setDesc(t('settings.claudeCode.model.desc'))
      .addText((text) => {
        textControl = text;
        text
          .setPlaceholder(t('settings.claudeCode.model.placeholder'))
          .setValue(this.settings.model)
          .onChange(async (value) => {
            const model = value.trim();
            this.settings.model = model;
            await this.applyClaudeModel(model || undefined).catch(() => undefined);
            await this.saveSettings();
          });
      });
    return textControl;
  }

  private renderFallbackModelSetting(containerEl: HTMLElement): unknown {
    let textControl: unknown = null;
    new Setting(containerEl)
      .setName(t('settings.claudeCode.fallbackModel.name'))
      .setDesc(t('settings.claudeCode.fallbackModel.desc'))
      .addText((text) => {
        textControl = text;
        text
          .setPlaceholder(t('settings.claudeCode.fallbackModel.placeholder'))
          .setValue(this.settings.fallbackModel)
          .onChange(async (value) => {
            this.settings.fallbackModel = value.trim();
            await this.saveSettings();
          });
      });
    return textControl;
  }

  private renderThinkingSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.thinking.name'))
      .setDesc(t('settings.claudeCode.thinking.desc'))
      .addDropdown((dropdown) => {
        for (const opt of CLAUDE_THINKING_TYPES) {
          dropdown.addOption(opt.id, t(opt.labelKey));
        }
        dropdown
          .setValue(this.settings.thinking.type)
          .onChange(async (value) => {
            const thinkingType = value as ClaudeCodeThinking['type'];
            if (thinkingType === 'fixed') {
              const budgetTokens = this.settings.thinking.type === 'fixed'
                ? this.settings.thinking.budgetTokens
                : 4096;
              this.settings.thinking = { type: 'fixed', budgetTokens };
            } else {
              this.settings.thinking = { type: thinkingType };
            }
            await this.saveSettings();
          });
      });
  }

  private renderThinkingBudgetSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.thinkingBudget.name'))
      .setDesc(t('settings.claudeCode.thinkingBudget.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.thinkingBudget.placeholder'))
          .setValue(
            this.settings.thinking.type === 'fixed' && 'budgetTokens' in this.settings.thinking
              ? String(this.settings.thinking.budgetTokens)
              : '',
          )
          .onChange(async (value) => {
            if (this.settings.thinking.type === 'fixed') {
              const parsed = parseInt(value, 10);
              this.settings.thinking = Number.isNaN(parsed) || parsed <= 0
                ? { type: 'fixed', budgetTokens: 4096 }
                : { type: 'fixed', budgetTokens: parsed };
              await this.saveSettings();
            }
          });
      });
  }

  private renderEffortSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.effort.name'))
      .setDesc(t('settings.claudeCode.effort.desc'))
      .addDropdown((dropdown) => {
        for (const opt of CLAUDE_EFFORT_LEVELS) {
          dropdown.addOption(opt.id, t(opt.labelKey));
        }
        dropdown
          .setValue(this.settings.effort)
          .onChange(async (value) => {
            this.settings.effort = value as ClaudeCodeEffort;
            await this.saveSettings();
          });
      });
  }

  // ─── Permissions tab ──────────────────────────────────────────────

  private renderPermissionsTab(containerEl: HTMLElement): void {
    this.renderPermissionModeSetting(containerEl);
  }

  private renderPermissionModeSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.permissionMode.name'))
      .setDesc(t('settings.claudeCode.permissionMode.desc'))
      .addDropdown((dropdown) => {
        for (const opt of CLAUDE_PERMISSION_MODES) {
          dropdown.addOption(opt.id, t(opt.labelKey));
        }
        dropdown
          .setValue(this.settings.permissionMode)
          .onChange(async (value) => {
            this.settings.permissionMode = value as ClaudeCodePermissionMode;
            await this.applyClaudePermissionMode(this.settings.permissionMode).catch(() => undefined);
            await this.saveSettings();
          });
      });
  }

  // ─── Context & Sources tab ────────────────────────────────────────

  private renderContextSourcesTab(containerEl: HTMLElement): void {
    this.renderRuntimeBoundaryNotice(containerEl);
    this.renderSettingSources(containerEl);
    this.renderProjectSourceStatus(containerEl);
    this.renderAdditionalDirectories(containerEl);
  }

  private renderRuntimeBoundaryNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-runtime-boundary',
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.runtimeBoundary.nextQuery') });
    new Setting(noticeEl)
      .setName(t('settings.claudeCode.runtimeBoundary.restartName'))
      .setDesc(t('settings.claudeCode.runtimeBoundary.restartDesc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.runtimeBoundary.restartButton'))
          .onClick(async () => {
            await this.restartClaudePersistentQueries('settings-change');
          });
      });
  }

  private renderLimitsBoundaryNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-limits-boundary',
      attr: { 'data-claude-code-limits-boundary': 'true' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.runtimeBoundary.nextQuery') });
    new Setting(noticeEl)
      .setName(t('settings.claudeCode.runtimeBoundary.restartName'))
      .setDesc(t('settings.claudeCode.runtimeBoundary.restartDesc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.runtimeBoundary.restartButton'))
          .onClick(async () => {
            await this.restartClaudePersistentQueries('settings-change');
          });
      });
  }

  private renderFallbackModelBoundaryNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-fallback-model-boundary',
      attr: { 'data-claude-code-fallback-model-boundary': 'true' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.fallbackModel.boundaryNotice') });
  }

  private renderToolsProofStatusNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'tools', 'data-proof-state': 'readback' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.tools') });
  }

  private renderLimitsProofStatusNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'limits', 'data-proof-state': 'readback' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.limits') });
  }

  private renderEnvProofStatusNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'env', 'data-proof-state': 'pass' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.env') });
  }

  private renderModelQuickSelect(containerEl: HTMLElement, textControl: unknown): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.model.quickSelectName'))
      .setDesc(t('settings.claudeCode.model.quickSelectDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.claudeCode.modelCatalog.quickSelectPlaceholder'));
        dropdown.setValue('');

        void this.loadModelCatalog().then((models) => {
          for (const model of models) {
            dropdown.addOption(model.id, model.name || model.id);
          }
        });

        dropdown.onChange(async (value) => {
          if (!value) return;
          this.settings.model = value;
          if (textControl && typeof (textControl as { setValue?: (v: string) => unknown }).setValue === 'function') {
            (textControl as { setValue: (v: string) => unknown }).setValue(value);
          }
          await this.applyClaudeModel(value).catch(() => undefined);
          await this.saveSettings();
        });
      });
  }

  private renderFallbackModelQuickSelect(containerEl: HTMLElement, textControl: unknown): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.fallbackModel.quickSelectName'))
      .setDesc(t('settings.claudeCode.fallbackModel.quickSelectDesc'))
      .addDropdown((dropdown) => {
        dropdown.addOption('', t('settings.claudeCode.modelCatalog.quickSelectPlaceholder'));
        dropdown.setValue('');

        void this.loadModelCatalog().then((models) => {
          for (const model of models) {
            dropdown.addOption(model.id, model.name || model.id);
          }
        });

        dropdown.onChange(async (value) => {
          if (!value) return;
          this.settings.fallbackModel = value;
          if (textControl && typeof (textControl as { setValue?: (v: string) => unknown }).setValue === 'function') {
            (textControl as { setValue: (v: string) => unknown }).setValue(value);
          }
          await this.saveSettings();
        });
      });
  }

  private async loadModelCatalog(): Promise<Array<{ id: string; name: string; provider: string }>> {
    if (this.cachedModelCatalog !== null) {
      return this.cachedModelCatalog;
    }
    if (this.modelCatalogLoadPromise !== null) {
      return this.modelCatalogLoadPromise;
    }

    this.modelCatalogLoadPromise = (async () => {
      try {
        const adapter = this.getClaudeAdapter() as {
          supportedModels?: () => Promise<Array<{ id: string; name: string; provider: string }>>;
        } | null;
        const models = await adapter?.supportedModels?.() ?? [];
        this.cachedModelCatalog = models;
        return models;
      } catch {
        this.cachedModelCatalog = [];
        return [];
      }
    })();

    return this.modelCatalogLoadPromise;
  }

  private renderSettingSources(containerEl: HTMLElement): void {
    const currentSources = new Set(this.settings.settingSources);
    new Setting(containerEl)
      .setName(t('settings.claudeCode.settingSources.name'))
      .setDesc(t('settings.claudeCode.settingSources.project.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(currentSources.has('project'))
          .onChange(async (value) => {
            this.updateSettingSource('project', value);
            await this.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName(t('settings.claudeCode.settingSources.user'))
      .setDesc(t('settings.claudeCode.settingSources.user.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(currentSources.has('user'))
          .onChange(async (value) => {
            this.updateSettingSource('user', value);
            await this.saveSettings();
          });
      });
    new Setting(containerEl)
      .setName(t('settings.claudeCode.settingSources.local'))
      .setDesc(t('settings.claudeCode.settingSources.local.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(currentSources.has('local'))
          .onChange(async (value) => {
            this.updateSettingSource('local', value);
            await this.saveSettings();
          });
      });
  }

  private updateSettingSource(source: ClaudeCodeSettingSource, enabled: boolean): void {
    const current = new Set(this.settings.settingSources);
    if (enabled) {
      current.add(source);
    } else {
      current.delete(source);
    }
    this.settings.settingSources = CLAUDE_SETTING_SOURCES
      .map((s) => s.id)
      .filter((id) => current.has(id));
  }

  private renderProjectSourceStatus(containerEl: HTMLElement): void {
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-project-sources',
      attr: { 'data-claude-code-project-sources': 'true' },
    });
    statusEl.createEl('strong', { text: t('settings.claudeCode.projectSources.title') });
    const listEl = statusEl.createEl('ul');
    for (const file of CLAUDE_PROJECT_SOURCE_FILES) {
      listEl.createEl('li', {
        text: t('settings.claudeCode.projectSources.checking', { file }),
      });
    }
    void this.refreshProjectSourceStatus(listEl);
  }

  private async refreshProjectSourceStatus(listEl: HTMLElement): Promise<void> {
    const adapter = this.plugin.app?.vault?.adapter;
    const exists = typeof adapter?.exists === 'function'
      ? adapter.exists.bind(adapter)
      : null;
    const results = await Promise.all(CLAUDE_PROJECT_SOURCE_FILES.map(async (file) => {
      if (!exists) {
        return { file, present: false };
      }
      try {
        return { file, present: await exists(file) };
      } catch {
        return { file, present: false };
      }
    }));
    listEl.empty();
    for (const result of results) {
      listEl.createEl('li', {
        text: result.present
          ? t('settings.claudeCode.projectSources.present', { file: result.file })
          : t('settings.claudeCode.projectSources.missing', { file: result.file }),
      });
    }
  }

  private renderAdditionalDirectories(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.additionalDirectories.name'))
      .setDesc(t('settings.claudeCode.additionalDirectories.desc'))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(t('settings.claudeCode.additionalDirectories.placeholder'))
          .setValue(this.settings.additionalDirectories.join('\n'))
          .onChange(async (value) => {
            this.settings.additionalDirectories = value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);
            await this.saveSettings();
          });
      });
  }

  // ─── Tools tab ───────────────────────────────────────────────────

  private renderToolsTab(containerEl: HTMLElement): void {
    this.renderRuntimeBoundaryNotice(containerEl);
    this.renderMcpRuntimeControls(containerEl);
    this.renderToolsProofStatusNotice(containerEl);
    this.renderAllowedToolsSetting(containerEl);
    this.renderDisallowedToolsSetting(containerEl);
  }

  private renderMcpRuntimeControls(containerEl: HTMLElement): void {
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-mcp-runtime',
      attr: { 'data-claude-code-mcp-runtime': 'true' },
    });
    this.updateMcpRuntimeStatus(statusEl);

    new Setting(containerEl)
      .setName(t('settings.claudeCode.mcpRuntime.name'))
      .setDesc(t('settings.claudeCode.mcpRuntime.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.mcpRuntime.refreshButton'))
          .onClick(async () => {
            try {
              await this.reloadClaudeMcpServers();
              this.updateMcpRuntimeStatus(statusEl);
            } catch {
              statusEl.setText(t('settings.claudeCode.mcpRuntime.refreshFailed'));
            }
          });
      });
  }

  private updateMcpRuntimeStatus(statusEl: HTMLElement): void {
    const adapter = this.getClaudeAdapter() as { getMcpServerCount?: () => number } | null;
    const count = adapter?.getMcpServerCount?.() ?? 0;
    statusEl.setText(
      count > 0
        ? t('settings.claudeCode.mcpRuntime.loaded', { count })
        : t('settings.claudeCode.mcpRuntime.empty'),
    );
  }

  private renderAllowedToolsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.allowedTools.name'))
      .setDesc(t('settings.claudeCode.allowedTools.desc'))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(t('settings.claudeCode.allowedTools.placeholder'))
          .setValue(this.settings.allowedTools.join('\n'))
          .onChange(async (value) => {
            this.settings.allowedTools = this.parseToolList(value);
            await this.saveSettings();
          });
      });
  }

  private renderDisallowedToolsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.disallowedTools.name'))
      .setDesc(t('settings.claudeCode.disallowedTools.desc'))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(t('settings.claudeCode.disallowedTools.placeholder'))
          .setValue(this.settings.disallowedTools.join('\n'))
          .onChange(async (value) => {
            this.settings.disallowedTools = this.parseToolList(value);
            await this.saveSettings();
          });
      });
  }

  private renderMaxTurnsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.maxTurns.name'))
      .setDesc(t('settings.claudeCode.maxTurns.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.maxTurns.placeholder'))
          .setValue(this.settings.maxTurns === null ? '' : String(this.settings.maxTurns))
          .onChange(async (value) => {
            this.settings.maxTurns = this.parseNullablePositiveInteger(value);
            await this.saveSettings();
          });
      });
  }

  private renderMaxBudgetSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.maxBudgetUsd.name'))
      .setDesc(t('settings.claudeCode.maxBudgetUsd.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.maxBudgetUsd.placeholder'))
          .setValue(this.settings.maxBudgetUsd === null ? '' : String(this.settings.maxBudgetUsd))
          .onChange(async (value) => {
            this.settings.maxBudgetUsd = this.parseNullablePositiveNumber(value);
            await this.saveSettings();
          });
      });
  }

  private renderEnvironmentVariablesSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.env.name'))
      .setDesc(t('settings.claudeCode.env.desc'))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(t('settings.claudeCode.env.placeholder'))
          .setValue(Object.entries(this.settings.env).map(([key, value]) => `${key}=${value}`).join('\n'))
          .onChange(async (value) => {
            this.settings.env = this.parseEnv(value);
            await this.saveSettings();
          });
      });
  }

  // ─── Shared helpers ───────────────────────────────────────────────

  private get settings() {
    this.plugin.settings.backendSettings ??= { claudeCode: getDefaultClaudeCodeBackendSettings() };
    this.plugin.settings.backendSettings.claudeCode ??= getDefaultClaudeCodeBackendSettings();
    return this.plugin.settings.backendSettings.claudeCode;
  }

  private formatDiagnostics(resolution: ClaudeCodeProcessResolution): string {
    if (resolution.mode === 'external') {
      return t('settings.claudeCode.diagnostics.external', {
        path: resolution.pathToClaudeCodeExecutable ?? '',
      });
    }

    return t('settings.claudeCode.diagnostics.bundled');
  }

  private async saveSettings(): Promise<void> {
    await this.plugin.saveSettings();
  }

  private getClaudeAdapter(): unknown {
    return this.plugin.agentServiceRegistry?.get('claude-code') ?? null;
  }

  private async applyClaudeModel(model: string | undefined): Promise<void> {
    const adapter = this.getClaudeAdapter() as { setModel?: (model?: string) => Promise<void> | void } | null;
    await adapter?.setModel?.(model);
  }

  private async applyClaudePermissionMode(mode: ClaudeCodePermissionMode): Promise<void> {
    const adapter = this.getClaudeAdapter() as {
      setPermissionMode?: (mode: ClaudeCodePermissionMode) => Promise<void> | void;
    } | null;
    await adapter?.setPermissionMode?.(mode);
  }

  private async restartClaudePersistentQueries(reason: string): Promise<void> {
    const adapter = this.getClaudeAdapter() as {
      restartPersistentQueries?: (reason?: string) => Promise<void> | void;
    } | null;
    await adapter?.restartPersistentQueries?.(reason);
  }

  private async reloadClaudeMcpServers(): Promise<void> {
    const adapter = this.getClaudeAdapter() as {
      reloadMcpServers?: () => Promise<void> | void;
    } | null;
    await adapter?.reloadMcpServers?.();
  }

  private isKnownClaudeTabId(tabId: string): tabId is typeof CLAUDE_CLASSIC_TABS[number] {
    return (CLAUDE_CLASSIC_TABS as readonly string[]).includes(tabId);
  }

  private parseLineList(value: string): string[] {
    return [...new Set(value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0))];
  }

  private parseToolList(value: string): string[] {
    return [...new Set(value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && this.isValidToolName(line)))];
  }

  private isValidToolName(name: string): boolean {
    // Claude Code tool names are PascalCase alphanumeric (e.g. Read, Grep, Bash, Glob, Edit).
    // Reject names with spaces, hyphens, or non-alphanumeric characters.
    if (!name || name.length === 0) {
      return false;
    }
    return /^[A-Za-z][A-Za-z0-9]*$/.test(name);
  }

  private parseNullablePositiveInteger(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private parseNullablePositiveNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private parseEnv(value: string): Record<string, string> {
    const env: Record<string, string> = {};
    for (const line of value.split('\n')) {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }
      const key = line.slice(0, separatorIndex).trim();
      const val = line.slice(separatorIndex + 1).trim();
      if (!this.isValidEnvKey(key)) {
        continue;
      }
      env[key] = val;
    }
    return env;
  }

  private isValidEnvKey(key: string): boolean {
    if (!key || key.length === 0) {
      return false;
    }
    // Standard POSIX env var naming: [A-Za-z_][A-Za-z0-9_]*
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return false;
    }
    return true;
  }
}
