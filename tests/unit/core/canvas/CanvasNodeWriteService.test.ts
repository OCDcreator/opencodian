/**
 * CanvasNodeWriteService tests (R-C5, design §3.4): the runtime confirmation
 * gate matrix, the dirty-checked text-node write-back (setData + requestSave,
 * never a direct file write), and the file-node vault.process dirty check.
 */

import {
  type CanvasRuntimeLike,
  probeCanvasView,
  resolveCanvasGateDecision,
  resolveSelectedNode,
  writeFileNodeContent,
  writeTextNode,
} from '../../../../src/core/canvas/CanvasNodeWriteService';

function canvasWith(overrides: Partial<CanvasRuntimeLike> = {}): CanvasRuntimeLike & { data?: unknown } {
  const nodes = [
    { id: 'n1', type: 'text', x: 0, y: 0, width: 360, height: 160, text: 'original' },
    { id: 'n2', type: 'file', x: 420, y: 0, width: 360, height: 160, file: 'notes/a.md' },
  ];
  const handle = {
    getData: () => (overrides.data ? (overrides.data as { nodes: unknown[] }).nodes[0] : nodes[0]),
  };
  const canvas: CanvasRuntimeLike = {
    selection: new Set([handle]),
    getData: () => ({ nodes: [...nodes], edges: [] }),
    setData: () => undefined,
    requestSave: () => undefined,
    ...overrides,
  };
  return canvas;
}

describe('runtime confirmation gate (the design hard gate)', () => {
  it('passes when every probed capability is present and getData is shapeable', () => {
    const decision = probeCanvasView({ canvas: canvasWith() });
    expect(decision).toEqual({ supported: true, canWriteBack: true, reasons: [] });
  });

  it('fails completely without view.canvas (§6.7: not registered, reasons reported)', () => {
    const decision = probeCanvasView({});
    expect(decision.supported).toBe(false);
    expect(decision.canWriteBack).toBe(false);
    expect(decision.reasons).toContain('view.canvas missing');
    expect(decision.reasons).toContain('canvas node editing not supported by this Obsidian version');
  });

  it('degrades to ladder D (copy only) when the write surface is missing', () => {
    const decision = resolveCanvasGateDecision({
      hasCanvas: true,
      selectionIsSet: true,
      hasGetData: true,
      hasSetData: false,
      hasRequestSave: false,
      getDataShapeValid: true,
    });
    expect(decision.supported).toBe(true);
    expect(decision.canWriteBack).toBe(false);
    expect(decision.reasons.some((reason) => reason.includes('ladder D'))).toBe(true);
  });

  it('still registers when only the selection set is broken (ladder C covers it)', () => {
    const decision = resolveCanvasGateDecision({
      hasCanvas: true,
      selectionIsSet: false,
      hasGetData: true,
      hasSetData: true,
      hasRequestSave: true,
      getDataShapeValid: true,
    });
    expect(decision).toEqual({ supported: true, canWriteBack: true, reasons: [] });
  });

  it('probing getData never throws out of the gate', () => {
    const decision = probeCanvasView({
      canvas: {
        getData: () => {
          throw new Error('boom');
        },
      },
    });
    expect(decision.supported).toBe(false);
  });
});

describe('resolveSelectedNode (ladder B selection read, synchronous per §7-U4)', () => {
  it('reads the first selected text node and reports extra selections', () => {
    const canvas = canvasWith();
    const handle2 = { getData: () => ({ id: 'n2', type: 'file', file: 'notes/a.md' }) };
    (canvas.selection as Set<unknown>).add(handle2);
    const result = resolveSelectedNode(canvas);
    expect(result).toEqual({
      ok: true,
      content: { nodeId: 'n1', kind: 'text', text: 'original' },
      extraSelectionCount: 1,
    });
  });

  it('reads a file node as its path (content is fetched read-only by the caller)', () => {
    const handle = { getData: () => ({ id: 'n2', type: 'file', file: 'notes/a.md' }) };
    const result = resolveSelectedNode({ selection: new Set([handle]) });
    expect(result).toEqual({
      ok: true,
      content: { nodeId: 'n2', kind: 'file', filePath: 'notes/a.md' },
      extraSelectionCount: 0,
    });
  });

  it.each([
    ['no selection', { selection: new Set() }, 'no-selection'],
    ['selection not a Set', { selection: ['x'] }, 'selection-unreadable'],
    ['unusable node type', { selection: new Set([{ getData: () => ({ id: 'g', type: 'group' }) }]) }, 'node-type-unsupported'],
  ])('%s → ok:false with %s', (_name, override, reason) => {
    const result = resolveSelectedNode(override as CanvasRuntimeLike);
    expect(result).toEqual({ ok: false, reason });
  });
});

