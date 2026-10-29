import { setIcon } from 'obsidian';

import type { SlashCommandMenuItem } from '../../../../core/config/slashCommandCatalog';
import type { PromptReference } from '../../../../core/types';
import { t } from '../../../../i18n';

export type SlashCommandMenuStatus =
  | 'idle'
  | 'loading'
  | 'emptyCatalog'
  | 'noMatches'
  | 'loadFailed';

interface SlashCommandSourceBadge {
  text: string;
  cls: string;
}

interface RenderSlashCommandMenuOptions {
  menuEl: HTMLElement;
  items: SlashCommandMenuItem[];
  selectedIndex: number;
  status: SlashCommandMenuStatus;
  isMidText?: boolean;
  grouped?: boolean;
  collapsedGroups?: ReadonlySet<SlashCommandMenuGroup>;
  onToggleGroup?(group: SlashCommandMenuGroup): void;
  onHoverItem(index: number): void;
  onSelectItem(index: number): void;
}

export interface AgentMentionMenuItem {
  id: string;
  displayName?: string;
  description?: string;
  referenceKind?: PromptReference['kind'];
  updatedAt?: number;
}

export type AgentMentionMenuGroup = 'files' | 'sessions' | 'plugins' | 'resources' | 'agents';
export type SlashCommandMenuGroup = 'commands' | 'skills';

export function getSlashCommandMenuGroup(item: SlashCommandMenuItem): SlashCommandMenuGroup {
  return item.source === 'skill' || item.source === 'codex-skill' || item.source === 'skills-command' ? 'skills' : 'commands';
}

export function getAgentMentionMenuGroup(item: AgentMentionMenuItem): AgentMentionMenuGroup {
  return item.referenceKind === 'file' || item.referenceKind === 'folder' ? 'files'
    : item.referenceKind === 'session' ? 'sessions'
      : item.referenceKind === 'plugin' || item.referenceKind === 'app' ? 'plugins'
        : item.referenceKind === 'mcp-resource' ? 'resources' : 'agents';
}

let mentionMenuSequence = 0;

function renderMenuGroup(menuEl: HTMLElement, options: {
  group: string; title: string; count: number; collapsed: boolean; toggle(): void;
}): HTMLElement {
  const { group, title, count, collapsed, toggle } = options;
  if (!menuEl.id) menuEl.id = `opencodian-reference-menu-${++mentionMenuSequence}`;
  const button = menuEl.createEl('button', { cls: 'opencodian-reference-menu-group',
    attr: { type: 'button', 'data-group': group, id: `${menuEl.id}-${group}-heading`,
      'aria-expanded': String(!collapsed), 'aria-controls': `${menuEl.id}-${group}-items` } });
  const chevron = button.createSpan({ cls: 'opencodian-reference-menu-chevron', attr: { 'aria-hidden': 'true' } });
  setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
  button.createSpan({ cls: 'opencodian-reference-menu-group-label', text: title });
  button.createSpan({ cls: 'opencodian-reference-menu-count', text: String(count) });
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', toggle);
  const itemsEl = menuEl.createDiv({ cls: 'opencodian-reference-menu-items',
    attr: { id: `${menuEl.id}-${group}-items`, role: 'group', 'aria-labelledby': button.id } });
  itemsEl.hidden = collapsed;
  return itemsEl;
}

interface RenderAgentMentionMenuOptions {
  unified?: boolean;
  collapsedGroups?: ReadonlySet<AgentMentionMenuGroup>;
  onToggleGroup?(group: AgentMentionMenuGroup): void;
  menuEl: HTMLElement;
  items: AgentMentionMenuItem[];
  selectedIndex: number;
  status: SlashCommandMenuStatus;
  onHoverItem(index: number): void;
  onSelectItem(index: number): void;
}

