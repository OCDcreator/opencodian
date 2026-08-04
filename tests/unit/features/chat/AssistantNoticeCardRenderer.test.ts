import type { ChatMessage, TurnDiffNoticeEntry } from '../../../../src/core/types';
import { AssistantNoticeCardRenderer } from '../../../../src/features/chat/runtime/AssistantNoticeCardRenderer';
import { t } from '../../../../src/i18n';
import { toVaultRelativePath } from '../../../../src/shared';

const VAULT_BASE = '/Volumes/SDD2T/obsidian-vault-write/testvault';

function createTurnDiffEntries(): TurnDiffNoticeEntry[] {
  return [
    {
      file: `${VAULT_BASE}/OpenCodian-QA-sidebar-turn-diff-card-20260803.md`,
      additions: 12,
      deletions: 3,
      status: 'modified',
    },
    {
      file: `${VAULT_BASE}/custom/deep/nested/导数模型.md`,
      additions: 0,
      deletions: 0,
      status: 'modified',
    },
    { file: `${VAULT_BASE}/notes/added-file.md`, additions: 20, deletions: 0, status: 'added' },
    { file: `${VAULT_BASE}/notes/deleted-file.md`, additions: 0, deletions: 45, status: 'deleted' },
    { file: `${VAULT_BASE}/plain.md`, additions: 2, deletions: 1, status: 'modified' },
    { file: `${VAULT_BASE}/sixth/overflow.md`, additions: 5, deletions: 5, status: 'added' },
  ];
}

function createTurnDiffMessage(entries: TurnDiffNoticeEntry[]): ChatMessage {
  return {
    id: 'turn-diff-notice-1',
    role: 'assistant',
    content: 'OpenCode reported changes to these files:\n\n- [[legacy-persisted-markdown.md]]',
    timestamp: 789,
    displayStyle: 'notice',
    noticeTitle: t('chat.diffNotice.title'),
    noticeTone: 'info',
    noticeMeta: {
      kind: 'turn-diff',
      sourceMessageId: 'user-1',
      entries: Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))),
    },
  };
}

function createRenderer() {
  const renderMarkdownInto = jest.fn(async (container: HTMLElement, markdown: string) => {
    container.setText(`markdown:${markdown}`);
  });
  const handleNoticeAction = jest.fn();
  const handleCollapsibleToggle = jest.fn();
  const resolveVaultRelativePath = jest.fn((filePath: string): string | null => (
    toVaultRelativePath(filePath, VAULT_BASE)
  ));
  const openVaultFile = jest.fn();
  const renderer = new AssistantNoticeCardRenderer({
    renderMarkdownInto,
    handleNoticeAction,
    handleCollapsibleToggle,
    resolveVaultRelativePath,
    openVaultFile,
  });

  return {
    handleCollapsibleToggle,
    handleNoticeAction,
    openVaultFile,
    renderMarkdownInto,
    renderer,
    resolveVaultRelativePath,
  };
}

