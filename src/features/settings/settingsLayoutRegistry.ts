/**
 * Settings Layout Registry
 *
 * Defines the primary/secondary tab structure for the tabbed settings layout.
 * This registry only owns layout orchestration — no setting save logic lives here.
 */

import type { AgentBackendKind } from '../../core/types/chat';
import type { TranslationKey } from '../../i18n';

export interface SettingsPrimaryTab {
  id: string;
  labelKey: TranslationKey;
  icon: string;
  defaultSecondaryTabId: string;
  backendRequired?: AgentBackendKind;
}

export interface SettingsSecondaryTab {
  id: string;
  labelKey: TranslationKey;
  backendRequired?: AgentBackendKind;
}

export interface SettingsPrimaryTabDefinition extends SettingsPrimaryTab {
  secondaryTabs: SettingsSecondaryTab[];
}

export const SETTINGS_PRIMARY_TABS: SettingsPrimaryTabDefinition[] = [
  {
    id: 'general',
    labelKey: 'settings.general.title',
    icon: 'sliders-horizontal',
    defaultSecondaryTabId: 'basic',
    secondaryTabs: [
      { id: 'basic', labelKey: 'settings.general.tab.basic' },
      { id: 'agents', labelKey: 'settings.general.tab.agents' },
    ],
  },
  {
    id: 'claude-code',
    labelKey: 'settings.claudeCode.title',
    icon: 'sparkles',
    defaultSecondaryTabId: 'runtime',
    backendRequired: 'claude-code',
    secondaryTabs: [
      { id: 'runtime', labelKey: 'settings.claudeCode.tab.runtime' },
      { id: 'providers', labelKey: 'settings.claudeCode.tab.providers' },
      { id: 'model-thinking', labelKey: 'settings.claudeCode.tab.modelThinking' },
      { id: 'permissions', labelKey: 'settings.claudeCode.tab.permissions' },
      { id: 'context-sources', labelKey: 'settings.claudeCode.tab.contextSources' },
      { id: 'tools', labelKey: 'settings.claudeCode.tab.tools' },
      { id: 'mcp', labelKey: 'settings.claudeCode.tab.mcp' },
      { id: 'skills-commands', labelKey: 'settings.claudeCode.tab.skillsCommands' },
      { id: 'agents', labelKey: 'settings.claudeCode.tab.agents' },
    ],
  },
  {
    id: 'codex',
    labelKey: 'settings.codex.title',
    icon: 'code',
    defaultSecondaryTabId: 'connection',
    backendRequired: 'codex',
    secondaryTabs: [
      { id: 'connection', labelKey: 'settings.codex.tab.connection' },
      { id: 'permissions', labelKey: 'settings.codex.tab.permissions' },
      { id: 'project-config', labelKey: 'settings.codex.tab.projectConfig' },
      { id: 'resume-inspect', labelKey: 'settings.codex.tab.resumeInspect' },
      { id: 'account', labelKey: 'settings.codex.tab.account' },
      { id: 'resources', labelKey: 'settings.codex.tab.resources' },
    ],
  },
  {
    id: 'server',
    labelKey: 'settings.server.title',
    icon: 'server',
    defaultSecondaryTabId: 'connection',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'connection', labelKey: 'settings.server.tab.connection' },
      { id: 'auth', labelKey: 'settings.server.tab.auth' },
      { id: 'status', labelKey: 'settings.server.tab.status' },
    ],
  },
  {
    id: 'model',
    labelKey: 'settings.model.title',
    icon: 'bot',
    defaultSecondaryTabId: 'common',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'common', labelKey: 'settings.model.tab.common' },
      { id: 'project-config', labelKey: 'settings.model.tab.projectConfig' },
      { id: 'availability', labelKey: 'settings.model.tab.availability' },
      { id: 'tools', labelKey: 'settings.model.tab.tools' },
    ],
  },
  {
    id: 'conversation',
    labelKey: 'settings.conversation.title',
    icon: 'messages-square',
    defaultSecondaryTabId: 'display',
    secondaryTabs: [
      { id: 'title', labelKey: 'settings.conversation.tab.title' },
      { id: 'compaction', labelKey: 'settings.conversation.tab.compaction', backendRequired: 'opencode' },
      { id: 'sharing', labelKey: 'settings.conversation.tab.sharing', backendRequired: 'opencode' },
      { id: 'display', labelKey: 'settings.conversation.tab.display' },
      { id: 'questions', labelKey: 'settings.conversation.tab.questions', backendRequired: 'opencode' },
    ],
  },
  {
    id: 'agents',
    labelKey: 'settings.agents.title',
    icon: 'users',
    defaultSecondaryTabId: 'default',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'default', labelKey: 'settings.agents.tab.default' },
      { id: 'catalog', labelKey: 'settings.agents.tab.catalog' },
      { id: 'editor', labelKey: 'settings.agents.tab.editor' },
      { id: 'workspace', labelKey: 'settings.agents.tab.workspace' },
    ],
  },
  {
    id: 'commands',
    labelKey: 'settings.commands.title',
    icon: 'terminal-square',
    defaultSecondaryTabId: 'mode',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'mode', labelKey: 'settings.commands.tab.mode' },
      { id: 'editor', labelKey: 'settings.commands.tab.editor' },
      { id: 'catalog', labelKey: 'settings.commands.tab.catalog' },
    ],
  },
  {
    id: 'mcp',
    labelKey: 'settings.mcp.title',
    icon: 'blocks',
    defaultSecondaryTabId: 'overview',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'overview', labelKey: 'settings.mcp.tab.overview' },
    ],
  },
  {
    id: 'formatter',
    labelKey: 'settings.formatter.title',
    icon: 'paintbrush',
    defaultSecondaryTabId: 'overview',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'overview', labelKey: 'settings.formatter.tab.overview' },
      { id: 'formatter', labelKey: 'settings.formatter.tab.formatter' },
      { id: 'lsp', labelKey: 'settings.formatter.tab.lsp' },
    ],
  },
  {
    id: 'plugins',
    labelKey: 'settings.plugins.title',
    icon: 'package',
    defaultSecondaryTabId: 'overview',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'overview', labelKey: 'settings.plugins.tab.overview' },
      { id: 'config-sources', labelKey: 'settings.plugins.tab.configSources' },
      { id: 'project-plugins', labelKey: 'settings.plugins.tab.projectPlugins' },
      { id: 'omo', labelKey: 'settings.plugins.tab.omo' },
    ],
  },
  {
    id: 'security',
    labelKey: 'settings.security.title',
    icon: 'shield',
    defaultSecondaryTabId: 'config',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'config', labelKey: 'settings.security.tab.config' },
      { id: 'safety', labelKey: 'settings.security.tab.safety' },
    ],
  },
  {
    id: 'ui',
    labelKey: 'settings.ui.title',
    icon: 'layout-dashboard',
    defaultSecondaryTabId: 'general',
    secondaryTabs: [
      { id: 'general', labelKey: 'settings.ui.tab.general' },
    ],
  },
  {
    id: 'style',
    labelKey: 'settings.style.title',
    icon: 'palette',
    defaultSecondaryTabId: 'presets',
    secondaryTabs: [
      { id: 'presets', labelKey: 'settings.style.tab.presets' },
      { id: 'background', labelKey: 'settings.style.tab.background' },
      { id: 'layout', labelKey: 'settings.style.tab.layout' },
      { id: 'user', labelKey: 'settings.style.tab.user' },
      { id: 'assistant', labelKey: 'settings.style.tab.assistant' },
      { id: 'input', labelKey: 'settings.style.tab.input' },
      { id: 'scrollbar', labelKey: 'settings.style.tab.scrollbar' },
      { id: 'advanced', labelKey: 'settings.style.tab.advanced' },
    ],
  },
  {
    id: 'debug',
    labelKey: 'settings.debug.title',
    icon: 'bug',
    defaultSecondaryTabId: 'plugin',
    secondaryTabs: [
      { id: 'plugin', labelKey: 'settings.debug.tab.plugin' },
      { id: 'opencode', labelKey: 'settings.debug.tab.opencode' },
      { id: 'codex', labelKey: 'settings.debug.tab.codex' },
      { id: 'claude-code', labelKey: 'settings.debug.tab.claudeCode' },
      { id: 'export', labelKey: 'settings.debug.tab.export' },
      { id: 'capability-lab', labelKey: 'settings.debug.tab.capabilityLab' },
    ],
  },
  {
    id: 'user',
    labelKey: 'settings.user.title',
    icon: 'user-round',
    defaultSecondaryTabId: 'profile',
    secondaryTabs: [
      { id: 'profile', labelKey: 'settings.user.tab.profile' },
      { id: 'prompt', labelKey: 'settings.user.tab.prompt' },
      { id: 'tags', labelKey: 'settings.user.tab.tags' },
    ],
  },
  {
    id: 'skills',
    labelKey: 'settings.skills.title',
    icon: 'brain',
    defaultSecondaryTabId: 'project',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'project', labelKey: 'settings.skills.tab.project' },
      { id: 'external', labelKey: 'settings.skills.tab.external' },
    ],
  },
  {
    id: 'tools',
    labelKey: 'settings.tools.title',
    icon: 'wrench',
    defaultSecondaryTabId: 'builtin',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'builtin', labelKey: 'settings.tools.tab.builtin' },
      { id: 'custom', labelKey: 'settings.tools.tab.custom' },
    ],
  },
  {
    id: 'acp',
    labelKey: 'settings.acp.title',
    icon: 'radio-tower',
    defaultSecondaryTabId: 'agents',
    backendRequired: 'opencode',
    secondaryTabs: [
      { id: 'agents', labelKey: 'settings.acp.tab.agents' },
    ],
  },
];

