import { readFileSync } from 'fs';
import { join } from 'path';
import { TextDecoder, TextEncoder } from 'util';

// The remote serializer branch byte-counts snapshots with TextEncoder; the
// jsdom test env does not expose it globally (repo convention: polyfill).
global.TextEncoder = global.TextEncoder ?? (TextEncoder as unknown as typeof global.TextEncoder);
global.TextDecoder = global.TextDecoder ?? (TextDecoder as unknown as typeof global.TextDecoder);

import { prependMemoryInjection } from '../../../../../src/core/memory';
import { prependObsidianToolingInjection } from '../../../../../src/core/obsidianTooling';
import { OpenCodeContextPartSerializer } from '../../../../../src/core/opencode/OpenCodeContextPartSerializer';
import type { PromptContextItem } from '../../../../../src/core/types/chat';
import {
  appendObsidianContextBlocks,
  buildObsidianContextTag,
  buildPdfContextTag,
} from '../../../../../src/shared';

const SRC_ROOT = join(__dirname, '..', '..', '..', '..', '..', 'src');

/**
 * Attached-context backend parity (flowtext-parity R-A7 / R-C1 / R-C4,
 * requirement §6.5): the context chips the user attaches must reach EVERY
 * chat backend. OpenCode receives them as request parts and Pi flattens
 * `options.requestParts`; claude-code and codex expose neither, so they
 * consume `options.contextItems` at their prompt-composition seam via the
 * shared `appendObsidianContextBlocks` helper — the SAME tag builders the
 * OpenCode serializer uses, so one item renders identically on all four
 * backends. No second serialization exists.
 */

const CONTEXT_ITEMS: PromptContextItem[] = [
  {
    id: 'ctx-note',
    kind: 'current_note',
    path: 'notes/idea.md',
    label: 'idea.md',
    mime: 'text/markdown',
    textSnapshot: '# Idea\n\nBody text the model must see.',
  },
  {
    id: 'ctx-selection',
    kind: 'selection',
    path: 'notes/idea.md',
    label: 'idea.md:10-12',
    mime: 'text/markdown',
    lineRange: { startLine: 10, endLine: 12 },
    textSnapshot: 'selected lines only',
  },
  {
    // Remote-mode file chip: carries the full snapshot.
    id: 'ctx-file',
    kind: 'file',
    path: 'projects/spec.md',
    label: 'spec.md',
    mime: 'text/markdown',
    textSnapshot: 'spec snapshot body',
  },
  {
    id: 'ctx-folder',
    kind: 'folder',
    path: 'projects/archive',
    label: 'archive',
    mime: 'application/x-directory',
  },
  {
    // R-C1 retrieval snippet: selection kind tagged with the retrieval origin.
    id: 'vault-retrieval-1',
    kind: 'selection',
    path: 'journal/2026-09-18.md',
    label: '2026-09-18.md:4-6',
    mime: 'text/markdown',
    lineRange: { startLine: 4, endLine: 6 },
    textSnapshot: 'retrieved fragment',
    origin: 'vault-retrieval',
  },
  {
    id: 'ctx-pdf',
    kind: 'pdf_document',
    path: 'docs/report.pdf',
    label: 'report.pdf',
    mime: 'application/pdf',
    pdf: { textLayerPresent: true, pageCount: 3, extractedChars: 40, extraction: 'embedded' },
    pdfPages: [
      { page: 1, text: 'first page text' },
      { page: 2, text: 'second page text' },
    ],
  },
  {
    id: 'ctx-pdf-selection',
    kind: 'pdf_selection',
    path: 'docs/report.pdf',
    label: 'report.pdf',
    mime: 'application/pdf',
    pdf: { textLayerPresent: true, pageCount: 3, extractedChars: 18, extraction: 'embedded' },
    pdfSelection: { page: 2, rangeStr: 'p. 2', text: 'selection excerpt' },
  },
];

function createRemoteSerializer(): OpenCodeContextPartSerializer {
  return new OpenCodeContextPartSerializer({
    isLocalServerMode: () => false,
    getVaultPath: () => '/vault',
  });
}

/** Context text parts the OpenCode wire would carry (message part excluded). */
function openCodeContextTexts(items: PromptContextItem[]): string[] {
  const parts = createRemoteSerializer().buildPromptRequestParts('hello', {
    contextItems: items,
  } as never);
  return parts
    .filter((part) => part.type === 'text' && part.synthetic === true)
    .map((part) => (part as { text: string }).text);
}

