/**
 * EditRevertService unit tests (R-B3 编辑回退).
 *
 * Covers the acceptance criteria from docs/requirements/flowtext-parity.md
 * §R-B3 that are unit-testable without a live Obsidian:
 *   - single-file revert is byte-identical and leaves other files untouched;
 *   - revert-all restores every modified file;
 *   - turn-created files go to the Obsidian trash (never a physical delete);
 *   - revert itself is re-undoable (恢复回退);
 *   - over-cap files are labeled "not snapshotted" and refuse revert;
 *   - the ≤200ms turn-start budget degrades to tool-declared capture;
 *   - all vault write-backs stay inside vault.process/create/trash.
 *
 * Retention/dedup and backend-agnosticism live in the sibling suites.
 */

import {
  CHECKPOINT_BLOBS_DIR,
  CHECKPOINTS_DIR,
} from '../../../../src/core/storage/EditRevertStore';
import {
  CONVERSATION_ID,
  createHarnessService,
  type HarnessService,
  POST_TURN_GRACE_MS,
  settle,
} from './EditRevertVaultHarness';

async function startedService(
  overrides: Partial<{ isEnabled: () => boolean; now: () => number; limitBytes: number }> = {},
): Promise<HarnessService> {
  const context = createHarnessService(overrides);
  context.harness.vaultFiles.set('notes/a.md', 'PRE-A');
  context.harness.vaultFiles.set('notes/b.md', 'PRE-B');
  await context.service.initialize();
  await settle(context.service);
  return context;
}

describe('EditRevertService revert flows (R-B3)', () => {
  it('reverts one modified file byte-identically without touching the other (AC1/AC2)', async () => {
    const context = await startedService();
    const conversationId = CONVERSATION_ID;

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md', 'notes/b.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    context.harness.writeAgentFile('notes/b.md', 'POST-B');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const result = await context.service.revertFile(conversationId, 'notes/a.md');

    expect(result).toMatchObject({ ok: true, changed: 1, skipped: [] });
    expect(context.harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
    // The other modified file keeps its turn content.
    expect(context.harness.vaultFiles.get('notes/b.md')).toBe('POST-B');
  });

  it('revert-all restores every modified file of the round (AC3)', async () => {
    const context = await startedService();
    const conversationId = 'conv-all';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'claude-code',
      userText: '',
      contextPaths: ['notes/a.md', 'notes/b.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    context.harness.writeAgentFile('notes/b.md', 'POST-B');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const result = await context.service.revertAll(conversationId);

    expect(result).toMatchObject({ ok: true, changed: 2, skipped: [] });
    expect(context.harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
    expect(context.harness.vaultFiles.get('notes/b.md')).toBe('PRE-B');
  });

  it('sends a turn-created file to the Obsidian trash and restores it on undo (AC4/AC5)', async () => {
    const context = await startedService();
    const conversationId = 'conv-created';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'codex',
      userText: '',
      contextPaths: [],
    });
    await settle(context.service);
    context.harness.createAgentFile('notes/new.md', 'CREATED-V1');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const revert = await context.service.revertFile(conversationId, 'notes/new.md');

    expect(revert.ok).toBe(true);
    // Moved to the Obsidian trash (system trash requested, not a raw delete).
    expect(context.harness.trashLog).toEqual([{ path: 'notes/new.md', system: false }]);
    expect(context.harness.vaultFiles.has('notes/new.md')).toBe(false);

    const restore = await context.service.restoreFile(conversationId, 'notes/new.md');

    expect(restore.ok).toBe(true);
    // Restored through vault.create with the pre-revert content.
    expect(context.harness.createLog).toContain('notes/new.md');
    expect(context.harness.vaultFiles.get('notes/new.md')).toBe('CREATED-V1');
  });

  it('keeps a created file revertible when the agent writes it again in the same turn', async () => {
    const context = await startedService();
    const conversationId = 'conv-sticky';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'pi',
      userText: '',
      contextPaths: [],
    });
    await settle(context.service);
    context.harness.createAgentFile('notes/new.md', 'V1');
    context.harness.writeAgentFile('notes/new.md', 'V2');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const model = context.service.getSidebarModel(conversationId);
    expect(model.entries).toEqual([
      expect.objectContaining({ path: 'notes/new.md', status: 'created', revertible: true }),
    ]);

    const result = await context.service.revertFile(conversationId, 'notes/new.md');

    expect(result.ok).toBe(true);
    expect(context.harness.trashLog).toEqual([{ path: 'notes/new.md', system: false }]);
  });

  it('makes the revert itself undoable: restore returns the pre-revert content (AC5)', async () => {
    const context = await startedService();
    const conversationId = 'conv-symmetry';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const revert = await context.service.revertFile(conversationId, 'notes/a.md');
    expect(revert.ok).toBe(true);
    expect(context.harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
    // Reverting must not be recorded as a new agent edit (self-write guard).
    await settle(context.service);
    expect(context.service.getSidebarModel(conversationId).entries).toEqual([
      expect.objectContaining({ path: 'notes/a.md', state: 'reverted', restorable: true }),
    ]);

    const restore = await context.service.restoreFile(conversationId, 'notes/a.md');
    expect(restore.ok).toBe(true);
    expect(context.harness.vaultFiles.get('notes/a.md')).toBe('POST-A');
    await settle(context.service);
    expect(context.service.getSidebarModel(conversationId).entries).toEqual([
      expect.objectContaining({ path: 'notes/a.md', state: 'active', revertible: true }),
    ]);
  });
});

