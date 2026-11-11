import type { WorkbenchGitSnapshot, WorkbenchHostRuntime } from '../../../../src/core/runtime/WorkbenchHostRuntime';
import { failureDetail, SessionWorkbenchRepository, type SessionWorkbenchRepositoryHeader, type SessionWorkbenchRepositoryHost, store } from '../../../../src/features/chat/ui/SessionWorkbenchRepository';
import { t } from '../../../../src/i18n';

// Every git effect here is a mock: no git command runs and no working tree is touched.
const snapshot = (files: Array<{ path: string; index: string; workingTree: string }>): WorkbenchGitSnapshot =>
  ({ root: '/vault', branch: 'main', files, worktrees: 'worktree /vault\nHEAD abc\nbranch refs/heads/main' });
const flush = async (rounds = 8): Promise<void> => { for (let i = 0; i < rounds; i++) await Promise.resolve(); };
const buttonOf = (panel: ParentNode, label: string) => [...panel.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === label)!;
const fileRow = (panel: HTMLElement, path: string) =>
  [...panel.querySelectorAll<HTMLDetailsElement>('[data-git-file]')].find((row) => row.getAttribute('data-git-file') === path)!;
const typeInto = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => { field.value = value; field.dispatchEvent(new Event('input')); };
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

interface Harness { repository: SessionWorkbenchRepository; panel: HTMLElement; header: SessionWorkbenchRepositoryHeader; errors: string[];
  runtime: { readGit: jest.Mock; gitDiff: jest.Mock; stageFile: jest.Mock; commit: jest.Mock; createWorktree: jest.Mock }; setDraft: jest.Mock }

const harness = (runtime: { readGit?: jest.Mock; gitDiff?: jest.Mock } = {}): Harness => {
  const mocks = { readGit: runtime.readGit ?? jest.fn(), gitDiff: runtime.gitDiff ?? jest.fn().mockResolvedValue(''), stageFile: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue('ok'), createWorktree: jest.fn().mockResolvedValue(undefined) };
  const errors: string[] = [];
  const shell = {
    button: (parent: HTMLElement, label: string, _icon: string, action: () => void | Promise<void>): HTMLButtonElement => {
      const button = parent.createEl('button', { text: label });
      button.addEventListener('click', () => { void Promise.resolve().then(action).catch((error: unknown) => errors.push(failureDetail(error))); });
      return button;
    },
    enable: (button: HTMLButtonElement | undefined, enabled: boolean) => { if (button) button.disabled = !enabled; },
    showError: (message: string) => { errors.push(message); },
    clearError: () => { errors.length = 0; },
  };
  const host: SessionWorkbenchRepositoryHost = { runtime: mocks as unknown as Pick<WorkbenchHostRuntime, 'readGit' | 'gitDiff' | 'stageFile' | 'commit' | 'createWorktree'>,
    workingDirectory: () => '/vault', defaultWorktreeDirectory: () => '/worktrees', setDraft: jest.fn() };
  const repository = new SessionWorkbenchRepository(host, shell);
  const panel = document.body.createDiv();
  const header: SessionWorkbenchRepositoryHeader = { label: panel.createSpan(), detail: panel.createEl('code'), actions: panel.createDiv() };
  repository.mount(panel, header);
  return { repository, panel, header, errors, runtime: mocks, setDraft: host.setDraft as jest.Mock };
};

