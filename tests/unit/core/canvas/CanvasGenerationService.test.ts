/**
 * CanvasGenerationService contract tests (R-C5, design §3.3/§5, acceptance 4).
 *
 * The vault double is the repo's shared EditRevertVaultHarness (it mirrors
 * Obsidian's real API split on purpose — adapter rmdir EISDIR, vault-event
 * funnel, etc.). The failure matrix proves "failure → zero new files on
 * disk", including the theoretical boundary where `create` throws but still
 * left a file behind: the service must trash it.
 */

import type { CanvasSplitProposal } from '../../../../src/core/canvas';
import {
  buildFileReferenceDocument,
  buildSplitDocument,
  canvasBaseFileName,
  CanvasGenerationService,
  type CanvasVaultPort,
  joinVaultPath,
  nextAvailableCanvasPath,
  sanitizeCanvasTitle,
  serializeCanvasDocument,
} from '../../../../src/core/canvas';
import { EditRevertVaultHarness } from '../storage/EditRevertVaultHarness';

const PROPOSALS: CanvasSplitProposal[] = [
  { topic: 'Setup', sourcePath: 'notes/a.md', excerpt: 'step 1' },
  { topic: 'Setup', sourcePath: 'notes/a.md', excerpt: 'step 2' },
  { topic: 'Ops', sourcePath: 'notes/b.md', excerpt: 'run it' },
];

function harnessPort(harness: EditRevertVaultHarness): CanvasVaultPort {
  return {
    pathExists: (path) => harness.vault.getAbstractFileByPath(path) !== null,
    create: (path, data) => harness.vault.create(path, data),
    trash: async (path) => {
      const file = harness.vault.getAbstractFileByPath(path);
      if (file) {
        await harness.vault.trash(file, true);
      }
    },
  };
}

describe('pure builders', () => {
  it('file-reference mode: one file node per note on the grid, no edges', () => {
    const doc = buildFileReferenceDocument(['notes/a.md', 'notes/b.md', 'notes/c.md']);
    expect(doc.nodes).toHaveLength(3);
    expect(doc.nodes.map((node) => node.file)).toEqual(['notes/a.md', 'notes/b.md', 'notes/c.md']);
    expect(doc.nodes.every((node) => node.type === 'file')).toBe(true);
    expect(doc.edges).toEqual([]);
  });

  it('split mode: one text node per excerpt, one group per topic, deterministic ids', () => {
    const doc = buildSplitDocument(PROPOSALS);
    const texts = doc.nodes.filter((node) => node.type === 'text');
    const groups = doc.nodes.filter((node) => node.type === 'group');
    expect(texts).toHaveLength(3);
    expect(texts.map((node) => node.text)).toEqual(['step 1', 'step 2', 'run it']);
    expect(groups.map((node) => node.label)).toEqual(['Setup', 'Ops']);
    expect(doc.edges).toEqual([]);
    expect(new Set(doc.nodes.map((node) => node.id)).size).toBe(doc.nodes.length);
  });

  it('same input twice → byte-identical serialization (determinism)', () => {
    expect(serializeCanvasDocument(buildFileReferenceDocument(['notes/a.md'])))
      .toBe(serializeCanvasDocument(buildFileReferenceDocument(['notes/a.md'])));
    expect(serializeCanvasDocument(buildSplitDocument(PROPOSALS)))
      .toBe(serializeCanvasDocument(buildSplitDocument(PROPOSALS)));
  });

  it('title sanitization strips filesystem-hostile characters', () => {
    expect(sanitizeCanvasTitle('a/b:c*d?"<>|')).toBe('a b c d');
    expect(canvasBaseFileName('')).toBe('Untitled canvas.canvas');
    expect(canvasBaseFileName('量子 笔记')).toBe('量子 笔记 canvas.canvas');
    expect(joinVaultPath('dir/sub', 'x.canvas')).toBe('dir/sub/x.canvas');
    expect(joinVaultPath('', 'x.canvas')).toBe('x.canvas');
  });
});

