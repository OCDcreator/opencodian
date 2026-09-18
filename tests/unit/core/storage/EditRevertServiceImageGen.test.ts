/**
 * EditRevertService image-asset registration contract tests (R-C2, design
 * §5 test 5 + §3.6): the generated asset enters the R-B3 round as a
 * `created` / `source: 'plugin'` entry with NO binary snapshot, the paired
 * note reference is captured by pre-image, revert = Obsidian trash, and
 * "restore" stays honestly unavailable for the binary entry.
 *
 * Runs against the shared in-memory vault harness (EditRevertVaultHarness);
 * no hardening of that double is weakened here.
 */

import {
  CONVERSATION_ID,
  createHarnessService,
  EditRevertVaultHarness,
  type HarnessService,
  POST_TURN_GRACE_MS,
  settle,
} from './EditRevertVaultHarness';

async function startedService(
  overrides: Partial<{ isEnabled: () => boolean }> = {},
  harness = new EditRevertVaultHarness(),
): Promise<HarnessService> {
  const context = createHarnessService({ ...overrides, harness });
  harness.vaultFiles.set('notes/a.md', 'PRE-A');
  harness.folders.add('notes');
  await context.service.initialize();
  await settle(context.service);
  return context;
}

describe('registerPluginCreatedAsset (R-C2 W-asset revert coverage)', () => {
  it('registers a created/plugin entry with no binary blob, paired with a note pre-image', async () => {
    const context = await startedService();
    const { service, harness } = context;

    // The asset write already happened (W-asset precedes registration).
    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png', ['notes/a.md']);
    await settle(service);

    // One fresh plugin round open for the paired reference write.
    const model = service.getSidebarModel(CONVERSATION_ID);
    expect(model.enabled).toBe(true);
    expect(model.entries).toHaveLength(1);
    expect(model.entries[0]).toMatchObject({
      path: 'attachments/pic.png',
      status: 'created',
      state: 'active',
      revertible: true,
    });
    // Round keeps accepting the paired reference write during the grace.
    expect(model.roundOpen).toBe(true);
  });

  it('the note reference written inside the grace window joins the same round', async () => {
    const context = await startedService();
    const { service, harness } = context;

    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png', ['notes/a.md']);
    await settle(service);

    // W-ref: the editor transaction auto-saves the note (vault modify).
    harness.writeAgentFile('notes/a.md', 'PRE-A\n![[attachments/pic.png]]');
    await settle(service);

    const model = service.getSidebarModel(CONVERSATION_ID);
    expect(model.entries).toHaveLength(2);
    expect(model.entries.map((entry) => entry.status).sort()).toEqual(['created', 'modified']);
  });

  it('revertAll is the paired revert: note restored + asset trashed', async () => {
    const context = await startedService();
    const { service, harness } = context;

    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png', ['notes/a.md']);
    harness.writeAgentFile('notes/a.md', 'PRE-A\n![[attachments/pic.png]]');
    await settle(service);

    // Grace-fallback pin: without the explicit record-then-close the round
    // stays open until the post-turn grace expires (abandoned-round bound).
    const early = await service.revertAll(CONVERSATION_ID);
    expect(early).toMatchObject({ ok: false, error: 'round-open' });

    context.advance(POST_TURN_GRACE_MS + 1);
    const result = await service.revertAll(CONVERSATION_ID);
    expect(result).toMatchObject({ ok: true, changed: 2, skipped: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
    expect(harness.vaultFiles.has('attachments/pic.png')).toBe(false);
    expect(harness.trashLog.map((entry) => entry.path)).toEqual(['attachments/pic.png']);
  });

  it('after the paired write is recorded and the round closed, revert is available without the grace (D2)', async () => {
    const context = await startedService();
    const { service, harness } = context;

    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png', ['notes/a.md']);
    // W-ref succeeded: the flow records the reference write explicitly, then
    // closes the round (the exact seams main.ts wires for R-C2).
    await service.notePluginWrite(CONVERSATION_ID, 'notes/a.md');
    await service.endBatchCapture(CONVERSATION_ID);
    await settle(service);

    expect(service.getSidebarModel(CONVERSATION_ID).roundOpen).toBe(false);
    const result = await service.revertAll(CONVERSATION_ID);
    expect(result).toMatchObject({ ok: true, changed: 2, skipped: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
    expect(harness.vaultFiles.has('attachments/pic.png')).toBe(false);
    expect(harness.trashLog.map((entry) => entry.path)).toEqual(['attachments/pic.png']);
  });

  it('a late vault event after the close does not duplicate the reference entry (D2)', async () => {
    const context = await startedService();
    const { service, harness } = context;

    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png', ['notes/a.md']);
    await service.notePluginWrite(CONVERSATION_ID, 'notes/a.md');
    await service.endBatchCapture(CONVERSATION_ID);
    await settle(service);
    // Obsidian's autosave lands after the close: it must not find a target
    // round and pile a second entry onto the closed round.
    harness.writeAgentFile('notes/a.md', 'PRE-A\n![[attachments/pic.png]]');
    await settle(service);

    expect(service.getSidebarModel(CONVERSATION_ID).entries).toHaveLength(2);
    const result = await service.revertAll(CONVERSATION_ID);
    expect(result).toMatchObject({ ok: true, changed: 2 });
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
  });

  it('insert failed: closing the round still frees the asset revert immediately (D2 failure branch)', async () => {
    const context = await startedService();
    const { service, harness } = context;

    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png', ['notes/a.md']);
    await settle(service);
    // W-ref never happened; the flow still closes the round (insert-failed).
    await service.endBatchCapture(CONVERSATION_ID);
    await settle(service);

    const result = await service.revertAll(CONVERSATION_ID);
    expect(result).toMatchObject({ ok: true, changed: 1 });
    expect(harness.vaultFiles.has('attachments/pic.png')).toBe(false);
    expect(harness.trashLog.map((entry) => entry.path)).toEqual(['attachments/pic.png']);
  });

  it('the closer never ends an in-flight turn round (revert stays unavailable mid-turn)', async () => {
    const context = await startedService();
    const { service, harness } = context;
    service.beginTurnCapture({
      conversationId: CONVERSATION_ID,
      backend: 'opencode',
      userText: '',
      contextPaths: [],
    });
    await settle(service);
    const roundIdBefore = service.getSidebarModel(CONVERSATION_ID).roundId;

    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png');
    harness.writeAgentFile('notes/a.md', 'PRE-A\n![[attachments/pic.png]]');
    // A concurrent image insert finishes while the turn streams: endBatchCapture
    // must refuse to close the agent turn round.
    await service.endBatchCapture(CONVERSATION_ID);
    await settle(service);

    expect(service.getSidebarModel(CONVERSATION_ID).roundId).toBe(roundIdBefore);
    expect(service.getSidebarModel(CONVERSATION_ID).roundOpen).toBe(true);
    const midTurn = await service.revertAll(CONVERSATION_ID);
    expect(midTurn).toMatchObject({ ok: false, error: 'round-open' });

    // The turn's own lifecycle still controls availability.
    service.endTurnCapture(CONVERSATION_ID);
    await settle(service);
    context.advance(POST_TURN_GRACE_MS + 1);
    const afterTurn = await service.revertAll(CONVERSATION_ID);
    expect(afterTurn).toMatchObject({ ok: true });
  });

  it('restore stays honestly unavailable for the trashed asset entry', async () => {
    const context = await startedService();
    const { service, harness } = context;
    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png');
    context.advance(POST_TURN_GRACE_MS + 1);
    await service.revertFile(CONVERSATION_ID, 'attachments/pic.png');

    const restored = await service.restoreFile(CONVERSATION_ID, 'attachments/pic.png');
    expect(restored.ok).toBe(false);
    expect(restored.error).toBe('not-restorable');
  });

  it('registers into an open turn round without disturbing its lifecycle', async () => {
    const context = await startedService();
    const { service, harness } = context;
    service.beginTurnCapture({
      conversationId: CONVERSATION_ID,
      backend: 'opencode',
      userText: '',
      contextPaths: [],
    });
    await settle(service);
    const roundIdBefore = service.getSidebarModel(CONVERSATION_ID).roundId;

    harness.vaultFiles.set('attachments/pic.png', 'PNGBYTES');
    await service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png');
    await settle(service);

    expect(service.getSidebarModel(CONVERSATION_ID).roundId).toBe(roundIdBefore);
    const model = service.getSidebarModel(CONVERSATION_ID);
    expect(model.entries).toHaveLength(1);
    expect(model.entries[0]).toMatchObject({ path: 'attachments/pic.png', status: 'created' });
  });

  it('is a no-op when the snapshot layer is disabled (fail-soft honesty)', async () => {
    const context = await startedService({ isEnabled: () => false });
    await context.service.registerPluginCreatedAsset(CONVERSATION_ID, 'attachments/pic.png');
    await settle(context.service);
    expect(context.service.getSidebarModel(CONVERSATION_ID).entries).toHaveLength(0);
  });
});
