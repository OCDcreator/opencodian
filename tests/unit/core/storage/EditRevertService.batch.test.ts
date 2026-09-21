/**
 * EditRevertService batch-capture contract tests (R-B5 on the R-B3 seam).
 *
 * Covers the plugin-initiated batch capture extension from
 * docs/requirements/flowtext-parity.md §R-B5:
 *   - beginBatchCapture force-captures every listed path (no turn budget);
 *   - over-cap files stay honestly marked not revertible;
 *   - notePluginMove records a 'moved' entry that reverts via
 *     fileManager.renameFile (and the revert itself is undoable);
 *   - notePluginWrite resolves pre-images from the forced capture;
 *   - revert is available immediately after endBatchCapture (no grace);
 *   - a disabled snapshot layer resolves false (fail closed);
 *   - batch rounds never interfere with concurrent chat rounds.
 */

import { CHECKPOINT_BLOBS_DIR } from '../../../../src/core/storage/EditRevertStore';
import {
  CONVERSATION_ID,
  createHarnessService,
  EditRevertVaultHarness,
  type HarnessService,
  settle,
} from './EditRevertVaultHarness';

const BATCH_ID = 'batch-organize-1';

async function startedService(
  overrides: Partial<{ isEnabled: () => boolean }> = {},
  harness = new EditRevertVaultHarness(),
): Promise<HarnessService> {
  const context = createHarnessService({ ...overrides, harness });
  harness.vaultFiles.set('notes/a.md', 'PRE-A');
  harness.vaultFiles.set('notes/b.md', 'PRE-B');
  harness.folders.add('notes');
  await context.service.initialize();
  await settle(context.service);
  return context;
}

describe('EditRevertService forced batch capture (R-B5)', () => {
  it('captures every listed path without a turn budget and enables immediate revert-all', async () => {
    const context = await startedService();
    const { service, harness } = context;

    const ok = await service.beginBatchCapture(BATCH_ID, ['notes/a.md', 'notes/b.md']);
    expect(ok).toBe(true);
    harness.writeAgentFile('notes/a.md', 'POST-A');
    harness.writeAgentFile('notes/b.md', 'POST-B');
    await service.notePluginWrite(BATCH_ID, 'notes/a.md');
    await service.notePluginWrite(BATCH_ID, 'notes/b.md');
    await service.endBatchCapture(BATCH_ID);
    await settle(service);

    const preview = await service.getRevertPreview(BATCH_ID);
    expect(preview.roundOpen).toBe(false);
    expect(preview.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'notes/a.md', beforeLines: 1, afterLines: 1, conflict: false }),
      expect.objectContaining({ path: 'notes/b.md', beforeLines: 1, afterLines: 1, conflict: false }),
    ]));

    // Immediate availability: no clock advance, no post-turn grace needed.
    const result = await service.revertAll(BATCH_ID);
    expect(result).toMatchObject({ ok: true, changed: 2, skipped: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
    expect(harness.vaultFiles.get('notes/b.md')).toBe('PRE-B');
  });

  it('stores captured pre-images in the content-addressed checkpoint store', async () => {
    const context = await startedService();
    const { service, harness } = context;

    await service.beginBatchCapture(BATCH_ID, ['notes/a.md']);
    await settle(service);
    const blobs = await service.listBlobHashes();
    expect(blobs.length).toBeGreaterThanOrEqual(1);
    expect(harness.diskFilesUnder(`${CHECKPOINT_BLOBS_DIR}`).length).toBe(blobs.length);
  });

  it('marks over-cap files honestly as not revertible (no silent skip)', async () => {
    const big = 'X'.repeat(2 * 1024 * 1024 + 1);
    const harness = new EditRevertVaultHarness();
    harness.vaultFiles.set('notes/big.md', big);
    const context = await startedService({}, harness);

    await context.service.beginBatchCapture(BATCH_ID, ['notes/big.md']);
    harness.writeAgentFile('notes/big.md', 'rewritten');
    await context.service.notePluginWrite(BATCH_ID, 'notes/big.md');
    await context.service.endBatchCapture(BATCH_ID);
    await settle(context.service);

    const result = await context.service.revertFile(BATCH_ID, 'notes/big.md');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not-revertible:oversize');
    // Honest record: content untouched (still the rewritten post state).
    expect(harness.vaultFiles.get('notes/big.md')).toBe('rewritten');
  });

  it('resolves false when the snapshot layer is disabled (fail closed)', async () => {
    const context = await startedService({ isEnabled: () => false });
    const ok = await context.service.beginBatchCapture(BATCH_ID, ['notes/a.md']);
    expect(ok).toBe(false);
  });

  it('keeps batch rounds separate from concurrent chat rounds', async () => {
    const context = await startedService();
    const { service, harness } = context;

    // Chat round for the normal conversation id.
    service.beginTurnCapture({
      conversationId: CONVERSATION_ID,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(service);

    // Concurrent batch round.
    await service.beginBatchCapture(BATCH_ID, ['notes/b.md']);
    harness.writeAgentFile('notes/b.md', 'BATCH-POST');
    await service.notePluginWrite(BATCH_ID, 'notes/b.md');
    await service.endBatchCapture(BATCH_ID);
    await settle(service);

    // The chat round must not see the batch file, and vice versa.
    const batchRevert = await service.revertAll(BATCH_ID);
    expect(batchRevert).toMatchObject({ ok: true, changed: 1 });
    expect(harness.vaultFiles.get('notes/b.md')).toBe('PRE-B');
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
  });
});

