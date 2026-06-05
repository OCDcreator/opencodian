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

import { Notice, Setting } from 'obsidian';
import * as path from 'path';

import {
  type ClaudeCodeProcessResolution,
  type ClaudeCodeProcessResolverOptions,
  resolveClaudeCodeProcess,
} from '../../core/agents/backend/ClaudeCodeProcessResolver';
import type { ClaudeProjectAgentInfo } from '../../core/agents/backend/ClaudeProjectAgentDiscovery';
import type { ClaudeProjectCommandInfo } from '../../core/agents/backend/ClaudeProjectCommandDiscovery';
import type { ClaudeProjectSettingsInfo } from '../../core/agents/backend/ClaudeProjectSettingsDiscovery';
import type { ClaudeProjectSkillInfo } from '../../core/agents/backend/ClaudeProjectSkillDiscovery';
import {
  type ClaudeCodeEffort,
  type ClaudeCodePermissionMode,
  type ClaudeCodeSettingSource,
  type ClaudeCodeThinking,
  getDefaultClaudeCodeBackendSettings,
} from '../../core/types';
import { t, type TranslationKey } from '../../i18n';
import type OpenCodianPlugin from '../../main';
import { getVaultBasePath } from '../../shared';
import { TextareaSizeMemory } from './TextareaSizeMemory';

interface SettingsClaudeCodeSectionOptions {
  plugin: OpenCodianPlugin;
  createSectionHeading: (
    containerEl: HTMLElement,
    title: string,
    tooltip?: string,
  ) => HTMLHeadingElement;
  resolveProcess?: (options: ClaudeCodeProcessResolverOptions) => ClaudeCodeProcessResolution;
}

interface ClaudeCodeRuntimeEcosystemAdapter {
  getSkillCount?: () => number;
  getSkillsList?: () => string[] | 'all';
  getPluginCount?: () => number;
  getPluginsList?: () => string[];
  getMcpServerCount?: () => number;
  getMcpServerNames?: () => string[];
  getMcpServerRuntimeStatuses?: () => Promise<ClaudeCodeMcpRuntimeStatus[] | null>;
  getRuntimeCatalog?: () => Promise<ClaudeCodeRuntimeCatalog | null>;
  getProjectClaudeSkills?: () => Promise<ClaudeProjectSkillInfo[]>;
  getContextUsage?: () => Promise<unknown | null>;
  getAccountInfo?: () => Promise<unknown | null>;
  readRuntimeFile?: (
    path: string,
    options?: { maxBytes?: number; encoding?: 'utf-8' | 'base64' },
  ) => Promise<unknown | null>;
  getAgentDefinitionCount?: () => number;
  getAgentDefinitionsList?: () => string[];
  getProjectClaudeAgents?: () => Promise<ClaudeProjectAgentInfo[]>;
}

interface ClaudeCodeMcpRuntimeStatus {
  name: string;
  status: string;
  scope?: string;
  serverInfo?: {
    name?: string;
    version?: string;
  };
  toolCount: number;
  toolNames: string[];
  hasError: boolean;
  errorSummary?: string;
}

interface ClaudeCodeRuntimeCatalogCommand {
  name: string;
  description?: string;
  argumentHint?: string;
  aliases?: string[];
}

interface ClaudeCodeRuntimeCatalogAgent {
  name: string;
  description?: string;
  model?: string;
}

interface ClaudeCodeRuntimeCatalog {
  commands: ClaudeCodeRuntimeCatalogCommand[];
  agents: ClaudeCodeRuntimeCatalogAgent[];
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
const CLAUDE_CONTEXT_USAGE_SECRET_KEY_PATTERN = /(?:^env$|api[_-]?key|secret|password|credential|authorization|oauth|(?:access|refresh|session|auth)[_-]?token|^token$)/i;
const CLAUDE_ACCOUNT_INFO_SECRET_KEY_PATTERN = /(?:^env$|api[_-]?key|secret|password|credential|authorization|oauth|(?:access|refresh|session|auth)?[_-]?token|token[_-]?source)/i;

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
    this.renderRuntimeEcosystemSummary(containerEl);
    this.renderBackendSessionBrowserInfo(containerEl);
    this.renderClaudeProjectSkillsControls(containerEl);
    this.renderClaudeProjectCommandsControls(containerEl);
    this.renderClaudeProjectAgentsControls(containerEl);
    this.renderClaudeProjectSettingsControls(containerEl);
    this.renderClaudeRuntimeCommandsControls(containerEl);
    this.renderRuntimeCatalogReadbackControls(containerEl);
    this.renderAccountInfoReadbackControls(containerEl);
    this.renderContextUsageReadbackControls(containerEl);
    this.renderRuntimeFileReadbackControls(containerEl);
    this.renderExecutableSetting(containerEl);
    this.renderJsRuntimeSetting(containerEl);
    this.renderLoadTimeoutMsSetting(containerEl);
    this.renderEnvironmentHint(containerEl);
    this.renderDiagnostics(containerEl);
    this.renderDebugSetting(containerEl);
    this.renderDebugFileSetting(containerEl);
    this.renderEnvProofStatusNotice(containerEl);
    this.renderFileCheckpointBoundaryNotice(containerEl);
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

  private renderJsRuntimeSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-js-runtime-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.jsRuntime.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.jsRuntime.name'))
      .setDesc(t('settings.claudeCode.jsRuntime.desc'))
      .addDropdown((dropdown) => {
        dropdown
          .addOption('', t('settings.claudeCode.jsRuntime.auto'))
          .addOption('node', 'Node.js')
          .addOption('bun', 'Bun')
          .addOption('deno', 'Deno')
          .setValue(this.settings.jsRuntime)
          .onChange(async (value) => {
            this.settings.jsRuntime = value as 'node' | 'bun' | 'deno' | '';
            await this.saveSettings();
          });
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-js-runtime-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.jsRuntime.lifecycleNotice') });
  }

  private renderLoadTimeoutMsSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-load-timeout-ms-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.loadTimeoutMs.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.loadTimeoutMs.name'))
      .setDesc(t('settings.claudeCode.loadTimeoutMs.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.loadTimeoutMs.placeholder'))
          .setValue(this.settings.loadTimeoutMs !== null ? String(this.settings.loadTimeoutMs) : '')
          .onChange(async (value) => {
            this.settings.loadTimeoutMs = this.parseNullablePositiveInteger(value);
            await this.saveSettings();
          });
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-load-timeout-ms-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.loadTimeoutMs.lifecycleNotice') });
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

  private renderDebugSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-debug-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.debug.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.debug.name'))
      .setDesc(t('settings.claudeCode.debug.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.settings.debug)
          .onChange(async (value) => {
            this.settings.debug = value;
            await this.saveSettings();
          });
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-debug-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.debug.lifecycleNotice') });
  }

  private renderDebugFileSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-debug-file-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.debugFile.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.debugFile.name'))
      .setDesc(t('settings.claudeCode.debugFile.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.debugFile.placeholder'))
          .setValue(this.settings.debugFile)
          .onChange(async (value) => {
            this.settings.debugFile = value.trim();
            await this.saveSettings();
          });
      });

