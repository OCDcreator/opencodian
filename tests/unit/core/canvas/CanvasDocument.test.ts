/**
 * CanvasDocument round-trip and write-gate tests (R-C5, design §3.1/§5).
 *
 * The round-trip cases include unknown fields taken from REAL canvas files in
 * this vault (namespaced extras like `readingDesk` / `x-nimbalyst`, edge
 * `toEnd`), because acceptance 2 depends on never corrupting existing data.
 */

import {
  assertWritableDocument,
  type CanvasDocument,
  CanvasDocumentError,
  isKnownCanvasNodeType,
  parseCanvasDocument,
  serializeCanvasDocument,
} from '../../../../src/core/canvas/CanvasDocument';

function textNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'n1',
    type: 'text',
    x: 0,
    y: 0,
    width: 360,
    height: 160,
    text: 'hello',
    ...overrides,
  };
}

function roundTrip(json: string): unknown {
  return JSON.parse(serializeCanvasDocument(parseCanvasDocument(json)));
}

describe('parseCanvasDocument / serializeCanvasDocument round-trip fidelity', () => {
  it('round-trips a canonical document losslessly', () => {
    const json = JSON.stringify({
      nodes: [textNode()],
      edges: [],
    });
    expect(roundTrip(json)).toEqual(JSON.parse(json));
  });

  it('preserves unknown node fields verbatim (real-world namespaced extras)', () => {
    const json = JSON.stringify({
      nodes: [{
        id: 'rd-1',
        type: 'text',
        x: 10,
        y: 20,
        width: 360,
        height: 160,
        text: '## Methods',
        color: '3',
        readingDesk: { schemaVersion: 1, kind: 'chapter', page: 1, folded: false },
      }],
      edges: [],
    });
    const out = roundTrip(json) as { nodes: Array<Record<string, unknown>> };
    expect(out.nodes[0].readingDesk).toEqual({ schemaVersion: 1, kind: 'chapter', page: 1, folded: false });
    expect(out.nodes[0].color).toBe('3');
  });

  it('preserves unknown edge fields (toEnd) and unknown top-level fields', () => {
    const json = JSON.stringify({
      nodes: [textNode(), textNode({ id: 'n2' })],
      edges: [{
        id: 'e1',
        fromNode: 'n1',
        toNode: 'n2',
        fromSide: 'right',
        toSide: 'left',
        toEnd: 'arrow',
        'x-custom': { kind: 'flow' },
      }],
      'x-plugin': { any: [1, 2, 3] },
    });
    const out = roundTrip(json) as {
      nodes: unknown[];
      edges: Array<Record<string, unknown>>;
      'x-plugin'?: unknown;
    };
    expect(out.edges[0].toEnd).toBe('arrow');
    expect(out.edges[0]['x-custom']).toEqual({ kind: 'flow' });
    expect(out['x-plugin']).toEqual({ any: [1, 2, 3] });
    expect(out.nodes).toHaveLength(2);
  });

  it('round-trips file, link and group nodes with their payloads', () => {
    const json = JSON.stringify({
      nodes: [
        { id: 'f', type: 'file', x: 0, y: 0, width: 360, height: 160, file: 'notes/a.md' },
        { id: 'l', type: 'link', x: 420, y: 0, width: 360, height: 160, url: 'https://obsidian.md' },
        { id: 'g', type: 'group', x: -40, y: -40, width: 900, height: 300, label: 'Topic' },
      ],
      edges: [],
    });
    expect(roundTrip(json)).toEqual(JSON.parse(json));
  });

  it('serializes deterministically: same document → byte-identical output', () => {
    const build = (): CanvasDocument => parseCanvasDocument(JSON.stringify({
      nodes: [textNode(), textNode({ id: 'n2', x: 420 })],
      edges: [],
    }));
    expect(serializeCanvasDocument(build())).toBe(serializeCanvasDocument(build()));
  });

  it('serializes with fixed key order and 2-space indent regardless of input order', () => {
    const serialized = serializeCanvasDocument(parseCanvasDocument(
      JSON.stringify({ edges: [], nodes: [{ text: 'x', id: 'n1', type: 'text', y: 0, x: 0, height: 160, width: 360 }] }),
    ));
    expect(serialized.startsWith('{\n  "nodes": [\n    {\n      "id": "n1",')).toBe(true);
    expect(serialized.indexOf('"type"')).toBeLessThan(serialized.indexOf('"text"'));
  });

  it('defaults missing edges to an empty array (lenient read)', () => {
    const doc = parseCanvasDocument(JSON.stringify({ nodes: [textNode()] }));
    expect(doc.edges).toEqual([]);
  });

  it('rejects structurally impossible input with stable reasons', () => {
    expect(() => parseCanvasDocument('not json')).toThrow(CanvasDocumentError);
    expect(() => parseCanvasDocument('"string"')).toThrow('root-not-an-object');
    expect(() => parseCanvasDocument('{"nodes": {}, "edges": []}')).toThrow('nodes-or-edges-not-arrays');
    expect(() => parseCanvasDocument('{"nodes": [42], "edges": []}')).toThrow('node-0-not-an-object');
    expect(() => parseCanvasDocument('{"nodes": [{"type":"text"}], "edges": []}')).toThrow('node-0-missing-id');
    expect(() => parseCanvasDocument('{"nodes": [], "edges": [{"fromNode":"a"}]}')).toThrow('edge-0-missing-id');
  });

  it('keeps unknown node type strings through parse (assert rejects them later)', () => {
    const doc = parseCanvasDocument(JSON.stringify({
      nodes: [{ id: 'x', type: 'hologram', x: 0, y: 0, width: 10, height: 10 }],
      edges: [],
    }));
    expect(doc.nodes[0].type).toBe('hologram');
    expect(isKnownCanvasNodeType(doc.nodes[0].type)).toBe(false);
  });
});