const PRIMARY_TAB_MAP = new Map<string, SettingsPrimaryTabDefinition>();
const LEGACY_PRIMARY_TAB_ID_MAP: Record<string, string> = {
  language: 'general',
};
const LEGACY_SECONDARY_TAB_ID_MAP: Record<string, Record<string, string>> = {
  general: {
    language: 'basic',
    backend: 'agents',
  },
  conversation: {
    rendering: 'display',
  },
  'claude-code': {
    'mcp-advanced': 'mcp',
    mcpAdvanced: 'mcp',
    limits: 'runtime',
    resources: 'skills-commands',
  },
  security: {
    permissions: 'config',
  },
  debug: {
    general: 'plugin',
    modules: 'plugin',
    logs: 'export',
    actions: 'export',
  },
  plugins: {
    global: 'config-sources',
    'project-directory': 'project-plugins',
  },
};
for (const tab of SETTINGS_PRIMARY_TABS) {
  PRIMARY_TAB_MAP.set(tab.id, tab);
}

export function getPrimaryTabDefinition(id: string): SettingsPrimaryTabDefinition | undefined {
  const normalizedId = LEGACY_PRIMARY_TAB_ID_MAP[id] ?? id;
  return PRIMARY_TAB_MAP.get(normalizedId);
}

export function resolvePrimaryTabId(candidate: string): string {
  const normalizedCandidate = LEGACY_PRIMARY_TAB_ID_MAP[candidate] ?? candidate;
  if (PRIMARY_TAB_MAP.has(normalizedCandidate)) {
    return normalizedCandidate;
  }

  return SETTINGS_PRIMARY_TABS[0]?.id ?? 'general';
}