describe('EditRevertService capability honesty (R-B3)', () => {
  it('labels over-cap files as not snapshotted and refuses to revert them (AC6)', async () => {
    const context = await startedService();
    const conversationId = 'conv-oversize';
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    context.harness.vaultFiles.set('notes/big.md', oversized);

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/big.md', 'notes/a.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/big.md', 'OVER-POST');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const model = context.service.getSidebarModel(conversationId);
    expect(model.entries.find((entry) => entry.path === 'notes/big.md')).toEqual({
      path: 'notes/big.md',
      status: 'modified',
      state: 'active',
      revertible: false,
      restorable: false,
      excludedReason: 'oversize',
    });
    expect(model.revertibleCount).toBe(0);

    const result = await context.service.revertFile(conversationId, 'notes/big.md');
    expect(result).toMatchObject({ ok: false, changed: 0, error: 'not-revertible:oversize' });
    expect(context.harness.vaultFiles.get('notes/big.md')).toBe('OVER-POST');
  });

  it('lists files without any pre-image but refuses revert (fail-closed honesty)', async () => {
    const context = await startedService();
    const conversationId = 'conv-unmapped';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: [],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/surprise.md', 'NEW-CONTENT');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const model = context.service.getSidebarModel(conversationId);
    expect(model.entries.find((entry) => entry.path === 'notes/surprise.md')).toEqual(
      expect.objectContaining({ revertible: false, excludedReason: 'no-preimage' }),
    );

    const result = await context.service.revertFile(conversationId, 'notes/surprise.md');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not-revertible');
    expect(context.harness.vaultFiles.get('notes/surprise.md')).toBe('NEW-CONTENT');
  });

  it('degrades the turn-start pre-snapshot over the 200ms budget but keeps tool-declared capture', async () => {
    let calls = 0;
    const base = 1_000_000;
    const context = await startedService({ now: () => base + (calls += 250) });
    const conversationId = 'conv-budget';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'claude-code',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(context.service);

    // Simulate a tool-declared write on a file the budget pass never reached.
    context.service.noteWriteToolUse({
      conversationId,
      toolName: 'Edit',
      input: { file_path: `${context.harness.adapter.getBasePath()}/notes/b.md` },
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/b.md', 'POST-B');
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const model = context.service.getSidebarModel(conversationId);
    expect(model.degraded).toBe(true);
    // Tool-declared file: captured pre-image, revertible. Budget-missed file: not.
    expect(model.entries.find((entry) => entry.path === 'notes/b.md')).toEqual(
      expect.objectContaining({ revertible: true }),
    );
    expect(model.entries.find((entry) => entry.path === 'notes/a.md')).toEqual(
      expect.objectContaining({ revertible: false, excludedReason: 'no-preimage' }),
    );
  });
});

describe('EditRevertService capture guards and lifecycle (R-B3)', () => {
  it('refuses revert while the round is still open (turn running / grace active)', async () => {
    const context = await startedService();
    const conversationId = 'conv-open';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(context.service);

    const result = await context.service.revertFile(conversationId, 'notes/a.md');

    expect(result).toMatchObject({ ok: false, changed: 0, error: 'round-open' });
    expect(context.harness.vaultFiles.get('notes/a.md')).toBe('POST-A');
  });

  it('ignores non-markdown writes (text files only in this milestone)', async () => {
    const context = await startedService();
    const conversationId = 'conv-text';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: [],
    });
    await settle(context.service);
    context.harness.vaultFiles.set('notes/data.txt', 'TEXT');
    context.service.handleVaultModify('notes/data.txt');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);

    expect(context.service.getSidebarModel(conversationId).entries).toEqual([]);
  });

  it('normalizes absolute tool paths and never writes outside the plugin data prefix', async () => {
    const context = await startedService();
    const conversationId = 'conv-abs';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'claude-code',
      userText: '',
      contextPaths: [],
    });
    await settle(context.service);
    context.service.noteWriteToolUse({
      conversationId,
      toolName: 'Write',
      input: { file_path: `${context.harness.adapter.getBasePath()}/notes/a.md` },
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(POST_TURN_GRACE_MS + 1);

    const result = await context.service.revertFile(conversationId, 'notes/a.md');
    expect(result.ok).toBe(true);
    expect(context.harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');

    // All adapter writes stayed inside the plugin data dir; vault writes went
    // through vault.process (never adapter.write).
    for (const path of context.harness.adapterWriteLog) {
      expect(path.startsWith(CHECKPOINTS_DIR)).toBe(true);
    }
    expect(context.harness.diskFilesUnder(CHECKPOINT_BLOBS_DIR).length).toBeGreaterThan(0);
    expect(context.harness.processLog).toContain('notes/a.md');
  });

  it('survives a plugin restart: persisted rounds reload revertible with capture closed', async () => {
    const context = await startedService();
    const conversationId = 'conv-restart';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.service.dispose();

    // A fresh service instance over the same vault reloads the persisted
    // round; its capture window is clamped shut, so revert works immediately.
    const restarted = createHarnessService({ harness: context.harness });
    restarted.harness.vaultFiles.set('notes/a.md', 'POST-A');
    await restarted.service.initialize();
    await settle(restarted.service);

    const model = restarted.service.getSidebarModel(conversationId);
    expect(model.entries).toEqual([
      expect.objectContaining({ path: 'notes/a.md', revertible: true }),
    ]);

    const result = await restarted.service.revertFile(conversationId, 'notes/a.md');
    expect(result.ok).toBe(true);
    expect(restarted.harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
  });

  it('attributes post-turn grace writes to the same round and still reverts to the pre-turn image', async () => {
    const context = await startedService();
    const conversationId = 'conv-rewrite';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A1');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);

    // A write inside the post-turn grace window still belongs to this round
    // and must not change the round's pre-turn snapshot.
    context.advance(1000);
    context.harness.writeAgentFile('notes/a.md', 'POST-A2');
    await settle(context.service);
    expect(context.service.getSidebarModel(conversationId).entries).toEqual([
      expect.objectContaining({ path: 'notes/a.md', state: 'active', status: 'modified' }),
    ]);

    context.advance(POST_TURN_GRACE_MS);
    const result = await context.service.revertFile(conversationId, 'notes/a.md');
    expect(result.ok).toBe(true);
    expect(context.harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
  });

  it('reports a disabled feature through the sidebar model and rejects revert', async () => {
    const context = await startedService({ isEnabled: () => false });
    const conversationId = 'conv-disabled';

    context.service.beginTurnCapture({
      conversationId,
      backend: 'opencode',
      userText: '',
      contextPaths: ['notes/a.md'],
    });
    await settle(context.service);
    context.harness.writeAgentFile('notes/a.md', 'POST-A');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);

    const model = context.service.getSidebarModel(conversationId);
    expect(model).toMatchObject({ enabled: false, entries: [], revertibleCount: 0 });

    const result = await context.service.revertFile(conversationId, 'notes/a.md');
    expect(result).toMatchObject({ ok: false, error: 'edit-revert-disabled' });
  });
});
