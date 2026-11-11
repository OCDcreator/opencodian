/** Repository surface of the session workbench: explicit git reads and mutations with session-scoped drafts. */
import { setIcon } from 'obsidian';

import type { WorkbenchGitFile, WorkbenchGitSnapshot, WorkbenchHostRuntime } from '../../../core/runtime/WorkbenchHostRuntime';
import { t } from '../../../i18n';

/** Bounded memory: sessions remembered, diffs kept per session, characters of diff and of failure detail. */
const SESSION_LIMIT = 24, DIFF_CACHE_LIMIT = 12, DIFF_LIMIT = 200_000, DETAIL_LIMIT = 240;
const isStaged = (file: WorkbenchGitFile): boolean => file.index !== ' ' && file.index !== '?';

type ReadFailure = { kind: 'not-repo' | 'directory' | 'git' | 'failed'; text: string };
/** One session's repository drafts, keyed by workbench identity and never by detached DOM. */
interface RepositoryDraft {
  message: string; branch: string; directory: string; worktreesOpen: boolean;
  /** Paths of open file rows, of diff reads in flight, and of reads requested while one was in flight. */
  open: Set<string>; pending: Set<string>; requeue: Set<string>;
  diffs: Map<string, string>;
}
/** Stable DOM handles of the mounted panel; dropped together on detach. */
interface RepositoryDom {
  toolbar: HTMLElement; labelText: HTMLElement; detailText: HTMLElement; state: HTMLElement; stateText: HTMLElement; stateHint: HTMLElement; content: HTMLElement;
  files: HTMLElement; filesCount: HTMLElement; message: HTMLTextAreaElement; commit: HTMLButtonElement; commitHint: HTMLElement;
  worktrees: HTMLDetailsElement; worktreeList: HTMLElement; worktreeCount: HTMLElement; branch: HTMLInputElement; worktreePath: HTMLInputElement;
}

/** Only what the repository surface needs from the workbench host; mutations stay in the host runtime. */
export interface SessionWorkbenchRepositoryHost {
  runtime: Pick<WorkbenchHostRuntime, 'readGit' | 'gitDiff' | 'stageFile' | 'commit' | 'createWorktree'>;
  workingDirectory(): string;
  defaultWorktreeDirectory(): string;
  setDraft(text: string): void;
}

/** Presentation owned by the tools shell, so every tool shares one button, enablement and error model. */
export interface SessionWorkbenchRepositoryShell {
  button(parent: HTMLElement, label: string, icon: string, action: () => void | Promise<void>): HTMLButtonElement;
  enable(button: HTMLButtonElement | undefined, enabled: boolean): void;
  showError(message: string): void;
  clearError(): void;
}

/** The header the shell built for this tool: where branch and root are shown and where actions are added. */
export interface SessionWorkbenchRepositoryHeader { label: HTMLElement; detail: HTMLElement; actions: HTMLElement }

/** One bounded, single-line, credential-free failure detail. Never a raw multi-line stderr. */
export function failureDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const plain = raw.split(String.fromCharCode(27)).map((part, index) => index ? part.replace(/^\[[0-9;?]*[ -/]*[@-~]/, '') : part).join('');
  const readable = [...plain].map((char) => { const code = char.codePointAt(0) ?? 0; return code < 32 || code === 127 ? ' ' : char; }).join('');
  const text = readable.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@').replace(/\s+/g, ' ').trim();
  return text.length > DETAIL_LIMIT ? `${text.slice(0, DETAIL_LIMIT - 1)}…` : text;
}

/** Bounded most-recent-last insert, so per-session drafts cannot grow with tab churn. */
export function store<K, V>(map: Map<K, V>, key: K, value: V, limit = SESSION_LIMIT): V {
  map.delete(key); map.set(key, value);
  while (map.size > limit) map.delete(map.keys().next().value as K);
  return value;
}

