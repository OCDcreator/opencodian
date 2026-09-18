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

    // One fresh plugin round closed with the post-turn grace.
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

    // Revert is blocked while the round still accepts writes (post-turn
    // convention) — the grace must expire first.
    const early = await service.revertAll(CONVERSATION_ID);
    expect(early).toMatchObject({ ok: false, error: 'round-open' });

    context.advance(POST_TURN_GRACE_MS + 1);
    const result = await service.revertAll(CONVERSATION_ID);
    expect(result).toMatchObject({ ok: true, changed: 2, skipped: [] });
    expect(harness.vaultFiles.get('notes/a.md')).toBe('PRE-A');
    expect(harness.vaultFiles.has('attachments/pic.png')).toBe(false);
    expect(harness.trashLog.map((entry) => entry.path)).toEqual(['attachments/pic.png']);
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