describe('attached-context backend parity (claude/codex seam)', () => {
  it('renders the exact same context texts the OpenCode serializer produces', () => {
    const appended = appendObsidianContextBlocks('', { contextItems: CONTEXT_ITEMS });
    const expected = openCodeContextTexts(CONTEXT_ITEMS).join('\n\n');

    expect(appended).toBe(`\n\n${expected}`);
  });

  it('routes PDF items through the PDF tag builder like the serializer does', () => {
    const pdf = CONTEXT_ITEMS.find((item) => item.id === 'ctx-pdf')!;
    const pdfSelection = CONTEXT_ITEMS.find((item) => item.id === 'ctx-pdf-selection')!;
    const appended = appendObsidianContextBlocks('', { contextItems: [pdf, pdfSelection] });

    expect(appended).toBe(`\n\n${[buildPdfContextTag(pdf), buildPdfContextTag(pdfSelection)].join('\n\n')}`);
  });

  it('renders local-mode file chips (no snapshot) as path-reference tags, like folders', () => {
    // A snapshot-less file chip only exists in local server mode, where the
    // OpenCode wire carries a `file` part instead of text — there is no
    // shared text to diff against. The claude/codex seam still delivers the
    // item as the standard tag; the CLI reads the referenced path with its
    // own file tools (same contract as folders, R-A7).
    const localFile: PromptContextItem = {
      id: 'ctx-local-file',
      kind: 'file',
      path: 'projects/local-spec.md',
      label: 'local-spec.md',
      mime: 'text/markdown',
    };
    const appended = appendObsidianContextBlocks('', { contextItems: [localFile] });

    expect(appended).toBe(`\n\n${buildObsidianContextTag(localFile)}`);
    expect(appended).toContain('kind="file" path="projects/local-spec.md"');
    expect(appended).toContain('></obsidian_context>');
  });

  it('leaves a turn with no context items byte-identical (no stray empty tag)', () => {
    expect(appendObsidianContextBlocks('hello', undefined)).toBe('hello');
    expect(appendObsidianContextBlocks('hello', {})).toBe('hello');
    expect(appendObsidianContextBlocks('hello', { contextItems: [] })).toBe('hello');
    expect(appendObsidianContextBlocks('hello', { contextItems: [null, 42, { kind: 'file' }, { path: 'x' }] })).toBe('hello');
  });

  it('keeps per-epoch injections in front and appends per-turn context after the user text', () => {
    const options = {
      memoryInjection: { text: '[MEMORY BLOCK]' },
      obsidianToolingInjection: { text: '[TOOLING BLOCK]' },
      contextItems: [CONTEXT_ITEMS[0]],
    };
    const composed = appendObsidianContextBlocks(
      prependObsidianToolingInjection(
        prependMemoryInjection('hello', options),
        options,
      ),
      options,
    );

    const memoryStart = composed.indexOf('[MEMORY BLOCK]');
    const toolingStart = composed.indexOf('[TOOLING BLOCK]');
    const userStart = composed.indexOf('hello');
    const contextStart = composed.indexOf('<obsidian_context');
    expect(memoryStart).toBeGreaterThanOrEqual(0);
    expect(toolingStart).toBeGreaterThanOrEqual(0);
    // Existing seam order (tooling is the outer prepend): the two per-epoch
    // blocks lead, the user text follows, per-turn context comes last.
    expect(toolingStart).toBeLessThan(memoryStart);
    expect(memoryStart).toBeLessThan(userStart);
    expect(userStart).toBeLessThan(contextStart);
    // Per-turn context never precedes the per-epoch prefix: the stable
    // cached prefix stays the leading block on every turn it is injected.
    expect(composed.startsWith('[TOOLING BLOCK]\n\n[MEMORY BLOCK]\n\nhello\n\n')).toBe(true);
  });

  it('claude-code and codex consume the shared helper at the injection seam (per-epoch prefix first, context appended)', () => {
    const seamPattern = /appendObsidianContextBlocks\(\s*prependObsidianToolingInjection\(\s*prependMemoryInjection\(/;
    for (const adapterPath of [
      join(SRC_ROOT, 'core', 'agents', 'backend', 'ClaudeCodeAdapter.ts'),
      join(SRC_ROOT, 'core', 'agents', 'backend', 'CodexAdapter.ts'),
    ]) {
      const source = readFileSync(adapterPath, 'utf8');
      expect(source).toMatch(seamPattern);
    }
  });

  it('backends that already deliver context via request parts do not double-append', () => {
    for (const pathSuffix of [
      join('core', 'agents', 'backend', 'OpenCodeAdapter.ts'),
      join('core', 'agents', 'backend', 'pi', 'PiAdapter.ts'),
      join('core', 'agents', 'backend', 'pi', 'PiStreamMapper.ts'),
    ]) {
      const source = readFileSync(join(SRC_ROOT, ...pathSuffix.split('/')), 'utf8');
      expect(source).not.toContain('appendObsidianContextBlocks');
    }
  });
});