/** Localized read failure. Git's own wording (en/zh) classifies; anything else stays an honest generic failure. */
function classifyRead(error: unknown): ReadFailure {
  const detail = failureDetail(error);
  if (/not a git repository|不是\s*git\s*仓库/i.test(detail)) return { kind: 'not-repo', text: t('workbench.git.notRepository') };
  if (/\b(ENOENT|ENOTDIR|EACCES)\b.*\brealpath\b/i.test(detail)) return { kind: 'directory', text: t('workbench.git.directoryMissing') };
  if (/spawn git ENOENT/i.test(detail)) return { kind: 'git', text: t('workbench.git.unavailable') };
  return { kind: 'failed', text: `${t('workbench.git.readFailed')} ${detail}`.trim() };
}

/**
 * The one owner of repository state in the workbench: the snapshot, the per-session drafts, pending diff reads
 * and the generations that decide which asynchronous result may still land. The tools shell composes it through
 * mount / update / show / refresh / detach and supplies presentation only.
 */
export class SessionWorkbenchRepository {
  private readonly drafts = new Map<string, RepositoryDraft>();
  private dom: Partial<RepositoryDom> = {};
  private identity: string | null = null;
  private snapshot: WorkbenchGitSnapshot | null = null;
  private failure: ReadFailure | null = null;
  /** Working directory of the last read, so showing the tool again does not re-run git. */
  private attempted: string | null = null;
  /** `generation` is one session visit (it also moves on detach); `revision` is one repository read. */
  private generation = 0;
  private revision = 0;

  constructor(private readonly host: SessionWorkbenchRepositoryHost, private readonly shell: SessionWorkbenchRepositoryShell) {}

  mount(panel: HTMLElement, header: SessionWorkbenchRepositoryHeader): void {
    const status = header.label.parentElement;
    const toolbar = status?.parentElement?.hasClass('opencodian-workbench-tool-toolbar') ? status.parentElement : null;
    if (toolbar) {
      toolbar.addClass('opencodian-workbench-repository-toolbar');
      // The branch and actions share row one; the full working-directory readback owns row two.
      toolbar.appendChild(header.detail);
    }
    header.label.empty(); header.label.addClass('opencodian-workbench-repository-branch');
    setIcon(header.label.createSpan({ cls: 'opencodian-workbench-repository-branch-icon', attr: { 'aria-hidden': 'true' } }), 'git-branch');
    const labelText = header.label.createSpan();
    header.detail.empty(); header.detail.addClass('opencodian-workbench-repository-path');
    setIcon(header.detail.createSpan({ cls: 'opencodian-workbench-repository-path-icon', attr: { 'aria-hidden': 'true' } }), 'folder');
    const detailText = header.detail.createSpan({ cls: 'opencodian-workbench-repository-path-text' });
    this.dom = { labelText, detailText, ...(toolbar ? { toolbar } : {}) };
    this.shell.button(header.actions, t('workbench.git.refresh'), 'refresh-cw', () => this.refresh());
    this.shell.button(header.actions, t('workbench.git.review'), 'git-pull-request', () => this.host.setDraft(t('workbench.git.reviewPrompt')));
    const state = this.dom.state = panel.createDiv({ cls: 'opencodian-workbench-tool-state opencodian-workbench-repository-state', attr: { role: 'status' } });
    const stateHeading = state.createDiv({ cls: 'opencodian-workbench-repository-state-heading' });
    setIcon(stateHeading.createSpan({ cls: 'opencodian-workbench-empty-icon', attr: { 'aria-hidden': 'true' } }), 'folder-git-2');
    this.dom.stateText = stateHeading.createEl('p', { cls: 'opencodian-workbench-repository-state-title' });
    const path = state.createDiv({ cls: 'opencodian-workbench-path' });
    path.createSpan({ text: t('workbench.cwd') }); this.dom.stateHint = path.createEl('code');
    const actions = state.createDiv({ cls: 'opencodian-workbench-tool-primary-actions' });
    this.shell.button(actions, t('workbench.retry'), 'refresh-cw', () => this.refresh());
    this.shell.button(actions, t('workbench.git.review'), 'git-pull-request', () => this.host.setDraft(t('workbench.git.reviewPrompt')));
    const content = this.dom.content = panel.createDiv();
    const files = content.createDiv({ cls: 'opencodian-workbench-git-files', attr: { role: 'group', 'aria-label': t('workbench.git.changes') } });
    const heading = files.createDiv({ cls: 'opencodian-workbench-group-label' });
    heading.createSpan({ text: t('workbench.git.changes') });
    this.dom.filesCount = heading.createSpan({ cls: 'opencodian-workbench-row-meta' });
    files.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.git.sessionHelp') });
    this.dom.files = files.createDiv();
    // One form: the message and the action that consumes it. Enter in the message never commits.
    const form = content.createEl('form', { cls: 'opencodian-workbench-git-commit-form' });
    form.addEventListener('submit', (event) => event.preventDefault());
    this.dom.message = this.field(form, t('workbench.git.message'), 'textarea', (draft, value) => { draft.message = value; });
    this.dom.commitHint = form.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.git.nothingStaged') });
    this.dom.commit = this.shell.button(form.createDiv({ cls: 'opencodian-workbench-tool-primary-actions' }), t('workbench.git.commit'), 'git-commit-horizontal', () => this.commit());
    const worktrees = this.dom.worktrees = content.createEl('details', { cls: 'opencodian-workbench-git-worktrees' });
    const summary = worktrees.createEl('summary');
    summary.createSpan({ text: t('workbench.git.worktrees') });
    this.dom.worktreeCount = summary.createSpan({ cls: 'opencodian-workbench-row-meta' });
    worktrees.addEventListener('toggle', () => { const draft = this.current(); if (draft && worktrees.isConnected) draft.worktreesOpen = worktrees.open; });
    this.dom.worktreeList = worktrees.createDiv();
    this.dom.branch = this.field(worktrees, t('workbench.git.worktreeBranch'), 'input', (draft, value) => { draft.branch = value; });
    this.dom.branch.placeholder = 'codex/feature';
    this.dom.worktreePath = this.field(worktrees, t('workbench.git.worktreePath'), 'input', (draft, value) => { draft.directory = value; });
    this.shell.button(worktrees.createDiv({ cls: 'opencodian-workbench-tool-secondary-actions' }), t('workbench.git.createWorktree'), 'git-branch', () => this.createWorktree());
    if (this.identity) this.restore(this.identity);
  }

