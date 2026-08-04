import { setIcon } from 'obsidian';

import type { ChatMessage, TurnDiffNoticeMeta } from '../../../core/types';
import { getTurnDiffNoticeMeta } from '../../../core/types';
import { t } from '../../../i18n';
import { getFilePathBasename } from '../../../shared';
import { type CollapsibleState, setupCollapsible } from '../rendering/collapsible';

type NoticeActionType = NonNullable<ChatMessage['noticeActions']>[number]['type'];

const TURN_DIFF_MAX_VISIBLE_ROWS = 5;
const TURN_DIFF_MAX_FILENAME_CHARS = 40;
const TURN_DIFF_ELLIPSIS = '…';
const TURN_DIFF_DELETION_SIGN = '−';

interface TurnDiffPathLabel {
  parent: string;
  filename: string;
}

function truncateTurnDiffFilename(filename: string): string {
  if (filename.length <= TURN_DIFF_MAX_FILENAME_CHARS) {
    return filename;
  }

  const dotIndex = filename.lastIndexOf('.');
  const extension = dotIndex > 0 ? filename.slice(dotIndex) : '';
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  const budget = TURN_DIFF_MAX_FILENAME_CHARS - TURN_DIFF_ELLIPSIS.length - extension.length;
  if (budget < 2) {
    return filename;
  }

  const prefixLength = Math.ceil(budget / 2);
  const suffixLength = budget - prefixLength;
  return `${stem.slice(0, prefixLength)}${TURN_DIFF_ELLIPSIS}${stem.slice(stem.length - suffixLength)}${extension}`;
}

function formatTurnDiffPathLabel(relativePath: string): TurnDiffPathLabel {
  const segments = relativePath.split('/').filter((segment) => segment.length > 0);
  const filename = segments[segments.length - 1] ?? relativePath;
  if (segments.length <= 1) {
    return { parent: '', filename: truncateTurnDiffFilename(filename) };
  }

  const parent = segments.length === 2
    ? `${segments[0]}/`
    : `${segments[0]}/${TURN_DIFF_ELLIPSIS}/`;
  return { parent, filename: truncateTurnDiffFilename(filename) };
}

export interface AssistantNoticeCardRendererHost {
  renderMarkdownInto(container: HTMLElement, markdown: string): Promise<void>;
  handleNoticeAction(actionType: NoticeActionType): Promise<void> | void;
  handleCollapsibleToggle?(): void;
  resolveVaultRelativePath(filePath: string): string | null;
  openVaultFile(relativePath: string): void;
}

export class AssistantNoticeCardRenderer {
  constructor(private readonly host: AssistantNoticeCardRendererHost) {}

  async render(container: HTMLElement, message: ChatMessage): Promise<void> {
    const turnDiffMeta = getTurnDiffNoticeMeta(message);
    if (turnDiffMeta) {
      this.renderTurnDiffNotice(container, message, turnDiffMeta);
      return;
    }

    const tone = message.noticeTone ?? 'info';
    const cardEl = container.createDiv({ cls: `opencodian-chat-notice-card is-${tone}` });
    const iconEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-icon' });
    setIcon(
      iconEl,
      tone === 'error' ? 'x-circle' : tone === 'warning' ? 'alert-triangle' : 'info',
    );

    const bodyEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-body' });
    const noticeTitle = message.noticeTitle ?? this.getNoticeTitle(message);
    if (noticeTitle) {
      bodyEl.createDiv({
        cls: 'opencodian-chat-notice-title',
        text: noticeTitle,
      });
    }

    const textEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-text' });
    await this.host.renderMarkdownInto(textEl, this.getNoticeBodyText(message));

    this.renderOmoRawSystemReminder(bodyEl, message);

    if (message.noticeActions && message.noticeActions.length > 0) {
      const actionsEl = bodyEl.createDiv({ cls: 'opencodian-chat-notice-actions' });
      for (const action of message.noticeActions) {
        const buttonEl = actionsEl.createEl('button', {
          cls: 'opencodian-chat-notice-action-btn',
          text: this.getNoticeActionLabel(action.type),
        });
        buttonEl.type = 'button';
        buttonEl.addEventListener('click', () => {
          void this.host.handleNoticeAction(action.type);
        });
      }
    }
  }

