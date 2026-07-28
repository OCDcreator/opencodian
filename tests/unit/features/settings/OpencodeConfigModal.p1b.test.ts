/* eslint-disable max-lines, max-lines-per-function -- P1-B modal contract scenarios intentionally share one source fixture. */
import type { App } from 'obsidian';
import { Notice } from 'obsidian';

import type {
  ArchiveHistoryEntryIdentity,
  ArchiveHistoryTarget,
  ConfigurationEvidence,
  FileRevision,
} from '../../../../src/core/agents/backend/ProjectResourceSecureWrite';
import type {
  OpencodeConfigSourceCandidate,
  OpencodeConfigSourceHistoryResult,
  OpencodeConfigSourceMutationOutcome,
  OpencodeConfigSourceReadResult,
} from '../../../../src/core/config/OpencodeConfigSourceService';
import { OpencodeConfigModal } from '../../../../src/features/settings/OpencodeConfigModal';
import { setLocale, t } from '../../../../src/i18n';

jest.mock('obsidian', () => {
  const actual = jest.requireActual('obsidian');
  return { ...actual, Notice: jest.fn() };
});

const revision = (targetPath: string, sha = 'a'): FileRevision => ({
  canonicalPath: targetPath,
  mtimeMs: 1,
  size: 12,
  sha256: sha.repeat(64),
});

const evidence = (overrides: Partial<ConfigurationEvidence> = {}): ConfigurationEvidence => ({
  persistence: 'verified',
  application: 'unavailable',
  runtime: 'unavailable',
  ...overrides,
});

function candidate(
  scope: OpencodeConfigSourceCandidate['scope'],
  source: OpencodeConfigSourceCandidate['source'],
  targetPath: string,
  overrides: Partial<OpencodeConfigSourceCandidate> = {},
): OpencodeConfigSourceCandidate {
  return {
    scope,
    source,
    path: targetPath,
    exists: true,
    editable: scope !== 'managed',
    revision: revision(targetPath),
    evidence: evidence(),
    ...overrides,
  };
}

type ConfigManagerStub = {
  inventoryConfigurationSources: jest.Mock<Promise<OpencodeConfigSourceCandidate[]>>;
  readConfigurationSource: jest.Mock<Promise<OpencodeConfigSourceReadResult>, [string]>;
  writeConfigurationSource: jest.Mock<Promise<OpencodeConfigSourceMutationOutcome>>;
  deleteConfigurationSource: jest.Mock<Promise<OpencodeConfigSourceMutationOutcome>>;
  listConfigurationHistory: jest.Mock<Promise<OpencodeConfigSourceHistoryResult>, [string]>;
  catalogConfigurationHistory: jest.Mock<Promise<{ status: 'success'; targets: ArchiveHistoryTarget[] } | { status: 'archive-failed'; cause: string }>>;
  restoreConfigurationHistory: jest.Mock<Promise<OpencodeConfigSourceMutationOutcome>>;
};