  /** Projects the session now on screen. A switch drops the previous session's view and everything it had in flight. */
  update(identity: string): void {
    if (identity === this.identity) return;
    this.identity = identity; this.generation++; this.revision++;
    this.snapshot = null; this.failure = null; this.attempted = null;
    this.restore(identity);
  }

  /** The tool became visible: read once per working directory; later reads are explicit. */
  show(): void { if (this.identity && this.attempted !== this.host.workingDirectory()) void this.refresh(); }

  async refresh(): Promise<void> {
    if (!this.identity) return;
    const lease = this.lease(); const directory = this.host.workingDirectory();
    const revision = ++this.revision;
    this.attempted = directory;
    if (!this.snapshot) { this.failure = null; this.render(); }
    // Owner gate: only the newest read of the still-current session visit may write.
    const current = () => revision === this.revision && lease === this.lease();
    try {
      const snapshot = await this.host.runtime.readGit(directory);
      if (!current()) return;
      this.snapshot = snapshot; this.failure = null;
      this.shell.clearError(); this.render();
      // Open diffs stay on screen and are re-read behind them, so stage/unstage/refresh never blanks a row.
      this.loadOpenDiffs();
    } catch (error) {
      if (!current()) return;
      this.snapshot = null; this.failure = classifyRead(error);
      this.render();
    }
  }

  /** Removes the UI only. The snapshot and drafts survive a remount; anything in flight loses its owner. */
  detach(): void { this.dom = {}; this.generation++; this.revision++; }

  /** One session visit. A→B→A yields a new lease, so nothing that started before a switch can land after it. */
  private lease(): string { return `${this.generation}:${this.identity ?? ''}`; }

  private draft(identity: string): RepositoryDraft {
    return store(this.drafts, identity, this.drafts.get(identity) ?? { message: '', branch: '', directory: this.host.defaultWorktreeDirectory(),
      worktreesOpen: false, open: new Set<string>(), pending: new Set<string>(), requeue: new Set<string>(), diffs: new Map<string, string>() });
  }

