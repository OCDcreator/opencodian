/**
 * BatchOrganizeCoordinator orchestration tests (R-B5 on the R-B3 seam).
 *
 * Covers the preview → confirm → execute handshake with real vault doubles:
 *   - previews are computed from the actual vault state (metadata cache);
 *   - execution snapshots every affected file BEFORE the first write and
 *     records entries so one-click revert restores everything;
 *   - the stale-plan rule aborts with zero writes when the vault changed
 *     between preview and confirm;
 *   - an unavailable snapshot layer aborts with zero writes;
 *   - property edits go through fileManager.processFrontMatter with typed
 *     values, and the revert restores the file byte-identically;
 *   - cancel/empty plans never open a snapshot and never write;
 *   - R-B5-D2: created folders come down on revert via `adapter.rmdir`
 *     (the file-only `adapter.remove` threw on directories in the real
 *     app), the emptiness guard keeps user content, and folders that
 *     remain are returned as `leftoverFolders` instead of being swallowed.
 */

import { TFile } from 'obsidian';

import { BatchOrganizeCoordinator } from '../../../../src/app/batchOrganize/BatchOrganizeCoordinator';
import {
  CHECKPOINTS_DIR,
} from '../../../../src/core/storage/EditRevertStore';
import type { EditRevertServicePort } from '../../../../src/core/types';
import {
  createHarnessService,
  EditRevertVaultHarness,
  settle,
} from '../../core/storage/EditRevertVaultHarness';

const NOTE_A = '---\n{"tags":["待整理"],"status":"todo"}\n---\nbody a\n';
const NOTE_B = '---\n{"tags":["待整理"]}\n---\nbody b\n';
const NOTE_C = '---\n{"tags":["keep"],"priority":3}\n---\nbody c\n';

function setupHarness(): { harness: EditRevertVaultHarness; caches: Map<string, Record<string, unknown>> } {
  const harness = new EditRevertVaultHarness();
  harness.vaultFiles.set('notes/a.md', NOTE_A);
  harness.vaultFiles.set('notes/b.md', NOTE_B);
  harness.vaultFiles.set('inbox/c.md', NOTE_C);
  harness.folders.add('notes');
  harness.folders.add('inbox');
  const caches = new Map<string, Record<string, unknown>>();
  caches.set('notes/a.md', { frontmatter: { tags: ['待整理'], status: 'todo' } });
  caches.set('notes/b.md', { frontmatter: { tags: ['#待整理'] }, tags: [{ tag: '#待整理' }] });
  caches.set('inbox/c.md', { frontmatter: { tags: ['keep'], priority: 3 } });
  return { harness, caches };
}

async function buildCoordinator(harness: EditRevertVaultHarness, caches: Map<string, Record<string, unknown>>) {
  const context = createHarnessService({ harness });
  await context.service.initialize();
  await settle(context.service);
  const app = {
    vault: harness.vault,
    fileManager: harness.fileManager,
    metadataCache: {
      getFileCache: (file: TFile) => caches.get(file.path) ?? null,
    },
  };
  const order = harness.operationOrder;
  const port: EditRevertServicePort = {
    getSidebarModel: (id) => context.service.getSidebarModel(id),
    beginTurnCapture: (info) => context.service.beginTurnCapture(info),
    endTurnCapture: (id) => context.service.endTurnCapture(id),
    noteWriteToolUse: (info) => context.service.noteWriteToolUse(info),
    revertFile: (id, path) => context.service.revertFile(id, path),
    revertAll: (id) => context.service.revertAll(id),
    restoreFile: (id, path) => context.service.restoreFile(id, path),
    onEntriesChanged: (listener) => context.service.onEntriesChanged(listener),
    beginBatchCapture: async (id, paths) => {
      order.push('snapshot');
      return context.service.beginBatchCapture(id, paths);
    },
    notePluginMove: async (id, from, to) => {
      order.push(`noteMove:${from}`);
      return context.service.notePluginMove(id, from, to);
    },
    notePluginWrite: async (id, path) => {
      order.push(`noteWrite:${path}`);
      return context.service.notePluginWrite(id, path);
    },
    endBatchCapture: async (id) => context.service.endBatchCapture(id),
  };
  const coordinator = new BatchOrganizeCoordinator({ app: app as never, editRevert: port });
  return { coordinator, context };
}

