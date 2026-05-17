import type { SlashCommandMenuItem } from '../../../core/config/slashCommandCatalog';
import { t } from '../../../i18n';

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
  onHoverItem(index: number): void;
  onSelectItem(index: number): void;
}

export interface AgentMentionMenuItem {
  id: string;
  displayName?: string;
  description?: string;
}

interface RenderAgentMentionMenuOptions {
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

  items.forEach((item, index) => {
    const itemEl = menuEl.createDiv({
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
    const stateText = getAgentMentionMenuStateText(status);
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

  items.forEach((item, index) => {
    const itemEl = menuEl.createDiv({
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
  titleRowEl.createDiv({
    cls: 'opencodian-slash-command-menu-title',
    text: `/${item.displayId ?? item.id}`,
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
  titleRowEl.createDiv({
    cls: 'opencodian-slash-command-menu-title',
    text: `@${item.id}`,
  });

  if (item.displayName && item.displayName !== item.id) {
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

function getAgentMentionMenuStateText(status: SlashCommandMenuStatus): string | null {
  const stateTextKeys: Partial<Record<SlashCommandMenuStatus, Parameters<typeof t>[0]>> = {
    loading: 'agentMention.menu.loading',
    emptyCatalog: 'agentMention.menu.empty',
    noMatches: 'agentMention.menu.noMatches',
    loadFailed: 'agentMention.menu.loadFailed',
  };
  const textKey = stateTextKeys[status];
  return textKey ? t(textKey) : null;
}

function buildSourceBadge(item: SlashCommandMenuItem): SlashCommandSourceBadge | null {
  const badge = item.source === 'skill' || item.source === 'skills-command'
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
