/**
 * Settings Layout Registry
 *
 * Defines the primary/secondary tab structure for the tabbed settings layout.
 * This registry only owns layout orchestration — no setting save logic lives here.
 */

import type { TranslationKey } from '../../i18n';

export interface SettingsPrimaryTab {
  id: string;
  labelKey: TranslationKey;
  icon: string;
  defaultSecondaryTabId: string;
}

export interface SettingsSecondaryTab {
  id: string;
  labelKey: TranslationKey;
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
      { id: 'language', labelKey: 'settings.general.tab.language' },
    ],
  },
  {
    id: 'server',
    labelKey: 'settings.server.title',
    icon: 'server',
    defaultSecondaryTabId: 'connection',
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
    defaultSecondaryTabId: 'title',
    secondaryTabs: [
      { id: 'title', labelKey: 'settings.conversation.tab.title' },
      { id: 'compaction', labelKey: 'settings.conversation.tab.compaction' },
      { id: 'display', labelKey: 'settings.conversation.tab.display' },
      { id: 'questions', labelKey: 'settings.conversation.tab.questions' },
      { id: 'rendering', labelKey: 'settings.conversation.tab.rendering' },
    ],
  },
  {
    id: 'agents',
    labelKey: 'settings.agents.title',
    icon: 'users',
    defaultSecondaryTabId: 'default',
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
    secondaryTabs: [
      { id: 'overview', labelKey: 'settings.mcp.tab.overview' },
    ],
  },
  {
    id: 'formatter',
    labelKey: 'settings.formatter.title',
    icon: 'paintbrush',
    defaultSecondaryTabId: 'overview',
    secondaryTabs: [
      { id: 'overview', labelKey: 'settings.formatter.tab.overview' },
      { id: 'config', labelKey: 'settings.formatter.tab.config' },
    ],
  },
  {
    id: 'plugins',
    labelKey: 'settings.plugins.title',
    icon: 'package',
    defaultSecondaryTabId: 'overview',
    secondaryTabs: [
      { id: 'overview', labelKey: 'settings.plugins.tab.overview' },
      { id: 'global', labelKey: 'settings.plugins.tab.global' },
      { id: 'project-directory', labelKey: 'settings.plugins.tab.projectDirectory' },
      { id: 'omo', labelKey: 'settings.plugins.tab.omo' },
    ],
  },
  {
    id: 'security',
    labelKey: 'settings.security.title',
    icon: 'shield',
    defaultSecondaryTabId: 'config',
    secondaryTabs: [
      { id: 'config', labelKey: 'settings.security.tab.config' },
      { id: 'permissions', labelKey: 'settings.security.tab.permissions' },
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
    defaultSecondaryTabId: 'general',
    secondaryTabs: [
      { id: 'general', labelKey: 'settings.debug.tab.general' },
      { id: 'modules', labelKey: 'settings.debug.tab.modules' },
      { id: 'logs', labelKey: 'settings.debug.tab.logs' },
      { id: 'actions', labelKey: 'settings.debug.tab.actions' },
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
];

const PRIMARY_TAB_MAP = new Map<string, SettingsPrimaryTabDefinition>();
const LEGACY_PRIMARY_TAB_ID_MAP: Record<string, string> = {
  language: 'general',
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

  const exists = primary.secondaryTabs.some((t) => t.id === candidate);
  if (exists) {
    return candidate;
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
