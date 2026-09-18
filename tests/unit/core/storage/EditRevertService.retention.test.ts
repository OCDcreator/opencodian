/**
 * EditRevertService retention and content-addressed dedup tests (R-B3 §8.1).
 *
 * Requirement: snapshots live in `.opencodian/checkpoints/` with
 * content-addressed dedup (identical content stored once), and retention
 * limits (per-conversation count, global count, byte cap) evict the oldest
 * records first. Unreferenced blobs are swept after round eviction.
 */

import {
  CHECKPOINT_BLOBS_DIR,
  CHECKPOINT_ROUNDS_DIR,
} from '../../../../src/core/storage/EditRevertStore';
import {
  createHarnessService,
  settle,
} from './EditRevertVaultHarness';

const KIB = 1024;

async function startedService(
  overrides: Partial<{ limitBytes: number }> = {},
): Promise<ReturnType<typeof createHarnessService>> {
  const context = createHarnessService(overrides);
  await context.service.initialize();
  await settle(context.service);
  return context;
}

/** One full capture round on `notes/a.md` with a distinct pre/post content. */
async function runFileRound(
  context: ReturnType<typeof createHarnessService>,
  index: number,
  conversationId: string,
): Promise<void> {
  const pre = `CONTENT-${index}-PRE`;
  const post = `CONTENT-${index}-POST`;
  context.harness.vaultFiles.set('notes/a.md', pre);

  context.service.beginTurnCapture({
    conversationId,
    backend: 'opencode',
    userText: '',
    contextPaths: ['notes/a.md'],
  });
  await settle(context.service);
  context.harness.writeAgentFile('notes/a.md', post);
  await settle(context.service);
  context.service.endTurnCapture(conversationId);
  await settle(context.service);
  context.advance(1000);
}

describe('EditRevertService retention and dedup (R-B3 §8.1)', () => {
  it('stores identical content once: the same pre-image blob is reused across rounds', async () => {
    const context = await startedService();
    // Same "pre-turn" content every round -> the same content-addressed blob.
    context.harness.vaultFiles.set('notes/a.md', 'SAME');

    for (let index = 0; index < 3; index += 1) {
      context.service.beginTurnCapture({
        conversationId: 'conv-dedup',
        backend: 'opencode',
        userText: '',
        contextPaths: ['notes/a.md'],
      });
      await settle(context.service);
      context.harness.writeAgentFile('notes/a.md', `POST-${index}`);
      await settle(context.service);
      context.service.endTurnCapture('conv-dedup');
      await settle(context.service);
      context.advance(1000);
      context.harness.vaultFiles.set('notes/a.md', 'SAME');
    }
    await settle(context.service);

    const blobWrites = context.harness.adapterWriteLog.filter(
      (path) => path.startsWith(`${CHECKPOINT_BLOBS_DIR}/`) && path !== CHECKPOINT_BLOBS_DIR,
    );
    // Three rounds each captured the identical pre-turn content 'SAME', but
    // content addressing stored exactly one blob for it.
    expect(blobWrites).toHaveLength(1);
  });

  it('evicts the oldest round beyond the per-conversation cap and sweeps its blob', async () => {
    const context = await startedService();

    for (let index = 1; index <= 11; index += 1) {
      await runFileRound(context, index, 'conv-cap');
    }
    await settle(context.service);

    // 11 rounds -> keep the newest 10 per conversation.
    const rounds = context.harness.diskFilesUnder(CHECKPOINT_ROUNDS_DIR).filter((path) => path.endsWith('.json'));
    expect(rounds).toHaveLength(10);

    const blobs = context.harness.diskFilesUnder(CHECKPOINT_BLOBS_DIR);
    // Rounds 2..11 reference CONTENT-1-PRE..CONTENT-10-PRE (10 blobs);
    // round 1's pre-image blob was swept with its round.
    expect(blobs).toHaveLength(10);
  });

  it('evicts the oldest round when the snapshot byte cap is exceeded', async () => {
    // Three rounds with ~720KiB distinct pre-images: 3 x 720KiB exceeds the
    // byte-cap floor (the per-file snapshot cap of 2MiB, see enforceRetention).
    const bigSize = 720 * KIB;
    const context = await startedService({ limitBytes: 2 * KIB * KIB });

    for (let index = 1; index <= 3; index += 1) {
      const pre = `${'a'.repeat(bigSize)}-PRE-${index}`;
      const post = `${'b'.repeat(bigSize)}-POST-${index}`;
      context.harness.vaultFiles.set('notes/a.md', pre);
      context.service.beginTurnCapture({
        conversationId: 'conv-bytes',
        backend: 'opencode',
        userText: '',
        contextPaths: ['notes/a.md'],
      });
      await settle(context.service);
      context.harness.writeAgentFile('notes/a.md', post);
      await settle(context.service);
      context.service.endTurnCapture('conv-bytes');
      await settle(context.service);
      context.advance(1000);
    }
    await settle(context.service);

    // The byte cap floor (per-file snapshot cap) is exceeded by round 3's
    // accounting, so round 1 (oldest) is evicted and its blob swept.
    const rounds = context.harness.diskFilesUnder(CHECKPOINT_ROUNDS_DIR).filter((path) => path.endsWith('.json'));
    expect(rounds).toHaveLength(2);
  });

  it('keeps rounds of different conversations under the global count cap', async () => {
    const context = await startedService();
    const conversations = ['conv-x', 'conv-y'];

    for (let index = 1; index <= 16; index += 1) {
      await runFileRound(context, index, conversations[index % 2]);
    }
    await settle(context.service);

    // 16 rounds total (8 per conversation, both under the per-conversation
    // cap of 10): the GLOBAL cap of 30 is not reached, nothing is evicted.
    const rounds = context.harness.diskFilesUnder(CHECKPOINT_ROUNDS_DIR).filter((path) => path.endsWith('.json'));
    expect(rounds).toHaveLength(16);
  });
});