describe('repository reads and states', () => {
  let panel: HTMLElement, harnessBox: ReturnType<typeof harness>;

  beforeEach(() => { harnessBox = harness(); panel = harnessBox.panel; });
  afterEach(() => { panel.remove(); jest.clearAllMocks(); });

  it('reads once when shown and renders branch, root, files and worktrees; later shows are explicit only', async () => {
    const readGit = jest.fn().mockResolvedValue(snapshot([{ path: 'src/a.ts', index: ' ', workingTree: 'M' }, { path: 'b.ts', index: 'M', workingTree: ' ' }]));
    harnessBox.runtime.readGit = readGit; harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    const { header, repository } = harnessBox;
    expect(readGit).toHaveBeenCalledTimes(1);
    expect(header.label.textContent).toContain('main');
    expect(header.detail.textContent).toBe('/vault');
    expect(header.label.querySelector('svg[data-icon="git-branch"]')).not.toBeNull();
    expect(header.detail.querySelector('svg[data-icon="folder"]')).not.toBeNull();
    expect(panel.querySelectorAll('[data-git-file]')).toHaveLength(2);
    expect(fileRow(panel, 'src/a.ts').querySelector('.opencodian-workbench-repository-file-name')!.textContent).toBe('a.ts');
    expect(fileRow(panel, 'src/a.ts').querySelector('.opencodian-workbench-repository-file-directory')!.textContent).toBe('src');
    expect(fileRow(panel, 'src/a.ts').title).toBe('src/a.ts');
    expect(panel.querySelector('.opencodian-workbench-git-worktree')!.textContent).toContain('/vault');
    repository.show();
    await flush();
    expect(readGit).toHaveBeenCalledTimes(1);
  });

  it('outside a repository shows the localized honest state with a retry, never the raw stderr', async () => {
    harnessBox.runtime.readGit = jest.fn().mockRejectedValue(new Error('fatal: not a git repository (or any of the parent directories): .git'));
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    const block = panel.querySelector<HTMLElement>('.opencodian-workbench-tool-state')!;
    expect(block.hidden).toBe(false);
    expect(block.dataset.state).toBe('not-repo');
    expect(block.textContent).toContain(t('workbench.git.notRepository'));
    expect(block.textContent).toContain('/vault');
    expect(block.textContent).not.toContain('fatal:');
    expect(buttonOf(block, t('workbench.retry'))).toBeTruthy();
    expect(harnessBox.errors).toEqual([]);
  });

  it('keeps other read failures an honest generic failure with a bounded, credential-free detail', async () => {
    harnessBox.runtime.readGit = jest.fn().mockRejectedValue(new Error(`fatal: bad object abc\nremote: https://user:secret@example.com/repo.git ${'x'.repeat(600)}`));
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    const block = panel.querySelector<HTMLElement>('.opencodian-workbench-tool-state')!;
    expect(block.dataset.state).toBe('failed');
    expect(block.textContent).toContain(t('workbench.git.readFailed'));
    expect(block.textContent).toContain('bad object abc');
    expect(block.textContent).not.toContain('user:secret');
    expect(block.querySelector('p')!.textContent!.length).toBeLessThan(t('workbench.git.readFailed').length + 260);
  });

  it('reads a diff lazily on open and preserves it, open state and inputs across stage, refresh and switches', async () => {
    const readGit = jest.fn()
      .mockResolvedValueOnce(snapshot([{ path: 'a.ts', index: ' ', workingTree: 'M' }, { path: 'b.ts', index: 'M', workingTree: ' ' }]))
      .mockResolvedValue(snapshot([{ path: 'a.ts', index: 'M', workingTree: ' ' }, { path: 'b.ts', index: 'M', workingTree: ' ' }]));
    const gitDiff = jest.fn().mockResolvedValue('@@ -1 +1 @@\n-old\n+new');
    harnessBox.runtime.readGit = readGit; harnessBox.runtime.gitDiff = gitDiff;
    const { repository, runtime } = harnessBox;
    repository.update('first'); repository.show();
    await flush();
    expect(gitDiff).not.toHaveBeenCalled(); // Lazy: nothing is read for closed rows.
    const row = fileRow(panel, 'a.ts');
    row.open = true; row.dispatchEvent(new Event('toggle'));
    await flush();
    expect(gitDiff).toHaveBeenCalledWith('/vault', expect.objectContaining({ path: 'a.ts' }));
    const diff = () => fileRow(panel, 'a.ts').querySelector('pre')!.textContent!;
    expect(diff()).toContain('+new');
    const message = () => panel.querySelector<HTMLTextAreaElement>('textarea')!;
    const branch = () => panel.querySelector<HTMLInputElement>('details.opencodian-workbench-git-worktrees input')!;
    typeInto(message(), 'fix: thing'); typeInto(branch(), 'codex/branch');
    buttonOf(fileRow(panel, 'a.ts'), t('workbench.git.stage')).click();
    await flush();
    expect(runtime.stageFile).toHaveBeenCalledWith('/vault', 'a.ts', true);
    expect(fileRow(panel, 'a.ts').open).toBe(true);
    expect(diff()).toContain('+new');
    expect(message().value).toBe('fix: thing');
    expect(branch().value).toBe('codex/branch');
    repository.update('second');
    expect(message().value).toBe('');
    expect(branch().value).toBe('');
    expect(panel.querySelectorAll('[data-git-file]')).toHaveLength(0); // The other session's rows never linger.
    // The shell shows the tool again on return; that is what reads, never the switch itself.
    repository.update('first'); repository.show();
    await flush();
    expect(message().value).toBe('fix: thing');
    expect(branch().value).toBe('codex/branch');
    expect(fileRow(panel, 'a.ts').open).toBe(true);
    expect(diff()).toContain('+new');
  });

  it('restores a cached snapshot on remount without a new read and re-reads open diffs once', async () => {
    const readGit = jest.fn().mockResolvedValue(snapshot([{ path: 'a.ts', index: ' ', workingTree: 'M' }]));
    const gitDiff = jest.fn().mockResolvedValue('@@ -1 +1 @@');
    harnessBox.runtime.readGit = readGit; harnessBox.runtime.gitDiff = gitDiff;
    const { repository } = harnessBox;
    repository.update('first'); repository.show();
    await flush();
    fileRow(panel, 'a.ts').open = true; fileRow(panel, 'a.ts').dispatchEvent(new Event('toggle'));
    await flush();
    expect(gitDiff).toHaveBeenCalledTimes(1);
    repository.detach();
    const remounted = document.body.createDiv();
    const header: SessionWorkbenchRepositoryHeader = { label: remounted.createSpan(), detail: remounted.createEl('code'), actions: remounted.createDiv() };
    repository.mount(remounted, header);
    await flush();
    expect(readGit).toHaveBeenCalledTimes(1); // The cached snapshot survived the remount.
    expect(fileRow(remounted, 'a.ts').open).toBe(true);
    expect(gitDiff).toHaveBeenCalledTimes(2); // Its open diff is re-read once for freshness.
    remounted.remove();
  });
});