  private current(): RepositoryDraft | null { return this.identity ? this.drafts.get(this.identity) ?? null : null; }

  /** A labelled field whose input goes to the CURRENT session's draft at typing time, never to a captured one. */
  private field<K extends 'input' | 'textarea'>(parent: HTMLElement, label: string, tag: K, write: (draft: RepositoryDraft, value: string) => void): HTMLElementTagNameMap[K] {
    const field = parent.createEl('label', { cls: 'opencodian-workbench-field', text: label }).createEl(tag, tag === 'textarea' ? { attr: { rows: '2' } } : { type: 'text' });
    field.addEventListener('input', () => { const draft = this.current(); if (draft) write(draft, field.value); });
    return field;
  }

  /** Writes a session's draft into the stable fields after a switch or remount; afterwards the fields own their value. */
  private restore(identity: string): void {
    const draft = this.draft(identity); const { message, branch, worktreePath, worktrees } = this.dom;
    if (message && message.value !== draft.message) message.value = draft.message;
    if (branch && branch.value !== draft.branch) branch.value = draft.branch;
    if (worktreePath && worktreePath.value !== draft.directory) worktreePath.value = draft.directory;
    if (worktrees) worktrees.open = draft.worktreesOpen;
    this.render(); this.loadOpenDiffs();
  }

  private render(): void {
    const { state, content, files } = this.dom; const snapshot = this.snapshot;
    if (!state || !content || !files) return;
    const cwd = this.host.workingDirectory();
    state.hidden = Boolean(snapshot); content.hidden = !snapshot;
    if (this.dom.toolbar) this.dom.toolbar.hidden = !snapshot;
    this.dom.labelText?.setText(snapshot ? snapshot.branch : t('workbench.git'));
    this.dom.detailText?.setText(snapshot ? snapshot.root : cwd);
    if (!snapshot) {
      // Honest localized states: reading, outside a repository, or a real failure. Never the raw stderr.
      state.dataset.state = this.failure?.kind ?? 'loading';
      this.dom.stateText?.setText(this.failure?.text ?? t('workbench.git.loading'));
      this.dom.stateHint?.setText(cwd);
      // No snapshot means no rows: the previous session's files and worktrees never linger in the hidden tree.
      files.empty(); this.dom.worktreeList?.empty();
      return;
    }
    // Only the file and worktree lists are rebuilt. The commit form and worktree inputs are stable DOM and keep their drafts.
    files.empty();
    this.dom.filesCount?.setText(String(snapshot.files.length));
    if (!snapshot.files.length) files.createEl('p', { cls: 'opencodian-workbench-muted', text: t('workbench.git.clean') });
    for (const file of snapshot.files) this.renderFile(files, snapshot, file);
    this.renderWorktrees(snapshot);
    const staged = snapshot.files.some(isStaged);
    if (this.dom.commitHint) this.dom.commitHint.hidden = staged;
    this.shell.enable(this.dom.commit, staged);
  }

  private row(path: string): HTMLElement | null {
    return [...this.dom.files?.querySelectorAll<HTMLElement>('[data-git-file]') ?? []].find((row) => row.getAttribute('data-git-file') === path) ?? null;
  }