describe('EditRevertService plugin move records (R-B5)', () => {
  it('records a moved entry whose revert renames back through fileManager', async () => {
    const context = await startedService();
    const { service, harness } = context;

    await service.beginBatchCapture(BATCH_ID, ['notes/a.md']);
    // The harness double now validates parent folders like the real API.
    await harness.vault.createFolder('归档');
    await harness.fileManager.renameFile(harness.vault.getAbstractFileByPath('notes/a.md')!, '归档/a.md');
    await service.notePluginMove(BATCH_ID, 'notes/a.md', '归档/a.md');
    await service.endBatchCapture(BATCH_ID);
    await settle(service);

    const result = await service.revertFile(BATCH_ID, 'notes/a.md');
    expect(result).toMatchObject({ ok: true, changed: 1 });
    // First entry: the batch move itself; second: the revert renaming back.
    expect(harness.renameLog).toEqual([
      { from: 'notes/a.md', to: '归档/a.md' },
      { from: '归档/a.md', to: 'notes/a.md' },
    ]);
    expect(harness.vaultFiles.has('notes/a.md')).toBe(true);
    expect(harness.vaultFiles.has('归档/a.md')).toBe(false);
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
  });

  it('the move revert itself is undoable (restore re-does the move)', async () => {
    const context = await startedService();
    const { service, harness } = context;

    await service.beginBatchCapture(BATCH_ID, ['notes/a.md']);
    await harness.vault.createFolder('归档');
    await harness.fileManager.renameFile(harness.vault.getAbstractFileByPath('notes/a.md')!, '归档/a.md');
    await service.notePluginMove(BATCH_ID, 'notes/a.md', '归档/a.md');
    await service.endBatchCapture(BATCH_ID);
    await settle(service);

    await service.revertFile(BATCH_ID, 'notes/a.md');
    const restored = await service.restoreFile(BATCH_ID, 'notes/a.md');
    expect(restored).toMatchObject({ ok: true, changed: 1 });
    expect(harness.vaultFiles.has('归档/a.md')).toBe(true);
    expect(harness.vaultFiles.has('notes/a.md')).toBe(false);
  });

  it('refuses a batch-captured file whose pre-image capture failed while still proceeding later', async () => {
    // A path that vanishes between preview and capture is recorded as
    // 'missing' (no entry): nothing changed, so revert has nothing to do.
    const context = await startedService();
    const { service } = context;
    await service.beginBatchCapture(BATCH_ID, ['notes/ghost.md']);
    await service.endBatchCapture(BATCH_ID);
    await settle(service);
    const result = await service.revertAll(BATCH_ID);
    expect(result).toMatchObject({ ok: true, changed: 0, skipped: [] });
  });
});

describe('EditRevertService canvas coverage (R-C5 text-node write under R-B3)', () => {
  it('force-captures a .canvas pre-image and reverts the plugin write back to it', async () => {
    const context = await startedService();
    const { service, harness } = context;
    harness.vaultFiles.set('boards/e2e.canvas', '{"nodes":[],"edges":[]}');

    // The canvas text-node write path: forced capture BEFORE the write.
    const ok = await service.beginBatchCapture(BATCH_ID, ['boards/e2e.canvas']);
    expect(ok).toBe(true);
    harness.writeAgentFile('boards/e2e.canvas', '{"nodes":[{"id":"n1","text":"AI rewritten"}],"edges":[]}');
    await service.notePluginWrite(BATCH_ID, 'boards/e2e.canvas');
    await service.endBatchCapture(BATCH_ID);
    await settle(service);

    const meta = service.getRoundMeta(
      service.getSidebarModel(BATCH_ID).roundId ?? '',
    );
    const entry = meta?.entries.find((item) => item.path === 'boards/e2e.canvas');
    expect(entry).toMatchObject({ status: 'modified', source: 'plugin', preImageStatus: 'available' });

    const result = await service.revertFile(BATCH_ID, 'boards/e2e.canvas');
    expect(result).toMatchObject({ ok: true, changed: 1 });
    expect(harness.vaultFiles.get('boards/e2e.canvas')).toBe('{"nodes":[],"edges":[]}');
  });

  it('refuses the canvas batch (fail closed) when the snapshot layer is disabled', async () => {
    const context = await startedService({ isEnabled: () => false });
    const { service } = context;
    const ok = await service.beginBatchCapture(BATCH_ID, ['boards/e2e.canvas']);
    expect(ok).toBe(false);
  });

  it('keeps the vault-event funnel markdown-only: a canvas modify never self-records', async () => {
    const context = await startedService();
    const { service, harness } = context;
    harness.vaultFiles.set('boards/e2e.canvas', '{"nodes":[],"edges":[]}');

    await service.beginBatchCapture(BATCH_ID, ['boards/e2e.canvas']);
    await settle(service);
    // An external canvas write while the round is open: the funnel ignores
    // non-markdown files on purpose — only the explicit notePluginWrite may
    // record the canvas entry.
    harness.writeAgentFile('boards/e2e.canvas', '{"nodes":[{"id":"n1"}],"edges":[]}');
    await settle(service);
    const meta = service.getRoundMeta(service.getSidebarModel(BATCH_ID).roundId ?? '');
    expect(meta?.entries.find((item) => item.path === 'boards/e2e.canvas')).toBeUndefined();
  });
});
