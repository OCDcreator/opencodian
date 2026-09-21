/**
 * EditRevertService post-baseline closure hardening (R-F3 quality follow-up).
 *
 * The review found that `performEndTurnCapture` / `performEndBatchCapture`
 * awaited `freezePostImages(round)` BEFORE writing `closedAt` /
 * `acceptsWritesUntil`. `EditRevertStore.storeBlob` writes through
 * `vault.adapter.write`, which throws on a real disk error, and the end-turn
 * entrypoints only log the rejection — so a failed blob write left the round
 * with `closedAt === null` and `acceptsWritesUntil === Number.MAX_SAFE_INTEGER`.
 * The round then stayed the vault-event attribution target forever, silently
 * absorbing every later user edit into a turn that had already ended.
 *
 * These tests pin the fixed contract:
 *   - the round lifecycle reaches its closed state whether or not the freeze
 *     succeeded (turn path keeps its documented post-turn grace, batch path
 *     gets none);
 *   - an unfrozen entry is recorded honestly as `postImageUnavailable` and the
 *     preview reports `baseline-unavailable` — no fabricated baseline;
 *   - the freeze honours a wall-clock budget instead of blocking the serial
 *     queue behind an unbounded number of blob writes;
 *   - writes after a failed batch close are no longer attributed to it.
 */

import {
  CHECKPOINT_BLOBS_DIR,
} from '../../../../src/core/storage/EditRevertStore';
import {
  CONVERSATION_ID,
  createHarnessService,
  EditRevertVaultHarness,
  type HarnessService,
  POST_TURN_GRACE_MS,
  settle,
} from './EditRevertVaultHarness';

const BATCH_ID = 'batch-baseline-closure';

/** Make every checkpoint-blob write fail; round JSON persistence stays intact. */
function failBlobWrites(harness: EditRevertVaultHarness): jest.SpyInstance {
  const write = harness.adapter.write.bind(harness.adapter);
  return jest.spyOn(harness.adapter, 'write').mockImplementation(async (path: string, data: string) => {
    if (path.startsWith(CHECKPOINT_BLOBS_DIR)) {
      throw new Error(`simulated disk failure: ${path}`);
    }
    return write(path, data);
  });
}

async function startedService(
  harness = new EditRevertVaultHarness(),
): Promise<HarnessService> {
  const context = createHarnessService({ harness });
  harness.vaultFiles.set('notes/a.md', 'PRE-A');
  harness.vaultFiles.set('notes/b.md', 'PRE-B');
  harness.folders.add('notes');
  await context.service.initialize();
  await settle(context.service);
  return context;
}