    const implicitEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-debug-file-implicit': 'true' },
    });
    implicitEl.createSpan({ text: t('settings.claudeCode.debugFile.implicitDebugNotice') });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-debug-file-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.debugFile.lifecycleNotice') });
  }

  private renderRuntimeEcosystemSummary(containerEl: HTMLElement): void {
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    const summaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-runtime-ecosystem',
      attr: {
        'data-claude-code-runtime-ecosystem': 'true',
        'data-runtime-only': 'true',
        'data-proof-state': 'readback',
      },
    });

    summaryEl.createEl('h5', {
      text: t('settings.claudeCode.runtimeEcosystem.name'),
    });
    summaryEl.createEl('p', {
      cls: 'opencodian-claude-code-runtime-ecosystem-desc',
      text: t('settings.claudeCode.runtimeEcosystem.desc'),
    });

    for (const row of this.buildRuntimeEcosystemRows(adapter)) {
      summaryEl.createEl('p', {
        cls: 'opencodian-claude-code-runtime-ecosystem-row',
        attr: {
          'data-runtime-ecosystem-kind': row.kind,
          'data-runtime-ecosystem-state': row.state,
          'data-proof-state': 'readback',
        },
        text: row.text,
      });
    }
  }

  private buildRuntimeEcosystemRows(
    adapter: ClaudeCodeRuntimeEcosystemAdapter | null,
  ): Array<{
    kind: 'plugins' | 'skills' | 'agent-definitions';
    state: 'empty' | 'loaded' | 'all';
    text: string;
  }> {
    return [
      this.buildRuntimeEcosystemPluginRow(adapter),
      this.buildRuntimeEcosystemSkillRow(adapter),
      this.buildRuntimeEcosystemAgentDefinitionRow(adapter),
    ];
  }

  private buildRuntimeEcosystemPluginRow(
    adapter: ClaudeCodeRuntimeEcosystemAdapter | null,
  ): {
    kind: 'plugins';
    state: 'empty' | 'loaded';
    text: string;
  } {
    const pluginCount = adapter?.getPluginCount?.() ?? 0;
    const pluginNames = adapter?.getPluginsList?.() ?? [];
    if (pluginCount > 0) {
      return {
        kind: 'plugins',
        state: 'loaded',
        text: t('settings.claudeCode.runtimeEcosystem.plugins.loaded', {
          count: pluginCount,
          names: this.formatRuntimeEcosystemNames(pluginNames),
        }),
      };
    }

    return {
      kind: 'plugins',
      state: 'empty',
      text: t('settings.claudeCode.runtimeEcosystem.plugins.empty'),
    };
  }

  private buildRuntimeEcosystemSkillRow(
    adapter: ClaudeCodeRuntimeEcosystemAdapter | null,
  ): {
    kind: 'skills';
    state: 'empty' | 'loaded' | 'all';
    text: string;
  } {
    const skillCount = adapter?.getSkillCount?.() ?? 0;
    const skillsList = adapter?.getSkillsList?.() ?? [];
    if (skillCount < 0 || skillsList === 'all') {
      return {
        kind: 'skills',
        state: 'all',
        text: t('settings.claudeCode.runtimeEcosystem.skills.all'),
      };
    }
    if (skillCount > 0) {
      return {
        kind: 'skills',
        state: 'loaded',
        text: t('settings.claudeCode.runtimeEcosystem.skills.loaded', {
          count: skillCount,
          names: this.formatRuntimeEcosystemNames(skillsList),
        }),
      };
    }

    return {
      kind: 'skills',
      state: 'empty',
      text: t('settings.claudeCode.runtimeEcosystem.skills.empty'),
    };
  }

  private buildRuntimeEcosystemAgentDefinitionRow(
    adapter: ClaudeCodeRuntimeEcosystemAdapter | null,
  ): {
    kind: 'agent-definitions';
    state: 'empty' | 'loaded';
    text: string;
  } {
    const agentDefinitionCount = adapter?.getAgentDefinitionCount?.() ?? 0;
    const agentDefinitionNames = adapter?.getAgentDefinitionsList?.() ?? [];
    if (agentDefinitionCount > 0) {
      const names = this.formatRuntimeEcosystemNames(agentDefinitionNames);
      return {
        kind: 'agent-definitions',
        state: 'loaded',
        text: agentDefinitionCount === 1
          ? t('settings.claudeCode.runtimeEcosystem.agentDefinitions.single', {
            name: names,
          })
          : t('settings.claudeCode.runtimeEcosystem.agentDefinitions.loaded', {
            count: agentDefinitionCount,
            names,
          }),
      };
    }

    return {
      kind: 'agent-definitions',
      state: 'empty',
      text: t('settings.claudeCode.runtimeEcosystem.agentDefinitions.empty'),
    };
  }

  private formatRuntimeEcosystemNames(names: string[]): string {
    const normalizedNames = names
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    return normalizedNames.length > 0
      ? normalizedNames.join(', ')
      : t('settings.claudeCode.runtimeEcosystem.unnamed');
  }

  // ─── Backend Session Browser Info ─────────────────────────────────

  private renderBackendSessionBrowserInfo(containerEl: HTMLElement): void {
    const infoEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-session-browser-info': 'true' },
    });
    infoEl.createSpan({ text: t('settings.claudeCode.sessionBrowser.info') });
  }

  // ─── Claude Project Skills discovery ───────────────────────────────

  private renderClaudeProjectSkillsControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-project-skills',
        attr: {
          'data-claude-code-project-skills': 'true',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.projectSkills.name'))
      .setDesc(t('settings.claudeCode.projectSkills.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectSkills.scanButton'))
          .onClick(async () => {
            await this.renderClaudeProjectSkillsReadback(getOutputEl());
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectSkills.createButton'))
          .onClick(async () => {
            await this.handleCreateClaudeProjectSkill(getOutputEl());
          });
      });
  }

  private async renderClaudeProjectSkillsReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.projectSkills.loading'));
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.getProjectClaudeSkills !== 'function') {
      outputEl.setText(t('settings.claudeCode.projectSkills.empty'));
      return;
    }

    let skills: ClaudeProjectSkillInfo[];
    try {
      skills = await adapter.getProjectClaudeSkills();
    } catch {
      outputEl.setText(t('settings.claudeCode.projectSkills.failed'));
      return;
    }

    outputEl.empty();
    if (skills.length === 0) {
      outputEl.setText(t('settings.claudeCode.projectSkills.empty'));
      return;
    }

    for (const skill of skills) {
      const skillEl = outputEl.createDiv({
        cls: 'opencodian-claude-code-project-skill-entry',
        attr: {
          'data-skill-name': skill.name,
          'data-skill-path': skill.relativePath,
        },
      });
      const label = skill.description
        ? t('settings.claudeCode.projectSkills.skillEntry', { name: skill.name, description: skill.description })
        : t('settings.claudeCode.projectSkills.skillEntryNoDesc', { name: skill.name });
      skillEl.createEl('p', { text: label });
      skillEl.createEl('p', {
        cls: 'opencodian-settings-inline-notice',
        text: t('settings.claudeCode.projectSkills.skillPath', { path: skill.relativePath }),
      });
      const openBtn = skillEl.createEl('button', {
        cls: 'opencodian-claude-code-action-button',
        text: t('settings.claudeCode.projectSkills.openButton'),
      });
      openBtn.addEventListener('click', () => {
        void this.openFileInEditor(skill.skillMdPath);
      });
    }
  }

  private async handleCreateClaudeProjectSkill(outputEl: HTMLElement): Promise<void> {
    const name = window.prompt(t('settings.claudeCode.projectSkills.createPrompt'));
    if (!name?.trim()) return;

    const vaultPath = this.plugin.app ? this.getVaultBasePath() : null;
    if (!vaultPath) return;

    // Check if skill already exists
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.getProjectClaudeSkills === 'function') {
      const existing = await adapter.getProjectClaudeSkills();
      if (existing.some((s) => s.name === name.trim())) {
        new Notice(t('settings.claudeCode.projectSkills.alreadyExists'));
        return;
      }
    }

    const { createClaudeProjectSkill } = await import('../../core/agents/backend/ClaudeProjectSkillDiscovery');
    const filePath = await createClaudeProjectSkill(vaultPath, name.trim());
    if (!filePath) {
      new Notice(t('settings.claudeCode.projectSkills.createFailed'));
      return;
    }

    await this.openFileInEditor(filePath);
    // Re-scan to show the new skill
    await this.renderClaudeProjectSkillsReadback(outputEl);
  }

  // ─── Claude Project Commands discovery & actions ──────────────────

  private renderClaudeProjectCommandsControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-project-commands',
        attr: {
          'data-claude-code-project-commands': 'true',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.projectCommands.name'))
      .setDesc(t('settings.claudeCode.projectCommands.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectCommands.scanButton'))
          .onClick(async () => {
            await this.renderClaudeProjectCommandsReadback(getOutputEl());
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectCommands.createButton'))
          .onClick(async () => {
            await this.handleCreateClaudeProjectCommand(getOutputEl());
          });
      });
  }

  private async renderClaudeProjectCommandsReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.projectCommands.loading'));

    const vaultPath = this.getVaultBasePath();
    if (!vaultPath) {
      outputEl.setText(t('settings.claudeCode.projectCommands.empty'));
      return;
    }

    let commands: ClaudeProjectCommandInfo[];
    try {
      const { discoverClaudeProjectCommands } = await import('../../core/agents/backend/ClaudeProjectCommandDiscovery');
      commands = await discoverClaudeProjectCommands(vaultPath);
    } catch {
      outputEl.setText(t('settings.claudeCode.projectCommands.failed'));
      return;
    }

    outputEl.empty();
    if (commands.length === 0) {
      outputEl.setText(t('settings.claudeCode.projectCommands.empty'));
      return;
    }

    for (const cmd of commands) {
      const cmdEl = outputEl.createDiv({
        cls: 'opencodian-claude-code-project-command-entry',
        attr: {
          'data-command-name': cmd.name,
          'data-command-path': cmd.relativePath,
        },
      });
      const label = cmd.description
        ? t('settings.claudeCode.projectCommands.commandEntry', { name: cmd.name, description: cmd.description })
        : t('settings.claudeCode.projectCommands.commandEntryNoDesc', { name: cmd.name });
      cmdEl.createEl('p', { text: label });
      cmdEl.createEl('p', {
        cls: 'opencodian-settings-inline-notice',
        text: t('settings.claudeCode.projectCommands.commandPath', { path: cmd.relativePath }),
      });
      const openBtn = cmdEl.createEl('button', {
        cls: 'opencodian-claude-code-action-button',
        text: t('settings.claudeCode.projectCommands.openButton'),
      });
      openBtn.addEventListener('click', () => {
        void this.openFileInEditor(cmd.filePath);
      });
    }
  }

  private async handleCreateClaudeProjectCommand(outputEl: HTMLElement): Promise<void> {
    const name = window.prompt(t('settings.claudeCode.projectCommands.createPrompt'));
    if (!name?.trim()) return;

    const vaultPath = this.plugin.app ? this.getVaultBasePath() : null;
    if (!vaultPath) return;

    // Check if command already exists
    const { discoverClaudeProjectCommands, createClaudeProjectCommand } = await import('../../core/agents/backend/ClaudeProjectCommandDiscovery');
    const existing = await discoverClaudeProjectCommands(vaultPath);
    if (existing.some((c) => c.name === name.trim())) {
      new Notice(t('settings.claudeCode.projectCommands.alreadyExists'));
      return;
    }

    const filePath = await createClaudeProjectCommand(vaultPath, name.trim());
    if (!filePath) {
      new Notice(t('settings.claudeCode.projectCommands.createFailed'));
      return;
    }

    await this.openFileInEditor(filePath);
    // Re-scan to show the new command
    await this.renderClaudeProjectCommandsReadback(outputEl);
  }

  // ─── Claude Project Agents discovery & actions ───────────────────

  private renderClaudeProjectAgentsControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-project-agents',
        attr: {
          'data-claude-code-project-agents': 'true',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.projectAgents.name'))
      .setDesc(t('settings.claudeCode.projectAgents.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectAgents.scanButton'))
          .onClick(async () => {
            await this.renderClaudeProjectAgentsReadback(getOutputEl());
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectAgents.createButton'))
          .onClick(async () => {
            await this.handleCreateClaudeProjectAgent(getOutputEl());
          });
      });
  }

  private async renderClaudeProjectAgentsReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.projectAgents.loading'));

    const vaultPath = this.getVaultBasePath();
    if (!vaultPath) {
      outputEl.setText(t('settings.claudeCode.projectAgents.empty'));
      return;
    }

    let agents: ClaudeProjectAgentInfo[];
    try {
      const { discoverClaudeProjectAgents } = await import('../../core/agents/backend/ClaudeProjectAgentDiscovery');
      agents = await discoverClaudeProjectAgents(vaultPath);
    } catch {
      outputEl.setText(t('settings.claudeCode.projectAgents.failed'));
      return;
    }

    outputEl.empty();
    if (agents.length === 0) {
      outputEl.setText(t('settings.claudeCode.projectAgents.empty'));
      return;
    }

    for (const agent of agents) {
      const agentEl = outputEl.createDiv({
        cls: 'opencodian-claude-code-project-agent-entry',
        attr: {
          'data-agent-name': agent.name,
          'data-agent-path': agent.relativePath,
        },
      });
      const label = agent.description
        ? t('settings.claudeCode.projectAgents.agentEntry', { name: agent.name, description: agent.description })
        : t('settings.claudeCode.projectAgents.agentEntryNoDesc', { name: agent.name });
      agentEl.createEl('p', { text: label });
      agentEl.createEl('p', {
        cls: 'opencodian-settings-inline-notice',
        text: t('settings.claudeCode.projectAgents.agentPath', { path: agent.relativePath }),
      });
      const openBtn = agentEl.createEl('button', {
        cls: 'opencodian-claude-code-action-button',
        text: t('settings.claudeCode.projectAgents.openButton'),
      });
      openBtn.addEventListener('click', () => {
        void this.openFileInEditor(agent.filePath);
      });
    }
  }

  private async handleCreateClaudeProjectAgent(outputEl: HTMLElement): Promise<void> {
    const name = window.prompt(t('settings.claudeCode.projectAgents.createPrompt'));
    if (!name?.trim()) return;

    const vaultPath = this.plugin.app ? this.getVaultBasePath() : null;
    if (!vaultPath) return;

    // Check if agent already exists
    const { discoverClaudeProjectAgents, createClaudeProjectAgent } = await import('../../core/agents/backend/ClaudeProjectAgentDiscovery');
    const existing = await discoverClaudeProjectAgents(vaultPath);
    if (existing.some((a) => a.name === name.trim())) {
      new Notice(t('settings.claudeCode.projectAgents.alreadyExists'));
      return;
    }

    const filePath = await createClaudeProjectAgent(vaultPath, name.trim());
    if (!filePath) {
      new Notice(t('settings.claudeCode.projectAgents.createFailed'));
      return;
    }

    await this.openFileInEditor(filePath);
    // Re-scan to show the new agent
    await this.renderClaudeProjectAgentsReadback(outputEl);
  }

  // ─── Claude Project Settings (Hooks & Plugins) ────────────────

  private renderClaudeProjectSettingsControls(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-project-settings-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.projectSettings.boundaryNotice') });

    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-project-settings',
        attr: {
          'data-claude-code-project-settings': 'true',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.projectSettings.name'))
      .setDesc(t('settings.claudeCode.projectSettings.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectSettings.scanButton'))
          .onClick(async () => {
            await this.renderClaudeProjectSettingsReadback(getOutputEl());
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectSettings.createLocalButton'))
          .onClick(async () => {
            await this.handleCreateClaudeProjectSettingsFile(getOutputEl(), 'settings.local.json');
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.projectSettings.createSharedButton'))
          .onClick(async () => {
            await this.handleCreateClaudeProjectSettingsFile(getOutputEl(), 'settings.json');
          });
      });
  }

  private async renderClaudeProjectSettingsReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.projectSettings.loading'));

    const vaultPath = this.getVaultBasePath();
    if (!vaultPath) {
      outputEl.setText(t('settings.claudeCode.projectSettings.empty'));
      return;
    }

    let settingsFiles: ClaudeProjectSettingsInfo[];
    try {
      const { discoverClaudeProjectSettings } = await import('../../core/agents/backend/ClaudeProjectSettingsDiscovery');
      settingsFiles = await discoverClaudeProjectSettings(vaultPath);
    } catch {
      outputEl.setText(t('settings.claudeCode.projectSettings.failed'));
      return;
    }

    outputEl.empty();

    for (const sf of settingsFiles) {
      const fileEl = outputEl.createDiv({
        cls: 'opencodian-claude-code-project-settings-file-entry',
        attr: {
          'data-settings-file': sf.relativePath,
          'data-settings-exists': String(sf.exists),
        },
      });

      const headerLabel = sf.exists
        ? t('settings.claudeCode.projectSettings.fileEntry', { path: sf.relativePath })
        : t('settings.claudeCode.projectSettings.fileNotFound', { path: sf.relativePath });
      fileEl.createEl('p', { text: headerLabel });

      if (sf.parseError) {
        fileEl.createEl('p', {
          cls: 'opencodian-settings-inline-notice',
          text: t('settings.claudeCode.projectSettings.parseError', { error: sf.parseError }),
        });
        continue;
      }

      if (!sf.exists) {
        continue;
      }

      if (sf.hookCount > 0) {
        const hookEvents = Object.keys(sf.hooks);
        const hookSummary = hookEvents
          .map((event) => {
            const groups = sf.hooks[event];
            const cmdCount = groups.reduce((sum, g) => sum + g.hooks.length, 0);
            return `${event} (${cmdCount})`;
          })
          .join(', ');
        fileEl.createEl('p', {
          text: t('settings.claudeCode.projectSettings.hooksSummary', {
            count: sf.hookCount,
            events: hookSummary,
          }),
        });
      } else {
        fileEl.createEl('p', {
          cls: 'opencodian-settings-inline-notice',
          text: t('settings.claudeCode.projectSettings.noHooks'),
        });
      }

      if (sf.enabledPlugins.length > 0) {
        fileEl.createEl('p', {
          text: t('settings.claudeCode.projectSettings.pluginsSummary', {
            count: sf.enabledPlugins.length,
            names: sf.enabledPlugins.join(', '),
          }),
        });
      } else {
        fileEl.createEl('p', {
          cls: 'opencodian-settings-inline-notice',
          text: t('settings.claudeCode.projectSettings.noPlugins'),
        });
      }

      if (sf.extraKnownMarketplaces.length > 0) {
        fileEl.createEl('p', {
          text: t('settings.claudeCode.projectSettings.marketplacesSummary', {
            count: sf.extraKnownMarketplaces.length,
            urls: sf.extraKnownMarketplaces.join(', '),
          }),
        });
      } else {
        fileEl.createEl('p', {
          cls: 'opencodian-settings-inline-notice',
          text: t('settings.claudeCode.projectSettings.noMarketplaces'),
        });
      }

      const openBtn = fileEl.createEl('button', {
        cls: 'opencodian-claude-code-action-button',
        text: t('settings.claudeCode.projectSettings.openButton'),
      });
      openBtn.addEventListener('click', () => {
        void this.openFileInEditor(sf.filePath);
      });
    }
  }

  private async handleCreateClaudeProjectSettingsFile(
    outputEl: HTMLElement,
    fileName: 'settings.json' | 'settings.local.json',
  ): Promise<void> {
    const vaultPath = this.plugin.app ? this.getVaultBasePath() : null;
    if (!vaultPath) return;

    const { createClaudeProjectSettingsFile } = await import('../../core/agents/backend/ClaudeProjectSettingsDiscovery');
    const filePath = await createClaudeProjectSettingsFile(vaultPath, fileName);
    if (!filePath) {
      new Notice(t('settings.claudeCode.projectSettings.createFailed'));
      return;
    }

    await this.openFileInEditor(filePath);
    await this.renderClaudeProjectSettingsReadback(outputEl);
  }

  // ─── Shared helpers ────────────────────────────────────────────────

  private getVaultBasePath(): string | null {
    return getVaultBasePath(this.plugin.app);
  }

  private async openFileInEditor(absolutePath: string): Promise<void> {
    try {
      const vaultPath = this.getVaultBasePath();
      if (!vaultPath) return;
      const relativePath = path.relative(vaultPath, absolutePath).replace(/\\/g, '/');
      await this.plugin.app.workspace.openLinkText(relativePath, '', 'tab');
    } catch {
      // Fallback: no-op
    }
  }

  // ─── Claude Runtime Commands discovery ─────────────────────────────

  private renderClaudeRuntimeCommandsControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-runtime-commands',
        attr: {
          'data-claude-code-runtime-commands': 'true',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.runtimeCommands.name'))
      .setDesc(t('settings.claudeCode.runtimeCommands.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.runtimeCommands.scanButton'))
          .onClick(async () => {
            await this.renderClaudeRuntimeCommandsReadback(getOutputEl());
          });
      });
  }

  private async renderClaudeRuntimeCommandsReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.runtimeCommands.loading'));
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.getRuntimeCatalog !== 'function') {
      outputEl.setText(t('settings.claudeCode.runtimeCommands.unavailable'));
      return;
    }

    let catalog: ClaudeCodeRuntimeCatalog | null;
    try {
      catalog = await adapter.getRuntimeCatalog();
    } catch {
      outputEl.setText(t('settings.claudeCode.runtimeCommands.failed'));
      return;
    }

    if (!catalog || catalog.commands.length === 0) {
      outputEl.setText(t('settings.claudeCode.runtimeCommands.empty'));
      return;
    }

    outputEl.empty();
    const boundaryEl = outputEl.createEl('p', {
      cls: 'opencodian-settings-inline-notice',
      text: t('settings.claudeCode.runtimeCommands.boundaryNotice'),
    });
    boundaryEl.setAttribute('data-claude-code-runtime-commands-boundary', 'true');

    const listEl = outputEl.createEl('ul');
    for (const cmd of catalog.commands) {
      const itemEl = listEl.createEl('li');
      itemEl.setAttribute('data-command-name', cmd.name);
      const desc = cmd.description
        ? t('settings.claudeCode.runtimeCommands.commandDesc', { name: cmd.name, description: cmd.description })
        : t('settings.claudeCode.runtimeCommands.commandEntry', { name: cmd.name });
      itemEl.createEl('span', { text: '/' + desc.replace(/^\/+/, '') });
      if (cmd.argumentHint) {
        itemEl.createEl('span', {
          cls: 'opencodian-settings-inline-notice',
          text: ' ' + t('settings.claudeCode.runtimeCommands.commandHint', { hint: cmd.argumentHint }),
        });
      }
    }
  }

  private renderRuntimeCatalogReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-runtime-catalog',
        attr: {
          'data-claude-code-runtime-catalog': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.runtimeCatalog.name'))
      .setDesc(t('settings.claudeCode.runtimeCatalog.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.runtimeCatalog.inspectButton'))
          .onClick(async () => {
            await this.renderRuntimeCatalogReadback(getOutputEl());
          });
      });
  }

  private async renderRuntimeCatalogReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.runtimeCatalog.loading'));
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.getRuntimeCatalog !== 'function') {
      outputEl.setText(t('settings.claudeCode.runtimeCatalog.unavailable'));
      return;
    }

    let catalog: ClaudeCodeRuntimeCatalog | null;
    try {
      catalog = await adapter.getRuntimeCatalog();
    } catch {
      outputEl.setText(t('settings.claudeCode.runtimeCatalog.failed'));
      return;
    }

    if (catalog === null) {
      outputEl.setText(t('settings.claudeCode.runtimeCatalog.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.claudeCode.runtimeCatalog.summary', {
        commands: catalog.commands.length,
        agents: catalog.agents.length,
      }),
    });
    this.renderRuntimeCatalogCommands(outputEl, catalog.commands);
    this.renderRuntimeCatalogAgents(outputEl, catalog.agents);
  }

  private renderRuntimeCatalogCommands(
    containerEl: HTMLElement,
    commands: ClaudeCodeRuntimeCatalogCommand[],
  ): void {
    containerEl.createEl('h5', {
      text: t('settings.claudeCode.runtimeCatalog.commands'),
    });
    if (commands.length === 0) {
      containerEl.createEl('p', { text: t('settings.claudeCode.runtimeCatalog.emptyCommands') });
      return;
    }

    for (const command of commands) {
      const commandEl = containerEl.createDiv({ cls: 'opencodian-claude-code-runtime-catalog-command' });
      commandEl.createEl('p', { text: `/${command.name}` });
      if (command.description) {
        commandEl.createEl('p', { text: command.description });
      }
      if (command.argumentHint) {
        commandEl.createEl('p', {
          text: t('settings.claudeCode.runtimeCatalog.argumentHint', {
            hint: command.argumentHint,
          }),
        });
      }
      const aliases = Array.isArray(command.aliases)
        ? command.aliases.filter((alias) => alias.trim().length > 0)
        : [];
      if (aliases.length > 0) {
        commandEl.createEl('p', {
          text: t('settings.claudeCode.runtimeCatalog.aliases', {
            aliases: this.formatRuntimeEcosystemNames(aliases),
          }),
        });
      }
    }
  }

  private renderRuntimeCatalogAgents(
    containerEl: HTMLElement,
    agents: ClaudeCodeRuntimeCatalogAgent[],
  ): void {
    containerEl.createEl('h5', {
      text: t('settings.claudeCode.runtimeCatalog.agents'),
    });
    if (agents.length === 0) {
      containerEl.createEl('p', { text: t('settings.claudeCode.runtimeCatalog.emptyAgents') });
      return;
    }

    for (const agent of agents) {
      const agentEl = containerEl.createDiv({ cls: 'opencodian-claude-code-runtime-catalog-agent' });
      agentEl.createEl('p', { text: agent.name });
      if (agent.description) {
        agentEl.createEl('p', { text: agent.description });
      }
      if (agent.model) {
        agentEl.createEl('p', {
          text: t('settings.claudeCode.runtimeCatalog.model', {
            model: agent.model,
          }),
        });
      }
    }
  }

  private renderAccountInfoReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-account-info-readback',
        attr: {
          'data-claude-code-account-info-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.accountInfo.name'))
      .setDesc(t('settings.claudeCode.accountInfo.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.accountInfo.inspectButton'))
          .onClick(async () => {
            await this.renderAccountInfoReadback(getOutputEl());
          });
      });
  }

  private async renderAccountInfoReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.accountInfo.loading'));
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.getAccountInfo !== 'function') {
      outputEl.setText(t('settings.claudeCode.accountInfo.unavailable'));
      return;
    }

    let accountInfo: unknown | null;
    try {
      accountInfo = await adapter.getAccountInfo();
    } catch {
      outputEl.setText(t('settings.claudeCode.accountInfo.failed'));
      return;
    }

    if (accountInfo === null) {
      outputEl.setText(t('settings.claudeCode.accountInfo.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.claudeCode.accountInfo.summary'),
    });
    outputEl.createEl('pre', {
      text: this.formatAccountInfoReadback(accountInfo),
    });
  }

  private formatAccountInfoReadback(accountInfo: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(this.sanitizeAccountInfoValue(accountInfo, '', seen), null, 2)
      ?? t('settings.claudeCode.accountInfo.unavailable');
  }

  private sanitizeAccountInfoValue(value: unknown, key: string, seen: WeakSet<object>): unknown {
    if (key.toLowerCase() === 'email') {
      return typeof value === 'string' ? this.maskAccountEmail(value) : '[redacted-email]';
    }
    if (CLAUDE_ACCOUNT_INFO_SECRET_KEY_PATTERN.test(key)) {
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

  private maskAccountEmail(email: string): string {
    const trimmed = email.trim();
    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) {
      return '[redacted-email]';
    }
    return `${trimmed.charAt(0)}***@${trimmed.slice(atIndex + 1)}`;
  }

  private renderContextUsageReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-context-usage-readback',
        attr: {
          'data-claude-code-context-usage-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.contextUsage.name'))
      .setDesc(t('settings.claudeCode.contextUsage.desc'))
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.contextUsage.inspectButton'))
          .onClick(async () => {
            await this.renderContextUsageReadback(getOutputEl());
          });
      });
  }

  private async renderContextUsageReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.contextUsage.loading'));
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.getContextUsage !== 'function') {
      outputEl.setText(t('settings.claudeCode.contextUsage.unavailable'));
      return;
    }

    let usage: unknown | null;
    try {
      usage = await adapter.getContextUsage();
    } catch {
      outputEl.setText(t('settings.claudeCode.contextUsage.failed'));
      return;
    }

    if (usage === null) {
      outputEl.setText(t('settings.claudeCode.contextUsage.unavailable'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.claudeCode.contextUsage.summary'),
    });
    outputEl.createEl('pre', {
      text: this.formatContextUsageReadback(usage),
    });
  }

  private formatContextUsageReadback(usage: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(this.sanitizeContextUsageValue(usage, '', seen), null, 2)
      ?? t('settings.claudeCode.contextUsage.unavailable');
  }

  private sanitizeContextUsageValue(value: unknown, key: string, seen: WeakSet<object>): unknown {
    if (CLAUDE_CONTEXT_USAGE_SECRET_KEY_PATTERN.test(key)) {
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
      return value.map((item) => this.sanitizeContextUsageValue(item, key, seen));
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        this.sanitizeContextUsageValue(entryValue, entryKey, seen),
      ]),
    );
  }

  private renderRuntimeFileReadbackControls(containerEl: HTMLElement): void {
    let outputEl: HTMLElement | null = null;
    let runtimeFilePath = '';
    const getOutputEl = (): HTMLElement => {
      outputEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-file-readback',
        attr: {
          'data-claude-code-file-readback': 'true',
          'data-proof-state': 'readback',
        },
      });
      return outputEl;
    };

    new Setting(containerEl)
      .setName(t('settings.claudeCode.fileReadback.pathName'))
      .setDesc(t('settings.claudeCode.fileReadback.pathDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.fileReadback.pathPlaceholder'))
          .onChange((value) => {
            runtimeFilePath = value.trim();
          });
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.fileReadback.inspectButton'))
          .onClick(async () => {
            await this.renderRuntimeFileReadback(getOutputEl(), runtimeFilePath);
          });
      });
  }

  private async renderRuntimeFileReadback(outputEl: HTMLElement, targetPath: string): Promise<void> {
    const trimmedPath = targetPath.trim();
    outputEl.empty();
    if (!trimmedPath) {
      outputEl.setText(t('settings.claudeCode.fileReadback.emptyPath'));
      return;
    }

    outputEl.setText(t('settings.claudeCode.fileReadback.loading'));
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.readRuntimeFile !== 'function') {
      outputEl.setText(t('settings.claudeCode.fileReadback.unavailable'));
      return;
    }

    let readback: unknown | null;
    try {
      readback = await adapter.readRuntimeFile(trimmedPath, {
        maxBytes: 4096,
        encoding: 'utf-8',
      });
    } catch {
      outputEl.setText(t('settings.claudeCode.fileReadback.failed'));
      return;
    }

    if (readback === null) {
      outputEl.setText(t('settings.claudeCode.fileReadback.notFound'));
      return;
    }

    outputEl.empty();
    outputEl.createEl('p', {
      text: t('settings.claudeCode.fileReadback.summary'),
    });
    outputEl.createEl('p', {
      text: t('settings.claudeCode.fileReadback.absPath', {
        path: this.getRuntimeFileReadbackString(readback, 'absPath') ?? trimmedPath,
      }),
    });
    outputEl.createEl('p', {
      text: t('settings.claudeCode.fileReadback.contents'),
    });
    outputEl.createEl('pre', {
      text: this.getRuntimeFileReadbackString(readback, 'contents') ?? this.formatRuntimeFileReadbackValue(readback),
    });
    if (this.isRuntimeFileReadbackTruncated(readback)) {
      outputEl.createEl('p', {
        text: t('settings.claudeCode.fileReadback.truncated'),
      });
    }
  }

  private getRuntimeFileReadbackString(readback: unknown, key: string): string | null {
    const record = this.getRuntimeFileReadbackRecord(readback);
    if (!record || !(key in record)) {
      return null;
    }

    const value = record[key];
    if (value === null || value === undefined) {
      return null;
    }
    return this.formatRuntimeFileReadbackValue(value);
  }

  private getRuntimeFileReadbackRecord(readback: unknown): Record<string, unknown> | null {
    return readback !== null && typeof readback === 'object' && !Array.isArray(readback)
      ? readback as Record<string, unknown>
      : null;
  }

  private formatRuntimeFileReadbackValue(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    try {
      return JSON.stringify(value, null, 2) ?? `[${typeof value}]`;
    } catch {
      return `[${typeof value}]`;
    }
  }

  private isRuntimeFileReadbackTruncated(readback: unknown): boolean {
    return this.getRuntimeFileReadbackRecord(readback)?.truncated === true;
  }

  // ─── Model & Thinking tab ─────────────────────────────────────────

  private renderModelThinkingTab(containerEl: HTMLElement): void {
    const modelTextControl = this.renderModelSetting(containerEl);
    this.renderModelQuickSelect(containerEl, modelTextControl);
    this.renderMainModelProofStatusNotice(containerEl);
    const fallbackTextControl = this.renderFallbackModelSetting(containerEl);
    this.renderFallbackModelQuickSelect(containerEl, fallbackTextControl);
    this.renderFallbackModelBoundaryNotice(containerEl);
    this.renderFallbackModelProofStatusNotice(containerEl);
    this.renderThinkingSetting(containerEl);
    if (this.settings.thinking.type === 'fixed') {
      this.renderThinkingBudgetSetting(containerEl);
    }
    this.renderEffortSetting(containerEl);
    this.renderLimitsProofStatusNotice(containerEl);
    this.renderLimitsBoundaryNotice(containerEl);
    this.renderMaxTurnsSetting(containerEl);
    this.renderMaxBudgetSetting(containerEl);
    this.renderTaskBudgetSetting(containerEl);
    this.renderSystemPromptSetting(containerEl);
    this.renderPromptSuggestionsSetting(containerEl);
    this.renderEnableContext1mBetaSetting(containerEl);
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
            // If model now matches fallbackModel, clear fallback to avoid guaranteed SDK error
            if (model && this.settings.fallbackModel && model === this.settings.fallbackModel) {
              this.settings.fallbackModel = '';
              new Notice(t('settings.claudeCode.fallbackModel.clearedByModelChange'));
            }
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
            const trimmed = value.trim();
            if (trimmed && trimmed === this.settings.model) {
              // SDK throws on same-model fallback; reject and revert
              new Notice(t('settings.claudeCode.fallbackModel.sameModelWarning'));
              if (typeof (textControl as { setValue?: (v: string) => unknown }).setValue === 'function') {
                (textControl as { setValue: (v: string) => unknown }).setValue(this.settings.fallbackModel);
              }
              return;
            }
            this.settings.fallbackModel = trimmed;
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
    this.renderPlanModeInstructionsSetting(containerEl);
    this.renderSandboxSettings(containerEl);
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

  private renderPlanModeInstructionsSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-plan-mode-instructions-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.planModeInstructions.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.planModeInstructions.name'))
      .setDesc(t('settings.claudeCode.planModeInstructions.desc'))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(t('settings.claudeCode.planModeInstructions.placeholder'))
          .setValue(this.settings.planModeInstructions)
          .onChange(async (value) => {
            this.settings.planModeInstructions = value.trim();
            await this.saveSettings();
          });
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-instructions');
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-plan-mode-instructions-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.planModeInstructions.lifecycleNotice') });
  }

  // ─── Sandbox settings (Permissions tab) ─────────────────────────

  private renderSandboxSettings(containerEl: HTMLElement): void {
    containerEl.createEl('h4', { text: t('settings.claudeCode.sandbox.name') });
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-sandbox-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.sandbox.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.sandbox.enabled.name'))
      .setDesc(t('settings.claudeCode.sandbox.enabled.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.settings.sandbox.enabled)
          .onChange(async (value) => {
            this.settings.sandbox.enabled = value;
            await this.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.sandbox.failIfUnavailable.name'))
      .setDesc(t('settings.claudeCode.sandbox.failIfUnavailable.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.settings.sandbox.failIfUnavailable)
          .onChange(async (value) => {
            this.settings.sandbox.failIfUnavailable = value;
            await this.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.sandbox.autoAllowBashIfSandboxed.name'))
      .setDesc(t('settings.claudeCode.sandbox.autoAllowBashIfSandboxed.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.settings.sandbox.autoAllowBashIfSandboxed)
          .onChange(async (value) => {
            this.settings.sandbox.autoAllowBashIfSandboxed = value;
            await this.saveSettings();
          });
      });

    // Sandbox lifecycle honesty: settings only apply to the next query,
    // unlike permissionMode which tries to apply live via setPermissionMode().
    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-sandbox-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.sandbox.lifecycleNotice') });
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

  private renderMainModelProofStatusNotice(containerEl: HTMLElement): void {
    // Live model switching seam: the adapter's setModel() calls
    // applyToActiveQueries → query.setModel() on each active runtime.
    // The diagnostic probe in Capability Lab (runSetModelLiveProbe)
    // proves query.setModel() works mid-stream on a persistent query.
    // Honest boundary: only applies when an active query exists; does
    // NOT prove fallback model switching.
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'main-model', 'data-proof-state': 'pass' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.mainModel') });
  }

  private renderFallbackModelBoundaryNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-fallback-model-boundary',
      attr: { 'data-claude-code-fallback-model-boundary': 'true' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.fallbackModel.boundaryNotice') });
  }

  private renderFallbackModelProofStatusNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'fallback-model', 'data-proof-state': 'readback' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.fallbackModel') });
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
      attr: { 'data-claude-code-proof-status': 'limits', 'data-proof-state': 'pass' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.limits') });
  }

  private renderEnvProofStatusNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'env', 'data-proof-state': 'readback' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.env') });
  }

  private renderFileCheckpointBoundaryNotice(containerEl: HTMLElement): void {
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'file-checkpointing', 'data-proof-state': 'readback' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.fileCheckpointing') });
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
          // If model now matches fallbackModel, clear fallback to avoid guaranteed SDK error
          if (this.settings.fallbackModel && value === this.settings.fallbackModel) {
            this.settings.fallbackModel = '';
            new Notice(t('settings.claudeCode.fallbackModel.clearedByModelChange'));
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
          if (value === this.settings.model) {
            // SDK throws on same-model fallback; reject and revert
            new Notice(t('settings.claudeCode.fallbackModel.sameModelWarning'));
            dropdown.setValue('');
            return;
          }
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
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-mcp-json');
      });
  }

  // ─── Tools tab ───────────────────────────────────────────────────

  private renderToolsTab(containerEl: HTMLElement): void {
    this.renderRuntimeBoundaryNotice(containerEl);
    this.renderMcpRuntimeControls(containerEl);
    this.renderStrictMcpConfigSetting(containerEl);
    this.renderToolsProofStatusNotice(containerEl);
    this.renderAllowedToolsSetting(containerEl);
    this.renderDisallowedToolsSetting(containerEl);
    this.renderRestrictedBuiltinToolsSetting(containerEl);
    this.renderRestrictedBuiltinToolsProofStatusNotice(containerEl);
    this.renderToolAliasesSetting(containerEl);
  }

  private renderMcpRuntimeControls(containerEl: HTMLElement): void {
    const statusEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-claude-code-mcp-runtime',
      attr: {
        'data-claude-code-mcp-runtime': 'true',
        'data-proof-state': 'readback',
      },
    });
    this.updateMcpRuntimeStatus(statusEl);
    let runtimeStatusEl: HTMLElement | null = null;
    const getRuntimeStatusEl = (): HTMLElement => {
      runtimeStatusEl ??= containerEl.createDiv({
        cls: 'opencodian-settings-inline-notice opencodian-claude-code-mcp-runtime-status',
        attr: {
          'data-claude-code-mcp-runtime-status': 'true',
          'data-proof-state': 'readback',
        },
      });
      return runtimeStatusEl;
    };

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
      })
      .addButton((button) => {
        button
          .setButtonText(t('settings.claudeCode.mcpRuntime.inspectButton'))
          .onClick(async () => {
            await this.renderMcpRuntimeStatusReadback(getRuntimeStatusEl());
          });
      });
  }

  private renderStrictMcpConfigSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-strict-mcp-config-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.strictMcpConfig.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.strictMcpConfig.name'))
      .setDesc(t('settings.claudeCode.strictMcpConfig.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.settings.strictMcpConfig)
          .onChange(async (value) => {
            this.settings.strictMcpConfig = value;
            await this.saveSettings();
          });
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-strict-mcp-config-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.strictMcpConfig.lifecycleNotice') });
  }

  private updateMcpRuntimeStatus(statusEl: HTMLElement): void {
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    const count = adapter?.getMcpServerCount?.() ?? 0;
    const names = adapter?.getMcpServerNames?.() ?? [];
    statusEl.setText(
      count > 0
        ? names.length > 0
          ? t('settings.claudeCode.mcpRuntime.loadedWithNames', {
            count,
            names: this.formatRuntimeEcosystemNames(names),
          })
          : t('settings.claudeCode.mcpRuntime.loaded', { count })
        : t('settings.claudeCode.mcpRuntime.empty'),
    );
  }

  private async renderMcpRuntimeStatusReadback(outputEl: HTMLElement): Promise<void> {
    outputEl.empty();
    outputEl.setText(t('settings.claudeCode.mcpRuntime.statusLoading'));
    const adapter = this.getClaudeAdapter() as ClaudeCodeRuntimeEcosystemAdapter | null;
    if (typeof adapter?.getMcpServerRuntimeStatuses !== 'function') {
      outputEl.setText(t('settings.claudeCode.mcpRuntime.statusUnavailable'));
      return;
    }

    let statuses: ClaudeCodeMcpRuntimeStatus[] | null;
    try {
      statuses = await adapter.getMcpServerRuntimeStatuses();
    } catch {
      outputEl.setText(t('settings.claudeCode.mcpRuntime.statusFailed'));
      return;
    }

    outputEl.empty();
    if (!statuses || statuses.length === 0) {
      outputEl.setText(t('settings.claudeCode.mcpRuntime.statusEmpty'));
      return;
    }

    const connectedCount = statuses.filter((status) => status.status === 'connected').length;
    outputEl.createEl('p', {
      text: t('settings.claudeCode.mcpRuntime.statusSummary', {
        count: statuses.length,
        connected: connectedCount,
        failed: statuses.length - connectedCount,
      }),
    });

    for (const status of statuses) {
      const statusBlock = outputEl.createDiv({
        cls: 'opencodian-claude-code-mcp-runtime-status-row',
      });
      statusBlock.createEl('p', {
        text: `${status.name}: ${status.status}${status.scope ? ` (${status.scope})` : ''}`,
      });
      statusBlock.createEl('p', {
        text: status.toolNames.length > 0
          ? t('settings.claudeCode.mcpRuntime.statusTools', {
            names: this.formatRuntimeEcosystemNames(status.toolNames),
          })
          : t('settings.claudeCode.mcpRuntime.statusNoTools'),
      });
      if (status.serverInfo?.name || status.serverInfo?.version) {
        statusBlock.createEl('p', {
          text: t('settings.claudeCode.mcpRuntime.statusServerInfo', {
            name: status.serverInfo.name ?? t('settings.claudeCode.runtimeEcosystem.unnamed'),
            version: status.serverInfo.version ?? t('settings.claudeCode.runtimeEcosystem.unnamed'),
          }),
        });
      }
      if (status.hasError && status.errorSummary) {
        statusBlock.createEl('p', {
          text: status.errorSummary,
        });
      }
    }
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
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-hooks-pre');
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
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-hooks-post');
      });
  }

  private renderRestrictedBuiltinToolsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.restrictedBuiltinTools.name'))
      .setDesc(t('settings.claudeCode.restrictedBuiltinTools.desc'))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(t('settings.claudeCode.restrictedBuiltinTools.placeholder'))
          .setValue(this.settings.restrictedBuiltinTools.join('\n'))
          .onChange(async (value) => {
            this.settings.restrictedBuiltinTools = this.parseToolList(value);
            await this.saveSettings();
          });
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-hooks-stop');
      });
  }

  private renderRestrictedBuiltinToolsProofStatusNotice(containerEl: HTMLElement): void {
    // Evidence-based static classification: the SDK `tools` option is
    // deterministic at init tool-catalog level for built-in tools.
    // This does not depend on whether the setting textbox is filled.
    //
    // Runtime proof boundary (Capability Lab → runRestrictedBuiltinToolsProof):
    //   - Exercises the normal settings wiring path (not _diagnosticToolRestriction)
    //   - Temporarily sets restrictedBuiltinTools=['Read'] on live settings object
    //   - Runs diagnostic prompt, verifies init catalog contains only Read + MCP tools
    //   - Restores original setting
    //   - Built-in tools only: MCP tools always pass through (mcp__ prefix)
    //   - Pass condition: requested tools present, every extra tool has mcp__ prefix
    const noticeEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice opencodian-settings-proof-status',
      attr: { 'data-claude-code-proof-status': 'restricted-builtin-tools', 'data-proof-state': 'pass' },
    });
    noticeEl.createSpan({ text: t('settings.claudeCode.proofStatus.restrictedBuiltinTools') });
  }

  private renderToolAliasesSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-tool-aliases-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.toolAliases.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.toolAliases.name'))
      .setDesc(t('settings.claudeCode.toolAliases.desc'))
      .addTextArea((textArea) => {
        const aliases = this.settings.toolAliases ?? {};
        const value = Object.entries(aliases)
          .map(([key, val]) => `${key}=${val}`)
          .join('\n');
        textArea
          .setPlaceholder(t('settings.claudeCode.toolAliases.placeholder'))
          .setValue(value)
          .onChange(async (raw) => {
            this.settings.toolAliases = this.parseToolAliases(raw);
            await this.saveSettings();
          });
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-hooks-subagent');
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-tool-aliases-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.toolAliases.lifecycleNotice') });
  }

  private parseToolAliases(raw: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0 || eq >= trimmed.length - 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && val) {
        result[key] = val;
      }
    }
    return result;
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

  private renderTaskBudgetSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-task-budget-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.taskBudget.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.taskBudget.name'))
      .setDesc(t('settings.claudeCode.taskBudget.desc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settings.claudeCode.taskBudget.placeholder'))
          .setValue(this.settings.taskBudget === null ? '' : String(this.settings.taskBudget))
          .onChange(async (value) => {
            this.settings.taskBudget = this.parseNullablePositiveInteger(value);
            await this.saveSettings();
          });
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-task-budget-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.taskBudget.lifecycleNotice') });
  }

  private renderSystemPromptSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-system-prompt-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.systemPrompt.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.systemPrompt.name'))
      .setDesc(t('settings.claudeCode.systemPrompt.desc'))
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder(t('settings.claudeCode.systemPrompt.placeholder'))
          .setValue(this.settings.systemPrompt)
          .onChange(async (value) => {
            this.settings.systemPrompt = value.trim();
            await this.saveSettings();
          });
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-env-json');
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-system-prompt-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.systemPrompt.lifecycleNotice') });
  }

  private renderPromptSuggestionsSetting(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName(t('settings.claudeCode.promptSuggestions.name'))
      .setDesc(t('settings.claudeCode.promptSuggestions.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.settings.promptSuggestions)
          .onChange(async (value) => {
            this.settings.promptSuggestions = value;
            await this.saveSettings();
          });
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-prompt-suggestions-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.promptSuggestions.lifecycleNotice') });
  }

  private renderEnableContext1mBetaSetting(containerEl: HTMLElement): void {
    const boundaryEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-enable-context-1m-beta-boundary': 'true' },
    });
    boundaryEl.createSpan({ text: t('settings.claudeCode.enableContext1mBeta.boundaryNotice') });

    new Setting(containerEl)
      .setName(t('settings.claudeCode.enableContext1mBeta.name'))
      .setDesc(t('settings.claudeCode.enableContext1mBeta.desc'))
      .addToggle((toggle) => {
        toggle
          .setValue(this.settings.enableContext1mBeta)
          .onChange(async (value) => {
            this.settings.enableContext1mBeta = value;
            await this.saveSettings();
          });
      });

    const lifecycleEl = containerEl.createDiv({
      cls: 'opencodian-settings-inline-notice',
      attr: { 'data-claude-code-enable-context-1m-beta-lifecycle': 'true' },
    });
    lifecycleEl.createSpan({ text: t('settings.claudeCode.enableContext1mBeta.lifecycleNotice') });
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
        TextareaSizeMemory.attach(textArea.inputEl, 'claude-code-permissions-json');
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