describe('repository mutations', () => {
  let panel: HTMLElement, harnessBox: ReturnType<typeof harness>;

  beforeEach(() => {
    harnessBox = harness({ readGit: jest.fn().mockResolvedValue(snapshot([{ path: 'b.ts', index: 'M', workingTree: ' ' }])) });
    panel = harnessBox.panel;
    harnessBox.repository.update('first'); harnessBox.repository.show();
  });
  afterEach(() => { panel.remove(); jest.clearAllMocks(); });

  it('validates a commit locally and sends the exact draft text to the runtime', async () => {
    const { runtime, errors } = harnessBox;
    await flush();
    buttonOf(panel, t('workbench.git.commit')).click();
    await flush();
    expect(runtime.commit).not.toHaveBeenCalled();
    expect(errors).toEqual([t('workbench.git.messageRequired')]);
    typeInto(panel.querySelector<HTMLTextAreaElement>('textarea')!, 'fix: thing');
    buttonOf(panel, t('workbench.git.commit')).click();
    await flush();
    expect(runtime.commit).toHaveBeenCalledWith('/vault', 'fix: thing');
    expect(panel.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(errors).toEqual([]);
  });

  it('validates the worktree form and forwards branch and directory unchanged', async () => {
    const { runtime, errors } = harnessBox;
    await flush();
    const worktrees = panel.querySelector<HTMLDetailsElement>('details.opencodian-workbench-git-worktrees')!;
    const [branch, directory] = [...worktrees.querySelectorAll<HTMLInputElement>('input')];
    buttonOf(worktrees, t('workbench.git.createWorktree')).click();
    await flush();
    expect(runtime.createWorktree).not.toHaveBeenCalled();
    expect(errors).toEqual([t('workbench.git.worktreeRequired')]);
    typeInto(branch, 'codex/branch'); typeInto(directory, '/worktrees');
    buttonOf(worktrees, t('workbench.git.createWorktree')).click();
    await flush();
    expect(runtime.createWorktree).toHaveBeenCalledWith('/vault', '/worktrees', 'codex/branch');
  });

  it('keeps the review prompt flow on the shell draft', async () => {
    await flush();
    buttonOf(panel, t('workbench.git.review')).click();
    await flush();
    expect(harnessBox.setDraft).toHaveBeenCalledWith(t('workbench.git.reviewPrompt'));
    expect(harnessBox.runtime.commit).not.toHaveBeenCalled();
  });
});

describe('deferred repository races', () => {
  let panel: HTMLElement, harnessBox: ReturnType<typeof harness>;

  beforeEach(() => { harnessBox = harness(); panel = harnessBox.panel; });
  afterEach(() => { panel.remove(); jest.clearAllMocks(); });

  const openFirstRow = async () => {
    harnessBox.runtime.readGit = jest.fn().mockResolvedValue(snapshot([{ path: 'a.ts', index: ' ', workingTree: 'M' }]));
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    fileRow(panel, 'a.ts').open = true; fileRow(panel, 'a.ts').dispatchEvent(new Event('toggle'));
    await flush();
  };

  it('answers a same-XY refresh while a diff read is in flight with the newer result, never the older one', async () => {
    const first = deferred<string>();
    const gitDiff = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue('NEW');
    harnessBox.runtime.gitDiff = gitDiff;
    await openFirstRow();
    const row = fileRow(panel, 'a.ts');
    expect(row.querySelector('pre')!.textContent).toBe(t('workbench.git.diff.loading'));
    buttonOf(panel, t('workbench.git.refresh')).click();
    await flush();
    expect(gitDiff).toHaveBeenCalledTimes(1); // The queued request waits for the in-flight read.
    first.resolve('OLD');
    await flush();
    expect(gitDiff).toHaveBeenCalledTimes(2);
    await flush();
    expect(fileRow(panel, 'a.ts').querySelector('pre')!.textContent).toContain('NEW');
    expect(fileRow(panel, 'a.ts').querySelector('pre')!.textContent).not.toContain('OLD');
  });

  it('drops a diff result whose session visit moved on, and re-reads for the returned visit', async () => {
    const first = deferred<string>();
    const gitDiff = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue('FRESH');
    harnessBox.runtime.gitDiff = gitDiff;
    await openFirstRow();
    harnessBox.repository.update('second');
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    expect(fileRow(panel, 'a.ts').open).toBe(true);
    expect(gitDiff).toHaveBeenCalledTimes(1); // Still owned by the in-flight read; the returned visit queued its own.
    first.resolve('OLD-A');
    await flush();
    expect(gitDiff).toHaveBeenCalledTimes(2);
    await flush();
    expect(fileRow(panel, 'a.ts').querySelector('pre')!.textContent).toContain('FRESH');
    expect(panel.textContent).not.toContain('OLD-A');
  });

  it('a diff read that settles after detach neither lands nor starts another git read', async () => {
    const first = deferred<string>();
    const gitDiff = jest.fn().mockImplementationOnce(() => first.promise).mockResolvedValue('OLD');
    harnessBox.runtime.gitDiff = gitDiff;
    await openFirstRow();
    expect(gitDiff).toHaveBeenCalledTimes(1);
    harnessBox.repository.detach();
    first.resolve('OLD');
    await flush();
    expect(gitDiff).toHaveBeenCalledTimes(1);
    expect(panel.textContent).not.toContain('OLD');
  });

  it('a mutation that settles after detach completes its write but starts no new repository read', async () => {
    const staged = deferred<void>();
    await openFirstRow();
    harnessBox.runtime.gitDiff = jest.fn().mockResolvedValue('diff');
    harnessBox.runtime.stageFile = jest.fn(() => staged.promise);
    buttonOf(fileRow(panel, 'a.ts'), t('workbench.git.stage')).click();
    await flush();
    expect(harnessBox.runtime.stageFile).toHaveBeenCalledWith('/vault', 'a.ts', true);
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(1);
    harnessBox.repository.detach();
    staged.resolve();
    await flush();
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(1); // The old lease never fires a read on a closed surface.
    expect(harnessBox.errors).toEqual([]);
  });

  it('a mutation that settles after A→B→A leaves the re-read to the returned visit', async () => {
    const staged = deferred<void>();
    await openFirstRow();
    harnessBox.runtime.gitDiff = jest.fn().mockResolvedValue('diff');
    harnessBox.runtime.stageFile = jest.fn(() => staged.promise);
    buttonOf(fileRow(panel, 'a.ts'), t('workbench.git.stage')).click();
    await flush();
    harnessBox.repository.update('second');
    harnessBox.repository.update('first');
    staged.resolve();
    await flush();
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(1); // Same identity, older visit: no read of its own.
    harnessBox.repository.show();
    await flush();
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(2); // The returned visit reads through its own show().
  });

  it('a commit receipt from an older visit never clears what the returned visit re-typed', async () => {
    const committed = deferred<string>();
    harnessBox.runtime.readGit = jest.fn().mockResolvedValue(snapshot([{ path: 'b.ts', index: 'M', workingTree: ' ' }]));
    harnessBox.runtime.commit = jest.fn(() => committed.promise);
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    typeInto(panel.querySelector<HTMLTextAreaElement>('textarea')!, 'X');
    buttonOf(panel, t('workbench.git.commit')).click();
    await flush();
    harnessBox.repository.update('second');
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    // The returned visit re-enters the same text; the still-pending receipt of the older visit owns nothing now.
    typeInto(panel.querySelector<HTMLTextAreaElement>('textarea')!, 'X');
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(2);
    committed.resolve('ok');
    await flush();
    expect(panel.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('X');
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(2); // A stale receipt neither clears the draft nor re-reads.
    expect(harnessBox.errors).toEqual([]);
  });

  it('a commit whose follow-up read outlives the visit never clears the returned visit’s re-typed draft', async () => {
    const read = deferred<WorkbenchGitSnapshot>();
    harnessBox.runtime.readGit = jest.fn().mockResolvedValueOnce(snapshot([{ path: 'b.ts', index: 'M', workingTree: ' ' }]))
      .mockImplementationOnce(() => read.promise).mockResolvedValue(snapshot([{ path: 'b.ts', index: 'M', workingTree: ' ' }]));
    harnessBox.runtime.commit = jest.fn().mockResolvedValue('ok');
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    typeInto(panel.querySelector<HTMLTextAreaElement>('textarea')!, 'X');
    buttonOf(panel, t('workbench.git.commit')).click();
    await flush();
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(2); // The commit's follow-up read is in flight.
    harnessBox.repository.update('second');
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    typeInto(panel.querySelector<HTMLTextAreaElement>('textarea')!, 'X'); // The returned visit re-enters the same text.
    read.resolve(snapshot([{ path: 'b.ts', index: 'M', workingTree: ' ' }]));
    await flush();
    expect(panel.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('X');
    await flush();
    expect(panel.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('X');
    expect(harnessBox.errors).toEqual([]);
  });

  it('a repository read that settles after detach is dropped without extra reads', async () => {
    const read = deferred<WorkbenchGitSnapshot>();
    harnessBox.runtime.readGit = jest.fn(() => read.promise);
    harnessBox.runtime.gitDiff = jest.fn().mockResolvedValue('diff');
    harnessBox.repository.update('first'); harnessBox.repository.show();
    await flush();
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(1);
    harnessBox.repository.detach();
    read.resolve(snapshot([{ path: 'a.ts', index: ' ', workingTree: 'M' }]));
    await flush();
    expect(harnessBox.runtime.readGit).toHaveBeenCalledTimes(1);
    expect(harnessBox.runtime.gitDiff).not.toHaveBeenCalled();
  });
});

describe('bounded helpers', () => {
  it('failure detail is one bounded, ANSI-free, credential-free line', () => {
    const escape = String.fromCharCode(27);
    const raw = `fatal: ${escape}[31mrefusing${escape}[0m to update\nremote: https://user:secret@example.com/x ${'y'.repeat(500)}`;
    const detail = failureDetail(new Error(raw));
    expect(detail.includes(escape)).toBe(false);
    expect(detail.includes('\n')).toBe(false);
    expect(detail).toContain('fatal: refusing to update');
    expect(detail).toContain('https://***@example.com');
    expect(detail.length).toBeLessThanOrEqual(240);
    expect(failureDetail(undefined)).toBe('');
    expect(failureDetail('plain text')).toBe('plain text');
  });

  it('store keeps most recent entries and evicts the oldest beyond the limit', () => {
    const map = new Map<string, number>();
    for (const key of ['a', 'b', 'c']) store(map, key, 1, 3);
    store(map, 'a', 2, 3); // Touch: 'a' becomes most recent again.
    store(map, 'd', 3, 3);
    expect([...map.keys()]).toEqual(['c', 'a', 'd']);
    expect(map.get('a')).toBe(2);
  });
});