describe('writeTextNode (the only .canvas mutating path)', () => {
  it('writes via setData+requestSave and never touches a file', () => {
    const calls: string[] = [];
    const canvas = canvasWith({
      setData: (data) => {
        calls.push('setData');
        expect((data as { nodes: Array<{ id: string; text?: string }> }).nodes
          .find((node) => node.id === 'n1')?.text).toBe('rewritten');
        expect((data as { nodes: Array<{ id: string; text?: string }> }).nodes
          .find((node) => node.id === 'n2')?.file).toBe('notes/a.md');
      },
      requestSave: () => calls.push('requestSave'),
    });
    const result = writeTextNode({
      canvas,
      nodeId: 'n1',
      nextText: 'rewritten',
      snapshotAtRequest: 'original',
    });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual(['setData', 'requestSave']);
  });

  it('refuses when the node drifted since the rewrite session started (dirty check)', () => {
    // The live document no longer matches the snapshot taken at session start.
    const canvas = canvasWith({
      getData: () => ({
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 360, height: 160, text: 'USER EDITED' },
          { id: 'n2', type: 'file', x: 420, y: 0, width: 360, height: 160, file: 'notes/a.md' },
        ],
        edges: [],
      }),
    });
    const result = writeTextNode({
      canvas,
      nodeId: 'n1',
      nextText: 'rewritten',
      snapshotAtRequest: 'original',
    });
    expect(result).toEqual({ ok: false, reason: 'node-changed' });
  });

  it('validates the FULL document before setData — an invalid document is refused', () => {
    // n2 is a file node whose `file` got lost upstream: the write must bail.
    const canvas = canvasWith({
      getData: () => ({
        nodes: [
          { id: 'n1', type: 'text', x: 0, y: 0, width: 360, height: 160, text: 'original' },
          { id: 'n2', type: 'file', x: NaN, y: 0, width: 360, height: 160, file: 'notes/a.md' },
        ],
        edges: [],
      }),
    });
    const result = writeTextNode({
      canvas,
      nodeId: 'n1',
      nextText: 'rewritten',
      snapshotAtRequest: 'original',
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, reason: 'invalid-document' });
  });

  it('reports a vanished node instead of guessing', () => {
    const result = writeTextNode({
      canvas: canvasWith(),
      nodeId: 'ghost',
      nextText: 'x',
      snapshotAtRequest: 'original',
    });
    expect(result).toEqual({ ok: false, reason: 'node-not-found' });
  });
});

describe('writeFileNodeContent (single vault.process with in-closure dirty check)', () => {
  it('passes the new content through one process call', async () => {
    const seen: string[] = [];
    const result = await writeFileNodeContent({
      port: {
        process: async (path, transform) => {
          seen.push(path);
          transform('old body');
        },
      },
      filePath: 'notes/a.md',
      nextContent: 'new body',
      snapshotAtRequest: 'old body',
    });
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual(['notes/a.md']);
  });

  it('a drifted note aborts inside the closure with zero changes', async () => {
    const result = await writeFileNodeContent({
      port: {
        process: async (_path, transform) => {
          // The real vault.process propagates closure throws and skips the
          // write; let the divergence throw propagate the same way.
          void transform('DIFFERENT live content');
        },
      },
      filePath: 'notes/a.md',
      nextContent: 'new body',
      snapshotAtRequest: 'old body',
    });
    expect(result).toEqual({ ok: false, reason: 'node-changed' });
  });

  it('surfaces process failures as write-failed with the message', async () => {
    const result = await writeFileNodeContent({
      port: {
        process: async () => {
          throw new Error('EIO');
        },
      },
      filePath: 'notes/a.md',
      nextContent: 'new body',
      snapshotAtRequest: 'old body',
    });
    expect(result).toEqual({ ok: false, reason: 'write-failed', detail: 'EIO' });
  });
});