export function resolveSecondaryTabId(primaryTabId: string, candidate: string): string {
  const resolvedPrimaryTabId = resolvePrimaryTabId(primaryTabId);
  const primary = PRIMARY_TAB_MAP.get(resolvedPrimaryTabId);
  if (!primary) {
    return resolveSecondaryTabId(SETTINGS_PRIMARY_TABS[0]?.id ?? 'general', candidate);
  }

  const normalizedCandidate = LEGACY_SECONDARY_TAB_ID_MAP[resolvedPrimaryTabId]?.[candidate] ?? candidate;
  const exists = primary.secondaryTabs.some((t) => t.id === normalizedCandidate);
  if (exists) {
    return normalizedCandidate;
  }

  return primary.defaultSecondaryTabId;
}

export function getActiveSecondaryTabId(
  primaryTabId: string,
  secondaryTabByPrimary: Record<string, string>,
): string {
  const resolvedPrimaryTabId = resolvePrimaryTabId(primaryTabId);
  const saved = secondaryTabByPrimary[resolvedPrimaryTabId]
    ?? (
      resolvedPrimaryTabId === 'general'
        ? secondaryTabByPrimary.language === 'general'
          ? 'language'
          : secondaryTabByPrimary.language
        : undefined
    );
  if (saved) {
    return resolveSecondaryTabId(resolvedPrimaryTabId, saved);
  }

  const primary = PRIMARY_TAB_MAP.get(resolvedPrimaryTabId);
  return primary?.defaultSecondaryTabId ?? 'basic';
}