describe('EditRevertService post-baseline freeze failure (R-F3)', () => {
  it('still closes a turn round when the post-baseline blob write throws', async () => {
    const context = await startedService();
    const { service, harness } = context;

    service.beginTurnCapture({
      conversationId: CONVERSATION_ID,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(service);
    harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(service);

    const failWrites = failBlobWrites(harness);
    service.endTurnCapture(CONVERSATION_ID);
    await settle(service);
    failWrites.mockRestore();

    const roundId = service.getSidebarModel(CONVERSATION_ID).roundId;
    expect(roundId).not.toBeNull();
    const meta = service.getRoundMeta(roundId!);
    // The pre-existing bug left both of these untouched (null / MAX_SAFE_INTEGER).
    expect(meta?.closedAt).not.toBeNull();
    expect(meta?.acceptsWritesUntil).toBeLessThanOrEqual(
      context.clock.value + POST_TURN_GRACE_MS,
    );
    expect(meta?.acceptsWritesUntil).toBeGreaterThan(0);
  });

  it('still closes a plugin batch round when the post-baseline blob write throws', async () => {
    const context = await startedService();
    const { service, harness } = context;

    await service.beginBatchCapture(BATCH_ID, ['notes/a.md']);
    harness.writeAgentFile('notes/a.md', 'POST-A');
    await service.notePluginWrite(BATCH_ID, 'notes/a.md');

    const failWrites = failBlobWrites(harness);
    await service.endBatchCapture(BATCH_ID);
    await settle(service);
    failWrites.mockRestore();

    const roundId = service.getSidebarModel(BATCH_ID).roundId;
    const meta = service.getRoundMeta(roundId!);
    expect(meta?.closedAt).not.toBeNull();
    // Batch rounds never take a post-close grace: revert is available at once.
    expect(meta?.acceptsWritesUntil).toBeLessThanOrEqual(context.clock.value);
    expect((await service.getRevertPreview(BATCH_ID)).roundOpen).toBe(false);
  });

  it('reports the unfrozen entry as baseline-unavailable instead of fabricating a baseline', async () => {
    const context = await startedService();
    const { service, harness } = context;

    service.beginTurnCapture({
      conversationId: CONVERSATION_ID,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(service);
    harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(service);

    const failWrites = failBlobWrites(harness);
    service.endTurnCapture(CONVERSATION_ID);
    await settle(service);
    failWrites.mockRestore();

    const roundId = service.getSidebarModel(CONVERSATION_ID).roundId;
    const entry = service.getRoundMeta(roundId!)?.entries.find((item) => item.path === 'notes/a.md');
    expect(entry?.postImageHash).toBeUndefined();
    expect(entry?.postImageMissing).toBeFalsy();
    expect(entry?.postImageUnavailable).toBe(true);

    const preview = await service.getRevertPreview(CONVERSATION_ID, ['notes/a.md']);
    expect(preview.rows).toEqual([expect.objectContaining({
      path: 'notes/a.md',
      afterLines: null,
      conflict: true,
      conflictReason: 'baseline-unavailable',
    })]);
    // Honest: the pre-image and the writeback semantics are untouched, so the
    // file is still revertible to its pre-turn content.
    context.advance(POST_TURN_GRACE_MS + 1);
    const reverted = await service.revertFile(CONVERSATION_ID, 'notes/a.md');
    expect(reverted).toMatchObject({ ok: true, changed: 1 });
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
  });

  it('does not attribute a later vault write to a batch round that failed to freeze', async () => {
    const context = await startedService();
    const { service, harness } = context;

    await service.beginBatchCapture(BATCH_ID, ['notes/a.md']);
    harness.writeAgentFile('notes/a.md', 'POST-A');
    await service.notePluginWrite(BATCH_ID, 'notes/a.md');

    const failWrites = failBlobWrites(harness);
    await service.endBatchCapture(BATCH_ID);
    await settle(service);
    failWrites.mockRestore();

    const roundId = service.getSidebarModel(BATCH_ID).roundId;
    const entriesBefore = service.getRoundMeta(roundId!)?.entries.length ?? 0;

    // A user edit after the failed close must not join the finished batch.
    harness.writeAgentFile('notes/b.md', 'USER-EDIT-AFTER-CLOSE');
    await settle(service);

    const meta = service.getRoundMeta(roundId!);
    expect(meta?.entries.length).toBe(entriesBefore);
    expect(meta?.entries.some((item) => item.path === 'notes/b.md')).toBe(false);
  });
});

describe('EditRevertService post-baseline freeze budget (R-F3)', () => {
  it('stops at the wall-clock budget and marks the remaining entries unavailable', async () => {
    const harness = new EditRevertVaultHarness();
    const context = await startedService(harness);
    const { service } = context;

    const paths = ['notes/a.md', 'notes/b.md', 'notes/c.md', 'notes/d.md'];
    harness.vaultFiles.set('notes/c.md', 'PRE-C');
    harness.vaultFiles.set('notes/d.md', 'PRE-D');

    service.beginTurnCapture({
      conversationId: CONVERSATION_ID,
      backend: 'opencode',
      userText: '',
      contextPaths: paths,
    });
    await settle(service);
    for (const path of paths) {
      harness.writeAgentFile(path, `POST-${path}`);
    }
    await settle(service);

    // Each blob write burns 400ms of the injected clock, so a 500ms budget can
    // only ever freeze one post baseline; the rest must be marked unavailable
    // rather than blocking the queue behind all four writes.
    const write = harness.adapter.write.bind(harness.adapter);
    const slowWrites = jest.spyOn(harness.adapter, 'write').mockImplementation(async (path: string, data: string) => {
      if (path.startsWith(CHECKPOINT_BLOBS_DIR)) {
        context.clock.value += 400;
      }
      return write(path, data);
    });

    const startedAt = context.clock.value;
    service.endTurnCapture(CONVERSATION_ID);
    await settle(service);
    slowWrites.mockRestore();

    const elapsed = context.clock.value - startedAt;
    // Four writes at 400ms each would be 1600ms; the budget bounds the freeze.
    expect(elapsed).toBeLessThan(4 * 400);

    const roundId = service.getSidebarModel(CONVERSATION_ID).roundId;
    const entries = service.getRoundMeta(roundId!)?.entries ?? [];
    const frozen = entries.filter((entry) => !!entry.postImageHash);
    const unavailable = entries.filter((entry) => entry.postImageUnavailable === true);
    expect(frozen.length).toBeGreaterThanOrEqual(1);
    expect(unavailable.length).toBeGreaterThanOrEqual(1);
    // Every active entry is accounted for: frozen or honestly unavailable.
    expect(frozen.length + unavailable.length).toBe(entries.length);

    const preview = await service.getRevertPreview(CONVERSATION_ID);
    expect(preview.rows.some((row) => row.conflictReason === 'baseline-unavailable')).toBe(true);
    // The turn path keeps its documented post-turn grace, but the round is
    // closed: once the grace expires it stops accepting writes.
    context.advance(POST_TURN_GRACE_MS + 1);
    expect((await service.getRevertPreview(CONVERSATION_ID)).roundOpen).toBe(false);
  });
});
