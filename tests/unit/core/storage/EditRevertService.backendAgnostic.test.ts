/**
 * R-B3 contract test (requirement §8.2): revert behavior is backend-agnostic.
 *
 * The same plugin-side snapshot → revert → restore flow must produce the
 * identical result for every chat backend, driven only by each backend's own
 * write-tool surface. None of the R-B3 modules may touch the OpenCode SDK,
 * the OpenCode service, or its `revertSession` capability: plugin-side revert
 * is independent of (and coexists with) OpenCode's session rewind.
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { createHarnessService, settle } from './EditRevertVaultHarness';

const BACKENDS = ['opencode', 'claude-code', 'codex', 'pi'] as const;

/**
 * Each backend's declared write-tool surface, as observed on the stream.
 * The planner classifies all of them; the service treats them identically.
 */
const BACKEND_WRITE_TOOLS: Record<(typeof BACKENDS)[number], { toolName: string; input: Record<string, unknown> }> = {
  opencode: { toolName: 'edit', input: { path: 'notes/t.md' } },
  'claude-code': { toolName: 'Edit', input: { file_path: '/test-vault/notes/t.md' } },
  codex: {
    toolName: 'apply_patch',
    input: { patch: '*** Begin Patch\n*** Update File: notes/t.md\n@@\n-old\n+new\n*** End Patch' },
  },
  pi: { toolName: 'bash', input: { command: 'echo rewritten > notes/t.md' } },
};

const R_B3_MODULES = [
  'src/core/storage/EditRevertService.ts',
  'src/core/storage/EditRevertStore.ts',
  'src/core/storage/EditRevertVaultWriteback.ts',
  'src/core/types/editRevert.ts',
  'src/shared/editRevertPlan.ts',
];

describe('R-B3 contract: revert behaves identically on every backend', () => {
  it.each(BACKENDS)('reverts a tool-declared modification for backend %s', async (backend) => {
    const context = createHarnessService();
    context.harness.vaultFiles.set('notes/t.md', 'PRE');
    await context.service.initialize();
    await settle(context.service);

    const conversationId = `conv-${backend}`;
    context.service.beginTurnCapture({
      conversationId,
      backend,
      userText: '',
      contextPaths: [],
    });
    await settle(context.service);

    const writeTool = BACKEND_WRITE_TOOLS[backend];
    context.service.noteWriteToolUse({ conversationId, ...writeTool });
    await settle(context.service);

    context.harness.writeAgentFile('notes/t.md', 'POST');
    await settle(context.service);
    context.service.endTurnCapture(conversationId);
    await settle(context.service);
    context.advance(10 * 60 * 1000 + 1);

    const model = context.service.getSidebarModel(conversationId);
    expect(model.enabled).toBe(true);
    expect(model.entries).toEqual([
      expect.objectContaining({ path: 'notes/t.md', revertible: true }),
    ]);

    const result = await context.service.revertFile(conversationId, 'notes/t.md');
    expect(result).toEqual({ ok: true, changed: 1, skipped: [] });
    expect(context.harness.vaultFiles.get('notes/t.md')).toBe('PRE');

    const restore = await context.service.restoreFile(conversationId, 'notes/t.md');
    expect(restore).toEqual({ ok: true, changed: 1, skipped: [] });
    expect(context.harness.vaultFiles.get('notes/t.md')).toBe('POST');
  });

  it.each(['claude-code', 'codex', 'pi'])(
    'sends turn-created files to the Obsidian trash for backend %s (AC4 without OpenCode)',
    async (backend) => {
      const context = createHarnessService();
      await context.service.initialize();
      await settle(context.service);

      const conversationId = `conv-created-${backend}`;
      context.service.beginTurnCapture({
        conversationId,
        backend,
        userText: '',
        contextPaths: [],
      });
      await settle(context.service);
      context.harness.createAgentFile('notes/new.md', 'CREATED');
      await settle(context.service);
      context.service.endTurnCapture(conversationId);
      await settle(context.service);
      context.advance(10 * 60 * 1000 + 1);

      const result = await context.service.revertFile(conversationId, 'notes/new.md');
      expect(result.ok).toBe(true);
      expect(context.harness.trashLog).toEqual([{ path: 'notes/new.md', system: false }]);
      expect(context.harness.vaultFiles.has('notes/new.md')).toBe(false);
    },
  );
});

describe('R-B3 contract: no dependency on the OpenCode revert path', () => {
  it('imports no OpenCode SDK / service module in any R-B3 module', () => {
    const repoRoot = path.resolve(__dirname, '../../../..');
    for (const relative of R_B3_MODULES) {
      const source = readFileSync(path.join(repoRoot, relative), 'utf8');
      expect(source).not.toMatch(/@opencode-ai\/sdk/);
      expect(source).not.toMatch(/from\s+'[^']*core\/opencode/);
      // Prose comments may document the coexistence with OpenCode's session
      // rewind; only actual calls would be a dependency.
      expect(source).not.toMatch(/\.revertSession\(|\.unrevertSession\(/);
    }
  });
});