function createManager(candidates: OpencodeConfigSourceCandidate[], contents: Record<string, string>): ConfigManagerStub {
  const manager: ConfigManagerStub = {
    inventoryConfigurationSources: jest.fn().mockResolvedValue(candidates),
    readConfigurationSource: jest.fn().mockImplementation(async (targetPath: string) => {
      const source = candidates.find((entry) => entry.path === targetPath);
      if (!source) return { status: 'invalid-target', targetPath };
      return { status: 'success', source, content: contents[targetPath] ?? '' };
    }),
    writeConfigurationSource: jest.fn(),
    deleteConfigurationSource: jest.fn(),
    listConfigurationHistory: jest.fn(),
    catalogConfigurationHistory: jest.fn(),
    restoreConfigurationHistory: jest.fn(),
  };
  return manager;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function selectSource(modal: OpencodeConfigModal, targetPath: string): HTMLSelectElement {
  const select = modal.contentEl.querySelector<HTMLSelectElement>('[data-config-source-select]');
  if (!select) throw new Error('source selector missing');
  select.value = targetPath;
  select.dispatchEvent(new Event('change'));
  return select;
}

describe('OpencodeConfigModal P1-B source contract', () => {
  beforeEach(() => {
    setLocale('en');
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requires explicit source selection and shows exact bytes, path, revision, and evidence', async () => {
    const projectPath = '/vault/.opencode/opencode.jsonc';
    const globalPath = '/home/test/.config/opencode/opencode.jsonc';
    const dotJsoncPath = '/home/test/.opencode/opencode.jsonc';
    const dotJsonPath = '/home/test/.opencode/opencode.json';
    const managedPath = '/etc/opencode/opencode.jsonc';
    const projectBytes = '{\n  // preserve this comment\n  "permission": "ask"\n}\n';
    const manager = createManager([
      candidate('project', 'project-default', projectPath),
      candidate('global', 'global-xdg-default', globalPath, { exists: false, revision: null, evidence: evidence({ persistence: 'not-applicable' }) }),
      candidate('global', 'global-dot-opencode-jsonc-legacy', dotJsoncPath),
      candidate('global', 'global-dot-opencode-json-legacy', dotJsonPath),
      candidate('managed', 'managed-system', managedPath),
    ], { [projectPath]: projectBytes, [dotJsoncPath]: '{"dot":"jsonc"}\n', [dotJsonPath]: '{"dot":"json"}\n', [managedPath]: '{"managed":true}\n' });
    const modal = new OpencodeConfigModal({} as App, manager as never);

    await modal.onOpen();
    const selector = modal.contentEl.querySelector<HTMLSelectElement>('[data-config-source-select]');
    expect(selector?.value).toBe('');
    expect(selector?.options).toHaveLength(6);
    expect(selector?.getAttribute('aria-hidden')).toBe('true');
    expect(modal.contentEl.querySelector('.opencodian-settings-dropdown-trigger')).not.toBeNull();
    expect(modal.contentEl.textContent).toContain('Select a configuration source');

    selectSource(modal, projectPath);
    await flush();
    const editor = modal.contentEl.querySelector<HTMLTextAreaElement>('[data-config-editor]');
    expect(editor?.value).toBe(projectBytes);
    expect(modal.contentEl.querySelector('[data-config-scope]')?.textContent).toContain('Project');
    expect(modal.contentEl.querySelector('[data-config-source]')?.textContent).toContain('project-default');
    expect(modal.contentEl.querySelector('[data-config-path]')?.textContent).toContain(projectPath);
    expect(modal.contentEl.querySelector('[data-config-revision]')?.textContent).toContain('a'.repeat(12));
    expect(modal.contentEl.querySelector('[data-config-evidence]')?.textContent).toContain('persistence: Verified');

    selectSource(modal, dotJsoncPath);
    await flush();
    expect(modal.contentEl.querySelector('[data-config-source]')?.textContent).toContain('global-dot-opencode-jsonc-legacy');
    expect(modal.contentEl.querySelector<HTMLTextAreaElement>('[data-config-editor]')?.value).toBe('{"dot":"jsonc"}\n');

    selectSource(modal, managedPath);
    await flush();
    expect(editor?.value).toBe('{"managed":true}\n');
    expect(editor?.disabled).toBe(true);
    expect(modal.contentEl.querySelector('[data-config-save]')).toBeNull();
    expect(modal.contentEl.querySelector('[data-config-delete]')).toBeNull();
  });

  it('keeps the raw draft and modal open on a revision conflict', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const manager = createManager([candidate('project', 'project-default', targetPath)], { [targetPath]: '{"answer":1}\n' });
    manager.writeConfigurationSource.mockResolvedValue({
      targetPath,
      result: { status: 'conflict', expected: revision(targetPath), current: revision(targetPath, 'b') },
      evidence: evidence({ persistence: 'failed' }),
      draft: '{"answer":2}\n',
    });
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    const editor = modal.contentEl.querySelector<HTMLTextAreaElement>('[data-config-editor]');
    if (!editor) throw new Error('editor missing');
    editor.value = '{"answer":2}\n';
    editor.dispatchEvent(new Event('input'));
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-save]')?.click();
    await flush();
    expect(manager.writeConfigurationSource).toHaveBeenCalledWith({
      targetPath,
      content: '{"answer":2}\n',
      expectedRevision: revision(targetPath),
    });
    expect(editor.value).toBe('{"answer":2}\n');
    expect(modal.contentEl.textContent).toMatch(/changed|draft/i);
    expect(Notice).toHaveBeenCalled();
  });

  it('refreshes the custom trigger label when opened with an initial target path', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const manager = createManager([
      candidate('project', 'project-default', targetPath),
    ], { [targetPath]: '{"permission":"ask"}\n' });
    const modal = new OpencodeConfigModal({} as App, manager as never, { targetPath });

    await modal.onOpen();

    expect(modal.contentEl.querySelector<HTMLSelectElement>('[data-config-source-select]')?.value).toBe(targetPath);
    expect(modal.contentEl.querySelector('.opencodian-settings-dropdown-trigger')?.textContent).toContain('project-default');
    expect(modal.contentEl.querySelector('.opencodian-settings-dropdown-trigger')?.textContent).toContain('opencode.jsonc');
  });

  it('keeps malformed JSONC bytes repairable and creates a missing default with null revision', async () => {
    const malformedPath = '/vault/.opencode/opencode.jsonc';
    const missingPath = '/home/test/.config/opencode/opencode.jsonc';
    const malformedBytes = '{\n  // unfinished\n  "permission":\n';
    const malformed = candidate('project', 'project-default', malformedPath, {
      parseError: 'JSONC parse error: Property expected',
      evidence: evidence({ persistence: 'failed' }),
    });
    const missing = candidate('global', 'global-xdg-default', missingPath, {
      exists: false,
      revision: null,
      evidence: evidence({ persistence: 'not-applicable' }),
    });
    const manager = createManager([malformed, missing], { [malformedPath]: malformedBytes });
    manager.writeConfigurationSource.mockResolvedValue({
      targetPath: malformedPath,
      result: { status: 'success', revision: revision(malformedPath, 'c') },
      evidence: evidence({ application: 'pending' }),
    });
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, malformedPath);
    await flush();
    const editor = modal.contentEl.querySelector<HTMLTextAreaElement>('[data-config-editor]');
    expect(editor?.value).toBe(malformedBytes);
    expect(editor?.disabled).toBe(false);
    expect(modal.contentEl.querySelector('[data-config-parse-error]')?.textContent).toContain('JSONC parse error');

    selectSource(modal, missingPath);
    await flush();
    expect(editor?.value).toContain('$schema');
    expect(editor?.disabled).toBe(false);
    editor?.dispatchEvent(new Event('input'));
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-save]')?.click();
    await flush();
    expect(manager.writeConfigurationSource).toHaveBeenCalledWith(expect.objectContaining({
      targetPath: missingPath,
      expectedRevision: null,
    }));
  });

  it('deletes with the captured revision and leaves history available for restore', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const source = candidate('project', 'project-default', targetPath);
    const manager = createManager([source], { [targetPath]: '{"answer":1}\n' });
    manager.deleteConfigurationSource.mockResolvedValue({
      targetPath,
      result: { status: 'success', revision: revision(targetPath, 'd') },
      evidence: evidence(),
    });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-delete]')?.click();
    await flush();
    expect(manager.deleteConfigurationSource).toHaveBeenCalledWith({ targetPath, expectedRevision: source.revision });
    expect(confirmSpy).toHaveBeenCalledWith(t('configEditor.notice.deleteConfirm'));
  });

  it.each([
    ['false', false],
    ['undefined', undefined],
  ] as const)('fails closed when OpenCode delete confirmation is %s', async (_label, answer) => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const source = candidate('project', 'project-default', targetPath);
    const manager = createManager([source], { [targetPath]: '{"answer":1}\n' });
    jest.spyOn(window, 'confirm').mockReturnValue(answer as unknown as boolean);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-delete]')?.click();
    await flush();
    expect(manager.deleteConfigurationSource).not.toHaveBeenCalled();
  });

  it('prevents OpenCode Delete double activation and restores the button after a rejected write', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const source = candidate('project', 'project-default', targetPath);
    const manager = createManager([source], { [targetPath]: '{"answer":1}\n' });
    const pending = deferred<OpencodeConfigSourceMutationOutcome>();
    manager.deleteConfigurationSource.mockReturnValue(pending.promise);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    const deleteButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-config-delete]');
    if (!deleteButton) throw new Error('delete button missing');
    deleteButton.click();
    deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(manager.deleteConfigurationSource).toHaveBeenCalledTimes(1);
    expect(deleteButton.disabled).toBe(true);
    expect(deleteButton.textContent).toContain(t('configEditor.notice.deleting'));
    pending.reject(new Error('delete failed'));
    await flush();
    expect(deleteButton.disabled).toBe(false);
    expect(deleteButton.textContent).toBe(t('configEditor.delete'));
  });

  it('renders archive failure instead of an empty history and restores a deleted target with null revision', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const identity = 'history-entry' as ArchiveHistoryEntryIdentity;
    const manager = createManager([candidate('project', 'project-default', targetPath, { exists: false, revision: null, evidence: evidence({ persistence: 'not-applicable' }) })], {});
    manager.listConfigurationHistory.mockResolvedValueOnce({ status: 'archive-failed', cause: 'manifest unreadable' });
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();
    expect(modal.contentEl.textContent).toMatch(/archive|归档/i);
    expect(modal.contentEl.textContent).not.toMatch(/No archived|没有可恢复/);

    manager.listConfigurationHistory.mockResolvedValueOnce({
      status: 'success',
      targets: [{ canonicalTarget: targetPath, backend: 'opencode', scope: 'project', kind: 'configuration', format: 'jsonc', entries: [{ identity, archiveKind: 'delete', timestamp: 1, size: 5 }] }],
    });
    manager.restoreConfigurationHistory.mockResolvedValue({
      targetPath,
      result: { status: 'success', revision: revision(targetPath, 'c') },
      evidence: evidence({ persistence: 'verified', application: 'pending', runtime: 'unavailable' }),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-restore]')?.click();
    await flush();
    expect(manager.restoreConfigurationHistory).toHaveBeenCalledWith({ entryIdentity: identity, expectedRevision: null });
  });

  it('requires explicit confirmation before OpenCode History Restore', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const identity = 'cancelled-history-entry' as ArchiveHistoryEntryIdentity;
    const manager = createManager([candidate('project', 'project-default', targetPath)], { [targetPath]: '{"answer":1}\n' });
    manager.listConfigurationHistory.mockResolvedValue({
      status: 'success',
      targets: [{ canonicalTarget: targetPath, backend: 'opencode', scope: 'project', kind: 'configuration', format: 'jsonc', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 5 }] }],
    });
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-restore]')?.click();
    await flush();
    expect(manager.restoreConfigurationHistory).not.toHaveBeenCalled();
    expect(window.confirm).toHaveBeenCalledWith(t('configEditor.notice.restoreConfirm'));
  });

  it('keeps OpenCode History Restore fail-closed when confirm returns undefined', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const identity = 'undefined-history-entry' as ArchiveHistoryEntryIdentity;
    const manager = createManager([candidate('project', 'project-default', targetPath)], { [targetPath]: '{"answer":1}\n' });
    manager.listConfigurationHistory.mockResolvedValue({
      status: 'success',
      targets: [{ canonicalTarget: targetPath, backend: 'opencode', scope: 'project', kind: 'configuration', format: 'jsonc', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 5 }] }],
    });
    jest.spyOn(window, 'confirm').mockReturnValue(undefined as unknown as boolean);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-restore]')?.click();
    await flush();
    expect(manager.restoreConfigurationHistory).not.toHaveBeenCalled();
  });

  it.each(['non-function', 'deleted'] as const)('fails closed when OpenCode History Restore confirm is %s', async (mode) => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const identity = `${mode}-history-entry` as ArchiveHistoryEntryIdentity;
    const manager = createManager([candidate('project', 'project-default', targetPath)], { [targetPath]: '{"answer":1}\n' });
    manager.listConfigurationHistory.mockResolvedValue({
      status: 'success',
      targets: [{ canonicalTarget: targetPath, backend: 'opencode', scope: 'project', kind: 'configuration', format: 'jsonc', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 5 }] }],
    });
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
    try {
      if (mode === 'non-function') {
        Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: 'not-a-function' });
      } else {
        Reflect.deleteProperty(window, 'confirm');
        if (typeof window.confirm === 'function') Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: undefined });
      }
      const modal = new OpencodeConfigModal({} as App, manager as never);
      await modal.onOpen();
      selectSource(modal, targetPath);
      await flush();
      modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
      await flush();
      modal.contentEl.querySelector<HTMLButtonElement>('[data-config-restore]')?.click();
      await flush();
      expect(manager.restoreConfigurationHistory).toHaveBeenCalledTimes(0);
    } finally {
      if (originalDescriptor) Object.defineProperty(window, 'confirm', originalDescriptor);
      else Reflect.deleteProperty(window, 'confirm');
    }
  });

  it.each(['non-function', 'deleted'] as const)('fails closed when OpenCode Delete confirm is %s', async (mode) => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const source = candidate('project', 'project-default', targetPath);
    const manager = createManager([source], { [targetPath]: '{"answer":1}\n' });
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'confirm');
    try {
      if (mode === 'non-function') {
        Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: 'not-a-function' });
      } else {
        Reflect.deleteProperty(window, 'confirm');
        if (typeof window.confirm === 'function') Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: undefined });
      }
      const modal = new OpencodeConfigModal({} as App, manager as never);
      await modal.onOpen();
      selectSource(modal, targetPath);
      await flush();
      modal.contentEl.querySelector<HTMLButtonElement>('[data-config-delete]')?.click();
      await flush();
      expect(manager.deleteConfigurationSource).toHaveBeenCalledTimes(0);
    } finally {
      if (originalDescriptor) Object.defineProperty(window, 'confirm', originalDescriptor);
      else Reflect.deleteProperty(window, 'confirm');
    }
  });

  it('renders the exact OpenCode restore conflict copy and retains the history modal', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const identity = 'conflicting-history-entry' as ArchiveHistoryEntryIdentity;
    const source = candidate('project', 'project-default', targetPath);
    const manager = createManager([source], { [targetPath]: '{"answer":1}\n' });
    manager.listConfigurationHistory.mockResolvedValue({
      status: 'success',
      targets: [{ canonicalTarget: targetPath, backend: 'opencode', scope: 'project', kind: 'configuration', format: 'jsonc', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 5 }] }],
    });
    manager.restoreConfigurationHistory.mockResolvedValue({
      targetPath,
      result: { status: 'conflict', expected: source.revision, current: revision(targetPath, 'z') },
      evidence: evidence({ persistence: 'failed' }),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-restore]')?.click();
    await flush();
    expect(modal.contentEl.textContent).toContain('The target was modified externally; no overwrite was performed.');
    expect(modal.contentEl.textContent).not.toContain('Your draft remains open');
  });

  it('prevents OpenCode History Restore double activation and exposes loading until the promise settles', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const identity = 'double-click-history-entry' as ArchiveHistoryEntryIdentity;
    const source = candidate('project', 'project-default', targetPath);
    const manager = createManager([source], { [targetPath]: '{"answer":1}\n' });
    manager.listConfigurationHistory.mockResolvedValue({
      status: 'success',
      targets: [{ canonicalTarget: targetPath, backend: 'opencode', scope: 'project', kind: 'configuration', format: 'jsonc', entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 5 }] }],
    });
    let resolveRestore: ((value: OpencodeConfigSourceMutationOutcome) => void) | undefined;
    manager.restoreConfigurationHistory.mockImplementation(() => new Promise((resolve) => { resolveRestore = resolve; }));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();
    const restoreButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-config-restore]');
    if (!restoreButton) throw new Error('restore button missing');
    restoreButton.click();
    restoreButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(manager.restoreConfigurationHistory).toHaveBeenCalledTimes(1);
    expect(restoreButton.disabled).toBe(true);
    expect(restoreButton.textContent).toContain('Restoring');
    resolveRestore?.({
      targetPath,
      result: { status: 'conflict', expected: source.revision, current: revision(targetPath, 'z') },
      evidence: evidence({ persistence: 'failed' }),
    });
    await flush();
    expect(restoreButton.disabled).toBe(false);
  });

  it('prevents OpenCode missing-source Save double activation and exposes loading until conflict settles', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const missing = candidate('project', 'project-default', targetPath, {
      exists: false,
      revision: null,
      evidence: evidence({ persistence: 'not-applicable' }),
    });
    const manager = createManager([missing], { [targetPath]: '' });
    let resolveSave: ((value: OpencodeConfigSourceMutationOutcome) => void) | undefined;
    manager.writeConfigurationSource.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    const saveButton = modal.contentEl.querySelector<HTMLButtonElement>('[data-config-save]');
    if (!saveButton) throw new Error('save button missing');
    saveButton.click();
    saveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    expect(manager.writeConfigurationSource).toHaveBeenCalledTimes(1);
    expect(saveButton.disabled).toBe(true);
    expect(saveButton.textContent).toContain('Saving');
    resolveSave?.({
      targetPath,
      result: { status: 'conflict', expected: null, current: revision(targetPath, 'z') },
      evidence: evidence({ persistence: 'failed' }),
      draft: '',
    });
    await flush();
    expect(saveButton.disabled).toBe(false);
  });

  it('renders the selected target history despite unrelated vault and fixture archives poisoning the project catalog', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const unrelatedFixtureTarget = '/private/var/folders/test/opencodian-config-manager-other/.opencode/opencode.json';
    const identity = 'selected-target-overwrite' as ArchiveHistoryEntryIdentity;
    const manager = createManager([candidate('project', 'project-default', targetPath)], { [targetPath]: '{"permission":"ask"}\n' });
    manager.catalogConfigurationHistory.mockResolvedValue({
      status: 'archive-failed',
      cause: `archived target is not an inventoried OpenCode configuration candidate: ${unrelatedFixtureTarget}`,
    });
    manager.listConfigurationHistory.mockResolvedValue({
      status: 'success',
      targets: [{
        canonicalTarget: targetPath,
        backend: 'opencode',
        scope: 'project',
        kind: 'configuration',
        format: 'jsonc',
        entries: [{ identity, archiveKind: 'overwrite', timestamp: 1, size: 22 }],
      }],
    });
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();

    expect(manager.listConfigurationHistory).toHaveBeenCalledWith(targetPath);
    expect(manager.catalogConfigurationHistory).not.toHaveBeenCalled();
    expect(modal.contentEl.textContent).toContain(targetPath);
    expect(modal.contentEl.querySelector('[data-config-restore]')).not.toBeNull();
  });

  it('maps a canonical deleted history target back to its lexical candidate and refreshes that source', async () => {
    const lexicalPath = '/symlink-vault/.opencode/opencode.jsonc';
    const canonicalPath = '/real-vault/.opencode/opencode.jsonc';
    const identity = 'lexical-history-entry' as ArchiveHistoryEntryIdentity;
    const absent = candidate('project', 'project-default', lexicalPath, {
      exists: false,
      revision: null,
      evidence: evidence({ persistence: 'not-applicable' }),
    });
    const restoredBytes = '{\n  "restored": true\n}\n';
    const restored = candidate('project', 'project-default', lexicalPath, {
      exists: true,
      revision: revision(canonicalPath, 'r'),
    });
    const manager = createManager([absent], { [lexicalPath]: '' });
    manager.inventoryConfigurationSources
      .mockResolvedValueOnce([absent])
      .mockResolvedValueOnce([restored]);
    manager.readConfigurationSource.mockImplementation(async (targetPath: string) => {
      const source = targetPath === lexicalPath && manager.inventoryConfigurationSources.mock.calls.length >= 2
        ? restored
        : absent;
      return { status: 'success', source, content: source.exists ? restoredBytes : '' };
    });
    manager.listConfigurationHistory.mockResolvedValue({
      status: 'success',
      targets: [{
        canonicalTarget: canonicalPath,
        backend: 'opencode',
        scope: 'project',
        kind: 'configuration',
        format: 'jsonc',
        entries: [{ identity, archiveKind: 'delete', timestamp: 1, size: restoredBytes.length }],
      }],
    });
    manager.restoreConfigurationHistory.mockResolvedValue({
      targetPath: canonicalPath,
      result: { status: 'success', revision: revision(canonicalPath, 'r') },
      evidence: evidence({ application: 'pending' }),
    });
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, lexicalPath);
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-history]')?.click();
    await flush();
    modal.contentEl.querySelector<HTMLButtonElement>('[data-config-restore]')?.click();
    await flush();

    expect(manager.restoreConfigurationHistory).toHaveBeenCalledWith({
      entryIdentity: identity,
      expectedRevision: null,
    });
    expect(modal.contentEl.querySelector<HTMLSelectElement>('[data-config-source-select]')?.value).toBe(lexicalPath);
    expect(modal.contentEl.querySelector('[data-config-path]')?.textContent).toContain(lexicalPath);
    expect(modal.contentEl.querySelector<HTMLTextAreaElement>('[data-config-editor]')?.value).toBe(restoredBytes);
  });

  it('disables editor and save without a template after unsafe read failure', async () => {
    const targetPath = '/vault/.opencode/opencode.jsonc';
    const unsafe = candidate('project', 'project-default', targetPath, {
      revision: null,
      parseError: 'Source path failed confinement/read: symlink escape',
      evidence: evidence({ persistence: 'failed', detail: 'unsafe read' }),
    });
    const manager = createManager([unsafe], { [targetPath]: '' });
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, targetPath);
    await flush();
    const editor = modal.contentEl.querySelector<HTMLTextAreaElement>('[data-config-editor]');
    expect(editor?.value).toBe('');
    expect(editor?.disabled).toBe(true);
    expect(modal.contentEl.querySelector('[data-config-save]')).toBeNull();
    expect(modal.contentEl.textContent).toMatch(/safely|安全|confinement/i);
  });

  it('ignores a slower stale source read after a newer selection wins', async () => {
    const firstPath = '/vault/.opencode/first.jsonc';
    const secondPath = '/vault/.opencode/second.jsonc';
    const first = candidate('project', 'project-first', firstPath, {
      exists: false,
      revision: null,
      evidence: evidence({ persistence: 'not-applicable' }),
    });
    const second = candidate('project', 'project-second', secondPath, {
      exists: false,
      revision: null,
      evidence: evidence({ persistence: 'not-applicable' }),
    });
    const manager = createManager([first, second], {});
    const deferred = new Map<string, { resolve: (result: OpencodeConfigSourceReadResult) => void }>();
    manager.readConfigurationSource.mockImplementation((targetPath: string) => new Promise((resolve) => {
      deferred.set(targetPath, { resolve });
    }));
    const modal = new OpencodeConfigModal({} as App, manager as never);
    await modal.onOpen();
    selectSource(modal, firstPath);
    selectSource(modal, secondPath);

    deferred.get(secondPath)?.resolve({ status: 'success', source: second, content: '{"winner":"second"}\n' });
    await flush();
    deferred.get(firstPath)?.resolve({ status: 'success', source: first, content: '{"winner":"first"}\n' });
    await flush();

    expect(modal.contentEl.querySelector<HTMLTextAreaElement>('[data-config-editor]')?.value).toContain('$schema');
    expect(modal.contentEl.querySelector('[data-config-path]')?.textContent).toContain(secondPath);
  });
});