describe('AssistantNoticeCardRenderer', () => {
  it('renders notice tone, icon, markdown body, and actions through a narrow host', async () => {
    const { handleNoticeAction, renderMarkdownInto, renderer } = createRenderer();
    const container = document.createElement('div');
    const message: ChatMessage = {
      id: 'notice-1',
      role: 'assistant',
      content: 'Notice body',
      timestamp: 123,
      displayStyle: 'notice',
      noticeTitle: 'Heads up',
      noticeTone: 'warning',
      noticeActions: [{ type: 'restore_rewind' }],
    };

    await renderer.render(container, message);

    const card = container.querySelector('.opencodian-chat-notice-card.is-warning');
    expect(card).not.toBeNull();
    expect(card?.classList.contains('is-turn-diff')).toBe(false);
    expect(card?.querySelector('.opencodian-chat-notice-icon svg')?.getAttribute('data-icon'))
      .toBe('alert-triangle');
    expect(container.querySelector('.opencodian-chat-notice-title')?.textContent).toBe('Heads up');
    expect(renderMarkdownInto).toHaveBeenCalledWith(expect.any(HTMLElement), 'Notice body');

    const actionButton = container.querySelector<HTMLButtonElement>('.opencodian-chat-notice-action-btn');
    expect(actionButton?.textContent).toBeTruthy();
    actionButton?.click();
    expect(handleNoticeAction).toHaveBeenCalledWith('restore_rewind');
  });

  it('keeps the generic error and info icon branches intact', async () => {
    const { renderMarkdownInto, renderer } = createRenderer();

    const errorContainer = document.createElement('div');
    await renderer.render(errorContainer, {
      id: 'notice-error',
      role: 'assistant',
      content: 'Error body',
      timestamp: 124,
      displayStyle: 'notice',
      noticeTone: 'error',
    });
    expect(errorContainer.querySelector('.opencodian-chat-notice-card.is-error')).not.toBeNull();
    expect(errorContainer.querySelector('.opencodian-chat-notice-icon svg')?.getAttribute('data-icon'))
      .toBe('x-circle');

    const infoContainer = document.createElement('div');
    await renderer.render(infoContainer, {
      id: 'notice-info',
      role: 'assistant',
      content: 'Info body',
      timestamp: 125,
      displayStyle: 'notice',
      noticeTone: 'info',
    });
    expect(infoContainer.querySelector('.opencodian-chat-notice-card.is-info')).not.toBeNull();
    expect(infoContainer.querySelector('.opencodian-chat-notice-card.is-turn-diff')).toBeNull();
    expect(infoContainer.querySelector('.opencodian-chat-notice-icon svg')?.getAttribute('data-icon'))
      .toBe('info');
    expect(renderMarkdownInto).toHaveBeenCalledWith(expect.any(HTMLElement), 'Info body');
  });

  it('normalizes OMO system reminders into notice body and raw detail blocks', async () => {
    const { renderMarkdownInto, renderer } = createRenderer();
    const container = document.createElement('div');
    const message: ChatMessage = {
      id: 'omo-notice-1',
      role: 'assistant',
      content: 'Fallback content',
      timestamp: 456,
      displayStyle: 'notice',
      omo: {
        kind: 'system-reminder',
        reminderType: 'background-task-completed',
        reminderText: 'Task completed\nEdited [[note.md]]',
        rawText: '<system-reminder>Task completed</system-reminder>',
        headline: 'Task completed',
        isInternalInitiator: false,
      },
    };

    await renderer.render(container, message);

    expect(container.querySelector('.opencodian-chat-notice-icon')).not.toBeNull();
    expect(container.querySelector('.opencodian-chat-notice-title')?.textContent).toBeTruthy();
    expect(renderMarkdownInto).toHaveBeenCalledWith(expect.any(HTMLElement), 'Edited [[note.md]]');
    expect(container.querySelector('.opencodian-omo-raw-block--notice')).not.toBeNull();
    expect(container.querySelector('.opencodian-omo-raw-content')?.textContent)
      .toBe('<system-reminder>Task completed</system-reminder>');
  });
});