  // Turn Change Records get a dedicated compact DOM: no icon, no Markdown body,
  // one native button row per file, DOM-local expand state only. The persisted
  // `message.content` Markdown stays untouched for compatibility but is never
  // read here; the frozen `noticeMeta.entries` are the single data source.
  private renderTurnDiffNotice(
    container: HTMLElement,
    message: ChatMessage,
    meta: TurnDiffNoticeMeta,
  ): void {
    const tone = message.noticeTone ?? 'info';
    const cardEl = container.createDiv({ cls: `opencodian-chat-notice-card is-${tone} is-turn-diff` });
    const bodyEl = cardEl.createDiv({ cls: 'opencodian-chat-notice-body' });

    const headerEl = bodyEl.createDiv({ cls: 'opencodian-turn-diff-header' });
    headerEl.createDiv({
      cls: 'opencodian-chat-notice-title',
      text: message.noticeTitle ?? t('chat.diffNotice.title'),
    });
    headerEl.createSpan({
      cls: 'opencodian-turn-diff-count',
      text: String(meta.entries.length),
      attr: { 'aria-label': t('chat.diffNotice.fileCount', { count: meta.entries.length }) },
    });

    const listId = `opencodian-turn-diff-list-${message.id}`;
    const listEl = bodyEl.createDiv({ cls: 'opencodian-turn-diff-list', attr: { id: listId } });

    const rows: HTMLButtonElement[] = [];
    meta.entries.forEach((entry, index) => {
      rows.push(this.renderTurnDiffRow(listEl, entry, index));
    });

    if (meta.entries.length > TURN_DIFF_MAX_VISIBLE_ROWS) {
      this.renderTurnDiffToggle(bodyEl, listId, rows, meta.entries.length - TURN_DIFF_MAX_VISIBLE_ROWS);
    }
  }

  private renderTurnDiffRow(
    listEl: HTMLElement,
    entry: TurnDiffNoticeMeta['entries'][number],
    index: number,
  ): HTMLButtonElement {
    const rowEl = listEl.createEl('button', {
      cls: `opencodian-turn-diff-row status-${entry.status ?? 'modified'}`,
      attr: { type: 'button' },
    });
    rowEl.hidden = index >= TURN_DIFF_MAX_VISIBLE_ROWS;

    const relativePath = this.host.resolveVaultRelativePath(entry.file);
    const pathEl = rowEl.createSpan({ cls: 'opencodian-turn-diff-path' });
    if (relativePath) {
      const label = formatTurnDiffPathLabel(relativePath);
      if (label.parent) {
        pathEl.createSpan({ cls: 'opencodian-turn-diff-parent', text: label.parent });
      }
      pathEl.createSpan({ cls: 'opencodian-turn-diff-filename', text: label.filename });
      rowEl.title = relativePath;
      rowEl.addEventListener('click', () => {
        this.host.openVaultFile(relativePath);
      });
    } else {
      // Fail closed: never show or open a host-absolute path we cannot prove
      // lives inside the vault; fall back to a non-interactive basename row.
      pathEl.createSpan({
        cls: 'opencodian-turn-diff-filename',
        text: getFilePathBasename(entry.file),
      });
      rowEl.disabled = true;
      rowEl.classList.add('is-unresolved');
    }

    const metaEl = rowEl.createSpan({ cls: 'opencodian-turn-diff-meta' });
    if (entry.status === 'added' || entry.status === 'deleted') {
      metaEl.createSpan({
        cls: `opencodian-turn-diff-status status-${entry.status}`,
        text: entry.status === 'added'
          ? t('chat.diffNotice.statusAdded')
          : t('chat.diffNotice.statusDeleted'),
      });
    }
    metaEl.createSpan({ cls: 'opencodian-turn-diff-stat is-additions', text: `+${entry.additions}` });
    metaEl.createSpan({
      cls: 'opencodian-turn-diff-stat is-deletions',
      text: `${TURN_DIFF_DELETION_SIGN}${entry.deletions}`,
    });
    return rowEl;
  }