const MOVE_TEMPLATE = {
  templateId: 'move-notes',
  params: { scope: { kind: 'tag', tag: '待整理' }, targetFolder: '归档' },
} as const;

const PROPERTIES_TEMPLATE = {
  templateId: 'edit-properties',
  params: {
    scope: { kind: 'tag', tag: '待整理' },
    operation: { op: 'set', name: 'archived', value: { type: 'boolean', value: true } },
  },
} as const;

describe('BatchOrganizeCoordinator preview (R-B5)', () => {
  it('computes a real preview from the vault state: count, list, matched count', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);

    const outcome = await coordinator.buildPreview(MOVE_TEMPLATE);
    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') {
      return;
    }
    expect(outcome.preview.matchedCount).toBe(2);
    expect(outcome.preview.result.plan.operations).toEqual([
      { kind: 'move', from: 'notes/a.md', to: '归档/a.md' },
      { kind: 'move', from: 'notes/b.md', to: '归档/b.md' },
    ]);
    expect(outcome.preview.signature).toContain('move-notes');
    // A preview never writes.
    expect(harness.renameLog).toEqual([]);
    expect(harness.processLog).toEqual([]);
    expect(harness.diskFilesUnder(CHECKPOINTS_DIR)).toEqual([]);
  });

  it('rejects invalid parameters without touching the vault', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);
    const outcome = await coordinator.buildPreview({
      templateId: 'move-notes',
      params: { scope: { kind: 'tag', tag: 't' }, targetFolder: '../escape' },
    });
    expect(outcome).toEqual({ status: 'invalid', code: 'invalid-folder' });
    expect(harness.diskFilesUnder(CHECKPOINTS_DIR)).toEqual([]);
  });
});

