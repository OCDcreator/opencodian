import { TextEncoder } from 'util';

import { OpenCodeContextPartSerializer } from '../../../../src/core/opencode/OpenCodeContextPartSerializer';
import type { PromptContextItem } from '../../../../src/core/types';

global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;

const REMOTE_CONTEXT_LIMIT_BYTES = 64 * 1024;

function createSerializer(options: { local?: boolean; vaultPath?: string } = {}) {
  const { local = true, vaultPath } = options;
  return new OpenCodeContextPartSerializer({
    isLocalServerMode: () => local,
    getVaultPath: () => vaultPath,
  });
}

describe('OpenCodeContextPartSerializer', () => {
  it('builds local file, selection, and image parts in prompt order', () => {
    const serializer = createSerializer({
      local: true,
      vaultPath: 'C:\\vault',
    });

    const parts = serializer.buildPromptRequestParts('Use context', {
      contextItems: [
        {
          id: 'ctx-1',
          kind: 'file',
          path: 'docs/spec.md',
          label: 'spec.md',
          mime: 'text/markdown',
        },
        {
          id: 'ctx-2',
          kind: 'selection',
          path: 'docs/spec.md',
          label: 'spec.md:3-5',
          mime: 'text/markdown',
          lineRange: { startLine: 3, endLine: 5 },
          textSnapshot: 'selected lines',
        },
      ],
      images: [
        {
          data: 'YmFzZTY0',
          mediaType: 'image/png',
          filename: 'diagram.png',
        },
      ],
      externalContextPaths: ['legacy/path.md'],
    });

    expect(parts).toEqual([
      { type: 'text', text: 'Use context' },
      {
        type: 'file',
        mime: 'text/plain',
        filename: 'spec.md',
        url: 'file:///C:/vault/docs/spec.md',
      },
      {
        type: 'file',
        mime: 'text/plain',
        filename: 'spec.md',
        url: 'file:///C:/vault/docs/spec.md?start=3&end=5',
        source: {
          type: 'file',
          path: 'docs/spec.md',
          text: {
            value: 'selected lines',
            start: 0,
            end: 'selected lines'.length,
          },
        },
      },
      {
        type: 'file',
        mime: 'image/png',
        filename: 'diagram.png',
        url: 'data:image/png;base64,YmFzZTY0',
      },
    ]);
  });

  it('serializes remote text context into synthetic Obsidian tags', () => {
    const serializer = createSerializer({ local: false });
    const part = serializer.createPromptContextPart({
      id: 'ctx-1',
      kind: 'current_note',
      path: 'notes/today.md',
      label: 'today.md',
      mime: 'text/markdown',
      textSnapshot: 'Remote note body',
      lineRange: { startLine: 1, endLine: 4 },
    });

    expect(part).toEqual({
      type: 'text',
      text: '<obsidian_context kind="current_note" path="notes/today.md" lines="1-4">Remote note body</obsidian_context>',
      synthetic: true,
      metadata: {
        kind: 'current_note',
        path: 'notes/today.md',
        lines: '1-4',
      },
    });
  });

  it('rejects remote binary, missing text, and oversized text snapshots', () => {
    const serializer = createSerializer({ local: false });

    const binaryItem: PromptContextItem = {
      id: 'ctx-1',
      kind: 'file',
      path: 'assets/image.png',
      label: 'image.png',
      mime: 'image/png',
      textSnapshot: 'ignored',
    };
    const missingTextItem: PromptContextItem = {
      id: 'ctx-2',
      kind: 'file',
      path: 'notes/missing.md',
      label: 'missing.md',
      mime: 'text/markdown',
    };
    const oversizedItem: PromptContextItem = {
      id: 'ctx-3',
      kind: 'file',
      path: 'notes/huge.md',
      label: 'huge.md',
      mime: 'text/markdown',
      textSnapshot: 'a'.repeat(REMOTE_CONTEXT_LIMIT_BYTES + 1),
    };

    expect(() => serializer.createPromptContextPart(binaryItem)).toThrow(
      'Only text context is supported in remote mode: image.png',
    );
    expect(() => serializer.createPromptContextPart(missingTextItem)).toThrow(
      'Missing text snapshot for remote context: missing.md',
    );
    expect(() => serializer.createPromptContextPart(oversizedItem)).toThrow(
      'Context exceeds remote size limit: huge.md',
    );
  });
});