describe('assertWritableDocument rejection cases (fail closed)', () => {
  const valid = (): CanvasDocument => parseCanvasDocument(JSON.stringify({
    nodes: [
      textNode(),
      textNode({ id: 'n2', x: 420, type: 'file', text: undefined, file: 'notes/a.md' }),
    ],
    edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2', fromSide: 'right', toSide: 'left' }],
  }));

  it('accepts a fully valid document', () => {
    expect(() => assertWritableDocument(valid())).not.toThrow();
  });

  it('rejects duplicate node ids', () => {
    const doc = valid();
    doc.nodes[1].id = 'n1';
    expect(() => assertWritableDocument(doc)).toThrow('duplicate-node-id:n1');
  });

  it('rejects edges with dangling endpoints', () => {
    const doc = valid();
    (doc.edges[0] as Record<string, unknown>).toNode = 'missing';
    expect(() => assertWritableDocument(doc)).toThrow('edge-dangling-to:e1');
    (doc.edges[0] as Record<string, unknown>).fromNode = 'missing';
    expect(() => assertWritableDocument(doc)).toThrow('edge-dangling-from:e1');
  });

  it('rejects unknown node types on write', () => {
    const doc = valid();
    (doc.nodes[0] as Record<string, unknown>).type = 'hologram';
    expect(() => assertWritableDocument(doc)).toThrow('unknown-node-type:hologram');
  });

  it.each([
    ['x', NaN],
    ['y', Infinity],
    ['width', Number.POSITIVE_INFINITY],
    ['height', -Infinity],
  ])('rejects non-finite %s coordinates', (key, value) => {
    const doc = valid();
    (doc.nodes[0] as Record<string, unknown>)[key] = value;
    expect(() => assertWritableDocument(doc)).toThrow(`node:n1-${key}-not-finite`);
  });

  it('rejects non-positive sizes', () => {
    const doc = valid();
    doc.nodes[0].width = 0;
    expect(() => assertWritableDocument(doc)).toThrow('node:n1-non-positive-size');
  });

  it.each([
    ['text node without text', { id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10 }, 'text-node-missing-text:t'],
    ['file node without file', { id: 'f', type: 'file', x: 0, y: 0, width: 10, height: 10 }, 'file-node-missing-file:f'],
    ['link node without url', { id: 'l', type: 'link', x: 0, y: 0, width: 10, height: 10 }, 'link-node-missing-url:l'],
  ])('rejects a %s', (_name, node, reason) => {
    expect(() => assertWritableDocument({
      nodes: [node as unknown as CanvasDocument['nodes'][number]],
      edges: [],
    })).toThrow(reason);
  });

  it('accepts an unlabeled group (real Obsidian groups may omit label)', () => {
    expect(() => assertWritableDocument({
      nodes: [{ id: 'g', type: 'group', x: 0, y: 0, width: 100, height: 100 }],
      edges: [],
    })).not.toThrow();
  });

  it('rejects duplicate edge ids and invalid sides', () => {
    const doc = valid();
    doc.edges.push({ ...doc.edges[0] });
    expect(() => assertWritableDocument(doc)).toThrow('duplicate-edge-id:e1');
    const doc2 = valid();
    (doc2.edges[0] as Record<string, unknown>).fromSide = 'diagonal';
    expect(() => assertWritableDocument(doc2)).toThrow('edge-invalid-side:e1');
  });
});