describe('BatchOrganizeCoordinator execute (R-B5)', () => {
  it('snapshots before the first write, executes moves, and one-click revert restores all', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);

    const preview = await coordinator.buildPreview(MOVE_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(MOVE_TEMPLATE, preview.preview.signature);
    expect(result).toMatchObject({ status: 'ok', changed: 2, failures: [] });

    // Vault moved.
    expect(harness.vaultFiles.has('归档/a.md')).toBe(true);
    expect(harness.vaultFiles.has('归档/b.md')).toBe(true);
    expect(harness.vaultFiles.has('notes/a.md')).toBe(false);
    // Forced snapshot happened before the very first write.
    expect(harness.operationOrder[0]).toBe('snapshot');
    expect(harness.operationOrder[1]).toMatch(/^rename:/);
    // Immediate one-click revert.
    expect(coordinator.hasLastBatch()).toBe(true);
    const revert = await coordinator.revertLastBatch();
    expect(revert).toMatchObject({ result: { ok: true, changed: 2 }, leftoverFolders: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe(NOTE_A);
    expect(harness.vaultFiles.get('notes/b.md')).toBe(NOTE_B);
  });

  it('edits properties through processFrontMatter with typed values; revert is byte-identical', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);

    const preview = await coordinator.buildPreview(PROPERTIES_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(PROPERTIES_TEMPLATE, preview.preview.signature);
    expect(result).toMatchObject({ status: 'ok', changed: 2 });

    const edited = JSON.parse((harness.vaultFiles.get('notes/a.md') ?? '').split('\n')[1] ?? '{}') as Record<string, unknown>;
    expect(edited.archived).toBe(true);
    expect(typeof edited.archived).toBe('boolean');
    expect(harness.operationOrder[0]).toBe('snapshot');

    const revert = await coordinator.revertLastBatch();
    expect(revert).toMatchObject({ result: { ok: true, changed: 2 }, leftoverFolders: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe(NOTE_A);
    expect(harness.vaultFiles.get('notes/b.md')).toBe(NOTE_B);
  });

  it('applies the stale-plan rule: vault drift after preview aborts with zero writes', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);

    const preview = await coordinator.buildPreview(MOVE_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    // The vault changes after the user saw the preview: a new matching note appears.
    harness.vaultFiles.set('notes/new.md', '---\n{"tags":["待整理"]}\n---\nnew\n');
    caches.set('notes/new.md', { frontmatter: { tags: ['待整理'] } });

    const result = await coordinator.execute(MOVE_TEMPLATE, preview.preview.signature);
    expect(result).toEqual({ status: 'stale-plan' });
    expect(harness.renameLog).toEqual([]);
    expect(harness.vaultFiles.has('notes/a.md')).toBe(true);
    expect(harness.vaultFiles.has('notes/b.md')).toBe(true);
    // No snapshot round was opened either.
    expect(harness.operationOrder).toEqual([]);
    expect(coordinator.hasLastBatch()).toBe(false);
  });

  it('refuses to run when the snapshot layer is unavailable (zero writes)', async () => {
    const { harness, caches } = setupHarness();
    const app = {
      vault: harness.vault,
      fileManager: harness.fileManager,
      metadataCache: { getFileCache: (file: TFile) => caches.get(file.path) ?? null },
    };
    const coordinator = new BatchOrganizeCoordinator({ app: app as never, editRevert: null });

    const preview = await coordinator.buildPreview(MOVE_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(MOVE_TEMPLATE, preview.preview.signature);
    expect(result).toEqual({ status: 'snapshot-unavailable' });
    expect(harness.renameLog).toEqual([]);
    expect(coordinator.hasLastBatch()).toBe(false);
  });

  it('an empty plan reports "empty" without opening a snapshot', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);

    const template = {
      templateId: 'move-notes',
      params: { scope: { kind: 'tag', tag: 'no-such-tag' }, targetFolder: '归档' },
    } as const;
    const preview = await coordinator.buildPreview(template);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    expect(preview.preview.result.plan.operations).toEqual([]);
    const result = await coordinator.execute(template, preview.preview.signature);
    expect(result).toEqual({ status: 'empty' });
    expect(harness.operationOrder).toEqual([]);
    expect(coordinator.hasLastBatch()).toBe(false);
  });

  it('a mid-execution write failure is reported honestly without blocking the rest', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);

    // The first rename fails at write time (e.g. transient IO error) — the
    // plan itself was fine at preview and re-validation time.
    const originalRename = harness.fileManager.renameFile.bind(harness.fileManager);
    harness.fileManager.renameFile = async (file, newPath) => {
      if (file.path === 'notes/a.md') {
        throw new Error('EACCES: simulated write failure');
      }
      return originalRename(file, newPath);
    };

    const preview = await coordinator.buildPreview(MOVE_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(MOVE_TEMPLATE, preview.preview.signature);
    expect(result).toMatchObject({ status: 'ok', changed: 1, failures: ['notes/a.md'] });
    expect(harness.vaultFiles.has('归档/b.md')).toBe(true);
    // Snapshot still ran before the writes; the failed file left no entry, so
    // the revert covers exactly what actually changed.
    expect(harness.operationOrder[0]).toBe('snapshot');
    const revert = await coordinator.revertLastBatch();
    expect(revert).toMatchObject({ result: { ok: true, changed: 1 }, leftoverFolders: [] });
    expect(harness.vaultFiles.get('notes/b.md')).toBe(NOTE_B);
  });
});