  private renderTurnDiffToggle(
    bodyEl: HTMLElement,
    listId: string,
    rows: HTMLButtonElement[],
    hiddenCount: number,
  ): void {
    const toggleEl = bodyEl.createEl('button', {
      cls: 'opencodian-turn-diff-toggle',
      text: t('chat.diffNotice.expandRemaining', { count: hiddenCount }),
      attr: { type: 'button', 'aria-expanded': 'false', 'aria-controls': listId },
    });
    let expanded = false;
    toggleEl.addEventListener('click', () => {
      expanded = !expanded;
      rows.forEach((rowEl, index) => {
        rowEl.hidden = !expanded && index >= TURN_DIFF_MAX_VISIBLE_ROWS;
      });
      toggleEl.setAttribute('aria-expanded', String(expanded));
      toggleEl.textContent = expanded
        ? t('chat.diffNotice.collapse')
        : t('chat.diffNotice.expandRemaining', { count: hiddenCount });
      this.host.handleCollapsibleToggle?.();
    });
  }

  private renderOmoRawSystemReminder(bodyEl: HTMLElement, message: ChatMessage): void {
    if (message.omo?.kind !== 'system-reminder') {
      return;
    }

    const rawWrapperEl = bodyEl.createDiv({
      cls: 'opencodian-omo-raw-block opencodian-omo-raw-block--notice',
    });
    rawWrapperEl.createDiv({
      cls: 'opencodian-omo-raw-label',
      text: t('chat.omo.system.rawLabel'),
    });
    const rawContentEl = rawWrapperEl.createEl('pre', {
      cls: 'opencodian-omo-raw-content',
      text: message.omo.rawText,
    });
    const rawToggleEl = rawWrapperEl.createEl('button');
    const rawState: CollapsibleState = {
      isExpanded: false,
      isCollapsible: false,
    };
    setupCollapsible({
      wrapperEl: rawWrapperEl,
      headerEl: rawToggleEl,
      contentEl: rawContentEl,
      state: rawState,
      options: {
        collapsedHeight: 88,
        showMoreLabel: t('chat.omo.system.showRaw'),
        showLessLabel: t('chat.omo.system.hideRaw'),
      },
      onToggle: () => this.host.handleCollapsibleToggle?.(),
    });
  }

  private getNoticeTitle(message: ChatMessage): string | undefined {
    if (message.omo?.kind !== 'system-reminder') {
      return undefined;
    }

    switch (message.omo.reminderType) {
      case 'background-task-completed':
        return t('chat.omo.system.backgroundCompleted');
      case 'all-background-tasks-complete':
        return t('chat.omo.system.allCompleted');
      default:
        return t('chat.omo.system.generic');
    }
  }

  private getNoticeBodyText(message: ChatMessage): string {
    if (message.omo?.kind !== 'system-reminder') {
      return message.content;
    }

    const lines = message.omo.reminderText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const headline = message.omo.headline;
    const detailLines = lines.filter((line) => line !== headline);
    if (detailLines.length > 0) {
      return detailLines.join('\n\n');
    }

    switch (message.omo.reminderType) {
      case 'background-task-completed':
        return t('chat.omo.system.backgroundCompletedSummary');
      case 'all-background-tasks-complete':
        return t('chat.omo.system.allCompletedSummary');
      default:
        return message.content || headline;
    }
  }

  private getNoticeActionLabel(actionType: NoticeActionType): string {
    switch (actionType) {
      case 'open_model_settings':
        return t('chat.notice.action.openModelSettings');
      case 'restore_rewind':
        return t('chat.rewind.empty.restore');
      default:
        return t('chat.notice.action.openModelSettings');
    }
  }
}