export function renderSlashCommandMenu(options: RenderSlashCommandMenuOptions): void {
  const {
    menuEl,
    items,
    selectedIndex,
    status,
    isMidText,
    onHoverItem,
    onSelectItem,
  } = options;

  menuEl.replaceChildren();

  if (items.length === 0) {
    const stateText = getSlashCommandMenuStateText(status);
    if (!stateText) {
      menuEl.addClass('is-hidden');
      return;
    }

    menuEl.removeClass('is-hidden');
    menuEl.createDiv({
      cls: `opencodian-slash-command-menu-state opencodian-slash-command-menu-state--${status}`,
      text: stateText,
      attr: { role: 'status' },
    });
    return;
  }

  menuEl.removeClass('is-hidden');

  if (!isMidText) {
    menuEl.createDiv({
      cls: 'opencodian-slash-command-menu-hint',
      text: t('slashCommand.menu.hint'),
      attr: { 'aria-hidden': 'true' },
    });
  }

  let previousGroup = '';
  let groupItemsEl = menuEl;
  const entries = items.map((item, index) => ({ item, index }));
  if (options.grouped !== false) entries.sort((left, right) =>
    Number(getSlashCommandMenuGroup(left.item) === 'skills') - Number(getSlashCommandMenuGroup(right.item) === 'skills'));
  entries.forEach(({ item, index }) => {
    const group = getSlashCommandMenuGroup(item);
    const collapsed = options.grouped !== false && options.collapsedGroups?.has(group) === true;
    if (options.grouped !== false && group !== previousGroup) {
      groupItemsEl = renderMenuGroup(menuEl, { group, title: t(`slashCommand.group.${group}`),
        count: items.filter((candidate) => getSlashCommandMenuGroup(candidate) === group).length,
        collapsed, toggle: () => options.onToggleGroup?.(group) });
      previousGroup = group;
    }
    if (collapsed) return;
    const itemEl = groupItemsEl.createDiv({
      cls: 'opencodian-slash-command-menu-item',
      attr: {
        role: 'option',
        'aria-selected': index === selectedIndex ? 'true' : 'false',
      },
    });

    if (index === selectedIndex) {
      itemEl.addClass('is-selected');
    }

    itemEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    itemEl.addEventListener('mouseenter', () => {
      onHoverItem(index);
    });
    itemEl.addEventListener('click', () => {
      onSelectItem(index);
    });

    renderSlashCommandMenuItem(itemEl, item);
  });
}

export function renderAgentMentionMenu(options: RenderAgentMentionMenuOptions): void {
  const {
    menuEl,
    items,
    selectedIndex,
    status,
    onHoverItem,
    onSelectItem,
  } = options;

  menuEl.replaceChildren();

  if (items.length === 0) {
    const stateText = getAgentMentionMenuStateText(status, options.unified);
    if (!stateText) {
      menuEl.addClass('is-hidden');
      return;
    }

    menuEl.removeClass('is-hidden');
    menuEl.createDiv({
      cls: `opencodian-slash-command-menu-state opencodian-slash-command-menu-state--${status}`,
      text: stateText,
      attr: { role: 'status' },
    });
    return;
  }

  menuEl.removeClass('is-hidden');

  let previousGroup = '';
  let groupItemsEl = menuEl;
  items.forEach((item, index) => {
    const group = getAgentMentionMenuGroup(item);
    const collapsed = options.collapsedGroups?.has(group) === true;
    if (options.unified && group !== previousGroup) {
      groupItemsEl = renderMenuGroup(menuEl, { group, title: t(`referenceMention.group.${group}`),
        count: items.filter((candidate) => getAgentMentionMenuGroup(candidate) === group).length,
        collapsed, toggle: () => options.onToggleGroup?.(group) });
      previousGroup = group;
    }
    if (options.unified && collapsed) return;
    const itemEl = groupItemsEl.createDiv({
      cls: 'opencodian-slash-command-menu-item opencodian-agent-mention-menu-item',
      attr: {
        role: 'option',
        'aria-selected': index === selectedIndex ? 'true' : 'false',
      },
    });

    if (index === selectedIndex) {
      itemEl.addClass('is-selected');
    }

    itemEl.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });
    itemEl.addEventListener('mouseenter', () => {
      onHoverItem(index);
    });
    itemEl.addEventListener('click', () => {
      onSelectItem(index);
    });

    renderAgentMentionMenuItem(itemEl, item);
  });
}

function renderSlashCommandMenuItem(itemEl: HTMLElement, item: SlashCommandMenuItem): void {
  const titleRowEl = itemEl.createDiv({
    cls: 'opencodian-slash-command-menu-title-row',
  });
  // Source-aware title: a direct Codex skill candidate's displayId already
  // starts with `$` (e.g. `$code-review`), so prefixing `/` would render the
  // misleading `/$code-review`. Show it verbatim. Codex skills reached via the
  // `/skills` prefix carry a `skills <name>` displayId, which the `/` prefix
  // renders truthfully as `/skills <name>`. Ordinary slash commands are
  // unaffected.
  const displayId = item.displayId ?? item.id;
  const title = displayId.startsWith('/') || (item.source === 'codex-skill' && displayId.startsWith('$'))
    ? displayId
    : `/${displayId}`;
  titleRowEl.createDiv({
    cls: 'opencodian-slash-command-menu-title',
    text: title,
  });

  const sourceBadge = buildSourceBadge(item);
  if (sourceBadge) {
    titleRowEl.createDiv({
      cls: `opencodian-slash-command-menu-badge ${sourceBadge.cls}`,
      text: sourceBadge.text,
    });
  }
  if (item.isBuiltin) {
    titleRowEl.createDiv({
      cls: 'opencodian-slash-command-menu-badge opencodian-slash-command-menu-badge--builtin',
      text: t('slashCommand.sourceBadge.builtin'),
    });
  }

  const skillSourceText = buildSkillSourceText(item);
  if (skillSourceText) {
    itemEl.createDiv({
      cls: 'opencodian-slash-command-menu-source',
      text: skillSourceText,
      attr: { title: skillSourceText },
    });
  }

  if (item.description) {
    itemEl.createDiv({
      cls: 'opencodian-slash-command-menu-description',
      text: item.description,
      attr: { title: item.description },
    });
  }
}