describe('BatchOrganizeCoordinator target folder handling (R-B5-D1)', () => {
  const MOVE_NEW_FOLDER_TEMPLATE = {
    templateId: 'move-notes',
    params: { scope: { kind: 'tag', tag: '待整理' }, targetFolder: '归档验收' },
  } as const;

  it('creates a missing target folder, executes the moves, and revert restores the pre-batch vault shape', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);
    expect(harness.hasVaultFolder('归档验收')).toBe(false);

    const preview = await coordinator.buildPreview(MOVE_NEW_FOLDER_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    // The preview honestly discloses the folder it will create.
    expect(preview.preview.foldersToCreate).toEqual(['归档验收']);

    const result = await coordinator.execute(MOVE_NEW_FOLDER_TEMPLATE, preview.preview.signature);
    expect(result).toMatchObject({ status: 'ok', changed: 2, failures: [], createdFolders: ['归档验收'] });
    expect(harness.hasVaultFolder('归档验收')).toBe(true);
    expect(harness.vaultFiles.has('归档验收/a.md')).toBe(true);
    expect(harness.vaultFiles.has('归档验收/b.md')).toBe(true);

    const revert = await coordinator.revertLastBatch();
    expect(revert).toMatchObject({ result: { ok: true, changed: 2 }, leftoverFolders: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe(NOTE_A);
    expect(harness.vaultFiles.get('notes/b.md')).toBe(NOTE_B);
    // The folder the batch created is gone again: vault == pre-batch shape.
    expect(harness.hasVaultFolder('归档验收')).toBe(false);
  });

  it('folder creation failure is fail closed: zero writes, explicit outcome, nothing revertible', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);
    harness.vault.createFolder = async (): Promise<never> => {
      throw new Error('EACCES: simulated mkdir failure');
    };

    const preview = await coordinator.buildPreview(MOVE_NEW_FOLDER_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(MOVE_NEW_FOLDER_TEMPLATE, preview.preview.signature);
    expect(result).toEqual({ status: 'folder-unavailable', folder: '归档验收', leftoverFolders: [] });
    expect(harness.renameLog).toEqual([]);
    expect(harness.vaultFiles.has('notes/a.md')).toBe(true);
    expect(harness.vaultFiles.has('notes/b.md')).toBe(true);
    expect(harness.hasVaultFolder('归档验收')).toBe(false);
    expect(coordinator.hasLastBatch()).toBe(false);
    // The snapshot round opened first (it precedes every mutation) but no
    // file operation followed it.
    expect(harness.operationOrder).toEqual(['snapshot']);
  });

  it('a created folder that gained other content is kept on revert (never deletes user content)', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);

    const preview = await coordinator.buildPreview(MOVE_NEW_FOLDER_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(MOVE_NEW_FOLDER_TEMPLATE, preview.preview.signature);
    expect(result).toMatchObject({ status: 'ok', changed: 2 });

    // The user drops an unrelated note into the new folder afterwards.
    harness.vaultFiles.set('归档验收/user-note.md', 'user content added later');

    const revert = await coordinator.revertLastBatch();
    expect(revert).toMatchObject({ result: { ok: true, changed: 2 }, leftoverFolders: ['归档验收'] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe(NOTE_A);
    expect(harness.vaultFiles.get('notes/b.md')).toBe(NOTE_B);
    // The folder itself stays because it is no longer empty — and the
    // leftover is surfaced to the caller (R-B5-D2), never swallowed.
    expect(harness.hasVaultFolder('归档验收')).toBe(true);
    expect(harness.vaultFiles.get('归档验收/user-note.md')).toBe('user content added later');
  });

  it('a batch whose operations all fail removes the folders it just created', async () => {
    const { harness, caches } = setupHarness();
    const { coordinator } = await buildCoordinator(harness, caches);
    harness.fileManager.renameFile = async (file) => {
      throw new Error(`simulated rename failure for ${file.path}`);
    };

    const preview = await coordinator.buildPreview(MOVE_NEW_FOLDER_TEMPLATE);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(MOVE_NEW_FOLDER_TEMPLATE, preview.preview.signature);
    expect(result).toMatchObject({
      status: 'ok',
      changed: 0,
      failures: ['notes/a.md', 'notes/b.md'],
      createdFolders: [],
      leftoverFolders: [],
    });
    expect(harness.hasVaultFolder('归档验收')).toBe(false);
    expect(harness.vaultFiles.has('notes/a.md')).toBe(true);
  });

  it('harness honesty: renaming into a missing folder throws like the real API', async () => {
    const { harness } = setupHarness();
    const file = harness.vault.getAbstractFileByPath('notes/a.md');
    expect(file).not.toBeNull();
    await expect(harness.fileManager.renameFile(file as TFile, 'missing/a.md')).rejects.toThrow(
      /target folder does not exist/,
    );
  });
});

describe('BatchOrganizeCoordinator created-folder cleanup (R-B5-D2)', () => {
  const MOVE_INTO_NEW_FOLDER = {
    templateId: 'move-notes',
    params: { scope: { kind: 'tag', tag: '待整理' }, targetFolder: '归档验收P' },
  } as const;

  async function executeMoveIntoNewFolder(harness: EditRevertVaultHarness, caches: Map<string, Record<string, unknown>>) {
    const { coordinator } = await buildCoordinator(harness, caches);
    const preview = await coordinator.buildPreview(MOVE_INTO_NEW_FOLDER);
    if (preview.status !== 'ok') {
      throw new Error('preview failed');
    }
    const result = await coordinator.execute(MOVE_INTO_NEW_FOLDER, preview.preview.signature);
    expect(result).toMatchObject({ status: 'ok', changed: 2, leftoverFolders: [] });
    expect(harness.hasVaultFolder('归档验收P')).toBe(true);
    return coordinator;
  }

  it('revert deletes the folder the batch created: remove() on a directory throws, rmdir() takes it down', async () => {
    // Regression for the live defect: adapter.remove() is file-only in the
    // Obsidian Adapter API, so the cleanup threw, was swallowed by the warn,
    // and the created folder survived the revert as an empty orphan.
    const { harness, caches } = setupHarness();
    const coordinator = await executeMoveIntoNewFolder(harness, caches);

    // The strict harness would fail this misuse loudly:
    await expect(harness.adapter.remove('归档验收P')).rejects.toThrow(/file-only/);
    // (the folder is untouched by the failed remove — like the real API)
    expect(harness.hasVaultFolder('归档验收P')).toBe(true);

    const revert = await coordinator.revertLastBatch();
    expect(revert).toMatchObject({ result: { ok: true, changed: 2 }, leftoverFolders: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe(NOTE_A);
    expect(harness.vaultFiles.get('notes/b.md')).toBe(NOTE_B);
    // The created folder is gone: the vault is back to its pre-batch shape.
    expect(harness.hasVaultFolder('归档验收P')).toBe(false);
    expect(harness.folders.has('归档验收P')).toBe(false);
  });

  it('when rmdir itself fails the leftover folder is surfaced in the revert result, not swallowed', async () => {
    const { harness, caches } = setupHarness();
    const coordinator = await executeMoveIntoNewFolder(harness, caches);

    // Genuinely exceptional removal failure (e.g. EACCES on the directory).
    harness.adapter.rmdir = async (): Promise<never> => {
      throw new Error('EACCES: simulated rmdir failure');
    };

    const revert = await coordinator.revertLastBatch();
    // The file revert still reports success — and the surviving folder is
    // honestly reported instead of vanishing behind a warn log.
    expect(revert).toMatchObject({ result: { ok: true, changed: 2 }, leftoverFolders: ['归档验收P'] });
    expect(harness.hasVaultFolder('归档验收P')).toBe(true);
  });

  it('harness honesty: rmdir refuses a non-empty directory without recursive and a missing directory', async () => {
    const { harness } = setupHarness();
    await expect(harness.adapter.rmdir('ghost', false)).rejects.toThrow(/directory not found/);

    await harness.vault.createFolder('hascontent');
    harness.vaultFiles.set('hascontent/note.md', 'content');
    await expect(harness.adapter.rmdir('hascontent', false)).rejects.toThrow(/not empty/);
    expect(harness.hasVaultFolder('hascontent')).toBe(true);
    expect(harness.vaultFiles.get('hascontent/note.md')).toBe('content');

    await expect(harness.adapter.rmdir('hascontent', true)).resolves.toBeUndefined();
    expect(harness.hasVaultFolder('hascontent')).toBe(false);
    expect(harness.vaultFiles.has('hascontent/note.md')).toBe(false);
  });
});