  private renderFile(parent: HTMLElement, snapshot: WorkbenchGitSnapshot, file: WorkbenchGitFile): void {
    const lease = this.lease(); const draft = this.draft(this.identity ?? ''); const staged = isStaged(file);
    const row = parent.createEl('details', { cls: 'opencodian-workbench-task opencodian-workbench-git-file', attr: { 'data-git-file': file.path } });
    row.open = draft.open.has(file.path);
    row.title = file.path;
    const summary = row.createEl('summary');
    summary.createEl('code', { cls: 'opencodian-workbench-git-status', text: `${file.index}${file.workingTree}`, attr: { 'data-staged': String(staged) } });
    const copy = summary.createSpan({ cls: 'opencodian-workbench-repository-file-copy' });
    const segments = file.path.split('/');
    copy.createSpan({ cls: 'opencodian-workbench-repository-file-name', text: segments.at(-1) || file.path });
    const directory = segments.slice(0, -1).join('/');
    if (directory) copy.createSpan({ cls: 'opencodian-workbench-repository-file-directory', text: directory });
    setIcon(summary.createSpan({ cls: 'opencodian-workbench-chevron', attr: { 'aria-hidden': 'true' } }), 'chevron-down');
    this.shell.button(row.createDiv({ cls: 'opencodian-workbench-actions' }), t(staged ? 'workbench.git.unstage' : 'workbench.git.stage'), staged ? 'minus' : 'plus',
      () => this.stage(snapshot, file, !staged));
    const diff = row.createEl('pre', { cls: 'opencodian-workbench-git-diff' });
    // Lazy diff: nothing is read until the row is opened, and an open row survives every rebuild.
    row.addEventListener('toggle', () => {
      // Only a real user toggle differs from the draft; the event fired by restoring an open row is ignored.
      if (!row.isConnected || lease !== this.lease() || row.open === draft.open.has(file.path)) return;
      if (!row.open) { draft.open.delete(file.path); return; }
      draft.open.add(file.path); this.showDiff(file.path, diff); void this.loadDiff(file);
    });
    if (row.open) this.showDiff(file.path, diff);
  }

  /** Display only: a preserved diff is shown at once. Reading is requested by an open, a repository read or a restore. */
  private showDiff(path: string, diff: HTMLElement): void {
    const cached = this.current()?.diffs.get(path);
    diff.dataset.state = cached === undefined ? 'loading' : 'ready';
    diff.setText(cached ?? t('workbench.git.diff.loading'));
  }

  /** Requests a fresh read for every open row: after a repository read, and when a cached snapshot is restored. */
  private loadOpenDiffs(): void {
    const open = this.current()?.open;
    for (const file of this.snapshot?.files ?? []) if (open?.has(file.path)) void this.loadDiff(file);
  }

  private diffTarget(path: string): HTMLElement | null { return this.row(path)?.querySelector<HTMLElement>('pre') ?? null; }

  /**
   * Lazy diff read bound to its owner: the session visit, the repository read revision and the repository root.
   * A result whose owner moved on never lands or gets cached, and a request that arrives while a read is in
   * flight is queued, so the newer request is answered by exactly one fresh read instead of being dropped.
   */
  private async loadDiff(file: WorkbenchGitFile): Promise<void> {
    const snapshot = this.snapshot; const draft = this.current();
    // The mounted, open row is required up front: a destroyed surface never starts a git read at all.
    if (!snapshot || !draft || !draft.open.has(file.path) || !this.diffTarget(file.path)) return;
    if (draft.pending.has(file.path)) { draft.requeue.add(file.path); return; }
    draft.pending.add(file.path);
    const owner = { lease: this.lease(), revision: this.revision, root: snapshot.root, identity: this.identity };
    const result: { text: string | null; failure: string } = { text: null, failure: '' };
    try { result.text = await this.host.runtime.gitDiff(owner.root, file); }
    catch (error) { result.failure = `${t('workbench.git.diff.failed')} ${failureDetail(error)}`.trim(); }
    draft.pending.delete(file.path);
    const superseded = draft.requeue.delete(file.path) || owner.lease !== this.lease() || owner.revision !== this.revision || this.snapshot?.root !== owner.root;
    // Whatever this read returned, only the row of the session now on screen may be touched.
    const current = this.identity === owner.identity ? this.snapshot?.files.find((candidate) => candidate.path === file.path) : undefined;
    const target = current && draft.open.has(file.path) ? this.diffTarget(file.path) : null;
    if (!current || !target) return;
    if (superseded) void this.loadDiff(current); else this.settleDiff(draft, file.path, target, result);
  }

  private settleDiff(draft: RepositoryDraft, path: string, target: HTMLElement, result: { text: string | null; failure: string }): void {
    if (result.text === null) { target.dataset.state = 'failed'; target.setText(result.failure); return; }
    const display = result.text.length > DIFF_LIMIT ? `${result.text.slice(0, DIFF_LIMIT)}\n${t('workbench.git.diff.truncated')}` : result.text;
    if (display) store(draft.diffs, path, display, DIFF_CACHE_LIMIT); else draft.diffs.delete(path);
    target.dataset.state = display ? 'ready' : 'empty';
    target.setText(display || t('workbench.git.diff.empty'));
  }