describe('nextAvailableCanvasPath (name-collision suffixing)', () => {
  it('returns the desired path when free', async () => {
    const exists = new Set<string>();
    await expect(nextAvailableCanvasPath('Topic canvas.canvas', (p) => exists.has(p)))
      .resolves.toBe('Topic canvas.canvas');
  });

  it('appends ` 2`, ` 3`… without overwriting (design §3.3)', async () => {
    const exists = new Set(['Topic canvas.canvas', 'Topic canvas 2.canvas']);
    await expect(nextAvailableCanvasPath('Topic canvas.canvas', (p) => exists.has(p)))
      .resolves.toBe('Topic canvas 3.canvas');
  });
});

describe('CanvasGenerationService against the shared vault harness', () => {
  it('happy path: single vault.create with the validated document', async () => {
    const harness = new EditRevertVaultHarness();
    const service = new CanvasGenerationService(harnessPort(harness));
    const result = await service.generate({ title: 'Research', directory: 'projects', notes: ['a.md', 'b.md', 'c.md'] });
    expect(result.path).toBe('projects/Research canvas.canvas');
    expect(result.nodeCount).toBe(3);
    expect(result.groupCount).toBe(0);
    const written = harness.vaultFiles.get('projects/Research canvas.canvas');
    expect(written).toBeDefined();
    // The written file is exactly the double-validated serialization.
    expect(harness.createLog).toHaveLength(1);
    const parsed = JSON.parse(written ?? '') as { nodes: unknown[] };
    expect(parsed.nodes).toHaveLength(3);
  });

  it('never overwrites: an existing canvas gets the ` 2` suffix', async () => {
    const harness = new EditRevertVaultHarness();
    harness.vaultFiles.set('Research canvas.canvas', '{"nodes":[],"edges":[]}');
    const service = new CanvasGenerationService(harnessPort(harness));
    const result = await service.generate({ title: 'Research', directory: '', notes: ['a.md'] });
    expect(result.path).toBe('Research canvas 2.canvas');
    expect(harness.vaultFiles.get('Research canvas.canvas')).toBe('{"nodes":[],"edges":[]}');
  });

  it('create failure leaves ZERO new files on disk (acceptance 4)', async () => {
    const harness = new EditRevertVaultHarness();
    const before = new Set(harness.vaultFiles.keys());
    const service = new CanvasGenerationService({
      pathExists: () => false,
      create: async () => {
        throw new Error('disk full');
      },
      trash: async () => undefined,
    });
    await expect(service.generate({ title: 'X', directory: '', notes: ['a.md'] }))
      .rejects.toThrow('disk full');
    expect([...harness.vaultFiles.keys()]).toEqual([...before]);
  });

  it('a throwing create that still left a file behind gets reclaimed (trashed)', async () => {
    const harness = new EditRevertVaultHarness();
    const service = new CanvasGenerationService({
      pathExists: (path) => harness.vault.getAbstractFileByPath(path) !== null,
      create: async (path, data) => {
        // Theoretical boundary: the write landed even though create "failed".
        harness.vaultFiles.set(path, data);
        throw new Error('half-written');
      },
      trash: async (path) => {
        const file = harness.vault.getAbstractFileByPath(path);
        if (file) {
          await harness.vault.trash(file, true);
        }
      },
    });
    await expect(service.generate({ title: 'X', directory: '', notes: ['a.md'] }))
      .rejects.toThrow('half-written');
    expect(harness.trashLog).toEqual([{ path: 'X canvas.canvas', system: true }]);
    expect(harness.vaultFiles.has('X canvas.canvas')).toBe(false);
  });

  it('refuses to create an empty canvas (no notes, no proposals)', async () => {
    const harness = new EditRevertVaultHarness();
    const service = new CanvasGenerationService(harnessPort(harness));
    await expect(service.generate({ title: 'Empty', directory: '' }))
      .rejects.toThrow('empty canvas');
    expect(harness.createLog).toHaveLength(0);
  });
});