describe('AssistantNoticeCardRenderer turn-diff notices', () => {
  it('renders a dedicated compact card without icon, markdown body, or repeated description', async () => {
    const { renderMarkdownInto, renderer } = createRenderer();
    const container = document.createElement('div');

    await renderer.render(container, createTurnDiffMessage(createTurnDiffEntries()));

    const card = container.querySelector('.opencodian-chat-notice-card.is-info.is-turn-diff');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.opencodian-chat-notice-icon')).toBeNull();
    expect(card?.querySelector('.opencodian-chat-notice-title')?.textContent)
      .toBe(t('chat.diffNotice.title'));

    const countBadge = card?.querySelector('.opencodian-turn-diff-count');
    expect(countBadge?.textContent).toBe('6');
    expect(countBadge?.getAttribute('aria-label'))
      .toBe(t('chat.diffNotice.fileCount', { count: 6 }));

    expect(renderMarkdownInto).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(t('chat.diffNotice.description'));
    expect(container.textContent).not.toContain('OpenCode reported changes');
    expect(container.textContent).not.toContain('legacy-persisted-markdown.md');
  });

  it('renders one native single-line button row per file with vault-relative display and tooltip', async () => {
    const { renderer } = createRenderer();
    const container = document.createElement('div');

    await renderer.render(container, createTurnDiffMessage(createTurnDiffEntries()));

    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('button.opencodian-turn-diff-row'));
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row.tagName).toBe('BUTTON');
      expect(row.type).toBe('button');
      expect(row.disabled).toBe(false);
      expect(row.querySelector('.opencodian-turn-diff-path')).not.toBeNull();
      expect(row.querySelector('.opencodian-turn-diff-meta')).not.toBeNull();
    }

    expect(container.innerHTML).not.toContain(VAULT_BASE);
    expect(rows[0].title).toBe('OpenCodian-QA-sidebar-turn-diff-card-20260803.md');
    expect(rows[1].title).toBe('custom/deep/nested/导数模型.md');
    expect(rows[2].title).toBe('notes/added-file.md');
    expect(rows[5].title).toBe('sixth/overflow.md');
  });

  it('compresses root long filenames and deep paths deterministically while keeping extensions', async () => {
    const { renderer } = createRenderer();
    const container = document.createElement('div');

    await renderer.render(container, createTurnDiffMessage(createTurnDiffEntries()));

    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('button.opencodian-turn-diff-row'));

    const rootRow = rows[0];
    expect(rootRow.querySelector('.opencodian-turn-diff-parent')).toBeNull();
    const rootName = rootRow.querySelector('.opencodian-turn-diff-filename')?.textContent;
    expect(rootName).toBe('OpenCodian-QA-side…diff-card-20260803.md');
    expect(rootName).toContain('…');
    expect(rootName?.endsWith('.md')).toBe(true);

    const deepRow = rows[1];
    expect(deepRow.querySelector('.opencodian-turn-diff-parent')?.textContent).toBe('custom/…/');
    expect(deepRow.querySelector('.opencodian-turn-diff-filename')?.textContent).toBe('导数模型.md');
    expect(deepRow.querySelector('.opencodian-turn-diff-path')?.textContent)
      .toBe('custom/…/导数模型.md');

    const shallowRow = rows[2];
    expect(shallowRow.querySelector('.opencodian-turn-diff-parent')?.textContent).toBe('notes/');
    expect(shallowRow.querySelector('.opencodian-turn-diff-filename')?.textContent).toBe('added-file.md');
  });

  it('always renders stat badges including zero values and only labels added/deleted rows', async () => {
    const { renderer } = createRenderer();
    const container = document.createElement('div');

    await renderer.render(container, createTurnDiffMessage(createTurnDiffEntries()));

    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('button.opencodian-turn-diff-row'));
    const statsOf = (row: HTMLButtonElement) => ({
      additions: row.querySelector('.opencodian-turn-diff-stat.is-additions')?.textContent,
      deletions: row.querySelector('.opencodian-turn-diff-stat.is-deletions')?.textContent,
    });

    expect(statsOf(rows[0])).toEqual({ additions: '+12', deletions: '−3' });
    expect(statsOf(rows[1])).toEqual({ additions: '+0', deletions: '−0' });
    expect(statsOf(rows[3])).toEqual({ additions: '+0', deletions: '−45' });

    expect(rows[0].querySelector('.opencodian-turn-diff-status')).toBeNull();
    expect(rows[1].querySelector('.opencodian-turn-diff-status')).toBeNull();
    expect(rows[2].querySelector('.opencodian-turn-diff-status.status-added')?.textContent)
      .toBe(t('chat.diffNotice.statusAdded'));
    expect(rows[3].querySelector('.opencodian-turn-diff-status.status-deleted')?.textContent)
      .toBe(t('chat.diffNotice.statusDeleted'));
  });

  it('collapses to five rows by default and expands/collapses via an accessible DOM-local toggle', async () => {
    const { handleCollapsibleToggle, renderer } = createRenderer();
    const container = document.createElement('div');
    const message = createTurnDiffMessage(createTurnDiffEntries());
    const metaBefore = JSON.stringify(message.noticeMeta);

    await renderer.render(container, message);

    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('button.opencodian-turn-diff-row'));
    expect(rows.slice(0, 5).every((row) => !row.hidden)).toBe(true);
    expect(rows[5].hidden).toBe(true);

    const toggle = container.querySelector<HTMLButtonElement>('button.opencodian-turn-diff-toggle');
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe(t('chat.diffNotice.expandRemaining', { count: 1 }));
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-controls')).toBe('opencodian-turn-diff-list-turn-diff-notice-1');
    expect(container.querySelector('.opencodian-turn-diff-list')?.id)
      .toBe('opencodian-turn-diff-list-turn-diff-notice-1');

    toggle?.click();
    expect(rows.every((row) => !row.hidden)).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.textContent).toBe(t('chat.diffNotice.collapse'));

    toggle?.click();
    expect(rows[5].hidden).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(handleCollapsibleToggle).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(message.noticeMeta)).toBe(metaBefore);
  });

  it('opens the full vault-relative path when a row is clicked, never the compact label', async () => {
    const { openVaultFile, renderer } = createRenderer();
    const container = document.createElement('div');

    await renderer.render(container, createTurnDiffMessage(createTurnDiffEntries()));

    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('button.opencodian-turn-diff-row'));
    rows[0].click();
    expect(openVaultFile).toHaveBeenCalledWith('OpenCodian-QA-sidebar-turn-diff-card-20260803.md');
    rows[1].click();
    expect(openVaultFile).toHaveBeenCalledWith('custom/deep/nested/导数模型.md');
    expect(openVaultFile).not.toHaveBeenCalledWith('OpenCodian-QA-side…diff-card-20260803.md');
    expect(openVaultFile).not.toHaveBeenCalledWith(expect.stringContaining(VAULT_BASE));
  });

  it('fails closed for entries that cannot resolve inside the vault', async () => {
    const { openVaultFile, renderer } = createRenderer();
    const container = document.createElement('div');
    const message = createTurnDiffMessage([
      { file: '/etc/outside-vault.md', additions: 1, deletions: 2, status: 'modified' },
    ]);

    await renderer.render(container, message);

    const row = container.querySelector<HTMLButtonElement>('button.opencodian-turn-diff-row');
    expect(row).not.toBeNull();
    expect(row?.disabled).toBe(true);
    expect(row?.textContent).toContain('outside-vault.md');
    expect(container.innerHTML).not.toContain('/etc');
    expect(row?.title ?? '').not.toContain('/etc');

    row?.click();
    expect(openVaultFile).not.toHaveBeenCalled();
  });

  it('fails closed for vault-prefixed paths containing parent-directory traversal', async () => {
    const { openVaultFile, renderer } = createRenderer();
    const container = document.createElement('div');
    const message = createTurnDiffMessage([
      { file: `${VAULT_BASE}/../etc/traversal.md`, additions: 1, deletions: 0, status: 'modified' },
    ]);

    await renderer.render(container, message);

    const row = container.querySelector<HTMLButtonElement>('button.opencodian-turn-diff-row');
    expect(row?.disabled).toBe(true);
    expect(row?.textContent).toContain('traversal.md');
    expect(container.innerHTML).not.toContain('../etc');
    row?.click();
    expect(openVaultFile).not.toHaveBeenCalled();
  });

  it('keeps small turn-diff lists fully visible without a toggle', async () => {
    const { renderer } = createRenderer();
    const container = document.createElement('div');
    const message = createTurnDiffMessage(createTurnDiffEntries().slice(0, 3));

    await renderer.render(container, message);

    expect(container.querySelectorAll('button.opencodian-turn-diff-row')).toHaveLength(3);
    expect(container.querySelector('button.opencodian-turn-diff-toggle')).toBeNull();
  });
});