  /**
   * Runs one explicit repository mutation. `done`: the owning visit is still on screen, and the follow-up read
   * has run. `stale`: the write went through, but the visit moved on or the surface closed - never an error, and
   * no UI state (drafts, fields, reads) of the current visit may be touched. `failed`: reported only to the visit
   * that asked.
   */
  private async act(run: () => Promise<unknown>): Promise<'done' | 'stale' | 'failed'> {
    const lease = this.lease();
    try { await run(); }
    catch (error) {
      if (lease === this.lease()) this.shell.showError(`${t('workbench.git.actionFailed')} ${failureDetail(error)}`.trim());
      return 'failed';
    }
    if (lease === this.lease() && this.dom.content) {
      await this.refresh();
      // The follow-up read can outlive the visit that asked (A→B→A while it is in flight). Re-verify
      // ownership after the await: only then may the caller consume this visit's draft or UI state.
      return lease === this.lease() && this.dom.content ? 'done' : 'stale';
    }
    return 'stale';
  }

  private async stage(snapshot: WorkbenchGitSnapshot, file: WorkbenchGitFile, staged: boolean): Promise<void> {
    const lease = this.lease();
    await this.act(() => this.host.runtime.stageFile(snapshot.root, file.path, staged));
    // The rebuilt row gets focus back only if the rebuild dropped it; focus the user moved elsewhere is left alone.
    const dropped = !document.activeElement || document.activeElement === document.body;
    if (lease === this.lease() && dropped) this.row(file.path)?.querySelector<HTMLElement>('button')?.focus();
  }

  private async commit(): Promise<void> {
    const identity = this.identity; const lease = this.lease(); const snapshot = this.snapshot; const draft = this.current();
    if (!identity || !snapshot || !draft) return;
    const message = draft.message;
    // Validated here so the reason is localized instead of the runtime's raw rejection.
    if (!message.trim()) { this.shell.showError(t('workbench.git.messageRequired')); this.dom.message?.focus(); return; }
    if (!snapshot.files.some(isStaged)) { this.shell.showError(t('workbench.git.nothingStaged')); return; }
    // Only the visit that issued the commit may consume its draft; message equality alone is not ownership,
    // so a receipt from an older visit - even one whose follow-up read outlived it - can never clear what the
    // current visit has typed meanwhile.
    const outcome = await this.act(() => this.host.runtime.commit(snapshot.root, message));
    if (outcome !== 'done' || lease !== this.lease() || draft.message !== message) return;
    draft.message = '';
    if (this.identity === identity && this.dom.message?.value === message) this.dom.message.value = '';
  }

  private renderWorktrees(snapshot: WorkbenchGitSnapshot): void {
    const list = this.dom.worktreeList;
    if (!list) return;
    list.empty();
    const records = snapshot.worktrees.split(/\n(?=worktree )/).map((record) => record.trim().split('\n')).filter((lines) => lines[0].startsWith('worktree '));
    this.dom.worktreeCount?.setText(String(records.length));
    for (const lines of records) {
      const row = list.createDiv({ cls: 'opencodian-workbench-git-worktree' });
      const branch = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length).replace(/^refs\/heads\//, '');
      row.createSpan({ cls: 'opencodian-workbench-tool-status-label', text: branch ?? '(detached HEAD)' });
      row.createEl('code', { cls: 'opencodian-workbench-tool-status-detail', text: lines[0].slice('worktree '.length) });
    }
  }

  private async createWorktree(): Promise<void> {
    const snapshot = this.snapshot; const draft = this.current();
    if (!snapshot || !draft) return;
    if (!draft.branch.trim() || !draft.directory.trim()) { this.shell.showError(t('workbench.git.worktreeRequired')); return; }
    await this.act(() => this.host.runtime.createWorktree(snapshot.root, draft.directory, draft.branch));
  }
}