function renderAgentMentionMenuItem(itemEl: HTMLElement, item: AgentMentionMenuItem): void {
  const titleRowEl = itemEl.createDiv({
    cls: 'opencodian-slash-command-menu-title-row',
  });
  if (item.referenceKind) {
    const icon = titleRowEl.createSpan({ cls: 'opencodian-reference-menu-icon', attr: { 'aria-hidden': 'true' } });
    setIcon(icon, item.referenceKind === 'folder' ? 'folder' : item.referenceKind === 'file' ? 'file-text'
      : item.referenceKind === 'session' ? 'messages-square' : item.referenceKind === 'mcp-resource' ? 'database' : 'puzzle');
  }
  titleRowEl.createDiv({
    cls: 'opencodian-slash-command-menu-title',
    text: item.referenceKind ? item.displayName ?? item.id : `@${item.id}`,
    attr: { title: item.displayName ?? item.id },
  });
  if (item.updatedAt) {
    const date = new Date(item.updatedAt);
    if (!Number.isNaN(date.getTime())) titleRowEl.createSpan({ cls: 'opencodian-reference-menu-date',
      text: date.toLocaleDateString(), attr: { title: date.toLocaleString() } });
  }

  if (!item.referenceKind && item.displayName && item.displayName !== item.id) {
    titleRowEl.createDiv({
      cls: 'opencodian-slash-command-menu-badge opencodian-slash-command-menu-badge--runtime',
      text: item.displayName,
    });
  }

  if (item.description) {
    itemEl.createDiv({
      cls: 'opencodian-slash-command-menu-description',
      text: item.description,
      attr: { title: item.description },
    });
  }
}

function getSlashCommandMenuStateText(status: SlashCommandMenuStatus): string | null {
  const stateTextKeys: Partial<Record<SlashCommandMenuStatus, Parameters<typeof t>[0]>> = {
    loading: 'slashCommand.menu.loading',
    emptyCatalog: 'slashCommand.menu.empty',
    noMatches: 'slashCommand.menu.noMatches',
    loadFailed: 'slashCommand.menu.loadFailed',
  };
  const textKey = stateTextKeys[status];
  return textKey ? t(textKey) : null;
}

function getAgentMentionMenuStateText(status: SlashCommandMenuStatus, unified = false): string | null {
  const stateTextKeys: Partial<Record<SlashCommandMenuStatus, Parameters<typeof t>[0]>> = {
    loading: unified ? 'referenceMention.menu.loading' : 'agentMention.menu.loading',
    emptyCatalog: unified ? 'referenceMention.menu.empty' : 'agentMention.menu.empty',
    noMatches: unified ? 'referenceMention.menu.noMatches' : 'agentMention.menu.noMatches',
    loadFailed: unified ? 'referenceMention.menu.loadFailed' : 'agentMention.menu.loadFailed',
  };
  const textKey = stateTextKeys[status];
  return textKey ? t(textKey) : null;
}

function buildSourceBadge(item: SlashCommandMenuItem): SlashCommandSourceBadge | null {
  const badge = item.source === 'skill' || item.source === 'skills-command' || item.source === 'codex-skill'
    ? { key: 'slashCommand.sourceBadge.skill' as const, cls: 'opencodian-slash-command-menu-badge--skill' }
    : item.runtimeAvailable && item.hasProjectOverride
      ? { key: 'slashCommand.sourceBadge.override' as const, cls: 'opencodian-slash-command-menu-badge--override' }
      : item.runtimeAvailable
        ? { key: 'slashCommand.sourceBadge.command' as const, cls: 'opencodian-slash-command-menu-badge--runtime' }
        : { key: 'slashCommand.sourceBadge.project' as const, cls: 'opencodian-slash-command-menu-badge--project' };

  return {
    text: t(badge.key),
    cls: badge.cls,
  };
}

function buildSkillSourceText(item: SlashCommandMenuItem): string | null {
  if (item.source !== 'skill' || !item.skillSource) {
    return null;
  }

  switch (item.skillSource.kind) {
    case 'project':
      return t('slashCommand.skillSource.project');
    case 'opencodeProject':
      return t('slashCommand.skillSource.opencodeProject');
    case 'plugin':
      return t('slashCommand.skillSource.plugin', {
        name: item.skillSource.pluginName ?? t('slashCommand.skillSource.pluginFallback'),
      });
    case 'global':
      return t('slashCommand.skillSource.global');
    case 'opencodeGlobal':
      return t('slashCommand.skillSource.opencodeGlobal');
    case 'custom':
    default:
      return t('slashCommand.skillSource.custom');
  }
}
